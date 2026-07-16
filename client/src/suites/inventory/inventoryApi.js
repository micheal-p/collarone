import { apiGet, apiPost, apiDelete } from '../../api/client.js';

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
