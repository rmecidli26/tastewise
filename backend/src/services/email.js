import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { t, LOCALES } from '../i18n.js';

const transporter = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000
    })
  : null;

if (!transporter && !config.brevoApiKey) {
  console.warn('[email] No BREVO_API_KEY or SMTP_HOST — emails will be printed to the console instead of sent.');
}

/** "Tastewise by AFA <info@x.az>" → { name, email } */
function parseFrom(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: from.trim() };
}

/** Brevo transactional email over HTTPS (works on hosts that block SMTP ports). */
async function sendViaBrevo({ to, subject, text, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: parseFrom(config.mailFrom), to: [{ email: to }], subject, htmlContent: html, textContent: text }),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Checks the SMTP login (used by `npm run test-email`). */
export const verifySmtp = async () => {
  if (config.brevoApiKey) {
    const res = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': config.brevoApiKey, accept: 'application/json' } });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return true;
  }
  if (!transporter) throw new Error('SMTP_HOST is empty');
  return transporter.verify();
};

export async function sendMail({ to, subject, text, html }) {
  if (config.brevoApiKey) return sendViaBrevo({ to, subject, text, html });
  if (!transporter) {
    console.log(`\n──── [email:dev] ────\nTo: ${to}\nSubject: ${subject}\n\n${text}\n─────────────────────\n`);
    return;
  }
  await transporter.sendMail({ from: config.mailFrom, to, subject, text, html });
}

/** Branded wrapper used by every email. */
function layout(lang, title, bodyHtml) {
  return `<!DOCTYPE html><html lang="${lang}"><body style="margin:0;background:#fbf4ee;font-family:Arial,Helvetica,sans-serif;color:#2e1a1d">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffdfb;border-radius:16px;overflow:hidden;border:1px solid #ecc9c0">
      <tr><td style="background:#7a1f2e;padding:22px 28px;color:#fffdfb;font-family:Georgia,serif;font-size:24px;font-weight:bold">Tastewise<span style="font-size:13px;font-weight:normal;opacity:.8"> by AFA</span></td></tr>
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 14px;font-family:Georgia,serif;color:#7a1f2e;font-size:24px">${escapeHtml(title)}</h1>
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:16px 28px;background:#f7ebe3;color:#6e5559;font-size:12px">${escapeHtml(t(lang, 'mail.footer'))}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

const codeBox = code =>
  `<div style="margin:22px 0;padding:18px;background:#f4dfd9;border-radius:12px;text-align:center;font-size:34px;letter-spacing:10px;font-weight:bold;color:#7a1f2e;font-family:'Courier New',monospace">${code}</div>`;

/** Verification / password-reset email in the given language. kind: 'verify' | 'reset' */
async function sendCodeEmail(kind, user, code, lang) {
  const vars = { code, name: user.full_name, minutes: config.code.ttlMinutes };
  const tr = key => t(lang, `mail.${kind}.${key}`, vars);
  await sendMail({
    to: user.email,
    subject: tr('subject'),
    text: `${t(lang, 'mail.hi', vars)}\n\n${tr('lead')}\n\n${code}\n\n${tr('foot')}`,
    html: layout(lang, tr('title'), `
      <p style="margin:0 0 6px">${escapeHtml(t(lang, 'mail.hi', vars))}</p>
      <p style="margin:0">${escapeHtml(tr('lead'))}</p>
      ${codeBox(code)}
      <p style="margin:0;color:#6e5559;font-size:14px">${escapeHtml(tr('foot'))}</p>`)
  });
}

export const sendVerificationEmail = (user, code, lang = 'az') => sendCodeEmail('verify', user, code, lang);
export const sendPasswordResetEmail = (user, code, lang = 'az') => sendCodeEmail('reset', user, code, lang);

/** Sent when an admin confirms or declines a reservation — in the guest's own language. */
export async function sendReservationStatusEmail(user, reservation) {
  const lang = user.locale || 'az';
  const when = new Intl.DateTimeFormat(LOCALES[lang], {
    dateStyle: 'full', timeStyle: 'short', timeZone: config.reservations.timeZone
  }).format(new Date(reservation.reserved_at));
  const kind = reservation.status === 'confirmed' ? 'confirmed' : 'declined';
  const vars = { when, guests: reservation.guests, name: user.full_name, note: reservation.admin_note };
  const tr = key => t(lang, `mail.res.${kind}.${key}`, vars);
  const note = reservation.admin_note ? t(lang, 'mail.res.note', vars) : '';
  await sendMail({
    to: user.email,
    subject: tr('subject'),
    text: `${t(lang, 'mail.hi', vars)}\n\n${tr('line')}${note ? `\n\n${note}` : ''}`,
    html: layout(lang, tr('title'), `
      <p style="margin:0 0 6px">${escapeHtml(t(lang, 'mail.hi', vars))}</p>
      <p style="margin:0 0 12px">${escapeHtml(tr('line'))}</p>
      ${note ? `<p style="margin:0;padding:12px;background:#f7ebe3;border-radius:10px">${escapeHtml(note)}</p>` : ''}`)
  });
}

/* ---------- Orders ---------- */
const azn = n => `${Number(n).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} ₼`;

function orderTable(lang, order) {
  const rows = order.items.map(i => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f0dcd5">${escapeHtml(i.name)}${i.variantLabel ? ` <span style="color:#6e5559">(${escapeHtml(i.variantLabel)})</span>` : ''}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #f0dcd5;text-align:center;white-space:nowrap">× ${i.quantity}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0dcd5;text-align:right;white-space:nowrap">${azn(i.lineTotal)}</td>
    </tr>`).join('');
  const fee = order.deliveryFee > 0
    ? `<tr><td colspan="2" style="padding:6px 0;color:#6e5559">${escapeHtml(t(lang, 'mail.order.fee'))}</td><td style="text-align:right">${azn(order.deliveryFee)}</td></tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:15px">${rows}${fee}
    <tr><td colspan="2" style="padding:10px 0;font-weight:bold">${escapeHtml(t(lang, 'mail.order.total'))}</td>
        <td style="padding:10px 0;text-align:right;font-weight:bold;color:#7a1f2e;font-size:18px">${azn(order.total)}</td></tr></table>`;
}
function orderText(lang, order) {
  const lines = order.items.map(i => `• ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''} × ${i.quantity} — ${azn(i.lineTotal)}`);
  if (order.deliveryFee > 0) lines.push(`${t(lang, 'mail.order.fee')}: ${azn(order.deliveryFee)}`);
  lines.push(`${t(lang, 'mail.order.total')}: ${azn(order.total)}`);
  return lines.join('\n');
}
function orderInfo(lang, order) {
  const how = t(lang, `mail.order.${order.fulfillment}`);
  const card = order.card ? `${order.card.brand.toUpperCase()} •••• ${order.card.last4}${order.paymentTest ? ' · TEST' : ''}` : '';
  const pay = t(lang, `mail.order.pay.${order.payment}`, { card });
  const when = order.time ? t(lang, 'mail.order.time', { time: order.time }) : t(lang, 'mail.order.asap');
  return [how + (order.address ? `: ${order.address}` : ''), when, pay, `${t(lang, 'mail.order.phone')}: ${order.phone}`];
}

