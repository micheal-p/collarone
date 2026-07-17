import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';

export const getVendors   = () => apiGet('/procurement/vendors').then((d) => d.vendors);
export const createVendor = (body) => apiPost('/procurement/vendors', body).then((d) => d.vendor);
export const editVendor   = (id, body) => apiPatch(`/procurement/vendors/${id}`, body).then((d) => d.vendor);
export const deleteVendor = (id) => apiDelete(`/procurement/vendors/${id}`);

export const getRequests   = () => apiGet('/procurement/requests').then((d) => d.requests);
export const createRequest = (body) => apiPost('/procurement/requests', body).then((d) => d.request);
export const updateRequest = (id, body) => apiPatch(`/procurement/requests/${id}`, body).then((d) => d.request);
export const decideRequest = (id, action) => apiPatch(`/procurement/requests/${id}`, { action }).then((d) => d.request);
export const deleteRequest = (id) => apiDelete(`/procurement/requests/${id}`);

export const STATUS = {
  pending:  { label: 'Pending',  cls: 'pr-s-pending' },
  approved: { label: 'Approved', cls: 'pr-s-approved' },
  rejected: { label: 'Rejected', cls: 'pr-s-rejected' },
  ordered:  { label: 'Ordered',  cls: 'pr-s-ordered' },
  received: { label: 'Received', cls: 'pr-s-received' },
};

export const money = (n) => n == null ? '—' : `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';
