import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../api/client.js';
import * as T from './taskApi.js';

/* ---- icons ---- */
const I = {
  add:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  edit:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2 2 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>,
  trash:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>,
  close:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
};

const PRIORITIES = ['low','medium','high','urgent'];
const STATUSES   = ['todo','in_progress','in_review','done','cancelled'];

/* ---- TaskModal (create / edit) ---- */
function TaskModal({ task, staff, departments, onClose, onSaved, onError, isSupervisor }) {
  const [f, setF] = useState({
    title:        task?.title        || '',
    description:  task?.description  || '',
    priority:     task?.priority     || 'medium',
    status:       task?.status       || 'todo',
    dueDate:      task?.due_date     || '',
    assignedTo:   task?.assigned_to  || '',
    departmentId: task?.department_id || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return onError('Title is required.');
    setBusy(true);
    try {
      const payload = {
        title: f.title.trim(),
        description: f.description,
        priority: f.priority,
        status: f.status,
        dueDate: f.dueDate || null,
        assignedTo: f.assignedTo || null,
        departmentId: f.departmentId ? Number(f.departmentId) : null,
      };
      const saved = task ? await T.updateTask(task.id, payload) : await T.createTask(payload);
      onSaved(saved);
    } catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{task ? 'Edit task' : 'New task'}</h2>
          <button className="iconbtn dark" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="field"><label>Title</label>
            <input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} required autoFocus />
          </div>
          <div className="field"><label>Description <span className="muted">(optional)</span></label>
            <textarea className="input" rows={3} value={f.description} onChange={(e) => set('description', e.target.value)}
              style={{ resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div className="form-grid">
            <div className="field"><label>Priority</label>
              <select className="select" value={f.priority} onChange={(e) => set('priority', e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{T.PRIORITY[p].label}</option>)}
              </select>
            </div>
            <div className="field"><label>Status</label>
              <select className="select" value={f.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{T.STATUS[s].label}</option>)}
              </select>
            </div>
            <div className="field"><label>Due date</label>
              <input className="input" type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </div>
            {isSupervisor && (
              <div className="field"><label>Department</label>
                <select className="select" value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                  <option value="">— None —</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {isSupervisor && (
            <div className="field"><label>Assign to</label>
              <select className="select" value={f.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
                <option value="">— Unassigned —</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
              </select>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : task ? 'Save' : 'Create task'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---- TaskRow ---- */
function TaskRow({ task, isSupervisor, onEdit, onDelete, onStatusChange }) {
  const p = T.PRIORITY[task.priority] || T.PRIORITY.medium;
  const s = T.STATUS[task.status] || T.STATUS.todo;
  const overdue = T.isOverdue(task);
  return (
    <tr>
      <td style={{ maxWidth: 280 }}>
        <div style={{ fontWeight: 500, marginBottom: 2 }}>{task.title}</div>
        {task.description && <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{task.description}</div>}
      </td>
      <td><span className={`tk-badge ${p.cls}`}>{p.label}</span></td>
      <td>
        <select className="select tk-status-sel" value={task.status}
          onChange={(e) => onStatusChange(task, e.target.value)}
          style={{ fontSize: 13, padding: '3px 8px', height: 'auto' }}>
          {STATUSES.map((s2) => <option key={s2} value={s2}>{T.STATUS[s2].label}</option>)}
        </select>
      </td>
      <td className="muted" style={{ fontSize: 13 }}>
        {task.assignee ? task.assignee.name : <span style={{ color: '#a0a0a0' }}>Unassigned</span>}
      </td>
      {isSupervisor && <td className="muted" style={{ fontSize: 13 }}>{task.dept?.name || '—'}</td>}
      <td className={`muted ${overdue ? 'tk-overdue' : ''}`} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
        {T.fmtDate(task.due_date)}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="iconbtn" onClick={() => onEdit(task)} aria-label="Edit">{I.edit}</button>
          {isSupervisor && <button className="iconbtn danger-icon" onClick={() => onDelete(task)} aria-label="Delete">{I.trash}</button>}
        </div>
      </td>
    </tr>
  );
}

/* ---- KPI card ---- */
function KpiCard({ label, value, accent }) {
  return (
    <div className="tk-kpi" style={{ borderTopColor: accent }}>
      <div className="tk-kpi-val">{value}</div>
      <div className="tk-kpi-label">{label}</div>
    </div>
  );
}

/* ---- Stats view (dept manager / super_admin) ---- */
function StatsView({ stats }) {
  if (!stats || stats.length === 0) return <p className="muted" style={{ padding: 24 }}>No task data yet.</p>;

  const total    = stats.reduce((sum, r) => sum + Number(r.count), 0);
  const byStatus = {};
  const byPriority = {};
  stats.forEach((r) => {
    byStatus[r.status]     = (byStatus[r.status]     || 0) + Number(r.count);
    byPriority[r.priority] = (byPriority[r.priority] || 0) + Number(r.count);
  });

  const STATUS_COLORS = { todo: '#8a8886', in_progress: '#0078d4', in_review: '#7a3db7', done: '#107c10', cancelled: '#c8c6c4' };
  const PRIORITY_COLORS = { low: '#8a8886', medium: '#0078d4', high: '#ca5010', urgent: '#e00303' };

  return (
    <div>
      <div className="tk-kpi-row">
        <KpiCard label="Total tasks" value={total} accent="var(--brand)" />
        {Object.entries(byStatus).map(([s, n]) => (
          <KpiCard key={s} label={T.STATUS[s]?.label || s} value={n} accent={STATUS_COLORS[s] || '#ccc'} />
        ))}
      </div>
      <h3 style={{ margin: '24px 0 12px', fontSize: 14, color: 'var(--text-2)' }}>By priority</h3>
      <div className="tk-kpi-row">
        {Object.entries(byPriority).map(([p, n]) => (
          <KpiCard key={p} label={T.PRIORITY[p]?.label || p} value={n} accent={PRIORITY_COLORS[p] || '#ccc'} />
        ))}
      </div>
    </div>
  );
}

/* ---- Main TasksApp ---- */
export default function TasksApp({ access }) {
  const isSupervisor = access?.role === 'manager';

  const [tasks, setTasks]   = useState([]);
  const [stats, setStats]   = useState(null);
  const [staff, setStaff]   = useState([]);
  const [depts, setDepts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState('queue');
  const [modal, setModal]   = useState(null); // null | 'create' | task object (edit)
  const [toast, setToast]   = useState(null);
  const [q, setQ]           = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const flash = (msg, isErr) => { setToast({ msg, isErr }); setTimeout(() => setToast(null), 2800); };

  const load = async () => {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([T.getTasks(), isSupervisor ? T.getStats() : Promise.resolve(null)]);
      setTasks(t);
      setStats(s);
    } catch (e) { flash(e.message, true); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    if (isSupervisor) {
      T.getStaff().then(setStaff).catch(() => {});
      apiGet('/departments').then((d) => setDepts(d.departments)).catch(() => {});
    }
  }, []); // eslint-disable-line

  const view = useMemo(() => {
    let list = tasks;
    if (statusFilter) list = list.filter((t) => t.status === statusFilter);
    if (q.trim()) {
      const rx = new RegExp(q.trim(), 'i');
      list = list.filter((t) => rx.test(t.title) || rx.test(t.description || '') || rx.test(t.assignee?.name || ''));
    }
    return list;
  }, [tasks, statusFilter, q]);

  const upsert = (task) => setTasks((l) => {
    const idx = l.findIndex((t) => t.id === task.id);
    return idx >= 0 ? l.map((t) => (t.id === task.id ? task : t)) : [task, ...l];
  });
  const remove = (id) => setTasks((l) => l.filter((t) => t.id !== id));

  const onStatusChange = async (task, status) => {
    try { upsert(await T.updateTask(task.id, { status })); }
    catch (e) { flash(e.message, true); }
  };

  const onDelete = async (task) => {
    if (!confirm(`Delete "${task.title}"?`)) return;
    try { await T.deleteTask(task.id); remove(task.id); flash('Task deleted.'); }
    catch (e) { flash(e.message, true); }
  };

  const tabs = [
    { key: 'queue', label: isSupervisor ? 'Department queue' : 'My queue' },
    ...(isSupervisor ? [{ key: 'stats', label: 'KPI dashboard' }] : []),
  ];

  const STATUS_FILTERS = [
    { key: '', label: 'All' },
    { key: 'todo', label: 'To do' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'in_review', label: 'In review' },
    { key: 'done', label: 'Done' },
  ];

  return (
    <div className="lv">
      <style>{`
        .tk-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; letter-spacing: .03em; }
        .tk-p-low  { background: #f3f2f1; color: #605e5c; }
        .tk-p-med  { background: #ddeeff; color: #004578; }
        .tk-p-high { background: #fff0e8; color: #8f3b00; }
        .tk-p-urg  { background: #fde7e9; color: #a4262c; }
        .tk-s-todo { background: #f3f2f1; color: #605e5c; }
        .tk-s-prog { background: #ddeeff; color: #004578; }
        .tk-s-rev  { background: #f0e6ff; color: #4f00b3; }
        .tk-s-done { background: #dff6dd; color: #1a6a1a; }
        .tk-s-canc { background: #f3f2f1; color: #a19f9d; }
        .tk-overdue { color: #a4262c !important; font-weight: 600; }
        .tk-status-sel { min-width: 120px; }
        .tk-kpi-row { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 8px; }
        .tk-kpi { background: var(--surface); border: 1px solid var(--line); border-top: 3px solid var(--brand); border-radius: var(--radius-lg); padding: 16px 20px; min-width: 120px; flex: 1; }
        .tk-kpi-val { font-size: 28px; font-weight: 700; line-height: 1; margin-bottom: 4px; }
        .tk-kpi-label { font-size: 12px; color: var(--text-2); text-transform: capitalize; }
        .danger-icon { color: #a4262c; }
        .danger-icon:hover { background: #fde7e9; }
      `}</style>

      {/* tabs row */}
      <div className="lv-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`lv-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
        {isSupervisor && tab === 'queue' && (
          <button className="btn btn-primary lv-apply" onClick={() => setModal('create')}>
            <span style={{ marginRight: 6 }}>{I.add}</span> New task
          </button>
        )}
      </div>

      {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : (
        <>
          {tab === 'queue' && (
            <>
              <div className="filterbar" style={{ marginTop: 8 }}>
                <div className="filter-pills">
                  {STATUS_FILTERS.map((f) => (
                    <button key={f.key} className={`pill ${statusFilter === f.key ? 'active' : ''}`} onClick={() => setStatusFilter(f.key)}>{f.label}</button>
                  ))}
                </div>
                <div className="cmd-search" style={{ marginLeft: 'auto' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8886" strokeWidth="1.7" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
                  <input placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, marginLeft: 6, width: 160 }} />
                </div>
                <span className="count">{view.length} task{view.length === 1 ? '' : 's'}</span>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Assigned to</th>
                      {isSupervisor && <th>Department</th>}
                      <th>Due</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.length === 0 && <tr><td colSpan={isSupervisor ? 7 : 6} className="td-empty">No tasks found.</td></tr>}
                    {view.map((task) => (
                      <TaskRow key={task.id} task={task} isSupervisor={isSupervisor}
                        onEdit={(t) => setModal(t)}
                        onDelete={onDelete}
                        onStatusChange={onStatusChange} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'stats' && isSupervisor && <div style={{ padding: '8px 0' }}><StatsView stats={stats} /></div>}
        </>
      )}

      {modal && (
        <TaskModal
          task={modal === 'create' ? null : modal}
          staff={staff}
          departments={depts}
          isSupervisor={isSupervisor}
          onClose={() => setModal(null)}
          onSaved={(saved) => { upsert(saved); setModal(null); flash(modal === 'create' ? 'Task created.' : 'Task updated.'); }}
          onError={(m) => flash(m, true)} />
      )}
      {toast && <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>}
    </div>
  );
}
