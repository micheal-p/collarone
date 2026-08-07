import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PublicThemeGallery from '../components/PublicThemeGallery.jsx';
import CardCarousel from '../components/CardCarousel.jsx';
import { motion, animate, AnimatePresence, useReducedMotion, useScroll, useTransform, useMotionValue, useSpring, useMotionValueEvent } from 'framer-motion';
import { FAQS } from '../config/faqs.js';
import { SUITES, SUITE_META, requiresOf, requiredFoundations, FAMILIES, SUITE_FAMILY, PRESETS } from '../config/suites.js';
import SuiteIcon from '../components/SuiteIcon.jsx';
import { supabase } from '../lib/supabaseClient.js';
import ChatWidget from './ChatWidget.jsx';
import { PLANS, PRICING, usePricing, naira } from '../lib/pricing.js';
import './Landing.css';

const Mark = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 200 200" style={{ color: 'var(--text)' }}>
    <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.18" />
    <circle cx="100" cy="100" r="74" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.32" />
    <path d="M 100 30 L 60 70 L 60 130 L 100 170 L 100 150 L 78 128 L 78 72 L 100 50 Z" fill="currentColor" />
    <path d="M 100 30 L 140 70 L 140 130 L 100 170 L 100 150 L 122 128 L 122 72 L 100 50 Z" fill="currentColor" opacity="0.55" />
    <circle cx="100" cy="100" r="9" fill="#FF5B1F" />
  </svg>
);

const I = {
  shield: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>,
  bolt: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>,
  money: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 6v12M18 6v12" /></svg>,
  globeBig: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>,
  pin: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>,
  chev: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  expand: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" /></svg>,
  close: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>,
  menu: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  arrowLeft: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4L7 12l8 8" /></svg>,
  arrowRight: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4l8 8-8 8" /></svg>,
  check: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l5 5L19 7" /></svg>,
};

function Reveal({ children, delay = 0, className, hover = false }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      // Pre-trigger ~a card BEFORE the element enters (positive bottom margin
      // extends the observed area downward) — the old '-60px' made sections
      // animate only once well inside the viewport, so continuous scrolling
      // showed whole bands of blank page (audit finding 2).
      viewport={{ once: true, margin: '0px 0px 240px 0px' }}
      transition={{ duration: 0.45, delay, ease: [0.2, 0.7, 0.3, 1] }}
      {...(hover ? {
        whileHover: { y: -8, transition: { duration: 0.25, ease: [0.2, 0.7, 0.3, 1] } },
        whileTap: { scale: 0.98 },
      } : {})}
    >
      {children}
    </motion.div>
  );
}

// Numbers that count up from 0 the first time they scroll into view.
function CountUp({ to, suffix = '' }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  return (
    <motion.span
      ref={ref}
      viewport={{ once: true, margin: '-40px' }}
      onViewportEnter={() => {
        if (!ref.current) return;
        if (reduce) { ref.current.textContent = `${to}${suffix}`; return; }
        animate(0, to, {
          duration: 1.6, ease: [0.2, 0.7, 0.3, 1],
          onUpdate: (v) => { if (ref.current) ref.current.textContent = `${Math.round(v)}${suffix}`; },
        });
      }}
    >
      0{suffix}
    </motion.span>
  );
}

function Marquee({ items, dark }) {
  return (
    <div className={`cl-marquee${dark ? ' cl-marquee-dark' : ''}`}>
      <div className="cl-marquee-track">
        {[...items, ...items].map((t, i) => (
          <span className="cl-marquee-item" key={i}>{t}<span className="cl-marquee-dot">•</span></span>
        ))}
      </div>
    </div>
  );
}

const marqueeItems = ['Staff files', 'Leave & time off', 'Task tracking', 'Visitor sign-in', 'Recruiting & careers', 'Onboarding', 'Performance reviews', 'Compliance calendar', 'Payroll: PAYE · Pension · NHF', 'Customers (CRM)', 'Website builder', 'Invoicing & receipts', 'Automation'];

// pricing comes from the single shared model — do not restate numbers here
const priceTiers = () => PLANS.map((t) => ({ key: t.key, name: t.name, baseFee: t.baseFee, included: t.includedSuites, extraFee: t.extraSuiteFee }));

// "Try before you pay" — live demo buttons for whichever suites the platform
// admin has opened for public demo. Renders nothing if none are enabled.
function TrySuiteStrip() {
  const [keys, setKeys] = useState([]);
  useEffect(() => {
    supabase.from('platform_demo_suites').select('suite_key').eq('enabled', true)
      .then(({ data }) => setKeys((data || []).map((r) => r.suite_key).filter((k) => SUITES.some((s) => s.key === k))))
      .catch(() => {});
  }, []);
  if (!keys.length) return null;
  return (
    <Reveal className="cl-try-strip">
      <span className="cl-try-label">Try a suite right now. Sample data, no sign-up:</span>
      {keys.map((k) => {
        const s2 = SUITES.find((x) => x.key === k);
        const meta = SUITE_META[k] || {};
        return (
          <Link key={k} className="cl-try-chip" to={`/try/${k}`}>
            <span className="cl-try-ic" style={{ background: meta.tint }}><SuiteIcon name={meta.icon || 'grid'} size={13} color="#fff" /></span>
            {s2.name}
          </Link>
        );
      })}
    </Reveal>
  );
}

