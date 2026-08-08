import { useEffect, useMemo, useState } from 'react';
import * as PR from './projectsApi.js';
import { EmptyState, Modal, useConfirm, useToast } from '../../components/ui.jsx';
import { todayISO } from '../../lib/today.js';

/* ===========================================================================
   ProjectBoard: the Kanban board, driven by the project's own statuses.

   The old board hard-coded four columns, so every project in the workspace
   looked the same whether it was a build, a court filing or a delivery run.
   Here one column is one project_statuses row, in position order, and a lead
   decides what those columns are.

   PROPS
     projectId          string    uuid of the project. Required.
     tasks              Task[]    rows from PR.getTasks(projectId). Each one
                                  carries status_id, parent_task_id, priority,
                                  due_date and the joined assignee. Required,
                                  an empty array is fine.
     statuses           Status[]  rows from PR.getStatuses(projectId), in
                                  position order. Required. An empty array
                                  renders the "no columns" state rather than a
                                  blank screen.
     onChanged          () => void   Called after every successful write. The
                                  parent should refetch BOTH tasks and
                                  statuses: deleting a column moves its tasks,
                                  so the task list changes too. Optional, but
                                  without it the board only ever shows its own
                                  optimistic state.
     canManageStatuses  boolean   Optional, default true. Hides the column
                                  editor when the caller already knows this
                                  person is not a manager, owner or lead. The
                                  database is still the real gate: leaving it
                                  true is safe, a refused write is explained
                                  in plain English.
     onOpenTask         (task) => void  Optional. Renders an Edit button on
                                  each card, wired to the parent's task modal.
     onDeleteTask       (task) => void  Optional. Renders a Delete button.
                                  The parent owns the confirm and the reload,
                                  so the board does not duplicate either.
     flash              (msg, isError) => void  Optional. Falls back to the
                                  board's own toast when the parent has none.
   =========================================================================== */

const CSS = `
  .pb-bar      { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:4px 0 10px; }
  .pb-board    { display:flex; gap:12px; align-items:flex-start; overflow-x:auto; padding:4px 2px 12px;
                 scroll-snap-type:x proximity; -webkit-overflow-scrolling:touch; }
  .pb-board:focus-visible { outline:2px solid var(--brand); outline-offset:2px; border-radius:8px; }
  .pb-col      { flex:0 0 258px; min-width:258px; scroll-snap-align:start; background:var(--surface-2);
                 border:1px solid var(--line); border-radius:12px; padding:10px; }
  .pb-col.over { outline:2px dashed var(--brand); outline-offset:-2px; }
  .pb-col-head { display:flex; align-items:center; gap:8px; margin:0 0 8px; font-size:13px; font-weight:600; }
  .pb-chip     { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:100px;
                 font-size:11.5px; font-weight:700; letter-spacing:.02em; max-width:170px; }
  .pb-chip span.t { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pb-count    { font-size:12px; font-weight:600; color:var(--text-2); margin-left:auto; }
  .pb-card     { background:var(--surface); border:1px solid var(--line); border-left-width:3px;
                 border-radius:10px; padding:9px 11px; margin-bottom:8px; font-size:13px; cursor:grab; }
  .pb-card:hover  { border-color:var(--text-2); }
  .pb-card:active { cursor:grabbing; }
  .pb-card.lifted { opacity:.5; }
  .pb-title    { font-weight:600; font-size:13.5px; margin-bottom:3px; word-break:break-word; }
  .pb-meta     { font-size:12px; color:var(--text-2); display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:5px; }
  .pb-sub      { font-size:11.5px; color:var(--text-2); margin-top:3px; }
  .pb-due      { font-size:11.5px; color:var(--text-2); margin-top:3px; }
  .pb-due.late { color:#a4262c; font-weight:600; }
  .pb-actions  { display:flex; gap:6px; align-items:center; margin-top:8px; }
  .pb-move     { flex:1; min-width:0; font-size:12px; padding:3px 6px; }
  .pb-empty    { font-size:12.5px; color:var(--text-2); padding:2px 2px 6px; }
  .pb-note     { font-size:12.5px; color:var(--text-2); line-height:1.5; margin:0 0 12px; }
  .pb-warn     { background:#fff4ce; color:#7a5200; border:1px solid #f0d999; border-radius:8px;
                 padding:8px 12px; font-size:12.5px; line-height:1.5; margin:0 0 12px; }
  /* Priority chips are redeclared here rather than borrowed from ProjectsApp's
     style block, so the board still looks right wherever it is mounted. */
  .pb-pri      { display:inline-block; padding:1px 8px; border-radius:100px; font-size:10.5px; font-weight:700; }
  .pb-pri-low    { background:#f3f2f1; color:#605e5c; }
  .pb-pri-medium { background:#deecfd; color:#194b8f; }
  .pb-pri-high   { background:#fff4ce; color:#7a5200; }
  .pb-pri-urgent { background:#fde7e9; color:#a4262c; }
  .pb-swatches { display:flex; gap:6px; flex-wrap:wrap; }
  .pb-swatch   { width:24px; height:24px; border-radius:6px; border:1px solid rgba(0,0,0,.18); cursor:pointer;
                 display:grid; place-items:center; padding:0; }
  .pb-swatch.on { box-shadow:0 0 0 2px var(--surface), 0 0 0 4px var(--text); }
  .pb-name-in  { width:100%; min-width:130px; font-size:13px; }
  .pb-sr       { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden;
                 clip:rect(0 0 0 0); white-space:nowrap; border:0; }
  /* On a phone the board must scroll, not squash. Columns take most of the
     width with a sliver of the next one showing, which is the only honest
     signal that there is more board to the right. */
  @media (max-width: 640px) {
    .pb-board { scroll-snap-type:x mandatory; }
    .pb-col   { flex-basis:78vw; min-width:78vw; }
  }
`;

