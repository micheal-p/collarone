// Reusable in-app product tour ("coach marks"). Give it steps — each with an
// optional CSS selector to spotlight — and it walks the user through them
// with a dimmed backdrop, a highlight ring around the real element, and a
// card explaining it. Keyboard: ← → to move, Esc to close.
//
//   <CoachTour
//     storageKey="tour-payroll-v1"     // auto-opens once per browser; bump to reshow
//     open={open} onClose={...}
//     steps={[{ selector: '.lv-tab', title: 'Runs', body: '…' }, …]}
//   />
//
// useCoachTour(storageKey) gives the open/setOpen pair with the once-only
// auto-open behaviour handled.
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

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

  useEffect(() => { if (open) setI(0); }, [open]);

  // find + measure the spotlighted element for the current step
  useLayoutEffect(() => {
    if (!open) return undefined;
    const step = steps[i];
    const el = step?.selector ? document.querySelector(step.selector) : null;
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const measure = () => {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      };
      const t = setTimeout(measure, 320); // after the smooth scroll
      window.addEventListener('resize', measure);
      return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
    }
    setRect(null);
    return undefined;
  }, [open, i, steps]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && i < steps.length - 1) setI(i + 1);
      if (e.key === 'ArrowLeft' && i > 0) setI(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, i, steps.length, onClose]);

  if (!open || !steps.length) return null;
  const step = steps[i];
  const last = i === steps.length - 1;

  // card position: under the spotlight when there's room, else centered
  const cardStyle = rect
    ? {
        position: 'fixed',
        top: Math.min(rect.top + rect.height + 14, window.innerHeight - 230),
        left: Math.min(Math.max(16, rect.left), Math.max(16, window.innerWidth - 396)),
      }
    : { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300 }}>
      {/* dimmer — four panels around the spotlight so the target stays bright */}
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

      <div style={{ ...cardStyle, width: 'min(380px, calc(100vw - 32px))', background: 'var(--surface, #fff)', color: 'var(--text, #14161a)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,0.4)', padding: '18px 20px', zIndex: 301 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--brand, #FF5B1F)', marginBottom: 6 }}>
          Step {i + 1} of {steps.length}
        </div>
        <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 6 }}>{step.title}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2, #555)' }}>{step.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={onClose}>Skip tour</button>
          <span style={{ flex: 1 }} />
          {i > 0 && <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn btn-primary" style={{ fontSize: 12.5 }} onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
