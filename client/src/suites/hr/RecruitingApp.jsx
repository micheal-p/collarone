import { useEffect, useMemo, useState } from 'react';
import * as L from './lifecycleApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useToast, useConfirm, Modal, EmptyState, SearchSelect } from '../../components/ui.jsx';

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
  trash:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>,
  copy:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
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

/* ---- ApplicationCard — kanban card: name, source, match, rating, stage move ---- */
function ApplicationCard({ app, isHrManager, selected, onOpen, onStage }) {
  const [busy, setBusy] = useState(false);

  const move = async (stage) => {
    setBusy(true);
    try { await onStage(app, stage); } finally { setBusy(false); }
  };

  return (
    <div onClick={() => onOpen(app)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(app); }}
      style={{
        background:'var(--surface)', border:`1px solid ${selected ? 'var(--brand)' : 'var(--line-strong)'}`,
        borderRadius:8, padding:'9px 11px', cursor:'pointer',
      }}>
      <div style={{ fontWeight:500, fontSize:13.5, lineHeight:1.3 }}>{app.candidate.name}</div>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:5, flexWrap:'wrap' }}>
        <span className="muted" style={{ fontSize:11.5, textTransform:'capitalize' }}>{app.candidate.source.replace('_',' ')}</span>
        {app.match_score != null && <MatchScore score={app.match_score} />}
        {app.rating ? <Stars rating={app.rating} /> : null}
      </div>
      {isHrManager && (
        <select className="select" value={app.stage} disabled={busy}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => move(e.target.value)}
          style={{ fontSize:12, padding:'2px 6px', height:'auto', width:'100%', marginTop:8 }}>
          {L.STAGE_ORDER.map((s) => <option key={s} value={s}>{L.STAGE[s].label}</option>)}
        </select>
      )}
    </div>
  );
}

/* ---- ApplicationDetail — the pre-kanban expandable row body, now a panel
   rendered below the board for the selected card ------------------------------- */
