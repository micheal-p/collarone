import { useEffect, useState } from 'react';
import { useNavigate, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import logo from '../assets/collarone-mark-dark.svg';

export default function Login() {
  // Safety net: a leftover try-demo sandbox flag must never leak into real
  // auth — purge it and reload so the API layer rebinds to Supabase.
  useEffect(() => {
    if (import.meta.env.VITE_DEMO_MODE !== 'true' && sessionStorage.getItem('co-try-demo') === '1') {
      sessionStorage.removeItem('co-try-demo');
      localStorage.removeItem('orgops_demo_session');
      window.location.reload();
    }
  }, []);
  const { user, login, booting } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  // ProtectedRoute has always sent the page someone was headed to — it was
  // just never read here, so deep links died at the gate (audit finding 7).
  // Same-origin paths only; anything else falls back to home.
  const rawFrom = loc.state?.from;
  const from = typeof rawFrom === 'string' && rawFrom.startsWith('/') && !rawFrom.startsWith('//') ? rawFrom : null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState('email'); // 2-step: email, then password
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!booting && user) return <Navigate to={from || '/'} replace />;

  const next = (e) => {
    e.preventDefault();
    setErr('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr('Enter a valid work email.'); return; }
    setStep('password');
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const u = await login(email.trim(), password);
      nav(u.mustChangePassword ? '/change-password' : (from || '/'), { replace: true });
    } catch (e2) {
      setErr(e2.message || 'Sign in failed.');
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

        {step === 'email' && (
          <form onSubmit={next} className="login-form">
            <h1 className="login-h">Sign in</h1>
            <p className="login-p">{from ? 'Sign in to continue where you were headed.' : 'Use your work email to sign in.'}</p>
            <div className="field">
              <label htmlFor="login-email">Work email</label>
              <input
                id="login-email"
                className="input" type="email" autoFocus placeholder="you@company.com"
                value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username"
              />
            </div>
            {err && <div className="error-text">{err}</div>}
            <div className="login-actions">
              <button className="btn btn-primary" type="submit">Next</button>
            </div>
            <p className="login-note">Staff accounts are created by your administrator — sign in with the details you were given. <Link to="/forgot-password">Forgot your password?</Link></p>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={submit} className="login-form">
            <button type="button" className="login-back" onClick={() => { setStep('email'); setErr(''); }}>
              ‹ {email}
            </button>
            <h1 className="login-h">Enter password</h1>
            <div className="field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                className="input" type="password" autoFocus placeholder="Password"
                value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
              />
            </div>
            {err && <div className="error-text">{err}</div>}
            <div className="login-actions">
              <button className="btn btn-primary" type="submit" disabled={busy || !password}>
                {busy ? <span className="spinner" /> : 'Sign in'}
              </button>
            </div>
            <p className="login-note"><Link to="/forgot-password">Forgot your password?</Link></p>
          </form>
        )}
      </div>
      <Link to="/" className="login-home-link">← Back to homepage</Link>
      <div className="login-footer">© {new Date().getFullYear()} Collarone</div>
    </div>
  );
}
