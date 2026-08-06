import { DEMO, apiGet, apiPatch, apiPost, apiDelete, getAccessToken } from '../../api/client.js';

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

// ---- devices: the universal punch lane ---------------------------------------
export const getDevices = () => apiGet('/attendance/devices');
export const createDevice = (body) => apiPost('/attendance/devices', body).then((d) => d.device);
export const setDeviceActive = (id, active) => apiPatch(`/attendance/devices/${id}`, { active }).then((d) => d.device);
export const deleteDevice = (id) => apiDelete(`/attendance/devices/${id}`);
export const saveDeviceMap = (deviceUid, employeeId) => apiPost('/attendance/device-map', { deviceUid, employeeId }).then((d) => d.map);
export const deleteDeviceMap = (id) => apiDelete(`/attendance/device-map/${id}`);

// CSV import rides the same universal /api/punch lane as the hardware, just
// authenticated as the manager instead of a device key.
export const importPunches = async (punches) => {
  // The demo has no real punch endpoint — pretend the import worked so the
  // prospect sees the flow without a 401.
  if (DEMO) return { received: punches.length, applied: punches.length, duplicates: 0, unmapped: [], errors: [] };
  const r = await fetch('/api/punch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken() || ''}` },
    body: JSON.stringify({ punches }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'Import failed.');
  return d;
};

// ---- shift rosters -----------------------------------------------------------
export const getShifts = () => apiGet('/attendance/shifts');
export const createShift = (body) => apiPost('/attendance/shifts', body).then((d) => d.shift);
export const deleteShift = (id) => apiDelete(`/attendance/shifts/${id}`);
export const assignShift = (id, userIds) => apiPost(`/attendance/shifts/${id}/assign`, { userIds });
export const unassignShift = (userId) => apiPost('/attendance/shifts/unassign', { userId });

/* ---- clock-in rules --------------------------------------------------------
   The office pin, the geofence radius and the work schedule. The database has
   enforced all of this since attendance_shifts.sql, but nothing ever wrote the
   row, so the fence was inert and lateness had nothing to judge against. */
export const getSettings  = () => apiGet('/attendance/settings').then((d) => d.settings);
export const saveSettings = (body) => apiPost('/attendance/settings', body).then((d) => d.settings);

export const DEFAULT_RADIUS_M = 500;

// Metres between two coordinates. Same haversine the server uses in
// attendance_clock_in(), so the distance shown and the distance enforced agree.
export const distanceM = (aLat, aLng, bLat, bLng) => {
  if ([aLat, aLng, bLat, bLng].some((v) => v == null || Number.isNaN(Number(v)))) return null;
  const R = 6371000;
  const rad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/* Clock in, waiting for the fence if we are outside it.
 *
 * The rule, chosen deliberately: the time recorded is the time you ARRIVE, not
 * the time you tapped. Crediting the tap would mean tapping at 07:30 from home,
 * strolling in at 09:00 and being paid from 07:30 — and lateness feeds payroll
 * deductions, so that is money. We simply do not call the server until the
 * position is inside the radius; the server stamps now(), which is arrival.
 *
 * onProgress({ distanceM, radiusM, waiting }) drives the live readout.
 * Returns the created record. Call cancel() to stop waiting.
 */
export function clockInWhenInside({ settings, onProgress, onError } = {}) {
  const radius = Number(settings?.geofence_radius_m) || 0;
  const oLat = settings?.office_lat;
  const oLng = settings?.office_lng;
  const fenced = radius > 0 && oLat != null && oLng != null;

  let watchId = null;
  let done = false;
  const stop = () => {
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  };

  const promise = new Promise((resolve, reject) => {
    const finish = async (lat, lng) => {
      if (done) return;
      done = true; stop();
      try { resolve(await apiPost('/attendance/clockin', { lat, lng }).then((d) => d.record)); }
      catch (e) { reject(e); }
    };

    // No fence configured, or no geolocation available: behave exactly as before.
    if (!fenced || !navigator.geolocation) {
      geo().then(({ lat, lng }) => finish(lat, lng));
      return;
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        const d = distanceM(lat, lng, oLat, oLng);
        // GPS accuracy is metres of uncertainty; treating the near edge as the
        // distance stops someone being held outside by drift alone.
        const near = Math.max(0, d - (accuracy || 0));
        if (near <= radius) { finish(lat, lng); return; }
        onProgress?.({ distanceM: Math.round(d), radiusM: radius, waiting: true });
      },
      (err) => {
        if (done) return;
        done = true; stop();
        onError?.(err);
        reject(new Error(
          err?.code === 1
            ? 'Location permission is off, so we cannot confirm you are at work. Turn it on and try again.'
            : 'We could not read your location. Move somewhere with a clearer signal and try again.',
        ));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
  });

  return { promise, cancel: () => { done = true; stop(); } };
}
