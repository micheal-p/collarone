import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';

export const getProjects   = () => apiGet('/projects').then((d) => d.projects);
export const createProject = (body) => apiPost('/projects', body).then((d) => d.project);
export const updateProject = (id, body) => apiPatch(`/projects/${id}`, body).then((d) => d.project);
export const deleteProject = (id) => apiDelete(`/projects/${id}`);

export const getMembers = (projectId) => apiGet(`/projects/${projectId}/members`).then((d) => d.members);
export const addMember  = (projectId, body) => apiPost(`/projects/${projectId}/members`, body).then((d) => d.member);
export const removeMember = (projectId, userId) => apiDelete(`/projects/${projectId}/members/${userId}`);

export const getMilestones  = (projectId) => apiGet(`/projects/${projectId}/milestones`).then((d) => d.milestones);
export const createMilestone = (projectId, body) => apiPost(`/projects/${projectId}/milestones`, body).then((d) => d.milestone);
export const updateMilestone = (projectId, id, body) => apiPatch(`/projects/${projectId}/milestones/${id}`, body).then((d) => d.milestone);
export const deleteMilestone = (projectId, id) => apiDelete(`/projects/${projectId}/milestones/${id}`);

export const getTasks   = (projectId) => apiGet(`/projects/${projectId}/tasks`).then((d) => d.tasks);
export const createTask = (projectId, body) => apiPost(`/projects/${projectId}/tasks`, body).then((d) => d.task);
export const updateTask = (projectId, id, body) => apiPatch(`/projects/${projectId}/tasks/${id}`, body).then((d) => d.task);
export const deleteTask = (projectId, id) => apiDelete(`/projects/${projectId}/tasks/${id}`);

export const PROJECT_STATUS = {
  active:    { label: 'Active',    cls: 'pj-s-active' },
  on_hold:   { label: 'On hold',   cls: 'pj-s-hold' },
  completed: { label: 'Completed', cls: 'pj-s-done' },
  cancelled: { label: 'Cancelled', cls: 'pj-s-cancelled' },
};

export const COLUMNS = [
  { key: 'todo',        label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'in_review',   label: 'In review' },
  { key: 'done',        label: 'Done' },
];

export const fmtDate = (d) => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

// ---- time tracking → invoice -------------------------------------------------
export const getTimeEntries = (projectId) => apiGet(`/projects/${projectId}/time`).then((d) => d.entries);
export const logTime = (projectId, body) => apiPost(`/projects/${projectId}/time`, body).then((d) => d.entry);
export const deleteTime = (projectId, id) => apiDelete(`/projects/${projectId}/time/${id}`);
export const markTimeInvoiced = (projectId, ids, docId) => apiPost(`/projects/${projectId}/time/mark-invoiced`, { ids, docId });

/* ===========================================================================
   Projects v2: per-project statuses, subtasks, dependencies, task comments.
   Backed by supabase/projects_v2.sql.

   Every project_tasks row now also carries:
     status_id       uuid  the project_statuses row it sits in (the truth)
     parent_task_id  uuid  null for a top-level task
     status          text  legacy mirror, kept in step by a database trigger.
                           Read status_id, not this.
   =========================================================================== */

// ---- per-project statuses ----------------------------------------------------
// A status row: { id, project_id, name, slug, colour, position, is_done, created_at }
export const getStatuses    = (projectId) => apiGet(`/projects/${projectId}/statuses`).then((d) => d.statuses);
export const createStatus   = (projectId, body) => apiPost(`/projects/${projectId}/statuses`, body).then((d) => d.status);
export const updateStatus   = (projectId, id, body) => apiPatch(`/projects/${projectId}/statuses/${id}`, body).then((d) => d.status);
export const deleteStatus   = (projectId, id) => apiDelete(`/projects/${projectId}/statuses/${id}`);
export const reorderStatuses = (projectId, ids) => apiPost(`/projects/${projectId}/statuses/reorder`, { ids }).then((d) => d.statuses);

// Palette offered when someone adds a column. Chosen to stay legible against
// both the light and dark surface tokens, and to stay distinguishable for the
// commonest colour-vision deficiencies.
export const STATUS_COLOURS = [
  '#605e5c', '#194b8f', '#7a5200', '#1a6a1a', '#a4262c', '#5c2e91', '#0b6a6a', '#8a4b08',
];

// Black or white label text over a given background, from the WCAG relative
// luminance. Hard-coding white on a pale amber chip is the usual way these
// badges end up unreadable.
export const readableOn = (hex) => {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return '#1b1a19';
  const chan = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  // 0.179 is where black and white swap over against a mid-tone background.
  // 0.45 put mid-greys on white text at about 3.9:1 when black would have given
  // 5.3:1 — a failing chip in the exact case this helper exists to prevent. The
  // eight palette colours are all dark enough that it never showed, but the
  // colour field accepts any hex.
  return 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4) > 0.179 ? '#1b1a19' : '#ffffff';
};

