import { useEffect, useState } from 'react';
import * as L from './leaveApi.js';
import { useConfirm, EmptyState } from '../../components/ui.jsx';

const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const STATUS = { pending: 'st-pending', approved: 'st-approved', rejected: 'st-rejected', cancelled: 'st-cancelled' };
const initials = (n = '') => n.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export default function LeaveApprovals({ flash }) {
  const [filter, setFilter] = useState('pending');
  const [rows, setRows] = useState([]);
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
                <td>{fmt(r.start_date)}{r.end_date !== r.start_date && ` – ${fmt(r.end_date)}`}{r.half_day && ' ½'}</td>
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
