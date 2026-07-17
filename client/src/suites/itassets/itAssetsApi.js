import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';

export const getAssets   = () => apiGet('/itassets/assets').then((d) => d.assets);
export const createAsset = (body) => apiPost('/itassets/assets', body).then((d) => d.asset);
export const updateAsset = (id, body) => apiPatch(`/itassets/assets/${id}`, body).then((d) => d.asset);
export const deleteAsset = (id) => apiDelete(`/itassets/assets/${id}`);
export const getHistory  = (assetId) => apiGet(`/itassets/history/${assetId}`).then((d) => d.history);

export const CATEGORIES = { laptop: 'Laptop', monitor: 'Monitor', phone: 'Phone', peripheral: 'Peripheral', other: 'Other' };
export const STATUS = {
  in_use:  { label: 'In use',  cls: 'ia-s-inuse' },
  spare:   { label: 'Spare',   cls: 'ia-s-spare' },
  repair:  { label: 'Repair',  cls: 'ia-s-repair' },
  retired: { label: 'Retired', cls: 'ia-s-retired' },
};

export const HISTORY_ACTIONS = { assigned: 'Assigned', returned: 'Returned', repaired: 'Sent to repair', retired: 'Retired', note: 'Note' };

export const fmtDate = (d) => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';
export const fmtWhen = (ts) => ts
  ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';
export const money = (n) => n == null ? '—' : `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
