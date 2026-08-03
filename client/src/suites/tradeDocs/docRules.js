// Pure rules for what a trade document says about money. No imports from the
// API layer, so this can be unit-tested in node — tradeDocsApi.js reaches for
// the browser API client and can't be loaded outside a bundle.
export const balance = (d) => Math.max(0, (Number(d?.total) || 0) - (Number(d?.amount_paid) || 0));

export const isOverdue = (d) => !!d?.due_date && balance(d) > 0 && d.status !== 'void' && d.status !== 'draft'
  && new Date(d.due_date) < new Date(new Date().toDateString());

// What the money block on a document should say. Pulled out of the component
// so it can be tested directly: the rules differ per document type and getting
// them wrong is not cosmetic — an "Amount due" and bank details on a QUOTATION
// reads as a demand for payment on work nobody has agreed to yet.
//
//   invoice  → amount due (or amount paid once settled), bank details, stamps
//   receipt  → amount paid, never a demand, never bank details
//   quote    → the quoted total, no due date, no bank details, no stamp
//   the rest → no money block at all (delivery/custody paperwork)
export function moneyState(doc, meta) {
  const m = meta || {};
  if (!m.hasVat) return { show: false, showPayTo: false, stamp: null, label: '', amount: 0 };

  const total = Number(doc?.total) || 0;
  const bal = balance(doc);
  const settled = total > 0 && bal <= 0;

  if (m.isReceipt) {
    return { show: true, showPayTo: false, stamp: 'paid', label: 'Amount paid', amount: total, settled: true, showTotals: true };
  }
  if (!m.demandsPayment) {           // quotation
    return { show: true, showPayTo: false, stamp: null, label: 'Quoted total', amount: total, settled: false, showTotals: true };
  }
  const overdue = isOverdue(doc);
  return {
    show: true,
    showPayTo: !settled,
    stamp: settled ? 'paid' : overdue ? 'overdue' : null,
    label: settled ? 'Amount paid' : 'Amount due',
    amount: settled ? total : bal,
    settled,
    overdue,
    showTotals: true,
  };
}
