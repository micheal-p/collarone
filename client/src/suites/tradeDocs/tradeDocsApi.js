import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';
import { uploadSiteImage } from '../../pages/admin/website/websiteApi.js';

export const getDocuments = () => apiGet('/trade-docs').then((d) => d.documents);
export const createDocument = (body) => apiPost('/trade-docs', body).then((d) => d.document);
export const setDocumentStatus = (id, status) => apiPatch(`/trade-docs/${id}`, { status }).then((d) => d.document);
export const deleteDocument = (id) => apiDelete(`/trade-docs/${id}`);

// Receivables: payments recorded against an invoice
export const getPayments = (docId) => apiGet(`/trade-docs/${docId}/payments`).then((d) => d.payments);
export const recordPayment = (docId, body) => apiPost(`/trade-docs/${docId}/payments`, body).then((d) => d.document);

export const balance = (d) => Math.max(0, (Number(d.total) || 0) - (Number(d.amount_paid) || 0));
export const isOverdue = (d) => !!d.due_date && balance(d) > 0 && d.status !== 'void' && d.status !== 'draft'
  && new Date(d.due_date) < new Date(new Date().toDateString());

// Public share link a customer can open (and pay from) without an account
export const publicInvoiceUrl = (d) => `${window.location.origin}/inv/${d.share_token}`;
export const waDigits = (phone) => String(phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^0/, '234');
export const waShareUrl = (d, orgName) => {
  const msg = `Hello ${d.party_name || ''},\n\nHere is your invoice ${d.doc_no} from ${orgName || 'us'} — total ₦${Number(d.total).toLocaleString('en-NG')}.\n\nView and pay it here: ${publicInvoiceUrl(d)}\n\nThank you.`;
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
};

export const DOC_TYPES = {
  invoice: { label: 'Invoice', prefix: 'INV', needsParty: true, hasVat: true, hasStatus: true, hasDueDate: true },
  receipt: { label: 'Receipt', prefix: 'RCT', needsParty: true, hasVat: true, hasStatus: false, hasDueDate: false },
  grn:     { label: 'GRN (goods received)', prefix: 'GRN', needsParty: true, hasVat: false, hasStatus: false, hasDueDate: false, isStock: true, stockDirection: 'in' },
  srp:     { label: 'SRP (stock release)',  prefix: 'SRP', needsParty: true, hasVat: false, hasStatus: false, hasDueDate: false, isStock: true, stockDirection: 'out' },
};

export const STATUS_LABELS = { draft: 'Draft', issued: 'Issued', part_paid: 'Part-paid', paid: 'Paid', void: 'Void' };

export const money = (n) => n == null ? '' : `₦${Number(n).toLocaleString('en-NG')}`;

export const lineTotal = (items = []) => items.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);

export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

export const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';
