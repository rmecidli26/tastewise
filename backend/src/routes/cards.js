import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { t } from '../i18n.js';
import { query } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';

/*
 * Saved payment cards.
 * The full card number and CVC never reach this server: the browser checks the card and sends only
 * the brand, the last 4 digits and the expiry date. With a real provider (Payriff, Epoint, a bank)
 * the browser would send the card to the provider instead and we would keep the provider's token here.
 */
const router = Router();
router.use('/me/cards', requireAuth);

export const cardInput = z.object({
  brand: z.enum(['visa', 'mastercard', 'amex', 'unionpay', 'card'], { errorMap: () => ({ message: 'v.card' }) }),
  last4: z.string().regex(/^\d{4}$/, 'v.card'),
  expMonth: z.number({ invalid_type_error: 'v.card.exp' }).int().min(1, 'v.card.exp').max(12, 'v.card.exp'),
  expYear: z.number({ invalid_type_error: 'v.card.exp' }).int().min(2000, 'v.card.exp').max(2100, 'v.card.exp')
}).refine(c => {
  const now = new Date();
  return c.expYear > now.getFullYear() || (c.expYear === now.getFullYear() && c.expMonth >= now.getMonth() + 1);
}, { message: 'v.card.expired', path: ['expMonth'] });

export const toCard = r => ({
  id: r.id, brand: r.brand, last4: r.last4, expMonth: r.exp_month, expYear: r.exp_year, isTest: r.is_test, createdAt: r.created_at
});

export async function saveCard(userId, c) {
  const { rows: [{ n }] } = await query('SELECT COUNT(*)::int AS n FROM saved_cards WHERE user_id = $1', [userId]);
  if (n >= config.orders.maxSavedCards) throw new HttpError(409, 'TOO_MANY_CARDS', { vars: { max: config.orders.maxSavedCards } });
  // The same card saved twice is kept once
  const { rows: [dup] } = await query(
    'SELECT * FROM saved_cards WHERE user_id = $1 AND brand = $2 AND last4 = $3 AND exp_month = $4 AND exp_year = $5',
    [userId, c.brand, c.last4, c.expMonth, c.expYear]
  );
  if (dup) return dup;
  const token = `test_${crypto.randomBytes(16).toString('hex')}`;
  const { rows: [row] } = await query(
    `INSERT INTO saved_cards (user_id, token, brand, last4, exp_month, exp_year, is_test)
     VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *`,
    [userId, token, c.brand, c.last4, c.expMonth, c.expYear]
  );
  return row;
}

// GET /api/me/cards
router.get('/me/cards', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM saved_cards WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
  res.json({ cards: rows.map(toCard), mode: config.orders.cardPayments });
}));

// POST /api/me/cards  { brand, last4, expMonth, expYear }
router.post('/me/cards', validate(cardInput), asyncHandler(async (req, res) => {
  if (config.orders.cardPayments === 'off') throw new HttpError(400, 'CARDS_OFF');
  const row = await saveCard(req.user.id, req.valid.body);
  res.status(201).json({ message: t(req.lang, 'msg.cardSaved'), card: toCard(row) });
}));

// DELETE /api/me/cards/:id
router.delete('/me/cards/:id', validate(z.object({ id: z.coerce.number().int().positive() }), 'params'), asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM saved_cards WHERE id = $1 AND user_id = $2', [req.valid.params.id, req.user.id]);
  if (!rowCount) throw new HttpError(404, 'NOT_FOUND');
  res.json({ message: t(req.lang, 'msg.cardRemoved') });
}));

export default router;
