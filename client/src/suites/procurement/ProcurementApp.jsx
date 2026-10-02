import { Fragment, useCallback, useEffect, useState } from 'react';
import * as P from './procurementApi.js';
import { getSettings as getLetterhead } from '../tradeDocs/tradeDocsApi.js';
import { PrintView } from '../tradeDocs/TradeDocsApp.jsx';
import { useToast, useConfirm, Modal, EmptyState } from '../../components/ui.jsx';

const CSS = `
  .pr-badge { display:inline-block; padding:2px 9px; border-radius:10px; font-size:11px; font-weight:700; letter-spacing:.03em; }
  .pr-s-pending  { background:#fff4ce; color:#7a5200; }
  .pr-s-approved { background:#dff6dd; color:#1a6a1a; }
  .pr-s-rejected { background:#fde7e9; color:#a4262c; }
  .pr-s-ordered  { background:#deecfd; color:#194b8f; }
  .pr-s-received { background:#f3f2f1; color:#605e5c; }
`;

function Field({ label, children }) { return <div className="field"><label>{label}</label>{children}</div>; }
function StatusBadge({ status }) { const s = P.STATUS[status] || P.STATUS.pending; return <span className={`pr-badge ${s.cls}`}>{s.label}</span>; }

function VendorModal({ vendor = null, onClose, onSaved, flash }) {
  const [f, setF] = useState(vendor
    ? { name: vendor.name || '', contactName: vendor.contact_name || '', phone: vendor.phone || '', email: vendor.email || '', address: vendor.address || '', notes: vendor.notes || '' }
    : { name: '', contactName: '', phone: '', email: '', address: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return flash('Vendor name is required.', true);
    setBusy(true);
    try {
      const saved = vendor
        ? await P.editVendor(vendor.id, { name: f.name.trim(), phone: f.phone, email: f.email, address: f.address, notes: f.notes })
        : await P.createVendor(f);
      flash(vendor ? 'Vendor updated.' : 'Vendor added.'); onSaved(saved); onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title={vendor ? 'Edit vendor' : 'Add vendor'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Vendor name *"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></Field>
          <Field label="Contact person"><input className="input" value={f.contactName} onChange={(e) => set('contactName', e.target.value)} disabled={!!vendor} title={vendor ? 'Contact person cannot be changed after creation.' : undefined} /></Field>
          <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        </div>
        <Field label="Address"><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></Field>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : (vendor ? 'Save changes' : 'Add vendor')}</button>
        </div>
      </form>
    </Modal>
  );
}

function RequestModal({ vendors, request = null, onClose, onSaved, flash }) {
  const [f, setF] = useState(request
    ? { vendorId: request.vendor?.id || '', itemDescription: request.item_description || '', quantity: request.quantity ?? 1, unitCost: request.unit_cost ?? '', vatRate: request.vat_rate ?? 0.075, notes: request.notes || '' }
    : { vendorId: '', itemDescription: '', quantity: 1, unitCost: '', vatRate: 0.075, notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const total = (Number(f.quantity) || 0) * (Number(f.unitCost) || 0) * (1 + (Number(f.vatRate) || 0));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.itemDescription.trim()) return flash('Item description is required.', true);
    setBusy(true);
    try {
      const saved = request ? await P.updateRequest(request.id, f) : await P.createRequest(f);
      flash(request ? 'Request updated.' : 'Purchase request submitted.'); onSaved(saved); onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title={request ? 'Edit purchase request' : 'New purchase request'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <Field label="Item description *"><input className="input" value={f.itemDescription} onChange={(e) => set('itemDescription', e.target.value)} required autoFocus /></Field>
        <div className="form-grid">
          <Field label="Vendor">
            <select className="select" value={f.vendorId} onChange={(e) => set('vendorId', e.target.value)}>
              <option value="">— No vendor yet —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Quantity"><input className="input" type="number" min="1" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} /></Field>
          <Field label="Unit cost (₦)"><input className="input" type="number" value={f.unitCost} onChange={(e) => set('unitCost', e.target.value)} /></Field>
          <Field label="VAT rate"><input className="input" type="number" step="0.001" value={f.vatRate} onChange={(e) => set('vatRate', e.target.value)} /></Field>
        </div>
        <p style={{ fontSize: 13, margin: '0 0 12px' }}>Total (incl. VAT): <strong>{P.money(total)}</strong></p>
        <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></Field>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : (request ? 'Save changes' : 'Submit request')}</button>
        </div>
      </form>
    </Modal>
  );
}

// Turn approved requests into one purchase order for one supplier. Other
// approved requests for the same supplier are offered as extra lines, since
// suppliers would rather get one order than five.
function OrderModal({ anchor, requests, vendors, onClose, onIssued, flash }) {
  const [vendorId, setVendorId] = useState(anchor.vendor?.id || anchor.vendor_id || '');
  const [picked, setPicked] = useState(() => new Set([anchor.id]));
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  // Same supplier (or none yet) and the same VAT rate: one order is one
  // supplier and one VAT treatment, which the database also insists on.
  const candidates = requests.filter((r) => r.status === 'approved'
    && (!(r.vendor?.id || r.vendor_id) || (r.vendor?.id || r.vendor_id) === vendorId || r.id === anchor.id)
    && Number(r.vat_rate) === Number(anchor.vat_rate));
  const lines = candidates.filter((r) => picked.has(r.id));
  const total = lines.reduce((s, r) => s + (Number(r.total_cost) || 0), 0);
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); n.add(anchor.id); return n; });

  const submit = async (e) => {
    e.preventDefault();
    if (!vendorId) return flash('Choose the supplier this order goes to.', true);
    setBusy(true);
    try {
      const order = await P.issueOrder({ requestIds: lines.map((r) => r.id), vendorId, deliveryDate: deliveryDate || null, notes });
      flash(`${order.doc_no} issued to ${order.party_name}.`);
      onIssued(order);
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title="Issue purchase order" onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Supplier *">
            <select className="select" value={vendorId} onChange={(e) => setVendorId(e.target.value)} required>
              <option value="">— Choose a supplier —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Delivery date"><input className="input" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></Field>
        </div>
        <Field label={candidates.length > 1 ? 'Lines on this order' : 'Line on this order'}>
          <div style={{ display: 'grid', gap: 6 }}>
            {candidates.map((r) => (
              <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 400 }}>
                <input type="checkbox" checked={picked.has(r.id)} disabled={r.id === anchor.id} onChange={() => toggle(r.id)} />
                <span style={{ flex: 1 }}>{r.item_description} <span className="muted">&times;{r.quantity}</span></span>
                <span className="muted">{P.money(r.total_cost)}</span>
              </label>
            ))}
          </div>
        </Field>
        <p style={{ fontSize: 13, margin: '0 0 12px' }}>Order total (incl. VAT): <strong>{P.money(total)}</strong></p>
        <Field label="Notes for the supplier">
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery address, contact on site, payment terms…" style={{ resize: 'vertical', fontFamily: 'inherit' }} />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Issue purchase order'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ProcurementApp({ access }) {
  const isManager = access?.role === 'manager';
  const [requests, setRequests] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('requests');
  const [reqModal, setReqModal] = useState(false);
  const [vendorModal, setVendorModal] = useState(false);
  const [editReq, setEditReq] = useState(null);
  const [editVendor, setEditVendor] = useState(null);
  const [openVendor, setOpenVendor] = useState(null); // vendor id with details row expanded
  const [orderFor, setOrderFor] = useState(null);     // the approved request an order is being issued from
  const [viewOrder, setViewOrder] = useState(null);   // { doc, settings } for the print view
  const { flash, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try { const [r, v] = await Promise.all([P.getRequests(), P.getVendors()]); setRequests(r); setVendors(v); }
    catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const decide = async (r, action) => {
    try { await P.decideRequest(r.id, action); flash(`Request ${action}.`); load(); } catch (e) { flash(e.message, true); }
  };
  const openOrder = async (id) => {
    try {
      const [doc, settings] = await Promise.all([P.getOrder(id), getLetterhead().catch(() => null)]);
      setViewOrder({ doc, settings });
    } catch (e) { flash(e.message, true); }
  };
  const removeRequest = async (r) => {
    const ok = await confirm({
      title: 'Delete request?',
      message: `"${r.item_description}" and its approval history will be permanently removed.`,
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try { await P.deleteRequest(r.id); flash('Request deleted.'); load(); } catch (e) { flash(e.message, true); }
  };
  const removeVendor = async (v) => {
    const ok = await confirm({
      title: `Delete ${v.name}?`,
      message: 'Existing purchase requests that reference this vendor will lose their vendor link.',
      confirmLabel: 'Delete vendor', danger: true,
    });
    if (!ok) return;
    try { await P.deleteVendor(v.id); flash('Vendor deleted.'); load(); } catch (e) { flash(e.message, true); }
  };

  return (
    <div className="lv">
      <style>{CSS}</style>
      <div className="lv-tabs">
        <button className={`lv-tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>Purchase requests</button>
        <button className={`lv-tab ${tab === 'vendors' ? 'active' : ''}`} onClick={() => setTab('vendors')}>Vendors</button>
        {tab === 'requests' && <button className="btn btn-primary lv-apply" onClick={() => setReqModal(true)}>New request</button>}
        {tab === 'vendors' && isManager && <button className="btn btn-primary lv-apply" onClick={() => setVendorModal(true)}>Add vendor</button>}
      </div>

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {!loading && tab === 'requests' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Item</th><th>Vendor</th><th>Requested by</th><th>Requested</th><th className="num">Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {requests.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 0 }}>
                  <EmptyState title="No purchase requests yet" hint="Submit a request to start the approval flow." />
                </td></tr>
              )}
              {requests.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.item_description} <span className="muted">&times;{r.quantity}</span></td>
                  <td className="muted" style={{ fontSize: 13 }}>{r.vendor?.name || '—'}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{r.requester?.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{P.fmtDt(r.created_at)}</td>
                  <td className="muted num" style={{ fontSize: 13 }}>{P.money(r.total_cost)}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {isManager && r.status === 'pending' && (
                      <>
                        <button className="iconbtn" onClick={() => decide(r, 'approved')}>Approve</button>
                        <button className="iconbtn" onClick={() => decide(r, 'rejected')}>Reject</button>
                      </>
                    )}
                    {isManager && r.status === 'approved' && (
                      <>
                        <button className="iconbtn" onClick={() => setOrderFor(r)}>Issue PO</button>
                        <button className="iconbtn" title="Ordered another way, without a purchase order" onClick={() => decide(r, 'ordered')}>Mark ordered</button>
                      </>
                    )}
                    {r.po?.doc_no && <button className="iconbtn" onClick={() => openOrder(r.po.id)}>{r.po.doc_no}</button>}
                    {isManager && r.status === 'ordered' && <button className="iconbtn" onClick={() => decide(r, 'received')}>Mark received</button>}
                    {r.status === 'pending' && <button className="iconbtn" onClick={() => setEditReq(r)}>Edit</button>}
                    {r.approver?.name && (
                      <span className="muted" style={{ fontSize: 11.5 }}>
                        {r.status === 'rejected' ? 'Declined' : 'Approved'} by {r.approver.name}
                        {r.approved_at ? ` on ${new Date(r.approved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                      </span>
                    )}
                    <button className="iconbtn" onClick={() => removeRequest(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'vendors' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Vendor</th><th>Contact</th><th>Phone</th><th>Email</th>{isManager && <th></th>}</tr></thead>
            <tbody>
              {vendors.length === 0 && (
                <tr><td colSpan={isManager ? 5 : 4} style={{ padding: 0 }}>
                  <EmptyState title="No vendors yet" hint={isManager ? 'Add a vendor so requests can reference one.' : 'Vendors will appear here once a manager adds them.'} />
                </td></tr>
              )}
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 500 }}>{v.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{v.contact_name || '—'}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{v.phone || '—'}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{v.email || '—'}</td>
                  {isManager && <td><button className="iconbtn" onClick={() => removeVendor(v)}>Delete</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reqModal && <RequestModal vendors={vendors} onClose={() => setReqModal(false)} onSaved={load} flash={flash} />}
      {/* The Edit button set this state and nothing ever rendered it, so
          clicking Edit on a pending request did nothing at all. RequestModal
          already took a `request` prop for exactly this — it was simply never
          wired up. */}
      {editReq && (
        <RequestModal vendors={vendors} request={editReq}
          onClose={() => setEditReq(null)} onSaved={() => { setEditReq(null); load(); }} flash={flash} />
      )}
      {vendorModal && <VendorModal onClose={() => setVendorModal(false)} onSaved={load} flash={flash} />}
      {orderFor && (
        <OrderModal anchor={orderFor} requests={requests} vendors={vendors} flash={flash}
          onClose={() => setOrderFor(null)}
          onIssued={(order) => { setOrderFor(null); load(); openOrder(order.id); }} />
      )}
      {viewOrder && <PrintView doc={viewOrder.doc} settings={viewOrder.settings} flash={flash} onClose={() => setViewOrder(null)} />}
      {editVendor && (
        <VendorModal vendor={editVendor}
          onClose={() => setEditVendor(null)} onSaved={() => { setEditVendor(null); load(); }} flash={flash} />
      )}
      {confirmNode}
      {toastNode}
    </div>
  );
}
