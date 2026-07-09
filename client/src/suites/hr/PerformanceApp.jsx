import { useEffect, useMemo, useState } from 'react';
import * as PF from './performanceApi.js';

const I = {
  add:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  close: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
};

/* ---- GoalModal --------------------------------------------------------------- */
function GoalModal({ staff, onClose, onSaved, onError }) {
  const [f, setF] = useState({ employeeId:'', title:'', description:'', targetDate:'' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!f.employeeId || !f.title.trim()) return onError('Employee and title are required.');
    setBusy(true);
    try { onSaved(await PF.createGoal(f)); } catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>New goal</h2><button className="iconbtn dark" onClick={onClose}>{I.close}</button></div>
        <form className="modal-body" onSubmit={submit}>
          <div className="field"><label>Employee</label>
            <select className="select" value={f.employeeId} onChange={(e) => set('employeeId', e.target.value)} required autoFocus>
              <option value="">— Select —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div className="field"><label>Title</label>
            <input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} required /></div>
          <div className="field"><label>Description <span className="muted">(optional)</span></label>
            <textarea className="input" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} style={{ resize:'vertical', fontFamily:'inherit' }} /></div>
          <div className="field"><label>Target date <span className="muted">(optional)</span></label>
            <input className="input" type="date" value={f.targetDate} onChange={(e) => set('targetDate', e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Create goal'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GoalsTab({ staff, flash }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const load = () => { setLoading(true); PF.getGoals().then(setGoals).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line

  const setStatus = async (g, status) => {
    try { const updated = await PF.updateGoal(g.id, { status }); setGoals((gs) => gs.map((x) => (x.id === updated.id ? updated : x))); }
    catch (e) { flash(e.message, true); }
  };
  const remove = async (g) => {
    if (!confirm(`Delete goal "${g.title}"?`)) return;
    try { await PF.deleteGoal(g.id); setGoals((gs) => gs.filter((x) => x.id !== g.id)); } catch (e) { flash(e.message, true); }
  };

  return (
    <>
      <div className="filterbar" style={{ marginTop:8 }}>
        <button className="btn btn-primary lv-apply" onClick={() => setModal(true)}>{I.add} New goal</button>
        <span className="count" style={{ marginLeft:'auto' }}>{goals.length} goal{goals.length===1?'':'s'}</span>
      </div>
      {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Employee</th><th>Goal</th><th>Target</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {goals.length === 0 && <tr><td colSpan={5} className="td-empty">No goals set yet.</td></tr>}
              {goals.map((g) => (
                <tr key={g.id}>
                  <td>{g.employee?.name}</td>
                  <td><div style={{ fontWeight:500 }}>{g.title}</div>{g.description && <div className="muted" style={{ fontSize:12 }}>{g.description}</div>}</td>
                  <td className="muted" style={{ fontSize:13 }}>{PF.fmtDate(g.target_date)}</td>
                  <td>
                    <select className="select" value={g.status} onChange={(e) => setStatus(g, e.target.value)} style={{ fontSize:13, padding:'3px 8px', height:'auto' }}>
                      {Object.entries(PF.GOAL_STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td><button className="iconbtn danger-icon" onClick={() => remove(g)}>{I.close}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <GoalModal staff={staff} onClose={() => setModal(false)}
        onSaved={(g) => { setGoals((gs) => [g, ...gs]); setModal(false); flash('Goal created.'); }}
        onError={(m) => flash(m, true)} />}
    </>
  );
}

/* ---- ReviewModal --------------------------------------------------------------- */
function ReviewModal({ staff, onClose, onSaved, onError }) {
  const [f, setF] = useState({ employeeId:'', cycleLabel:'' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!f.employeeId || !f.cycleLabel.trim()) return onError('Employee and cycle label are required.');
    setBusy(true);
    try { onSaved(await PF.createReview(f)); } catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>New review</h2><button className="iconbtn dark" onClick={onClose}>{I.close}</button></div>
        <form className="modal-body" onSubmit={submit}>
          <div className="field"><label>Employee</label>
            <select className="select" value={f.employeeId} onChange={(e) => setF((s) => ({ ...s, employeeId: e.target.value }))} required autoFocus>
              <option value="">— Select —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div className="field"><label>Cycle</label>
            <input className="input" value={f.cycleLabel} onChange={(e) => setF((s) => ({ ...s, cycleLabel: e.target.value }))} placeholder="e.g. H1 2026, Probation review" required /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Start review'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReviewsTab({ staff, flash }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const load = () => { setLoading(true); PF.getReviews().then(setReviews).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line

  const patch = async (r, body) => {
    try { const updated = await PF.updateReview(r.id, body); setReviews((rs) => rs.map((x) => (x.id === updated.id ? updated : x))); }
    catch (e) { flash(e.message, true); }
  };

  return (
    <>
      <div className="filterbar" style={{ marginTop:8 }}>
        <button className="btn btn-primary lv-apply" onClick={() => setModal(true)}>{I.add} New review</button>
        <span className="count" style={{ marginLeft:'auto' }}>{reviews.length} review{reviews.length===1?'':'s'}</span>
      </div>
      {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : reviews.length === 0 ? (
        <p className="muted" style={{ padding:'24px 0' }}>No reviews yet.</p>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:8 }}>
          {reviews.map((r) => {
            const st = PF.REVIEW_STATUS[r.status];
            return (
              <div key={r.id} className="lc-interview-card">
                <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                  <div><b>{r.employee?.name}</b> <span className="muted">— {r.cycle_label}</span></div>
                  <span className={`lc-badge ${st.cls}`}>{st.label}</span>
                </div>
                <div className="muted" style={{ fontSize:12, marginTop:4 }}>Reviewer: {r.reviewer?.name}</div>
                {r.status === 'draft' && (
                  <div style={{ marginTop:10 }}>
                    <div className="form-grid">
                      <div className="field"><label>Rating</label>
                        <select className="select" value={r.rating || ''} onChange={(e) => patch(r, { rating: e.target.value ? Number(e.target.value) : null })}>
                          <option value="">— Unrated —</option>
                          {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select></div>
                    </div>
                    <div className="field"><label>Strengths</label>
                      <textarea className="input" rows={2} defaultValue={r.strengths} onBlur={(e) => e.target.value !== r.strengths && patch(r, { strengths: e.target.value })} style={{ resize:'vertical', fontFamily:'inherit' }} /></div>
                    <div className="field"><label>Areas to improve</label>
                      <textarea className="input" rows={2} defaultValue={r.improvements} onBlur={(e) => e.target.value !== r.improvements && patch(r, { improvements: e.target.value })} style={{ resize:'vertical', fontFamily:'inherit' }} /></div>
                    <button className="btn btn-primary" style={{ marginTop:6 }} onClick={() => patch(r, { status: 'submitted' })}>Submit to employee</button>
                  </div>
                )}
                {r.status !== 'draft' && (
                  <div style={{ marginTop:8, fontSize:13 }}>
                    {r.rating && <div>Rating: {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>}
                    {r.strengths && <p style={{ margin:'6px 0 0' }}><b>Strengths:</b> {r.strengths}</p>}
                    {r.improvements && <p style={{ margin:'4px 0 0' }}><b>To improve:</b> {r.improvements}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {modal && <ReviewModal staff={staff} onClose={() => setModal(false)}
        onSaved={(r) => { setReviews((rs) => [r, ...rs]); setModal(false); flash('Review started.'); }}
        onError={(m) => flash(m, true)} />}
    </>
  );
}

/* ---- TrainingModal --------------------------------------------------------------- */
function TrainingModal({ staff, onClose, onSaved, onError }) {
  const [f, setF] = useState({ employeeId:'', title:'', provider:'', completedDate:'', certificateExpiry:'' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!f.employeeId || !f.title.trim()) return onError('Employee and title are required.');
    setBusy(true);
    try { onSaved(await PF.createTraining(f)); } catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Add training record</h2><button className="iconbtn dark" onClick={onClose}>{I.close}</button></div>
        <form className="modal-body" onSubmit={submit}>
          <div className="field"><label>Employee</label>
            <select className="select" value={f.employeeId} onChange={(e) => set('employeeId', e.target.value)} required autoFocus>
              <option value="">— Select —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div className="field"><label>Title / certification</label>
            <input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} required /></div>
          <div className="field"><label>Provider <span className="muted">(optional)</span></label>
            <input className="input" value={f.provider} onChange={(e) => set('provider', e.target.value)} /></div>
          <div className="form-grid">
            <div className="field"><label>Completed</label>
              <input className="input" type="date" value={f.completedDate} onChange={(e) => set('completedDate', e.target.value)} /></div>
            <div className="field"><label>Certificate expiry <span className="muted">(optional)</span></label>
              <input className="input" type="date" value={f.certificateExpiry} onChange={(e) => set('certificateExpiry', e.target.value)} /></div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TrainingTab({ staff, flash }) {
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const load = () => { setLoading(true); PF.getTrainings().then(setTrainings).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line

  const remove = async (t) => {
    if (!confirm(`Delete "${t.title}"?`)) return;
    try { await PF.deleteTraining(t.id); setTrainings((ts) => ts.filter((x) => x.id !== t.id)); } catch (e) { flash(e.message, true); }
  };

  return (
    <>
      <div className="filterbar" style={{ marginTop:8 }}>
        <button className="btn btn-primary lv-apply" onClick={() => setModal(true)}>{I.add} Add record</button>
        <span className="count" style={{ marginLeft:'auto' }}>{trainings.length}</span>
      </div>
      {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Employee</th><th>Training</th><th>Provider</th><th>Completed</th><th>Cert. expiry</th><th></th></tr></thead>
            <tbody>
              {trainings.length === 0 && <tr><td colSpan={6} className="td-empty">No training records yet.</td></tr>}
              {trainings.map((t) => (
                <tr key={t.id}>
                  <td>{t.employee?.name}</td>
                  <td style={{ fontWeight:500 }}>{t.title}</td>
                  <td className="muted" style={{ fontSize:13 }}>{t.provider || '—'}</td>
                  <td className="muted" style={{ fontSize:13 }}>{PF.fmtDate(t.completed_date)}</td>
                  <td>
                    {t.certificate_expiry ? (
                      <span className={PF.isExpired(t.certificate_expiry) ? 'lc-badge lc-stage-rejected' : PF.isExpiringSoon(t.certificate_expiry) ? 'lc-badge lc-exit-settled' : 'muted'} style={{ fontSize:13 }}>
                        {PF.fmtDate(t.certificate_expiry)}
                      </span>
                    ) : '—'}
                  </td>
                  <td><button className="iconbtn danger-icon" onClick={() => remove(t)}>{I.close}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <TrainingModal staff={staff} onClose={() => setModal(false)}
        onSaved={(t) => { setTrainings((ts) => [t, ...ts]); setModal(false); flash('Training record added.'); }}
        onError={(m) => flash(m, true)} />}
    </>
  );
}

/* ---- Main PerformanceApp ------------------------------------------------------------ */
export default function PerformanceApp({ staff }) {
  const [tab, setTab] = useState('goals');
  const [toast, setToast] = useState(null);
  const flash = (msg, isErr) => { setToast({ msg, isErr }); setTimeout(() => setToast(null), 2800); };

  return (
    <div>
      <div className="lv-tabs">
        <button className={`lv-tab ${tab === 'goals' ? 'active' : ''}`} onClick={() => setTab('goals')}>Goals</button>
        <button className={`lv-tab ${tab === 'reviews' ? 'active' : ''}`} onClick={() => setTab('reviews')}>Reviews</button>
        <button className={`lv-tab ${tab === 'training' ? 'active' : ''}`} onClick={() => setTab('training')}>Training &amp; certifications</button>
      </div>
      {tab === 'goals'    && <GoalsTab staff={staff} flash={flash} />}
      {tab === 'reviews'  && <ReviewsTab staff={staff} flash={flash} />}
      {tab === 'training' && <TrainingTab staff={staff} flash={flash} />}
      {toast && <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>}
    </div>
  );
}
