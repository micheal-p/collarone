import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGet } from '../api/client.js';
import PlatformShell from '../components/PlatformShell.jsx';

const DAY_MS = 24 * 60 * 60 * 1000;
const naira = (kobo) => `₦${(kobo / 100).toLocaleString()}`;

// Fixed categorical order (never reassigned by rank) — validated for CVD safety
// against this app's dark surface via the dataviz skill's validator.
const CAT = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926'];
const COUNTRY_ORDER = ['NG', 'GH', 'KE', 'ZA', 'EG', 'GB', 'US'];
const COUNTRY_NAME = { NG: 'Nigeria', GH: 'Ghana', KE: 'Kenya', ZA: 'South Africa', EG: 'Egypt', GB: 'United Kingdom', US: 'United States' };
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

function SectionHead({ title, note }) {
  return (
    <div className="pc-sec-head">
      <h2 className="pc-sec-title">{title}</h2>
      {note && <span className="pc-sec-count">{note}</span>}
    </div>
  );
}

// Cumulative signup growth. A single series needs no legend — the title names it.
// Ships a crosshair + tooltip per the dataviz skill's interaction spec for line/area.
function GrowthChart({ orgs }) {
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
      <div className="pc-panel" style={{ padding: 24, textAlign: 'center', color: 'var(--faint)', fontSize: 13 }}>
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
    <div className="pc-panel" style={{ padding: 16, position: 'relative' }} ref={containerRef}>
      <svg width={width} height={height} onMouseMove={handleMove} onMouseLeave={() => setHover(null)} style={{ display: 'block', cursor: 'crosshair' }}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={padding.left} x2={width - padding.right} y1={y(v)} y2={y(v)} stroke="rgba(238,234,224,0.08)" strokeWidth={1} />
            <text x={padding.left - 8} y={y(v) + 4} textAnchor="end" fontSize={10.5} fill="rgba(238,234,224,0.4)" fontFamily="var(--mono)">{v}</text>
          </g>
        ))}
        <path d={areaPath} fill="rgba(57,135,229,0.12)" stroke="none" />
        <path d={linePath} fill="none" stroke="#3987e5" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(maxT)} cy={y(points[points.length - 1].count)} r={3.5} fill="#3987e5" stroke="#10131A" strokeWidth={2} />
        {hover && (
          <>
            <line x1={x(hover.t)} x2={x(hover.t)} y1={padding.top} y2={padding.top + plotH} stroke="rgba(238,234,224,0.25)" strokeWidth={1} />
            <circle cx={x(hover.t)} cy={y(hover.count)} r={4} fill="#3987e5" stroke="#fff" strokeWidth={1.5} />
          </>
        )}
      </svg>
      {hover && (
        <div style={{
          position: 'absolute', top: 14, pointerEvents: 'none',
          left: Math.min(Math.max(x(hover.t) - 55, padding.left), width - 150),
          background: 'var(--panel-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap',
        }}>
          <div style={{ fontWeight: 600 }} className="pc-mono">{hover.count} organization{hover.count === 1 ? '' : 's'}</div>
          <div style={{ color: 'var(--dim)', marginTop: 2 }}>{new Date(hover.t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        </div>
      )}
      <div className="pc-mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--faint)', marginTop: 6, paddingLeft: padding.left }}>
        <span>{new Date(minT).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        <span>{new Date(maxT).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
      </div>
    </div>
  );
}

// Direct-labeled always (category name + value never hidden) — the mitigation
// this palette's CVD floor-band warning requires, per the dataviz skill.
function BarRows({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, x) => s + x.value, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div title={r.label} style={{ width: 130, fontSize: 12.5, color: 'var(--dim)', flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.label}
          </div>
          <div style={{ flex: 1, height: 8, background: 'rgba(238,234,224,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(r.value / max) * 100}%`, background: r.color, borderRadius: 2 }} />
          </div>
          <div className="pc-mono" style={{ width: 72, textAlign: 'right', fontSize: 12, flexShrink: 0 }}>
            {r.value} <span style={{ color: 'var(--faint)' }}>{Math.round((r.value / total) * 100)}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PlatformAnalytics() {
  const [orgs, setOrgs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [pageViews, setPageViews] = useState([]);
  const [adminIds, setAdminIds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiGet('/platform/organizations'), apiGet('/platform/profiles'), apiGet('/platform/transactions'), apiGet('/platform/page-views'), apiGet('/platform/admin-ids')])
      .then(([o, p, t, v, ai]) => { setOrgs(o.organizations); setProfiles(p.profiles); setTransactions(t.transactions); setPageViews(v.pageViews); setAdminIds(ai.adminIds); })
      .finally(() => setLoading(false));
  }, []);

  // Platform operators aren't customers — keep them out of every user count.
  const customerProfiles = useMemo(() => profiles.filter((p) => !adminIds.includes(p.id)), [profiles, adminIds]);

  // Fixed-order categorical rows from a { code: count } map — shared by the
  // org-signup and page-visitor country breakdowns so their color slots mean
  // the same thing (identity, not rank) in both places.
  const countryBreakdown = (counts) => {
    const known = COUNTRY_ORDER.filter((c) => counts[c]).map((c, i) => ({ label: COUNTRY_NAME[c] || c, value: counts[c], color: CAT[i % CAT.length] }));
    const otherCount = Object.keys(counts).filter((c) => !COUNTRY_ORDER.includes(c) && c !== 'XX').reduce((s, c) => s + counts[c], 0);
    if (otherCount > 0) known.push({ label: 'Other', value: otherCount, color: CAT[known.length % CAT.length] });
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
    return customerProfiles.filter((p) => p.last_login_at && new Date(p.last_login_at).getTime() > cutoff).length;
  }, [customerProfiles]);

  const newLast30d = useMemo(() => {
    const cutoff = Date.now() - 30 * DAY_MS;
    return orgs.filter((o) => new Date(o.created_at).getTime() > cutoff).length;
  }, [orgs]);

  if (loading) {
    return (
      <PlatformShell>
        <p className="pc-dim" style={{ fontSize: 13 }}>Loading…</p>
      </PlatformShell>
    );
  }

  return (
    <PlatformShell>
      <div className="pc-kpis" style={{ marginBottom: 36 }}>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Organizations</div>
          <div className="pc-kpi-value">{orgs.length}</div>
          <div className="pc-kpi-sub">{newLast30d} new in last 30 days</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Active users, 7d</div>
          <div className="pc-kpi-value">{activeLast7d}</div>
          <div className="pc-kpi-sub">of {customerProfiles.length} signed-up</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Revenue collected</div>
          <div className="pc-kpi-value" style={{ fontSize: 21 }}>{naira(revenue.collected)}</div>
          <div className="pc-kpi-sub pc-mono">{revenue.pending > 0 ? `${naira(revenue.pending)} pending` : 'nothing pending'}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Page views, 30d</div>
          <div className="pc-kpi-value">{visitorStats.last30d}</div>
          <div className="pc-kpi-sub pc-mono">{visitorStats.last24h} / 24h · {visitorStats.last7d} / 7d</div>
        </div>
      </div>

      <section className="pc-section">
        <SectionHead title="Signup growth" note="cumulative" />
        <GrowthChart orgs={orgs} />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 24 }}>
        <section className="pc-section">
          <SectionHead title="Where they registered from" />
          {countryRows.length === 0
            ? <p style={{ color: 'var(--faint)', fontSize: 12.5 }}>No organizations yet.</p>
            : <div className="pc-panel" style={{ padding: 16 }}><BarRows rows={countryRows} /></div>}
        </section>
        <section className="pc-section">
          <SectionHead title="Plan mix" />
          {planRows.length === 0
            ? <p style={{ color: 'var(--faint)', fontSize: 12.5 }}>No organizations yet.</p>
            : <div className="pc-panel" style={{ padding: 16 }}><BarRows rows={planRows} /></div>}
        </section>
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--faint)', margin: '0 0 24px' }}>
        Visitor analytics are anonymous — no cookies or visitor IDs, just a path, country and timestamp per page load.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 24 }}>
        <section className="pc-section">
          <SectionHead title="Visitor locations" />
          {visitorCountryRows.length === 0
            ? <p style={{ color: 'var(--faint)', fontSize: 12.5 }}>No page views recorded yet.</p>
            : <div className="pc-panel" style={{ padding: 16 }}><BarRows rows={visitorCountryRows} /></div>}
        </section>
        <section className="pc-section">
          <SectionHead title="Most visited pages" />
          {visitorStats.topPaths.length === 0
            ? <p style={{ color: 'var(--faint)', fontSize: 12.5 }}>No page views recorded yet.</p>
            : <div className="pc-panel" style={{ padding: 16 }}><BarRows rows={visitorStats.topPaths} /></div>}
        </section>
      </div>
    </PlatformShell>
  );
}
