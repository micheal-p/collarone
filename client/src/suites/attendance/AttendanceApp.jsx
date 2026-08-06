import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import * as A from './attendanceApi.js';
import { EmptyState, Modal, useConfirm, useToast } from '../../components/ui.jsx';
import ProductTour, { tourSeen } from '../../components/ProductTour.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { apiGet } from '../../api/client.js';

/* ---- inline icons ---- */
const IcPencil = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>;
const IcPin = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></svg>;
const IcDownload = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>;
const IcChevL = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>;
const IcChevR = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>;
const IcChevDown = ({ open }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .12s' }}><path d="M6 9l6 6 6-6" /></svg>;
const IcX = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>;

const OT_NOTE = 'Overtime is hours beyond an 8h workday. A per-org schedule setting is coming later.';

/* ---- small shared cells ---- */
function LocationCell({ lat, lng, settings }) {
  if (lat == null || lng == null) return <span className="muted">—</span>;
  // Distance from the named office turns raw coordinates into an answer:
  // "1.8km · Ikate Office" says where they were without opening a map. The
  // map link stays for the times a manager wants the actual spot.
  const d = settings?.office_lat != null && settings?.office_lng != null
    ? A.distanceM(lat, lng, settings.office_lat, settings.office_lng)
    : null;
  const label = d == null
    ? 'View location'
    : `${d < 950 ? `${Math.round(d)}m` : `${(d / 1000).toFixed(1)}km`} · ${settings?.office_name || 'office'}`;
  return (
    <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noreferrer"
      title="Open in Google Maps"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--brand)', textDecoration: 'none', fontWeight: 500 }}>
      <IcPin /> {label}
    </a>
  );
}

function Kpi({ val, label }) {
  return (
    <div className="card" style={{ padding: '12px 16px', borderTop: '3px solid var(--brand)' }}>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>{val}</div>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
    </div>
  );
}
const kpiGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 };


/* ---- clock-in rules (attendance manager only) -------------------------------
   These columns and the geofence check have existed in the database since
   attendance_shifts.sql. Nothing ever wrote them, so no org had a row: the
   fence was inert and lateness had nothing to compare against. This is that
   missing screen, not a new feature. */
const DAYS = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']];

