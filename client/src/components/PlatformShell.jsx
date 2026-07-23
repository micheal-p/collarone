import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import '../styles/platform.css';

const TABS = [
  { to: '/platform-admin', label: 'Overview' },
  { to: '/platform-admin/analytics', label: 'Analytics' },
];

const Mark = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 200 200" style={{ color: '#16191F' }}>
    <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.18" />
    <circle cx="100" cy="100" r="74" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.32" />
    <path d="M 100 30 L 60 70 L 60 130 L 100 170 L 100 150 L 78 128 L 78 72 L 100 50 Z" fill="currentColor" />
    <path d="M 100 30 L 140 70 L 140 130 L 100 170 L 100 150 L 122 128 L 122 72 L 100 50 Z" fill="currentColor" opacity="0.55" />
    <circle cx="100" cy="100" r="9" fill="#FF5B1F" />
  </svg>
);

// An ops room runs on one clock. Lagos time, ticking, monospace.
function LagosClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(now);
  return <div className="pc-clock"><span>LAGOS</span>{time}</div>;
}

// Deliberately its own chrome, not AppLayout: this is a control plane over
// every tenant, not a page inside one — it never wears any organization's
// theme, and it should read as an instrument, not a product page.
export default function PlatformShell({ children }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="pc">
      <header className="pc-head">
        <div className="pc-head-row">
          <div className="pc-wm">
            <Mark />
            <span className="pc-wm-name">Collar<em>One</em></span>
            <span className="pc-wm-tag">PLATFORM CONTROL</span>
          </div>
          <nav className="pc-tabs">
            {TABS.map((t) => (
              <Link key={t.to} to={t.to} className={`pc-tab${pathname === t.to ? ' active' : ''}`}>{t.label}</Link>
            ))}
          </nav>
          <div className="pc-head-right">
            <LagosClock />
            <span className="pc-user">{user?.name}</span>
            <button className="pc-btn sm" onClick={async () => { await logout(); window.location.replace('/'); }}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="pc-main">{children}</main>
    </div>
  );
}
