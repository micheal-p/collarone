// Public suite demo — /try/:suiteKey. A prospect tries a real suite on
// sample data, accompanied by a plain-language guided tour, and leaves a
// quick experience questionnaire on the way out. Which suites are open for
// demo is platform-admin controlled (platform_demo_suites, anon-readable).
//
// Mechanics: the whole app's API layer switches to the in-browser demo mock
// when sessionStorage 'co-try-demo' is set (see api/client.ts). That flag is
// read at module load, so the first visit sets it and reloads once; exiting
// clears it and returns to the landing page.
import { Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { apiPost } from '../api/client.ts';
import { SUITES, SUITE_META } from '../config/suites.js';
import { SUITE_APPS } from './SuiteShell.jsx';
import SuiteIcon from '../components/SuiteIcon.jsx';
import CoachTour from '../components/CoachTour.jsx';
import { tourForSuite } from '../config/demoTours.js';

const FLAG = 'co-try-demo';

// Leaving the demo for ANY real destination must drop the sandbox first —
// otherwise the tab keeps talking to the mock API and a prospect could
// "sign up" against fake data and believe they registered.
const leaveDemoTo = (path) => {
  sessionStorage.removeItem(FLAG);
  localStorage.removeItem('orgops_demo_session');
  window.location.href = path;
};

function FeedbackModal({ suiteKey, onDone }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);
  const [ease, setEase] = useState(0);
  const [wouldPay, setWouldPay] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!ease || !wouldPay) return;
    setBusy(true);
    // { error } is inspected but never blocks the exit — worst case the
    // response is lost and the visitor still leaves cleanly.
    const { error } = await supabase.from('demo_feedback').insert({ suite_key: suiteKey, ease, would_pay: wouldPay, comment: comment.slice(0, 1000) });
    if (error) { setSent(true); setTimeout(onDone, 900); return; }
    setSent(true);
    setTimeout(onDone, 1400);
  };

  const btn = { padding: '10px 16px', borderRadius: 100, border: '1px solid #d8d5cc', background: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' };
  const on = { background: '#0A0E1A', color: '#fff', borderColor: '#0A0E1A' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(8,10,18,0.6)', display: 'grid', placeItems: 'center', padding: 16 }} onMouseDown={onDone}>
      <div role="dialog" aria-modal="true" aria-label="Demo feedback" style={{ width: 'min(440px, 100%)', background: '#fff', borderRadius: 16, padding: '26px 28px', boxShadow: '0 30px 80px rgba(0,0,0,0.4)' }} onMouseDown={(e) => e.stopPropagation()}>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 34 }}>🙏</div>
            <div style={{ fontWeight: 750, fontSize: 17, marginTop: 8 }}>Thank you — that helps us build better.</div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div style={{ fontWeight: 750, fontSize: 17, marginBottom: 4 }}>Two quick questions before you go</div>
            <p style={{ fontSize: 13, color: '#667', margin: '0 0 16px' }}>30 seconds, honestly useful to us.</p>

            <div style={{ fontSize: 13.5, fontWeight: 650, marginBottom: 8 }}>How easy was it to understand?</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" style={{ ...btn, width: 44, ...(ease === n ? on : {}) }} onClick={() => setEase(n)}>{n}</button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: '#889', marginTop: -12, marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}><span>Confusing</span><span>Very easy</span></div>

            <div style={{ fontSize: 13.5, fontWeight: 650, marginBottom: 8 }}>Could you see your business paying for this?</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {[['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'Not really']].map(([v, label]) => (
                <button key={v} type="button" style={{ ...btn, flex: 1, ...(wouldPay === v ? on : {}) }} onClick={() => setWouldPay(v)}>{label}</button>
              ))}
            </div>

            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Anything confusing, missing, or great? (optional)"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid #d8d5cc', fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical', marginBottom: 16 }} />

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={{ ...btn }} onClick={onDone}>Skip</button>
              <button type="submit" disabled={!ease || !wouldPay || busy}
                style={{ ...btn, flex: 1, background: '#FF5B1F', borderColor: '#FF5B1F', color: '#fff', opacity: !ease || !wouldPay ? 0.5 : 1 }}>
                Send &amp; exit
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function TryDemo() {
  const { suiteKey } = useParams();
  const suite = SUITES.find((s) => s.key === suiteKey);
  const meta = SUITE_META[suiteKey] || {};
  const App = SUITE_APPS[suiteKey];

  const [state, setState] = useState('checking'); // checking | closed | booting | ready
  const [tourOpen, setTourOpen] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [otherSuites, setOtherSuites] = useState([]);

  // the other demo-open suites — powers the burger's "try another" switcher
  useEffect(() => {
    supabase.from('platform_demo_suites').select('suite_key').eq('enabled', true)
      .then(({ data }) => setOtherSuites((data || []).map((r) => r.suite_key).filter((k) => k !== suiteKey && SUITES.some((s) => s.key === k))))
      .catch(() => {});
  }, [suiteKey]);
  // switching suite keeps the sandbox flag set (still a demo), just navigates
  const switchSuite = (k) => { setMenuOpen(false); window.location.href = `/try/${k}`; };
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('platform_demo_suites').select('suite_key').eq('suite_key', String(suiteKey)).eq('enabled', true).maybeSingle();
      if (!alive) return;
      if (!data || !suite || !App) { setState('closed'); return; }
      if (sessionStorage.getItem(FLAG) !== '1') {
        // flip the app into demo mode — the API layer reads this at load time
        sessionStorage.setItem(FLAG, '1');
        window.location.reload();
        return;
      }
      setState('booting');
      try {
        await apiPost('/auth/login', { email: 'demo-guest@collarone-demo.app', password: 'demo' });
        if (!alive) return;
        setState('ready');
        // funnel: count the start (fire-and-forget, direct to Supabase — works
        // even though the app's API layer is in demo mode)
        supabase.from('demo_events').insert({ suite_key: suiteKey, event: 'started' }).then(() => {}, () => {});
        setTimeout(() => setTourOpen(true), 900);
      } catch { setState('closed'); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suiteKey]);

  const exit = () => setFeedback(true);
  const reallyExit = () => {
    sessionStorage.removeItem(FLAG);
    localStorage.removeItem('orgops_demo_session');
    window.location.href = '/';
  };

  const mItem = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', borderRadius: 8, fontSize: 13.5, color: '#14161a', fontWeight: 550 };

  if (state === 'checking' || state === 'booting') {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'sans-serif', color: '#667' }}>Setting up your demo…</div>;
  }
  if (state === 'closed') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: '-apple-system, Segoe UI, sans-serif', padding: 16 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>This suite isn't open for demo yet</h1>
          <p style={{ color: '#667', fontSize: 14.5, lineHeight: 1.6 }}>But you can preview the website themes, or set up your own workspace in minutes.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
            <button onClick={() => leaveDemoTo('/')} style={{ background: 'none', cursor: 'pointer', padding: '11px 20px', borderRadius: 100, border: '1px solid #d8d5cc', color: '#14161a', fontSize: 14, fontWeight: 650 }}>Back home</button>
            <button onClick={() => leaveDemoTo('/signup')} style={{ border: 'none', cursor: 'pointer', padding: '11px 20px', borderRadius: 100, background: '#FF5B1F', color: '#fff', fontSize: 14, fontWeight: 650 }}>Get started</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #FAF9F6)' }}>
      {/* demo chrome — single row that stays put; the helper caption drops on
          phones so the actions never wrap into a stack of stuck rows */}
      <div className="tryd-chrome" style={{ position: 'sticky', top: 0, zIndex: 50, background: '#0A0E1A', color: '#F4F1EA', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: '#FF5B1F', flex: 'none' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Live demo</span>
        </span>
        <span className="tryd-hint" style={{ fontSize: 12.5, color: 'rgba(244,241,234,0.6)', whiteSpace: 'nowrap' }}>Sample data — click anything, you can't break it.</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setTourOpen(true)} className="tryd-hint" style={{ background: 'rgba(244,241,234,0.12)', color: '#F4F1EA', border: 'none', borderRadius: 100, padding: '7px 14px', fontSize: 12.5, fontWeight: 650, cursor: 'pointer', flex: 'none' }}>Restart tour</button>
        <button onClick={() => leaveDemoTo('/signup')} style={{ background: '#FF5B1F', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 100, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', flex: 'none' }}>Get started</button>
        <div style={{ position: 'relative', flex: 'none' }}>
          <button aria-label="Demo menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}
            style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, background: 'rgba(244,241,234,0.1)', color: '#F4F1EA', border: '1px solid rgba(244,241,234,0.22)', borderRadius: 9, cursor: 'pointer' }}>
            {menuOpen
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>}
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{ position: 'absolute', right: 0, top: 42, zIndex: 60, width: 240, background: '#fff', color: '#14161a', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', padding: 8, textAlign: 'left' }}>
                {otherSuites.length > 0 && (
                  <>
                    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#99a', padding: '8px 10px 4px' }}>Try another suite</div>
                    {otherSuites.map((k) => {
                      const s2 = SUITES.find((x) => x.key === k); const m2 = SUITE_META[k] || {};
                      return (
                        <button key={k} onClick={() => switchSuite(k)} style={mItem}>
                          <span style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', background: m2.tint || '#FF5B1F', flex: 'none' }}><SuiteIcon name={m2.icon || 'grid'} size={13} color="#fff" /></span>
                          {s2?.name}
                        </button>
                      );
                    })}
                    <div style={{ height: 1, background: '#eee', margin: '6px 4px' }} />
                  </>
                )}
                <button onClick={() => { setMenuOpen(false); setTourOpen(true); }} style={mItem}>Restart the tour</button>
                <button onClick={() => leaveDemoTo('/themes')} style={mItem}>Preview website themes</button>
                <button onClick={() => { setMenuOpen(false); exit(); }} style={mItem}>Exit demo</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* suite header, mirroring the real shell */}
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '22px 20px 60px' }}>
        <header className="suite-head">
          <span className="suite-head-icon" style={{ background: meta.tint || '#FF5B1F' }}>
            <SuiteIcon name={meta.icon || 'grid'} size={30} color="#fff" />
          </span>
          <div>
            <h1 style={{ margin: 0 }}>{suite.name}</h1>
            <p>{suite.desc}</p>
          </div>
        </header>
        <Suspense fallback={<div style={{ padding: 60, textAlign: 'center', color: '#889' }}>Loading…</div>}>
          <App access={{ role: 'manager' }} suite={suite} />
        </Suspense>
      </div>

      {/* demo footer */}
      <footer style={{ borderTop: '1px solid var(--line, #e5e1d6)', background: '#0A0E1A', color: 'rgba(244,241,234,0.75)', padding: '26px 20px' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: 17, color: '#F4F1EA' }}>Collar<em style={{ color: '#FF5B1F' }}>One</em></span>
          <span style={{ fontSize: 12.5 }}>You're exploring a live demo — sample data, nothing real. Like what you see?</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => leaveDemoTo('/signup')} style={{ background: '#FF5B1F', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 100, padding: '9px 18px', fontSize: 13, fontWeight: 700 }}>Create my workspace</button>
          <button onClick={() => leaveDemoTo('/')} style={{ background: 'none', color: 'rgba(244,241,234,0.75)', border: '1px solid rgba(244,241,234,0.25)', borderRadius: 100, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Back to site</button>
        </div>
      </footer>

      <CoachTour steps={tourForSuite(suiteKey)} open={tourOpen} onClose={() => setTourOpen(false)} />
      {feedback && <FeedbackModal suiteKey={suiteKey} onDone={reallyExit} />}
    </div>
  );
}
