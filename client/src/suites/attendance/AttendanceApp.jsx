import { useCallback, useEffect, useMemo, useState } from 'react';
import * as A from './attendanceApi.js';
import { Modal, useToast } from '../../components/ui.jsx';

/* ---- inline icons ---- */
const IcPencil = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>;
const IcPin = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></svg>;
const IcDownload = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>;
const IcChevL = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>;
const IcChevR = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>;
const IcChevDown = ({ open }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .12s' }}><path d="M6 9l6 6 6-6" /></svg>;

const OT_NOTE = 'Overtime is hours beyond an 8h workday. A per-org schedule setting is coming later.';

/* ---- small shared cells ---- */
function LocationCell({ lat, lng }) {
  if (lat == null || lng == null) return <span className="muted">—</span>;
  return (
    <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--brand)', textDecoration: 'none', fontWeight: 500 }}>
      <IcPin /> View location
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

/* ---- clock in/out (unchanged behaviour) ---- */
function ClockCard({ mine, onChange, flash }) {
  const openShift = mine.find((r) => !r.clock_out_at);
  const [busy, setBusy] = useState(false);

  const act = async (fn, msg) => {
    setBusy(true);
    try { await fn(); flash(msg); onChange(); } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ maxWidth: 420, marginBottom: 20, padding: 18 }}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>
        {openShift ? `Clocked in at ${A.fmtDt(openShift.clock_in_at)}` : 'Not clocked in'}
      </div>
      {!openShift && (
        <button className="btn btn-primary" disabled={busy} onClick={() => act(A.clockIn, 'Clocked in.')}>
          {busy ? <span className="spinner" /> : 'Clock in'}
        </button>
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
function MyShiftsTable({ records, onEdit }) {
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
            {records.length === 0 && <tr><td colSpan={onEdit ? 7 : 6} className="td-empty">No records yet.</td></tr>}
            {records.map((r) => {
              const hours = A.hoursBetween(r.clock_in_at, r.clock_out_at);
              const ot = A.overtimeHours(hours);
              return (
                <tr key={r.id}>
                  <td className="muted" style={{ fontSize: 13 }}>{A.fmtDt(r.clock_in_at)}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{r.clock_out_at ? A.fmtDt(r.clock_out_at) : <span className="st-pill st-success">Open</span>}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{hours != null ? hours.toFixed(1) : '—'}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{ot != null && ot > 0 ? `${ot.toFixed(1)}h` : '—'}</td>
                  <td className="muted" style={{ fontSize: 13, maxWidth: 220 }}>{r.notes || '—'}</td>
                  <td><LocationCell lat={r.clock_in_lat} lng={r.clock_in_lng} /></td>
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
function TodayView({ all, onEdit }) {
  const todayKey = A.dayKey(new Date().toISOString());
  // Open shifts from any day count as "on shift now" — a stale one from
  // yesterday is exactly the forgot-to-clock-out case a manager should fix.
  const open = all.filter((r) => !r.clock_out_at);
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
        <td><LocationCell lat={r.clock_in_lat} lng={r.clock_in_lng} /></td>
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
            {open.length === 0 && completed.length === 0 && <tr><td colSpan={6} className="td-empty">No activity today.</td></tr>}
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
function TimesheetView({ all, onEdit }) {
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
            {groups.length === 0 && <tr><td colSpan={5} className="td-empty">No shifts this week.</td></tr>}
            {groups.map((g) => (
              <GroupRows key={g.id} g={g} open={expanded.has(g.id)} onToggle={() => toggle(g.id)} onEdit={onEdit} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Totals count completed shifts only — fix open shifts with the pencil. {OT_NOTE}
      </p>
    </>
  );
}

function GroupRows({ g, open, onToggle, onEdit }) {
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
              {A.isLate(r.clock_in_at) && <span className="st-pill st-warn" style={{ marginLeft: 8 }}>Late</span>}
              {r.notes && <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>{r.notes}</span>}
            </td>
            <td>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <LocationCell lat={r.clock_in_lat} lng={r.clock_in_lng} />
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
    <Modal title={`Edit shift${rec.employee?.name ? ` — ${rec.employee.name}` : ''}`} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field"><label>Clock in</label>
          <input className="input" type="datetime-local" value={inAt} onChange={(e) => setInAt(e.target.value)} required autoFocus />
        </div>
        <div className="field"><label>Clock out</label>
          <input className="input" type="datetime-local" value={outAt} onChange={(e) => setOutAt(e.target.value)} />
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Leave empty to reopen the shift.</p>
        </div>
        <div className="field"><label>Notes</label>
          <textarea className="input" rows={3} placeholder="e.g. forgot to clock out — actual 5pm"
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
export default function AttendanceApp({ access }) {
  const isManager = access?.role === 'manager';
  const [mine, setMine] = useState([]);
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('mine');
  const [editRec, setEditRec] = useState(null);
  const { flash, toastNode } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, a] = await Promise.all([A.getMyRecords(), isManager ? A.getAllRecords() : Promise.resolve([])]);
      setMine(m); setAll(a);
    } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [isManager, flash]);

  useEffect(() => { load(); }, [load]);

  const applyUpdate = (rec) => {
    setAll((xs) => xs.map((r) => (r.id === rec.id ? rec : r)));
    setMine((xs) => xs.map((r) => (r.id === rec.id ? { ...r, ...rec } : r)));
  };

  const TABS = useMemo(() => isManager
    ? [{ key: 'mine', label: 'My attendance' }, { key: 'today', label: 'Today' }, { key: 'timesheet', label: 'Timesheet' }]
    : [{ key: 'mine', label: 'My attendance' }], [isManager]);

  return (
    <div className="lv">
      <div className="lv-tabs">
        {TABS.map((t) => <button key={t.key} className={`lv-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}
      {!loading && tab === 'mine' && (
        <>
          <ClockCard mine={mine} onChange={load} flash={flash} />
          <MyWeekSummary mine={mine} />
          <MyShiftsTable records={mine} onEdit={isManager ? setEditRec : null} />
        </>
      )}
      {!loading && tab === 'today' && isManager && <TodayView all={all} onEdit={setEditRec} />}
      {!loading && tab === 'timesheet' && isManager && <TimesheetView all={all} onEdit={setEditRec} />}
      {editRec && <EditShiftModal rec={editRec} onClose={() => setEditRec(null)} onSaved={applyUpdate} flash={flash} />}
      {toastNode}
    </div>
  );
}
