import { Fragment, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPatch } from '../api/client.js';
import { supabase } from '../lib/supabaseClient.js';
import { waLink } from '../lib/whatsapp.js';
import { FOUNDING_ORG_ID } from '../config/org.js';
import PlatformShell from '../components/PlatformShell.jsx';
import { SUITES } from '../config/suites.js';
import { useToast } from '../components/ui.jsx';
import ThemeMockup from '../components/ThemeMockup.jsx';
import ThemePreviewModal from '../components/ThemePreview.jsx';

const GUEST_KEY = 'collarone_guest_mode';

const STATUS_LABEL = { pending_payment: 'Pending payment', active: 'Active', past_due: 'Past due', read_only: 'Read-only', suspended: 'Suspended', cancelled: 'Cancelled' };
const AUDIT_LABEL = { confirm_payment: 'Confirmed payment', delete_org: 'Deleted organization', impersonate: 'Impersonated admin (retired)', guest_mode: 'Guested into organization', payment_gateway: 'Changed card-payment gateway' };
const ALL_SUITE_KEYS = ['hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm', 'attendance', 'procurement', 'inventory', 'finance', 'projects', 'documents'];
const COUNTRY_NAME = { NG: 'Nigeria', GH: 'Ghana', KE: 'Kenya', ZA: 'South Africa', EG: 'Egypt', GB: 'United Kingdom', US: 'United States' };

