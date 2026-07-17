import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { apiGet, apiPost, apiPatch } from '../api/client.js';
import { supabase } from '../lib/supabaseClient.js';
import { waLink } from '../lib/whatsapp.js';
import { FOUNDING_ORG_ID } from '../config/org.js';
import PlatformShell from '../components/PlatformShell.jsx';
import ThemeMockup from '../components/ThemeMockup.jsx';
import ThemePreviewModal from '../components/ThemePreview.jsx';

const GUEST_KEY = 'collarone_guest_mode';

const STATUS_LABEL = { pending_payment: 'Pending payment', active: 'Active', suspended: 'Suspended', cancelled: 'Cancelled' };
const AUDIT_LABEL = { confirm_payment: 'Confirmed payment', delete_org: 'Deleted organization', impersonate: 'Impersonated admin (retired)', guest_mode: 'Guested into organization' };
const ALL_SUITE_KEYS = ['hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm', 'attendance', 'benefits', 'it-assets', 'procurement', 'inventory', 'finance', 'projects', 'documents'];
const COUNTRY_NAME = { NG: 'Nigeria', GH: 'Ghana', KE: 'Kenya', ZA: 'South Africa', EG: 'Egypt', GB: 'United Kingdom', US: 'United States' };
const CountryBadge = ({ code }) => (
  <span title={COUNTRY_NAME[code] || code} style={{
    display: 'inline-block', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em',
    fontFamily: 'ui-monospace, monospace', color: 'rgba(244,241,234,0.75)',
    background: 'rgba(244,241,234,0.08)', border: '1px solid rgba(244,241,234,0.15)',
    borderRadius: 6, padding: '3px 7px',
  }}>{code || '—'}</span>
);
const naira = (kobo) => `₦${(kobo / 100).toLocaleString()}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const DAY_MS = 24 * 60 * 60 * 1000;

const I = {
  org:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="3" y="8" width="18" height="13" rx="1.5" /><path d="M8 21V8M16 21V8M3 13h18M3 17h18" /><path d="M9 4h6v4H9z" /></svg>,
  users: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path d="M16 6.5a3 3 0 0 1 0 5.6M17 14c2.5.4 4 2.3 4 5" /></svg>,
  pulse: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 12h4l2 7 4-14 2 7h6" /></svg>,
  coin: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><ellipse cx="9" cy="7" rx="5.5" ry="2.6" /><path d="M3.5 7v5c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V7" /><path d="M14.5 12.5c2.6.2 5 1.3 5 2.8 0 1.4-2.5 2.6-5.5 2.6-1.4 0-2.7-.3-3.6-.7" /></svg>,
  chev: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>,
  check: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12l4 4 10-10" /></svg>,
  close: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  mail: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>,
  chat: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 5h16v11H8l-4 4z" /></svg>,
  phone: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.7 21 3 13.3 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1L6.6 10.8z" /></svg>,
};

const glass = { background: 'rgba(20,22,30,0.55)', border: '1px solid rgba(244,241,234,0.10)', borderRadius: 16, backdropFilter: 'blur(14px)' };

// Inline styles can't carry media queries — the layout-critical containers
// use these classes so the desktop grid collapses into wrapped cards on
// phones instead of crushing eleven columns into 390px.
const PA_CSS = `
  .pa-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 16px; }
  .pa-orgrow { display: grid; grid-template-columns: 1.5fr 0.9fr 0.5fr 0.8fr 0.9fr 0.5fr 0.9fr 0.9fr auto auto auto; gap: 12px; align-items: center; padding: 16px 18px; }
  .pa-payrow, .pa-promorow, .pa-auditrow { display: flex; align-items: center; }
  .pa-payrow { justify-content: space-between; gap: 12px; }
  .pa-promorow, .pa-auditrow { gap: 14px; }
  @media (max-width: 1060px) {
    .pa-orgrow { display: flex; flex-wrap: wrap; gap: 10px 16px; }
    .pa-orgrow > div { min-width: 0; }
  }
  @media (max-width: 720px) {
    .pa-payrow, .pa-promorow, .pa-auditrow { flex-wrap: wrap; gap: 8px 14px; }
    .pa-auditrow > span { width: auto !important; }
    .pa-promorow > span { width: auto !important; }
  }
