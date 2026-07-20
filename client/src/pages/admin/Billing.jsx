import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import AppLayout from '../../components/AppLayout.jsx';

const STATUS_LABEL = { pending: 'Pending', confirmed: 'Confirmed', failed: 'Failed', cancelled: 'Cancelled' };
const TYPE_LABEL = { activation_fee: 'Activation fee', credit_purchase: 'Seat credits' };
const CREDIT_OPTIONS = [1, 2, 3, 5, 10, 20];

const naira = (kobo) => `₦${(kobo / 100).toLocaleString()}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

function downloadCsv(transactions) {
  const rows = [
    ['Date', 'Type', 'Reference', 'Amount (NGN)', 'Credits', 'Status'],
    ...transactions.map((t) => [
      fmtDate(t.created_at), TYPE_LABEL[t.type] || t.type, t.reference,
      (t.amount_kobo / 100).toFixed(2), t.credits_granted || 0, STATUS_LABEL[t.status] || t.status,
    ]),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `collarone-billing-history.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminBilling() {
  const { user } = useAuth();
  // Self-serve Paystack for Collarone's own fees — shown when the platform
  // gateway is configured server-side.
  const [payOnline, setPayOnline] = useState(false);
  const [paying, setPaying] = useState(false);
  useEffect(() => {
    fetch('/api/platform-pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }) })
      .then((r) => r.json()).then((d) => setPayOnline(Boolean(d.enabled))).catch(() => {});
  }, []);
  const payNow = async (tx) => {
    setPaying(true);
    try {
      const r = await fetch('/api/platform-pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'init', reference: tx.reference, email: user?.email }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.authorizationUrl) throw new Error(d.message || 'Could not start the payment.');
      window.location.href = d.authorizationUrl;
    } catch (e) { alert(e.message); setPaying(false); }
  };
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [buyOpen, setBuyOpen] = useState(false);
  const [credits, setCredits] = useState(5);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // most recent unconfirmed purchase
  const [toast, setToast] = useState(null);

  const flash = (msg, isErr) => { setToast({ msg, isErr }); setTimeout(() => setToast(null), 3200); };

  const load = () => {
    setLoading(true);
    Promise.all([apiGet('/billing/transactions'), apiGet('/billing/balance')])
      .then(([tx, bal]) => { setTransactions(tx.transactions); setBalance(bal.balance); })
      .catch((e) => flash(e.message, true))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const buy = async () => {
    setBusy(true);
    try {
      const tx = await apiPost('/billing/purchase-credits', { credits });
      setPending(tx);
      setBuyOpen(false);
      load();
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  // The rate locked at signup — matches exactly what the server charges.
  const seatKobo = user?.org?.perSeatKobo || 200000;

  return (
    <AppLayout breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Billing' }]} title="Billing">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 22, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Seat credits</div>
          <div style={{ fontSize: 32, fontWeight: 650, fontFamily: 'ui-monospace, monospace', marginTop: 6 }}>{balance}</div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '6px 0 16px' }}>One credit is used each time you create a new staff account.</p>
          <button className="btn btn-primary" onClick={() => setBuyOpen(true)}>Buy credits</button>
        </div>
        <div style={{ padding: 22, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Your plan</div>
          <div style={{ fontSize: 20, fontWeight: 650, marginTop: 6, textTransform: 'capitalize' }}>{user?.org?.planTier || '—'}</div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '6px 0 0' }}>Rate locked at sign-up — your base fee and per-seat cost don't change even as our plans grow.</p>
        </div>
      </div>

      {pending && (
        <div style={{ padding: '16px 20px', marginBottom: 20, border: '1px solid var(--brand)', borderRadius: 'var(--radius-lg)', background: 'var(--brand-100)' }}>
          <div style={{ fontWeight: 650, marginBottom: 4 }}>Payment reference generated</div>
          <p style={{ fontSize: 13.5, margin: 0, color: 'var(--text)' }}>
            Reference <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{pending.reference}</strong> for {naira(pending.amount_kobo)} — WhatsApp us your reference at{' '}
            <a href="https://wa.me/2348148128551" target="_blank" rel="noreferrer">0814 812 8551</a> and we'll confirm the same day.
          </p>
          {payOnline && (
            <button type="button" className="btn btn-primary" style={{ marginTop: 10, fontSize: 13 }} disabled={paying} onClick={() => payNow(pending)}>
              {paying ? 'Opening secure payment…' : `Pay ${naira(pending.amount_kobo)} online now`}
            </button>
          )}
        </div>
      )}

      <div className="table-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px 12px' }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>Payment history</h2>
          <button className="btn btn-ghost" disabled={!transactions.length} onClick={() => downloadCsv(transactions)}>Download CSV</button>
        </div>
        <table className="table">
          <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="td-empty">Loading…</td></tr>}
            {!loading && transactions.length === 0 && <tr><td colSpan={5} className="td-empty">No transactions yet.</td></tr>}
            {!loading && transactions.map((t) => (
              <tr key={t.id}>
                <td>{fmtDate(t.created_at)}</td>
                <td>{TYPE_LABEL[t.type] || t.type}</td>
                <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{t.reference}</td>
                <td>{naira(t.amount_kobo)}</td>
                <td><span className={`status-dot ${t.status === 'confirmed' ? 'active' : 'disabled'}`} />{STATUS_LABEL[t.status] || t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {buyOpen && (
        <div className="modal-overlay" onMouseDown={() => setBuyOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Buy seat credits</h2>
              <button className="iconbtn dark" onClick={() => setBuyOpen(false)} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>How many credits?</label>
                <select className="select" value={credits} onChange={(e) => setCredits(Number(e.target.value))}>
                  {CREDIT_OPTIONS.map((n) => <option key={n} value={n}>{n} credit{n === 1 ? '' : 's'} — {naira(n * seatKobo)}</option>)}
                </select>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-2)' }}>We'll generate a payment reference — send it to us on WhatsApp and your credits land the same day once confirmed.</p>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setBuyOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={buy} disabled={busy}>{busy ? <span className="spinner" /> : 'Generate reference'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>}
    </AppLayout>
  );
}
