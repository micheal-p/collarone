// Server-side HTML for a trade document, rendered to PDF by htmlToPdf.js so the
// DOWNLOADED file is the exact same template the on-screen preview and browser
// Print use — all six designs, the accent colour, the orientation. It shares
// the one copy of the CSS (templateCss.js) and the one copy of the money rules
// (docRules.js), so preview and download cannot drift. This is the faithful
// port of DocPreviewBody in TradeDocsApp.jsx — keep the two in step.
import { TEMPLATE_CSS } from '../../src/suites/tradeDocs/templateCss.js';
import { moneyState, balance } from '../../src/suites/tradeDocs/docRules.js';
import { amountInWords } from '../../src/lib/amountInWords.js';

// Same catalogue as tradeDocsApi.js DOC_TYPES (label + the flags the layout
// keys off). Reproduced here rather than imported because tradeDocsApi.js pulls
// in the browser Supabase client and can't load under Node.
const DOC_TYPES = {
  invoice: { label: 'Invoice', hasVat: true, hasDueDate: true, demandsPayment: true },
  quote: { label: 'Quotation', hasVat: true, hasDueDate: false },
  receipt: { label: 'Receipt', hasVat: true, hasDueDate: false, isReceipt: true },
  grn: { label: 'Goods received note', hasVat: false, isStock: true, stockDirection: 'in' },
  srp: { label: 'Stock release note', hasVat: false, isStock: true, stockDirection: 'out' },
  handover: { label: 'Handover note', hasVat: false, isCustody: true, custodyDirection: 'out' },
  return_note: { label: 'Goods return', hasVat: false, isCustody: true, custodyDirection: 'in' },
};

const money = (n) => (n == null ? '' : `₦${Number(n).toLocaleString('en-NG')}`);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

// Everything that comes from user/tenant data is escaped before it reaches the
// markup — a company name or note with a < in it must not break the page.
function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const attr = (v) => esc(v);
const when = (cond, html) => (cond ? html : '');