/* ---- CandidateTimeline — every event on one line each, oldest first -------- */
function CandidateTimeline({ app, interviews }) {
  const events = [
    { t: app.created_at, label: 'Applied' },
    ...(interviews || []).map((iv) => ({ t: iv.scheduled_at, label: `Interview — ${iv.interviewer?.name || ''}${iv.outcome !== 'pending' ? ` (${L.OUTCOME[iv.outcome]?.label || iv.outcome})` : ''}` })),
    app.offer_sent_at && { t: app.offer_sent_at, label: 'Offer sent' },
    app.offer_decided_at && { t: app.offer_decided_at, label: app.offer_status === 'accepted' ? 'Offer accepted' : 'Offer declined' },
    app.stage === 'hired' && { t: app.updated_at, label: 'Hired' },
    app.stage === 'rejected' && { t: app.updated_at, label: `Rejected${app.rejection_reason ? ` — ${app.rejection_reason}` : ''}` },
  ].filter(Boolean).sort((a, b) => new Date(a.t) - new Date(b.t));
  if (events.length <= 1) return null;
  return (
    <div style={{ margin:'12px 0 2px', paddingLeft:4 }}>
      {events.map((e, i) => (
        <div key={i} style={{ display:'flex', gap:10, alignItems:'baseline', fontSize:12.5, lineHeight:2 }}>
          <span style={{ width:7, height:7, borderRadius:'50%', background: i === events.length - 1 ? 'var(--brand)' : 'var(--line-strong)', flex:'none', position:'relative', top:-1 }} />
          <span className="muted" style={{ width:96, flex:'none', fontVariantNumeric:'tabular-nums' }}>{new Date(e.t).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })}</span>
          <span>{e.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ---- Scorecard — structured interview rating: 4 fixed criteria, 1-5 -------- */
const SCORE_CRITERIA = [['skills','Skills'],['communication','Communication'],['experience','Experience'],['culture','Culture fit']];
function Scorecard({ iv, editable, onSave }) {
  const card = Array.isArray(iv.scorecard) ? iv.scorecard : [];
  const get = (k) => card.find((c) => c.k === k)?.s || 0;
  const setScore = (k, sVal) => {
    const next = SCORE_CRITERIA.map(([key]) => ({ k: key, s: key === k ? sVal : get(key) })).filter((c) => c.s > 0);
    onSave(next);
  };
  const scored = card.filter((c) => c.s > 0);
  const avg = scored.length ? (scored.reduce((t, c) => t + c.s, 0) / scored.length).toFixed(1) : null;
  if (!editable && scored.length === 0) return null;
  return (
    <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', gap:'6px 16px', alignItems:'center' }}>
      {SCORE_CRITERIA.map(([k, label]) => (
        <span key={k} style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11.5, color:'var(--text-2)' }}>
          {label}
          <span style={{ display:'inline-flex', gap:1 }}>
            {[1,2,3,4,5].map((n) => (
              <button key={n} type="button" disabled={!editable}
                onClick={() => setScore(k, n)}
                aria-label={`${label}: ${n} of 5`}
                style={{ width:14, height:14, padding:0, border:'none', background:'transparent', cursor: editable ? 'pointer' : 'default', color: n <= get(k) ? 'var(--brand)' : 'var(--line-strong)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill={n <= get(k) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z" /></svg></button>
            ))}
          </span>
        </span>
      ))}
      {avg && <span style={{ fontSize:11.5, fontWeight:700, background:'var(--surface-2)', borderRadius:100, padding:'2px 10px' }}>avg {avg}</span>}
    </div>
  );
}

/* ---- HireModal — one-click hire: staff account from the candidate record ----
   Calls the same admin create path as Admin Center → Users (service role,
   consumes one seat credit, payroll country gate applies). Shows the temp
   password ONCE for HR to pass to the new hire. */
function HireModal({ app, reqTitle, flash, onClose, onHired }) {
  const genPassword = () => 'Cl-' + Math.random().toString(36).slice(2, 8) + Math.floor(10 + Math.random() * 89) + '!';
  const [f, setF] = useState({ name: app.candidate.name, email: app.candidate.email, jobTitle: reqTitle || '', password: genPassword() });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { apiPost } = await import('../../api/client.js');
      const d = await apiPost('/users', { name: f.name.trim(), email: f.email.trim().toLowerCase(), password: f.password, role: 'staff', jobTitle: f.jobTitle, suites: [] });
      setCreated(d.user);
      if (d.warning) flash(d.warning, true);
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  const copyCreds = async () => {
    try {
      await navigator.clipboard.writeText(`Welcome to the team!\nSign in at ${window.location.origin}/login\nEmail: ${f.email}\nTemporary password: ${f.password}\n(You will be asked to change it on first login.)`);
      flash('Login details copied — send them to your new hire.');
    } catch { flash('Could not copy.', true); }
  };

  return (
    <Modal title={created ? 'Staff account created' : `Hire ${app.candidate.name}`} onClose={created ? () => onHired(created.id) : onClose}>
      {created ? (
        <div>
          <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
            <b>{created.name}</b> now has a staff account. Send them these login details — the temporary password is shown only here:
          </p>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', fontSize: 13.5, lineHeight: 2, margin: '10px 0 14px' }}>
            <div>Email: <b>{f.email}</b></div>
            <div>Temporary password: <b style={{ fontFamily: 'ui-monospace, monospace' }}>{f.password}</b></div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={copyCreds}>{I.copy} Copy login details</button>
            <button type="button" className="btn btn-primary" onClick={() => onHired(created.id)}>Done — link & mark hired</button>
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: '10px 0 0' }}>They'll be asked to change the password on first login. Grant suites from Admin Center → Users when ready.</p>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="field"><label>Full name</label><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required /></div>
          <div className="field"><label>Work email (their login)</label><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required /></div>
          <div className="form-grid">
            <div className="field"><label>Job title</label><input className="input" value={f.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} /></div>
            <div className="field"><label>Temporary password</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input" value={f.password} onChange={(e) => set('password', e.target.value)} style={{ fontFamily: 'ui-monospace, monospace' }} />
                <button type="button" className="btn btn-ghost" style={{ flex: 'none', fontSize: 12 }} onClick={() => set('password', genPassword())}>New</button>
              </div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 12px' }}>Creates a real login and uses <b>1 seat credit</b>. Suites can be granted afterwards in Admin Center → Users.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Create account (1 credit)'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ApplicationDetail({ app, reqTitle, staff, myId, isHrManager, onUpdated, onDeleted, onClose, flash, confirm }) {
  const [interviews, setInterviews] = useState(null);
  const [ivModal, setIvModal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setInterviews(null);
    L.getInterviews(app.id).then(setInterviews).catch((e) => flash(e.message, true));
  }, [app.id]); // eslint-disable-line

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
    try { await L.deleteApplication(app.id); onDeleted(app.id); onClose(); } catch (e) { flash(e.message, true); }
  };

  const [hireModal, setHireModal] = useState(false);

  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(`Name: ${app.candidate.name}\nEmail: ${app.candidate.email}\nJob title: ${reqTitle}`);
      flash('Details copied for account setup.');
    } catch { flash('Could not copy to clipboard.', true); }
  };

  return (
    <div style={{ marginTop:14, background:'var(--surface)', border:'1px solid var(--line-strong)', borderRadius:'var(--radius)', padding:'14px 16px 16px' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
        <div>
          <div style={{ fontWeight:600, fontSize:15 }}>{app.candidate.name}</div>
          <div className="muted" style={{ fontSize:12.5 }}>
            {app.candidate.email}{app.candidate.phone ? ` · ${app.candidate.phone}` : ''}
          </div>
        </div>
        <span className={`lc-badge ${(L.STAGE[app.stage] || L.STAGE.applied).cls}`} style={{ marginTop:2 }}>{(L.STAGE[app.stage] || L.STAGE.applied).label}</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:2 }}>
          {app.candidate.resume_path && (
            <button className="iconbtn" title="Resume" onClick={async () => { try { window.open(await L.getResumeUrl(app.candidate.resume_path), '_blank'); } catch (e) { flash(e.message, true); } }}>{I.resume}</button>
          )}
          {isHrManager && <button className="iconbtn danger-icon" disabled={busy} onClick={remove} aria-label="Remove candidate" title="Remove from pipeline">{I.trash}</button>}
          <button className="iconbtn" onClick={onClose} aria-label="Close details">{I.close}</button>
        </div>
      </div>
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
              <>
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
                <div className="field" style={{ marginTop:8 }}><label>Note shown to the candidate (optional)</label>
                  <input className="input" defaultValue={app.offer_note || ''} placeholder="Benefits, conditions, who to contact…" onBlur={(e) => patch({ offerNote: e.target.value })} /></div>
                {/* The private acceptance link — one click sends: stamps the offer
                    'sent' and copies the URL the candidate opens to accept/decline. */}
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginTop:10 }}>
                  <button type="button" className="btn btn-primary" style={{ fontSize:12.5, padding:'6px 14px' }}
                    onClick={async () => {
                      if (app.offer_salary == null && !app.offer_note) { flash('Set the offer salary (or a note) first.', true); return; }
                      if (app.offer_status !== 'sent') await patch({ offerStatus: 'sent', offerSentAt: new Date().toISOString() });
                      const url = `${window.location.origin}/offer/${app.offer_token}`;
                      try { await navigator.clipboard.writeText(url); flash('Offer link copied — send it to the candidate.'); }
                      catch { window.prompt('Copy the offer link:', url); }
                    }}>
                    {app.offer_status === 'sent' ? 'Copy offer link' : 'Send offer — copy link'}
                  </button>
                  {app.offer_status === 'accepted' && <span className="pill" style={{ background:'#E8F6EC', color:'#1A7A3E', fontWeight:700, fontSize:11.5, padding:'3px 10px', borderRadius:100 }}>ACCEPTED{app.offer_decided_at ? ` · ${new Date(app.offer_decided_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })}` : ''}</span>}
                  {app.offer_status === 'declined' && <span className="pill" style={{ background:'#F6ECEA', color:'#A03232', fontWeight:700, fontSize:11.5, padding:'3px 10px', borderRadius:100 }}>DECLINED</span>}
                  {app.offer_status === 'sent' && <span className="muted" style={{ fontSize:12 }}>Awaiting the candidate's decision — refresh to see it.</span>}
                </div>
              </>
            )}

            {app.stage === 'rejected' && isHrManager && (
              <div className="field" style={{ marginTop:12 }}><label>Rejection reason</label>
                <input className="input" defaultValue={app.rejection_reason} onBlur={(e) => patch({ rejectionReason: e.target.value })} /></div>
            )}

            {app.stage === 'hired' && (
              <div className="callout-hint">
                {app.hired_profile_id ? (
                  <>Hired and linked — onboarding can be generated for them.</>
                ) : (
                  <>
                    Hired — create their staff account in one click (uses 1 seat credit), or link one that already exists.
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
                      <button type="button" className="btn btn-primary" style={{ fontSize:12, padding:'4px 14px' }} onClick={() => setHireModal(true)}>
                        Create staff account
                      </button>
                      <button type="button" className="btn btn-ghost" style={{ fontSize:12, padding:'3px 12px' }} onClick={copyDetails}>
                        {I.copy} Copy details
                      </button>
                    </div>
                  </>
                )}
                <div className="form-grid" style={{ marginTop:8 }}>
                  <div className="field"><label>Linked account</label>
                    <SearchSelect value={app.hired_profile_id || ''} onChange={(v) => patch({ hiredProfileId: v })} emptyLabel="— Not linked yet —"
                      options={staff.map((u) => ({ value: u.id, label: u.name, hint: u.email }))} /></div>
                </div>
              </div>
            )}
            {app.stage === 'offer' && app.offer_status === 'accepted' && isHrManager && !app.hired_profile_id && (
              <div className="callout-hint" style={{ marginTop:10 }}>
                Offer accepted — finish the hire in one click: moves them to Hired and creates their staff account (1 seat credit).
                <div style={{ marginTop:8 }}>
                  <button type="button" className="btn btn-primary" style={{ fontSize:12, padding:'4px 14px' }} onClick={() => setHireModal(true)}>
                    Hire {app.candidate.name.split(' ')[0]} — create account
                  </button>
                </div>
              </div>
            )}
            {hireModal && (
              <HireModal app={app} reqTitle={reqTitle} flash={flash}
                onClose={() => setHireModal(false)}
                onHired={(profileId) => { setHireModal(false); patch({ stage: 'hired', hiredProfileId: profileId }); }} />
            )}

            <CandidateTimeline app={app} interviews={interviews} />
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
                <Scorecard iv={iv} editable={canScoreInterview(iv)} onSave={(scorecard) => scoreInterview(iv, { scorecard })} />
                {canScoreInterview(iv) && (
                  <textarea className="input" rows={2} placeholder="Feedback…" defaultValue={iv.feedback}
                    onBlur={(e) => e.target.value !== iv.feedback && scoreInterview(iv, { feedback: e.target.value })}
                    style={{ marginTop:6, resize:'vertical', fontFamily:'inherit', fontSize:13 }} />
                )}
                {!canScoreInterview(iv) && iv.feedback && <p style={{ fontSize:13, margin:'6px 0 0' }}>{iv.feedback}</p>}
              </div>
            ))}
      </div>
      {ivModal && (
        <InterviewModal applicationId={app.id} staff={staff} onClose={() => setIvModal(false)}
          onSaved={(iv) => { setInterviews((ivs) => [iv, ...(ivs || [])]); setIvModal(false); flash('Interview scheduled.'); if (app.stage === 'applied' || app.stage === 'screening') patch({ stage: 'interview' }); }}
          onError={(m) => flash(m, true)} />
      )}
    </div>
  );
}

