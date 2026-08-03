import { useCallback, useEffect, useState } from 'react';
import * as AUTO from './automationApi.js';
import { SUITE_META } from '../../config/suites.js';
import SuiteIcon from '../../components/SuiteIcon.jsx';
import { Modal, useConfirm, useToast } from '../../components/ui.jsx';

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
    try {
      await onConfigSave(def.key, enabled, config, `${def.name} settings saved.`);
      setDirty(false); // only clear once the save actually succeeded
    } catch {
      /* error already flashed upstream — keep the Save button visible */
    } finally { setBusy(false); }
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
        {lastRun ? `Last ran ${AUTO.fmtDt(lastRun.ran_at)}, found ${lastRun.count}.` : 'Not run yet, checks run once daily.'}
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
  { icon: RI.phone, name: 'AI call assistant', needs: 'Needs a business phone line + call provider', desc: 'Picks up customer calls, has a real conversation, and books what it agreed to as a task or CRM note.' },
  { icon: RI.waveform, name: 'Call transcripts & logs', needs: 'Needs the call assistant above', desc: 'Every call recorded as a searchable transcript in one log, who called, what they needed, what happened next.' },
  { icon: RI.mail, name: 'AI email replies', needs: 'Needs an OpenAI key (same as above)', desc: 'Drafts, and once you approve the pattern, sends, replies to routine customer emails in your own voice.' },
];

function RoadmapCard({ item }) {
  return (
    <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, borderStyle: 'dashed', opacity: 0.92 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0, background: 'var(--text-2)', color: '#fff' }}>{item.icon}</span>
        <span className="badge" style={{ fontSize: 10.5, background: 'var(--surface-2)' }}>Coming soon</span>
      </div>
      <div style={{ fontWeight: 650, fontSize: 14.5 }}>{item.name}</div>
      <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>{item.desc}</p>
      <div style={{ fontSize: 11.5, color: 'var(--brand-dark)', fontWeight: 600, marginTop: 2 }}>{item.needs}</div>
    </div>
  );
}

export default function AutomationApp({ access }) {
  const isManager = access?.role === 'manager';
  const [settings, setSettings] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const { flash, toastNode } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([AUTO.getSettings(), AUTO.getRuns()])
      .then(([s, r]) => { setSettings(s); setRuns(r); })
      .catch((e) => flash(e.message, true))
      .finally(() => setLoading(false));
  }, [flash]);
  useEffect(() => { load(); }, [load]);

  const settingFor = (key) => settings.find((s) => s.key === key);
  const lastRunFor = (key) => runs.find((r) => r.key === key);

  const saveSetting = async (key, enabled, config, msg) => {
    const def = AUTO.AUTOMATIONS.find((a) => a.key === key);
    try {
      const saved = await AUTO.setSetting(key, enabled, config);
      setSettings((s) => {
        const others = s.filter((x) => x.key !== key);
        return [...others, saved];
      });
      flash(msg || `${def?.name || 'Automation'} ${enabled ? 'enabled' : 'disabled'}.`);
    } catch (e) { flash(e.message, true); throw e; }
  };

  const toggle = (key, enabled, config) => { saveSetting(key, enabled, config).catch(() => {}); };
  // A missing setting row means the automation defaults to enabled, so count
  // the EFFECTIVE state per automation — and 0 genuinely shows "0 of N".
  const liveCount = AUTO.AUTOMATIONS.filter((a) => {
    const s = settings.find((x) => x.key === a.key);
    return s ? s.enabled : true;
  }).length;

  return (
    <div className="lv">
      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}
      {!loading && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Pre-built checks that run once a day across your other suites, no rules to configure, just switch on what's useful.
            </p>
            <span className="badge" style={{ fontSize: 11.5 }}>{liveCount} of {AUTO.AUTOMATIONS.length} live</span>
          </div>
          {!isManager && (
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Manager access is required to change these settings.</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 14 }}>
            {AUTO.AUTOMATIONS.map((def) => (
              <AutomationCard
                key={def.key} def={def} setting={settingFor(def.key)} lastRun={lastRunFor(def.key)}
                isManager={isManager} onToggle={toggle} onConfigSave={saveSetting}
              />
            ))}
          </div>

          <RulesSection isManager={isManager} flash={flash} />

          <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--line)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Smart business automation, what's next</h3>
            <p className="muted" style={{ fontSize: 13, margin: '0 0 16px', maxWidth: '70ch' }}>
              The bigger idea: automation that runs your busywork end to end, answering calls, logging every conversation, replying to routine emails. Not live yet, each card names exactly what it's waiting on.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
              {ROADMAP.map((item) => <RoadmapCard key={item.name} item={item} />)}
            </div>
          </div>
        </>
      )}
      {toastNode}
    </div>
  );
}

