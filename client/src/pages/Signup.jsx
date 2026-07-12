import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import logo from '../assets/collarone-mark.svg';
import './Signup.css';

// Every tier is à la carte — pick whichever suites you need on any of them.
// Tiers differ in included-suite count, base fee, support level and
// contract terms, not in which suites you're allowed to use.
export const PER_STAFF_FEE = 2000;
export const PLANS = [
  { key: 'startup',    name: 'Startup',    baseFee: 15000, includedSuites: 3, extraSuiteFee: 8000, price: '₦15,000/mo · 3 suites incl., ₦8,000/extra suite, ₦2,000/staff' },
  { key: 'standard',   name: 'Standard',   baseFee: 25000, includedSuites: 5, extraSuiteFee: 6000, price: '₦25,000/mo · 5 suites incl., ₦6,000/extra suite, ₦2,000/staff' },
  { key: 'enterprise', name: 'Enterprise', baseFee: 45000, includedSuites: 8, extraSuiteFee: 4000, price: '₦45,000/mo · 8 suites incl., ₦4,000/extra suite, ₦2,000/staff' },
];
export const ANNUAL_DISCOUNT = 0.15;

// Nigeria-first, but Collarone's stated long-term goal is global — this is
// the first real signal toward that, captured at signup rather than guessed.
const COUNTRIES = [
  { code: 'NG', name: 'Nigeria' }, { code: 'GH', name: 'Ghana' }, { code: 'KE', name: 'Kenya' },
  { code: 'ZA', name: 'South Africa' }, { code: 'EG', name: 'Egypt' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' }, { code: 'OTHER', name: 'Other' },
];

const SWATCHES = ['#FF5B1F', '#C2410C', '#0F766E', '#1D4ED8', '#7C3AED', '#BE185D', '#0A0E1A', '#166534'];

const WEBSITE_TYPES = [
  { key: 'ecommerce', name: 'Online store', desc: 'Sell products with a public storefront.' },
  { key: 'hr_corporate', name: 'Company site', desc: 'About, services and contact — a home for your business online.' },
  { key: 'job_board', name: 'Careers / job board', desc: 'Public postings, candidates apply with no account.' },
  { key: 'none', name: 'Skip for now', desc: 'Just the ERP dashboard — add a site later.' },
];

const STEPS = ['plan', 'company', 'brand', 'you', 'payment'];
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

async function callSignup(action, payload) {
  const res = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* noop */ }
  if (!res.ok) { const e = new Error(data?.message || 'Request failed.'); e.status = res.status; throw e; }
  return data;
}

