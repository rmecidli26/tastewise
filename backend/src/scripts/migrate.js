// Applies every .sql file in /migrations once, in name order.
//   npm run migrate            → apply new migrations
//   npm run migrate -- --reset → DROP everything and start over (development only!)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function main() {
  const client = await pool.connect();
  try {
    if (process.argv.includes('--reset')) {
      if (config.isProd) throw new Error('Refusing to --reset in production');
      console.log('Resetting database schema…');
      await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    }

    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map(r => r.name));

    const files = (await fs.readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort();
    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`→ ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
    console.log(count ? `Applied ${count} migration(s).` : 'Database is up to date.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
