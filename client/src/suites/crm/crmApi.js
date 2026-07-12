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

export const ACTIVITY_TYPES = {
  call:     { label: 'Call',     cls: 'crm-t-call' },
  whatsapp: { label: 'WhatsApp', cls: 'crm-t-wa' },
  email:    { label: 'Email',    cls: 'crm-t-email' },
  meeting:  { label: 'Meeting',  cls: 'crm-t-meet' },
  note:     { label: 'Note',     cls: 'crm-t-note' },
};

export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';
