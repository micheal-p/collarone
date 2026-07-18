import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../api/client.js';
import { EMPLOYMENT_TYPE, initials } from './hrApi.js';

/* ---- date helpers ----------------------------------------------------------- */
const now = () => new Date();
const yearOf  = (d) => (d ? new Date(d).getFullYear() : null);
const monthOf = (d) => (d ? new Date(d).getMonth() : null);

const tenureMonths = (startDate) => {
  if (!startDate) return null;
  const s = new Date(startDate);
  const n = now();
  let m = (n.getFullYear() - s.getFullYear()) * 12 + (n.getMonth() - s.getMonth());
  if (n.getDate() < s.getDate()) m -= 1;
  return m < 0 ? null : m;
};

const fmtAvgTenure = (months) => {
  if (months == null) return '—';
  if (months < 12) return `${Math.round(months)} mo`;
  return `${(months / 12).toFixed(1)} yr`;
};

/* ---- small building blocks --------------------------------------------------- */
function BarRow({ label, count, max, total, color }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  const share = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="ha-bar-row">
      <div className="ha-bar-label" title={label}>{label}</div>
      <div className="ha-bar-track">
        <div className="ha-bar-fill" style={{ width: `${pct}%`, background: color || 'var(--brand)' }} />
      </div>
      <div className="ha-bar-count">{count} <span className="muted">· {share}%</span></div>
    </div>
  );
}

