import { useState } from 'react';
import { LegalNav, LegalFooter } from './LegalChrome.jsx';
import { apiPost } from '../api/client.js';
import './Legal.css';
import './Contact.css';

const WA = 'https://wa.me/2348148128551';

export default function Contact() {
  const [f, setF] = useState({ name: '', email: '', phone: '', company: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!f.name.trim()) return setError('Your name is required.');
    if (!f.email.trim() && !f.phone.trim()) return setError('An email or phone number is required so we can reply.');
    if (!f.message.trim()) return setError('Tell us a bit about what you need.');
    setBusy(true);
    try {
      await apiPost('/contact', f);
      setSent(true);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lg">
      <LegalNav />

      <div className="ct-body">
        <div className="ct-left">
          <p className="lg-kicker">Get in touch</p>
          <h1 className="ct-h1">Talk to a person,<br /><em>not a ticket queue.</em></h1>
          <p className="ct-lede">
            Every message lands with the team that actually builds Collarone — and gets a reply the same working day.
          </p>

          <div className="ct-channels">
            <a className="ct-ch wa" href={`${WA}?text=${encodeURIComponent('Hello Collarone — I have a question.')}`} target="_blank" rel="noreferrer">
              <span className="ct-ch-ic">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.87 9.87 0 0 0 4.74 1.21c5.46 0 9.9-4.44 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.1c-1.5 0-2.97-.4-4.25-1.15l-.3-.18-3.15.83.84-3.07-.2-.31a8.26 8.26 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.25-8.15 8.25zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23a7.4 7.4 0 0 1-1.38-1.72c-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.13.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.6.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.27z"/></svg>
              </span>
              <span>
                <span className="ct-ch-t">WhatsApp — fastest</span>
                <span className="ct-ch-s" style={{ display: 'block' }}>0814 812 8551 · usually replies in minutes</span>
              </span>
              <svg className="ct-ch-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>

            <a className="ct-ch tel" href="tel:+2348148128551">
              <span className="ct-ch-ic">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .6 3a2 2 0 0 1-.5 2L8 10a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2-.5c1 .3 2 .5 3 .6a2 2 0 0 1 1.7 2z"/></svg>
              </span>
              <span>
                <span className="ct-ch-t">Call us</span>
                <span className="ct-ch-s" style={{ display: 'block' }}>0814 812 8551 · Nigerian business hours</span>
              </span>
              <svg className="ct-ch-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>
          </div>

          <p className="ct-note">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            Already a customer with something urgent? WhatsApp is your fastest route — mention your company handle and we'll pick it up immediately.
          </p>
        </div>

        <div className="ct-card">
          {sent ? (
            <div className="ct-sent">
              <span className="ct-sent-ic">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              <strong>Message sent.</strong>
              <p>Thanks, {f.name.split(' ')[0]} — we'll get back to you the same working day. In a hurry? <a href={WA} target="_blank" rel="noreferrer">WhatsApp us</a> instead.</p>
            </div>
          ) : (
            <>
              <h2 className="ct-card-t">Send us a message</h2>
              <p className="ct-card-s">It lands straight in the team's inbox — no bots, no ticket numbers.</p>
              <form onSubmit={submit} className="ct-form">
                <div className="ct-row2">
                  <div className="field"><label>Name *</label><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus placeholder="Your full name" /></div>
                  <div className="field"><label>Company</label><input className="input" value={f.company} onChange={(e) => set('company', e.target.value)} placeholder="Optional" /></div>
                </div>
                <div className="ct-row2">
                  <div className="field"><label>Email</label><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="you@company.com" /></div>
                  <div className="field"><label>Phone / WhatsApp</label><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0801 234 5678" /></div>
                </div>
                <div className="field"><label>Message *</label><textarea className="input" rows={5} value={f.message} onChange={(e) => set('message', e.target.value)} placeholder="What do you need? The more detail, the faster we can help." required /></div>
                {error && <p className="ct-err">{error}</p>}
                <button className="ct-send" disabled={busy}>
                  {busy ? 'Sending…' : 'Send message'}
                  {!busy && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>}
                </button>
                <p className="ct-fine">We reply by email or WhatsApp — whichever you gave us.</p>
              </form>
            </>
          )}
        </div>
      </div>
      <LegalFooter />
    </div>
  );
}
