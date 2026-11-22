// Loads the restaurant, categories and menu from seeds/menu.json.
// Safe to run again: dishes are matched by slug and updated, so reviews and favorites are kept.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, transaction } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.resolve(__dirname, '../../seeds/menu.json');

export const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  const data = JSON.parse(await fs.readFile(SEED_FILE, 'utf8'));
  const allergens = new Set((data.allergens || []).map(a => a.toLowerCase()));
  // { "salmon": { "az": "qızılbalıq", "ru": "лосось" }, ... } — stored lowercase so searches match
  const ingredientNames = Object.fromEntries(Object.entries(data.ingredient_names || {}).map(([k, v]) =>
    [k.toLowerCase(), Object.fromEntries(Object.entries(v).map(([l, n]) => [l, String(n).toLowerCase()]))]));

  await transaction(async db => {
    const r = data.restaurant;
    const { rows: [restaurant] } = await db.query(
      `INSERT INTO restaurants (slug, name, description, address, city, phone, email, opening_hours, translations)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
         address = EXCLUDED.address, city = EXCLUDED.city, phone = EXCLUDED.phone,
         email = EXCLUDED.email, opening_hours = EXCLUDED.opening_hours, translations = EXCLUDED.translations
       RETURNING id`,
      [r.slug, r.name, r.description, r.address, r.city, r.phone, r.email, JSON.stringify(r.opening_hours || {}), JSON.stringify(r.i18n || {})]
    );

    const categoryIds = {};
    for (const c of data.categories) {
      const { rows: [row] } = await db.query(
        `INSERT INTO categories (slug, name, sort_order, name_i18n) VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, name_i18n = EXCLUDED.name_i18n
         RETURNING id`,
        [c.slug, c.name, c.sort_order ?? 0, JSON.stringify(c.i18n || {})]
      );
      categoryIds[c.slug] = row.id;
    }

    const ingredientIds = {};
    const ingredientId = async name => {
      const key = name.toLowerCase().trim();
      if (ingredientIds[key]) return ingredientIds[key];
      const { rows: [row] } = await db.query(
        `INSERT INTO ingredients (name, is_allergen, name_i18n) VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (name) DO UPDATE SET is_allergen = EXCLUDED.is_allergen, name_i18n = EXCLUDED.name_i18n
         RETURNING id`,
        [key, allergens.has(key), JSON.stringify(ingredientNames[key] || {})]
      );
      return (ingredientIds[key] = row.id);
    };

    const seededSlugs = [];
    for (const d of data.dishes) {
      if (!categoryIds[d.category]) throw new Error(`Unknown category "${d.category}" for dish "${d.name}"`);
      const slug = d.slug || slugify(d.name);
      seededSlugs.push(slug);
      // With variants (sizes / chicken-meat) the dish price is the lowest one: "from 8.80 ₼"
      const variants = d.variants || [];
      const price = variants.length ? Math.min(...variants.map(v => Number(v.price))) : d.price;
      const { rows: [dish] } = await db.query(
        `INSERT INTO dishes (restaurant_id, category_id, slug, name, description, price, cuisine,
                             spice_level, diet_tags, mood_tags, meal_times, image_url, is_available, translations, is_best_seller)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10::text[], $11::text[], $12, true, $13::jsonb, $14)
         ON CONFLICT (restaurant_id, slug) DO UPDATE SET
           category_id = EXCLUDED.category_id, name = EXCLUDED.name, description = EXCLUDED.description,
           price = EXCLUDED.price, cuisine = EXCLUDED.cuisine, spice_level = EXCLUDED.spice_level,
           diet_tags = EXCLUDED.diet_tags, mood_tags = EXCLUDED.mood_tags, meal_times = EXCLUDED.meal_times,
           image_url = EXCLUDED.image_url, is_available = true, translations = EXCLUDED.translations,
           is_best_seller = EXCLUDED.is_best_seller, updated_at = now()
         RETURNING id`,
        [restaurant.id, categoryIds[d.category], slug, d.name, d.description || '', price, d.cuisine,
         d.spice ?? 0, d.diet || [], d.mood || [], d.meal || [], d.image || null, JSON.stringify(d.i18n || {}),
         Boolean(d.best_seller)]
      );

      await db.query('DELETE FROM dish_variants WHERE dish_id = $1', [dish.id]);
      for (const [i, v] of variants.entries()) {
        const label = typeof v.label === 'string' ? { en: v.label } : (v.label || {});
        await db.query(
          `INSERT INTO dish_variants (dish_id, code, label, label_i18n, price, sort_order)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
          [dish.id, String(v.code ?? i), label.en || String(v.code), JSON.stringify({ az: label.az, ru: label.ru }), v.price, i]
        );
      }

      await db.query('DELETE FROM dish_ingredients WHERE dish_id = $1', [dish.id]);
      for (const name of d.ingredients || []) {
        await db.query(
          'INSERT INTO dish_ingredients (dish_id, ingredient_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [dish.id, await ingredientId(name)]
        );
      }
    }

    // Dishes removed from menu.json are hidden (not deleted, so their reviews survive)
    await db.query(
      'UPDATE dishes SET is_available = false WHERE restaurant_id = $1 AND NOT (slug = ANY($2::text[]))',
      [restaurant.id, seededSlugs]
    );

    console.log(`Seeded ${data.restaurant.name}: ${data.categories.length} categories, ${data.dishes.length} dishes, ${Object.keys(ingredientIds).length} ingredients.`);
  });
  await pool.end();
}

main().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
