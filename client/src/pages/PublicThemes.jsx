import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import PublicThemeGallery from '../components/PublicThemeGallery.jsx';
import './Landing.css';

const rise = { initial: { opacity: 0, y: 22 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-40px' }, transition: { duration: 0.55 } };

const STEPS = [
  { t: 'Pick a theme', d: 'Choose a look below — an online store, a landing page or a company profile. Every Collarone plan includes one.' },
  { t: 'Make it yours', d: 'Edit every heading, image, price and colour right on the page. No code and no designer — if you can fill a form, you can build it.' },
  { t: 'Add your content', d: 'Upload products with photos and prices, add pages like About or Contact, drop in your logo and phone number.' },
  { t: 'Go live', d: 'Publish and share the link, or point your own domain at it. Already have a site? Link it instead — no migration.' },
];

const IC = {
  chat: <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.9 8.9 0 0 1-4-.9L3 20l1-4.5A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z" />,
  bank: <><path d="M3 10 12 4l9 6" /><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18" /></>,
  card: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></>,
};

export default function PublicThemes() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="cl">
      <header className="cl-nav cl-nav-scrolled">
        <div className="cl-wrap">
          <Link to="/" className="cl-brand"><span className="cl-wm">Collar<em>One</em></span></Link>
          <div className="cl-navlinks">
            <a className="cl-nl cl-hide-sm" href="/#platform">Platform</a>
            <a className="cl-nl cl-hide-sm" href="/#pricing">Pricing</a>
            <a className="cl-nl cl-hide-sm" href="/#faq">FAQ</a>
            <a className="cl-nl" href="#themes-list" aria-current="page" style={{ color: 'var(--text)', fontWeight: 600 }}>Themes</a>
            <Link className="cl-nl cl-hide-sm" to="/login">Sign in</Link>
            <Link to="/signup" className="cl-btn cl-btn-primary cl-btn-sm">Get started</Link>
          </div>
        </div>
      </header>

      <section className="cl-sec tpg-hero">
        <div className="cl-wrap">
          <Link to="/" className="tpg-back">← Back to home</Link>
          <motion.h1 className="tpg-h1" {...rise}>A real website, included on every plan</motion.h1>
          <motion.p className="tpg-lede" {...rise}>Sell online, pitch your service, or introduce your company — pick a theme, make it yours in minutes, and let customers pay you the way that suits your business. Preview any one live below.</motion.p>
        </div>
      </section>

      <section className="cl-sec cl-tint">
        <div className="cl-wrap">
          <motion.div className="cl-sec-head" {...rise}>
            <p className="cl-eyebrow">How it works</p>
            <h2 className="cl-sec-h">From nothing to a live site in an afternoon</h2>
          </motion.div>
          <div className="tpg-steps">
            {STEPS.map((s, i) => (
              <motion.div className="tpg-step" key={s.t} {...rise} transition={{ duration: 0.5, delay: i * 0.06 }}>
                <div className="n">{i + 1}</div><h3>{s.t}</h3><p>{s.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="cl-sec" id="themes-list">
        <div className="cl-wrap">
          <motion.div className="cl-sec-head" {...rise}>
            <p className="cl-eyebrow">All the themes</p>
            <h2 className="cl-sec-h">Find the one that fits your business</h2>
            <p className="cl-sec-lede">Online stores sell products with a cart and checkout. Landing pages pitch one thing well. Company profiles introduce your business and services. Tap Preview on any theme to walk through it live with sample Nigerian content.</p>
          </motion.div>
          <PublicThemeGallery showFilters />
        </div>
      </section>

      <section className="cl-sec cl-tint">
        <div className="cl-wrap">
          <motion.div className="cl-sec-head" {...rise}>
            <p className="cl-eyebrow">Getting paid</p>
            <h2 className="cl-sec-h">Three ways customers can pay you</h2>
            <p className="cl-sec-lede">Start free with WhatsApp or transfer, and switch on card payments whenever you're ready.</p>
          </motion.div>
          <div className="tpg-pay">
            <motion.div className="tpg-pcard" {...rise}>
              <span className="ic" style={{ background: '#E6F8ED', color: '#12833F' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{IC.chat}</svg></span>
              <h3>Order on WhatsApp</h3>
              <p>The cheapest way to start, and zero setup. A customer taps checkout and their whole order opens as a ready-to-send WhatsApp message to you. You confirm and sort payment and delivery in the chat you already use.</p>
              <span className="tag" style={{ color: '#12833F' }}>No setup needed</span>
            </motion.div>
            <motion.div className="tpg-pcard" {...rise} transition={{ duration: 0.5, delay: 0.06 }}>
              <span className="ic" style={{ background: 'var(--surface-2)', color: 'var(--text)' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{IC.bank}</svg></span>
              <h3>Transfer or pay on delivery</h3>
              <p>Add your bank details and customers pay by transfer, or let them pay cash on delivery. Every order lands in your dashboard — you mark it paid when the money arrives.</p>
              <span className="tag" style={{ color: 'var(--text-soft)' }}>No setup needed</span>
            </motion.div>
            <motion.div className="tpg-pcard" {...rise} transition={{ duration: 0.5, delay: 0.12 }}>
              <span className="ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{IC.card}</svg></span>
              <h3>Card payment on your site</h3>
              <p>Customers pay by card, transfer or USSD right on your site, and the money settles straight to your bank. This one needs you to create a free <strong>Paystack</strong> account, copy your API keys, and paste them into Collarone → Settings → Payments.</p>
              <span className="tag" style={{ color: 'var(--accent-ink)' }}>Connect your Paystack</span>
            </motion.div>
          </div>
          <p className="tpg-note">Whichever you choose, <strong>Collarone never holds or moves your money.</strong> For card payments it flows directly through <strong>your own</strong> Paystack account into <strong>your own</strong> bank — we only show you what's been paid.</p>
        </div>
      </section>

      <section className="cl-sec" style={{ textAlign: 'center' }}>
        <div className="cl-wrap">
          <motion.h2 className="cl-sec-h" {...rise}>Ready to build yours?</motion.h2>
          <motion.p className="cl-sec-lede" {...rise} style={{ margin: '0 auto 26px' }}>Your website is included on every plan — one less bill, one less thing to outsource.</motion.p>
          <motion.div {...rise}><Link to="/signup" className="cl-btn cl-btn-primary">Get started</Link></motion.div>
        </div>
      </section>

      <footer style={{ textAlign: 'center', padding: '40px 20px', borderTop: '1px solid var(--line)', color: 'var(--text-faint)', fontSize: 13 }}>
        © {new Date().getFullYear()} Collarone · <Link to="/" style={{ color: 'inherit' }}>Home</Link>
      </footer>
    </div>
  );
}