const ICON = {
  up:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M18 15l-6-6-6 6" /></svg>,
  down:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>,
  tick:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>,
};

// Index-aligned with PR.STATUS_COLOURS. A swatch labelled "Colour 3" tells a
// screen-reader user nothing, and the hex tells them less.
const COLOUR_NAMES = ['Grey', 'Blue', 'Ochre', 'Green', 'Red', 'Purple', 'Teal', 'Brown'];
const colourName = (hex, i) => COLOUR_NAMES[i] || hex;

const DENIED_COLUMNS = 'Only a projects manager, the project owner or a project lead can change this board\'s columns.';
const DENIED_MOVE = 'You do not have permission to move this task.';

// PostgREST speaks in its own dialect and the facade passes it through
// untouched. Two of its messages are unreadable and both mean the same thing:
// row-level security refused the write. An update that RLS filters out matches
// no row at all, which surfaces as the "no rows returned" complaint rather
// than as a permission error, so both spellings map to the same sentence.
const friendly = (e, denied) => {
  const m = e?.message || 'Something went wrong, try again.';
  if (/Demo API has no route/i.test(m)) return 'Board columns are not available in the demo, they need a real workspace.';
  if (/row-level security|violates row-level|permission denied|not authorized/i.test(m)) return denied;
  if (/multiple \(or no\) rows|0 rows|JSON object requested/i.test(m)) return denied;
  return m;
};

const byPosition = (a, b) => (a.position - b.position) || String(a.name).localeCompare(String(b.name));
const today = () => todayISO();

