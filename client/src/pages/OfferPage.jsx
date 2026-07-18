import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DEMO } from '../api/client.js';

// Public offer-acceptance page — the private link HR shares with a candidate.
// No account, no navigation chrome: the offer, the company's identity, and
// two buttons. The token only resolves while the offer is 'sent'.
const fmtN = (n) => `₦${Number(n).toLocaleString('en-NG')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export default function OfferPage() {
  const { token } = useParams();
  const [offer, setOffer] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | missing | done
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (DEMO) { setState('missing'); return; }
    import('../lib/supabaseClient.js').then(({ supabase }) =>
      supabase.rpc('public_get_offer', { p_token: token })
    ).then(({ data, error: e }) => {
      if (e || !data) { setState('missing'); return; }
      setOffer(data);
      setState(data.status === 'sent' ? 'ready' : 'done');
    }).catch(() => setState('missing'));
  }, [token]);

  const decide = async (accept) => {
    setBusy(true); setError('');
    try {
      const { supabase } = await import('../lib/supabaseClient.js');
      const { data, error: e } = await supabase.rpc('public_decide_offer', { p_token: token, p_accept: accept });
      if (e) throw new Error(e.message);
      setOffer((o) => ({ ...o, status: data.status }));
      setState('done');
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  };

  if (state === 'loading') return <div className="full-center"><div className="boot-spinner" /></div>;

  if (state === 'missing') {
    return (
      <div className="full-center" style={{ textAlign: 'center', padding: 24 }}>
        <h1 style={{ fontSize: 20 }}>This offer link isn't available</h1>
        <p style={{ color: 'var(--text-2)', maxWidth: 420 }}>It may have been withdrawn or already decided. Contact the company that sent it to you.</p>
      </div>
    );
  }

  const accent = offer.themeColor || '#FF5B1F';
  const accepted = offer.status === 'accepted';

  return (
    <div style={{ minHeight: '100vh', background: '#F6F5F1', display: 'grid', placeItems: 'center', padding: '32px 16px', fontFamily: '-apple-system, "Segoe UI", sans-serif' }}>
      <div style={{ width: 'min(560px, 100%)', background: '#fff', borderRadius: 18, border: '1px solid #E6E3DB', boxShadow: '0 24px 70px rgba(20,18,12,0.10)', overflow: 'hidden' }}>
        <div style={{ background: '#14161C', color: '#fff', padding: '26px 30px', display: 'flex', alignItems: 'center', gap: 14 }}>
          {offer.logoUrl && <img src={offer.logoUrl} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', background: '#fff' }} />}
          <div>
            <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>Offer of employment</div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{offer.orgName}</div>
          </div>
        </div>

        <div style={{ padding: '28px 30px' }}>
          {state === 'done' ? (
            <div style={{ textAlign: 'center', padding: '18px 0' }}>
              <div style={{ width: 54, height: 54, borderRadius: '50%', margin: '0 auto 14px', display: 'grid', placeItems: 'center', background: accepted ? '#E8F6EC' : '#F6ECEA', color: accepted ? '#1A7A3E' : '#A03232' }}>
                {accepted
                  ? <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{accepted ? 'Offer accepted' : 'Offer declined'}</div>
              <p style={{ fontSize: 14, color: '#5C5F66', margin: 0, lineHeight: 1.6 }}>
                {accepted
                  ? <>Congratulations, {offer.candidateName.split(' ')[0]} — {offer.orgName} has been notified and will be in touch about your start.</>
                  : <>{offer.orgName} has been notified of your decision. Thank you for your time.</>}
              </p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 15, lineHeight: 1.7, margin: '0 0 20px' }}>
                Dear <strong>{offer.candidateName}</strong>, {offer.orgName} is pleased to offer you the position of <strong>{offer.roleTitle}</strong>.
              </p>
              <div style={{ border: '1px solid #ECEAE3', borderRadius: 12, marginBottom: 18 }}>
                {[
                  offer.salary != null && ['Annual salary', fmtN(offer.salary)],
                  offer.startDate && ['Proposed start date', fmtDate(offer.startDate)],
                ].filter(Boolean).map(([k, v], i) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderTop: i ? '1px solid #F2F0EA' : 'none', fontSize: 14 }}>
                    <span style={{ color: '#5C5F66' }}>{k}</span><strong>{v}</strong>
                  </div>
                ))}
              </div>
              {offer.note && <p style={{ fontSize: 14, color: '#454852', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: '0 0 22px' }}>{offer.note}</p>}
              {error && <p style={{ color: '#A03232', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button disabled={busy} onClick={() => decide(true)}
                  style={{ flex: 1, minWidth: 160, border: 'none', borderRadius: 10, padding: '14px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer', background: accent, color: '#fff', opacity: busy ? 0.7 : 1 }}>
                  Accept this offer
                </button>
                <button disabled={busy} onClick={() => { if (window.confirm('Decline this offer? This cannot be undone.')) decide(false); }}
                  style={{ flex: '0 0 auto', border: '1px solid #DDD9CF', borderRadius: 10, padding: '14px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', background: '#fff', color: '#454852' }}>
                  Decline
                </button>
              </div>
              <p style={{ fontSize: 11.5, color: '#9A9CA3', marginTop: 14, textAlign: 'center' }}>
                Accepting here notifies {offer.orgName} immediately. This link is private to you.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