export function buildInvoiceHtml({ doc, settings }) {
  const s = settings || {};
  const meta = DOC_TYPES[doc.doc_type] || {};
  const paid = Number(doc.amount_paid) || 0;
  const bal = balance(doc);
  const mny = moneyState(doc, meta);
  const settled = mny.settled;
  const isCheck = !!(meta.isStock || meta.isCustody);
  const accent = s.accent_color || '#0A0E1A';
  const orientation = s.orientation === 'landscape' ? 'landscape' : 'portrait';
  const tmpl = /^(classic|modern|bold|minimal|corporate|elegant)$/.test(s.template_key || '') ? s.template_key : 'classic';

  const contact = [s.address, s.phone, s.email].filter(Boolean).map(esc).join(' &middot; ');

  const header = `
    <div class="tdt-header">
      <div class="tdt-headleft">
        ${s.logo_url
          ? `<img class="tdt-logo" src="${attr(s.logo_url)}" alt="" /><div class="tdt-company">${esc(s.company_name || 'Your company')}</div>`
          : `<div class="tdt-wordmark">${esc(s.company_name || 'Your company')}</div>`}
        ${when(s.tagline, `<div class="tdt-tagline">${esc(s.tagline)}</div>`)}
        ${when(s.address || s.phone || s.email, `<div class="tdt-contactline">${contact}</div>`)}
      </div>
      <div class="tdt-headright">
        <div class="tdt-doctitle">${esc(meta.label || '')}</div>
        <div class="tdt-docno">${esc(doc.doc_no || '')}</div>
        <div class="tdt-docdate">${esc(fmtDate(doc.created_at))}</div>
      </div>
    </div>`;

  const metaStrip = `
    <div class="tdt-metastrip">
      <div class="tdt-meta"><span class="tdt-label">${meta.stockDirection === 'in' ? 'Received from' : meta.custodyDirection === 'out' ? 'Issued to' : 'Returned by'}</span><strong>${esc(doc.party_name || '—')}</strong></div>
      ${when(doc.reference, `<div class="tdt-meta"><span class="tdt-label">Reference</span><strong>${esc(doc.reference)}</strong></div>`)}
      <div class="tdt-meta"><span class="tdt-label">Date</span><strong>${esc(fmtDate(doc.created_at))}</strong></div>
    </div>`;

  const dueBox = mny.show ? `
    <div class="tdt-duebox${mny.overdue ? ' tdt-duebox-overdue' : ''}${mny.settled ? ' tdt-duebox-paid' : ''}">
      <div class="tdt-label">${esc(mny.label)}</div>
      <div class="tdt-dueamount">${money(mny.amount)}</div>
      ${mny.settled
        ? `<div class="tdt-duemeta">${meta.isReceipt ? 'Received with thanks' : 'Paid in full, thank you'}</div>`
        : (meta.hasDueDate && doc.due_date)
          ? `<div class="tdt-duemeta">${mny.overdue ? 'Overdue since' : 'Due'} ${esc(fmtDate(doc.due_date))}</div>`
          : ''}
    </div>` : '';

  const partyRow = `
    <div class="tdt-partyrow">
      <div>
        <div class="tdt-label">Bill to</div>
        <div class="tdt-partyname">${esc(doc.party_name || '')}</div>
        ${when(doc.party_address, `<div class="tdt-partyline">${esc(doc.party_address)}</div>`)}
        ${when(doc.party_phone, `<div class="tdt-partyline">${esc(doc.party_phone)}</div>`)}
        ${when(doc.party_email, `<div class="tdt-partyline">${esc(doc.party_email)}</div>`)}
        ${when(doc.reference, `<div class="tdt-partyline">Ref: ${esc(doc.reference)}</div>`)}
      </div>
      ${dueBox}
    </div>`;

  const rows = (doc.items || []).map((l, i) => `
    <tr>
      <td class="tdt-idx">${i + 1}</td>
      <td>${esc(l.description || '')}</td>
      <td class="tdt-num">${esc(l.qty ?? '')}</td>
      ${isCheck ? '<td class="tdt-num tdt-blank"></td><td class="tdt-blank"></td>' : ''}
      ${meta.hasVat ? `<td class="tdt-num">${money(l.unit_price)}</td><td class="tdt-num">${money((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}</td>` : ''}
    </tr>`).join('');

  const itemsTable = `
    <table class="table tdt-items${isCheck ? ' tdt-checklist' : ''}">
      <caption class="tdt-visually-hidden">${esc(meta.label || '')} ${esc(doc.doc_no || '')} line items</caption>
      <thead>
        <tr>
          <th scope="col" class="tdt-idx">#</th>
          <th scope="col">Description</th>
          <th scope="col" style="width:78px" class="tdt-num">${isCheck ? 'Expected' : 'Qty'}</th>
          ${isCheck ? '<th scope="col" style="width:78px" class="tdt-num">Received</th><th scope="col" class="tdt-remarks">Remarks</th>' : ''}
          ${meta.hasVat ? '<th scope="col" style="width:110px" class="tdt-num">Unit price</th><th scope="col" style="width:120px" class="tdt-num">Amount</th>' : ''}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  const totals = mny.showTotals ? `
    <div class="tdt-totals">
      <table><tbody>
        <tr><th scope="row">Subtotal</th><td>${money(doc.subtotal)}</td></tr>
        <tr><th scope="row">VAT (${((Number(doc.vat_rate) || 0) * 100).toFixed(1)}%)</th><td>${money(doc.vat_amount)}</td></tr>
        ${meta.demandsPayment ? `
          <tr><th scope="row">Total</th><td>${money(doc.total)}</td></tr>
          ${when(paid > 0, `<tr><th scope="row">Paid</th><td>&minus;${money(paid)}</td></tr>`)}
          <tr class="tdt-spacer" aria-hidden="true"><td colspan="2"></td></tr>
          <tr class="tdt-totals-due"><th scope="row">${settled ? 'Balance' : 'Balance due'}</th><td>${money(bal)}</td></tr>
        ` : `
          <tr class="tdt-spacer" aria-hidden="true"><td colspan="2"></td></tr>
          <tr class="tdt-totals-due"><th scope="row">${meta.isReceipt ? 'Total paid' : 'Total'}</th><td>${money(doc.total)}</td></tr>
        `}
      </tbody></table>
    </div>
    <div class="tdt-words">${esc(mny.wordsLabel)}: ${esc(amountInWords(mny.wordsAmount))}</div>` : '';

  const payBox = (mny.showPayTo && (s.account_number || s.bank_name || s.payment_note)) ? `
    <div class="tdt-paybox">
      <div class="tdt-label">Pay to</div>
      <div class="tdt-pay-grid">
        ${when(s.account_name || s.company_name, `<div class="tdt-pay-item"><span>Account name</span><strong>${esc(s.account_name || s.company_name)}</strong></div>`)}
        ${when(s.bank_name, `<div class="tdt-pay-item"><span>Bank</span><strong>${esc(s.bank_name)}</strong></div>`)}
        ${when(s.account_number, `<div class="tdt-pay-item"><span>Account no.</span><strong>${esc(s.account_number)}</strong></div>`)}
      </div>
      ${when(s.payment_note, `<div class="tdt-paynote">${esc(s.payment_note)}</div>`)}
      ${when(doc.doc_no, `<div class="tdt-paynote">Quote <strong>${esc(doc.doc_no)}</strong> as your payment reference.</div>`)}
    </div>` : '';

  const sigBlock = isCheck ? `
    <div class="tdt-sigblock tdt-sigblock-3">
      <div class="tdt-sig"><div class="tdt-sigline"></div><div class="tdt-sigrole">${meta.stockDirection === 'in' ? 'Delivered by' : 'Released by'}</div><div class="tdt-sigmeta">Name, signature &amp; date</div></div>
      <div class="tdt-sig"><div class="tdt-sigline"></div><div class="tdt-sigrole">${meta.custodyDirection === 'out' ? 'Collected by' : meta.custodyDirection === 'in' ? 'Returned by' : 'Received by'}</div><div class="tdt-sigmeta">${doc.party_name ? `${esc(doc.party_name)}, signature &amp; date` : 'Name, signature &amp; date'}</div></div>
      <div class="tdt-sig"><div class="tdt-sigline"></div><div class="tdt-sigrole">Checked by</div><div class="tdt-sigmeta">${meta.isCustody ? 'Condition on return' : 'Store officer'}</div></div>
    </div>` : `
    <div class="tdt-sigblock">
      <div class="tdt-sig">
        ${s.signature_url ? `<img src="${attr(s.signature_url)}" alt="" />` : '<div class="tdt-sigline"></div>'}
        <div class="tdt-signame">${esc(s.signature_name || '')}</div>
        ${when(s.signature_title, `<div class="tdt-sigtitle">${esc(s.signature_title)}</div>`)}
      </div>
    </div>`;

  const foot = (s.company_name || s.address || s.phone || s.email) ? `
    <div class="tdt-foot">
      ${when([s.address, s.phone, s.email].filter(Boolean).length > 0, `${[s.address, s.phone, s.email].filter(Boolean).map(esc).join(' &middot; ')}<br />`)}
      ${esc(s.company_name || '')}
    </div>` : '';

  const body = `
    <div id="td-print-area" class="tdt-doc tdt-${tmpl}" data-orientation="${orientation}" style="--accent:${attr(accent)}">
      <div class="tdt-band"></div>
      ${when(mny.stamp, `<div class="tdt-stamp${mny.stamp === 'overdue' ? ' tdt-stamp-overdue' : ''}" aria-hidden="true">${mny.stamp === 'paid' ? 'PAID' : 'OVERDUE'}</div>`)}
      ${header}
      <hr class="tdt-rule" />
      ${isCheck ? metaStrip : partyRow}
      ${itemsTable}
      ${totals}
      ${when(doc.notes, `<div class="tdt-notes">${esc(doc.notes)}</div>`)}
      ${payBox}
      ${sigBlock}
      ${foot}
    </div>`;

  return `<!doctype html><html><head><meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; background: #fff; }
      /* print media is emulated during PDF generation, so the @media screen
         page-shape rule in the shared CSS is correctly ignored — the document
         fills the sheet the print margins define. */
      ${TEMPLATE_CSS}
    </style></head><body>${body}</body></html>`;
}

export { DOC_TYPES as HTML_DOC_TYPES };
