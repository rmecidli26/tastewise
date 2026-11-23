import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { t } from '../i18n.js';
import { query, transaction } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { sendOrderReceivedEmail, sendNewOrderNotice } from '../services/email.js';
import { cardInput, saveCard } from './cards.js';

const router = Router();
const { deliveryFee, minTotal, maxActivePerUser, cancelMinutes, cardPayments } = config.orders;
const { timeZone, firstSlot } = config.reservations;
const LAST_ORDER = '22:30'; // kitchen closes at 23:00
const money = n => Math.round(n * 100) / 100;

const itemSchema = z.object({
  dishId: z.number({ invalid_type_error: 'v.id' }).int('v.id').positive('v.id'),
  variant: z.string().trim().max(40).nullish(),
  quantity: z.number({ invalid_type_error: 'v.qty' }).int('v.qty').min(1, 'v.qty').max(20, 'v.qty')
});
const orderSchema = z.object({
  items: z.array(itemSchema, { required_error: 'v.cart.empty' }).min(1, 'v.cart.empty').max(30, 'v.cart.big'),
  fulfillment: z.enum(['pickup', 'delivery'], { errorMap: () => ({ message: 'v.fulfillment' }) }),
  payment: z.enum(['cash', 'card', 'online'], { errorMap: () => ({ message: 'v.payment' }) }),
  cardId: z.number().int().positive().nullish(),           // a saved card
  card: cardInput.and(z.object({ save: z.boolean().default(false) })).nullish(), // a new card (brand + last 4 only)
  time: z.string().regex(/^(asap|([01]\d|2[0-3]):[0-5]\d)$/, 'v.orderTime').default('asap'),
  address: z.string().trim().max(300, 'v.address.long').default(''),
  phone: z.string({ required_error: 'v.phone' }).trim().regex(/^\+?[0-9\s\-()]{7,20}$/, 'v.phone'),
  note: z.string().trim().max(500, 'v.note.long').default('')
}).superRefine((o, ctx) => {
  if (o.fulfillment === 'delivery' && o.address.length < 5) {
    ctx.addIssue({ code: 'custom', path: ['address'], message: 'v.address.required' });
  }
  if (o.payment === 'online' && !o.cardId && !o.card) {
    ctx.addIssue({ code: 'custom', path: ['card'], message: 'v.card.required' });
  }
  if (o.time !== 'asap' && (o.time < firstSlot || o.time > LAST_ORDER)) {
    ctx.addIssue({ code: 'custom', path: ['time'], message: 'v.orderTime' });
  }
});
const idParam = z.object({ id: z.coerce.number({ invalid_type_error: 'v.id' }).int('v.id').positive('v.id') });

/* ---------- Shared read helpers (also used by admin.js) ---------- */
export const ORDER_SELECT = `
  o.id, o.fulfillment, o.payment, o.address, o.phone, o.note, o.subtotal, o.delivery_fee, o.total,
  o.status, o.admin_note, o.locale, o.created_at, o.updated_at,
  o.paid_at, o.payment_test, o.card_brand, o.card_last4, o.scheduled_for,
  to_char(o.scheduled_for AT TIME ZONE '${config.reservations.timeZone}', 'HH24:MI') AS scheduled_local,
  (o.status = 'pending' AND o.created_at > now() - interval '${config.orders.cancelMinutes} minutes') AS can_cancel,
  GREATEST(0, EXTRACT(EPOCH FROM (o.created_at + interval '${config.orders.cancelMinutes} minutes' - now())))::int AS cancel_seconds,
  COALESCE((SELECT json_agg(json_build_object(
              'dishId', i.dish_id, 'variant', i.variant_code, 'name', i.name, 'variantLabel', i.variant_label,
              'imageUrl', i.image_url, 'unitPrice', i.unit_price, 'quantity', i.quantity, 'lineTotal', i.line_total)
            ORDER BY i.id)
            FROM order_items i WHERE i.order_id = o.id), '[]'::json) AS items`;

