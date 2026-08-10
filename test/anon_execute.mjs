// Nothing privileged is callable without a session.
//
// A SECURITY DEFINER function bypasses RLS by design, so the only thing
// standing between it and the internet is who holds EXECUTE. 160 of them were
// executable by `anon` — the role PostgREST uses for a request with no session,
// reachable by anyone holding the publishable key, which ships in the browser.
//
// They were probed as anon before this was written and they returned nothing:
// each scopes internally on my_org_id()/auth.uid(), both null without a
// session. So this closed a MISSING LAYER rather than an open door. It still
// matters, because the whole set was one forgotten `if not is_manager() then
// raise` away from being an open door, and that check lives in 160 separate
// function bodies while a grant is one line.
//
// The trap this guards against is subtle enough to be worth spelling out:
// Postgres grants EXECUTE to PUBLIC on every new function, AND Supabase adds a
// default-privileges rule granting EXECUTE to anon. So `revoke ... from
// public` — which looks like the careful thing to write — leaves the anon
// grant in place. A function can therefore be born open no matter how
// carefully its migration was written.
//
// Run:  DB_URL=postgres://… node test/anon_execute.mjs
import pg from 'pg';

const DB_URL = process.env.DB_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.log('~ no DB_URL: skipped (runs in the live CI job)');
  process.exit(0);
}

// Functions that exist to be called by a visitor with no account. Adding a
// name here asserts it is safe unauthenticated: it must validate its own token
// or input, and must never trust an argument to say which organisation the
// caller belongs to.
const PUBLIC_API = new Set([
  'public_decide_offer',
  'public_place_order',
  'public_submit_application',
  'public_submit_contact_message',
  'public_submit_lead',
]);

// Functions no browser calls: cron sweeps, platform administration, and
// helpers invoked from inside other functions. They reach the database under
// the service key, so `authenticated` must NOT hold them — and this list
// exists because the first version of the revoke migration granted
// authenticated to everything it touched, handing every logged-in user
// platform_delete_org among others. Keep it in step with the server_only array
// in supabase/revoke_anon_execute.sql.
const SERVER_ONLY = new Set([
  'advance_billing_lifecycle',
  'apply_confirmed_renewal',
  'attendance_apply_punch',
  'generate_recurring_invoices',
  'platform_delete_org',
  'queue_notification',
  'seed_ledger_accounts',
  'seed_org_leave_defaults',
  'visitors_autoclose_all',
  'watchdog_autoclose_all',
]);

const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

// Only VOLATILE, non-trigger functions are in scope.
//
// STABLE/IMMUTABLE predicates (is_hr_manager, same_org, has_payroll_suite) are
// deliberately excluded: they are referenced inside RLS policy expressions,
// which are evaluated as the CALLING role, so revoking EXECUTE would make
// every policy mentioning one throw for anon — taking down the public
// storefront and the public invoice page. They return false for anon and
// disclose nothing.
//
// Trigger functions are excluded because EXECUTE is not consulted when a
// trigger fires, so the grant is irrelevant either way.
const { rows: exposed } = await client.query(`
  select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.provolatile = 'v'
    and p.prorettype <> 'trigger'::regtype::oid
    and has_function_privilege('anon', p.oid, 'execute')
  order by p.proname`);

// The reverse failure matters just as much: revoking too widely silently
// breaks signed-in users, and nobody notices until someone clicks the button.
const { rows: brokenForUsers } = await client.query(`
  select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.provolatile = 'v'
    and p.prorettype <> 'trigger'::regtype::oid
    and not has_function_privilege('authenticated', p.oid, 'execute')
  order by p.proname`);

// And the public API has to keep working, or the storefront goes dark.
const { rows: publicApi } = await client.query(`
  select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_ok
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any($1)`, [[...PUBLIC_API]]);

// Which privileged functions authenticated CAN execute — needed to catch a
// server-only one drifting back into reach.
const { rows: authedRows } = await client.query(`
  select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef and p.provolatile = 'v'
    and p.prorettype <> 'trigger'::regtype::oid
    and has_function_privilege('authenticated', p.oid, 'execute')`);
const exposedToAuthed = new Set(authedRows.map((r) => r.proname));

await client.end();

const problems = [];

for (const { proname, args } of exposed) {
  if (PUBLIC_API.has(proname)) continue;
  problems.push(`${proname}(${args}) is callable by anon.\n      It bypasses RLS and changes data, and anyone with the publishable key can reach it.\n      Add to supabase/revoke_anon_execute.sql's loop (re-running it is enough), or if it is genuinely meant to be public, add it to PUBLIC_API here and say why.`);
}
for (const { proname } of brokenForUsers) {
  // Server-only functions are SUPPOSED to be out of reach of authenticated.
  if (SERVER_ONLY.has(proname)) continue;
  problems.push(`${proname} is not executable by 'authenticated' — signed-in users cannot call it.\n      Revoking from PUBLIC removes it from everyone; the revoke migration must grant it back to authenticated.`);
}
// And the inverse, which is the mistake that actually happened: a server-only
// function quietly becoming callable by every logged-in user.
for (const name of SERVER_ONLY) {
  if (!brokenForUsers.some((r) => r.proname === name) && exposedToAuthed.has(name)) {
    problems.push(`${name} is callable by 'authenticated'. It runs under the service key from a cron sweep or a platform-admin route, so no ordinary logged-in user should reach it.`);
  }
}
for (const { proname, anon_ok: anonOk } of publicApi) {
  if (!anonOk) {
    problems.push(`${proname} is in PUBLIC_API but anon can no longer execute it — the unauthenticated page that calls it is broken.`);
  }
}

if (problems.length) {
  console.error('Anonymous execute problems:\n');
  for (const p of problems) console.error(`  ✗ ${p}\n`);
  console.error(`FAILED, ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`No privileged function is callable without a session; all ${publicApi.length} public endpoints still are. ALL PASSED`);
