import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { DEMO } from '../api/client.js';
import logo from '../assets/collarone-mark.svg';

// Microsoft 4-square logo (SVG, no emoji).
const MicrosoftLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#f25022" d="M2 2h9.5v9.5H2z" />
    <path fill="#7fba00" d="M12.5 2H22v9.5h-9.5z" />
    <path fill="#00a4ef" d="M2 12.5h9.5V22H2z" />
    <path fill="#ffb900" d="M12.5 12.5H22V22h-9.5z" />
  </svg>
);

export default function Login() {
  const { user, login, loginWithMicrosoft, booting } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState('email'); // microsoft-style 2-step
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const microsoft = async () => {
    setErr('');
    try { await loginWithMicrosoft(); } // redirects away to Microsoft
    catch (e) {
      const msg = e?.message || '';
      if (/not enabled|unsupported provider/i.test(msg))
        setErr('Microsoft sign-in isn’t switched on yet — your administrator is still setting it up.');
      else setErr(msg || 'Could not start Microsoft sign-in.');
    }
  };

  if (!booting && user) return <Navigate to="/" replace />;

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
      nav(u.mustChangePassword ? '/change-password' : '/', { replace: true });
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
            <p className="login-p">Use your work email to sign in.</p>
            <div className="field">
              <input
                className="input" type="email" autoFocus placeholder="you@company.com"
                value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username"
              />
            </div>
            {err && <div className="error-text">{err}</div>}
            <div className="login-actions">
              <button className="btn btn-primary" type="submit">Next</button>
            </div>

            {!DEMO && (
              <>
                <div className="login-divider"><span>or</span></div>
                <button type="button" className="btn btn-ms" onClick={microsoft}>
                  <MicrosoftLogo /> Sign in with Microsoft
                </button>
                <p className="login-note">Staff: use your work Microsoft account. Suite access is granted by your administrator.</p>
              </>
            )}
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={submit} className="login-form">
            <button type="button" className="login-back" onClick={() => { setStep('email'); setErr(''); }}>
              ‹ {email}
            </button>
            <h1 className="login-h">Enter password</h1>
            <div className="field">
              <input
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
          </form>
        )}
      </div>
      <Link to="/" className="login-home-link">← Back to homepage</Link>
      <div className="login-footer">© {new Date().getFullYear()} Collarone</div>
    </div>
  );
}
