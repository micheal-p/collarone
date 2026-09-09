import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast, EmptyState } from '../components/ui.jsx';
import * as L from '../suites/leave/leaveApi.js';
import * as P from '../suites/procurement/procurementApi.js';
import * as F from '../suites/finance/financeApi.js';

/* =========================================================================
   Approvals — one screen for everything waiting on this person.

   Approvals lived inside each suite, so a manager answering "what is waiting
   on me?" had to open Leave, then Procurement, then Finance, and remember
   which ones they had already checked. The things that get missed are the ones
   nobody has a single place to look at.

   THE IMPORTANT DESIGN DECISION: this adds NO permission logic of its own.
   Every source below calls the same function its own suite calls, so the
   database's row-level security decides what comes back. A person who is not
   an approver for leave does not get a filtered list, they get an empty one,
   and they get it for exactly the same reason they would inside the Leave
   suite. Re-implementing "who may approve what" here would mean two answers to
   one question, and the second one would eventually be wrong.

   Promise.allSettled, not Promise.all: an organisation that has not bought
   Procurement must still see its leave approvals. One source failing is a
   missing section, never a broken page.
   ========================================================================= */

const CSS = `
  .ap-wrap { max-width: 940px; margin: 0 auto; padding: 26px 20px 60px; }
  .ap-h1 { font-size: 22px; font-weight: 680; margin: 0 0 4px; }
  .ap-sub { font-size: 13.5px; color: var(--dim); margin: 0 0 22px; }
  .ap-group { margin-bottom: 26px; }
  .ap-group-h { display: flex; align-items: baseline; gap: 9px; margin: 0 0 9px; }
  .ap-group-t { font-size: 14px; font-weight: 680; }
  .ap-count { font-size: 11.5px; font-weight: 700; background: #fff4ce; color: #7a5200; border-radius: 10px; padding: 2px 8px; }
  .ap-panel { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--card, #fff); }
  .ap-row { display: flex; align-items: flex-start; gap: 14px; padding: 13px 15px; border-top: 1px solid var(--line); }
  .ap-row:first-child { border-top: 0; }
  .ap-main { flex: 1; min-width: 0; }
  .ap-title { font-size: 13.5px; font-weight: 620; }
  .ap-meta { font-size: 12px; color: var(--dim); margin-top: 2px; }
  .ap-age { font-size: 11.5px; color: var(--faint); white-space: nowrap; }
  .ap-acts { display: flex; gap: 6px; flex-shrink: 0; }
  .ap-err { font-size: 12px; color: #a4262c; margin-top: 5px; }
  @media (max-width: 620px) {
    .ap-row { flex-wrap: wrap; }
    .ap-acts { width: 100%; }
    .ap-acts button { flex: 1; }
  }
`;

