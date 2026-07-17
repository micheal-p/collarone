import { apiGet, apiPatch, apiPost } from '../../api/client.js';

export const getAllRecords = () => apiGet('/attendance/records').then((d) => d.records);
export const getMyRecords  = () => apiGet('/attendance/mine').then((d) => d.records);

// Manager correction — clockInAt/clockOutAt are ISO strings (clockOutAt may be
// null to reopen a shift), notes is free text. RLS enforces the manager role.
export const updateRecord = (id, { clockInAt, clockOutAt, notes }) =>
  apiPatch(`/attendance/records/${id}`, { clockInAt, clockOutAt, notes }).then((d) => d.record);

const geo = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve({ lat: null, lng: null });
  navigator.geolocation.getCurrentPosition(
    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => resolve({ lat: null, lng: null }),
    { timeout: 5000 },
  );
});

export const clockIn  = async () => { const { lat, lng } = await geo(); return apiPost('/attendance/clockin', { lat, lng }).then((d) => d.record); };
export const clockOut = async () => { const { lat, lng } = await geo(); return apiPost('/attendance/clockout', { lat, lng }).then((d) => d.record); };

/* ---- org day-start ---------------------------------------------------------
   Hardcoded 9:00 as the org's workday start for the "Late" indicator.
   TODO: becomes a per-org setting once suite settings land. */
export const DAY_START_HOUR = 9;
export const isLate = (iso) => {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getHours() > DAY_START_HOUR || (d.getHours() === DAY_START_HOUR && d.getMinutes() > 0);
};

/* ---- formatting ---- */
export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';
export const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
  : '—';
export const fmtTime = (d) => d
  ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  : '—';

export const hoursBetween = (start, end) => {
  if (!start || !end) return null;
  return (new Date(end) - new Date(start)) / 3600000;
};

export const overtimeHours = (hours) => hours == null ? null : Math.max(0, hours - 8);

/* ---- week math (weeks run Monday–Sunday) ---- */
export const startOfWeek = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const inWeek = (iso, weekStart) => {
  if (!iso) return false;
  const t = new Date(iso);
  return t >= weekStart && t < addDays(weekStart, 7);
};
export const weekLabel = (weekStart) => {
  const end = addDays(weekStart, 6);
  const opts = { day: '2-digit', month: 'short' };
  return `${weekStart.toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', { ...opts, year: 'numeric' })}`;
};
export const dayKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/* ---- datetime-local <-> ISO ---- */
export const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

/* ---- CSV (payroll feed) ---- */
const csvEsc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const buildCsv = (rows) =>
  ['Employee,Date,Clock in,Clock out,Hours,Notes',
    ...rows.map((r) => r.map(csvEsc).join(','))].join('\n');
export const downloadCsv = (csv, filename) => {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
