import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';
import { uploadSiteImage } from '../../pages/admin/website/websiteApi.js';

export const getDocuments = () => apiGet('/trade-docs').then((d) => d.documents);
export const createDocument = (body) => apiPost('/trade-docs', body).then((d) => d.document);
export const setDocumentStatus = (id, status) => apiPatch(`/trade-docs/${id}`, { status }).then((d) => d.document);
// 'monthly' | 'yearly' | null — a scheduled invoice re-raises itself as a
// ready-to-send draft each period (owner reviews, then sends).
export const setRecurring = (id, every) => apiPatch(`/trade-docs/${id}`, { recurEvery: every }).then((d) => d.document);
export const deleteDocument = (id) => apiDelete(`/trade-docs/${id}`);
export const setDocMeta = (id, meta) => apiPost(`/trade-docs/${id}/meta`, { meta }).then((d) => d.document);

// Email an invoice's pay-link to its own customer (server derives recipient).
// Uses the notify function directly (not the facade) — same pattern as the
// site/platform payment functions.
import { getAccessToken } from '../../api/client.ts';
const notify = async (payload) => {
  const r = await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken() || ''}` }, body: JSON.stringify(payload) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'Email failed.');
  return d;
};
export const emailStatus = () => notify({ action: 'status' }).then((d) => Boolean(d.enabled)).catch(() => false);
export const emailInvoice = (docId) => notify({ action: 'invoice', docId });

// Receivables: payments recorded against an invoice
export const getPayments = (docId) => apiGet(`/trade-docs/${docId}/payments`).then((d) => d.payments);
export const recordPayment = (docId, body) => apiPost(`/trade-docs/${docId}/payments`, body).then((d) => d.document);

// Pure, and unit-tested in test/invoice_document_rules.mjs — see docRules.js
export { balance, isOverdue, moneyState } from './docRules.js';

// Public share link a customer can open (and pay from) without an account
export const publicInvoiceUrl = (d) => `${window.location.origin}/inv/${d.share_token}`;
export const waDigits = (phone) => String(phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^0/, '234');
export const waShareUrl = (d, orgName) => {
  const msg = `Hello ${d.party_name || ''},\n\nHere is your invoice ${d.doc_no} from ${orgName || 'us'}, total ₦${Number(d.total).toLocaleString('en-NG')}.\n\nView and pay it here: ${publicInvoiceUrl(d)}\n\nThank you.`;
  const digits = waDigits(d.party_phone);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
};

// Letterhead: logo, address, tagline, signature, and a choice of template —
// shown on every document this org generates.
export const getSettings = () => apiGet('/trade-docs/settings').then((d) => d.settings);
export const saveSettings = (body) => apiPost('/trade-docs/settings', body).then((d) => d.settings);

// Reuses the site-assets bucket already wired up for the website builder —
// same public-image job, no reason to stand up a second bucket for it.
export const uploadLogo = (orgId, file) => uploadSiteImage(orgId, file, 'trade-docs/logo-');
export const uploadSignatureImage = (orgId, file) => uploadSiteImage(orgId, file, 'trade-docs/signature-');

export const TEMPLATES = {
  classic:   { name: 'Classic',   desc: 'Serif, black & white, formal double rule.' },
  modern:    { name: 'Modern',    desc: 'Clean sans-serif with a bold accent border.' },
  bold:      { name: 'Bold',      desc: 'Full-width coloured header band.' },
  minimal:   { name: 'Minimal',   desc: 'Ultra-plain, mono figures, lots of white space.' },
  corporate: { name: 'Corporate', desc: 'Two-column header, shaded table rows.' },
  elegant:   { name: 'Elegant',   desc: 'Serif italic accents, thin gold-toned rule.' },
  ribbon:    { name: 'Ribbon',    desc: 'Soft rounded panels tinted with your brand colour.' },
  slate:     { name: 'Slate',     desc: 'Accent side-rail with structured uppercase labels.' },
  mono:      { name: 'Mono',      desc: 'Monospace worksheet, dashed hairlines, aligned figures.' },
};

export const DOC_TYPES = {
  // demandsPayment: this document asks for money, so it gets the amount-due
  // treatment, the bank details and the overdue stamp. hasVat is NOT the same
  // question — a quote and a receipt both carry VAT and neither is a demand.
  invoice: { label: 'Invoice', prefix: 'INV', needsParty: true, hasVat: true, hasStatus: true, hasDueDate: true, demandsPayment: true },
  // priced paperwork BEFORE the sale — convert to an invoice when they say yes
  quote:   { label: 'Quotation', prefix: 'QUO', needsParty: true, hasVat: true, hasStatus: true, hasDueDate: false },
  // proof that money already arrived; never asks for it
  receipt: { label: 'Receipt', prefix: 'RCT', needsParty: true, hasVat: true, hasStatus: false, hasDueDate: false, isReceipt: true },
  grn:     { label: 'Goods received note', prefix: 'GRN', needsParty: true, hasVat: false, hasStatus: false, hasDueDate: false, isStock: true, stockDirection: 'in' },
  srp:     { label: 'Stock release note',  prefix: 'SRP', needsParty: true, hasVat: false, hasStatus: false, hasDueDate: false, isStock: true, stockDirection: 'out' },
  // custody paperwork — company property changing hands, signed both ways.
  // Auto-generated by Inventory takeouts and IT Asset assignments; can also
  // be raised by hand for anything else that leaves the store.
  handover:    { label: 'Handover note', prefix: 'HOV', needsParty: true, hasVat: false, hasStatus: false, hasDueDate: false, isCustody: true, custodyDirection: 'out' },
  return_note: { label: 'Goods return',  prefix: 'RTN', needsParty: true, hasVat: false, hasStatus: false, hasDueDate: false, isCustody: true, custodyDirection: 'in' },
};

export const STATUS_LABELS = { draft: 'Draft', issued: 'Sent', part_paid: 'Part-paid', paid: 'Paid', void: 'Cancelled' };

export const money = (n) => n == null ? '' : `₦${Number(n).toLocaleString('en-NG')}`;

export const lineTotal = (items = []) => items.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);

export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

export const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

// Download the document as a real PDF file, and file a copy into Documents at
// the same time (the server has the bytes anyway). Returns nothing; it triggers
// the browser download.
export async function downloadPdf(doc) {
  const r = await fetch('/api/invoice-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken() || ''}` },
    body: JSON.stringify({ docId: doc.id, file: true }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.message || 'Could not build the PDF.');
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${String(doc.doc_no || 'document')}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick; revoking immediately can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
