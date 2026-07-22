import { useCallback, useEffect, useState } from 'react';
import * as INV from './inventoryApi.js';
import { createDocument as createTradeDoc, setDocMeta } from '../tradeDocs/tradeDocsApi.js';
import ReturnConditionModal from '../../components/ReturnConditionModal.jsx';
import { ManagerView as AssetsManagerView, StaffView as AssetsStaffView } from '../itassets/ITAssetsApp.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { getStaff } from '../tasks/taskApi.js';
import { EmptyState, Modal, useConfirm, useToast } from '../../components/ui.jsx';

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
    <Modal title="Add warehouse" onClose={onClose}>
      <form onSubmit={submit}>
          <Field label="Name *"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
          <Field label="Location"><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Lagos warehouse" /></Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Add warehouse'}</button>
          </div>
      </form>
    </Modal>
  );
}

function ItemModal({ onClose, onSaved, flash }) {
  const [f, setF] = useState({ sku: '', name: '', unit: 'unit', category: '', reorderLevel: 0, notes: '', forSale: true, forStaffUse: false });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!f.sku.trim() || !f.name.trim()) return flash('Item code and item name are required.', true);
    if (!f.forSale && !f.forStaffUse) return flash('Mark the item for sale, staff use, or both.', true);
    setBusy(true);
    try { const saved = await INV.createItem(f); flash('Item added.'); onSaved(saved); onClose(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add stock item" onClose={onClose} wide>
      <form onSubmit={submit}>
          <div className="form-grid">
            <Field label="Item code *"><input className="input" value={f.sku} onChange={(e) => set('sku', e.target.value)} required autoFocus placeholder="e.g. RICE-50KG" /></Field>
            <Field label="Item name *"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required placeholder="e.g. Rice — 50kg bag" /></Field>
            <Field label="Counted in"><input className="input" value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="e.g. bags, cartons, litres, pieces" /></Field>
            <Field label="Category"><input className="input" value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Raw materials, Drinks" /></Field>
            <Field label="Low-stock alert at"><input className="input" type="number" value={f.reorderLevel} onChange={(e) => set('reorderLevel', e.target.value)} placeholder="e.g. 10" /></Field>
          </div>
          <Field label="What kind of stock is this? *">
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                ['sell', 'Sell stock', 'Products customers buy — store orders and invoices draw it down.', true, false],
                ['staff', 'Staff equipment', 'Taken out by a staff member and returned — tools, gear, uniforms, loaners.', false, true],
                ['both', 'Both', 'Sold to customers AND checked out by staff (e.g. demo units).', true, true],
              ].map(([key, title, hint, sale, staffUse]) => {
                const active = f.forSale === sale && f.forStaffUse === staffUse;
                return (
                  <label key={key} className="card" style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start', border: active ? '2px solid var(--brand)' : undefined }}>
                    <input type="radio" name="itemType" checked={active} onChange={() => { set('forSale', sale); set('forStaffUse', staffUse); }} style={{ marginTop: 3 }} />
                    <span>
                      <span style={{ fontWeight: 650, fontSize: 13.5, display: 'block' }}>{title}</span>
                      <span className="muted" style={{ fontSize: 12.5 }}>{hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Add item'}</button>
          </div>
      </form>
    </Modal>
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
    <Modal title="Record stock movement" onClose={onClose} wide>
      <form onSubmit={submit}>
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
    </Modal>
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
    <Modal title="Reserve stock (booking)" onClose={onClose} wide>
      <form onSubmit={submit}>
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
    </Modal>
  );
}

function TakeoutModal({ items, warehouses, onClose, onSaved, flash }) {
  const staffItems = items.filter((i) => i.for_staff_use);
  const [staff, setStaff] = useState([]);
  const [f, setF] = useState({ itemId: staffItems[0]?.id || '', warehouseId: warehouses[0]?.id || '', quantity: '', staffId: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => { getStaff().then(setStaff).catch(() => setStaff([])); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!f.itemId || !f.warehouseId || !f.quantity || !f.staffId) return flash('Item, warehouse, quantity and staff member are required.', true);
    setBusy(true);
    try {
      const saved = await INV.createTakeout(f);
      const item = items.find((i) => i.id === f.itemId);
      const member = staff.find((s) => s.id === f.staffId);
      // Custody paperwork: a numbered Handover Note on the company letterhead
      // (Invoicing & Trade Docs). Falls back to the plain downloadable form
      // when the org doesn't run that suite.
      try {
        const doc = await createTradeDoc({
          docType: 'handover', partyName: member?.name || '',
          items: [{ description: `${item?.name || 'Item'} (${f.quantity} ${item?.unit || ''})`.trim(), qty: Number(f.quantity), unit_price: 0 }],
          reference: 'Staff takeout', notes: f.notes || 'Return expected.', vatRate: 0,
        });
        flash(`Takeout recorded — handover note ${doc.doc_no} filed in Invoicing & Trade Docs.`);
      } catch {
        INV.generateTakeoutDoc({
          kind: 'Takeout Request', itemName: item?.name || '', quantity: f.quantity, unit: item?.unit || '',
          staffId: f.staffId, staffName: member?.name || '', approverId: saved.approved_by, approverName: saved.approver?.name || 'Approver', notes: f.notes,
        });
        flash('Takeout recorded. Form downloaded — filing to Documents in the background.');
      }
      onSaved(saved);
      onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title="Tag a staff takeout" onClose={onClose} wide>
      <form onSubmit={submit}>
          {staffItems.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>No items are marked "Staff can take out" yet — edit an item to enable this.</p>
          ) : (
            <div className="form-grid">
              <Field label="Item *">
                <select className="select" value={f.itemId} onChange={(e) => set('itemId', e.target.value)} required>
                  {staffItems.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}
                </select>
              </Field>
              <Field label="Warehouse *">
                <select className="select" value={f.warehouseId} onChange={(e) => set('warehouseId', e.target.value)} required>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
              <Field label="Quantity *"><input className="input" type="number" min="0.01" step="0.01" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} required /></Field>
              <Field label="Staff member *">
                <select className="select" value={f.staffId} onChange={(e) => set('staffId', e.target.value)} required>
                  <option value="">— select —</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
                </select>
              </Field>
            </div>
          )}
          <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || staffItems.length === 0}>{busy ? <span className="spinner" /> : 'Tag & issue'}</button>
          </div>
      </form>
    </Modal>
  );
}

export default function InventoryApp({ access }) {
  const isManager = access?.role === 'manager';
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [movements, setMovements] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [takeouts, setTakeouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const orgId = user?.org?.id;
  const [tab, setTab] = useState('items');
  const [typeFilter, setTypeFilter] = useState('all'); // all | sell | staff
  const [returnTarget, setReturnTarget] = useState(null);
  const [itemModal, setItemModal] = useState(false);
  const [whModal, setWhModal] = useState(false);
  const [moveModal, setMoveModal] = useState(false);
  const [reserveModal, setReserveModal] = useState(false);
  const [takeoutModal, setTakeoutModal] = useState(false);
  const { flash, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [i, w, m, r, t] = await Promise.all([INV.getItems(), INV.getWarehouses(), INV.getMovements(), INV.getReservations(), INV.getTakeouts()]);
      setItems(i); setWarehouses(w); setMovements(m); setReservations(r); setTakeouts(t);
    } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const removeItem = async (i) => {
    const ok = await confirm({ title: `Delete ${i.name}?`, message: 'This removes the item and all of its stock records.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await INV.deleteItem(i.id); flash('Item deleted.'); load(); } catch (e) { flash(e.message, true); }
  };

  const lowStock = items.filter(INV.isLowStock);
  const heldReservations = reservations.filter((r) => r.status === 'held');

  const fulfill = async (r) => {
    const ok = await confirm({ title: 'Fulfil this reservation?', message: 'The reserved stock moves out of the warehouse — this cannot be undone.', confirmLabel: 'Fulfil' });
    if (!ok) return;
    try { const saved = await INV.fulfillReservation(r.id); flash('Reservation fulfilled — stock moved out.'); setReservations((rs) => rs.map((x) => (x.id === saved.id ? saved : x))); load(); }
    catch (e) { flash(e.message, true); }
  };
  const release = async (r) => {
    const ok = await confirm({ title: 'Release this reservation?', message: 'The stock becomes available again.', confirmLabel: 'Release' });
    if (!ok) return;
    try { const saved = await INV.releaseReservation(r.id); flash('Reservation released.'); setReservations((rs) => rs.map((x) => (x.id === saved.id ? saved : x))); }
    catch (e) { flash(e.message, true); }
  };

  const activeTakeouts = takeouts.filter((t) => t.status === 'approved');
  // Return goes through the inspection form first (condition, issues, photo),
  // then produces the numbered Goods Return Note carrying that inspection.
  const completeReturn = async (t, { condition, issues, photoUrl }) => {
    const saved = await INV.returnTakeout(t.id);
    const conditionLabel = { optimal: 'Optimal', minor: 'Minor wear', damaged: 'DAMAGED' }[condition] || condition;
    try {
      const doc = await createTradeDoc({
        docType: 'return_note', partyName: t.staff?.name || '',
        items: [{ description: `${t.item?.name || 'Item'} (${t.quantity} ${t.item?.unit || ''})`.trim(), qty: Number(t.quantity), unit_price: 0 }],
        reference: 'Takeout return',
        notes: `Condition: ${conditionLabel}.${issues ? ` Issues: ${issues}` : ''}`, vatRate: 0,
      });
      setDocMeta(doc.id, { condition, issues, photo_url: photoUrl || '' }).catch(() => {});
      flash(`Returned — goods return note ${doc.doc_no} filed in Invoicing & Trade Docs.`);
    } catch {
      INV.generateTakeoutDoc({
        kind: 'Return Form', itemName: t.item?.name || '', quantity: t.quantity, unit: t.item?.unit || '',
        staffId: t.staff_id, staffName: t.staff?.name || '', approverId: t.approved_by, approverName: t.approver?.name || 'Approver', notes: issues,
      });
      flash('Returned. Form downloaded — filing to Documents in the background.');
    }
    setTakeouts((ts) => ts.map((x) => (x.id === saved.id ? saved : x)));
    load();
  };
  const returnTakeout = (t) => setReturnTarget(t);
  const cancelTakeout = async (t) => {
    const ok = await confirm({ title: 'Cancel this takeout?', message: 'The stock returns to inventory.', confirmLabel: 'Cancel takeout', cancelLabel: 'Keep takeout' });
    if (!ok) return;
    try { const saved = await INV.cancelTakeout(t.id); flash('Takeout cancelled.'); setTakeouts((ts) => ts.map((x) => (x.id === saved.id ? saved : x))); load(); }
    catch (e) { flash(e.message, true); }
  };

  return (
    <div className="lv">
      <div className="lv-tabs">
        <button className={`lv-tab ${tab === 'items' ? 'active' : ''}`} onClick={() => setTab('items')}>Items</button>
        <button className={`lv-tab ${tab === 'movements' ? 'active' : ''}`} onClick={() => setTab('movements')}>Movements</button>
        <button className={`lv-tab ${tab === 'bookings' ? 'active' : ''}`} onClick={() => setTab('bookings')}>Bookings{heldReservations.length > 0 ? ` (${heldReservations.length})` : ''}</button>
        <button className={`lv-tab ${tab === 'takeouts' ? 'active' : ''}`} onClick={() => setTab('takeouts')}>Staff Takeouts{activeTakeouts.length > 0 ? ` (${activeTakeouts.length})` : ''}</button>
        <button className={`lv-tab ${tab === 'assets' ? 'active' : ''}`} onClick={() => setTab('assets')}>Company assets</button>
        <button className={`lv-tab ${tab === 'warehouses' ? 'active' : ''}`} onClick={() => setTab('warehouses')}>Warehouses</button>
        {isManager && tab === 'items' && <button className="btn btn-primary lv-apply" onClick={() => setItemModal(true)}>Add item</button>}
        {isManager && tab === 'movements' && items.length > 0 && warehouses.length > 0 && (
          <button className="btn btn-primary lv-apply" onClick={() => setMoveModal(true)}>Record movement</button>
        )}
        {isManager && tab === 'bookings' && items.length > 0 && warehouses.length > 0 && (
          <button className="btn btn-primary lv-apply" onClick={() => setReserveModal(true)}>Reserve stock</button>
        )}
        {isManager && tab === 'takeouts' && warehouses.length > 0 && (
          <button className="btn btn-primary lv-apply" onClick={() => setTakeoutModal(true)}>Tag a takeout</button>
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
        <>
          <div style={{ display: 'flex', gap: 6, margin: '2px 0 12px' }}>
            {[['all', `All (${items.length})`], ['sell', `Sell stock (${items.filter((i) => i.for_sale).length})`], ['staff', `Staff equipment (${items.filter((i) => i.for_staff_use).length})`]].map(([k, label]) => (
              <button key={k} type="button" className="btn btn-ghost" onClick={() => setTypeFilter(k)}
                style={{ padding: '5px 14px', fontSize: 12.5, borderRadius: 100, ...(typeFilter === k ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff' } : {}) }}>
                {label}
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Item code</th><th>Item</th><th>Type</th><th>Category</th><th>On hand</th><th>Available</th><th>Out with staff</th><th>Low-stock alert</th>{isManager && <th></th>}</tr></thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={isManager ? 9 : 8} style={{ padding: 0 }}><EmptyState title="No stock items yet" hint={isManager ? 'Use "Add item" to start tracking stock.' : 'Items will appear here once a manager adds them.'} /></td></tr>}
                {items
                  .filter((i) => (typeFilter === 'sell' ? i.for_sale : typeFilter === 'staff' ? i.for_staff_use : true))
                  .map((i) => {
                    const outQty = activeTakeouts.filter((t) => t.item_id === i.id).reduce((sum, t) => sum + Number(t.quantity), 0);
                    return (
                      <tr key={i.id} style={INV.isLowStock(i) ? { background: '#fff8f8' } : {}}>
                        <td className="muted" style={{ fontSize: 13, fontFamily: 'monospace' }}>{i.sku}</td>
                        <td style={{ fontWeight: 500 }}>{i.name}</td>
                        <td>
                          <span style={{ display: 'inline-flex', gap: 4 }}>
                            {i.for_sale && <span className="badge" style={{ background: '#deecfd', color: '#194b8f' }}>Sell</span>}
                            {i.for_staff_use && <span className="badge" style={{ background: '#f0e6ff', color: '#4f00b3' }}>Staff</span>}
                          </span>
                        </td>
                        <td className="muted" style={{ fontSize: 13 }}>{i.category || '—'}</td>
                        <td className="muted" style={{ fontSize: 13 }}>{INV.totalQuantity(i)} {i.unit}</td>
                        <td className="muted" style={{ fontSize: 13 }}>{i.for_sale ? `${INV.availableQuantity(i, reservations)} ${i.unit}` : '—'}</td>
                        <td className="muted" style={{ fontSize: 13, fontWeight: outQty > 0 ? 650 : 400 }}>{i.for_staff_use ? `${outQty} ${i.unit}` : '—'}</td>
                        <td className="muted" style={{ fontSize: 13 }}>{i.reorder_level}</td>
                        {isManager && <td><button className="iconbtn" onClick={() => removeItem(i)}>Delete</button></td>}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && tab === 'bookings' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Item</th><th>Warehouse</th><th>Qty</th><th>Reference</th><th>Hold until</th><th>Status</th>{isManager && <th></th>}</tr></thead>
            <tbody>
              {reservations.length === 0 && <tr><td colSpan={isManager ? 7 : 6} style={{ padding: 0 }}><EmptyState title="No stock reservations yet" hint="Reserve stock to hold it for a customer or order." /></td></tr>}
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

      {!loading && tab === 'takeouts' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Item</th><th>Staff</th><th>Qty</th><th>Tagged by</th><th>Status</th><th>When</th>{isManager && <th></th>}</tr></thead>
            <tbody>
              {takeouts.length === 0 && <tr><td colSpan={isManager ? 7 : 6} style={{ padding: 0 }}><EmptyState title="No staff takeouts yet" hint="Tag a takeout when a staff member borrows stock." /></td></tr>}
              {takeouts.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 500 }}>{t.item?.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{t.staff?.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{t.quantity}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{t.approver?.name}</td>
                  <td>
                    {t.status === 'approved' ? (() => {
                      const days = Math.floor((Date.now() - new Date(t.created_at).getTime()) / 86400000);
                      const long = days >= 14;
                      return <span className="badge" style={long ? { background: '#fde7e9', color: '#a4262c' } : { background: '#deecfd', color: '#194b8f' }}>out {days === 0 ? 'today' : `${days}d`}</span>;
                    })() : <span className="badge">{t.status}</span>}
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>{INV.fmtDt(t.created_at)}</td>
                  {isManager && (
                    <td style={{ display: 'flex', gap: 6 }}>
                      {t.status === 'approved' && <button className="iconbtn" onClick={() => returnTakeout(t)}>Return</button>}
                      {t.status === 'approved' && <button className="iconbtn" onClick={() => cancelTakeout(t)}>Cancel</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'assets' && (isManager ? <AssetsManagerView flash={flash} /> : <AssetsStaffView flash={flash} />)}

      {!loading && tab === 'movements' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Item</th><th>Type</th><th>Warehouse</th><th>Qty</th><th>Reference</th><th>By</th><th>When</th></tr></thead>
            <tbody>
              {movements.length === 0 && <tr><td colSpan={7} style={{ padding: 0 }}><EmptyState title="No movements recorded yet" hint="Stock in, out and transfers will show here." /></td></tr>}
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
              {warehouses.length === 0 && <tr><td colSpan={2} style={{ padding: 0 }}><EmptyState title="No warehouses yet" hint="Add a warehouse before recording stock." /></td></tr>}
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
      {returnTarget && (
        <ReturnConditionModal
          title="Return inspection"
          itemLabel={`${returnTarget.item?.name || 'Item'} — ${returnTarget.staff?.name || ''}`}
          orgId={orgId} flash={flash}
          onClose={() => setReturnTarget(null)}
          onSubmit={(data) => completeReturn(returnTarget, data)}
        />
      )}
      {takeoutModal && <TakeoutModal items={items} warehouses={warehouses} onClose={() => setTakeoutModal(false)} onSaved={load} flash={flash} />}
      {toastNode}
      {confirmNode}
    </div>
  );
}
