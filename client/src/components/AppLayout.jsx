import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiGet, apiPost } from '../api/client.js';
import { supabase } from '../lib/supabaseClient.js';
import { SUITE_META, PINNED_TOOLS, FAMILIES, SUITE_FAMILY } from '../config/suites.js';
import SuiteIcon from './SuiteIcon.jsx';
import NotificationBell from './NotificationBell.jsx';
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
  const loc = useLocation();
  // Remembered, like the group state below. Someone who works in the narrow
  // icon rail had it spring back to full width on every page load, which is
  // the kind of small daily friction people stop reporting and start resenting.
  const RAIL_KEY = 'collarone_rail_open';
  const [railOpen, setRailOpen] = useState(() => {
    try { return localStorage.getItem(RAIL_KEY) !== '0'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(RAIL_KEY, railOpen ? '1' : '0'); } catch { /* private mode */ }
  }, [railOpen]);
  const [drawer, setDrawer] = useState(false);
  const [waffle, setWaffle] = useState(false);
  const [menu, setMenu] = useState(false);
  const [suites, setSuites] = useState([]);
  const [sbQ, setSbQ] = useState('');
  const [sbUsers, setSbUsers] = useState([]);
  const [chatUnread, setChatUnread] = useState(0);
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

  // Unread chat total for the topbar badge. Polled rather than streamed: the
  // count only has to be roughly live, and a second realtime channel on every
  // page of the app is a lot of connection for a number. The chat page fires
  // 'collarone:chat-read' when it clears a room so the badge drops immediately
  // instead of lagging a poll behind.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase.rpc('chat_unread_counts');
      if (alive && data) setChatUnread(data.reduce((n, r) => n + Number(r.unread || 0), 0));
    };
    load();
    const t = setInterval(load, 45000);
    window.addEventListener('collarone:chat-read', load);
    return () => { alive = false; clearInterval(t); window.removeEventListener('collarone:chat-read', load); };
  }, []);

  // Exiting no longer logs you out — in the new support model you were never a
  // tenant account, just your own identity carrying a read-only claim. Consume
  // the grant so a token refresh can't re-stamp it, drop the claim by
  // refreshing now, and reboot back to the platform admin as yourself. (The
  // 30-min grant expiry is the backstop if the network call fails.)
  const exitGuestMode = async () => {
    localStorage.removeItem(GUEST_KEY);
    sessionStorage.removeItem(GUEST_KEY);
    try { await apiPost('/platform/end-guest', {}); } catch { /* expiry is the backstop */ }
    try {
      // Same already-used-token race as guest ENTRY: refresh from the stored
      // session, not the possibly stale in-memory one.
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.auth.refreshSession(session ? { refresh_token: session.refresh_token } : undefined);
    } catch { /* claim drops on next refresh; grant re-check revokes reads regardless */ }
    window.location.href = '/platform-admin';
  };

  // Hard expiry: a guest session self-terminates after GUEST_TTL_MS even if
  // the platform admin walked away — being logged into a customer's org must
  // never be a persistent state.
  useEffect(() => {
    if (!guestMode?.startedAt) return;
    // A marker orphaned by an earlier guest session must never terminate a
    // later real login — if this session's org isn't the org the marker
    // points at, the marker is stale: drop it and leave the session alone.
    if (!guestMode.orgId || (user?.org?.id && guestMode.orgId !== user.org.id)) {
      // No orgId = a legacy/orphaned marker that can't be matched to this
      // session — it must never be allowed to kill a real login.
      try { localStorage.removeItem(GUEST_KEY); sessionStorage.removeItem(GUEST_KEY); } catch { /* no storage */ }
      setGuestMode(null);
      return;
    }
    const remaining = guestMode.startedAt + GUEST_TTL_MS - Date.now();
    if (remaining <= 0) { exitGuestMode(); return; }
    const t = setTimeout(exitGuestMode, remaining);
    return () => clearTimeout(t);
  }, [guestMode, user]); // eslint-disable-line

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

  // What the owner could still add, plus the two numbers they check often.
  // `granted` is false for anything outside the plan, so the gap between the
  // live catalogue and what they hold IS the upsell — no separate price list
  // to drift out of sync.
  const [upsell, setUpsell] = useState({ locked: 0, credits: null, staff: null });
  useEffect(() => {
    if (!isAdmin || !suites.length) return;
    const locked = suites.filter((s) => s.status === 'live' && !s.granted).length;
    setUpsell((u) => ({ ...u, locked }));
    // Both are nice-to-have: a failure here must never disturb the sidebar.
    apiGet('/billing/balance').then((d) => setUpsell((u) => ({ ...u, credits: d.balance ?? 0 })), () => {});
    apiGet('/users').then(
      (d) => setUpsell((u) => ({ ...u, staff: (d.users || []).filter((x) => x.status === 'active').length })),
      () => {},
    );
  }, [isAdmin, suites]);

  // Suites arranged into the same families the signup cart uses, in the same
  // order. Only families the org actually holds are rendered.
  const suiteGroups = useMemo(() => FAMILIES
    .map((family) => ({ family, items: openable.filter((s) => SUITE_FAMILY[s.key] === family.key) }))
    .filter((g) => g.items.length > 0), [openable]);

  // Which families the person has collapsed. Remembered, because someone who
  // only ever opens Payroll should not re-collapse four groups every morning.
  const FAM_KEY = user?.id ? `collarone_rail_fams_${user.id}` : null;
  const [collapsedFams, setCollapsedFams] = useState(() => {
    try {
      const raw = FAM_KEY ? localStorage.getItem(FAM_KEY) : null;
      if (raw) return JSON.parse(raw);
    } catch { /* private mode */ }
    // CLOSED by default. The rail should read as a short menu of five choices,
    // not fifteen links you have to scan past. You open the one you want.
    return Object.fromEntries(FAMILIES.map((f) => [f.key, true]));
  });
  const toggleFam = (key) => setCollapsedFams((c) => {
    const next = { ...c, [key]: !c[key] };
    try { if (FAM_KEY) localStorage.setItem(FAM_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });
  // A collapsed group must never hide the page you are looking at. This opening
  // is deliberately NOT persisted: leaving the suite lets the group close again,
  // so the rail returns to its five-line resting state instead of slowly
  // accumulating every group you have ever visited.
  const activeSuite = loc.pathname.startsWith('/suite/') ? loc.pathname.split('/')[2] : null;
  useEffect(() => {
    const fam = activeSuite && SUITE_FAMILY[activeSuite];
    if (fam) setCollapsedFams((c) => (c[fam] ? { ...c, [fam]: false } : c));
  }, [activeSuite]);

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
            Guest mode, viewing {guestMode.orgName} as its admin, for testing. Nothing here is your own data.
          </span>
          <button onClick={exitGuestMode} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 100, padding: '3px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
            Exit guest mode
          </button>
        </div>
      )}
      {(user?.org?.status === 'past_due' || user?.org?.status === 'read_only') && (
        <div style={{
          background: user.org.status === 'read_only' ? '#7F1D1D' : '#78350F', color: '#FFF3E8', fontSize: 13, fontWeight: 600,
          padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16h.01" /></svg>
            {user.org.status === 'read_only'
              ? 'Your subscription is overdue and your workspace is now read-only. Renew to make changes again.'
              : `Your subscription renewal is due${user.org.graceUntil ? `, you have until ${new Date(user.org.graceUntil).toLocaleDateString('en-NG', { day: 'numeric', month: 'long' })} before your workspace becomes read-only` : ''}.`}
          </span>
          <a href="/admin/billing" style={{ background: '#fff', color: '#7F1D1D', borderRadius: 100, padding: '4px 14px', fontSize: 12, fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>Renew now</a>
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
            <span className="sb-org" data-tour="org" title={`You are working in ${user.org.name}'s workspace`}>{user.org.name}</span>
          )}
        </div>

        <div className="sb-search" ref={sbRef} data-tour="search">
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
          {/* Labelled on purpose: as a bare glyph this was the least
              discoverable thing in the product, nobody knew chat existed. */}
          <button className="iconbtn iconbtn-labelled" aria-label={chatUnread ? `Team chat, ${chatUnread} unread` : 'Team chat'} title="Team chat" onClick={() => go('/chat')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.9 8.9 0 0 1-4-.9L3 20l1-4.5A8.4 8.4 0 0 1 12.5 3a8.4 8.4 0 0 1 8.5 8.5Z" /></svg>
            <span className="iconbtn-label">Chat</span>
            {chatUnread > 0 && <span className="iconbtn-badge">{chatUnread > 99 ? '99+' : chatUnread}</span>}
          </button>
          <NotificationBell />
          <div className="waffle-wrap" ref={waffleRef}>
            <button className="iconbtn" aria-label="Open suites" data-tour="waffle" onClick={() => setWaffle((v) => !v)}>
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
                  {PINNED_TOOLS.map((t) => (
                    <button key={t.key} className="waffle-item" onClick={() => { setWaffle(false); go(t.path); }}>
                      <span className="waffle-icon" style={{ background: t.tint || 'var(--brand)' }}>
                        <SuiteIcon name={t.icon || 'grid'} size={18} color="#fff" />
                      </span>
                      <span className="waffle-name">{t.name}</span>
                    </button>
                  ))}
                </div>
                <Link to="/" className="flyout-foot" onClick={() => setWaffle(false)}>All suites</Link>
              </div>
            )}
          </div>

          <div className="usermenu-wrap" ref={menuRef}>
            <button className="usermenu-btn" data-tour="account" onClick={() => setMenu((v) => !v)}>
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
                  <Link to="/support" onClick={() => setMenu(false)} className="um-link">
                    <SuiteIcon name="chat" size={16} color="currentColor" /> Contact support
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

          {/* Grouped by what the work IS, not alphabetically: a fifteen-item
              flat list makes someone read every label to find Payroll. The
              families already existed in config/suites.js (they drive the
              signup cart) and are ordered most-used first — People, Sales &
              money, Stock & buying, Work, Front desk — so the sidebar now uses
              the same vocabulary the customer met when they signed up.
              Collapsed rail stays flat: there is no room for headings, and
              icons are the whole point of that mode. */}
          {openable.length > 0 && !railOpen && openable.map((s) => (
            <RailItem key={s.key} to={`/suite/${s.key}`} suiteKey={s.key} label={s.name} onClick={() => setDrawer(false)} />
          ))}
          {openable.length > 0 && railOpen && suiteGroups.map(({ family, items }) => (
            <div key={family.key} className="rail-fam">
              <button
                type="button"
                className={`rail-group rail-fam-head${collapsedFams[family.key] ? ' is-closed' : ''}`}
                aria-expanded={!collapsedFams[family.key]}
                onClick={() => toggleFam(family.key)}
              >
                <span>{family.shortLabel}</span>
                <svg className="rail-fam-chev" width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {!collapsedFams[family.key] && items.map((s) => (
                <RailItem key={s.key} to={`/suite/${s.key}`} suiteKey={s.key} label={s.name} onClick={() => setDrawer(false)} />
              ))}
            </div>
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

          {/* Suites you have not bought are hidden entirely, which is right for
              day-to-day use but leaves no way to discover the rest of the
              product. This is that path — plus the two numbers an owner checks
              often enough to deserve a permanent home: seat credits and how
              many staff they have. Owners only; staff cannot buy anything and
              should not be nudged to. */}
          {railOpen && isAdmin && <RailFooter upsell={upsell} onGo={() => setDrawer(false)} />}
        </nav>

        <main className="content">
          <div className="content-frame">
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
          </div>
        </main>
      </div>
    </div>
  );
}

// Sidebar footer: the upgrade path, and the two numbers an owner watches.
function RailFooter({ upsell, onGo }) {
  const { locked, credits, staff } = upsell;
  const allIn = locked === 0;
  return (
    <div className="rail-foot">
      <Link to="/admin/billing" className={`rail-foot-card${allIn ? ' is-complete' : ''}`} onClick={onGo}>
        {allIn ? (
          <>
            <div className="rail-foot-title">All caught up</div>
            <div className="rail-foot-sub">Every suite is switched on for your business.</div>
          </>
        ) : (
          <>
            <div className="rail-foot-title">Add more to your workspace</div>
            <div className="rail-foot-sub">
              {locked} more {locked === 1 ? 'suite' : 'suites'} you can switch on.
            </div>
          </>
        )}
      </Link>
      <div className="rail-foot-stats">
        {/* Rendered only once loaded: a flashing 0 on a credit balance is
            alarming in a way a brief blank space is not. */}
        {credits !== null && (
          <span className="rail-foot-stat" title="Seat credits — one is used each time you create a staff account">
            <strong>{credits}</strong> {credits === 1 ? 'credit' : 'credits'}
          </span>
        )}
        {staff !== null && (
          <span className="rail-foot-stat" title="Active staff accounts">
            <strong>{staff}</strong> {staff === 1 ? 'person' : 'people'}
          </span>
        )}
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
