import { useCallback, useEffect, useMemo, useState } from 'react';
import * as PR from './projectsApi.js';
import { Modal, SearchSelect, useConfirm, useToast } from '../../components/ui.jsx';

/* ===========================================================================
   ProjectTaskTree — one task, its subtasks and what is holding it up.
   Backed by projects_v2.sql (project_tasks.parent_task_id, project_task_deps).
   =========================================================================== */

const CSS = `
  .ptt-panel      { background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:14px 16px; margin-top:12px; }
  .ptt-head       { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px; }
  .ptt-head-title { font-size:13px; font-weight:600; }
  .ptt-note       { font-size:12.5px; color:var(--text-2); margin:4px 0 0; }
  .ptt-banner     { display:flex; gap:10px; align-items:flex-start; border-radius:8px; padding:11px 14px; font-size:13px; line-height:1.5; }
  .ptt-blocked    { background:#fde7e9; color:#a4262c; border:1px solid #f1bcc0; }
  .ptt-clear      { background:#dff6dd; color:#1a6a1a; border:1px solid #b7e3b4; }
  .ptt-banner strong { display:block; font-size:13.5px; margin-bottom:2px; }
  .ptt-chip       { display:inline-block; padding:2px 9px; border-radius:10px; font-size:11px; font-weight:700; letter-spacing:.03em; white-space:nowrap; }
  .ptt-flag       { display:inline-flex; align-items:center; gap:4px; padding:1px 8px; border-radius:10px; font-size:11px; font-weight:700; background:#fde7e9; color:#a4262c; white-space:nowrap; }
  .ptt-p-high     { background:#fff4ce; color:#7a5200; }
  .ptt-p-urgent   { background:#fde7e9; color:#a4262c; }
  .ptt-tree td    { vertical-align:middle; }
  /* The subtask title is a row header for screen readers, so it is a <th>. The
     app's .table th styling is written for column headers, undo it here. */
  .ptt-tree tbody th { text-transform:none; letter-spacing:0; font-size:13px; font-weight:500;
                       color:var(--text); background:transparent; white-space:normal; }
  .ptt-sr         { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
  .ptt-twig       { color:var(--text-2); margin-right:6px; }
  .ptt-deps       { display:flex; flex-direction:column; gap:6px; margin:0; padding:0; list-style:none; }
  .ptt-dep        { display:flex; align-items:center; gap:8px; flex-wrap:wrap; background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:7px 10px; font-size:13px; }
  .ptt-dep-name   { font-weight:500; }
  .ptt-add-dep    { display:flex; gap:8px; align-items:center; margin-top:8px; }
  .ptt-danger     { color:#a4262c; }
  .ptt-danger:hover { background:#fde7e9; }
  /* Below 640px the app turns table rows into cards: td goes display:block but
     th does not, which would leave the title stranded in a one-cell row. */
  @media (max-width: 640px) {
    .ptt-tree tbody th { display:block; padding:3px 0; border:0; }
  }
`;

const I = {
  add:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>,
  up:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>,
  lock:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
  tick:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M20 6L9 17l-5-5" /></svg>,
  x:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
};

/* Legacy labels for the four seeded slugs, used only when a task cannot be
   matched to a status row (see finishedIn below). */
const LEGACY_LABEL = Object.fromEntries(PR.COLUMNS.map((c) => [c.key, c.label]));

function StatusChip({ task, statusIndex }) {
  const s = PR.statusOf(task, statusIndex);
  if (!s) return <span className="ptt-chip" style={{ background: '#f3f2f1', color: '#605e5c' }}>{LEGACY_LABEL[task.status] || task.status || 'No status'}</span>;
  return <span className="ptt-chip" style={{ background: s.colour, color: PR.readableOn(s.colour) }}>{s.name}</span>;
}