const money = (n) => `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const dayOf = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

// How long it has been sitting there. The oldest thing waiting is almost always
// the one that matters, so this is shown rather than the raw date.
function waitingFor(iso) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

/* Each source is a small adapter over a suite's OWN api module. Adding a
   fourth approval type later is one entry here, not a new page. */
export const APPROVAL_SOURCES = [
  {
    key: 'leave',
    label: 'Leave requests',
    to: '/suite/leave',
    load: () => L.getAllRequests({ status: 'pending' }),
    title: (r) => `${r.applicant?.name || 'Someone'} · ${r.leave_types?.name || 'Leave'}`,
    meta: (r) => `${dayOf(r.start_date)} to ${dayOf(r.end_date)}${r.reason ? ` · ${r.reason}` : ''}`,
    at: (r) => r.created_at,
    // decide_leave_request takes a decision word, not a boolean.
    approve: (r) => L.decideRequest(r.id, 'approved'),
    decline: (r) => L.decideRequest(r.id, 'rejected'),
  },
  {
    key: 'procurement',
    label: 'Purchase requests',
    to: '/suite/procurement',
    load: async () => (await P.getRequests()).filter((r) => r.status === 'pending'),
    title: (r) => `${r.item || r.description || 'Purchase'}${r.vendor?.name ? ` · ${r.vendor.name}` : ''}`,
    meta: (r) => [r.total != null ? money(r.total) : null, r.requester?.name, r.department].filter(Boolean).join(' · '),
    at: (r) => r.created_at,
    approve: (r) => P.decideRequest(r.id, 'approve'),
    decline: (r) => P.decideRequest(r.id, 'reject'),
  },
  {
    key: 'expenses',
    label: 'Expense claims',
    to: '/suite/finance',
    load: async () => (await F.getExpenses()).filter((r) => r.status === 'pending'),
    title: (r) => `${r.description || 'Expense'}${r.category?.name ? ` · ${r.category.name}` : ''}`,
    meta: (r) => [r.amount != null ? money(r.amount) : null, r.submitted_by?.name || r.staff?.name, dayOf(r.spent_on)].filter(Boolean).join(' · '),
    at: (r) => r.created_at,
    approve: (r) => F.decideExpense(r.id, 'approve'),
    decline: (r) => F.decideExpense(r.id, 'reject'),
  },
];

export default function Approvals() {
  const { flash, toastNode } = useToast();
  const [groups, setGroups] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [rowErr, setRowErr] = useState({});

  const load = useCallback(async () => {
    const settled = await Promise.allSettled(APPROVAL_SOURCES.map((s) => s.load()));
    setGroups(APPROVAL_SOURCES.map((s, i) => ({
      source: s,
      // A rejected source means "you do not have this suite, or may not approve
      // in it". That is a section that does not exist, not an error to shout
      // about — the page is for what you CAN act on.
      items: settled[i].status === 'fulfilled' ? (settled[i].value || []) : [],
      unavailable: settled[i].status === 'rejected',
    })));
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (source, row, kind) => {
    const id = `${source.key}:${row.id}`;
    setBusyId(id);
    setRowErr((e) => ({ ...e, [id]: null }));
    try {
      await (kind === 'approve' ? source.approve(row) : source.decline(row));
      // Drop it from the list rather than refetching everything: the other
      // sources have not changed and re-querying three suites to remove one
      // row is a lot of work to show the same screen.
      setGroups((gs) => gs.map((g) => (g.source.key === source.key
        ? { ...g, items: g.items.filter((x) => x.id !== row.id) }
        : g)));
      flash(kind === 'approve' ? 'Approved.' : 'Declined.');
    } catch (e) {
      setRowErr((er) => ({ ...er, [id]: e.message || 'That did not go through.' }));
    } finally {
      setBusyId(null);
    }
  };

  const total = useMemo(() => (groups || []).reduce((n, g) => n + g.items.length, 0), [groups]);
  const live = (groups || []).filter((g) => g.items.length > 0);

  return (
    <div className="ap-wrap">
      <style>{CSS}</style>
      {toastNode}
      <h1 className="ap-h1">Approvals</h1>
      <p className="ap-sub">
        {groups === null ? 'Checking what is waiting…'
          : total === 0 ? 'Everything that needs a decision from you is done.'
            : `${total} thing${total === 1 ? '' : 's'} waiting on you, oldest first.`}
      </p>

      {groups !== null && total === 0 && (
        <EmptyState
          title="Nothing waiting on you"
          hint="Leave requests, purchase requests and expense claims that need your decision appear here as soon as they are raised."
        />
      )}

      {live.map((g) => {
        // Oldest first: the request that has been sitting longest is the one
        // someone is actually waiting on.
        const items = [...g.items].sort((a, b) => new Date(g.source.at(a) || 0) - new Date(g.source.at(b) || 0));
        return (
          <section className="ap-group" key={g.source.key}>
            <div className="ap-group-h">
              <span className="ap-group-t">{g.source.label}</span>
              <span className="ap-count">{items.length}</span>
              <span style={{ flex: 1 }} />
              <Link to={g.source.to} style={{ fontSize: 12.5 }}>Open suite</Link>
            </div>
            <div className="ap-panel">
              {items.map((row) => {
                const id = `${g.source.key}:${row.id}`;
                return (
                  <div className="ap-row" key={id}>
                    <div className="ap-main">
                      <div className="ap-title">{g.source.title(row)}</div>
                      <div className="ap-meta">{g.source.meta(row)}</div>
                      {rowErr[id] && <div className="ap-err">{rowErr[id]}</div>}
                    </div>
                    <span className="ap-age" title={g.source.at(row) || ''}>{waitingFor(g.source.at(row))}</span>
                    <div className="ap-acts">
                      <button className="btn btn-sm" disabled={busyId === id} onClick={() => act(g.source, row, 'decline')}>Decline</button>
                      <button className="btn btn-sm btn-primary" disabled={busyId === id} onClick={() => act(g.source, row, 'approve')}>
                        {busyId === id ? '…' : 'Approve'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
