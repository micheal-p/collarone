import { useCallback, useEffect, useState } from 'react';
import * as IA from './itAssetsApi.js';
import { apiGet } from '../../api/client.js';

const CSS = `
  .ia-badge { display:inline-block; padding:2px 9px; border-radius:10px; font-size:11px; font-weight:700; letter-spacing:.03em; }
  .ia-s-inuse   { background:#deecfd; color:#194b8f; }
  .ia-s-spare   { background:#f3f2f1; color:#605e5c; }
  .ia-s-repair  { background:#fff4ce; color:#7a5200; }
  .ia-s-retired { background:#fde7e9; color:#a4262c; }
`;

function Toast({ toast }) { if (!toast) return null; return <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>; }
function Field({ label, children }) { return <div className="field"><label>{label}</label>{children}</div>; }
function StatusBadge({ status }) { const s = IA.STATUS[status] || IA.STATUS.spare; return <span className={`ia-badge ${s.cls}`}>{s.label}</span>; }

function AssetModal({ asset, onClose, onSaved, flash }) {
  const [f, setF] = useState(() => asset
    ? { assetTag: asset.asset_tag, name: asset.name, category: asset.category, serialNumber: asset.serial_number, purchaseDate: asset.purchase_date || '', purchaseCost: asset.purchase_cost || '' }
    : { assetTag: '', name: '', category: 'laptop', serialNumber: '', purchaseDate: '', purchaseCost: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.assetTag.trim() || !f.name.trim()) return flash('Asset tag and name are required.', true);
    setBusy(true);
    try {
      const saved = asset ? await IA.updateAsset(asset.id, f) : await IA.createAsset(f);
      flash(asset ? 'Asset updated.' : 'Asset added.');
      onSaved(saved); onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>{asset ? 'Edit asset' : 'Add asset'}</h2></div>
        <form className="modal-body" onSubmit={submit}>
          <div className="form-grid">
            <Field label="Asset tag *"><input className="input" value={f.assetTag} onChange={(e) => set('assetTag', e.target.value)} required autoFocus /></Field>
            <Field label="Name *"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required /></Field>
            <Field label="Category">
              <select className="select" value={f.category} onChange={(e) => set('category', e.target.value)}>
                {Object.entries(IA.CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Serial number"><input className="input" value={f.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} /></Field>
            <Field label="Purchase date"><input className="input" type="date" value={f.purchaseDate} onChange={(e) => set('purchaseDate', e.target.value)} /></Field>
            <Field label="Purchase cost (₦)"><input className="input" type="number" value={f.purchaseCost} onChange={(e) => set('purchaseCost', e.target.value)} /></Field>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : asset ? 'Save changes' : 'Add asset'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssignModal({ asset, onClose, onSaved, flash }) {
  const [staff, setStaff] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { apiGet('/staff').then((d) => setStaff(d.staff)).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!employeeId) return flash('Select an employee.', true);
    setBusy(true);
    try {
      const saved = await IA.updateAsset(asset.id, { action: 'assign', employeeId, notes });
      flash('Asset assigned.'); onSaved(saved); onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Assign {asset.name}</h2></div>
        <form className="modal-body" onSubmit={submit}>
          <Field label="Employee *">
            <select className="select" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required autoFocus>
              <option value="">— Select —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Notes"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Assign'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ManagerView({ flash }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [assignFor, setAssignFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setAssets(await IA.getAssets()); } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const returnAsset = async (a) => {
    try { await IA.updateAsset(a.id, { action: 'return' }); flash('Asset returned.'); load(); } catch (e) { flash(e.message, true); }
  };
  const retireAsset = async (a) => {
    if (!confirm(`Retire ${a.name}?`)) return;
    try { await IA.updateAsset(a.id, { action: 'retire' }); flash('Asset retired.'); load(); } catch (e) { flash(e.message, true); }
  };
  const removeAsset = async (a) => {
    if (!confirm(`Delete ${a.name} permanently?`)) return;
    try { await IA.deleteAsset(a.id); flash('Asset deleted.'); load(); } catch (e) { flash(e.message, true); }
  };

  return (
    <>
      <div className="filterbar" style={{ marginTop: 8 }}>
        <span className="count">{assets.length} asset{assets.length === 1 ? '' : 's'}</span>
        <button className="btn btn-primary lv-apply" onClick={() => setModal('new')}>Add asset</button>
      </div>
      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}
      {!loading && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Tag</th><th>Name</th><th>Category</th><th>Status</th><th>Assigned to</th><th></th></tr></thead>
            <tbody>
              {assets.length === 0 && <tr><td colSpan={6} className="td-empty">No assets yet.</td></tr>}
              {assets.map((a) => (
                <tr key={a.id}>
                  <td className="muted" style={{ fontSize: 13, fontFamily: 'monospace' }}>{a.asset_tag}</td>
                  <td style={{ fontWeight: 500 }}>{a.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{IA.CATEGORIES[a.category]}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td className="muted" style={{ fontSize: 13 }}>{a.employee?.name || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {a.status !== 'retired' && !a.assigned_to && <button className="iconbtn" onClick={() => setAssignFor(a)}>Assign</button>}
                    {a.assigned_to && <button className="iconbtn" onClick={() => returnAsset(a)}>Return</button>}
                    <button className="iconbtn" onClick={() => setModal(a)}>Edit</button>
                    {a.status !== 'retired' && <button className="iconbtn" onClick={() => retireAsset(a)}>Retire</button>}
                    <button className="iconbtn" onClick={() => removeAsset(a)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(modal === 'new' || (modal && modal !== 'new')) && (
        <AssetModal asset={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={load} flash={flash} />
      )}
      {assignFor && <AssignModal asset={assignFor} onClose={() => setAssignFor(null)} onSaved={load} flash={flash} />}
    </>
  );
}

function StaffView({ flash }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { IA.getAssets().then(setAssets).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); }, [flash]);
  if (loading) return <div className="suite-loading"><div className="boot-spinner" /></div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Tag</th><th>Name</th><th>Category</th><th>Serial no.</th></tr></thead>
        <tbody>
          {assets.length === 0 && <tr><td colSpan={4} className="td-empty">No assets assigned to you.</td></tr>}
          {assets.map((a) => (
            <tr key={a.id}>
              <td className="muted" style={{ fontSize: 13, fontFamily: 'monospace' }}>{a.asset_tag}</td>
              <td style={{ fontWeight: 500 }}>{a.name}</td>
              <td className="muted" style={{ fontSize: 13 }}>{IA.CATEGORIES[a.category]}</td>
              <td className="muted" style={{ fontSize: 13 }}>{a.serial_number || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ITAssetsApp({ access }) {
  const isManager = access?.role === 'manager';
  const [toast, setToast] = useState(null);
  const flash = (msg, isErr = false) => { setToast({ msg, isErr }); setTimeout(() => setToast(null), 3000); };
  return (
    <div className="lv">
      <style>{CSS}</style>
      {isManager ? <ManagerView flash={flash} /> : <StaffView flash={flash} />}
      <Toast toast={toast} />
    </div>
  );
}
