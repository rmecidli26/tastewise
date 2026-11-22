// Gives an existing account admin rights:  npm run make-admin -- someone@example.com
import { pool, query } from '../db.js';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run make-admin -- <email>');
  process.exit(1);
}

const { rowCount } = await query(
  `UPDATE users SET role = 'admin', email_verified_at = COALESCE(email_verified_at, now()) WHERE email = $1`,
  [email]
);
console.log(rowCount ? `${email} is now an admin.` : `No user with email ${email}. Register first, then run this again.`);
await pool.end();