function RulesPanel({ settings, onSaved, flash }) {
  const [f, setF] = useState(() => ({
    officeName: settings?.office_name ?? '',
    officeLat: settings?.office_lat ?? '',
    officeLng: settings?.office_lng ?? '',
    // 0 means "no fence" on this table, it is NOT NULL with a default of 0.
    // Only offer the default radius when nothing has ever been configured.
    radiusM: settings?.geofence_radius_m ?? A.DEFAULT_RADIUS_M,
    workStart: (settings?.work_start || '').slice(0, 5),
    workClose: (settings?.work_close || '').slice(0, 5),
    workingDays: Array.isArray(settings?.working_days) ? settings.working_days.map(String) : ['1', '2', '3', '4', '5'],
    graceMinutes: settings?.grace_minutes ?? 10,
    phoneEnabled: settings?.phone_enabled ?? true,
    deviceEnabled: settings?.device_enabled ?? false,
  }));
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const useHere = () => {
    if (!navigator.geolocation) { flash('This device cannot report a location.', true); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set('officeLat', pos.coords.latitude.toFixed(6));
        set('officeLng', pos.coords.longitude.toFixed(6));
        setLocating(false);
        flash('Office location set to where you are now.');
      },
      () => { setLocating(false); flash('Could not read your location. Type the coordinates instead.', true); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    if ((f.officeLat === '') !== (f.officeLng === '')) {
      flash('An office location needs both a latitude and a longitude.', true); return;
    }
    if (!f.phoneEnabled && !f.deviceEnabled) {
      flash('At least one clock-in method must stay on, or nobody can clock in at all.', true); return;
    }
    setBusy(true);
    try { onSaved(await A.saveSettings(f)); flash('Clock-in rules saved.'); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  const fenced = f.officeLat !== '' && Number(f.radiusM) > 0;

  return (
    <form onSubmit={submit} style={{ maxWidth: 640 }}>
      <fieldset style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
        <legend style={{ fontSize: 12.5, fontWeight: 700, padding: '0 6px' }}>Where staff may clock in</legend>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
          {fenced
            ? `Clock-in is refused further than ${f.radiusM}m from ${f.officeName || 'this point'}. Someone who taps while still outside waits, and is clocked in the moment they arrive.`
            : 'No location set, so staff can clock in from anywhere. Set a point to restrict it.'}
        </p>
        <div className="form-grid">
          <div className="field"><label>Office name</label>
            <input className="input" value={f.officeName} onChange={(e) => set('officeName', e.target.value)} placeholder="Ikate Office" maxLength={60} />
          </div>
          <div className="field"><label>Latitude</label>
            <input className="input" value={f.officeLat} onChange={(e) => set('officeLat', e.target.value)} placeholder="6.4281" inputMode="decimal" />
          </div>
          <div className="field"><label>Longitude</label>
            <input className="input" value={f.officeLng} onChange={(e) => set('officeLng', e.target.value)} placeholder="3.4219" inputMode="decimal" />
          </div>
          <div className="field"><label>Radius (metres)</label>
            <input className="input" type="number" min="25" step="25" value={f.radiusM} onChange={(e) => set('radiusM', e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn btn-ghost" disabled={locating} onClick={useHere}>
          {locating ? 'Reading location…' : 'Use my current location'}
        </button>
        {/* Two lanes into the same timesheet — the company picks which are
            open. Not every business gets a wall device; not every business
            wants phones. */}
        <div style={{ marginTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
            <input type="checkbox" checked={f.phoneEnabled} onChange={(e) => set('phoneEnabled', e.target.checked)} />
            Phone clock-in
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
            <input type="checkbox" checked={f.deviceEnabled} onChange={(e) => set('deviceEnabled', e.target.checked)} />
            Wall device punches (see the Devices tab)
          </label>
        </div>
        {f.officeLat !== '' && (
          <button type="button" className="btn btn-ghost" style={{ marginLeft: 8 }}
            onClick={() => { set('officeLat', ''); set('officeLng', ''); set('radiusM', 0); }}>
            Clear location
          </button>
        )}
      </fieldset>

      <fieldset style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
        <legend style={{ fontSize: 12.5, fontWeight: 700, padding: '0 6px' }}>Working hours</legend>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
          The company-wide schedule. Anyone with their own shift follows that instead; this is the fallback.
        </p>
        <div className="form-grid">
          <div className="field"><label>Start</label>
            <input className="input" type="time" value={f.workStart} onChange={(e) => set('workStart', e.target.value)} />
          </div>
          <div className="field"><label>Close</label>
            <input className="input" type="time" value={f.workClose} onChange={(e) => set('workClose', e.target.value)} />
          </div>
          <div className="field"><label>Grace before late (minutes)</label>
            <input className="input" type="number" min="0" max="120" value={f.graceMinutes} onChange={(e) => set('graceMinutes', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Working days</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DAYS.map(([n, label]) => {
              const on = f.workingDays.includes(n);
              return (
                <button key={n} type="button" aria-pressed={on}
                  className={`btn ${on ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '0 12px', height: 32 }}
                  onClick={() => set('workingDays', on ? f.workingDays.filter((d) => d !== n) : [...f.workingDays, n])}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </fieldset>

      <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Save clock-in rules'}</button>
    </form>
  );
}

/* ---- clock in/out ----------------------------------------------------------
   Clocking in waits for the geofence rather than refusing outright. Someone
   walking up to the gate taps once and it completes as they arrive; the time
   recorded is the arrival, never the tap, because lateness feeds payroll. */
function ClockCard({ mine, onChange, flash, settings }) {
  const openShift = mine.find((r) => !r.clock_out_at);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(null);   // { distanceM, radiusM }
  const pending = useRef(null);

  useEffect(() => () => pending.current?.cancel(), []);

  const act = async (fn, msg) => {
    setBusy(true);
    try { await fn(); flash(msg); onChange(); } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  const startClockIn = async () => {
    setBusy(true); setWaiting(null);
    const job = A.clockInWhenInside({
      settings,
      onProgress: ({ distanceM, radiusM }) => setWaiting({ distanceM, radiusM }),
    });
    pending.current = job;
    try {
      await job.promise;
      flash('Clocked in.');
      onChange();
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(false); setWaiting(null); pending.current = null;
    }
  };

  const cancelWait = () => { pending.current?.cancel(); pending.current = null; setWaiting(null); setBusy(false); };

  return (
    <div className="card" style={{ maxWidth: 420, marginBottom: 20, padding: 18 }}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>
        {openShift ? `Clocked in at ${A.fmtDt(openShift.clock_in_at)}` : 'Not clocked in'}
      </div>

      {!openShift && !waiting && (
        <button className="btn btn-primary" disabled={busy} onClick={startClockIn}>
          {busy ? <span className="spinner" /> : 'Clock in'}
        </button>
      )}

      {!openShift && waiting && (
        <div aria-live="polite">
          <div style={{ fontSize: 13.5, marginBottom: 6 }}>
            You are <strong>{waiting.distanceM >= 950 ? `${(waiting.distanceM / 1000).toFixed(1)}km` : `${waiting.distanceM}m`}</strong> from{' '}
            {settings?.office_name || 'the office'}. Clock-in happens automatically as soon as you are within {waiting.radiusM}m.
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Keep this open while you walk in. The time recorded is when you arrive.
          </div>
          <button className="btn btn-ghost" onClick={cancelWait}>Cancel</button>
        </div>
      )}

      {openShift && (
        <button className="btn btn-danger" disabled={busy} onClick={() => act(A.clockOut, 'Clocked out.')}>
          {busy ? <span className="spinner" /> : 'Clock out'}
        </button>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Your device coordinates are recorded with each entry (when location access is allowed).</p>
    </div>
  );
}

/* ---- my week summary ---- */
function MyWeekSummary({ mine }) {
  const ws = A.startOfWeek();
  const week = mine.filter((r) => A.inWeek(r.clock_in_at, ws));
  const now = new Date().toISOString();
  const totalHours = week.reduce((s, r) => s + (A.hoursBetween(r.clock_in_at, r.clock_out_at || now) || 0), 0);
  const byDay = {};
  week.forEach((r) => {
    const k = A.dayKey(r.clock_in_at);
    if (!byDay[k] || new Date(r.clock_in_at) < new Date(byDay[k])) byDay[k] = r.clock_in_at;
  });
  const starts = Object.values(byDay);
  let avgStart = '—';
  if (starts.length) {
    const mins = starts.reduce((s, iso) => { const d = new Date(iso); return s + d.getHours() * 60 + d.getMinutes(); }, 0) / starts.length;
    avgStart = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(Math.round(mins % 60)).padStart(2, '0')}`;
  }
  return (
    <div style={kpiGrid}>
      <Kpi val={`${totalHours.toFixed(1)}h`} label="Hours this week" />
      <Kpi val={starts.length} label="Days worked this week" />
      <Kpi val={avgStart} label="Avg start time" />
    </div>
  );
}

/* ---- shift rows (my view + generic) ---- */
function MyShiftsTable({ records, onEdit, settings }) {
  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Clock in</th><th>Clock out</th><th>Hours</th><th>Overtime (8h workday)</th><th>Notes</th><th>Location</th>
              {onEdit && <th style={{ width: 40 }} />}
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && <tr><td colSpan={onEdit ? 7 : 6} className="td-empty">No attendance yet, records appear the moment someone clocks in from their phone, or a wall device punches in. Set up clock-in rules in Settings.</td></tr>}
            {records.map((r) => {
              const hours = A.hoursBetween(r.clock_in_at, r.clock_out_at);
              const ot = A.overtimeHours(hours);
              return (
                <tr key={r.id}>
                  <td className="muted" style={{ fontSize: 13 }}>{A.fmtDt(r.clock_in_at)}</td>
                  <td className="muted" style={{ fontSize: 13 }}>
                    {r.clock_out_at ? A.fmtDt(r.clock_out_at) : <span className="st-pill st-success">Open</span>}
                    {r.auto_closed && <span className="st-pill st-warn" style={{ marginLeft: 6 }} title="Closed automatically at day end because clock-out was forgotten. Hours are provisional until a manager confirms them with the pencil.">Auto-closed</span>}
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>{hours != null ? hours.toFixed(1) : '—'}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{ot != null && ot > 0 ? `${ot.toFixed(1)}h` : '—'}</td>
                  <td className="muted" style={{ fontSize: 13, maxWidth: 220 }}>{r.notes || '—'}</td>
                  <td><LocationCell lat={r.clock_in_lat} lng={r.clock_in_lng} settings={settings} /></td>
                  {onEdit && (
                    <td>
                      <button className="iconbtn" aria-label="Edit shift" title="Edit shift" onClick={() => onEdit(r)}><IcPencil /></button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{OT_NOTE}</p>
    </>
  );
}

/* ---- manager: today ---- */
function TodayView({ all, onEdit, settings }) {
  const todayKey = A.dayKey(new Date().toISOString());
  // Today means TODAY: a stale open shift from yesterday is not "on shift
  // now" — auto-close turns those into flagged completed records the moment
  // anyone loads the suite, and they belong to their own day's timesheet.
  const open = all.filter((r) => !r.clock_out_at && A.dayKey(r.clock_in_at) === todayKey);
  const completed = all.filter((r) => r.clock_out_at && A.dayKey(r.clock_in_at) === todayKey);
  const lateCount = [...open, ...completed].filter((r) => A.dayKey(r.clock_in_at) === todayKey && A.isLate(r.clock_in_at)).length;

  const Row = ({ r, done }) => {
    const hours = A.hoursBetween(r.clock_in_at, r.clock_out_at);
    return (
      <tr>
        <td style={{ fontWeight: 500 }}>{r.employee?.name || '—'}</td>
        <td className="muted" style={{ fontSize: 13 }}>
          {A.dayKey(r.clock_in_at) === todayKey ? A.fmtTime(r.clock_in_at) : A.fmtDt(r.clock_in_at)}
          {A.isLate(r.clock_in_at) && <span className="st-pill st-warn" style={{ marginLeft: 8 }}>Late</span>}
        </td>
        <td>{done ? <span className="st-pill st-neutral">Completed</span> : <span className="st-pill st-success">On shift</span>}</td>
        <td className="muted" style={{ fontSize: 13 }}>{done ? `${A.fmtTime(r.clock_out_at)} · ${hours.toFixed(1)}h` : '—'}</td>
        <td><LocationCell lat={r.clock_in_lat} lng={r.clock_in_lng} settings={settings} /></td>
        <td>
          <button className="iconbtn" aria-label="Edit shift" title="Edit shift" onClick={() => onEdit(r)}><IcPencil /></button>
        </td>
      </tr>
    );
  };

  return (
    <>
      <div style={kpiGrid}>
        <Kpi val={open.length} label="On shift now" />
        <Kpi val={completed.length} label="Completed today" />
        <Kpi val={lateCount} label={`Late today (after ${String(A.DAY_START_HOUR).padStart(2, '0')}:00)`} />
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Employee</th><th>Clock in</th><th>Status</th><th>Clock out</th><th>Location</th><th style={{ width: 40 }} /></tr>
          </thead>
          <tbody>
            {open.length === 0 && completed.length === 0 && <tr><td colSpan={6} className="td-empty">Nobody has clocked in today yet, the live board fills in as your team arrives.</td></tr>}
            {open.map((r) => <Row key={r.id} r={r} done={false} />)}
            {completed.map((r) => <Row key={r.id} r={r} done />)}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Late = clock-in after {String(A.DAY_START_HOUR).padStart(2, '0')}:00. This will become an org setting.
      </p>
    </>
  );
}

/* ---- manager: weekly timesheet ---- */
function TimesheetView({ all, onEdit, settings }) {
  const [weekStart, setWeekStart] = useState(() => A.startOfWeek());
  const [expanded, setExpanded] = useState(() => new Set());
  const isThisWeek = weekStart.getTime() === A.startOfWeek().getTime();

  const weekRecords = useMemo(() => all.filter((r) => A.inWeek(r.clock_in_at, weekStart)), [all, weekStart]);

  const groups = useMemo(() => {
    const map = new Map();
    weekRecords.forEach((r) => {
      const id = r.employee?.id || r.employee_id;
      if (!map.has(id)) map.set(id, { id, name: r.employee?.name || '—', shifts: [] });
      map.get(id).shifts.push(r);
    });
    const out = [...map.values()];
    out.forEach((g) => {
      g.shifts.sort((a, b) => new Date(a.clock_in_at) - new Date(b.clock_in_at));
      g.total = g.shifts.reduce((s, r) => s + (A.hoursBetween(r.clock_in_at, r.clock_out_at) || 0), 0);
      g.days = new Set(g.shifts.map((r) => A.dayKey(r.clock_in_at))).size;
      g.open = g.shifts.filter((r) => !r.clock_out_at).length;
    });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [weekRecords]);

  const toggle = (id) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const exportCsv = () => {
    const rows = weekRecords
      .slice()
      .sort((a, b) => (a.employee?.name || '').localeCompare(b.employee?.name || '') || new Date(a.clock_in_at) - new Date(b.clock_in_at))
      .map((r) => {
        const h = A.hoursBetween(r.clock_in_at, r.clock_out_at);
        return [
          r.employee?.name || '', new Date(r.clock_in_at).toLocaleDateString('en-GB'),
          A.fmtTime(r.clock_in_at), r.clock_out_at ? A.fmtTime(r.clock_out_at) : '',
          h != null ? h.toFixed(2) : '', r.notes || '',
        ];
      });
    const d = weekStart;
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    A.downloadCsv(A.buildCsv(rows), `attendance_week_${stamp}.csv`);
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button className="iconbtn" aria-label="Previous week" onClick={() => setWeekStart((w) => A.addDays(w, -7))}><IcChevL /></button>
        <span style={{ fontWeight: 600, fontSize: 14, minWidth: 180, textAlign: 'center' }}>{A.weekLabel(weekStart)}</span>
        <button className="iconbtn" aria-label="Next week" onClick={() => setWeekStart((w) => A.addDays(w, 7))}><IcChevR /></button>
        {!isThisWeek && <button className="btn btn-ghost" style={{ height: 30, padding: '0 12px', fontSize: 13 }} onClick={() => setWeekStart(A.startOfWeek())}>This week</button>}
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} disabled={weekRecords.length === 0} onClick={exportCsv}>
          <IcDownload /> Export CSV
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th style={{ width: 36 }} /><th>Employee</th><th>Days</th><th>Total hours</th><th>Open shifts</th></tr>
          </thead>
          <tbody>
            {groups.length === 0 && <tr><td colSpan={5} className="td-empty">No hours recorded this week yet, timesheets build themselves from clock-ins and feed straight into Payroll.</td></tr>}
            {groups.map((g) => (
              <GroupRows key={g.id} g={g} open={expanded.has(g.id)} onToggle={() => toggle(g.id)} onEdit={onEdit} settings={settings} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Totals count completed shifts only, fix open shifts with the pencil. {OT_NOTE}
      </p>
    </>
  );
}

function GroupRows({ g, open, onToggle, onEdit, settings }) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td><span className="iconbtn" aria-hidden="true"><IcChevDown open={open} /></span></td>
        <td style={{ fontWeight: 600 }}>{g.name}</td>
        <td className="muted" style={{ fontSize: 13 }}>{g.days}</td>
        <td style={{ fontWeight: 600, fontSize: 13 }}>{g.total.toFixed(1)}h</td>
        <td>{g.open > 0 ? <span className="st-pill st-warn">{g.open} open</span> : <span className="muted">—</span>}</td>
      </tr>
      {open && g.shifts.map((r) => {
        const hours = A.hoursBetween(r.clock_in_at, r.clock_out_at);
        return (
          <tr key={r.id} style={{ background: 'var(--surface-2)' }}>
            <td />
            <td className="muted" style={{ fontSize: 13, paddingLeft: 24 }}>{A.fmtDate(r.clock_in_at)}</td>
            <td className="muted" style={{ fontSize: 13 }} colSpan={2}>
              {A.fmtTime(r.clock_in_at)} → {r.clock_out_at ? A.fmtTime(r.clock_out_at) : <span className="st-pill st-success">Open</span>}
              {hours != null && <span style={{ marginLeft: 8 }}>({hours.toFixed(1)}h)</span>}
              {r.auto_closed && <span className="st-pill st-warn" style={{ marginLeft: 8 }} title="Closed automatically at day end because clock-out was forgotten. Hours are provisional until a manager confirms them with the pencil.">Auto-closed</span>}
              {A.isLate(r.clock_in_at) && <span className="st-pill st-warn" style={{ marginLeft: 8 }}>Late</span>}
              {r.notes && <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>{r.notes}</span>}
            </td>
            <td>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <LocationCell lat={r.clock_in_lat} lng={r.clock_in_lng} settings={settings} />
                <button className="iconbtn" aria-label="Edit shift" title="Edit shift" onClick={(e) => { e.stopPropagation(); onEdit(r); }}><IcPencil /></button>
              </span>
            </td>
          </tr>
        );
      })}
    </>
  );
}

/* ---- correction modal ---- */
function EditShiftModal({ rec, onClose, onSaved, flash }) {
  const [inAt, setInAt] = useState(A.toLocalInput(rec.clock_in_at));
  const [outAt, setOutAt] = useState(A.toLocalInput(rec.clock_out_at));
  const [notes, setNotes] = useState(rec.notes || '');
  const [busy, setBusy] = useState(false);
  const badOrder = Boolean(inAt && outAt) && new Date(outAt) <= new Date(inAt);

  const save = async (e) => {
    e.preventDefault();
    if (!inAt) { flash('Clock-in time is required.', true); return; }
    if (badOrder) { flash('Clock-out must be after clock-in.', true); return; }
    setBusy(true);
    try {
      const updated = await A.updateRecord(rec.id, {
        clockInAt: A.fromLocalInput(inAt),
        clockOutAt: A.fromLocalInput(outAt),
        notes: notes.trim(),
      });
      flash('Shift updated.');
      onSaved(updated);
      onClose();
    } catch (err) { flash(err.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Edit shift${rec.employee?.name ? `, ${rec.employee.name}` : ''}`} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field"><label>Clock in</label>
          <input className="input" type="datetime-local" value={inAt} onChange={(e) => setInAt(e.target.value)} required autoFocus />
        </div>
        <div className="field"><label>Clock out</label>
          <input className="input" type="datetime-local" value={outAt} onChange={(e) => setOutAt(e.target.value)} />
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Leave empty to reopen the shift.</p>
        </div>
        <div className="field"><label>Notes</label>
          <textarea className="input" rows={3} placeholder="e.g. forgot to clock out, actual 5pm"
            value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {badOrder && <p style={{ color: 'var(--danger, #B42318)', fontSize: 13, margin: '4px 0 0' }}>Clock-out must be after clock-in.</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || badOrder}>{busy ? <span className="spinner" /> : 'Save correction'}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ---- app ---- */

/* Attendance tour. Steps whose target is off screen are skipped by ProductTour,
   so a member of staff never hears about the manager-only tabs. The clock-in
   rules step is the point of the whole thing: everything else works out of the
   box, and an unset office location is the one gap that looks like it works. */
/* ---- devices: the universal punch lane ---------------------------------------
   Any hardware that can make an HTTP request feeds the same pipeline as the
   phone: register it, hand its installer the key, map the PINs it knows people
   by to real staff. CSV import is the fallback that makes "any device ever
   made" literally true — every clocking machine can export a spreadsheet. */
function DevicesView({ flash, onPunchesImported }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ name: '', serial: '', vendor: '' });
  const [mapForm, setMapForm] = useState({ deviceUid: '', employeeId: '' });
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = () => A.getDevices().then(setData).catch((e) => flash(e.message, true));
  useEffect(() => { load(); }, []); // eslint-disable-line

  const addDevice = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await A.createDevice(form); setForm({ name: '', serial: '', vendor: '' }); flash('Device registered — hand its key to whoever configures the hardware.'); load(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };
  const addMap = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await A.saveDeviceMap(mapForm.deviceUid, mapForm.employeeId); setMapForm({ deviceUid: '', employeeId: '' }); flash('Mapped.'); load(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };
  const copyKey = async (key) => {
    try { await navigator.clipboard.writeText(key); flash('Key copied.'); }
    catch { flash('Could not copy — select it by hand.', true); }
  };

  // CSV: personRef,timestamp,direction? — one punch per line, header optional.
  const importCsv = async (file) => {
    setImporting(true);
    try {
      const text = await file.text();
      const punches = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        .map((l) => l.split(',').map((c) => c.trim()))
        .filter((cols) => cols[0] && !/^person|^pin|^ref/i.test(cols[0]))
        .map(([personRef, timestamp, direction]) => ({ personRef, timestamp: timestamp || undefined, direction: direction || undefined }));
      if (!punches.length) { flash('No punches found in that file. Expected lines like: 42,2026-08-06T08:03:00+01:00,in', true); return; }
      let applied = 0; let duplicates = 0; const unmapped = new Set(); let errors = 0;
      for (let i = 0; i < punches.length; i += 400) {
        const r = await A.importPunches(punches.slice(i, i + 400));
        applied += r.applied; duplicates += r.duplicates; r.unmapped.forEach((u) => unmapped.add(u)); errors += r.errors.length;
      }
      flash(`Imported: ${applied} applied, ${duplicates} already known${unmapped.size ? `, ${unmapped.size} unmapped PIN${unmapped.size > 1 ? 's' : ''} (${[...unmapped].slice(0, 5).join(', ')}) — map them below and re-import` : ''}${errors ? `, ${errors} rejected` : ''}.`, unmapped.size > 0 || errors > 0);
      load(); onPunchesImported?.();
    } catch (e) { flash(e.message, true); } finally { setImporting(false); }
  };

  if (!data) return <div className="suite-loading"><div className="boot-spinner" /></div>;
  const punchUrl = `${window.location.origin}/api/punch`;

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 4 }}>Connect any clocking hardware</div>
        <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
          Register the device below, then have its installer send each punch to{' '}
          <code style={{ fontSize: 12 }}>{punchUrl}</code> with the device key in an <code style={{ fontSize: 12 }}>x-device-key</code> header
          and the person&rsquo;s PIN as <code style={{ fontSize: 12 }}>personRef</code>. Punches buffered offline arrive late and are accepted.
          Only punch events are ever stored — fingerprints never leave the device. No API on your machine? Import its CSV export below instead.
        </p>
      </div>

      <form onSubmit={addDevice} className="form-grid" style={{ marginBottom: 10, alignItems: 'end' }}>
        <div className="field"><label>Device name</label>
          <input className="input" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="Front desk thumbprint" />
        </div>
        <div className="field"><label>Serial number</label>
          <input className="input" value={form.serial} onChange={(e) => setForm((s) => ({ ...s, serial: e.target.value }))} placeholder="On the device sticker" />
        </div>
        <div className="field"><label>Vendor (optional)</label>
          <input className="input" value={form.vendor} onChange={(e) => setForm((s) => ({ ...s, vendor: e.target.value }))} placeholder="ZKTeco" />
        </div>
        <div className="field"><button className="btn btn-primary" disabled={busy}>Register device</button></div>
      </form>

      <div className="table-wrap" style={{ marginBottom: 20 }}>
        <table className="table">
          <thead><tr><th>Device</th><th>Serial</th><th>Key</th><th>Last seen</th><th /><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {data.devices.length === 0 && <tr><td colSpan={6} className="td-empty">No devices yet. A registered device gets a key that lets it submit punches for your company — nothing else.</td></tr>}
            {data.devices.map((d) => (
              <tr key={d.id}>
                <td style={{ fontWeight: 550 }}>{d.name}{d.vendor ? <span className="muted" style={{ fontSize: 12 }}> · {d.vendor}</span> : null}</td>
                <td className="muted" style={{ fontSize: 12.5 }}>{d.serial}</td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyKey(d.api_key)} title="Copy the device key">
                    <code style={{ fontSize: 11 }}>{d.api_key.slice(0, 8)}…</code> copy
                  </button>
                </td>
                <td className="muted" style={{ fontSize: 12.5 }}>{d.last_seen_at ? A.fmtDt(d.last_seen_at) : <span className="st-pill st-warn">Never</span>}</td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                    onClick={async () => { try { await A.setDeviceActive(d.id, !d.active); load(); } catch (e) { flash(e.message, true); } }}>
                    {d.active ? 'Disable' : 'Enable'}
                  </button>
                </td>
                <td>
                  <button type="button" className="iconbtn" aria-label="Delete device" title="Delete device"
                    onClick={async () => { try { await A.deleteDevice(d.id); flash('Device removed.'); load(); } catch (e) { flash(e.message, true); } }}>
                    <IcX />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 4 }}>Who is PIN 42?</div>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
        The device knows people by the PIN they enrolled with. Map each PIN to the real person once; unmapped punches wait, and apply on re-import once mapped.
      </p>
      <form onSubmit={addMap} className="form-grid" style={{ marginBottom: 10, alignItems: 'end' }}>
        <div className="field"><label>PIN on the device</label>
          <input className="input" value={mapForm.deviceUid} onChange={(e) => setMapForm((s) => ({ ...s, deviceUid: e.target.value }))} placeholder="42" />
        </div>
        <div className="field"><label>Person</label>
          <select className="input" value={mapForm.employeeId} onChange={(e) => setMapForm((s) => ({ ...s, employeeId: e.target.value }))}>
            <option value="">Choose…</option>
            {data.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field"><button className="btn btn-primary" disabled={busy || !mapForm.employeeId}>Map</button></div>
      </form>
      <div className="table-wrap" style={{ marginBottom: 20 }}>
        <table className="table">
          <thead><tr><th>PIN</th><th>Person</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {data.maps.length === 0 && <tr><td colSpan={3} className="td-empty">No mappings yet.</td></tr>}
            {data.maps.map((m) => (
              <tr key={m.id}>
                <td className="muted" style={{ fontSize: 13 }}>{m.device_uid}</td>
                <td style={{ fontWeight: 550 }}>{data.staff.find((s) => s.id === m.employee_id)?.name || '—'}</td>
                <td>
                  <button type="button" className="iconbtn" aria-label="Remove mapping" title="Remove mapping"
                    onClick={async () => { try { await A.deleteDeviceMap(m.id); load(); } catch (e) { flash(e.message, true); } }}>
                    <IcX />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 4 }}>Import a CSV export</div>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
        One punch per line: <code style={{ fontSize: 12 }}>PIN,timestamp,in|out</code> — direction optional, the timesheet pairs ins and outs itself.
      </p>
      <label className="btn btn-ghost" style={{ cursor: importing ? 'wait' : 'pointer' }}>
        {importing ? 'Importing…' : 'Choose CSV file'}
        <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} disabled={importing}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importCsv(f); }} />
      </label>
    </div>
  );
}

const TOUR_STEPS = [
  { title: 'Time & Attendance',
    body: 'Clocking in and out from a phone, with the location it happened, hours totalled for payroll. A short walkthrough; skip anytime.' },
  { target: '[data-tour="att-tab-mine"]', title: 'Your own attendance',
    body: 'Clock in and out here, and see your own history. Clock-in records where you were, so the record can be trusted later.' },
  { target: '[data-tour="att-nudge"]', title: 'Set your office location first',
    body: 'Until you do, staff can clock in from anywhere, from home, from the road, and the record will look perfectly normal. Set a point and a radius and clock-in is simply refused outside it. Someone who taps while still walking in waits, and is clocked in the moment they arrive, at the time they arrive.' },
  { target: '[data-tour="att-tab-rules"]', title: 'Clock-in rules',
    body: 'The office location and radius, your working hours and days, and how many minutes grace before someone counts as late. Anyone with their own shift follows that instead; this is the company-wide fallback.' },
  { target: '[data-tour="att-tab-today"]', title: 'Today',
    body: 'Who is in, who is late, who has not arrived, as it happens.' },
  { target: '[data-tour="att-tab-timesheet"]', title: 'Timesheet',
    body: 'Hours per person over a period, including overtime, which is what flows into a payroll run.' },
  { target: '[data-tour="att-tab-shifts"]', title: 'Shifts',
    body: 'Different start times for different people. Lateness is judged against a person\'s own shift, so a night-shift worker is not marked late at nine in the morning.' },
];

export default function AttendanceApp({ access }) {
  const isManager = access?.role === 'manager';
  const [mine, setMine] = useState([]);
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('mine');
  const [settings, setSettings] = useState(null);
  const [tour, setTour] = useState(false);
  const { user: me } = useAuth();
  // A fence exists only when there is a point AND a radius. Radius 0 is the
  // table's default and means "no fence".
  const fenceSet = Boolean(settings?.office_lat != null && Number(settings?.geofence_radius_m) > 0);

  // First visit per user, replayable via /suite/attendance?tour=1. Waits for
  // load so the tabs and the nudge it points at are actually mounted.
  useEffect(() => {
    if (loading) return undefined;
    const wantsReplay = new URLSearchParams(window.location.search).get('tour') === '1';
    if (wantsReplay || !tourSeen(me?.id, 'attendance_v1')) {
      const t = setTimeout(() => setTour(true), 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [loading]); // eslint-disable-line
  const [editRec, setEditRec] = useState(null);
  const { flash, toastNode } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, a] = await Promise.all([A.getMyRecords(), isManager ? A.getAllRecords() : Promise.resolve([])]);
      // Awaited, not fired and forgotten. The clock-in card needs the fence to
      // wait rather than fail, and the tour points at a nudge that only exists
      // once settings have arrived: resolving this after `loading` clears meant
      // the tour could open first and silently skip its most important step.
      // Tolerated, because an org that never set these still clocks in as before.
      setSettings(await A.getSettings().catch(() => null));
      setMine(m); setAll(a);
    } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [isManager, flash]);

  useEffect(() => { load(); }, [load]);

  const applyUpdate = (rec) => {
    setAll((xs) => xs.map((r) => (r.id === rec.id ? rec : r)));
    setMine((xs) => xs.map((r) => (r.id === rec.id ? { ...r, ...rec } : r)));
  };

  const TABS = useMemo(() => isManager
    ? [{ key: 'mine', label: 'My attendance' }, { key: 'today', label: 'Today' }, { key: 'timesheet', label: 'Timesheet' }, { key: 'shifts', label: 'Shifts' }, { key: 'devices', label: 'Devices' }, { key: 'rules', label: 'Clock-in rules' }]
    : [{ key: 'mine', label: 'My attendance' }], [isManager]);

  return (
    <div className="lv">
      <div className="lv-tabs">
        {TABS.map((t) => (
          <button key={t.key} data-tour={`att-tab-${t.key}`} className={`lv-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* An unset office location does not fail loudly: it silently means
          "clock in from anywhere", which looks identical to a working geofence
          until you check where someone actually was. Managers get told. */}
      {!loading && isManager && settings && !fenceSet && (
        <div className="att-nudge" data-tour="att-nudge" role="status">
          <div>
            <strong>Staff can currently clock in from anywhere.</strong>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              Set your office location and a radius, and clock-in is refused outside it. Until then
              attendance records where someone was, but never questions it.
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setTab('rules')}>Set office location</button>
        </div>
      )}
      {tour && <ProductTour steps={TOUR_STEPS} userId={me?.id} tourId="attendance_v1" onClose={() => setTour(false)} />}

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}
      {!loading && tab === 'mine' && (
        <>
          <ClockCard mine={mine} onChange={load} flash={flash} settings={settings} />
          <MyWeekSummary mine={mine} />
          <MyShiftsTable records={mine} onEdit={isManager ? setEditRec : null} settings={settings} />
        </>
      )}
      {!loading && tab === 'today' && isManager && <TodayView all={all} onEdit={setEditRec} settings={settings} />}
      {!loading && tab === 'timesheet' && isManager && <TimesheetView all={all} onEdit={setEditRec} settings={settings} />}
      {!loading && tab === 'devices' && isManager && <DevicesView flash={flash} onPunchesImported={load} />}
      {tab === 'shifts' && isManager && <ShiftsTab flash={flash} />}
      {tab === 'rules' && isManager && (
        <RulesPanel settings={settings} onSaved={setSettings} flash={flash} />
      )}
      {editRec && <EditShiftModal rec={editRec} onClose={() => setEditRec(null)} onSaved={applyUpdate} flash={flash} />}
      {toastNode}
    </div>
  );
}

/* ---- ShiftsTab: rosters — lateness judged against each person's own shift ---- */
function ShiftsTab({ flash }) {
  const [data, setData] = useState(null);   // { shifts, assignments }
  const [staff, setStaff] = useState([]);
  const [modal, setModal] = useState(false);
  const [assignFor, setAssignFor] = useState(null); // shift being assigned
  const { confirm, confirmNode } = useConfirm();

  const load = () => {
    A.getShifts().then(setData, (e) => { setData({ shifts: [], assignments: [] }); flash(e.message, true); });
    apiGet('/staff').then((d) => setStaff(d.staff || [])).catch(() => {});
  };
  useEffect(load, []); // eslint-disable-line

  const nameOf = (id) => staff.find((s) => s.id === id)?.name || '—';
  const membersOf = (shiftId) => (data?.assignments || []).filter((a) => a.shift_id === shiftId).map((a) => a.user_id);
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fmtT = (t) => String(t).slice(0, 5);

  const remove = async (sh) => {
    const ok = await confirm({ title: `Delete "${sh.name}"?`, message: 'Its members fall back to the company-wide schedule.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await A.deleteShift(sh.id); load(); flash('Shift deleted.'); } catch (e) { flash(e.message, true); }
  };

  return (
    <>
      <div className="filterbar" style={{ marginTop: 8 }}>
        <span className="count">{data ? `${data.shifts.length} shift${data.shifts.length === 1 ? '' : 's'}` : 'Loading…'}</span>
        <button className="btn btn-primary lv-apply" onClick={() => setModal(true)}>New shift</button>
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 12px', lineHeight: 1.5 }}>
        Lateness is judged against each person&apos;s own shift (plus the grace window), anyone without a shift follows the company-wide schedule in Settings. Lateness still flows into payroll exactly as configured.
      </p>

      {data && data.shifts.length === 0 && (
        <EmptyState title="No shifts yet" hint="Create shifts like Morning 7–3 or Gate night, assign your teams, and clock-in judges each person against their own start time." />
      )}
      {data && data.shifts.map((sh) => {
        const members = membersOf(sh.id);
        return (
          <div key={sh.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 16px', marginBottom: 10, background: 'var(--surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ fontSize: 14.5 }}>{sh.name}</strong>
                <span className="muted" style={{ marginLeft: 10, fontSize: 12.5 }}>
                  {fmtT(sh.start_time)}–{fmtT(sh.end_time)} · {(sh.days || []).map((d) => DAYS[d]).join(' ')}
                </span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setAssignFor(sh)}>Assign staff</button>
              <button className="btn btn-ghost btn-sm" onClick={() => remove(sh)}>Delete</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: members.length ? 8 : 0 }}>
              {members.map((uid) => (
                <span key={uid} className="pill active" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {nameOf(uid)}
                  <button onClick={async () => { try { await A.unassignShift(uid); load(); } catch (e) { flash(e.message, true); } }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', padding: 0, lineHeight: 1 }} aria-label={`Remove ${nameOf(uid)}`}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {modal && <ShiftModal onClose={() => setModal(false)} onSaved={() => { setModal(false); load(); flash('Shift created.'); }} flash={flash} />}
      {assignFor && (
        <AssignModal shift={assignFor} staff={staff} current={membersOf(assignFor.id)}
          onClose={() => setAssignFor(null)}
          onSaved={() => { setAssignFor(null); load(); flash('Roster updated.'); }} flash={flash} />
      )}
      {confirmNode}
    </>
  );
}

function ShiftModal({ onClose, onSaved, flash }) {
  const [f, setF] = useState({ name: '', startTime: '08:00', endTime: '17:00', days: [1, 2, 3, 4, 5] });
  const [busy, setBusy] = useState(false);
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const toggleDay = (i) => setF((s) => ({ ...s, days: s.days.includes(i) ? s.days.filter((d) => d !== i) : [...s.days, i].sort() }));
  const save = async () => {
    if (!f.name.trim()) { flash('Give the shift a name.', true); return; }
    setBusy(true);
    try { await A.createShift(f); onSaved(); } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };
  return (
    <Modal title="New shift" onClose={onClose}>
      <div className="field"><label>Shift name</label>
        <input className="input" value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} placeholder="Morning crew / Gate night…" autoFocus /></div>
      <div className="form-grid">
        <div className="field"><label>Starts</label>
          <input className="input" type="time" value={f.startTime} onChange={(e) => setF((s) => ({ ...s, startTime: e.target.value }))} /></div>
        <div className="field"><label>Ends</label>
          <input className="input" type="time" value={f.endTime} onChange={(e) => setF((s) => ({ ...s, endTime: e.target.value }))} /></div>
      </div>
      <div className="field"><label>Days</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DAYS.map((d, i) => (
            <button key={d} type="button" className={`pill ${f.days.includes(i) ? 'active' : ''}`} onClick={() => toggleDay(i)}>{d}</button>
          ))}
        </div></div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'Create shift'}</button>
      </div>
    </Modal>
  );
}

function AssignModal({ shift, staff, current, onClose, onSaved, flash }) {
  const [sel, setSel] = useState(() => new Set(current));
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const save = async () => {
    setBusy(true);
    try {
      const add = [...sel].filter((id) => !current.includes(id));
      const drop = current.filter((id) => !sel.has(id));
      if (add.length) await A.assignShift(shift.id, add);
      for (const id of drop) await A.unassignShift(id);
      onSaved();
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Assign staff, ${shift.name}`} onClose={onClose}>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>A person can be on one shift at a time, assigning here moves them off any other shift.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
        {staff.map((s) => (
          <button key={s.id} type="button" className={`pill ${sel.has(s.id) ? 'active' : ''}`} onClick={() => toggle(s.id)}>{s.name}</button>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : `Save roster`}</button>
      </div>
    </Modal>
  );
}
