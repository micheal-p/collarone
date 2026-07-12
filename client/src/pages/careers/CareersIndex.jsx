import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import logo from '../../assets/collarone-mark.svg';
import * as C from './careersApi.js';

export default function CareersIndex() {
  const { orgSlug } = useParams();
  const [org, setOrg] = useState(null);
  const [postings, setPostings] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([C.getOrgInfo(orgSlug), C.getPostings(orgSlug)])
      .then(([o, p]) => { setOrg(o); setPostings(p); })
      .catch((e) => setError(e.message));
  }, [orgSlug]);

  const companyName = org?.name || 'This company';

  return (
    <div className="careers-page">
      <style>{CAREERS_CSS}</style>
      <header className="careers-header">
        {org?.logoUrl ? <img src={org.logoUrl} alt={companyName} className="careers-logo" /> : <img src={logo} alt="Collarone" className="careers-logo" />}
      </header>

      <div className="careers-hero">
        <p className="careers-kicker">Careers</p>
        <h1>Join {companyName}.</h1>
        <p className="careers-lede">These are {companyName}'s open roles — apply directly, no account required.</p>
      </div>

      <main className="careers-list">
        {error && <p className="careers-empty">{error === 'This company page could not be found.' ? error : "Couldn't load open roles right now. Please try again shortly."}</p>}
        {postings === null && !error && <div className="boot-spinner" style={{ margin: '40px auto' }} />}
        {postings && postings.length === 0 && <p className="careers-empty">No open roles right now — check back soon.</p>}
        {postings && postings.map((p) => (
          <Link key={p.id} to={`/careers/${orgSlug}/${p.id}`} className="careers-card">
            <div>
              <h2>{p.title}</h2>
              <p className="careers-card-meta">
                {p.department_name || companyName} · {p.location || 'Location on request'} · {C.EMPLOYMENT_TYPE_LABEL[p.employment_type] || p.employment_type}
              </p>
              {C.fmtSalaryRange(p.salary_min, p.salary_max) && <p className="careers-card-salary">{C.fmtSalaryRange(p.salary_min, p.salary_max)}</p>}
            </div>
            <span className="careers-card-arrow" aria-hidden="true">→</span>
          </Link>
        ))}
      </main>

      <footer className="careers-footer">
        © {new Date().getFullYear()} {companyName} · Powered by Collarone
      </footer>
    </div>
  );
}

export const CAREERS_CSS = `
  .careers-page { min-height:100%; background:var(--bg); display:flex; flex-direction:column; }
  .careers-header { padding:20px 24px; border-bottom:1px solid var(--line); background:var(--surface); }
  .careers-logo { height:32px; }
  .careers-hero { max-width:720px; margin:0 auto; padding:56px 24px 32px; text-align:center; }
  .careers-kicker { font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--brand); margin:0 0 10px; }
  .careers-hero h1 { font-size:32px; margin:0 0 14px; line-height:1.2; }
  .careers-lede { color:var(--text-2); font-size:16px; line-height:1.6; margin:0; }
  .careers-list { max-width:720px; margin:0 auto; padding:8px 24px 64px; width:100%; flex:1; display:flex; flex-direction:column; gap:12px; }
  .careers-empty { text-align:center; color:var(--text-2); padding:40px 0; }
  .careers-card { display:flex; align-items:center; justify-content:space-between; gap:16px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-lg); padding:20px 22px; text-decoration:none; color:inherit; transition:border-color .15s, box-shadow .15s; }
  .careers-card:hover { border-color:var(--brand); box-shadow:var(--shadow-8); }
  .careers-card h2 { font-size:17px; margin:0 0 6px; }
  .careers-card-meta { font-size:13.5px; color:var(--text-2); margin:0; }
  .careers-card-salary { font-size:13px; color:var(--brand-ink); font-weight:600; margin:6px 0 0; }
  .careers-card-arrow { font-size:20px; color:var(--text-3); flex:none; }
  .careers-footer { text-align:center; padding:24px; font-size:12.5px; color:var(--text-3); }
`;
