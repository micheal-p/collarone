import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../api/client.js';
import * as T from './taskApi.js';
import { EmptyState, Modal, searchMatcher, useConfirm, useToast } from '../../components/ui.jsx';

/* ---- icons ---------------------------------------------------------------- */
const I = {
  add:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  edit:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2 2 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>,
  trash:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>,
  close:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  lock:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  unlock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>,
  expand: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>,
  attach: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>,
  report: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>,
};

const PRIORITIES = ['low','medium','high','urgent'];
const STATUSES   = ['todo','in_progress','in_review','done','cancelled'];

/* ---- TaskModal ------------------------------------------------------------ */
function TaskModal({ task, staff, myDeptId, onClose, onSaved, onError, isSupervisor }) {
  const [f, setF] = useState({
    title:       task?.title        || '',
    description: task?.description  || '',
    priority:    task?.priority     || 'medium',
    status:      task?.status       || 'todo',
    dueDate:     task?.due_date     || '',
    assignedTo:  task?.assigned_to  || '',
    // supervisors always work within their own dept
    departmentId: task?.department_id || myDeptId || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return onError('Title is required.');
    setBusy(true);
    try {
      const payload = {
        title: f.title.trim(), description: f.description,
        priority: f.priority, status: f.status,
        dueDate: f.dueDate || null,
        assignedTo: f.assignedTo || null,
        departmentId: f.departmentId ? Number(f.departmentId) : null,
      };
      const saved = task ? await T.updateTask(task.id, payload) : await T.createTask(payload);
      onSaved(saved);
    } catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={task ? 'Edit task' : 'New task'} onClose={onClose} wide>
        <form onSubmit={submit}>
          <div className="field"><label>Title</label>
            <input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} required autoFocus />
          </div>
          <div className="field"><label>Description <span className="muted">(optional)</span></label>
            <textarea className="input" rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} style={{ resize:'vertical', fontFamily:'inherit' }} />
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
    </Modal>
  );
}

/* ---- ReportModal ---------------------------------------------------------- */
function ReportModal({ taskId, onClose, onSaved, onError }) {
  const [body,     setBody]     = useState('');
  const [files,    setFiles]    = useState([]);
  const [busy,     setBusy]     = useState(false);
  const [progress, setProgress] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return onError('Report text is required.');
    setBusy(true);
    try {
      const attachments = [];
      for (const file of files) {
        setProgress(`Uploading ${file.name}…`);
        attachments.push(await T.uploadAttachment(taskId, file));
      }
      setProgress('Saving…');
      const report = await T.submitReport(taskId, body, attachments);
      onSaved(report);
    } catch (e2) { onError(e2.message); } finally { setBusy(false); setProgress(''); }
  };

  return (
    <Modal title="Submit report" onClose={onClose} wide>
        <form onSubmit={submit}>
          <div className="field"><label>Report *</label>
            <textarea className="input" rows={6} value={body} onChange={(e) => setBody(e.target.value)}
              required autoFocus placeholder="Describe progress, blockers, outcome…"
              style={{ resize:'vertical', fontFamily:'inherit' }} />
          </div>
          <div className="field">
            <label>Attach documents <span className="muted">(optional — max 10 MB each)</span></label>
            <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files))}
              style={{ fontSize:13, marginTop:4 }} />
            {files.length > 0 && (
              <div style={{ marginTop:6, fontSize:12, color:'var(--text-2)' }}>
                {files.map((f) => <div key={f.name}>{I.attach} {f.name} — {(f.size/1024).toFixed(0)} KB</div>)}
              </div>
            )}
          </div>
          {progress && <p style={{ fontSize:13, color:'var(--text-2)', margin:'4px 0' }}>{progress}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Submit report'}</button>
          </div>
        </form>
    </Modal>
  );
}

