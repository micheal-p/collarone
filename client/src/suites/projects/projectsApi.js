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