function PriceCalculator() {
  const { perStaff, annualDiscount } = usePricing();
  const PRICE_TIERS = priceTiers();
  const [selected, setSelected] = useState(() => new Set(SUITES.slice(0, 5).map((s) => s.key)));
  const [staffCount, setStaffCount] = useState(10);
  const [yearly, setYearly] = useState(false);
  const suiteCount = selected.size;
  // Honest pricing: the customer picks suites; we ALWAYS put them on the CHEAPEST
  // plan for that many suites — you can never be stuck "on Startup" paying more
  // than a bigger plan would cost. No tier to choose, no per-extra-suite trap.
  const priceFor = (t) => t.baseFee + Math.max(0, suiteCount - t.included) * t.extraFee + staffCount * perStaff;
  // Enterprise is custom/quoted — never auto-price into it. Self-serve = Startup/Standard.
  const PRICED = PRICE_TIERS.filter((t) => t.key !== 'enterprise');
  const best = PRICED.reduce((a, b) => (priceFor(b) < priceFor(a) ? b : a));
  const monthly = priceFor(best);
  const suitesCost = best.baseFee + Math.max(0, suiteCount - best.included) * best.extraFee;
  const total = yearly ? monthly * 12 * (1 - annualDiscount) : monthly;

  // A suite is locked ON when another selected suite requires it (Payroll/Leave/
  // Attendance require HR). Locked suites can't be turned off and count as paid.
  const lockedKeys = new Set();
  for (const k of selected) for (const dep of requiresOf(k)) lockedKeys.add(dep);
  const lockedNames = [...lockedKeys].map((k) => SUITES.find((s) => s.key === k)?.name).filter(Boolean);

  const toggleSuite = (key) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) {
        // can't remove a foundation something else selected still needs
        const neededBy = [...next].some((k) => k !== key && requiresOf(k).includes(key));
        if (neededBy) return next;
        next.delete(key);
      } else {
        for (const dep of requiredFoundations([key])) next.add(dep); // pulls in HR
      }
      return next;
    });
  };

  return (
    <Reveal className="cl-calc" delay={0.1}>
      <h3 className="cl-calc-h">Estimate your price</h3>
      <div className="cl-calc-body">
        <div className="cl-calc-controls">
          <div className="cl-calc-row">
            <div className="cl-calc-tiers">
              <span className="cl-calc-tier on" style={{ cursor: 'default' }}>Best plan: {best.name}</span>
            </div>
            <label className="cl-calc-toggle">
              <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} />
              Bill yearly <span className="cl-calc-save">(save 15%)</span>
            </label>
          </div>

          <div className="cl-calc-row" style={{ marginBottom: 10 }}>
            <label className="cl-calc-slider-label" style={{ margin: 0, width: 'auto' }}>Pick your suites</label>
            <span className="cl-calc-meter">{suiteCount} suite{suiteCount === 1 ? '' : 's'} selected</span>
          </div>
          <div className="cl-calc-presets">
            <span className="cl-calc-presets-label">Quick start:</span>
            {PRESETS.map((p) => (
              <button key={p.key} type="button" className="cl-calc-preset" title={p.hint}
                onClick={() => setSelected(new Set(requiredFoundations(p.suites)))}>{p.label}</button>
            ))}
          </div>

          {FAMILIES.map((fam) => {
            const inFam = SUITES.filter((s) => SUITE_FAMILY[s.key] === fam.key);
            if (!inFam.length) return null;
            return (
              <div key={fam.key} className="cl-calc-fam-group">
                <div className="cl-calc-fam">{fam.label}</div>
                <div className="cl-calc-suites">
                  {inFam.map((s) => {
                    const meta = SUITE_META[s.key] || {};
                    const on = selected.has(s.key);
                    const locked = lockedKeys.has(s.key);
                    return (
                      <button key={s.key} type="button" className={`cl-calc-suite ${on ? 'on' : ''}`}
                        onClick={() => toggleSuite(s.key)}
                        title={locked ? `Required by another suite you picked, included automatically` : undefined}
                        style={locked ? { cursor: 'default' } : undefined}>
                        <span className="cl-calc-suite-icon" style={{ background: on ? meta.tint : 'var(--line)' }}>
                          <SuiteIcon name={meta.icon || 'grid'} size={16} color="#fff" />
                        </span>
                        {s.name}
                        {locked
                          ? <svg className="cl-calc-tick" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
                          : on && <svg className="cl-calc-tick" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10"/></svg>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {lockedNames.length > 0 && (
            <p className="cl-calc-hint" style={{ margin: '8px 2px 0', fontSize: 12.5, opacity: 0.7 }}>
              {lockedNames.join(' and ')} {lockedNames.length === 1 ? 'is' : 'are'} included automatically. Payroll, Leave and Attendance all run on your staff records in HR.
            </p>
          )}

          <div className="cl-calc-row" style={{ marginTop: 20, marginBottom: 8 }}>
            <label className="cl-calc-slider-label" style={{ margin: 0, width: 'auto' }}>How many staff?</label>
            <div className="cl-calc-step">
              <button type="button" aria-label="Fewer staff" onClick={() => setStaffCount((c) => Math.max(1, c - 1))}>−</button>
              <input value={staffCount} inputMode="numeric" aria-label="Number of staff"
                onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); setStaffCount(Number.isNaN(n) ? 1 : Math.min(1000, Math.max(1, n))); }} />
              <button type="button" aria-label="More staff" onClick={() => setStaffCount((c) => Math.min(1000, c + 1))}>+</button>
            </div>
          </div>
          <input type="range" min={1} max={200} value={Math.min(200, staffCount)}
            onChange={(e) => setStaffCount(Number(e.target.value))} className="cl-calc-slider"
            style={{ '--fill': `${((Math.min(200, staffCount) - 1) / 199) * 100}%` }} />
        </div>

        <aside className="cl-calc-summary">
          <div className="cl-calc-headline">
            <div className="cl-calc-total">{naira(Math.round(total))}<small>{yearly ? '/yr' : '/mo'}</small></div>
            <div className="cl-calc-sub">
              {yearly ? `works out to ${naira(Math.round(total / 12))}/mo` : 'rate locked at sign-up, never goes up on you'}
            </div>
          </div>
          <div className="cl-calc-lines">
            <div><span>{best.name} plan · {suiteCount} suite{suiteCount === 1 ? '' : 's'}</span><b>{naira(suitesCost)}/mo</b></div>
            <div><span>{staffCount} staff × {naira(perStaff)}</span><b>{naira(staffCount * perStaff)}/mo</b></div>
            {yearly && <div className="save"><span>Yearly, {Math.round(annualDiscount * 100)}% off</span><b>−{naira(Math.round(monthly * 12 * annualDiscount))}/yr</b></div>}
          </div>
          <Link className="cl-btn cl-btn-primary cl-calc-cta" to={`/signup?plan=${best.key}`}>Start with {best.name}</Link>
        </aside>
      </div>
    </Reveal>
  );
}

// Snappier than the original 0.11/0.7 — first paint already pays the bundle
// cost, the entrance must not add seconds on top (audit finding 5).
const heroStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0 } },
};
const heroItem = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0.7, 0.3, 1] } },
};

