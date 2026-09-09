// Money, top to bottom: what has come in, what is waiting, every transaction,
// then the levers (published prices and promo codes). Confirming a pending
// payment lives here because this is where the operator looks at money.
import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPatch, getAccessToken } from '../../api/client.js';
import { useToast } from '../../components/ui.jsx';
import { usePlatformCounts } from '../../components/PlatformShell.jsx';
import { Kpi } from './charts.jsx';
import { Empty, SectionHead, Seg, TX_TYPE, fmtDate, naira } from './shared.jsx';

const TX_DOT = { confirmed: 'var(--ok)', pending: 'var(--warn)', refunded: 'var(--err)' };

export default function Revenue() {
  const { flash, toastNode } = useToast();
  const { refreshCounts } = usePlatformCounts();
  const [orgs, setOrgs] = useState([]);
  const [transactions, setTransactions] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    Promise.all([apiGet('/platform/organizations'), apiGet('/platform/transactions')])
      .then(([o, t]) => { setOrgs(o.organizations || []); setTransactions(t.transactions || []); })
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const orgName = (id) => orgs.find((o) => o.id === id)?.name || (id ? id.slice(0, 8) : '—');
  const tx = transactions || [];
  const pending = tx.filter((t) => t.status === 'pending');
  const confirmed = tx.filter((t) => t.status === 'confirmed');
  const sum = (rows) => rows.reduce((s, t) => s + Number(t.amount_kobo || 0), 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const thisMonth = confirmed.filter((t) => new Date(t.confirmed_at || t.created_at).getTime() >= monthStart);
  const refunded = tx.filter((t) => t.status === 'refunded');

  const counts = { all: tx.length, pending: pending.length, confirmed: confirmed.length, refunded: refunded.length };
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tx
      .filter((t) => (filter === 'all' ? true : t.status === filter))
      .filter((t) => !needle || orgName(t.org_id).toLowerCase().includes(needle) || (t.reference || '').toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 300);
  }, [tx, filter, q, orgs]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmPayment = async (t) => {
    setBusyId(t.id);
    try { await apiPost('/platform/confirm-payment', { transactionId: t.id }); flash('Payment confirmed, organization activated.'); load(); refreshCounts(); }
    catch (e) { flash(e.message, true); } finally { setBusyId(null); }
  };
  const remind = async (t) => {
    setBusyId(t.id);
    try {
      const kind = t.type === 'activation_fee' ? 'activation fee' : 'seat credits';
      await apiPost('/platform/remind-payment', { orgId: t.org_id, message: `Reminder: your ${kind} payment of ${naira(t.amount_kobo)} (ref ${t.reference}) is still pending. Complete the transfer to keep your Collarone workspace active, WhatsApp us the reference on 0814 812 8551 once sent.` });
      fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken() || ''}` }, body: JSON.stringify({ action: 'billing-reminder', orgId: t.org_id }) }).catch(() => {});
      flash(`Reminder sent to ${orgName(t.org_id)}.`);
    } catch (e) { flash(e.message, true); } finally { setBusyId(null); }
  };
  // The money itself is returned in the Paystack dashboard or by transfer;
  // this records it (and claws back credit-pack credits), audited.
  const refund = async (t) => {
    const reason = window.prompt(`Refund ${naira(t.amount_kobo)} (${t.reference}) for ${orgName(t.org_id)}?\n\nType the refund reason:`);
    if (reason === null) return;
    if (!reason.trim()) { flash('A refund reason is required.', true); return; }
    setBusyId(t.id);
    try { await apiPost('/platform/refund-transaction', { transactionId: t.id, reason: reason.trim() }); flash('Refund recorded.'); load(); }
    catch (e) { flash(e.message, true); } finally { setBusyId(null); }
  };

  return (
    <>
      {error && <p className="pc-note" style={{ color: 'var(--err)' }}>{error}</p>}

      <div className="pc-kpis">
        <Kpi label="Collected, all time" value={transactions ? naira(sum(confirmed)) : '…'} sub={`${confirmed.length} confirmed payment${confirmed.length === 1 ? '' : 's'}`} />
        <Kpi label="Collected this month" value={transactions ? naira(sum(thisMonth)) : '…'} sub={new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} />
        <Kpi label="Awaiting confirmation" value={transactions ? naira(sum(pending)) : '…'} sub={pending.length ? `${pending.length} transfer${pending.length === 1 ? '' : 's'} to check` : 'nothing pending'} tone={pending.length ? 'down' : undefined} />
        <Kpi label="Refunded" value={transactions ? naira(sum(refunded)) : '…'} sub={refunded.length ? `${refunded.length} refund${refunded.length === 1 ? '' : 's'} recorded` : 'no refunds'} />
      </div>

      {pending.length > 0 && (
        <section className="pc-section">
          <SectionHead title="Awaiting confirmation" count={String(pending.length)} />
          <div className="pc-panel pc-tablewrap">
            <table className="pc-table collapsible">
              <thead><tr><th>Organization</th><th>Type</th><th>Reference</th><th>Date</th><th className="num">Amount</th><th className="r" /></tr></thead>
              <tbody>
                {pending.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{orgName(t.org_id)}</td>
                    <td className="pc-dim">{TX_TYPE[t.type] || t.type}{t.type === 'renewal' ? ` · ${t.months === 12 ? '12 mo' : '1 mo'}` : ''}</td>
                    <td className="pc-mono pc-dim" style={{ fontSize: 11.5 }}>{t.reference}</td>
                    <td className="pc-dim">{fmtDate(t.created_at)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{naira(t.amount_kobo)}</td>
                    <td className="r">
                      <div className="pc-actions">
                        <button className="pc-btn sm" disabled={busyId === t.id} onClick={() => remind(t)}>Send reminder</button>
                        <button className="pc-btn sm primary" disabled={busyId === t.id} onClick={() => confirmPayment(t)}>{busyId === t.id ? '…' : 'Confirm received'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="pc-section">
        <SectionHead title="Transactions" count={String(tx.length)}>
          <label className="pc-search" style={{ minWidth: 200, maxWidth: 260, height: 30 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Organization or reference" aria-label="Search transactions" />
          </label>
          <Seg label="Status" value={filter} onChange={setFilter} options={[['all', 'All'], ['pending', 'Pending', counts.pending], ['confirmed', 'Confirmed'], ['refunded', 'Refunded', counts.refunded]]} />
        </SectionHead>
        <div className="pc-panel pc-tablewrap">
          {transactions == null ? <div className="pc-empty">Loading…</div> : rows.length === 0 ? (
            <Empty title="No transactions match">{tx.length === 0 ? 'The first activation fee or renewal will show here.' : 'Try another status or clear the search.'}</Empty>
          ) : (
            <table className="pc-table collapsible">
              <thead><tr><th>Date</th><th>Organization</th><th>Type</th><th>Reference</th><th>Method</th><th className="num">Amount</th><th>Status</th><th className="r" /></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td className="pc-dim" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDate(t.created_at)}</td>
                    <td style={{ fontWeight: 550 }}>{orgName(t.org_id)}</td>
                    <td className="pc-dim">{TX_TYPE[t.type] || t.type}{t.type === 'renewal' ? ` · ${t.months === 12 ? '12 mo' : '1 mo'}` : ''}{t.type === 'credit_purchase' && t.credits_granted ? ` · ${t.credits_granted}` : ''}</td>
                    <td className="pc-mono pc-dim" style={{ fontSize: 11.5 }}>{t.reference}</td>
                    <td className="pc-dim">{t.method === 'paystack' ? 'Card' : 'Transfer'}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{naira(t.amount_kobo)}</td>
                    <td><span className="pc-pill" title={t.status === 'refunded' && t.refund_reason ? t.refund_reason : undefined}><span className="pc-dot" style={{ background: TX_DOT[t.status] || 'var(--faint)' }} />{t.status}</span></td>
                    <td className="r">{t.status === 'confirmed' && <button className="pc-btn sm" disabled={busyId === t.id} onClick={() => refund(t)}>{busyId === t.id ? 'Working…' : 'Refund'}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <Pricing flash={flash} />
      <PromoCodes flash={flash} />
      {toastNode}
    </>
  );
}

// Published price list. Editing changes what NEW signups see and lock in;
// existing orgs keep the rates stamped on their row at sign-up.
function Pricing({ flash }) {
  const [plans, setPlans] = useState([]);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const load = () => { apiGet('/platform/pricing').then((d) => { setPlans(d.plans || []); setSettings(d.settings); setDirty(false); }).catch(() => {}); };
  useEffect(load, []);
  const nairaField = (kobo) => Math.round(Number(kobo || 0) / 100);
  const setPlan = (key, field, v) => { setDirty(true); setPlans((ps) => ps.map((x) => (x.plan_key === key ? { ...x, [field]: v } : x))); };
  const setSetting = (patch) => { setDirty(true); setSettings((v) => ({ ...v, ...patch })); };

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
      flash('Published prices updated. New signups lock these in, existing customers are untouched.');
      load();
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  if (!plans.length) return null;
  return (
    <section className="pc-section">
      <SectionHead title="Published pricing">
        {dirty && <span className="pc-chip warn">Unsaved changes</span>}
        <button className="pc-btn sm primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Publish prices'}</button>
      </SectionHead>
      <p className="pc-note">What the landing page, signup and chat quote from now on. Only new sign-ups are affected, every existing company keeps the rate locked on its own account.</p>
      <div className="pc-plan-grid">
        {plans.map((x) => (
          <div key={x.plan_key} className="pc-card pc-plan">
            <h3>{x.name || x.plan_key}</h3>
            <p className="pc-plan-note">{x.plan_key === 'enterprise' ? 'Quote-based. Priced per deal, never shown as a number.' : 'Per month, before staff seats.'}</p>
            {x.plan_key !== 'enterprise' && (
              <label>Base fee
                <div className="pc-money-input"><span>₦</span><input className="pc-input" type="number" min="0" value={x.base_fee_naira ?? nairaField(x.base_fee_kobo)} onChange={(e) => setPlan(x.plan_key, 'base_fee_naira', e.target.value)} /><span>/ month</span></div>
              </label>
            )}
            <label>Suites included
              <input className="pc-input" type="number" min="1" value={x.included_suites} onChange={(e) => setPlan(x.plan_key, 'included_suites', e.target.value)} />
            </label>
            <label>Each extra suite
              <div className="pc-money-input"><span>₦</span><input className="pc-input" type="number" min="0" value={x.extra_fee_naira ?? nairaField(x.extra_suite_fee_kobo)} onChange={(e) => setPlan(x.plan_key, 'extra_fee_naira', e.target.value)} /><span>/ month</span></div>
            </label>
          </div>
        ))}
        {settings && (
          <div className="pc-card pc-plan">
            <h3>All plans</h3>
            <p className="pc-plan-note">Applies on top of every tier.</p>
            <label>Per staff member
              <div className="pc-money-input"><span>₦</span><input className="pc-input" type="number" min="0" value={settings.per_staff_naira ?? nairaField(settings.per_staff_kobo)} onChange={(e) => setSetting({ per_staff_naira: e.target.value })} /><span>/ month</span></div>
            </label>
            <label>Yearly discount
              <div className="pc-money-input"><input className="pc-input" type="number" min="0" max="90" value={settings.annual_pct ?? Math.round(Number(settings.annual_discount) * 100)} onChange={(e) => setSetting({ annual_pct: e.target.value })} /><span>% off when paid annually</span></div>
            </label>
          </div>
        )}
      </div>
    </section>
  );
}

function PromoCodes({ flash }) {
  const [codes, setCodes] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', percentOff: 100, expiresAt: '', maxUses: '', trialDays: '', grantCredits: '' });
  const [busy, setBusy] = useState(false);
  const load = () => { apiGet('/platform/promo-codes').then((d) => setCodes(d.promoCodes || [])).catch(() => {}); };
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
      setOpen(false); load();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };
  const toggle = async (c) => {
    try { await apiPatch(`/platform/promo-codes/${c.id}`, { active: !c.active }); load(); }
    catch (e2) { flash(e2.message, true); }
  };
  const expired = (c) => c.expires_at && new Date(c.expires_at) < new Date();
  const live = codes.filter((c) => c.active && !expired(c)).length;

  return (
    <section className="pc-section">
      <SectionHead title="Promo codes" count={`${live} live of ${codes.length}`}>
        <button className={`pc-btn sm${open ? '' : ' primary'}`} onClick={() => setOpen((v) => !v)}>{open ? 'Cancel' : 'New code'}</button>
      </SectionHead>

      {open && (
        <form onSubmit={create} className="pc-card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, alignItems: 'end' }}>
            <label className="pc-field"><span>Code</span><input className="pc-input" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="LAUNCH100" style={{ textTransform: 'uppercase' }} /></label>
            <label className="pc-field"><span>% off</span><input className="pc-input" type="number" min={1} max={100} value={form.percentOff} onChange={(e) => setForm((f) => ({ ...f, percentOff: e.target.value }))} /></label>
            <label className="pc-field"><span>Code expires</span><input className="pc-input" type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} /></label>
            <label className="pc-field"><span>Max uses</span><input className="pc-input" type="number" min={1} value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} placeholder="Unlimited" /></label>
            <label className="pc-field"><span>Trial days</span><input className="pc-input" type="number" min={1} value={form.trialDays} onChange={(e) => setForm((f) => ({ ...f, trialDays: e.target.value }))} placeholder="Permanent" /></label>
            <label className="pc-field"><span>Free seat credits</span><input className="pc-input" type="number" min={0} value={form.grantCredits} onChange={(e) => setForm((f) => ({ ...f, grantCredits: e.target.value }))} placeholder="0" /></label>
            <button className="pc-btn primary" disabled={busy}>{busy ? '…' : 'Create code'}</button>
          </div>
          <p className="pc-note" style={{ margin: '12px 0 0', maxWidth: '72ch' }}>A 100% code activates the workspace instantly at signup. Trial days makes that access time-boxed, after which the org is suspended until they pay. Free credits are seat credits granted at signup so they can add staff without buying a pack.</p>
        </form>
      )}

      <div className="pc-panel pc-tablewrap">
        {codes.length === 0 && !open ? (
          <Empty title="No promo codes yet">Create one to let a new business try Collarone free, for a trial period or for good.</Empty>
        ) : codes.length > 0 && (
          <table className="pc-table collapsible">
            <thead><tr><th>Code</th><th>Off</th><th>Access</th><th className="num">Credits</th><th>Expires</th><th className="num">Used</th><th className="r" /></tr></thead>
            <tbody>
              {codes.map((c) => {
                const dead = !c.active || expired(c);
                return (
                  <tr key={c.id} style={{ opacity: dead ? 0.55 : 1 }}>
                    <td className="pc-mono" style={{ fontWeight: 600 }}>{c.code}{!c.active && <span className="pc-chip" style={{ marginLeft: 8 }}>off</span>}{c.active && expired(c) && <span className="pc-chip warn" style={{ marginLeft: 8 }}>expired</span>}</td>
                    <td className="pc-mono">{c.percent_off}%</td>
                    <td>{c.trial_days ? `${c.trial_days}-day trial` : 'Permanent'}</td>
                    <td className="num">{c.grant_credits > 0 ? `+${c.grant_credits}` : '—'}</td>
                    <td className="pc-dim">{c.expires_at ? fmtDate(c.expires_at) : 'Never'}</td>
                    <td className="num">{c.uses}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
                    <td className="r"><button className="pc-btn sm" onClick={() => toggle(c)}>{c.active ? 'Deactivate' : 'Reactivate'}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
