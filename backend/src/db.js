import pg from 'pg';
import { config } from './config.js';

// Return NUMERIC (prices, averages) as JS numbers instead of strings
pg.types.setTypeParser(1700, v => (v === null ? null : Number(v)));
// Return BIGINT ids / counts as numbers (safe for this app's sizes)
pg.types.setTypeParser(20, v => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined
});

pool.on('error', err => console.error('[db] idle client error', err));

export const query = (text, params) => pool.query(text, params);

/** Runs fn(client) inside BEGIN/COMMIT, rolling back on error. */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