const heroMetrics = [
  { label: 'People active', value: '42', note: '+2 this month', tone: 'orange' },
  { label: 'Pipeline', value: '₦8.4m', note: '6 open deals', tone: 'blue' },
  { label: 'Work on track', value: '87%', note: 'Across 4 teams', tone: 'green' },
];

const heroActivity = [
  { icon: 'check', title: 'Leave request approved', meta: 'Bola A. · People', time: 'Now', tone: '#16a36a' },
  { icon: 'users', title: 'New lead captured', meta: 'Meridian Foods · CRM', time: '8m', tone: '#4f7cff' },
  { icon: 'file', title: 'Invoice CO-1042 paid', meta: '₦480,000 · Finance', time: '24m', tone: '#ff6b2c' },
];

function BusinessCommandCenter({ reduce }) {
  return (
    <motion.div
      className="cl-os-stage"
      initial={reduce ? false : { opacity: 0, y: 34, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.65, delay: 0.15, ease: [0.16, 0.8, 0.2, 1] }}
      aria-label="A live preview of the Collarone business command centre"
    >
      <div className="cl-os-glow" aria-hidden="true" />
      <div className="cl-os-shell">
        <div className="cl-os-topbar">
          <div className="cl-os-dots"><i /><i /><i /></div>
          <div className="cl-os-address"><span className="cl-os-lock">◆</span> workspace.collarone.app</div>
          <div className="cl-os-avatar">AO</div>
        </div>
        <div className="cl-os-app">
          <aside className="cl-os-rail">
            <span className="cl-os-mini-mark"><Mark size={22} /></span>
            {['grid', 'users', 'calendar', 'briefcase', 'wallet'].map((icon, i) => (
              <span className={`cl-os-rail-item${i === 0 ? ' on' : ''}`} key={icon}>
                <SuiteIcon name={icon} size={15} color={i === 0 ? '#fff' : 'currentColor'} />
              </span>
            ))}
            <span className="cl-os-rail-spacer" />
            <span className="cl-os-rail-item"><SuiteIcon name="settings" size={15} /></span>
          </aside>

          <div className="cl-os-main">
            <div className="cl-os-welcome">
              <div>
                <span className="cl-os-overline">MONDAY · 9:41 AM</span>
                <h2>Good morning, Ada.</h2>
                <p>Here is what needs your attention today.</p>
              </div>
              <button type="button" className="cl-os-add" tabIndex={-1}><span>+</span> Quick add</button>
            </div>

            <div className="cl-os-metrics">
              {heroMetrics.map((metric) => (
                <div className={`cl-os-metric ${metric.tone}`} key={metric.label}>
                  <span className="cl-os-metric-label">{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small>{metric.note}</small>
                </div>
              ))}
            </div>

            <div className="cl-os-grid">
              <div className="cl-os-panel cl-os-activity">
                <div className="cl-os-panel-head"><strong>Live activity</strong><span>View all</span></div>
                <div className="cl-os-activity-list">
                  {heroActivity.map((item) => (
                    <div className="cl-os-activity-row" key={item.title}>
                      <span className="cl-os-activity-icon" style={{ '--activity-tone': item.tone }}>
                        <SuiteIcon name={item.icon} size={14} color="currentColor" />
                      </span>
                      <span><b>{item.title}</b><small>{item.meta}</small></span>
                      <time>{item.time}</time>
                    </div>
                  ))}
                </div>
              </div>

              <div className="cl-os-panel cl-os-focus">
                <div className="cl-os-panel-head"><strong>Needs you</strong><span className="cl-os-count">3</span></div>
                <div className="cl-os-focus-item">
                  <div><span>Payroll</span><b>August payroll is ready</b></div>
                  <span className="cl-os-arrow">↗</span>
                </div>
                <div className="cl-os-progress"><i /></div>
                <div className="cl-os-focus-foot"><span>42 staff</span><strong>₦6.2m</strong></div>
              </div>
            </div>

            <div className="cl-os-automation">
              <span className="cl-os-pulse" />
              <div><strong>Automation is working</strong><small>4 reminders sent · 2 tasks created · nothing overdue</small></div>
              <span className="cl-os-live">LIVE</span>
            </div>
          </div>
        </div>
      </div>

      <motion.div className="cl-os-float cl-os-float-pay"
        animate={reduce ? undefined : { y: [0, -7, 0] }} transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}>
        <span className="cl-os-float-icon green">✓</span><span><strong>Payroll ready</strong><small>All 42 records checked</small></span>
      </motion.div>
      <motion.div className="cl-os-float cl-os-float-lead"
        animate={reduce ? undefined : { y: [0, 7, 0] }} transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}>
        <span className="cl-os-float-icon orange">↗</span><span><strong>New deal</strong><small>₦1.2m added to CRM</small></span>
      </motion.div>
    </motion.div>
  );
}

