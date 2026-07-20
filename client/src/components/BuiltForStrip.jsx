import { motion } from 'framer-motion';

// Honest social-proof: instead of inventing customer logos (which backfires),
// this shows the KINDS of Nigerian businesses Collarone is built for — real
// categories, no false endorsements. Swap in real pilot logos (with consent)
// when they exist.
const S = 'currentColor';
const INDUSTRIES = [
  { label: 'Retail & fashion', icon: <><path d="M4 8h16l-1 12H5L4 8Z" /><path d="M8 8a4 4 0 0 1 8 0" /></> },
  { label: 'Pharmacy & health', icon: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" /></> },
  { label: 'Logistics', icon: <><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></> },
  { label: 'Agriculture', icon: <><path d="M12 21c0-6 3-10 8-11-1 6-4 9-8 11Z" /><path d="M12 21c0-6-3-10-8-11 1 6 4 9 8 11Z" /></> },
  { label: 'Salon & beauty', icon: <><circle cx="6" cy="7" r="2.4" /><circle cx="6" cy="17" r="2.4" /><path d="M8 8.5 20 17M8 15.5 20 7" /></> },
  { label: 'Food & restaurants', icon: <><path d="M6 3v8M6 11c-1.5 0-2-1-2-3V3M8 3v5M6 11v10" /><path d="M16 3c-2 0-3 3-3 6s1 3 3 3v9" /></> },
];

export default function BuiltForStrip() {
  return (
    <section className="cl-bf" aria-label="Businesses Collarone is built for">
      <div className="cl-wrap">
        <p className="cl-bf-eyebrow">Made for real Nigerian trade — not translated from abroad</p>
        <h2 className="cl-bf-h">Built for businesses like yours</h2>
        <div className="cl-bf-grid">
          {INDUSTRIES.map((it, i) => (
            <motion.div className="cl-bf-item" key={it.label}
              initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ duration: 0.45, delay: (i % 6) * 0.05 }}>
              <span className="cl-bf-ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={S} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg></span>
              {it.label}
            </motion.div>
          ))}
        </div>
        <p className="cl-bf-sub">Card &amp; transfer payments · An isolated workspace per company · Priced in naira, rate locked at sign-up</p>
      </div>
    </section>
  );
}
