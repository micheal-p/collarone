import { useEffect, useMemo, useState } from 'react';
import { useToast, useConfirm, Modal } from '../../components/ui.jsx';
import * as L from './lifecycleApi.js';
import LifecycleTaskList from './LifecycleTaskList.jsx';

const I = {
  add:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  expand: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>,
  flag:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
};

/* ---- InitiateModal --------------------------------------------------------------- */
function InitiateModal({ staff, onClose, onSaved, onError }) {
  const [f, setF] = useState({ employeeId:'', reason:'resignation', reasonNotes:'', lastWorkingDay:'' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.employeeId || !f.lastWorkingDay) return onError('Employee and last working day are required.');
    setBusy(true);
    try { onSaved(await L.initiateExit(f)); } catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Initiate exit" onClose={onClose} wide>
      <form onSubmit={submit}>
          <div className="field"><label>Employee</label>
            <select className="select" value={f.employeeId} onChange={(e) => set('employeeId', e.target.value)} required autoFocus>
              <option value="">— Select —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
            </select></div>
          <div className="form-grid">
            <div className="field"><label>Reason</label>
              <select className="select" value={f.reason} onChange={(e) => set('reason', e.target.value)}>
                <option value="resignation">Resignation</option><option value="termination">Termination</option>
                <option value="end_of_contract">End of contract</option><option value="other">Other</option>
              </select></div>
            <div className="field"><label>Last working day</label>
              <input className="input" type="date" value={f.lastWorkingDay} onChange={(e) => set('lastWorkingDay', e.target.value)} required /></div>
          </div>
          <div className="field"><label>Notes <span className="muted">(optional)</span></label>
            <textarea className="input" rows={2} value={f.reasonNotes} onChange={(e) => set('reasonNotes', e.target.value)} style={{ resize:'vertical', fontFamily:'inherit' }} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Start offboarding'}</button>
          </div>
      </form>
    </Modal>
  );
}

/* ---- ExitRow ---------------------------------------------------------------------- */
function ExitRow({ exit: ex, isHrManager, onUpdated, flash, confirm }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const st = L.EXIT_STATUS[ex.status];

  const patch = async (body) => {
    setBusy(true);
    try { onUpdated(await L.updateExit(ex.id, body)); } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  const finalize = async () => {
    const ok = await confirm({
      title: 'Finalize offboarding',
      message: `Finalize offboarding for ${ex.employee?.name}? This disables their login immediately.`,
      confirmLabel: 'Finalize',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try { onUpdated(await L.finalizeExit(ex.id)); flash('Offboarding finalized — account disabled.'); }
    catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  return (
    <>
      <tr>
        <td>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button className="iconbtn" onClick={() => setExpanded((v) => !v)} aria-label="Expand"
              style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition:'transform .15s' }}>{I.expand}</button>
            <div>
              <div style={{ fontWeight:500 }}>{ex.employee?.name}</div>
              <div className="muted" style={{ fontSize:12 }}>{ex.employee?.email}</div>
            </div>
          </div>
        </td>
        <td className="muted" style={{ fontSize:13, textTransform:'capitalize' }}>{ex.reason.replace(/_/g,' ')}</td>
        <td className="muted" style={{ fontSize:13 }}>{L.fmtDate(ex.last_working_day)}</td>
        <td>
          {isHrManager && ex.status !== 'completed' ? (
            <select className="select" value={ex.status} disabled={busy} onChange={(e) => patch({ status: e.target.value })} style={{ fontSize:13, padding:'3px 8px', height:'auto' }}>
              {Object.entries(L.EXIT_STATUS).filter(([k]) => k !== 'completed').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          ) : <span className={`lc-badge ${st.cls}`}>{st.label}</span>}
        </td>
        <td>{isHrManager && ex.status !== 'completed' && (
          <button className="btn btn-ghost" style={{ fontSize:12, padding:'3px 10px' }} onClick={finalize} disabled={busy}>{I.flag} Finalize</button>
        )}</td>
      </tr>
      {expanded && (
        <tr><td colSpan={5} style={{ padding:'0 16px 16px', background:'var(--surface)' }}>
          {ex.reason_notes && <p className="muted" style={{ fontSize:13, margin:'10px 0 0' }}>{ex.reason_notes}</p>}
          {isHrManager && (
            <div className="form-grid" style={{ marginTop:12, maxWidth:600 }}>
              <div className="field"><label>Unused leave (days)</label>
                <input className="input" type="number" step="0.5" defaultValue={ex.unused_leave_days}
                  onBlur={(e) => Number(e.target.value) !== ex.unused_leave_days && patch({ unusedLeaveDays: Number(e.target.value) })} /></div>
              <div className="field"><label>Rehire eligible</label>
                <select className="select" value={ex.rehire_eligible === null ? '' : String(ex.rehire_eligible)}
                  onChange={(e) => patch({ rehireEligible: e.target.value === '' ? null : e.target.value === 'true' })}>
                  <option value="">— Not decided —</option><option value="true">Yes</option><option value="false">No</option>
                </select></div>
            </div>
          )}
          {isHrManager && (
            <div className="field" style={{ marginTop:10 }}><label>Exit interview notes</label>
              <textarea className="input" rows={2} defaultValue={ex.exit_interview_notes}
                onBlur={(e) => e.target.value !== ex.exit_interview_notes && patch({ exitInterviewNotes: e.target.value })}
                style={{ resize:'vertical', fontFamily:'inherit' }} /></div>
          )}
          <div style={{ marginTop:14 }}>
            <LifecycleTaskList employeeId={ex.employee_id} exitId={ex.id} phase="offboarding" canGenerate={false} flash={flash} />
          </div>
        </td></tr>
      )}
    </>
  );
}

/* ---- Main OffboardingApp ------------------------------------------------------------ */
export default function OffboardingApp({ access, staff }) {
  const isHrManager = access?.role === 'manager';
  const [exits, setExits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const { flash, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  const load = () => { setLoading(true); L.getExits().then(setExits).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line

  const upsert = (ex) => setExits((l) => { const i = l.findIndex((x) => x.id === ex.id); return i >= 0 ? l.map((x) => (x.id === ex.id ? ex : x)) : [ex, ...l]; });

  const view = useMemo(() => statusFilter ? exits.filter((x) => x.status === statusFilter) : exits, [exits, statusFilter]);

  return (
    <div>
      <div className="filterbar" style={{ marginTop:8 }}>
        <div className="filter-pills">
          <button className={`pill ${statusFilter === '' ? 'active' : ''}`} onClick={() => setStatusFilter('')}>All</button>
          {Object.entries(L.EXIT_STATUS).map(([k, v]) => (
            <button key={k} className={`pill ${statusFilter === k ? 'active' : ''}`} onClick={() => setStatusFilter(k)}>{v.label}</button>
          ))}
        </div>
        {isHrManager && <button className="btn btn-primary lv-apply" onClick={() => setModal(true)}>{I.add} Initiate exit</button>}
      </div>
      {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Employee</th><th>Reason</th><th>Last working day</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {view.length === 0 && <tr><td colSpan={5} className="td-empty">No exits in progress.</td></tr>}
              {view.map((ex) => <ExitRow key={ex.id} exit={ex} isHrManager={isHrManager} onUpdated={upsert} flash={flash} confirm={confirm} />)}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <InitiateModal staff={staff} onClose={() => setModal(false)}
          onSaved={(ex) => { upsert(ex); setModal(false); flash('Offboarding started — checklist generated.'); }}
          onError={(m) => flash(m, true)} />
      )}
      {confirmNode}
      {toastNode}
    </div>
  );
}
