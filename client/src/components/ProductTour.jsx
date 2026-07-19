import { useEffect, useLayoutEffect, useState } from 'react';

/* =============================================================================
   ProductTour — first-run walkthrough with a skip pattern.
   Spotlights real elements (by [data-tour] target), one step at a time, with
   Next / Back / Skip and progress dots. Steps whose target isn't on screen
   are silently skipped (progressive disclosure: users only see what applies
   to them). Completion persists per user per tour version; replayable from
   Help via /?tour=1.
   ============================================================================= */

const doneKey = (userId, tourId = 'v1') => `collarone_tour_${tourId}_${userId || 'anon'}`;
export const tourSeen = (userId, tourId) => { try { return localStorage.getItem(doneKey(userId, tourId)) === 'done'; } catch { return true; } };
export const markTourDone = (userId, tourId) => { try { localStorage.setItem(doneKey(userId, tourId), 'done'); } catch { /* private mode */ } };

export default function ProductTour({ steps, userId, tourId = 'v1', onClose }) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);

  // resolve the current step to one whose target exists (or a centered step)
  const visible = steps.filter((s) => !s.target || document.querySelector(s.target));
  const step = visible[idx];

  useLayoutEffect(() => {
    if (!step) return;
    if (!step.target) { setRect(null); return; }
    const el = document.querySelector(step.target);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
  }, [idx, step?.target]); // eslint-disable-line

  useEffect(() => {
    const onResize = () => setIdx((i) => i); // re-measure via layout effect
    window.addEventListener('resize', onResize);
    const onKey = (e) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey); };
  }, []); // eslint-disable-line

  const finish = () => { markTourDone(userId, tourId); onClose(); };
  const next = () => (idx >= visible.length - 1 ? finish() : setIdx(idx + 1));

  if (!step) { finish(); return null; }

  // card placement: under the spotlight if there's room, else above, else center
  const cardW = 340;
  let cardStyle;
  if (!rect) {
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  } else {
    const below = rect.top + rect.height + 16;
    const top = below + 190 < window.innerHeight ? below : Math.max(16, rect.top - 200);
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - cardW - 16);
    cardStyle = { top, left };
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300 }} role="dialog" aria-label="Product tour">
      {/* spotlight: four shade panels around the target (giant box-shadow
          spreads get capped by some GPUs, so panels are the reliable way) */}
      {rect ? (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(0, rect.top), background: 'rgba(8,10,18,0.62)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: rect.top + rect.height, bottom: 0, background: 'rgba(8,10,18,0.62)' }} />
          <div style={{ position: 'absolute', left: 0, width: Math.max(0, rect.left), top: rect.top, height: rect.height, background: 'rgba(8,10,18,0.62)' }} />
          <div style={{ position: 'absolute', left: rect.left + rect.width, right: 0, top: rect.top, height: rect.height, background: 'rgba(8,10,18,0.62)' }} />
          <div style={{
            position: 'absolute', top: rect.top, left: rect.left, width: rect.width, height: rect.height,
            borderRadius: 12, border: '2px solid #FF5B1F', pointerEvents: 'none',
            transition: 'all .28s cubic-bezier(.2,.7,.3,1)',
          }} />
        </>
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(8, 10, 18, 0.62)' }} />
      )}

      <div style={{
        position: 'absolute', width: cardW, background: '#fff', color: '#14161C', borderRadius: 14,
        boxShadow: '0 24px 70px rgba(0,0,0,0.35)', padding: '18px 20px', ...cardStyle,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#E0500F', marginBottom: 6 }}>
          {idx + 1} of {visible.length}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{step.title}</div>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#454852', margin: 0 }}>{step.body}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 14 }}>
          {visible.map((_, i) => (
            <span key={i} style={{ width: i === idx ? 16 : 6, height: 6, borderRadius: 100, background: i === idx ? '#FF5B1F' : '#E4E1D8', transition: 'all .2s' }} />
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={finish}
            style={{ background: 'none', border: 'none', color: '#8A8D95', fontSize: 12.5, cursor: 'pointer', padding: '6px 8px', fontFamily: 'inherit' }}>
            Skip tour
          </button>
          {idx > 0 && (
            <button type="button" onClick={() => setIdx(idx - 1)}
              style={{ background: 'none', border: '1px solid #E4E1D8', borderRadius: 8, color: '#454852', fontSize: 12.5, cursor: 'pointer', padding: '7px 14px', fontFamily: 'inherit' }}>
              Back
            </button>
          )}
          <button type="button" onClick={next}
            style={{ background: '#FF5B1F', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '7px 16px', fontFamily: 'inherit' }}>
            {idx >= visible.length - 1 ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
