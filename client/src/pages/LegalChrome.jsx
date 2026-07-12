import { Link } from 'react-router-dom';

// Shared real header + footer for Terms/Privacy/Status — previously just a
// bare logo (no nav) and a single grey copyright line, easy to miss
// entirely as "chrome" at all. Reused across all three legal/status pages.
export function LegalNav() {
  return (
    <nav className="lg-nav">
      <div className="lg-nav-wrap">
        <Link to="/">
          <span className="lg-wm">Collar<em>One</em></span>
        </Link>
        <div className="lg-nav-links">
          <Link to="/" className="lg-nav-link">Home</Link>
          <Link to="/status" className="lg-nav-link">Status</Link>
          <Link to="/login" className="lg-nav-link">Sign in</Link>
          <Link to="/signup" className="lg-nav-cta">Get started</Link>
        </div>
      </div>
    </nav>
  );
}

export function LegalFooter() {
  return (
    <footer className="lg-foot">
      <div className="lg-foot-links">
        <Link to="/terms">Terms</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/status">Status</Link>
        <a href="https://wa.me/2348148128551" target="_blank" rel="noreferrer">WhatsApp</a>
      </div>
      <div className="lg-foot-copy">© 2026 Collarone. Made for Nigerian business.</div>
    </footer>
  );
}
