import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LegalNav, LegalFooter } from './LegalChrome.jsx';
import { apiPost } from '../api/client.js';
import './Legal.css';
import './Contact.css';

const WA = 'https://wa.me/2348148128551';

// Book a demo — an OFFICE VISIT, not a screen share.
//
// The first version of this page was built as a remote product walkthrough.
// That was wrong: a demo here means somebody from Collarone travelling to the
// prospect's premises to sit with them and set the workspace up in the room.
//
// That is why `location` is a required field rather than one more optional
// qualifier. You cannot visit an office whose address you never asked for, and
// a request without one is just a phone call before anything can be booked.
//
// Deliberately not a third-party scheduling embed. A booking widget would mean
// an external account to keep paying for, a script the CSP has to allow, and a
// prospect's details living somewhere that is not our own CRM. This posts into
// the SAME platform inbox as /contact, so there is one place to check.
//
// The two options offered first are the two pains ONBOARD_FIRST_CUSTOMER.md
// says to lead with: payroll done by hand, and invoices chased on WhatsApp.
const STAFF_BANDS = ['1 to 5', '6 to 20', '21 to 50', '51 to 200', 'More than 200'];
const INTERESTS = [
  'Running payroll by hand',
  'Chasing invoices and payments',
  'Staff records, leave and attendance',
  'Customers and sales follow-up',
  'A company website and storefront',
  'Something else',
];

export default function BookDemo() {
  const [f, setF] = useState({
    name: '', company: '', email: '', phone: '', location: '',
    staffCount: '', interest: '', preferredAt: '', message: '',
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  // The same rules the database enforces, checked here first so an obvious
  // mistake is a red line under the field rather than a round trip.
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!f.name.trim()) return setError('Your name is required.');
    if (!f.company.trim()) return setError('Your company name is required.');
    if (!f.location.trim()) return setError('We need the office address so we know where to come.');
    if (!f.email.trim() && !f.phone.trim()) return setError('An email or phone number is required so we can confirm the visit.');

    let preferredAt = null;
    if (f.preferredAt) {
      // datetime-local has no timezone, so this is read as the visitor's own
      // clock, which for almost every visitor is Lagos. That is the right
      // reading: they picked a time they intend to be free.
      const when = new Date(f.preferredAt);
      if (Number.isNaN(when.getTime())) return setError('That date could not be read, please pick it again.');
      if (when.getTime() < Date.now() - 24 * 60 * 60 * 1000) return setError('Pick a time in the future.');
      preferredAt = when.toISOString();
    }

    setBusy(true);
    try {
      await apiPost('/book-demo', { ...f, preferredAt });
      setSent(true);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  // Stops the picker offering yesterday, in the visitor's own clock.
  const minLocal = (() => {
    const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  })();

  return (
    <div className="lg">
      <LegalNav />

      <div className="ct-body bd-body">
        <div className="ct-left">
          <p className="lg-kicker">We come to you</p>
          <h1 className="ct-h1">Book a demo,<br /><em>at your office.</em></h1>
          <p className="ct-lede">
            Someone from Collarone comes to you, sits with your team, and sets your workspace up in
            the room. About an hour. We run one real payroll or invoice on your own figures while we
            are there, and you keep whatever we build.
          </p>

          <div className="ct-channels">
            <a className="ct-ch wa" href={`${WA}?text=${encodeURIComponent('Hello Collarone, I would like to book a demo.')}`} target="_blank" rel="noreferrer">
              <span className="ct-ch-ic">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.87 9.87 0 0 0 4.74 1.21c5.46 0 9.9-4.44 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.1c-1.5 0-2.97-.4-4.25-1.15l-.3-.18-3.15.83.84-3.07-.2-.31a8.26 8.26 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.25-8.15 8.25z"/></svg>
              </span>
              <span>
                <span className="ct-ch-t">Rather just message us?</span>
                <span className="ct-ch-s" style={{ display: 'block' }}>0814 812 8551 · usually replies in minutes</span>
              </span>
              <svg className="ct-ch-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>
          </div>

          <p className="ct-note">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            {/* One span, deliberately. .ct-note is display:flex, so every child
                node is a flex item — an inline <Link> mid-sentence split this
                into three columns of stacked words. */}
            <span>
              Free, no commitment and no card. Tell us where you are and we will confirm whether we
              can reach you. If you would rather look around by yourself first, the{' '}
              <Link to="/try">live demo</Link> needs no account at all.
            </span>
          </p>
        </div>

        <div className="ct-card">
          {sent ? (
            <div className="ct-sent">
              <span className="ct-sent-ic">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              <strong>Visit requested.</strong>
              <p>
                Thanks {f.name.split(' ')[0]}, we will confirm the day and time with you today by
                {f.email.trim() ? ' email' : ' WhatsApp'}, and come to you at {f.location.trim() || 'your office'}.
                Need it sooner?{' '}
                <a href={WA} target="_blank" rel="noreferrer">Message us on WhatsApp</a> and we can
                often come the same week.
              </p>
            </div>
          ) : (
            <>
              <h2 className="ct-card-t">Tell us where and when</h2>
              <p className="ct-card-s">Two minutes to fill in. A person reads it, not a bot.</p>
              <form onSubmit={submit} className="ct-form">
                <div className="ct-row2">
                  <div className="field"><label>Name *</label>
                    <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus placeholder="Your full name" /></div>
                  <div className="field"><label>Company *</label>
                    <input className="input" value={f.company} onChange={(e) => set('company', e.target.value)} required placeholder="Your business name" /></div>
                </div>
                <div className="ct-row2">
                  <div className="field"><label>Email</label>
                    <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="you@company.com" /></div>
                  <div className="field"><label>Phone / WhatsApp</label>
                    <input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0801 234 5678" /></div>
                </div>
                {/* Address paired with the visit time, and the two dropdowns
                    paired with each other. Six stacked rows ran the card to
                    850px and pushed the whole page past the fold for a form
                    that takes two minutes; four rows fit the screen and read as
                    shorter, which is the honest impression. */}
                <div className="ct-row2">
                  <div className="field"><label>Office address *</label>
                    <input className="input" value={f.location} onChange={(e) => set('location', e.target.value)} required
                      placeholder="Street, area, city" /></div>
                  <div className="field"><label>When suits you?</label>
                    <input className="input" type="datetime-local" min={minLocal} value={f.preferredAt} onChange={(e) => set('preferredAt', e.target.value)} /></div>
                </div>
                <div className="ct-row2">
                  <div className="field"><label>How many staff?</label>
                    <select className="select" value={f.staffCount} onChange={(e) => set('staffCount', e.target.value)}>
                      <option value="">Prefer not to say</option>
                      {STAFF_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select></div>
                  <div className="field"><label>What hurts most?</label>
                    <select className="select" value={f.interest} onChange={(e) => set('interest', e.target.value)}>
                      <option value="">Not sure yet</option>
                      {INTERESTS.map((i) => <option key={i} value={i}>{i}</option>)}
                    </select></div>
                </div>
                <div className="field"><label>Anything we should know?</label>
                  <textarea className="input" rows={2} value={f.message} onChange={(e) => set('message', e.target.value)} placeholder="Optional. How you run payroll today, or what you want us to show." /></div>
                {error && <p className="ct-err">{error}</p>}
                <button className="ct-send" disabled={busy}>
                  {busy ? 'Sending…' : 'Request my demo'}
                  {!busy && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>}
                </button>
                <p className="ct-fine">We confirm by email or WhatsApp, whichever you gave us. Your details are never sold or shared.</p>
              </form>
            </>
          )}
        </div>
      </div>
      <LegalFooter />
    </div>
  );
}
