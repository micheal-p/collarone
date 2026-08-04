import { useEffect, useMemo, useState } from 'react';
import * as PR from './projectsApi.js';
import { EmptyState, Paginator, searchMatcher, usePagedList, useToast } from '../../components/ui.jsx';

/* ===========================================================================
   ProjectList: the flat, sortable, filterable table view of a project's
   tasks. The board answers "what is in flight", this answers "who owes what,
   and what is late".

   Props
     projectId  string   the project whose tasks these are, used for writes
     tasks      array    project_tasks rows as returned by PR.getTasks(),
                         each with .assignee {id,name} and .milestone {id,title}
     statuses   array    PR.getStatuses() rows, [] before projects_v2.sql is
                         applied (the view degrades to the legacy status text)
     members    array    PR.getMembers() rows, each {user_id, user:{id,name}},
                         used for the assignee filter
     onChanged  func     optional, called after this view writes a task so the
                         parent can refetch. No arguments.
   =========================================================================== */

const CSS = `
  .pl-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:8px 0 12px; }
  .pl-sel { font-size:13px; padding:4px 8px; height:32px; }
  .pl-sort { display:inline-flex; align-items:center; gap:5px; background:none; border:0; padding:0; margin:0; font:inherit; color:inherit; text-transform:inherit; letter-spacing:inherit; cursor:pointer; }
  .pl-sort:hover { color:var(--text); }
  .pl-sort:focus-visible { outline:2px solid var(--brand, #194b8f); outline-offset:2px; border-radius:3px; }
  .pl-caret { opacity:.28; transition:transform .12s, opacity .12s; }
  .pl-sort.active .pl-caret { opacity:1; }
  .pl-caret.asc { transform:rotate(180deg); }
  .pl-dot { display:inline-block; width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .pl-flag { display:inline-flex; align-items:center; gap:4px; padding:1px 8px; border-radius:10px; font-size:11px; font-weight:700; letter-spacing:.02em; white-space:nowrap; }
  .pl-late { background:#fde7e9; color:#a4262c; border:1px solid #f1bcc0; }
  .pl-blocked { background:#fff4ce; color:#7a5200; border:1px solid #e8d190; }
  .pl-priority { display:inline-block; padding:1px 8px; border-radius:10px; font-size:11px; font-weight:700; }
  .pl-p-low { background:#f3f2f1; color:#605e5c; }
  .pl-p-medium { background:#deecfd; color:#194b8f; }
  .pl-p-high { background:#fff4ce; color:#7a5200; }
  .pl-p-urgent { background:#fde7e9; color:#a4262c; }
  .pl-status { display:inline-flex; align-items:center; gap:6px; }
  .pl-title { font-weight:500; }
  .pl-sub { font-size:12px; color:var(--text-2); }
  .pl-nowrap { white-space:nowrap; }
  .pl-sr { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }
`;

const WARN = (
  <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 3 1.6 21h20.8z" strokeLinejoin="round" /><path d="M12 9.5v5" /><path d="M12 18h.01" />
  </svg>
);
const PAUSE = (
  <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M9 5v14M15 5v14" />
  </svg>
);

const EMPTY = '—';
const PRIORITY = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
const PRIORITY_RANK = { low: 0, medium: 1, high: 2, urgent: 3 };
const LEGACY_LABEL = Object.fromEntries(PR.COLUMNS.map((c) => [c.key, c.label]));
const LEGACY_POS = Object.fromEntries(PR.COLUMNS.map((c, i) => [c.key, i]));

// Local calendar date, not UTC. new Date().toISOString() rolls over at midnight
// UTC, which in Lagos is 1am, so a task due today would read as overdue for the
// first hour of the day.
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Excel and Sheets run a cell that opens with = + - or @, so a task titled
// "=HYPERLINK(...)" would execute on the machine of whoever opens the export.
// A leading apostrophe keeps the text readable and inert.
const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const compare = (a, b) => (typeof a === 'number' && typeof b === 'number'
  ? a - b
  : String(a).localeCompare(String(b), 'en-GB', { sensitivity: 'base' }));

function SortTh({ label, col, sort, onSort }) {
  const active = sort.key === col;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`pl-sort ${active ? 'active' : ''}`} onClick={() => onSort(col)}>
        {label}
        <svg className={`pl-caret ${active && sort.dir === 'asc' ? 'asc' : ''}`} width="9" height="9" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </th>
  );
}