/* ---- TaskReports (inline panel shown when task row expanded) -------------- */
function TaskReports({ task, canMutate, flash }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(false);
  const [urlCache, setUrlCache] = useState({});

  useEffect(() => {
    T.getTaskReports(task.id)
      .then(setReports)
      .catch((e) => flash(e.message, true))
      .finally(() => setLoading(false));
  }, [task.id]); // eslint-disable-line

  const download = async (att) => {
    try {
      const url = urlCache[att.path] || await T.getDownloadUrl(att.path);
      setUrlCache((c) => ({ ...c, [att.path]: url }));
      window.open(url, '_blank');
    } catch (e) { flash(e.message, true); }
  };

  const canReport = canMutate;

  if (loading) return <div style={{ padding:'10px 0' }}><div className="boot-spinner" style={{ width:18, height:18 }} /></div>;

  return (
    <div className="tk-reports-panel">
      <div className="tk-reports-head">
        <span style={{ fontSize:13, fontWeight:600 }}>Reports ({reports.length})</span>
        {canReport && (
          <button className="btn btn-primary" style={{ fontSize:12, padding:'3px 12px' }} onClick={() => setModal(true)}>
            {I.report} Submit report
          </button>
        )}
      </div>
      {reports.length === 0 && <p className="muted" style={{ fontSize:13, margin:'6px 0 0' }}>No reports yet.</p>}
      {reports.map((r) => (
        <div key={r.id} className="tk-report-card">
          <div className="tk-report-meta">
            <strong style={{ fontSize:13 }}>{r.author?.name}</strong>
            <span className="muted" style={{ fontSize:12, marginLeft:8 }}>{T.fmtDt(r.created_at)}</span>
          </div>
          <p style={{ fontSize:13, margin:'6px 0 0', whiteSpace:'pre-wrap', color:'var(--text-1)' }}>{r.body}</p>
          {r.attachments?.length > 0 && (
            <div className="tk-report-attachments">
              {r.attachments.map((att, i) => (
                <button key={i} className="btn btn-ghost tk-attach-btn" onClick={() => download(att)}>
                  {I.attach} {att.name}
                  <span className="muted" style={{ marginLeft:6, fontSize:11 }}>{(att.size/1024).toFixed(0)} KB</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {modal && (
        <ReportModal taskId={task.id}
          onClose={() => setModal(false)}
          onSaved={(r) => { setReports((rs) => [r, ...rs]); setModal(false); flash('Report submitted.'); }}
          onError={(m) => flash(m, true)} />
      )}
    </div>
  );
}

/* ---- TaskRow -------------------------------------------------------------- */
function TaskRow({ task, isSupervisor, myId, locked, onEdit, onDelete, onStatusChange, flash }) {
  const [expanded, setExpanded] = useState(false);
  const p = T.PRIORITY[task.priority] || T.PRIORITY.medium;
  const overdue    = T.isOverdue(task);
  const isAssignee = task.assigned_to === myId;
  // Edit/delete available if: it's my task OR supervisor has unlocked the queue
  const canMutate  = isAssignee || !locked;

  return (
    <>
      <tr style={!isAssignee && locked ? { opacity: 0.82 } : {}}>
        <td style={{ maxWidth:260 }}>
          <div style={{ fontWeight:500, marginBottom:2 }}>{task.title}</div>
          {task.description && (
            <div className="muted" style={{ fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:240 }}>{task.description}</div>
          )}
        </td>
        <td><span className={`tk-badge ${p.cls}`}>{p.label}</span></td>
        <td>
          {/* Status always changeable for assigned tasks; locked for others */}
          <select className="select tk-status-sel" value={task.status}
            disabled={!canMutate}
            onChange={(e) => onStatusChange(task, e.target.value)}
            style={{ fontSize:13, padding:'3px 8px', height:'auto' }}>
            {STATUSES.map((s) => <option key={s} value={s}>{T.STATUS[s].label}</option>)}
          </select>
        </td>
        <td className="muted" style={{ fontSize:13 }}>
          {task.assignee ? task.assignee.name : <span style={{ color:'#a0a0a0' }}>Unassigned</span>}
        </td>
        <td className={`muted ${overdue ? 'tk-overdue' : ''}`} style={{ fontSize:13, whiteSpace:'nowrap' }}>
          {T.fmtDate(task.due_date)}
        </td>
        <td>
          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
            <button className="iconbtn" onClick={() => setExpanded((v) => !v)} aria-label="Reports"
              style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition:'transform .15s' }}>
              {I.expand}
            </button>
            {canMutate && <button className="iconbtn" onClick={() => onEdit(task)} aria-label="Edit">{I.edit}</button>}
            {canMutate && isSupervisor && (
              <button className="iconbtn danger-icon" onClick={() => onDelete(task)} aria-label="Delete">{I.trash}</button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} style={{ padding:'0 16px 16px', background:'var(--surface)' }}>
            <TaskReports task={task} canMutate={canMutate} flash={flash} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ---- KpiCard -------------------------------------------------------------- */
function KpiCard({ label, value, accent }) {
  return (
    <div className="tk-kpi" style={{ borderTopColor: accent }}>
      <div className="tk-kpi-val">{value}</div>
      <div className="tk-kpi-label">{label}</div>
    </div>
  );
}

/* ---- StatsView ------------------------------------------------------------ */
function StatsView({ stats }) {
  if (!stats || stats.length === 0) return <p className="muted" style={{ padding:24 }}>No task data yet for your department.</p>;

  const total      = stats.reduce((s, r) => s + Number(r.count), 0);
  const byStatus   = {};
  const byPriority = {};
  stats.forEach((r) => {
    byStatus[r.status]     = (byStatus[r.status]     || 0) + Number(r.count);
    byPriority[r.priority] = (byPriority[r.priority] || 0) + Number(r.count);
  });

  const SC = { todo:'#8a8886', in_progress:'#0078d4', in_review:'#7a3db7', done:'#107c10', cancelled:'#c8c6c4' };
  const PC = { low:'#8a8886', medium:'#0078d4', high:'#ca5010', urgent:'#e00303' };

  return (
    <div>
      <div className="tk-kpi-row">
        <KpiCard label="Total tasks" value={total} accent="var(--brand)" />
        {Object.entries(byStatus).map(([s, n]) => (
          <KpiCard key={s} label={T.STATUS[s]?.label || s} value={n} accent={SC[s] || '#ccc'} />
        ))}
      </div>
      <h3 style={{ margin:'24px 0 12px', fontSize:14, color:'var(--text-2)' }}>By priority</h3>
      <div className="tk-kpi-row">
        {Object.entries(byPriority).map(([p, n]) => (
          <KpiCard key={p} label={T.PRIORITY[p]?.label || p} value={n} accent={PC[p] || '#ccc'} />
        ))}
      </div>
    </div>
  );
}

/* ---- ReportsView (supervisor — all dept task reports) --------------------- */
function ReportsView({ flash }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q,       setQ]       = useState('');
  const [urlCache, setUrlCache] = useState({});

  useEffect(() => {
    T.getAllReports()
      .then(setReports)
      .catch((e) => flash(e.message, true))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  const view = useMemo(() => {
    const match = searchMatcher(q);
    return reports.filter((r) => match(r.author?.name, r.body, r.task?.title));
  }, [reports, q]);

  const download = async (att) => {
    try {
      const url = urlCache[att.path] || await T.getDownloadUrl(att.path);
      setUrlCache((c) => ({ ...c, [att.path]: url }));
      window.open(url, '_blank');
    } catch (e) { flash(e.message, true); }
  };

  if (loading) return <div className="suite-loading"><div className="boot-spinner" /></div>;

  return (
    <>
      <div className="filterbar" style={{ marginTop:8 }}>
        <div className="cmd-search" style={{ marginLeft:'auto' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8886" strokeWidth="1.7" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
          <input placeholder="Search reports" value={q} onChange={(e) => setQ(e.target.value)}
            style={{ border:'none', outline:'none', background:'transparent', fontSize:13, marginLeft:6, width:180 }} />
        </div>
        <span className="count">{view.length} report{view.length === 1 ? '' : 's'}</span>
      </div>
      {view.length === 0 && <p className="muted" style={{ padding:'24px 0' }}>No reports submitted yet.</p>}
      <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:8 }}>
        {view.map((r) => (
          <div key={r.id} className="tk-report-card tk-report-card-full">
            <div className="tk-report-meta">
              <strong style={{ fontSize:13 }}>{r.author?.name}</strong>
              <span className="muted" style={{ fontSize:12 }}> on </span>
              <span style={{ fontSize:13, fontWeight:500 }}>{r.task?.title || '—'}</span>
              <span className="muted" style={{ fontSize:12, marginLeft:'auto' }}>{T.fmtDt(r.created_at)}</span>
            </div>
            <p style={{ fontSize:13, margin:'6px 0 0', whiteSpace:'pre-wrap', color:'var(--text-1)' }}>{r.body}</p>
            {r.attachments?.length > 0 && (
              <div className="tk-report-attachments">
                {r.attachments.map((att, i) => (
                  <button key={i} className="btn btn-ghost tk-attach-btn" onClick={() => download(att)}>
                    {I.attach} {att.name}
                    <span className="muted" style={{ marginLeft:6, fontSize:11 }}>{(att.size/1024).toFixed(0)} KB</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ---- Main TasksApp -------------------------------------------------------- */
export default function TasksApp({ access }) {
  const isSupervisor = access?.role === 'manager';

  const [tasks,    setTasks]    = useState([]);
  const [stats,    setStats]    = useState(null);
  const [staff,    setStaff]    = useState([]);
  const [myId,     setMyId]     = useState(null);
  const [myDeptId, setMyDeptId] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('queue');
  const [modal,    setModal]    = useState(null);
  const [q,        setQ]        = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [locked,   setLocked]   = useState(true); // protects tasks not assigned to you

  const { flash, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, s, me] = await Promise.all([
        T.getTasks(),
        isSupervisor ? T.getStats() : Promise.resolve(null),
        apiGet('/me').then((d) => d.user),
      ]);
      setTasks(t);
      setStats(s);
      setMyId(me.id);
      setMyDeptId(me.departmentId);
    } catch (e) { flash(e.message, true); }
    finally { setLoading(false); }
  }, [isSupervisor]); // eslint-disable-line

  useEffect(() => {
    load();
    if (isSupervisor) T.getStaff().then(setStaff).catch(() => {});
  }, []); // eslint-disable-line

  const view = useMemo(() => {
    let list = tasks;
    if (statusFilter) list = list.filter((t) => t.status === statusFilter);
    const match = searchMatcher(q);
    return list.filter((t) => match(t.title, t.description, t.assignee?.name));
  }, [tasks, statusFilter, q]);

  const upsert = (task) => setTasks((l) => {
    const idx = l.findIndex((t) => t.id === task.id);
    return idx >= 0 ? l.map((t) => (t.id === task.id ? task : t)) : [task, ...l];
  });

  const onStatusChange = async (task, status) => {
    try { upsert(await T.updateTask(task.id, { status })); }
    catch (e) { flash(e.message, true); }
  };

  const onDelete = async (task) => {
    const ok = await confirm({
      title: 'Delete this task?',
      message: `Delete "${task.title}"? Its reports and attachments go with it. This cannot be undone.`,
      confirmLabel: 'Delete task',
      danger: true,
    });
    if (!ok) return;
    try { await T.deleteTask(task.id); setTasks((l) => l.filter((t) => t.id !== task.id)); flash('Task deleted.'); }
    catch (e) { flash(e.message, true); }
  };

  const TABS = [
    { key: 'queue',   label: isSupervisor ? 'Department queue' : 'My queue' },
    ...(isSupervisor ? [
      { key: 'reports', label: 'Reports' },
      { key: 'stats',   label: 'KPI dashboard' },
    ] : []),
  ];

  const STATUS_FILTERS = [
    { key:'',            label:'All' },
    { key:'todo',        label:'To do' },
    { key:'in_progress', label:'In progress' },
    { key:'in_review',   label:'In review' },
    { key:'done',        label:'Done' },
  ];

  return (
    <div className="lv">
      <style>{`
        .tk-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:700; letter-spacing:.03em; }
        .tk-p-low  { background:#f3f2f1; color:#605e5c; }
        .tk-p-med  { background:#ddeeff; color:#004578; }
        .tk-p-high { background:#fff0e8; color:#8f3b00; }
        .tk-p-urg  { background:#fde7e9; color:#a4262c; }
        .tk-s-todo { background:#f3f2f1; color:#605e5c; }
        .tk-s-prog { background:#ddeeff; color:#004578; }
        .tk-s-rev  { background:#f0e6ff; color:#4f00b3; }
        .tk-s-done { background:#dff6dd; color:#1a6a1a; }
        .tk-s-canc { background:#f3f2f1; color:#a19f9d; }
        .tk-overdue { color:#a4262c !important; font-weight:600; }
        .tk-status-sel { min-width:120px; }
        .tk-kpi-row { display:flex; gap:14px; flex-wrap:wrap; margin-bottom:8px; }
        .tk-kpi { background:var(--surface); border:1px solid var(--line); border-top:3px solid var(--brand); border-radius:var(--radius-lg); padding:16px 20px; min-width:120px; flex:1; }
        .tk-kpi-val { font-size:28px; font-weight:700; line-height:1; margin-bottom:4px; }
        .tk-kpi-label { font-size:12px; color:var(--text-2); text-transform:capitalize; }
        .danger-icon { color:#a4262c; }
        .danger-icon:hover { background:#fde7e9; }
        .tk-reports-panel { background:#faf9f8; border:1px solid var(--line); border-radius:6px; padding:14px 16px; }
        .tk-reports-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
        .tk-report-card { background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:12px 14px; margin-top:8px; }
        .tk-report-card-full { border-radius:8px; }
        .tk-report-meta { display:flex; align-items:baseline; gap:4px; flex-wrap:wrap; }
        .tk-report-attachments { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
        .tk-attach-btn { font-size:12px; padding:3px 10px; display:flex; align-items:center; gap:4px; }
      `}</style>

      {/* tabs row */}
      <div className="lv-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`lv-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
        {isSupervisor && tab === 'queue' && (
          <>
            <button className="btn btn-primary lv-apply" onClick={() => setModal('create')}>
              <span style={{ marginRight:6 }}>{I.add}</span>New task
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setLocked((v) => !v)}
              style={!locked ? { background:'#fff0e8', color:'#8f3b00', borderColor:'#f0bea0' } : {}}
              title={locked ? 'Tasks not assigned to you are read-only. Click to unlock.' : 'Editing unlocked. Click to lock back.'}
            >
              {locked ? <>{I.lock} Protected</> : <>{I.unlock} Editing — lock</>}
            </button>
          </>
        )}
      </div>
      {isSupervisor && !locked && tab === 'queue' && (
        <div style={{ background:'#fff4e0', border:'1px solid #f0bea0', borderRadius:6, padding:'7px 14px', fontSize:13, color:'#8f3b00', margin:'6px 0 2px', display:'flex', alignItems:'center', gap:8 }}>
          {I.unlock} Edit mode is on — you can edit and delete any task. Lock when done.
        </div>
      )}

      {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : (
        <>
          {tab === 'queue' && (
            <>
              <div className="filterbar" style={{ marginTop:8 }}>
                <div className="filter-pills">
                  {STATUS_FILTERS.map((f) => (
                    <button key={f.key} className={`pill ${statusFilter === f.key ? 'active' : ''}`} onClick={() => setStatusFilter(f.key)}>{f.label}</button>
                  ))}
                </div>
                <div className="cmd-search" style={{ marginLeft:'auto' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8886" strokeWidth="1.7" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
                  <input placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)}
                    style={{ border:'none', outline:'none', background:'transparent', fontSize:13, marginLeft:6, width:160 }} />
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
                      <th>Due</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.length === 0 && (
                      <tr><td colSpan={6}>
                        {tasks.length === 0
                          ? <EmptyState title="No tasks yet"
                              hint={isSupervisor ? 'Create a task and assign it to someone on your team.' : 'Tasks assigned to you will appear here.'} />
                          : <span className="td-empty" style={{ display: 'block' }}>No tasks match your filters.</span>}
                      </td></tr>
                    )}
                    {view.map((task) => (
                      <TaskRow key={task.id} task={task} isSupervisor={isSupervisor} myId={myId} locked={locked}
                        onEdit={(t) => setModal(t)}
                        onDelete={onDelete}
                        onStatusChange={onStatusChange}
                        flash={flash} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'reports' && isSupervisor && <ReportsView flash={flash} />}
          {tab === 'stats'   && isSupervisor && <div style={{ padding:'8px 0' }}><StatsView stats={stats} /></div>}
        </>
      )}

      {modal && (
        <TaskModal
          task={modal === 'create' ? null : modal}
          staff={staff}
          myDeptId={myDeptId}
          isSupervisor={isSupervisor}
          onClose={() => setModal(null)}
          onSaved={(saved) => { upsert(saved); setModal(null); flash(modal === 'create' ? 'Task created.' : 'Task updated.'); }}
          onError={(m) => flash(m, true)} />
      )}
      {toastNode}
      {confirmNode}
    </div>
  );
}
