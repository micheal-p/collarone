import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as C from './careersApi.js';
import { CareersChrome, CAREERS_CSS } from './CareersIndex.jsx';

export default function CareersApply() {
  const { orgSlug, id } = useParams();
  const [posting, setPosting] = useState(null);
  const [org, setOrg] = useState(null);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    C.getPosting(orgSlug, id).then(setPosting).catch((e) => setError(e.message));
    C.getOrgInfo(orgSlug).then(setOrg).catch(() => {}); // About card is best-effort
  }, [orgSlug, id]);

  const salary = posting && C.fmtSalaryRange(posting.salary_min, posting.salary_max);

  return (
    <div className="careers-page">
      <style>{CAREERS_CSS}{APPLY_CSS}</style>
      <CareersChrome />

      {posting && !submitted && (
        <div className="careers-job-hero">
          <div className="careers-job-hero-inner">
            <Link to={`/careers/${orgSlug}`} className="careers-crumb">← All roles at {posting.org_name}</Link>
            <h1 className="careers-apply-title">{posting.title}</h1>
            <div className="careers-job-facts">
              <span className="careers-fact">{posting.department_name || posting.org_name}</span>
              <span className="careers-fact">{posting.location || 'Location on request'}</span>
              <span className="careers-fact">{C.EMPLOYMENT_TYPE_LABEL[posting.employment_type] || posting.employment_type}</span>
              {posting.min_experience_years > 0 && <span className="careers-fact">{posting.min_experience_years}+ yrs experience</span>}
              {salary && <span className="careers-fact careers-fact-salary">{salary}</span>}
            </div>
          </div>
        </div>
      )}

      <main className="careers-apply-main">
        {error && (
          <div className="careers-apply-card" style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
            <p className="careers-empty">{error}</p>
            <Link to={`/careers/${orgSlug}`} className="btn btn-ghost">← See open roles</Link>
          </div>
        )}

        {!error && posting === null && <div className="boot-spinner" style={{ margin: '60px auto' }} />}

        {posting && !submitted && (
          <div className="careers-apply-grid">
            <div className="careers-about">
              <h2 className="careers-about-h">About the role</h2>
              {posting.description
                ? <p className="careers-apply-desc">{posting.description}</p>
                : <p className="careers-apply-desc muted-desc">{posting.org_name} hasn't added a long description for this role — the essentials are above, and the team will share full details during the process.</p>}
              <div className="careers-company-card">
                <div className="careers-company-head">
                  {org?.logoUrl && <img src={org.logoUrl} alt="" className="careers-company-logo" />}
                  <div>
                    <div className="careers-company-name">About {posting.org_name}</div>
                    {org?.tagline && <div className="careers-company-tagline">{org.tagline}</div>}
                  </div>
                </div>
                <p>Hiring through Collarone — your application goes straight to {posting.org_name}'s recruiting pipeline and is visible only to their team. No account needed.</p>
                <div className="careers-company-links">
                  {org?.website && (
                    org.website.startsWith('/')
                      ? <Link to={org.website}>Visit their website →</Link>
                      : <a href={org.website} target="_blank" rel="noreferrer">Visit their website →</a>
                  )}
                  <Link to={`/careers/${orgSlug}`}>All roles at {posting.org_name} →</Link>
                  <Link to="/jobs">Jobs from other companies →</Link>
                </div>
              </div>
            </div>
            <ApplyForm posting={posting} onSubmitted={() => setSubmitted(true)} />
          </div>
        )}

        {submitted && (
          <div className="careers-apply-card careers-success">
            <div className="careers-success-ic" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12l5 5 9-10" /></svg>
            </div>
            <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Application received</h1>
            <p style={{ color: 'var(--text-2)' }}>Thanks for applying to <b>{posting.title}</b>. {posting.org_name}'s team will review your application and reach out if there's a fit.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
              <Link to={`/careers/${orgSlug}`} className="btn btn-primary">More roles at {posting.org_name}</Link>
              <Link to="/jobs" className="btn btn-ghost">All jobs on Collarone</Link>
            </div>
          </div>
        )}
      </main>

      <footer className="careers-footer">
        © {new Date().getFullYear()} {posting?.org_name || 'Collarone'} · Powered by Collarone
      </footer>
    </div>
  );
}

