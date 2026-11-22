import { t, has } from '../i18n.js';
import { config } from '../config.js';

/**
 * new HttpError(404, 'DISH_NOT_FOUND')
 * new HttpError(429, 'CODE_COOLDOWN', { vars: { seconds: 30 }, details: { retryAfter: 30 } })
 * The message is translated into the request language by errorHandler using `key` (default: err.<CODE>).
 */
export class HttpError extends Error {
  constructor(status, code, { key, vars, details, firstDetail } = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.key = key || `err.${code}`;
    this.vars = vars || {};
    this.details = details;
    this.firstDetail = firstDetail; // use the first validation message as the main message
  }
}

/** Wraps an async route so rejected promises reach the error handler (Express 4). */
export const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function apiNotFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: t(req.lang || 'az', 'err.NOT_FOUND') } });
}

// Variables available to every validation message (e.g. reservation hours)
const validationVars = () => ({ from: config.reservations.firstSlot, to: config.reservations.lastSlot });
const translateDetail = (lang, msg) => t(lang, /^v\./.test(msg) && has(lang, msg) ? msg : 'v.invalid', validationVars());

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const lang = req.lang || 'az';
  const send = (status, code, message, details) =>
    res.status(status).json({ error: { code, message, ...(details !== undefined && { details }) } });

  if (err instanceof HttpError) {
    let details = err.details;
    if (Array.isArray(details)) details = details.map(d => ({ ...d, message: translateDetail(lang, d.message) }));
    const message = err.firstDetail && details?.[0]?.message ? details[0].message : t(lang, err.key, err.vars);
    if (err.status === 429 && err.details?.retryAfter) res.set('Retry-After', String(err.details.retryAfter));
    return send(err.status, err.code, message, details);
  }
  if (err?.type === 'entity.parse.failed') return send(400, 'INVALID_JSON', t(lang, 'err.INVALID_JSON'));
  if (err?.type === 'entity.too.large') return send(413, 'PAYLOAD_TOO_LARGE', t(lang, 'err.PAYLOAD_TOO_LARGE'));
  if (err?.code === '23505') return send(409, 'CONFLICT', t(lang, 'err.CONFLICT'));
  console.error('[error]', err);
  send(500, 'SERVER_ERROR', t(lang, 'err.SERVER_ERROR'));
}
