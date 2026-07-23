import { useCallback, useEffect, useMemo, useState } from 'react';
import * as IA from './itAssetsApi.js';
import { createDocument as createTradeDoc, setDocMeta } from '../tradeDocs/tradeDocsApi.js';
import ReturnConditionModal from '../../components/ReturnConditionModal.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { apiGet } from '../../api/client.js';
import { useToast, useConfirm, Modal, EmptyState, searchMatcher } from '../../components/ui.jsx';

const CSS = `
  .ia-badge { display:inline-block; padding:2px 9px; border-radius:10px; font-size:11px; font-weight:700; letter-spacing:.03em; }
  .ia-s-inuse   { background:#deecfd; color:#194b8f; }
  .ia-s-spare   { background:#f3f2f1; color:#605e5c; }
  .ia-s-repair  { background:#fff4ce; color:#7a5200; }
  .ia-s-retired { background:#fde7e9; color:#a4262c; }
`;

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
    <Modal title={asset ? 'Edit asset' : 'Add asset'} onClose={onClose} wide>
      <form onSubmit={submit}>
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
    </Modal>
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
      // Custody paperwork — numbered handover note the employee signs.
      const member = staff.find((x) => x.id === employeeId);
      createTradeDoc({
        docType: 'handover', partyName: member?.name || '',
        items: [{ description: `${asset.name}${asset.serial_number ? ` — SN ${asset.serial_number}` : ''}`, qty: 1, unit_price: 0 }],
        reference: 'IT asset assignment', notes: notes || 'Return on exit or reassignment.', vatRate: 0,
      }).then((doc) => flash(`Asset assigned — handover note ${doc.doc_no} filed in Invoicing & Trade Docs.`))
        .catch(() => flash('Asset assigned.'));
      onSaved(saved); onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Assign ${asset.name}`} onClose={onClose}>
      <form onSubmit={submit}>
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
    </Modal>
  );
}

const HIST_CLS = { assigned: 'ia-s-inuse', returned: 'ia-s-spare', repaired: 'ia-s-repair', retired: 'ia-s-retired', note: 'ia-s-spare' };

function HistoryModal({ asset, onClose, flash }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    IA.getHistory(asset.id).then(setRows).catch((e) => { flash(e.message, true); setRows([]); });
  }, [asset.id, flash]);
  return (
    <Modal title={`History — ${asset.name}`} onClose={onClose}>
      {rows === null && <div className="suite-loading"><div className="boot-spinner" /></div>}
      {rows !== null && rows.length === 0 && (
        <EmptyState title="No history yet" hint="Assign, return, repair and retire actions are recorded here." />
      )}
      {rows !== null && rows.length > 0 && (
        <div>
          {rows.map((h, i) => (
            <div key={h.id} style={{ padding: '10px 0', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--line-strong)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className={`ia-badge ${HIST_CLS[h.action] || 'ia-s-spare'}`}>{IA.HISTORY_ACTIONS[h.action] || h.action}</span>
                {h.employee?.name && <span style={{ fontSize: 13, fontWeight: 500 }}>{h.employee.name}</span>}
                <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>{IA.fmtWhen(h.created_at)}</span>
              </div>
              {h.notes && <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{h.notes}</p>}
              {h.author?.name && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>by {h.author.name}</div>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in_use', label: 'In use' },
  { key: 'spare', label: 'Spare' },
  { key: 'repair', label: 'Repair' },
  { key: 'retired', label: 'Retired' },
];

export function ManagerView({ flash }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [assignFor, setAssignFor] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [returnTarget, setReturnTarget] = useState(null);
  const { user } = useAuth();
  const orgId = user?.org?.id;
  const [q, setQ] = useState('');
  const { confirm, confirmNode } = useConfirm();

  const shown = useMemo(() => {
    const match = searchMatcher(q);
    return assets.filter((a) =>
      (statusFilter === 'all' || a.status === statusFilter)
      && match(a.name, a.asset_tag, a.serial_number, a.employee?.name));
  }, [assets, statusFilter, q]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setAssets(await IA.getAssets()); } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const completeReturn = async (a, { condition, issues, photoUrl }) => {
    const holder = a.employee?.name || '';
    await IA.updateAsset(a.id, { action: 'return' });
    const conditionLabel = { optimal: 'Optimal', minor: 'Minor wear', damaged: 'DAMAGED' }[condition] || condition;
    try {
      const doc = await createTradeDoc({
        docType: 'return_note', partyName: holder,
        items: [{ description: `${a.name}${a.serial_number ? ` — SN ${a.serial_number}` : ''}`, qty: 1, unit_price: 0 }],
        reference: 'IT asset return',
        notes: `Condition: ${conditionLabel}.${issues ? ` Issues: ${issues}` : ''}`, vatRate: 0,
      });
      setDocMeta(doc.id, { condition, issues, photo_url: photoUrl || '' }).catch(() => {});
      flash(`Asset returned — goods return note ${doc.doc_no} filed.`);
    } catch {
      flash('Asset returned.');
    }
    load();
  };
  const returnAsset = (a) => setReturnTarget(a);
  const sendToRepair = async (a) => {
    const res = await confirm({
      title: `Send ${a.name} to repair?`,
      message: 'Status moves to Repair. Use "Back to stock" when it comes back.',
      confirmLabel: 'Send to repair',
      input: { label: 'Note (optional)', placeholder: 'What is wrong with it?' },
    });
    if (!res) return;
    try { await IA.updateAsset(a.id, { action: 'repair', notes: res.value }); flash('Sent to repair.'); load(); } catch (e) { flash(e.message, true); }
  };
  const backToStock = async (a) => {
    try { await IA.updateAsset(a.id, { action: 'return' }); flash('Back in stock as spare.'); load(); } catch (e) { flash(e.message, true); }
  };
  const retireAsset = async (a) => {
    const ok = await confirm({
      title: `Retire ${a.name}?`,
      message: 'The asset moves to Retired — there is no un-retire.',
      confirmLabel: 'Retire', danger: true,
    });
    if (!ok) return;
    try { await IA.updateAsset(a.id, { action: 'retire' }); flash('Asset retired.'); load(); } catch (e) { flash(e.message, true); }
  };
  const removeAsset = async (a) => {
    const ok = await confirm({
      title: `Delete ${a.name}?`,
      message: 'The asset and its assignment history are permanently removed.',
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try { await IA.deleteAsset(a.id); flash('Asset deleted.'); load(); } catch (e) { flash(e.message, true); }
  };

  return (
    <>
      <div className="filterbar" style={{ marginTop: 8 }}>
        <div className="filter-pills">
          {FILTERS.map((f) => (
            <button key={f.key} className={`pill ${statusFilter === f.key ? 'active' : ''}`} onClick={() => setStatusFilter(f.key)}>{f.label}</button>
          ))}
        </div>
        <div className="cmd-search" style={{ marginLeft: 'auto' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input placeholder="Search name, tag, serial, assignee…" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, marginLeft: 6, width: 210 }} />
        </div>
        <span className="count">{shown.length} asset{shown.length === 1 ? '' : 's'}</span>
        <button className="btn btn-primary lv-apply" onClick={() => setModal('new')}>Add asset</button>
      </div>
      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}
      {!loading && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Tag</th><th>Name</th><th>Category</th><th>Cost</th><th>Purchased</th><th>Status</th><th>Assigned to</th><th></th></tr></thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 0 }}>
                  {assets.length === 0
                    ? <EmptyState title="No assets yet" hint="Add an asset to start the register." />
                    : <EmptyState title="No assets match" hint="Try a different filter or search." />}
                </td></tr>
              )}
              {shown.map((a) => (
                <tr key={a.id}>
                  <td className="muted" style={{ fontSize: 13, fontFamily: 'monospace' }}>{a.asset_tag}</td>
                  <td style={{ fontWeight: 500 }}>{a.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{IA.CATEGORIES[a.category]}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{IA.money(a.purchase_cost)}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{IA.fmtDate(a.purchase_date)}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td className="muted" style={{ fontSize: 13 }}>{a.employee?.name || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {!['retired', 'repair'].includes(a.status) && !a.assigned_to && <button className="iconbtn" onClick={() => setAssignFor(a)}>Assign</button>}
                    {a.status !== 'repair' && a.assigned_to && <button className="iconbtn" onClick={() => returnAsset(a)}>Return</button>}
                    {['in_use', 'spare'].includes(a.status) && <button className="iconbtn" onClick={() => sendToRepair(a)}>Send to repair</button>}
                    {a.status === 'repair' && <button className="iconbtn" onClick={() => backToStock(a)}>Back to stock</button>}
                    <button className="iconbtn" onClick={() => setHistoryFor(a)}>History</button>
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
      {historyFor && <HistoryModal asset={historyFor} onClose={() => setHistoryFor(null)} flash={flash} />}
      {returnTarget && (
        <ReturnConditionModal
          title="Return inspection"
          itemLabel={`${returnTarget.name}${returnTarget.serial_number ? ` — SN ${returnTarget.serial_number}` : ''}`}
          orgId={orgId} flash={flash}
          onClose={() => setReturnTarget(null)}
          onSubmit={(data) => completeReturn(returnTarget, data)}
        />
      )}
      {confirmNode}
    </>
  );
}

export function StaffView({ flash }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { IA.getAssets().then(setAssets).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); }, [flash]);
  if (loading) return <div className="suite-loading"><div className="boot-spinner" /></div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Tag</th><th>Name</th><th>Category</th><th>Serial no.</th><th>Status</th></tr></thead>
        <tbody>
          {assets.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 0 }}>
              <EmptyState title="No assets assigned to you" hint="Assets show up here once IT assigns them to you." />
            </td></tr>
          )}
          {assets.map((a) => (
            <tr key={a.id}>
              <td className="muted" style={{ fontSize: 13, fontFamily: 'monospace' }}>{a.asset_tag}</td>
              <td style={{ fontWeight: 500 }}>{a.name}</td>
              <td className="muted" style={{ fontSize: 13 }}>{IA.CATEGORIES[a.category]}</td>
              <td className="muted" style={{ fontSize: 13 }}>{a.serial_number || '—'}</td>
              <td><StatusBadge status={a.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ITAssetsApp({ access }) {
  const isManager = access?.role === 'manager';
  const { flash, toastNode } = useToast();
  return (
    <div className="lv">
      <style>{CSS}</style>
      {isManager ? <ManagerView flash={flash} /> : <StaffView flash={flash} />}
      {toastNode}
    </div>
  );
}
