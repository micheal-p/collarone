import { useEffect, useMemo, useState } from 'react';
import * as L from './lifecycleApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useToast, useConfirm, Modal, EmptyState } from '../../components/ui.jsx';

/* ---- Stars — 5 small SVG stars, filled up to `rating` ----------------------- */
function Stars({ rating }) {
  return (
    <span style={{ display:'inline-flex', gap:1, verticalAlign:'middle' }} aria-label={`${rating} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width="12" height="12" viewBox="0 0 24 24" fill={n <= rating ? 'currentColor' : 'none'}
          stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z" />
        </svg>
      ))}
    </span>
  );
}

const I = {
  add:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  close:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  back:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>,
  expand: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>,
  resume: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  edit:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2 2 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>,
  link:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.5-1.5"/></svg>,
};

/* ---- RequisitionModal -------------------------------------------------------- */
function RequisitionModal({ req, departments, staff, onClose, onSaved, onError }) {
  const [f, setF] = useState({
    title: req?.title || '', departmentId: req?.department_id || '', hiringManagerId: req?.hiring_manager_id || '',
    headcount: req?.headcount || 1, employmentType: req?.employment_type || 'full_time',
    location: req?.location || '', description: req?.description || '', status: req?.status || 'draft',
    minExperienceYears: req?.min_experience_years ?? '', salaryMin: req?.salary_min ?? '', salaryMax: req?.salary_max ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return onError('Title is required.');
    setBusy(true);
    try {
      const payload = {
        ...f, departmentId: f.departmentId ? Number(f.departmentId) : null, hiringManagerId: f.hiringManagerId || null,
        headcount: Number(f.headcount) || 1,
        minExperienceYears: f.minExperienceYears !== '' ? Number(f.minExperienceYears) : null,
        salaryMin: f.salaryMin !== '' ? Number(f.salaryMin) : null,
        salaryMax: f.salaryMax !== '' ? Number(f.salaryMax) : null,
      };
      const saved = req ? await L.updateRequisition(req.id, payload) : await L.createRequisition(payload);
      onSaved(saved);
    } catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={req ? 'Edit requisition' : 'New requisition'} onClose={onClose} wide>
      <form onSubmit={submit}>
          <div className="field"><label>Role title</label>
            <input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} required autoFocus /></div>
          <div className="form-grid">
            <div className="field"><label>Department</label>
              <select className="select" value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                <option value="">— None —</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select></div>
            <div className="field"><label>Hiring manager</label>
              <select className="select" value={f.hiringManagerId} onChange={(e) => set('hiringManagerId', e.target.value)}>
                <option value="">— None —</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
          </div>
          <div className="form-grid">
            <div className="field"><label>Headcount</label>
              <input className="input" type="number" min="1" value={f.headcount} onChange={(e) => set('headcount', e.target.value)} /></div>
            <div className="field"><label>Employment type</label>
              <select className="select" value={f.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
                <option value="full_time">Full-time</option><option value="part_time">Part-time</option>
                <option value="contract">Contract</option><option value="intern">Intern</option>
              </select></div>
            <div className="field"><label>Location</label>
              <input className="input" value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Lagos" /></div>
          </div>
          <div className="form-grid">
            <div className="field"><label>Min. experience (years) <span className="muted">(optional)</span></label>
              <input className="input" type="number" min="0" step="0.5" value={f.minExperienceYears} onChange={(e) => set('minExperienceYears', e.target.value)} /></div>
            <div className="field"><label>Salary min (₦/yr) <span className="muted">(optional)</span></label>
              <input className="input" type="number" min="0" value={f.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} /></div>
            <div className="field"><label>Salary max (₦/yr) <span className="muted">(optional)</span></label>
              <input className="input" type="number" min="0" value={f.salaryMax} onChange={(e) => set('salaryMax', e.target.value)} /></div>
          </div>
          <p className="muted" style={{ fontSize:12, margin:'-6px 0 12px' }}>Experience and salary range are shown on the public posting and used to score inbound applicants.</p>
          <div className="field"><label>Description <span className="muted">(optional)</span></label>
            <textarea className="input" rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} style={{ resize:'vertical', fontFamily:'inherit' }} /></div>
          <div className="field"><label>Status</label>
            <select className="select" value={f.status} onChange={(e) => set('status', e.target.value)}>
              {Object.entries(L.REQ_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : req ? 'Save' : 'Create requisition'}</button>
          </div>
      </form>
    </Modal>
  );
}

/* ---- CandidateModal ----------------------------------------------------------- */
function CandidateModal({ requisitionId, onClose, onSaved, onError }) {
  const [f, setF] = useState({ name:'', email:'', phone:'', source:'other', notes:'' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim() || !f.email.trim()) return onError('Name and email are required.');
    setBusy(true);
    try {
      const app = await L.addCandidate(requisitionId, f);
      if (file) {
        const path = await L.uploadResume(app.candidate.id, file);
        await L.updateCandidate(app.candidate.id, { resumePath: path });
        app.candidate.resume_path = path;
      }
      onSaved(app);
    } catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Add candidate" onClose={onClose} wide>
      <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field"><label>Full name</label>
              <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></div>
            <div className="field"><label>Email</label>
              <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required /></div>
          </div>
          <div className="form-grid">
            <div className="field"><label>Phone</label>
              <input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
            <div className="field"><label>Source</label>
              <select className="select" value={f.source} onChange={(e) => set('source', e.target.value)}>
                <option value="referral">Referral</option><option value="job_board">Job board</option>
                <option value="agency">Agency</option><option value="walk_in">Walk-in</option><option value="other">Other</option>
              </select></div>
          </div>
          <div className="field"><label>Resume <span className="muted">(optional)</span></label>
            <input type="file" onChange={(e) => setFile(e.target.files[0] || null)} style={{ fontSize:13 }} /></div>
          <div className="field"><label>Notes <span className="muted">(optional)</span></label>
            <textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} style={{ resize:'vertical', fontFamily:'inherit' }} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Add candidate'}</button>
          </div>
      </form>
    </Modal>
  );
}

/* ---- InterviewModal ------------------------------------------------------------ */
function InterviewModal({ applicationId, staff, onClose, onSaved, onError }) {
  const [f, setF] = useState({ scheduledAt:'', interviewerId:'', mode:'video' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.scheduledAt || !f.interviewerId) return onError('Time and interviewer are required.');
    setBusy(true);
    try {
      const saved = await L.scheduleInterview(applicationId, { ...f, scheduledAt: new Date(f.scheduledAt).toISOString() });
      onSaved(saved);
    } catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Schedule interview" onClose={onClose}>
      <form onSubmit={submit}>
          <div className="field"><label>Date &amp; time</label>
            <input className="input" type="datetime-local" value={f.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} required autoFocus /></div>
          <div className="field"><label>Interviewer</label>
            <select className="select" value={f.interviewerId} onChange={(e) => set('interviewerId', e.target.value)} required>
              <option value="">— Select —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div className="field"><label>Mode</label>
            <select className="select" value={f.mode} onChange={(e) => set('mode', e.target.value)}>
              <option value="video">Video</option><option value="onsite">Onsite</option><option value="phone">Phone</option>
            </select></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Schedule'}</button>
          </div>
      </form>
    </Modal>
  );
}

/* ---- MatchScore — transparent rubric score, not a black-box model. HR's own
   star rating stays the actual decision signal; this is triage-only. ---------- */
function MatchScore({ score }) {
  const tier = score >= 70 ? 'lc-match-high' : score >= 40 ? 'lc-match-mid' : 'lc-match-low';
  return <span className={`lc-badge ${tier}`} title="Rubric-based fit score from experience, salary and application completeness — not a hiring decision.">{Math.round(score)} match</span>;
}

/* ---- ApplicationRow (expandable) ------------------------------------------------ */
function ApplicationRow({ app, staff, myId, isHrManager, onUpdated, onDeleted, flash, confirm }) {
  const [expanded, setExpanded] = useState(false);
  const [interviews, setInterviews] = useState(null);
  const [ivModal, setIvModal] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadInterviews = () => L.getInterviews(app.id).then(setInterviews).catch((e) => flash(e.message, true));
  useEffect(() => { if (expanded && interviews === null) loadInterviews(); }, [expanded]); // eslint-disable-line

  const canScoreInterview = (iv) => isHrManager || iv.interviewer_id === myId;

  const patch = async (body) => {
    setBusy(true);
    try { onUpdated(await L.updateApplication(app.id, body)); } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  const scoreInterview = async (iv, patchBody) => {
    try {
      const updated = await L.submitInterview(iv.id, patchBody);
      setInterviews((ivs) => ivs.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) { flash(e.message, true); }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Remove candidate',
      message: `${app.candidate.name} will be removed from this pipeline.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try { await L.deleteApplication(app.id); onDeleted(app.id); } catch (e) { flash(e.message, true); }
  };

  const stage = L.STAGE[app.stage] || L.STAGE.applied;

  return (
    <>
      <tr>
        <td>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button className="iconbtn" onClick={() => setExpanded((v) => !v)} aria-label="Expand"
              style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition:'transform .15s' }}>{I.expand}</button>
            <div>
              <div style={{ fontWeight:500 }}>{app.candidate.name}</div>
              <div className="muted" style={{ fontSize:12 }}>{app.candidate.email}</div>
            </div>
          </div>
        </td>
        <td>
          {isHrManager ? (
            <select className="select" value={app.stage} disabled={busy} onChange={(e) => patch({ stage: e.target.value })} style={{ fontSize:13, padding:'3px 8px', height:'auto' }}>
              {L.STAGE_ORDER.map((s) => <option key={s} value={s}>{L.STAGE[s].label}</option>)}
            </select>
          ) : <span className={`lc-badge ${stage.cls}`}>{stage.label}</span>}
        </td>
        <td className="muted" style={{ fontSize:13, textTransform:'capitalize' }}>{app.candidate.source.replace('_',' ')}</td>
        <td>{app.match_score != null ? <MatchScore score={app.match_score} /> : <span className="muted">—</span>}</td>
        <td className="muted" style={{ fontSize:13 }}>{app.rating ? <Stars rating={app.rating} /> : '—'}</td>
        <td>
          {app.candidate.resume_path && (
            <button className="iconbtn" title="Resume" onClick={async () => { try { window.open(await L.getResumeUrl(app.candidate.resume_path), '_blank'); } catch (e) { flash(e.message, true); } }}>{I.resume}</button>
          )}
          {isHrManager && <button className="iconbtn danger-icon" onClick={remove} aria-label="Remove">{I.close}</button>}
        </td>
      </tr>
      {expanded && (
        <tr><td colSpan={6} style={{ padding:'0 16px 16px', background:'var(--surface)' }}>
          <div className="lc-app-detail">
            {app.candidate.notes && <p className="muted" style={{ fontSize:13, margin:'10px 0' }}>{app.candidate.notes}</p>}
            {app.candidate.portfolio_url && (
              <p style={{ fontSize:13, margin:'10px 0' }}><a href={app.candidate.portfolio_url} target="_blank" rel="noreferrer">{app.candidate.portfolio_url}</a></p>
            )}
            {(app.years_experience != null || app.expected_salary != null) && (
              <p className="muted" style={{ fontSize:13, margin:'10px 0' }}>
                {app.years_experience != null && <>{app.years_experience} yrs experience</>}
                {app.years_experience != null && app.expected_salary != null && ' · '}
                {app.expected_salary != null && <>Expects ₦{Number(app.expected_salary).toLocaleString('en-NG')}/yr</>}
              </p>
            )}
            {app.cover_letter && (
              <div style={{ marginTop:10 }}>
                <p className="col-label" style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.05em', color:'var(--text-2)', margin:'0 0 4px' }}>Cover letter</p>
                <p style={{ fontSize:13.5, whiteSpace:'pre-wrap', margin:0 }}>{app.cover_letter}</p>
              </div>
            )}

            {isHrManager && (
              <div className="field" style={{ maxWidth:200, marginTop:10 }}>
                <label>Rating</label>
                <select className="select" value={app.rating || ''} onChange={(e) => patch({ rating: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">— Unrated —</option>
                  {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} star{n>1?'s':''}</option>)}
                </select>
              </div>
            )}

            {app.stage === 'offer' && isHrManager && (
              <div className="form-grid" style={{ marginTop:12 }}>
                <div className="field"><label>Offer salary (₦/yr)</label>
                  <input className="input" type="number" defaultValue={app.offer_salary || ''} onBlur={(e) => patch({ offerSalary: e.target.value ? Number(e.target.value) : null })} /></div>
                <div className="field"><label>Proposed start date</label>
                  <input className="input" type="date" defaultValue={app.offer_start_date || ''} onBlur={(e) => patch({ offerStartDate: e.target.value || null })} /></div>
                <div className="field"><label>Offer status</label>
                  <select className="select" value={app.offer_status} onChange={(e) => patch({ offerStatus: e.target.value })}>
                    <option value="none">— None —</option><option value="draft">Draft</option><option value="sent">Sent</option>
                    <option value="accepted">Accepted</option><option value="declined">Declined</option><option value="withdrawn">Withdrawn</option>
                  </select></div>
              </div>
            )}

            {app.stage === 'rejected' && isHrManager && (
              <div className="field" style={{ marginTop:12 }}><label>Rejection reason</label>
                <input className="input" defaultValue={app.rejection_reason} onBlur={(e) => patch({ rejectionReason: e.target.value })} /></div>
            )}

            {app.stage === 'hired' && (
              <div className="callout-hint">
                Hired — create the login in <b>Admin Center → Users</b>, then link it here so onboarding can be generated for them.
                <div className="form-grid" style={{ marginTop:8 }}>
                  <div className="field"><label>Linked account</label>
                    <select className="select" value={app.hired_profile_id || ''} onChange={(e) => patch({ hiredProfileId: e.target.value })}>
                      <option value="">— Not linked —</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
                    </select></div>
                </div>
              </div>
            )}

            <div className="lc-interviews-head">
              <span style={{ fontSize:13, fontWeight:600 }}>Interviews</span>
              {isHrManager && <button className="btn btn-primary" style={{ fontSize:12, padding:'3px 12px' }} onClick={() => setIvModal(true)}>Schedule</button>}
            </div>
            {interviews === null ? <div className="boot-spinner" style={{ width:16, height:16 }} /> : interviews.length === 0 ? (
              <p className="muted" style={{ fontSize:13 }}>No interviews scheduled.</p>
            ) : interviews.map((iv) => (
              <div key={iv.id} className="lc-interview-card">
                <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:6 }}>
                  <span style={{ fontSize:13, fontWeight:500 }}>{iv.interviewer?.name} — {L.fmtDt(iv.scheduled_at)} <span className="muted" style={{ textTransform:'capitalize' }}>({iv.mode})</span></span>
                  {canScoreInterview(iv) ? (
                    <select className="select" value={iv.outcome} onChange={(e) => scoreInterview(iv, { outcome: e.target.value })} style={{ fontSize:12, padding:'2px 6px', height:'auto' }}>
                      {Object.entries(L.OUTCOME).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  ) : <span className={`lc-badge ${L.OUTCOME[iv.outcome].cls}`}>{L.OUTCOME[iv.outcome].label}</span>}
                </div>
                {canScoreInterview(iv) && (
                  <textarea className="input" rows={2} placeholder="Feedback…" defaultValue={iv.feedback}
                    onBlur={(e) => e.target.value !== iv.feedback && scoreInterview(iv, { feedback: e.target.value })}
                    style={{ marginTop:6, resize:'vertical', fontFamily:'inherit', fontSize:13 }} />
                )}
                {!canScoreInterview(iv) && iv.feedback && <p style={{ fontSize:13, margin:'6px 0 0' }}>{iv.feedback}</p>}
              </div>
            ))}
          </div>
        </td></tr>
      )}
      {ivModal && (
        <InterviewModal applicationId={app.id} staff={staff} onClose={() => setIvModal(false)}
          onSaved={(iv) => { setInterviews((ivs) => [iv, ...(ivs || [])]); setIvModal(false); flash('Interview scheduled.'); if (app.stage === 'applied' || app.stage === 'screening') patch({ stage: 'interview' }); }}
          onError={(m) => flash(m, true)} />
      )}
    </>
  );
}