/* ==== Custom rules — "when X happens (or every Monday), do Y" ==================
   The org builds its own automations on the event spine, from menus (or by
   describing them, AI drafts into the SAME fenced structure, then the human
   reviews and saves). Actions are the safe set only; the server executor
   re-validates everything regardless of what the UI sent. */

const ruleTriggerLabel = (r) => {
  if (r.trigger_kind === 'event') return AUTO.RULE_EVENTS.find((e) => e.key === r.event_type)?.label || r.event_type;
  const s = r.schedule || {};
  if (s.every === 'day') return 'Every day';
  if (s.every === 'week') return `Every ${AUTO.DOW[s.dow ?? 1]}`;
  if (s.every === 'month') return `Monthly on day ${s.dom ?? 1}`;
  return 'Schedule';
};
const ruleActionLabel = (r) => AUTO.RULE_ACTIONS.find((a) => a.key === r.action_kind)?.label || r.action_kind;

function RuleModal({ staff, aiEnabled, onClose, onSaved, flash }) {
  const [prompt, setPrompt] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [f, setF] = useState({
    name: '', trigger_kind: 'event', event_type: AUTO.RULE_EVENTS[0].key,
    schedule: { every: 'week', dow: 1 }, action_kind: 'task',
    action_config: { title: '', description: '', priority: 'medium', assigneeId: '', message: '', subject: '', recipientIds: [] },
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setCfg = (k, v) => setF((s) => ({ ...s, action_config: { ...s.action_config, [k]: v } }));

  const draft = async () => {
    setDrafting(true);
    try {
      const rule = await AUTO.aiDraftRule(prompt);
      setF({
        name: rule.name, trigger_kind: rule.trigger_kind,
        event_type: rule.event_type || AUTO.RULE_EVENTS[0].key,
        schedule: rule.schedule || { every: 'week', dow: 1 },
        action_kind: rule.action_kind,
        action_config: {
          title: '', description: '', priority: 'medium', assigneeId: '', message: '', subject: '', recipientIds: [],
          ...rule.action_config,
          assigneeId: rule.action_config?.assigneeId || '',
        },
      });
      flash('Drafted, review below, adjust anything, then save.');
    } catch (e) { flash(e.message, true); } finally { setDrafting(false); }
  };

  const save = async () => {
    if (!f.name.trim()) { flash('Give the rule a name.', true); return; }
    setBusy(true);
    try {
      const cfg = f.action_kind === 'task'
        ? { title: f.action_config.title || f.name, description: f.action_config.description, priority: f.action_config.priority, assigneeId: f.action_config.assigneeId || null }
        : f.action_kind === 'email'
          ? { subject: f.action_config.subject || f.name, message: f.action_config.message, recipientIds: f.action_config.recipientIds }
          : { message: f.action_config.message || f.name };
      const rule = await AUTO.createRule({
        name: f.name.trim(), trigger_kind: f.trigger_kind,
        event_type: f.trigger_kind === 'event' ? f.event_type : null,
        schedule: f.trigger_kind === 'schedule' ? f.schedule : null,
        action_kind: f.action_kind, action_config: cfg,
      });
      onSaved(rule);
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  const toggleRecipient = (id) => setCfg('recipientIds',
    f.action_config.recipientIds.includes(id)
      ? f.action_config.recipientIds.filter((x) => x !== id)
      : [...f.action_config.recipientIds, id].slice(0, 10));

  return (
    <Modal title="New automation rule" onClose={onClose} wide>
      {aiEnabled && (
        <div style={{ background: 'var(--brand-100, rgba(255,91,31,0.08))', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 650, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--brand)" aria-hidden="true"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2zm7 13l.9 3.1L23 19l-3.1.9L19 23l-.9-3.1L15 19l3.1-.9L19 15z" /></svg>
            Describe it, we&apos;ll set it up
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: 1, minWidth: 220 }} value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder={'e.g. "when a deal is won, congratulate everyone" or "every Friday remind Ops to send the report"'}
              onKeyDown={(e) => e.key === 'Enter' && prompt.trim().length >= 8 && draft()} />
            <button className="btn btn-primary" disabled={drafting || prompt.trim().length < 8} onClick={draft}>
              {drafting ? <span className="spinner" /> : 'Draft with AI'}
            </button>
          </div>
        </div>
      )}

      <div className="field"><label>Rule name</label>
        <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. New joiner IT setup" />
      </div>

      <div className="form-row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="field" style={{ minWidth: 160 }}>
          <label>When</label>
          <select className="select" value={f.trigger_kind} onChange={(e) => set('trigger_kind', e.target.value)}>
            <option value="event">Something happens…</option>
            <option value="schedule">On a schedule…</option>
          </select>
        </div>
        {f.trigger_kind === 'event' ? (
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label>Which event</label>
            <select className="select" value={f.event_type} onChange={(e) => set('event_type', e.target.value)}>
              {AUTO.RULE_EVENTS.map((ev) => <option key={ev.key} value={ev.key}>{ev.label}</option>)}
            </select>
          </div>
        ) : (
          <>
            <div className="field" style={{ minWidth: 130 }}>
              <label>Repeats</label>
              <select className="select" value={f.schedule.every} onChange={(e) => set('schedule', { every: e.target.value, dow: 1, dom: 1 })}>
                <option value="day">Every day</option><option value="week">Weekly</option><option value="month">Monthly</option>
              </select>
            </div>
            {f.schedule.every === 'week' && (
              <div className="field" style={{ minWidth: 130 }}>
                <label>On</label>
                <select className="select" value={f.schedule.dow} onChange={(e) => set('schedule', { ...f.schedule, dow: Number(e.target.value) })}>
                  {AUTO.DOW.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            {f.schedule.every === 'month' && (
              <div className="field" style={{ minWidth: 110 }}>
                <label>Day of month</label>
                <input className="input" type="number" min="1" max="28" value={f.schedule.dom}
                  onChange={(e) => set('schedule', { ...f.schedule, dom: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} />
              </div>
            )}
          </>
        )}
        <div className="field" style={{ minWidth: 190 }}>
          <label>Do</label>
          <select className="select" value={f.action_kind} onChange={(e) => set('action_kind', e.target.value)}>
            {AUTO.RULE_ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </div>
      </div>

      {f.action_kind === 'task' && (
        <>
          <div className="form-row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div className="field" style={{ flex: 1, minWidth: 200 }}><label>Task title</label>
              <input className="input" value={f.action_config.title} onChange={(e) => setCfg('title', e.target.value)} placeholder="Prepare laptop for {name}" /></div>
            <div className="field" style={{ minWidth: 150 }}><label>Assign to</label>
              <select className="select" value={f.action_config.assigneeId} onChange={(e) => setCfg('assigneeId', e.target.value)}>
                <option value="">— Unassigned —</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div className="field" style={{ minWidth: 120 }}><label>Priority</label>
              <select className="select" value={f.action_config.priority} onChange={(e) => setCfg('priority', e.target.value)}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select></div>
          </div>
          <div className="field"><label>Details <span className="muted">— optional</span></label>
            <textarea className="input" style={{ minHeight: 60 }} value={f.action_config.description} onChange={(e) => setCfg('description', e.target.value)} /></div>
        </>
      )}
      {(f.action_kind === 'banner' || f.action_kind === 'bell') && (
        <div className="field"><label>Message</label>
          <input className="input" value={f.action_config.message} onChange={(e) => setCfg('message', e.target.value)}
            placeholder={f.action_kind === 'bell' ? 'We won {title}, {valueNaira}!' : 'Message shown across the workspace'} /></div>
      )}
      {f.action_kind === 'email' && (
        <>
          <div className="field"><label>Subject</label>
            <input className="input" value={f.action_config.subject} onChange={(e) => setCfg('subject', e.target.value)} /></div>
          <div className="field"><label>Message</label>
            <textarea className="input" style={{ minHeight: 60 }} value={f.action_config.message} onChange={(e) => setCfg('message', e.target.value)} /></div>
          <div className="field"><label>Send to <span className="muted">— your staff only, max 10</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {staff.map((s) => (
                <label key={s.id} className={`pill ${f.action_config.recipientIds.includes(s.id) ? 'active' : ''}`} style={{ cursor: 'pointer' }}>
                  <input type="checkbox" style={{ display: 'none' }} checked={f.action_config.recipientIds.includes(s.id)} onChange={() => toggleRecipient(s.id)} />
                  {s.name}
                </label>
              ))}
            </div></div>
        </>
      )}

      <p className="muted" style={{ fontSize: 11.5, margin: '10px 0 0', lineHeight: 1.5 }}>
        Placeholders like {'{name}'}, {'{title}'}, {'{party}'}, {'{total}'} fill in from the event. Rules run within a few minutes of the trigger; capped at 50 actions a day each.
      </p>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'Save rule'}</button>
      </div>
    </Modal>
  );
}

function RulesSection({ isManager, flash }) {
  const [rules, setRules] = useState([]);
  const [staff, setStaff] = useState([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [modal, setModal] = useState(false);
  const { confirm, confirmNode } = useConfirm();

  useEffect(() => {
    AUTO.getRules().then(setRules).catch(() => {});
    AUTO.aiStatus().then(setAiEnabled);
    import('../tasks/taskApi.js').then((T) => T.getStaff().then(setStaff)).catch(() => {});
  }, []);

  const toggle = async (r) => {
    try { const saved = await AUTO.updateRule(r.id, { enabled: !r.enabled }); setRules((rs) => rs.map((x) => (x.id === saved.id ? saved : x))); }
    catch (e) { flash(e.message, true); }
  };
  const remove = async (r) => {
    const ok = await confirm({ title: `Delete "${r.name}"?`, message: 'The rule stops running immediately.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await AUTO.deleteRule(r.id); setRules((rs) => rs.filter((x) => x.id !== r.id)); flash('Rule deleted.'); }
    catch (e) { flash(e.message, true); }
  };

  return (
    <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Your rules</h3>
          <p className="muted" style={{ fontSize: 13, margin: 0, maxWidth: '70ch' }}>
            Build your own: when something happens, or on a schedule, create a task, show a banner, ring the bell, or email your staff.{aiEnabled ? ' Or just describe it and AI drafts it for you.' : ''}
          </p>
        </div>
        {isManager && <button className="btn btn-primary" onClick={() => setModal(true)}>New rule</button>}
      </div>
      {rules.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, margin: '16px 0 0' }}>
          No rules yet{isManager ? ', try one: “when a new staff member joins → task for IT: prepare their laptop.”' : '.'}
        </p>
      ) : (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px', background: 'var(--surface)', opacity: r.enabled ? 1 : 0.55 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 650, fontSize: 14 }}>{r.name}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{ruleTriggerLabel(r)} → {ruleActionLabel(r)}{r.runs_today > 0 ? ` · ran ${r.runs_today}× today` : ''}</div>
              </div>
              {isManager && (
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggle(r)}>{r.enabled ? 'Pause' : 'Resume'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(r)}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {modal && <RuleModal staff={staff} aiEnabled={aiEnabled} flash={flash}
        onClose={() => setModal(false)}
        onSaved={(rule) => { setRules((rs) => [rule, ...rs]); setModal(false); flash(`"${rule.name}" is live.`); }} />}
      {confirmNode}
    </div>
  );
}
