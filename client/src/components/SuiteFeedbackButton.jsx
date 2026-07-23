// Real-user feedback, asked inside the real product. A small "Feedback"
// button in every suite header; the modal takes a rating and — the part that
// matters — a free-text "what should we improve" that lands in Platform
// Control with the org and person attached.
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { DEMO } from '../api/client.ts';

export default function SuiteFeedbackButton({ suiteKey, suiteName }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (DEMO) return null; // demos have their own exit questionnaire

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return;
    setBusy(true);
    try {
      await supabase.from('app_feedback').insert({
        org_id: user?.org?.id, user_id: user?.id, suite_key: suiteKey,
        rating, comment: comment.slice(0, 2000),
      });
      setSent(true);
      setTimeout(() => { setOpen(false); setSent(false); setRating(0); setComment(''); }, 1500);
    } catch { setSent(true); setTimeout(() => setOpen(false), 1200); }
    setBusy(false);
  };

  const btn = { padding: '9px 14px', borderRadius: 100, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const on = { background: 'var(--ink, #0A0E1A)', color: '#fff', borderColor: 'var(--ink, #0A0E1A)' };

  return (
    <>
      <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5, marginLeft: 'auto' }} onClick={() => setOpen(true)}>
        Feedback
      </button>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'rgba(8,10,18,0.55)', display: 'grid', placeItems: 'center', padding: 16 }} onMouseDown={() => setOpen(false)}>
          <div style={{ width: 'min(430px, 100%)', background: 'var(--surface, #fff)', borderRadius: 16, padding: '24px 26px', boxShadow: '0 30px 80px rgba(0,0,0,0.4)' }} onMouseDown={(e) => e.stopPropagation()}>
            {sent ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontWeight: 750, fontSize: 16 }}>Thank you — this goes straight to the team.</div>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div style={{ fontWeight: 750, fontSize: 16.5, marginBottom: 4 }}>How is {suiteName || 'this suite'} working for you?</div>
                <p style={{ fontSize: 12.5, color: 'var(--text-2, #667)', margin: '0 0 14px' }}>Your note goes to the people who build Collarone — with your name on it, so we can follow up.</p>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" style={{ ...btn, width: 44, ...(rating === n ? on : {}) }} onClick={() => setRating(n)}>{n}</button>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-2, #889)', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}><span>Frustrating</span><span>Excellent</span></div>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
                  placeholder="What should we improve? What's missing? What's slowing you down?"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line, #d8d5cc)', fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical', marginBottom: 14 }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" style={btn} onClick={() => setOpen(false)}>Cancel</button>
                  <button type="submit" disabled={!rating || busy} style={{ ...btn, background: '#FF5B1F', borderColor: '#FF5B1F', color: '#fff', opacity: rating ? 1 : 0.5 }}>
                    {busy ? 'Sending…' : 'Send feedback'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
