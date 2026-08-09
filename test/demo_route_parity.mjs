// The demo has to answer every route the app calls.
//
// /try/<suite> is the version a prospect is handed, and demo.js is a hand-
// written router that nobody remembers to update. When the Projects work
// shipped, four endpoints existed in the real facade and in none of the demo,
// so the board, list, reports and task panel all threw for anyone clicking
// through the demo — while working perfectly for us.
//
// This does not typecheck the responses. It asserts that for every endpoint the
// suites call, demo.js has SOME matcher, which is the failure that actually
// happened.
//
// Run:  node test/demo_route_parity.mjs
import { readFileSync } from 'node:fs';

const demo = readFileSync(new URL('../client/src/api/demo.js', import.meta.url), 'utf8');

// path segment + the demo matcher that must exist for it.
// Add a row whenever a suite starts calling a new endpoint.
const REQUIRED = [
  { call: 'GET /projects/:id/statuses', needle: "seg[2] === 'statuses'" },
  { call: 'GET /projects/:id/deps', needle: "seg[2] === 'deps'" },
  { call: 'GET /projects/:id/blocked', needle: "seg[2] === 'blocked'" },
  { call: 'GET /projects/:id/tasks/:taskId/comments', needle: "seg[4] === 'comments'" },
  { call: 'GET /attendance/settings', needle: "seg[1] === 'settings'" },
  { call: 'GET /attendance/devices', needle: "seg[1] === 'devices'" },
  { call: 'POST /attendance/device-map', needle: "seg[1] === 'device-map'" },
  { call: 'GET /trade-docs/settings', needle: '/trade-docs/settings' },
  // The Task & Report suite loads tasks + stats in one Promise.all, so a
  // missing /taskstats blanked the whole page (caught live 2026-08-08).
  { call: 'GET /taskstats', needle: "route === 'GET /taskstats'" },
  { call: 'GET /taskreports', needle: "route === 'GET /taskreports'" },
  { call: 'POST /tasks', needle: "route === 'POST /tasks'" },
  { call: 'PATCH /tasks/:id', needle: "method === 'PATCH' && seg[0] === 'tasks' && seg.length === 2" },
  { call: 'DELETE /tasks/:id', needle: "method === 'DELETE' && seg[0] === 'tasks' && seg.length === 2" },
  { call: 'GET|POST /tasks/:id/reports', needle: "seg[0] === 'tasks' && seg[2] === 'reports'" },
  { call: 'GET|POST /tasks/:id/comments', needle: "seg[0] === 'tasks' && seg[2] === 'comments'" },
  // General ledger — a paid headline feature; a 404 here is a lost prospect.
  { call: 'GET /finance/ledger/accounts', needle: "seg[1] === 'ledger'" },
  { call: 'GET|POST /finance/ledger/entries', needle: "seg[2] === 'entries'" },
  { call: 'GET /finance/ledger/trial-balance', needle: "seg[2] === 'trial-balance'" },
  { call: 'GET /finance/ledger/pnl', needle: "seg[2] === 'pnl'" },
  { call: 'GET /finance/ledger/balance-sheet', needle: "seg[2] === 'balance-sheet'" },
  // Read by the sidebar footer on every page in the app.
  { call: 'GET /billing/balance', needle: "route === 'GET /billing/balance'" },
  { call: 'GET /billing/transactions', needle: "route === 'GET /billing/transactions'" },
];

let failures = 0;
for (const { call, needle } of REQUIRED) {
  const ok = demo.includes(needle);
  if (!ok) {
    failures++;
    console.log(`✗ ${call}\n    demo.js has no matcher containing: ${needle}`);
  }
}

// The specific ordering bug that bit: a matcher on seg[2] === 'tasks' with no
// length check swallows /projects/:id/tasks/:taskId/comments and returns the
// task list instead, so the caller gets undefined rather than an error.
const tasksMatcher = demo.indexOf("seg[2] === 'tasks' && seg.length === 3");
const looseTasks = demo.indexOf("seg[2] === 'tasks')");
const commentsMatcher = demo.indexOf("seg[4] === 'comments'");
if (tasksMatcher === -1 && looseTasks !== -1) {
  failures++;
  console.log("✗ demo.js matches seg[2] === 'tasks' without a length check, so it swallows nested task routes");
}
if (commentsMatcher !== -1 && tasksMatcher !== -1 && commentsMatcher > tasksMatcher) {
  failures++;
  console.log('✗ the comments matcher sits AFTER the generic tasks matcher, so it can never be reached');
}

if (failures) {
  console.error(`\nFAILED, ${failures} route(s) the app calls that the demo cannot answer`);
  process.exit(1);
}
console.log(`Demo answers all ${REQUIRED.length} checked routes, and nested task routes are reachable. ALL PASSED`);
