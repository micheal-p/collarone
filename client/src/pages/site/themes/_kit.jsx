import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Shared low-level primitives for folder themes (motion + fonts only — each
// theme still owns its full composition and CSS).

export const rise = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } } };

export function Reveal({ children, className, stagger = 0.08 }) {
  return (
    <motion.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}>
      {children}
    </motion.div>
  );
}

export function Magnetic({ children, strength = 0.3 }) {
  const ref = useRef(null); const reduce = useReducedMotion();
  const move = (e) => { if (reduce || !ref.current) return; const r = ref.current.getBoundingClientRect(); ref.current.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px,${(e.clientY - r.top - r.height / 2) * strength}px)`; };
  const reset = () => { if (ref.current) ref.current.style.transform = ''; };
  return <span ref={ref} onMouseMove={move} onMouseLeave={reset} style={{ display: 'inline-block', transition: 'transform .3s cubic-bezier(.2,.7,.2,1)' }}>{children}</span>;
}

export function useFonts(id, href) {
  useEffect(() => {
    if (document.getElementById(id)) return;
    const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }, [id, href]);
}

// pull *asterisked* words into an accent <em>
export const emph = (s) => ({ __html: String(s || '').replace(/\*(.+?)\*/g, '<em>$1</em>') });