/* ---- one card ------------------------------------------------------------- */
function TaskCard({ task, columns, column, subCount, subDone, parentTitle, lifted, onMove, onOpen, onDelete, onDragState }) {
  const late = task.due_date && !column?.is_done && task.due_date < today();
  return (
    <div
      className={`pb-card${lifted ? ' lifted' : ''}`}
      style={{ borderLeftColor: column?.colour || 'var(--line)' }}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/project-task', task.id); e.dataTransfer.effectAllowed = 'move'; onDragState(task.id); }}
      onDragEnd={() => onDragState(null)}
    >
      <div className="pb-title">{task.title}</div>
      {parentTitle && <div className="pb-sub">Subtask of {parentTitle}</div>}
      {subCount > 0 && <div className="pb-sub">{subCount} subtask{subCount === 1 ? '' : 's'}, {subDone} finished</div>}
      <div className="pb-meta">
        <span className={`pb-pri pb-pri-${task.priority || 'medium'}`}>{task.priority || 'medium'}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.assignee?.name || 'Unassigned'}</span>
      </div>
      {task.due_date && <div className={`pb-due${late ? ' late' : ''}`}>Due {PR.fmtDate(task.due_date)}</div>}
      <div className="pb-actions">
        {/* Dragging is a mouse-only, sighted-only gesture and it does nothing
            at all on a touch screen, so the dropdown is the real path on a
            phone and the only one a keyboard can take. */}
        <select
          className="select pb-move"
          value={column?.id || ''}
          aria-label={`Column for ${task.title}`}
          onChange={(e) => onMove(task, e.target.value)}
        >
          {!column && <option value="">Not in a column</option>}
          {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {onOpen && <button type="button" className="iconbtn" style={{ fontSize: 12 }} onClick={() => onOpen(task)}>Edit</button>}
        {onDelete && <button type="button" className="iconbtn" style={{ fontSize: 12 }} onClick={() => onDelete(task)}>Delete</button>}
      </div>
    </div>
  );
}

/* ---- colour picker -------------------------------------------------------- */
function ColourPicker({ value, onPick, label }) {
  const current = String(value || '').toLowerCase();
  return (
    <div className="pb-swatches" role="group" aria-label={label}>
      {PR.STATUS_COLOURS.map((c, i) => {
        const on = c.toLowerCase() === current;
        return (
          <button
            key={c} type="button" className={`pb-swatch${on ? ' on' : ''}`}
            style={{ background: c, color: PR.readableOn(c) }}
            aria-pressed={on} aria-label={colourName(c, i)} title={colourName(c, i)}
            onClick={() => onPick(c)}
          >
            {/* The tick, not just the ring: which swatch is chosen must not be
                carried by colour alone. */}
            {on ? ICON.tick : null}
          </button>
        );
      })}
    </div>
  );
}

/* ---- one row of the column editor ----------------------------------------- */
function StatusRow({ status, taskCount, first, last, canDelete, onSave, onMove, onDelete }) {
  const [name, setName] = useState(status.name);
  const [colour, setColour] = useState(status.colour);
  const [done, setDone] = useState(status.is_done);
  const [busy, setBusy] = useState(false);

  // The row edits optimistically and the parent refetches behind it, so these
  // resync when the saved row comes back rather than fighting the input.
  useEffect(() => { setName(status.name); }, [status.name]);
  useEffect(() => { setColour(status.colour); }, [status.colour]);
  useEffect(() => { setDone(status.is_done); }, [status.is_done]);

  const save = async (patch, revert) => {
    setBusy(true);
    try { await onSave(status, patch); } catch { revert(); } finally { setBusy(false); }
  };
  const commitName = () => {
    const v = name.trim();
    if (!v || v === status.name) { setName(status.name); return; }
    save({ name: v }, () => setName(status.name));
  };

  return (
    <tr>
      <td>
        <input
          className="input pb-name-in" value={name} disabled={busy}
          aria-label={`Name of the ${status.name} column`}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setName(status.name); }}
        />
      </td>
      <td>
        <ColourPicker
          value={colour} label={`Colour of the ${status.name} column`}
          onPick={(c) => { const was = colour; setColour(c); save({ colour: c }, () => setColour(was)); }}
        />
      </td>
      <td>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
          <input
            type="checkbox" checked={done} disabled={busy}
            onChange={(e) => { const v = e.target.checked; setDone(v); save({ isDone: v }, () => setDone(!v)); }}
          />
          <span className="muted">Finished</span>
        </label>
      </td>
      <td className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{taskCount} task{taskCount === 1 ? '' : 's'}</td>
      <td>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" className="iconbtn" disabled={first} aria-label={`Move ${status.name} earlier`} onClick={() => onMove(status, -1)}>{ICON.up}</button>
          <button type="button" className="iconbtn" disabled={last} aria-label={`Move ${status.name} later`} onClick={() => onMove(status, 1)}>{ICON.down}</button>
          <button
            type="button" className="iconbtn" disabled={!canDelete}
            aria-label={`Delete ${status.name}`}
            title={canDelete ? undefined : 'A project needs at least one column.'}
            style={canDelete ? { color: '#a4262c' } : undefined}
            onClick={() => onDelete(status)}
          >{ICON.trash}</button>
        </div>
      </td>
    </tr>
  );
}