/* ---- PipelineView ---------------------------------------------------------------- */
function PipelineView({ req, staff, myId, isHrManager, onBack, flash, confirm }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [showRejected, setShowRejected] = useState(false);

  const load = () => { setLoading(true); L.getPipeline(req.id).then(setApps).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); };
  useEffect(load, [req.id]); // eslint-disable-line

  const upsert = (app) => setApps((l) => { const i = l.findIndex((a) => a.id === app.id); return i >= 0 ? l.map((a) => (a.id === app.id ? app : a)) : [app, ...l]; });

  const byStage = useMemo(() => {
    const m = Object.fromEntries(L.STAGE_ORDER.map((s) => [s, []]));
    for (const a of apps) (m[a.stage] || m.applied).push(a);
    return m;
  }, [apps]);

  const selected = selectedId ? apps.find((a) => a.id === selectedId) : null;

  const setStage = async (app, stage) => {
    try { upsert(await L.updateApplication(app.id, { stage })); } catch (e) { flash(e.message, true); }
  };

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
      {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : apps.length === 0 ? (
        <EmptyState title="No candidates yet" hint={isHrManager ? 'Add a candidate or share the public apply link from the requisitions list.' : 'Candidates appear here once they apply or are added by HR.'} />
      ) : (
        <div style={{ display:'flex', gap:10, alignItems:'flex-start', overflowX:'auto', paddingBottom:6 }}>
          {L.STAGE_ORDER.map((s) => {
            const list = byStage[s];
            const collapsed = s === 'rejected' && !showRejected;
            return (
              <div key={s} style={{
                flex: collapsed ? '0 0 auto' : '1 0 185px', minWidth: collapsed ? 0 : 185, maxWidth: 260,
                background:'var(--bg)', border:'1px solid var(--line)', borderRadius:'var(--radius)', padding:8,
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, padding:'2px 2px 6px' }}>
                  <span className={`lc-badge ${L.STAGE[s].cls}`}>{L.STAGE[s].label}</span>
                  <span className="muted" style={{ fontSize:12, fontWeight:600 }}>{list.length}</span>
                  {s === 'rejected' && (
                    <button className="iconbtn" onClick={() => setShowRejected((v) => !v)}
                      aria-label={collapsed ? 'Show rejected candidates' : 'Hide rejected candidates'}
                      style={{ marginLeft:'auto', transform: collapsed ? 'none' : 'rotate(90deg)', transition:'transform .15s' }}>{I.expand}</button>
                  )}
                </div>
                {!collapsed && (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {list.length === 0 && <p className="muted" style={{ fontSize:12, textAlign:'center', margin:'10px 0' }}>—</p>}
                    {list.map((app) => (
                      <ApplicationCard key={app.id} app={app} isHrManager={isHrManager} selected={app.id === selectedId}
                        onOpen={(a) => setSelectedId((id) => (id === a.id ? null : a.id))} onStage={setStage} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {selected && (
        <ApplicationDetail app={selected} reqTitle={req.title} staff={staff} myId={myId} isHrManager={isHrManager}
          onUpdated={upsert} onDeleted={(id) => setApps((l) => l.filter((a) => a.id !== id))}
          onClose={() => setSelectedId(null)} flash={flash} confirm={confirm} />
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
  const [stageCounts, setStageCounts] = useState({});
  const { flash, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  const load = () => { setLoading(true); L.getRequisitions().then(setReqs).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line
  // Single grouped query for all requisitions — no counts is fine (pills just don't render).
  useEffect(() => { L.getStageCounts().then(setStageCounts).catch(() => {}); }, [openReq]); // refresh after visiting a pipeline

  const removeReq = async (r) => {
    const ok = await confirm({
      title: 'Delete requisition',
      message: `"${r.title}" and all of its candidates, applications and interviews will be permanently deleted.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try { await L.deleteRequisition(r.id); setReqs((l) => l.filter((x) => x.id !== r.id)); flash('Requisition deleted.'); } catch (e) { flash(e.message, true); }
  };

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
                const counts = stageCounts[r.id];
                return (
                  <tr key={r.id}>
                    <td>
                      <a href="#" onClick={(e) => { e.preventDefault(); setOpenReq(r); }} style={{ fontWeight:500, color:'var(--ink,inherit)', textDecoration:'none' }}>{r.title}</a>
                      {counts && (
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:4 }}>
                          {L.STAGE_ORDER.map((s) => counts[s] ? (
                            <span key={s} className={`lc-badge ${L.STAGE[s].cls}`} style={{ fontSize:10, padding:'1px 6px' }}>
                              {counts[s]} {L.STAGE[s].label.toLowerCase()}
                            </span>
                          ) : null)}
                        </div>
                      )}
                    </td>
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
                      {isHrManager && (r.status === 'draft' || r.status === 'closed') && (
                        <button className="iconbtn danger-icon" onClick={() => removeReq(r)} aria-label="Delete requisition" title="Delete requisition">{I.trash}</button>
                      )}
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
