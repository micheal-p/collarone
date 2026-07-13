import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';

export const getCompanies   = () => apiGet('/crm/companies').then((d) => d.companies);
export const createCompany  = (body) => apiPost('/crm/companies', body).then((d) => d.company);
export const updateCompany  = (id, body) => apiPatch(`/crm/companies/${id}`, body).then((d) => d.company);
export const deleteCompany  = (id) => apiDelete(`/crm/companies/${id}`);

export const getContacts    = () => apiGet('/crm/contacts').then((d) => d.contacts);
export const createContact  = (body) => apiPost('/crm/contacts', body).then((d) => d.contact);
export const updateContact  = (id, body) => apiPatch(`/crm/contacts/${id}`, body).then((d) => d.contact);
export const deleteContact  = (id) => apiDelete(`/crm/contacts/${id}`);

export const getActivities   = (qs = '') => apiGet(`/crm/activities${qs ? `?${qs}` : ''}`).then((d) => d.activities);
export const createActivity  = (body) => apiPost('/crm/activities', body).then((d) => d.activity);
export const deleteActivity  = (id) => apiDelete(`/crm/activities/${id}`);
export const setActivityReplied = (id, replied) => apiPatch(`/crm/activities/${id}`, { replied }).then((d) => d.activity);

export const ACTIVITY_TYPES = {
  call:        { label: 'Call',     cls: 'crm-t-call' },
  whatsapp:    { label: 'WhatsApp', cls: 'crm-t-wa' },
  email:       { label: 'Email',    cls: 'crm-t-email' },
  meeting:     { label: 'Meeting',  cls: 'crm-t-meet' },
  note:        { label: 'Note',     cls: 'crm-t-note' },
  web_message: { label: 'Website',  cls: 'crm-t-web' },
};

// 'web_message' rows are created by the public contact form, never logged by
// hand — keep it out of the manual "log activity" type picker.
export const LOGGABLE_TYPES = Object.fromEntries(Object.entries(ACTIVITY_TYPES).filter(([k]) => k !== 'web_message'));

export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';
