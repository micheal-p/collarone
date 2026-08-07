// Email ping to the Collarone team when a support ticket is opened or gets a
// customer reply. Best-effort by design: the ticket is already safely in the
// database when this runs, so a missing RESEND_API_KEY (or a Resend outage)
// costs the ping, never the ticket. Same graceful pattern as billing notices.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const TEAM_EMAIL = process.env.SUPPORT_EMAIL || 'hello@collarone.app';
const FROM = process.env.EMAIL_FROM || 'notify@collarone.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  if (!SERVICE_KEY) return res.status(200).json({ sent: false });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { ticketId, kind } = body;
  if (!ticketId) return res.status(400).json({ message: 'ticketId required' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: t } = await admin.from('support_tickets')
    .select('id, subject, category, status, org_id, organizations(name)')
    .eq('id', ticketId).maybeSingle();
  if (!t) return res.status(404).json({ message: 'No such ticket.' });

  if (!RESEND_KEY) return res.status(200).json({ sent: false });
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: TEAM_EMAIL,
        subject: `[Support] ${kind === 'reply' ? 'Reply on' : 'New ticket'}: ${t.subject} — ${t.organizations?.name || 'unknown org'}`,
        html: `<p style="font-size:14px;line-height:1.6">${kind === 'reply' ? 'A customer replied on' : 'A new support ticket was raised'}: <strong>${t.subject}</strong> (${t.category}) from <strong>${t.organizations?.name || t.org_id}</strong>.</p><p style="font-size:14px">Answer it in Platform Control → Support.</p>`,
      }),
    });
    return res.status(200).json({ sent: true });
  } catch {
    return res.status(200).json({ sent: false });
  }
}
