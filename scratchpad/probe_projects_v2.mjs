// Behavioural probe for the Projects v2 fixes. Everything runs inside ONE
// transaction that is always rolled back.
//
// Each case is a defect the reviewers found, re-run against the fixed schema.
// Run:  DB_URL=... node scratchpad/probe_projects_v2.mjs
import pg from 'pg';
import crypto from 'node:crypto';

const c = new pg.Client({ connectionString: process.env.DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const uuid = () => crypto.randomUUID();
// Postgres aborts the whole transaction on ANY error, so a statement we EXPECT
// to fail has to run inside a savepoint we can roll back to.
const expectFail = async (sql, params) => {
  await c.query('savepoint sp');
  try { await c.query(sql, params); await c.query('release savepoint sp'); return false; }
  catch { await c.query('rollback to savepoint sp'); return true; }
};
let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `  — ${detail}`}`);
  ok ? pass++ : fail++;
};

await c.query('begin');
try {
  const orgA = '00000000-0000-0000-0000-000000000001';
  const { rows: [me] } = await c.query('select id from profiles where org_id=$1 limit 1', [orgA]);
  // Seed the other org's project FIRST, while still service-role: once we are
  // acting as an org A user the guards (correctly) refuse to create it.
  const { rows: [orgBrow] } = await c.query('select id from organizations where id <> $1 limit 1', [orgA]);
  let foreignProject = null;
  if (orgBrow) {
    const { rows: [ob] } = await c.query('select id from profiles where org_id=$1 limit 1', [orgBrow.id]);
    if (ob) {
      const { rows: [pb] } = await c.query(
        "insert into projects(org_id,name,owner_id,created_by) values($1,'Other org project',$2,$2) returning id",
        [orgBrow.id, ob.id]);
      foreignProject = pb.id;
    }
  }

  // Behave like a signed-in user: same_org()/auth.uid() drive every guard, and
  // without this the probe tests the service-role path instead of the real one.
  await c.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)", [me.id]);
  const { rows: [projA] } = await c.query(
    "insert into projects(org_id,name,owner_id,created_by) values($1,'Probe A',$2,$2) returning id", [orgA, me.id]);

  // statuses are seeded per project by the migration's trigger/backfill; make sure
  const { rows: st } = await c.query(
    'select id,name,is_done from project_statuses where project_id=$1 order by position', [projA.id]);
  check('a new project gets its status columns', st.length > 0, `got ${st.length}`);
  const todo = st.find((x) => !x.is_done) || st[0];
  const done = st.find((x) => x.is_done) || st[st.length - 1];

  const mkTask = async (title, parent = null, status = todo.id) => {
    const { rows: [t] } = await c.query(
      `insert into project_tasks(org_id,project_id,title,created_by,status_id,parent_task_id)
       values($1,$2,$3,$4,$5,$6) returning id`, [orgA, projA.id, title, me.id, status, parent]);
    return t.id;
  };

  // ---- 1. deleting a parent must not destroy the subtree ------------------
  const parent = await mkTask('Migrate customer data');
  const kids = [await mkTask('Export', parent), await mkTask('Transform', parent), await mkTask('Load', parent)];
  await c.query('delete from project_tasks where id=$1', [parent]);
  const { rows: survivors } = await c.query('select id,parent_task_id from project_tasks where id = any($1::uuid[])', [kids]);
  check('deleting a parent PROMOTES its subtasks instead of destroying them',
    survivors.length === 3 && survivors.every((r) => r.parent_task_id === null),
    `${survivors.length}/3 survived`);

  // ---- 2. a blocked task cannot enter a done column -----------------------
  const a = await mkTask('Task A');
  const b = await mkTask('Task B');
  await c.query('insert into project_task_deps(org_id,project_id,task_id,depends_on_id,created_by) values($1,$2,$3,$4,$5)',
    [orgA, projA.id, b, a, me.id]);
  const blocked = await expectFail('update project_tasks set status_id=$1 where id=$2', [done.id, b]);
  check('a blocked task cannot be moved into a finished column', blocked, 'the update succeeded');

  await c.query('update project_tasks set status_id=$1 where id=$2', [done.id, a]);
  const stillFails = await expectFail('update project_tasks set status_id=$1 where id=$2', [done.id, b]);
  check('and it CAN be moved once its prerequisite is finished', !stillFails);

  // ---- 3. blocked-ness is answered by the server, unknown != safe ---------
  const c1 = await mkTask('Visible'); const c2 = await mkTask('Hidden prerequisite');
  await c.query('insert into project_task_deps(org_id,project_id,task_id,depends_on_id,created_by) values($1,$2,$3,$4,$5)',
    [orgA, projA.id, c1, c2, me.id]);
  const { rows: blk } = await c.query('select * from public.project_blocked_tasks($1)', [projA.id]);
  check('project_blocked_tasks reports a task whose prerequisite is unfinished',
    blk.some((r) => r.task_id === c1), JSON.stringify(blk));

  // ---- 4. a comment cannot be planted on another project's task ----------
  const { rows: [projB] } = await c.query(
    "insert into projects(org_id,name,owner_id,created_by) values($1,'Probe B',$2,$2) returning id", [orgA, me.id]);
  const otherTask = await mkTask('Task in A');
  const { rows: [planted] } = await c.query(
    `insert into project_task_comments(org_id,project_id,task_id,author_id,body)
     values($1,$2,$3,$4,'planted') returning project_id`, [orgA, projB.id, otherTask, me.id]);
  check('a comment is filed against the TASK\'s project, not the one claimed',
    planted.project_id === projA.id, `landed in ${planted.project_id}`);

  // ---- 5. a status carrying a foreign project is refused ------------------
  if (foreignProject) {
    const refused = await expectFail(
      "insert into project_statuses(org_id,project_id,name,position) values($1,$2,'Sneaky',9)", [orgA, foreignProject]);
    check("a status naming another org's project is refused", refused, 'it was accepted');
  } else {
    console.log('  · no second org with a profile, skipped the cross-org status case');
  }

  // ---- 6. renaming a status keeps names unique ---------------------------
  const dupBlocked = await expectFail('update project_statuses set name=$1 where id=$2', [done.name, todo.id]);
  check('renaming a column onto an existing name is refused', dupBlocked, 'duplicate allowed');
} finally {
  await c.query('rollback');
  await c.end();
}

console.log(`\n${pass} passed, ${fail} failed — rolled back, production untouched`);
process.exit(fail ? 1 : 0);
