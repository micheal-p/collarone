// Guard test: a PINNED TOOL must never become billable.
//
// Team Chat (and anything else pinned) is included free with every workspace.
// The renewal engine prices an org off its DISTINCT SUITE GRANT KEYS —
// request_renewal() counts `distinct g->>'key'` across profiles.suites
// (supabase/billing_best_tier.sql) and feeds that count to best_plan_kobo().
// So a pinned tool turns into money the moment its key can appear either
//   (a) in the SUITES catalog, or
//   (b) in any list an admin can grant from.
// Adding a Chat tile to the launcher made that a live risk — this test is the
// tripwire. It runs in CI with no secrets; with DATABASE_URL it also checks
// that no real grant has leaked into production data.
//
// Run:  node test/pinned_tools_not_priced.mjs
//       DATABASE_URL='postgres://…' node test/pinned_tools_not_priced.mjs
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures++;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
};

// ---- Load the config without a bundler: it's plain ESM. ---------------------
const cfg = await import(new URL('client/src/config/suites.js', root).href);
const { PINNED_TOOLS, SUITES, MULTI_TENANT_SAFE_SUITES, BULK_SAFE_SUITES } = cfg;

const pinnedKeys = PINNED_TOOLS.map((t) => t.key);
console.log(`Pinned tools: ${pinnedKeys.join(', ') || '(none)'}\n`);
check('at least one pinned tool is declared', pinnedKeys.length > 0);

// ---- 1) Never in the priced catalog ---------------------------------------
for (const k of pinnedKeys) {
  check(`'${k}' is not in SUITES (the priced catalog)`,
    !SUITES.some((s) => s.key === k),
    'a pinned tool in SUITES is billed and can push the customer up a tier');
}

// ---- 2) Never grantable — a grant is what the renewal counts ---------------
for (const k of pinnedKeys) {
  check(`'${k}' is not in MULTI_TENANT_SAFE_SUITES`, !MULTI_TENANT_SAFE_SUITES.includes(k));
  check(`'${k}' is not in BULK_SAFE_SUITES`, !BULK_SAFE_SUITES.includes(k));
}

// ---- 3) Never in the server-side mirrors ----------------------------------
// admin.js holds its own BULK_SAFE set, and the Postgres guardrails hold
// safe_suites whitelists. Grep them as text — they are hand-mirrored lists,
// which is exactly the kind of thing that drifts.
const adminJs = read('client/api/admin.js');
const bulkSafeLine = adminJs.match(/const BULK_SAFE = new Set\(\[([^\]]*)\]\)/);
check('admin.js BULK_SAFE set was found', !!bulkSafeLine);
if (bulkSafeLine) {
  for (const k of pinnedKeys) {
    check(`'${k}' is not in admin.js BULK_SAFE`, !bulkSafeLine[1].includes(`'${k}'`));
  }
}

// ---- 4) The pinned route is a real route, not a suite route ---------------
const app = read('client/src/App.jsx');
for (const t of PINNED_TOOLS) {
  check(`'${t.key}' points at a real route (${t.path})`,
    !t.path.startsWith('/suite/') && app.includes(`path="${t.path}"`),
    'a /suite/<key> path would route through the suite access gate');
}

// ---- 5) Live data: no pinned key has ever been granted --------------------
if (process.env.DATABASE_URL) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select distinct g->>'key' as key
         from public.profiles p, jsonb_array_elements(coalesce(p.suites, '[]'::jsonb)) g
        where g->>'key' = any($1::text[])`, [pinnedKeys]);
    check('no profile in production holds a pinned-tool grant',
      rows.length === 0,
      rows.length ? `found grants: ${rows.map((r) => r.key).join(', ')} — these ARE being billed` : '');
  } finally {
    await client.end();
  }
} else {
  console.log('  · DATABASE_URL not set — skipped the live grant check');
}

console.log('');
if (failures) {
  console.error(`FAILED — ${failures} check(s). A free tool is leaking into the price.`);
  process.exit(1);
}
console.log('Pinned tools are not priced. ALL PASSED');
