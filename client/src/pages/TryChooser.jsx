// /try — pick which suite to demo. Lists only the suites the platform admin
// has opened for public demo, then hands off to /try/:suiteKey. Wears the
// full site chrome (nav + footer + back link) like every other public page.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { SUITES, SUITE_META } from '../config/suites.js';
import SuiteIcon from '../components/SuiteIcon.jsx';
import { PublicFooter } from '../components/PublicChrome.jsx';
import './Landing.css';

export default function TryChooser() {
  const [keys, setKeys] = useState(null); // null = loading
  useEffect(() => {
    window.scrollTo(0, 0);
    supabase.from('platform_demo_suites').select('suite_key').eq('enabled', true)
      .then(({ data }) => setKeys((data || []).map((r) => r.suite_key).filter((k) => SUITES.some((s) => s.key === k))))
      .catch(() => setKeys([]));
  }, []);

  const suites = (keys || []).map((k) => SUITES.find((s) => s.key === k)).filter(Boolean);

  return (
    <div className="cl tpg">
      <header className="cl-nav cl-nav-scrolled">
        <div className="cl-wrap">
          <Link to="/" className="cl-brand"><span className="cl-wm">Collar<em>One</em></span></Link>
          <div className="cl-navlinks">
            <a className="cl-nl cl-hide-sm" href="/#platform">Platform</a>
            <a className="cl-nl cl-hide-sm" href="/#pricing">Pricing</a>
            <Link className="cl-nl cl-hide-sm" to="/themes">Themes</Link>
            <span className="cl-nl" aria-current="page" style={{ color: 'var(--text)', fontWeight: 600 }}>Try demo</span>
            <Link className="cl-nl cl-hide-sm" to="/login">Sign in</Link>
            <Link to="/signup" className="cl-btn cl-btn-primary cl-btn-sm">Get started</Link>
          </div>
        </div>
      </header>

      <section className="cl-sec tpg-hero">
        <div className="cl-wrap">
          <Link to="/" className="tpg-back">← Back to home</Link>
          <h1 className="tpg-h1">Pick a suite. Play with it.</h1>
          <p className="tpg-lede">
            Real screens, sample data, and a guided tour that explains everything — no sign-up, and you can&apos;t break anything.
          </p>
        </div>
      </section>

      <section className="cl-sec" style={{ paddingTop: 8 }}>
        <div className="cl-wrap" style={{ maxWidth: 1000 }}>
          {keys === null && <p style={{ textAlign: 'center', color: 'var(--text-faint)' }}>Loading demos…</p>}
          {keys !== null && suites.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text-faint)' }}>
              No demos are open right now — <Link to="/signup" style={{ color: 'var(--accent-ink)' }}>set up your own workspace</Link> instead.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {suites.map((s) => {
              const meta = SUITE_META[s.key] || {};
              return (
                <Link key={s.key} to={`/try/${s.key}`}
                  style={{ textDecoration: 'none', color: 'inherit', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: '20px 20px 18px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: 'var(--shadow-sm)', transition: 'transform .15s ease, box-shadow .15s ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}>
                  <span style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: meta.tint || 'var(--bolt)' }}>
                    <SuiteIcon name={meta.icon || 'grid'} size={22} color="#fff" />
                  </span>
                  <span style={{ fontWeight: 750, fontSize: 15.5 }}>{s.name}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.55, flex: 1 }}>{s.desc}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-ink)' }}>Start demo →</span>
                </Link>
              );
            })}
          </div>

          <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)', marginTop: 30 }}>
            Everything inside a demo is sample data — no real company, no real people.
          </p>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
