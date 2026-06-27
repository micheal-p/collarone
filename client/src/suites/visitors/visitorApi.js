import { apiGet, apiPost, apiPatch } from '../../api/client.js';

export const getVisits    = (qs = '') => apiGet(`/visits${qs ? `?${qs}` : ''}`).then((d) => d.visits);
export const createVisit  = (body) => apiPost('/visits', body).then((d) => d.visit);
export const updateVisit  = (id, body) => apiPatch(`/visits/${id}`, body).then((d) => d.visit);
export const lookupCode   = (code) => apiGet(`/visits/code/${code}`).then((d) => d.visit);

export const searchVisitors = (q) => apiGet(`/visitors?q=${encodeURIComponent(q)}`).then((d) => d.visitors);
export const createVisitor  = (body) => apiPost('/visitors', body).then((d) => d.visitor);
export const banVisitor     = (id, body) => apiPatch(`/visitors/${id}/ban`, body).then((d) => d.visitor);
export const getBanned      = () => apiGet('/visitors?banned=true').then((d) => d.visitors);

export const getVisitorStats = () => apiGet('/visitstats').then((d) => d.stats);
export const markNoShows     = () => apiPost('/visits/noshow', {}).then((d) => d.count);

export const STATUS = {
  expected:    { label: 'Expected',    cls: 'vs-expected' },
  checked_in:  { label: 'Checked in',  cls: 'vs-in' },
  checked_out: { label: 'Checked out', cls: 'vs-out' },
  cancelled:   { label: 'Cancelled',   cls: 'vs-canc' },
  no_show:     { label: 'No show',     cls: 'vs-noshow' },
};

export const ACCESS_POINTS = ['Main Entrance','Reception','Side Gate','Back Entrance'];

export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
  : '—';

export const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
  : '—';

export const duration = (inAt, outAt) => {
  if (!inAt || !outAt) return null;
  const ms = new Date(outAt) - new Date(inAt);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const isOverstay = (visit) =>
  visit.status === 'checked_in' && visit.checked_in_at &&
  new Date(visit.checked_in_at) < new Date(Date.now() - 4 * 3600000);
