import rateLimit from 'express-rate-limit';
import { t, pickLang } from '../i18n.js';

const handler = (req, res, next, options) =>
  res.status(options.statusCode).json({
    error: { code: 'TOO_MANY_REQUESTS', message: t(req.lang || pickLang(req), 'err.TOO_MANY_REQUESTS') }
  });

/** Login, register and code endpoints: 30 requests per 15 minutes per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler
});

/** Everything else under /api: 600 requests per 15 minutes per IP. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler
});
