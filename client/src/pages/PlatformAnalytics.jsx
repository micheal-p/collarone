// Visitor and customer analytics for Platform Control.
//
// Every visitor figure here comes from platform_analytics_summary(), one RPC
// that aggregates in the database. The previous version fetched raw
// page_views rows and counted them in the browser; PostgREST capped the
// response at 1,000 rows, so once traffic passed that the page silently
// showed the newest thousand visits and nothing before them, while Cloudflare
// reported ten times as many. Totals, not rows. (See supabase/platform_analytics.sql.)
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api/client.js';
import PlatformShell from '../components/PlatformShell.jsx';
import { AreaChart, BarRows, DAY_MS, DeltaText, Kpi, countryName, deltaTone, fillDaily, fmtDate, fmtInt, naira, useContainerWidth } from './platform/charts.jsx';

const RANGES = [7, 30, 90];
const DEVICE_LABEL = { phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop', bot: 'Bots and previews', unknown: 'Not recorded' };
const PLAN_ORDER = ['startup', 'standard', 'enterprise'];
const PLAN_LABEL = { startup: 'Startup', standard: 'Standard', enterprise: 'Enterprise' };

// Cumulative signups. One series, so no legend; hover for the count that day.
function GrowthChart({ orgs }) {
  const [ref, width] = useContainerWidth();
  const [hover, setHover] = useState(null);
  const height = 180;
  const pad = { top: 14, right: 12, bottom: 6, left: 30 };
  const points = useMemo(() => {
    if (orgs.length < 2) return [];
    const sorted = orgs.map((o) => new Date(o.created_at).getTime()).sort((a, b) => a - b);
    const first = sorted[0]; const last = Math.max(Date.now(), sorted[sorted.length - 1]);
    const days = Math.max(1, Math.ceil((last - first) / DAY_MS));
    const pts = [];
    for (let d = 0; d <= days; d++) { const t = first + d * DAY_MS; pts.push({ t, count: sorted.filter((s) => s <= t).length }); }
    return pts;
  }, [orgs]);
  if (points.length === 0) return <div className="pc-empty">Not enough signups to chart yet, check back once a few more organizations join.</div>;
  const plotW = Math.max(1, width - pad.left - pad.right); const plotH = height - pad.top - pad.bottom;
  const minT = points[0].t; const maxT = points[points.length - 1].t; const maxC = Math.max(1, ...points.map((p) => p.count));
  const x = (t) => pad.left + ((t - minT) / (maxT - minT || 1)) * plotW; const y = (c) => pad.top + plotH - (c / maxC) * plotH;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.count).toFixed(1)}`).join(' ');
  const onMove = (e) => { const r = e.currentTarget.getBoundingClientRect(); const t = minT + ((e.clientX - r.left - pad.left) / plotW) * (maxT - minT); let n = points[0]; for (const p of points) if (Math.abs(p.t - t) < Math.abs(n.t - t)) n = p; setHover(n); };
  return (
    <div className="pc-chart" ref={ref}>
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ cursor: 'crosshair' }} role="img" aria-label="Organizations over time">
        {[0, maxC].map((v) => <g key={v}><line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke="rgba(10,14,26,0.07)" /><text x={pad.left - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="rgba(10,14,26,0.45)">{v}</text></g>)}
        <path d={`${line} L ${x(maxT).toFixed(1)} ${pad.top + plotH} L ${x(minT).toFixed(1)} ${pad.top + plotH} Z`} fill="rgba(27,58,107,0.10)" />
        <path d={line} fill="none" stroke="#1B3A6B" strokeWidth="2" strokeLinejoin="round" />
        <circle cx={x(maxT)} cy={y(points[points.length - 1].count)} r="3.5" fill="#1B3A6B" stroke="#fff" strokeWidth="1.5" />
        {hover && <><line x1={x(hover.t)} x2={x(hover.t)} y1={pad.top} y2={pad.top + plotH} stroke="rgba(10,14,26,0.25)" /><circle cx={x(hover.t)} cy={y(hover.count)} r="4.5" fill="#1B3A6B" stroke="#fff" strokeWidth="2" /></>}
      </svg>
      {hover && <div className="pc-tip" style={{ top: 4, left: Math.min(Math.max(x(hover.t) - 50, pad.left), Math.max(pad.left, width - 140)) }}><b>{hover.count}</b> organization{hover.count === 1 ? '' : 's'}<span>{fmtDate(hover.t)}</span></div>}
      <div className="pc-axis" style={{ paddingLeft: pad.left }}><span>{fmtDate(minT)}</span><span>{fmtDate(maxT)}</span></div>
    </div>
  );
}

export default function PlatformAnalytics() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [adminIds, setAdminIds] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([apiGet('/platform/organizations'), apiGet('/platform/profiles'), apiGet('/platform/transactions'), apiGet('/platform/admin-ids')])
      .then(([o, p, t, ai]) => { setOrgs(o.organizations || []); setProfiles(p.profiles || []); setTransactions(t.transactions || []); setAdminIds(ai.adminIds || []); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let live = true;
    apiGet(`/platform/analytics-summary?days=${days}`).then((d) => { if (live) setSummary(d.summary); }).catch((e) => setError(e.message));
    return () => { live = false; };
  }, [days]);

  const t = summary?.totals || {};
  const daily = useMemo(() => fillDaily(summary?.daily, days), [summary, days]);
  const perDay = summary ? Math.round((t.window || 0) / days) : 0;
  const countries = useMemo(() => (summary?.countries || []).map((c) => ({ key: c.code, code: c.code, label: countryName(c.code), value: c.views })), [summary]);
  const cities = useMemo(() => (summary?.cities || []).map((c) => ({ key: `${c.city}-${c.code}`, code: c.code, label: c.city, value: c.views })), [summary]);
  const paths = useMemo(() => (summary?.paths || []).map((p) => ({ key: p.path, label: p.path, value: p.views })), [summary]);
  const devices = useMemo(() => (summary?.devices || []).map((d) => ({ key: d.device, label: DEVICE_LABEL[d.device] || d.device, value: d.views })), [summary]);
  const referrers = useMemo(() => {
    const rows = (summary?.referrers || []).map((r) => ({ key: r.host, label: r.host, value: r.views }));
    if (summary && Number(summary.direct) > 0) rows.push({ key: '_direct', label: 'Direct, or not recorded', value: Number(summary.direct) });
    return rows.sort((a, b) => b.value - a.value);
  }, [summary]);
  const bots = (summary?.devices || []).find((d) => d.device === 'bot')?.views || 0;
  const people = Math.max(0, (t.window || 0) - bots);

  const customers = useMemo(() => profiles.filter((p) => !adminIds.includes(p.id)), [profiles, adminIds]);
  const active7d = useMemo(() => { const c = Date.now() - 7 * DAY_MS; return customers.filter((p) => p.last_login_at && new Date(p.last_login_at).getTime() > c).length; }, [customers]);
  const registeredFrom = useMemo(() => { const m = {}; orgs.forEach((o) => { const c = o.country || 'NG'; m[c] = (m[c] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([code, v]) => ({ key: code, code, label: countryName(code), value: v })); }, [orgs]);
  const planMix = useMemo(() => { const m = {}; orgs.forEach((o) => { m[o.plan_tier] = (m[o.plan_tier] || 0) + 1; }); return PLAN_ORDER.filter((p) => m[p]).map((p) => ({ key: p, label: PLAN_LABEL[p], value: m[p] })); }, [orgs]);
  const collected = useMemo(() => transactions.filter((x) => x.status === 'confirmed').reduce((s, x) => s + Number(x.amount_kobo || 0), 0), [transactions]);

  const range = (
    <div className="pc-seg" role="tablist" aria-label="Period">
      {RANGES.map((r) => <button key={r} role="tab" aria-selected={days === r} className={days === r ? 'active' : ''} onClick={() => setDays(r)}>{r} days</button>)}
    </div>
  );

  return (
    <PlatformShell title="Analytics" subtitle={summary?.first_seen ? `Recording since ${fmtDate(summary.first_seen)}, ${fmtInt(t.all)} page views in total. Anonymous: a path, a country, a device class and a timestamp per page load. No cookies, no visitor IDs.` : 'Anonymous page views. No cookies, no visitor IDs.'} actions={range}>
      {error && <p className="pc-note" style={{ color: 'var(--err)' }}>{error}</p>}

      <div className="pc-kpis">
        <Kpi label={`Page views, ${days} days`} value={summary ? fmtInt(t.window) : '…'} sub={summary ? <DeltaText now={t.window} prev={t.prev} what={`previous ${days}`} /> : ' '} tone={summary ? deltaTone(t.window, t.prev) : undefined} />
        <Kpi label="Per day" value={summary ? fmtInt(perDay) : '…'} sub={summary ? `${fmtInt(t.d1)} in the last 24 hours` : ' '} />
        <Kpi label="From real people" value={summary ? fmtInt(people) : '…'} sub={summary ? (bots > 0 ? `${fmtInt(bots)} from bots and link previews` : 'device recording starts with the next visit') : ' '} />
        <Kpi label="Countries" value={summary ? fmtInt(countries.length) : '…'} sub={summary && countries[0] ? `${countries[0].label} leads with ${Math.round((countries[0].value / Math.max(1, t.window - (t.unknown_country || 0))) * 100)}%` : ' '} />
      </div>

      <div className="pc-card" style={{ marginBottom: 14 }}>
        <h2 className="pc-card-title">Page views per day</h2>
        <p className="pc-card-sub">Every load of a collarone.app page that ran our beacon. Cloudflare counts every request its edge serves, assets and bots included, so its figure will always be higher.</p>
        {summary ? <AreaChart points={daily} height={230} /> : <div className="pc-empty">Loading…</div>}
      </div>

      <div className="pc-grid-3" style={{ marginBottom: 14 }}>
        <div className="pc-card">
          <h2 className="pc-card-title">Countries</h2>
          <p className="pc-card-sub">{t.unknown_country > 0 ? `${fmtInt(t.unknown_country)} views had no country. Before 4 September none did.` : 'From the edge, per request. Never stored with an IP.'}</p>
          <BarRows rows={countries} total={Math.max(1, (t.window || 0) - (t.unknown_country || 0))} empty="No country data in this period." />
        </div>
        <div className="pc-card">
          <h2 className="pc-card-title">Cities</h2>
          <p className="pc-card-sub">{cities.length ? 'Where the country data gets specific.' : 'Needs "Add visitor location headers" switched on in Cloudflare (Rules, Settings, Managed Transforms). Recording starts the moment it is.'}</p>
          <BarRows rows={cities} empty="No city data yet." />
        </div>
        <div className="pc-card">
          <h2 className="pc-card-title">Most visited pages</h2>
          <p className="pc-card-sub">Top ten paths in the period.</p>
          <BarRows rows={paths} total={t.window} empty="No page views in this period." />
        </div>
      </div>

      <div className="pc-grid-3" style={{ marginBottom: 30 }}>
        <div className="pc-card">
          <h2 className="pc-card-title">Devices</h2>
          <p className="pc-card-sub">Classified from the browser, the browser string itself is not kept.</p>
          <BarRows rows={devices} empty="Device recording starts with the next visit." />
        </div>
        <div className="pc-card" style={{ gridColumn: 'span 2' }}>
          <h2 className="pc-card-title">Where visits started</h2>
          <p className="pc-card-sub">The site a visit arrived from, counted once per visit, never for moving around inside collarone.app. Only the domain is kept.</p>
          <BarRows rows={referrers} empty="Referrer recording starts with the next visit." />
        </div>
      </div>

      <section className="pc-section">
        <div className="pc-sec-head"><h2 className="pc-sec-title">Customers</h2><span className="pc-sec-count">{fmtInt(orgs.length)} organizations, {fmtInt(customers.length)} people, {fmtInt(active7d)} active this week, {naira(collected)} collected</span></div>
        <div className="pc-grid-3">
          <div className="pc-card" style={{ gridColumn: 'span 2' }}>
            <h2 className="pc-card-title">Signup growth</h2>
            <p className="pc-card-sub">Organizations over time, cumulative.</p>
            <GrowthChart orgs={orgs} />
          </div>
          <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <div className="pc-card">
              <h2 className="pc-card-title">Where they registered from</h2>
              <p className="pc-card-sub">Country on the organization record.</p>
              <BarRows rows={registeredFrom} empty="No organizations yet." />
            </div>
            <div className="pc-card">
              <h2 className="pc-card-title">Plan mix</h2>
              <p className="pc-card-sub">Tier per organization.</p>
              <BarRows rows={planMix} empty="No organizations yet." />
            </div>
          </div>
        </div>
      </section>
    </PlatformShell>
  );
}
