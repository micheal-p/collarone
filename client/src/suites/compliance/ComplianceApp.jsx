import { useCallback, useEffect, useMemo, useState } from 'react';
import * as C from './complianceApi.js';
import { useToast, useConfirm, Modal, EmptyState } from '../../components/ui.jsx';

const CSS = `
  .cp-note { background: #fffbe6; border: 1px solid #f0e2a0; color: #6b5900; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; line-height: 1.55; margin-bottom: 16px; }
  .cp-card { display: flex; align-items: center; gap: 14px; border: 1px solid var(--line); background: var(--surface); border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; }
  .cp-card.done { opacity: .62; }
  .cp-main { flex: 1; min-width: 0; }
  .cp-title { font-weight: 650; font-size: 14px; }
  .cp-sub { font-size: 12.5px; color: var(--text-2); margin-top: 2px; }
  .cp-chip { font-size: 11.5px; font-weight: 700; border-radius: 12px; padding: 3px 10px; white-space: nowrap; }
  .cp-chip.overdue { background: #fde7e9; color: #a4262c; }
  .cp-chip.soon    { background: #fff4ce; color: #7a5200; }
  .cp-chip.ok      { background: #dff6dd; color: #1a6a1a; }
  .cp-chip.done    { background: var(--surface-2); color: var(--text-2); }
  .cp-chip.setup   { background: #deecfd; color: #194b8f; }
  .cp-auth { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--text-2); font-weight: 700; }
  .cp-set-row { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--line); padding: 12px 4px; }
  .cp-set-row:last-child { border-bottom: none; }
`;

function DueChip({ item }) {
  if (item.done) return <span className="cp-chip done">Done</span>;
  if (item.needsSetup) return <span className="cp-chip setup">Set your month</span>;
  const d = C.daysUntil(item.due);
  if (d < 0) return <span className="cp-chip overdue">{Math.abs(d)}d overdue</span>;
  if (d === 0) return <span className="cp-chip overdue">Due today</span>;
  if (d <= 7) return <span className="cp-chip soon">{d}d left</span>;
  return <span className="cp-chip ok">{d}d left</span>;
}

