import { useEffect, useMemo, useState } from 'react';
import * as L from './leaveApi.js';
import LeaveApprovals from './LeaveApprovals.jsx';
import LeaveCalendar from './LeaveCalendar.jsx';

const YEAR = new Date().getFullYear();
const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const STATUS = {
  pending: { label: 'Pending', cls: 'st-pending' },
  approved: { label: 'Approved', cls: 'st-approved' },
  rejected: { label: 'Rejected', cls: 'st-rejected' },
  cancelled: { label: 'Cancelled', cls: 'st-cancelled' },
};

export default function LeaveApp({ access }) {
  const isApprover = access?.role === 'manager';
  const [tab, setTab] = useState('overview');
  const [types, setTypes] = useState([]);
  const [requests, setRequests] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const flash = (msg, isErr) => { setToast({ msg, isErr }); setTimeout(() => setToast(null), 2800); };

  const load = async () => {
    try {
      const [t, r, o, h] = await Promise.all([L.getTypes(), L.getMyRequests(YEAR), L.getMyOverrides(YEAR), L.getHolidays(YEAR)]);
      setTypes(t); setRequests(r); setOverrides(o); setHolidays(h);
    } catch (e) { flash(e.message, true); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const balances = useMemo(() => L.computeBalances(types, requests, overrides, YEAR), [types, requests, overrides]);
  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.day)), [holidays]);

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'requests', label: 'My requests' },
    ...(isApprover ? [{ key: 'approvals', label: 'Approvals' }] : []),
    { key: 'calendar', label: 'Calendar' },
  ];

  return (
    <div className="lv">
      <div className="lv-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`lv-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
        <button className="btn btn-primary lv-apply" onClick={() => setApplyOpen(true)}>Apply for leave</button>
      </div>

      {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : (
        <>
          {tab === 'overview' && <Overview balances={balances} requests={requests} />}
          {tab === 'requests' && <MyRequests requests={requests} onChange={load} flash={flash} />}
          {tab === 'approvals' && isApprover && <LeaveApprovals flash={flash} />}
          {tab === 'calendar' && <LeaveCalendar year={YEAR} holidays={holidays} myRequests={requests} isApprover={isApprover} />}
        </>
      )}

      {applyOpen && (
        <ApplyModal types={types} balances={balances} holidaySet={holidaySet}
          onClose={() => setApplyOpen(false)}
          onDone={() => { setApplyOpen(false); load(); flash('Leave request submitted.'); }}
          onError={(m) => flash(m, true)} />
      )}
      {toast && <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>}
    </div>
  );
}

function Overview({ balances, requests }) {
  const upcoming = requests.filter((r) => r.status === 'approved' && new Date(r.start_date) >= new Date()).slice(0, 4);
  return (
    <>
      <div className="lv-balances">
        {balances.map((b) => (
          <div className="lv-bal" key={b.type.id} style={{ borderTopColor: b.type.color }}>
            <div className="lv-bal-name">{b.type.name}</div>
            <div className="lv-bal-big">
              {b.available === null ? '—' : <>{b.available}<span className="lv-bal-of"> / {b.entitled}</span></>}
            </div>
            <div className="lv-bal-sub">
              {b.available === null ? 'No limit' : 'days available'}
              {b.pending > 0 && <span className="lv-bal-pending"> · {b.pending} pending</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="lv-section">
        <h3>Upcoming approved leave</h3>
        {upcoming.length === 0 ? <p className="muted">Nothing scheduled.</p> : (
          <ul className="lv-upcoming">
            {upcoming.map((r) => (
              <li key={r.id}><span className="lv-dot" style={{ background: r.leave_types?.color }} />
                <b>{r.leave_types?.name}</b> · {fmt(r.start_date)}{r.end_date !== r.start_date && ` – ${fmt(r.end_date)}`} · {r.working_days} day(s)</li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function MyRequests({ requests, onChange, flash }) {
  const cancel = async (r) => {
    if (!confirm('Cancel this leave request?')) return;
    try { await L.cancelRequest(r.id); onChange(); flash('Request cancelled.'); }
    catch (e) { flash(e.message, true); }
  };
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Reason</th><th></th></tr></thead>
        <tbody>
          {requests.length === 0 && <tr><td colSpan={6} className="td-empty">No leave requests yet.</td></tr>}
          {requests.map((r) => (
            <tr key={r.id}>
              <td><span className="lv-dot" style={{ background: r.leave_types?.color }} />{r.leave_types?.name}</td>
              <td>{fmt(r.start_date)}{r.end_date !== r.start_date && ` – ${fmt(r.end_date)}`}{r.half_day && ' (½)'}</td>
              <td>{r.working_days}</td>
              <td><span className={`lv-status ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span></td>
              <td className="muted">{r.reason || '—'}</td>
              <td className="ta-r">{(r.status === 'pending' || (r.status === 'approved' && new Date(r.start_date) > new Date())) &&
                <button className="btn btn-ghost btn-sm" onClick={() => cancel(r)}>Cancel</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApplyModal({ types, balances, holidaySet, onClose, onDone, onError }) {
  const [typeId, setTypeId] = useState(types[0]?.id || '');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const single = start && end && start === end;
  const days = L.workingDays(start, end || start, half && single, holidaySet);
  const bal = balances.find((b) => b.type.id === typeId);
  const over = bal && bal.available !== null && days > bal.available;

  const submit = async (e) => {
    e.preventDefault();
    if (!typeId || !start || !end) return onError('Pick a leave type and dates.');
    if (end < start) return onError('End date is before the start date.');
    setBusy(true);
    try { await L.submitRequest({ typeId, start, end, half: half && single, reason }); onDone(); }
    catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Apply for leave</h2>
          <button className="iconbtn dark" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="field"><label>Leave type</label>
            <select className="select" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.tracked ? '' : ' (unpaid)'}</option>)}
            </select>
            {bal && bal.available !== null && <div className="muted" style={{ marginTop: 4 }}>{bal.available} day(s) available</div>}
          </div>
          <div className="form-grid">
            <div className="field"><label>From</label><input className="input" type="date" value={start} onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value); }} /></div>
            <div className="field"><label>To</label><input className="input" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          {single && <label className="lv-half"><input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} /> Half day</label>}
          <div className="field"><label>Reason <span className="muted">(optional)</span></label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. family event" /></div>
          <div className="lv-preview">
            <span>Working days requested</span><b>{days}</b>
          </div>
          {over && <div className="error-text">That exceeds your available balance.</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || days <= 0 || over}>{busy ? <span className="spinner" /> : 'Submit request'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