/* ---- PipelineView ---------------------------------------------------------------- */
function PipelineView({ req, staff, myId, isHrManager, onBack, flash, confirm }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);

  const load = () => { setLoading(true); L.getPipeline(req.id).then(setApps).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); };
  useEffect(load, [req.id]); // eslint-disable-line

  const upsert = (app) => setApps((l) => { const i = l.findIndex((a) => a.id === app.id); return i >= 0 ? l.map((a) => (a.id === app.id ? app : a)) : [app, ...l]; });

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <button className="iconbtn" onClick={onBack} aria-label="Back">{I.back}</button>
        <div>
          <h2 style={{ margin:0, fontSize:19 }}>{req.title}</h2>
          <p className="muted" style={{ margin:0, fontSize:13 }}>{req.dept?.name || 'No department'} · {req.headcount} opening{req.headcount>1?'s':''} · {req.location || 'Remote/unspecified'}</p>
        </div>
        {isHrManager && <button className="btn btn-primary" style={{ marginLeft:'auto' }} onClick={() => setModal(true)}>{I.add} Add candidate</button>}
      </div>
      {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Candidate</th><th>Stage</th><th>Source</th><th>Match</th><th>Rating</th><th></th></tr></thead>
            <tbody>
              {apps.length === 0 && <tr><td colSpan={6} className="td-empty">No candidates yet.</td></tr>}
              {apps.map((app) => (
                <ApplicationRow key={app.id} app={app} staff={staff} myId={myId} isHrManager={isHrManager}
                  onUpdated={upsert} onDeleted={(id) => setApps((l) => l.filter((a) => a.id !== id))} flash={flash} confirm={confirm} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <CandidateModal requisitionId={req.id} onClose={() => setModal(false)}
          onSaved={(app) => { upsert(app); setModal(false); flash('Candidate added.'); }}
          onError={(m) => flash(m, true)} />
      )}
    </div>
  );
}

