import { useCallback, useEffect, useState } from 'react';
import * as AUTO from './automationApi.js';
import { SUITE_META } from '../../config/suites.js';
import SuiteIcon from '../../components/SuiteIcon.jsx';

function Toast({ toast }) { if (!toast) return null; return <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>; }

// The AUTOMATIONS catalog names suites for humans ("Trade Documents"); this
// maps back to the real suite key so the card can borrow that suite's own
// icon/colour instead of inventing a second palette just for this page.
const SUITE_KEY_BY_NAME = { Inventory: 'inventory', 'Trade Documents': 'trade-docs', CRM: 'crm', Tasks: 'tasks', Leave: 'leave' };

// Local, one-off icons for the roadmap cards below — not part of the shared
// SuiteIcon set since these describe capabilities, not suites.
const RI = {
  phone: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.7 21 3 13.3 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1L6.6 10.8z" /></svg>,
  waveform: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 12h1.5M7 8v8M11 4v16M15 8v8M19 10v4M22 12h-1.5" /></svg>,
  mail: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>,
  flow: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="6" height="5" rx="1.2" /><rect x="15" y="4" width="6" height="5" rx="1.2" /><rect x="9" y="15" width="6" height="5" rx="1.2" /><path d="M6 9v3a2 2 0 0 0 2 2h1M18 9v3a2 2 0 0 1-2 2h-1" /></svg>,
};

function AutomationCard({ def, setting, lastRun, isManager, onToggle, onConfigSave }) {
  const enabled = setting ? setting.enabled : true;
  const meta = SUITE_META[SUITE_KEY_BY_NAME[def.suite]] || {};
  const [config, setConfig] = useState(() => {
    const base = {};
    (def.configFields || []).forEach((f) => { base[f.key] = setting?.config?.[f.key] ?? f.default; });
    return base;
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const setField = (k, v) => { setConfig((c) => ({ ...c, [k]: v })); setDirty(true); };

  const saveConfig = async () => {
    setBusy(true);
    try { await onConfigSave(def.key, enabled, config); setDirty(false); } finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, borderColor: enabled ? (meta.tint || 'var(--line)') : undefined, borderWidth: enabled ? 1.5 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0, background: meta.tint || 'var(--text-2)' }}>
            <SuiteIcon name={meta.icon || 'bolt'} size={18} color="#fff" />
          </span>
          <div>
            <div style={{ fontWeight: 650, fontSize: 14.5 }}>{def.name}</div>
            <span className="badge" style={{ fontSize: 10.5, marginTop: 2 }}>{def.suite}</span>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
          <input type="checkbox" checked={enabled} disabled={!isManager || busy} onChange={(e) => onToggle(def.key, e.target.checked, config)} />
          {enabled ? 'On' : 'Off'}
        </label>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>{def.desc}</p>

      {def.configFields && enabled && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid var(--line)' }}>
          {def.configFields.map((f) => (
            f.type === 'checkbox' ? (
              <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500 }} title={f.hint}>
                <input type="checkbox" checked={!!config[f.key]} disabled={!isManager} onChange={(e) => setField(f.key, e.target.checked)} />
                {f.label}
              </label>
            ) : (
              <label key={f.key} style={{ fontSize: 12 }}>
                {f.label}
                <input
                  className="input" type={f.type} value={config[f.key]} disabled={!isManager}
                  onChange={(e) => setField(f.key, e.target.value)}
                  style={{ width: 80, marginTop: 2, display: 'block' }}
                />
              </label>
            )
          ))}
          {isManager && dirty && (
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} disabled={busy} onClick={saveConfig}>
              {busy ? <span className="spinner" /> : 'Save'}
            </button>
          )}
        </div>
      )}

      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
        {lastRun ? `Last ran ${AUTO.fmtDt(lastRun.ran_at)} — found ${lastRun.count}.` : 'Not run yet — checks run once daily.'}
      </div>
    </div>
  );
}

