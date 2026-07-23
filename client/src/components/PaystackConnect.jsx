// Self-serve merchant Paystack connect — an org admin pastes their own keys
// to turn on card payments for their store checkout AND their invoice
// pay-links. The secret goes straight to the server (validated against
// Paystack, stored where the browser can never read it). Money settles into
// the merchant's own bank; Collarone never holds it.
import { useEffect, useState } from 'react';
import { getAccessToken } from '../api/client.ts';

const call = async (payload) => {
  const r = await fetch('/api/merchant-paystack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken() || ''}` },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'Something went wrong.');
  return d;
};

export default function PaystackConnect({ flash, isAdmin }) {
  const [enabled, setEnabled] = useState(false);
  const [publicKey, setPublicKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ publicKey: '', secretKey: '' });
  const [busy, setBusy] = useState(false);

  const load = () => call({ action: 'status' }).then((d) => { setEnabled(d.enabled); setPublicKey(d.publicKey || ''); }).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const connect = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await call({ action: 'connect', publicKey: form.publicKey.trim(), secretKey: form.secretKey.trim() });
      flash('Card payments are on — money settles straight to your bank.');
      setForm({ publicKey: '', secretKey: '' }); setOpen(false); load();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true);
    try { await call({ action: 'disconnect' }); flash('Card payments switched off.'); load(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  if (loading) return null;

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', margin: '16px 0', background: 'var(--surface-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 13.5, fontWeight: 650 }}>Card payments</span>
        <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 100, padding: '1px 9px', background: enabled ? '#dff6dd' : 'var(--surface)', color: enabled ? '#12833F' : 'var(--text-2)', border: enabled ? 'none' : '1px solid var(--line)' }}>{enabled ? 'ON' : 'Off'}</span>
      </div>

      {enabled ? (
        <>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px', lineHeight: 1.6 }}>
            Customers can pay by card, bank or USSD — on your store checkout and on every invoice pay-link — through your own Paystack account{publicKey ? ` (${publicKey.slice(0, 12)}…)` : ''}. Money settles straight to your bank; paid orders and invoices confirm themselves.
          </p>
          {isAdmin && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={disconnect}>Turn off / change keys</button>}
        </>
      ) : !isAdmin ? (
        <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>Card payments aren’t connected yet. Your workspace admin can switch them on under Website → Settings.</p>
      ) : !open ? (
        <>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px', lineHeight: 1.6 }}>
            Take card, bank and USSD payments — on your store and your invoices — through your <strong>own</strong> Paystack account, at no extra Collarone charge. Money goes straight to your bank; we never hold it.
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>Connect Paystack</button>
        </>
      ) : (
        <form onSubmit={connect}>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 10px', lineHeight: 1.6 }}>
            Don’t have Paystack? Create a free account at <a href="https://paystack.com" target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>paystack.com</a>, then copy your API keys from <strong>Settings → API Keys &amp; Webhooks</strong>.
          </p>
          <div className="field"><label>Public key</label>
            <input className="input" value={form.publicKey} onChange={(e) => setForm((s) => ({ ...s, publicKey: e.target.value }))} placeholder="pk_live_…" autoComplete="off" required />
          </div>
          <div className="field"><label>Secret key</label>
            <input className="input" type="password" value={form.secretKey} onChange={(e) => setForm((s) => ({ ...s, secretKey: e.target.value }))} placeholder="sk_live_…" autoComplete="off" required />
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: '0 0 12px' }}>Your secret key is stored securely on the server and never shown in the browser again.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Verifying…' : 'Verify & connect'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
