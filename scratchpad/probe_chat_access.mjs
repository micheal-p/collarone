// Behavioural probe for team chat access. Everything runs inside ONE
// transaction that is ALWAYS rolled back — it seeds a department, a group and
// a membership, asserts the rules against them, and leaves production exactly
// as it found it. No test rows survive (the E2E orgs from an earlier session
// are still sitting in prod; not doing that again).
//
// It asks user_can_read_chat_room(user, room) directly, which is the same
// function the message SELECT policy, the write path, the member list and the
// mention filter all delegate to — so proving it proves all four.
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

let pass = true;
const can = async (user, room) =>
  (await c.query('select public.user_can_read_chat_room($1,$2) v', [user, room])).rows[0].v;
const assert = (label, got, want) => {
  const ok = got === want;
  if (!ok) pass = false;
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `  (got ${got}, want ${want})`}`);
};

await c.query('begin');
try {
  const orgA = '00000000-0000-0000-0000-000000000001';
  const { rows: orgs } = await c.query("select id from organizations where id <> $1 limit 1", [orgA]);
  const orgB = orgs[0]?.id;

  // a real profile in org A, temporarily demoted to staff so the admin bypass
  // doesn't mask what we're testing
  const { rows: ps } = await c.query(
    "select id, name from profiles where org_id=$1 and status='active' limit 1", [orgA]);
  const P = ps[0].id;
  await c.query("update profiles set role='staff' where id=$1", [P]);

  // ---- department rooms ----------------------------------------------------
  const { rows: dep } = await c.query(
    "insert into departments (name, code, org_id) values ('Probe Dept','PROBE-X',$1) returning id", [orgA]);
  const D = dep[0].id;
  await c.query("update profiles set department_id=$1, department='Probe Dept' where id=$2", [D, P]);
  assert('member of a department can open its room', await can(P, `dept:${D}`), true);

  await c.query("update departments set name='Probe Dept Renamed' where id=$1", [D]);
  assert('RENAMING the department does not lock them out', await can(P, `dept:${D}`), true);

  // the CSV-import shape: free text, no id
  await c.query("update profiles set department_id=null, department='Probe Dept Renamed' where id=$1", [P]);
  assert('name fallback works for imported staff with no department_id', await can(P, `dept:${D}`), true);

  await c.query("update profiles set department='Something Else' where id=$1", [P]);
  assert('someone in another department cannot open it', await can(P, `dept:${D}`), false);

  await c.query("update profiles set department_id=$1 where id=$2", [D, P]);

  // ---- groups --------------------------------------------------------------
  const { rows: g } = await c.query(
    "insert into chat_groups (org_id, name) values ($1,'Probe Group') returning id", [orgA]);
  const G = g[0].id;
  assert('a non-member cannot open a group', await can(P, `group:${G}`), false);

  await c.query('insert into chat_group_members (group_id, user_id) values ($1,$2)', [G, P]);
  assert('a member can open it', await can(P, `group:${G}`), true);

  await c.query('update chat_groups set archived=true where id=$1', [G]);
  assert('CLOSING the group shuts it for its members', await can(P, `group:${G}`), false);

  await c.query("update profiles set role='super_admin' where id=$1", [P]);
  assert('closed means closed for admins too', await can(P, `group:${G}`), false);

  await c.query('update chat_groups set archived=false where id=$1', [G]);
  await c.query('delete from chat_group_members where group_id=$1 and user_id=$2', [G, P]);
  assert('an admin can open a group in their own org', await can(P, `group:${G}`), true);

  // ---- the tenant boundary -------------------------------------------------
  if (orgB) {
    const { rows: gb } = await c.query(
      "insert into chat_groups (org_id, name) values ($1,'Probe Group B') returning id", [orgB]);
    assert("an admin CANNOT reach another tenant's group", await can(P, `group:${gb[0].id}`), false);

    const { rows: db } = await c.query(
      "insert into departments (name, code, org_id) values ('Probe Dept B','PROBE-Y',$1) returning id", [orgB]);
    assert("an admin CANNOT reach another tenant's department room", await can(P, `dept:${db[0].id}`), false);
  } else {
    console.log('  · only one org — skipped the cross-tenant checks');
  }

  // ---- shape ---------------------------------------------------------------
  assert('an unknown room key is refused', await can(P, 'group:not-a-uuid'), false);
  assert('everyone can open General', await can(P, 'general'), true);
} finally {
  await c.query('rollback');           // nothing above survives
  await c.end();
}

console.log(pass ? '\nALL PASSED — rolled back, production untouched'
                 : '\nFAILURES ABOVE — rolled back, production untouched');
process.exit(pass ? 0 : 1);
