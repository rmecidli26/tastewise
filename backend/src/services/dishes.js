import { query } from '../db.js';
import { dishHasTerm, excludePatterns, includePatterns, parseTerms, toLikePattern } from './ingredients.js';
import { LANGS } from '../i18n.js';

const DISH_SELECT = `
  d.id, d.slug, d.name, d.description, d.price, d.cuisine, d.spice_level,
  d.diet_tags, d.mood_tags, d.meal_times, d.image_url, d.is_available, d.translations, d.is_best_seller,
  c.slug AS category_slug, c.name AS category_name, c.name_i18n AS category_i18n,
  COALESCE((SELECT json_agg(json_build_object('name', i.name, 'i18n', i.name_i18n, 'allergen', i.is_allergen) ORDER BY i.name)
              FROM dish_ingredients di JOIN ingredients i ON i.id = di.ingredient_id
             WHERE di.dish_id = d.id), '[]'::json) AS ingredient_rows,
  COALESCE((SELECT json_agg(json_build_object('code', v.code, 'label', v.label, 'i18n', v.label_i18n, 'price', v.price) ORDER BY v.sort_order)
              FROM dish_variants v WHERE v.dish_id = d.id), '[]'::json) AS variant_rows,
  rv.avg_rating, rv.review_count`;

const DISH_FROM = `
  FROM dishes d
  JOIN categories c ON c.id = d.category_id
  LEFT JOIN LATERAL (
    SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*) AS review_count
      FROM reviews WHERE dish_id = d.id
  ) rv ON true`;

/** SQL: does ingredient `i` match a LIKE pattern in any language? */
const ingredientMatches = pat =>
  `(i.name ILIKE ${pat} OR i.name_i18n->>'az' ILIKE ${pat} OR i.name_i18n->>'ru' ILIKE ${pat})`;

const SORTS = {
  menu: 'c.sort_order, d.name',
  popular: 'rv.avg_rating DESC NULLS LAST, d.is_best_seller DESC, rv.review_count DESC, d.name',
  price_asc: 'd.price ASC, d.name',
  price_desc: 'd.price DESC, d.name'
};

/** DB row → API shape, in the requested language (English columns are the fallback). */
export function toDish(r, lang = 'az') {
  const tr = r.translations?.[lang] || {};
  const ings = (r.ingredient_rows || []).map(i => ({
    key: i.name,
    name: i.i18n?.[lang] || i.name,
    isAllergen: i.allergen
  })).sort((a, b) => a.name.localeCompare(b.name, lang));

  const dish = {
    id: r.id,
    slug: r.slug,
    name: tr.name || r.name,
    description: tr.description || r.description,
    price: r.price, // lowest price when the dish has variants
    variants: (r.variant_rows || []).map(v => ({ code: v.code, label: v.i18n?.[lang] || v.label, price: Number(v.price) })),
    isBestSeller: Boolean(r.is_best_seller),
    cuisine: r.cuisine,
    spiceLevel: r.spice_level,
    dietTags: r.diet_tags,
    moodTags: r.mood_tags,
    mealTimes: r.meal_times,
    imageUrl: r.image_url,
    category: { slug: r.category_slug, name: r.category_i18n?.[lang] || r.category_name },
    ingredients: ings.map(i => i.name),
    rating: { average: r.avg_rating, count: r.review_count }
  };
  // Every spelling of every ingredient (all languages) — used for matching, not sent to clients
  Object.defineProperty(dish, 'terms', {
    enumerable: false,
    value: (r.ingredient_rows || []).flatMap(i => [i.name, ...Object.values(i.i18n || {})]).map(n => String(n).toLowerCase())
  });
  Object.defineProperty(dish, 'ingredientRows', { enumerable: false, value: ings });
  return dish;
}

/**
 * Menu search. All filters are optional.
 * @param {object} f  lang, q, category, cuisine[], diet[], meal, maxSpice, minPrice, maxPrice,
 *                    include (terms), exclude (terms), ids[], sort, limit, offset
 */
