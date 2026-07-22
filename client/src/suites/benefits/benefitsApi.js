import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';

export const getPlans   = () => apiGet('/benefits/plans').then((d) => d.plans);
export const createPlan = (body) => apiPost('/benefits/plans', body).then((d) => d.plan);
export const updatePlan = (id, body) => apiPatch(`/benefits/plans/${id}`, body).then((d) => d.plan);
export const deletePlan = (id) => apiDelete(`/benefits/plans/${id}`);

export const getEnrollments = () => apiGet('/benefits/enrollments').then((d) => d.enrollments);
export const getMyBenefits  = () => apiGet('/benefits/mine').then((d) => d.enrollments);
export const enroll         = (body) => apiPost('/benefits/enrollments', body).then((d) => d.enrollment);
export const updateEnrollment = (id, body) => apiPatch(`/benefits/enrollments/${id}`, body).then((d) => d.enrollment);
export const deleteEnrollment = (id) => apiDelete(`/benefits/enrollments/${id}`);

export const PLAN_TYPES = {
  hmo:        'HMO (Health)',
  group_life: 'Group Life Insurance',
  pension:    'Pension / PFA',
  other:      'Custom benefit (define your own)',
};

export const fmtDate = (d) => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';
