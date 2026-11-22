import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { t } from '../i18n.js';
import { query } from '../db.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { startSession, endSession, publicUser } from '../middleware/auth.js';
import { issueCode, consumeCode } from '../services/codes.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.js';

const router = Router();
const BCRYPT_ROUNDS = 12;
// Used to keep login timing similar whether or not the email exists
const DUMMY_HASH = bcrypt.hashSync('timing-protection-only', BCRYPT_ROUNDS);

// ---------- Schemas ----------
// Messages are translation keys (see src/i18n.js, "v.*")
const email = z.string({ required_error: 'v.email.required' }).trim().toLowerCase()
  .min(1, 'v.email.required').email('v.email.invalid').max(254, 'v.email.invalid');
const password = z.string({ required_error: 'v.password.required' })
  .min(8, 'v.password.min')
  .max(72, 'v.password.max')
  // letters in any alphabet count (Latin, Azerbaijani, Cyrillic)
  .regex(/\p{L}/u, 'v.password.letter')
  .regex(/\d/, 'v.password.digit');
const code = z.string({ required_error: 'v.code.required' }).trim().regex(/^\d{6}$/, 'v.code.format');

const registerSchema = z.object({
  fullName: z.string({ required_error: 'v.name.required' }).trim().min(2, 'v.name.short').max(80, 'v.name.long'),
  email,
  password
});
const loginSchema = z.object({
  email,
  password: z.string({ required_error: 'v.password.required' }).min(1, 'v.password.required').max(200, 'v.invalid'),
  remember: z.boolean().optional()
});
const verifySchema = z.object({ email, code });
const emailOnlySchema = z.object({ email });
const resetSchema = z.object({ email, code, password });

// ---------- Helpers ----------
const findUserByEmail = async addr =>
  (await query(
    `SELECT id, full_name, email, password_hash, role, phone, city, email_verified_at, created_at
       FROM users WHERE email = $1`,
    [addr]
  )).rows[0] || null;

/** Issues + emails a code. If a code was sent moments ago, quietly keeps that one. */
async function sendCode(user, purpose, lang) {
  let code;
  try {
    code = await issueCode({ query }, user.id, purpose);
  } catch (err) {
    if (err.code === 'CODE_COOLDOWN') return { sent: false, retryAfter: err.details.retryAfter };
    throw err;
  }
  try {
    if (purpose === 'verify_email') await sendVerificationEmail(user, code, lang);
    else await sendPasswordResetEmail(user, code, lang);
  } catch (err) {
    console.error('[email] send failed', err);
    throw new HttpError(502, 'EMAIL_SEND_FAILED');
  }
  return { sent: true, ...(config.exposeDevCodes && { devCode: code }) };
}

// ---------- Routes ----------

// POST /api/auth/register
router.post('/register', authLimiter, validate(registerSchema), asyncHandler(async (req, res) => {
  const { fullName, email: addr, password: pwd } = req.valid.body;
  const hash = await bcrypt.hash(pwd, BCRYPT_ROUNDS);

  let user = await findUserByEmail(addr);
  if (user?.email_verified_at) {
    throw new HttpError(409, 'EMAIL_TAKEN');
  }

  if (user) {
    // Registered before but never verified: let them start again with new details
    user = (await query(
      `UPDATE users SET full_name = $2, password_hash = $3, locale = $4, updated_at = now() WHERE id = $1
       RETURNING id, full_name, email, role, phone, city, email_verified_at, created_at`,
      [user.id, fullName, hash, req.lang]
    )).rows[0];
  } else {
    user = (await query(
      `INSERT INTO users (full_name, email, password_hash, locale) VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, role, phone, city, email_verified_at, created_at`,
      [fullName, addr, hash, req.lang]
    )).rows[0];
  }

  const result = await sendCode(user, 'verify_email', req.lang);
  res.status(201).json({
    message: t(req.lang, 'msg.registered'),
    email: user.email,
    codeSent: result.sent,
    retryAfter: result.retryAfter,
    devCode: result.devCode
  });
}));

