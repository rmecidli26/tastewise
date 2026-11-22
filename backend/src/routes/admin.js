import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { requireAdmin } from '../middleware/auth.js';
import { sendReservationStatusEmail } from '../services/email.js';
import { RESERVATION_SELECT, toReservation } from './reservations.js';

const router = Router();
router.use('/admin', requireAdmin);

const listQuery = z.object({
  status: z.enum(['pending', 'confirmed', 'declined', 'cancelled', 'all']).default('pending'),
  upcoming: z.enum(['true', 'false']).default('true')
});
const idParam = z.object({ id: z.coerce.number().int().positive() });
const updateSchema = z.object({
  status: z.enum(['confirmed', 'declined']),
  adminNote: z.string().trim().max(300).default('')
});

// GET /api/admin/reservations?status=pending&upcoming=true
router.get('/admin/reservations', validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const { status, upcoming } = req.valid.query;
  const { rows } = await query(
    `SELECT ${RESERVATION_SELECT}, u.full_name AS user_name, u.email AS user_email
       FROM reservations rs JOIN users u ON u.id = rs.user_id
      WHERE ($1 = 'all' OR rs.status = $1)
        AND ($2 = 'false' OR rs.reserved_at > now() - interval '3 hours')
      ORDER BY rs.reserved_at ASC
      LIMIT 200`,
    [status, upcoming]
  );
  res.json({ reservations: rows.map(toReservation) });
}));

// PATCH /api/admin/reservations/:id  { status: "confirmed" | "declined", adminNote? }
router.patch('/admin/reservations/:id', validate(idParam, 'params'), validate(updateSchema), asyncHandler(async (req, res) => {
  const { status, adminNote } = req.valid.body;
  const { rows } = await query(
    `UPDATE reservations rs SET status = $2, admin_note = $3, updated_at = now()
      WHERE rs.id = $1 AND rs.status IN ('pending', 'confirmed', 'declined')
      RETURNING ${RESERVATION_SELECT}, rs.user_id`,
    [req.valid.params.id, status, adminNote]
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, 'NOT_FOUND', { key: 'err.RES_NOT_FOUND' });

  // Let the guest know (a failed email must not undo the status change)
  const { rows: [user] } = await query('SELECT full_name, email, locale FROM users WHERE id = $1', [row.user_id]);
  sendReservationStatusEmail(user, row).catch(err => console.error('[email] reservation status', err));

  res.json({ reservation: toReservation(row) });
}));

export default router;