/* ---- add a subtask -------------------------------------------------------- */
function SubtaskModal({ parentTitle, members, onClose, onSave }) {
  const [f, setF] = useState({ title: '', assignedTo: '', priority: 'medium', dueDate: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    setBusy(true);
    try { await onSave(f); } finally { setBusy(false); }
  };

  return (
    <Modal title="Add subtask" onClose={onClose} wide>
      <form onSubmit={submit}>
        <p className="ptt-note" style={{ margin: '0 0 10px' }}>Sits under “{parentTitle}”. It gets its own row on the board, in the project's first column.</p>
        <div className="field"><label>Title *</label>
          <input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} required autoFocus />
        </div>
        <div className="form-grid">
          <div className="field"><label>Assignee</label>
            <select className="select" value={f.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
              <option value="">— Unassigned —</option>
              {members.map((m) => <option key={m.user?.id || m.user_id} value={m.user?.id || m.user_id}>{m.user?.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Priority</label>
            <select className="select" value={f.priority} onChange={(e) => set('priority', e.target.value)}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="field"><label>Due date</label>
            <input className="input" type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Add subtask'}</button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * ProjectTaskTree
 *
 * Props:
 *   task      {object}   required. The project_tasks row on show. Needs at least
 *                        { id, title }; status_id, parent_task_id, assignee,
 *                        priority and due_date are used when present. The live
 *                        copy is taken from this component's own fetch, so a
 *                        slightly stale prop is safe.
 *   projectId {string}   required. uuid of the project the task belongs to.
 *   statuses  {Status[]} the project's columns, PR.getStatuses(projectId).
 *                        Optional: pass [] (or nothing) while still loading and
 *                        the component falls back to the legacy status text.
 *   onChanged {Function} optional, called with no arguments after a subtask or
 *                        dependency is created, moved or deleted, so the parent
 *                        can refresh its own board. This component reloads its
 *                        own data either way.
 */
export default function ProjectTaskTree({ task, projectId, statuses = [], onChanged }) {
  const [tasks, setTasks] = useState(null);   // every task in the project, for the tree and the pickers
  const [deps, setDeps] = useState([]);
  const [members, setMembers] = useState([]);
  const [addUnder, setAddUnder] = useState(null); // parent task for the modal, null = closed
  const [prereqPick, setPrereqPick] = useState('');
  const [blockPick, setBlockPick] = useState('');
  const [busy, setBusy] = useState(false);
  const { flash, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(async () => {
    try {
      // Dependencies are a bonus; the subtask tree is the point. Failing the
      // whole load when /deps is unavailable (demo mode has no such route) made
      // the panel claim "No subtasks" for a task that has them, which is wrong
      // data rather than a missing feature.
      const t = await PR.getTasks(projectId);
      setTasks(t);
      const d = await PR.getDependencies(projectId).catch(() => []);
      setDeps(d);
    } catch (e) { setTasks([]); flash(e.message, true); }
  }, [projectId, flash]);

  useEffect(() => { load(); }, [load]);
  // Members only fill the assignee picker. If the caller cannot read them the
  // picker is simply empty, that is not worth an error toast.
  useEffect(() => { PR.getMembers(projectId).then(setMembers).catch(() => {}); }, [projectId]);

  const statusIndex = useMemo(() => PR.byId(statuses), [statuses]);
  const taskIndex = useMemo(() => PR.byId(tasks || []), [tasks]);

  // status_id is the truth, but a row can arrive without a resolvable status:
  // the parent may still be loading its columns, or the task predates the
  // migration. Falling back to the legacy text mirror keeps "is this finished"
  // answerable. Treating it as unfinished instead would paint every task on the
  // screen as blocked.
  const finished = useCallback((t) => {
    const s = PR.statusOf(t, statusIndex);
    return s ? Boolean(s.is_done) : t?.status === 'done';
  }, [statusIndex]);

  const statusName = useCallback((t) => {
    const s = PR.statusOf(t, statusIndex);
    return s ? s.name : (LEGACY_LABEL[t?.status] || 'not started');
  }, [statusIndex]);

  const live = taskIndex[task.id] || task;

  // The subtree hanging off this task, each row stamped with .depth.
  const subtasks = useMemo(() => {
    const find = (nodes) => {
      for (const n of nodes) {
        if (n.id === task.id) return n;
        const hit = find(n.children);
        if (hit) return hit;
      }
      return null;
    };
    const node = find(PR.buildTaskTree(tasks || []));
    return node ? PR.flattenTaskTree(node.children) : [];
  }, [tasks, task.id]);

  const waitingOn = deps.filter((d) => d.task_id === task.id);
  const blocking  = deps.filter((d) => d.depends_on_id === task.id);
  const depTitle = (d, side) => (side === 'prereq' ? d.prerequisite?.title : d.task?.title)
    || taskIndex[side === 'prereq' ? d.depends_on_id : d.task_id]?.title
    || 'Another task';

  // Prerequisites that are not finished yet.
  //
  // An unreadable prerequisite counts as OUTSTANDING, not as finished. The
  // earlier `b.prereq &&` dropped it, so someone assigned a blocked task who
  // is not a project member saw a green "Clear to start" banner directly above
  // a row saying "You cannot see this task" — and the move was then refused by
  // the database after they had already done the work. Unknown is not clear.
  const outstanding = waitingOn
    .map((d) => ({ dep: d, prereq: taskIndex[d.depends_on_id], title: depTitle(d, 'prereq') }))
    .filter((b) => !b.prereq || !finished(b.prereq));

  const blockersOf = (t) => deps
    .filter((d) => d.task_id === t.id)
    .map((d) => ({ prereq: taskIndex[d.depends_on_id], title: depTitle(d, 'prereq') }))
    .filter((b) => b.prereq && !finished(b.prereq));

  const blockerSentence = (list) => {
    const names = list.map((b) => `“${b.title}”`);
    if (names.length === 1) return `Waiting on ${names[0]}, which is still ${statusName(list[0].prereq).toLowerCase()}.`;
    const last = names.pop();
    return `Waiting on ${names.join(', ')} and ${last}, none of them are finished yet.`;
  };

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); await load(); onChanged?.(); if (okMsg) flash(okMsg); }
    catch (e) { flash(e.message, true); }
    finally { setBusy(false); }
  };

  const addSubtask = (f) => run(async () => {
    await PR.createTask(projectId, {
      title: f.title.trim(), description: '', assignedTo: f.assignedTo || '',
      priority: f.priority, dueDate: f.dueDate || '', parentTaskId: addUnder.id,
    });
    setAddUnder(null);
  }, 'Subtask added.');

  // Promote moves a subtask up one level, to its parent's parent. When the
  // parent is the task on show, "up one level" means out of this tree entirely,
  // so say so before doing it.
  const promote = async (row) => {
    const parent = taskIndex[row.parent_task_id];
    const grandparent = parent?.parent_task_id ? taskIndex[parent.parent_task_id] : null;
    if (!grandparent) {
      const ok = await confirm({
        title: 'Move out of this task?',
        message: `“${row.title}” becomes a task in its own right${parent ? `, no longer under “${parent.title}”` : ''}. Its own subtasks travel with it, and it stops showing here.`,
        confirmLabel: 'Move it out',
      });
      if (!ok) return;
    }
    run(() => PR.setTaskParent(projectId, row.id, grandparent ? grandparent.id : null), 'Subtask moved up a level.');
  };

  // Direct children only. parent_task_id is `on delete set null`, so deleting a
  // parent PROMOTES its children to top level rather than destroying them, and
  // only that first level moves. Counting the whole subtree here would overstate
  // what happens; saying "deleted" would be flatly wrong.
  const directChildCount = (id) => subtasks.filter((r) => r.parent_task_id === id).length;

  const descendantCount = (id) => {
    let n = 0;
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      for (const r of subtasks) if (r.parent_task_id === cur) { n += 1; stack.push(r.id); }
    }
    return n;
  };

  const removeSubtask = async (row) => {
    const kids = directChildCount(row.id);
    const ok = await confirm({
      title: 'Delete subtask?',
      message: `“${row.title}” will be deleted. ${kids
        ? `Its ${kids} subtask${kids === 1 ? '' : 's'} will move up to the top level of the project, not be deleted. `
        : ''}Any time logged against it stays on the project. This cannot be undone.`,
      confirmLabel: 'Delete subtask', danger: true,
    });
    if (!ok) return;
    run(() => PR.deleteTask(projectId, row.id), 'Subtask deleted.');
  };

  const linked = new Set([task.id, ...waitingOn.map((d) => d.depends_on_id), ...blocking.map((d) => d.task_id)]);
  const pickerOptions = (tasks || [])
    .filter((t) => !linked.has(t.id))
    .map((t) => ({ value: t.id, label: t.title, hint: statusName(t) }));

  if (tasks === null) {
    return <div style={{ padding: '14px 0' }}><div className="boot-spinner" style={{ width: 18, height: 18 }} /></div>;
  }

  return (
    <div>
      <style>{CSS}</style>

      {/* The one thing an assignee opening this needs to know first. */}
      <div role="status" aria-live="polite">
        {outstanding.length > 0 && (
          <div className="ptt-banner ptt-blocked">
            {I.lock}
            <span>
              <strong>Blocked, do not start yet.</strong>
              {blockerSentence(outstanding)}
            </span>
          </div>
        )}
        {outstanding.length === 0 && waitingOn.length > 0 && (
          <div className="ptt-banner ptt-clear">
            {I.tick}
            <span>
              <strong>Clear to start.</strong>
              Everything this task waits on is finished.
            </span>
          </div>
        )}
      </div>

      {/* ---- subtasks ---- */}
      <div className="ptt-panel">
        <div className="ptt-head">
          <span className="ptt-head-title">Subtasks ({subtasks.length})</span>
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '3px 12px' }} disabled={busy} onClick={() => setAddUnder(live)}>
            <span style={{ marginRight: 5 }}>{I.add}</span>Add subtask
          </button>
        </div>

        {subtasks.length === 0 && (
          <p className="ptt-note">No subtasks. Break the work into steps and each one gets its own assignee, due date and column on the board.</p>
        )}

        {subtasks.length > 0 && (
          <div className="table-wrap">
            <table className="table ptt-tree" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th scope="col">Subtask</th>
                  <th scope="col">Status</th>
                  <th scope="col">Assignee</th>
                  <th scope="col">Due</th>
                  <th scope="col"><span className="ptt-sr">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {subtasks.map((row) => {
                  const blockers = blockersOf(row);
                  const done = finished(row);
                  return (
                    <tr key={row.id} style={done ? { opacity: 0.62 } : undefined}>
                      <th scope="row" style={{ fontWeight: 500, textAlign: 'left', paddingLeft: 12 + row.depth * 18 }}>
                        <span className="ptt-twig" aria-hidden="true">└</span>
                        {row.title}
                        {(row.priority === 'high' || row.priority === 'urgent') && (
                          <span className={`ptt-chip ptt-p-${row.priority}`} style={{ marginLeft: 8 }}>{row.priority === 'high' ? 'High' : 'Urgent'}</span>
                        )}
                        {blockers.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <span className="ptt-flag">Blocked by “{blockers[0].title}”{blockers.length > 1 ? ` and ${blockers.length - 1} more` : ''}</span>
                          </div>
                        )}
                      </th>
                      <td><StatusChip task={row} statusIndex={statusIndex} /></td>
                      <td className="muted">{row.assignee?.name || 'Unassigned'}</td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{PR.fmtDate(row.due_date)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="iconbtn" disabled={busy} aria-label={`Add a subtask under ${row.title}`} title="Add a subtask under this one" onClick={() => setAddUnder(row)}>{I.add}</button>
                          <button className="iconbtn" disabled={busy} aria-label={`Move ${row.title} up a level`} title="Move up a level" onClick={() => promote(row)}>{I.up}</button>
                          <button className="iconbtn ptt-danger" disabled={busy} aria-label={`Delete ${row.title}`} title="Delete subtask" onClick={() => removeSubtask(row)}>{I.trash}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- dependencies ---- */}
      <div className="ptt-panel">
        <div className="ptt-head"><span className="ptt-head-title">Blocked by ({waitingOn.length})</span></div>
        {waitingOn.length === 0 && <p className="ptt-note">Nothing is holding this task up.</p>}
        {waitingOn.length > 0 && (
          <ul className="ptt-deps">
            {waitingOn.map((d) => {
              const prereq = taskIndex[d.depends_on_id];
              const clear = prereq ? finished(prereq) : null;
              return (
                <li key={d.id} className="ptt-dep">
                  <span className="ptt-dep-name">{depTitle(d, 'prereq')}</span>
                  {prereq && <StatusChip task={prereq} statusIndex={statusIndex} />}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {clear === null ? 'You cannot see this task, ask the project lead where it stands.'
                      : clear ? 'Finished, this one is no longer holding you up.'
                        : 'Not finished, this task cannot start.'}
                  </span>
                  <button className="iconbtn ptt-danger" style={{ marginLeft: 'auto' }} disabled={busy}
                    aria-label={`Stop waiting on ${depTitle(d, 'prereq')}`} title="Remove this dependency"
                    onClick={() => run(() => PR.removeDependency(projectId, d.id), 'Dependency removed.')}>{I.x}</button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="ptt-add-dep">
          <SearchSelect options={pickerOptions} value={prereqPick} onChange={setPrereqPick}
            emptyLabel="— Wait for another task —" placeholder="Search tasks in this project" style={{ flex: 1, maxWidth: 320 }} />
          <button className="btn btn-ghost" disabled={busy || !prereqPick}
            onClick={() => run(async () => { await PR.addDependency(projectId, task.id, prereqPick); setPrereqPick(''); }, 'Dependency added.')}>
            Add
          </button>
        </div>
      </div>

      <div className="ptt-panel">
        <div className="ptt-head"><span className="ptt-head-title">Blocks ({blocking.length})</span></div>
        {blocking.length === 0 && <p className="ptt-note">No one is waiting on this task.</p>}
        {blocking.length > 0 && (
          <ul className="ptt-deps">
            {blocking.map((d) => {
              const dependent = taskIndex[d.task_id];
              return (
                <li key={d.id} className="ptt-dep">
                  <span className="ptt-dep-name">{depTitle(d, 'task')}</span>
                  {dependent && <StatusChip task={dependent} statusIndex={statusIndex} />}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {finished(live) ? 'Free to start now this task is finished.' : 'Cannot start until this task is finished.'}
                  </span>
                  <button className="iconbtn ptt-danger" style={{ marginLeft: 'auto' }} disabled={busy}
                    aria-label={`Stop ${depTitle(d, 'task')} waiting on this task`} title="Remove this dependency"
                    onClick={() => run(() => PR.removeDependency(projectId, d.id), 'Dependency removed.')}>{I.x}</button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="ptt-add-dep">
          <SearchSelect options={pickerOptions} value={blockPick} onChange={setBlockPick}
            emptyLabel="— Hold another task back —" placeholder="Search tasks in this project" style={{ flex: 1, maxWidth: 320 }} />
          <button className="btn btn-ghost" disabled={busy || !blockPick}
            onClick={() => run(async () => { await PR.addDependency(projectId, blockPick, task.id); setBlockPick(''); }, 'Dependency added.')}>
            Add
          </button>
        </div>
      </div>

      {addUnder && (
        <SubtaskModal parentTitle={addUnder.title} members={members}
          onClose={() => setAddUnder(null)} onSave={addSubtask} />
      )}
      {confirmNode}
      {toastNode}
    </div>
  );
}