// POST /api/auth/verify-email  — confirms the email and logs the user in
router.post('/verify-email', authLimiter, validate(verifySchema), asyncHandler(async (req, res) => {
  const { email: addr, code: c } = req.valid.body;
  const user = await findUserByEmail(addr);
  if (!user) throw new HttpError(400, 'CODE_NOT_FOUND');
  if (user.email_verified_at) throw new HttpError(400, 'ALREADY_VERIFIED');

  await consumeCode({ query }, user.id, 'verify_email', c);

  const verified = (await query(
    `UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1
     RETURNING id, full_name, email, role, phone, city, email_verified_at, created_at`,
    [user.id]
  )).rows[0];

  startSession(res, verified);
  res.json({ message: t(req.lang, 'msg.verified'), user: publicUser(verified) });
}));

// POST /api/auth/resend-code  — new verification code
router.post('/resend-code', authLimiter, validate(emailOnlySchema), asyncHandler(async (req, res) => {
  const user = await findUserByEmail(req.valid.body.email);
  const generic = { message: t(req.lang, 'msg.resent') };
  if (!user || user.email_verified_at) return res.json(generic);

  const result = await sendCode(user, 'verify_email', req.lang);
  if (!result.sent) {
    throw new HttpError(429, 'CODE_COOLDOWN', { vars: { seconds: result.retryAfter }, details: { retryAfter: result.retryAfter } });
  }
  res.json({ ...generic, devCode: result.devCode });
}));

// POST /api/auth/login
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  const { email: addr, password: pwd, remember = false } = req.valid.body;
  const user = await findUserByEmail(addr);
  const ok = await bcrypt.compare(pwd, user?.password_hash || DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS');

  // Emails follow the language the user last used on the site
  await query('UPDATE users SET locale = $2 WHERE id = $1 AND locale <> $2', [user.id, req.lang]);

  if (!user.email_verified_at) {
    const result = await sendCode(user, 'verify_email', req.lang); // sends a fresh code unless one was just sent
    throw new HttpError(403, 'EMAIL_NOT_VERIFIED', {
      key: 'err.EMAIL_NOT_VERIFIED_SENT',
      details: { email: user.email, devCode: result.devCode }
    });
  }

  startSession(res, user, { remember });
  res.json({ user: publicUser(user) });
}));

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  endSession(res);
  res.json({ message: t(req.lang, 'msg.loggedOut') });
});

// GET /api/auth/me  — { user } when logged in, { user: null } otherwise (no 401 noise for visitors)
router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

// POST /api/auth/forgot-password  — always the same answer, so emails can't be probed
router.post('/forgot-password', authLimiter, validate(emailOnlySchema), asyncHandler(async (req, res) => {
  const user = await findUserByEmail(req.valid.body.email);
  let devCode;
  if (user) devCode = (await sendCode(user, 'reset_password', req.lang)).devCode;
  res.json({ message: t(req.lang, 'msg.resetSent'), devCode });
}));

// POST /api/auth/reset-password  — sets a new password and logs the user in
router.post('/reset-password', authLimiter, validate(resetSchema), asyncHandler(async (req, res) => {
  const { email: addr, code: c, password: pwd } = req.valid.body;
  const user = await findUserByEmail(addr);
  if (!user) throw new HttpError(400, 'CODE_NOT_FOUND');

  await consumeCode({ query }, user.id, 'reset_password', c);

  const hash = await bcrypt.hash(pwd, BCRYPT_ROUNDS);
  const updated = (await query(
    `UPDATE users
        SET password_hash = $2,
            password_changed_at = now(),
            email_verified_at = COALESCE(email_verified_at, now()),  -- they proved they own the inbox
            updated_at = now()
      WHERE id = $1
      RETURNING id, full_name, email, role, phone, city, email_verified_at, created_at`,
    [user.id, hash]
  )).rows[0];

  startSession(res, updated); // signed after password_changed_at, so it stays valid
  res.json({ message: t(req.lang, 'msg.passwordUpdated'), user: publicUser(updated) });
}));

// Shared with routes/me.js
export { password as passwordSchema, BCRYPT_ROUNDS };

export default router;