export async function searchDishes(f = {}) {
  const lang = LANGS.includes(f.lang) ? f.lang : 'az';
  const params = [];
  const p = value => { params.push(value); return `$${params.length}`; };
  const where = ['d.is_available'];

  if (f.q) {
    // name / description in English or any translation
    const ph = p(toLikePattern(f.q.toLowerCase()));
    where.push(`(d.name ILIKE ${ph} OR d.description ILIKE ${ph} OR EXISTS (
      SELECT 1 FROM jsonb_each(d.translations) tr
       WHERE tr.value->>'name' ILIKE ${ph} OR tr.value->>'description' ILIKE ${ph}))`);
  }
  const cats = [].concat(f.category || []).filter(Boolean);
  if (cats.length) where.push(`c.slug = ANY(${p(cats)}::text[])`);
  if (f.minRating) where.push(`rv.avg_rating >= ${p(f.minRating)}::numeric`);
  if (f.cuisine?.length) where.push(`d.cuisine = ANY(${p(f.cuisine)}::text[])`);
  if (f.diet?.length) where.push(`d.diet_tags @> ${p(f.diet)}::text[]`);
  if (f.meal) where.push(`${p(f.meal)}::text = ANY(d.meal_times)`);
  if (f.maxSpice !== undefined && f.maxSpice !== null) where.push(`d.spice_level <= ${p(f.maxSpice)}::int`);
  if (f.minPrice !== undefined && f.minPrice !== null) where.push(`d.price >= ${p(f.minPrice)}::numeric`);
  if (f.maxPrice !== undefined && f.maxPrice !== null) where.push(`d.price <= ${p(f.maxPrice)}::numeric`);
  if (f.ids?.length) where.push(`d.id = ANY(${p(f.ids)}::bigint[])`);

  const inc = includePatterns(f.include || []);
  if (inc.length) {
    // every requested ingredient must be present
    where.push(`NOT EXISTS (
      SELECT 1 FROM unnest(${p(inc)}::text[]) AS pat
       WHERE NOT EXISTS (
         SELECT 1 FROM dish_ingredients di JOIN ingredients i ON i.id = di.ingredient_id
          WHERE di.dish_id = d.id AND ${ingredientMatches('pat')}))`);
  }
  const exc = excludePatterns(f.exclude || []);
  if (exc.length) {
    // none of the avoided ingredients may be present
    where.push(`NOT EXISTS (
      SELECT 1 FROM dish_ingredients di JOIN ingredients i ON i.id = di.ingredient_id,
             unnest(${p(exc)}::text[]) AS pat
       WHERE di.dish_id = d.id AND ${ingredientMatches('pat')})`);
  }

  const limit = Math.min(Math.max(Number(f.limit) || 24, 1), 200);
  const offset = Math.max(Number(f.offset) || 0, 0);
  // (a bound parameter must be used in the SQL, so the language is only added for name sorting)
  const orderBy = f.sort === 'name'
    ? `COALESCE(d.translations->${p(lang)}::text->>'name', d.name)`
    : SORTS[f.sort] || SORTS.menu;

  const { rows } = await query(
    `SELECT ${DISH_SELECT}, COUNT(*) OVER () AS total_count
     ${DISH_FROM}
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT ${p(limit)}::int OFFSET ${p(offset)}::int`,
    params
  );
  return { total: rows[0]?.total_count ?? 0, dishes: rows.map(r => toDish(r, lang)) };
}

/** One dish with detailed ingredients (allergen flags). Returns null if not found. */
export async function getDishById(id, lang = 'az') {
  const { rows } = await query(`SELECT ${DISH_SELECT} ${DISH_FROM} WHERE d.id = $1`, [id]);
  if (!rows[0]) return null;
  const dish = toDish(rows[0], lang);
  return {
    ...dish,
    isAvailable: rows[0].is_available,
    ingredientDetails: [...dish.ingredientRows]
      .sort((a, b) => (b.isAllergen - a.isAllergen) || a.name.localeCompare(b.name, lang))
      .map(i => ({ name: i.name, isAllergen: i.isAllergen }))
  };
}

export async function dishExists(id) {
  const { rowCount } = await query('SELECT 1 FROM dishes WHERE id = $1', [id]);
  return rowCount > 0;
}

/**
 * Explore page search. Like searchDishes, plus "prefer": ingredients the guest wants
 * (any language). With prefer, only dishes containing at least one of them are returned,
 * ranked by how many they contain; each dish gets match = { count, total, terms }.
 */
export async function exploreDishes(f = {}) {
  const prefer = parseTerms(f.prefer || []);
  if (!prefer.length) return searchDishes(f);

  const limit = Math.min(Math.max(Number(f.limit) || 24, 1), 200);
  const offset = Math.max(Number(f.offset) || 0, 0);
  const { dishes } = await searchDishes({ ...f, limit: 200, offset: 0 });

  const scored = dishes
    .map(d => {
      const terms = prefer.filter(t => dishHasTerm(d.terms, t));
      return Object.assign(d, { match: { count: terms.length, total: prefer.length, terms } });
    })
    .filter(d => d.match.count > 0);

  const byMatch = (a, b) => b.match.count - a.match.count
    || (b.rating.average ?? 0) - (a.rating.average ?? 0)
    || Number(b.isBestSeller) - Number(a.isBestSeller)
    || a.price - b.price;
  // "match" (default) ranks by matched ingredients; any other sort keeps the SQL order
  if (!f.sort || f.sort === 'match') scored.sort(byMatch);

  return { total: scored.length, dishes: scored.slice(offset, offset + limit) };
}
