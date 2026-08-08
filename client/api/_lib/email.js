// Shared email sender + the branded email shell. Every automated mail on the
// platform (billing notices, invoices, candidate mail, support tickets) goes
// through sendMail() so there is ONE from-address, ONE template and ONE
// failure behavior.
//
// Two providers, picked by which key exists — SendGrid FIRST because Twilio
// SendGrid is the decided direction; Resend stays supported so nothing breaks
// if a key already exists. Set SENDGRID_API_KEY and every sender switches over
// with no code change. Until SOME key is set, emailEnabled() is false and
// callers fall back to their non-email channels rather than failing.
const RESEND_KEY = process.env.RESEND_API_KEY;
const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
export const FROM_ADDR = process.env.EMAIL_FROM || 'notify@collarone.app';

export const emailEnabled = () => Boolean(SENDGRID_KEY || RESEND_KEY);
export const emailProvider = () => (SENDGRID_KEY ? 'sendgrid' : RESEND_KEY ? 'resend' : null);
export const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const naira = (kobo) => `₦${(Number(kobo) / 100).toLocaleString('en-NG')}`;
export const nairaN = (n) => `₦${Number(n).toLocaleString('en-NG')}`;

// minimal branded shell so the mail doesn't look like a bare paragraph
export const wrap = (heading, inner) => `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#14171f">
  <div style="font-family:Georgia,serif;font-size:20px;font-weight:650;margin-bottom:14px">Collar<span style="color:#FF5B1F">One</span></div>
  <h2 style="font-size:18px;margin:0 0 10px">${esc(heading)}</h2>
  ${inner}
  <p style="font-size:11px;color:#99a;margin-top:22px">Sent via Collarone — the business platform for Nigerian companies.</p>
</div>`;

// attachments: [{ filename, content }] where content is a Buffer or base64
// string. A Nigerian customer forwards the invoice to whoever pays it, and a
// link doesn't survive that trip — the PDF has to be in the message itself.
export async function sendResend({ to, from, replyTo, subject, html, attachments }) {
  const body = {
    from: from || `Collarone <${FROM_ADDR}>`,
    to: [to],
    reply_to: replyTo || undefined,
    subject,
    html,
  };
  if (attachments?.length) {
    body.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
    }));
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.message || 'Email failed to send.'); }
}

// Twilio SendGrid, same call shape. "Name <addr>" is split because SendGrid
// wants the parts separately, unlike Resend which takes the whole string.
const splitAddr = (s) => {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(String(s || ''));
  return m ? { name: m[1] || undefined, email: m[2] } : { email: String(s || '').trim() };
};

export async function sendSendGrid({ to, from, replyTo, subject, html, attachments }) {
  const body = {
    personalizations: [{ to: [{ email: to }] }],
    from: splitAddr(from || `Collarone <${FROM_ADDR}>`),
    subject,
    content: [{ type: 'text/html', value: html }],
  };
  if (replyTo) body.reply_to = splitAddr(replyTo);
  if (attachments?.length) {
    body.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
      disposition: 'attachment',
    }));
  }
  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SENDGRID_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // SendGrid answers 202 with an empty body on success.
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d?.errors?.[0]?.message || 'Email failed to send.');
  }
}

// The one entry point callers should use. Throws if no provider is configured,
// so best-effort callers must check emailEnabled() first (they all do).
export async function sendMail(opts) {
  if (SENDGRID_KEY) return sendSendGrid(opts);
  if (RESEND_KEY) return sendResend(opts);
  throw new Error('Email is not switched on yet.');
}