/* ---- the column editor ---------------------------------------------------- */
function StatusEditor({ columns, counts, onClose, onSave, onMove, onDelete, onAdd }) {
  const [name, setName] = useState('');
  const [colour, setColour] = useState(PR.STATUS_COLOURS[0]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { await onAdd({ name: name.trim(), colour, isDone: done }); setName(''); setDone(false); }
    finally { setBusy(false); }
  };

  const fallback = columns.length > 1 ? [...columns].sort(byPosition)[0] : null;

  return (
    <Modal title="Board columns" onClose={onClose} wide>
      <p className="pb-note">
        These columns belong to this project alone. Renaming one keeps every task sitting in it.
        Mark the columns that mean the work is finished: overdue warnings and reporting read that flag,
        so a column called Shipped or Delivered still counts as done.
      </p>
      {!columns.some((c) => c.is_done) && (
        <p className="pb-warn">
          No column is marked as finished, so nothing on this board will ever count as done.
          Tick Finished on whichever column ends the work.
        </p>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Column</th>
              <th scope="col">Colour</th>
              <th scope="col">Counts as finished</th>
              <th scope="col">In use</th>
              <th scope="col"><span className="pb-sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c, i) => (
              <StatusRow
                key={c.id} status={c} taskCount={counts[c.id] || 0}
                first={i === 0} last={i === columns.length - 1}
                canDelete={columns.length > 1}
                onSave={onSave} onMove={onMove} onDelete={onDelete}
              />
            ))}
          </tbody>
        </table>
      </div>
      {fallback && (
        <p className="pb-note" style={{ marginTop: 10 }}>
          Deleting a column never deletes the work in it. Its tasks move to {fallback.name}, the first column on the board.
        </p>
      )}

      <form onSubmit={add} style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 14 }}>
        <div className="field"><label>Add a column</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Awaiting client, Out for delivery, Filed" maxLength={40} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', margin: '10px 0 4px' }}>
          <ColourPicker value={colour} onPick={setColour} label="Colour of the new column" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
            <span className="muted">Counts as finished</span>
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? <span className="spinner" /> : 'Add column'}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ---- the board ------------------------------------------------------------ */
export default function ProjectBoard({
  projectId, tasks, statuses, onChanged,
  canManageStatuses = true, onOpenTask = null, onDeleteTask = null, flash: flashProp = null,
  // Ids of tasks whose prerequisites are not finished, answered by the server.
  // Without this the board let a blocked card be dragged straight into a done
  // column and the database refused it afterwards, which reads as a bug rather
  // than a rule.
  blockedIds = null,
}) {
  // taskId -> statusId, held only until the parent's refetch agrees. Overriding
  // the props like this, instead of copying them into state, means a parent that
  // hands down a freshly mapped array on every render cannot wipe a card back
  // into the column it was just dragged out of.
  const [moved, setMoved] = useState({});
  // Optimistic left-to-right order, same idea, cleared once the props match.
  const [orderIds, setOrderIds] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const [editing, setEditing] = useState(false);
  const [live, setLive] = useState('');

  const { flash: ownFlash, toastNode } = useToast();
  const flash = flashProp || ownFlash;
  const { confirm, confirmNode } = useConfirm();

  const columns = useMemo(() => {
    const base = [...(statuses || [])].sort(byPosition);
    if (!orderIds) return base;
    const rank = new Map(orderIds.map((id, i) => [id, i]));
    return base.sort((a, b) => (rank.has(a.id) ? rank.get(a.id) : 1e6) - (rank.has(b.id) ? rank.get(b.id) : 1e6));
  }, [statuses, orderIds]);

  const cards = useMemo(
    () => (tasks || []).map((t) => (moved[t.id] ? { ...t, status_id: moved[t.id] } : t)),
    [tasks, moved],
  );

  // Drop each override the moment the server's copy says the same thing.
  useEffect(() => {
    setMoved((m) => {
      const keys = Object.keys(m);
      if (!keys.length) return m;
      const next = {};
      for (const t of tasks || []) if (m[t.id] && t.status_id !== m[t.id]) next[t.id] = m[t.id];
      return Object.keys(next).length === keys.length ? m : next;
    });
  }, [tasks]);

  useEffect(() => {
    if (!orderIds) return;
    const natural = [...(statuses || [])].sort(byPosition).map((s) => s.id).join(',');
    if (natural === orderIds.join(',')) setOrderIds(null);
  }, [statuses, orderIds]);

  const statusIndex = useMemo(() => PR.byId(columns), [columns]);
  const taskIndex = useMemo(() => PR.byId(cards), [cards]);

  const kids = useMemo(() => {
    const m = {};
    for (const t of cards) if (t.parent_task_id) (m[t.parent_task_id] = m[t.parent_task_id] || []).push(t);
    return m;
  }, [cards]);

  const grouped = useMemo(() => {
    const m = Object.fromEntries(columns.map((c) => [c.id, []]));
    const firstCol = columns[0]?.id;
    for (const t of cards) {
      // A card whose status_id points nowhere we can see would otherwise vanish
      // off the board entirely. The first column is where the database itself
      // puts an unresolved task, so it is the same answer.
      const key = m[t.status_id] ? t.status_id : firstCol;
      if (key) m[key].push(t);
    }
    return m;
  }, [cards, columns]);

  const counts = useMemo(() => Object.fromEntries(columns.map((c) => [c.id, (grouped[c.id] || []).length])), [columns, grouped]);

  const moveTask = async (task, statusId) => {
    if (!statusId || statusId === task.status_id) return;
    const to = statusIndex[statusId];
    // Say no before the write, not after. The database enforces this too, but
    // an error toast arriving after a successful-looking drag is worse than a
    // move that simply does not happen.
    if (to?.is_done && blockedIds?.has(task.id)) {
      setLive('');
      flashProp?.(`“${task.title}” is still waiting on another task. Finish that first, or remove the dependency.`, true);
      return;
    }
    const from = task.status_id;
    setMoved((m) => ({ ...m, [task.id]: statusId }));
    setLive(`${task.title} moved to ${to?.name || 'another column'}.`);
    try {
      await PR.setTaskStatus(projectId, task.id, statusId);
      onChanged?.();
    } catch (e) {
      setMoved((m) => {
        const next = { ...m };
        if (from) next[task.id] = from; else delete next[task.id];
        return next;
      });
      setLive('');
      flash(friendly(e, DENIED_MOVE), true);
    }
  };

  const saveStatus = async (status, patch) => {
    try {
      await PR.updateStatus(projectId, status.id, patch);
      onChanged?.();
    } catch (e) {
      flash(friendly(e, DENIED_COLUMNS), true);
      throw e; // the row reverts its own input
    }
  };

  const addStatus = async (body) => {
    const position = columns.reduce((max, c) => Math.max(max, Number(c.position) || 0), -1) + 1;
    try {
      await PR.createStatus(projectId, { ...body, position });
      flash(`Column ${body.name} added.`);
      onChanged?.();
    } catch (e) { flash(friendly(e, DENIED_COLUMNS), true); }
  };

  const moveStatus = async (status, delta) => {
    const ids = columns.map((c) => c.id);
    const i = ids.indexOf(status.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    const was = orderIds;
    setOrderIds(next);
    try {
      await PR.reorderStatuses(projectId, next);
      onChanged?.();
    } catch (e) {
      setOrderIds(was);
      flash(friendly(e, DENIED_COLUMNS), true);
    }
  };

  const removeStatus = async (status) => {
    const rest = columns.filter((c) => c.id !== status.id);
    if (!rest.length) return flash('A project needs at least one column.', true);
    const n = counts[status.id] || 0;
    const fallback = [...rest].sort(byPosition)[0];
    const ok = await confirm({
      title: `Delete the ${status.name} column?`,
      message: n
        ? `Its ${n} task${n === 1 ? '' : 's'} move to ${fallback.name}, nothing is deleted.`
        : 'The column is empty, so nothing moves.',
      confirmLabel: 'Delete column',
      danger: true,
    });
    if (!ok) return;
    try {
      await PR.deleteStatus(projectId, status.id);
      flash(n ? `Column deleted, ${n} task${n === 1 ? '' : 's'} moved to ${fallback.name}.` : 'Column deleted.');
      onChanged?.();
    } catch (e) { flash(friendly(e, DENIED_COLUMNS), true); }
  };

  const drop = (e, statusId) => {
    e.preventDefault();
    setOver(null);
    setDragging(null);
    const id = e.dataTransfer.getData('text/project-task');
    const task = cards.find((t) => t.id === id);
    if (task) moveTask(task, statusId);
  };

  const total = cards.length;

  return (
    <div>
      <style>{CSS}</style>

      <div className="pb-bar">
        <span className="count">{total} task{total === 1 ? '' : 's'} across {columns.length} column{columns.length === 1 ? '' : 's'}</span>
        {canManageStatuses && (
          <button type="button" className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setEditing(true)}>
            Edit columns
          </button>
        )}
      </div>

      {/* Moving a card by drag or by dropdown changes counts a sighted user can
          see at a glance and nobody else can. */}
      <p className="pb-sr" role="status" aria-live="polite">{live}</p>

      {columns.length === 0 ? (
        <EmptyState
          title="This board has no columns yet"
          hint="Columns are the stages your work moves through, for example Brief, In progress, With client, Done."
          action={canManageStatuses ? <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>Set up columns</button> : null}
        />
      ) : (
        // A sideways scrolling box has to be reachable by keyboard, otherwise
        // the columns past the fold can only be got at with a mouse or a thumb.
        <div className="pb-board" tabIndex={0} role="group" aria-label="Task board, scrolls sideways">
          {columns.map((col) => {
            const list = grouped[col.id] || [];
            return (
              <div
                key={col.id}
                role="group"
                className={`pb-col${over === col.id ? ' over' : ''}`}
                aria-label={`${col.name} column`}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== col.id) setOver(col.id); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
                onDrop={(e) => drop(e, col.id)}
              >
                <h3 className="pb-col-head" style={{ margin: 0 }}>
                  <span className="pb-chip" style={{ background: col.colour, color: PR.readableOn(col.colour) }}>
                    <span className="t">{col.name}</span>
                    {col.is_done && <>{ICON.tick}<span className="pb-sr">, counts as finished</span></>}
                  </span>
                  <span className="pb-count">{list.length}</span>
                </h3>
                {list.map((t) => (
                  <TaskCard
                    key={t.id} task={t} column={statusIndex[t.status_id] || col} columns={columns}
                    subCount={(kids[t.id] || []).length}
                    subDone={(kids[t.id] || []).filter((k) => PR.isDone(k, statusIndex)).length}
                    parentTitle={t.parent_task_id ? taskIndex[t.parent_task_id]?.title : null}
                    lifted={dragging === t.id}
                    onMove={moveTask} onOpen={onOpenTask} onDelete={onDeleteTask}
                    onDragState={setDragging}
                  />
                ))}
                {list.length === 0 && <p className="pb-empty">Nothing here yet.</p>}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <StatusEditor
          columns={columns} counts={counts}
          onClose={() => setEditing(false)}
          onSave={saveStatus} onMove={moveStatus} onDelete={removeStatus} onAdd={addStatus}
        />
      )}
      {confirmNode}
      {!flashProp && toastNode}
    </div>
  );
}
