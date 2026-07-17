import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, animate, AnimatePresence, useReducedMotion, useScroll, useTransform, useMotionValue, useSpring, useMotionValueEvent } from 'framer-motion';
import { SUITES, SUITE_META } from '../config/suites.js';
import SuiteIcon from '../components/SuiteIcon.jsx';
import ChatWidget from './ChatWidget.jsx';
import shotHome from '../assets/shots/home.jpg';
import shotTasks from '../assets/shots/tasks.jpg';
import shotCrm from '../assets/shots/crm.jpg';
import shotAnalytics from '../assets/shots/analytics.jpg';
import shotPipeline from '../assets/shots/pipeline.jpg';
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
  people: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path d="M16 6.5a3 3 0 0 1 0 5.6M17 14c2.5.4 4 2.3 4 5" /></svg>,
  calendar: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></svg>,
  chat: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 5h16v11H8l-4 4z" /></svg>,
  globe: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>,
  shield: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>,
  bolt: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>,
  money: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 6v12M18 6v12" /></svg>,
  globeBig: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>,
  pin: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>,
  chev: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  expand: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" /></svg>,
  close: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>,
  menu: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  docSm: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>,
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
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.7, 0.3, 1] }}
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

// The headline's moving part — cycles what "your whole business" actually
// means, one suite at a time.
const ROTATE_WORDS = ['whole business.', 'people & payroll.', 'company letters.', 'customers.', 'front desk.'];
function RotatingWord() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % ROTATE_WORDS.length), 2400);
    return () => clearInterval(t);
  }, [reduce]);
  if (reduce) return <span className="cl-grad-word">whole business.</span>;
  return (
    <span className="cl-rotate-wrap">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={ROTATE_WORDS[i]} className="cl-grad-word cl-rotate-word"
          initial={{ y: '85%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '-70%', opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0.7, 0.3, 1] }}
        >
          {ROTATE_WORDS[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const GALLERY_SHOTS = [
  { src: shotHome, url: 'collarone.app/home', title: 'One workspace', caption: 'Every suite your company runs, behind one login' },
  { src: shotTasks, url: 'HR — Employee 360', title: 'Employee 360', caption: 'Pay, leave, assets, documents and reviews — one page per person' },
  { src: shotCrm, url: 'HR — Letters', title: 'Letters + Collarone AI', caption: 'Drafted by AI on your letterhead, signed, referenced and filed' },
  { src: shotAnalytics, url: 'HR — Analytics', title: 'HR analytics', caption: 'Headcount, attrition and statutory compliance at a glance' },
  { src: shotPipeline, url: 'CRM — Pipeline', title: 'Deals pipeline', caption: 'Every deal staged and valued in naira, follow-ups on time' },
];

const marqueeItems = ['Staff Directory', 'Leave Management', 'Task Tracking', 'Visitor Sign-in', 'Recruiting & Careers', 'Onboarding', 'Performance Reviews', 'Compliance Vault', 'Payroll — PAYE · Pension · NHF', 'Customer CRM', 'Website Builder', 'Invoicing & GRNs', 'Automation'];

const PRICE_TIERS = [
  { key: 'startup', name: 'Startup', baseFee: 15000, included: 3, extraFee: 8000 },
  { key: 'standard', name: 'Standard', baseFee: 25000, included: 5, extraFee: 6000 },
  { key: 'enterprise', name: 'Enterprise', baseFee: 45000, included: 8, extraFee: 4000 },
];
const ANNUAL_DISCOUNT = 0.15;
const PER_STAFF_FEE = 2000;
const naira = (n) => `₦${Math.round(n).toLocaleString('en-NG')}`;

function PriceCalculator() {
  const [tierKey, setTierKey] = useState('standard');
  const [selected, setSelected] = useState(() => new Set(SUITES.slice(0, 5).map((s) => s.key)));
  const [staffCount, setStaffCount] = useState(10);
  const [yearly, setYearly] = useState(false);
  const tier = PRICE_TIERS.find((t) => t.key === tierKey);
  const suiteCount = selected.size;
  const extra = Math.max(0, suiteCount - tier.included);
  const monthly = tier.baseFee + extra * tier.extraFee + staffCount * PER_STAFF_FEE;
  const total = yearly ? monthly * 12 * (1 - ANNUAL_DISCOUNT) : monthly;

  const pickTier = (key) => {
    setTierKey(key);
    setSelected(new Set(SUITES.slice(0, PRICE_TIERS.find((t) => t.key === key).included).map((s) => s.key)));
  };

  const toggleSuite = (key) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <Reveal className="cl-calc" delay={0.1}>
      <h3 className="cl-calc-h">Estimate your price</h3>
      <div className="cl-calc-row">
        <div className="cl-calc-tiers">
          {PRICE_TIERS.map((t) => (
            <button key={t.key} type="button" className={`cl-calc-tier ${tierKey === t.key ? 'on' : ''}`} onClick={() => pickTier(t.key)}>{t.name}</button>
          ))}
        </div>
        <label className="cl-calc-toggle">
          <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} />
          Bill yearly <span className="cl-calc-save">(save 15%)</span>
        </label>
      </div>

      <label className="cl-calc-slider-label" style={{ display: 'block', marginBottom: 10 }}>
        Pick your suites — <strong>{suiteCount}</strong> selected ({tier.name} includes {tier.included})
      </label>
      <div className="cl-calc-suites">
        {SUITES.map((s) => {
          const meta = SUITE_META[s.key] || {};
          const on = selected.has(s.key);
          return (
            <button key={s.key} type="button" className={`cl-calc-suite ${on ? 'on' : ''}`} onClick={() => toggleSuite(s.key)}>
              <span className="cl-calc-suite-icon" style={{ background: on ? meta.tint : 'var(--line)' }}>
                <SuiteIcon name={meta.icon || 'grid'} size={16} color="#fff" />
              </span>
              {s.name}
            </button>
          );
        })}
      </div>

      <div className="cl-calc-row" style={{ marginTop: 18 }}>
        <label className="cl-calc-slider-label">
          How many staff? <strong>{staffCount}</strong>
        </label>
        <input type="range" min={1} max={200} value={staffCount} onChange={(e) => setStaffCount(Number(e.target.value))} className="cl-calc-slider" />
      </div>
      <div className="cl-calc-result">
        <div>
          <div className="cl-calc-total">{naira(total)}<small>{yearly ? '/yr' : '/mo'}</small></div>
          <div className="cl-calc-sub">
            {tier.name} — {tier.included} included{extra > 0 ? ` + ${extra} extra suite${extra === 1 ? '' : 's'} at ${naira(tier.extraFee)} each` : ''} + {staffCount} staff at {naira(PER_STAFF_FEE)} each
          </div>
        </div>
        <Link className="cl-btn cl-btn-primary" to={`/signup?plan=${tierKey}`}>Start with {tier.name}</Link>
      </div>
    </Reveal>
  );
}

const heroStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.11, delayChildren: 0.05 } },
};
const heroItem = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.2, 0.7, 0.3, 1] } },
};