const modules = [
  {
    name: 'People & Operations', status: 'live',
    desc: 'A directory with a full Employee 360 per person, company letters drafted by Collarone AI on your own letterhead, probation and disciplinary flows done properly, leave, tasks, the front desk and HR analytics.',
    suites: ['hr', 'leave', 'tasks', 'visitors', 'attendance', 'automation'],
  },
  {
    name: 'Money & Assets', status: 'live',
    desc: 'Payroll with real Nigerian statutory deductions, invoices and GRNs with your own letterhead, plus everything that keeps a business funded and equipped.',
    suites: ['payroll', 'finance', 'procurement', 'inventory', 'trade-docs'],
  },
  {
    name: 'Customers & Growth', status: 'live',
    desc: 'A CRM with a naira-valued deals pipeline and WhatsApp-first activity log, plus projects, secure documents and your public website.',
    suites: ['crm', 'projects', 'documents'],
  },
];

const FAQ_CATS = ['All', 'General', 'Pricing', 'Product', 'Security'];
// Fifteen open questions was a wall. Five is a section; the rest are one tap away.
const FAQ_PREVIEW = 5;
// single source of truth, shared with the FAQPage markup in index.html
const faqs = FAQS;

export default function Landing() {
  usePricing(); // re-renders the pricing cards once live prices load
  const reduce = useReducedMotion();
  const heroTextProps = reduce
    ? {}
    : { variants: heroStagger, initial: 'hidden', animate: 'show' };
  const heroItemVariants = reduce ? {} : { variants: heroItem };
  const [pastHero, setPastHero] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [faqCat, setFaqCat] = useState('All');
  const [faqAll, setFaqAll] = useState(false);
  const visibleFaqs = faqCat === 'All' ? faqs : faqs.filter((f) => f.cat === faqCat);
  // inHeroScroll: still inside the dark hero but scrolled — the transparent
  // nav was letting hero content collide with the logo row (audit finding 24).
  const [inHeroScroll, setInHeroScroll] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (v) => { setPastHero(v > 520); setInHeroScroll(v > 24 && v <= 520); });

  const heroRef = useRef(null);
  const [glowOn, setGlowOn] = useState(false);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const gx = useSpring(mx, { stiffness: 110, damping: 22, mass: 0.5 });
  const gy = useSpring(my, { stiffness: 110, damping: 22, mass: 0.5 });
  // The hero mock leans gently toward the cursor — same mouse listener as the glow.
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rx = useSpring(tiltX, { stiffness: 140, damping: 20, mass: 0.6 });
  const ry = useSpring(tiltY, { stiffness: 140, damping: 20, mass: 0.6 });
  const handleHeroMove = (e) => {
    if (reduce || !heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    mx.set(e.clientX - rect.left);
    my.set(e.clientY - rect.top);
    tiltX.set(-((e.clientY - rect.top) / rect.height - 0.5) * 7);
    tiltY.set(((e.clientX - rect.left) / rect.width - 0.5) * 7);
  };
  const handleHeroLeave = () => { setGlowOn(false); tiltX.set(0); tiltY.set(0); };

  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const o1y = useTransform(heroProgress, [0, 1], [0, -70]);
  const o2y = useTransform(heroProgress, [0, 1], [0, -30]);
  const o3y = useTransform(heroProgress, [0, 1], [0, -120]);

  const { scrollYProgress: pageProgress } = useScroll();
  const pageProgressSpring = useSpring(pageProgress, { stiffness: 200, damping: 30, mass: 0.3 });

  return (
    <div className="cl">
      {!reduce && <motion.div className="cl-progress" style={{ scaleX: pageProgressSpring }} />}
      <nav className={`cl-nav${(pastHero || navOpen) ? ' cl-nav-scrolled' : ' cl-nav-ondark'}${!pastHero && !navOpen && inHeroScroll ? ' cl-nav-inscroll' : ''}${navOpen ? ' cl-nav-open' : ''}`}>
        <div className="cl-wrap">
          <a className="cl-brand" href="#top">
            <Mark size={24} />
            <span className="cl-wm">Collar<em>One</em></span>
          </a>
          <div className="cl-navlinks">
            <a className="cl-nl cl-hide-sm" href="#platform">Platform</a>
            <a className="cl-nl cl-hide-sm" href="#pricing">Pricing</a>
            <a className="cl-nl cl-hide-sm" href="#themes">Themes</a>
            <a className="cl-nl cl-hide-sm" href="#faq">FAQ</a>
            <Link className="cl-nl cl-hide-sm" to="/jobs">Jobs</Link>
            <Link className="cl-btn cl-btn-sm cl-btn-trydemo cl-hide-sm" to="/try">Try demo</Link>
            <Link className="cl-nl cl-hide-sm" to="/login">Sign in</Link>
            <Link className="cl-btn cl-btn-primary cl-btn-sm" to="/signup">Get started</Link>
            <button type="button" className="cl-burger" aria-label={navOpen ? 'Close menu' : 'Open menu'} aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>
              {navOpen ? I.close : I.menu}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {navOpen && (
            <motion.div
              className="cl-mobile-menu"
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              {[['#platform', 'Platform'], ['/try', 'Try demo'], ['#pricing', 'Pricing'], ['#themes', 'Themes'], ['#faq', 'FAQ'], ['/jobs', 'Jobs board']].map(([href, label]) => (
                <a key={href} className="cl-mm-link" href={href} onClick={() => setNavOpen(false)}>{label}</a>
              ))}
              <div className="cl-mm-actions">
                <Link className="cl-btn cl-btn-ghost" to="/login" onClick={() => setNavOpen(false)}>Sign in</Link>
                <Link className="cl-btn cl-btn-primary" to="/signup" onClick={() => setNavOpen(false)}>Get started</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <header
        className="cl-hero cl-dark cl-hero-dark"
        id="top"
        ref={heroRef}
        onMouseMove={handleHeroMove}
        onMouseEnter={() => setGlowOn(true)}
        onMouseLeave={handleHeroLeave}
      >
        <div className="cl-orb-field" aria-hidden="true">
          <motion.div className="cl-orb o1" style={reduce ? undefined : { y: o1y }} />
          <motion.div className="cl-orb o2" style={reduce ? undefined : { y: o2y }} />
          <motion.div className="cl-orb o3" style={reduce ? undefined : { y: o3y }} />
        </div>
        {!reduce && (
          <motion.div
            className={`cl-cursor-glow${glowOn ? ' show' : ''}`}
            style={{ left: gx, top: gy }}
            aria-hidden="true"
          />
        )}
        <div className="cl-wrap cl-hero-grid">
          <motion.div className="cl-hero-inner" {...heroTextProps}>
            <motion.span {...heroItemVariants} className="cl-kicker"><span className="cl-dot" />The business OS built for Nigeria</motion.span>
            <motion.h1 {...heroItemVariants}>Stop running your business <span className="cl-grad-word">from memory.</span></motion.h1>
            <motion.p {...heroItemVariants} className="cl-hero-sub">People, payroll, customers, tasks and money: finally moving together in one calm command centre.</motion.p>
            <motion.div {...heroItemVariants} className="cl-hero-ctas">
              <Link className="cl-btn cl-btn-primary cl-hero-primary" to="/signup">Build my workspace <span aria-hidden="true">↗</span></Link>
              <Link className="cl-btn cl-btn-ghost" to="/try">Explore the live demo <span aria-hidden="true">→</span></Link>
            </motion.div>
            <motion.div {...heroItemVariants} className="cl-hero-proof">
              <div><strong>15</strong><span>live suites</span></div>
              <i />
              <div><strong>Minutes</strong><span>to get started</span></div>
              <i />
              <div><strong>₦ Naira</strong><span>simple local billing</span></div>
            </motion.div>
          </motion.div>

          <motion.div className="cl-hero-shot-wrap" style={reduce ? undefined : { perspective: 1100, rotateX: rx, rotateY: ry }}>
            <BusinessCommandCenter reduce={reduce} />
          </motion.div>
        </div>
        <div className="cl-hero-scroll" aria-hidden="true"><span>Scroll to explore</span><i /></div>
      </header>

      <Marquee items={marqueeItems} dark />

      <section className="cl-trust cl-trust-modern" aria-label="Platform facts">
        <div className="cl-wrap cl-trust-row">
          <span className="cl-trust-cell"><strong>15</strong> suites live</span>
          <span className="cl-trust-dot" aria-hidden="true" />
          <span className="cl-trust-cell">One isolated workspace per company</span>
          <span className="cl-trust-dot" aria-hidden="true" />
          <span className="cl-trust-cell">Role-checked on every screen</span>
          <span className="cl-trust-dot" aria-hidden="true" />
          <span className="cl-trust-cell">Priced in naira, rate locked at sign-up</span>
        </div>
      </section>

      <section className="cl-sec cl-capabilities-section" id="capabilities" data-section="01 · DIFFERENT BY DESIGN">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">Why it feels different</p>
            <h2 className="cl-sec-h">Built to feel obvious, not overwhelming</h2>
            <p className="cl-sec-lede">Every screen does one job well. No settings maze, no module you have to configure before it's useful.</p>
          </Reveal>
          <CardCarousel className="cl-grid4 cl-process" dotLabel="step">
            <Reveal className="cl-process-card" hover><span className="cl-process-num">01</span><div className="cl-icon-wrap">{I.bolt}</div><h3>Set up in minutes</h3><p>Sign up, add your team, and your space is ready, no onboarding call required.</p></Reveal>
            <Reveal className="cl-process-card" delay={0.05} hover><span className="cl-process-num">02</span><div className="cl-icon-wrap">{I.shield}</div><h3>Access, done right</h3><p>Every screen checks who's allowed to see it, tested as different roles before anything ships.</p></Reveal>
            <Reveal className="cl-process-card" delay={0.1} hover><span className="cl-process-num">03</span><div className="cl-icon-wrap">{I.money}</div><h3>Priced in naira</h3><p>Pay by transfer or card, no forex markup, no bill that moves with the exchange rate.</p></Reveal>
            <Reveal className="cl-process-card" delay={0.15} hover><span className="cl-process-num">04</span><div className="cl-icon-wrap">{I.globeBig}</div><h3>Grows with you</h3><p>Start with a website and a staff list. Turn on leave, tasks and the rest the day you need them.</p></Reveal>
          </CardCarousel>
        </div>
      </section>

      <section className="cl-sec cl-tint cl-platform-section" id="platform" data-section="02 · THE OPERATING SYSTEM">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">One platform</p>
            <h2 className="cl-sec-h">Everything a growing business runs on</h2>
            <p className="cl-sec-lede">Start with what you need today. The rest turns on the moment you're ready. Same account, nothing to migrate.</p>
          </Reveal>
          <TrySuiteStrip />
          <div className="cl-bento">
            {modules.map((m, i) => {
              const suiteChips = m.suites.map((key) => {
                const s = SUITES.find((x) => x.key === key);
                const meta = SUITE_META[key] || {};
                return (
                  <span className="cl-module-suite" key={key}>
                    <span className="cl-module-suite-icon" style={{ background: meta.tint }}><SuiteIcon name={meta.icon || 'grid'} size={i === 0 ? 15 : 14} color="#fff" /></span>
                    {s?.name}
                  </span>
                );
              });
              if (i === 0) {
                const watermarkMeta = SUITE_META[m.suites[0]] || {};
                return (
                  <motion.div
                    key={m.name} className="cl-bento-feat"
                    initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '0px 0px 240px 0px' }}
                    transition={{ duration: 0.6, ease: [0.2, 0.7, 0.3, 1] }}
                    whileHover={{ y: -4 }}
                  >
                    <span className="cl-bento-tag">Most used</span>
                    <h3>{m.name}</h3>
                    <p>{m.desc}</p>
                    <div className="cl-module-suites">{suiteChips}</div>
                    <SuiteIcon name={watermarkMeta.icon || 'grid'} size={220} color="#F4F1EA" strokeWidth="0.6" style={{ position: 'absolute', right: -30, bottom: -40, opacity: 0.05, pointerEvents: 'none' }} />
                  </motion.div>
                );
              }
              const watermarkMeta = SUITE_META[m.suites[0]] || {};
              return (
                <Reveal className="cl-bento-side" key={m.name} delay={i * 0.08} hover>
                  <span className="cl-bento-side-icon"><SuiteIcon name={watermarkMeta.icon || 'grid'} size={22} /></span>
                  <h3>{m.name}</h3>
                  <p>{m.desc}</p>
                  <div className="cl-module-suites">{suiteChips}</div>
                  <SuiteIcon name={watermarkMeta.icon || 'grid'} size={140} color="var(--ink)" strokeWidth="0.6" className="cl-bento-watermark" />
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="cl-sec cl-tint cl-themes-section" id="themes" data-section="03 · YOUR DIGITAL FRONT DOOR">
        <div className="cl-wrap">
          <motion.div className="cl-sec-head" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '0px 0px 240px 0px' }} transition={{ duration: 0.45 }}>
            <p className="cl-eyebrow">A real website, included on every plan</p>
            <h2 className="cl-sec-h">Give your business a site worth visiting</h2>
            <p className="cl-sec-lede">Pick a theme, edit every word, and sell online or take enquiries. No designer, no monthly website bill. Tap Preview to see one live.</p>
          </motion.div>
          <PublicThemeGallery limit={5} seeMoreHref="/themes" showFilters={false} />
        </div>
      </section>

      <section className="cl-sec cl-nigeria-section" id="nigeria" data-section="04 · BUILT HERE, BUILT RIGHT">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">Not translated. Built here.</p>
            <h2 className="cl-sec-h">Nigerian business, from the ground up</h2>
            <p className="cl-sec-lede">These aren't global defaults with a naira sign added on.</p>
          </Reveal>
          <Reveal className="cl-stat-band">
            <div className="cl-stat-cell"><div className="cl-val">₦</div><div className="cl-lbl">Priced and billed in naira, no card from abroad required</div></div>
            <div className="cl-stat-cell"><div className="cl-val"><CountUp to={36} suffix="+1" /></div><div className="cl-lbl">Built to work the same in every Nigerian state, Lagos to Maiduguri</div></div>
            <div className="cl-stat-cell"><div className="cl-val"><CountUp to={24} suffix="/7" /></div><div className="cl-lbl">Your team, leave and front desk, live and checkable from your phone</div></div>
            <div className="cl-stat-cell">
              <div className="cl-val">
                <svg width="34" height="24" viewBox="0 0 34 24" style={{ borderRadius: 4, display: 'block' }} aria-label="Nigeria">
                  <rect width="34" height="24" fill="#fff" />
                  <rect width="11.33" height="24" fill="#008751" />
                  <rect x="22.67" width="11.33" height="24" fill="#008751" />
                  <rect width="34" height="24" fill="none" stroke="rgba(10,14,26,0.12)" strokeWidth="1" rx="3" />
                </svg>
              </div>
              <div className="cl-lbl">Designed, built and supported in Nigeria, for Nigerian business hours</div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="cl-sec cl-tint cl-pricing-section" id="pricing" data-section="05 · HONEST PRICING">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">Pricing</p>
            <h2 className="cl-sec-h">Pick your suites. We give you the best price.</h2>
            <p className="cl-sec-lede">No confusing tiers to choose. Pick the suites your business needs and we automatically put you on the cheapest plan for them. The more suites you run, the less each one costs. No forex markup, no dollar pricing, and your rate locks in at sign-up.</p>
          </Reveal>
          <PriceCalculator />
          <p className="cl-price-note">Pay yearly and save 15% off the total. Your rate locks in at sign-up. It doesn't change later even if our published prices do.</p>

          <div className="cl-glance-label">Plans at a glance</div>
          <div className="cl-plans-glance">
            {PLANS.map((plan) => {
              const isEnt = plan.key === 'enterprise';
              const feat = plan.key === 'standard';
              return (
                <div key={plan.key} className={`cl-plan-chip${feat ? ' feat' : ''}`}>
                  {feat && <span className="cl-plan-chip-tag">Most picked</span>}
                  <div className="cl-plan-chip-name">{plan.name}</div>
                  <div className="cl-plan-chip-price">{isEnt ? 'Custom' : <>₦{plan.baseFee.toLocaleString('en-NG')}<small>/mo</small></>}</div>
                  <div className="cl-plan-chip-sub">{isEnt
                    ? <>Dedicated onboarding · <a href="#contact">talk to us</a></>
                    : `Best for ${plan.includedSuites} suites · ${naira(PRICING.perStaff)}/staff`}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="cl-sec cl-tint cl-jobs-section" id="jobs-board" data-section="06 · HIRE WITHOUT THE HASSLE">
        <div className="cl-wrap">
          <div className="cl-jobs-grid">
            <Reveal className="cl-jobs-copy">
              <p className="cl-eyebrow">Free jobs board</p>
              <h2 className="cl-jobs-h">Hiring? Post it free, and share straight to WhatsApp.</h2>
              <p className="cl-jobs-lede">Post a role in seconds, or paste it from your WhatsApp group and we tidy it up. You get a clean link to share back to your groups. Seekers find you; you find staff.</p>
              <div className="cl-jobs-steps">
                <span><b>1</b> Post or paste</span>
                <span><b>2</b> Get a link</span>
                <span><b>3</b> Share to WhatsApp</span>
              </div>
              <div className="cl-jobs-ctas">
                <Link to="/jobs/post" className="cl-btn cl-btn-primary">Post a job for free</Link>
                <Link to="/jobs" className="cl-btn cl-btn-ghost">Browse jobs</Link>
              </div>
            </Reveal>

            <Reveal className="cl-jobcard" delay={0.1} hover>
              <div className="cl-jobcard-bar"><span className="cl-dotb r" /><span className="cl-dotb y" /><span className="cl-dotb g" /><span className="cl-url">collarone.app/jobs</span></div>
              <div className="cl-jobcard-body">
                <span className="cl-jobcard-fresh">Posted just now</span>
                <h3 className="cl-jobcard-title">Sales Assistant</h3>
                <p className="cl-jobcard-meta">Bright Stores · Ikeja, Lagos</p>
                <span className="cl-jobcard-pay">₦120,000 / month</span>
                <p className="cl-jobcard-desc">Friendly and organised, good with customers. Retail experience a plus. Apply on WhatsApp.</p>
                <div className="cl-jobcard-actions">
                  <span className="cl-jobcard-apply">Apply now</span>
                  <span className="cl-jobcard-wa">Share to WhatsApp</span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="cl-sec cl-tint cl-faq-section" id="faq" data-section="07 · THE DETAILS">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">Questions</p>
            <h2 className="cl-sec-h">Everything business owners ask us</h2>
          </Reveal>
          <div className="cl-faq-tabs">
            {FAQ_CATS.map((c) => (
              <button key={c} type="button" className={`cl-faq-tab${faqCat === c ? ' on' : ''}`} onClick={() => { setFaqCat(c); setFaqAll(false); }}>
                {c}{c !== 'All' && <span className="cl-faq-tab-count">{faqs.filter((f) => f.cat === c).length}</span>}
              </button>
            ))}
          </div>
          {/* Only the first five are shown; the rest stay in the DOM and are
              hidden with CSS rather than sliced out, so the FAQPage JSON-LD
              still describes questions that are genuinely on the page. */}
          <Reveal className="cl-faq-list" key={faqCat}>
            {visibleFaqs.map((f, i) => (
              <details className={`cl-faq-item${!faqAll && i >= FAQ_PREVIEW ? ' cl-faq-extra' : ''}`} key={f.q}>
                <span className="cl-faq-num">{String(i + 1).padStart(2, '0')}</span>
                <summary>{f.q}<span className="cl-chev">{I.chev}</span></summary>
                <div className="cl-faq-a">{f.a}</div>
              </details>
            ))}
          </Reveal>
          {visibleFaqs.length > FAQ_PREVIEW && (
            <div className="cl-faq-more">
              <button type="button" className="cl-btn cl-btn-ghost" onClick={() => setFaqAll((v) => !v)}>
                {faqAll
                  ? 'Show fewer questions'
                  : `See ${visibleFaqs.length - FAQ_PREVIEW} more question${visibleFaqs.length - FAQ_PREVIEW === 1 ? '' : 's'}`}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="cl-sec cl-contact-section" id="contact" data-section="08 · YOUR MOVE">
        <div className="cl-wrap">
          <Reveal className="cl-contact-card cl-dark-card">
            <h2>Let's get your business on Collarone.</h2>
            <p>Tell us about your business and we'll set up your space personally, with no queue during early access.</p>
            <div className="cl-contact-row">
              <a className="cl-btn cl-btn-primary" href="mailto:hello@collarone.app?subject=Early%20access">Email hello@collarone.app</a>
              <a className="cl-btn cl-btn-ghost" href="https://wa.me/2348148128551" target="_blank" rel="noreferrer">Chat on WhatsApp</a>
              <a className="cl-btn cl-btn-ghost" href="tel:+2348148128551">Call 0814 812 8551</a>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="cl-footer cl-footer-revamped">
        <div className="cl-wrap">
          <div className="cl-footer-top">
            <div className="cl-footer-col cl-footer-about">
              <div className="cl-footer-brand">
                <Mark size={20} />
                <span>Collar<em>One</em></span>
              </div>
              <p>The business platform for Nigerian companies: team, leave, tasks and front desk today, customers and your website joining the same space. Built and supported in Nigeria.</p>
              <div className="cl-footer-contact">
                <a href="https://wa.me/2348148128551" target="_blank" rel="noreferrer">WhatsApp</a>
                <a href="mailto:hello@collarone.app">hello@collarone.app</a>
              </div>
            </div>
            <div className="cl-footer-col">
              <div className="cl-footer-h">Platform</div>
              <a href="#platform">What's inside</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
              <Link to="/login">Sign in</Link>
            </div>
            <div className="cl-footer-col">
              <div className="cl-footer-h">Company</div>
              <a href="/jobs">Jobs board</a>
              <Link to="/contact">Contact us</Link>
            </div>
            <div className="cl-footer-col">
              <div className="cl-footer-h">Legal</div>
              <Link to="/terms">Terms of Service</Link>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/status">System Status</Link>
            </div>
          </div>
          <div className="cl-footer-bottom">
            <div className="cl-fnote">© 2026 Collarone. Made for Nigerian business.</div>
            <div className="cl-footer-loc">{I.pin}Nigeria</div>
          </div>
        </div>
      </footer>

      {/* Collarone assistant, AI chat grounded in the business, with a
          talk-to-a-human hand-off to WhatsApp, phone or the contact desk. */}
      <ChatWidget visible={pastHero} />
    </div>
  );
}
