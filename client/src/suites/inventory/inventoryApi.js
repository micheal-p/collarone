import { apiGet, apiPost, apiDelete } from '../../api/client.js';

export const getWarehouses  = () => apiGet('/inventory/warehouses').then((d) => d.warehouses);
export const createWarehouse = (body) => apiPost('/inventory/warehouses', body).then((d) => d.warehouse);

export const getItems   = () => apiGet('/inventory/items').then((d) => d.items);
export const createItem = (body) => apiPost('/inventory/items', body).then((d) => d.item);
export const deleteItem = (id) => apiDelete(`/inventory/items/${id}`);

export const getMovements  = () => apiGet('/inventory/movements').then((d) => d.movements);
export const recordMovement = (body) => apiPost('/inventory/movements', body).then((d) => d.movement);

export const MOVEMENT_TYPES = { in: 'Stock in', out: 'Stock out', adjustment: 'Adjustment', transfer: 'Transfer' };

export const totalQuantity = (item) => (item.levels || []).reduce((s, l) => s + Number(l.quantity), 0);
export const isLowStock = (item) => totalQuantity(item) <= Number(item.reorder_level);

export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';
