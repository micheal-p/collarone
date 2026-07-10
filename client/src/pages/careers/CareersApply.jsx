import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import logo from '../../assets/collarone-mark.svg';
import * as C from './careersApi.js';
import { CAREERS_CSS } from './CareersIndex.jsx';

export default function CareersApply() {
  const { id } = useParams();
  const [posting, setPosting] = useState(null);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    C.getPosting(id).then(setPosting).catch((e) => setError(e.message));
  }, [id]);

  return (
    <div className="careers-page">
      <style>{CAREERS_CSS}{APPLY_CSS}</style>
      <header className="careers-header">
        <Link to="/careers"><img src={logo} alt="Collarone" className="careers-logo" /></Link>
      </header>

      <main className="careers-apply-main">
        {error && (
          <div className="careers-apply-card">
            <p className="careers-empty">{error}</p>
            <Link to="/careers" className="btn btn-ghost">← See open roles</Link>
          </div>
        )}

        {!error && posting === null && <div className="boot-spinner" style={{ margin: '60px auto' }} />}

        {posting && !submitted && (
          <div className="careers-apply-grid">
            <div>
              <p className="careers-kicker">{posting.department_name || 'Collarone'}</p>
              <h1 className="careers-apply-title">{posting.title}</h1>
              <p className="careers-card-meta">{posting.location || 'Location on request'} · {C.EMPLOYMENT_TYPE_LABEL[posting.employment_type] || posting.employment_type}</p>
              {C.fmtSalaryRange(posting.salary_min, posting.salary_max) && <p className="careers-card-salary">{C.fmtSalaryRange(posting.salary_min, posting.salary_max)}</p>}
              {posting.min_experience_years > 0 && <p className="careers-card-meta">{posting.min_experience_years}+ years' relevant experience</p>}
              {posting.description && <p className="careers-apply-desc">{posting.description}</p>}
            </div>
            <ApplyForm posting={posting} onSubmitted={() => setSubmitted(true)} />
          </div>
        )}

        {submitted && (
          <div className="careers-apply-card careers-success">
            <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Application received</h1>
            <p style={{ color: 'var(--text-2)' }}>Thanks for applying to <b>{posting.title}</b>. Our HR team will review your application and reach out if there's a fit.</p>
            <Link to="/careers" className="btn btn-primary" style={{ marginTop: 16 }}>See other open roles</Link>
          </div>
        )}
      </main>

      <footer className="careers-footer">
        © {new Date().getFullYear()} Collarone
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
      <h2 style={{ fontSize: 16, margin: '0 0 16px' }}>Apply for this role</h2>
      <div className="field"><label>Full name</label>
        <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></div>
      <div className="form-grid">
        <div className="field"><label>Email</label>
          <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required /></div>
        <div className="field"><label>Phone</label>
          <input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
      </div>
      <div className="form-grid">
        <div className="field"><label>Years' relevant experience</label>
          <input className="input" type="number" min="0" step="0.5" value={f.yearsExperience} onChange={(e) => set('yearsExperience', e.target.value)} /></div>
        <div className="field"><label>Expected salary (₦/yr) <span className="muted">(optional)</span></label>
          <input className="input" type="number" min="0" value={f.expectedSalary} onChange={(e) => set('expectedSalary', e.target.value)} /></div>
      </div>
      <div className="field"><label>Portfolio / LinkedIn <span className="muted">(optional)</span></label>
        <input className="input" value={f.portfolioUrl} onChange={(e) => set('portfolioUrl', e.target.value)} placeholder="https://…" /></div>
      <div className="field"><label>Résumé / CV</label>
        <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files[0] || null)} style={{ fontSize: 13 }} /></div>
      <div className="field"><label>Cover letter <span className="muted">(optional)</span></label>
        <textarea className="input" rows={5} value={f.coverLetter} onChange={(e) => set('coverLetter', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} placeholder="Tell us why you're a fit for this role…" /></div>
      {err && <div className="error-text">{err}</div>}
      <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} disabled={busy}>{busy ? <span className="spinner" /> : 'Submit application'}</button>
    </form>
  );
}

const APPLY_CSS = `
  .careers-apply-main { max-width:900px; margin:0 auto; padding:40px 24px 64px; width:100%; flex:1; }
  .careers-apply-grid { display:grid; grid-template-columns:1fr 1fr; gap:40px; align-items:start; }
  @media (max-width:760px) { .careers-apply-grid { grid-template-columns:1fr; } }
  .careers-apply-title { font-size:26px; margin:6px 0 10px; line-height:1.25; }
  .careers-apply-desc { white-space:pre-wrap; color:var(--text); font-size:14.5px; line-height:1.7; margin-top:20px; }
  .careers-apply-card { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-lg); padding:24px; }
  .careers-success { max-width:520px; margin:60px auto; text-align:center; }
`;
