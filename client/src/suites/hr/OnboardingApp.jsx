import { useEffect, useMemo, useState } from 'react';
import { useToast, useConfirm, Modal, searchMatcher } from '../../components/ui.jsx';
import * as H from './hrApi.js';
import * as L from './lifecycleApi.js';
import LifecycleTaskList from './LifecycleTaskList.jsx';

const daysPast = (d) => (d ? Math.floor((Date.now() - new Date(`${d}T00:00:00`)) / 86400000) : null);

/* Probation decision — the end of probation is a decision point, not a date
   that quietly passes: confirm (and issue the letter), extend, or exit. */
function DecisionModal({ emp, onClose, onConfirm, onExtend }) {
  const [extendTo, setExtendTo] = useState('');
  const over = daysPast(emp.probationEndDate);
  return (
    <Modal title={`Probation decision — ${emp.name}`} onClose={onClose}>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 14px' }}>
        {emp.name}&rsquo;s probation {over > 0 ? `ended ${over} day${over === 1 ? '' : 's'} ago` : `ends ${H.fmtDate(emp.probationEndDate)}`}.
        Choose how to proceed:
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        <button className="btn btn-primary" onClick={() => onConfirm(true)}>Confirm — and compose the confirmation letter</button>
        <button className="btn btn-ghost" onClick={() => onConfirm(false)}>Confirm without a letter</button>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 8 }}>Extend probation</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" type="date" value={extendTo} onChange={(e) => setExtendTo(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-ghost" disabled={!extendTo} onClick={() => onExtend(extendTo)}>Extend</button>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Not working out? Use the <b>Offboarding</b> tab to start a proper exit instead.
        </p>
      </div>
    </Modal>
  );
}

const I = {
  expand: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>,
  badge:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20.59 13.41L11 3.83V3H4v7h.83l9.58 9.59a2 2 0 0 0 2.83 0l3.35-3.35a2 2 0 0 0 0-2.83z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>,
};

function EmployeeRow({ emp, isHrManager, onProbationChange, onConfirm, flash }) {
  const [expanded, setExpanded] = useState(false);
  const [probation, setProbation] = useState(emp.probationEndDate || '');
  const confirmed = Boolean(emp.confirmedAt);
  const t = H.tenure(emp.startDate);

  return (
    <>
      <tr>
        <td>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button className="iconbtn" onClick={() => setExpanded((v) => !v)} aria-label="Expand"
              style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition:'transform .15s' }}>{I.expand}</button>
            {emp.avatarUrl ? <img src={emp.avatarUrl} alt="" className="avatar sm" style={{ objectFit:'cover' }} /> : <span className="avatar sm">{H.initials(emp.name)}</span>}
            <div>
              <div style={{ fontWeight:500 }}>{emp.name}</div>
              <div className="muted" style={{ fontSize:12 }}>{emp.deptName || '—'}</div>
            </div>
          </div>
        </td>
        <td className="muted" style={{ fontSize:13 }}>{H.fmtDate(emp.startDate)}</td>
        <td className="muted" style={{ fontSize:13 }}>{t || '—'}</td>
        <td>
          {isHrManager ? (
            <input className="input" type="date" value={probation} style={{ fontSize:13, padding:'4px 8px', height:'auto', width:150 }}
              onChange={(e) => setProbation(e.target.value)}
              onBlur={(e) => e.target.value !== (emp.probationEndDate || '') && onProbationChange(emp.id, e.target.value)} />
          ) : (H.fmtDate(emp.probationEndDate) || '—')}
        </td>
        <td>
          {confirmed
            ? <span className="lc-badge lc-exit-done">Confirmed {H.fmtDate(emp.confirmedAt)}</span>
            : isHrManager
              ? (
                <div style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                  <button className={`btn ${daysPast(emp.probationEndDate) > 0 ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize:12, padding:'3px 10px', height:'auto' }} onClick={() => onConfirm(emp)}>{I.badge} Decide</button>
                  {daysPast(emp.probationEndDate) > 0 && <span className="st-pill st-warn">{daysPast(emp.probationEndDate)}d overdue</span>}
                </div>
              )
              : <span className="lc-badge lc-exit-init">Pending</span>}
        </td>
      </tr>
      {expanded && (
        <tr><td colSpan={5} style={{ padding:'0 16px 16px', background:'var(--surface)' }}>
          <LifecycleTaskList employeeId={emp.id} phase="onboarding" canGenerate={isHrManager}
            onGenerated={() => L.generateOnboarding(emp.id)} flash={flash} />
        </td></tr>
      )}
    </>
  );
}

export default function OnboardingApp({ access }) {
  const isHrManager = access?.role === 'manager';
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('pending');
  const { flash, toastNode } = useToast();

  const load = () => { setLoading(true); H.getDirectory().then(setStaff).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line

  const setProbation = async (id, date) => {
    try { await L.setProbation(id, date || null); setStaff((l) => l.map((s) => (s.id === id ? { ...s, probationEndDate: date } : s))); flash('Probation date updated.'); }
    catch (e) { flash(e.message, true); }
  };
  const confirmEmployee = async (id) => {
    try { const u = await L.confirmEmployee(id); setStaff((l) => l.map((s) => (s.id === id ? { ...s, confirmedAt: new Date().toISOString() } : s))); flash(`${u.name} confirmed.`); }
    catch (e) { flash(e.message, true); }
  };

  const view = useMemo(() => {
    let list = staff;
    if (filter === 'pending') list = list.filter((s) => !s.confirmedAt);
    if (q.trim()) { const match = searchMatcher(q); list = list.filter((s) => match(s.name, s.email)); }
    return list;
  }, [staff, filter, q]);

  return (
    <div>
      <div className="filterbar" style={{ marginTop:8 }}>
        <div className="filter-pills">
          <button className={`pill ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>Pending confirmation</button>
          <button className={`pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All staff</button>
        </div>
        <div className="cmd-search" style={{ marginLeft:'auto' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8886" strokeWidth="1.7" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
          <input placeholder="Search staff" value={q} onChange={(e) => setQ(e.target.value)}
            style={{ border:'none', outline:'none', background:'transparent', fontSize:13, marginLeft:6, width:160 }} />
        </div>
        <span className="count">{view.length} of {staff.length}</span>
      </div>
      {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Employee</th><th>Start date</th><th>Tenure</th><th>Probation ends</th><th>Confirmation</th></tr></thead>
            <tbody>
              {view.length === 0 && <tr><td colSpan={5} className="td-empty">No employees found.</td></tr>}
              {view.map((emp) => (
                <EmployeeRow key={emp.id} emp={emp} isHrManager={isHrManager} onProbationChange={setProbation} onConfirm={confirmEmployee} flash={flash} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {toastNode}
    </div>
  );
}
