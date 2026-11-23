import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { exploreDishes, getDishById } from '../services/dishes.js';
import { recommend } from '../services/recommend.js';
import { localized } from '../i18n.js';

const router = Router();

export const DIETS = ['vegetarian', 'vegan', 'gluten-free', 'dairy-free'];
export const MEALS = ['breakfast', 'lunch', 'dinner', 'dessert', 'drink'];
export const MOODS = ['light', 'hearty', 'comfort', 'celebration'];

// "a,b" or ?x=a&x=b → ['a','b']
const list = item => z.preprocess(
  v => (v === undefined || v === '' ? undefined : (Array.isArray(v) ? v : String(v).split(',')).map(s => String(s).trim().toLowerCase()).filter(Boolean)),
  z.array(item).max(10).optional()
);
const optionalNumber = schema => z.preprocess(v => (v === '' || v === undefined || v === null ? undefined : Number(v)), schema.optional());
const term = z.string().max(40);

const searchSchema = z.object({
  q: z.string().trim().max(60).optional(),
  category: list(z.string().max(40)),
  cuisine: list(z.string().max(30)),
  diet: list(z.enum(DIETS)),
  meal: z.enum(MEALS).optional(),
  maxSpice: optionalNumber(z.number().int().min(0).max(3)),
  minPrice: optionalNumber(z.number().min(0).max(10000)),
  maxPrice: optionalNumber(z.number().min(0).max(10000)),
  minRating: optionalNumber(z.number().min(1).max(5)),
  include: list(term),
  prefer: list(term),
  exclude: list(term),
  ids: z.preprocess(
    v => (v === undefined || v === '' ? undefined : String(v).split(',').map(Number)),
    z.array(z.number().int().positive()).max(30).optional()
  ),
  sort: z.enum(['match', 'menu', 'popular', 'price_asc', 'price_desc', 'name']).optional(),
  limit: optionalNumber(z.number().int().min(1).max(100)),
  page: optionalNumber(z.number().int().min(1).max(1000))
});

const recommendSchema = z.object({
  meal: z.enum(MEALS).nullish(),
  cuisine: z.array(z.string().trim().toLowerCase().max(30)).max(10).default([]),
  mood: z.enum(MOODS).nullish(),
  diet: z.array(z.enum(DIETS)).max(4).default([]),
  spice: z.number().int().min(0).max(3).nullish(),
  budget: z.number().min(1).max(10000).nullish(),
  love: z.union([z.string().max(300), z.array(term).max(10)]).default([]),
  avoid: z.union([z.string().max(300), z.array(term).max(10)]).default([])
});

const idParam = z.object({ id: z.coerce.number({ invalid_type_error: 'v.id' }).int('v.id').positive('v.id') });

// GET /api/dishes?cuisine=italian,asian&maxPrice=30&exclude=nuts&sort=price_asc&page=1
router.get('/dishes', validate(searchSchema, 'query'), asyncHandler(async (req, res) => {
  const f = req.valid.query;
  const limit = f.limit || 24;
  const page = f.page || 1;
  const { total, dishes } = await exploreDishes({ ...f, lang: req.lang, limit, offset: (page - 1) * limit });
  res.json({ total, page, pageSize: limit, pages: Math.ceil(total / limit), dishes });
}));

// GET /api/dishes/:id
router.get('/dishes/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const dish = await getDishById(req.valid.params.id, req.lang);
  if (!dish) throw new HttpError(404, 'DISH_NOT_FOUND');
  res.json({ dish });
}));

// POST /api/recommendations  — the "Find My Dish" form
router.post('/recommendations', validate(recommendSchema), asyncHandler(async (req, res) => {
  const result = await recommend(req.valid.body, req.lang);
  res.json(result);
}));

// GET /api/categories
router.get('/categories', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT c.slug, c.name, c.name_i18n, COUNT(d.id) FILTER (WHERE d.is_available) AS dish_count
       FROM categories c LEFT JOIN dishes d ON d.category_id = c.id
      GROUP BY c.id ORDER BY c.sort_order, c.name`
  );
  res.json({ categories: rows.map(r => ({ slug: r.slug, name: localized(r.name_i18n, req.lang, null, r.name), dishCount: r.dish_count })) });
}));

// GET /api/ingredients  — for autocomplete in filters
router.get('/ingredients', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT i.name, i.name_i18n, i.is_allergen, COUNT(di.dish_id) AS dish_count
       FROM ingredients i
       JOIN dish_ingredients di ON di.ingredient_id = i.id
       JOIN dishes d ON d.id = di.dish_id AND d.is_available   -- only what is on the menu today
      GROUP BY i.id ORDER BY i.name`
  );
  const ingredients = rows
    .map(r => ({ key: r.name, label: localized(r.name_i18n, req.lang, null, r.name), isAllergen: r.is_allergen, dishCount: r.dish_count }))
    .sort((a, b) => a.label.localeCompare(b.label, req.lang));
  res.json({ ingredients });
}));

// GET /api/cuisines
router.get('/cuisines', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT DISTINCT cuisine FROM dishes WHERE is_available ORDER BY cuisine');
  res.json({ cuisines: rows.map(r => r.cuisine) });
}));

export default router;
