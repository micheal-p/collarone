import { useCallback, useEffect, useState } from 'react';
import * as AUTO from './automationApi.js';

function Toast({ toast }) { if (!toast) return null; return <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>; }

function AutomationCard({ def, setting, lastRun, isManager, onToggle, onConfigSave }) {
  const enabled = setting ? setting.enabled : true;
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
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{def.name}</div>
          <span className="badge" style={{ fontSize: 11 }}>{def.suite}</span>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500 }}>
          <input type="checkbox" checked={enabled} disabled={!isManager || busy} onChange={(e) => onToggle(def.key, e.target.checked, config)} />
          {enabled ? 'On' : 'Off'}
        </label>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>{def.desc}</p>

      {def.configFields && enabled && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {def.configFields.map((f) => (
            <label key={f.key} style={{ fontSize: 12 }}>
              {f.label}
              <input
                className="input" type={f.type} value={config[f.key]} disabled={!isManager}
                onChange={(e) => setField(f.key, e.target.value)}
                style={{ width: 80, marginTop: 2, display: 'block' }}
              />
            </label>
          ))}
          {isManager && dirty && (
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} disabled={busy} onClick={saveConfig}>
              {busy ? <span className="spinner" /> : 'Save'}
            </button>
          )}
        </div>
      )}

      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {lastRun ? `Last ran ${AUTO.fmtDt(lastRun.ran_at)} — found ${lastRun.count}.` : 'Not run yet — checks run once daily.'}
      </div>
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

  return (
    <div className="lv">
      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}
      {!loading && (
        <>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Six pre-built checks that run once a day across your other suites — no rules to configure, just switch on what's useful.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {AUTO.AUTOMATIONS.map((def) => (
              <AutomationCard
                key={def.key} def={def} setting={settingFor(def.key)} lastRun={lastRunFor(def.key)}
                isManager={isManager} onToggle={toggle} onConfigSave={saveSetting}
              />
            ))}
          </div>
        </>
      )}
      <Toast toast={toast} />
    </div>
  );
}