export const toOrder = r => ({
  id: r.id,
  fulfillment: r.fulfillment,
  payment: r.payment,
  address: r.address,
  phone: r.phone,
  note: r.note,
  items: r.items.map(i => ({ ...i, unitPrice: Number(i.unitPrice), lineTotal: Number(i.lineTotal) })),
  subtotal: r.subtotal,
  deliveryFee: r.delivery_fee,
  total: r.total,
  status: r.status,
  adminNote: r.admin_note,
  canCancel: r.can_cancel,
  cancelSeconds: r.can_cancel ? r.cancel_seconds : 0,
  paid: Boolean(r.paid_at),
  paymentTest: r.payment_test,
  card: r.card_last4 ? { brand: r.card_brand, last4: r.card_last4 } : null,
  scheduledFor: r.scheduled_for,
  time: r.scheduled_local || null, // null = as soon as possible
  createdAt: r.created_at,
  ...(r.user_name && { user: { name: r.user_name, email: r.user_email } })
});

export const getOrder = async id =>
  (await query(`SELECT ${ORDER_SELECT}, u.full_name AS user_name, u.email AS user_email
                  FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`, [id])).rows[0];

// GET /api/orders/config — fee and minimum shown on the order page
router.get('/orders/config', (req, res) => {
  res.json({ deliveryFee, minTotal, cancelMinutes, cardPayments, firstTime: firstSlot, lastTime: LAST_ORDER, timeZone });
});

