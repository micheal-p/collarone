// Platform Control's chrome: the same ink rail the customer workspace wears,
// over a paper canvas. Deliberately not AppLayout — this is a control plane
// over every tenant, not a page inside one, so it never takes an
// organization's theme — but it should look like the product it runs, and
// until September 2026 it did not (a cream page with a dark header bolted on
// by a later "refresh", two design layers fighting).
//
// One URL per section. The rail links are real links, so a refresh or a
// shared link lands on the section, and the counts on the rail come from one
// RPC (platform_counts) rather than six list fetches on every page.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiGet } from '../api/client.js';
import '../styles/platform.css';

const CountsContext = createContext({ counts: {}, refreshCounts: () => {} });
export const usePlatformCounts = () => useContext(CountsContext);

const I = {
  overview: <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />,
  analytics: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  organizations: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 11h.01M15 11h.01M9 14h.01M15 14h.01" />,
  revenue: <path d="M2 7h20v12H2zM2 11h20M6 15h3" />,
  support: <path d="M21 12a9 9 0 1 1-4-7.5L21 3v9zM12 17h.01M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7" />,
  inbox: <path d="M3 13l2.5-8h13L21 13v6H3zM3 13h5l1.5 3h5L16 13h5" />,
  jobs: <path d="M3 8h18v12H3zM8 8V5h8v3M3 13h18" />,
  themes: <path d="M3 4h18v16H3zM3 9h18M9 9v11" />,
  audit: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4" />,
};
const Icon = ({ name }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[name]}</svg>
);

// Rail structure: two top-level pages, then what the operator works, then
// what keeps the platform running. Counts are what is WAITING, so a zero hides.
const NAV = [
  { group: null, items: [
    { to: '/platform-admin', icon: 'overview', label: 'Overview' },
    { to: '/platform-admin/analytics', icon: 'analytics', label: 'Analytics' },
  ] },
  { group: 'Customers', items: [
    { to: '/platform-admin/organizations', icon: 'organizations', label: 'Organizations', count: 'organizations', quiet: true },
    { to: '/platform-admin/revenue', icon: 'revenue', label: 'Revenue', count: 'pending_payments' },
    { to: '/platform-admin/support', icon: 'support', label: 'Support', count: 'tickets_open' },
  ] },
  { group: 'Operations', items: [
    { to: '/platform-admin/inbox', icon: 'inbox', label: 'Inbox', count: 'inbox_new' },
    { to: '/platform-admin/jobs', icon: 'jobs', label: 'Jobs', count: 'posters_pending' },
    { to: '/platform-admin/themes', icon: 'themes', label: 'Website themes' },
    { to: '/platform-admin/audit', icon: 'audit', label: 'Audit log' },
  ] },
];

const Mark = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 200 200" style={{ color: '#fff', flex: 'none' }} aria-hidden="true">
    <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.18" />
    <circle cx="100" cy="100" r="74" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.32" />
    <path d="M 100 30 L 60 70 L 60 130 L 100 170 L 100 150 L 78 128 L 78 72 L 100 50 Z" fill="currentColor" />
    <path d="M 100 30 L 140 70 L 140 130 L 100 170 L 100 150 L 122 128 L 122 72 L 100 50 Z" fill="currentColor" opacity="0.55" />
    <circle cx="100" cy="100" r="9" fill="#FF5B1F" />
  </svg>
);

const Brand = () => (
  <div className="pc-brand">
    <Mark />
    <div>
      <div className="pc-brand-name">Collar<em>One</em></div>
      <div className="pc-brand-tag">PLATFORM CONTROL</div>
    </div>
  </div>
);

// An ops room runs on one clock. Lagos time, ticking.
function LagosClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
  return <div className="pc-clock"><span>LAGOS</span>{time}</div>;
}

function RailStatus() {
  const [live, setLive] = useState(null);
  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then(setLive).catch(() => setLive({ status: 'unknown' }));
  }, []);
  const state = live?.status || 'checking';
  const color = { operational: '#3DBE6B', degraded: '#E8B23F', down: '#F26A5E' }[state] || 'rgba(255,255,255,0.3)';
  const label = { operational: 'All systems operational', degraded: 'Degraded', down: 'Service disruption', checking: 'Checking…', unknown: 'Health unreachable' }[state];
  return (
    <a className="pc-rail-status" href="/status" target="_blank" rel="noreferrer" title="Public status page">
      <span className="pc-dot" style={{ background: color }} />
      <span>{label}</span>
    </a>
  );
}

export default function PlatformShell({ title, subtitle, actions, children }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [counts, setCounts] = useState({});

  const refreshCounts = useCallback(() => {
    apiGet('/platform/counts').then((d) => setCounts(d.counts || {})).catch(() => {});
  }, []);
  useEffect(refreshCounts, [refreshCounts, pathname]);
  useEffect(() => { setDrawer(false); }, [pathname]);

  const isActive = (to) => (to === '/platform-admin' ? pathname === to : pathname.startsWith(to));

  const rail = (
    <nav className={`pc-rail${drawer ? ' open' : ''}`} aria-label="Platform Control">
      <Brand />
      <div className="pc-nav">
        {NAV.map((g, gi) => (
          <div key={gi} className="pc-nav">
            {g.group && <div className="pc-nav-group">{g.group}</div>}
            {g.items.map((it) => {
              const n = it.count ? Number(counts[it.count] || 0) : 0;
              return (
                <Link key={it.to} to={it.to} className={`pc-nav-item${isActive(it.to) ? ' active' : ''}`} aria-current={isActive(it.to) ? 'page' : undefined}>
                  <Icon name={it.icon} />
                  {it.label}
                  {n > 0 && <span className={`pc-nav-count${it.quiet ? ' quiet' : ''}`}>{n}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="pc-rail-foot">
        <LagosClock />
        <RailStatus />
        <div className="pc-rail-user">
          <span title={user?.email}>{user?.name || user?.email}</span>
          <button className="pc-btn sm" onClick={async () => { await logout(); window.location.replace('/'); }}>Sign out</button>
        </div>
      </div>
    </nav>
  );

  return (
    <CountsContext.Provider value={{ counts, refreshCounts }}>
      <div className="pc">
        <header className="pc-topbar">
          <button className="pc-topbar-menu" onClick={() => setDrawer((v) => !v)} aria-label="Open navigation" aria-expanded={drawer}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <Brand />
          {title && <span className="pc-topbar-title">{title}</span>}
        </header>
        {drawer && <div className="pc-rail-scrim" onClick={() => setDrawer(false)} />}
        {rail}
        <div className="pc-body">
          <main className="pc-main">
            {(title || actions) && (
              <div className="pc-page-head">
                <div>
                  {title && <h1 className="pc-page-title">{title}</h1>}
                  {subtitle && <p className="pc-page-sub">{subtitle}</p>}
                </div>
                {actions && <div className="pc-page-actions">{actions}</div>}
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </CountsContext.Provider>
  );
}
