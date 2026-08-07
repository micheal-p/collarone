import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import logo from '../assets/collarone-mark.svg';
import './Signup.css';

// Pick a starting plan by size. Suites can be added anytime and billing keeps
// the org on the cheapest plan for what it actually runs — no per-extra-suite
// fee to game (matches the honest landing estimator).
export { PER_STAFF_FEE, PLANS, ANNUAL_DISCOUNT } from '../lib/pricing.js';
import { PER_STAFF_FEE, PLANS, ANNUAL_DISCOUNT, usePricing, naira } from '../lib/pricing.js';
import { SUITES, SUITE_META, FAMILIES, SUITE_FAMILY, PRESETS, requiredFoundations, requiresOf } from '../config/suites.js';
import SuiteIcon from '../components/SuiteIcon.jsx';

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
  { key: 'hr_corporate', name: 'Company site', desc: 'About, services and contact, a home for your business online.' },
  { key: 'job_board', name: 'Careers / job board', desc: 'Public postings, candidates apply with no account.' },
  { key: 'none', name: 'Skip for now', desc: 'Just the ERP dashboard, add a site later.' },
];

const STEPS = ['plan', 'company', 'brand', 'you', 'payment'];
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

async function callSignup(action, payload) {
  // Send the session token when logged in — lets a poster upgrading from their
  // dashboard prove they own the email so the server can adopt their account.
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* noop */ }
  if (!res.ok) {
    // Never surface a data-shaped "message" ('{}', a JSON blob) to a visitor —
    // someone saw exactly that mid-signup once. Humans get sentences.
    const raw = typeof data?.message === 'string' ? data.message.trim() : '';
    const e = new Error(raw && raw !== '{}' && !raw.startsWith('{') ? raw : 'Something went wrong on our side — please try again in a minute.');
    e.status = res.status; throw e;
  }
  return data;
}

