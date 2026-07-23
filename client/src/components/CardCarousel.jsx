import { Children, useCallback, useEffect, useRef, useState } from 'react';

// On phones, turns a row of equal cards into a swipeable, scroll-snapped
// carousel with pagination dots that track the swipe position (and jump on tap).
// On desktop it's a no-op: the track keeps the grid class it's handed, so the
// cards render as the normal grid and the dots stay hidden (CSS-gated).
export default function CardCarousel({ children, className = '', dotLabel = 'card' }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  const count = Children.count(children);

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el || !el.children.length) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let idx = 0, best = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const c = el.children[i];
      const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
      if (d < best) { best = d; idx = i; }
    }
    setActive(idx);
  }, []);

  useEffect(() => { sync(); }, [sync]);

  const goTo = (i) => {
    const el = trackRef.current;
    const ch = el?.children[i];
    const first = el?.children[0];
    if (!el || !ch || !first) return;
    el.scrollTo({ left: ch.offsetLeft - first.offsetLeft, behavior: 'smooth' });
  };

  return (
    <div className="cl-carousel">
      <div className={`cl-carousel-track ${className}`} ref={trackRef} onScroll={sync}>
        {children}
      </div>
      {count > 1 && (
        <div className="cl-carousel-dots" role="tablist" aria-label={`${dotLabel} navigation`}>
          {Array.from({ length: count }).map((_, i) => (
            <button
              key={i}
              type="button"
              className={`cl-carousel-dot${i === active ? ' on' : ''}`}
              aria-label={`Go to ${dotLabel} ${i + 1}`}
              aria-current={i === active ? 'true' : undefined}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