export default function ProjectList({
  projectId, tasks = [], statuses = [], members = [], onChanged,
  // The server's answer, when the parent has it. Falls back to the local
  // (pessimistic) computation only where the route is unavailable.
  blockedIds: blockedIdsProp = null,
}) {
  const [deps, setDeps] = useState([]);
  const [q, setQ] = useState('');
  const [assignee, setAssignee] = useState('');
  const [statusKey, setStatusKey] = useState('');
  const [milestone, setMilestone] = useState('');
  const [lateOnly, setLateOnly] = useState(false);
  const [sort, setSort] = useState({ key: 'due', dir: 'asc' });
  const [savingId, setSavingId] = useState(null);
  const { flash, toastNode } = useToast();

  // Dependencies are created and deleted on the board, not here, and the suite
  // unmounts this tab when you leave it, so mount time is the right moment to
  // read them.
  useEffect(() => {
    let live = true;
    PR.getDependencies(projectId).then(
      (d) => { if (live) setDeps(d || []); },
      // A missing dependencies table (projects_v2.sql not applied yet) must not
      // take the whole list down with it, the Blocked column just stays empty.
      () => { if (live) setDeps([]); },
    );
    return () => { live = false; };
  }, [projectId]);

  const statusIndex = useMemo(() => PR.byId(statuses), [statuses]);
  const hasStatuses = (statuses || []).length > 0;

  // One status shape for the whole view, whether it came from project_statuses
  // or from the legacy status text.
  const statusOf = useMemo(() => (task) => {
    const row = statusIndex[task.status_id];
    if (row) return { key: row.id, name: row.name, colour: row.colour, position: row.position, done: Boolean(row.is_done) };
    const legacy = task.status || 'todo';
    return { key: legacy, name: LEGACY_LABEL[legacy] || legacy, colour: null, position: LEGACY_POS[legacy] ?? 99, done: legacy === 'done' };
  }, [statusIndex]);

  const blockedIds = useMemo(() => {
    if (blockedIdsProp) return blockedIdsProp;
    if (hasStatuses) return PR.blockedTaskIds(tasks, deps, statuses);
    // PR.blockedTaskIds reads doneness off status_id alone. With no status rows
    // every prerequisite would look unfinished and every dependent task would
    // wrongly show as blocked, so fall back to the legacy text here.
    const index = PR.byId(tasks);
    const out = new Set();
    for (const d of deps) {
      const prereq = index[d.depends_on_id];
      if (prereq && prereq.status !== 'done') out.add(d.task_id);
    }
    return out;
  }, [tasks, deps, statuses, hasStatuses, blockedIdsProp]);

  // Only the prerequisites still OUTSTANDING. Listing every edge meant a task
  // waiting on A (finished) and B (open) read "Waiting for A, B" in the tooltip,
  // the screen-reader text and the CSV, naming work that is already done.
  // A prerequisite we cannot read stays in the list: unknown is not finished.
  const prereqTitles = useMemo(() => {
    const { waitingOn } = PR.depMaps(deps);
    const index = PR.byId(tasks);
    const statusIndex = PR.byId(statuses);
    const out = {};
    for (const [taskId, ids] of Object.entries(waitingOn)) {
      const open = ids.filter((id) => {
        const prereq = index[id];
        return !prereq || !PR.isDone(prereq, statusIndex);
      });
      if (!open.length) continue;
      out[taskId] = open
        .map((id) => index[id]?.title || deps.find((d) => d.depends_on_id === id)?.prerequisite?.title || 'a task')
        .join(', ');
    }
    return out;
  }, [deps, tasks, statuses]);

  const now = today();

  const rows = useMemo(() => (tasks || []).map((t) => {
    const status = statusOf(t);
    const due = t.due_date || null;
    return {
      task: t,
      status,
      assigneeId: t.assigned_to || '',
      assigneeName: t.assignee?.name || '',
      milestoneId: t.milestone_id || '',
      milestoneTitle: t.milestone?.title || '',
      due,
      // Due today is not late. Overdue starts the day after the due date, the
      // same rule the Tasks suite uses, so the two suites never disagree.
      overdue: Boolean(due && !status.done && String(due).slice(0, 10) < now),
      blocked: blockedIds.has(t.id),
      priorityRank: PRIORITY_RANK[t.priority] ?? 1,
    };
  }), [tasks, statusOf, blockedIds, now]);

  const milestoneOptions = useMemo(() => {
    const seen = new Map();
    for (const r of rows) if (r.milestoneId && !seen.has(r.milestoneId)) seen.set(r.milestoneId, r.milestoneTitle || 'Untitled milestone');
    return [...seen].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title, 'en-GB'));
  }, [rows]);

  const statusOptions = useMemo(() => (hasStatuses
    ? [...statuses].sort((a, b) => a.position - b.position).map((s) => ({ key: s.id, name: s.name }))
    : PR.COLUMNS.map((c) => ({ key: c.key, name: c.label }))), [statuses, hasStatuses]);

  const view = useMemo(() => {
    const match = searchMatcher(q);
    const filtered = rows.filter((r) => {
      if (assignee === 'unassigned' && r.assigneeId) return false;
      if (assignee && assignee !== 'unassigned' && r.assigneeId !== assignee) return false;
      if (statusKey && r.status.key !== statusKey) return false;
      if (milestone === 'none' && r.milestoneId) return false;
      if (milestone && milestone !== 'none' && r.milestoneId !== milestone) return false;
      if (lateOnly && !r.overdue) return false;
      return match(r.task.title, r.task.description, r.assigneeName, r.milestoneTitle, r.status.name);
    });
    const pick = {
      title: (r) => r.task.title || null,
      assignee: (r) => r.assigneeName || null,
      status: (r) => r.status.position,
      priority: (r) => r.priorityRank,
      due: (r) => r.due,
      milestone: (r) => r.milestoneTitle || null,
      // Blocked ranks high so the column's default (descending) puts the stuck
      // work at the top, which is the only reason to sort by it.
      blocked: (r) => (r.blocked ? 1 : 0),
    }[sort.key] || ((r) => r.task.title);
    const sign = sort.dir === 'asc' ? 1 : -1;
    // sort() mutates, and `filtered` is derived from the `rows` memo the rest
    // of the render still reads.
    return filtered.slice().sort((a, b) => {
      const av = pick(a);
      const bv = pick(b);
      // Blanks sink to the bottom whichever way the column points: a screenful
      // of empty due dates on top is never what someone sorting by due wanted.
      if (av === null || bv === null) {
        if (av !== bv) return av === null ? 1 : -1;
      } else {
        const c = compare(av, bv) * sign;
        if (c !== 0) return c;
      }
      // Title breaks every tie, so the order is stable across re-sorts.
      return compare(a.task.title, b.task.title);
    });
  }, [rows, q, assignee, statusKey, milestone, lateOnly, sort]);

  const paged = usePagedList(view, 50);
  const overdueCount = view.filter((r) => r.overdue).length;
  const hasFilters = Boolean(q || assignee || statusKey || milestone || lateOnly);

  const onSort = (key) => setSort((s) => (s.key === key
    ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
    // Priority and blocked read best worst-first, everything else A to Z.
    : { key, dir: key === 'priority' || key === 'blocked' ? 'desc' : 'asc' }));

  const clearFilters = () => { setQ(''); setAssignee(''); setStatusKey(''); setMilestone(''); setLateOnly(false); };

  const changeStatus = async (task, statusId) => {
    setSavingId(task.id);
    try { await PR.setTaskStatus(projectId, task.id, statusId); flash('Status updated.'); onChanged?.(); }
    catch (e) { flash(e.message, true); }
    finally { setSavingId(null); }
  };

  const exportCsv = () => {
    const header = ['Title', 'Assignee', 'Status', 'Priority', 'Due date', 'Overdue', 'Milestone', 'Blocked', 'Waiting for'];
    const body = view.map((r) => [
      r.task.title,
      r.assigneeName || 'Unassigned',
      r.status.name,
      PRIORITY[r.task.priority] || r.task.priority,
      // The raw ISO date, not the display one: 03/04 is a different day
      // depending on which spreadsheet locale opens the file.
      r.due || '',
      r.overdue ? 'Yes' : 'No',
      r.milestoneTitle,
      r.blocked ? 'Yes' : 'No',
      r.blocked ? prereqTitles[r.task.id] || '' : '',
    ]);
    const csv = [header, ...body].map((line) => line.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-tasks-${now}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <style>{CSS}</style>

      <div className="pl-bar">
        <select className="select pl-sel" aria-label="Filter by assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.user?.name || 'Unnamed'}</option>)}
        </select>

        <select className="select pl-sel" aria-label="Filter by status" value={statusKey} onChange={(e) => setStatusKey(e.target.value)}>
          <option value="">All statuses</option>
          {statusOptions.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
        </select>

        <select className="select pl-sel" aria-label="Filter by milestone" value={milestone} onChange={(e) => setMilestone(e.target.value)}>
          <option value="">All milestones</option>
          <option value="none">No milestone</option>
          {milestoneOptions.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>

        <button type="button" className={`pill ${lateOnly ? 'active' : ''}`} aria-pressed={lateOnly} onClick={() => setLateOnly((v) => !v)}>
          Overdue only
        </button>

        {hasFilters && <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>}

        <div className="cmd-search" style={{ marginLeft: 'auto' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8886" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input aria-label="Search tasks" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, marginLeft: 6, width: 160 }} />
        </div>

        <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={view.length === 0}>Export CSV</button>
      </div>

      <p className="pl-sub" aria-live="polite" style={{ margin: '0 0 8px' }}>
        {view.length} task{view.length === 1 ? '' : 's'}
        {hasFilters ? ` of ${rows.length}` : ''}
        {overdueCount > 0 ? `, ${overdueCount} overdue` : ''}
      </p>

      <div className="table-wrap">
        <table className="table">
          <caption className="pl-sr">Tasks on this project, sortable by column</caption>
          <thead>
            <tr>
              <SortTh label="Task" col="title" sort={sort} onSort={onSort} />
              <SortTh label="Assignee" col="assignee" sort={sort} onSort={onSort} />
              <SortTh label="Status" col="status" sort={sort} onSort={onSort} />
              <SortTh label="Priority" col="priority" sort={sort} onSort={onSort} />
              <SortTh label="Due" col="due" sort={sort} onSort={onSort} />
              <SortTh label="Milestone" col="milestone" sort={sort} onSort={onSort} />
              <SortTh label="Blocked" col="blocked" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 0 }}>
                  {rows.length === 0
                    ? <EmptyState title="No tasks yet" hint="Add a task on the board and it shows up here." />
                    : <span className="td-empty" style={{ display: 'block', padding: 24 }}>No tasks match your filters.</span>}
                </td>
              </tr>
            )}
            {paged.slice.map((r) => (
              <tr key={r.task.id}>
                <td style={{ maxWidth: 300 }}>
                  <div className="pl-title">{r.task.title}</div>
                  {r.task.description && (
                    <div className="pl-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{r.task.description}</div>
                  )}
                </td>
                <td className="pl-sub">{r.assigneeName || 'Unassigned'}</td>
                <td>
                  {hasStatuses ? (
                    <span className="pl-status">
                      {r.status.colour && <span className="pl-dot" style={{ background: r.status.colour }} aria-hidden="true" />}
                      <select
                        className="select pl-sel"
                        style={{ minWidth: 130 }}
                        aria-label={`Status for ${r.task.title}`}
                        disabled={savingId === r.task.id}
                        value={statusIndex[r.task.status_id] ? r.task.status_id : ''}
                        onChange={(e) => changeStatus(r.task, e.target.value)}
                      >
                        {!statusIndex[r.task.status_id] && <option value="" disabled>Not set</option>}
                        {statusOptions.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                      </select>
                    </span>
                  ) : (
                    <span className="pl-sub">{r.status.name}</span>
                  )}
                </td>
                <td><span className={`pl-priority pl-p-${r.task.priority}`}>{PRIORITY[r.task.priority] || r.task.priority}</span></td>
                <td className="pl-nowrap">
                  <span className="pl-sub">{PR.fmtDate(r.due)}</span>
                  {r.overdue && <><br /><span className="pl-flag pl-late">{WARN} Overdue</span></>}
                </td>
                <td className="pl-sub">{r.milestoneTitle || EMPTY}</td>
                <td>
                  {r.blocked ? (
                    <>
                      <span className="pl-flag pl-blocked" title={`Waiting for: ${prereqTitles[r.task.id] || 'another task'}`}>{PAUSE} Blocked</span>
                      {/* title= alone is unreliable on a span, so the same detail
                          is here for screen readers and for nobody else. */}
                      <span className="pl-sr">Waiting for {prereqTitles[r.task.id] || 'another task'}</span>
                    </>
                  ) : <span className="pl-sub">Ready</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Paginator page={paged.page} pages={paged.pages} onPage={paged.setPage} total={paged.total} />
      {toastNode}
    </div>
  );
}