export default function Signup() {
  // Safety net: a leftover try-demo sandbox flag must never leak into real
  // auth — purge it and reload so the API layer rebinds to Supabase.
  useEffect(() => {
    if (import.meta.env.VITE_DEMO_MODE !== 'true' && sessionStorage.getItem('co-try-demo') === '1') {
      sessionStorage.removeItem('co-try-demo');
      localStorage.removeItem('orgops_demo_session');
      window.location.reload();
    }
  }, []);
  const { perStaff } = usePricing(); // live published prices re-render the cart
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [planTier, setPlanTier] = useState(PLANS.some((p) => p.key === params.get('plan')) ? params.get('plan') : 'startup');
  // ---- Step 1 is a CART: pick suites → we auto-price the cheapest plan ----
  const [suites, setSuites] = useState(() => new Set(SUITES.slice(0, 5).map((s) => s.key)));
  const [staffCount, setStaffCount] = useState(5);
  const perStaffFee = perStaff || PER_STAFF_FEE;
  const suiteCount = suites.size;
  const priceFor = (t) => t.baseFee + Math.max(0, suiteCount - t.includedSuites) * t.extraSuiteFee + staffCount * perStaffFee;
  const best = PLANS.filter((t) => t.key !== 'enterprise').reduce((a, b) => (priceFor(b) < priceFor(a) ? b : a));
  const monthly = priceFor(best);
  const lockedKeys = new Set();
  for (const k of suites) for (const dep of requiresOf(k)) lockedKeys.add(dep);
  useEffect(() => { setPlanTier(best.key); }, [best.key]);
  const toggleSuite = (key) => setSuites((s) => {
    const next = new Set(s);
    if (next.has(key)) { if ([...next].some((k) => k !== key && requiresOf(k).includes(key))) return next; next.delete(key); }
    else for (const dep of requiredFoundations([key])) next.add(dep);
    return next;
  });
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugStatus, setSlugStatus] = useState({ state: 'idle', msg: '' });

  const [themeColor, setThemeColor] = useState('#FF5B1F');
  const [websiteType, setWebsiteType] = useState('hr_corporate');
  const [hasWebsite, setHasWebsite] = useState(false);
  const [externalUrl, setExternalUrl] = useState('');
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
  // Self-serve Paystack for Collarone's own activation fee — appears only
  // when PLATFORM_PAYSTACK_SECRET is configured on the server.
  const [payOnline, setPayOnline] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  useEffect(() => {
    fetch('/api/platform-pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }) })
      .then((r) => r.json()).then((d) => setPayOnline(Boolean(d.enabled))).catch(() => {});
  }, []);
  const startOnlinePayment = async () => {
    setPaying(true); setPayError('');
    try {
      const r = await fetch('/api/platform-pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'init', reference: result.reference, email }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.authorizationUrl) throw new Error(d.message || 'Could not start the payment.');
      window.location.href = d.authorizationUrl;
    } catch (e2) { setPayError(e2.message); setPaying(false); }
  };

  // Live promo validation, debounced — redemption itself only happens
  // server-side at create time (see api/signup.js).
  useEffect(() => {
    const code = promoCode.trim();
    if (!code) { setPromoStatus({ state: 'idle', percentOff: 0, msg: '' }); return; }
    setPromoStatus({ state: 'checking', percentOff: 0, msg: '' });
    const t = setTimeout(async () => {
      try {
        const d = await callSignup('check-promo', { code });
        if (!d.valid) { setPromoStatus({ state: 'bad', percentOff: 0, msg: d.reason }); return; }
        const parts = [];
        parts.push(d.percentOff === 100
          ? (d.trialDays ? `Free access for ${d.trialDays} day${d.trialDays === 1 ? '' : 's'}, no payment to start.` : 'This code makes your activation free.')
          : `${d.percentOff}% off your activation fee.`);
        if (d.grantCredits > 0) parts.push(`Includes ${d.grantCredits} free staff seat${d.grantCredits === 1 ? '' : 's'}.`);
        setPromoStatus({ state: 'ok', percentOff: d.percentOff, msg: parts.join(' ') });
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
    const previewUrl = URL.createObjectURL(file);
    setLogoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return previewUrl; });
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
      URL.revokeObjectURL(previewUrl);
      setLogoPreview('');
    } finally {
      setLogoUploading(false);
    }
  };

  const next = () => {
    setErr('');
    if (step === 'company') {
      if (hasWebsite && !externalUrl.trim()) return setErr("Enter your website address, or choose 'Not yet'.");
      if (!orgName.trim()) return setErr('Company name is required.');
      if (slugStatus.state !== 'ok') return setErr('Choose an available company handle before continuing.');
    }
    if (step === 'brand' && logoUploading) return setErr('Your logo is still uploading, one moment.');
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
        planTier: best.key, suites: [...suites], orgName: orgName.trim(), orgSlug, themeColor,
        websiteType: hasWebsite ? 'none' : websiteType, logoUrl, country,
        externalWebsiteUrl: hasWebsite ? (/^https?:\/\//i.test(externalUrl.trim()) ? externalUrl.trim() : `https://${externalUrl.trim()}`) : '',
        ownerName: ownerName.trim(), email, password, promoCode: promoStatus.state === 'ok' ? promoCode.trim() : '',
      });
      setResult(d);
      setStepIdx(STEPS.indexOf('payment'));
    } catch (e2) {
      setErr(e2.message);
      // Record the failure even when the server never got the request (network
      // drop, deploy blip) — a lost signup must always leave a trace.
      try {
        // The email and company make the trace ACTIONABLE — a failed signup
        // becomes someone we can reach, not just a count. Never the password.
        fetch('/api/track', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `signup submit failed: ${String(e2?.message || e2).slice(0, 200)}`,
            stack: JSON.stringify({ email, orgName: orgName.trim(), slug: orgSlug }).slice(0, 500),
            path: '/signup',
          }),
        }).catch(() => {});
      } catch { /* reporting must never mask the real error */ }
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

      <div className={`su-card${step === 'plan' ? ' su-card-wide' : ''}`}>
        <div className="su-steps">
          {STEPS.filter((s) => s !== 'payment').map((s, i) => (
            <div key={s} className={`su-step-dot ${i < stepIdx ? 'done' : i === stepIdx ? 'active' : ''}`} />
          ))}
        </div>

        {err && <div className="su-err">{err}</div>}

        {step === 'plan' && (
          <>
            <p className="su-kicker">Step 1 of 4</p>
            <h1 className="su-h">Build your workspace</h1>
            <p className="su-sub">Pick the suites you need, we automatically put you on the cheapest plan for them. Add more anytime; your rate locks in today and never goes up.</p>

            <AiSuitePicker onPick={(keys) => setSuites(new Set(requiredFoundations(keys)))} />

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#667' }}>Quick start:</span>
              {PRESETS.map((p) => (
                <button key={p.key} type="button" onClick={() => setSuites(new Set(requiredFoundations(p.suites)))}
                  style={{ padding: '6px 13px', borderRadius: 100, border: '1px dashed #d8d2c4', background: 'transparent', fontSize: 12.5, fontWeight: 600, color: '#C2410C', cursor: 'pointer' }}>{p.label}</button>
              ))}
            </div>

            {FAMILIES.map((fam) => {
              const inFam = SUITES.filter((s) => SUITE_FAMILY[s.key] === fam.key);
              if (!inFam.length) return null;
              return (
                <div key={fam.key} style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#99a', flex: '0 0 auto', minWidth: 78, whiteSpace: 'nowrap' }}>{fam.shortLabel || fam.label.split(' — ')[0]}</span>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1, minWidth: 260 }}>
                    {inFam.map((s) => {
                      const on = suites.has(s.key); const locked = lockedKeys.has(s.key); const meta = SUITE_META[s.key] || {};
                      return (
                        <button key={s.key} type="button" onClick={() => toggleSuite(s.key)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px 5px 6px', borderRadius: 100, border: `1px solid ${on ? '#FF5B1F' : '#e5e1d6'}`, background: on ? 'rgba(255,91,31,0.08)' : '#fff', fontSize: 12.5, fontWeight: 550, color: on ? '#14161a' : '#556', cursor: locked ? 'default' : 'pointer' }}>
                          <span style={{ width: 20, height: 20, borderRadius: 100, display: 'grid', placeItems: 'center', background: on ? (meta.tint || '#FF5B1F') : '#e5e1d6', flexShrink: 0 }}>
                            <SuiteIcon name={meta.icon || 'grid'} size={11} color="#fff" />
                          </span>
                          {s.name}
                          {locked && <span style={{ fontSize: 10, color: '#99a', fontWeight: 600 }}>incl.</span>}
                        </button>
                      );
                    })}
                  </span>
                </div>
              );
            })}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '18px 0 16px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#556' }}>How many staff?</span>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e5e1d6', borderRadius: 10, overflow: 'hidden' }}>
                <button type="button" onClick={() => setStaffCount((c) => Math.max(1, c - 1))} style={{ width: 34, height: 34, border: 'none', background: 'transparent', fontSize: 17, cursor: 'pointer' }}>−</button>
                <input value={staffCount} inputMode="numeric" onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); setStaffCount(Number.isNaN(n) ? 1 : Math.min(1000, Math.max(1, n))); }} style={{ width: 54, height: 34, border: 'none', borderLeft: '1px solid #e5e1d6', borderRight: '1px solid #e5e1d6', textAlign: 'center', font: 'inherit', fontWeight: 650 }} />
                <button type="button" onClick={() => setStaffCount((c) => Math.min(1000, c + 1))} style={{ width: 34, height: 34, border: 'none', background: 'transparent', fontSize: 17, cursor: 'pointer' }}>+</button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', background: '#faf7f0', borderRadius: 12, marginBottom: 18 }}>
              <span style={{ fontSize: 12.5, color: '#889' }}>Best plan: <b style={{ color: '#14161a' }}>{best.name}</b> · {suiteCount} suite{suiteCount === 1 ? '' : 's'} · {staffCount} staff</span>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 24, fontWeight: 650 }}>{naira(monthly)}<span style={{ fontSize: 13, color: '#889', fontWeight: 400 }}>/mo</span></span>
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
              <label>Does your company have a website already?</label>
              <div className="su-web-types" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <button type="button" className={`su-web-card ${!hasWebsite ? 'on' : ''}`} onClick={() => setHasWebsite(false)}>
                  <div className="su-web-card-name">Not yet</div>
                  <div className="su-web-card-desc">{orgSlug ? `${orgSlug}.collarone.app` : 'your-handle.collarone.app'} becomes your address, build your site inside Collarone.</div>
                </button>
                <button type="button" className={`su-web-card ${hasWebsite ? 'on' : ''}`} onClick={() => setHasWebsite(true)}>
                  <div className="su-web-card-name">Yes, we have one</div>
                  <div className="su-web-card-desc">We'll link your existing site, your workspace still lives on the handle above.</div>
                </button>
              </div>
              {hasWebsite && (
                <input className="su-input" style={{ marginTop: 10 }} value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://yourcompany.com" inputMode="url" />
              )}
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
            {hasWebsite ? (
              <div className="su-field">
                <label>Your website</label>
                <p className="su-sub" style={{ margin: 0 }}>We'll use {externalUrl || 'your existing site'}, and you can still build a Collarone site later if you ever want one.</p>
              </div>
            ) : (
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
            )}
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
            <p className="su-sub">You'll be the administrator for {orgName || 'your workspace'}, you can add staff once your space is active.</p>
            <div className="su-field">
              <label>Your name</label>
              <input className="su-input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} autoFocus />
            </div>
            <div className="su-field">
              <label>Email address</label>
              <input className="su-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
              <p style={{ fontSize: 12, margin: '6px 0 0', opacity: 0.6, lineHeight: 1.5 }}>This is what you'll sign in with, any email works.</p>
            </div>
            <div className="su-field">
              <label>Password</label>
              <input className="su-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" />
            </div>
            <div className="su-field">
              <label>Promo code <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
              <input className="su-input" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder="Got a code? Enter it here" style={{ textTransform: 'uppercase' }} />
              {promoStatus.state === 'checking' && <p style={{ fontSize: 12.5, margin: '6px 0 0', opacity: 0.6 }}>Checking…</p>}
              {promoStatus.state === 'ok' && <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, margin: '6px 0 0', color: '#1F6D45', fontWeight: 600 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>{promoStatus.msg}</p>}
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
            <p className="su-kicker" style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1F6D45" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9.5" /><path d="M8 12.5l2.7 2.7L16 9.5" /></svg>
              You're in
            </p>
            <h1 className="su-h">{orgName} is live</h1>
            <div className="su-pay-ref">
              <div className="su-pay-amt" style={{ color: '#1F6D45' }}>₦0</div>
              <div className="su-pay-ref-code">
                Code {result.promoApplied?.code} applied
                {result.promoApplied?.trialDays ? `, free for ${result.promoApplied.trialDays} day${result.promoApplied.trialDays === 1 ? '' : 's'}` : ', activation on us'}
                {result.promoApplied?.grantCredits > 0 && `, with ${result.promoApplied.grantCredits} free staff seat${result.promoApplied.grantCredits === 1 ? '' : 's'}`}.
              </div>
              <p className="su-pay-note">
                Your workspace is active right now, nothing to pay to start. Sign in with {email} and start setting up your team.
                {result.promoApplied?.trialDays ? ' When your trial ends, complete the activation payment to keep going.' : ''}
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
              {result.promoApplied && <div style={{ fontSize: 13, color: '#1F6D45', fontWeight: 600, marginBottom: 6 }}>Code {result.promoApplied.code}, {result.promoApplied.percentOff}% off applied</div>}
              <div className="su-pay-ref-code">Reference: {result.reference}</div>
              <p className="su-pay-note">
                During early access, we confirm payments personally, WhatsApp us your reference and we'll send transfer details and activate your space the same day. Once active, sign in with {email} to reach your dashboard.
              </p>
            </div>
            <div className="su-actions" style={{ justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              {payOnline && (
                <button type="button" className="su-btn su-btn-primary" disabled={paying} onClick={startOnlinePayment}>
                  {paying ? 'Opening secure payment…' : 'Pay online now (card / bank / USSD)'}
                </button>
              )}
              <a className={`su-btn ${payOnline ? 'su-btn-ghost' : 'su-btn-primary'}`} href={`https://wa.me/2348148128551?text=${encodeURIComponent(`Hi, I just signed up for Collarone. My company is ${orgName} and my reference is ${result.reference}.`)}`} target="_blank" rel="noreferrer">
                Send reference on WhatsApp
              </a>
              <button type="button" className="su-btn su-btn-ghost" onClick={() => nav('/login')}>I'll sign in later</button>
            </div>
            {payError && <p style={{ color: '#C0392B', fontSize: 13, textAlign: 'center', marginTop: 10 }}>{payError}</p>}
          </>
        )}
      </div>

      {step !== 'payment' && (
        <p className="su-foot">Already have a workspace? <Link to="/login">Sign in</Link></p>
      )}
    </div>
  );
}

