// The watchdog run: called every 30 minutes by server/index.js (and never by
// the public — loopback only). Each check answers one question a founder
// should never have to ask manually. Findings are recorded three ways:
// the run row (full history), client_errors (the app-errors inbox, deduped to
// once per 6h per kind), and the health endpoint reads the latest run so
// customer-affecting findings can flip public status.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  // Loopback only: the interval in server/index.js calls this directly on the
  // Express port. Anything arriving through nginx carries a public source.
  const src = req.socket?.remoteAddress || '';
  if (!(src === '127.0.0.1' || src === '::1' || src === '::ffff:127.0.0.1')) {
    return res.status(404).json({ message: 'Not found' });
  }
  if (!SERVICE_KEY) return res.status(200).json({ ran: false });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const findings = [];
  const since = (mins) => new Date(Date.now() - mins * 60000).toISOString();

  // 1. Signup failures in the last 30 minutes — customer-facing, the worst
  //    kind of silent. Two or more = something is actively losing prospects.
  try {
    const { count } = await admin.from('client_errors')
      .select('id', { count: 'exact', head: true })
      .eq('path', '/signup').is('resolved_at', null).gte('occurred_at', since(30));
    if ((count || 0) >= 2) findings.push({ kind: 'signup_failures', count, detail: `${count} signup failures in 30min — check app errors for who and why` });
  } catch { /* each check independent */ }

  // 2. Dangling auth identities — the poisoned-email class. Any is too many.
  try {
    const { data: n } = await admin.rpc('watchdog_dangling_identities');
    if ((n || 0) > 0) findings.push({ kind: 'dangling_identities', count: n, detail: `${n} auth identit${n > 1 ? 'ies' : 'y'} pointing at deleted users — those emails cannot sign up` });
  } catch { /* independent */ }

  // 3. Orphan auth users (no profile, not poster stubs) — half-finished
  //    signups whose owners are told "already registered".
  try {
    const { data: n } = await admin.rpc('watchdog_orphan_users');
    if ((n || 0) > 0) findings.push({ kind: 'orphan_users', count: n, detail: `${n} auth user${n > 1 ? 's' : ''} with no profile — stuck signups` });
  } catch { /* independent */ }

  // 4. Support tickets waiting on Collarone for more than 24 hours.
  try {
    const { count } = await admin.from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open').lt('updated_at', since(24 * 60));
    if ((count || 0) > 0) findings.push({ kind: 'stale_tickets', count, detail: `${count} support ticket${count > 1 ? 's' : ''} waiting on us for over 24h` });
  } catch { /* independent */ }

  // 5. Heal, not just observe: close stale shifts for every org on the clock.
  try {
    const { data: closed } = await admin.rpc('watchdog_autoclose_all');
    if ((closed || 0) > 0) findings.push({ kind: 'shifts_autoclosed', count: closed, detail: `${closed} forgotten shift${closed > 1 ? 's' : ''} auto-closed for review` });
  } catch { /* independent */ }

  // 6. Deploy failures reported by the pipeline in the last 6 hours.
  try {
    const { count } = await admin.from('client_errors')
      .select('id', { count: 'exact', head: true })
      .eq('path', '/deploy').is('resolved_at', null).gte('occurred_at', since(6 * 60));
    if ((count || 0) > 0) findings.push({ kind: 'deploy_failures', count, detail: `${count} deploy failure${count > 1 ? 's' : ''} reported in 6h — prod may be behind main` });
  } catch { /* independent */ }

  // Record the run, always — a run with zero findings is the good news.
  try {
    await admin.from('watchdog_runs').insert({ findings, findings_count: findings.length });
  } catch { /* the health dead-man will show the gap */ }

  // Escalate NEW findings to the app-errors inbox, once per kind per 6h —
  // visible where the founder already looks, without drumbeat spam.
  for (const f of findings) {
    if (f.kind === 'shifts_autoclosed') continue; // healed, not a fault
    try {
      const { count } = await admin.from('client_errors')
        .select('id', { count: 'exact', head: true })
        .like('message', `watchdog [${f.kind}]%`).gte('occurred_at', since(6 * 60));
      if (!count) {
        await admin.from('client_errors').insert({ message: `watchdog [${f.kind}]: ${f.detail}`.slice(0, 500), path: '/watchdog' });
      }
    } catch { /* independent */ }
  }

  return res.status(200).json({ ran: true, findings });
}
