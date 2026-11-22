import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../middleware/errors.js';

const { length, ttlMinutes, maxAttempts, resendCooldownSeconds } = config.code;

/** Cryptographically random numeric code, e.g. "048213". */
export const generateCode = () => crypto.randomInt(0, 10 ** length).toString().padStart(length, '0');

/** Codes are stored as a peppered SHA-256 hash, never in plain text. */
export const hashCode = code => crypto.createHash('sha256').update(`${config.jwtSecret}:${code}`).digest('hex');

/**
 * Creates a new code for (user, purpose) and returns it in plain text so it can be emailed.
 * Older unused codes for the same purpose are invalidated.
 * Throws 429 CODE_COOLDOWN if a code was sent less than `resendCooldownSeconds` ago.
 */
export async function issueCode(db, userId, purpose) {
  const { rows } = await db.query(
    `SELECT EXTRACT(EPOCH FROM (now() - created_at))::int AS age_seconds
       FROM verification_codes
      WHERE user_id = $1 AND purpose = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, purpose]
  );
  if (rows[0] && rows[0].age_seconds < resendCooldownSeconds) {
    const retryAfter = resendCooldownSeconds - rows[0].age_seconds;
    throw new HttpError(429, 'CODE_COOLDOWN', { vars: { seconds: retryAfter }, details: { retryAfter } });
  }

  await db.query(
    `UPDATE verification_codes SET consumed_at = now()
      WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [userId, purpose]
  );

  const code = generateCode();
  await db.query(
    `INSERT INTO verification_codes (user_id, purpose, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4::int))`,
    [userId, purpose, hashCode(code), ttlMinutes]
  );
  return code;
}

/**
 * Checks a code. On success it is marked as used.
 * On failure the attempt counter goes up; after `maxAttempts` the code is locked.
 * Do NOT call inside a transaction that is rolled back on error, or the attempt count is lost.
 */
export async function consumeCode(db, userId, purpose, code) {
  const { rows } = await db.query(
    `SELECT id, code_hash, attempts, (expires_at < now()) AS expired
       FROM verification_codes
      WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, purpose]
  );
  const row = rows[0];
  if (!row) throw new HttpError(400, 'CODE_NOT_FOUND');
  if (row.expired) throw new HttpError(400, 'CODE_EXPIRED');
  if (row.attempts >= maxAttempts) {
    throw new HttpError(400, 'CODE_LOCKED');
  }

  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash, 'hex'), Buffer.from(hashCode(code), 'hex'));
  if (!ok) {
    const { rows: [updated] } = await db.query(
      'UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts',
      [row.id]
    );
    const attemptsLeft = Math.max(0, maxAttempts - updated.attempts);
    throw new HttpError(400, attemptsLeft > 0 ? 'INVALID_CODE' : 'CODE_LOCKED', {
      vars: { left: attemptsLeft },
      details: { attemptsLeft }
    });
  }

  await db.query('UPDATE verification_codes SET consumed_at = now() WHERE id = $1', [row.id]);
}
