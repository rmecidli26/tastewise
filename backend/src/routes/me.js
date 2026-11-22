import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { t } from '../i18n.js';
import { query } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { requireAuth, startSession, publicUser } from '../middleware/auth.js';
import { passwordSchema, BCRYPT_ROUNDS } from './auth.js';

const router = Router();
router.use('/me/profile', requireAuth);
router.use('/me/password', requireAuth);

const USER_COLS = 'id, full_name, email, role, phone, city, email_verified_at, created_at';

/** Activity numbers for the Account page. */
async function stats(userId) {
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM reservations WHERE user_id = $1)                       AS reservations,
       (SELECT count(*)::int FROM reservations WHERE user_id = $1
                                   AND status IN ('pending', 'confirmed') AND reserved_at > now()) AS upcoming,
       (SELECT count(*)::int FROM favorites f JOIN dishes d ON d.id = f.dish_id
         WHERE f.user_id = $1 AND d.is_available)                                       AS favorites,
       (SELECT count(*)::int FROM reviews WHERE user_id = $1)                            AS reviews,
       (SELECT round(avg(rating)::numeric, 1)::float FROM reviews WHERE user_id = $1)    AS avg_rating`,
    [userId]
  );
  const r = rows[0];
  return { reservations: r.reservations, upcoming: r.upcoming, favorites: r.favorites, reviews: r.reviews, averageRating: r.avg_rating };
}

// GET /api/me/profile — user + activity
router.get('/me/profile', asyncHandler(async (req, res) => {
  res.json({ user: publicUser(req.user), stats: await stats(req.user.id) });
}));

const optionalText = (max, key) => z.string().trim().max(max, key).optional()
  .transform(v => (v === undefined ? undefined : v || null));
const profileSchema = z.object({
  fullName: z.string({ required_error: 'v.name.required' }).trim().min(2, 'v.name.short').max(80, 'v.name.long'),
  phone: optionalText(30, 'v.phone').refine(v => v == null || /^\+?[0-9\s\-()]{7,20}$/.test(v), 'v.phone'),
  city: optionalText(80, 'v.city.long')
});

// PATCH /api/me/profile — name, phone, city (email changes are not supported here)
router.patch('/me/profile', validate(profileSchema), asyncHandler(async (req, res) => {
  const { fullName, phone, city } = req.valid.body;
  const { rows } = await query(
    `UPDATE users SET full_name = $2,
            phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
            city  = CASE WHEN $5::boolean THEN $6 ELSE city END,
            updated_at = now()
      WHERE id = $1 RETURNING ${USER_COLS}`,
    [req.user.id, fullName, phone !== undefined, phone ?? null, city !== undefined, city ?? null]
  );
  res.json({ message: t(req.lang, 'msg.profileSaved'), user: publicUser(rows[0]) });
}));

const passwordChangeSchema = z.object({
  currentPassword: z.string({ required_error: 'v.password.required' }).min(1, 'v.password.required').max(200, 'v.invalid'),
  newPassword: passwordSchema
});

// POST /api/me/password — signs out every other device
router.post('/me/password', authLimiter, validate(passwordChangeSchema), asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.valid.body;
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    throw new HttpError(400, 'WRONG_PASSWORD', { details: [{ field: 'currentPassword', message: 'v.password.wrong' }] });
  }
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const updated = (await query(
    `UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now()
      WHERE id = $1 RETURNING ${USER_COLS}`,
    [req.user.id, hash]
  )).rows[0];
  // Old sessions on other devices stop working; this browser gets a fresh session
  startSession(res, updated, { remember: true });
  res.json({ message: t(req.lang, 'msg.passwordChanged') });
}));

export default router;
