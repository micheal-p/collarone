import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';

export const getTasks = () => apiGet('/tasks').then((d) => d.tasks);

export const createTask = (body) => apiPost('/tasks', body).then((d) => d.task);

export const updateTask = (id, patch) => apiPatch(`/tasks/${id}`, patch).then((d) => d.task);

export const deleteTask = (id) => apiDelete(`/tasks/${id}`);

export const getStats = () => apiGet('/taskstats').then((d) => d.stats);

export const getStaff = () => apiGet('/staff').then((d) => d.staff);

export const PRIORITY = {
  low:    { label: 'Low',    cls: 'tk-p-low' },
  medium: { label: 'Medium', cls: 'tk-p-med' },
  high:   { label: 'High',   cls: 'tk-p-high' },
  urgent: { label: 'Urgent', cls: 'tk-p-urg' },
};

export const STATUS = {
  todo:        { label: 'To do',      cls: 'tk-s-todo' },
  in_progress: { label: 'In progress',cls: 'tk-s-prog' },
  in_review:   { label: 'In review',  cls: 'tk-s-rev' },
  done:        { label: 'Done',       cls: 'tk-s-done' },
  cancelled:   { label: 'Cancelled',  cls: 'tk-s-canc' },
};

export const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const isOverdue = (task) => task.status !== 'done' && task.status !== 'cancelled' && task.due_date && new Date(task.due_date) < new Date();