// Where this is headed — not toggleable yet. Each names its own real
// dependency honestly: the email/text drafting piece needs an OpenAI key
// (same as the "useAI" toggles above); actually answering a phone call
// needs a business phone number wired to a call provider (e.g. Twilio/
// Africa's Talking Voice) on top of that — an API key alone doesn't make a
// phone ring into this app. Nothing here pretends otherwise.
const ROADMAP = [
  { icon: RI.flow, name: 'Custom automation builder', needs: 'In development', desc: 'Chain your own trigger → action workflows across suites from this dashboard, instead of picking from a fixed list.' },
  { icon: RI.phone, name: 'AI call assistant', needs: 'Needs a business phone line + call provider', desc: 'Picks up customer calls, has a real conversation, and books what it agreed to as a task or CRM note.' },
  { icon: RI.waveform, name: 'Call transcripts & logs', needs: 'Needs the call assistant above', desc: 'Every call recorded as a searchable transcript in one log — who called, what they needed, what happened next.' },
  { icon: RI.mail, name: 'AI email replies', needs: 'Needs an OpenAI key (same as above)', desc: 'Drafts — and once you approve the pattern, sends — replies to routine customer emails in your own voice.' },
];

function RoadmapCard({ item }) {
  return (
    <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, borderStyle: 'dashed', opacity: 0.92 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0, background: 'var(--text-2)', color: '#fff' }}>{item.icon}</span>
        <span className="badge" style={{ fontSize: 10.5, background: 'var(--surface-2, #f3f1eb)' }}>Roadmap</span>
      </div>
      <div style={{ fontWeight: 650, fontSize: 14.5 }}>{item.name}</div>
      <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>{item.desc}</p>
      <div style={{ fontSize: 11.5, color: 'var(--accent-ink, #c24614)', fontWeight: 600, marginTop: 2 }}>{item.needs}</div>
    </div>
  );
}

export default function AutomationApp({ access }) {
  const isManager = access?.role === 'manager';
  const [settings, setSettings] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const flash = (msg, isErr = false) => { setToast({ msg, isErr }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([AUTO.getSettings(), AUTO.getRuns()])
      .then(([s, r]) => { setSettings(s); setRuns(r); })
      .catch((e) => flash(e.message, true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const settingFor = (key) => settings.find((s) => s.key === key);
  const lastRunFor = (key) => runs.find((r) => r.key === key);

  const saveSetting = async (key, enabled, config) => {
    try {
      const saved = await AUTO.setSetting(key, enabled, config);
      setSettings((s) => {
        const others = s.filter((x) => x.key !== key);
        return [...others, saved];
      });
      flash(`${enabled ? 'Enabled' : 'Disabled'}.`);
    } catch (e) { flash(e.message, true); }
  };

  const toggle = (key, enabled, config) => saveSetting(key, enabled, config);
  const liveCount = settings.filter((s) => s.enabled).length || AUTO.AUTOMATIONS.length;

  return (
    <div className="lv">
      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}
      {!loading && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Pre-built checks that run once a day across your other suites — no rules to configure, just switch on what's useful.
            </p>
            <span className="badge" style={{ fontSize: 11.5 }}>{liveCount} of {AUTO.AUTOMATIONS.length} live</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 14 }}>
            {AUTO.AUTOMATIONS.map((def) => (
              <AutomationCard
                key={def.key} def={def} setting={settingFor(def.key)} lastRun={lastRunFor(def.key)}
                isManager={isManager} onToggle={toggle} onConfigSave={saveSetting}
              />
            ))}
          </div>

          <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--line)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Smart business automation — what's next</h3>
            <p className="muted" style={{ fontSize: 13, margin: '0 0 16px', maxWidth: '70ch' }}>
              The bigger idea: automation that runs your busywork end to end — answering calls, logging every conversation, replying to routine emails, and letting you wire up your own workflows instead of picking from a fixed list. Not live yet — each card names exactly what it's waiting on.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
              {ROADMAP.map((item) => <RoadmapCard key={item.name} item={item} />)}
            </div>
          </div>
        </>
      )}
      <Toast toast={toast} />
    </div>
  );
}
