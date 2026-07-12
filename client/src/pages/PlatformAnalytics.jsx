import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { apiGet } from '../api/client.js';
import PlatformShell from '../components/PlatformShell.jsx';

const glass = { background: 'rgba(20,22,30,0.55)', border: '1px solid rgba(244,241,234,0.10)', borderRadius: 16, backdropFilter: 'blur(14px)' };
const DAY_MS = 24 * 60 * 60 * 1000;
const naira = (kobo) => `₦${(kobo / 100).toLocaleString()}`;

// Fixed categorical order (never reassigned by rank) — validated for CVD safety
// against this app's dark glass-card surface via the dataviz skill's validator.
const CAT = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926'];
const COUNTRY_ORDER = ['NG', 'GH', 'KE', 'ZA', 'EG', 'GB', 'US'];
const COUNTRY_FLAG = { NG: '🇳🇬', GH: '🇬🇭', KE: '🇰🇪', ZA: '🇿🇦', EG: '🇪🇬', GB: '🇬🇧', US: '🇺🇸' };
const PLAN_ORDER = ['startup', 'standard', 'enterprise'];
const PLAN_LABEL = { startup: 'Startup', standard: 'Standard', enterprise: 'Enterprise' };
const PLAN_SHADE = ['rgba(57,135,229,0.4)', 'rgba(57,135,229,0.7)', 'rgba(57,135,229,1)']; // ordinal ramp: tier is ordered, not arbitrary categories

function useContainerWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => { if (entries[0]) setW(entries[0].contentRect.width); });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function StatTile({ label, value, accent, sub }) {
  return (
    <div style={{ ...glass, padding: '18px 20px' }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(244,241,234,0.5)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: accent || '#F4F1EA' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'rgba(244,241,234,0.4)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// Cumulative signup growth. A single series needs no legend — the title names it.
// Ships a crosshair + tooltip per the dataviz skill's interaction spec for line/area.
function GrowthChart({ orgs, reduce }) {
  const [containerRef, width] = useContainerWidth();
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 8, left: 34 };
  const [hover, setHover] = useState(null);

  const points = useMemo(() => {
    if (orgs.length < 2) return [];
    const sorted = orgs.map((o) => new Date(o.created_at).getTime()).sort((a, b) => a - b);
    const first = sorted[0];
    const last = Math.max(Date.now(), sorted[sorted.length - 1]);
    const days = Math.max(1, Math.ceil((last - first) / DAY_MS));
    const pts = [];
    for (let d = 0; d <= days; d++) {
      const t = first + d * DAY_MS;
      pts.push({ t, count: sorted.filter((s) => s <= t).length });
    }
    if (pts[pts.length - 1].t < last) pts.push({ t: last, count: sorted.length });
    return pts;
  }, [orgs]);

  if (points.length === 0) {
    return (
      <div style={{ ...glass, padding: 28, textAlign: 'center', color: 'rgba(244,241,234,0.45)', fontSize: 13.5 }}>
        Not enough signups yet to chart growth — check back once a few more organizations join.
      </div>
    );
  }

  const minT = points[0].t, maxT = points[points.length - 1].t;
  const maxCount = Math.max(1, ...points.map((p) => p.count));
  const plotW = Math.max(1, width - padding.left - padding.right);
  const plotH = height - padding.top - padding.bottom;
  const x = (t) => padding.left + ((t - minT) / (maxT - minT || 1)) * plotW;
  const y = (c) => padding.top + plotH - (c / maxCount) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.count).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${x(maxT).toFixed(1)} ${padding.top + plotH} L ${x(minT).toFixed(1)} ${padding.top + plotH} Z`;
  const yTicks = [0, 0.5, 1].map((f) => Math.round(f * maxCount));

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const t = minT + ((mx - padding.left) / plotW) * (maxT - minT);
    let nearest = points[0];
    for (const p of points) if (Math.abs(p.t - t) < Math.abs(nearest.t - t)) nearest = p;
    setHover(nearest);
  };

  return (
    <div style={{ ...glass, padding: 18, position: 'relative' }} ref={containerRef}>
      <svg width={width} height={height} onMouseMove={handleMove} onMouseLeave={() => setHover(null)} style={{ display: 'block', cursor: 'crosshair' }}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={padding.left} x2={width - padding.right} y1={y(v)} y2={y(v)} stroke="rgba(244,241,234,0.08)" strokeWidth={1} />
            <text x={padding.left - 8} y={y(v) + 4} textAnchor="end" fontSize={10.5} fill="rgba(244,241,234,0.4)">{v}</text>
          </g>
        ))}
        <motion.path initial={reduce ? {} : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} d={areaPath} fill="rgba(57,135,229,0.14)" stroke="none" />
        <motion.path initial={reduce ? {} : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: [0.2, 0.7, 0.3, 1] }}
          d={linePath} fill="none" stroke="#3987e5" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(maxT)} cy={y(points[points.length - 1].count)} r={4} fill="#3987e5" stroke="#14161c" strokeWidth={2} />
        {hover && (
          <>
            <line x1={x(hover.t)} x2={x(hover.t)} y1={padding.top} y2={padding.top + plotH} stroke="rgba(244,241,234,0.25)" strokeWidth={1} />
            <circle cx={x(hover.t)} cy={y(hover.count)} r={4.5} fill="#3987e5" stroke="#fff" strokeWidth={1.5} />
          </>
        )}
      </svg>
      {hover && (
        <div style={{
          position: 'absolute', top: 14, pointerEvents: 'none',
          left: Math.min(Math.max(x(hover.t) - 55, padding.left), width - 140),
          background: '#14161c', border: '1px solid rgba(244,241,234,0.15)', borderRadius: 8, padding: '7px 11px', fontSize: 12, whiteSpace: 'nowrap',
        }}>
          <div style={{ fontWeight: 700, color: '#F4F1EA' }}>{hover.count} organization{hover.count === 1 ? '' : 's'}</div>
          <div style={{ color: 'rgba(244,241,234,0.5)', marginTop: 2 }}>{new Date(hover.t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        </div>
      )}
      <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(244,241,234,0.35)', marginTop: 6 }}>
        {new Date(minT).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} → {new Date(maxT).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
      </div>
    </div>
  );
}

// Direct-labeled always (category name + value never hidden) — the mitigation
// this palette's CVD floor-band warning requires, per the dataviz skill.
function BarRows({ rows, reduce }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r, i) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div title={r.label} style={{ width: 130, fontSize: 12.5, color: 'rgba(244,241,234,0.75)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.icon && <span>{r.icon}</span>}{r.label}
          </div>
          <div style={{ flex: 1, height: 10, background: 'rgba(244,241,234,0.06)', borderRadius: 5, overflow: 'hidden' }}>
            <motion.div initial={reduce ? { width: `${(r.value / max) * 100}%` } : { width: 0 }} animate={{ width: `${(r.value / max) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.06, ease: [0.2, 0.7, 0.3, 1] }}
              style={{ height: '100%', background: r.color, borderRadius: 5 }} />
          </div>
          <div style={{ width: 60, textAlign: 'right', fontSize: 12.5, fontFamily: 'ui-monospace, monospace', color: '#F4F1EA', flexShrink: 0 }}>
            {r.value} <span style={{ color: 'rgba(244,241,234,0.4)' }}>· {Math.round((r.value / rows.reduce((s, x) => s + x.value, 0)) * 100)}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.02em', margin: '0 0 14px', color: '#F4F1EA' }}>{title}</h2>
      {children}
    </div>
  );
}

