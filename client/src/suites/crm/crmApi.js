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
export const setFollowUp = (activityId, followUpAt) => apiPatch(`/crm/activities/${activityId}`, { followUpAt }).then((d) => d.activity);

export const getDeals   = () => apiGet('/crm/deals').then((d) => d.deals);
export const createDeal = (body) => apiPost('/crm/deals', body).then((d) => d.deal);
export const updateDeal = (id, body) => apiPatch(`/crm/deals/${id}`, body).then((d) => d.deal);
export const deleteDeal = (id) => apiDelete(`/crm/deals/${id}`);

// Ordered lead → lost; object key order drives the kanban column order.
export const DEAL_STAGES = {
  lead:      { label: 'Lead',      bg: '#deecfd', fg: '#194b8f' },
  qualified: { label: 'Qualified', bg: '#f0e6ff', fg: '#5a2ca0' },
  proposal:  { label: 'Proposal',  bg: '#fff4ce', fg: '#7a5200' },
  won:       { label: 'Won',       bg: '#dff6dd', fg: '#1a6a1a' },
  lost:      { label: 'Lost',      bg: '#fde7e9', fg: '#a4262c' },
};

export const fmtNaira = (v) => `₦${Number(v || 0).toLocaleString('en-NG')}`;
export const fmtDay = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';

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

// Bookings — the appointments a service business runs its day on.
export const getBookings    = () => apiGet('/crm/bookings').then((d) => d.bookings);
export const createBooking  = (body) => apiPost('/crm/bookings', body).then((d) => d.booking);
export const updateBooking  = (id, body) => apiPatch(`/crm/bookings/${id}`, body).then((d) => d.booking);
export const deleteBooking  = (id) => apiDelete(`/crm/bookings/${id}`);

// Money owed — standalone receivables, aged by due date.
export const getReceivables   = () => apiGet('/crm/receivables').then((d) => d.receivables);
export const createReceivable = (body) => apiPost('/crm/receivables', body).then((d) => d.receivable);
export const updateReceivable = (id, body) => apiPatch(`/crm/receivables/${id}`, body).then((d) => d.receivable);
export const deleteReceivable = (id) => apiDelete(`/crm/receivables/${id}`);
