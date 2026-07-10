import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiPost } from '../api/client.js';
import logo from '../assets/collarone-mark.svg';

export default function ChangePassword() {
  const { user, refreshUser, logout } = useAuth();
  const nav = useNavigate();
  const forced = user?.mustChangePassword;
  const [cur, setCur] = useState('');
  const [next1, setNext1] = useState('');
  const [next2, setNext2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (next1.length < 8) return setErr('New password must be at least 8 characters.');
    if (next1 !== next2) return setErr('Passwords do not match.');
    setBusy(true);
    try {
      await apiPost('/auth/change-password', { currentPassword: cur, newPassword: next1 });
      await refreshUser();
      nav('/', { replace: true });
    } catch (e2) {
      setErr(e2.message);
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
        <form onSubmit={submit} className="login-form">
          <h1 className="login-h">{forced ? 'Set a new password' : 'Change password'}</h1>
          <p className="login-p">
            {forced ? 'For security, set your own password before continuing.' : 'Update your account password.'}
          </p>
          <div className="field">
            <label>Current password</label>
            <input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>New password</label>
            <input className="input" type="password" value={next1} onChange={(e) => setNext1(e.target.value)} />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input className="input" type="password" value={next2} onChange={(e) => setNext2(e.target.value)} />
          </div>
          {err && <div className="error-text">{err}</div>}
          <div className="login-actions spread">
            {!forced && <button type="button" className="btn btn-ghost" onClick={() => nav('/')}>Cancel</button>}
            {forced && <button type="button" className="btn btn-ghost" onClick={() => logout()}>Sign out</button>}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? <span className="spinner" /> : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
