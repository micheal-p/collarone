import { useCallback, useEffect, useMemo, useState } from 'react';
import * as A from './attendanceApi.js';
import { useToast } from '../../components/ui.jsx';

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

function RecordsTable({ records, showEmployee }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {showEmployee && <th>Employee</th>}
            <th>Clock in</th><th>Clock out</th><th>Hours</th><th>Overtime</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 && <tr><td colSpan={showEmployee ? 5 : 4} className="td-empty">No records yet.</td></tr>}
          {records.map((r) => {
            const hours = A.hoursBetween(r.clock_in_at, r.clock_out_at);
            const ot = A.overtimeHours(hours);
            return (
              <tr key={r.id}>
                {showEmployee && <td style={{ fontWeight: 500 }}>{r.employee?.name}</td>}
                <td className="muted" style={{ fontSize: 13 }}>{A.fmtDt(r.clock_in_at)}</td>
                <td className="muted" style={{ fontSize: 13 }}>{r.clock_out_at ? A.fmtDt(r.clock_out_at) : <span className="st-pill st-success">Open</span>}</td>
                <td className="muted" style={{ fontSize: 13 }}>{hours != null ? hours.toFixed(1) : '—'}</td>
                <td className="muted" style={{ fontSize: 13 }}>{ot != null && ot > 0 ? `${ot.toFixed(1)}h` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AttendanceApp({ access }) {
  const isManager = access?.role === 'manager';
  const [mine, setMine] = useState([]);
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('mine');
  const { flash, toastNode } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, a] = await Promise.all([A.getMyRecords(), isManager ? A.getAllRecords() : Promise.resolve([])]);
      setMine(m); setAll(a);
    } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [isManager, flash]);

  useEffect(() => { load(); }, [load]);

  const TABS = useMemo(() => isManager
    ? [{ key: 'mine', label: 'My attendance' }, { key: 'team', label: 'Team timesheet' }]
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
          <RecordsTable records={mine} showEmployee={false} />
        </>
      )}
      {!loading && tab === 'team' && <RecordsTable records={all} showEmployee />}
      {toastNode}
    </div>
  );
}
