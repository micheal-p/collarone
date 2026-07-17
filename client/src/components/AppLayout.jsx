import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiGet, apiPost } from '../api/client.js';
import { SUITE_META } from '../config/suites.js';
import SuiteIcon from './SuiteIcon.jsx';
import logoMark from '../assets/collarone-mark.svg';

const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

function useClickOutside(ref, onOut) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

/**
 * Microsoft-365-Admin-Center-style shell: suite bar + collapsible left rail + content.
 * Pages pass breadcrumb / title / commandBar and render their body as children.
 */
const ADMIN_LINKS = [
  { label: 'Users',       to: '/admin/users' },
  { label: 'Departments', to: '/admin/departments' },
  { label: 'Billing',     to: '/admin/billing' },
  { label: 'Website',     to: '/admin/website' },
];

const GUEST_KEY = 'collarone_guest_mode';
const GUEST_TTL_MS = 60 * 60 * 1000; // guest sessions hard-expire after 1 hour

export default function AppLayout({ breadcrumb = [], title, commandBar, children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [railOpen, setRailOpen] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [waffle, setWaffle] = useState(false);
  const [menu, setMenu] = useState(false);
  const [suites, setSuites] = useState([]);
  const [sbQ, setSbQ] = useState('');
  const [sbUsers, setSbUsers] = useState([]);
  const [guestMode, setGuestMode] = useState(() => {
    // localStorage (matching where the auth session lives) — a guest marker
    // must outlive the tab, or a closed tab leaves you logged into a
    // customer's org with no banner. sessionStorage is read once for
    // markers written by older builds.
    try {
      return JSON.parse(localStorage.getItem(GUEST_KEY) || 'null')
        || JSON.parse(sessionStorage.getItem(GUEST_KEY) || 'null');
    } catch { return null; }
  });
  const waffleRef = useRef(null);
  const menuRef = useRef(null);
  const sbRef = useRef(null);

  useClickOutside(waffleRef, () => setWaffle(false));
  useClickOutside(menuRef, () => setMenu(false));
  useClickOutside(sbRef, () => { setSbQ(''); setSbUsers([]); });

  // A platform admin arriving via "Guest in" lands here with ?guest=1 — pin
  // that to sessionStorage (survives normal navigation within the tab) and
  // scrub it from the visible URL so it isn't sitting in the address bar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('guest') === '1') {
      const info = { orgId: params.get('guestOrgId'), orgName: params.get('guestOrgName') || 'this organization', startedAt: Date.now() };
      localStorage.setItem(GUEST_KEY, JSON.stringify(info));
      setGuestMode(info);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const exitGuestMode = () => {
    localStorage.removeItem(GUEST_KEY);
    sessionStorage.removeItem(GUEST_KEY);
    logout();
  };

  // Hard expiry: a guest session self-terminates after GUEST_TTL_MS even if
  // the platform admin walked away — being logged into a customer's org must
  // never be a persistent state.
  useEffect(() => {
    if (!guestMode?.startedAt) return;
    const remaining = guestMode.startedAt + GUEST_TTL_MS - Date.now();
    if (remaining <= 0) { exitGuestMode(); return; }
    const t = setTimeout(exitGuestMode, remaining);
    return () => clearTimeout(t);
  }, [guestMode]); // eslint-disable-line

  useEffect(() => {
    apiGet('/me/suites').then((d) => setSuites(d.suites)).catch(() => {});
  }, []);

  // Org-wide notices pushed from Platform Admin (e.g. "your payment is still
  // pending"). Shown until someone in the org dismisses them.
  const [notices, setNotices] = useState([]);
  useEffect(() => {
    apiGet('/me/notices').then((d) => setNotices(d.notices || [])).catch(() => {});
  }, []);
  const dismissNotice = async (id) => {
    setNotices((l) => l.filter((n) => n.id !== id));
    try { await apiPost(`/notices/${id}/dismiss`); } catch { /* banner is already gone locally */ }
  };

  const isAdmin = user?.role === 'super_admin';
  const openable = suites.filter((s) => s.openable);

  // Debounced people search (admin only)
  useEffect(() => {
    if (!sbQ.trim() || !isAdmin) { setSbUsers([]); return; }
    const t = setTimeout(() => {
      apiGet('/users').then((d) => {
        const rx = new RegExp(sbQ.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        setSbUsers((d.users || []).filter((u) => rx.test(u.name) || rx.test(u.email)).slice(0, 5));
      }).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [sbQ, isAdmin]);

  const sbSuites = sbQ.trim()
    ? suites.filter((s) => new RegExp(sbQ.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(s.name)).slice(0, 4)
    : [];
  const sbAdmin = isAdmin && sbQ.trim()
    ? ADMIN_LINKS.filter((l) => new RegExp(sbQ.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(l.label))
    : [];
  const sbHasResults = sbUsers.length > 0 || sbSuites.length > 0 || sbAdmin.length > 0;

  const go = (path) => { setDrawer(false); nav(path); };

  return (
    <div className="m365">
      {guestMode && (
        <div style={{
          background: '#7C2D12', color: '#FFE8DA', fontSize: 13, fontWeight: 600,
          padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
            Guest mode — viewing {guestMode.orgName} as its admin, for testing. Nothing here is your own data.
          </span>
          <button onClick={exitGuestMode} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 100, padding: '3px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
            Exit guest mode
          </button>
        </div>
      )}
      {notices.map((n) => (
        <div key={n.id} style={{
          background: '#78350F', color: '#FDF3E0', fontSize: 13, fontWeight: 600,
          padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
            {n.message}
          </span>
          <button onClick={() => dismissNotice(n.id)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 100, padding: '3px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>
            Dismiss
          </button>
        </div>
      ))}
      {/* ---------- Suite bar ---------- */}
      <header className="suitebar">
        <div className="sb-left">
          <button className="iconbtn" aria-label="Toggle navigation"
            onClick={() => {
              // ≤820px the rail is a drawer; above it it collapses in place.
              // Toggling both at once left a stray scrim/drawer state behind
              // whenever the viewport crossed the breakpoint.
              if (window.matchMedia('(max-width: 820px)').matches) setDrawer((v) => !v);
              else setRailOpen((v) => !v);
            }}>
            <Hamburger />
          </button>
          <Link to="/" className="sb-brand">
            <img src={logoMark} alt="Collarone" className="sb-logo" />
            <span className="sb-title">Collar<em style={{ fontStyle: 'italic', color: 'var(--brand)' }}>One</em></span>
          </Link>
          {user?.org?.name && (
            <span className="sb-org" title={`You are working in ${user.org.name}'s workspace`}>{user.org.name}</span>
          )}
        </div>

        <div className="sb-search" ref={sbRef}>
          <SearchIcon />
          <input
            placeholder="Search suites, people and settings"
            aria-label="Search"
            value={sbQ}
            onChange={(e) => setSbQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setSbQ(''), setSbUsers([]))}
          />
          {sbQ && (
            <div className="sb-results">
              {sbSuites.length > 0 && (
                <div className="sb-group">
                  <div className="sb-group-label">Suites</div>
                  {sbSuites.map((s) => (
                    <button key={s.key} className="sb-result" onClick={() => { setSbQ(''); go(`/suite/${s.key}`); }}>
                      <span className="sb-result-icon" style={{ background: SUITE_META[s.key]?.tint || 'var(--brand)' }}>
                        <SuiteIcon name={SUITE_META[s.key]?.icon || 'grid'} size={13} color="#fff" />
                      </span>
                      <span className="sb-result-name">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {sbUsers.length > 0 && (
                <div className="sb-group">
                  <div className="sb-group-label">People</div>
                  {sbUsers.map((u) => (
                    <button key={u.id} className="sb-result" onClick={() => { setSbQ(''); go(`/admin/users?q=${encodeURIComponent(u.name)}`); }}>
                      <span className="avatar sm" style={{ flexShrink: 0 }}>
                        {u.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                      </span>
                      <span className="sb-result-info">
                        <span className="sb-result-name">{u.name}</span>
                        <span className="sb-result-sub">{u.email}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {sbAdmin.length > 0 && (
                <div className="sb-group">
                  <div className="sb-group-label">Administration</div>
                  {sbAdmin.map((l) => (
                    <button key={l.to} className="sb-result" onClick={() => { setSbQ(''); go(l.to); }}>
                      <span className="sb-result-name">{l.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {!sbHasResults && (
                <div className="sb-no-results">No results for "{sbQ}"</div>
              )}
            </div>
          )}
        </div>

        <div className="sb-right">
          <div className="waffle-wrap" ref={waffleRef}>
            <button className="iconbtn" aria-label="Open suites" onClick={() => setWaffle((v) => !v)}>
              <SuiteIcon name="grid" size={20} color="currentColor" />
            </button>
            {waffle && (
              <div className="flyout waffle">
                <div className="flyout-head">Your suites</div>
                <div className="waffle-grid">
                  {openable.length === 0 && <div className="waffle-empty">No suites assigned yet.</div>}
                  {openable.map((s) => (
                    <button key={s.key} className="waffle-item" onClick={() => { setWaffle(false); go(`/suite/${s.key}`); }}>
                      <span className="waffle-icon" style={{ background: SUITE_META[s.key]?.tint || 'var(--brand)' }}>
                        <SuiteIcon name={SUITE_META[s.key]?.icon || 'grid'} size={18} color="#fff" />
                      </span>
                      <span className="waffle-name">{s.name}</span>
                    </button>
                  ))}
                </div>
                <Link to="/" className="flyout-foot" onClick={() => setWaffle(false)}>All suites</Link>
              </div>
            )}
          </div>

          <div className="usermenu-wrap" ref={menuRef}>
            <button className="usermenu-btn" onClick={() => setMenu((v) => !v)}>
              {user?.avatarUrl
                ? <img src={user.avatarUrl} alt="" className="avatar" style={{ objectFit:'cover' }} />
                : <span className="avatar">{initials(user?.name)}</span>}
            </button>
            {menu && (
              <div className="flyout usermenu">
                <div className="usermenu-head">
                  {user?.avatarUrl
                    ? <img src={user.avatarUrl} alt="" className="avatar lg" style={{ objectFit:'cover' }} />
                    : <span className="avatar lg">{initials(user?.name)}</span>}
                  <div>
                    <div className="um-name">{user?.name}</div>
                    <div className="um-mail">{user?.email}</div>
                    <span className={`role-pill role-${user?.role}`}>
                      {user?.role === 'super_admin' ? 'System Admin' : user?.role}
                    </span>
                  </div>
                </div>
                <div className="usermenu-links">
                  <Link to="/profile" onClick={() => setMenu(false)} className="um-link">
                    <ProfileIcon /> My profile
                  </Link>
                  <Link to="/change-password" onClick={() => setMenu(false)} className="um-link">
                    <SuiteIcon name="lock" size={16} color="currentColor" /> Change password
                  </Link>
                  <Link to="/help" onClick={() => setMenu(false)} className="um-link">
                    <SuiteIcon name="grid" size={16} color="currentColor" /> How to use Collarone
                  </Link>
                  <button className="um-link" onClick={() => logout()}>
                    <SignOutIcon /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ---------- Body: rail + content ---------- */}
      <div className="m365-body">
        {drawer && <div className="rail-scrim" onClick={() => setDrawer(false)} />}
        <nav className={`rail ${railOpen ? '' : 'rail-collapsed'} ${drawer ? 'rail-drawer' : ''}`}>
          <RailItem to="/" icon="home" label="Home" end onClick={() => setDrawer(false)} />

          {openable.length > 0 && <div className="rail-group">Suites</div>}
          {openable.map((s) => (
            <RailItem key={s.key} to={`/suite/${s.key}`} suiteKey={s.key} label={s.name} onClick={() => setDrawer(false)} />
          ))}

          {isAdmin && (
            <>
              <div className="rail-divider" />
              <div className="rail-group">Administration</div>
              <RailItem to="/admin/users" icon="people" label="Users" onClick={() => setDrawer(false)} />
              <RailItem to="/admin/departments" icon="building" label="Departments" onClick={() => setDrawer(false)} />
              <RailItem to="/admin/billing" icon="wallet" label="Billing" onClick={() => setDrawer(false)} />
              <RailItem to="/admin/website" icon="globe" label="Website" onClick={() => setDrawer(false)} />
            </>
          )}

          {user?.isPlatformAdmin && (
            <>
              <div className="rail-divider" />
              <div className="rail-group">Platform</div>
              <RailItem to="/platform-admin" icon="shield" label="Platform Admin" onClick={() => setDrawer(false)} />
            </>
          )}
        </nav>

        <main className="content">
          {breadcrumb.length > 0 && (
            <nav className="breadcrumb">
              {breadcrumb.map((b, i) => (
                <span key={i} className="crumb">
                  {b.to ? <Link to={b.to}>{b.label}</Link> : <span>{b.label}</span>}
                  {i < breadcrumb.length - 1 && <ChevronRight />}
                </span>
              ))}
            </nav>
          )}
          {title && <h1 className="page-title">{title}</h1>}
          {commandBar && <div className="commandbar">{commandBar}</div>}
          {children}
        </main>
      </div>
    </div>
  );
}

function RailItem({ to, label, icon, suiteKey, end, onClick }) {
  return (
    <NavLink to={to} end={end} onClick={onClick}
      className={({ isActive }) => `rail-item ${isActive ? 'active' : ''}`}>
      <span className="rail-icon">
        {suiteKey
          ? <SuiteIcon name={SUITE_META[suiteKey]?.icon || 'grid'} size={20} />
          : <SuiteIcon name={icon} size={20} />}
      </span>
      <span className="rail-label">{label}</span>
    </NavLink>
  );
}

/* small inline glyphs kept as SVG (no emoji) */
const Hamburger = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color:'var(--text-3)' }}><path d="M9 6l6 6-6 6" /></svg>
);
const SignOutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" /></svg>
);
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink:0 }}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
);
const ProfileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
);
