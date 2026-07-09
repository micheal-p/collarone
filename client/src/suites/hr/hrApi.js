import { apiGet, apiPatch } from '../../api/client.js';

export const getDirectory = () => apiGet('/hr/staff').then((d) => d.staff);

export const updateEmployee = (id, body) => apiPatch(`/hr/staff/${id}`, body).then((d) => d.user);

export const EMPLOYMENT_TYPE = {
  full_time: { label: 'Full-time', cls: 'hr-et-ft' },
  part_time: { label: 'Part-time', cls: 'hr-et-pt' },
  contract:  { label: 'Contract',  cls: 'hr-et-ct' },
  intern:    { label: 'Intern',    cls: 'hr-et-in' },
};

export const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

export const tenure = (startDate) => {
  if (!startDate) return null;
  const start = new Date(startDate);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) return null;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} mo`;
  return rem === 0 ? `${years} yr` : `${years} yr ${rem} mo`;
};

export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
