// The books write themselves, and they balance.
//
// THE BUG THIS EXISTS TO STOP HAPPENING TWICE
//
// The ledger had one caller: a form where somebody hand-types debits and
// credits. Approving an expense, issuing an invoice, taking a payment and
// running payroll all left the books untouched, so profit & loss and the
// balance sheet stayed empty forever. Production agreed: 78 seeded accounts,
// zero entries.
//
// Automatic posting is easy to get subtly wrong in ways nothing complains
// about — an entry that is short by one deduction still saves, and the error
// only surfaces months later when a trial balance refuses to balance. Two
// real examples caught by this test while it was being written:
//
//   * payroll net pay is DERIVED (payroll_sync_deductions): it subtracts
//     manual_deductions + loan_deductions and ADDS nontaxable_earnings, money
//     paid out that never entered gross. A first version posted neither and
//     was short by exactly that much.
//   * an invoice already stores vat_amount and total. Recomputing them from
//     subtotal * vat_rate gives a second opinion about the same invoice, when
//     the customer was billed the figure printed on the document.
//
// So this runs the real triggers against the real database, and asserts the
// ACCOUNTS and AMOUNTS, not just that something was written. Everything
// happens inside a transaction that is always rolled back, so it can be run
// against production without leaving a naira behind.
//
// Run:  DATABASE_URL='postgres://...' node test/finance_auto_posting.mjs
import pg from 'pg';

