// What each trade document says about money, per type.
//
// This is not cosmetic. "Amount due" plus bank details on a QUOTATION reads as
// a demand for payment on work nobody has agreed to yet, and an invoice that
// prints its Total while ignoring part-payments overstates what is owed. Both
// were live: the first pass keyed the money block off hasVat, which is true for
// quotes and receipts as well as invoices.
//
// Run:  node test/invoice_document_rules.mjs
import { moneyState, balance, isOverdue } from '../client/src/suites/tradeDocs/docRules.js';

// mirrors DOC_TYPES; kept literal so a change there has to be a change here too
const T = {
  invoice: { hasVat: true, hasDueDate: true, demandsPayment: true },
  quote:   { hasVat: true },
  receipt: { hasVat: true, isReceipt: true },
  grn:     { hasVat: false, isStock: true },
  handover:{ hasVat: false, isCustody: true },
};
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const NEXT_WEEK = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

let failures = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; console.log(`✗ ${label}\n    want ${JSON.stringify(want)}\n    got  ${JSON.stringify(got)}`); }
};
const shape = (m) => ({ show: m.show, label: m.label, showPayTo: m.showPayTo, stamp: m.stamp });

// ---- invoices ---------------------------------------------------------------
check('unpaid invoice asks for the full amount and shows bank details',
  shape(moneyState({ total: 100000, status: 'issued', due_date: NEXT_WEEK }, T.invoice)),
  { show: true, label: 'Amount due', showPayTo: true, stamp: null });

check('part-paid invoice asks for the BALANCE, not the total',
  moneyState({ total: 333250, amount_paid: 100000, status: 'part_paid' }, T.invoice).amount,
  233250);

check('settled invoice stops asking and stamps PAID',
  shape(moneyState({ total: 107500, amount_paid: 107500, status: 'paid' }, T.invoice)),
  { show: true, label: 'Amount paid', showPayTo: false, stamp: 'paid' });

check('overpaid invoice does not show a negative balance',
  moneyState({ total: 1000, amount_paid: 1500, status: 'paid' }, T.invoice).amount, 1000);

check('past-due invoice stamps OVERDUE',
  shape(moneyState({ total: 5000, status: 'issued', due_date: YESTERDAY }, T.invoice)),
  { show: true, label: 'Amount due', showPayTo: true, stamp: 'overdue' });

check('a DRAFT is never overdue, however old',
  moneyState({ total: 5000, status: 'draft', due_date: YESTERDAY }, T.invoice).stamp, null);

check('a VOID invoice is never overdue',
  moneyState({ total: 5000, status: 'void', due_date: YESTERDAY }, T.invoice).stamp, null);

// ---- quotations: priced, but not a demand -----------------------------------
check('a quotation shows its total and NEVER asks to be paid',
  shape(moneyState({ total: 967500, status: 'issued' }, T.quote)),
  { show: true, label: 'Quoted total', showPayTo: false, stamp: null });

// ---- receipts: proof money already arrived ----------------------------------
check('a receipt reads as paid even with no payment rows recorded',
  shape(moneyState({ total: 107500, status: 'issued' }, T.receipt)),
  { show: true, label: 'Amount paid', showPayTo: false, stamp: 'paid' });

// ---- paperwork that carries no money ----------------------------------------
for (const [name, meta] of [['goods received note', T.grn], ['handover note', T.handover]]) {
  check(`a ${name} has no money block at all`,
    shape(moneyState({ total: 0 }, meta)),
    { show: false, label: '', showPayTo: false, stamp: null });
}

// ---- the primitives ---------------------------------------------------------
check('balance never goes negative', balance({ total: 100, amount_paid: 250 }), 0);
check('balance of an empty doc is 0', balance({}), 0);
check('no due date means never overdue', isOverdue({ total: 100, status: 'issued' }), false);

if (failures) {
  console.error(`\nFAILED, ${failures} case(s)`);
  process.exit(1);
}
console.log('Document money rules correct for every type. ALL PASSED');
