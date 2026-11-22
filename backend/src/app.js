import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { query } from './db.js';
import { loadUser } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { apiNotFound, errorHandler } from './middleware/errors.js';
import { langMiddleware } from './i18n.js';
import authRoutes from './routes/auth.js';
import dishRoutes from './routes/dishes.js';
import reviewRoutes from './routes/reviews.js';
import favoriteRoutes from './routes/favorites.js';
import reservationRoutes from './routes/reservations.js';
import restaurantRoutes from './routes/restaurant.js';
import adminRoutes from './routes/admin.js';
import newsletterRoutes from './routes/newsletter.js';
import meRoutes from './routes/me.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '../../frontend');

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // correct client IPs behind Render/Railway/Nginx (rate limits)

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'img-src': ["'self'", 'data:', 'https:'],
      'frame-src': ["'self'", 'https://www.openstreetmap.org'], // map on the Visit AFA page
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      // only force https in production (localhost runs on http)
      'upgrade-insecure-requests': config.isProd ? [] : null
    }
  }
}));

if (config.corsOrigin.length) {
  app.use('/api', cors({ origin: config.corsOrigin, credentials: true }));
}

app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());
app.use('/api', langMiddleware); // req.lang = az | en | ru

// ---------- API ----------
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, db: 'up' });
  } catch {
    res.status(503).json({ ok: false, db: 'down' });
  }
});

app.use('/api', apiLimiter, loadUser);
app.use('/api/auth', authRoutes);
app.use('/api', dishRoutes, reviewRoutes, favoriteRoutes, reservationRoutes, restaurantRoutes, adminRoutes, newsletterRoutes, meRoutes);
app.use('/api', apiNotFound);

// ---------- Frontend (static files, same origin → simple cookies, no CORS) ----------
app.use(express.static(FRONTEND_DIR, { extensions: ['html'], maxAge: config.isProd ? '1h' : 0 }));
app.use((req, res) => res.status(404).sendFile(path.join(FRONTEND_DIR, '404.html')));

app.use(errorHandler);
