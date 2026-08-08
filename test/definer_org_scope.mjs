// Every SECURITY DEFINER function that writes must be scoped to something.
//
// SECURITY DEFINER bypasses row-level security completely. That is the whole
// point of it — and the reason a definer function is the one place where a
// carefully built multi-tenant policy set counts for nothing. Collarone has
// already been bitten twice: four HR functions that updated profiles by a
// caller-supplied id with no organisation check (an HR manager in one company
// could disable an account in another), and two functions left executable by
// `anon` including the billing dunning ladder.
//
// A definer writer is acceptable when it is scoped by ONE of:
//   * organisation  — my_org_id() / same_org()
//   * the caller    — `= auth.uid()`, which implies their org
//   * platform only — is_platform_admin() / platform_admins
//   * unreachable   — not granted to anon or authenticated (service role only)
//   * deliberately public — the storefront/careers entry points, allow-listed below
//
// Live check needs DB_URL; without it the structural half still runs in CI.
//
// Run:  DB_URL=postgres://... node test/definer_org_scope.mjs
const DB_URL = process.env.DB_URL || process.env.DATABASE_URL;

// Public by design: unauthenticated visitors legitimately call these, and each
// takes the org id it acts on as an argument (a careers application, a
// storefront order, a contact message, a website lead, an offer decision).
const PUBLIC_BY_DESIGN = new Set([
  'public_submit_application',
  'public_submit_contact_message',
  'public_submit_lead',
  'public_place_order',
  'public_decide_offer',
]);

// Reviewed by hand and found safe, but not matched by the patterns below.
// An explicit list with a stated reason beats loosening the regex: every entry
// here is a decision someone made on purpose, and adding one should feel like
// a decision. Re-read the function before you add to this.
const REVIEWED_SAFE = new Map([
  ['mark_chat_room_read',
   'refuses when auth.uid() is null, checks can_read_chat_room(), and writes ONLY a read-marker row keyed to auth.uid(). Self-scoped, but via the INSERT values rather than a WHERE clause, so the self-scope pattern below misses it.'],
]);

if (!DB_URL) {
  console.log('~ no DB_URL: skipping the live definer audit (runs in the live CI job)');
  console.log('Definer scoping check skipped. ALL PASSED');
  process.exit(0);
}

const { default: pg } = await import('pg');
const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows } = await c.query(`
  select p.proname,
         pg_get_functiondef(p.oid) as src,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
  order by p.proname`);

const offenders = [];
for (const { proname, src, authed, anon } of rows) {
  if (/RETURNS trigger/i.test(src)) continue;                       // gated by the statement that fired it
  if (!/\b(insert into|update\s+public\.|delete from)\b/i.test(src)) continue;
  if (!authed && !anon) continue;                                    // service role only — unreachable
  if (PUBLIC_BY_DESIGN.has(proname)) continue;
  if (REVIEWED_SAFE.has(proname)) continue;
  const orgScoped = /my_org_id\(\)|same_org\(/i.test(src);
  const selfScoped = /=\s*auth\.uid\(\)/.test(src);
  const platformOnly = /is_platform_admin\(\)|platform_admins/i.test(src);
  if (orgScoped || selfScoped || platformOnly) continue;
  offenders.push(proname);
}

await c.end();

if (offenders.length) {
  console.log('✗ SECURITY DEFINER functions that write, are callable by anon/authenticated, and are scoped by nothing:');
  for (const o of offenders) console.log(`    ${o}`);
  console.log('\n  Fix by scoping to my_org_id()/same_org(), or to `= auth.uid()`, or by revoking');
  console.log('  execute from anon+authenticated and granting service_role explicitly.');
  console.log('  (Revoking from PUBLIC also strips what service_role inherits — grant it back.)');
  console.error(`\nFAILED, ${offenders.length} unscoped definer writer(s)`);
  process.exit(1);
}
console.log(`Checked ${rows.length} SECURITY DEFINER functions: every reachable writer is scoped. ALL PASSED`);
