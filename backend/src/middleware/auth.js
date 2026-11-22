import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError, asyncHandler } from './errors.js';

export const SESSION_COOKIE = 'tw_session';

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProd,
  path: '/'
});

const REMEMBER_DAYS = 30;

/**
 * Signs the user in.
 * remember = true  → stays signed in for 30 days
 * remember = false → cookie ends when the browser closes (token still expires after JWT_EXPIRES_DAYS)
 * remember = undefined → default JWT_EXPIRES_DAYS
 */
export function startSession(res, user, { remember } = {}) {
  const days = remember ? REMEMBER_DAYS : config.jwtExpiresDays;
  const token = jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, { expiresIn: `${days}d` });
  const opts = cookieOptions();
  if (remember !== false) opts.maxAge = days * 24 * 60 * 60 * 1000;
  res.cookie(SESSION_COOKIE, token, opts);
}

export function endSession(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

/** Public shape of a user returned by the API. */
export const publicUser = u => ({
  id: u.id,
  fullName: u.full_name,
  email: u.email,
  role: u.role,
  phone: u.phone || '',
  city: u.city || '',
  emailVerified: Boolean(u.email_verified_at),
  createdAt: u.created_at
});

/** Reads the session cookie (if any) and sets req.user. Never rejects the request. */
export const loadUser = asyncHandler(async (req, res, next) => {
  req.user = null;
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    endSession(res);
    return next();
  }

  const { rows } = await query(
    `SELECT id, full_name, email, role, phone, city, locale, email_verified_at, password_changed_at, created_at
       FROM users WHERE id = $1`,
    [payload.sub]
  );
  const user = rows[0];
  // Tokens issued before the last password change are no longer valid
  const changedAt = user?.password_changed_at ? Math.floor(new Date(user.password_changed_at).getTime() / 1000) : 0;
  // (5 s of slack covers small clock differences between the app and database servers)
  if (!user || payload.iat + 5 < changedAt) {
    endSession(res);
    return next();
  }
  req.user = user;
  next();
});

export function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'UNAUTHORIZED'));
  next();
}

export function requireVerified(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'UNAUTHORIZED'));
  if (!req.user.email_verified_at) {
    return next(new HttpError(403, 'EMAIL_NOT_VERIFIED', { details: { email: req.user.email } }));
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'UNAUTHORIZED'));
  if (req.user.role !== 'admin') return next(new HttpError(403, 'FORBIDDEN'));
  next();
}
