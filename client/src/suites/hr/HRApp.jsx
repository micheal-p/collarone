import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../api/client.js';
import { useToast, Modal, EmptyState, searchMatcher } from '../../components/ui.jsx';
import * as H from './hrApi.js';
import RecruitingApp, { MyInterviewsView } from './RecruitingApp.jsx';
import EmployeeRecord from './EmployeeRecord.jsx';
import LettersApp from './LettersApp.jsx';
import OnboardingApp from './OnboardingApp.jsx';
import OffboardingApp from './OffboardingApp.jsx';
import PerformanceApp from './PerformanceApp.jsx';
import ComplianceApp from './ComplianceApp.jsx';

/* ---- icons ---------------------------------------------------------------- */
const I = {
  chevDown:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>,
  chevRight: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>,
  edit:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2 2 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>,
  mail:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 4h16v16H4z"/><path d="M4 6l8 7 8-7"/></svg>,
  phone: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .6 3a2 2 0 0 1-.5 2L8 10a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2-.5c1 .3 2 .5 3 .6a2 2 0 0 1 1.7 2z"/></svg>,
};

/* ---- EditModal (hr manager only) ------------------------------------------ */
function EditModal({ emp, staff, departments, onClose, onSaved, onError }) {
  const [f, setF] = useState({
    jobTitle:       emp.jobTitle || '',
    departmentId:   emp.departmentId || '',
    managerId:      emp.managerId || '',
    startDate:      emp.startDate || '',
    employmentType: emp.employmentType || 'full_time',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const managerOptions = staff.filter((s) => s.id !== emp.id);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await H.updateEmployee(emp.id, {
        jobTitle: f.jobTitle.trim(),
        departmentId: f.departmentId ? Number(f.departmentId) : null,
        managerId: f.managerId || null,
        startDate: f.startDate || null,
        employmentType: f.employmentType,
      });
      onSaved(saved);
    } catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Edit employment — ${emp.name}`} onClose={onClose} wide>
      <form onSubmit={submit}>
          <div className="field"><label>Job title</label>
            <input className="input" value={f.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} autoFocus />
          </div>
          <div className="form-grid">
            <div className="field"><label>Department</label>
              <select className="select" value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                <option value="">— None —</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Reports to</label>
              <select className="select" value={f.managerId} onChange={(e) => set('managerId', e.target.value)}>
                <option value="">— None —</option>
                {managerOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-grid">
            <div className="field"><label>Start date</label>
              <input className="input" type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </div>
            <div className="field"><label>Employment type</label>
              <select className="select" value={f.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
                {Object.entries(H.EMPLOYMENT_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Save'}</button>
          </div>
      </form>
    </Modal>
  );
}

/* ---- ProfileModal (read-only detail, everyone) ----------------------------- */
function ProfileModal({ emp, canEdit, onClose, onEdit }) {
  const t = H.tenure(emp.startDate);
  return (
    <Modal title="Employee profile" onClose={onClose}>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:18 }}>
            {emp.avatarUrl
              ? <img src={emp.avatarUrl} alt="" className="avatar" style={{ width:56, height:56, fontSize:20, objectFit:'cover' }} />
              : <span className="avatar" style={{ width:56, height:56, fontSize:20 }}>{H.initials(emp.name)}</span>}
            <div>
              <div style={{ fontWeight:600, fontSize:16 }}>{emp.name}</div>
              <div className="muted" style={{ fontSize:13 }}>{emp.jobTitle || '—'}</div>
              <span className={`role-pill role-${emp.role === 'super_admin' ? 'manager' : 'staff'}`} style={{ marginTop:4, display:'inline-block' }}>
                {emp.deptName || 'No department'}
              </span>
            </div>
          </div>
          <div className="hr-detail-grid">
            <div><span className="muted">Email</span><div>{I.mail} {emp.email}</div></div>
            <div><span className="muted">Phone</span><div>{I.phone} {emp.phone || '—'}</div></div>
            <div><span className="muted">Manager</span><div>{emp.manager?.name || '—'}</div></div>
            <div><span className="muted">Employment type</span><div>{H.EMPLOYMENT_TYPE[emp.employmentType]?.label || '—'}</div></div>
            <div><span className="muted">Start date</span><div>{H.fmtDate(emp.startDate)}</div></div>
            <div><span className="muted">Tenure</span><div>{t || '—'}</div></div>
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
            {canEdit && <button className="btn btn-primary" onClick={onEdit}>{I.edit} Edit employment</button>}
          </div>
    </Modal>
  );
}

/* ---- OrgChart --------------------------------------------------------------- */
function OrgNode({ node, depth }) {
  const [open, setOpen] = useState(depth < 1);
  return (
    <div style={{ marginLeft: depth ? 20 : 0 }}>
      <div className="hr-org-node" onClick={() => node.children.length > 0 && setOpen((v) => !v)}>
        {node.avatarUrl
          ? <img src={node.avatarUrl} alt="" className="avatar sm" style={{ objectFit:'cover' }} />
          : <span className="avatar sm">{H.initials(node.name)}</span>}
        <div>
          <div style={{ fontWeight:600, fontSize:13 }}>{node.name}</div>
          <div className="muted" style={{ fontSize:12 }}>{node.jobTitle || node.deptName || '—'}</div>
        </div>
        {node.children.length > 0 && (
          <span className="muted" style={{ marginLeft:'auto', fontSize:12, display:'inline-flex', alignItems:'center', gap:3 }}>{open ? I.chevDown : I.chevRight} {node.children.length}</span>
        )}
      </div>
      {open && node.children.map((c) => <OrgNode key={c.id} node={c} depth={depth + 1} />)}
    </div>
  );
}

function OrgChart({ staff }) {
  const roots = useMemo(() => {
    const byId = new Map(staff.map((s) => [s.id, { ...s, children: [] }]));
    const top = [];
    byId.forEach((node) => {
      if (node.managerId && byId.has(node.managerId)) byId.get(node.managerId).children.push(node);
      else top.push(node);
    });
    byId.forEach((n) => n.children.sort((a, b) => a.name.localeCompare(b.name)));
    return top.sort((a, b) => a.name.localeCompare(b.name));
  }, [staff]);

  if (roots.length === 0) return <EmptyState title="No staff to show yet" hint="The org chart builds itself from reporting lines in the directory." />;
  return <div className="hr-org-chart">{roots.map((n) => <OrgNode key={n.id} node={n} depth={0} />)}</div>;
}

/* ---- Main HRApp ------------------------------------------------------------- */
export default function HRApp({ access }) {
  const isHrManager = access?.role === 'manager';

  const [staff, setStaff] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('directory');
  const [q, setQ] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [profileEmp, setProfileEmp] = useState(null);
  const [recordEmp, setRecordEmp] = useState(null); // Employee 360 (HR managers)
  const [editEmp, setEditEmp] = useState(null);
  const [myId, setMyId] = useState(null);
  // Other tabs (probation confirmations, disciplinary) can open the Letters
  // composer prefilled — e.g. "Confirm" generates the confirmation letter.
  const [lettersPrefill, setLettersPrefill] = useState(null);
  const composeLetter = (p) => { setRecordEmp(null); setLettersPrefill(p); setTab('letters'); };
  const { flash, toastNode } = useToast();

  useEffect(() => { apiGet('/me').then((d) => setMyId(d.user.id)).catch(() => {}); }, []);

  const load = () => {
    setLoading(true);
    Promise.all([H.getDirectory(), apiGet('/departments?all=true').then((d) => d.departments)])
      .then(([s, d]) => { setStaff(s); setDepartments(d); })
      .catch((e) => flash(e.message, true))
      .finally(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line

  const view = useMemo(() => {
    let list = staff;
    if (deptFilter) list = list.filter((s) => String(s.departmentId) === deptFilter);
    if (q.trim()) {
      const match = searchMatcher(q);
      list = list.filter((s) => match(s.name, s.email, s.jobTitle, s.deptName));
    }
    return list;
  }, [staff, q, deptFilter]);

  const onSaved = (updated) => {
    const merge = (s) => ({ ...s, ...updated, deptName: departments.find((d) => d.id === updated.departmentId)?.name || s.deptName, manager: staff.find((m) => m.id === updated.managerId) ? { id: updated.managerId, name: staff.find((m) => m.id === updated.managerId).name } : null });
    setStaff((l) => l.map((s) => (s.id === updated.id ? merge(s) : s)));
    setRecordEmp((r) => (r && r.id === updated.id ? merge(r) : r));
    setEditEmp(null);
    setProfileEmp(null);
    flash('Employment details updated.');
  };

  const TABS = [
    { key: 'directory', label: 'Directory' },
    { key: 'orgchart',  label: 'Org chart' },
    { key: 'myinterviews', label: 'My interviews' },
    ...(isHrManager ? [
      { key: 'recruiting',   label: 'Recruiting' },
      { key: 'letters',      label: 'Letters' },
      { key: 'onboarding',   label: 'Onboarding' },
      { key: 'offboarding',  label: 'Offboarding' },
      { key: 'performance',  label: 'Performance' },
      { key: 'compliance',   label: 'Compliance' },
    ] : []),
  ];

  return (
    <div className="lv">
      <style>{`
        .hr-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px 20px; font-size:13px; }
        .hr-detail-grid > div > span.muted { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.03em; margin-bottom:2px; }
        .hr-detail-grid > div > div { display:flex; align-items:center; gap:6px; }
        .hr-et-ft { background:#dff6dd; color:#1a6a1a; }
        .hr-et-pt { background:#ddeeff; color:#004578; }
        .hr-et-ct { background:#fff0e8; color:#8f3b00; }
        .hr-et-in { background:#f0e6ff; color:#4f00b3; }
        .hr-et-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:700; }
        .hr-org-chart { padding:8px 0; }
        .hr-org-node { display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:6px; cursor:pointer; margin:2px 0; }
        .hr-org-node:hover { background:var(--surface-2, #f3f2f1); }
        .hr-row-name { display:flex; align-items:center; gap:10px; cursor:pointer; }

        .lc-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:700; letter-spacing:.02em; white-space:nowrap; }
        .lc-req-draft   { background:#f3f2f1; color:#605e5c; }
        .lc-req-open    { background:#dff6dd; color:#1a6a1a; }
        .lc-req-hold    { background:#fff4e0; color:#8f3b00; }
        .lc-req-closed  { background:#f3f2f1; color:#a19f9d; }
        .lc-req-filled  { background:#ddeeff; color:#004578; }
        .lc-stage-applied   { background:#f3f2f1; color:#605e5c; }
        .lc-stage-screen    { background:#ddeeff; color:#004578; }
        .lc-stage-interview { background:#f0e6ff; color:#4f00b3; }
        .lc-stage-offer     { background:#fff4e0; color:#8f3b00; }
        .lc-stage-hired     { background:#dff6dd; color:#1a6a1a; }
        .lc-stage-rejected  { background:#fde7e9; color:#a4262c; }
        .lc-out-pending { background:#f3f2f1; color:#605e5c; }
        .lc-out-syes    { background:#dff6dd; color:#1a6a1a; }
        .lc-out-yes     { background:#ddeeff; color:#004578; }
        .lc-out-no      { background:#fff0e8; color:#8f3b00; }
        .lc-out-sno     { background:#fde7e9; color:#a4262c; }
        .lc-exit-init     { background:#f3f2f1; color:#605e5c; }
        .lc-exit-clear    { background:#fff4e0; color:#8f3b00; }
        .lc-exit-settled  { background:#ddeeff; color:#004578; }
        .lc-exit-done     { background:#dff6dd; color:#1a6a1a; }
        .lc-match-high { background:#dff6dd; color:#1a6a1a; }
        .lc-match-mid  { background:#fff4e0; color:#8f3b00; }
        .lc-match-low  { background:#f3f2f1; color:#605e5c; }
        .danger-icon { color:#a4262c; }
        .danger-icon:hover { background:#fde7e9; }
        .callout-hint { background:#fff4e0; border:1px solid #f0bea0; border-radius:6px; padding:10px 14px; font-size:13px; color:#8f3b00; margin-top:12px; }
        .lc-app-detail { padding-top:4px; }
        .lc-interviews-head { display:flex; justify-content:space-between; align-items:center; margin:16px 0 8px; }
        .lc-interview-card { background:#faf9f8; border:1px solid var(--line); border-radius:6px; padding:10px 12px; margin-top:8px; }
        .lc-checklist-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
        .lc-task-row { display:flex; align-items:center; gap:10px; padding:7px 4px; border-top:1px solid var(--line); cursor:default; }
        .lc-task-row:first-of-type { border-top:none; }
        .lc-task-row.done .lc-task-title { text-decoration:line-through; color:var(--text-2); }
        .lc-check-btn { width:20px; height:20px; border-radius:5px; border:1.5px solid var(--line-strong, #c8c6c4); background:#fff; display:grid; place-items:center; flex:none; color:#fff; cursor:pointer; padding:0; }
        .lc-check-btn.checked { background:var(--brand); border-color:var(--brand); }
        .lc-task-title { flex:1; font-size:13.5px; }
        .lc-task-cat { font-size:11px; text-transform:uppercase; letter-spacing:.03em; color:var(--text-2); }
        .lc-task-due { font-size:12px; white-space:nowrap; }
        .lc-task-by { font-size:11px; display:flex; align-items:center; gap:3px; }
      `}</style>

      <div className="lv-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`lv-tab ${tab === t.key && !recordEmp ? 'active' : ''}`} onClick={() => { setRecordEmp(null); setTab(t.key); }}>{t.label}</button>
        ))}
      </div>

      {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : recordEmp ? (
        <EmployeeRecord emp={recordEmp} isHrManager={isHrManager}
          onBack={() => setRecordEmp(null)} onEdit={() => setEditEmp(recordEmp)} />
      ) : (
        <>
          {tab === 'directory' && (
            <>
              <div className="filterbar" style={{ marginTop:8 }}>
                <div className="filter-pills">
                  <button className={`pill ${deptFilter === '' ? 'active' : ''}`} onClick={() => setDeptFilter('')}>All depts</button>
                  {departments.map((d) => (
                    <button key={d.id} className={`pill ${deptFilter === String(d.id) ? 'active' : ''}`} onClick={() => setDeptFilter(String(d.id))}>{d.name}</button>
                  ))}
                </div>
                <div className="cmd-search" style={{ marginLeft:'auto' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8886" strokeWidth="1.7" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
                  <input placeholder="Search staff" value={q} onChange={(e) => setQ(e.target.value)}
                    style={{ border:'none', outline:'none', background:'transparent', fontSize:13, marginLeft:6, width:180 }} />
                </div>
                <span className="count">{view.length} of {staff.length}</span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Job title</th>
                      <th>Department</th>
                      <th>Manager</th>
                      <th>Type</th>
                      <th>Tenure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.length === 0 && <tr><td colSpan={6} className="td-empty">No staff found.</td></tr>}
                    {view.map((s) => {
                      const et = H.EMPLOYMENT_TYPE[s.employmentType] || H.EMPLOYMENT_TYPE.full_time;
                      return (
                        <tr key={s.id}>
                          <td>
                            <div className="hr-row-name" onClick={() => (isHrManager ? setRecordEmp(s) : setProfileEmp(s))}>
                              {s.avatarUrl
                                ? <img src={s.avatarUrl} alt="" className="avatar sm" style={{ objectFit:'cover' }} />
                                : <span className="avatar sm">{H.initials(s.name)}</span>}
                              <span style={{ fontWeight:500 }}>{s.name}</span>
                            </div>
                          </td>
                          <td className="muted" style={{ fontSize:13 }}>{s.jobTitle || '—'}</td>
                          <td className="muted" style={{ fontSize:13 }}>{s.deptName || '—'}</td>
                          <td className="muted" style={{ fontSize:13 }}>{s.manager?.name || '—'}</td>
                          <td><span className={`hr-et-badge ${et.cls}`}>{et.label}</span></td>
                          <td className="muted" style={{ fontSize:13 }}>{H.tenure(s.startDate) || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === 'orgchart' && <OrgChart staff={staff} />}
          {tab === 'myinterviews' && <MyInterviewsView myId={myId} flash={flash} />}
          {tab === 'recruiting'  && <RecruitingApp access={access} departments={departments} staff={staff} myId={myId} />}
          {tab === 'letters'     && <LettersApp staff={staff} flash={flash} externalPrefill={lettersPrefill} onPrefillConsumed={() => setLettersPrefill(null)} />}
          {tab === 'onboarding'  && <OnboardingApp access={access} onComposeLetter={composeLetter} />}
          {tab === 'offboarding' && <OffboardingApp access={access} staff={staff} />}
          {tab === 'performance' && <PerformanceApp staff={staff} />}
          {tab === 'compliance'  && <ComplianceApp staff={staff} onComposeLetter={composeLetter} />}
        </>
      )}

      {profileEmp && (
        <ProfileModal
          emp={profileEmp}
          canEdit={isHrManager}
          onClose={() => setProfileEmp(null)}
          onEdit={() => { setEditEmp(profileEmp); setProfileEmp(null); }}
        />
      )}
      {editEmp && (
        <EditModal
          emp={editEmp}
          staff={staff}
          departments={departments}
          onClose={() => setEditEmp(null)}
          onSaved={onSaved}
          onError={(m) => flash(m, true)}
        />
      )}
      {toastNode}
    </div>
  );
}
