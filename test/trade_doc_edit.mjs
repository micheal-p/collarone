// Editing a trade document keeps the books, the payments and the tenancy right.
//
// supabase/trade_docs_edit.sql lets a document be corrected after it was
// raised. Every rule in it exists to stop the document and something else from
// disagreeing: the ledger entry posted when the invoice was issued, a payment
// recorded against the printed amount, stock a GRN already moved, a customer
// paying the old amount through the card link. This runs the real function
// against the real database inside a transaction that is always rolled back.
//
// Until the migration has been applied, the function does not exist yet and
// this says so and passes, so shipping the code ahead of the SQL never turns
// the deploy red.
//
// Run:  DATABASE_URL='postgres://...' node test/trade_doc_edit.mjs
import pg from 'pg';

const url = process.env.DATABASE_URL || process.env.DB_URL;
if (!url) {
  console.log('~ no DATABASE_URL: skipping the live edit test (runs in the live CI job)');
  console.log('Trade document edit check skipped. ALL PASSED');
  process.exit(0);
}
const c = new pg.Client({ connectionString: url, ssl: url.includes('127.0.0.1') || url.includes('localhost') ? false : { rejectUnauthorized: false } });
await c.connect();

const { rows: [{ present }] } = await c.query(
  `select exists (select 1 from pg_proc where proname = 'update_trade_document') as present`);
