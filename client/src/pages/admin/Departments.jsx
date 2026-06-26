import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiGet, apiPost, apiPatch } from '../../api/client.js';
import AppLayout from '../../components/AppLayout.jsx';
import SuiteIcon from '../../components/SuiteIcon.jsx';

const I = {
  add:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  refresh: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11a8 8 0 1 0-.6 4"/><path d="M20 4v5h-5"/></svg>,
  search:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a8886" strokeWidth="1.7" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>,
  kebab:   <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>,
};

function useClickOutside(ref, onOut) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>{title}</h2>
          <button className="iconbtn dark" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function RowMenu({ dept, rect, onClose, onEdit, onToggle }) {
  const ref = useRef(null);
  useClickOutside(ref, onClose);
  const style = rect ? { position: 'fixed', top: rect.bottom + 4, right: window.innerWidth - rect.right } : {};
  return createPortal(
    <div className="rowmenu" ref={ref} style={style}>
      <button onClick={onEdit}>Edit department</button>
      <button className={dept.active ? 'danger' : ''} onClick={onToggle}>
        {dept.active ? 'Deactivate' : 'Activate'}
      </button>
    </div>,
    document.body
  );
}

function DeptModal({ dept, onClose, onSaved, onError }) {
  const [name, setName] = useState(dept?.name || '');
  const [code, setCode] = useState(dept?.code || '');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return onError('Name and code are required.');
    setBusy(true);
    try {
      const d = dept
        ? await apiPatch(`/departments/${dept.id}`, { name, code })
        : await apiPost('/departments', { name, code });
      onSaved(d.department);
    } catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={dept ? `Edit · ${dept.name}` : 'New department'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Department name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="field"><label>Code <span className="muted">(e.g. IT, HR, FINANCE)</span></label>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required
            placeholder="Short uppercase code" maxLength={12} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : dept ? 'Save changes' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminDepartments() {
  const [depts, setDepts] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [rowMenu, setRowMenu] = useState(null);

  const flash = (msg, isErr) => { setToast({ msg, isErr }); setTimeout(() => setToast(null), 2800); };

  const load = () => {
    setLoading(true);
    apiGet('/departments?all=true').then((d) => setDepts(d.departments)).catch((e) => flash(e.message, true)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const view = depts
    .filter((d) => filter === 'all' ? true : filter === 'active' ? d.active : !d.active)
    .filter((d) => !q.trim() || new RegExp(q.trim(), 'i').test(d.name) || new RegExp(q.trim(), 'i').test(d.code));

  const upsert = (dept) => setDepts((l) => {
    const idx = l.findIndex((d) => d.id === dept.id);
    return idx >= 0 ? l.map((d) => (d.id === dept.id ? dept : d)) : [dept, ...l];
  });

  const toggleActive = async (dept) => {
    try {
      const d = await apiPatch(`/departments/${dept.id}/status`, { active: !dept.active });
      upsert(d.department);
      flash(`${dept.name} ${dept.active ? 'deactivated' : 'activated'}.`);
    } catch (e) { flash(e.message, true); }
  };

  const FILTERS = [
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'all', label: 'All' },
  ];

  const commandBar = (
    <>
      <button className="cmd" onClick={() => setCreateOpen(true)}><span className="ci">{I.add}</span> Add department</button>
      <button className="cmd" onClick={load}><span className="ci">{I.refresh}</span> Refresh</button>
      <div className="cmd-search">{I.search}
        <input placeholder="Search departments" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
    </>
  );

  return (
    <AppLayout breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Departments' }]} title="Departments" commandBar={commandBar}>
      <div className="filterbar">
        <span className="filter-label">Filter:</span>
        <div className="filter-pills">
          {FILTERS.map((f) => (
            <button key={f.key} className={`pill ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
        <span className="count">{view.length} department{view.length === 1 ? '' : 's'}</span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Department name</th>
              <th>Code</th>
              <th>Status</th>
              <th className="col-check"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="td-empty">Loading…</td></tr>}
            {!loading && view.length === 0 && <tr><td colSpan={4} className="td-empty">No departments found.</td></tr>}
            {!loading && view.map((dept) => (
              <tr key={dept.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--brand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <SuiteIcon name="building" size={16} color="var(--brand)" />
                    </span>
                    <span style={{ fontWeight: 500 }}>{dept.name}</span>
                  </div>
                </td>
                <td><span className="chip" style={{ fontFamily: 'monospace', letterSpacing: '.04em' }}>{dept.code}</span></td>
                <td><span className={`status-dot ${dept.active ? 'active' : 'disabled'}`} />{dept.active ? 'Active' : 'Inactive'}</td>
                <td className="col-check">
                  <button className="kebab" aria-label="Row actions"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setRowMenu(rowMenu?.id === dept.id ? null : { id: dept.id, rect });
                    }}>{I.kebab}</button>
                  {rowMenu?.id === dept.id && (
                    <RowMenu dept={dept} rect={rowMenu.rect} onClose={() => setRowMenu(null)}
                      onEdit={() => { setRowMenu(null); setEditing(dept); }}
                      onToggle={() => { setRowMenu(null); toggleActive(dept); }} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <DeptModal onClose={() => setCreateOpen(false)}
          onSaved={(d) => { upsert(d); setCreateOpen(false); flash(`${d.name} created.`); }}
          onError={(m) => flash(m, true)} />
      )}
      {editing && (
        <DeptModal dept={editing} onClose={() => setEditing(null)}
          onSaved={(d) => { upsert(d); setEditing(null); flash('Department updated.'); }}
          onError={(m) => flash(m, true)} />
      )}
      {toast && <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>}
    </AppLayout>
  );
}
