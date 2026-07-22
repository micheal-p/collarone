// /try — pick which suite to demo. Lists only the suites the platform admin
// has opened for public demo, then hands off to /try/:suiteKey.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { SUITES, SUITE_META } from '../config/suites.js';
import SuiteIcon from '../components/SuiteIcon.jsx';

export default function TryChooser() {
  const [keys, setKeys] = useState(null); // null = loading
  useEffect(() => {
    supabase.from('platform_demo_suites').select('suite_key').eq('enabled', true)
      .then(({ data }) => setKeys((data || []).map((r) => r.suite_key).filter((k) => SUITES.some((s) => s.key === k))))
      .catch(() => setKeys([]));
  }, []);

  const suites = (keys || []).map((k) => SUITES.find((s) => s.key === k)).filter(Boolean);

  return (
    <div style={{ minHeight: '100vh', background: '#F4F1EA', fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif", color: '#0A0E1A' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px clamp(16px, 4vw, 40px)' }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit', fontFamily: 'Georgia, serif', fontSize: 19, fontWeight: 650 }}>
          Collar<em style={{ color: '#FF5B1F' }}>One</em>
        </Link>
        <Link to="/signup" style={{ textDecoration: 'none', background: '#FF5B1F', color: '#fff', borderRadius: 100, padding: '9px 18px', fontSize: 13.5, fontWeight: 700 }}>Get started</Link>
      </header>

      <main style={{ maxWidth: 980, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) 20px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#C24614', marginBottom: 10 }}>Try before you pay</div>
          <h1 style={{ fontSize: 'clamp(26px, 4.5vw, 40px)', margin: '0 0 12px', lineHeight: 1.1 }}>Pick a suite. Play with it.</h1>
          <p style={{ fontSize: 15.5, color: '#5b6070', maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
            Real screens, sample data, and a guided tour that explains everything — no sign-up, and you can't break anything.
          </p>
        </div>

        {keys === null && <p style={{ textAlign: 'center', color: '#889' }}>Loading demos…</p>}
        {keys !== null && suites.length === 0 && (
          <p style={{ textAlign: 'center', color: '#889' }}>No demos are open right now — <Link to="/signup" style={{ color: '#C24614' }}>set up your own workspace</Link> instead.</p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {suites.map((s) => {
            const meta = SUITE_META[s.key] || {};
            return (
              <Link key={s.key} to={`/try/${s.key}`}
                style={{ textDecoration: 'none', color: 'inherit', background: '#fff', border: '1px solid #e5e1d6', borderRadius: 16, padding: '20px 20px 18px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 1px 2px rgba(10,14,26,0.05)', transition: 'transform .15s ease, box-shadow .15s ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(10,14,26,0.10)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 2px rgba(10,14,26,0.05)'; }}>
                <span style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: meta.tint || '#FF5B1F' }}>
                  <SuiteIcon name={meta.icon || 'grid'} size={22} color="#fff" />
                </span>
                <span style={{ fontWeight: 750, fontSize: 15.5 }}>{s.name}</span>
                <span style={{ fontSize: 13, color: '#5b6070', lineHeight: 1.55, flex: 1 }}>{s.desc}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#C24614' }}>Start demo →</span>
              </Link>
            );
          })}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12.5, color: '#99a', marginTop: 30 }}>
          Everything inside a demo is sample data — no real company, no real people.
        </p>
      </main>
    </div>
  );
}
