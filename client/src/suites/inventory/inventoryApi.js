import { apiGet, apiPost, apiDelete } from '../../api/client.js';
import * as D from '../documents/documentsApi.js';

export const getWarehouses  = () => apiGet('/inventory/warehouses').then((d) => d.warehouses);
export const createWarehouse = (body) => apiPost('/inventory/warehouses', body).then((d) => d.warehouse);

export const getItems   = () => apiGet('/inventory/items').then((d) => d.items);
export const createItem = (body) => apiPost('/inventory/items', body).then((d) => d.item);
export const deleteItem = (id) => apiDelete(`/inventory/items/${id}`);

export const getMovements  = () => apiGet('/inventory/movements').then((d) => d.movements);
export const recordMovement = (body) => apiPost('/inventory/movements', body).then((d) => d.movement);

// Bookings — stock reserved against a customer/order before it physically
// leaves the warehouse. "Available" = on-hand minus everything held.
export const getReservations  = () => apiGet('/inventory/reservations').then((d) => d.reservations);
export const reserveStock     = (body) => apiPost('/inventory/reservations', body).then((d) => d.reservation);
export const fulfillReservation = (id) => apiPost(`/inventory/reservations/${id}/fulfill`).then((d) => d.reservation);
export const releaseReservation = (id) => apiPost(`/inventory/reservations/${id}/release`).then((d) => d.reservation);

export const reservedQuantity = (item, reservations) => (reservations || [])
  .filter((r) => r.item_id === item.id && r.status === 'held')
  .reduce((s, r) => s + Number(r.quantity), 0);
export const availableQuantity = (item, reservations) => totalQuantity(item) - reservedQuantity(item, reservations);

export const MOVEMENT_TYPES = { in: 'Stock in', out: 'Stock out', adjustment: 'Adjustment', transfer: 'Transfer' };

export const totalQuantity = (item) => (item.levels || []).reduce((s, l) => s + Number(l.quantity), 0);
export const isLowStock = (item) => totalQuantity(item) <= Number(item.reorder_level);

export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

// hold_until is a plain date (no time) — format it as one, not as a
// timestamp, to avoid a UTC-midnight/local-timezone off-by-one-day look.
export const fmtDate = (d) => d
  ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

// ---- Staff takeouts (not every item is for sale — some are checked out to
// staff and returned, like a loaner asset). ----
export const getTakeouts   = () => apiGet('/inventory/takeouts').then((d) => d.takeouts);
export const createTakeout = (body) => apiPost('/inventory/takeouts', body).then((d) => d.takeout);
export const returnTakeout = (id, notes) => apiPost(`/inventory/takeouts/${id}/return`, { notes }).then((d) => d.takeout);
export const cancelTakeout = (id) => apiPost(`/inventory/takeouts/${id}/cancel`).then((d) => d.takeout);

// The printed issue/return form must carry the tenant's own company name,
// never the platform's. Cached after the first lookup; falls back to a
// neutral label rather than the wrong brand if the call fails.
let orgNamePromise = null;
const getOrgName = () => {
  if (!orgNamePromise) {
    orgNamePromise = apiGet('/me')
      .then((d) => d.user?.org?.name || 'Company')
      .catch(() => { orgNamePromise = null; return 'Company'; });
  }
  return orgNamePromise;
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Downloads immediately in the browser regardless of whether Documents
// filing succeeds — "downloadable" shouldn't depend on a second suite grant.
const downloadHtml = (html, filename) => {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const buildTakeoutHtml = ({ kind, companyName, itemName, quantity, unit, staffName, approverName, date, notes }) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(kind)} — ${esc(itemName)}</title>
<style>body{font-family:Georgia,serif;max-width:640px;margin:40px auto;line-height:1.6;color:#14161a;} h1{font-size:20px;} table{border-collapse:collapse;width:100%;margin:16px 0;} td{padding:6px 10px;border:1px solid #ccc;}</style>
</head><body>
<h1>${esc(kind)}</h1>
<p><strong>${esc(companyName)}</strong></p>
<table>
  <tr><td>Item</td><td>${esc(itemName)}</td></tr>
  <tr><td>Quantity</td><td>${esc(quantity)} ${esc(unit)}</td></tr>
  <tr><td>Staff member</td><td>${esc(staffName)}</td></tr>
  <tr><td>${kind === 'Return Form' ? 'Received by' : 'Approved by'}</td><td>${esc(approverName)}</td></tr>
  <tr><td>Date</td><td>${esc(date)}</td></tr>
  ${notes ? `<tr><td>Notes</td><td>${esc(notes)}</td></tr>` : ''}
</table>
<p>${kind === 'Return Form'
    ? 'This confirms the item above has been returned to inventory.'
    : 'This confirms the item above has been issued to the staff member named, to be returned when no longer needed.'}</p>
</body></html>`;

async function findOrCreateFolder(name) {
  const folders = await D.getFolders();
  const existing = folders.find((f) => f.name === name);
  if (existing) return existing;
  return D.createFolder({ name });
}

// Best-effort — files a copy into Documents (tagged to both the staff member
// and the approving senior worker) but never blocks on it; the browser
// download above is the one guarantee.
const fileTakeoutDoc = async ({ kind, itemName, quantity, unit, staffId, staffName, approverId, approverName, notes }) => {
  const html = buildTakeoutHtml({ kind, companyName: await getOrgName(), itemName, quantity, unit, staffName, approverName, date: new Date().toLocaleDateString('en-GB'), notes });
  const folder = await findOrCreateFolder('Staff Takeouts');
  const safeName = itemName.replace(/[^a-zA-Z0-9]+/g, '-');
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${kind.replace(' ', '-')}-${safeName}-${stamp}.html`;
  const file = new File([html], filename, { type: 'text/html' });
  const { path, size } = await D.uploadFile(file, 'takeouts/');
  const doc = await D.createDocument({ name: `${kind} — ${itemName} — ${stamp}`, folderId: folder.id, filePath: path, fileSize: size, visibility: 'restricted' });
  await Promise.allSettled([D.grantPermission(doc.id, staffId), D.grantPermission(doc.id, approverId)]);
  return doc;
};

// Called from the UI right after create/return succeeds — downloads
// immediately and files a copy, in that order, so the download never waits
// on (or depends on) the filing step.
export const generateTakeoutDoc = async ({ kind, itemName, quantity, unit, staffId, staffName, approverId, approverName, notes }) => {
  const html = buildTakeoutHtml({ kind, companyName: await getOrgName(), itemName, quantity, unit, staffName, approverName, date: new Date().toLocaleDateString('en-GB'), notes });
  const safeName = itemName.replace(/[^a-zA-Z0-9]+/g, '-');
  downloadHtml(html, `${kind.replace(' ', '-')}-${safeName}.html`);
  fileTakeoutDoc({ kind, itemName, quantity, unit, staffId, staffName, approverId, approverName, notes }).catch(() => {});
};