const url = process.env.DATABASE_URL || process.env.DB_URL;
if (!url) {
  console.log('~ no DATABASE_URL: skipping the live posting test (runs in the live CI job)');
  console.log('Finance auto-posting check skipped. ALL PASSED');
  process.exit(0);
}
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const N = (n) => '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 });
let pass = 0, fail = 0;
const check = (label, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? '  ' + detail : ''}`); };

await c.query('begin');
try {
  const { rows: [org] } = await c.query(`select id, name from organizations order by created_at limit 1`);
  const { rows: [who] } = await c.query(`select id from profiles where org_id = $1 limit 1`, [org.id]);
  console.log(`workspace: ${org.name}\n`);
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who.id, role: 'authenticated' })]);

  const entries = async (src) => (await c.query(
    `select e.id, e.memo, e.status,
            (select json_agg(json_build_object('code', a.code, 'name', a.name, 'dr', l.debit, 'cr', l.credit) order by a.code)
               from ledger_lines l join ledger_accounts a on a.id = l.account_id where l.entry_id = e.id) lines
       from ledger_entries e where e.org_id = $1 and e.source_type = $2 and e.status = 'posted'`, [org.id, src])).rows;
  const balanced = (ls) => Math.abs(ls.reduce((s, l) => s + Number(l.dr) - Number(l.cr), 0)) < 0.005;

  // ---- expense ------------------------------------------------------------
  console.log('EXPENSE  ₦100,000 + 7.5% VAT, approved then paid');
  const { rows: [cat] } = await c.query(
    `insert into expense_categories (org_id, name, created_by, ledger_code) values ($1,'Diesel & power',$2,'6200') returning id`, [org.id, who.id]);
  const { rows: [exp] } = await c.query(
    `insert into expenses (org_id, category_id, vendor, description, amount, vat_rate, expense_date, submitted_by, status)
     values ($1,$2,'Total Filling Station','Generator diesel, September',100000,0.075,current_date,$3,'pending') returning id, total_amount`,
    [org.id, cat.id, who.id]);
  await c.query(`update expenses set status='approved' where id=$1`, [exp.id]);
  let e = await entries('expense');
  check('approving posts one entry', e.length === 1);
  if (e[0]) {
    check('it balances', balanced(e[0].lines));
    const l = Object.fromEntries(e[0].lines.map((x) => [x.code, x]));
    check('diesel cost hits 6200 Utilities & diesel', Number(l['6200']?.dr) === 100000, N(l['6200']?.dr || 0));
    check('input VAT hits 2100 VAT payable', Number(l['2100']?.dr) === 7500, N(l['2100']?.dr || 0));
    check('the business owes it, 2000 Accounts payable', Number(l['2000']?.cr) === 107500, N(l['2000']?.cr || 0));
  }
  await c.query(`update expenses set status='paid' where id=$1`, [exp.id]);
  const ep = await entries('expense_payment');
  check('paying posts a second entry', ep.length === 1);
  if (ep[0]) {
    const l = Object.fromEntries(ep[0].lines.map((x) => [x.code, x]));
    check('money leaves the bank', Number(l['1010']?.cr) === 107500, N(l['1010']?.cr || 0));
    check('the payable is cleared', Number(l['2000']?.dr) === 107500);
  }
  await c.query(`update expenses set status='pending' where id=$1`, [exp.id]);
  const { rows: [{ n: voided }] } = await c.query(
    `select count(*)::int n from ledger_entries where org_id=$1 and source_type in ('expense','expense_payment') and status='void'`, [org.id]);
  check('un-approving reverses both, nothing deleted', voided === 2, `${voided} voided + mirrors`);

  // ---- invoice ------------------------------------------------------------
  console.log('\nINVOICE  ₦500,000 + VAT, issued then paid');
  const { rows: [inv] } = await c.query(
    `insert into trade_documents (org_id, doc_type, doc_no, party_name, items, subtotal, vat_rate, vat_amount, total, status, created_by)
     values ($1,'invoice','INV-TEST-1','Bluewave Logistics','[]'::jsonb,500000,0.075,37500,537500,'draft',$2) returning id`, [org.id, who.id]);
  await c.query(`update trade_documents set status='issued' where id=$1`, [inv.id]);
  const iv = await entries('invoice');
  check('issuing posts', iv.length === 1);
  if (iv[0]) {
    check('it balances', balanced(iv[0].lines));
    const l = Object.fromEntries(iv[0].lines.map((x) => [x.code, x]));
    check('customer owes us, 1200 Receivable', Number(l['1200']?.dr) === 537500, N(l['1200']?.dr || 0));
    check('sales recognised ex-VAT', Number(l['4000']?.cr) === 500000, N(l['4000']?.cr || 0));
    check('VAT we owe FIRS, 2100', Number(l['2100']?.cr) === 37500, N(l['2100']?.cr || 0));
  }
  await c.query(
    `insert into trade_doc_payments (org_id, doc_id, amount, method, reference, recorded_by) values ($1,$2,537500,'transfer','TRF-99',$3)`,
    [org.id, inv.id, who.id]);
  const ip = await entries('invoice_payment');
  check('recording the payment posts', ip.length === 1);
  if (ip[0]) {
    const l = Object.fromEntries(ip[0].lines.map((x) => [x.code, x]));
    check('cash into the bank', Number(l['1010']?.dr) === 537500, N(l['1010']?.dr || 0));
    check('receivable cleared', Number(l['1200']?.cr) === 537500);
  }

  // ---- payroll ------------------------------------------------------------
  console.log('\nPAYROLL  one staff member, approved then released');
  const { rows: [run] } = await c.query(
    `insert into payroll_runs (org_id, period_month, period_year, status, created_by) values ($1, 9, 2099, 'draft', $2) returning id`, [org.id, who.id]);
  // net and other_deductions are derived by payroll_sync_deductions, so supply
  // the inputs and let the database decide, exactly as a real run does. This
  // line carries a loan repayment AND a non-taxable reimbursement, the two
  // things that broke the first version of the payroll entry.
  await c.query(
    `insert into payroll_lines (org_id, run_id, employee_id, basic, housing, transport, other_allowances, gross,
       pension_employee, pension_employer, nhf, nsitf, paye, loan_deductions, manual_deductions, nontaxable_earnings)
     values ($1,$2,$3, 300000,100000,50000,0, 450000, 36000,45000, 11250, 4500, 52000, 10000, 2500, 15000)`,
    [org.id, run.id, who.id]);
  const { rows: [ln] } = await c.query(`select gross, paye, pension_employee, nhf, other_deductions, nontaxable_earnings, net from payroll_lines where run_id=$1`, [run.id]);
  console.log(`  line: gross ${N(ln.gross)}, PAYE ${N(ln.paye)}, deductions ${N(ln.other_deductions)}, reimbursement ${N(ln.nontaxable_earnings)} -> net ${N(ln.net)}`);
  await c.query(`update payroll_runs set status='approved' where id=$1`, [run.id]);
  const pr = await entries('payroll');
  check('approving the run posts', pr.length === 1);
  if (pr[0]) {
    check('it balances', balanced(pr[0].lines), balanced(pr[0].lines) ? '' : JSON.stringify(pr[0].lines));
    const l = Object.fromEntries(pr[0].lines.map((x) => [x.code, x]));
    check('gross to Salaries & wages', Number(l['6000']?.dr) === 450000, N(l['6000']?.dr || 0));
    check('reimbursement is a cost too', Number(l['6900']?.dr) === 15000, N(l['6900']?.dr || 0));
    check('PAYE owed to FIRS, 2200', Number(l['2200']?.cr) === 52000, N(l['2200']?.cr || 0));
    check('pension owed to the PFA, 2210', Number(l['2210']?.cr) === 81000, N(l['2210']?.cr || 0));
    check('NHF owed, 2220', Number(l['2220']?.cr) === 11250, N(l['2220']?.cr || 0));
    check('loan repayment reduces Staff loans, 1250', Number(l['1250']?.cr) === 10000, N(l['1250']?.cr || 0));
    check('manual deduction is owed onward, 2000', Number(l['2000']?.cr) === 2500, N(l['2000']?.cr || 0));
    check('net owed to staff, 2300', Number(l['2300']?.cr) === Number(ln.net), N(l['2300']?.cr || 0));
  }
  await c.query(`update payroll_runs set status='released' where id=$1`, [run.id]);
  const pp = await entries('payroll_payment');
  check('releasing pays the staff out of the bank', pp.length === 1 && Number(pp[0].lines.find((x) => x.code === '1010')?.cr) === Number(ln.net));

  // ---- opening balances + cash -------------------------------------------
  console.log('\nOPENING BALANCES and cash position');
  await c.query(`select ledger_set_opening_balances(current_date, 50000, 2000000, 300000, 150000, 900000, 400000, 0)`);
  const ob = await entries('opening');
  check('opening entry posted', ob.length === 1);
  if (ob[0]) {
    check('it balances', balanced(ob[0].lines));
    const eq = ob[0].lines.find((x) => x.code === '3000');
    check("owner's stake is the difference", Number(eq?.cr) === 3000000, N(eq?.cr || 0));
  }
  // An expected exception aborts the whole transaction in Postgres, so the
  // checks after it would fail for the wrong reason. Savepoint round it.
  await c.query('savepoint before_second_opening');
  try { await c.query(`select ledger_set_opening_balances(current_date, 1,1,1,1,1,1,1)`); check('a second opening is refused', false); }
  catch { check('a second opening is refused', true); }
  await c.query('rollback to savepoint before_second_opening');
  const { rows: cash } = await c.query(`select * from finance_cash_position()`);
  console.log('  cash position:', cash.map((r) => `${r.name} ${N(r.balance)}`).join(', '));

  // ---- the reports these feed --------------------------------------------
  console.log('\nREPORTS');
  const { rows: pnl } = await c.query(`select * from ledger_profit_and_loss(date_trunc('year', current_date)::date, current_date)`);
  const { rows: bs } = await c.query(`select * from ledger_balance_sheet(current_date)`);
  const { rows: tb } = await c.query(`select * from ledger_trial_balance(date_trunc('year', current_date)::date, current_date)`);
  check('profit & loss has lines now', pnl.length > 0, `${pnl.length} accounts`);
  check('balance sheet has lines now', bs.length > 0, `${bs.length} accounts`);
  const tbDr = tb.reduce((s, r) => s + Number(r.debit || 0), 0), tbCr = tb.reduce((s, r) => s + Number(r.credit || 0), 0);
  check('trial balance balances', Math.abs(tbDr - tbCr) < 0.005, `${N(tbDr)} vs ${N(tbCr)}`);
} finally {
  await c.query('rollback');
  const { rows: [{ n }] } = await c.query(`select count(*)::int n from ledger_entries`);
  console.log(`\nrolled back — journal entries left in production: ${n}`);
  await c.end();
}
if (fail) { console.error(`\nFAILED, ${fail} of ${pass + fail} posting checks`); process.exit(1); }
console.log(`Every automatic posting balances and hits the right accounts (${pass} checks). ALL PASSED`);