function MarkModal({ item, onClose, onSaved, flash }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await C.markDone({ ruleKey: item.rule.key, period: item.period, note });
      flash(`${item.rule.title} marked done for ${item.periodLabel}.`);
      onSaved(); onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Mark done — ${item.rule.title}`} onClose={onClose}>
      <form onSubmit={submit}>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 0 }}>
          Period: <strong>{item.periodLabel}</strong>{item.due ? <> · due {C.fmtDue(item.due)}</> : null}
        </p>
        <div className="field"><label>Note / reference (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. remitted via Remita, ref 0012345" autoFocus />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Mark as done'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ComplianceApp({ access }) {
  const isManager = access?.role === 'manager';
  const [rules, setRules] = useState([]);
  const [prefs, setPrefs] = useState([]);
  const [marks, setMarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('deadlines');
  const [markModal, setMarkModal] = useState(null);
  const { flash, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await C.getCompliance();
      setRules(d.rules || []); setPrefs(d.prefs || []); setMarks(d.marks || []);
    } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);
  useEffect(() => { load(); }, [load]);

  const deadlines = useMemo(() => C.buildDeadlines(rules, prefs, marks), [rules, prefs, marks]);
  const openCount = deadlines.filter((d) => !d.done).length;
  const overdueCount = deadlines.filter((d) => !d.done && d.due && C.daysUntil(d.due) < 0).length;

  const undo = async (item) => {
    if (!item.mark) return;
    const ok = await confirm({ title: 'Undo this mark?', message: `${item.rule.title} for ${item.periodLabel} will show as not done again.`, confirmLabel: 'Undo' });
    if (!ok) return;
    try { await C.unmark(item.mark.id); flash('Mark removed.'); load(); } catch (e) { flash(e.message, true); }
  };

  const savePref = async (rule, patch) => {
    const cur = prefs.find((p) => p.rule_key === rule.key);
    try {
      await C.savePref({
        ruleKey: rule.key,
        enabled: patch.enabled ?? (cur ? cur.enabled : true),
        annualMonth: patch.annualMonth !== undefined ? patch.annualMonth : cur?.annual_month ?? null,
        annualDay: patch.annualDay !== undefined ? patch.annualDay : cur?.annual_day ?? null,
      });
      load();
    } catch (e) { flash(e.message, true); }
  };

  return (
    <div className="lv">
      <style>{CSS}</style>
      {toastNode}{confirmNode}

      <div className="cp-note">
        <strong>Guidance, not legal or tax advice.</strong> Statutory timelines shift by regulator circular and differ by state —
        confirm each deadline with your accountant or tax consultant. Collarone tracks them; it doesn't file or remit for you.
      </div>

      <div className="lv-tabs">
        <button className={`lv-tab ${tab === 'deadlines' ? 'active' : ''}`} onClick={() => setTab('deadlines')}>
          Deadlines{!loading && overdueCount > 0 ? ` (${overdueCount} overdue)` : ''}
        </button>
        <button className={`lv-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
        {isManager && <button className={`lv-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Settings</button>}
      </div>

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {!loading && tab === 'deadlines' && (
        !deadlines.length
          ? <EmptyState title="Nothing to track" hint="Every rule is switched off. A manager can re-enable them under Settings." />
          : deadlines.map((item) => (
            <div className={`cp-card${item.done ? ' done' : ''}`} key={`${item.rule.key}|${item.period}`}>
              <div className="cp-main">
                <div className="cp-title">{item.rule.title} <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>· {item.periodLabel}</span></div>
                <div className="cp-sub">{item.rule.description}</div>
                <div className="cp-sub" style={{ marginTop: 4 }}>
                  <span className="cp-auth">{item.rule.authority}</span>
                  {item.due ? <> · due <strong>{C.fmtDue(item.due)}</strong></> : ' · set your filing month in Settings'}
                </div>
              </div>
              <DueChip item={item} />
              {item.done
                ? <button className="btn btn-ghost btn-sm" onClick={() => undo(item)}>Undo</button>
                : <button className="btn btn-primary btn-sm" onClick={() => setMarkModal(item)} disabled={item.needsSetup}>Mark done</button>}
            </div>
          ))
      )}

      {!loading && tab === 'history' && (
        !marks.length
          ? <EmptyState title="No history yet" hint="Deadlines you mark as done will appear here with who did them and when." />
          : (
            <table className="table">
              <thead><tr><th>Obligation</th><th>Period</th><th>Done by</th><th>When</th><th>Note</th></tr></thead>
              <tbody>
                {marks.map((m) => {
                  const r = rules.find((x) => x.key === m.rule_key);
                  return (
                    <tr key={m.id}>
                      <td>{r?.title || m.rule_key}</td>
                      <td>{m.period}</td>
                      <td>{m.doer?.name || '—'}</td>
                      <td>{new Date(m.done_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td style={{ color: 'var(--text-2)' }}>{m.note || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
      )}

      {!loading && tab === 'settings' && isManager && (
        <div className="card" style={{ padding: '6px 16px' }}>
          {rules.map((r) => {
            const pref = prefs.find((p) => p.rule_key === r.key);
            const enabled = pref ? pref.enabled : true;
            return (
              <div className="cp-set-row" key={r.key}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, cursor: 'pointer' }}>
                  <input type="checkbox" checked={enabled} onChange={(e) => savePref(r, { enabled: e.target.checked })} />
                  <span>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{r.title}</span>
                    <span style={{ color: 'var(--text-2)', fontSize: 12.5 }}> · {r.frequency === 'monthly' ? `monthly, due the ${r.due_day}th of the following month` : 'annual'}</span>
                  </span>
                </label>
                {r.frequency === 'annual' && enabled && (
                  <select className="select" style={{ width: 150 }} value={pref?.annual_month || r.default_month || ''}
                    onChange={(e) => savePref(r, { annualMonth: Number(e.target.value) || null })}>
                    <option value="">Set month…</option>
                    {C.MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      {markModal && <MarkModal item={markModal} onClose={() => setMarkModal(null)} onSaved={load} flash={flash} />}
    </div>
  );
}
