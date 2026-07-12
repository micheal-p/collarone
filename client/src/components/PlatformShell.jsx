import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const TABS = [
  { to: '/platform-admin', label: 'Overview' },
  { to: '/platform-admin/analytics', label: 'Analytics' },
];

const Mark = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 200 200" style={{ color: '#F4F1EA' }}>
    <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
    <circle cx="100" cy="100" r="74" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4" />
    <path d="M 100 30 L 60 70 L 60 130 L 100 170 L 100 150 L 78 128 L 78 72 L 100 50 Z" fill="currentColor" />
    <path d="M 100 30 L 140 70 L 140 130 L 100 170 L 100 150 L 122 128 L 122 72 L 100 50 Z" fill="currentColor" opacity="0.55" />
    <circle cx="100" cy="100" r="9" fill="#FF5B1F" />
  </svg>
);

// Deliberately its own chrome, not AppLayout: this is a control plane over
// every tenant, not a page inside one — it should never look like it's
// wearing any single organization's theme colour, and it should be
// unmistakably not the same surface an org's own admin sees.
export default function PlatformShell({ title, children }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  return (
    <div style={{
      minHeight: '100%', color: '#F4F1EA',
      background: 'radial-gradient(1100px 480px at 15% -10%, rgba(255,91,31,0.10), transparent 60%), radial-gradient(900px 500px at 100% 10%, rgba(59,130,246,0.06), transparent 60%), #0A0E1A',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 28px', borderBottom: '1px solid rgba(244,241,234,0.12)',
        background: 'rgba(20,17,15,0.6)', position: 'sticky', top: 0, backdropFilter: 'blur(10px)', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Mark size={22} />
          <div>
            <div style={{ fontFamily: 'Georgia, "Iowan Old Style", serif', fontSize: 16 }}>
              Collar<em style={{ fontStyle: 'italic', color: '#FF5B1F' }}>One</em>
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5B1F', marginTop: 1 }}>
              Platform Control
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ fontSize: 13, color: 'rgba(244,241,234,0.85)' }}>{user?.name}</span>
          <button
            onClick={() => logout()}
            style={{ fontSize: 12.5, color: 'rgba(244,241,234,0.6)', background: 'transparent', border: '1px solid rgba(244,241,234,0.18)', borderRadius: 100, padding: '6px 14px', cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav style={{ display: 'flex', gap: 4, maxWidth: 1080, margin: '0 auto', padding: '14px 28px 0' }}>
        {TABS.map((t) => {
          const active = pathname === t.to;
          return (
            <Link key={t.to} to={t.to} style={{
              fontSize: 13, fontWeight: 600, padding: '9px 16px',
              color: active ? '#F4F1EA' : 'rgba(244,241,234,0.5)',
              background: active ? 'rgba(244,241,234,0.06)' : 'transparent',
              borderRadius: '8px 8px 0 0', textDecoration: 'none',
              borderBottom: active ? '2px solid #FF5B1F' : '2px solid transparent',
            }}>
              {t.label}
            </Link>
          );
        })}
      </nav>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '36px 28px 80px' }}>
        {title && <h1 style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-.01em', margin: '0 0 24px', color: '#F4F1EA' }}>{title}</h1>}
        {children}
      </main>
    </div>
  );
}
