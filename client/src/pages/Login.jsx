import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import logo from '../assets/collarone-mark.svg';

export default function Login() {
  const { user, login, booting } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState('email'); // 2-step: email, then password
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

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
            <p className="login-note">Staff accounts are created by your administrator — sign in with the email and password they gave you.</p>
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
