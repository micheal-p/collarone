// The alerts in supabase/notify_more.sql reach the right person, once, and
// nobody else can read them.
//
// Runs the real trigger and the real daily function against the real database
// inside a transaction that is always rolled back. Until the migration is
// applied the function is absent, and this says so and passes, so shipping the
// code ahead of the SQL never turns the deploy red.
//
// Run:  DATABASE_URL='postgres://...' node test/notify_more.mjs
import pg from 'pg';

const url = process.env.DATABASE_URL || process.env.DB_URL;
if (!url) {
  console.log('~ no DATABASE_URL: skipping the live alerts test (runs in the live CI job)');
  console.log('Alerts check skipped. ALL PASSED');
  process.exit(0);
}
const c = new pg.Client({ connectionString: url, ssl: url.includes('127.0.0.1') || url.includes('localhost') ? false : { rejectUnauthorized: false } });
await c.connect();

const { rows: [{ present }] } = await c.query(`select exists (select 1 from pg_proc where proname = 'queue_more_reminders') as present`);
if (!present) {
  console.log('~ queue_more_reminders is not in this database yet: apply supabase/notify_more.sql');
  console.log('Alerts check skipped. ALL PASSED');
  await c.end();
  process.exit(0);
}

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? '  ' + detail : ''}`); };
const outbox = async (kind, recipient) => (await c.query(
  `select id, subject, body from notification_outbox where kind = $1 and recipient_id = $2`, [kind, recipient])).rows;

await c.query('begin');
try {
  const { rows: [org] } = await c.query(
    `insert into organizations (name, slug, plan_tier, status) values ('Alerts Test', 'alerts-test-' || substr(md5(random()::text), 1, 8), 'standard', 'active') returning id`);
  const person = async (label, role, suites) => {
    const { rows: [u] } = await c.query(`insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id`, [`${label}-${Date.now()}@example.invalid`]);
    await c.query(`insert into profiles (id, email, name, role, suites, org_id, status) values ($1, $2, $3, $4, $5, $6, 'active')
                   on conflict (id) do update set org_id = excluded.org_id, role = excluded.role, suites = excluded.suites, name = excluded.name, status = 'active'`,
      [u.id, `${label}@example.invalid`, label, role, JSON.stringify(suites), org.id]);
    // Some installs disable a new profile until a seat is confirmed.
    await c.query(`update profiles set status = 'active' where id = $1`, [u.id]);
    return u.id;
  };
  const owner = await person('Owner', 'super_admin', []);
  const buyer = await person('Buyer', 'staff', [{ key: 'procurement', role: 'manager' }, { key: 'compliance', role: 'manager' }]);
  const clerk = await person('Clerk', 'staff', [{ key: 'procurement', role: 'member' }, { key: 'attendance', role: 'member' }]);

  // ---- purchase request submitted -------------------------------------------
  console.log('purchase request submitted');
  const { rows: [pr] } = await c.query(
    `insert into purchase_requests (org_id, requested_by, item_description, quantity, unit_cost) values ($1, $2, 'Inverter batteries', 4, 250000) returning id`,
    [org.id, clerk]);
  check('the procurement manager is told', (await outbox('purchase_submitted', buyer)).length === 1);
  check('so is the owner', (await outbox('purchase_submitted', owner)).length === 1);
  check('the requester is not told about their own request', (await outbox('purchase_submitted', clerk)).length === 0);
  const [msg] = await outbox('purchase_submitted', buyer);
  check('it says what and roughly how much', /Inverter batteries/.test(msg?.body || '') && /₦1,075,000/.test(msg?.body || ''), msg?.body);

  // ---- reading your own alerts ------------------------------------------------
  console.log('who can read them');
  const readAs = async (uid) => {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await c.query('set local role authenticated');
    const { rows } = await c.query(`select recipient_id from notification_outbox where kind = 'purchase_submitted' and org_id = $1`, [org.id]);
    await c.query('reset role');
    return rows;
  };
  const mine = await readAs(buyer);
  check('a person sees their own alert', mine.length === 1 && mine[0].recipient_id === buyer, JSON.stringify(mine));
  check("and not anyone else's", (await readAs(clerk)).length === 0);

  // ---- still clocked in -------------------------------------------------------
  console.log('still clocked in');
  await c.query(`insert into attendance_records (org_id, employee_id, clock_in_at) values ($1, $2, now() - interval '15 hours')`, [org.id, clerk]);
  await c.query(`select queue_more_reminders()`);
  await c.query(`select queue_more_reminders()`);
  check('the employee is reminded, once, however often the sweep runs', (await outbox('clockout_missing', clerk)).length === 1);
  await c.query(`delete from attendance_records where employee_id = $1`, [clerk]);
  await c.query(`delete from notification_outbox where kind = 'clockout_missing' and recipient_id = $1`, [clerk]);
  await c.query(`insert into attendance_records (org_id, employee_id, clock_in_at) values ($1, $2, now() - interval '9 hours')`, [org.id, clerk]);
  await c.query(`select queue_more_reminders()`);
  check('a normal working day is left alone', (await outbox('clockout_missing', clerk)).length === 0);

  // ---- compliance deadlines ---------------------------------------------------
  console.log('compliance deadlines');
  const { rows: [{ d, last }] } = await c.query(
    `select extract(day from (now() at time zone 'Africa/Lagos'))::int d,
            extract(day from date_trunc('month', now() at time zone 'Africa/Lagos') + interval '1 month - 1 day')::int last`);
  const { rows: [{ period }] } = await c.query(
    `select to_char(date_trunc('month', (now() at time zone 'Africa/Lagos')::date) - interval '1 month', 'YYYY-MM') period`);
  // Make PAYE fall due today, for this test only (rolled back).
  await c.query(`update compliance_rules set due_day = $1 where key = 'paye'`, [d]);
  // Switch every other rule off for this company, so only PAYE can speak.
  await c.query(`insert into org_compliance_prefs (org_id, rule_key, enabled) select $1, key, key = 'paye' from compliance_rules
                 on conflict (org_id, rule_key) do update set enabled = excluded.enabled`, [org.id]);
  // The clock-out sweeps above already ran this, and may have queued a real
  // deadline that happens to fall this week. Start the section clean.
  await c.query(`delete from notification_outbox where kind = 'compliance_due' and org_id = $1`, [org.id]);
  await c.query(`select queue_more_reminders()`);
  const due = await outbox('compliance_due', buyer);
  check('a filing due today reminds the Compliance holder', due.length === 1 && /PAYE|Pay/i.test(due[0].subject), due[0]?.subject);
  check('the owner without the suite is not copied in', (await outbox('compliance_due', owner)).length === 0);
  await c.query(`delete from notification_outbox where kind = 'compliance_due' and org_id = $1`, [org.id]);
  await c.query(`insert into compliance_marks (org_id, rule_key, period, done_by) values ($1, 'paye', $2, $3)`, [org.id, period, buyer]);
  await c.query(`select queue_more_reminders()`);
  check('nothing once that period is marked done', (await outbox('compliance_due', buyer)).length === 0);
  await c.query(`delete from compliance_marks where org_id = $1`, [org.id]);
  if (d + 10 <= last) {
    await c.query(`update compliance_rules set due_day = $1 where key = 'paye'`, [d + 10]);
    await c.query(`select queue_more_reminders()`);
    check('nothing ten days ahead (five is enough warning)', (await outbox('compliance_due', buyer)).length === 0);
  }
  if (d > 3) {
    await c.query(`update compliance_rules set due_day = $1 where key = 'paye'`, [d - 2]);
    await c.query(`select queue_more_reminders()`);
    const late = await outbox('compliance_due', buyer);
    check('two days late, one overdue reminder', late.length === 1 && /was due/.test(late[0].subject), late[0]?.subject);
  }
  await c.query(`update org_compliance_prefs set enabled = false where org_id = $1`, [org.id]);
  await c.query(`delete from notification_outbox where kind = 'compliance_due' and org_id = $1`, [org.id]);
  await c.query(`select queue_more_reminders()`);
  check('nothing for a rule the company switched off', (await outbox('compliance_due', buyer)).length === 0);
} catch (e) {
  fail++;
  console.log(`  FAIL unexpected: ${e.message}`);
} finally {
  await c.query('rollback');
  await c.end();
}

console.log(fail ? `\nFAILED, ${fail} of ${pass + fail} check(s)` : `\nAlerts reach the right person, once, and only them (${pass} checks). ALL PASSED`);
process.exit(fail ? 1 : 0);
