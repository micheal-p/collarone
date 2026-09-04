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
  // Which checks actually completed. Without this, a check that THREW and a
  // check that PASSED are indistinguishable — both produce no finding — so a
  // silently broken check looks like good news forever. This is the same
  // fail-silent shape as a guard that skips on an empty value.
  const ran = { ok: [], failed: [] };
  const since = (mins) => new Date(Date.now() - mins * 60000).toISOString();

  // 1. Signup failures in the last 30 minutes — customer-facing, the worst
  //    kind of silent. Two or more = something is actively losing prospects.
  try {
    const { count } = await admin.from('client_errors')
      .select('id', { count: 'exact', head: true })
      .eq('path', '/signup').is('resolved_at', null).gte('occurred_at', since(30));
    if ((count || 0) >= 2) findings.push({ kind: 'signup_failures', count, detail: `${count} signup failures in 30min — check app errors for who and why` });
    ran.ok.push('signup_failures');
  } catch (e) { ran.failed.push({ kind: 'signup_failures', error: String((e && e.message) || e).slice(0, 200) }); }

  // 2. Dangling auth identities — the poisoned-email class. Any is too many.
  try {
    const { data: n } = await admin.rpc('watchdog_dangling_identities');
    if ((n || 0) > 0) findings.push({ kind: 'dangling_identities', count: n, detail: `${n} auth identit${n > 1 ? 'ies' : 'y'} pointing at deleted users — those emails cannot sign up` });
    ran.ok.push('dangling_identities');
  } catch (e) { ran.failed.push({ kind: 'dangling_identities', error: String((e && e.message) || e).slice(0, 200) }); }

  // 3. Orphan auth users (no profile, not poster stubs) — half-finished
  //    signups whose owners are told "already registered".
  try {
    const { data: n } = await admin.rpc('watchdog_orphan_users');
    if ((n || 0) > 0) findings.push({ kind: 'orphan_users', count: n, detail: `${n} auth user${n > 1 ? 's' : ''} with no profile — stuck signups` });
    ran.ok.push('orphan_users');
  } catch (e) { ran.failed.push({ kind: 'orphan_users', error: String((e && e.message) || e).slice(0, 200) }); }

  // 4. Support tickets waiting on Collarone for more than 24 hours.
  try {
    const { count } = await admin.from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open').lt('updated_at', since(24 * 60));
    if ((count || 0) > 0) findings.push({ kind: 'stale_tickets', count, detail: `${count} support ticket${count > 1 ? 's' : ''} waiting on us for over 24h` });
    ran.ok.push('stale_tickets');
  } catch (e) { ran.failed.push({ kind: 'stale_tickets', error: String((e && e.message) || e).slice(0, 200) }); }

  // 5. Heal, not just observe: close stale shifts for every org on the clock.
  try {
    const { data: closed } = await admin.rpc('watchdog_autoclose_all');
    if ((closed || 0) > 0) findings.push({ kind: 'shifts_autoclosed', count: closed, detail: `${closed} forgotten shift${closed > 1 ? 's' : ''} auto-closed for review` });
    ran.ok.push('shifts_autoclosed');
  } catch (e) { ran.failed.push({ kind: 'shifts_autoclosed', error: String((e && e.message) || e).slice(0, 200) }); }

  // 5b. Same for visitors nobody signed out. "Who is still in the building"
  // is a fire-safety answer, and it was wrong for every visit since launch
  // because reception never closes them at the end of the day.
  try {
    const { data: out } = await admin.rpc('visitors_autoclose_all');
    if ((out || 0) > 0) findings.push({ kind: 'visits_autoclosed', count: out, detail: `${out} visitor${out > 1 ? 's' : ''} signed out automatically after 12 hours` });
    ran.ok.push('visits_autoclosed');
  } catch (e) { ran.failed.push({ kind: 'visits_autoclosed', error: String((e && e.message) || e).slice(0, 200) }); }

  // 6. Deploy failures reported by the pipeline in the last 6 hours.
  try {
    const { count } = await admin.from('client_errors')
      .select('id', { count: 'exact', head: true })
      .eq('path', '/deploy').is('resolved_at', null).gte('occurred_at', since(6 * 60));
    if ((count || 0) > 0) findings.push({ kind: 'deploy_failures', count, detail: `${count} deploy failure${count > 1 ? 's' : ''} reported in 6h — prod may be behind main` });
    ran.ok.push('deploy_failures');
  } catch (e) { ran.failed.push({ kind: 'deploy_failures', error: String((e && e.message) || e).slice(0, 200) }); }

  /* ---- correctness, not availability -------------------------------------
     Checks 1 to 6 above ask whether things are WORKING. The four below ask
     whether they are RIGHT, which is a different question and the one that
     went unasked for months.

     On 2026-09-04 the status page reported 100% availability since 5 August,
     truthfully: 1,871 scheduled checks, zero failures, ever. On the same day
     the Nigeria-only payroll gate turned out to have been doing nothing for
     months, letter reference numbers were never being stored, and a login link
     could send a user to an attacker's site. Every one of those left the API
     answering and nothing throwing. Availability monitoring cannot see them.

     Each check below is derived from a defect that actually happened. A check
     nobody has ever needed is one that will eventually cry wolf and be
     ignored. */

  // 7. The edge stopped telling us the caller's country.
  //    This is the payroll bug's exact shape: the gate reads
  //    `if (country && country !== 'NG')`, so an unknown country skips it
  //    entirely. When the header stopped arriving the rule silently stopped
  //    applying — while still reporting to the UI that it had been enforced.
  //    Returns 0 when there is no traffic to judge by, so a quiet night is
  //    never mistaken for a broken edge.
  try {
    const { data: n } = await admin.rpc('watchdog_geo_signal_lost');
    if ((n || 0) > 0) findings.push({ kind: 'geo_signal_lost', count: n, detail: `${n} page views in 24h and not one carried a country — every geo rule (incl. the payroll gate) is currently inert` });
    ran.ok.push('geo_signal_lost');
  } catch (e) { ran.failed.push({ kind: 'geo_signal_lost', error: String((e && e.message) || e).slice(0, 200) }); }

  // 8. Issued letters with no reference, or a duplicate one. These go to banks
  //    and embassies; both faults are invisible until somebody outside the
  //    company rejects the document.
  try {
    const { data: n } = await admin.rpc('watchdog_letters_without_reference');
    if ((n || 0) > 0) findings.push({ kind: 'letters_bad_reference', count: n, detail: `${n} issued letter${n > 1 ? 's' : ''} with a missing or duplicated reference number` });
    ran.ok.push('letters_bad_reference');
  } catch (e) { ran.failed.push({ kind: 'letters_bad_reference', error: String((e && e.message) || e).slice(0, 200) }); }

  // 9. A tenant table a support session could write to. The write-block is
  //    attached by a sweep over existing tables, so anything created by a later
  //    migration is born without it and nothing says so.
  try {
    const { data: n } = await admin.rpc('watchdog_unguarded_tables');
    if ((n || 0) > 0) findings.push({ kind: 'unguarded_tables', count: n, detail: `${n} tenant table${n > 1 ? 's are' : ' is'} missing the support write-block — re-run supabase/support_readonly_enforcement.sql` });
    ran.ok.push('unguarded_tables');
  } catch (e) { ran.failed.push({ kind: 'unguarded_tables', error: String((e && e.message) || e).slice(0, 200) }); }

  // 10. The CSP is enforcing now, so a burst of violations means the policy is
  //     actively blocking something real in customers' browsers. A threshold,
  //     not any single one: one odd extension should not raise an alarm.
  try {
    const { count } = await admin.from('client_errors')
      .select('id', { count: 'exact', head: true })
      .like('message', '[csp]%').gte('occurred_at', since(30));
    if ((count || 0) >= 5) findings.push({ kind: 'csp_blocking', count, detail: `${count} CSP violations in 30min — the enforcing policy is blocking something customers use; check the blocked URI and allow it or roll the policy back to Report-Only` });
    ran.ok.push('csp_blocking');
  } catch (e) { ran.failed.push({ kind: 'csp_blocking', error: String((e && e.message) || e).slice(0, 200) }); }

  // Record the run, always — a run with zero findings is the good news.
  try {
    await admin.from('watchdog_runs').insert({ findings, findings_count: findings.length, checks_ran: ran });
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

  return res.status(200).json({ ran: true, findings, checks: ran });
}
