import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { t } from '../i18n.js';
import { query } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';

const router = Router();
const { timeZone, firstSlot, lastSlot, maxDaysAhead, maxActivePerUser } = config.reservations;

const reservationSchema = z.object({
  date: z.string({ required_error: 'v.date' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'v.date'),
  time: z.string({ required_error: 'v.time' }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'v.time')
    .refine(t => t >= firstSlot && t <= lastSlot, 'v.time.range'),
  guests: z.number({ required_error: 'v.guests.required', invalid_type_error: 'v.guests.required' }).int('v.guests.required').min(1, 'v.guests.min').max(20, 'v.guests.max'),
  phone: z.string({ required_error: 'v.phone' }).trim().regex(/^\+?[0-9\s\-()]{7,20}$/, 'v.phone'),
  note: z.string().trim().max(500, 'v.note.long').default('')
});
const idParam = z.object({ id: z.coerce.number({ invalid_type_error: 'v.id' }).int('v.id').positive('v.id') });

/** Columns shared by user and admin views; dates shown in restaurant local time. */
export const RESERVATION_SELECT = `
  rs.id, rs.reserved_at, rs.guests, rs.phone, rs.note, rs.status, rs.admin_note, rs.created_at,
  to_char(rs.reserved_at AT TIME ZONE '${timeZone}', 'YYYY-MM-DD') AS local_date,
  to_char(rs.reserved_at AT TIME ZONE '${timeZone}', 'HH24:MI')    AS local_time,
  (rs.status IN ('pending', 'confirmed') AND rs.reserved_at > now()) AS can_cancel`;

export const toReservation = r => ({
  id: r.id,
  reservedAt: r.reserved_at,
  date: r.local_date,
  time: r.local_time,
  guests: r.guests,
  phone: r.phone,
  note: r.note,
  status: r.status,
  adminNote: r.admin_note,
  canCancel: r.can_cancel,
  createdAt: r.created_at,
  ...(r.user_name && { user: { name: r.user_name, email: r.user_email } })
});

// POST /api/reservations
router.post('/reservations', requireVerified, validate(reservationSchema), asyncHandler(async (req, res) => {
  const { date, time, guests, phone, note } = req.valid.body;

  const { rows: [check] } = await query(
    `SELECT ($1::date + $2::time) AT TIME ZONE $3            AS reserved_at,
            (($1::date + $2::time) AT TIME ZONE $3) > now() + interval '1 hour' AS is_future,
            $1::date <= (now() AT TIME ZONE $3)::date + $4::int AS in_range`,
    [date, time, timeZone, maxDaysAhead]
  ).catch(err => {
    // 22xxx = invalid date/time value, e.g. 2026-02-30
    if (String(err.code).startsWith('22')) throw new HttpError(400, 'INVALID_DATE');
    throw err;
  });

  if (!check.is_future) throw new HttpError(400, 'INVALID_TIME');
  if (!check.in_range) throw new HttpError(400, 'INVALID_DATE', { key: 'err.DATE_TOO_FAR', vars: { days: maxDaysAhead } });

  const { rows: [{ active }] } = await query(
    `SELECT COUNT(*) AS active FROM reservations
      WHERE user_id = $1 AND status IN ('pending', 'confirmed') AND reserved_at > now()`,
    [req.user.id]
  );
  if (active >= maxActivePerUser) {
    throw new HttpError(409, 'TOO_MANY_RESERVATIONS', { vars: { count: active } });
  }

  const { rows: [restaurant] } = await query('SELECT id FROM restaurants ORDER BY id LIMIT 1');
  if (!restaurant) throw new HttpError(503, 'NO_RESTAURANT');

  const { rows: [created] } = await query(
    `INSERT INTO reservations (user_id, restaurant_id, reserved_at, guests, phone, note)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.user.id, restaurant.id, check.reserved_at, guests, phone, note]
  );
  const { rows: [row] } = await query(`SELECT ${RESERVATION_SELECT} FROM reservations rs WHERE rs.id = $1`, [created.id]);
  res.status(201).json({
    message: t(req.lang, 'msg.reservationSent'),
    reservation: toReservation(row)
  });
}));

// GET /api/me/reservations
router.get('/me/reservations', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ${RESERVATION_SELECT} FROM reservations rs
      WHERE rs.user_id = $1
      ORDER BY (rs.reserved_at > now()) DESC, rs.reserved_at ASC
      LIMIT 50`,
    [req.user.id]
  );
  res.json({ reservations: rows.map(toReservation) });
}));

// POST /api/me/reservations/:id/cancel
router.post('/me/reservations/:id/cancel', requireAuth, validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE reservations rs SET status = 'cancelled', updated_at = now()
      WHERE rs.id = $1 AND rs.user_id = $2
        AND rs.status IN ('pending', 'confirmed') AND rs.reserved_at > now()
      RETURNING ${RESERVATION_SELECT}`,
    [req.valid.params.id, req.user.id]
  );
  if (!rows[0]) throw new HttpError(404, 'NOT_CANCELLABLE');
  res.json({ message: t(req.lang, 'msg.reservationCancelled'), reservation: toReservation(rows[0]) });
}));

export default router;
