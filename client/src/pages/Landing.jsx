import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useTransform, useMotionValue, useSpring, useMotionValueEvent } from 'framer-motion';
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

function Marquee({ items }) {
  return (
    <div className="cl-marquee">
      <div className="cl-marquee-track">
        {[...items, ...items].map((t, i) => (
          <span className="cl-marquee-item" key={i}>{t}<span className="cl-marquee-dot">•</span></span>
        ))}
      </div>
    </div>
  );
}

const marqueeItems = ['Staff Directory', 'Leave Management', 'Task Tracking', 'Visitor Sign-in', 'Recruiting & Careers', 'Onboarding', 'Performance Reviews', 'Compliance Vault', 'Payroll — PAYE · Pension · NHF', 'Customer CRM', 'Website Builder'];

const PRICE_TIERS = [
  { key: 'startup', name: 'Startup', baseFee: 15000, included: 3, extraFee: 8000 },
  { key: 'standard', name: 'Standard', baseFee: 25000, included: 5, extraFee: 6000 },
  { key: 'enterprise', name: 'Enterprise', baseFee: 45000, included: 8, extraFee: 4000 },
];
const TOTAL_SUITES = 14;
const ANNUAL_DISCOUNT = 0.15;
const PER_STAFF_FEE = 2000;
const naira = (n) => `₦${Math.round(n).toLocaleString('en-NG')}`;

function PriceCalculator() {
  const [tierKey, setTierKey] = useState('standard');
  const [suiteCount, setSuiteCount] = useState(5);
  const [staffCount, setStaffCount] = useState(10);
  const [yearly, setYearly] = useState(false);
  const tier = PRICE_TIERS.find((t) => t.key === tierKey);
  const extra = Math.max(0, suiteCount - tier.included);
  const monthly = tier.baseFee + extra * tier.extraFee + staffCount * PER_STAFF_FEE;
  const total = yearly ? monthly * 12 * (1 - ANNUAL_DISCOUNT) : monthly;

  const pickTier = (key) => {
    setTierKey(key);
    setSuiteCount(PRICE_TIERS.find((t) => t.key === key).included);
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
      <div className="cl-calc-row">
        <label className="cl-calc-slider-label">
          How many suites do you need? <strong>{suiteCount}</strong> of {TOTAL_SUITES}
        </label>
        <input type="range" min={1} max={TOTAL_SUITES} value={suiteCount} onChange={(e) => setSuiteCount(Number(e.target.value))} className="cl-calc-slider" />
      </div>
      <div className="cl-calc-row">
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
    desc: 'Directory, recruiting, leave, tasks and the front desk — the daily running of a business, proven in production.',
    items: ['Staff directory, org chart, self-service profiles', 'Leave requests, task tracking, visitor sign-in', 'Public careers page — candidates apply, no login', 'Payroll, performance reviews and more, rolling out as each is proven'],
  },
  {
    name: 'Customers', status: 'soon',
    desc: 'A CRM that treats a WhatsApp conversation as real customer activity, not an afterthought.',
    items: ['Contacts, companies and deals in naira', 'Every conversation logged where it happens', 'Payments collected through Paystack'],
  },
  {
    name: 'Your Website', status: 'soon',
    desc: 'A real public site for the business that doesn’t have one yet, from the same account.',
    items: ['About, services and contact — live in minutes', 'The same engine behind our own careers pages', 'Bring your own domain when you’re ready'],
  },
];

