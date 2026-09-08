// Chart pieces shared by Platform Control's Overview and Analytics pages.
// Plain SVG, no library: one series at a time, so no legend; a crosshair and
// tooltip on the area chart; direct-labelled bars with the value always
// visible. Chart text wears text tokens, never the series colour.
import { useEffect, useMemo, useRef, useState } from 'react';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const naira = (kobo) => `₦${Math.round((kobo || 0) / 100).toLocaleString()}`;
export const fmtInt = (n) => Number(n || 0).toLocaleString();
export const fmtDay = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export const COUNTRY_NAME = {
  NG: 'Nigeria', GH: 'Ghana', KE: 'Kenya', ZA: 'South Africa', EG: 'Egypt', GB: 'United Kingdom', US: 'United States',
  CA: 'Canada', DE: 'Germany', FR: 'France', NL: 'Netherlands', IE: 'Ireland', IN: 'India', AE: 'United Arab Emirates',
  CM: 'Cameroon', BJ: 'Benin', TG: 'Togo', CI: "Côte d'Ivoire", SN: 'Senegal', RW: 'Rwanda', UG: 'Uganda', TZ: 'Tanzania',
  ET: 'Ethiopia', SG: 'Singapore', AU: 'Australia', BR: 'Brazil', CN: 'China', RU: 'Russia', SE: 'Sweden', NO: 'Norway',
  IT: 'Italy', ES: 'Spain', PT: 'Portugal', BE: 'Belgium', CH: 'Switzerland', PL: 'Poland', TR: 'Türkiye', SA: 'Saudi Arabia',
};
export const countryName = (code) => COUNTRY_NAME[code] || code || 'Unknown';

// Percentage change between two counts, or null when there is no baseline.
export function delta(now, prev) {
  if (!prev) return null;
  return Math.round(((now - prev) / prev) * 100);
}

export function useContainerWidth(initial = 600) {
  const ref = useRef(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => { if (entries[0]) setW(entries[0].contentRect.width); });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Fill the gaps: the database returns one row per day that HAD views, the
// chart needs one point per day in the window so a quiet day reads as zero.
export function fillDaily(daily, days) {
  const byDay = new Map((daily || []).map((r) => [r.day, r.views]));
  const out = [];
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, t: d.getTime(), views: byDay.get(key) || 0 });
  }
  return out;
}

// Small inline sparkline for a KPI tile. No axes, no labels: the tile's
// number is the label, the line only says "which way".
export function Sparkline({ points, width = 72, height = 26, color = 'var(--accent)' }) {
  if (!points || points.length < 2) return null;
  const max = Math.max(1, ...points.map((p) => p.views));
  const step = width / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(height - 2 - (p.views / max) * (height - 4)).toFixed(1)}`).join(' ');
  return (
    <svg className="pc-kpi-spark" width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Daily page views as an area, with crosshair and tooltip. One series.
export function AreaChart({ points, height = 200, color = '#FF5B1F', unit = 'page views' }) {
  const [ref, width] = useContainerWidth();
  const [hover, setHover] = useState(null);
  const pad = { top: 14, right: 12, bottom: 6, left: 40 };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...points.map((p) => p.views));
  // a round number for the top tick, so the axis reads 0 / 500 / 1,000 rather than 0 / 487 / 974
  const niceMax = useMemo(() => {
    const pow = 10 ** Math.floor(Math.log10(max));
    const steps = [1, 2, 2.5, 5, 10];
    for (const s of steps) if (s * pow >= max) return s * pow;
    return 10 * pow;
  }, [max]);
  const x = (i) => pad.left + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
  const y = (v) => pad.top + plotH - (v / niceMax) * plotH;

  if (points.length === 0) return <div className="pc-empty">No page views in this period yet.</div>;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.views).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${(pad.top + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(pad.top + plotH).toFixed(1)} Z`;
  const ticks = [0, 0.5, 1].map((f) => Math.round(f * niceMax));
  const gid = `area-${color.replace(/[^a-z0-9]/gi, '')}`;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const i = Math.round(((mx - pad.left) / plotW) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  };

  const h = hover != null ? points[hover] : null;
  return (
    <div className="pc-chart" ref={ref}>
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchStart={(e) => onMove(e.touches[0])} onTouchMove={(e) => onMove(e.touches[0])} style={{ cursor: 'crosshair', touchAction: 'pan-y' }} role="img" aria-label={`${unit} per day`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.22" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke="rgba(10,14,26,0.07)" />
            <text x={pad.left - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="rgba(10,14,26,0.45)" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtInt(v)}</text>
          </g>
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].views)} r="3.5" fill={color} stroke="#fff" strokeWidth="1.5" />
        {h && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotH} stroke="rgba(10,14,26,0.25)" />
            <circle cx={x(hover)} cy={y(h.views)} r="4.5" fill={color} stroke="#fff" strokeWidth="2" />
          </>
        )}
      </svg>
      {h && (
        <div className="pc-tip" style={{ top: 4, left: Math.min(Math.max(x(hover) - 50, pad.left), Math.max(pad.left, width - 130)) }}>
          <b>{fmtInt(h.views)}</b> {unit}
          <span>{new Date(h.t).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
        </div>
      )}
      <div className="pc-axis" style={{ paddingLeft: pad.left }}>
        <span>{fmtDay(points[0].t)}</span>
        <span>{fmtDay(points[points.length - 1].t)}</span>
      </div>
    </div>
  );
}

// Direct-labelled horizontal bars: label, bar, value and share. Always the
// value, so identity never depends on colour or bar length alone.
export function BarRows({ rows, total, empty = 'Nothing recorded yet.', color }) {
  if (!rows || rows.length === 0) return <div className="pc-empty">{empty}</div>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const sum = total ?? rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="pc-bars">
      {rows.map((r) => (
        <div key={r.key || r.label} className="pc-bar" title={`${r.label}: ${fmtInt(r.value)}`}>
          <div className="pc-bar-label">{r.code && <span className="pc-bar-code">{r.code}</span>}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span></div>
          <div className="pc-bar-track"><div className="pc-bar-fill" style={{ width: `${(r.value / max) * 100}%`, background: color || undefined }} /></div>
          <div className="pc-bar-val">{fmtInt(r.value)}<small>{sum > 0 ? `${Math.round((r.value / sum) * 100)}%` : ''}</small></div>
        </div>
      ))}
    </div>
  );
}

export function Kpi({ label, value, sub, tone, spark }) {
  return (
    <div className="pc-kpi">
      <div className="pc-kpi-label">{label}</div>
      <div className="pc-kpi-value">{value}</div>
      {sub && <div className={`pc-kpi-sub${tone ? ` ${tone}` : ''}`}>{sub}</div>}
      {spark}
    </div>
  );
}

export function DeltaText({ now, prev, what = 'previous period' }) {
  const d = delta(now, prev);
  if (d == null) return `no ${what} to compare`;
  if (d === 0) return `level with the ${what}`;
  return `${d > 0 ? '+' : ''}${d}% vs ${what}`;
}
export const deltaTone = (now, prev) => { const d = delta(now, prev); return d == null || d === 0 ? undefined : d > 0 ? 'up' : 'down'; };
