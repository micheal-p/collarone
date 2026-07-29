import { useEffect, useState } from 'react';
import * as L from './leaveApi.js';
import { useConfirm, EmptyState } from '../../components/ui.jsx';

const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const STATUS = { pending: 'st-pending', approved: 'st-approved', rejected: 'st-rejected', cancelled: 'st-cancelled' };
const initials = (n = '') => n.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Approved absences from the same department overlapping a pending request —
// the "will anyone be left?" check an approver otherwise does from memory.
const overlaps = (a, b) => a.start_date <= b.end_date && b.start_date <= a.end_date;

export default function LeaveApprovals({ flash }) {
  const [filter, setFilter] = useState('pending');
  const [rows, setRows] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const { confirm, confirmNode } = useConfirm();

  const load = async () => {
    setLoading(true);
    try { setRows(await L.getAllRequests(filter === 'all' ? {} : { status: filter })); }
    catch (e) { flash(e.message, true); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);
  useEffect(() => { L.getTeamCalendar().then(setAbsences).catch(() => {}); }, []);

  const conflictsFor = (r) => {
    if (r.status !== 'pending' || !r.applicant?.department) return [];
    return absences.filter((a) =>
      a.id !== r.id && a.status === 'approved' &&
      a.department === r.applicant.department && overlaps(a, r));
  };

  const decide = async (r, decision) => {
    let comment = '';
    if (decision === 'rejected') {
      const res = await confirm({
        title: 'Reject leave request',
        message: `${r.applicant?.name}’s request will be rejected.`,
        confirmLabel: 'Reject',
        danger: true,
        input: { label: 'Reason (shared with the employee)', required: false },
      });
      if (!res) return; // Cancel must abort the rejection entirely
      comment = res.value;
    }
    setBusyId(r.id);
    try { await L.decideRequest(r.id, decision, comment); flash(`Request ${decision}.`); load(); }
    catch (e) { flash(e.message, true); } finally { setBusyId(null); }
  };

  const pills = ['pending', 'approved', 'rejected', 'all'];
  return (
    <>
      <div className="filterbar">
        <span className="filter-label">Show:</span>
        <div className="filter-pills">
          {pills.map((p) => <button key={p} className={`pill ${filter === p ? 'active' : ''}`} onClick={() => setFilter(p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}
        </div>
        <span className="count">{rows.length} request{rows.length === 1 ? '' : 's'}</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th className="ta-r">Action</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="td-empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7}>
                <EmptyState
                  title="No requests"
                  hint={filter === 'all' ? 'No leave requests have been submitted yet.' : `There are no ${filter} requests right now.`}
                />
              </td></tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.id}>
                <td><div className="cell-user"><span className="avatar sm">{initials(r.applicant?.name)}</span>
                  <div><div className="cu-name">{r.applicant?.name}</div><div className="cu-mail">{r.applicant?.department || r.applicant?.email}</div></div></div></td>
                <td><span className="lv-dot" style={{ background: r.leave_types?.color }} />{r.leave_types?.name}</td>
                <td>
                  {fmt(r.start_date)}{r.end_date !== r.start_date && ` – ${fmt(r.end_date)}`}{r.half_day && ' ½'}
                  {(() => {
                    const c = conflictsFor(r);
                    return c.length > 0 && (
                      <div className="lv-conflict" title={c.map((a) => `${a.person} (${fmt(a.start_date)} – ${fmt(a.end_date)})`).join(', ')}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-1px', marginRight: 4 }} aria-hidden="true"><path d="M12 3L2 21h20L12 3z" /><path d="M12 10v5M12 18.5v.01" /></svg>
                        {c.length === 1 ? `${c[0].person.split(' ')[0]} is` : `${c.length} from ${r.applicant.department} are`} also away then
                      </div>
                    );
                  })()}
                </td>
                <td>{r.working_days}</td>
                <td className="muted">{r.reason || '—'}</td>
                <td><span className={`lv-status ${STATUS[r.status]}`}>{r.status[0].toUpperCase() + r.status.slice(1)}</span></td>
                <td className="ta-r">
                  {r.status === 'pending' ? (
                    <div className="row-actions">
                      <button className="btn btn-primary btn-sm" disabled={busyId === r.id} onClick={() => decide(r, 'approved')}>Approve</button>
                      <button className="btn btn-danger btn-sm" disabled={busyId === r.id} onClick={() => decide(r, 'rejected')}>Reject</button>
                    </div>
                  ) : <span className="muted">{r.decision_comment || '—'}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirmNode}
    </>
  );
}