export default function Signup() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [planTier, setPlanTier] = useState(PLANS.some((p) => p.key === params.get('plan')) ? params.get('plan') : 'startup');
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugStatus, setSlugStatus] = useState({ state: 'idle', msg: '' });

  const [themeColor, setThemeColor] = useState('#FF5B1F');
  const [websiteType, setWebsiteType] = useState('hr_corporate');
  const [country, setCountry] = useState('NG');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const fileRef = useRef(null);

  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [promoCode, setPromoCode] = useState('');
  const [promoStatus, setPromoStatus] = useState({ state: 'idle', percentOff: 0, msg: '' });

  const [result, setResult] = useState(null); // { reference, amountKobo, promoApplied, activated }

  // Live promo validation, debounced — redemption itself only happens
  // server-side at create time (see api/signup.js).
  useEffect(() => {
    const code = promoCode.trim();
    if (!code) { setPromoStatus({ state: 'idle', percentOff: 0, msg: '' }); return; }
    setPromoStatus({ state: 'checking', percentOff: 0, msg: '' });
    const t = setTimeout(async () => {
      try {
        const d = await callSignup('check-promo', { code });
        setPromoStatus(d.valid
          ? { state: 'ok', percentOff: d.percentOff, msg: d.percentOff === 100 ? 'This code makes your first activation free.' : `${d.percentOff}% off your activation fee.` }
          : { state: 'bad', percentOff: 0, msg: d.reason });
      } catch (e2) {
        setPromoStatus({ state: 'bad', percentOff: 0, msg: e2.message });
      }
    }, 450);
    return () => clearTimeout(t);
  }, [promoCode]);

  useEffect(() => {
    if (!slugTouched) setOrgSlug(slugify(orgName));
  }, [orgName, slugTouched]);

  useEffect(() => {
    if (!orgSlug) { setSlugStatus({ state: 'idle', msg: '' }); return; }
    setSlugStatus({ state: 'checking', msg: '' });
    const t = setTimeout(async () => {
      try {
        const d = await callSignup('check-slug', { slug: orgSlug });
        setSlugStatus(d.available ? { state: 'ok', msg: `${orgSlug}.collarone.app is reserved for you` } : { state: 'bad', msg: d.reason || 'That handle is already taken.' });
      } catch (e) {
        setSlugStatus({ state: 'bad', msg: e.message });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [orgSlug]);

  const pickLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setErr('Logo must be under 3 MB.'); return; }
    setLogoPreview(URL.createObjectURL(file));
    setLogoUploading(true);
    setErr('');
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const token = crypto.randomUUID();
      const path = `pending/${token}/logo.${ext}`;
      const { error } = await supabase.storage.from('org-logos').upload(path, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
      setLogoUrl(`${SUPABASE_URL}/storage/v1/object/public/org-logos/${path}`);
    } catch (e2) {
      setErr(e2.message);
      setLogoPreview('');
    } finally {
      setLogoUploading(false);
    }
  };

  const next = () => {
    setErr('');
    if (step === 'company') {
      if (!orgName.trim()) return setErr('Company name is required.');
      if (slugStatus.state !== 'ok') return setErr('Choose an available company handle before continuing.');
    }
    if (step === 'brand' && logoUploading) return setErr('Your logo is still uploading — one moment.');
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  };
  const back = () => { setErr(''); setStepIdx((i) => Math.max(i - 1, 0)); };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!ownerName.trim()) return setErr('Your name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr('Enter a valid work email.');
    if (password.length < 8) return setErr('Password must be at least 8 characters.');
    setBusy(true);
    try {
      const d = await callSignup('create', {
        planTier, orgName: orgName.trim(), orgSlug, themeColor, websiteType, logoUrl, country,
        ownerName: ownerName.trim(), email, password, promoCode: promoStatus.state === 'ok' ? promoCode.trim() : '',
      });
      setResult(d);
      setStepIdx(STEPS.indexOf('payment'));
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="su-bg">
      <Link className="su-brand" to="/">
        <img src={logo} alt="" />
        <span>Collar<em>One</em></span>
      </Link>
      <Link className="su-back" to="/">← Back to homepage</Link>

      <div className="su-card">
        <div className="su-steps">
          {STEPS.map((s, i) => (
            <div key={s} className={`su-step-dot ${i < stepIdx ? 'done' : i === stepIdx ? 'active' : ''}`} />
          ))}
        </div>

        {err && <div className="su-err">{err}</div>}

        {step === 'plan' && (
          <>
            <p className="su-kicker">Step 1 of 4</p>
            <h1 className="su-h">Choose your plan</h1>
            <p className="su-sub">Your rate locks in today — it won't change later even if our published prices do.</p>
            <div className="su-plans">
              {PLANS.map((p) => (
                <button key={p.key} type="button" className={`su-plan ${planTier === p.key ? 'on' : ''}`} onClick={() => setPlanTier(p.key)}>
                  <div>
                    <div className="su-plan-name">{p.name}</div>
                    <div className="su-plan-price">{p.price}</div>
                  </div>
                  <div className="su-plan-radio" />
                </button>
              ))}
            </div>
            <div className="su-actions">
              <span />
              <button type="button" className="su-btn su-btn-primary" onClick={next}>Continue</button>
            </div>
          </>
        )}

        {step === 'company' && (
          <>
            <p className="su-kicker">Step 2 of 4</p>
            <h1 className="su-h">About your company</h1>
            <p className="su-sub">This becomes your workspace identity inside Collarone.</p>
            <div className="su-field">
              <label>Company name</label>
              <input className="su-input" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Lira Threads Ltd" autoFocus />
            </div>
            <div className="su-field">
              <label>Company handle</label>
              <div className="su-slug-row">
                <input className="su-input" value={orgSlug} onChange={(e) => { setSlugTouched(true); setOrgSlug(slugify(e.target.value)); }} placeholder="lira-threads" />
                <span className="su-slug-suffix">.collarone.app</span>
              </div>
              {slugStatus.msg && <div className={`su-slug-msg ${slugStatus.state === 'ok' ? 'ok' : slugStatus.state === 'bad' ? 'bad' : ''}`}>{slugStatus.msg}</div>}
            </div>
            <div className="su-field">
              <label>Country</label>
              <select className="su-input" value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div className="su-actions">
              <button type="button" className="su-btn su-btn-ghost" onClick={back}>Back</button>
              <button type="button" className="su-btn su-btn-primary" onClick={next}>Continue</button>
            </div>
          </>
        )}

        {step === 'brand' && (
          <>
            <p className="su-kicker">Step 3 of 4</p>
            <h1 className="su-h">Brand your space</h1>
            <p className="su-sub">Your logo and colour carry through your dashboard. You can change these anytime.</p>
            <div className="su-field">
              <label>Logo (optional)</label>
              <div className="su-logo-row">
                <div className="su-logo-preview">
                  {logoPreview ? <img src={logoPreview} alt="" /> : <span style={{ fontSize: 11, color: 'rgba(10,14,26,0.4)' }}>Logo</span>}
                </div>
                <button type="button" className="su-btn su-btn-ghost" onClick={() => fileRef.current?.click()} disabled={logoUploading}>
                  {logoUploading ? 'Uploading…' : logoPreview ? 'Change logo' : 'Upload logo'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" onChange={pickLogo} style={{ display: 'none' }} />
              </div>
            </div>
            <div className="su-field">
              <label>Brand colour</label>
              <div className="su-swatches">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" className={`su-swatch ${themeColor === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setThemeColor(c)} aria-label={c} />
                ))}
              </div>
            </div>
            <div className="su-field">
              <label>What kind of public website do you need?</label>
              <div className="su-web-types">
                {WEBSITE_TYPES.map((w) => (
                  <button key={w.key} type="button" className={`su-web-card ${websiteType === w.key ? 'on' : ''}`} onClick={() => setWebsiteType(w.key)}>
                    <div className="su-web-card-name">{w.name}</div>
                    <div className="su-web-card-desc">{w.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="su-actions">
              <button type="button" className="su-btn su-btn-ghost" onClick={back}>Back</button>
              <button type="button" className="su-btn su-btn-primary" onClick={next}>Continue</button>
            </div>
          </>
        )}

        {step === 'you' && (
          <form onSubmit={submit}>
            <p className="su-kicker">Step 4 of 4</p>
            <h1 className="su-h">Create your admin account</h1>
            <p className="su-sub">You'll be the administrator for {orgName || 'your workspace'} — you can add staff once your space is active.</p>
            <div className="su-field">
              <label>Your name</label>
              <input className="su-input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} autoFocus />
            </div>
            <div className="su-field">
              <label>Work email</label>
              <input className="su-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div className="su-field">
              <label>Password</label>
              <input className="su-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" />
            </div>
            <div className="su-field">
              <label>Promo code <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
              <input className="su-input" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder="Got a code? Enter it here" style={{ textTransform: 'uppercase' }} />
              {promoStatus.state === 'checking' && <p style={{ fontSize: 12.5, margin: '6px 0 0', opacity: 0.6 }}>Checking…</p>}
              {promoStatus.state === 'ok' && <p style={{ fontSize: 12.5, margin: '6px 0 0', color: '#1F6D45', fontWeight: 600 }}>✓ {promoStatus.msg}</p>}
              {promoStatus.state === 'bad' && <p style={{ fontSize: 12.5, margin: '6px 0 0', color: '#c02b2b' }}>{promoStatus.msg}</p>}
            </div>
            <p className="su-sub" style={{ marginBottom: 0, fontSize: 12.5 }}>
              By continuing you agree to Collarone's <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
            </p>
            <div className="su-actions">
              <button type="button" className="su-btn su-btn-ghost" onClick={back}>Back</button>
              <button className="su-btn su-btn-primary" disabled={busy}>{busy ? 'Creating your space…' : 'Create workspace'}</button>
            </div>
          </form>
        )}

        {step === 'payment' && result && result.activated && (
          <>
            <p className="su-kicker">🎉 You're in</p>
            <h1 className="su-h">{orgName} is live</h1>
            <div className="su-pay-ref">
              <div className="su-pay-amt" style={{ color: '#1F6D45' }}>₦0</div>
              <div className="su-pay-ref-code">Code {result.promoApplied?.code} applied — activation on us.</div>
              <p className="su-pay-note">
                Your workspace is active right now — nothing to pay, nothing to wait for. Sign in with {email} and start setting up your team.
              </p>
            </div>
            <div className="su-actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="su-btn su-btn-primary" onClick={() => nav('/login')}>Sign in to your workspace</button>
            </div>
          </>
        )}

        {step === 'payment' && result && !result.activated && (
          <>
            <p className="su-kicker">You're almost in</p>
            <h1 className="su-h">Activate {orgName}</h1>
            <div className="su-pay-ref">
              {result.promoApplied ? (
                <div className="su-pay-amt">
                  <span style={{ textDecoration: 'line-through', opacity: 0.35, fontSize: '0.6em', marginRight: 10 }}>₦{(result.promoApplied.baseKobo / 100).toLocaleString()}</span>
                  ₦{(result.amountKobo / 100).toLocaleString()}
                </div>
              ) : (
                <div className="su-pay-amt">₦{(result.amountKobo / 100).toLocaleString()}</div>
              )}
              {result.promoApplied && <div style={{ fontSize: 13, color: '#1F6D45', fontWeight: 600, marginBottom: 6 }}>Code {result.promoApplied.code} — {result.promoApplied.percentOff}% off applied</div>}
              <div className="su-pay-ref-code">Reference: {result.reference}</div>
              <p className="su-pay-note">
                During early access, we confirm payments personally — WhatsApp us your reference and we'll send transfer details and activate your space the same day. Once active, sign in with {email} to reach your dashboard.
              </p>
            </div>
            <div className="su-actions" style={{ justifyContent: 'center', gap: 12 }}>
              <a className="su-btn su-btn-primary" href={`https://wa.me/2348148128551?text=${encodeURIComponent(`Hi, I just signed up for Collarone. My company is ${orgName} and my reference is ${result.reference}.`)}`} target="_blank" rel="noreferrer">
                Send reference on WhatsApp
              </a>
              <button type="button" className="su-btn su-btn-ghost" onClick={() => nav('/login')}>I'll sign in later</button>
            </div>
          </>
        )}
      </div>

      {step !== 'payment' && (
        <p className="su-foot">Already have a workspace? <Link to="/login">Sign in</Link></p>
      )}
    </div>
  );
}
