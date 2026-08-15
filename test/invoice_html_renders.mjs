// Guards the server-side trade-document template (client/api/_lib/invoiceHtml.js)
// — the HTML that becomes the DOWNLOADED PDF. It is a hand port of DocPreviewBody
// in TradeDocsApp.jsx; this asserts every document type renders the right money
// treatment and signatures, that tenant data is HTML-escaped, and that no
// placeholder (undefined/NaN/[object Object]) leaks into a customer's file.
//
// Node-only, no browser — the headless render is exercised at deploy/runtime.
import assert from 'node:assert';
import { buildInvoiceHtml } from '../client/api/_lib/invoiceHtml.js';

const settings = {
  company_name: 'Bright Ventures Ltd', address: '18 Awolowo Road, Lagos',
  email: 'a@b.ng', phone: '0803', accent_color: '#0f766e', template_key: 'bold',
  bank_name: 'Kuda', account_name: 'Bright Ventures Ltd', account_number: '2011702713',
  signature_name: 'Chidi Okafor', signature_title: 'Ops Manager',
};
const iso = '2026-08-15T10:00:00.000Z';
const item = (unit) => ({ description: 'Work', qty: 1, unit_price: unit });

const cases = {
  invoice: { doc: { doc_type: 'invoice', doc_no: 'INV-1', created_at: iso, party_name: 'Adaeze', due_date: '2026-08-22', items: [item(100000)], subtotal: 100000, vat_rate: 0.075, vat_amount: 7500, total: 107500, amount_paid: 40000 }, want: ['Invoice', 'Balance due', 'Pay to', 'Amount due', 'tdt-totals-due'] },
  quote: { doc: { doc_type: 'quote', doc_no: 'QUO-1', created_at: iso, party_name: 'Adaeze', items: [item(100000)], subtotal: 100000, vat_rate: 0.075, vat_amount: 7500, total: 107500 }, want: ['Quotation', 'Quoted total'], notWant: ['Pay to', 'Balance due'] },
  receipt: { doc: { doc_type: 'receipt', doc_no: 'RCT-1', created_at: iso, party_name: 'Adaeze', items: [item(100000)], subtotal: 100000, vat_rate: 0.075, vat_amount: 7500, total: 107500, amount_paid: 107500 }, want: ['Receipt', 'Total paid', 'Received with thanks'], notWant: ['Pay to'] },
  grn: { doc: { doc_type: 'grn', doc_no: 'GRN-1', created_at: iso, party_name: 'Supplier', items: [{ description: 'Paper', qty: 5 }] }, want: ['Goods received note', 'Delivered by', 'Received by', 'Store officer', 'Expected'] },
  srp: { doc: { doc_type: 'srp', doc_no: 'SRP-1', created_at: iso, party_name: 'Store', items: [{ description: 'Chairs', qty: 6 }] }, want: ['Stock release note', 'Released by', 'Checked by'] },
  handover: { doc: { doc_type: 'handover', doc_no: 'HOV-1', created_at: iso, party_name: 'Emeka', items: [{ description: 'Laptop', qty: 1 }] }, want: ['Handover note', 'Collected by', 'Condition on return'] },
  return_note: { doc: { doc_type: 'return_note', doc_no: 'RTN-1', created_at: iso, party_name: 'Emeka', items: [{ description: 'Laptop', qty: 1 }] }, want: ['Goods return', 'Returned by'] },
};

let failed = 0;
for (const [type, { doc, want = [], notWant = [] }] of Object.entries(cases)) {
  const html = buildInvoiceHtml({ doc, settings });
  try {
    assert.ok(html.startsWith('<!doctype html>'), 'is a full HTML document');
    assert.ok(html.includes(`tdt-doc tdt-${settings.template_key}`), 'carries the chosen template class');
    assert.ok(html.includes('data-orientation="portrait"'), 'defaults to portrait');
    assert.ok(html.includes('--accent:#0f766e'), 'applies the accent colour');
    for (const w of want) assert.ok(html.includes(w), `${type} must contain "${w}"`);
    for (const n of notWant) assert.ok(!html.includes(n), `${type} must NOT contain "${n}"`);
    for (const leak of ['undefined', 'NaN', '[object Object]', '>null<']) {
      assert.ok(!html.includes(leak), `${type} must not leak "${leak}"`);
    }
    console.log(`  ✓ ${type}`);
  } catch (e) { console.error(`  ✗ ${type}: ${e.message}`); failed++; }
}

// Escaping: a hostile company name / party name must not break the markup.
{
  const html = buildInvoiceHtml({
    doc: { doc_type: 'invoice', doc_no: 'INV-2', created_at: iso, party_name: '<script>alert(1)</script>', items: [item(1000)], subtotal: 1000, vat_rate: 0, vat_amount: 0, total: 1000 },
    settings: { ...settings, company_name: 'A & B <Ltd>' },
  });
  try {
    assert.ok(!html.includes('<script>alert(1)</script>'), 'party name is escaped');
    assert.ok(html.includes('&lt;script&gt;'), 'party name shows escaped');
    assert.ok(html.includes('A &amp; B &lt;Ltd&gt;'), 'company name is escaped');
    console.log('  ✓ escaping');
  } catch (e) { console.error(`  ✗ escaping: ${e.message}`); failed++; }
}

// Orientation flows through.
{
  const html = buildInvoiceHtml({ doc: cases.invoice.doc, settings: { ...settings, orientation: 'landscape' } });
  try { assert.ok(html.includes('data-orientation="landscape"'), 'landscape flows through'); console.log('  ✓ orientation'); }
  catch (e) { console.error(`  ✗ orientation: ${e.message}`); failed++; }
}

if (failed) { console.error(`\nFAILED, ${failed} problem(s)`); process.exit(1); }
console.log('\nEvery trade-document type renders correct HTML. ALL PASSED');