const naira = (kobo) => `₦${(kobo / 100).toLocaleString()}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_DOT = { active: 'var(--ok)', pending_payment: 'var(--warn)', past_due: 'var(--warn)', read_only: '#d97f35', suspended: 'var(--err)', cancelled: 'var(--faint)' };

function SectionHead({ title, count, children }) {
  return (
    <div className="pc-sec-head">
      <h2 className="pc-sec-title">{title}</h2>
      {count !== undefined && <span className="pc-sec-count">{count}</span>}
      <span className="pc-sec-spacer" />
      {children}
    </div>
  );
}

function StatusRow() {
  const [live, setLive] = useState(null);
  const [openIncident, setOpenIncident] = useState(null);

  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then(setLive).catch(() => {});
    apiGet('/status/incidents').then((d) => setOpenIncident((d.incidents || []).find((i) => !i.resolved_at) || null)).catch(() => {});
  }, []);

  const state = live ? live.status : 'checking';
  const color = { operational: 'var(--ok)', degraded: 'var(--warn)', down: 'var(--err)', checking: 'var(--faint)' }[state];
  const label = { operational: 'All systems operational', degraded: 'Degraded performance', down: 'Service disruption', checking: 'Checking…' }[state];

  return (
    <div className="pc-panel" style={{ marginBottom: 36 }}>
      <a className="pc-status" href="/status" target="_blank" rel="noreferrer">
        <span className="pc-dot" style={{ background: color }} />
        <span style={{ fontWeight: 550 }}>{label}</span>
        {live && <span className="pc-mono pc-faint" style={{ fontSize: 11.5 }}>{live.responseMs}ms</span>}
        {openIncident && (
          <span style={{ color: 'var(--err)', fontSize: 12 }}>
            ongoing incident since {new Date(openIncident.started_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <span className="pc-sec-spacer" />
        <span className="pc-faint" style={{ fontSize: 12 }}>status page ↗</span>
      </a>
    </div>
  );
}

// Messages submitted via the public /contact page — a platform-level inbox,
// separate from any tenant's own CRM inbox. No automated sending exists
// anywhere in this codebase, so this doesn't pretend to send anything — it
// just gets you to the real channel (WhatsApp / email / phone) fast.
function ContactMessagesPanel({ flash }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showReplied, setShowReplied] = useState(false);

  const load = () => { apiGet('/platform/contact-messages').then((d) => setMessages(d.messages)).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(load, []);

  const markReplied = async (m) => {
    try { await apiPost(`/platform/contact-messages/${m.id}/reply`); setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, status: 'replied', replied_at: new Date().toISOString() } : x))); }
    catch (e) { flash(e.message, true); }
  };

  const newCount = messages.filter((m) => m.status === 'new').length;
  const visible = showReplied ? messages : messages.filter((m) => m.status === 'new');

  return (
    <section className="pc-section">
      <SectionHead title="Messages" count={newCount > 0 ? `${newCount} new` : String(messages.length)}>
        <button className="pc-btn sm" onClick={() => setShowReplied((v) => !v)}>{showReplied ? 'Hide replied' : 'Show all'}</button>
      </SectionHead>

      {loading && <p className="pc-dim" style={{ fontSize: 13 }}>Loading…</p>}
      {!loading && visible.length === 0 && (
        <div className="pc-panel" style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--faint)' }}>
          {showReplied ? 'No messages yet.' : 'No new messages — you\'re all caught up.'}
        </div>
      )}
      {visible.length > 0 && (
        <div className="pc-panel">
          {visible.map((m) => (
            <div key={m.id} style={{ padding: '13px 16px', borderTop: '1px solid var(--line)', opacity: m.status === 'replied' ? 0.55 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 5 }}>
                <strong style={{ fontSize: 13.5 }}>{m.name}</strong>
                {m.company && <span className="pc-dim" style={{ fontSize: 12 }}>{m.company}</span>}
                <span className={`pc-badge ${m.status === 'new' ? 'accent' : 'ok'}`}>{m.status === 'new' ? 'NEW' : 'REPLIED'}</span>
                <span className="pc-sec-spacer" />
                <span className="pc-mono pc-faint" style={{ fontSize: 11 }}>{fmtDateTime(m.created_at)}</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--dim)', margin: '0 0 10px', lineHeight: 1.55, maxWidth: 760 }}>{m.message}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {m.phone && <a className="pc-btn sm" style={{ textDecoration: 'none' }} href={waLink(m.phone)} target="_blank" rel="noreferrer">Reply on WhatsApp</a>}
                {m.email && <a className="pc-btn sm" style={{ textDecoration: 'none' }} href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your message to Collarone')}`}>Email</a>}
                {m.phone && <a className="pc-btn sm" style={{ textDecoration: 'none' }} href={`tel:+${waLink(m.phone).split('/').pop()}`}>Call</a>}
                {m.status === 'new' && <button className="pc-btn sm" style={{ marginLeft: 'auto' }} onClick={() => markReplied(m)}>Mark as replied</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Real crashes from real users' browsers — reported by the global crash
// reporter (lib/crashReporter.js) via /api/track. The uptime checks on
// /status only prove the API and database answer; this panel is where a
// front-end error actually shows up.
function AppErrorsPanel() {
  const [errors, setErrors] = useState([]);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    apiGet('/platform/client-errors').then((d) => setErrors(d.errors || [])).catch(() => {});
  }, []);

  // group identical messages so a crash loop reads as one row, not fifty
  const grouped = useMemo(() => {
    const m = new Map();
    errors.forEach((e) => {
      const g = m.get(e.message);
      if (g) { g.count += 1; if (e.occurred_at > g.last) g.last = e.occurred_at; }
      else m.set(e.message, { ...e, count: 1, last: e.occurred_at });
    });
    return [...m.values()].sort((a, b) => (a.last < b.last ? 1 : -1));
  }, [errors]);

  const weekCount = errors.filter((e) => Date.now() - new Date(e.occurred_at).getTime() < 7 * DAY_MS).length;

  return (
    <section className="pc-section">
      <SectionHead title="App errors" count={weekCount > 0 ? `${weekCount} this week` : '0 this week'} />
      {grouped.length === 0 ? (
        <div className="pc-panel" style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--faint)' }}>
          No front-end errors reported. Crashes inside users' browsers are captured automatically and land here.
        </div>
      ) : (
        <div className="pc-panel">
          {grouped.map((e) => (
            <div key={e.id} style={{ padding: '11px 16px', borderTop: '1px solid var(--line)', cursor: e.stack ? 'pointer' : 'default' }}
              onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span className="pc-mono" style={{ fontSize: 12.5, color: 'var(--err)' }}>{e.message}</span>
                {e.count > 1 && <span className="pc-badge accent">×{e.count}</span>}
                <span className="pc-sec-spacer" />
                {e.path && <span className="pc-mono pc-faint" style={{ fontSize: 11 }}>{e.path}</span>}
                <span className="pc-mono pc-faint" style={{ fontSize: 11 }}>{fmtDateTime(e.last)}</span>
              </div>
              {expanded === e.id && e.stack && (
                <pre className="pc-mono" style={{ fontSize: 11, color: 'var(--dim)', margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 180, overflow: 'auto' }}>{e.stack}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}



// Which suites the public can try at /try/<suite> — plus the funnel and what
// triers wrote. This is the "what should we fix next" panel: response rates,
// ease scores, would-they-pay, and the free-text comments in full.
function DemoSuitesPanel({ flash }) {
  const [rows, setRows] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [starts, setStarts] = useState({});
  const load = () => { apiGet('/platform/demo-suites').then((d) => { setRows(d.demoSuites || []); setFeedback(d.feedback || []); setStarts(d.starts || {}); }).catch(() => {}); };
  useEffect(load, []);
  const toggle = async (r) => {
    try { await apiPost('/platform/demo-suites', { suiteKey: r.suite_key, enabled: !r.enabled }); load(); }
    catch (e) { flash(e.message, true); }
  };
  if (!rows.length) return null;
  const name = (k) => SUITES.find((s2) => s2.key === k)?.name || k;
  const fbFor = (k) => feedback.filter((x) => x.suite_key === k);
  const comments = feedback.filter((f) => f.comment && f.comment.trim());

  return (
    <section className="pc-section">
      <SectionHead title="Public suite demos" count={`${rows.filter((r) => r.enabled).length} open`} />
      <p style={{ fontSize: 12.5, color: 'var(--faint)', margin: '0 0 12px' }}>
        Open suites appear as "Try it" on the landing page. The numbers below are the improvement loop: low ease = the
        suite (or its tour) is confusing; low would-pay = the value story isn't landing; the comments say why, in the
        prospect's own words.
      </p>

      <div className="pc-panel pc-tablewrap" style={{ marginBottom: 14 }}>
        <table className="pc-table">
          <thead><tr><th>Suite</th><th>Demo</th><th className="r">Starts</th><th className="r">Responses</th><th className="r">Resp. rate</th><th className="r">Ease avg</th><th className="r">Would pay</th></tr></thead>
          <tbody>
            {rows.sort((a, b) => (starts[b.suite_key] || 0) - (starts[a.suite_key] || 0)).map((r) => {
              const f = fbFor(r.suite_key);
              const st = starts[r.suite_key] || 0;
              const ease = f.length ? (f.reduce((a2, b2) => a2 + b2.ease, 0) / f.length) : null;
              const yes = f.filter((x) => x.would_pay === 'yes').length;
              const maybe = f.filter((x) => x.would_pay === 'maybe').length;
              return (
                <tr key={r.suite_key}>
                  <td style={{ fontWeight: 550 }}>{name(r.suite_key)}</td>
                  <td><button className={`pc-btn sm${r.enabled ? ' primary' : ''}`} onClick={() => toggle(r)}>{r.enabled ? 'Open' : 'Closed'}</button></td>
                  <td className="num">{st}</td>
                  <td className="num">{f.length}</td>
                  <td className="num pc-dim">{st ? `${Math.round((f.length / st) * 100)}%` : '—'}</td>
                  <td className="num" style={ease != null && ease < 3.5 ? { color: '#e8b23f', fontWeight: 700 } : {}}>{ease != null ? ease.toFixed(1) : '—'}</td>
                  <td className="num pc-dim">{f.length ? `${yes} yes · ${maybe} maybe · ${f.length - yes - maybe} no` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {comments.length > 0 && (
        <>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--dim)', margin: '0 0 8px' }}>
            What triers wrote ({comments.length})
          </div>
          <div className="pc-panel">
            {comments.slice(0, 30).map((f) => (
              <div key={f.id} className="pc-rowline" style={{ fontSize: 12.5, alignItems: 'flex-start' }}>
                <span className="pc-mono pc-faint" style={{ width: 100, flex: 'none', fontSize: 11.5 }}>{fmtDate(f.created_at)}</span>
                <span style={{ width: 140, flex: 'none', fontWeight: 550 }}>{name(f.suite_key)}</span>
                <span className="pc-mono pc-faint" style={{ width: 96, flex: 'none' }}>{f.ease}/5 · {f.would_pay}</span>
                <span style={{ whiteSpace: 'pre-wrap' }}>{f.comment}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const TX_TYPE = { activation_fee: 'Activation fee', credit_purchase: 'Seat credits', renewal: 'Renewal' };

// Full money history across every org — pending, confirmed, everything.
function TransactionsPanel({ transactions, orgName }) {
  const [filter, setFilter] = useState('all');
  const rows = transactions.filter((t) => (filter === 'all' ? true : t.status === filter)).slice(0, 200);
  return (
    <section className="pc-section">
      <SectionHead title="Transactions" count={String(transactions.length)}>
        {['all', 'pending', 'confirmed'].map((f) => (
          <button key={f} className={`pc-btn sm${filter === f ? ' primary' : ''}`} onClick={() => setFilter(f)} style={{ textTransform: 'capitalize' }}>{f}</button>
        ))}
      </SectionHead>
      <div className="pc-panel pc-tablewrap">
        <table className="pc-table collapsible">
          <thead><tr><th>Date</th><th>Organization</th><th>Type</th><th>Reference</th><th>Method</th><th className="r">Amount</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="pc-dim" style={{ fontSize: 12.5 }}>Nothing here yet.</td></tr>}
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="pc-mono pc-dim" style={{ fontSize: 12 }}>{fmtDate(t.created_at)}</td>
                <td style={{ fontWeight: 550 }}>{orgName(t.org_id)}</td>
                <td className="pc-dim">{TX_TYPE[t.type] || t.type}{t.type === 'renewal' ? ` · ${t.months === 12 ? '12 mo' : '1 mo'}` : ''}{t.type === 'credit_purchase' && t.credits_granted ? ` · ${t.credits_granted}` : ''}</td>
                <td className="pc-mono pc-dim" style={{ fontSize: 11.5 }}>{t.reference}</td>
                <td className="pc-dim">{t.method === 'paystack' ? 'Card' : 'Transfer'}</td>
                <td className="num" style={{ fontWeight: 600 }}>{naira(t.amount_kobo)}</td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span className="pc-dot" style={{ background: t.status === 'confirmed' ? 'var(--ok)' : t.status === 'pending' ? '#e8b23f' : 'var(--faint)' }} />
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Published price list — editing here changes what NEW signups see and lock
// in. Existing orgs keep the rates stamped on their row at sign-up.
function PricingPanel({ flash }) {
  const [plans, setPlans] = useState([]);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => { apiGet('/platform/pricing').then((d) => { setPlans(d.plans || []); setSettings(d.settings); }).catch(() => {}); };
  useEffect(load, []);

  const setPlan = (key, field, v) => setPlans((ps) => ps.map((x) => (x.plan_key === key ? { ...x, [field]: v } : x)));
  const nairaField = (kobo) => Math.round(Number(kobo || 0) / 100);

  const save = async () => {
    setBusy(true);
    try {
      await apiPost('/platform/pricing', {
        plans: plans.map((x) => ({
          planKey: x.plan_key,
          baseFeeKobo: Math.round(Number(x.base_fee_naira ?? nairaField(x.base_fee_kobo)) * 100),
          includedSuites: Number(x.included_suites),
          extraSuiteFeeKobo: Math.round(Number(x.extra_fee_naira ?? nairaField(x.extra_suite_fee_kobo)) * 100),
        })),
        settings: settings ? {
          perStaffKobo: Math.round(Number(settings.per_staff_naira ?? nairaField(settings.per_staff_kobo)) * 100),
          annualDiscount: Number(settings.annual_pct ?? Math.round(Number(settings.annual_discount) * 100)) / 100,
        } : undefined,
      });
      flash('Published prices updated — new signups lock these rates in. Existing customers are untouched.');
      load();
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  if (!plans.length) return null;
  const cell = { width: 110 };
  return (
    <section className="pc-section">
      <SectionHead title="Published pricing">
        <button className="pc-btn sm primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save prices'}</button>
      </SectionHead>
      <p style={{ fontSize: 12.5, color: 'var(--pc-dim, #9aa0b0)', margin: '0 0 12px' }}>
        These are the prices the landing page, signup and chat quote from now on. Changing them only affects NEW
        sign-ups — every existing company keeps the rate locked on its own account.
      </p>
      <div className="pc-panel pc-tablewrap">
        <table className="pc-table">
          <thead><tr><th>Plan</th><th>Base fee (₦/mo)</th><th>Suites included</th><th>Extra suite (₦/mo)</th></tr></thead>
          <tbody>
            {plans.map((x) => (
              <tr key={x.plan_key}>
                <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>{x.name || x.plan_key}</td>
                <td><input className="pc-input" style={cell} type="number" min="0" value={x.base_fee_naira ?? nairaField(x.base_fee_kobo)} onChange={(e) => setPlan(x.plan_key, 'base_fee_naira', e.target.value)} /></td>
                <td><input className="pc-input" style={{ width: 70 }} type="number" min="1" value={x.included_suites} onChange={(e) => setPlan(x.plan_key, 'included_suites', e.target.value)} /></td>
                <td><input className="pc-input" style={cell} type="number" min="0" value={x.extra_fee_naira ?? nairaField(x.extra_suite_fee_kobo)} onChange={(e) => setPlan(x.plan_key, 'extra_fee_naira', e.target.value)} /></td>
              </tr>
            ))}
            {settings && (
              <tr>
                <td style={{ fontWeight: 600 }}>All plans</td>
                <td colSpan={2}>
                  Per staff (₦/mo){' '}
                  <input className="pc-input" style={cell} type="number" min="0" value={settings.per_staff_naira ?? nairaField(settings.per_staff_kobo)} onChange={(e) => setSettings((v) => ({ ...v, per_staff_naira: e.target.value }))} />
                </td>
                <td>
                  Yearly discount %{' '}
                  <input className="pc-input" style={{ width: 70 }} type="number" min="0" max="90" value={settings.annual_pct ?? Math.round(Number(settings.annual_discount) * 100)} onChange={(e) => setSettings((v) => ({ ...v, annual_pct: e.target.value }))} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PromoCodesPanel({ flash }) {
  const [codes, setCodes] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', percentOff: 100, expiresAt: '', maxUses: '', trialDays: '', grantCredits: '' });
  const [busy, setBusy] = useState(false);

  // Braced body on purpose: a concise arrow here returns the Promise, and
  // useEffect(load) would hand that Promise to React as the "cleanup
  // function" — which crashes the whole tree with "destroy is not a
  // function" the moment this panel unmounts (i.e. navigating to Analytics).
  const load = () => { apiGet('/platform/promo-codes').then((d) => setCodes(d.promoCodes)).catch(() => {}); };
  useEffect(load, []);

  const create = async (e) => {
    e.preventDefault();
    if (!form.code.trim()) return flash('Enter a code.', true);
    setBusy(true);
    try {
      await apiPost('/platform/promo-codes', {
        code: form.code, percentOff: Number(form.percentOff),
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        trialDays: form.trialDays ? Number(form.trialDays) : null,
        grantCredits: form.grantCredits ? Number(form.grantCredits) : 0,
      });
      flash(`Code ${form.code.toUpperCase()} created.`);
      setForm({ code: '', percentOff: 100, expiresAt: '', maxUses: '', trialDays: '', grantCredits: '' });
      setOpen(false);
      load();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  const toggle = async (c) => {
    try {
      await apiPatch(`/platform/promo-codes/${c.id}`, { active: !c.active });
      load();
    } catch (e2) { flash(e2.message, true); }
  };

  const expired = (c) => c.expires_at && new Date(c.expires_at) < new Date();

  return (
    <section className="pc-section">
      <SectionHead title="Promo codes" count={String(codes.length)}>
        <button className={`pc-btn sm${open ? '' : ' primary'}`} onClick={() => setOpen((v) => !v)}>{open ? 'Cancel' : 'New code'}</button>
      </SectionHead>

      {open && (
        <form onSubmit={create} className="pc-panel" style={{ padding: 16, marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, alignItems: 'end' }}>
            <label className="pc-field"><span>Code</span>
              <input className="pc-input" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="LAUNCH100" style={{ textTransform: 'uppercase' }} />
            </label>
            <label className="pc-field"><span>% off</span>
              <input className="pc-input" type="number" min={1} max={100} value={form.percentOff} onChange={(e) => setForm((f) => ({ ...f, percentOff: e.target.value }))} />
            </label>
            <label className="pc-field"><span>Code expires</span>
              <input className="pc-input" type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
            </label>
            <label className="pc-field"><span>Max uses</span>
              <input className="pc-input" type="number" min={1} value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} placeholder="∞" />
            </label>
            <label className="pc-field"><span>Trial days</span>
              <input className="pc-input" type="number" min={1} value={form.trialDays} onChange={(e) => setForm((f) => ({ ...f, trialDays: e.target.value }))} placeholder="forever" />
            </label>
            <label className="pc-field"><span>Free credits</span>
              <input className="pc-input" type="number" min={0} value={form.grantCredits} onChange={(e) => setForm((f) => ({ ...f, grantCredits: e.target.value }))} placeholder="0" />
            </label>
            <button className="pc-btn primary" disabled={busy}>{busy ? '…' : 'Create code'}</button>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--faint)', margin: '12px 0 0', maxWidth: 720 }}>
            A 100% code activates the workspace instantly at signup. Trial days makes that access time-boxed — 3, 30, whatever you set — after
            which the org is suspended until they pay. Free credits are seat credits granted on signup so they can add staff without buying a pack.
          </p>
        </form>
      )}

      {codes.length === 0 && !open && (
        <div className="pc-panel" style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--faint)' }}>
          No promo codes yet — create one to let new businesses try Collarone.
        </div>
      )}
      {codes.length > 0 && (
        <div className="pc-panel pc-tablewrap">
          <table className="pc-table collapsible">
            <thead>
              <tr><th>Code</th><th>Off</th><th>Access</th><th>Credits</th><th>Expires</th><th>Used</th><th className="r" /></tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} style={{ opacity: c.active && !expired(c) ? 1 : 0.5 }}>
                  <td className="pc-mono" style={{ fontWeight: 600 }}>{c.code}</td>
                  <td className="pc-mono">{c.percent_off}%</td>
                  <td>{c.trial_days ? `${c.trial_days}-day trial` : 'Permanent'}</td>
                  <td className="pc-mono">{c.grant_credits > 0 ? `+${c.grant_credits}` : '—'}</td>
                  <td className="pc-dim">{c.expires_at ? `${fmtDate(c.expires_at)}${expired(c) ? ' · expired' : ''}` : 'None'}</td>
                  <td className="pc-mono">{c.uses}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
                  <td className="r"><button className="pc-btn sm" onClick={() => toggle(c)}>{c.active ? 'Deactivate' : 'Reactivate'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DeleteOrgModal({ org, onClose, onConfirm, busy }) {
  const [text, setText] = useState('');
  return (
    <div className="pc-scrim" onMouseDown={onClose}>
      <div className="pc-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Delete {org.name}</h2>
        <p style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.6, margin: 0 }}>
          This permanently deletes {org.name} — every staff account, the organization record, and its billing history. This cannot be undone.
        </p>
        <label className="pc-field" style={{ margin: '16px 0 0' }}>
          <span>Type “{org.slug}” to confirm</span>
          <input className="pc-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={org.slug} />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button className="pc-btn" onClick={onClose}>Cancel</button>
          <button className="pc-btn danger" disabled={text !== org.slug || busy} onClick={onConfirm}
            style={text === org.slug ? { color: 'var(--err)', borderColor: 'rgba(248,81,73,0.5)' } : undefined}>
            {busy ? '…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Manual billing controls — how the operator runs the dunning ladder by hand
// (the auto-advance cron is off unless PAYWALL_ENFORCE is set). Move an org's
// state or extend its renewal window.
function BillingModal({ org, onClose, onSaved, flash }) {
  const [busy, setBusy] = useState('');
  const act = async (label, payload) => {
    setBusy(label);
    try {
      const d = await apiPost('/platform/set-billing-state', { orgId: org.id, ...payload });
      flash('Billing updated.');
      onSaved(d);
    } catch (e) { flash(e.message, true); } finally { setBusy(''); }
  };
  return (
    <div className="pc-scrim" onMouseDown={onClose}>
      <div className="pc-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>Billing — {org.name}</h2>
        <p style={{ fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.6, margin: '0 0 14px' }}>
          Current state: <strong>{STATUS_LABEL[org.status] || org.status}</strong>
          {org.current_period_end && <> · renews {fmtDate(org.current_period_end)}</>}
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="pc-btn" disabled={!!busy} onClick={() => act('renew', { status: 'active', periodEndDays: 30 })}>{busy === 'renew' ? '…' : 'Restore to active + renew 30 days'}</button>
          <button className="pc-btn" disabled={!!busy} onClick={() => act('extend', { periodEndDays: 30 })}>{busy === 'extend' ? '…' : 'Extend renewal by 30 days'}</button>
          <button className="pc-btn" disabled={!!busy} onClick={() => act('pastdue', { status: 'past_due' })}>{busy === 'pastdue' ? '…' : 'Mark past due (start 7-day grace)'}</button>
          <button className="pc-btn" disabled={!!busy} onClick={() => act('readonly', { status: 'read_only' })}>{busy === 'readonly' ? '…' : 'Make read-only'}</button>
          <button className="pc-btn danger" disabled={!!busy} onClick={() => act('suspend', { status: 'suspended' })}>{busy === 'suspend' ? '…' : 'Suspend (lock out)'}</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="pc-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// Merchant's own Paystack keys — stored via the service role, never readable
// from the browser, never displayed back (only a masked prefix). Card
// payments settle to the MERCHANT's bank; Collarone never touches money.
function GatewayModal({ org, onClose, flash }) {
  const [state, setState] = useState(null); // {enabled, hasKeys, publicKeyMasked}
  const [f, setF] = useState({ publicKey: '', secretKey: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiPost('/platform/payment-gateway', { orgId: org.id, mode: 'get' }).then(setState).catch((e) => flash(e.message, true));
  }, [org.id]); // eslint-disable-line

  const save = async (enabled) => {
    setBusy(true);
    try {
      const d = await apiPost('/platform/payment-gateway', { orgId: org.id, mode: 'set', publicKey: f.publicKey, secretKey: f.secretKey, enabled });
      flash(enabled ? `Card payments enabled for ${org.name}.` : `Card payments disabled for ${org.name}.`);
      setState((s) => ({ ...s, enabled: d.enabled, hasKeys: s?.hasKeys || Boolean(f.secretKey) }));
      onClose();
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="pc-scrim" onMouseDown={onClose}>
      <div className="pc-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>Card payments — {org.name}</h2>
        <p style={{ fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.6, margin: '0 0 14px' }}>
          The merchant's OWN Paystack keys — payments settle to their bank, Collarone never holds funds.
          {state && (state.hasKeys
            ? ` Keys on file (${state.publicKeyMasked || 'set'}), currently ${state.enabled ? 'ENABLED' : 'disabled'}. Paste new keys only to replace them.`
            : ' No keys on file yet.')}
        </p>
        <label className="pc-field" style={{ marginBottom: 10 }}>
          <span>Paystack public key</span>
          <input className="pc-input" value={f.publicKey} onChange={(e) => setF((s) => ({ ...s, publicKey: e.target.value }))} placeholder="pk_live_…" />
        </label>
        <label className="pc-field">
          <span>Paystack secret key</span>
          <input className="pc-input" type="password" value={f.secretKey} onChange={(e) => setF((s) => ({ ...s, secretKey: e.target.value }))} placeholder="sk_live_…" />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button className="pc-btn" onClick={onClose}>Cancel</button>
          {state?.enabled && <button className="pc-btn danger" disabled={busy} onClick={() => save(false)}>Disable</button>}
          <button className="pc-btn primary" disabled={busy || (!state?.hasKeys && (!f.publicKey || !f.secretKey))} onClick={() => save(true)}>
            {busy ? '…' : 'Enable card payments'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrgSiteCell({ org, site, themes }) {
  const themeName = site && (themes.find((t) => t.key === site.theme_key)?.name || site.theme_key);
  if (site) {
    return site.published ? (
      <a href={`/site/${org.slug}`} target="_blank" rel="noreferrer" title={`"${site.site_name}" — ${themeName} theme`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--ok)', textDecoration: 'none', fontSize: 12.5 }}>
        <span className="pc-dot" style={{ background: 'var(--ok)' }} />Live
      </a>
    ) : (
      <span title={`"${site.site_name}" — ${themeName} theme, not published yet`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--dim)', fontSize: 12.5 }}>
        <span className="pc-dot" style={{ background: 'var(--faint)' }} />Draft
      </span>
    );
  }
  if (org.external_website_url) {
    return <a href={org.external_website_url} target="_blank" rel="noreferrer" title={org.external_website_url} style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 12.5 }}>External ↗</a>;
  }
  return <span className="pc-faint" style={{ fontSize: 12.5 }}>—</span>;
}

export default function PlatformAdmin() {
  const [orgs, setOrgs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(null);
  const [testingOrg, setTestingOrg] = useState(null);
  const [guestingOrg, setGuestingOrg] = useState(null);
  const [suiteResults, setSuiteResults] = useState({});
  const [expandedOrg, setExpandedOrg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [gatewayOrg, setGatewayOrg] = useState(null);
  const [billingOrg, setBillingOrg] = useState(null);

  const { flash, toastNode } = useToast();

  // Section tabs — hash-synced so a refresh (or a shared link) lands on the
  // same view. One long scroll was unusable once the panel count grew.
  const initialTab = (window.location.hash || '').replace('#', '') || 'overview';
  const [tab, setTabState] = useState(['overview', 'orgs', 'revenue', 'inbox', 'audit'].includes(initialTab) ? initialTab : 'overview');
  const setTab = (t) => { setTabState(t); window.history.replaceState(null, '', `#${t}`); };

  const [adminIds, setAdminIds] = useState([]);
  const [sites, setSites] = useState([]);
  const [themes, setThemes] = useState([]);
  const [previewTheme, setPreviewTheme] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiGet('/platform/organizations'), apiGet('/platform/profiles'), apiGet('/platform/transactions'),
      apiGet('/platform/audit-log'), apiGet('/platform/admin-ids'), apiGet('/platform/sites'), apiGet('/platform/site-themes'),
    ])
      .then(([o, p, t, a, ai, s, th]) => {
        setOrgs(o.organizations); setProfiles(p.profiles); setTransactions(t.transactions);
        setAuditLog(a.entries); setAdminIds(ai.adminIds); setSites(s.sites); setThemes(th.themes);
      })
      .catch((e) => flash(e.message, true))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const siteByOrg = useMemo(() => Object.fromEntries(sites.map((s) => [s.org_id, s])), [sites]);

  // Platform admins are operators of Collarone itself, not customers —
  // they never count as "users" anywhere on this page.
  const customerProfiles = useMemo(() => profiles.filter((p) => !adminIds.includes(p.id)), [profiles, adminIds]);

  const staffCountByOrg = useMemo(() => {
    const m = {};
    customerProfiles.forEach((p) => { m[p.org_id] = (m[p.org_id] || 0) + 1; });
    return m;
  }, [customerProfiles]);

  const activeLast24h = useMemo(() => {
    const cutoff = Date.now() - DAY_MS;
    return customerProfiles.filter((p) => p.last_login_at && new Date(p.last_login_at).getTime() > cutoff).length;
  }, [customerProfiles]);

  const pendingTx = transactions.filter((t) => t.status === 'pending');
  const confirmedTx = transactions.filter((t) => t.status === 'confirmed');
  const revenueAll = confirmedTx.reduce((s2, t) => s2 + t.amount_kobo, 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const revenueThisMonth = confirmedTx
    .filter((t) => new Date(t.confirmed_at || t.created_at).getTime() >= monthStart)
    .reduce((s2, t) => s2 + t.amount_kobo, 0);
  const orgName = (id) => orgs.find((o) => o.id === id)?.name || (id ? id.slice(0, 8) : '—');

  const confirmPayment = async (txId) => {
    setConfirming(txId);
    try {
      await apiPost('/platform/confirm-payment', { transactionId: txId });
      flash('Payment confirmed — organization activated.');
      load();
    } catch (e) { flash(e.message, true); } finally { setConfirming(null); }
  };

  // No real login/impersonation — platform admin must never see a customer's
  // actual business data. This runs a count-only reachability check per
  // suite (never row content) so we can confirm "is it working, any errors"
  // without ever seeing names, amounts, or records.
  const testSuites = async (org) => {
    setTestingOrg(org.id);
    setExpandedOrg(org.id);
    try {
      const results = await Promise.all(
        ALL_SUITE_KEYS.map((key) => apiPost('/platform/test-suite', { orgId: org.id, suiteKey: key }).then((d) => ({ key, ...d.result })).catch((e) => ({ key, ok: false, error: e.message })))
      );
      setSuiteResults((s) => ({ ...s, [org.id]: results }));
    } catch (e) { flash(e.message, true); } finally { setTestingOrg(null); }
  };

  // Real login as the org's own admin, for actually clicking through and
  // unit-testing a suite — audited, and the landed session shows a
  // persistent "guest mode" banner the whole time (see AppLayout.jsx).
  // The token is redeemed right here with verifyOtp (no redirect link — see
  // admin.js), which swaps this browser's session to the org's admin; the
  // full-page navigation reboots the app under that new identity.
  const guestIntoOrg = async (org) => {
    setGuestingOrg(org.id);
    try {
      const d = await apiPost('/platform/guest-mode', { orgId: org.id });
      const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: d.tokenHash });
      if (error) throw new Error(error.message);
      // localStorage, NOT sessionStorage: the auth session itself lives in
      // localStorage, so the guest marker must survive a closed tab too —
      // otherwise you reopen the browser silently logged into a customer's
      // org with no banner. AppLayout enforces a hard expiry on this marker.
      localStorage.setItem(GUEST_KEY, JSON.stringify({ orgId: org.id, orgName: d.orgName, startedAt: Date.now() }));
      window.location.href = '/workspace';
    } catch (e) { flash(e.message, true); setGuestingOrg(null); }
  };

  // Pushes an in-app banner to everyone in that org (org_notices) telling
  // them their payment is still pending — the "pay to keep using the
  // platform" nudge, without needing an email service.
  const [reminding, setReminding] = useState(null);
  const remindOrg = async (t) => {
    setReminding(t.id);
    try {
      const kind = t.type === 'activation_fee' ? 'activation fee' : 'seat credits';
      await apiPost('/platform/remind-payment', {
        orgId: t.org_id,
        message: `Reminder: your ${kind} payment of ${naira(t.amount_kobo)} (ref ${t.reference}) is still pending. Complete the transfer to keep your Collarone workspace active — WhatsApp us the reference on 0814 812 8551 once sent.`,
      });
      flash(`Reminder sent to ${orgName(t.org_id)}.`);
    } catch (e) { flash(e.message, true); } finally { setReminding(null); }
  };

  const deleteOrg = async () => {
    setDeleting(true);
    try {
      await apiPost('/platform/delete-org', { orgId: deleteTarget.id });
      flash(`${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
      load();
    } catch (e) { flash(e.message, true); } finally { setDeleting(false); }
  };

  const TAB_DEFS = [
    ['overview', 'Overview', 0],
    ['orgs', 'Organizations', 0],
    ['revenue', 'Revenue', pendingTx.length],
    ['inbox', 'Inbox', 0],
    ['audit', 'Audit', 0],
  ];

  return (
    <PlatformShell>
      <nav className="pc-subtabs">
        {TAB_DEFS.map(([key, label, badge]) => (
          <button key={key} className={`pc-subtab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
            {label}{badge > 0 && <span className="pc-subtab-badge">{badge}</span>}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (<>
      <div className="pc-kpis" style={{ marginBottom: 10 }}>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Organizations</div>
          <div className="pc-kpi-value">{orgs.length}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Signed-up users</div>
          <div className="pc-kpi-value">{customerProfiles.length}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Active, last 24h</div>
          <div className="pc-kpi-value">{activeLast24h}</div>
          <div className="pc-kpi-sub">from sign-in timestamps, not live presence</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Revenue (confirmed)</div>
          <div className="pc-kpi-value">{naira(revenueAll)}</div>
          <div className="pc-kpi-sub pc-mono">{naira(revenueThisMonth)} this month</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Pending payments</div>
          <div className={`pc-kpi-value${pendingTx.length > 0 ? ' warn' : ''}`}>{pendingTx.length}</div>
          {pendingTx.length > 0 && (
            <div className="pc-kpi-sub pc-mono">{naira(pendingTx.reduce((s, t) => s + t.amount_kobo, 0))} awaiting</div>
          )}
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--faint)', margin: '0 0 24px' }}>
        Page-visitor analytics live in Vercel's dashboard for this project.
      </p>

      <StatusRow />

      {pendingTx.length > 0 && (
        <section className="pc-section">
          <SectionHead title="Pending payments" count={String(pendingTx.length)} />
          <div className="pc-panel pc-tablewrap">
            <table className="pc-table collapsible">
              <thead>
                <tr><th>Organization</th><th>Type</th><th>Reference</th><th>Date</th><th className="r">Amount</th><th className="r" /></tr>
              </thead>
              <tbody>
                {pendingTx.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 550 }}>{orgName(t.org_id)}</td>
                    <td className="pc-dim">{TX_TYPE[t.type] || t.type}{t.type === 'renewal' ? ` · ${t.months === 12 ? '12 mo' : '1 mo'}` : ''}</td>
                    <td className="pc-mono pc-dim">{t.reference}</td>
                    <td className="pc-dim">{fmtDate(t.created_at)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{naira(t.amount_kobo)}</td>
                    <td className="r">
                      <div className="pc-actions">
                        <button className="pc-btn sm" onClick={() => remindOrg(t)} disabled={reminding === t.id}>{reminding === t.id ? '…' : 'Send reminder'}</button>
                        <button className="pc-btn sm primary" onClick={() => confirmPayment(t.id)} disabled={confirming === t.id}>{confirming === t.id ? '…' : 'Confirm'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      </>)}

      {tab === 'inbox' && (<>
      <ContactMessagesPanel flash={flash} />

      <AppErrorsPanel />
      </>)}

      {tab === 'revenue' && (<>
      <TransactionsPanel transactions={transactions} orgName={orgName} />

      <PricingPanel flash={flash} />

      <PromoCodesPanel flash={flash} />
      </>)}

      {tab === 'orgs' && (<>
      <section className="pc-section">
        <SectionHead title="Organizations" count={String(orgs.length)} />
        {loading && <p className="pc-dim" style={{ fontSize: 13 }}>Loading…</p>}
        {!loading && orgs.length === 0 && <p className="pc-dim" style={{ fontSize: 13 }}>No organizations yet.</p>}
        {!loading && orgs.length > 0 && (
          <div className="pc-panel pc-tablewrap">
            <table className="pc-table collapsible">
              <thead>
                <tr>
                  <th>Organization</th><th>Country</th><th>Plan</th><th>Status</th>
                  <th className="r">Staff</th><th>Website</th><th>Since</th><th className="r" />
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <Fragment key={o.id}>
                    <tr>
                      <td>
                        <div style={{ fontWeight: 550 }}>{o.name}</div>
                        <div className="pc-mono pc-faint" style={{ fontSize: 11 }}>{o.slug}</div>
                      </td>
                      <td><span className="pc-badge" title={COUNTRY_NAME[o.country] || o.country}>{o.country || '—'}</span></td>
                      <td style={{ textTransform: 'capitalize' }} className="pc-dim">{o.plan_tier}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
                          <span className="pc-dot" style={{ background: STATUS_DOT[o.status] || 'var(--faint)' }} />
                          {STATUS_LABEL[o.status] || o.status}
                        </span>
                      </td>
                      <td className="num">{staffCountByOrg[o.id] || 0}</td>
                      <td><OrgSiteCell org={o} site={siteByOrg[o.id]} themes={themes} /></td>
                      <td className="pc-mono pc-dim" style={{ fontSize: 12 }}>{fmtDate(o.created_at)}</td>
                      <td className="r">
                        <div className="pc-actions">
                          <button className="pc-btn sm" onClick={() => testSuites(o)} disabled={testingOrg === o.id || o.status !== 'active'}>
                            {testingOrg === o.id ? '…' : 'Test suites'}
                          </button>
                          {o.status === 'active' && (
                            <button className="pc-btn sm" onClick={() => guestIntoOrg(o)} disabled={guestingOrg === o.id}>
                              {guestingOrg === o.id ? '…' : 'Guest in'}
                            </button>
                          )}
                          {o.status === 'active' && siteByOrg[o.id] && (
                            <button className="pc-btn sm" onClick={() => setGatewayOrg(o)}>Card payments</button>
                          )}
                          {o.id !== FOUNDING_ORG_ID && (
                            <button className="pc-btn sm" onClick={() => setBillingOrg(o)}>Billing</button>
                          )}
                          {o.id !== FOUNDING_ORG_ID && (
                            <button className="pc-btn sm danger" onClick={() => setDeleteTarget(o)}>Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {suiteResults[o.id] && expandedOrg === o.id && (
                      <tr>
                        <td colSpan={8} style={{ background: 'rgba(238,234,224,0.02)', padding: '10px 14px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {suiteResults[o.id].map((r) => (
                              <span key={r.key} className={`pc-badge ${r.ok ? 'ok' : 'err'}`}>
                                {r.key} {r.ok ? `· ${r.count}` : '· error'}
                              </span>
                            ))}
                            <span className="pc-sec-spacer" />
                            <button className="pc-btn sm" onClick={() => setExpandedOrg(null)}>Close</button>
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--faint)', margin: '8px 0 0' }}>Row counts only — no customer data is ever shown here.</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="pc-section">
        <SectionHead title="Website themes" count={String(themes.length)} />
        <p style={{ fontSize: 12, color: 'var(--faint)', margin: '0 0 12px' }}>
          The catalog customers pick from in the website builder, and how many live/draft sites use each.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
          {themes.map((t) => {
            const usedBy = sites.filter((s) => s.theme_key === t.key).length;
            return (
              <div key={t.key} className="pc-panel" style={{ padding: 10 }}>
                <ThemeMockup theme={t} height={92} />
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 9 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 550, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--faint)' }}>{t.category === 'ecommerce' ? 'Online store' : t.category === 'landing' ? 'Landing page' : 'Company profile'}</div>
                  </div>
                  <span className="pc-mono" style={{ fontSize: 11, color: usedBy ? 'var(--ok)' : 'var(--faint)', flex: 'none' }}>{usedBy}</span>
                </div>
                <button className="pc-btn sm" style={{ width: '100%', marginTop: 9 }} onClick={() => setPreviewTheme(t)}>Preview</button>
              </div>
            );
          })}
        </div>
      </section>
      {previewTheme && <ThemePreviewModal theme={previewTheme} onClose={() => setPreviewTheme(null)} />}

      <DemoSuitesPanel flash={flash} />
      </>)}

      {tab === 'audit' && (
      <section className="pc-section">
        <SectionHead title="Audit log" count={String(auditLog.length)} />
        <div className="pc-panel">
          {!loading && auditLog.length === 0 && (
            <p style={{ color: 'var(--faint)', fontSize: 12.5, margin: 0, padding: '14px 16px' }}>No sensitive actions taken yet.</p>
          )}
          {auditLog.map((e) => (
            <div key={e.id} className="pc-rowline" style={{ fontSize: 12.5 }}>
              <span className="pc-mono pc-faint" style={{ width: 118, flex: 'none', fontSize: 11.5 }}>{fmtDateTime(e.created_at)}</span>
              <span style={{ width: 190, flex: 'none', fontWeight: 550 }}>{AUDIT_LABEL[e.action] || e.action}</span>
              <span className="pc-dim" style={{ width: 150, flex: 'none' }}>{orgName(e.target_org_id)}</span>
              <span className="pc-faint">
                {e.action === 'confirm_payment' && <span className="pc-mono">{e.details?.type} · {naira(e.details?.amountKobo || 0)}</span>}
                {e.action === 'delete_org' && `${e.details?.memberCount ?? 0} staff account${e.details?.memberCount === 1 ? '' : 's'} removed`}
                {e.action === 'impersonate' && e.details?.targetEmail}
              </span>
            </div>
          ))}
        </div>
      </section>
      )}

      {deleteTarget && (
        <DeleteOrgModal org={deleteTarget} busy={deleting} onClose={() => setDeleteTarget(null)} onConfirm={deleteOrg} />
      )}
      {gatewayOrg && <GatewayModal org={gatewayOrg} onClose={() => setGatewayOrg(null)} flash={flash} />}
      {billingOrg && <BillingModal org={billingOrg} flash={flash} onClose={() => setBillingOrg(null)} onSaved={() => { setBillingOrg(null); load(); }} />}
      {toastNode}
    </PlatformShell>
  );
}
