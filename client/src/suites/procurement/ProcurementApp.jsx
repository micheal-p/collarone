import { useCallback, useEffect, useState } from 'react';
import * as P from './procurementApi.js';
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

function VendorModal({ onClose, onSaved, flash }) {
  const [f, setF] = useState({ name: '', contactName: '', phone: '', email: '', address: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return flash('Vendor name is required.', true);
    setBusy(true);
    try { const saved = await P.createVendor(f); flash('Vendor added.'); onSaved(saved); onClose(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title="Add vendor" onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Vendor name *"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></Field>
          <Field label="Contact person"><input className="input" value={f.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
          <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        </div>
        <Field label="Address"><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></Field>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Add vendor'}</button>
        </div>
      </form>
    </Modal>
  );
}

function RequestModal({ vendors, onClose, onSaved, flash }) {
  const [f, setF] = useState({ vendorId: '', itemDescription: '', quantity: 1, unitCost: '', vatRate: 0.075, notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const total = (Number(f.quantity) || 0) * (Number(f.unitCost) || 0) * (1 + (Number(f.vatRate) || 0));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.itemDescription.trim()) return flash('Item description is required.', true);
    setBusy(true);
    try { const saved = await P.createRequest(f); flash('Purchase request submitted.'); onSaved(saved); onClose(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title="New purchase request" onClose={onClose} wide>
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
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Submit request'}</button>
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
            <thead><tr><th>Item</th><th>Vendor</th><th>Requested by</th><th>Requested</th><th>Total</th><th>Status</th><th></th></tr></thead>
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
                  <td className="muted" style={{ fontSize: 13 }}>{P.money(r.total_cost)}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {isManager && r.status === 'pending' && (
                      <>
                        <button className="iconbtn" onClick={() => decide(r, 'approved')}>Approve</button>
                        <button className="iconbtn" onClick={() => decide(r, 'rejected')}>Reject</button>
                      </>
                    )}
                    {isManager && r.status === 'approved' && <button className="iconbtn" onClick={() => decide(r, 'ordered')}>Mark ordered</button>}
                    {isManager && r.status === 'ordered' && <button className="iconbtn" onClick={() => decide(r, 'received')}>Mark received</button>}
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
      {vendorModal && <VendorModal onClose={() => setVendorModal(false)} onSaved={load} flash={flash} />}
      {confirmNode}
      {toastNode}
    </div>
  );
}
