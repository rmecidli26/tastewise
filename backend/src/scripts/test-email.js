// Sends a test email with the SMTP settings from .env
// Usage:  npm run test-email -- you@example.com
import { config } from '../config.js';
import { sendMail, verifySmtp } from '../services/email.js';

const to = process.argv[2];
if (!to || !to.includes('@')) {
  console.error('Usage: npm run test-email -- you@example.com');
  process.exit(1);
}
if (!config.smtp.host && !config.brevoApiKey) {
  console.error('✗ BREVO_API_KEY and SMTP_HOST are empty in .env — emails are only printed to the console.');
  process.exit(1);
}

console.log(config.brevoApiKey
  ? `Using Brevo API, sender ${config.mailFrom}…`
  : `Connecting to ${config.smtp.host}:${config.smtp.port} (secure=${config.smtp.secure}) as ${config.smtp.user || '(no login)'}…`);
try {
  await verifySmtp();
  console.log(config.brevoApiKey ? '✓ Brevo API key OK' : '✓ SMTP login OK');
  await sendMail({
    to,
    subject: 'Tastewise — test email',
    text: 'It works! Tastewise can send emails. / İşləyir! Tastewise email göndərə bilir.',
    html: '<p><strong>It works!</strong> Tastewise can send emails.</p><p>İşləyir! Tastewise email göndərə bilir.</p>'
  });
  console.log(`✓ Test email sent to ${to}. Check the inbox (and Spam).`);
  process.exit(0);
} catch (err) {
  console.error(`✗ ${err.message}`);
  const m = `${err.code || ''} ${err.responseCode || ''} ${err.message}`;
  if (/Brevo 401/.test(m)) {
    console.error('→ Brevo rejected the API key. Copy it again (starts with xkeysib-) into BREVO_API_KEY.');
  } else if (/Brevo 400/.test(m)) {
    console.error('→ Usually the sender email in MAIL_FROM is not verified in Brevo (Senders), or the address is wrong.');
  } else if (/535|EAUTH|Username and Password not accepted|BadCredentials/i.test(m)) {
    console.error('→ Login rejected. For Gmail use an App Password (16 letters, 2-Step Verification must be on), not your normal password.');
  } else if (/ETIMEDOUT|ECONNREFUSED|ESOCKET|ENOTFOUND|ECONNECTION/i.test(m)) {
    console.error('→ Cannot reach the mail server. Check SMTP_HOST / SMTP_PORT, and that port 465 is used with SMTP_SECURE=true (587 with false).');
  } else if (/wrong version number|SSL/i.test(m)) {
    console.error('→ Port and SMTP_SECURE do not match: use 465 + true, or 587 + false.');
  }
  process.exit(1);
}
