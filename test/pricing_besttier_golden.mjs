// Golden test: the SQL best-tier price (best_plan_kobo) MUST equal the client
// estimator the site shows customers (client/src/pages/Landing.jsx priceFor +
// reduce). If they ever drift, a customer is billed a different number than the
// quote they saw — the exact bug best_plan_kobo was written to kill.
//
// Two layers:
//   1) Always: assert the estimator (source of truth) against hand-verified
//      values, incl. the cases that expose the old "trick".
//   2) If DATABASE_URL is set: call the REAL SQL function for a matrix of
//      suite/staff/month combos and assert it matches the estimator exactly.
//
// Run:  node test/pricing_besttier_golden.mjs
//       DATABASE_URL='postgres://…' node test/pricing_besttier_golden.mjs
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));

// ---- The published seed rate card (kobo), mirrors billing_renewals_pricing.sql
const RATE_CARD = {
  perSeatKobo: 200000,       // ₦2,000/staff
  annualDiscount: 0.15,
  tiers: [
    { key: 'startup',  baseKobo: 1500000, included: 3, extraKobo: 800000 }, // ₦15,000 · 3 · ₦8,000
    { key: 'standard', baseKobo: 2500000, included: 5, extraKobo: 600000 }, // ₦25,000 · 5 · ₦6,000
  ],
};

// ---- SOURCE OF TRUTH: the estimator, transcribed from Landing.jsx ----------
// priceFor(t) = base + max(0, suites-included)*extraFee + staff*perSeat
// best = cheapest priced tier; monthly = priceFor(best); yearly = monthly*12*(1-discount)
function estimatorKobo(rc, seats, suites, months) {
  const priceFor = (t) => t.baseKobo + Math.max(0, suites - t.included) * t.extraKobo + seats * rc.perSeatKobo;
  const best = rc.tiers.reduce((a, b) => (priceFor(b) < priceFor(a) ? b : a));
  const monthly = priceFor(best);
  return months === 12 ? Math.round(monthly * 12 * (1 - rc.annualDiscount)) : monthly * months;
}
const bestTierName = (rc, suites, seats) => {
  const priceFor = (t) => t.baseKobo + Math.max(0, suites - t.included) * t.extraKobo + seats * rc.perSeatKobo;
  return rc.tiers.reduce((a, b) => (priceFor(b) < priceFor(a) ? b : a)).key;
};

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  ✗ ' + msg); failed++; } else { console.log('  ✓ ' + msg); } };
const naira = (kobo) => '₦' + (kobo / 100).toLocaleString('en-NG');

// ---- Layer 1: hand-verified expected values (incl. the trick cases) --------
console.log('Estimator sanity (hand-verified):');
// 3 suites, 10 staff, monthly → Startup base 15,000 + 0 extra + 10*2,000 = 35,000
ok(estimatorKobo(RATE_CARD, 10, 3, 1) === 3500000, `3 suites/10 staff = ${naira(estimatorKobo(RATE_CARD,10,3,1))} (expect ₦35,000)`);
// THE TRICK CASE: 6 suites, 10 staff.
//   Startup: 15,000 + 3*8,000 + 20,000 = 59,000
//   Standard: 25,000 + 1*6,000 + 20,000 = 51,000  → Standard wins, customer pays LESS
ok(bestTierName(RATE_CARD, 6, 10) === 'standard', '6 suites → picks Standard (not stuck on Startup)');
ok(estimatorKobo(RATE_CARD, 10, 6, 1) === 5100000, `6 suites/10 staff = ${naira(estimatorKobo(RATE_CARD,10,6,1))} (expect ₦51,000, the cheaper tier)`);
// 8 suites, 0 staff: Startup 15,000+5*8,000=55,000 vs Standard 25,000+3*6,000=43,000 → 43,000
ok(estimatorKobo(RATE_CARD, 0, 8, 1) === 4300000, `8 suites/0 staff = ${naira(estimatorKobo(RATE_CARD,0,8,1))} (expect ₦43,000)`);
// Annual: 5 suites/10 staff monthly = Standard 25,000 + 20,000 = 45,000; *12*0.85 = 459,000
ok(estimatorKobo(RATE_CARD, 10, 5, 12) === 45900000, `5 suites/10 staff yearly = ${naira(estimatorKobo(RATE_CARD,10,5,12))} (expect ₦459,000 = 15% off)`);

// ---- Layer 2: SQL == estimator across a matrix (only with a live DB) -------
const conn = process.env.DATABASE_URL;
if (!conn) {
  console.log('\n(no DATABASE_URL — skipped the SQL-vs-estimator matrix; run with DATABASE_URL to verify the live function)');
} else {
  const { Client } = require('pg');
  const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log('\nSQL best_plan_kobo() == estimator across matrix:');
  const rc = JSON.stringify(RATE_CARD);
  let checks = 0, mism = 0;
  for (const suites of [1, 2, 3, 4, 5, 6, 7, 8, 10, 14]) {
    for (const seats of [0, 1, 10, 37]) {
      for (const months of [1, 12]) {
        const { rows } = await c.query('select public.best_plan_kobo($1::jsonb,$2,$3,$4) as k', [rc, seats, suites, months]);
        const sql = Number(rows[0].k);
        const est = estimatorKobo(RATE_CARD, seats, suites, months);
        checks++;
        if (sql !== est) { mism++; console.error(`  ✗ suites=${suites} seats=${seats} m=${months}: SQL ${sql} != estimator ${est}`); }
      }
    }
  }
  await c.end();
  ok(mism === 0, `${checks - mism}/${checks} matrix combos match`);
}

console.log(failed ? `\nFAILED (${failed})` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
