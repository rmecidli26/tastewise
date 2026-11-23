import 'dotenv/config';

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const port = Number(env.PORT || 4000);

if (isProd && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}

export const config = {
  env: env.NODE_ENV || 'development',
  isProd,
  port,
  appUrl: env.APP_URL || `http://localhost:${port}`,
  corsOrigin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean) : [],

  databaseUrl: env.DATABASE_URL || 'postgres://tastewise:tastewise@localhost:5432/tastewise',
  databaseSsl: env.DATABASE_SSL === 'true',

  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me-dev-only-secret',
  jwtExpiresDays: Number(env.JWT_EXPIRES_DAYS || 7),

  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || ''
  },
  brevoApiKey: env.BREVO_API_KEY || '',
  mailFrom: env.MAIL_FROM || 'Tastewise by AFA <no-reply@tastewise.az>',

  // Email verification / password reset codes
  code: {
    length: 6,
    ttlMinutes: 10,
    maxAttempts: 5,
    resendCooldownSeconds: 60
  },

  // Online orders (paid on pickup / delivery)
  orders: {
    deliveryFee: Number(env.DELIVERY_FEE || 0),      // AZN, 0 = free delivery
    minTotal: Number(env.ORDER_MIN_TOTAL || 0),       // AZN, minimum food total for delivery
    maxActivePerUser: 5,
    notifyEmail: env.ORDER_NOTIFY_EMAIL || ''         // restaurant inbox for new orders (optional)
  },

  // Reservations (restaurant local time)
  reservations: {
    timeZone: 'Asia/Baku',
    firstSlot: '10:00',
    lastSlot: '22:00',
    maxDaysAhead: 60,
    maxActivePerUser: 3
  }
};

// In development without SMTP, the API also returns the code in the response so the
// flow can be tested without a mail server. Never enabled in production.
config.exposeDevCodes = !config.isProd && !config.smtp.host && !config.brevoApiKey;
