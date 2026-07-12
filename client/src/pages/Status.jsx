import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client.js';
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
    days.push({ key: k, pct: rec ? rec.ok / rec.total : null, hadOutage: rec ? rec.down > 0 : false });
  }
  return days;
}

const dayColor = (d) => {
  if (d.pct === null) return '#E4E1D8';
  if (d.hadOutage) return '#c94f3d';
  if (d.pct >= 0.99) return '#5a9c4a';
  return '#d9a441';
};

const INCIDENT_LABEL = { api_down: 'API unreachable', db_down: 'Database unreachable', degraded: 'Degraded performance' };

function fmtDuration(sec) {
  if (sec == null) return null;
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;
}

function fmtWhen(d) {
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Status() {
  const [checks, setChecks] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [live, setLive] = useState(null); // this-instant check, independent of cron history
  const [err, setErr] = useState('');

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
      <nav className="lg-nav">
        <div className="lg-nav-wrap">
          <Link to="/"><span className="lg-wm">Collar<em>One</em></span></Link>
        </div>
      </nav>

      <div className="lg-body">
        <p className="lg-kicker">System status</p>
        <h1 className="lg-h1">Collarone status</h1>
        <p className="lg-updated">Real health checks, run automatically — not a hand-typed page.</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: stateColor, flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{stateLabel}</span>
          {live && <span style={{ fontSize: 12, color: 'rgba(10,14,26,0.4)' }}>· checked just now, {live.responseMs}ms</span>}
        </div>
        <p style={{ fontSize: 13, color: 'rgba(10,14,26,0.5)', margin: '0 0 20px' }}>Uptime over the past {days.length} days.</p>

        <div style={{ border: '1px solid rgba(10,14,26,0.1)', borderRadius: 14, padding: '20px 22px 18px', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 650 }}>Collarone</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: stateColor }}>{state === 'operational' ? 'Operational' : state === 'checking' ? '—' : stateLabel}</span>
          </div>

          <div style={{ display: 'flex', gap: 2, marginBottom: 12, overflowX: 'auto' }}>
            {days.map((d) => (
              <div key={d.key} title={`${d.key}: ${d.pct === null ? 'no data' : (d.pct * 100).toFixed(0) + '% uptime'}`}
                style={{ width: 8, height: 46, borderRadius: 1.5, background: dayColor(d), flexShrink: 0 }} />
            ))}
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
          <p style={{ fontSize: 13.5, color: 'rgba(10,14,26,0.5)' }}>No incidents recorded — every scheduled check has come back healthy.</p>
        ) : (
          <div style={{ marginBottom: 8 }}>
            {incidents.map((inc) => (
              <div key={inc.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 0', borderTop: '1px solid rgba(10,14,26,0.08)' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: inc.resolved_at ? '#5a9c4a' : '#c02b2b', marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {INCIDENT_LABEL[inc.kind] || inc.kind}
                    {!inc.resolved_at && <span style={{ color: '#c02b2b', marginLeft: 8, fontSize: 12.5, fontWeight: 700 }}>ONGOING</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'rgba(10,14,26,0.5)', marginTop: 2 }}>
                    Started {fmtWhen(inc.started_at)}
                    {inc.resolved_at && <> · resolved {fmtWhen(inc.resolved_at)} · back up in {fmtDuration(inc.duration_sec)}</>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <h2>What's monitored</h2>
        <p>A scheduled check hits the Collarone API and database directly, on a fixed interval — this page reads the real results, it doesn't assume anything is fine.</p>

        <div className="lg-foot">© 2026 Collarone. Made for Nigerian business.</div>
      </div>
    </div>
  );
}
