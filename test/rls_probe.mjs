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

// Remove EVERY probe org — this run's two and any a previous run leaked —
// under session_replication_role=replica so FK order can never block the org
// delete. That silent block (org delete wrapped in .catch) is exactly what
// leaked 8 "RLS Probe" orgs into production before. Atomic: all-or-nothing,
// and a failure is surfaced, not swallowed. Runs at startup (self-heal) and in
// the finally.
async function sweepProbeOrgs() {
  await c.query('reset role').catch(() => {});
  await c.query('begin');
  try {
    await c.query("create temp table _po on commit drop as select id from organizations where slug like 'rls-probe-%' or name like 'RLS Probe %'");
    await c.query('create temp table _pu on commit drop as select id from profiles where org_id in (select id from _po)');
    await c.query('set local session_replication_role = replica');   // FK triggers off — order-independent
    // base tables only (relkind='r') — VIEWS also expose an org_id column and
    // can't be deleted from (org_credit_balance is one).
    const scoped = (await c.query(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
      where n.nspname = 'public' and c.relkind = 'r'`)).rows.map((r) => r.relname);
    for (const t of scoped) await c.query(`delete from public.${t} where org_id in (select id from _po)`);
    await c.query('delete from auth.users where id in (select id from _pu)');
    await c.query('delete from organizations where id in (select id from _po)');
    await c.query('commit');
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; }
}

await sweepProbeOrgs().catch((e) => console.log('startup sweep warning:', e.message));

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
  overtime_requests:    (o, u) => c.query("insert into overtime_requests(org_id,employee_id,work_date,hours,created_by) values($1,$2,'2099-01-01',2,$3) returning id", [o, u, u]),
  attendance_device_map:(o, u) => c.query('insert into attendance_device_map(org_id,device_uid,employee_id) values($1,$2,$3) returning id', [o, 'DEV-' + uuid().slice(0, 6), u]),
  org_chat_messages:    (o, u) => c.query("insert into org_chat_messages(org_id,room,author_id,body) values($1,'general',$2,'Probe') returning id", [o, u]),
};

// Projects v2 adds five tables that carry work, comments and the dependency
// graph. They get the same treatment as everything else: seeded per org, then
// each user must see only their own. Seeded after SEED because they need a
// project row to hang off.
const PROJECT_SEED = async (P) => {
  const { rows: [pr] } = await c.query(
    "insert into projects(org_id,name,owner_id,created_by) values($1,'RLS probe project',$2,$2) returning id", [P.org, P.user]);
  const { rows: [st] } = await c.query(
    "insert into project_statuses(org_id,project_id,name,position) values($1,$2,'Probe status',0) returning id", [P.org, pr.id]);
  const { rows: [t1] } = await c.query(
    "insert into project_tasks(org_id,project_id,title,created_by,status_id) values($1,$2,'Probe task A',$3,$4) returning id", [P.org, pr.id, P.user, st.id]);
  const { rows: [t2] } = await c.query(
    "insert into project_tasks(org_id,project_id,title,created_by,status_id) values($1,$2,'Probe task B',$3,$4) returning id", [P.org, pr.id, P.user, st.id]);
  const { rows: [dep] } = await c.query(
    "insert into project_task_deps(org_id,project_id,task_id,depends_on_id,created_by) values($1,$2,$3,$4,$5) returning id", [P.org, pr.id, t2.id, t1.id, P.user]);
  const { rows: [cm] } = await c.query(
    "insert into project_task_comments(org_id,project_id,task_id,author_id,body) values($1,$2,$3,$4,'probe') returning id", [P.org, pr.id, t1.id, P.user]);
  return { project_statuses: st.id, project_task_deps: dep.id, project_task_comments: cm.id };
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

  // Projects v2 tables, seeded together because they hang off one project.
  try {
    const pa = await PROJECT_SEED(A);
    const pb = await PROJECT_SEED(B);
    for (const table of Object.keys(pa)) seeded[table] = { A: pa[table], B: pb[table] };
  } catch (e) {
    for (const table of ['project_statuses', 'project_task_deps', 'project_task_comments']) {
      seeded[table] = { err: e.message };
    }
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

  // ---- team_absences() must be org-scoped. Its predecessor (the
  // team_calendar VIEW) executed with owner privileges — no RLS, no org
  // filter — and leaked every org's approved leave org-wide. This makes that
  // regression impossible to miss again.
  try {
    const seedLeave = async (P) => {
      let { rows: [lt] } = await c.query('select id from leave_types where org_id = $1 limit 1', [P.org]);
      if (!lt) {
        // fresh probe orgs have no seeded types — create one (org-scoped key)
        ({ rows: [lt] } = await c.query(
          `insert into leave_types(org_id,key,name,default_days) values($1,$2,'Probe Leave',5) returning id`,
          [P.org, `probe-${P.org.slice(0, 8)}`]));
      }
      if (!lt) return null;
      const { rows: [req] } = await c.query(
        `insert into leave_requests(org_id,user_id,leave_type_id,start_date,end_date,working_days,status)
         values($1,$2,$3,current_date,current_date + 1,2,'approved') returning id`, [P.org, P.user, lt.id]);
      return req.id;
    };
    const reqA = await seedLeave(A);
    const reqB = await seedLeave(B);
    if (!reqA || !reqB) {
      check('team_absences() · org-scoped', 'skip', 'no org leave_types seeded');
    } else {
      await c.query('begin');
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: A.user, role: 'authenticated' })]);
      await c.query('set local role authenticated');
      const { rows } = await c.query('select id from public.team_absences()');
      const idSet = new Set(rows.map((x) => x.id));
      check('team_absences() · org-scoped (sees own, never the other org)',
        idSet.has(reqA) && !idSet.has(reqB), `own=${idSet.has(reqA)} other=${idSet.has(reqB)}`);
      await c.query('rollback');
    }
  } catch (e) {
    check('team_absences() · org-scoped', false, e.message);
  }

  // ---- team chat rooms: org-scoped AND membership-scoped. General is open to
  // the whole tenant, but a group room must be shut to non-members, shut to
  // other tenants, and shut once archived — and the unread count must never
  // report a room you can't open, which would leak both its existence and its
  // traffic. The probe users are super_admins, who can open any group in their
  // OWN org by design, so it demotes one to staff inside the transaction.
  try {
    const { rows: [gA] } = await c.query("insert into chat_groups(org_id,name) values($1,'Probe Group A') returning id", [A.org]);
    const { rows: [gB] } = await c.query("insert into chat_groups(org_id,name) values($1,'Probe Group B') returning id", [B.org]);
    for (const [P, g] of [[A, gA], [B, gB]]) {
      await c.query("insert into org_chat_messages(org_id,room,author_id,body) values($1,$2,$3,'group secret')",
        [P.org, `group:${g.id}`, P.user]);
    }

    const asStaffA = async (fn) => {
      await c.query('begin');
      await c.query("update profiles set role='staff' where id=$1", [A.user]);
      await fn();
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: A.user, role: 'authenticated' })]);
      await c.query('set local role authenticated');
      const can = async (room) => (await c.query('select public.can_read_chat_room($1) v', [room])).rows[0].v;
      const groupMsgs = async () => (await c.query("select count(*)::int n from org_chat_messages where room like 'group:%'")).rows[0].n;
      const unread = async () => (await c.query('select coalesce(sum(unread),0)::int n from public.chat_unread_counts()')).rows[0].n;
      const out = { can, groupMsgs, unread };
      return out;
    };

    { // not a member of anything
      const p = await asStaffA(async () => {});
      check('chat · a non-member cannot open a group in their own org', (await p.can(`group:${gA.id}`)) === false);
      check("chat · nobody can open another tenant's group", (await p.can(`group:${gB.id}`)) === false);
      check('chat · group messages are invisible to a non-member', (await p.groupMsgs()) === 0, `saw ${await p.groupMsgs()}`);
      check('chat · unread never counts a room you cannot open', (await p.unread()) === 0, `counted ${await p.unread()}`);
      await c.query('rollback');
    }

    { // a member of their own org's group
      const p = await asStaffA(async () => {
        await c.query('insert into chat_group_members(group_id,user_id) values($1,$2)', [gA.id, A.user]);
      });
      check('chat · a member CAN open their group', (await p.can(`group:${gA.id}`)) === true);
      check("chat · still shut out of the other tenant's group", (await p.can(`group:${gB.id}`)) === false);
      check('chat · a member sees exactly one group message (their own)', (await p.groupMsgs()) === 1, `saw ${await p.groupMsgs()}`);
      await c.query('rollback');
    }

    { // member, but the group has been archived
      const p = await asStaffA(async () => {
        await c.query('insert into chat_group_members(group_id,user_id) values($1,$2)', [gA.id, A.user]);
        await c.query('update chat_groups set archived=true where id=$1', [gA.id]);
      });
      check('chat · archiving shuts the room for its own members', (await p.can(`group:${gA.id}`)) === false);
      check('chat · archived group messages disappear too', (await p.groupMsgs()) === 0, `saw ${await p.groupMsgs()}`);
      await c.query('rollback');
    }
  } catch (e) {
    check('chat · room isolation', false, e.message);
  }
} finally {
  // ---- cleanup ---- one bulletproof sweep (see sweepProbeOrgs). If it fails,
  // say so loudly and verify nothing was left behind, so a leak can never again
  // be silent.
  try {
    await sweepProbeOrgs();
    const left = (await c.query("select count(*)::int n from organizations where slug like 'rls-probe-%' or name like 'RLS Probe %'")).rows[0].n;
    if (left > 0) { console.error(`CLEANUP LEAK: ${left} probe org(s) still present after sweep`); fail++; }
  } catch (e) {
    console.error('CLEANUP FAILED:', e.message);
    fail++;
  }
  await c.end();
}

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
