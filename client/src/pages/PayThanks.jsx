import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

// Return leg of a self-serve Paystack payment of Collarone's own fees.
// Verifies server-side; a confirmed activation fee means the workspace is
// already active by the time this renders.
export default function PayThanks() {
  const [params] = useSearchParams();
  const reference = params.get('reference') || '';
  const [state, setState] = useState('checking'); // checking | paid | unpaid
  const [type, setType] = useState('');

  useEffect(() => {
    if (!reference) { setState('unpaid'); return; }
    fetch('/api/platform-pay', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', reference }),
    })
      .then((r) => r.json())
      .then((d) => { setType(d.type || ''); setState(d.paid ? 'paid' : 'unpaid'); })
      .catch(() => setState('unpaid'));
  }, [reference]);

  const activation = type === 'activation_fee';
  return (
    <div className="full-center" style={{ textAlign: 'center', padding: 24 }}>
      {state === 'checking' ? <div className="boot-spinner" /> : (
        <div style={{ maxWidth: 440 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px', display: 'grid', placeItems: 'center', background: state === 'paid' ? '#E8F6EC' : '#FFF4E0', color: state === 'paid' ? '#1A7A3E' : '#8A5A00' }}>
            {state === 'paid'
              ? <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>}
          </div>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>
            {state === 'paid' ? (activation ? 'Payment confirmed — your workspace is active' : 'Payment confirmed') : "We couldn't confirm that payment yet"}
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: 14.5, lineHeight: 1.65 }}>
            {state === 'paid'
              ? (activation
                ? 'Everything is set up. Sign in with the admin email and password you created to open your dashboard.'
                : 'Your seat credits have been added — they’re ready to use right away.')
              : `If you completed the payment, it may still be settling — refresh this page in a minute, or WhatsApp us your reference (${reference || '—'}) on 0814 812 8551 and we’ll confirm it personally.`}
          </p>
          <div style={{ marginTop: 18 }}>
            <Link to="/login" className="btn btn-primary" style={{ textDecoration: 'none', padding: '10px 26px' }}>Sign in</Link>
          </div>
        </div>
      )}
    </div>
  );
}
