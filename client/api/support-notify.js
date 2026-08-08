// Support-ticket lifecycle email. Best-effort by design: the ticket (or reply,
// or status change) is already safely in the database when this runs, so a
// missing key or a provider outage costs the mail, never the record.
//
// Four moments, and WHO each one is for:
//   new           customer raises a ticket  → team gets "answer this",
//                                             customer gets "we have it" ack
//   reply         customer replies          → team
//   platform_reply Collarone answers        → customer ("we replied")
//   resolved      ticket marked resolved    → customer ("this is closed")
//
// Recipients are looked up server-side from the ticket itself — the caller
// never chooses an address, so this can't be turned into an open relay.
import { createClient } from '@supabase/supabase-js';
import { allow, LIMIT_MESSAGE } from './_lib/rateLimit.js';
import { emailEnabled, sendMail, wrap, esc } from './_lib/email.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TEAM_EMAIL = process.env.SUPPORT_EMAIL || 'hello@collarone.app';

const KINDS = ['new', 'reply', 'platform_reply', 'resolved'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  if (!SERVICE_KEY) return res.status(200).json({ sent: false });
  // Each call can become an email — bucket it so nobody (including a tenant
  // hammering their own ticket) can flood an inbox from one IP.
  if (!allow(`${req.ip}:support-notify`, { capacity: 3, refillPerSec: 1 / 20 })) {
    return res.status(429).json({ message: LIMIT_MESSAGE });
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { ticketId } = body;
  const kind = KINDS.includes(body.kind) ? body.kind : 'new';
  if (!ticketId) return res.status(400).json({ message: 'ticketId required' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: t } = await admin.from('support_tickets')
    .select('id, subject, category, status, org_id, created_by, organizations(name)')
    .eq('id', ticketId).maybeSingle();
  if (!t) return res.status(404).json({ message: 'No such ticket.' });

  if (!emailEnabled()) return res.status(200).json({ sent: false, reason: 'email-off' });

  // The person who raised it — the only customer address this endpoint can reach.
  let raiser = null;
  if (t.created_by) {
    const { data } = await admin.from('profiles').select('name, email').eq('id', t.created_by).maybeSingle();
    raiser = data || null;
  }

  // Ticket subjects and org names are user input headed into email HTML.
  const subj = esc(t.subject).slice(0, 140);
  const orgName = esc(t.organizations?.name || 'unknown org');
  const firstName = esc((raiser?.name || '').split(' ')[0] || 'there');
  const p = (s) => `<p style="font-size:14px;line-height:1.6">${s}</p>`;

  const jobs = [];
  if (kind === 'new') {
    jobs.push({
      to: TEAM_EMAIL,
      subject: `[Support] New ticket: ${t.subject} — ${t.organizations?.name || 'unknown org'}`.slice(0, 180),
      html: wrap('New support ticket', p(`<strong>${subj}</strong> (${esc(t.category)}) from <strong>${orgName}</strong>.`) + p('Answer it in Platform Control → Support.')),
    });
    if (raiser?.email) {
      jobs.push({
        to: raiser.email,
        subject: `We got your message: ${t.subject}`.slice(0, 180),
        html: wrap('We have your ticket', p(`Hi ${firstName}, thanks for writing in — we have your ticket <strong>${subj}</strong> and someone on the Collarone team will reply here.`) + p('You can follow the conversation any time under Support in your workspace. Just reply there and we will see it.')),
      });
    }
  } else if (kind === 'reply') {
    jobs.push({
      to: TEAM_EMAIL,
      subject: `[Support] Reply on: ${t.subject} — ${t.organizations?.name || 'unknown org'}`.slice(0, 180),
      html: wrap('Customer replied', p(`A customer replied on <strong>${subj}</strong> (${esc(t.category)}) from <strong>${orgName}</strong>.`) + p('Answer it in Platform Control → Support.')),
    });
  } else if (kind === 'platform_reply' && raiser?.email) {
    jobs.push({
      to: raiser.email,
      subject: `Collarone replied: ${t.subject}`.slice(0, 180),
      html: wrap('We replied to your ticket', p(`Hi ${firstName}, we have answered your ticket <strong>${subj}</strong>.`) + p('Open Support in your workspace to read it and reply.')),
    });
  } else if (kind === 'resolved' && raiser?.email) {
    jobs.push({
      to: raiser.email,
      subject: `Resolved: ${t.subject}`.slice(0, 180),
      html: wrap('Your ticket is resolved', p(`Hi ${firstName}, your ticket <strong>${subj}</strong> has been marked resolved.`) + p('If it is not actually sorted, reply on the ticket in your workspace and it reopens — no need to start a new one.')),
    });
  }

  if (!jobs.length) return res.status(200).json({ sent: false, reason: 'no-recipient' });

  // One failing recipient must not cancel the other.
  const results = await Promise.allSettled(jobs.map((j) => sendMail(j)));
  return res.status(200).json({ sent: results.some((r) => r.status === 'fulfilled') });
}
