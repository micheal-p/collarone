import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { apiGet, apiPost, apiPatch } from '../api/client.js';
import { supabase } from '../lib/supabaseClient.js';
import { FOUNDING_ORG_ID } from '../config/org.js';
import PlatformShell from '../components/PlatformShell.jsx';

const GUEST_KEY = 'collarone_guest_mode';

const STATUS_LABEL = { pending_payment: 'Pending payment', active: 'Active', suspended: 'Suspended', cancelled: 'Cancelled' };
const AUDIT_LABEL = { confirm_payment: 'Confirmed payment', delete_org: 'Deleted organization', impersonate: 'Impersonated admin (retired)', guest_mode: 'Guested into organization' };
const ALL_SUITE_KEYS = ['hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm', 'attendance', 'benefits', 'it-assets', 'procurement', 'inventory', 'finance', 'projects', 'documents'];
const COUNTRY_FLAG = { NG: '🇳🇬', GH: '🇬🇭', KE: '🇰🇪', ZA: '🇿🇦', EG: '🇪🇬', GB: '🇬🇧', US: '🇺🇸' };
const countryFlag = (code) => COUNTRY_FLAG[code] || '🌍';
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
};

const glass = { background: 'rgba(20,22,30,0.55)', border: '1px solid rgba(244,241,234,0.10)', borderRadius: 16, backdropFilter: 'blur(14px)' };

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
      style={{ ...glass, padding: '20px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none', marginBottom: 32 }}>
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

