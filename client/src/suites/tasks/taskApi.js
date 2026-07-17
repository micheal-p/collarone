import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';
import { supabase } from '../../lib/supabaseClient.js';

export const getTasks    = ()        => apiGet('/tasks').then((d) => d.tasks);
export const createTask  = (body)    => apiPost('/tasks', body).then((d) => d.task);
export const updateTask  = (id, p)   => apiPatch(`/tasks/${id}`, p).then((d) => d.task);
export const deleteTask  = (id)      => apiDelete(`/tasks/${id}`);
export const getStats    = ()        => apiGet('/taskstats').then((d) => d.stats);
export const getStaff    = ()        => apiGet('/staff').then((d) => d.staff);
export const getAllReports = ()       => apiGet('/taskreports').then((d) => d.reports);

export const getTaskReports  = (taskId) => apiGet(`/tasks/${taskId}/reports`).then((d) => d.reports);
export const submitReport    = (taskId, reportBody, attachments) =>
  apiPost(`/tasks/${taskId}/reports`, { reportBody, attachments }).then((d) => d.report);

// Upload a file to Supabase Storage; returns {name, path, size}
export const uploadAttachment = async (taskId, file) => {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${taskId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('task-attachments').upload(path, file);
  if (error) throw new Error(error.message);
  return { name: file.name, path, size: file.size };
};

// Generate a short-lived signed download URL
export const getDownloadUrl = async (path) => {
  const { data, error } = await supabase.storage.from('task-attachments').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
};

export const PRIORITY = {
  low:    { label: 'Low',    cls: 'tk-p-low' },
  medium: { label: 'Medium', cls: 'tk-p-med' },
  high:   { label: 'High',   cls: 'tk-p-high' },
  urgent: { label: 'Urgent', cls: 'tk-p-urg' },
};

export const STATUS = {
  todo:        { label: 'To do',       cls: 'tk-s-todo' },
  in_progress: { label: 'In progress', cls: 'tk-s-prog' },
  in_review:   { label: 'In review',   cls: 'tk-s-rev' },
  done:        { label: 'Done',        cls: 'tk-s-done' },
  cancelled:   { label: 'Cancelled',   cls: 'tk-s-canc' },
};

export const fmtDate = (d) => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
  : '—';

export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
  : '—';

// Date-only comparison: a task due today is NOT overdue all day —
// overdue starts the day after due_date.
export const isOverdue = (task) => {
  if (!task.due_date || task.status === 'done' || task.status === 'cancelled') return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return String(task.due_date).slice(0, 10) < today;
};
