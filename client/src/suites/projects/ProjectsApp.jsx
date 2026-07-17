import { useCallback, useEffect, useState } from 'react';
import * as PR from './projectsApi.js';
import { apiGet } from '../../api/client.js';
import { useToast, useConfirm, Modal, EmptyState } from '../../components/ui.jsx';

const CSS = `
  .pj-badge { display:inline-block; padding:2px 9px; border-radius:10px; font-size:11px; font-weight:700; letter-spacing:.03em; }
  .pj-s-active    { background:#dff6dd; color:#1a6a1a; }
  .pj-s-hold      { background:#fff4ce; color:#7a5200; }
  .pj-s-done      { background:#deecfd; color:#194b8f; }
  .pj-s-cancelled { background:#f3f2f1; color:#605e5c; }
  .pj-board       { display:flex; gap:14px; overflow-x:auto; padding-bottom:8px; }
  .pj-col         { background:var(--surface); border:1px solid var(--line); border-radius:8px; min-width:240px; flex:1; padding:10px; }
  .pj-col-head    { font-size:12px; font-weight:700; color:var(--text-2); text-transform:uppercase; letter-spacing:.04em; margin-bottom:8px; padding:0 4px; }
  .pj-card        { background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:10px 12px; margin-bottom:8px; font-size:13px; }
  .pj-card-title  { font-weight:500; margin-bottom:4px; }
  .pj-card-meta   { font-size:12px; color:var(--text-2); display:flex; justify-content:space-between; align-items:center; margin-top:6px; }
  .pj-priority    { display:inline-block; padding:1px 7px; border-radius:8px; font-size:10px; font-weight:700; }
  .pj-p-low       { background:#f3f2f1; color:#605e5c; }
  .pj-p-medium    { background:#deecfd; color:#194b8f; }
  .pj-p-high      { background:#fff4ce; color:#7a5200; }
  .pj-p-urgent    { background:#fde7e9; color:#a4262c; }
`;

function Field({ label, children }) { return <div className="field"><label>{label}</label>{children}</div>; }
function ProjectStatusBadge({ status }) { const s = PR.PROJECT_STATUS[status] || PR.PROJECT_STATUS.active; return <span className={`pj-badge ${s.cls}`}>{s.label}</span>; }

