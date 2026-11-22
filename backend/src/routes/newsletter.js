import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncHandler } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { t } from '../i18n.js';

const router = Router();
const schema = z.object({
  email: z.string({ required_error: 'v.email.required' }).trim().toLowerCase().min(1, 'v.email.required').email('v.email.invalid').max(254, 'v.email.invalid')
});

// POST /api/newsletter  { email } — footer "Stay updated" form. Subscribing twice is fine.
router.post('/newsletter', authLimiter, validate(schema), asyncHandler(async (req, res) => {
  await query(
    `INSERT INTO newsletter_subscribers (email, locale) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET locale = EXCLUDED.locale`,
    [req.valid.body.email, req.lang]
  );
  res.status(201).json({ message: t(req.lang, 'msg.subscribed') });
}));

export default router;
