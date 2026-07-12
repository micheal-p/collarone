import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiGet } from '../api/client.js';
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
  const waffleRef = useRef(null);
  const menuRef = useRef(null);
  const sbRef = useRef(null);

  useClickOutside(waffleRef, () => setWaffle(false));
  useClickOutside(menuRef, () => setMenu(false));
  useClickOutside(sbRef, () => { setSbQ(''); setSbUsers([]); });

  useEffect(() => {
    apiGet('/me/suites').then((d) => setSuites(d.suites)).catch(() => {});
  }, []);

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
      {/* ---------- Suite bar ---------- */}
      <header className="suitebar">
        <div className="sb-left">
          <button className="iconbtn" aria-label="Toggle navigation"
            onClick={() => { setRailOpen((v) => !v); setDrawer((v) => !v); }}>
            <Hamburger />
          </button>
          <Link to="/" className="sb-brand">
            <img src={logoMark} alt="Collarone" className="sb-logo" />
            <span className="sb-title">Collar<em style={{ fontStyle: 'italic', color: 'var(--brand)' }}>One</em></span>
          </Link>
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
              <SuiteIcon name="grid" size={20} color="#605e5c" />
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
                    <SuiteIcon name="lock" size={16} color="#605e5c" /> Change password
                  </Link>
                  <Link to="/help" onClick={() => setMenu(false)} className="um-link">
                    <SuiteIcon name="grid" size={16} color="#605e5c" /> How to use Collarone
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
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#605e5c" strokeWidth="1.8" strokeLinecap="round">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a8886" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
);
const SignOutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#605e5c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" /></svg>
);
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8a8886" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink:0 }}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
);
const ProfileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#605e5c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
);
