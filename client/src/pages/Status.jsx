import { useEffect, useState } from 'react';
import { apiGet } from '../api/client.js';
import { LegalNav, LegalFooter } from './LegalChrome.jsx';
import './Legal.css';

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(d) { return new Date(d).toISOString().slice(0, 10); }

function buildDays(checks, count = 90) {
  const byDay = {};
  checks.forEach((c) => {
    const k = dayKey(c.checked_at);
    if (!byDay[k]) byDay[k] = { total: 0, ok: 0, down: 0 };
    byDay[k].total += 1;
    if (c.api_ok && c.db_ok) byDay[k].ok += 1;
    else if (!c.db_ok) byDay[k].down += 1;
  });
  const days = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const k = dayKey(d);
    const rec = byDay[k];
    days.push({ key: k, pct: rec ? rec.ok / rec.total : null, hadOutage: rec ? rec.down > 0 : false, total: rec ? rec.total : 0 });
  }
  return days;
}

// severity colors: red = full outage, orange = app-level error, amber = degraded
const OUTAGE_KINDS = ['api_down', 'db_down'];
const INCIDENT_COLOR = { api_down: '#c94f3d', db_down: '#c94f3d', degraded: '#d9a441', app_bug: '#d97f35' };

const dayColor = (d, incs = []) => {
  if (incs.some((x) => OUTAGE_KINDS.includes(x.kind))) return '#c94f3d';
  if (incs.length) return '#d97f35';
  if (d.pct === null) return '#E4E1D8';
  if (d.hadOutage) return '#c94f3d';
  if (d.pct >= 0.99) return '#5a9c4a';
  return '#d9a441';
};

// every incident colors every day it spans, not just the day it started
function incidentsOnDay(incidents, key) {
  const dayStart = new Date(`${key}T00:00:00Z`).getTime();
  const dayEnd = dayStart + DAY_MS;
  return incidents.filter((x) => {
    const s = new Date(x.started_at).getTime();
    const e = x.resolved_at ? new Date(x.resolved_at).getTime() : Date.now();
    return s < dayEnd && e >= dayStart;
  });
}

const INCIDENT_LABEL = { api_down: 'API unreachable', db_down: 'Database unreachable', degraded: 'Degraded performance', app_bug: 'Application error' };

function fmtDuration(sec) {
  if (sec == null) return null;
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;
}

function fmtWhen(d) {
  // shown in the visitor's own timezone — the label (WAT / GMT+1 / …) says which
  return new Date(d).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' });
}

