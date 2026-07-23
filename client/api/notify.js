// Transactional email via Resend. Sends as "<Org> via Collarone
// <notify@collarone.app>" with Reply-To set to the org, so replies reach the
// business, not us. Never an open relay: every recipient is derived
// server-side from the record, the caller only picks nothing that reaches an
// arbitrary address.
//
// Env: RESEND_API_KEY (+ optional EMAIL_FROM). Until the key is set, 'status'
// reports disabled and callers fall back to copy-link / WhatsApp.
//
//   POST { action: 'status' } → { enabled }
//   POST { action: 'invoice', docId }         (Bearer) → { ok } — emails the
//         invoice's own party_email its public pay-link.
//   POST { action: 'billing-reminder', orgId } (Bearer, platform admin) → { ok }
//         — emails the org's account owner about their pending payment.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_ADDR = process.env.EMAIL_FROM || 'notify@collarone.app';

const json = (res, s, o) => res.status(s).json(o);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const naira = (kobo) => `₦${(Number(kobo) / 100).toLocaleString('en-NG')}`;
const nairaN = (n) => `₦${Number(n).toLocaleString('en-NG')}`;

// minimal branded shell so the mail doesn't look like a bare paragraph
const wrap = (heading, inner) => `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#14171f">
  <div style="font-family:Georgia,serif;font-size:20px;font-weight:650;margin-bottom:14px">Collar<span style="color:#FF5B1F">One</span></div>
  <h2 style="font-size:18px;margin:0 0 10px">${esc(heading)}</h2>
  ${inner}
  <p style="font-size:11px;color:#99a;margin-top:22px">Sent via Collarone — the business platform for Nigerian companies.</p>
</div>`;

async function sendResend({ to, from, replyTo, subject, html }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], reply_to: replyTo || undefined, subject, html }),
  });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.message || 'Email failed to send.'); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  if (body.action === 'status') return json(res, 200, { enabled: Boolean(RESEND_KEY) });
  if (!RESEND_KEY) return json(res, 400, { message: 'Email is not switched on yet.' });
  if (!SERVICE_KEY) return json(res, 500, { message: 'Server not configured.' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(res, 401, { message: 'Authentication required.' });
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json(res, 401, { message: 'Invalid session.' });
  const { data: caller } = await admin.from('profiles').select('org_id, role, suites').eq('id', user.id).single();
  if (!caller) return json(res, 403, { message: 'No profile.' });

  try {
    if (body.action === 'invoice') {
      const { data: doc } = await admin.from('trade_documents')
        .select('id, org_id, doc_no, doc_type, party_name, party_email, total, amount_paid, share_token, status')
        .eq('id', String(body.docId || '')).maybeSingle();
      if (!doc || doc.doc_type !== 'invoice') return json(res, 404, { message: 'Invoice not found.' });
      if (doc.org_id !== caller.org_id) return json(res, 403, { message: 'Not your organization.' });
      const hasTd = caller.role === 'super_admin' || (Array.isArray(caller.suites) && caller.suites.some((s) => s.key === 'trade-docs'));
      if (!hasTd) return json(res, 403, { message: 'Invoicing access required.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(doc.party_email || '')) return json(res, 400, { message: 'This invoice has no valid customer email — add one first.' });

      const { data: s } = await admin.from('trade_doc_settings').select('company_name, email').eq('org_id', doc.org_id).maybeSingle();
      const { data: org } = await admin.from('organizations').select('name').eq('id', doc.org_id).maybeSingle();
      const orgName = (s?.company_name || org?.name || 'Your supplier').slice(0, 60);
      const outstanding = Number(doc.total) - Number(doc.amount_paid || 0);
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const link = `${proto}://${host}/inv/${doc.share_token}`;

      await sendResend({
        to: doc.party_email,
        from: `${orgName} via Collarone <${FROM_ADDR}>`,
        replyTo: s?.email || undefined,
        subject: `Invoice ${doc.doc_no} from ${orgName} — ${nairaN(outstanding)} due`,
        html: wrap(`Invoice ${esc(doc.doc_no)}`, `
          <p style="font-size:14px;line-height:1.6">Hello ${esc(doc.party_name || 'there')},</p>
          <p style="font-size:14px;line-height:1.6">${esc(orgName)} has sent you an invoice for <strong>${nairaN(outstanding)}</strong>. You can view it and pay online — by transfer or card — from the link below.</p>
          <p style="margin:18px 0"><a href="${link}" style="background:#FF5B1F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:100px;font-weight:700;font-size:14px">View &amp; pay invoice</a></p>
          <p style="font-size:12px;color:#889">Or paste this link: ${link}</p>`),
      });
      return json(res, 200, { ok: true });
    }

    if (body.action === 'billing-reminder') {
      const { data: pa } = await admin.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
      if (!pa) return json(res, 403, { message: 'Platform admin access required.' });
      const orgId = String(body.orgId || '');
      const { data: owner } = await admin.from('profiles').select('email, name').eq('org_id', orgId).eq('role', 'super_admin').limit(1).maybeSingle();
      const { data: org } = await admin.from('organizations').select('name').eq('id', orgId).maybeSingle();
      if (!owner?.email) return json(res, 400, { message: 'No account owner email on file for that org.' });
      const { data: tx } = await admin.from('billing_transactions').select('amount_kobo, reference, type').eq('org_id', orgId).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle();

      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      await sendResend({
        to: owner.email,
        from: `Collarone <${FROM_ADDR}>`,
        subject: `Your Collarone payment is pending${tx ? ` — ${naira(tx.amount_kobo)}` : ''}`,
        html: wrap('A quick reminder', `
          <p style="font-size:14px;line-height:1.6">Hi ${esc(owner.name || 'there')},</p>
          <p style="font-size:14px;line-height:1.6">Your Collarone workspace for <strong>${esc(org?.name || 'your business')}</strong> has a payment still pending${tx ? ` of <strong>${naira(tx.amount_kobo)}</strong> (ref ${esc(tx.reference)})` : ''}. Complete it to keep everything active.</p>
          <p style="margin:18px 0"><a href="${proto}://${host}/workspace" style="background:#FF5B1F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:100px;font-weight:700;font-size:14px">Go to Billing</a></p>`),
      });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { message: 'Unknown action.' });
  } catch (e) {
    return json(res, 500, { message: e.message || 'Email error.' });
  }
}