function HiringTrendChart({ months }) {
  const w = 560, h = 170, padL = 8, padR = 8, padT = 20, padB = 24;
  const slot = (w - padL - padR) / months.length;
  const barW = Math.min(28, slot * 0.55);
  const max = Math.max(1, ...months.map((m) => m.count));
  const plotH = h - padT - padB;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Starts per month, last 12 months">
      <line x1={padL} x2={w - padR} y1={h - padB} y2={h - padB} stroke="var(--line)" strokeWidth="1" />
      {months.map((m, i) => {
        const bh = (m.count / max) * plotH;
        const x = padL + i * slot + (slot - barW) / 2;
        const cx = x + barW / 2;
        return (
          <g key={m.key}>
            {m.count > 0
              ? <rect x={x} y={h - padB - bh} width={barW} height={Math.max(bh, 3)} rx="3" fill="var(--brand)" />
              : <rect x={x} y={h - padB - 2} width={barW} height="2" rx="1" fill="var(--line)" />}
            {m.count > 0 && (
              <text x={cx} y={h - padB - bh - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-1, #201f1e)">{m.count}</text>
            )}
            <text x={cx} y={h - 7} textAnchor="middle" fontSize="10" fill="var(--text-2)">{m.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function SourceNote({ children }) {
  return <div className="ha-note">{children}</div>;
}

/* ---- main --------------------------------------------------------------------- */
export default function HrAnalytics({ staff, flash }) {
  const [exits, setExits] = useState(null);              // null = unavailable
  const [enrollments, setEnrollments] = useState(null);  // null = unavailable
  const [extrasLoading, setExtrasLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([apiGet('/hr/exits'), apiGet('/benefits/enrollments')])
      .then(([ex, en]) => {
        setExits(ex.status === 'fulfilled' ? (ex.value.exits || []) : null);
        setEnrollments(en.status === 'fulfilled' ? (en.value.enrollments || []) : null);
        if (ex.status !== 'fulfilled' && en.status !== 'fulfilled') {
          flash?.('Exit and benefits sources are offline — showing directory-based metrics only.');
        }
      })
      .finally(() => setExtrasLoading(false));
  }, []); // eslint-disable-line

  const thisYear = now().getFullYear();
  const thisMonth = now().getMonth();

  /* KPIs */
  const kpi = useMemo(() => {
    const hiresThisYear = staff.filter((s) => yearOf(s.startDate) === thisYear).length;
    const exitsThisYear = exits
      ? exits.filter((e) => yearOf(e.last_working_day || e.created_at) === thisYear).length
      : null;
    const attrition = exitsThisYear == null
      ? null
      : (staff.length + exitsThisYear) > 0
        ? Math.round((exitsThisYear / (staff.length + exitsThisYear)) * 1000) / 10
        : 0;
    const tenures = staff.map((s) => tenureMonths(s.startDate)).filter((m) => m != null);
    const avgTenure = tenures.length ? tenures.reduce((a, b) => a + b, 0) / tenures.length : null;
    return { hiresThisYear, exitsThisYear, attrition, avgTenure };
  }, [staff, exits, thisYear]);

  /* Headcount by department */
  const deptRows = useMemo(() => {
    const map = new Map();
    staff.forEach((s) => {
      const k = s.deptName || 'No department';
      map.set(k, (map.get(k) || 0) + 1);
    });
    return [...map.entries()].map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [staff]);

  /* Employment type mix */
  const typeRows = useMemo(() => {
    const map = new Map();
    staff.forEach((s) => {
      const k = s.employmentType || 'full_time';
      map.set(k, (map.get(k) || 0) + 1);
    });
    return [...map.entries()]
      .map(([key, count]) => ({ key, count, meta: EMPLOYMENT_TYPE[key] || { label: key, cls: 'hr-et-ft' } }))
      .sort((a, b) => b.count - a.count);
  }, [staff]);

  /* Hiring trend — last 12 months */
  const trendMonths = useMemo(() => {
    const out = [];
    const base = new Date(now().getFullYear(), now().getMonth(), 1);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      let label = d.toLocaleDateString('en-GB', { month: 'short' });
      if (d.getMonth() === 0 || i === 11) label += ` '${String(d.getFullYear()).slice(2)}`;
      out.push({ key, label, count: 0 });
    }
    const idx = new Map(out.map((m, i) => [m.key, i]));
    staff.forEach((s) => {
      if (!s.startDate) return;
      const d = new Date(s.startDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (idx.has(key)) out[idx.get(key)].count += 1;
    });
    return out;
  }, [staff]);

  /* Tenure distribution */
  const tenureBuckets = useMemo(() => {
    const buckets = [
      { label: 'Under 1 year', count: 0 },
      { label: '1–2 years',    count: 0 },
      { label: '2–5 years',    count: 0 },
      { label: '5+ years',     count: 0 },
    ];
    staff.forEach((s) => {
      const m = tenureMonths(s.startDate);
      if (m == null) return;
      if (m < 12) buckets[0].count += 1;
      else if (m < 24) buckets[1].count += 1;
      else if (m < 60) buckets[2].count += 1;
      else buckets[3].count += 1;
    });
    return buckets;
  }, [staff]);

  /* Work anniversaries this month */
  const anniversaries = useMemo(() => staff
    .filter((s) => s.startDate && monthOf(s.startDate) === thisMonth && yearOf(s.startDate) < thisYear)
    .map((s) => ({ ...s, years: thisYear - yearOf(s.startDate), day: new Date(s.startDate).getDate() }))
    .sort((a, b) => a.day - b.day), [staff, thisMonth, thisYear]);

  /* Birthdays this month — from self-service date_of_birth */
  const birthdays = useMemo(() => staff
    .filter((s) => s.dateOfBirth && monthOf(s.dateOfBirth) === thisMonth)
    .map((s) => ({ ...s, day: new Date(s.dateOfBirth).getDate() }))
    .sort((a, b) => a.day - b.day), [staff, thisMonth]);

  /* Statutory completeness */
  const statutory = useMemo(() => {
    if (!enrollments) return null;
    const active = enrollments.filter((e) => e.status === 'active');
    const idsFor = (type) => new Set(active.filter((e) => e.plan?.type === type).map((e) => e.employee_id));
    const pensionIds = idsFor('pension');
    const hmoIds = idsFor('hmo');
    const hasGroupLife = active.some((e) => e.plan?.type === 'group_life');
    return {
      pensionIds, hmoIds, hasGroupLife,
      pensionCount: staff.filter((s) => pensionIds.has(s.id)).length,
      hmoCount: staff.filter((s) => hmoIds.has(s.id)).length,
    };
  }, [enrollments, staff]);

  const deptMax = Math.max(1, ...deptRows.map((r) => r.count));
  const typeMax = Math.max(1, ...typeRows.map((r) => r.count));
  const tenMax  = Math.max(1, ...tenureBuckets.map((r) => r.count));

  return (
    <div className="ha">
      <style>{`
        .ha { padding-top: 8px; }
        .ha-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px; margin-bottom:16px; }
        .ha-kpi { background:var(--surface); border:1px solid var(--line); border-top:3px solid var(--brand); border-radius:var(--radius-lg); box-shadow:var(--shadow-2); padding:12px 16px; }
        .ha-kpi-val { font-size:24px; font-weight:700; line-height:1.1; }
        .ha-kpi-label { font-size:11.5px; color:var(--text-2); margin-top:3px; }
        .ha-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
        @media (max-width: 860px) { .ha-grid { grid-template-columns:1fr; } }
        .ha-card { padding:16px 18px; margin-bottom:0; }
        .ha-card-title { font-size:13px; font-weight:700; letter-spacing:.02em; margin:0 0 12px; }
        .ha-bar-row { display:flex; align-items:center; gap:10px; margin-top:9px; }
        .ha-bar-row:first-of-type { margin-top:0; }
        .ha-bar-label { width:130px; flex:none; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ha-bar-track { flex:1; height:10px; background:var(--surface-2, #f3f2f1); border-radius:5px; overflow:hidden; }
        .ha-bar-fill { height:100%; border-radius:5px; }
        .ha-bar-count { width:72px; flex:none; text-align:right; font-size:12.5px; font-weight:600; white-space:nowrap; }
        .ha-note { font-size:12.5px; color:var(--text-2); font-style:italic; padding:8px 0 2px; }
        .ha-anniv-row { display:flex; align-items:center; gap:10px; padding:7px 0; border-top:1px solid var(--line); }
        .ha-anniv-row:first-of-type { border-top:none; padding-top:0; }
        .ha-anniv-name { font-size:13px; font-weight:600; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .ha-anniv-meta { font-size:12px; color:var(--text-2); white-space:nowrap; }
        .ha-years-pill { display:inline-block; padding:2px 10px; border-radius:100px; font-size:12px; font-weight:700; background:var(--brand-100); color:var(--brand-ink); white-space:nowrap; }
        .ha-stat-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:6px 18px; margin-top:10px; }
        .ha-stat-row { display:flex; align-items:center; gap:8px; padding:5px 0; }
        .ha-stat-name { flex:1; min-width:0; font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .ha-stat-counts { display:flex; gap:14px; flex-wrap:wrap; font-size:12.5px; margin-top:2px; }
        .ha-callout { background:#FBF0D3; border:1px solid #e6c96a; border-radius:8px; padding:10px 14px; font-size:13px; color:#7a5b00; margin-top:12px; }
      `}</style>

      {/* 1 — KPI strip */}
      <div className="ha-kpis">
        <div className="ha-kpi"><div className="ha-kpi-val">{staff.length}</div><div className="ha-kpi-label">Active staff</div></div>
        <div className="ha-kpi"><div className="ha-kpi-val">{kpi.hiresThisYear}</div><div className="ha-kpi-label">Joined in {thisYear}</div></div>
        <div className="ha-kpi"><div className="ha-kpi-val">{kpi.exitsThisYear == null ? '—' : kpi.exitsThisYear}</div><div className="ha-kpi-label">Exits in {thisYear}</div></div>
        <div className="ha-kpi"><div className="ha-kpi-val">{kpi.attrition == null ? '—' : `${kpi.attrition}%`}</div><div className="ha-kpi-label">Attrition {thisYear}</div></div>
        <div className="ha-kpi"><div className="ha-kpi-val">{fmtAvgTenure(kpi.avgTenure)}</div><div className="ha-kpi-label">Average tenure</div></div>
      </div>

      <div className="ha-grid">
        {/* 2 — Headcount by department */}
        <div className="card ha-card">
          <h3 className="ha-card-title">Headcount by department</h3>
          {deptRows.length === 0
            ? <SourceNote>No staff in the directory yet.</SourceNote>
            : deptRows.map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} max={deptMax} total={staff.length} />
              ))}
        </div>

        {/* 3 — Employment type mix */}
        <div className="card ha-card">
          <h3 className="ha-card-title">Employment type mix</h3>
          {typeRows.length === 0
            ? <SourceNote>No staff in the directory yet.</SourceNote>
            : typeRows.map((r) => (
                <div className="ha-bar-row" key={r.key}>
                  <div className="ha-bar-label"><span className={`hr-et-badge ${r.meta.cls}`}>{r.meta.label}</span></div>
                  <div className="ha-bar-track">
                    <div className="ha-bar-fill" style={{ width: `${(r.count / typeMax) * 100}%`, background: 'var(--brand)' }} />
                  </div>
                  <div className="ha-bar-count">{r.count} <span className="muted">· {staff.length ? Math.round((r.count / staff.length) * 100) : 0}%</span></div>
                </div>
              ))}
        </div>
      </div>

      {/* 4 — Hiring trend */}
      <div className="card ha-card" style={{ marginBottom: 14 }}>
        <h3 className="ha-card-title">Hiring trend — starts per month, last 12 months</h3>
        <HiringTrendChart months={trendMonths} />
      </div>

      <div className="ha-grid">
        {/* 5 — Tenure distribution */}
        <div className="card ha-card">
          <h3 className="ha-card-title">Tenure distribution</h3>
          {tenureBuckets.map((b) => (
            <BarRow key={b.label} label={b.label} count={b.count} max={tenMax} total={staff.length} />
          ))}
        </div>

        {/* 6 — Work anniversaries this month */}
        <div className="card ha-card">
          <h3 className="ha-card-title">Work anniversaries — {now().toLocaleDateString('en-GB', { month: 'long' })}</h3>
          {anniversaries.length === 0
            ? <SourceNote>No work anniversaries this month.</SourceNote>
            : anniversaries.map((a) => (
                <div className="ha-anniv-row" key={a.id}>
                  {a.avatarUrl
                    ? <img src={a.avatarUrl} alt="" className="avatar sm" style={{ objectFit: 'cover' }} />
                    : <span className="avatar sm">{initials(a.name)}</span>}
                  <span className="ha-anniv-name">{a.name}</span>
                  <span className="ha-anniv-meta">{a.day} {now().toLocaleDateString('en-GB', { month: 'short' })}</span>
                  <span className="ha-years-pill">{a.years} {a.years === 1 ? 'year' : 'years'}</span>
                </div>
              ))}
        </div>

        {/* 6b — Birthdays this month */}
        <div className="card ha-card">
          <h3 className="ha-card-title">Birthdays — {now().toLocaleDateString('en-GB', { month: 'long' })}</h3>
          {birthdays.length === 0
            ? <SourceNote>No birthdays on record this month — staff add their date of birth on their own Profile page.</SourceNote>
            : birthdays.map((b) => (
                <div className="ha-anniv-row" key={b.id}>
                  {b.avatarUrl
                    ? <img src={b.avatarUrl} alt="" className="avatar sm" style={{ objectFit: 'cover' }} />
                    : <span className="avatar sm">{initials(b.name)}</span>}
                  <span className="ha-anniv-name">{b.name}</span>
                  <span className="ha-anniv-meta">{b.day} {now().toLocaleDateString('en-GB', { month: 'short' })}</span>
                </div>
              ))}
        </div>
      </div>

      {/* 7 — Statutory completeness */}
      <div className="card ha-card">
        <h3 className="ha-card-title">Statutory completeness</h3>
        {extrasLoading ? (
          <SourceNote>Loading benefits data…</SourceNote>
        ) : !statutory ? (
          <SourceNote>Needs the Benefits suite — enrollment data could not be loaded.</SourceNote>
        ) : (
          <>
            <div className="ha-stat-counts">
              <span><strong>{statutory.pensionCount}</strong> of {staff.length} on pension</span>
              <span><strong>{statutory.hmoCount}</strong> of {staff.length} on HMO</span>
              <span>Group life: <strong>{statutory.hasGroupLife ? 'on record' : 'none on record'}</strong></span>
            </div>
            {staff.length >= 5 && !statutory.hasGroupLife && (
              <div className="ha-callout">
                At 5+ employees, Group Life cover is a legal requirement under the Pension Reform Act — no group life plan is on record.
              </div>
            )}
            <div className="ha-stat-grid">
              {staff.map((s) => (
                <div className="ha-stat-row" key={s.id}>
                  <span className="ha-stat-name" title={s.name}>{s.name}</span>
                  <span className={`st-pill ${statutory.pensionIds.has(s.id) ? 'st-success' : 'st-warn'}`}>
                    {statutory.pensionIds.has(s.id) ? 'Pension' : 'No pension'}
                  </span>
                  <span className={`st-pill ${statutory.hmoIds.has(s.id) ? 'st-success' : 'st-warn'}`}>
                    {statutory.hmoIds.has(s.id) ? 'HMO' : 'No HMO'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