// POST /api/orders — prices always come from the database, never from the browser
router.post('/orders', requireVerified, validate(orderSchema), asyncHandler(async (req, res) => {
  const o = req.valid.body;
  const lang = req.lang;

  const { rows: [{ active }] } = await query(
    `SELECT COUNT(*)::int AS active FROM orders WHERE user_id = $1 AND status IN ('pending', 'confirmed', 'ready')`,
    [req.user.id]
  );
  if (active >= maxActivePerUser) throw new HttpError(409, 'TOO_MANY_ORDERS', { vars: { count: active } });

  const ids = [...new Set(o.items.map(i => i.dishId))];
  const { rows: dishes } = await query(
    `SELECT d.id, d.name, d.translations, d.price, d.image_url, d.restaurant_id,
            COALESCE((SELECT json_agg(json_build_object('code', v.code, 'label', v.label, 'i18n', v.label_i18n, 'price', v.price)
                                      ORDER BY v.sort_order)
                        FROM dish_variants v WHERE v.dish_id = d.id), '[]'::json) AS variants
       FROM dishes d WHERE d.id = ANY($1::bigint[]) AND d.is_available`,
    [ids]
  );
  const byId = new Map(dishes.map(d => [d.id, d]));

  // Merge duplicate lines (same dish + size) and price every line on the server
  const merged = new Map();
  for (const it of o.items) {
    const d = byId.get(it.dishId);
    if (!d) throw new HttpError(400, 'DISH_UNAVAILABLE');
    let variant = null;
    if (d.variants.length) {
      variant = d.variants.find(v => v.code === it.variant) || (d.variants.length === 1 ? d.variants[0] : null);
      if (!variant) throw new HttpError(400, 'VARIANT_REQUIRED', { vars: { name: d.translations?.[lang]?.name || d.name } });
    }
    const key = `${d.id}:${variant?.code || ''}`;
    const prev = merged.get(key);
    const quantity = Math.min(20, (prev?.quantity || 0) + it.quantity);
    const unitPrice = Number(variant ? variant.price : d.price);
    merged.set(key, {
      dishId: d.id,
      variantCode: variant?.code || null,
      name: d.translations?.[lang]?.name || d.name,
      variantLabel: variant ? variant.i18n?.[lang] || variant.label : null,
      imageUrl: d.image_url,
      unitPrice,
      quantity,
      lineTotal: money(unitPrice * quantity),
      restaurantId: d.restaurant_id
    });
  }
  const lines = [...merged.values()];
  const subtotal = money(lines.reduce((s, l) => s + l.lineTotal, 0));
  const fee = o.fulfillment === 'delivery' ? deliveryFee : 0;
  if (o.fulfillment === 'delivery' && subtotal < minTotal) {
    throw new HttpError(400, 'ORDER_TOO_SMALL', { vars: { min: minTotal } });
  }
  const total = money(subtotal + fee);

  // Chosen time today (restaurant time); must be at least 30 minutes from now
  let scheduledFor = null;
  if (o.time !== 'asap') {
    const { rows: [tm] } = await query(
      `SELECT ((now() AT TIME ZONE $2)::date + $1::time) AT TIME ZONE $2 AS at,
              ((now() AT TIME ZONE $2)::date + $1::time) AT TIME ZONE $2 >= now() + interval '30 minutes' AS ok`,
      [o.time, timeZone]
    );
    if (!tm.ok) throw new HttpError(400, 'ORDER_TIME_PAST');
    scheduledFor = tm.at;
  }

  // Card payment (test mode: nothing is charged; only brand + last 4 digits are stored)
  let card = null;
  if (o.payment === 'online') {
    if (cardPayments === 'off') throw new HttpError(400, 'CARDS_OFF');
    if (o.cardId) {
      const { rows: [c] } = await query('SELECT brand, last4 FROM saved_cards WHERE id = $1 AND user_id = $2', [o.cardId, req.user.id]);
      if (!c) throw new HttpError(400, 'CARD_NOT_FOUND');
      card = c;
    } else {
      card = { brand: o.card.brand, last4: o.card.last4 };
      if (o.card.save) await saveCard(req.user.id, o.card).catch(err => { if (err.code !== 'TOO_MANY_CARDS') throw err; });
    }
  }

  const orderId = await transaction(async client => {
    const { rows: [created] } = await client.query(
      `INSERT INTO orders (user_id, restaurant_id, fulfillment, payment, address, phone, note, subtotal, delivery_fee, total, locale,
                           scheduled_for, paid_at, payment_test, card_brand, card_last4)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
      [req.user.id, lines[0].restaurantId, o.fulfillment, o.payment,
        o.fulfillment === 'delivery' ? o.address : null, o.phone, o.note, subtotal, fee, total, lang,
        scheduledFor, card ? new Date() : null, Boolean(card), card?.brand || null, card?.last4 || null]
    );
    for (const l of lines) {
      await client.query(
        `INSERT INTO order_items (order_id, dish_id, variant_code, name, variant_label, image_url, unit_price, quantity, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [created.id, l.dishId, l.variantCode, l.name, l.variantLabel, l.imageUrl, l.unitPrice, l.quantity, l.lineTotal]
      );
    }
    return created.id;
  });

  const row = await getOrder(orderId);
  const order = toOrder(row);
  // Emails must never block or fail the order itself
  Promise.allSettled([
    sendOrderReceivedEmail({ ...req.user, locale: lang }, order),
    sendNewOrderNotice(order)
  ]).then(r => r.forEach(x => x.status === 'rejected' && console.error('[email] order mail failed', x.reason)));

  res.status(201).json({ message: t(lang, 'msg.orderSent', { id: order.id }), order });
}));

// GET /api/me/orders
router.get('/me/orders', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ${ORDER_SELECT} FROM orders o WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT 200`,
    [req.user.id]
  );
  res.json({ orders: rows.map(toOrder) });
}));

// POST /api/me/orders/:id/cancel — only while the restaurant hasn't accepted it yet
router.post('/me/orders/:id/cancel', requireAuth, validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE orders o SET status = 'cancelled', updated_at = now()
      WHERE o.id = $1 AND o.user_id = $2 AND o.status = 'pending'
        AND o.created_at > now() - make_interval(mins => $3)
      RETURNING o.id`,
    [req.valid.params.id, req.user.id, cancelMinutes]
  );
  if (!rows[0]) throw new HttpError(409, 'ORDER_NOT_CANCELLABLE', { vars: { min: cancelMinutes } });
  res.json({ message: t(req.lang, 'msg.orderCancelled'), order: toOrder(await getOrder(rows[0].id)) });
}));

export default router;