/* ---- MyInterviewsView — for anyone assigned as an interviewer, hr-manager or not --- */
export function MyInterviewsView({ myId, flash }) {
  const [interviews, setInterviews] = useState(null);

  useEffect(() => { L.getMyInterviews().then(setInterviews).catch((e) => flash(e.message, true)); }, []); // eslint-disable-line

  const score = async (iv, patchBody) => {
    try {
      const updated = await L.submitInterview(iv.id, patchBody);
      setInterviews((ivs) => ivs.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
    } catch (e) { flash(e.message, true); }
  };

  if (interviews === null) return <div className="suite-loading"><div className="boot-spinner" /></div>;
  if (interviews.length === 0) return <EmptyState title="No interviews assigned to you" hint="Interviews appear here when HR schedules you as the interviewer." />;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:8 }}>
      {interviews.map((iv) => (
        <div key={iv.id} className="lc-interview-card">
          <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:6 }}>
            <div>
              <div style={{ fontWeight:600, fontSize:14 }}>{iv.application?.candidate?.name}</div>
              <div className="muted" style={{ fontSize:12 }}>{iv.application?.requisition?.title} · {L.fmtDt(iv.scheduled_at)} · <span style={{ textTransform:'capitalize' }}>{iv.mode}</span></div>
            </div>
            <select className="select" value={iv.outcome} onChange={(e) => score(iv, { outcome: e.target.value })} style={{ fontSize:12, padding:'2px 6px', height:'auto' }}>
              {Object.entries(L.OUTCOME).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <textarea className="input" rows={2} placeholder="Feedback…" defaultValue={iv.feedback}
            onBlur={(e) => e.target.value !== iv.feedback && score(iv, { feedback: e.target.value })}
            style={{ marginTop:8, resize:'vertical', fontFamily:'inherit', fontSize:13 }} />
        </div>
      ))}
    </div>
  );
}

