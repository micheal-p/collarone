import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiPost } from '../api/client.js';
import logo from '../assets/collarone-mark.svg';

// Public page: request a password-reset link. The response is deliberately the
// same whether or not the email has an account (no enumeration), so this always
// lands on the "check your inbox" state unless the network itself fails.
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Enter a valid email address.'); return; }
    setBusy(true);
    try {
      await apiPost('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch {
      // Even a backend hiccup shouldn't reveal anything — show the same state.
      setSent(true);
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

        {sent ? (
          <div className="login-form">
            <h1 className="login-h">Check your inbox</h1>
            <p className="login-p">
              If an account exists for <strong>{email.trim()}</strong>, we've sent a link to reset your password.
              It expires in an hour. Remember to check your spam folder.
            </p>
            <div className="login-actions">
              <Link className="btn btn-primary" to="/login" style={{ textDecoration: 'none', textAlign: 'center' }}>Back to sign in</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="login-form">
            <h1 className="login-h">Reset your password</h1>
            <p className="login-p">Enter your account email and we'll send you a link to set a new password.</p>
            <div className="field">
              <input
                className="input" type="email" autoFocus placeholder="you@company.com"
                value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username"
              />
            </div>
            {err && <div className="error-text">{err}</div>}
            <div className="login-actions">
              <button className="btn btn-primary" type="submit" disabled={busy || !email}>
                {busy ? <span className="spinner" /> : 'Send reset link'}
              </button>
            </div>
            <p className="login-note">Remembered it? <Link to="/login">Back to sign in</Link></p>
          </form>
        )}
      </div>
      <Link to="/" className="login-home-link">← Back to homepage</Link>
      <div className="login-footer">© {new Date().getFullYear()} Collarone</div>
    </div>
  );
}