// "Describe your business — we'll pick your suites." The AI signup helper:
// public read-only endpoint (throttled server-side), applies its suggestion
// straight to the cart (foundations auto-added), and the visitor can still
// tick anything on or off afterwards. Hidden entirely until the platform's
// AI is switched on — no dead UI.
function AiSuitePicker({ onPick }) {
  // Always visible — if the platform AI isn't switched on yet, submitting
  // shows the server's honest message and the visitor picks manually.
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState('');
  const [err, setErr] = useState('');

  const suggest = async () => {
    setBusy(true); setErr(''); setWhy('');
    try {
      const r = await fetch('/api/onboard-ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest', prompt }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || 'Suggestion failed.');
      const valid = d.suites.filter((k) => SUITES.some((s) => s.key === k && s.status === 'live'));
      if (valid.length) { onPick(valid); setWhy(d.why || 'Done, your picks are ticked below. Adjust anything.'); }
      else setErr('No matching suites, pick them yourself below.');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div style={{ background: 'rgba(255,91,31,0.07)', borderRadius: 12, padding: '13px 15px', marginBottom: 16 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 650, marginBottom: 7 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#FF5B1F" aria-hidden="true"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2zm7 13l.9 3.1L23 19l-3.1.9L19 23l-.9-3.1L15 19l3.1-.9L19 15z" /></svg>
        Not sure what you need? Describe your business
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && prompt.trim().length >= 8 && suggest()}
          placeholder={'e.g. "a fashion store in Aba"'}
          style={{ flex: 1, minWidth: 220, padding: '9px 12px', borderRadius: 10, border: '1px solid #d8d2c4', font: 'inherit', fontSize: 13.5 }} />
        <button type="button" className="su-btn su-btn-primary" disabled={busy || prompt.trim().length < 8} onClick={suggest}
          style={{ flexShrink: 0 }}>{busy ? 'Thinking…' : 'Pick for me'}</button>
      </div>
      {why && <p style={{ fontSize: 12.5, color: '#1a6a1a', margin: '8px 0 0', lineHeight: 1.5 }}>{why}</p>}
      {err && <p style={{ fontSize: 12.5, color: '#a4262c', margin: '8px 0 0' }}>{err}</p>}
    </div>
  );
}
