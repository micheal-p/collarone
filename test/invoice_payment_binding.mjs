// A payment reference must only ever credit the invoice it was raised for.
//
// The original `verify` accepted any reference from the request body, asked
// Paystack "is this a real successful charge?", and credited it to whichever
// invoice the caller named. Paystack can only answer for the merchant's
// ACCOUNT, not for a particular invoice — and idempotency was scoped per
// invoice, so one genuine reference could be replayed against every other
// invoice from the same merchant, marking each of them paid. Pay one bill,
// clear them all.
//
// Run:  node test/invoice_payment_binding.mjs
import { readFileSync } from 'node:fs';

const pay = readFileSync(new URL('../client/api/invoice-pay.js', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../client/api/invoice-webhook.js', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/trade_doc_payment_intents.sql', import.meta.url), 'utf8');
const lock = readFileSync(new URL('../supabase/trade_doc_bank_lock.sql', import.meta.url), 'utf8');

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) { failures++; console.log(`✗ ${label}\n    ${detail}`); }
};

// --- binding ---------------------------------------------------------------
check('init records a payment intent',
  /trade_doc_payment_intents'\)\s*\n?\s*\.insert\(\{ reference/.test(pay) || /insert\(\{ reference, doc_id/.test(pay),
  'invoice-pay.js init does not write an intent, so verify has nothing to bind against');

check('verify resolves the intent and matches this invoice',
  /trade_doc_payment_intents/.test(pay) && /intent\.doc_id !== doc\.id/.test(pay),
  'invoice-pay.js verify does not confirm the reference belongs to THIS invoice');

check('verify confirms the echoed reference',
  /tx\.reference \|\| ''\) !== reference/.test(pay),
  "verify does not check Paystack's echoed reference against the requested one");

check('idempotency is global, not per-invoice',
  !/\.eq\('doc_id', doc\.id\)\.eq\('reference'/.test(pay),
  'the already-recorded check still filters on doc_id, so a reference can be replayed onto another invoice');

// --- webhook ---------------------------------------------------------------
check('merchant webhook exists', hook.length > 0, 'client/api/invoice-webhook.js missing');
check('webhook verifies HMAC with the MERCHANT secret',
  /createHmac\('sha512', secret\)/.test(hook) && /decryptSecret\(gw\.secret_key\)/.test(hook),
  'webhook does not verify the signature against the merchant gateway secret');
check('webhook re-verifies server-to-server',
  /transaction\/verify\//.test(hook),
  'webhook trusts the payload without re-verifying against Paystack');
check('webhook resolves the invoice through the intent, not the payload',
  /trade_doc_payment_intents/.test(hook) && /intent\.doc_id/.test(hook),
  'webhook takes the invoice from the payload instead of our own intent record');
check('webhook is idempotent against the browser verify path',
  /\.eq\('reference', reference\)\.eq\('method', 'card'\)/.test(hook),
  'webhook can double-credit a payment the browser already banked');

// --- intents table ---------------------------------------------------------
check('intents table is service-role only',
  /enable row level security/.test(sql) && /revoke all on public\.trade_doc_payment_intents/.test(sql),
  'the intents table is reachable by tenants');

// --- bank account -----------------------------------------------------------
check('bank account change is manager-gated',
  /is_trade_docs_manager\(\)/.test(lock) && /v_bank_changed/.test(lock),
  'any suite holder can still change the bank account printed on invoices');
check('account number must be 10 digits',
  /\[0-9\]\{10\}/.test(lock),
  'a malformed NUBAN can still print on a month of invoices');
check('signature fields survived the rewrite',
  /signature_url/.test(lock) && /signature_title/.test(lock),
  'the rewritten upsert dropped the signature columns — letterheads would lose their signature');

if (failures) {
  console.error(`\nFAILED, ${failures} gap(s) in invoice payment binding`);
  process.exit(1);
}
console.log('Invoice payments bind to their own invoice; webhook verifies per-merchant. ALL PASSED');
