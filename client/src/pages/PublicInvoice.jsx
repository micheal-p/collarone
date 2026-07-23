// Public invoice page — /inv/:token. What a customer sees when a business
// WhatsApps them their invoice link: the invoice itself, how to pay by
// transfer, and (when the merchant's own Paystack is connected) a card
// "pay now" button. No account, no login — the token IS the access.
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';

const money = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

export default function PublicInvoice() {
  const { token } = useParams();
  const [params, setParams] = useSearchParams();
  const [inv, setInv] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | missing
  const [payBusy, setPayBusy] = useState(false);
  const [payMsg, setPayMsg] = useState('');
  const [email, setEmail] = useState('');
  const [askEmail, setAskEmail] = useState(false);

  const load = () => supabase.rpc('get_public_invoice', { p_token: token })
    .then(({ data }) => { if (data) { setInv(data); setState('ready'); } else setState('missing'); })
    .catch(() => setState('missing'));

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  // returning from Paystack: ?payref=… → verify server-side, then reload
  useEffect(() => {
    const ref = params.get('payref') || params.get('reference') || params.get('trxref');
    if (!ref || state !== 'ready') return;
    (async () => {
      setPayMsg('Confirming your payment…');
      try {
        const r = await fetch('/api/invoice-pay', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verify', token, reference: ref }),
        });
        const d = await r.json();
        setPayMsg(d.paid ? 'Payment received — thank you!' : 'We could not confirm that payment. If you were debited, contact the business.');
        if (d.paid) load();
      } catch { setPayMsg('We could not confirm that payment right now.'); }
      params.delete('payref'); params.delete('reference'); params.delete('trxref');
      setParams(params, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const outstanding = useMemo(() => inv ? Math.max(0, Number(inv.total) - Number(inv.amount_paid || 0)) : 0, [inv]);
  const org = inv?.org || {};
  const accent = org.accent || '#0A0E1A';

  const startCardPay = async (e) => {
    e?.preventDefault?.();
    if (!email.trim() && askEmail) return;
    setPayBusy(true); setPayMsg('');
    try {
      const r = await fetch('/api/invoice-pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'init', token, email: email.trim() }),
      });
      const d = await r.json();
      if (d.authorizationUrl) { window.location.href = d.authorizationUrl; return; }
      if (/email/i.test(d.message || '')) { setAskEmail(true); setPayMsg('Enter your email to continue to card payment.'); }
      else setPayMsg(d.message || 'Could not start the card payment.');
    } catch { setPayMsg('Could not start the card payment.'); }
    setPayBusy(false);
  };

  if (state === 'loading') return <div style={S.page}><div style={S.card}><p style={{ textAlign: 'center', color: '#667' }}>Loading invoice…</p></div></div>;
  if (state === 'missing') return (
    <div style={S.page}><div style={S.card}>
      <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Invoice not found</h1>
      <p style={{ color: '#667', fontSize: 14, margin: 0 }}>This link is invalid, or the invoice was withdrawn. Ask the business to resend it.</p>
    </div></div>
  );

  const paid = outstanding <= 0;
  const wa = String(org.phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^0/, '234');

  return (
    <div style={S.page}>
      <div style={{ ...S.card, borderTop: `4px solid ${accent}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            {org.logo_url && <img src={org.logo_url} alt="" style={{ maxHeight: 48, maxWidth: 160, objectFit: 'contain', marginBottom: 8, display: 'block' }} />}
            <div style={{ fontSize: 18, fontWeight: 750 }}>{org.name}</div>
            {org.tagline && <div style={{ fontSize: 12.5, color: '#667', fontStyle: 'italic' }}>{org.tagline}</div>}
            <div style={{ fontSize: 12.5, color: '#667', marginTop: 4 }}>{[org.address, org.phone, org.email].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent }}>Invoice</div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#556' }}>{inv.doc_no}</div>
            <div style={{ fontSize: 12.5, color: '#667' }}>{fmtDate(inv.issued_at)}</div>
            {inv.due_date && <div style={{ fontSize: 12.5, color: '#667' }}>Due {fmtDate(inv.due_date)}</div>}
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #e6e4de', margin: '18px 0' }} />

        <div style={{ fontSize: 13.5, marginBottom: 14 }}>Billed to <strong>{inv.party_name || 'Customer'}</strong></div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#667', fontSize: 12 }}>
              <th style={S.th}>Description</th><th style={{ ...S.th, width: 50 }}>Qty</th>
              <th style={{ ...S.th, width: 100, textAlign: 'right' }}>Unit price</th>
              <th style={{ ...S.th, width: 100, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(inv.items || []).map((l, i) => (
              <tr key={i}>
                <td style={S.td}>{l.description}</td>
                <td style={S.td}>{l.qty}</td>
                <td style={{ ...S.td, textAlign: 'right' }}>{money(l.unit_price)}</td>
                <td style={{ ...S.td, textAlign: 'right' }}>{money((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ textAlign: 'right', marginTop: 14, fontSize: 14, lineHeight: 1.8 }}>
          <div style={{ color: '#556' }}>Subtotal {money(inv.subtotal)}</div>
          <div style={{ color: '#556' }}>VAT ({((inv.vat_rate || 0) * 100).toFixed(1)}%) {money(inv.vat_amount)}</div>
          {Number(inv.amount_paid) > 0 && <div style={{ color: '#1a6a1a' }}>Paid {money(inv.amount_paid)}</div>}
          <div style={{ fontWeight: 800, fontSize: 18 }}>{paid ? 'Paid in full' : <>Balance due {money(outstanding)}</>}</div>
        </div>

        {payMsg && <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: /received|thank/i.test(payMsg) ? '#dff6dd' : '#fff4ce', fontSize: 13.5 }}>{payMsg}</div>}

        {!paid && (
          <div style={{ marginTop: 20, borderTop: '1px solid #e6e4de', paddingTop: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#556', marginBottom: 10 }}>How to pay</div>
            {inv.payment_instructions && (
              <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', background: '#faf9f5', border: '1px solid #eceae2', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>{inv.payment_instructions}</div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {inv.card_enabled && !askEmail && (
                <button onClick={startCardPay} disabled={payBusy} style={{ ...S.btn, background: accent, color: '#fff' }}>
                  {payBusy ? 'Starting…' : `Pay ${money(outstanding)} by card`}
                </button>
              )}
              {inv.card_enabled && askEmail && (
                <form onSubmit={startCardPay} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com"
                    style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #d8d5cc', fontSize: 14 }} />
                  <button disabled={payBusy} style={{ ...S.btn, background: accent, color: '#fff' }}>{payBusy ? 'Starting…' : 'Continue to card payment'}</button>
                </form>
              )}
              {wa && (
                <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hello, I have a question about invoice ${inv.doc_no}.`)}`} target="_blank" rel="noreferrer"
                  style={{ ...S.btn, background: '#E6F8ED', color: '#12833F' }}>Message us on WhatsApp</a>
              )}
            </div>
            {inv.card_enabled && (
              <p style={{ fontSize: 12, color: '#889', marginTop: 14 }}>
                Card payments are processed by Paystack directly into {org.name}'s account. Collarone provides the software and never holds the money.
              </p>
            )}
          </div>
        )}

        {inv.notes && <p style={{ fontSize: 13, color: '#667', marginTop: 18 }}>{inv.notes}</p>}
      </div>
      <p style={{ textAlign: 'center', fontSize: 12, color: '#99a', margin: '18px 0' }}>
        Invoice powered by <a href="/" style={{ color: 'inherit', fontWeight: 600 }}>Collarone</a>
      </p>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', background: '#F1EFE9', padding: 'clamp(16px, 4vw, 48px) 16px', fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif", color: '#14171f' },
  card: { maxWidth: 680, margin: '0 auto', background: '#fff', borderRadius: 14, padding: 'clamp(20px, 4vw, 36px)', boxShadow: '0 10px 40px rgba(10,14,26,0.08)' },
  th: { padding: '8px 6px', borderBottom: '1.5px solid #14171f', fontWeight: 700 },
  td: { padding: '9px 6px', borderBottom: '1px solid #eee' },
  btn: { display: 'inline-flex', alignItems: 'center', padding: '11px 20px', borderRadius: 100, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' },
};