/* ---- Main RecruitingApp ----------------------------------------------------------- */
export default function RecruitingApp({ access, departments, staff, myId }) {
  const { user } = useAuth();
  const isHrManager = access?.role === 'manager';
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [openReq, setOpenReq] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const { flash, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  const load = () => { setLoading(true); L.getRequisitions().then(setReqs).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line

  const upsert = (req) => setReqs((l) => { const i = l.findIndex((r) => r.id === req.id); return i >= 0 ? l.map((r) => (r.id === req.id ? req : r)) : [req, ...l]; });

  const view = useMemo(() => statusFilter ? reqs.filter((r) => r.status === statusFilter) : reqs, [reqs, statusFilter]);

  if (openReq) {
    return (
      <div>
        <PipelineView req={openReq} staff={staff} myId={myId} isHrManager={isHrManager} onBack={() => setOpenReq(null)} flash={flash} confirm={confirm} />
        {confirmNode}
        {toastNode}
      </div>
    );
  }

  return (
    <div>
      <div className="filterbar" style={{ marginTop:8 }}>
        <div className="filter-pills">
          <button className={`pill ${statusFilter === '' ? 'active' : ''}`} onClick={() => setStatusFilter('')}>All</button>
          {Object.entries(L.REQ_STATUS).map(([k, v]) => (
            <button key={k} className={`pill ${statusFilter === k ? 'active' : ''}`} onClick={() => setStatusFilter(k)}>{v.label}</button>
          ))}
        </div>
        {isHrManager && <button className="btn btn-primary lv-apply" onClick={() => setModal('create')}>{I.add} New requisition</button>}
      </div>
      {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Role</th><th>Department</th><th>Hiring manager</th><th>Headcount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {view.length === 0 && <tr><td colSpan={6} className="td-empty">No requisitions yet.</td></tr>}
              {view.map((r) => {
                const st = L.REQ_STATUS[r.status];
                return (
                  <tr key={r.id}>
                    <td><a href="#" onClick={(e) => { e.preventDefault(); setOpenReq(r); }} style={{ fontWeight:500, color:'var(--ink,inherit)', textDecoration:'none' }}>{r.title}</a></td>
                    <td className="muted" style={{ fontSize:13 }}>{r.dept?.name || '—'}</td>
                    <td className="muted" style={{ fontSize:13 }}>{r.hiringManager?.name || '—'}</td>
                    <td className="muted" style={{ fontSize:13 }}>{r.headcount}</td>
                    <td><span className={`lc-badge ${st.cls}`}>{st.label}</span></td>
                    <td>
                      {r.status === 'open' && (
                        <button className="iconbtn" title="Copy public apply link" onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/careers/${user.org.slug}/${r.id}`);
                          flash('Apply link copied.');
                        }}>{I.link}</button>
                      )}
                      {isHrManager && <button className="iconbtn" onClick={() => setModal(r)} aria-label="Edit">{I.edit}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <RequisitionModal req={modal === 'create' ? null : modal} departments={departments} staff={staff}
          onClose={() => setModal(null)}
          onSaved={(r) => { upsert(r); setModal(null); flash(modal === 'create' ? 'Requisition created.' : 'Requisition updated.'); }}
          onError={(m) => flash(m, true)} />
      )}
      {confirmNode}
      {toastNode}
    </div>
  );
}
