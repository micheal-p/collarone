import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
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

function Reveal({ children, delay = 0, className }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.7, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

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
  { q: 'Is Collarone only for large companies?', a: 'No. The Starter plan is free for businesses with up to 10 people and includes a website and staff directory. You upgrade only when you actually need the rest.' },
  { q: 'How much does Collarone cost?', a: 'Starter is free for up to 10 staff. Growth is ₦350 per staff member per month. Scale is ₦1,050 per staff member per month — priced 47% below the Nigerian market rate, and your rate is locked in at sign-up. No dollar pricing, no forex markup.' },
  { q: 'Does Collarone include a website builder?', a: 'Yes, on every plan including Starter. It’s the same engine behind our own public careers pages — about, services and contact pages live in minutes, with your own domain when you’re ready.' },
  { q: 'Is there a CRM for managing customers?', a: 'A customer CRM is coming soon on the Growth plan and above — contacts, companies and deals in naira, with WhatsApp conversations logged as real customer activity.' },
  { q: 'Can I manage staff leave and recruiting on Collarone?', a: 'Yes — leave management, task tracking, visitor management, recruiting with a public careers page, and onboarding/offboarding workflows are all included from the Growth plan. This is what Collarone runs on today.' },
  { q: 'Is my company’s data secure?', a: 'Every screen checks who’s allowed to see it before showing anything, verified role by role before it ships.' },
  { q: 'What about payroll?', a: 'Payroll — with Nigerian PAYE, Pension, NHF and NSITF built in — is in testing and opening to pilot businesses soon. It’s part of the Scale plan once it’s out, not something we’re rushing out untested. When it is, it never touches your bank account directly — Collarone prepares the disbursement, your bank or payment provider executes it.' },
  { q: 'How long does it take to get started?', a: 'During early access, we set up your space personally — reach out on WhatsApp or email and we’ll have your business live the same day.' },
  { q: 'Is there a contract or can I cancel anytime?', a: 'Collarone is billed monthly with no long-term contract. Pricing scales with your active staff count, so your bill goes up or down as your team does — and your locked-in rate never changes.' },
];