export default function PlatformAnalytics() {
  const reduce = useReducedMotion();
  const [orgs, setOrgs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [pageViews, setPageViews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiGet('/platform/organizations'), apiGet('/platform/profiles'), apiGet('/platform/transactions'), apiGet('/platform/page-views')])
      .then(([o, p, t, v]) => { setOrgs(o.organizations); setProfiles(p.profiles); setTransactions(t.transactions); setPageViews(v.pageViews); })
      .finally(() => setLoading(false));
  }, []);

  // Fixed-order categorical rows from a { code: count } map — shared by the
  // org-signup and page-visitor country breakdowns so their color slots mean
  // the same thing (identity, not rank) in both places.
  const countryBreakdown = (counts) => {
    const known = COUNTRY_ORDER.filter((c) => counts[c]).map((c, i) => ({ label: c, icon: COUNTRY_FLAG[c], value: counts[c], color: CAT[i % CAT.length] }));
    const otherCount = Object.keys(counts).filter((c) => !COUNTRY_ORDER.includes(c) && c !== 'XX').reduce((s, c) => s + counts[c], 0);
    if (otherCount > 0) known.push({ label: 'Other', icon: '🌍', value: otherCount, color: CAT[known.length % CAT.length] });
    return [...known].sort((a, b) => b.value - a.value);
  };

  const countryRows = useMemo(() => {
    const counts = {};
    orgs.forEach((o) => { const c = o.country || 'NG'; counts[c] = (counts[c] || 0) + 1; });
    return countryBreakdown(counts);
  }, [orgs]);

  const visitorCountryRows = useMemo(() => {
    const counts = {};
    pageViews.forEach((v) => { counts[v.country] = (counts[v.country] || 0) + 1; });
    return countryBreakdown(counts);
  }, [pageViews]);

  const visitorStats = useMemo(() => {
    const now = Date.now();
    const within = (h) => pageViews.filter((v) => now - new Date(v.created_at).getTime() < h * 60 * 60 * 1000).length;
    const byPath = {};
    pageViews.forEach((v) => { byPath[v.path] = (byPath[v.path] || 0) + 1; });
    const topPaths = Object.entries(byPath).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value], i) => ({ label, value, color: CAT[i % CAT.length] }));
    return { last24h: within(24), last7d: within(24 * 7), last30d: within(24 * 30), topPaths };
  }, [pageViews]);

  const planRows = useMemo(() => {
    const counts = {};
    orgs.forEach((o) => { counts[o.plan_tier] = (counts[o.plan_tier] || 0) + 1; });
    return PLAN_ORDER.filter((p) => counts[p]).map((p, i) => ({ label: PLAN_LABEL[p], value: counts[p], color: PLAN_SHADE[i] }));
  }, [orgs]);

  const revenue = useMemo(() => {
    const collected = transactions.filter((t) => t.status === 'confirmed').reduce((s, t) => s + t.amount_kobo, 0);
    const pending = transactions.filter((t) => t.status === 'pending').reduce((s, t) => s + t.amount_kobo, 0);
    return { collected, pending };
  }, [transactions]);

  const activeLast7d = useMemo(() => {
    const cutoff = Date.now() - 7 * DAY_MS;
    return profiles.filter((p) => p.last_login_at && new Date(p.last_login_at).getTime() > cutoff).length;
  }, [profiles]);

  const newLast30d = useMemo(() => {
    const cutoff = Date.now() - 30 * DAY_MS;
    return orgs.filter((o) => new Date(o.created_at).getTime() > cutoff).length;
  }, [orgs]);

  if (loading) {
    return (
      <PlatformShell title="Analytics">
        <p style={{ color: 'rgba(244,241,234,0.5)', fontSize: 13.5 }}>Loading…</p>
      </PlatformShell>
    );
  }

  return (
    <PlatformShell title="Analytics">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 32 }}>
        <StatTile label="Organizations" value={orgs.length} />
        <StatTile label="New in last 30 days" value={newLast30d} accent="#3987e5" />
        <StatTile label="Active users, 7d" value={activeLast7d} accent="#22c55e" sub={`of ${profiles.length} signed-up`} />
        <StatTile label="Revenue collected" value={naira(revenue.collected)} accent="#0ca30c" sub={revenue.pending > 0 ? `${naira(revenue.pending)} pending` : 'nothing pending'} />
      </div>

      <Panel title="SIGNUP GROWTH">
        <GrowthChart orgs={orgs} reduce={reduce} />
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 8 }}>
        <Panel title="WHERE THEY REGISTERED FROM">
          {countryRows.length === 0
            ? <p style={{ color: 'rgba(244,241,234,0.45)', fontSize: 13 }}>No organizations yet.</p>
            : <div style={{ ...glass, padding: 18 }}><BarRows rows={countryRows} reduce={reduce} /></div>}
        </Panel>
        <Panel title="PLAN MIX">
          {planRows.length === 0
            ? <p style={{ color: 'rgba(244,241,234,0.45)', fontSize: 13 }}>No organizations yet.</p>
            : <div style={{ ...glass, padding: 18 }}><BarRows rows={planRows} reduce={reduce} /></div>}
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
        <StatTile label="Page views, 24h" value={visitorStats.last24h} accent="#3987e5" />
        <StatTile label="Page views, 7d" value={visitorStats.last7d} />
        <StatTile label="Page views, 30d" value={visitorStats.last30d} />
      </div>
      <p style={{ fontSize: 12, color: 'rgba(244,241,234,0.4)', marginBottom: 16 }}>
        Anonymous — no cookies or visitor IDs, just a path, country and timestamp per page load.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <Panel title="VISITOR LOCATIONS">
          {visitorCountryRows.length === 0
            ? <p style={{ color: 'rgba(244,241,234,0.45)', fontSize: 13 }}>No page views recorded yet.</p>
            : <div style={{ ...glass, padding: 18 }}><BarRows rows={visitorCountryRows} reduce={reduce} /></div>}
        </Panel>
        <Panel title="MOST VISITED PAGES">
          {visitorStats.topPaths.length === 0
            ? <p style={{ color: 'rgba(244,241,234,0.45)', fontSize: 13 }}>No page views recorded yet.</p>
            : <div style={{ ...glass, padding: 18 }}><BarRows rows={visitorStats.topPaths} reduce={reduce} /></div>}
        </Panel>
      </div>
    </PlatformShell>
  );
}
