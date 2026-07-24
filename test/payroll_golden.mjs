// Payroll math golden tests — fixed inputs → exact expected outputs for the
// most sensitive code in the app. Guards the 2026 Nigeria Tax Act PAYE engine
// and the statutory deduction rates against silent regressions.
//
// Run:  DATABASE_URL='postgres://…' node test/payroll_golden.mjs
// (the URL is never committed — read from the environment)
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { Client } = require('pg');

const FOUNDING = '00000000-0000-0000-0000-000000000001';
const conn = process.env.DATABASE_URL;
if (!conn) { console.error('Set DATABASE_URL'); process.exit(2); }

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = Number(got) === Number(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  got ${got}, want ${want}`}`);
  ok ? pass++ : fail++;
};

const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await c.connect();
const paye = async (taxable) => Number((await c.query('select public.compute_paye_annual($1, $2) as t', [taxable, FOUNDING])).rows[0].t);
const rate = async (key) => Number((await c.query('select rate from deduction_rates where org_id = $1 and key = $2', [FOUNDING, key])).rows[0]?.rate);

// ---- 1. PAYE bands: 2026 Tax Act schedule (0% ≤₦800k, then 15/18/21/23/25) ----
// Each case is annual taxable income → annual PAYE, computed by hand from the
// marginal bands. A change to any band breaks these.
const cases = [
  [0, 0],
  [800000, 0],            // exactly at the exemption ceiling
  [800001, 0.15],         // first taxable naira → 15% marginal (round to 0.15)
  [3000000, 330000],      // 0.15 * 2,200,000
  [12000000, 1950000],    // 330k + 0.18 * 9,000,000
  [25000000, 4680000],    // 1.95m + 0.21 * 13,000,000
  [50000000, 10430000],   // 4.68m + 0.23 * 25,000,000
  [60000000, 12930000],   // 10.43m + 0.25 * 10,000,000
];
for (const [taxable, want] of cases) eq(`PAYE(${taxable.toLocaleString()})`, await paye(taxable), want);

// ---- 2. statutory deduction rates ----
eq('pension employee = 8%', await rate('pension_employee'), 0.08);
eq('pension employer = 10%', await rate('pension_employer'), 0.10);
eq('NHF = 2.5%', await rate('nhf'), 0.025);
eq('NSITF = 1%', await rate('nsitf'), 0.01);

// ---- 3. full monthly payslip for a sample salary (2026 rules) ----
// basic 250k, housing 80k, transport 40k, other 30k, annual rent 1.2m
{
  const basic = 250000, housing = 80000, transport = 40000, other = 30000, annualRent = 1200000;
  const pensionable = basic + housing + transport;          // 370,000
  const gross = pensionable + other;                        // 400,000
  const pension = Math.round(pensionable * 0.08);           // 29,600
  const nhf = Math.round(basic * 0.025);                    // 6,250
  const rentRelief = Math.min(annualRent * 0.2, 500000);    // 240,000
  const taxableAnnual = gross * 12 - rentRelief - pension * 12 - nhf * 12; // 4,129,800
  const payeAnnual = await paye(taxableAnnual);
  const payeMonthly = Math.round(payeAnnual / 12);
  const net = gross - pension - nhf - payeMonthly;

  eq('sample taxable annual', taxableAnnual, 4129800);
  eq('sample PAYE annual', payeAnnual, 533364);            // 330,000 + 0.18*1,129,800
  eq('sample PAYE monthly', payeMonthly, 44447);
  eq('sample net pay', net, 319703);
}

await c.end();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
