// Cross-tenant RLS probe — proves org A can never read or write org B's data,
// for every suite. This is the sin that keeps recurring (the profiles leak,
// zero-PAYE-bands): a policy written `is_super_admin() OR …` instead of
// `same_org(org_id) AND …` silently exposes every tenant. This catches it.
//
// How it works without real logins: it creates two disposable orgs + users,
// seeds one row per suite table in each, then runs queries under the Postgres
// `authenticated` role with `request.jwt.claims.sub` set to each user — the
// exact context PostgREST uses, so the real RLS policies apply. It asserts
// each user sees ONLY their own org's row. Everything is cleaned up at the end.
//
// Run:  DATABASE_URL='postgres://…' node test/rls_probe.mjs
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(new URL('../package.json', import.meta.url));
const { Client } = require('pg');

const conn = process.env.DATABASE_URL;
if (!conn) { console.error('Set DATABASE_URL'); process.exit(2); }
const uuid = () => crypto.randomUUID();

let pass = 0, fail = 0, skip = 0;
const check = (label, ok, detail = '') => {
  if (ok === 'skip') { console.log(`SKIP  ${label}  ${detail}`); skip++; return; }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  ${detail}`}`);
  ok ? pass++ : fail++;
};

const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await c.connect();

// two disposable orgs + users
const A = { org: uuid(), user: uuid(), email: `rls-probe-a-${Date.now()}@collarone-test.app` };
const B = { org: uuid(), user: uuid(), email: `rls-probe-b-${Date.now()}@collarone-test.app` };

// seed configs: given an org+user, insert ONE row and return its id. Kept to
// the main table per suite; add a table here when a new suite ships.
const SEED = {
  crm_contacts:   (o, u) => c.query('insert into crm_contacts(org_id,name,created_by) values($1,$2,$3) returning id', [o, 'Probe', u]),
  tasks:          (o, u) => c.query('insert into tasks(org_id,title,created_by) values($1,$2,$3) returning id', [o, 'Probe', u]),
  staff_loans:    (o, u) => c.query('insert into staff_loans(org_id,employee_id,principal,monthly_installment) values($1,$2,$3,$4) returning id', [o, u, 10000, 1000]),
  trade_documents:(o, u) => c.query("insert into trade_documents(org_id,doc_type,doc_no,created_by) values($1,'invoice',$2,$3) returning id", [o, 'PRB-' + uuid().slice(0, 6), u]),
  site_orders:    (o) => c.query("insert into site_orders(org_id,order_no,customer_name,phone,items,total_naira,payment_method) values($1,$2,'x','0','[]'::jsonb,0,'transfer') returning id", [o, 'PRB-' + uuid().slice(0, 6)]),
  stock_items:    (o, u) => c.query('insert into stock_items(org_id,sku,name,created_by) values($1,$2,$3,$4) returning id', [o, 'PRB-' + uuid().slice(0, 5), 'Probe', u]),
  expenses:       (o, u) => c.query("insert into expenses(org_id,description,submitted_by) values($1,'Probe',$2) returning id", [o, u]),
  projects:       (o, u) => c.query('insert into projects(org_id,name,owner_id,created_by) values($1,$2,$3,$4) returning id', [o, 'Probe', u, u]),
  documents:      (o, u) => c.query("insert into documents(org_id,name,file_path,created_by) values($1,'Probe','probe/x.pdf',$2) returning id", [o, u]),
  benefit_plans:  (o, u) => c.query('insert into benefit_plans(org_id,name,created_by) values($1,$2,$3) returning id', [o, 'Probe', u]),
  compliance_marks:(o, u) => c.query("insert into compliance_marks(org_id,rule_key,period,done_by) values($1,'paye','2099-01',$2) returning id", [o, u]),
  vendors:        (o, u) => c.query('insert into vendors(org_id,name,created_by) values($1,$2,$3) returning id', [o, 'Probe', u]),
};

const seeded = {}; // table -> { A: idA, B: idB }

