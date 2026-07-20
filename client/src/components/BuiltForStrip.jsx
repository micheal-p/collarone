import { motion } from 'framer-motion';

// Honest social-proof: the KINDS of Nigerian organizations Collarone serves —
// deliberately spanning a market stall to a corporate HQ, no fabricated
// customer logos. Plus the modular message: take all 16 suites, or just one.
const S = 'currentColor';
const INDUSTRIES = [
  { label: 'Retail & commerce', icon: <><path d="M4 8h16l-1 12H5L4 8Z" /><path d="M8 8a4 4 0 0 1 8 0" /></> },
  { label: 'Healthcare & pharma', icon: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" /></> },
  { label: 'Logistics & supply', icon: <><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></> },
  { label: 'Professional firms', icon: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></> },
  { label: 'Manufacturing', icon: <><path d="M3 21V10l6 4V10l6 4V7h6v14z" /><path d="M8 21v-3M14 21v-3M18 21v-3" /></> },
  { label: 'Agriculture', icon: <><path d="M12 21c0-6 3-10 8-11-1 6-4 9-8 11Z" /><path d="M12 21c0-6-3-10-8-11 1 6 4 9 8 11Z" /></> },
];

export default function BuiltForStrip() {
  return (
    <section className="cl-bf" aria-label="Who Collarone is built for">
      <div className="cl-wrap">
        <p className="cl-bf-eyebrow">Made for Nigerian organizations of every size</p>
        <h2 className="cl-bf-h">From a corner shop to a corporate HQ</h2>
        <div className="cl-bf-grid">
          {INDUSTRIES.map((it, i) => (
            <motion.div className="cl-bf-item" key={it.label}
              initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ duration: 0.45, delay: (i % 6) * 0.05 }}>
              <span className="cl-bf-ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={S} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg></span>
              {it.label}
            </motion.div>
          ))}
        </div>
        <p className="cl-bf-sub">Run all 16 suites — or just one. Plenty of companies start with only <strong>HR</strong> or <strong>payroll</strong> and switch the rest on when they need them.</p>
      </div>
    </section>
  );
}