// Moving a card between columns. Separate from updateTask so an optimistic
// drag has one obvious call, and so the legacy `status` write path stays
// untouched for anything still using it.
export const setTaskStatus = (projectId, taskId, statusId) =>
  apiPatch(`/projects/${projectId}/tasks/${taskId}`, { statusId }).then((d) => d.task);

export const byId = (rows) => Object.fromEntries((rows || []).map((r) => [r.id, r]));
export const statusOf = (task, statusIndex) => (statusIndex || {})[task?.status_id] || null;
export const isDone = (task, statusIndex) => Boolean(statusOf(task, statusIndex)?.is_done);

// ---- subtasks ----------------------------------------------------------------
export const setTaskParent = (projectId, taskId, parentTaskId) =>
  apiPatch(`/projects/${projectId}/tasks/${taskId}`, { parentTaskId: parentTaskId || null }).then((d) => d.task);

// Flat task list → roots with .children. A task whose parent is missing from
// the list (filtered out, or not readable under RLS) is promoted to a root so
// it never disappears from the board entirely.
export const buildTaskTree = (tasks) => {
  const nodes = (tasks || []).map((t) => ({ ...t, children: [] }));
  const index = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const roots = [];
  for (const n of nodes) {
    const parent = n.parent_task_id ? index[n.parent_task_id] : null;
    if (parent && parent !== n) parent.children.push(n); else roots.push(n);
  }
  return roots;
};

// Depth-first walk of buildTaskTree output, each row stamped with its depth,
// for rendering the tree as table rows with an indent.
export const flattenTaskTree = (roots, depth = 0) =>
  (roots || []).flatMap((n) => [{ ...n, depth }, ...flattenTaskTree(n.children, depth + 1)]);

// Candidate parents for a task: same project, not itself, and not anywhere in
// its own subtree. The database refuses a cycle anyway, this just keeps
// impossible options out of the picker.
export const parentOptions = (tasks, taskId) => {
  const banned = new Set([taskId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tasks || []) {
      if (!banned.has(t.id) && t.parent_task_id && banned.has(t.parent_task_id)) { banned.add(t.id); grew = true; }
    }
  }
  return (tasks || []).filter((t) => !banned.has(t.id));
};

// ---- dependencies ------------------------------------------------------------
// A dep row: { id, project_id, task_id, depends_on_id, created_by, created_at,
//              task: {id,title}, prerequisite: {id,title} }
// Read it as: task_id cannot start until depends_on_id is done.
export const getDependencies   = (projectId) => apiGet(`/projects/${projectId}/deps`).then((d) => d.deps);

// Blocked-ness comes from the SERVER, never from inference over the tasks this
// viewer happens to be able to read. Returns [{ task_id, waiting_on }].
export const getBlocked = (projectId) => apiGet(`/projects/${projectId}/blocked`).then((d) => d.blocked);
export const blockedIdSet = (rows) => new Set((rows || []).map((r) => r.task_id));
export const addDependency     = (projectId, taskId, dependsOnId) =>
  apiPost(`/projects/${projectId}/deps`, { taskId, dependsOnId }).then((d) => d.dep);
export const removeDependency  = (projectId, depId) => apiDelete(`/projects/${projectId}/deps/${depId}`);

// { waitingOn: {taskId: [prereqId]}, blocking: {taskId: [dependentId]} }
export const depMaps = (deps) => {
  const waitingOn = {}; const blocking = {};
  for (const d of deps || []) {
    (waitingOn[d.task_id] = waitingOn[d.task_id] || []).push(d.depends_on_id);
    (blocking[d.depends_on_id] = blocking[d.depends_on_id] || []).push(d.task_id);
  }
  return { waitingOn, blocking };
};

// Ids of tasks that cannot start yet.
//
// FALLBACK ONLY, for when the server answer is unavailable (demo mode). It is
// deliberately PESSIMISTIC: a prerequisite this viewer cannot read counts as
// unfinished, because unknown must never resolve to "clear to start". The
// earlier version required `prereq &&` and so dropped unreadable prerequisites
// entirely, telling the assignee of a blocked task that everything was done.
// Prefer getBlocked(projectId).
export const blockedTaskIds = (tasks, deps, statuses) => {
  const statusIndex = byId(statuses);
  const taskIndex = byId(tasks);
  const out = new Set();
  for (const d of deps || []) {
    const prereq = taskIndex[d.depends_on_id];
    if (!prereq || !isDone(prereq, statusIndex)) out.add(d.task_id);
  }
  return out;
};

// ---- task comments (posted via RPC so notifications ride the spine) ----------
// A comment row: { id, project_id, task_id, author_id, body, created_at,
//                  author: {id, name} }
export const getTaskComments = (projectId, taskId) =>
  apiGet(`/projects/${projectId}/tasks/${taskId}/comments`).then((d) => d.comments);
export const addTaskComment = (projectId, taskId, body) =>
  apiPost(`/projects/${projectId}/tasks/${taskId}/comments`, { body }).then((d) => d.comment);

export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';
