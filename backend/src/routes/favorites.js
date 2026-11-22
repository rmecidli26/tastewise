import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { dishExists, searchDishes } from '../services/dishes.js';

const router = Router();
router.use('/me/favorites', requireAuth);

const dishParam = z.object({ dishId: z.coerce.number({ invalid_type_error: 'v.id' }).int('v.id').positive('v.id') });

// GET /api/me/favorites  — full dish cards, newest first
router.get('/me/favorites', asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT dish_id FROM favorites WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  const ids = rows.map(r => r.dish_id);
  if (!ids.length) return res.json({ ids: [], dishes: [] });

  const { dishes } = await searchDishes({ ids, lang: req.lang, limit: 200 });
  const order = new Map(ids.map((id, i) => [id, i]));
  dishes.sort((a, b) => order.get(a.id) - order.get(b.id));
  // Dishes taken off the menu are hidden (and not counted) but the saved row is kept.
  res.json({ ids: dishes.map(d => d.id), dishes });
}));

// PUT /api/me/favorites/:dishId
router.put('/me/favorites/:dishId', validate(dishParam, 'params'), asyncHandler(async (req, res) => {
  const { dishId } = req.valid.params;
  if (!(await dishExists(dishId))) throw new HttpError(404, 'DISH_NOT_FOUND');
  await query(
    'INSERT INTO favorites (user_id, dish_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.user.id, dishId]
  );
  res.json({ dishId, isFavorite: true });
}));

// DELETE /api/me/favorites/:dishId
router.delete('/me/favorites/:dishId', validate(dishParam, 'params'), asyncHandler(async (req, res) => {
  const { dishId } = req.valid.params;
  await query('DELETE FROM favorites WHERE user_id = $1 AND dish_id = $2', [req.user.id, dishId]);
  res.json({ dishId, isFavorite: false });
}));

export default router;
