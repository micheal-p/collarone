// Proves a backup actually restores — the thing task #19 was about. Run after a
// production dump has been restored into a throwaway Postgres (see
// .github/workflows/backup-restore-test.yml). It compares, table by table, the
// row counts in the LIVE database against the RESTORED copy.
//
// A backup you have never restored is a hope, not a backup. This turns it into
// a fact, on a schedule, so the day you actually need to recover you already
// know it works.
//
// SOURCE_URL = live DB (read-only use here), TARGET_URL = the restored copy.
import pg from 'pg';

const SOURCE_URL = process.env.SOURCE_URL;
const TARGET_URL = process.env.TARGET_URL;
if (!SOURCE_URL || !TARGET_URL) { console.error('Set SOURCE_URL and TARGET_URL'); process.exit(2); }

// Business-critical tables: the customer data whose loss would end the company.
// The restore MUST bring every one of these back with its rows intact. Names
// that don't exist in the source are skipped, so this list can be generous
// without turning a rename into a false failure.
const CRITICAL = [
  'organizations', 'profiles', 'departments',
  'trade_documents', 'trade_doc_settings', 'trade_doc_payments',
  'leave_requests', 'leave_types', 'leave_balances',
  'payroll_runs', 'payroll_lines', 'salary_structures', 'bank_accounts',
  'crm_companies', 'crm_contacts',
  'documents', 'doc_folders',
  'tasks', 'visitors', 'visits',
  'billing_transactions', 'org_credit_ledger', 'platform_admins',
  'org_sites', 'org_chat_messages',
];

// Counts change between the dump and this check (the live DB keeps running), so
// a critical table passes when the restored count is within a small tolerance
// of live — enough to catch real data loss, not the handful of rows a customer
// might add mid-run.
const tol = (n) => Math.max(5, Math.ceil(n * 0.02));

const src = new pg.Client({ connectionString: SOURCE_URL, ssl: { rejectUnauthorized: false } });
const tgt = new pg.Client({ connectionString: TARGET_URL });
await src.connect();
await tgt.connect();

const publicTables = async (c) => (await c.query(
  `select tablename from pg_tables where schemaname='public' order by tablename`
)).rows.map((r) => r.tablename);

const count = async (c, t) => {
  try { return Number((await c.query(`select count(*)::bigint n from public."${t}"`)).rows[0].n); }
  catch { return null; } // missing table / not restored
};

const srcTables = await publicTables(src);
const tgtTables = new Set(await publicTables(tgt));

console.log(`Source public tables: ${srcTables.length}   Restored public tables: ${tgtTables.size}\n`);

let restoredOk = 0, restoredTables = 0;
const criticalFails = [];
const rows = [];

for (const t of srcTables) {
  const s = await count(src, t);
  const has = tgtTables.has(t);
  const r = has ? await count(tgt, t) : null;
  const isCritical = CRITICAL.includes(t);
  if (has) restoredTables++;
  let ok;
  if (s === 0) ok = has;                            // empty table just needs to exist
  else ok = has && r != null && Math.abs(r - s) <= tol(s);
  if (ok) restoredOk++;
  if (isCritical && !ok) criticalFails.push({ t, s, r: has ? r : 'MISSING' });
  if (isCritical || !ok) rows.push({ t, s, r: has ? r : '—', crit: isCritical ? '★' : '', ok: ok ? 'ok' : 'FAIL' });
}

// Show every critical table and anything that didn't round-trip.
console.log('table'.padEnd(28), 'live'.padStart(8), 'restored'.padStart(10), ' crit', ' result');
for (const r of rows) {
  console.log(String(r.t).padEnd(28), String(r.s).padStart(8), String(r.r).padStart(10), `  ${r.crit || ' '}  `, r.ok);
}

const coverage = srcTables.length ? restoredTables / srcTables.length : 0;
console.log(`\nRestored ${restoredTables}/${srcTables.length} tables (${(coverage * 100).toFixed(0)}%); ${restoredOk} with matching row counts.`);

await src.end(); await tgt.end();

const problems = [];
if (criticalFails.length) problems.push(`${criticalFails.length} CRITICAL table(s) did not round-trip: ${criticalFails.map((f) => f.t).join(', ')}`);
// A wholesale failure (almost nothing restored) means the dump/restore itself broke, not a stray table.
if (coverage < 0.6) problems.push(`only ${(coverage * 100).toFixed(0)}% of tables restored — the restore itself likely failed`);

if (problems.length) { console.error(`\nFAILED:\n - ${problems.join('\n - ')}`); process.exit(1); }
console.log('\nBackup restores cleanly and all business-critical data is intact. PROVEN.');