`;

function StatusWidget() {
  const [live, setLive] = useState(null);
  const [openIncident, setOpenIncident] = useState(null);

  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then(setLive).catch(() => {});
    apiGet('/status/incidents').then((d) => setOpenIncident((d.incidents || []).find((i) => !i.resolved_at) || null)).catch(() => {});
  }, []);

  const state = live ? live.status : 'checking';
  const color = { operational: '#5fbf5f', degraded: '#eab308', down: '#e05555', checking: 'rgba(244,241,234,0.3)' }[state];
  const label = { operational: 'All systems operational', degraded: 'Degraded performance', down: 'Service disruption', checking: 'Checking…' }[state];

  return (
    <motion.a href="/status" target="_blank" rel="noreferrer"
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} whileHover={{ y: -3 }}
      style={{ ...glass, padding: '20px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, textDecoration: 'none', marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#F4F1EA' }}>{label}</div>
          <div style={{ fontSize: 12, color: 'rgba(244,241,234,0.45)', marginTop: 2 }}>
            {live ? `Checked just now, ${live.responseMs}ms` : 'Checking…'}
            {openIncident && <span style={{ color: '#e88a8a' }}> · ongoing incident since {new Date(openIncident.started_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        </div>
      </div>
      <span style={{ fontSize: 12.5, color: 'rgba(244,241,234,0.4)' }}>Full status page →</span>
    </motion.a>
  );
}

// Messages submitted via the public /contact page — a platform-level inbox,
// separate from any tenant's own CRM inbox. Same reply pattern already used
// there: real quick-action links (WhatsApp/email/call), mark-as-replied.
// No automated sending exists anywhere in this codebase, so this doesn't
// pretend to send anything — it just gets you to the real channel fast.
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
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.02em', margin: 0, color: '#F4F1EA', display: 'flex', alignItems: 'center', gap: 8 }}>
          {I.mail} MESSAGES{newCount > 0 && <span style={{ background: '#FF5B1F', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 100, padding: '2px 8px' }}>{newCount} new</span>}
        </h2>
        <button onClick={() => setShowReplied((v) => !v)}
          style={{ background: 'transparent', border: '1px solid rgba(244,241,234,0.2)', color: 'rgba(244,241,234,0.7)', borderRadius: 8, padding: '6px 13px', fontSize: 12, cursor: 'pointer' }}>
          {showReplied ? 'Hide replied' : 'Show all'}
        </button>
      </div>

      {loading && <p style={{ color: 'rgba(244,241,234,0.5)', fontSize: 13.5 }}>Loading…</p>}
      {!loading && visible.length === 0 && (
        <div style={{ ...glass, padding: 18, fontSize: 13, color: 'rgba(244,241,234,0.5)' }}>
          {showReplied ? 'No messages yet.' : 'No new messages — you\'re all caught up.'}
        </div>
      )}
      {visible.map((m) => (
        <div key={m.id} style={{ ...glass, padding: '14px 18px', marginBottom: 8, opacity: m.status === 'replied' ? 0.6 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ color: '#F4F1EA', fontSize: 14 }}>{m.name}</strong>
              {m.company && <span style={{ color: 'rgba(244,241,234,0.45)', fontSize: 12.5 }}> · {m.company}</span>}
              {m.status === 'new'
                ? <span style={{ marginLeft: 8, background: 'rgba(255,91,31,0.15)', color: '#FF9457', fontSize: 10.5, fontWeight: 700, borderRadius: 100, padding: '2px 8px' }}>NEW</span>
                : <span style={{ marginLeft: 8, background: 'rgba(127,214,127,0.15)', color: '#7fd67f', fontSize: 10.5, fontWeight: 700, borderRadius: 100, padding: '2px 8px' }}>REPLIED</span>}
            </div>
            <span style={{ fontSize: 11.5, color: 'rgba(244,241,234,0.4)' }}>{fmtDateTime(m.created_at)}</span>
          </div>
          <p style={{ fontSize: 13.5, color: 'rgba(244,241,234,0.75)', margin: '0 0 10px', lineHeight: 1.55 }}>{m.message}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {m.phone && (
              <a href={waLink(m.phone)} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(127,214,127,0.12)', border: '1px solid rgba(127,214,127,0.3)', color: '#7fd67f', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                {I.chat} Reply on WhatsApp
              </a>
            )}
            {m.email && (
              <a href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your message to Collarone')}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(127,178,255,0.12)', border: '1px solid rgba(127,178,255,0.3)', color: '#7fb2ff', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                {I.mail} Email
              </a>
            )}
            {m.phone && (
              <a href={`tel:+${waLink(m.phone).split('/').pop()}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(244,241,234,0.06)', border: '1px solid rgba(244,241,234,0.2)', color: 'rgba(244,241,234,0.7)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                {I.phone} Call
              </a>
            )}
            {m.status === 'new' && (
              <button onClick={() => markReplied(m)}
                style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid rgba(244,241,234,0.2)', color: 'rgba(244,241,234,0.6)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
                Mark as replied
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
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
  const inputStyle = { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(244,241,234,0.15)', borderRadius: 8, padding: '9px 12px', color: '#F4F1EA', fontSize: 13.5 };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.02em', margin: 0, color: '#F4F1EA' }}>PROMO CODES</h2>
        <button onClick={() => setOpen((v) => !v)}
          style={{ background: 'rgba(255,91,31,0.12)', border: '1px solid rgba(255,91,31,0.3)', color: '#FF9457', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          {open ? 'Cancel' : '+ New code'}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.form onSubmit={create} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ ...glass, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, padding: 16, alignItems: 'end' }}>
              <label style={{ fontSize: 11.5, color: 'rgba(244,241,234,0.5)', display: 'flex', flexDirection: 'column', gap: 5 }}>CODE
                <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="LAUNCH100" style={{ ...inputStyle, textTransform: 'uppercase' }} />
              </label>
              <label style={{ fontSize: 11.5, color: 'rgba(244,241,234,0.5)', display: 'flex', flexDirection: 'column', gap: 5 }}>% OFF
                <input type="number" min={1} max={100} value={form.percentOff} onChange={(e) => setForm((f) => ({ ...f, percentOff: e.target.value }))} style={inputStyle} />
              </label>
              <label style={{ fontSize: 11.5, color: 'rgba(244,241,234,0.5)', display: 'flex', flexDirection: 'column', gap: 5 }}>CODE EXPIRES
                <input type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} style={{ ...inputStyle, colorScheme: 'dark' }} />
              </label>
              <label style={{ fontSize: 11.5, color: 'rgba(244,241,234,0.5)', display: 'flex', flexDirection: 'column', gap: 5 }}>MAX USES
                <input type="number" min={1} value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} placeholder="∞" style={inputStyle} />
              </label>
              <label style={{ fontSize: 11.5, color: 'rgba(244,241,234,0.5)', display: 'flex', flexDirection: 'column', gap: 5 }}>TRIAL DAYS
                <input type="number" min={1} value={form.trialDays} onChange={(e) => setForm((f) => ({ ...f, trialDays: e.target.value }))} placeholder="forever" style={inputStyle} />
              </label>
              <label style={{ fontSize: 11.5, color: 'rgba(244,241,234,0.5)', display: 'flex', flexDirection: 'column', gap: 5 }}>FREE CREDITS
                <input type="number" min={0} value={form.grantCredits} onChange={(e) => setForm((f) => ({ ...f, grantCredits: e.target.value }))} placeholder="0" style={inputStyle} />
              </label>
              <button disabled={busy} style={{ background: '#FF5B1F', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', gridColumn: '1 / -1', marginTop: 4 }}>
                {busy ? '…' : 'Create promo code'}
              </button>
            </div>
            <p style={{ fontSize: 11.5, color: 'rgba(244,241,234,0.4)', margin: 0, padding: '0 16px 14px' }}>
              A 100% code activates the workspace instantly at signup. Trial days makes that access time-boxed — 3, 30, whatever you set — after
              which the org is suspended until they pay. Free credits are seat credits granted on signup so they can add staff without buying a pack.
            </p>
          </motion.form>
        )}
      </AnimatePresence>

      {codes.length === 0 && !open && (
        <div style={{ ...glass, padding: 18, fontSize: 13, color: 'rgba(244,241,234,0.5)' }}>No promo codes yet — create one to let new businesses try Collarone.</div>
      )}
      {codes.map((c) => (
        <div key={c.id} className="pa-promorow" style={{ ...glass, padding: '13px 18px', marginBottom: 8, opacity: c.active && !expired(c) ? 1 : 0.55 }}>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 14.5, color: '#F4F1EA', width: 140 }}>{c.code}</span>
          <span style={{ fontSize: 13, color: '#7fd67f', fontWeight: 600, width: 66 }}>{c.percent_off}% off</span>
          <span style={{ fontSize: 12.5, color: '#7fb2ff', fontWeight: 600, width: 94 }}>
            {c.trial_days ? `${c.trial_days}-day trial` : 'Permanent'}
          </span>
          <span style={{ fontSize: 12.5, color: 'rgba(244,241,234,0.55)', width: 86 }}>
            {c.grant_credits > 0 ? `+${c.grant_credits} credits` : '—'}
          </span>
          <span style={{ fontSize: 12.5, color: 'rgba(244,241,234,0.55)', width: 140 }}>
            {c.expires_at ? `Expires ${fmtDate(c.expires_at)}` : 'No expiry'}{expired(c) && ' · expired'}
          </span>
          <span style={{ fontSize: 12.5, color: 'rgba(244,241,234,0.55)', flex: 1 }}>
            Used {c.uses}{c.max_uses ? ` of ${c.max_uses}` : ''} time{c.uses === 1 ? '' : 's'}
          </span>
          <button onClick={() => toggle(c)}
            style={{ background: 'transparent', border: '1px solid rgba(244,241,234,0.2)', color: 'rgba(244,241,234,0.7)', borderRadius: 8, padding: '6px 13px', fontSize: 12, cursor: 'pointer' }}>
            {c.active ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      ))}
    </div>
  );
}

