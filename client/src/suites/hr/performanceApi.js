import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';

export const getGoals = (employeeId) => apiGet(`/hr/goals${employeeId ? `?employeeId=${employeeId}` : ''}`).then((d) => d.goals);
export const createGoal = (body) => apiPost('/hr/goals', body).then((d) => d.goal);
export const updateGoal = (id, body) => apiPatch(`/hr/goals/${id}`, body).then((d) => d.goal);
export const deleteGoal = (id) => apiDelete(`/hr/goals/${id}`);

export const getReviews = (employeeId) => apiGet(`/hr/reviews${employeeId ? `?employeeId=${employeeId}` : ''}`).then((d) => d.reviews);
export const createReview = (body) => apiPost('/hr/reviews', body).then((d) => d.review);
export const updateReview = (id, body) => apiPatch(`/hr/reviews/${id}`, body).then((d) => d.review);
export const acknowledgeReview = (id) => apiPost(`/hr/reviews/${id}/acknowledge`, {}).then((d) => d.review);

export const getTrainings = (employeeId) => apiGet(`/hr/trainings${employeeId ? `?employeeId=${employeeId}` : ''}`).then((d) => d.trainings);
export const createTraining = (body) => apiPost('/hr/trainings', body).then((d) => d.training);
export const deleteTraining = (id) => apiDelete(`/hr/trainings/${id}`);

export const GOAL_STATUS = {
  not_started: { label: 'Not started', cls: 'lc-req-draft' },
  in_progress: { label: 'In progress', cls: 'lc-stage-interview' },
  done:        { label: 'Done',        cls: 'lc-exit-done' },
  missed:      { label: 'Missed',      cls: 'lc-stage-rejected' },
};

export const REVIEW_STATUS = {
  draft:        { label: 'Draft',        cls: 'lc-req-draft' },
  submitted:    { label: 'Submitted',    cls: 'lc-exit-settled' },
  acknowledged: { label: 'Acknowledged', cls: 'lc-exit-done' },
};

export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export const isExpiringSoon = (d) => d && new Date(d) < new Date(Date.now() + 60 * 86400000);
export const isExpired = (d) => d && new Date(d) < new Date();
