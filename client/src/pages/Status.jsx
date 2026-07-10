import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client.js';
import './Legal.css';

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(d) { return new Date(d).toISOString().slice(0, 10); }

function buildDays(checks, count = 60) {
  const byDay = {};
  checks.forEach((c) => {
    const k = dayKey(c.checked_at);
    if (!byDay[k]) byDay[k] = { total: 0, ok: 0 };
    byDay[k].total += 1;
    if (c.api_ok && c.db_ok) byDay[k].ok += 1;
  });
  const days = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const k = dayKey(d);
    const rec = byDay[k];
    days.push({ key: k, pct: rec ? rec.ok / rec.total : null });
  }
  return days;
}

const dayColor = (pct) => {
  if (pct === null) return 'rgba(10,14,26,0.06)';
  if (pct >= 0.99) return '#1a7a3e';
  if (pct >= 0.9) return '#c8951a';
  return '#c02b2b';
};

export default function Status() {
  const [checks, setChecks] = useState(null);
  const [live, setLive] = useState(null); // this-instant check, independent of cron history
  const [err, setErr] = useState('');

  useEffect(() => {
    apiGet('/status/checks').then((d) => setChecks(d.checks)).catch((e) => setErr(e.message));
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', border: '1px solid rgba(10,14,26,0.1)', borderRadius: 12, margin: '24px 0' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: stateColor, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 650, fontSize: 15 }}>{stateLabel}</div>
            {live && <div style={{ fontSize: 12.5, color: 'rgba(10,14,26,0.5)', marginTop: 2 }}>Checked just now · {live.responseMs}ms response</div>}
          </div>
          {overallPct !== null && (
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 20, fontWeight: 650 }}>{(overallPct * 100).toFixed(2)}%</div>
              <div style={{ fontSize: 11, color: 'rgba(10,14,26,0.45)' }}>uptime, daily checks since monitoring started</div>
            </div>
          )}
        </div>

        {isMonitoring ? (
          <>
            <div style={{ display: 'flex', gap: 3, marginBottom: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {days.map((d) => (
                <div key={d.key} title={`${d.key}: ${d.pct === null ? 'no data' : (d.pct * 100).toFixed(0) + '% uptime'}`}
                  style={{ width: 10, height: 28, borderRadius: 2, background: dayColor(d.pct), flexShrink: 0 }} />
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'rgba(10,14,26,0.45)', margin: '0 0 32px' }}>Last {days.length} days, most recent on the right</p>
          </>
        ) : (
          !err && <p style={{ fontSize: 13.5, color: 'rgba(10,14,26,0.55)', margin: '0 0 32px' }}>The banner above is live — checked the moment you loaded this page. Daily history builds up starting with today's scheduled check.</p>
        )}
        {err && <p style={{ fontSize: 13.5, color: '#c02b2b' }}>{err}</p>}

        <h2>What's monitored</h2>
        <p>A scheduled check hits the Collarone API and database directly, on a fixed interval — this page reads the real results, it doesn't assume anything is fine.</p>

        <div className="lg-foot">© 2026 Collarone. Made for Nigerian business.</div>
      </div>
    </div>
  );
}
