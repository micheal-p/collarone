import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiPost } from '../../api/client.js';

// Designed to be embedded via <iframe> in a company's own (possibly
// external) website — minimal chrome, no header/nav, just the form. Posts a
// lead straight into that org's CRM without needing any auth.
export default function EmbedContactForm() {
  const { orgSlug } = useParams();
  const [f, setF] = useState({ name: '', email: '', phone: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setError('Name is required.');
    setBusy(true); setError('');
    try {
      await apiPost('/embed/lead', { orgSlug, ...f });
      setDone(true);
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div style={{ fontFamily: 'Inter, sans-serif', padding: 20, textAlign: 'center', color: '#14161a' }}>
        <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Thanks — message received.</p>
        <p style={{ fontSize: 13, color: '#5c5f66', margin: '6px 0 0' }}>We'll get back to you shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ fontFamily: 'Inter, sans-serif', padding: 16, maxWidth: 420 }}>
      <style>{`
        .ecf-field { margin-bottom: 10px; }
        .ecf-field label { display: block; font-size: 12px; color: #5c5f66; margin-bottom: 4px; }
        .ecf-field input, .ecf-field textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #e2e2e6; border-radius: 6px; font-size: 14px; font-family: inherit; }
        .ecf-btn { background: #FF5B1F; color: #fff; border: none; padding: 9px 20px; border-radius: 6px; font-weight: 600; font-size: 14px; cursor: pointer; }
        .ecf-btn:disabled { opacity: .6; }
      `}</style>
      <div className="ecf-field"><label>Name *</label><input value={f.name} onChange={(e) => set('name', e.target.value)} required /></div>
      <div className="ecf-field"><label>Email</label><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
      <div className="ecf-field"><label>Phone</label><input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
      <div className="ecf-field"><label>Message</label><textarea rows={3} value={f.message} onChange={(e) => set('message', e.target.value)} /></div>
      {error && <p style={{ color: '#a4262c', fontSize: 13 }}>{error}</p>}
      <button className="ecf-btn" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button>
    </form>
  );
}
