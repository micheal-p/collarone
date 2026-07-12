import { apiGet, apiPost } from '../../api/client.js';

export const getAllRecords = () => apiGet('/attendance/records').then((d) => d.records);
export const getMyRecords  = () => apiGet('/attendance/mine').then((d) => d.records);

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

export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

export const hoursBetween = (start, end) => {
  if (!start || !end) return null;
  return (new Date(end) - new Date(start)) / 3600000;
};

export const overtimeHours = (hours) => hours == null ? null : Math.max(0, hours - 8);
