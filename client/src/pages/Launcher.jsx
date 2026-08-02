import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiGet } from '../api/client.js';
import { SUITE_META, tierLabel, PINNED_TOOLS } from '../config/suites.js';
import { FOUNDING_ORG_ID } from '../config/org.js';
import AppLayout from '../components/AppLayout.jsx';
import SuiteIcon from '../components/SuiteIcon.jsx';
import ProductTour, { tourSeen } from '../components/ProductTour.jsx';

/* ---- First-run setup checklist --------------------------------------------
   A fresh workspace used to greet its owner with locked tiles and empty
   tables — the weakest moment of the product. This walks the owner through
   the three moves that make the workspace real, detects completion from the
   actual data (not hand-waving), auto-hides at 100%, and can be dismissed.
   Owners only; the founding org never sees it. */
// Step zero of the checklist: describe the business, AI proposes departments
// (with access templates) + any business-specific leave types, the owner
// reviews the proposal and applies it in one click. Endpoint is key-agnostic —
// the panel only renders when the server says AI is switched on.
function AiSetupPanel({ onApplied }) {
  const [enabled, setEnabled] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const call = async (bodyObj) => {
    const { data: { session } } = await (await import('../lib/supabaseClient.js')).supabase.auth.getSession();
    const r = await fetch('/api/onboard-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify(bodyObj),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || 'Something went wrong.');
    return d;
  };

  useEffect(() => { call({ action: 'status' }).then((d) => setEnabled(Boolean(d.enabled)), () => {}); }, []); // eslint-disable-line
  if (!enabled) return null;

  const draft = async () => {
    setBusy(true); setErr('');
    try { setPlan((await call({ action: 'plan', prompt })).plan); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true); setErr('');
    try {
      const d = await call({ action: 'apply', plan });
      setPlan(null); setPrompt('');
      onApplied(d.created);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="setup-ai">
      {!plan ? (
        <>
          <label className="setup-ai-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--brand)" aria-hidden="true"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2zm7 13l.9 3.1L23 19l-3.1.9L19 23l-.9-3.1L15 19l3.1-.9L19 15z" /></svg>
            Describe your business — we&apos;ll set it up
          </label>
          <div className="setup-ai-row">
            <input className="setup-ai-input" value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder={'e.g. "a bakery in Surulere with drivers, bakers and two shops"'}
              onKeyDown={(e) => e.key === 'Enter' && prompt.trim().length >= 8 && draft()} />
            <button className="btn btn-primary" disabled={busy || prompt.trim().length < 8} onClick={draft}>
              {busy ? <span className="spinner" /> : 'Set me up'}
            </button>
          </div>
        </>
      ) : (
        <div>
          <div className="setup-ai-label">{plan.summary || 'Here’s the setup — look it over:'}</div>
          <div className="setup-ai-plan">
            {plan.departments.map((d) => (
              <div key={d.code} className="setup-ai-item">
                <strong>{d.name}</strong>
                <span>{d.template.length ? d.template.map((t) => t.key).join(', ') : 'no suite template'}</span>
              </div>
            ))}
            {plan.leaveTypes.map((t) => (
              <div key={t.key} className="setup-ai-item"><strong>{t.name}</strong><span>{t.defaultDays} days · leave type</span></div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" disabled={busy} onClick={apply}>{busy ? <span className="spinner" /> : 'Create all of this'}</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setPlan(null)}>Change description</button>
          </div>
        </div>
      )}
      {err && <div className="error-text" style={{ marginTop: 8, fontSize: 12.5 }}>{err}</div>}
    </div>
  );
}

function SetupChecklist({ orgId, nav }) {
  const hideKey = `co-setup-hide:${orgId}`;
  const openedKey = `co-setup-opened:${orgId}`;
  const siteKey = `co-setup-site:${orgId}`;
  const [hidden, setHidden] = useState(() => localStorage.getItem(hideKey) === '1');
  const [teamCount, setTeamCount] = useState(null);   // null = loading
  const [tplCount, setTplCount] = useState(null);
  const [openedSuite, setOpenedSuite] = useState(() => localStorage.getItem(openedKey) === '1');
  const [visitedSite, setVisitedSite] = useState(() => localStorage.getItem(siteKey) === '1');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (hidden) return;
    apiGet('/users').then((d) => setTeamCount((d.users || []).length), () => setTeamCount(0));
    apiGet('/departments').then((d) => setTplCount((d.departments || []).filter((x) => (x.access_suites || []).length > 0).length), () => setTplCount(0));
  }, [hidden, reloadTick]); // eslint-disable-line

  if (hidden || teamCount === null || tplCount === null) return null;

  const steps = [
    {
      key: 'team', done: teamCount > 1,
      title: 'Add your team',
      desc: teamCount > 1 ? `${teamCount} people on board` : 'One by one, or import your whole staff list from Excel in a minute.',
      cta: 'Add people', to: '/admin/users',
    },
    {
      key: 'templates', done: tplCount > 0,
      title: 'Give departments their access',
      desc: tplCount > 0 ? `${tplCount} department template${tplCount === 1 ? '' : 's'} set` : 'Set which suites each department gets — imports then grant access automatically.',
      cta: 'Set templates', to: '/admin/departments',
    },
    {
      key: 'open', done: openedSuite,
      title: 'Open your first suite',
      desc: 'Everything is live with your name on it — pick any tile below and look around.',
      cta: 'Show me', to: null, // scrolls to tiles
    },
    {
      key: 'site', done: visitedSite,
      title: 'Set up your website',
      desc: 'A real site is included on your plan — pick a theme and make it yours.',
      cta: 'Open website builder', to: '/admin/website',
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  const go = (s) => {
    if (s.key === 'open') {
      document.querySelector('[data-tour="tiles"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      localStorage.setItem(openedKey, '1'); setOpenedSuite(true);
      return;
    }
    if (s.key === 'site') { localStorage.setItem(siteKey, '1'); setVisitedSite(true); }
    nav(s.to);
  };

  return (
    <div className="setup-card">
      <div className="setup-head">
        <div>
          <h2>Set up your workspace</h2>
          <span className="setup-progress">{doneCount} of {steps.length} done</span>
        </div>
        <button className="setup-hide" onClick={() => { localStorage.setItem(hideKey, '1'); setHidden(true); }}>
          Hide
        </button>
      </div>
      {tplCount === 0 && <AiSetupPanel onApplied={() => setReloadTick((t) => t + 1)} />}
      <div className="setup-steps">
        {steps.map((s) => (
          <div key={s.key} className={`setup-step ${s.done ? 'done' : ''}`}>
            <span className="setup-check" aria-hidden="true">
              {s.done
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
                : null}
            </span>
            <span className="setup-body">
              <span className="setup-title">{s.title}</span>
              <span className="setup-desc">{s.desc}</span>
            </span>
            {!s.done && <button className="btn btn-primary setup-cta" onClick={() => go(s)}>{s.cta}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

// A pinned tool tile. Same visual language as a suite tile, but it is never
// locked and never carries an access badge — every workspace has it, free.
function PinnedTile({ t, onOpen, index, reduce }) {
  return (
    <motion.button
      className="tile"
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={reduce ? {} : { opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.04, ease: [0.2, 0.7, 0.3, 1] }}
      whileHover={reduce ? undefined : { y: -5, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onOpen(t)} title={`Open ${t.name}`}>
      <span className="tile-icon" style={{ background: t.tint || 'var(--brand)' }}>
        <SuiteIcon name={t.icon || 'grid'} size={26} color="#fff" />
      </span>
      <span className="tile-body">
        <span className="tile-name">{t.name}</span>
        <span className="tile-desc">{t.desc}</span>
      </span>
      <span className="tile-foot"><span className="badge badge-core">Included</span></span>
    </motion.button>
  );
}

function SuiteTile({ s, onOpen, index, reduce }) {
  const meta = SUITE_META[s.key] || {};
  // A coming-soon suite reads "Coming soon" for everyone — access hasn't
  // been granted to anyone because there's nothing to grant yet.
  const soon = s.status === 'soon';
  const locked = !soon && !s.granted;
  return (
    <motion.button
      className={`tile ${locked ? 'tile-locked' : ''} ${soon ? 'tile-soon' : ''}`}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={reduce ? {} : { opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.04, ease: [0.2, 0.7, 0.3, 1] }}
      whileHover={s.openable && !reduce ? { y: -5, transition: { duration: 0.2 } } : undefined}
      whileTap={s.openable ? { scale: 0.97 } : undefined}
      onClick={() => s.openable && onOpen(s)} disabled={!s.openable}
      title={locked ? 'You have not been granted access to this suite' : soon ? 'Coming soon' : `Open ${s.name}`}>
      <span className="tile-icon" style={{ background: locked ? 'rgba(10,14,26,0.28)' : meta.tint || 'var(--brand)' }}>
        <SuiteIcon name={locked ? 'lock' : meta.icon || 'grid'} size={26} color="#fff" />
      </span>
      <span className="tile-body">
        <span className="tile-name">{s.name}</span>
        <span className="tile-desc">{s.desc}</span>
      </span>
      <span className="tile-foot">
        {locked && <span className="badge badge-soon">No access</span>}
        {soon && <span className="badge badge-soon">Coming soon</span>}
        {s.openable && s.suiteRole === 'manager' && <span className="badge badge-core">Manager</span>}
        {s.openable && s.suiteRole === 'member' && <span className="badge badge-admin">Member</span>}
      </span>
    </motion.button>
  );
}

export default function Launcher() {
  // First-run product tour (skippable, replayable from Help via /?tour=1)
  const [params] = useSearchParams();
  const [tour, setTour] = useState(false);
  const { user } = useAuth();
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const [suites, setSuites] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiGet('/me/suites')
      .then((d) => { setSuites(d.suites); setIsAdmin(d.isSystemAdmin); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Start the tour on a first visit (or ?tour=1 replay) once tiles exist.
  useEffect(() => {
    if (loading) return;
    if (params.get('tour') === '1' || !tourSeen(user?.id)) {
      const t = setTimeout(() => setTour(true), 600);
      return () => clearTimeout(t);
    }
  }, [loading]); // eslint-disable-line

  const TOUR_STEPS = [
    { title: 'Welcome to Collarone', body: `This is ${user?.org?.name || 'your company'}'s own workspace — every tool your team uses lives behind this one login. This quick tour shows you around; skip it anytime.` },
    { target: '[data-tour="tiles"]', title: 'Your suites', body: 'Each tile is a full suite — open any of them. Locked tiles are suites your admin hasn\'t switched on for you yet.' },
    { target: '[data-tour="search"]', title: 'Search everything', body: 'Find people, suites and admin pages from anywhere — start typing and jump straight there.' },
    { target: '[data-tour="waffle"]', title: 'Switch suites fast', body: 'The grid button hops between suites without going back home.' },
    { target: '[data-tour="account"]', title: 'Your profile', body: 'Your photo, phone, date of birth, home address and emergency contact live here — keep them current, HR uses them.' },
    { target: '[data-tour="org"]', title: 'You\'re in the right place', body: 'This chip always shows whose workspace you\'re in. Your company\'s data is completely isolated from every other company on Collarone.' },
    { title: 'That\'s the basics', body: 'Explore any suite — everything is built to be self-explanatory from here. Replay this tour anytime from the Help page.' },
  ];

  const core = suites.filter((s) => s.tier === 'core');
  const extended = suites.filter((s) => s.tier === 'extended');
  const grantedCount = suites.filter((s) => s.granted).length;

  return (
    <AppLayout breadcrumb={[{ label: 'Home' }]}>
      <motion.div
        className="home-hero"
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={reduce ? {} : { opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.2, 0.7, 0.3, 1] }}
      >
        <p className="hk">{greeting()},</p>
        <h1>{user?.name?.split(' ')[0] || 'there'}</h1>
        <p>
          {isAdmin
            ? 'You have full access as System Administrator. Pick a suite or open the Admin Center.'
            : `You have access to ${grantedCount} suite${grantedCount === 1 ? '' : 's'}. Pick one to get started.`}
        </p>
      </motion.div>

      {err && <div className="error-text">{err}</div>}

      {!loading && isAdmin && user?.org?.id && user.org.id !== FOUNDING_ORG_ID && (
        <SetupChecklist orgId={user.org.id} nav={nav} />
      )}

      {loading ? (
        <div className="tile-grid">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="tile tile-skeleton" />)}</div>
      ) : (
        <>
          <div className="suite-group">
            <div className="group-head"><h2>{tierLabel.core}</h2><span className="group-line" /></div>
            <div className="tile-grid" data-tour="tiles">{core.map((s, i) => <SuiteTile key={s.key} s={s} index={i} reduce={reduce} onOpen={(x) => { localStorage.setItem(`co-setup-opened:${user?.org?.id}`, '1'); nav(`/suite/${x.key}`); }} />)}</div>
          </div>
          <div className="suite-group">
            <div className="group-head"><h2>{tierLabel.extended}</h2><span className="group-line" /></div>
            <div className="tile-grid">{extended.map((s, i) => <SuiteTile key={s.key} s={s} index={core.length + i} reduce={reduce} onOpen={(x) => nav(`/suite/${x.key}`)} />)}</div>
          </div>
          <div className="suite-group">
            <div className="group-head"><h2>Included with every workspace</h2><span className="group-line" /></div>
            <div className="tile-grid">{PINNED_TOOLS.map((t, i) => <PinnedTile key={t.key} t={t} index={i} reduce={reduce} onOpen={(x) => nav(x.path)} />)}</div>
          </div>
        </>
      )}
          {tour && <ProductTour steps={TOUR_STEPS} userId={user?.id} onClose={() => setTour(false)} />}
    </AppLayout>
  );
}