const faqs = [
  { q: 'What is Collarone?', a: 'Collarone is a business platform for Nigerian companies — your team, leave, tasks and front desk in one place, with a customer CRM and website builder joining soon. All under one login, priced and billed in naira.' },
  { q: 'Is Collarone only for large companies?', a: 'No. Starter is ₦10,000 a month plus ₦1,000 per staff member, and it ships with the full People &amp; Operations suite — not a stripped-down trial. Small teams get the same directory, leave, tasks and visitor management as everyone else.' },
  { q: 'How much does Collarone cost?', a: 'Starter is ₦10,000/month + ₦1,000/staff. Growth is ₦18,000/month + ₦1,500/staff. Scale is ₦30,000/month + ₦2,000/staff. Every plan bundles whole suites rather than splitting features across tiers, and both your base fee and per-seat rate are locked in at sign-up. No dollar pricing, no forex markup.' },
  { q: 'Does Collarone include a website builder?', a: 'Yes, on every plan including Starter. It’s the same engine behind our own public careers pages — about, services and contact pages live in minutes, with your own domain when you’re ready.' },
  { q: 'Is there a CRM for managing customers?', a: 'A customer CRM is coming soon on the Growth plan and above — contacts, companies and deals in naira, with WhatsApp conversations logged as real customer activity.' },
  { q: 'Can I manage staff leave and recruiting on Collarone?', a: 'Yes — leave management, task tracking, visitor management, recruiting with a public careers page, and onboarding/offboarding workflows are all included from Starter, the day you sign up. This is what Collarone runs on today.' },
  { q: 'Is my company’s data secure?', a: 'Every screen checks who’s allowed to see it before showing anything, verified role by role before it ships.' },
  { q: 'What about payroll?', a: 'Payroll — with Nigerian PAYE, Pension, NHF and NSITF built in — is in testing and opening to pilot businesses soon. It’s part of the Scale plan once it’s out, not something we’re rushing out untested. When it is, it never touches your bank account directly — Collarone prepares the disbursement, your bank or payment provider executes it.' },
  { q: 'How long does it take to get started?', a: 'During early access, we set up your space personally — reach out on WhatsApp or email and we’ll have your business live the same day.' },
  { q: 'Is there a contract or can I cancel anytime?', a: 'Collarone is billed monthly with no long-term contract. Pricing scales with your active staff count, so your bill goes up or down as your team does — and your locked-in rate never changes.' },
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
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 10));

  const heroRef = useRef(null);
  const [glowOn, setGlowOn] = useState(false);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const gx = useSpring(mx, { stiffness: 110, damping: 22, mass: 0.5 });
  const gy = useSpring(my, { stiffness: 110, damping: 22, mass: 0.5 });
  const handleHeroMove = (e) => {
    if (reduce || !heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    mx.set(e.clientX - rect.left);
    my.set(e.clientY - rect.top);
  };

  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const o1y = useTransform(heroProgress, [0, 1], [0, -70]);
  const o2y = useTransform(heroProgress, [0, 1], [0, -30]);
  const o3y = useTransform(heroProgress, [0, 1], [0, -120]);

  return (
    <div className="cl">
      <nav className={`cl-nav${scrolled ? ' cl-nav-scrolled' : ''}`}>
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
            <Link className="cl-nl" to="/login">Sign in</Link>
            <Link className="cl-btn cl-btn-primary cl-btn-sm" to="/signup">Get started</Link>
          </div>
        </div>
      </nav>

      <header
        className="cl-hero"
        id="top"
        ref={heroRef}
        onMouseMove={handleHeroMove}
        onMouseEnter={() => setGlowOn(true)}
        onMouseLeave={() => setGlowOn(false)}
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
            <motion.h1 {...heroItemVariants}>Run your whole business.<br /><span className="cl-grad-word">One login.</span></motion.h1>
            <motion.p {...heroItemVariants} className="cl-hero-sub">Your team, leave, tasks and front desk — proven and live today, with customers and your website joining the same space.</motion.p>
            <motion.div {...heroItemVariants} className="cl-hero-ctas">
              <Link className="cl-btn cl-btn-primary" to="/signup">Get started</Link>
              <a className="cl-btn cl-btn-ghost" href="#platform">See what's inside</a>
            </motion.div>
            <motion.div {...heroItemVariants} className="cl-chip-row">
              <span className="cl-chip">{I.people}Manage your team</span>
              <span className="cl-chip">{I.calendar}Track leave</span>
              <span className="cl-chip">{I.chat}Manage customers</span>
              <span className="cl-chip">{I.globe}Build your website</span>
            </motion.div>
          </motion.div>

          <motion.div className="cl-hero-shot" {...heroShotProps}>
            <div className="cl-browser-bar">
              <span className="cl-dotb r" /><span className="cl-dotb y" /><span className="cl-dotb g" />
              <span className="cl-url">collarone.app/home</span>
            </div>
            <div className="cl-mock">
              <div className="cl-mtitle">Good morning, Amaka</div>
              <div className="cl-mock-cards">
                <div className="cl-mc"><div className="cl-mv">248</div><div className="cl-ml">Active staff</div></div>
                <div className="cl-mc"><div className="cl-mv">12</div><div className="cl-ml">On leave</div></div>
                <div className="cl-mc"><div className="cl-mv">5</div><div className="cl-ml">Visitors today</div></div>
              </div>
              <div className="cl-mock-table">
                <div className="cl-mock-row"><div className="cl-mock-avatar" /><div className="cl-mock-bar" /><span className="cl-mock-badge">Approved</span></div>
                <div className="cl-mock-row"><div className="cl-mock-avatar" /><div className="cl-mock-bar" style={{ maxWidth: 90 }} /><span className="cl-mock-badge">Approved</span></div>
                <div className="cl-mock-row"><div className="cl-mock-avatar" /><div className="cl-mock-bar" style={{ maxWidth: 110 }} /><span className="cl-mock-badge">Approved</span></div>
              </div>
            </div>
          </motion.div>
        </div>
      </header>

      <Marquee items={marqueeItems} />

      <section className="cl-sec" id="capabilities">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">Why it feels different</p>
            <h2 className="cl-sec-h">Built to feel obvious, not overwhelming</h2>
            <p className="cl-sec-lede">Every screen does one job well. No settings maze, no module you have to configure before it's useful.</p>
          </Reveal>
          <div className="cl-grid4">
            <Reveal className="cl-card" hover><div className="cl-icon-wrap">{I.bolt}</div><h3>Set up in minutes</h3><p>Sign up, add your team, and your space is ready — no onboarding call required.</p></Reveal>
            <Reveal className="cl-card" delay={0.05} hover><div className="cl-icon-wrap">{I.shield}</div><h3>Access, done right</h3><p>Every screen checks who's allowed to see it — tested as different roles before anything ships.</p></Reveal>
            <Reveal className="cl-card" delay={0.1} hover><div className="cl-icon-wrap">{I.money}</div><h3>Priced in naira</h3><p>Pay by transfer or card, no forex markup, no bill that moves with the exchange rate.</p></Reveal>
            <Reveal className="cl-card" delay={0.15} hover><div className="cl-icon-wrap">{I.globeBig}</div><h3>Grows with you</h3><p>Start with a website and a staff list. Turn on leave, tasks and the rest the day you need them.</p></Reveal>
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
          <div className="cl-grid3">
            {modules.map((m, i) => (
              <Reveal className="cl-module-card" key={m.name} delay={i * 0.06} hover>
                <div className="cl-module-head"><h3>{m.name}</h3><span className={`cl-pill ${m.status}`}>{m.status === 'live' ? 'Live' : 'Coming soon'}</span></div>
                <p style={{ fontSize: 14, color: 'var(--text-soft)', margin: 0 }}>{m.desc}</p>
                <ul>{m.items.map((it) => <li key={it}>{it}</li>)}</ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="cl-sec" id="nigeria">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">Not translated. Built here.</p>
            <h2 className="cl-sec-h">Nigerian business, from the ground up</h2>
            <p className="cl-sec-lede">These aren't global defaults with a naira sign added on.</p>
          </Reveal>
          <Reveal className="cl-stat-band">
            <div className="cl-stat-cell"><div className="cl-val">₦</div><div className="cl-lbl">Priced and billed in naira, no card from abroad required</div></div>
            <div className="cl-stat-cell"><div className="cl-val">36+1</div><div className="cl-lbl">Built to work the same in every Nigerian state, Lagos to Maiduguri</div></div>
            <div className="cl-stat-cell"><div className="cl-val">24/7</div><div className="cl-lbl">Your team, leave and front desk, live and checkable from your phone</div></div>
            <div className="cl-stat-cell"><div className="cl-val">🇳🇬</div><div className="cl-lbl">Designed, built and supported in Nigeria, for Nigerian business hours</div></div>
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
            <Reveal className="cl-price-card" hover>
              <div className="cl-price-plan">STARTUP</div>
              <div className="cl-price-amt">₦15,000<small>/mo</small></div>
              <div className="cl-price-sub">3 suites included · +₦8,000/extra suite · +₦2,000/staff</div>
              <ul><li>Any 3 suites of your choice</li><li>Standard support</li><li>Add more suites anytime</li></ul>
              <Link className="cl-btn cl-btn-ghost" to="/signup?plan=startup">Start your space</Link>
            </Reveal>
            <Reveal className="cl-price-card cl-feat" delay={0.06} hover>
              <span className="cl-price-badge">What most companies need</span>
              <div className="cl-price-plan">STANDARD</div>
              <div className="cl-price-amt">₦25,000<small>/mo</small></div>
              <div className="cl-price-sub">5 suites included · +₦6,000/extra suite · +₦2,000/staff</div>
              <ul><li>Any 5 suites of your choice</li><li>Priority support</li><li>Add more suites anytime</li></ul>
              <Link className="cl-btn cl-btn-primary" to="/signup?plan=standard">Get started</Link>
            </Reveal>
            <Reveal className="cl-price-card" delay={0.12} hover>
              <div className="cl-price-plan">ENTERPRISE</div>
              <div className="cl-price-amt">₦45,000<small>/mo</small></div>
              <div className="cl-price-sub">8 suites included · +₦4,000/extra suite · +₦2,000/staff</div>
              <ul><li>Any 8 suites of your choice</li><li>Dedicated onboarding &amp; support</li><li>Request custom work — we'll scope and quote it</li></ul>
              <a className="cl-btn cl-btn-ghost" href="#contact">Talk to us</a>
            </Reveal>
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
              <p>Once it worked, the next question was obvious: why should only one company have this?</p>
              <p>That's what Collarone is now — built for the Nigerian businesses quietly outgrowing spreadsheets and WhatsApp groups, tired of paying for software that was never built with a single Nigerian working day in mind. Whether you're a startup finding your feet, a growing company standardising how you run, or an established business scaling across states, we're building this for how Nigerian companies actually operate — remote, hybrid and on-site teams alike. Real business software, priced and built like it belongs here. Because it does.</p>
            </Reveal>
            <Reveal className="cl-founder-card" delay={0.1}>
              <div className="cl-founder-avatar">AP</div>
              <div className="cl-founder-name">Aniebiet Pius</div>
              <div className="cl-founder-role">Founder, Collarone</div>
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
          <Reveal className="cl-faq-list">
            {faqs.map((f) => (
              <details className="cl-faq-item" key={f.q}>
                <summary>{f.q}<span className="cl-chev">{I.chev}</span></summary>
                <div className="cl-faq-a">{f.a}</div>
              </details>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="cl-sec" id="contact" style={{ paddingTop: 0 }}>
        <div className="cl-wrap">
          <Reveal className="cl-contact-card">
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
              <a href="/careers">Careers</a>
              <a href="#contact">Contact us</a>
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
    </div>
  );
}