const modules = [
  {
    name: 'People & Operations', status: 'live',
    desc: 'A directory with a full Employee 360 per person, company letters drafted by Collarone AI on your own letterhead, probation and disciplinary flows done properly, leave, tasks, the front desk and HR analytics.',
    suites: ['hr', 'leave', 'tasks', 'visitors', 'attendance', 'benefits', 'automation'],
  },
  {
    name: 'Money & Assets', status: 'live',
    desc: 'Payroll with real Nigerian statutory deductions, invoices and GRNs with your own letterhead, plus everything that keeps a business funded and equipped.',
    suites: ['payroll', 'finance', 'procurement', 'inventory', 'it-assets', 'trade-docs'],
  },
  {
    name: 'Customers & Growth', status: 'live',
    desc: 'A CRM with a naira-valued deals pipeline and WhatsApp-first activity log, plus projects, secure documents and your public website.',
    suites: ['crm', 'projects', 'documents'],
  },
];

const FAQ_CATS = ['All', 'General', 'Pricing', 'Product', 'Security'];
const faqs = [
  { cat: 'General', q: 'What is Collarone?', a: 'Collarone is a full business platform for Nigerian companies — HR, leave, tasks, visitor management, payroll, CRM, finance, projects, documents and more, all under one login, priced and billed in naira.' },
  { cat: 'Pricing', q: 'Is Collarone only for large companies?', a: 'No. Startup is ₦15,000 a month, includes any 3 suites of your choice, and every suite ships complete — not a stripped-down trial. Small teams get the same real directory, leave, tasks and visitor management as an Enterprise customer.' },
  { cat: 'Pricing', q: 'How much does Collarone cost?', a: 'Every tier is à la carte — pick whichever suites you need. Startup is ₦15,000/mo with 3 suites included (₦8,000 per extra suite). Standard is ₦25,000/mo with 5 included (₦6,000/extra). Enterprise is ₦45,000/mo with 8 included (₦4,000/extra). Every tier adds ₦2,000/staff, and paying yearly saves 15% off the total. Your rate locks in at sign-up. No dollar pricing, no forex markup.' },
  { cat: 'Product', q: 'Does Collarone include a website builder?', a: 'Yes, on every tier. Pick from 10 starter themes across online store, landing page and company-profile categories, edit every page and block directly, and already have a site? Just link it instead — no migration required.' },
  { cat: 'Product', q: 'Is there a CRM for managing customers?', a: 'Yes — contacts, companies and a WhatsApp-first activity log, live on every tier. An embeddable contact-form widget lets you capture leads from your own website too, straight into your CRM.' },
  { cat: 'Product', q: 'Can I manage staff leave and recruiting on Collarone?', a: 'Yes — leave management, task tracking, visitor management, recruiting with a public careers page, onboarding/offboarding, performance reviews and a compliance vault are all live suites you can pick from day one.' },
  { cat: 'Security', q: 'Is my company’s data secure?', a: 'Every screen checks who’s allowed to see it before showing anything, verified role by role, and every company\'s data is isolated from every other company\'s at the database level — verified directly, not just assumed.' },
  { cat: 'Product', q: 'Can Collarone write my company letters?', a: 'Yes. The HR Letters engine drafts confirmation, promotion, introduction, verification, query and warning letters — manually, from templates, or with Collarone AI — rendered live on your letterhead with your logo and authorized signature, auto-numbered, and filed into Documents automatically.' },
  { cat: 'Product', q: 'What about payroll?', a: 'Payroll is live — Nigerian PAYE, Pension, NHF and NSITF, configurable rate packs, and a Banking Wall so whoever liaises with your bank always knows what\'s new. It never touches your bank account directly — Collarone prepares the disbursement, your bank executes it.' },
  { cat: 'Product', q: 'Can I generate invoices and automate follow-ups?', a: 'Yes — Trade Documents generates sequential invoices, receipts, GRNs and stock release passes with your own logo, address and signature on a choice of 6 templates. Automation runs daily checks across your other suites — low-stock alerts, overdue-invoice reminders, new-lead follow-up tasks and more — and can optionally draft the follow-up message for you.' },
  { cat: 'General', q: 'How long does it take to get started?', a: 'During early access, we set up your space personally — reach out on WhatsApp or email and we’ll have your business live the same day.' },
  { cat: 'Pricing', q: 'Is there a contract or can I cancel anytime?', a: 'Collarone is billed monthly (or yearly, for 15% off) with no long-term contract. Your locked-in rate never changes even if our published prices do.' },
];

