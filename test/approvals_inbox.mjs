// The approvals inbox must stay a VIEW over the suites, never its own authority.
//
// It shows leave requests, purchase requests and expense claims from three
// different suites on one screen. The tempting way to build that is to query
// the tables directly and decide who may approve what. That would create a
// SECOND answer to "who is an approver", and the second answer is the one that
// drifts — a role added in the Leave suite would silently not apply here, and
// the failure mode is someone approving what they should not, on a screen that
// looks official.
//
// So the rule this pins: every source calls the same function its own suite
// calls, and the database's row-level security decides what comes back.
//
// Run:  node test/approvals_inbox.mjs
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(`${root}${p}`, 'utf8');

const page = read('client/src/pages/Approvals.jsx');
const app = read('client/src/App.jsx');
const layout = read('client/src/components/AppLayout.jsx');

let failures = 0;
const need = (ok, what, hint) => { if (!ok) { failures++; console.log(`x ${what}`); if (hint) console.log(`    ${hint}`); } };

// 1. It goes through each suite's own api module.
for (const [mod, why] of [
  ['../suites/leave/leaveApi.js', 'leave'],
  ['../suites/procurement/procurementApi.js', 'procurement'],
  ['../suites/finance/financeApi.js', 'finance expenses'],
]) {
  need(page.includes(mod), `Approvals no longer imports the ${why} api module`,
    'each source must call the suite it belongs to, so permissions stay in one place');
}

// 2. It never reaches past them to the tables, and never rules on permissions
//    itself. Either would put a second authority next to the database's.
need(!/supabase\s*\.\s*from\(/.test(page),
  'Approvals queries a table directly',
  'go through the suite api module so RLS applies, do not re-implement the query here');
for (const forbidden of ['is_leave_approver', "role ===", 'isApprover', 'canApprove']) {
  need(!page.includes(forbidden),
    `Approvals decides permissions itself (found "${forbidden}")`,
    'whether someone may approve is the database\'s answer, not this page\'s');
}

// 3. One missing suite is a missing section, not a broken page. An org without
//    Procurement must still see its leave approvals.
need(/Promise\.allSettled\(/.test(page),
  'Approvals uses Promise.all rather than allSettled',
  'one source rejecting (no suite, or not an approver) must not blank the whole screen');

// 4. Reachable. A page nobody can navigate to is the same as no page, and this
//    is the exact way the Book a demo CTA could have quietly disappeared.
need(/path="\/approvals"/.test(app), 'App.jsx has no /approvals route');
need(/<ProtectedRoute>\s*<Approvals \/>/.test(app.replace(/\s+/g, ' ')) || /Approvals \/>/.test(app),
  'the /approvals route no longer renders Approvals behind ProtectedRoute');
need(/to="\/approvals"/.test(layout),
  'the sidebar has no link to /approvals, so nobody will find it');

if (failures) { console.error(`\nFAILED, ${failures} problem(s) with the approvals inbox`); process.exit(1); }
console.log('Approvals is a view over the suites, degrades per-source, and is reachable. ALL PASSED');
