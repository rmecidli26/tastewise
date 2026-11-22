import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { requireVerified } from '../middleware/auth.js';
import { dishExists } from '../services/dishes.js';
import { t } from '../i18n.js';

const router = Router();

const idParam = z.object({ id: z.coerce.number({ invalid_type_error: 'v.id' }).int('v.id').positive('v.id') });
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});
const reviewSchema = z.object({
  rating: z.number({ required_error: 'v.rating.required', invalid_type_error: 'v.rating.required' }).int('v.rating.range').min(1, 'v.rating.range').max(5, 'v.rating.range'),
  comment: z.string().trim().max(1000, 'v.comment.long').default('')
});

// Shows "Aysel M." instead of the full name
const toReview = r => ({
  id: r.id,
  rating: r.rating,
  comment: r.comment,
  author: r.author_name,
  isMine: Boolean(r.is_mine),
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

const REVIEW_SELECT = `
  rv.id, rv.rating, rv.comment, rv.created_at, rv.updated_at,
  split_part(u.full_name, ' ', 1) ||
    CASE WHEN position(' ' IN u.full_name) > 0
         THEN ' ' || left(split_part(u.full_name, ' ', 2), 1) || '.' ELSE '' END AS author_name`;

async function ensureDish(id) {
  if (!(await dishExists(id))) throw new HttpError(404, 'DISH_NOT_FOUND');
}

// GET /api/dishes/:id/reviews?page=1
router.get('/dishes/:id/reviews', validate(idParam, 'params'), validate(pageQuery, 'query'), asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const { page, limit } = req.valid.query;
  await ensureDish(id);

  const { rows } = await query(
    `SELECT ${REVIEW_SELECT}, (rv.user_id = $2) AS is_mine, COUNT(*) OVER () AS total_count
       FROM reviews rv JOIN users u ON u.id = rv.user_id
      WHERE rv.dish_id = $1
      ORDER BY (rv.user_id = $2) DESC, rv.created_at DESC
      LIMIT $3 OFFSET $4`,
    [id, req.user?.id ?? 0, limit, (page - 1) * limit]
  );
  const { rows: [summary] } = await query(
    `SELECT ROUND(AVG(rating)::numeric, 1) AS average, COUNT(*) AS count,
            COUNT(*) FILTER (WHERE rating = 5) AS r5, COUNT(*) FILTER (WHERE rating = 4) AS r4,
            COUNT(*) FILTER (WHERE rating = 3) AS r3, COUNT(*) FILTER (WHERE rating = 2) AS r2,
            COUNT(*) FILTER (WHERE rating = 1) AS r1
       FROM reviews WHERE dish_id = $1`,
    [id]
  );
  res.json({
    summary: {
      average: summary.average,
      count: summary.count,
      distribution: { 5: summary.r5, 4: summary.r4, 3: summary.r3, 2: summary.r2, 1: summary.r1 }
    },
    total: rows[0]?.total_count ?? 0,
    page,
    reviews: rows.map(toReview)
  });
}));

// PUT /api/dishes/:id/reviews  — create or update my review
router.put('/dishes/:id/reviews', requireVerified, validate(idParam, 'params'), validate(reviewSchema), asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const { rating, comment } = req.valid.body;
  await ensureDish(id);

  const { rows: [saved] } = await query(
    `INSERT INTO reviews (user_id, dish_id, rating, comment) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, dish_id)
     DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now()
     RETURNING id, (xmax = 0) AS created`,
    [req.user.id, id, rating, comment]
  );
  const { rows: [review] } = await query(
    `SELECT ${REVIEW_SELECT}, true AS is_mine FROM reviews rv JOIN users u ON u.id = rv.user_id WHERE rv.id = $1`,
    [saved.id]
  );
  res.status(saved.created ? 201 : 200).json({ review: toReview(review) });
}));

// DELETE /api/dishes/:id/reviews  — delete my review
router.delete('/dishes/:id/reviews', requireVerified, validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM reviews WHERE user_id = $1 AND dish_id = $2', [req.user.id, req.valid.params.id]);
  if (!rowCount) throw new HttpError(404, 'REVIEW_NOT_FOUND');
  res.json({ message: t(req.lang, 'msg.reviewDeleted') });
}));

export default router;