export default function Landing() {
  const reduce = useReducedMotion();
  const heroTextProps = reduce
    ? {}
    : { variants: heroStagger, initial: 'hidden', animate: 'show' };
  const heroItemVariants = reduce ? {} : { variants: heroItem };
  const heroShotProps = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 28, scale: 0.96, rotate: 1.5 },
        animate: { opacity: 1, y: 0, scale: 1, rotate: 0 },
        transition: { duration: 0.9, delay: 0.3, ease: [0.16, 0.8, 0.2, 1] },
      };

  const [scrolled, setScrolled] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [walkIdx, setWalkIdx] = useState(0);
  const [walkAuto, setWalkAuto] = useState(true);
  const walkDir = useRef(1);            // which way the stage slides
  const walkTabRefs = useRef([]);
  const goWalk = (next, manual = false) => {
    setWalkIdx((cur) => {
      const n = typeof next === 'function' ? next(cur) : next;
      const len = GALLERY_SHOTS.length;
      walkDir.current = ((n - cur + len) % len) <= len / 2 ? 1 : -1;
      return n;
    });
    if (manual) setWalkAuto(false);
  };
  // Guided tour auto-advances only while the section is on screen and until
  // the visitor takes over — advancing (and gliding tabs) off-screen was
  // scrolling the page around underneath people.
  const [walkVisible, setWalkVisible] = useState(false);
  useEffect(() => {
    const sec = document.getElementById('gallery');
    if (!sec || typeof IntersectionObserver === 'undefined') { setWalkVisible(true); return undefined; }
    const io = new IntersectionObserver(([e]) => setWalkVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(sec);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (reduce || !walkAuto || !walkVisible) return undefined;
    const t = setInterval(() => goWalk((x) => (x + 1) % GALLERY_SHOTS.length), 5000);
    return () => clearInterval(t);
  }, [reduce, walkAuto, walkVisible]); // eslint-disable-line
  // Mobile: glide the ACTIVE pill to the strip's centre by scrolling the
  // strip itself — never scrollIntoView, which also scrolls the page.
  useEffect(() => {
    const el = walkTabRefs.current[walkIdx];
    const strip = el?.parentElement;
    if (el && strip && strip.scrollWidth > strip.clientWidth + 4) {
      strip.scrollTo({ left: el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [walkIdx, reduce]);
  const [faqCat, setFaqCat] = useState('All');
  const visibleFaqs = faqCat === 'All' ? faqs : faqs.filter((f) => f.cat === faqCat);
  useEffect(() => {
    if (lightboxIdx === null) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightboxIdx(null);
      if (e.key === 'ArrowLeft') setLightboxIdx((i) => (i - 1 + GALLERY_SHOTS.length) % GALLERY_SHOTS.length);
      if (e.key === 'ArrowRight') setLightboxIdx((i) => (i + 1) % GALLERY_SHOTS.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIdx]);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (v) => { setScrolled(v > 10); setPastHero(v > 520); });

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
      <nav className={`cl-nav${(pastHero || navOpen) ? ' cl-nav-scrolled' : ' cl-nav-ondark'}${navOpen ? ' cl-nav-open' : ''}`}>
        <div className="cl-wrap">
          <a className="cl-brand" href="#top">
            <Mark size={24} />
            <span className="cl-wm">Collar<em>One</em></span>
          </a>
          <div className="cl-navlinks">
            <a className="cl-nl cl-hide-sm" href="#platform">Platform</a>
            <a className="cl-nl cl-hide-sm" href="#pricing">Pricing</a>
            <a className="cl-nl cl-hide-sm" href="#about">About</a>
            <a className="cl-nl cl-hide-sm" href="#faq">FAQ</a>
            <Link className="cl-nl cl-hide-sm" to="/jobs">Jobs</Link>
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
              {[['#platform', 'Platform'], ['#gallery', 'Product tour'], ['#pricing', 'Pricing'], ['#about', 'About'], ['#faq', 'FAQ'], ['/jobs', 'Jobs board']].map(([href, label]) => (
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
            <motion.span {...heroItemVariants} className="cl-kicker"><span className="cl-dot" />Now onboarding early businesses</motion.span>
            <motion.h1 {...heroItemVariants}>Run your<br /><RotatingWord /><br /><span className="cl-grad-word">One login.</span></motion.h1>
            <motion.p {...heroItemVariants} className="cl-hero-sub">HR with an Employee 360 and AI-drafted company letters, payroll, CRM and your website — 16 live suites behind one login, priced in naira.</motion.p>
            <motion.div {...heroItemVariants} className="cl-hero-ctas">
              <Link className="cl-btn cl-btn-primary" to="/signup">Get started</Link>
              <a className="cl-btn cl-btn-ghost" href="#platform">See what's inside</a>
            </motion.div>
            <motion.div {...heroItemVariants} className="cl-chip-row">
              <span className="cl-chip">{I.people}Employee 360</span>
              <span className="cl-chip">{I.docSm}Letters with AI</span>
              <span className="cl-chip">{I.calendar}Track leave</span>
              <span className="cl-chip">{I.globe}Build your website</span>
            </motion.div>
          </motion.div>

          <div className="cl-hero-shot-wrap" style={{ perspective: 1100 }}>
            <motion.div className="cl-hero-shot" {...heroShotProps} style={reduce ? undefined : { rotateX: rx, rotateY: ry }}>
              <div className="cl-browser-bar">
                <span className="cl-dotb r" /><span className="cl-dotb y" /><span className="cl-dotb g" />
                <span className="cl-url">collarone.app/home</span>
              </div>
              <img className="cl-shot-img" src={shotHome} alt="Collarone — real product screenshot" loading="eager" />
            </motion.div>
            <motion.div
              className="cl-float-toast cl-toast-a"
              initial={reduce ? false : { opacity: 0, y: 16, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 1.15, duration: 0.55, ease: [0.16, 0.8, 0.2, 1] }}
            >
              <span className="cl-toast-ic ok">✓</span>
              <span><strong>Leave approved</strong><small>Bola A. · just now</small></span>
            </motion.div>
            <motion.div
              className="cl-float-toast cl-toast-b"
              initial={reduce ? false : { opacity: 0, y: 16, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 1.5, duration: 0.55, ease: [0.16, 0.8, 0.2, 1] }}
            >
              <span className="cl-toast-ic pay">{I.chat}</span>
              <span><strong>New lead: Chidinma O.</strong><small>via website · CRM</small></span>
            </motion.div>
          </div>
        </div>
      </header>

      <Marquee items={marqueeItems} dark />

      <section className="cl-trust" aria-label="Platform facts">
        <div className="cl-wrap cl-trust-row">
          <span className="cl-trust-cell"><strong>16</strong> suites live</span>
          <span className="cl-trust-dot" aria-hidden="true" />
          <span className="cl-trust-cell">One isolated workspace per company</span>
          <span className="cl-trust-dot" aria-hidden="true" />
          <span className="cl-trust-cell">Role-checked on every screen</span>
          <span className="cl-trust-dot" aria-hidden="true" />
          <span className="cl-trust-cell">Priced in naira — rate locked at sign-up</span>
        </div>
      </section>

      <section className="cl-sec" id="capabilities">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">Why it feels different</p>
            <h2 className="cl-sec-h">Built to feel obvious, not overwhelming</h2>
            <p className="cl-sec-lede">Every screen does one job well. No settings maze, no module you have to configure before it's useful.</p>
          </Reveal>
          <div className="cl-grid4 cl-process">
            <Reveal className="cl-process-card" hover><span className="cl-process-num">01</span><div className="cl-icon-wrap">{I.bolt}</div><h3>Set up in minutes</h3><p>Sign up, add your team, and your space is ready — no onboarding call required.</p></Reveal>
            <Reveal className="cl-process-card" delay={0.05} hover><span className="cl-process-num">02</span><div className="cl-icon-wrap">{I.shield}</div><h3>Access, done right</h3><p>Every screen checks who's allowed to see it — tested as different roles before anything ships.</p></Reveal>
            <Reveal className="cl-process-card" delay={0.1} hover><span className="cl-process-num">03</span><div className="cl-icon-wrap">{I.money}</div><h3>Priced in naira</h3><p>Pay by transfer or card, no forex markup, no bill that moves with the exchange rate.</p></Reveal>
            <Reveal className="cl-process-card" delay={0.15} hover><span className="cl-process-num">04</span><div className="cl-icon-wrap">{I.globeBig}</div><h3>Grows with you</h3><p>Start with a website and a staff list. Turn on leave, tasks and the rest the day you need them.</p></Reveal>
          </div>
        </div>
      </section>

      <section className="cl-sec cl-tint" id="platform">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">One platform</p>
            <h2 className="cl-sec-h">Everything a growing business runs on</h2>
            <p className="cl-sec-lede">Start with what you need today. The rest turns on the moment you're ready — same account, nothing to migrate.</p>
          </Reveal>
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
                    initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }}
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

      <section className="cl-sec cl-dark" id="gallery">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">A guided look — real screenshots, not mockups</p>
            <h2 className="cl-sec-h">This is the actual product</h2>
            <p className="cl-sec-lede">The same screens your team gets on day one. Click through the flagship work.</p>
          </Reveal>
          <Reveal className="cl-walk">
            <div className="cl-walk-tabs" role="tablist" aria-label="Product walkthrough">
              {GALLERY_SHOTS.map((shot, i) => (
                <button
                  key={shot.url} type="button" role="tab" aria-selected={i === walkIdx}
                  ref={(el) => { walkTabRefs.current[i] = el; }}
                  className={`cl-walk-tab ${i === walkIdx ? 'on' : ''}`}
                  onClick={() => goWalk(i, true)}
                >
                  <span className="cl-walk-tab-t">{shot.title}</span>
                  <span className="cl-walk-tab-d">{shot.caption}</span>
                  {i === walkIdx && walkAuto && !reduce && (
                    <motion.span key={`p${walkIdx}`} className="cl-walk-progress" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 5, ease: 'linear' }} />
                  )}
                </button>
              ))}
            </div>
            <div className="cl-walk-stage">
              <AnimatePresence mode="wait" custom={walkDir.current}>
                <motion.button
                  key={walkIdx} type="button" className="cl-gallery-shot-btn"
                  custom={walkDir.current}
                  onClick={() => { setLightboxIdx(walkIdx); setWalkAuto(false); }}
                  aria-label={`Preview: ${GALLERY_SHOTS[walkIdx].caption}`}
                  variants={{
                    enter: (dir) => ({ opacity: 0, x: 56 * dir, scale: 0.975 }),
                    center: { opacity: 1, x: 0, scale: 1 },
                    exit: (dir) => ({ opacity: 0, x: -56 * dir, scale: 0.975 }),
                  }}
                  initial="enter" animate="center" exit="exit"
                  transition={{ duration: 0.45, ease: [0.32, 0.72, 0.24, 1] }}
                >
                  <div className="cl-browser-bar"><span className="cl-dotb r" /><span className="cl-dotb y" /><span className="cl-dotb g" /><span className="cl-url">{GALLERY_SHOTS[walkIdx].url}</span></div>
                  <div className="cl-shot-img-wrap">
                    <img className="cl-shot-img" src={GALLERY_SHOTS[walkIdx].src} alt={GALLERY_SHOTS[walkIdx].caption} loading="lazy" />
                    <span className="cl-gallery-zoom">{I.expand}</span>
                  </div>
                </motion.button>
              </AnimatePresence>
            </div>
          </Reveal>
        </div>
      </section>

      {lightboxIdx !== null && (
        <div className="cl-lightbox" onClick={() => setLightboxIdx(null)}>
          <button type="button" className="cl-lightbox-close" onClick={() => setLightboxIdx(null)} aria-label="Close preview">{I.close}</button>
          <button
            type="button" className="cl-lightbox-nav cl-lightbox-prev" aria-label="Previous screenshot"
            onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => (i - 1 + GALLERY_SHOTS.length) % GALLERY_SHOTS.length); }}
          >{I.arrowLeft}</button>
          <div className="cl-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <div className="cl-browser-bar"><span className="cl-dotb r" /><span className="cl-dotb y" /><span className="cl-dotb g" /><span className="cl-url">{GALLERY_SHOTS[lightboxIdx].url}</span></div>
            <img className="cl-lightbox-img" src={GALLERY_SHOTS[lightboxIdx].src} alt={GALLERY_SHOTS[lightboxIdx].caption} />
            <div className="cl-lightbox-caption">{GALLERY_SHOTS[lightboxIdx].caption}</div>
          </div>
          <button
            type="button" className="cl-lightbox-nav cl-lightbox-next" aria-label="Next screenshot"
            onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => (i + 1) % GALLERY_SHOTS.length); }}
          >{I.arrowRight}</button>
        </div>
      )}

      <section className="cl-sec" id="nigeria">
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

      <section className="cl-sec cl-tint" id="pricing">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">Pricing</p>
            <h2 className="cl-sec-h">Pick your suites. Pick your tier.</h2>
            <p className="cl-sec-lede">Every tier is à la carte — choose exactly the suites your business needs on any of them. Tiers differ in how many suites are included, your base fee, and support level, not in what you're allowed to use. No forex markup, no dollar pricing, and your rate locks in at sign-up.</p>
          </Reveal>
          <div className="cl-grid3">
            {[
              {
                key: 'startup', name: 'Startup', price: '15,000', included: 3, extra: '8,000',
                pills: ['3 suites included', 'Standard support'],
                rows: [['Suites of your choice', 'any 3'], ['Extra suite', '₦8,000/mo'], ['Per staff member', '₦2,000/mo'], ['Add more suites', 'anytime']],
                quote: 'For a small team getting its operations out of spreadsheets and WhatsApp groups.',
                cta: ['Start your space', '/signup?plan=startup', false],
              },
              {
                key: 'standard', name: 'Standard', price: '25,000', included: 5, extra: '6,000', featured: true,
                pills: ['5 suites included', 'Priority support'],
                rows: [['Suites of your choice', 'any 5'], ['Extra suite', '₦6,000/mo'], ['Per staff member', '₦2,000/mo'], ['Add more suites', 'anytime']],
                quote: 'What most growing companies land on — people, money and customers in one place.',
                cta: ['Get started', '/signup?plan=standard', true],
              },
              {
                key: 'enterprise', name: 'Enterprise', price: '45,000', included: 8, extra: '4,000',
                pills: ['8 suites included', 'Dedicated onboarding'],
                rows: [['Suites of your choice', 'any 8'], ['Extra suite', '₦4,000/mo'], ['Per staff member', '₦2,000/mo'], ['Custom work', 'scoped & quoted']],
                quote: 'For established businesses standardising how they run across branches and states.',
                cta: ['Talk to us', '#contact', false],
              },
            ].map((p, i) => (
              <Reveal className={`cl-pc${p.featured ? ' cl-pc-feat' : ''}`} key={p.key} delay={i * 0.06}>
                {p.featured && <span className="cl-pc-badge">What most companies need</span>}
                <div className="cl-pc-plan">{p.name}</div>
                <div className="cl-pc-amt">₦{p.price}<span className="cl-pc-per">/mo</span></div>
                <div className="cl-pc-pills">
                  {p.pills.map((pill, j) => <span key={pill} className={`cl-pc-pill${j === 0 ? ' solid' : ''}`}>{pill}</span>)}
                </div>
                <div className="cl-pc-rows">
                  {p.rows.map(([label, val]) => (
                    <div className="cl-pc-row" key={label}><span className="cl-pc-check">{I.check}</span><span>{label}</span><em /><strong>{val}</strong></div>
                  ))}
                </div>
                <p className="cl-pc-quote">{p.quote}</p>
                {p.cta[1].startsWith('#')
                  ? <a className={`cl-btn cl-pc-btn${p.cta[2] ? ' cl-btn-primary' : ''}`} href={p.cta[1]}>{p.cta[0]}</a>
                  : <Link className={`cl-btn cl-pc-btn${p.cta[2] ? ' cl-btn-primary' : ''}`} to={p.cta[1]}>{p.cta[0]}</Link>}
              </Reveal>
            ))}
          </div>
          <PriceCalculator />
          <p className="cl-price-note">Pay yearly and save 15% off the total. Your base fee and per-suite rate both lock in at sign-up — they don't change later even if our published prices do.</p>
        </div>
      </section>

      <section className="cl-sec" id="about">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">How we started</p>
            <h2 className="cl-sec-h">Built in Nigeria, for businesses across Nigeria</h2>
          </Reveal>
          <div className="cl-about-grid">
            <Reveal className="cl-about-copy">
              <p>Collarone didn't start as a plan for a "business platform." It started as a tool built to solve one real problem for one real Nigerian business — watching what actually broke, what actually got used, and what a Nigerian back office genuinely needed on an ordinary working day.</p>
              <blockquote className="cl-about-pullquote">Why should only one company have this?</blockquote>
              <p>That's what Collarone is now — built for the Nigerian businesses quietly outgrowing spreadsheets and WhatsApp groups, tired of paying for software that was never built with a single Nigerian working day in mind. Whether you're a startup finding your feet, a growing company standardising how you run, or an established business scaling across states, we're building this for how Nigerian companies actually operate — remote, hybrid and on-site teams alike. Real business software, priced and built like it belongs here. Because it does.</p>
            </Reveal>
            <Reveal className="cl-founder-card" delay={0.1}>
              <div className="cl-founder-avatar">AP</div>
              <div className="cl-founder-name">Aniebiet Pius</div>
              <div className="cl-founder-role">Founder, Collarone</div>
              <div className="cl-founder-stats">
                <div><strong>2026</strong><small>Founded</small></div>
                <div><strong>16</strong><small>Suites live</small></div>
              </div>
              <div className="cl-founder-loc">{I.pin}Nigeria</div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="cl-sec cl-tint" id="faq">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">Questions</p>
            <h2 className="cl-sec-h">Everything business owners ask us</h2>
          </Reveal>
          <div className="cl-faq-tabs">
            {FAQ_CATS.map((c) => (
              <button key={c} type="button" className={`cl-faq-tab${faqCat === c ? ' on' : ''}`} onClick={() => setFaqCat(c)}>
                {c}{c !== 'All' && <span className="cl-faq-tab-count">{faqs.filter((f) => f.cat === c).length}</span>}
              </button>
            ))}
          </div>
          <Reveal className="cl-faq-list" key={faqCat}>
            {visibleFaqs.map((f, i) => (
              <details className="cl-faq-item" key={f.q}>
                <span className="cl-faq-num">{String(i + 1).padStart(2, '0')}</span>
                <summary>{f.q}<span className="cl-chev">{I.chev}</span></summary>
                <div className="cl-faq-a">{f.a}</div>
              </details>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="cl-sec" id="contact" style={{ paddingTop: 0 }}>
        <div className="cl-wrap">
          <Reveal className="cl-contact-card cl-dark-card">
            <h2>Let's get your business on Collarone.</h2>
            <p>Tell us about your business and we'll set up your space personally — no queue during early access.</p>
            <div className="cl-contact-row">
              <a className="cl-btn cl-btn-primary" href="mailto:hello@collarone.app?subject=Early%20access">Email hello@collarone.app</a>
              <a className="cl-btn cl-btn-ghost" href="https://wa.me/2348148128551" target="_blank" rel="noreferrer">Chat on WhatsApp</a>
              <a className="cl-btn cl-btn-ghost" href="tel:+2348148128551">Call 0814 812 8551</a>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="cl-footer">
        <div className="cl-wrap">
          <div className="cl-footer-top">
            <div className="cl-footer-col cl-footer-about">
              <div className="cl-footer-brand">
                <Mark size={20} />
                <span>Collar<em>One</em></span>
              </div>
              <p>The business platform for Nigerian companies — team, leave, tasks and front desk today, customers and your website joining the same space. Built and supported in Nigeria.</p>
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
              <a href="#about">About</a>
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

      {/* Collarone assistant — AI chat grounded in the business, with a
          talk-to-a-human hand-off to WhatsApp, phone or the contact desk. */}
      <ChatWidget visible={pastHero} />
    </div>
  );
}