function ProjectModal({ onClose, onSaved, flash }) {
  const [f, setF] = useState({ name: '', description: '', startDate: '', targetDate: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return flash('Project name is required.', true);
    setBusy(true);
    try { const saved = await PR.createProject(f); flash('Project created.'); onSaved(saved); onClose(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };
  return (
    <Modal title="New project" onClose={onClose} wide>
      <form onSubmit={submit}>
        <Field label="Project name *"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></Field>
        <Field label="Description"><textarea className="input" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></Field>
        <div className="form-grid">
          <Field label="Start date"><input className="input" type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
          <Field label="Target date"><input className="input" type="date" value={f.targetDate} onChange={(e) => set('targetDate', e.target.value)} /></Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Create project'}</button>
        </div>
      </form>
    </Modal>
  );
}

function TaskModal({ milestones, members, onClose, onSaved, flash }) {
  const [f, setF] = useState({ title: '', description: '', milestoneId: '', assignedTo: '', priority: 'medium', dueDate: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return flash('Task title is required.', true);
    setBusy(true);
    try { await onSaved(f); onClose(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };
  return (
    <Modal title="New task" onClose={onClose} wide>
      <form onSubmit={submit}>
        <Field label="Title *"><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} required autoFocus /></Field>
        <div className="form-grid">
          <Field label="Milestone">
            <select className="select" value={f.milestoneId} onChange={(e) => set('milestoneId', e.target.value)}>
              <option value="">— None —</option>
              {milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </Field>
          <Field label="Assignee">
            <select className="select" value={f.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
              <option value="">— Unassigned —</option>
              {members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="select" value={f.priority} onChange={(e) => set('priority', e.target.value)}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field label="Due date"><input className="input" type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Add task'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ProjectDetail({ project, onBack, flash }) {
  const [tab, setTab] = useState('board');
  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [members, setMembers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taskModal, setTaskModal] = useState(false);
  const [msTitle, setMsTitle] = useState('');
  const [msDue, setMsDue] = useState('');
  const [addUserId, setAddUserId] = useState('');
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, m, mem] = await Promise.all([PR.getTasks(project.id), PR.getMilestones(project.id), PR.getMembers(project.id)]);
      setTasks(t); setMilestones(m); setMembers(mem);
    } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [project.id, flash]);

  useEffect(() => { load(); apiGet('/staff').then((d) => setStaff(d.staff)).catch(() => {}); }, [load]);

  const moveTask = async (task, status) => {
    const prevStatus = task.status;
    // Optimistic: move the card immediately; revert on failure. No full load() —
    // that would blank the whole board to a spinner for a single card move.
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      await PR.updateTask(project.id, task.id, { status });
    } catch (e) {
      setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status: prevStatus } : t)));
      flash(e.message, true);
    }
  };
  const addMilestone = async (e) => {
    e.preventDefault();
    if (!msTitle.trim()) return flash('Milestone title is required.', true);
    try { await PR.createMilestone(project.id, { title: msTitle, dueDate: msDue }); setMsTitle(''); setMsDue(''); flash('Milestone added.'); load(); }
    catch (e2) { flash(e2.message, true); }
  };
  const addMember_ = async () => {
    if (!addUserId) return;
    try { await PR.addMember(project.id, { userId: addUserId }); setAddUserId(''); flash('Member added.'); load(); }
    catch (e) { flash(e.message, true); }
  };
  const removeMember_ = async (m) => {
    const ok = await confirm({
      title: 'Remove member?',
      message: `${m.user?.name || 'This member'} loses access to the project's board and tasks — this can include the project lead.`,
      confirmLabel: 'Remove', danger: true,
    });
    if (!ok) return;
    try { await PR.removeMember(project.id, m.user_id); flash('Member removed.'); load(); } catch (e) { flash(e.message, true); }
  };
  const nonMembers = staff.filter((s) => !members.some((m) => m.user_id === s.id));

  return (
    <>
      <div className="lv-tabs">
        <button className="btn btn-ghost" onClick={onBack}>&larr; All projects</button>
        <button className={`lv-tab ${tab === 'board' ? 'active' : ''}`} onClick={() => setTab('board')}>Board</button>
        <button className={`lv-tab ${tab === 'milestones' ? 'active' : ''}`} onClick={() => setTab('milestones')}>Milestones</button>
        <button className={`lv-tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>Members</button>
        {tab === 'board' && <button className="btn btn-primary lv-apply" onClick={() => setTaskModal(true)}>Add task</button>}
      </div>

      <h2 style={{ margin: '8px 0 4px' }}>{project.name}</h2>
      {project.description && <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>{project.description}</p>}

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {!loading && tab === 'board' && (
        <div className="pj-board">
          {PR.COLUMNS.map((col) => (
            <div className="pj-col" key={col.key}>
              <div className="pj-col-head">{col.label} ({tasks.filter((t) => t.status === col.key).length})</div>
              {tasks.filter((t) => t.status === col.key).map((t) => (
                <div className="pj-card" key={t.id}>
                  <div className="pj-card-title">{t.title}</div>
                  <div className="pj-card-meta">
                    <span className={`pj-priority pj-p-${t.priority}`}>{t.priority}</span>
                    <span>{t.assignee?.name || 'Unassigned'}</span>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <select className="select" style={{ fontSize: 12, padding: '2px 6px' }} value={t.status} onChange={(e) => moveTask(t, e.target.value)}>
                      {PR.COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'milestones' && (
        <>
          <form onSubmit={addMilestone} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input className="input" placeholder="Milestone title" value={msTitle} onChange={(e) => setMsTitle(e.target.value)} style={{ flex: 1 }} />
            <input className="input" type="date" value={msDue} onChange={(e) => setMsDue(e.target.value)} style={{ maxWidth: 160 }} />
            <button className="btn btn-primary">Add</button>
          </form>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Title</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {milestones.length === 0 && <tr><td colSpan={3} className="td-empty">No milestones yet.</td></tr>}
                {milestones.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 500 }}>{m.title}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{PR.fmtDate(m.due_date)}</td>
                    <td>
                      <select className="select" style={{ fontSize: 12 }} value={m.status} onChange={async (e) => { try { await PR.updateMilestone(project.id, m.id, { status: e.target.value }); load(); } catch (err) { flash(err.message, true); } }}>
                        <option value="pending">Pending</option><option value="in_progress">In progress</option><option value="done">Done</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && tab === 'members' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <select className="select" value={addUserId} onChange={(e) => setAddUserId(e.target.value)} style={{ flex: 1, maxWidth: 280 }}>
              <option value="">— Select staff to add —</option>
              {nonMembers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn btn-primary" onClick={addMember_} disabled={!addUserId}>Add member</button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th><th></th></tr></thead>
              <tbody>
                {members.length === 0 && <tr><td colSpan={3} className="td-empty">No members yet.</td></tr>}
                {members.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 500 }}>{m.user?.name}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{m.role}</td>
                    <td><button className="iconbtn" onClick={() => removeMember_(m)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {taskModal && (
        <TaskModal
          milestones={milestones} members={members} onClose={() => setTaskModal(false)} flash={flash}
          onSaved={async (f) => { await PR.createTask(project.id, f); flash('Task added.'); load(); }}
        />
      )}
      {confirmNode}
    </>
  );
}

export default function ProjectsApp() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [active, setActive] = useState(null);
  const { flash, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try { setProjects(await PR.getProjects()); } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const removeProject = async (p) => {
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      message: 'This removes all its milestones and tasks too.',
      confirmLabel: 'Delete project', danger: true,
    });
    if (!ok) return;
    try { await PR.deleteProject(p.id); flash('Project deleted.'); load(); } catch (e) { flash(e.message, true); }
  };

  if (active) {
    return (
      <div className="lv">
        <style>{CSS}</style>
        <ProjectDetail project={active} onBack={() => { setActive(null); load(); }} flash={flash} />
        {toastNode}
      </div>
    );
  }

  return (
    <div className="lv">
      <style>{CSS}</style>
      <div className="filterbar" style={{ marginTop: 8 }}>
        <span className="count">{projects.length} project{projects.length === 1 ? '' : 's'}</span>
        <button className="btn btn-primary lv-apply" onClick={() => setModal(true)}>New project</button>
      </div>
      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}
      {!loading && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Project</th><th>Owner</th><th>Target date</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {projects.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 0 }}>
                  <EmptyState title="No projects yet" hint="Create a project to start tracking tasks and milestones." />
                </td></tr>
              )}
              {projects.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500, cursor: 'pointer' }} onClick={() => setActive(p)}>{p.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{p.owner?.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{PR.fmtDate(p.target_date)}</td>
                  <td><ProjectStatusBadge status={p.status} /></td>
                  <td>
                    <button className="iconbtn" onClick={() => setActive(p)}>Open</button>
                    <button className="iconbtn" onClick={() => removeProject(p)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <ProjectModal onClose={() => setModal(false)} onSaved={load} flash={flash} />}
      {confirmNode}
      {toastNode}
    </div>
  );
}
