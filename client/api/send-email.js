// Vercel serverless function — candidate email (ATS Phase 4, channel: email).
//
// Sends via Resend from Collarone's domain; the sending identity is
// "<Org name> via Collarone <notify@collarone.app>" with Reply-To set to the
// org's own contact email, so replies go straight to the company.
//
// NOT an open relay, by construction: the caller must be an authenticated
// member of the org that owns the application, and the recipient is ALWAYS
// the application's candidate (looked up server-side) — the client can only
// choose subject/body.
//
// Env: RESEND_API_KEY (+ optional EMAIL_FROM, default notify@collarone.app).
// Until the key is set, 'status' reports disabled and the UI hides email.
//
//   POST { action: 'status' } → { enabled }
//   POST { action: 'send', applicationId, subject, body } (Bearer token)
//     → { ok } — body is plain text; newlines preserved.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_ADDR = process.env.EMAIL_FROM || 'notify@collarone.app';

const json = (res, status, obj) => res.status(status).json(obj);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  if (body.action === 'status') return json(res, 200, { enabled: Boolean(RESEND_KEY) });
  if (!RESEND_KEY) return json(res, 400, { message: 'Email is not switched on yet.' });
  if (!SERVICE_KEY) return json(res, 500, { message: 'Server not configured.' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  // authenticate the caller
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(res, 401, { message: 'Authentication required.' });
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json(res, 401, { message: 'Invalid session.' });
  const { data: caller } = await admin.from('profiles').select('org_id, role, suites').eq('id', user.id).single();
  if (!caller) return json(res, 403, { message: 'No profile.' });

  if (body.action !== 'send') return json(res, 400, { message: 'Unknown action.' });

  const { applicationId, subject, body: text } = body;
  if (!applicationId || !subject?.trim() || !text?.trim()) return json(res, 400, { message: 'Subject and message are required.' });
  if (String(text).length > 5000 || String(subject).length > 200) return json(res, 400, { message: 'Message too long.' });

  // recipient is derived server-side; caller must own the application's org
  const { data: app } = await admin.from('applications')
    .select('id, requisition_id, candidates(name, email), job_requisitions(org_id, title)')
    .eq('id', applicationId).maybeSingle();
  if (!app) return json(res, 404, { message: 'Application not found.' });
  if (app.job_requisitions?.org_id !== caller.org_id) return json(res, 403, { message: 'Not your organization.' });
  const isHr = caller.role === 'super_admin' || (Array.isArray(caller.suites) && caller.suites.some((s) => s.key === 'hr' && s.role === 'manager'));
  if (!isHr) return json(res, 403, { message: 'HR manager access required.' });

  const { data: org } = await admin.from('organizations').select('name, slug').eq('id', caller.org_id).single();
  const { data: site } = await admin.from('org_sites').select('contact_email').eq('org_id', caller.org_id).maybeSingle();

  const candidate = app.candidates;
  if (!candidate?.email) return json(res, 400, { message: 'This candidate has no email address.' });

  const html = `<div style="font-family:-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.7;color:#14161C;max-width:560px">
    ${esc(text).replace(/\n/g, '<br/>')}
    <hr style="border:none;border-top:1px solid #E4E1D8;margin:24px 0 12px"/>
    <p style="font-size:12px;color:#8A8D95">Sent by ${esc(org?.name || 'the hiring team')} via Collarone.</p>
  </div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // each org sends from its own handle on our domain (handle uniqueness is
      // already guaranteed by the signup availability check); send-only — no
      // mailbox exists behind it, replies flow to the org via Reply-To
      from: `${(org?.name || 'Collarone').replace(/[<>@"]/g, '')} via Collarone <${org?.slug ? `${org.slug}@collarone.app` : FROM_ADDR}>`,
      to: [candidate.email],
      ...(site?.contact_email ? { reply_to: site.contact_email } : {}),
      subject: subject.trim(),
      html,
      text,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return json(res, 502, { message: d?.message || 'The email could not be sent.' });
  return json(res, 200, { ok: true });
}
