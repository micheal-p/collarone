// Shared Resend sender + the branded email shell. Extracted from notify.js so
// automated billing notifications (billingNotify.js) and the interactive
// notify endpoint send through ONE code path — same from-address, same
// template, same failure behavior. Until RESEND_API_KEY is set, emailEnabled()
// is false and callers fall back to their non-email channels.
const RESEND_KEY = process.env.RESEND_API_KEY;
export const FROM_ADDR = process.env.EMAIL_FROM || 'notify@collarone.app';

export const emailEnabled = () => Boolean(RESEND_KEY);
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

export async function sendResend({ to, from, replyTo, subject, html }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: from || `Collarone <${FROM_ADDR}>`, to: [to], reply_to: replyTo || undefined, subject, html }),
  });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.message || 'Email failed to send.'); }
}
