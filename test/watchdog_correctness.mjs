// The watchdog must keep asking whether things are RIGHT, not just whether
// they are UP.
//
// On 2026-09-04 the status page reported 100% availability since 5 August and
// was telling the truth: 1,871 scheduled checks, zero failures, ever. On the
// same day the Nigeria-only payroll gate turned out to have been inert for
// months, HR letter references were never stored, and a login link could send
// a user to an attacker. Every one of those left the API answering and nothing
// throwing, so availability monitoring was structurally blind to them.
//
// Four checks were added for that class. Each was derived from a defect that
// actually happened, and each is pinned here — including that they stay
// service-role only, because a function that counts unguarded tables is a map
// of where to write if anyone else can call it.
//
// Run:  node test/watchdog_correctness.mjs
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(`${root}${p}`, 'utf8');

const sql = read('supabase/watchdog_correctness.sql');
const watchdog = read('client/api/watchdog.js');
const health = read('client/api/health.js');

let failures = 0;
const need = (ok, what, hint) => { if (!ok) { failures++; console.log(`x ${what}`); if (hint) console.log(`    ${hint}`); } };

// The check, the RPC that answers it, and the defect it exists because of.
const CHECKS = [
  ['watchdog_geo_signal_lost', 'geo_signal_lost', 'the payroll country gate was inert for months'],
  ['watchdog_letters_without_reference', 'letters_bad_reference', 'letter reference numbers were never stored'],
  ['watchdog_unguarded_tables', 'unguarded_tables', 'a new table shipped without the support write-block'],
];

for (const [fn, kind, why] of CHECKS) {
  need(new RegExp(`create or replace function public\\.${fn}\\(`).test(sql),
    `${fn}() is gone from the migration`, `it exists because ${why}`);
  need(new RegExp(`revoke execute on function public\\.${fn}\\(\\)[^\\n]*from[^\\n]*anon`).test(sql),
    `${fn}() is no longer revoked from anon`,
    'these functions describe where the gaps are; only the service role may ask');
  need(new RegExp(`grant execute on function public\\.${fn}\\(\\)[^\\n]*to service_role`).test(sql),
    `${fn}() is not granted to service_role, so the watchdog cannot run it`);
  need(watchdog.includes(`'${fn}'`),
    `the watchdog no longer calls ${fn}`,
    'the function existing but never being called is the same as not having it');
  need(watchdog.includes(`kind: '${kind}'`),
    `the watchdog no longer reports a '${kind}' finding`);
}

// The CSP check is plain JS against client_errors, no RPC.
need(/kind: 'csp_blocking'/.test(watchdog),
  'the watchdog no longer watches for CSP violations',
  'the policy is ENFORCING now, so violations are pages breaking in customers\' browsers');
need(/\[csp\]%/.test(watchdog), 'the CSP check no longer matches the [csp] tag written by track.js');

// Customer-facing vs internal is a deliberate split, not an accident. A status
// page that goes amber for an internal defect teaches people to ignore it.
need(/CUSTOMER_FACING_FINDINGS/.test(health),
  'health.js no longer distinguishes customer-facing findings from internal ones');
need(/'csp_blocking'/.test(health),
  'csp_blocking no longer counts as customer-facing',
  'an enforcing CSP that blocks something real breaks the page the visitor is on');
for (const internal of ['geo_signal_lost', 'letters_bad_reference', 'unguarded_tables']) {
  need(!new RegExp(`CUSTOMER_FACING_FINDINGS[^\\]]*'${internal}'`).test(health.replace(/\n/g, ' ')),
    `${internal} was promoted to customer-facing`,
    'it is serious, but a visitor loading the app right now is unaffected');
}

if (failures) { console.error(`\nFAILED, ${failures} problem(s) with the correctness watchdog`); process.exit(1); }
console.log(`Watchdog still asks all ${CHECKS.length + 1} correctness questions, service-role only. ALL PASSED`);
