import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../api/client.js';
import { FOUNDING_ORG_ID } from '../config/org.js';
import PlatformShell from '../components/PlatformShell.jsx';

const STATUS_LABEL = { pending_payment: 'Pending payment', active: 'Active', suspended: 'Suspended', cancelled: 'Cancelled' };
const AUDIT_LABEL = { confirm_payment: 'Confirmed payment', delete_org: 'Deleted organization', impersonate: 'Impersonated admin (retired)' };
const ALL_SUITE_KEYS = ['hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm', 'attendance', 'benefits', 'it-assets', 'procurement', 'inventory', 'finance', 'projects', 'documents'];
const naira = (kobo) => `₦${(kobo / 100).toLocaleString()}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const DAY_MS = 24 * 60 * 60 * 1000;

const cardStyle = { padding: 20, background: '#14161c', border: '1px solid rgba(244,241,234,0.10)', borderRadius: 14 };
const labelStyle = { fontSize: 11.5, fontWeight: 600, color: 'rgba(244,241,234,0.5)', textTransform: 'uppercase', letterSpacing: '.05em' };

function DeleteOrgModal({ org, onClose, onConfirm, busy }) {
  const [text, setText] = useState('');
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Delete {org.name}</h2>
          <button className="iconbtn dark" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13.5, color: 'var(--text-2)' }}>
            This permanently deletes {org.name} — every staff account, the organization record, and its billing history. This cannot be undone.
          </p>
          <div className="field">
            <label>Type <strong>{org.slug}</strong> to confirm</label>
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={org.slug} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn" style={{ background: '#c02b2b', color: '#fff' }} disabled={text !== org.slug || busy} onClick={onConfirm}>
              {busy ? <span className="spinner" /> : 'Delete permanently'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlatformAdmin() {
  const [orgs, setOrgs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [testingOrg, setTestingOrg] = useState(null);
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

  const deleteOrg = async () => {
    setDeleting(true);
    try {
      await apiPost('/platform/delete-org', { orgId: deleteTarget.id });
      flash(`${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
      load();
    } catch (e) { flash(e.message, true); } finally { setDeleting(false); }
  };

  const stat = (label, value) => (
    <div style={cardStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 650, fontFamily: 'ui-monospace, monospace', marginTop: 6, color: '#F4F1EA' }}>{value}</div>
    </div>
  );

  return (
    <PlatformShell title="Platform Admin">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
        {stat('Organizations', orgs.length)}
        {stat('Signed-up users', profiles.length)}
        {stat('Active in last 24h', activeLast24h)}
        {stat('Pending payments', pendingTx.length)}
      </div>
      <p style={{ fontSize: 12, color: 'rgba(244,241,234,0.4)', marginBottom: 28 }}>
        "Active in last 24h" is from real sign-in timestamps, not live presence. Page-visitor analytics live in Vercel's dashboard for this project — real uptime monitoring is a separate concern, see <a href="/status" style={{ color: '#FF9457' }}>the status page</a>.
      </p>

      {pendingTx.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, margin: '0 0 12px', color: '#F4F1EA' }}>Pending payments</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Organization</th><th>Type</th><th>Reference</th><th>Amount</th><th>Date</th><th></th></tr></thead>
              <tbody>
                {pendingTx.map((t) => (
                  <tr key={t.id}>
                    <td>{orgName(t.org_id)}</td>
                    <td>{t.type === 'activation_fee' ? 'Activation fee' : 'Seat credits'}</td>
                    <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{t.reference}</td>
                    <td>{naira(t.amount_kobo)}</td>
                    <td>{fmtDate(t.created_at)}</td>
                    <td>
                      <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 13 }} disabled={confirming === t.id} onClick={() => confirmPayment(t.id)}>
                        {confirming === t.id ? <span className="spinner" /> : 'Confirm'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: 15, margin: '0 0 12px', color: '#F4F1EA' }}>Organizations</h2>
      <div className="table-wrap" style={{ marginBottom: 28 }}>
        <table className="table">
          <thead><tr><th>Name</th><th>Handle</th><th>Plan</th><th>Status</th><th>Staff</th><th>Created</th><th colSpan={2}></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="td-empty">Loading…</td></tr>}
            {!loading && orgs.length === 0 && <tr><td colSpan={8} className="td-empty">No organizations yet.</td></tr>}
            {!loading && orgs.map((o) => (
              <>
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{o.slug}</td>
                  <td style={{ textTransform: 'capitalize' }}>{o.plan_tier}</td>
                  <td><span className={`status-dot ${o.status === 'active' ? 'active' : 'disabled'}`} />{STATUS_LABEL[o.status] || o.status}</td>
                  <td>{staffCountByOrg[o.id] || 0}</td>
                  <td>{fmtDate(o.created_at)}</td>
                  <td>
                    {o.status === 'active' && (
                      <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 13 }} disabled={testingOrg === o.id} onClick={() => testSuites(o)}>
                        {testingOrg === o.id ? <span className="spinner" /> : 'Test suites'}
                      </button>
                    )}
                  </td>
                  <td>
                    {o.id !== FOUNDING_ORG_ID && (
                      <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 13, color: '#c02b2b', borderColor: '#e7b8b8' }} onClick={() => setDeleteTarget(o)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
                {suiteResults[o.id] && (
                  <tr key={`${o.id}-results`}>
                    <td colSpan={8} style={{ background: '#14161c', padding: '10px 14px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {suiteResults[o.id].map((r) => (
                          <span key={r.key} style={{
                            fontSize: 11.5, padding: '3px 9px', borderRadius: 12,
                            background: r.ok ? 'rgba(26,106,26,0.18)' : 'rgba(164,38,44,0.18)',
                            color: r.ok ? '#5fbf5f' : '#e77b7f',
                          }}>
                            {r.key}: {r.ok ? `OK (${r.count})` : `Error`}
                          </span>
                        ))}
                      </div>
                      <p style={{ fontSize: 11, color: 'rgba(244,241,234,0.4)', margin: '8px 0 0' }}>
                        Row counts only — no customer data is ever shown here.
                      </p>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 15, margin: '0 0 12px', color: '#F4F1EA' }}>Audit log</h2>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>When</th><th>Action</th><th>Organization</th><th>Detail</th></tr></thead>
          <tbody>
            {!loading && auditLog.length === 0 && <tr><td colSpan={4} className="td-empty">No sensitive actions taken yet.</td></tr>}
            {auditLog.map((e) => (
              <tr key={e.id}>
                <td>{fmtDateTime(e.created_at)}</td>
                <td>{AUDIT_LABEL[e.action] || e.action}</td>
                <td>{orgName(e.target_org_id)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {e.action === 'confirm_payment' && `${e.details?.type} · ${naira(e.details?.amountKobo || 0)}`}
                  {e.action === 'delete_org' && `${e.details?.memberCount ?? 0} staff account${e.details?.memberCount === 1 ? '' : 's'} removed`}
                  {e.action === 'impersonate' && e.details?.targetEmail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <DeleteOrgModal org={deleteTarget} busy={deleting} onClose={() => setDeleteTarget(null)} onConfirm={deleteOrg} />
      )}
      {toast && <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>}
    </PlatformShell>
  );
}