export default function Landing() {
  return (
    <div className="cl">
      <nav className="cl-nav">
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
            <a className="cl-btn cl-btn-primary cl-btn-sm" href="#contact">Get started</a>
          </div>
        </div>
      </nav>

      <header className="cl-hero" id="top">
        <div className="cl-orb-field" aria-hidden="true">
          <div className="cl-orb o1" />
          <div className="cl-orb o2" />
          <div className="cl-orb o3" />
        </div>
        <div className="cl-wrap cl-hero-inner">
          <span className="cl-kicker"><span className="cl-dot" />Now onboarding early businesses</span>
          <h1>Run your whole business.<br /><span className="cl-grad-word">One login.</span></h1>
          <p className="cl-hero-sub">Your team, leave, tasks and front desk — proven and live today, with customers and your website joining the same space.</p>
          <div className="cl-hero-ctas">
            <a className="cl-btn cl-btn-primary" href="#contact">Get started free</a>
            <a className="cl-btn cl-btn-ghost" href="#platform">See what's inside</a>
          </div>
          <div className="cl-chip-row">
            <span className="cl-chip">{I.people}Manage your team</span>
            <span className="cl-chip">{I.calendar}Track leave</span>
            <span className="cl-chip">{I.chat}Manage customers</span>
            <span className="cl-chip">{I.globe}Build your website</span>
          </div>
        </div>

        <div className="cl-wrap">
          <Reveal className="cl-hero-shot">
            <div className="cl-browser-bar">
              <span className="cl-dotb r" /><span className="cl-dotb y" /><span className="cl-dotb g" />
              <span className="cl-url">collarone.app/home</span>
            </div>
            <div className="cl-mock">
              <div className="cl-mock-rail">
                <div className="cl-ritem active"><span className="cl-dot2" />Home</div>
                <div className="cl-ritem"><span className="cl-dot2" />People</div>
                <div className="cl-ritem"><span className="cl-dot2" />Leave</div>
                <div className="cl-ritem"><span className="cl-dot2" />Tasks</div>
                <div className="cl-ritem"><span className="cl-dot2" />Visitors</div>
              </div>
              <div>
                <div className="cl-mtitle">Good morning, Amaka</div>
                <div className="cl-mock-cards">
                  <div className="cl-mc"><div className="cl-mv">248</div><div className="cl-ml">Active staff</div></div>
                  <div className="cl-mc"><div className="cl-mv">12</div><div className="cl-ml">On leave this week</div></div>
                  <div className="cl-mc"><div className="cl-mv">5</div><div className="cl-ml">Visitors today</div></div>
                </div>
                <div className="cl-mock-table">
                  <div className="cl-mock-row"><div className="cl-mock-avatar" /><div className="cl-mock-bar" /><span className="cl-mock-badge">Approved</span></div>
                  <div className="cl-mock-row"><div className="cl-mock-avatar" /><div className="cl-mock-bar" style={{ maxWidth: 100 }} /><span className="cl-mock-badge">Approved</span></div>
                  <div className="cl-mock-row"><div className="cl-mock-avatar" /><div className="cl-mock-bar" style={{ maxWidth: 120 }} /><span className="cl-mock-badge">Approved</span></div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </header>

      <section className="cl-sec" id="capabilities">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">Why it feels different</p>
            <h2 className="cl-sec-h">Built to feel obvious, not overwhelming</h2>
            <p className="cl-sec-lede">Every screen does one job well. No settings maze, no module you have to configure before it's useful.</p>
          </Reveal>
          <div className="cl-grid4">
            <Reveal className="cl-card"><div className="cl-icon-wrap">{I.bolt}</div><h3>Set up in minutes</h3><p>Sign up, add your team, and your space is ready — no onboarding call required.</p></Reveal>
            <Reveal className="cl-card" delay={0.05}><div className="cl-icon-wrap">{I.shield}</div><h3>Access, done right</h3><p>Every screen checks who's allowed to see it — tested as different roles before anything ships.</p></Reveal>
            <Reveal className="cl-card" delay={0.1}><div className="cl-icon-wrap">{I.money}</div><h3>Priced in naira</h3><p>Pay by transfer or card, no forex markup, no bill that moves with the exchange rate.</p></Reveal>
            <Reveal className="cl-card" delay={0.15}><div className="cl-icon-wrap">{I.globeBig}</div><h3>Grows with you</h3><p>Start with a website and a staff list. Turn on leave, tasks and the rest the day you need them.</p></Reveal>
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
              <Reveal className="cl-module-card" key={m.name} delay={i * 0.06}>
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
            <div className="cl-stat-cell"><div className="cl-val">Eko</div><div className="cl-lbl">Designed and supported from Lagos, for Nigerian business hours</div></div>
          </Reveal>
        </div>
      </section>

      <section className="cl-sec cl-tint" id="pricing">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">Pricing</p>
            <h2 className="cl-sec-h">Pay for the team you have</h2>
            <p className="cl-sec-lede">We priced against the Nigerian market floor, then launched 47% below it. Sign up now and that rate is yours — locked in, even as our plans grow.</p>
          </Reveal>
          <div className="cl-grid3">
            <Reveal className="cl-price-card">
              <div className="cl-price-plan">STARTER</div>
              <div className="cl-price-amt">Free</div>
              <div className="cl-price-sub">Up to 10 people</div>
              <ul><li>Public website &amp; careers page</li><li>Staff directory &amp; org chart</li><li>Self-service profiles</li></ul>
              <a className="cl-btn cl-btn-ghost" href="#contact">Start free</a>
            </Reveal>
            <Reveal className="cl-price-card cl-feat" delay={0.06}>
              <span className="cl-price-badge">Founding rate</span>
              <div className="cl-price-plan">GROWTH</div>
              <div className="cl-price-amt">₦350<small>/staff/mo</small></div>
              <div className="cl-price-sub">Scales with your team, rate locked at sign-up</div>
              <ul><li>Everything in Starter</li><li>Leave, tasks, visitor management</li><li>Recruiting, onboarding &amp; offboarding</li><li>Customer &amp; sales CRM, once live</li></ul>
              <a className="cl-btn cl-btn-primary" href="#contact">Get started</a>
            </Reveal>
            <Reveal className="cl-price-card" delay={0.12}>
              <div className="cl-price-plan">SCALE</div>
              <div className="cl-price-amt">₦1,050<small>/staff/mo</small></div>
              <div className="cl-price-sub">47% below Nigerian market rate</div>
              <ul><li>Everything in Growth</li><li>Performance reviews &amp; compliance vault</li><li>Payroll, as it opens to pilot businesses</li><li>Priority support</li></ul>
              <a className="cl-btn cl-btn-ghost" href="#contact">Talk to us</a>
            </Reveal>
          </div>
          <p className="cl-price-note">Benchmarked against comparable Nigerian HR &amp; payroll software (~₦2,000/employee/month). Your per-seat rate stays fixed for as long as you stay with us — tiers and features can grow without your price jumping.</p>
        </div>
      </section>

      <section className="cl-sec" id="about">
        <div className="cl-wrap">
          <Reveal className="cl-sec-head">
            <p className="cl-eyebrow">How we started</p>
            <h2 className="cl-sec-h">Built in Eko, for businesses like the one we started with</h2>
          </Reveal>
          <div className="cl-about-grid">
            <Reveal className="cl-about-copy">
              <p>Collarone didn't start as a plan for a "business platform." It started as a tool built to solve one real problem for one real Nigerian business — watching what actually broke, what actually got used, and what a Lagos back office genuinely needed on an ordinary Monday.</p>
              <p>Once it worked, the next question was obvious: why should only one company have this?</p>
              <p>That's what Collarone is now — built in Lagos, for the Nigerian businesses quietly outgrowing spreadsheets and WhatsApp groups, tired of paying software bills that were never built with a single Nigerian working day in mind. We intend to bridge that gap directly: real business software, priced and built like it belongs here. Because it does.</p>
            </Reveal>
            <Reveal className="cl-founder-card" delay={0.1}>
              <div className="cl-founder-avatar">AP</div>
              <div className="cl-founder-name">Aniebiet Pius</div>
              <div className="cl-founder-role">Founder, Collarone</div>
              <div className="cl-founder-loc">{I.pin}Lagos (Eko), Nigeria</div>
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
          <div className="cl-footer-brand">
            <Mark size={18} />
            <span>Collar<em>One</em></span>
          </div>
          <div className="cl-footer-links">
            <Link to="/login">Sign in</Link>
          </div>
          <div className="cl-fnote">© 2026 Collarone. Made for Nigerian business.</div>
        </div>
      </footer>
    </div>
  );
}