function StatCard({ icon, label, value, accent, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay, ease: [0.2, 0.7, 0.3, 1] }}
      whileHover={{ y: -3 }}
      style={{ ...glass, padding: '20px 22px', position: 'relative', overflow: 'hidden' }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: `${accent}22`, color: accent, display: 'grid', placeItems: 'center' }}>{icon}</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(244,241,234,0.5)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: '#F4F1EA' }}>{value}</div>
    </motion.div>
  );
}

function DeleteOrgModal({ org, onClose, onConfirm, busy }) {
  const [text, setText] = useState('');
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 100 }} onMouseDown={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        style={{ ...glass, background: '#14161c', width: 'min(420px, 92vw)', padding: 26 }} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <h2 style={{ fontSize: 17, margin: 0, color: '#F4F1EA' }}>Delete {org.name}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(244,241,234,0.5)', cursor: 'pointer' }}>{I.close}</button>
        </div>
        <p style={{ fontSize: 13.5, color: 'rgba(244,241,234,0.6)', lineHeight: 1.6 }}>
          This permanently deletes {org.name} — every staff account, the organization record, and its billing history. This cannot be undone.
        </p>
        <label style={{ fontSize: 12.5, color: 'rgba(244,241,234,0.5)', display: 'block', margin: '16px 0 6px' }}>Type <strong style={{ color: '#F4F1EA' }}>{org.slug}</strong> to confirm</label>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={org.slug}
          style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(244,241,234,0.15)', borderRadius: 8, padding: '10px 12px', color: '#F4F1EA', fontSize: 14 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(244,241,234,0.18)', color: '#F4F1EA', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontSize: 13.5 }}>Cancel</button>
          <button disabled={text !== org.slug || busy} onClick={onConfirm}
            style={{ background: '#c02b2b', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: text !== org.slug ? 'not-allowed' : 'pointer', opacity: text !== org.slug ? 0.5 : 1, fontSize: 13.5, fontWeight: 600 }}>
            {busy ? '…' : 'Delete permanently'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function OrgSiteCell({ org, site, themes }) {
  const themeName = site && (themes.find((t) => t.key === site.theme_key)?.name || site.theme_key);
  if (site) {
    return site.published ? (
      <a href={`/site/${org.slug}`} target="_blank" rel="noreferrer" title={`"${site.site_name}" — ${themeName} theme`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#7fd67f', textDecoration: 'none' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#5fbf5f' }} />Live site
      </a>
    ) : (
      <span title={`"${site.site_name}" — ${themeName} theme, not published yet`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'rgba(244,241,234,0.55)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(244,241,234,0.3)' }} />Draft site
      </span>
    );
  }
  if (org.external_website_url) {
    return (
      <a href={org.external_website_url} target="_blank" rel="noreferrer" title={org.external_website_url}
        style={{ fontSize: 12.5, fontWeight: 600, color: '#7fb2ff', textDecoration: 'none' }}>External site</a>
    );
  }
  return <span style={{ fontSize: 12.5, color: 'rgba(244,241,234,0.3)' }}>No website</span>;
}

function OrgRow({ org, site, themes, staffCount, testingOrg, suiteResults, onTest, onDelete, onGuest, guestingOrg, index, reduce }) {
  const [expanded, setExpanded] = useState(false);
  const results = suiteResults[org.id];

  return (
    <motion.div
      initial={reduce ? {} : { opacity: 0, x: -12 }} animate={reduce ? {} : { opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: index * 0.05 }}
      style={{ ...glass, marginBottom: 10, overflow: 'hidden' }}
    >
      <div className="pa-orgrow">
        <div style={{ fontWeight: 600, color: '#F4F1EA', fontSize: 14.5 }}>{org.name}</div>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, color: 'rgba(244,241,234,0.55)' }}>{org.slug}</div>
        <div><CountryBadge code={org.country} /></div>
        <div style={{ fontSize: 13, textTransform: 'capitalize', color: 'rgba(244,241,234,0.75)' }}>{org.plan_tier}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'rgba(244,241,234,0.75)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: org.status === 'active' ? '#5fbf5f' : 'rgba(244,241,234,0.3)', boxShadow: org.status === 'active' ? '0 0 6px #5fbf5f' : 'none' }} />
          {STATUS_LABEL[org.status] || org.status}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(244,241,234,0.75)' }}>{staffCount || 0}</div>
        <div><OrgSiteCell org={org} site={site} themes={themes} /></div>
        <div style={{ fontSize: 12.5, color: 'rgba(244,241,234,0.5)' }}>{fmtDate(org.created_at)}</div>
        <button
          onClick={() => { onTest(org); setExpanded(true); }} disabled={testingOrg === org.id || org.status !== 'active'}
          style={{ background: 'rgba(255,91,31,0.12)', border: '1px solid rgba(255,91,31,0.3)', color: '#FF9457', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: org.status !== 'active' ? 0.4 : 1 }}
        >
          {testingOrg === org.id ? '…' : 'Test suites'}
        </button>
        {org.status === 'active' && (
          <button
            onClick={() => onGuest(org)} disabled={guestingOrg === org.id}
            style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#7fb2ff', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {guestingOrg === org.id ? '…' : 'Guest in'}
          </button>
        )}
        {org.id !== FOUNDING_ORG_ID ? (
          <button onClick={() => onDelete(org)} style={{ background: 'transparent', border: '1px solid rgba(224,54,54,0.35)', color: '#e05555', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer' }}>Delete</button>
        ) : <span />}
      </div>
      <AnimatePresence>
        {results && expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
            style={{ borderTop: '1px solid rgba(244,241,234,0.08)', padding: '14px 18px', background: 'rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {results.map((r) => (
                <span key={r.key} style={{
                  fontSize: 11.5, padding: '4px 10px', borderRadius: 100, fontWeight: 600,
                  background: r.ok ? 'rgba(95,191,95,0.15)' : 'rgba(224,85,85,0.15)', color: r.ok ? '#7fd67f' : '#e88a8a',
                }}>
                  {r.key}: {r.ok ? `OK (${r.count})` : 'Error'}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'rgba(244,241,234,0.35)', margin: '10px 0 0' }}>Row counts only — no customer data is ever shown here.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function PlatformAdmin() {
  const reduce = useReducedMotion();
  const [orgs, setOrgs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [testingOrg, setTestingOrg] = useState(null);
  const [guestingOrg, setGuestingOrg] = useState(null);
  const [suiteResults, setSuiteResults] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const flash = (msg, isErr) => { setToast({ msg, isErr }); setTimeout(() => setToast(null), 3200); };

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

  return (
    <PlatformShell title="Platform Admin">
      <style>{PA_CSS}</style>
      <div className="pa-stats">
        <StatCard icon={I.org} label="Organizations" value={orgs.length} accent="#FF5B1F" delay={0} />
        <StatCard icon={I.users} label="Signed-up users" value={customerProfiles.length} accent="#3b82f6" delay={0.05} />
        <StatCard icon={I.pulse} label="Active in last 24h" value={activeLast24h} accent="#22c55e" delay={0.1} />
        <StatCard icon={I.coin} label="Pending payments" value={pendingTx.length} accent="#eab308" delay={0.15} />
      </div>
      <p style={{ fontSize: 12, color: 'rgba(244,241,234,0.4)', marginBottom: 16 }}>
        "Active in last 24h" is from real sign-in timestamps, not live presence. Page-visitor analytics live in Vercel's dashboard for this project.
      </p>
      <StatusWidget />

      {pendingTx.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.02em', margin: '0 0 14px', color: '#F4F1EA' }}>PENDING PAYMENTS</h2>
          {pendingTx.map((t, i) => (
            <motion.div key={t.id} initial={reduce ? {} : { opacity: 0, y: 8 }} animate={reduce ? {} : { opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="pa-payrow" style={{ ...glass, padding: '14px 18px', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 600, color: '#F4F1EA', fontSize: 14 }}>{orgName(t.org_id)}</div>
                <div style={{ fontSize: 12, color: 'rgba(244,241,234,0.5)', marginTop: 2 }}>
                  {t.type === 'activation_fee' ? 'Activation fee' : 'Seat credits'} · <span style={{ fontFamily: 'ui-monospace, monospace' }}>{t.reference}</span> · {fmtDate(t.created_at)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#F4F1EA' }}>{naira(t.amount_kobo)}</span>
                <button onClick={() => remindOrg(t)} disabled={reminding === t.id}
                  style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.35)', color: '#eab308', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  {reminding === t.id ? '…' : 'Send reminder'}
                </button>
                <button onClick={() => confirmPayment(t.id)} disabled={confirming === t.id}
                  style={{ background: '#FF5B1F', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {confirming === t.id ? '…' : <>{I.check} Confirm</>}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <ContactMessagesPanel flash={flash} />

      <PromoCodesPanel flash={flash} />

      <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.02em', margin: '0 0 14px', color: '#F4F1EA' }}>ORGANIZATIONS</h2>
      <div style={{ marginBottom: 32 }}>
        {loading && <p style={{ color: 'rgba(244,241,234,0.5)', fontSize: 13.5 }}>Loading…</p>}
        {!loading && orgs.length === 0 && <p style={{ color: 'rgba(244,241,234,0.5)', fontSize: 13.5 }}>No organizations yet.</p>}
        {!loading && orgs.map((o, i) => (
          <OrgRow key={o.id} org={o} site={siteByOrg[o.id]} themes={themes} staffCount={staffCountByOrg[o.id]} testingOrg={testingOrg} guestingOrg={guestingOrg} suiteResults={suiteResults}
            onTest={testSuites} onGuest={guestIntoOrg} onDelete={setDeleteTarget} index={i} reduce={reduce} />
        ))}
      </div>

      <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.02em', margin: '0 0 14px', color: '#F4F1EA' }}>WEBSITE THEMES</h2>
      <p style={{ fontSize: 12, color: 'rgba(244,241,234,0.4)', margin: '0 0 14px' }}>
        The catalog customers pick from in the website builder, and how many live/draft sites use each.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 32 }}>
        {themes.map((t, i) => {
          const usedBy = sites.filter((s) => s.theme_key === t.key).length;
          return (
            <motion.div key={t.key}
              initial={reduce ? {} : { opacity: 0, y: 10 }} animate={reduce ? {} : { opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.03 }}
              whileHover={reduce ? undefined : { y: -3 }}
              style={{ ...glass, padding: 12 }}>
              <ThemeMockup theme={t} height={96} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 650, color: '#F4F1EA' }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(244,241,234,0.45)', textTransform: 'capitalize' }}>{t.category === 'ecommerce' ? 'Online store' : t.category === 'landing' ? 'Landing page' : 'Company profile'}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: usedBy ? '#7fd67f' : 'rgba(244,241,234,0.35)', background: 'rgba(244,241,234,0.06)', borderRadius: 100, padding: '3px 9px' }}>
                  {usedBy} site{usedBy === 1 ? '' : 's'}
                </span>
              </div>
              <button onClick={() => setPreviewTheme(t)}
                style={{ width: '100%', marginTop: 10, background: 'rgba(255,91,31,0.1)', border: '1px solid rgba(255,91,31,0.3)', color: '#FF9457', borderRadius: 8, padding: '7px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Preview theme
              </button>
            </motion.div>
          );
        })}
      </div>
      {previewTheme && <ThemePreviewModal theme={previewTheme} onClose={() => setPreviewTheme(null)} />}

      <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.02em', margin: '0 0 14px', color: '#F4F1EA' }}>AUDIT LOG</h2>
      <div style={{ ...glass, padding: auditLog.length ? '6px 18px' : '18px' }}>
        {!loading && auditLog.length === 0 && <p style={{ color: 'rgba(244,241,234,0.5)', fontSize: 13.5, margin: 0 }}>No sensitive actions taken yet.</p>}
        {auditLog.map((e, i) => (
          <div key={e.id} className="pa-auditrow" style={{ padding: '13px 0', borderTop: i > 0 ? '1px solid rgba(244,241,234,0.06)' : 'none' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF5B1F', flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: 'rgba(244,241,234,0.45)', width: 130, flexShrink: 0 }}>{fmtDateTime(e.created_at)}</span>
            <span style={{ fontSize: 13.5, color: '#F4F1EA', width: 170, flexShrink: 0 }}>{AUDIT_LABEL[e.action] || e.action}</span>
            <span style={{ fontSize: 13, color: 'rgba(244,241,234,0.6)', width: 140, flexShrink: 0 }}>{orgName(e.target_org_id)}</span>
            <span style={{ fontSize: 12.5, color: 'rgba(244,241,234,0.4)' }}>
              {e.action === 'confirm_payment' && `${e.details?.type} · ${naira(e.details?.amountKobo || 0)}`}
              {e.action === 'delete_org' && `${e.details?.memberCount ?? 0} staff account${e.details?.memberCount === 1 ? '' : 's'} removed`}
              {e.action === 'impersonate' && e.details?.targetEmail}
            </span>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {deleteTarget && (
          <DeleteOrgModal org={deleteTarget} busy={deleting} onClose={() => setDeleteTarget(null)} onConfirm={deleteOrg} />
        )}
      </AnimatePresence>
      {toast && <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>}
    </PlatformShell>
  );
}
