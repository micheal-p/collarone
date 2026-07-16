import { useCallback, useEffect, useState } from 'react';
import * as INV from './inventoryApi.js';

function Toast({ toast }) { if (!toast) return null; return <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>; }
function Field({ label, children }) { return <div className="field"><label>{label}</label>{children}</div>; }

function WarehouseModal({ onClose, onSaved, flash }) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return flash('Warehouse name is required.', true);
    setBusy(true);
    try { const saved = await INV.createWarehouse({ name, location }); flash('Warehouse added.'); onSaved(saved); onClose(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Add warehouse</h2></div>
        <form className="modal-body" onSubmit={submit}>
          <Field label="Name *"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
          <Field label="Location"><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Lagos warehouse" /></Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Add warehouse'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ItemModal({ onClose, onSaved, flash }) {
  const [f, setF] = useState({ sku: '', name: '', unit: 'unit', category: '', reorderLevel: 0, notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!f.sku.trim() || !f.name.trim()) return flash('SKU and name are required.', true);
    setBusy(true);
    try { const saved = await INV.createItem(f); flash('Item added.'); onSaved(saved); onClose(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Add stock item</h2></div>
        <form className="modal-body" onSubmit={submit}>
          <div className="form-grid">
            <Field label="SKU *"><input className="input" value={f.sku} onChange={(e) => set('sku', e.target.value)} required autoFocus /></Field>
            <Field label="Name *"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required /></Field>
            <Field label="Unit"><input className="input" value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="unit, box, kg…" /></Field>
            <Field label="Category"><input className="input" value={f.category} onChange={(e) => set('category', e.target.value)} /></Field>
            <Field label="Reorder level"><input className="input" type="number" value={f.reorderLevel} onChange={(e) => set('reorderLevel', e.target.value)} /></Field>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Add item'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MovementModal({ items, warehouses, onClose, onSaved, flash }) {
  const [f, setF] = useState({ itemId: items[0]?.id || '', warehouseId: warehouses[0]?.id || '', type: 'in', quantity: '', toWarehouseId: '', reference: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.itemId || !f.warehouseId || !f.quantity) return flash('Item, warehouse and quantity are required.', true);
    setBusy(true);
    try { const saved = await INV.recordMovement(f); flash('Movement recorded.'); onSaved(saved); onClose(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Record stock movement</h2></div>
        <form className="modal-body" onSubmit={submit}>
          <div className="form-grid">
            <Field label="Item *">
              <select className="select" value={f.itemId} onChange={(e) => set('itemId', e.target.value)} required>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}
              </select>
            </Field>
            <Field label="Type">
              <select className="select" value={f.type} onChange={(e) => set('type', e.target.value)}>
                {Object.entries(INV.MOVEMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label={f.type === 'transfer' ? 'From warehouse *' : 'Warehouse *'}>
              <select className="select" value={f.warehouseId} onChange={(e) => set('warehouseId', e.target.value)} required>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            {f.type === 'transfer' && (
              <Field label="To warehouse *">
                <select className="select" value={f.toWarehouseId} onChange={(e) => set('toWarehouseId', e.target.value)} required>
                  <option value="">— Select —</option>
                  {warehouses.filter((w) => w.id !== f.warehouseId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Quantity *"><input className="input" type="number" min="0.01" step="0.01" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} required /></Field>
            <Field label="Reference"><input className="input" value={f.reference} onChange={(e) => set('reference', e.target.value)} placeholder="PO number, invoice…" /></Field>
          </div>
          <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Record movement'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReserveModal({ items, warehouses, onClose, onSaved, flash }) {
  const [f, setF] = useState({ itemId: items[0]?.id || '', warehouseId: warehouses[0]?.id || '', quantity: '', reference: '', notes: '', holdUntil: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.itemId || !f.warehouseId || !f.quantity) return flash('Item, warehouse and quantity are required.', true);
    setBusy(true);
    try { const saved = await INV.reserveStock(f); flash('Stock reserved.'); onSaved(saved); onClose(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Reserve stock (booking)</h2></div>
        <form className="modal-body" onSubmit={submit}>
          <div className="form-grid">
            <Field label="Item *">
              <select className="select" value={f.itemId} onChange={(e) => set('itemId', e.target.value)} required>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}
              </select>
            </Field>
            <Field label="Warehouse *">
              <select className="select" value={f.warehouseId} onChange={(e) => set('warehouseId', e.target.value)} required>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="Quantity *"><input className="input" type="number" min="0.01" step="0.01" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} required /></Field>
            <Field label="Hold until"><input className="input" type="date" value={f.holdUntil} onChange={(e) => set('holdUntil', e.target.value)} /></Field>
            <Field label="Reference"><input className="input" value={f.reference} onChange={(e) => set('reference', e.target.value)} placeholder="Customer name, order number…" /></Field>
          </div>
          <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Reserve stock'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function InventoryApp({ access }) {
  const isManager = access?.role === 'manager';
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [movements, setMovements] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('items');
  const [itemModal, setItemModal] = useState(false);
  const [whModal, setWhModal] = useState(false);
  const [moveModal, setMoveModal] = useState(false);
  const [reserveModal, setReserveModal] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (msg, isErr = false) => { setToast({ msg, isErr }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [i, w, m, r] = await Promise.all([INV.getItems(), INV.getWarehouses(), INV.getMovements(), INV.getReservations()]);
      setItems(i); setWarehouses(w); setMovements(m); setReservations(r);
    } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const removeItem = async (i) => {
    if (!confirm(`Delete ${i.name}?`)) return;
    try { await INV.deleteItem(i.id); flash('Item deleted.'); load(); } catch (e) { flash(e.message, true); }
  };

  const lowStock = items.filter(INV.isLowStock);
  const heldReservations = reservations.filter((r) => r.status === 'held');

  const fulfill = async (r) => {
    try { const saved = await INV.fulfillReservation(r.id); flash('Reservation fulfilled — stock moved out.'); setReservations((rs) => rs.map((x) => (x.id === saved.id ? saved : x))); load(); }
    catch (e) { flash(e.message, true); }
  };
  const release = async (r) => {
    if (!confirm('Release this reservation? The stock becomes available again.')) return;
    try { const saved = await INV.releaseReservation(r.id); flash('Reservation released.'); setReservations((rs) => rs.map((x) => (x.id === saved.id ? saved : x))); }
    catch (e) { flash(e.message, true); }
  };

  return (
    <div className="lv">
      <div className="lv-tabs">
        <button className={`lv-tab ${tab === 'items' ? 'active' : ''}`} onClick={() => setTab('items')}>Items</button>
        <button className={`lv-tab ${tab === 'movements' ? 'active' : ''}`} onClick={() => setTab('movements')}>Movements</button>
        <button className={`lv-tab ${tab === 'bookings' ? 'active' : ''}`} onClick={() => setTab('bookings')}>Bookings{heldReservations.length > 0 ? ` (${heldReservations.length})` : ''}</button>
        <button className={`lv-tab ${tab === 'warehouses' ? 'active' : ''}`} onClick={() => setTab('warehouses')}>Warehouses</button>
        {isManager && tab === 'items' && <button className="btn btn-primary lv-apply" onClick={() => setItemModal(true)}>Add item</button>}
        {isManager && tab === 'movements' && items.length > 0 && warehouses.length > 0 && (
          <button className="btn btn-primary lv-apply" onClick={() => setMoveModal(true)}>Record movement</button>
        )}
        {isManager && tab === 'bookings' && items.length > 0 && warehouses.length > 0 && (
          <button className="btn btn-primary lv-apply" onClick={() => setReserveModal(true)}>Reserve stock</button>
        )}
        {isManager && tab === 'warehouses' && <button className="btn btn-primary lv-apply" onClick={() => setWhModal(true)}>Add warehouse</button>}
      </div>

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {!loading && lowStock.length > 0 && (
        <div style={{ background: '#fff8f4', border: '1px solid #fde7c3', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#8f3b00', margin: '8px 0 16px' }}>
          <strong>{lowStock.length}</strong> item{lowStock.length === 1 ? ' is' : 's are'} at or below reorder level.
        </div>
      )}

      {!loading && tab === 'items' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>SKU</th><th>Name</th><th>Category</th><th>On hand</th><th>Available</th><th>Reorder level</th>{isManager && <th></th>}</tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={isManager ? 7 : 6} className="td-empty">No stock items yet.</td></tr>}
              {items.map((i) => (
                <tr key={i.id} style={INV.isLowStock(i) ? { background: '#fff8f8' } : {}}>
                  <td className="muted" style={{ fontSize: 13, fontFamily: 'monospace' }}>{i.sku}</td>
                  <td style={{ fontWeight: 500 }}>{i.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{i.category || '—'}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{INV.totalQuantity(i)} {i.unit}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{INV.availableQuantity(i, reservations)} {i.unit}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{i.reorder_level}</td>
                  {isManager && <td><button className="iconbtn" onClick={() => removeItem(i)}>Delete</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'bookings' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Item</th><th>Warehouse</th><th>Qty</th><th>Reference</th><th>Hold until</th><th>Status</th>{isManager && <th></th>}</tr></thead>
            <tbody>
              {reservations.length === 0 && <tr><td colSpan={isManager ? 7 : 6} className="td-empty">No stock reservations yet.</td></tr>}
              {reservations.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.item?.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{r.warehouse?.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{r.quantity}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{r.reference || '—'}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{INV.fmtDate(r.hold_until)}</td>
                  <td><span className="badge">{r.status}</span></td>
                  {isManager && (
                    <td style={{ display: 'flex', gap: 6 }}>
                      {r.status === 'held' && <button className="iconbtn" onClick={() => fulfill(r)}>Fulfil</button>}
                      {r.status === 'held' && <button className="iconbtn" onClick={() => release(r)}>Release</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'movements' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Item</th><th>Type</th><th>Warehouse</th><th>Qty</th><th>Reference</th><th>By</th><th>When</th></tr></thead>
            <tbody>
              {movements.length === 0 && <tr><td colSpan={7} className="td-empty">No movements recorded yet.</td></tr>}
              {movements.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.item?.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{INV.MOVEMENT_TYPES[m.type]}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{m.warehouse?.name}{m.toWarehouse ? ` → ${m.toWarehouse.name}` : ''}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{m.quantity}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{m.reference || '—'}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{m.author?.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{INV.fmtDt(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'warehouses' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Location</th></tr></thead>
            <tbody>
              {warehouses.length === 0 && <tr><td colSpan={2} className="td-empty">No warehouses yet.</td></tr>}
              {warehouses.map((w) => (
                <tr key={w.id}><td style={{ fontWeight: 500 }}>{w.name}</td><td className="muted" style={{ fontSize: 13 }}>{w.location || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {itemModal && <ItemModal onClose={() => setItemModal(false)} onSaved={load} flash={flash} />}
      {whModal && <WarehouseModal onClose={() => setWhModal(false)} onSaved={load} flash={flash} />}
      {moveModal && <MovementModal items={items} warehouses={warehouses} onClose={() => setMoveModal(false)} onSaved={load} flash={flash} />}
      {reserveModal && <ReserveModal items={items} warehouses={warehouses} onClose={() => setReserveModal(false)} onSaved={(r) => setReservations((rs) => [r, ...rs])} flash={flash} />}
      <Toast toast={toast} />
    </div>
  );
}
