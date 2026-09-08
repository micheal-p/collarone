// Platform Control's front page. The first screen answers three questions
// without a click: how is the business doing (visitors, customers, money),
// where are the visitors, and what is waiting on me. Anything that needs an
// action links to the section where the action lives, so this page never
// duplicates the confirm/refund/reply logic that belongs there.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import PlatformShell, { usePlatformCounts } from '../components/PlatformShell.jsx';
import { AreaChart, BarRows, DAY_MS, DeltaText, Kpi, Sparkline, countryName, deltaTone, fillDaily, fmtInt, naira } from './platform/charts.jsx';

const lagosHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: 'numeric', hour12: false }).format(new Date()));
const lagosDate = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

export default function PlatformOverview() {
  const { user } = useAuth();
  const { counts } = usePlatformCounts();
  const [summary, setSummary] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [adminIds, setAdminIds] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiGet('/platform/analytics-summary?days=30'), apiGet('/platform/organizations'), apiGet('/platform/profiles'),
      apiGet('/platform/transactions'), apiGet('/platform/admin-ids'),
    ])
      .then(([s, o, p, t, ai]) => { setSummary(s.summary); setOrgs(o.organizations || []); setProfiles(p.profiles || []); setTransactions(t.transactions || []); setAdminIds(ai.adminIds || []); })
      .catch((e) => setError(e.message));
  }, []);

  const daily = useMemo(() => fillDaily(summary?.daily, 30), [summary]);
  const customers = useMemo(() => profiles.filter((p) => !adminIds.includes(p.id)), [profiles, adminIds]);
  const active7d = useMemo(() => { const c = Date.now() - 7 * DAY_MS; return customers.filter((p) => p.last_login_at && new Date(p.last_login_at).getTime() > c).length; }, [customers]);
  const newOrgs30d = useMemo(() => { const c = Date.now() - 30 * DAY_MS; return orgs.filter((o) => new Date(o.created_at).getTime() > c).length; }, [orgs]);
  const collected = useMemo(() => transactions.filter((t) => t.status === 'confirmed').reduce((s, t) => s + Number(t.amount_kobo || 0), 0), [transactions]);
  const pending = useMemo(() => transactions.filter((t) => t.status === 'pending'), [transactions]);
  const pendingKobo = pending.reduce((s, t) => s + Number(t.amount_kobo || 0), 0);
  const countries = useMemo(() => (summary?.countries || []).slice(0, 6).map((c) => ({ key: c.code, code: c.code, label: countryName(c.code), value: c.views })), [summary]);

  const hour = lagosHour();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.name || '').split(' ')[0] || 'there';
  const totals = summary?.totals || {};

  const queue = [
    { n: pending.length, to: '/platform-admin/revenue', what: pending.length === 1 ? 'payment awaiting confirmation' : 'payments awaiting confirmation', aside: pending.length ? naira(pendingKobo) : '' },
    { n: Number(counts.inbox_new || 0), to: '/platform-admin/inbox', what: Number(counts.inbox_new) === 1 ? 'new message in the inbox' : 'new messages in the inbox' },
    { n: Number(counts.tickets_open || 0), to: '/platform-admin/support', what: Number(counts.tickets_open) === 1 ? 'support ticket needs a reply' : 'support tickets need a reply' },
    { n: Number(counts.posters_pending || 0), to: '/platform-admin/jobs', what: Number(counts.posters_pending) === 1 ? 'job poster awaiting approval' : 'job posters awaiting approval' },
    { n: Number(counts.errors_open || 0), to: '/platform-admin/inbox', what: Number(counts.errors_open) === 1 ? 'app error this week, unresolved' : 'app errors this week, unresolved' },
  ].filter((q) => q.n > 0);

  return (
    <PlatformShell title={`${greeting}, ${firstName}`} subtitle={lagosDate()}>
      {error && <p className="pc-note" style={{ color: 'var(--err)' }}>{error}</p>}

      <div className="pc-kpis">
        <Kpi
          label="Page views, 30 days"
          value={summary ? fmtInt(totals.window) : '…'}
          sub={summary ? <DeltaText now={totals.window} prev={totals.prev} what="previous 30" /> : ' '}
          tone={summary ? deltaTone(totals.window, totals.prev) : undefined}
          spark={<Sparkline points={daily} />}
        />
        <Kpi label="Organizations" value={fmtInt(orgs.length)} sub={newOrgs30d > 0 ? `${newOrgs30d} new in 30 days` : 'none new in 30 days'} tone={newOrgs30d > 0 ? 'up' : undefined} />
        <Kpi label="Revenue collected" value={naira(collected)} sub={pending.length ? `${naira(pendingKobo)} pending` : 'nothing pending'} />
        <Kpi label="Active people, 7 days" value={fmtInt(active7d)} sub={`of ${fmtInt(customers.length)} signed up`} />
      </div>

      <div className="pc-grid-2" style={{ marginBottom: 14 }}>
        <div className="pc-card">
          <h2 className="pc-card-title">Visitors, last 30 days</h2>
          <p className="pc-card-sub">Page loads per day across collarone.app. Anonymous, no cookies.</p>
          {summary ? <AreaChart points={daily} /> : <div className="pc-empty">Loading…</div>}
        </div>
        <div className="pc-card">
          <h2 className="pc-card-title">Where they are</h2>
          <p className="pc-card-sub">By country, 30 days{totals.unknown_country > 0 ? `, ${fmtInt(totals.unknown_country)} unknown` : ''}</p>
          {summary ? <BarRows rows={countries} total={totals.window} empty="No country data yet." /> : <div className="pc-empty">Loading…</div>}
          <p className="pc-sec-note" style={{ marginTop: 14 }}><Link to="/platform-admin/analytics" style={{ color: 'var(--accent-ink)', fontWeight: 500 }}>Full analytics →</Link></p>
        </div>
      </div>

      <section className="pc-section">
        <div className="pc-sec-head"><h2 className="pc-sec-title">Needs you</h2><span className="pc-sec-count">{queue.length === 0 ? 'nothing' : queue.length}</span></div>
        {queue.length === 0 ? (
          <div className="pc-queue-item clear">Nothing is waiting on you. Payments confirmed, inbox read, tickets answered.</div>
        ) : (
          <div className="pc-queue">
            {queue.map((q) => (
              <Link key={q.what} to={q.to} className="pc-queue-item">
                <div><b>{fmtInt(q.n)}</b> {q.what}</div>
                {q.aside && <span className="pc-mono">{q.aside}</span>}
              </Link>
            ))}
          </div>
        )}
      </section>
    </PlatformShell>
  );
}
