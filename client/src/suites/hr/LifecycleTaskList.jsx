import { useEffect, useState } from 'react';
import * as L from './lifecycleApi.js';

const I = {
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>,
  undo:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-6.7L3 9"/></svg>,
};

// Shared checklist panel — used inside both Onboarding and Offboarding row expansions.
export default function LifecycleTaskList({ employeeId, exitId, phase, canGenerate, onGenerated, flash }) {
  const [tasks, setTasks] = useState(null);

  const load = () => {
    L.getLifecycleTasks(employeeId, phase).then(setTasks).catch((e) => flash(e.message, true));
  };
  useEffect(load, [employeeId, phase]); // eslint-disable-line

  const toggle = async (task) => {
    try {
      const updated = task.status === 'done' ? await L.reopenTask(task.id) : await L.completeTask(task.id, task.notes);
      setTasks((ts) => ts.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e) { flash(e.message, true); }
  };

  const generate = async () => {
    try { await onGenerated(); load(); } catch (e) { flash(e.message, true); }
  };

  if (tasks === null) return <div style={{ padding:'10px 0' }}><div className="boot-spinner" style={{ width:18, height:18 }} /></div>;

  const scoped = exitId ? tasks.filter((t) => t.exit_id === exitId) : tasks;
  const done = scoped.filter((t) => t.status === 'done').length;

  return (
    <div className="lc-checklist">
      <div className="lc-checklist-head">
        <span style={{ fontSize:13, fontWeight:600 }}>Checklist — {done}/{scoped.length} done</span>
        {scoped.length === 0 && canGenerate && (
          <button className="btn btn-primary" style={{ fontSize:12, padding:'3px 12px' }} onClick={generate}>Generate checklist</button>
        )}
      </div>
      {scoped.length === 0 && <p className="muted" style={{ fontSize:13, margin:'6px 0 0' }}>No checklist yet.</p>}
      {scoped.map((t) => (
        <label key={t.id} className={`lc-task-row ${t.status === 'done' ? 'done' : ''}`}>
          <button type="button" className={`lc-check-btn ${t.status === 'done' ? 'checked' : ''}`} onClick={() => toggle(t)} aria-label="Toggle done">
            {t.status === 'done' ? I.check : null}
          </button>
          <span className="lc-task-title">{t.title}</span>
          <span className="lc-task-cat">{L.CATEGORY_LABEL[t.category] || t.category}</span>
          <span className="lc-task-due muted">{L.fmtDate(t.due_date)}</span>
          {t.status === 'done' && t.completedBy && <span className="muted lc-task-by">{I.undo} {t.completedBy.name}</span>}
        </label>
      ))}
    </div>
  );
}