export default function Status() {
  const [checks, setChecks] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [live, setLive] = useState(null); // this-instant check, independent of cron history
  const [err, setErr] = useState('');
  const [hover, setHover] = useState(null); // { i, d } — hovered day bar

  useEffect(() => {
    apiGet('/status/checks').then((d) => setChecks(d.checks)).catch((e) => setErr(e.message));
    apiGet('/status/incidents').then((d) => setIncidents(d.incidents)).catch(() => {});
    fetch('/api/health').then((r) => r.json()).then(setLive).catch(() => {});
  }, []);

  const isMonitoring = checks && checks.length > 0;
  const overallPct = checks?.length ? checks.filter((c) => c.api_ok && c.db_ok).length / checks.length : null;
  const days = checks ? buildDays(checks) : [];

  // The banner reflects a real check made right now (hits the API + DB live),
  // not just the daily-cron history — so it reads correctly from the first
  // page load, not just after the scheduled check has run a few times.
  const state = live ? live.status : 'checking';
  const stateLabel = { operational: 'All systems operational', degraded: 'Degraded performance', down: 'Service disruption', checking: 'Checking…' }[state];
  const stateColor = { operational: '#1a7a3e', degraded: '#c8951a', down: '#c02b2b', checking: 'rgba(10,14,26,0.3)' }[state];

  return (
    <div className="lg">
      <LegalNav />

      <div className="lg-body">
        <p className="lg-kicker">System status</p>
        <h1 className="lg-h1">Collarone status</h1>
        <p className="lg-updated">Real health checks, run automatically — not a hand-typed page.</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: stateColor, flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{stateLabel}</span>
          {live && <span style={{ fontSize: 12, color: 'rgba(10,14,26,0.4)' }}>· checked just now, {live.responseMs}ms</span>}
        </div>
        <p style={{ fontSize: 13, color: 'rgba(10,14,26,0.5)', margin: '0 0 20px' }}>Uptime over the past {days.length} days. Hover a bar for that day's detail.</p>

        <div style={{ border: '1px solid rgba(10,14,26,0.1)', borderRadius: 14, padding: '20px 22px 18px', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 650 }}>Collarone</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: stateColor }}>{state === 'operational' ? 'Operational' : state === 'checking' ? '—' : stateLabel}</span>
          </div>

          <div style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
            <div style={{ display: 'flex', gap: 3, marginBottom: 12 }}>
              {days.map((d, i) => (
                <div key={d.key} onMouseEnter={() => setHover({ i, d })}
                  style={{
                    flex: 1, minWidth: 3, height: 46, borderRadius: 2, background: dayColor(d, incidentsOnDay(incidents, d.key)), cursor: 'pointer',
                    transition: 'transform .12s ease, opacity .12s ease',
                    ...(hover && hover.i === i ? { transform: 'scaleY(1.14)' } : hover ? { opacity: 0.55 } : {}),
                  }} />
              ))}
            </div>
            {hover && (() => {
              const d = hover.d;
              const dayIncs = incidentsOnDay(incidents, d.key);
              const leftPct = Math.min(82, Math.max(18, ((hover.i + 0.5) / days.length) * 100));
              return (
                <div style={{
                  position: 'absolute', top: 56, left: `${leftPct}%`, transform: 'translateX(-50%)', width: 260, zIndex: 5, pointerEvents: 'none',
                  background: '#fff', border: '1px solid rgba(10,14,26,0.12)', borderRadius: 12,
                  boxShadow: '0 14px 40px rgba(10,14,26,0.16)', padding: '14px 16px',
                }}>
                  <div style={{ position: 'absolute', top: -6, left: '50%', width: 10, height: 10, background: '#fff', borderLeft: '1px solid rgba(10,14,26,0.12)', borderTop: '1px solid rgba(10,14,26,0.12)', transform: 'translateX(-50%) rotate(45deg)' }} />
                  <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>
                    {new Date(`${d.key}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                  {d.pct === null && (
                    <div style={{ fontSize: 12.5, color: 'rgba(10,14,26,0.5)', lineHeight: 1.5 }}>No data — monitoring hadn't started yet on this day.</div>
                  )}
                  {d.pct !== null && dayIncs.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'rgba(10,14,26,0.6)', lineHeight: 1.5 }}>
                      No downtime recorded on this day.
                      <div style={{ marginTop: 4, color: 'rgba(10,14,26,0.4)' }}>{d.total} check{d.total === 1 ? '' : 's'} · {(d.pct * 100).toFixed(0)}% healthy</div>
                    </div>
                  )}
                  {dayIncs.map((inc) => (
                    <div key={inc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FDF1EC', borderRadius: 8, padding: '8px 10px', marginTop: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: INCIDENT_COLOR[inc.kind] || '#c94f3d', flexShrink: 0 }} />
                      <div style={{ fontSize: 12.5 }}>
                        <strong>{INCIDENT_LABEL[inc.kind] || inc.kind}</strong>
                        <span style={{ color: 'rgba(10,14,26,0.5)', marginLeft: 6 }}>
                          {inc.resolved_at ? fmtDuration(inc.duration_sec) : 'ongoing'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12.5, color: 'rgba(10,14,26,0.45)' }}>
            <span>{days.length} days ago</span>
            <span style={{ flex: 1, height: 1, background: 'rgba(10,14,26,0.12)' }} />
            <span style={{ color: 'rgba(10,14,26,0.65)', fontWeight: 500 }}>
              {overallPct !== null ? `${(overallPct * 100).toFixed(2)}% uptime` : 'No history yet'}
            </span>
            <span style={{ flex: 1, height: 1, background: 'rgba(10,14,26,0.12)' }} />
            <span>Today</span>
          </div>
        </div>

        {!isMonitoring && !err && (
          <p style={{ fontSize: 12.5, color: 'rgba(10,14,26,0.45)', margin: '0 0 32px' }}>The bars fill in as daily checks run — today's is the first. The status above is still live, checked the moment you loaded this page.</p>
        )}
        {err && <p style={{ fontSize: 13.5, color: '#c02b2b' }}>{err}</p>}

        <h2>Incident history</h2>
        {incidents.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'rgba(10,14,26,0.5)' }}>No incidents recorded — every scheduled check has come back healthy. These checks cover the Collarone servers and database; issues inside the app are tracked and fixed separately.</p>
        ) : (
          <div style={{ marginBottom: 8 }}>
            {incidents.map((inc) => (
              <div key={inc.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 0', borderTop: '1px solid rgba(10,14,26,0.08)' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: INCIDENT_COLOR[inc.kind] || '#c94f3d', marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {INCIDENT_LABEL[inc.kind] || inc.kind}
                    {!inc.resolved_at && <span style={{ color: '#c02b2b', marginLeft: 8, fontSize: 12.5, fontWeight: 700 }}>ONGOING</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'rgba(10,14,26,0.5)', marginTop: 2 }}>
                    Started {fmtWhen(inc.started_at)}
                    {inc.resolved_at && <> · resolved {fmtWhen(inc.resolved_at)} · {inc.kind === 'app_bug' ? 'fixed in' : 'back up in'} {fmtDuration(inc.duration_sec)}</>}
                  </div>
                  {inc.notes && <p style={{ fontSize: 13, color: 'rgba(10,14,26,0.65)', lineHeight: 1.6, margin: '6px 0 0', maxWidth: 640 }}>{inc.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        <h2>What's monitored</h2>
        <p>A scheduled check hits the Collarone API and database directly, on a fixed interval — this page reads the real results, it doesn't assume anything is fine.</p>
      </div>
      <LegalFooter />
    </div>
  );
}
