import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/collarone-mark.svg';

// Public landing for a password-reset link. Supabase (detectSessionInUrl + PKCE)
// exchanges the link's code for a short-lived recovery session as the page
// loads; we wait for that session, let the user set a new password, then sign
// them out so they must sign back in with the NEW password — never leaving the
// recovery session logged in with the old one still valid.
export default function ResetPassword() {
  const nav = useNavigate();
  const [phase, setPhase] = useState('checking'); // checking | ready | expired | done
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let sub = null;
    (async () => {
      const { supabase } = await import('../lib/supabaseClient.js');
      sub = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled) return;
        if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) setPhase('ready');
      }).data.subscription;

      // The code exchange is async; poll a few times before deciding the link
      // is dead (expired, already used, or opened in a different browser).
      for (let i = 0; i < 10 && !cancelled; i++) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) { if (!cancelled) setPhase('ready'); return; }
        await new Promise((r) => setTimeout(r, 400));
      }
      if (!cancelled) setPhase((p) => (p === 'ready' ? p : 'expired'));
    })();
    return () => { cancelled = true; if (sub) sub.unsubscribe(); };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (pw1.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (pw1 !== pw2) { setErr('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const { supabase } = await import('../lib/supabaseClient.js');
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw new Error(error.message);
      try { await supabase.rpc('mark_password_changed'); } catch { /* non-fatal — never blocks the reset */ }
      await supabase.auth.signOut();
      setPhase('done');
    } catch (e2) {
      setErr(e2.message || 'Could not update your password. Request a fresh link and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">
          <img src={logo} alt="Collarone" />
          <div className="ll-text">
            <div className="login-org">Collar<em style={{ fontStyle: 'italic', color: 'var(--brand)' }}>One</em></div>
            <div className="login-sub">Sign in to your space</div>
          </div>
        </div>

        {phase === 'checking' && (
          <div className="login-form" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div className="boot-spinner" style={{ margin: '18px auto' }} />
            <p className="login-p">Verifying your reset link…</p>
          </div>
        )}

        {phase === 'expired' && (
          <div className="login-form">
            <h1 className="login-h">This link has expired</h1>
            <p className="login-p">
              Reset links are single-use and expire after an hour. Request a new one and open it in the same browser.
            </p>
            <div className="login-actions">
              <Link className="btn btn-primary" to="/forgot-password" style={{ textDecoration: 'none', textAlign: 'center' }}>Request a new link</Link>
            </div>
          </div>
        )}

        {phase === 'ready' && (
          <form onSubmit={submit} className="login-form">
            <h1 className="login-h">Set a new password</h1>
            <p className="login-p">Choose a password you'll remember — at least 8 characters.</p>
            <div className="field">
              <label>New password</label>
              <input className="input" type="password" autoFocus value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            </div>
            {err && <div className="error-text">{err}</div>}
            <div className="login-actions">
              <button className="btn btn-primary" type="submit" disabled={busy || !pw1 || !pw2}>
                {busy ? <span className="spinner" /> : 'Update password'}
              </button>
            </div>
          </form>
        )}

        {phase === 'done' && (
          <div className="login-form">
            <h1 className="login-h">Password updated</h1>
            <p className="login-p">You can now sign in with your new password.</p>
            <div className="login-actions">
              <button className="btn btn-primary" onClick={() => nav('/login', { replace: true })}>Go to sign in</button>
            </div>
          </div>
        )}
      </div>
      <Link to="/" className="login-home-link">← Back to homepage</Link>
      <div className="login-footer">© {new Date().getFullYear()} Collarone</div>
    </div>
  );
}
