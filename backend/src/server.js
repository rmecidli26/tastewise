import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

const server = app.listen(config.port, () => {
  console.log(`Tastewise running on ${config.appUrl} (${config.env})`);
  if (config.exposeDevCodes) console.log('Dev mode: verification codes are printed here and returned as "devCode".');
});

const shutdown = signal => {
  console.log(`${signal} received, shutting down…`);
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