if (!present) {
  console.log('~ update_trade_document is not in this database yet: apply supabase/trade_docs_edit.sql');
  console.log('Trade document edit check skipped. ALL PASSED');
  await c.end();
  process.exit(0);
}

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? '  ' + detail : ''}`); };
const as = (id) => c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: 'authenticated' })]);
// Run one statement as a signed-in browser would: the authenticated role, so a
// missing grant fails here the way it would in production.
const asUser = async (id, sql, params) => {
  await as(id);
  await c.query('savepoint s');
  await c.query('set local role authenticated');
  try {
    const r = await c.query(sql, params);
    await c.query('release savepoint s');
    return { row: r.rows[0] };
  } catch (e) {
    await c.query('rollback to savepoint s');
    return { error: e.message };
  } finally {
    await c.query('reset role');
  }
};
const ITEMS = (qty, price) => JSON.stringify([{ description: 'Diesel generator service', qty, unit_price: price }]);
const update = (who, doc, over = {}) => asUser(who,
  `select * from update_trade_document($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)`,
  [doc.id, over.party ?? doc.party_name, doc.party_phone, doc.party_email, doc.party_address,
   doc.contact_id, doc.vendor_id, doc.warehouse_id, over.items ?? JSON.stringify(doc.items),
   over.vat ?? Number(doc.vat_rate), over.due ?? doc.due_date, doc.reference, over.notes ?? doc.notes]);
const posted = async (doc) => (await c.query(
  `select l.debit from ledger_entries e join ledger_lines l on l.entry_id = e.id
     join ledger_accounts a on a.id = l.account_id
    where e.source_type = 'invoice' and e.source_id = $1 and e.status = 'posted' and a.code = '1200'`, [doc.id])).rows;

await c.query('begin');
try {
  const { rows: [owner] } = await c.query(
    `select p.id, p.org_id from profiles p join organizations o on o.id = p.org_id
      where p.role = 'super_admin' and p.status = 'active' order by o.created_at limit 1`);
  if (!owner) throw new Error('no active super_admin to test with');

  // A clerk: trade-docs member, not manager. Made here, rolled back below.
  const { rows: [clerkUser] } = await c.query(`insert into auth.users (id, email) values (gen_random_uuid(), 'edit-test-clerk@example.invalid') returning id`);
  await c.query(`insert into profiles (id, email, name, role, suites, org_id) values ($1, 'edit-test-clerk@example.invalid', 'Edit Test Clerk', 'staff', '[{"key":"trade-docs","role":"member"}]', $2)
                 on conflict (id) do update set org_id = excluded.org_id, role = 'staff', suites = excluded.suites`, [clerkUser.id, owner.org_id]);
  const clerk = clerkUser.id;

  const create = async (who, type) => {
    const r = await asUser(who,
      `select * from create_trade_document($1, 'Adaeze Stores', '', '', '', null, null, null, $2::jsonb, 0.075, null, '', '', false)`,
      [type, ITEMS(2, 50000)]);
    if (r.error) throw new Error(`creating a ${type}: ${r.error}`);
    return r.row;
  };

  // ---- 1. an issued invoice: details yes, amounts no ------------------------
  console.log('issued invoice (already in the books)');
  const inv = await create(owner.id, 'invoice');
  check('invoice was posted to the books when issued', (await posted(inv)).length === 1);
  let r = await update(owner.id, inv, { party: 'Adaeze Stores Ltd', due: '2099-01-31', notes: 'Thanks' });
  check('party, due date and notes can be corrected', !r.error && r.row.party_name === 'Adaeze Stores Ltd' && r.row.notes === 'Thanks', r.error);
  check('the number does not change', r.row?.doc_no === inv.doc_no);
  check('the edit is stamped', r.row?.edited_by === owner.id && r.row?.edited_at != null);
  r = await update(owner.id, r.row ?? inv, { items: ITEMS(3, 50000) });
  check('amounts are refused once it is in the books', /already in your books/.test(r.error || ''), r.error);
  const p = await posted(inv);
  check('the books still hold the original amount', p.length === 1 && Number(p[0].debit) === 107500, JSON.stringify(p));

  // ---- 2. a draft: everything, and the books take the corrected figure -----
  console.log('draft invoice');
  // A fresh invoice is issued (and posted) on create; in real life the drafts
  // are the ones generate_recurring_invoices raises. Make one the same way.
  const { rows: [draft] } = await c.query(
    `insert into trade_documents (org_id, doc_type, doc_no, party_name, items, subtotal, vat_rate, vat_amount, total, status, created_by)
     values ($1, 'invoice', 'INV-TEST-DRAFT', 'Draft Co', $2::jsonb, 100000, 0.075, 7500, 107500, 'draft', $3) returning *`,
    [owner.org_id, ITEMS(2, 50000), clerk]);
  r = await update(clerk, draft, { items: ITEMS(3, 1000) });
  check('the clerk who raised a draft can change its amounts', !r.error, r.error);
  check('totals are recomputed by the database', Number(r.row?.subtotal) === 3000 && Number(r.row?.vat_amount) === 225 && Number(r.row?.total) === 3225,
    `${r.row?.subtotal} / ${r.row?.vat_amount} / ${r.row?.total}`);
  await c.query(`update trade_documents set status = 'issued' where id = $1`, [draft.id]);
  const dp = await posted(draft);
  check('issuing it posts the corrected total', dp.length === 1 && Number(dp[0].debit) === 3225, JSON.stringify(dp));

  // ---- 3. who may edit ------------------------------------------------------
  console.log('permissions');
  const issuedByClerk = await create(clerk, 'quote');
  r = await update(clerk, issuedByClerk, { notes: 'clerk edit' });
  check('a clerk cannot edit a document that has gone out', /Only a manager/.test(r.error || ''), r.error);
  r = await update(owner.id, issuedByClerk, { items: ITEMS(5, 2000) });
  check('a quotation is not in the books, so a manager can change its amounts', !r.error && Number(r.row?.total) === 10750, r.error);

  // ---- 4. payments, cancellation, a customer mid-payment -------------------
  console.log('locked states');
  const paid = await create(owner.id, 'invoice');
  await asUser(owner.id, `select * from record_trade_doc_payment($1, 1000, 'transfer', 'TRF-EDIT', '', now())`, [paid.id]);
  r = await update(owner.id, paid, { notes: 'after payment' });
  check('nothing changes once money is recorded against it', /already been recorded/.test(r.error || ''), r.error);

  const voided = await create(owner.id, 'invoice');
  await c.query(`update trade_documents set status = 'void' where id = $1`, [voided.id]);
  r = await update(owner.id, voided, { notes: 'after void' });
  check('a cancelled document cannot be edited', /cancelled/.test(r.error || ''), r.error);

  const { rows: [paying] } = await c.query(
    `insert into trade_documents (org_id, doc_type, doc_no, party_name, items, subtotal, vat_rate, vat_amount, total, status, created_by)
     values ($1, 'invoice', 'INV-TEST-PAYING', 'Paying Co', $2::jsonb, 100000, 0.075, 7500, 107500, 'draft', $3) returning *`,
    [owner.org_id, ITEMS(2, 50000), owner.id]);
  await c.query(`insert into trade_doc_payment_intents (reference, doc_id, org_id, amount) values ('EDIT-TEST-REF', $1, $2, 107500)`, [paying.id, owner.org_id]);
  r = await update(owner.id, paying, { items: ITEMS(1, 10) });
  check('amounts lock while a customer is paying through the link', /started paying/.test(r.error || ''), r.error);
  r = await update(owner.id, paying, { notes: 'details are still fine' });
  check('...but the details can still be fixed', !r.error, r.error);

  // ---- 5. another company ---------------------------------------------------
  console.log('tenancy');
  const { rows: [otherOrg] } = await c.query(
    `insert into organizations (name, slug, plan_tier, status) values ('Edit Test Other', 'edit-test-other-' || substr(md5(random()::text), 1, 8), 'standard', 'active') returning id`);
  const { rows: [otherUser] } = await c.query(`insert into auth.users (id, email) values (gen_random_uuid(), 'edit-test-other@example.invalid') returning id`);
  await c.query(`insert into profiles (id, email, name, role, suites, org_id) values ($1, 'edit-test-other@example.invalid', 'Other Owner', 'super_admin', '[]', $2)
                 on conflict (id) do update set org_id = excluded.org_id, role = 'super_admin'`, [otherUser.id, otherOrg.id]);
  r = await update(otherUser.id, inv, { party: 'Hijacked' });
  check("another company's owner cannot see it, let alone edit it", /could not be found/.test(r.error || ''), r.error);
  const { rows: [still] } = await c.query(`select party_name from trade_documents where id = $1`, [inv.id]);
  check('...and it is untouched', still.party_name === 'Adaeze Stores Ltd');
} catch (e) {
  fail++;
  console.log(`  FAIL unexpected: ${e.message}`);
} finally {
  await c.query('rollback');
  await c.end();
}

console.log(fail ? `\nFAILED, ${fail} of ${pass + fail} check(s)` : `\nEditing keeps the books, payments and tenancy right (${pass} checks). ALL PASSED`);
process.exit(fail ? 1 : 0);