/** Sent to the customer right after ordering. */
export async function sendOrderReceivedEmail(user, order) {
  const lang = user.locale || 'az';
  const vars = { id: order.id, name: user.full_name };
  const info = orderInfo(lang, order);
  await sendMail({
    to: user.email,
    subject: t(lang, 'mail.order.subject', vars),
    text: `${t(lang, 'mail.hi', vars)}\n\n${t(lang, 'mail.order.lead', vars)}\n\n${orderText(lang, order)}\n\n${info.join('\n')}`,
    html: layout(lang, t(lang, 'mail.order.title', vars), `
      <p style="margin:0 0 6px">${escapeHtml(t(lang, 'mail.hi', vars))}</p>
      <p style="margin:0">${escapeHtml(t(lang, 'mail.order.lead', vars))}</p>
      ${orderTable(lang, order)}
      <p style="margin:0;color:#6e5559;font-size:14px">${info.map(escapeHtml).join('<br>')}</p>`)
  });
}

/** Sent to the restaurant inbox (ORDER_NOTIFY_EMAIL) when a new order arrives. */
export async function sendNewOrderNotice(order) {
  if (!config.orders.notifyEmail) return;
  const lang = 'az';
  const info = orderInfo(lang, order);
  const who = order.user ? `${order.user.name} <${order.user.email}>` : '';
  await sendMail({
    to: config.orders.notifyEmail,
    subject: t(lang, 'mail.order.newSubject', { id: order.id, total: azn(order.total) }),
    text: `${who}\n\n${orderText(lang, order)}\n\n${info.join('\n')}${order.note ? `\n\n${order.note}` : ''}\n\n${config.appUrl}/admin-orders.html`,
    html: layout(lang, t(lang, 'mail.order.newTitle', { id: order.id }), `
      <p style="margin:0">${escapeHtml(who)}</p>
      ${orderTable(lang, order)}
      <p style="margin:0 0 12px;color:#6e5559;font-size:14px">${info.map(escapeHtml).join('<br>')}</p>
      ${order.note ? `<p style="margin:0 0 12px;padding:12px;background:#f7ebe3;border-radius:10px">${escapeHtml(order.note)}</p>` : ''}
      <p style="margin:0"><a href="${escapeHtml(config.appUrl)}/admin-orders.html" style="color:#7a1f2e;font-weight:bold">${escapeHtml(t(lang, 'mail.order.open'))}</a></p>`)
  });
}

/** Sent to the customer when the restaurant confirms, readies or declines an order. */
export async function sendOrderStatusEmail(user, order) {
  const lang = user.locale || 'az';
  const kind = order.status === 'ready' ? (order.fulfillment === 'delivery' ? 'onTheWay' : 'ready') : order.status;
  const vars = { id: order.id, name: user.full_name, note: order.adminNote };
  const line = t(lang, `mail.order.status.${kind}`, vars);
  const note = order.adminNote ? t(lang, 'mail.res.note', vars) : '';
  await sendMail({
    to: user.email,
    subject: t(lang, 'mail.order.statusSubject', vars),
    text: `${t(lang, 'mail.hi', vars)}\n\n${line}${note ? `\n\n${note}` : ''}\n\n${orderText(lang, order)}`,
    html: layout(lang, t(lang, 'mail.order.statusSubject', vars), `
      <p style="margin:0 0 6px">${escapeHtml(t(lang, 'mail.hi', vars))}</p>
      <p style="margin:0 0 12px">${escapeHtml(line)}</p>
      ${note ? `<p style="margin:0;padding:12px;background:#f7ebe3;border-radius:10px">${escapeHtml(note)}</p>` : ''}
      ${orderTable(lang, order)}`)
  });
}