try {
  // ---- setup (as superuser; RLS bypassed) ----
  for (const P of [A, B]) {
    await c.query("insert into auth.users(instance_id,id,aud,role,email,created_at,updated_at) values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,now(),now())", [P.user, P.email]);
    await c.query("insert into organizations(id,name,slug,status,plan_tier,created_by) values($1,$2,$3,'active','starter',$4)", [P.org, `RLS Probe ${P.org.slice(0, 4)}`, `rls-probe-${P.org.slice(0, 8)}`, P.user]);
    await c.query("insert into profiles(id,email,org_id,role,status) values($1,$2,$3,'super_admin','active')", [P.user, P.email, P.org]);
  }

  for (const [table, fn] of Object.entries(SEED)) {
    try {
      const ra = await fn(A.org, A.user); const rb = await fn(B.org, B.user);
      seeded[table] = { A: ra.rows[0].id, B: rb.rows[0].id };
    } catch (e) { seeded[table] = { err: e.message }; }
  }

  // ---- probe: as each user, they must see their OWN row and NOT the other's ----
  const asUser = async (me, other, otherOrg) => {
    await c.query('begin');
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: me.user, role: 'authenticated' })]);
    await c.query('set local role authenticated');

    // the historical leak: profiles. Must NOT see the other org's profile.
    const others = await c.query('select count(*)::int n from profiles where org_id = $1', [otherOrg]);
    check(`profiles · ${me.email.includes('-a-') ? 'A' : 'B'} cannot see other org's profiles`, others.rows[0].n === 0, `saw ${others.rows[0].n}`);

    for (const [table, ids] of Object.entries(seeded)) {
      if (ids.err) { check(`${table} · seed`, 'skip', ids.err.slice(0, 60)); continue; }
      const mineId = me === A ? ids.A : ids.B;
      const otherId = me === A ? ids.B : ids.A;
      // can read my own row
      const mine = await c.query(`select count(*)::int n from ${table} where id = $1`, [mineId]);
      // cannot read the other org's row
      const seesOther = await c.query(`select count(*)::int n from ${table} where id = $1`, [otherId]);
      const ok = mine.rows[0].n === 1 && seesOther.rows[0].n === 0;
      check(`${table} · isolation`, ok, `own=${mine.rows[0].n} other=${seesOther.rows[0].n}`);
    }

    await c.query('rollback'); // resets role + jwt claims
  };

  await asUser(A, B, B.org);
  await asUser(B, A, A.org);

  // ---- RPC probe: a SECURITY DEFINER fn taking an arbitrary id must org-check.
  // loan_balance() should return null for another org's loan (the class of bug
  // decide_leave_request/leave_available once had).
  if (seeded.staff_loans && !seeded.staff_loans.err) {
    await c.query('begin');
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: A.user, role: 'authenticated' })]);
    await c.query('set local role authenticated');
    const r = await c.query('select public.loan_balance($1) as bal', [seeded.staff_loans.B]);
    check('loan_balance() · org-checked (null for other org)', r.rows[0].bal === null, `got ${r.rows[0].bal}`);
    await c.query('rollback');
  }
} finally {
  // ---- cleanup (superuser) ----
  // Delete every org-scoped row for the two disposable orgs — not just the ones
  // we seeded: the org-creation trigger also seeds paye_bands, deduction_rates,
  // etc. Enumerate all org_id tables and sweep in a few passes so FK order
  // (child-before-parent) resolves itself, then the parents.
  await c.query('reset role').catch(() => {});
  const orgs = [A.org, B.org];
  const scoped = (await c.query("select table_name from information_schema.columns where column_name='org_id' and table_schema='public'")).rows.map(r => r.table_name);
  for (let pass = 0; pass < 3; pass++) {
    for (const t of scoped) {
      try { await c.query(`delete from ${t} where org_id = any($1::uuid[])`, [orgs]); } catch { /* retry next pass */ }
    }
  }
  await c.query('delete from auth.users where id = any($1::uuid[])', [[A.user, B.user]]).catch(() => {});
  await c.query('delete from organizations where id = any($1::uuid[])', [orgs]).catch(() => {});
  await c.end();
}

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
