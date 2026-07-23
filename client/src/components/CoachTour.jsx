// Reusable in-app product tour ("coach marks"). Give it steps — each with an
// optional CSS selector to spotlight — and it walks the user through them
// with a dimmed backdrop, a highlight ring around the real element, and a
// card explaining it. Keyboard: ← → to move, Esc to close.
//
//   <CoachTour open={open} onClose={...}
//     steps={[{ selector: '.lv-tab', title: 'Runs', body: '…' }, …]} />
//
// useCoachTour(storageKey) gives the open/start/close trio with the once-per-
// browser auto-open handled.
//
// Geometry: the spotlight follows the target LIVE — it re-measures on scroll
// and resize (not once, after a guessed delay), so wheel/touch scrolling or a
// slow smooth-scroll never leaves the ring stranded on the wrong element.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useCoachTour(storageKey) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (storageKey && !localStorage.getItem(storageKey)) {
      const t = setTimeout(() => setOpen(true), 700); // let the page settle first
      return () => clearTimeout(t);
    }
    return undefined;
  }, [storageKey]);
  const close = useCallback(() => {
    setOpen(false);
    if (storageKey) localStorage.setItem(storageKey, String(Date.now()));
  }, [storageKey]);
  return { open, start: () => setOpen(true), close };
}

export default function CoachTour({ steps, open, onClose }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const elRef = useRef(null);
  const count = steps?.length || 0;
  // Only the current step's selector matters to the geometry effect — keying
  // on this string (not the steps array identity) means a parent re-render
  // that hands us a fresh array literal won't re-trigger scrollIntoView.
  const selector = open ? steps?.[i]?.selector : undefined;

  useEffect(() => { if (open) setI(0); }, [open]);

  // Find the target, scroll it into view ONCE per step, then keep measuring it
  // live until the step changes or the tour closes.
  useEffect(() => {
    if (!open) return undefined;
    const el = selector ? document.querySelector(selector) : null;
    elRef.current = el;
    if (!el) { setRect(null); return undefined; }

    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    let raf = 0;
    const measure = () => {
      const e = elRef.current;
      if (!e) return;
      const r = e.getBoundingClientRect();
      // if the element got hidden/removed, drop the spotlight
      if (r.width === 0 && r.height === 0) { setRect(null); return; }
      setRect((prev) => (prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
        ? prev : { top: r.top, left: r.left, width: r.width, height: r.height }));
    };
    const onFrame = () => { measure(); raf = requestAnimationFrame(onFrame); };
    raf = requestAnimationFrame(onFrame); // track through the smooth scroll + any later movement
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true); // capture: catches nested scroll containers too
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [open, selector, i]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && i < count - 1) setI(i + 1);
      else if (e.key === 'ArrowLeft' && i > 0) setI(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, i, count, onClose]);

  if (!open || !count) return null;
  const step = steps[i];
  const last = i === count - 1;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const cardW = Math.min(380, vw - 32);

  // Place the card below the spotlight if there's room, else above it, else
  // centered — and cap its height so its buttons are always reachable.
  let cardStyle;
  if (rect) {
    const belowSpace = vh - (rect.top + rect.height);
    const putBelow = belowSpace > 220 || belowSpace > rect.top;
    cardStyle = {
      position: 'fixed',
      top: putBelow ? Math.min(rect.top + rect.height + 12, vh - 40) : undefined,
      bottom: putBelow ? undefined : Math.min(vh - rect.top + 12, vh - 40),
      left: Math.min(Math.max(12, rect.left), Math.max(12, vw - cardW - 12)),
    };
  } else {
    cardStyle = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300 }} role="dialog" aria-modal="true" aria-label="Product tour">
      {rect ? (
        <>
          <div style={{ position: 'fixed', left: 0, top: 0, right: 0, height: Math.max(0, rect.top - 6), background: 'rgba(8,10,18,0.62)' }} onClick={onClose} />
          <div style={{ position: 'fixed', left: 0, top: rect.top - 6, width: Math.max(0, rect.left - 6), height: rect.height + 12, background: 'rgba(8,10,18,0.62)' }} onClick={onClose} />
          <div style={{ position: 'fixed', left: rect.left + rect.width + 6, top: rect.top - 6, right: 0, height: rect.height + 12, background: 'rgba(8,10,18,0.62)' }} onClick={onClose} />
          <div style={{ position: 'fixed', left: 0, top: rect.top + rect.height + 6, right: 0, bottom: 0, background: 'rgba(8,10,18,0.62)' }} onClick={onClose} />
          <div style={{ position: 'fixed', top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, border: '2px solid var(--brand, #FF5B1F)', borderRadius: 10, boxShadow: '0 0 0 4px rgba(255,91,31,0.25)', pointerEvents: 'none' }} />
        </>
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,10,18,0.62)' }} onClick={onClose} />
      )}

      <div style={{ ...cardStyle, width: cardW, maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', background: 'var(--surface, #fff)', color: 'var(--text, #14161a)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,0.4)', padding: '18px 20px', zIndex: 301 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--brand, #FF5B1F)', marginBottom: 6 }}>
          Step {i + 1} of {count}
        </div>
        <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 6 }}>{step.title}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2, #555)' }}>{step.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={onClose}>Skip tour</button>
          <span style={{ flex: 1 }} />
          {i > 0 && <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => setI(i - 1)}>Back</button>}
          <button type="button" className="btn btn-primary" style={{ fontSize: 12.5 }} onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