function ApplyForm({ posting, onSubmitted }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', portfolioUrl: '', coverLetter: '', yearsExperience: '', expectedSalary: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!f.name.trim() || !f.email.trim()) { setErr('Name and email are required.'); return; }
    setBusy(true);
    try {
      let resumePath = null;
      if (file) resumePath = await C.uploadResume(file);
      await C.submitApplication({
        requisitionId: posting.id,
        name: f.name, email: f.email, phone: f.phone, portfolioUrl: f.portfolioUrl,
        coverLetter: f.coverLetter,
        yearsExperience: f.yearsExperience ? Number(f.yearsExperience) : null,
        expectedSalary: f.expectedSalary ? Number(f.expectedSalary) : null,
        resumePath,
      });
      onSubmitted();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <form className="careers-apply-card" onSubmit={submit}>
      <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>Apply for this role</h2>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 18px' }}>Takes about two minutes. No account required.</p>
      <div className="field"><label>Full name</label>
        <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></div>
      <div className="form-grid">
        <div className="field"><label>Email</label>
          <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required /></div>
        <div className="field"><label>Phone</label>
          <input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0803 555 1234" /></div>
      </div>
      <div className="form-grid">
        <div className="field"><label>Years' experience</label>
          <input className="input" type="number" min="0" step="0.5" value={f.yearsExperience} onChange={(e) => set('yearsExperience', e.target.value)} /></div>
        <div className="field"><label>Expected salary <span className="muted">(₦/yr, optional)</span></label>
          <input className="input" type="number" min="0" value={f.expectedSalary} onChange={(e) => set('expectedSalary', e.target.value)} /></div>
      </div>
      <div className="field"><label>Portfolio / LinkedIn <span className="muted">(optional)</span></label>
        <input className="input" value={f.portfolioUrl} onChange={(e) => set('portfolioUrl', e.target.value)} placeholder="https://…" /></div>
      <div className="field"><label>Résumé / CV</label>
        <label className={`careers-file ${file ? 'has-file' : ''}`}>
          <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files[0] || null)} />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 20h16" /></svg>
          <span>{file ? file.name : 'Upload your CV (PDF or Word)'}</span>
        </label>
      </div>
      <div className="field"><label>Cover letter <span className="muted">(optional)</span></label>
        <textarea className="input" rows={5} value={f.coverLetter} onChange={(e) => set('coverLetter', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} placeholder="Tell us why you're a fit for this role…" /></div>
      {err && <div className="error-text" style={{ marginBottom: 10 }}>{err}</div>}
      <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} disabled={busy}>{busy ? <span className="spinner" /> : 'Submit application'}</button>
      <p className="muted" style={{ fontSize: 11.5, textAlign: 'center', margin: '12px 0 0' }}>Your application goes only to {posting.org_name}.</p>
    </form>
  );
}

const APPLY_CSS = `
  .careers-job-hero { background:#0A0E1A; color:#F4F1EA; padding:38px 24px 42px; }
  .careers-job-hero-inner { max-width:960px; margin:0 auto; }
  .careers-crumb { color:rgba(244,241,234,0.6); text-decoration:none; font-size:13px; }
  .careers-crumb:hover { color:#fff; }
  .careers-apply-title { font-size:32px; margin:10px 0 16px; line-height:1.15; letter-spacing:-.02em; color:#F4F1EA; }
  .careers-job-facts { display:flex; gap:8px; flex-wrap:wrap; }
  .careers-fact { font-size:12.5px; padding:5px 13px; border-radius:100px; background:rgba(244,241,234,0.08);
    border:1px solid rgba(244,241,234,0.16); color:rgba(244,241,234,0.8); }
  .careers-fact-salary { background:rgba(255,91,31,0.14); border-color:rgba(255,148,87,0.4); color:#FF9457; font-weight:650; }

  .careers-apply-main { max-width:960px; margin:0 auto; padding:34px 24px 64px; width:100%; flex:1; }
  .careers-apply-grid { display:grid; grid-template-columns:1.1fr 1fr; gap:36px; align-items:start; }
  @media (max-width:820px) { .careers-apply-grid { grid-template-columns:1fr; } }
  .careers-about-h { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-3); margin:0 0 10px; }
  .careers-apply-desc { white-space:pre-wrap; color:var(--text); font-size:14.5px; line-height:1.75; margin:0; }
  .muted-desc { color:var(--text-2); }
  .careers-company-card { margin-top:26px; background:#fff; border:1px solid var(--line); border-radius:14px; padding:18px 20px; font-size:13.5px; }
  .careers-company-head { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
  .careers-company-logo { height:38px; max-width:110px; object-fit:contain; }
  .careers-company-name { font-weight:700; }
  .careers-company-tagline { font-size:12.5px; color:var(--text-2); font-style:italic; margin-top:2px; }
  .careers-company-card p { margin:0 0 10px; color:var(--text-2); line-height:1.6; }
  .careers-company-links { display:flex; flex-direction:column; gap:6px; font-size:13px; }

  .careers-apply-card { background:#fff; border:1px solid var(--line); border-radius:16px; padding:26px; box-shadow:var(--shadow-2); }
  .careers-success { max-width:520px; margin:60px auto; text-align:center; }
  .careers-success-ic { width:52px; height:52px; border-radius:50%; background:#E4F3E9; color:#0E6E38; display:grid; place-items:center; margin:0 auto 14px; }

  .careers-file { display:flex; align-items:center; gap:10px; border:1.5px dashed var(--line-strong); border-radius:10px;
    padding:12px 14px; font-size:13.5px; color:var(--text-2); cursor:pointer; transition:border-color .15s; }
  .careers-file:hover { border-color:var(--brand); color:var(--text); }
  .careers-file.has-file { border-style:solid; border-color:var(--brand); color:var(--text); background:var(--brand-100); }
  .careers-file input { display:none; }
  .careers-file span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
`;