function PromoCodesPanel({ flash }) {
  const [codes, setCodes] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', percentOff: 100, expiresAt: '', maxUses: '' });
  const [busy, setBusy] = useState(false);

  const load = () => apiGet('/platform/promo-codes').then((d) => setCodes(d.promoCodes)).catch(() => {});
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
      });
      flash(`Code ${form.code.toUpperCase()} created.`);
      setForm({ code: '', percentOff: 100, expiresAt: '', maxUses: '' });
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
  const inputStyle = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(244,241,234,0.15)', borderRadius: 8, padding: '9px 12px', color: '#F4F1EA', fontSize: 13.5 };

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
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 0.8fr auto', gap: 10, padding: 16, alignItems: 'end' }}>
              <label style={{ fontSize: 11.5, color: 'rgba(244,241,234,0.5)', display: 'flex', flexDirection: 'column', gap: 5 }}>CODE
                <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="LAUNCH100" style={{ ...inputStyle, textTransform: 'uppercase' }} />
              </label>
              <label style={{ fontSize: 11.5, color: 'rgba(244,241,234,0.5)', display: 'flex', flexDirection: 'column', gap: 5 }}>% OFF
                <input type="number" min={1} max={100} value={form.percentOff} onChange={(e) => setForm((f) => ({ ...f, percentOff: e.target.value }))} style={inputStyle} />
              </label>
              <label style={{ fontSize: 11.5, color: 'rgba(244,241,234,0.5)', display: 'flex', flexDirection: 'column', gap: 5 }}>EXPIRES
                <input type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} style={{ ...inputStyle, colorScheme: 'dark' }} />
              </label>
              <label style={{ fontSize: 11.5, color: 'rgba(244,241,234,0.5)', display: 'flex', flexDirection: 'column', gap: 5 }}>MAX USES
                <input type="number" min={1} value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} placeholder="∞" style={inputStyle} />
              </label>
              <button disabled={busy} style={{ background: '#FF5B1F', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {busy ? '…' : 'Create'}
              </button>
            </div>
            <p style={{ fontSize: 11.5, color: 'rgba(244,241,234,0.4)', margin: 0, padding: '0 16px 14px' }}>
              A 100% code activates the workspace instantly at signup — no transfer needed. Anything less discounts the activation fee.
            </p>
          </motion.form>
        )}
      </AnimatePresence>

      {codes.length === 0 && !open && (
        <div style={{ ...glass, padding: 18, fontSize: 13, color: 'rgba(244,241,234,0.5)' }}>No promo codes yet — create one to let new businesses try Collarone.</div>
      )}
      {codes.map((c) => (
        <div key={c.id} style={{ ...glass, display: 'flex', alignItems: 'center', gap: 16, padding: '13px 18px', marginBottom: 8, opacity: c.active && !expired(c) ? 1 : 0.55 }}>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 14.5, color: '#F4F1EA', width: 150 }}>{c.code}</span>
          <span style={{ fontSize: 13, color: '#7fd67f', fontWeight: 600, width: 70 }}>{c.percent_off}% off</span>
          <span style={{ fontSize: 12.5, color: 'rgba(244,241,234,0.55)', width: 150 }}>
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
        style={{ ...glass, background: '#14161c', width: 420, padding: 26 }} onMouseDown={(e) => e.stopPropagation()}>
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

function OrgRow({ org, staffCount, testingOrg, suiteResults, onTest, onDelete, onGuest, guestingOrg, index, reduce }) {
  const [expanded, setExpanded] = useState(false);
  const results = suiteResults[org.id];

  return (
    <motion.div
      initial={reduce ? {} : { opacity: 0, x: -12 }} animate={reduce ? {} : { opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: index * 0.05 }}
      style={{ ...glass, marginBottom: 10, overflow: 'hidden' }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.5fr 0.9fr 1fr 0.6fr 1fr auto auto auto', gap: 12, alignItems: 'center', padding: '16px 18px' }}>
        <div style={{ fontWeight: 600, color: '#F4F1EA', fontSize: 14.5 }}>{org.name}</div>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, color: 'rgba(244,241,234,0.55)' }}>{org.slug}</div>
        <div style={{ fontSize: 16 }} title={org.country}>{countryFlag(org.country)}</div>
        <div style={{ fontSize: 13, textTransform: 'capitalize', color: 'rgba(244,241,234,0.75)' }}>{org.plan_tier}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'rgba(244,241,234,0.75)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: org.status === 'active' ? '#5fbf5f' : 'rgba(244,241,234,0.3)', boxShadow: org.status === 'active' ? '0 0 6px #5fbf5f' : 'none' }} />
          {STATUS_LABEL[org.status] || org.status}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(244,241,234,0.75)' }}>{staffCount || 0}</div>
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

  const load = () => {
    setLoading(true);
    Promise.all([apiGet('/platform/organizations'), apiGet('/platform/profiles'), apiGet('/platform/transactions'), apiGet('/platform/audit-log')])
      .then(([o, p, t, a]) => { setOrgs(o.organizations); setProfiles(p.profiles); setTransactions(t.transactions); setAuditLog(a.entries); })
      .catch((e) => flash(e.message, true))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const staffCountByOrg = useMemo(() => {
    const m = {};
    profiles.forEach((p) => { m[p.org_id] = (m[p.org_id] || 0) + 1; });
    return m;
  }, [profiles]);

  const activeLast24h = useMemo(() => {
    const cutoff = Date.now() - DAY_MS;
    return profiles.filter((p) => p.last_login_at && new Date(p.last_login_at).getTime() > cutoff).length;
  }, [profiles]);

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
      sessionStorage.setItem(GUEST_KEY, JSON.stringify({ orgId: org.id, orgName: d.orgName, startedAt: Date.now() }));
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
        <StatCard icon={I.org} label="Organizations" value={orgs.length} accent="#FF5B1F" delay={0} />
        <StatCard icon={I.users} label="Signed-up users" value={profiles.length} accent="#3b82f6" delay={0.05} />
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
              style={{ ...glass, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', marginBottom: 8 }}>
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

      <PromoCodesPanel flash={flash} />

      <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.02em', margin: '0 0 14px', color: '#F4F1EA' }}>ORGANIZATIONS</h2>
      <div style={{ marginBottom: 32 }}>
        {loading && <p style={{ color: 'rgba(244,241,234,0.5)', fontSize: 13.5 }}>Loading…</p>}
        {!loading && orgs.length === 0 && <p style={{ color: 'rgba(244,241,234,0.5)', fontSize: 13.5 }}>No organizations yet.</p>}
        {!loading && orgs.map((o, i) => (
          <OrgRow key={o.id} org={o} staffCount={staffCountByOrg[o.id]} testingOrg={testingOrg} guestingOrg={guestingOrg} suiteResults={suiteResults}
            onTest={testSuites} onGuest={guestIntoOrg} onDelete={setDeleteTarget} index={i} reduce={reduce} />
        ))}
      </div>

      <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.02em', margin: '0 0 14px', color: '#F4F1EA' }}>AUDIT LOG</h2>
      <div style={{ ...glass, padding: auditLog.length ? '6px 18px' : '18px' }}>
        {!loading && auditLog.length === 0 && <p style={{ color: 'rgba(244,241,234,0.5)', fontSize: 13.5, margin: 0 }}>No sensitive actions taken yet.</p>}
        {auditLog.map((e, i) => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderTop: i > 0 ? '1px solid rgba(244,241,234,0.06)' : 'none' }}>
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
