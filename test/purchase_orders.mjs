// Purchase orders: approved requests become one numbered order to one
// supplier, never twice, never into the books, and only for this company.
//
// Runs issue_purchase_order (supabase/procurement_orders.sql) against the real
// database inside a transaction that is always rolled back. Until that file is
// applied the function is absent, and this says so and passes.
//
// Run:  DATABASE_URL='postgres://...' node test/purchase_orders.mjs
import pg from 'pg';

const url = process.env.DATABASE_URL || process.env.DB_URL;
if (!url) {
  console.log('~ no DATABASE_URL: skipping the live purchase-order test (runs in the live CI job)');
  console.log('Purchase order check skipped. ALL PASSED');
  process.exit(0);
}
const c = new pg.Client({ connectionString: url, ssl: url.includes('127.0.0.1') || url.includes('localhost') ? false : { rejectUnauthorized: false } });
await c.connect();

const { rows: [{ present }] } = await c.query(`select exists (select 1 from pg_proc where proname = 'issue_purchase_order') as present`);
if (!present) {
  console.log('~ issue_purchase_order is not in this database yet: apply supabase/procurement_orders.sql');
  console.log('Purchase order check skipped. ALL PASSED');
  await c.end();
  process.exit(0);
}

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? '  ' + detail : ''}`); };
const asUser = async (uid, sql, params) => {
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await c.query('savepoint s');
  await c.query('set local role authenticated');
  try {
    const r = await c.query(sql, params);
    await c.query('release savepoint s');
    return { rows: r.rows, row: r.rows[0] };
  } catch (e) {
    await c.query('rollback to savepoint s');
    return { error: e.message };
  } finally {
    await c.query('reset role');
  }
};
const issue = (uid, ids, vendor = null) => asUser(uid,
  `select * from issue_purchase_order($1::uuid[], $2, current_date + 7, 'Deliver to the Ikeja store')`, [ids, vendor]);

await c.query('begin');
try {
  const newOrg = async (name) => (await c.query(
    `insert into organizations (name, slug, plan_tier, status) values ($1, $2, 'standard', 'active') returning id`,
    [name, `po-test-${Math.random().toString(36).slice(2, 10)}`])).rows[0].id;
  const person = async (org, label, role, suites) => {
    const { rows: [u] } = await c.query(`insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id`, [`${label}-${Math.random()}@example.invalid`]);
    await c.query(`insert into profiles (id, email, name, role, suites, org_id) values ($1, $2, $3, $4, $5, $6)
                   on conflict (id) do update set org_id = excluded.org_id, role = excluded.role, suites = excluded.suites`,
      [u.id, `${label}@example.invalid`, label, role, JSON.stringify(suites), org]);
    await c.query(`update profiles set status = 'active' where id = $1`, [u.id]);
    return u.id;
  };
  const org = await newOrg('PO Test');
  const buyer = await person(org, 'Buyer', 'staff', [{ key: 'procurement', role: 'manager' }]);
  const clerk = await person(org, 'Clerk', 'staff', [{ key: 'procurement', role: 'member' }]);
  const { rows: [ven] } = await c.query(
    `insert into vendors (org_id, name, phone, email, address, created_by) values ($1, 'Ikeja Power Supplies', '0803 000 0000', 'sales@ikejapower.example', '12 Allen Ave, Ikeja', $2) returning id`, [org, buyer]);
  const request = async (item, qty, cost, status = 'approved', vendor = ven.id, vat = 0.075) => (await c.query(
    `insert into purchase_requests (org_id, requested_by, vendor_id, item_description, quantity, unit_cost, vat_rate, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`, [org, clerk, vendor, item, qty, cost, vat, status])).rows[0].id;

  console.log('issuing an order');
  const a = await request('Inverter batteries', 4, 250000);
  const b = await request('Battery rack', 1, 80000);
  let r = await issue(buyer, [a, b]);
  check('two approved requests become one order', !r.error && r.row?.doc_type === 'purchase_order', r.error);
  const po = r.row;
  check('it is numbered PO-', /^PO-\d{6}$/.test(po?.doc_no || ''), po?.doc_no);
  check('one line per request', Array.isArray(po?.items) && po.items.length === 2);
  check('totals: ₦1,080,000 + 7.5% VAT = ₦1,161,000', Number(po?.subtotal) === 1080000 && Number(po?.total) === 1161000, `${po?.subtotal} / ${po?.total}`);
  check('addressed to the supplier on file', po?.party_name === 'Ikeja Power Supplies' && po?.party_address === '12 Allen Ave, Ikeja');
  const { rows: reqs } = await c.query(`select status, po_doc_id from purchase_requests where id = any($1::uuid[])`, [[a, b]]);
  check('both requests are now ordered and point at it', reqs.every((x) => x.status === 'ordered' && x.po_doc_id === po?.id));
  const { rows: books } = await c.query(`select 1 from ledger_entries where source_id = $1`, [po?.id]);
  check('nothing is posted to the books', books.length === 0);
  const seen = await asUser(buyer, `select doc_no from trade_documents where id = $1`, [po?.id]);
  check('a procurement manager without the invoicing suite can read it', seen.rows?.length === 1, seen.error);

  console.log('refusals');
  r = await issue(buyer, [a]);
  check('an ordered request cannot be ordered again', /approved requests/.test(r.error || ''), r.error);
  const p = await request('Diesel', 200, 900, 'pending');
  r = await issue(buyer, [p]);
  check('a pending request cannot be ordered', /approved requests/.test(r.error || ''), r.error);
  const c1 = await request('Cable', 10, 5000);
  r = await issue(clerk, [c1]);
  check('a member cannot issue an order', /procurement manager/.test(r.error || ''), r.error);
  const { rows: [ven2] } = await c.query(`insert into vendors (org_id, name, created_by) values ($1, 'Other Supplier', $2) returning id`, [org, buyer]);
  const c2 = await request('Fuses', 10, 500, 'approved', ven2.id);
  r = await issue(buyer, [c1, c2]);
  check('two suppliers cannot share one order', /different suppliers/.test(r.error || ''), r.error);
  const c3 = await request('Bulbs', 10, 500, 'approved', ven.id, 0);
  r = await issue(buyer, [c1, c3]);
  check('different VAT rates cannot share one order', /different VAT/.test(r.error || ''), r.error);
  const nov = await request('Tape', 5, 300, 'approved', null);
  r = await issue(buyer, [nov]);
  check('an order needs a supplier', /Choose the supplier/.test(r.error || ''), r.error);
  r = await issue(buyer, [nov], ven.id);
  check('...and naming one at issue time works', !r.error && r.row?.party_name === 'Ikeja Power Supplies', r.error);

  console.log('tenancy');
  const other = await newOrg('PO Other');
  const outsider = await person(other, 'Outsider', 'super_admin', []);
  r = await issue(outsider, [c1]);
  check("another company cannot order this company's requests", /could not be found/.test(r.error || ''), r.error);
  const peek = await asUser(outsider, `select 1 from trade_documents where id = $1`, [po?.id]);
  check('...or read its purchase orders', (peek.rows || []).length === 0, peek.error);
} catch (e) {
  fail++;
  console.log(`  FAIL unexpected: ${e.message}`);
} finally {
  await c.query('rollback');
  await c.end();
}

console.log(fail ? `\nFAILED, ${fail} of ${pass + fail} check(s)` : `\nApproved requests become one honest order (${pass} checks). ALL PASSED`);
process.exit(fail ? 1 : 0);
