// Shared public-site chrome (nav + footer) so interior pages — the jobs board,
// individual job posts, the post-a-job page — match the landing instead of each
// rolling its own. Reuses the landing's cl-nav / cl-footer styles.
import { Link } from 'react-router-dom';
import logoMark from '../assets/collarone-mark.svg';
import '../pages/Landing.css';

export function PublicNav({ active }) {
  const jobsActive = active === 'jobs';
  return (
    <header className="cl-nav cl-nav-scrolled">
      <div className="cl-wrap">
        <Link to="/" className="cl-brand">
          <img src={logoMark} alt="" width={24} height={24} style={{ display: 'block' }} />
          <span className="cl-wm">Collar<em>One</em></span>
        </Link>
        <div className="cl-navlinks">
          <a className="cl-nl cl-hide-sm" href="/#platform">Platform</a>
          <a className="cl-nl cl-hide-sm" href="/#pricing">Pricing</a>
          <Link className="cl-nl" to="/jobs" aria-current={jobsActive ? 'page' : undefined}
            style={jobsActive ? { color: 'var(--text)', fontWeight: 600 } : undefined}>Jobs board</Link>
          <Link className="cl-nl cl-hide-sm" to="/login">Sign in</Link>
          <Link to="/jobs/post" className="cl-btn cl-btn-primary cl-btn-sm">Post a job</Link>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="cl-footer">
      <div className="cl-wrap">
        <div className="cl-footer-top">
          <div className="cl-footer-col cl-footer-about">
            <div className="cl-footer-brand">
              <img src={logoMark} alt="" width={20} height={20} style={{ display: 'block' }} />
              <span>Collar<em>One</em></span>
            </div>
            <p>The business platform for Nigerian companies, team, leave, tasks and front desk today, customers and your website joining the same space. Built and supported in Nigeria.</p>
            <div className="cl-footer-contact">
              <a href="https://wa.me/2348148128551" target="_blank" rel="noreferrer">WhatsApp</a>
              <a href="mailto:hello@collarone.app">hello@collarone.app</a>
            </div>
          </div>
          <div className="cl-footer-col">
            <div className="cl-footer-h">Platform</div>
            <a href="/#platform">What&apos;s inside</a>
            <a href="/#pricing">Pricing</a>
            <a href="/#faq">FAQ</a>
            <Link to="/login">Sign in</Link>
          </div>
          <div className="cl-footer-col">
            <div className="cl-footer-h">Jobs</div>
            <Link to="/jobs">Jobs board</Link>
            <Link to="/jobs/post">Post a job, free</Link>
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
          <div className="cl-footer-loc">Nigeria</div>
        </div>
      </div>
    </footer>
  );
}
