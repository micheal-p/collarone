import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';

export const getDocuments = () => apiGet('/trade-docs').then((d) => d.documents);
export const createDocument = (body) => apiPost('/trade-docs', body).then((d) => d.document);
export const setDocumentStatus = (id, status) => apiPatch(`/trade-docs/${id}`, { status }).then((d) => d.document);
export const deleteDocument = (id) => apiDelete(`/trade-docs/${id}`);

export const DOC_TYPES = {
  invoice: { label: 'Invoice', prefix: 'INV', needsParty: true, hasVat: true, hasStatus: true, hasDueDate: true },
  receipt: { label: 'Receipt', prefix: 'RCT', needsParty: true, hasVat: true, hasStatus: false, hasDueDate: false },
  grn:     { label: 'GRN (goods received)', prefix: 'GRN', needsParty: true, hasVat: false, hasStatus: false, hasDueDate: false, isStock: true, stockDirection: 'in' },
  srp:     { label: 'SRP (stock release)',  prefix: 'SRP', needsParty: true, hasVat: false, hasStatus: false, hasDueDate: false, isStock: true, stockDirection: 'out' },
};

export const STATUS_LABELS = { draft: 'Draft', issued: 'Issued', paid: 'Paid', void: 'Void' };

export const money = (n) => n == null ? '' : `₦${Number(n).toLocaleString('en-NG')}`;

export const lineTotal = (items = []) => items.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);

export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

export const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';
