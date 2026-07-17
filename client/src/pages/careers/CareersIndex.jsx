import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import logo from '../../assets/collarone-mark.svg';
import * as C from './careersApi.js';

/* Shared public-jobs chrome: the paper mark needs the ink band (it's
   invisible on white), and every careers surface links back to the
   platform-wide board. */
export function CareersChrome() {
  return (
    <header className="careers-bar">
      <Link to="/jobs" className="careers-brand">
        <img src={logo} alt="" className="careers-mark" />
        <span className="careers-wm">Collar<em>One</em></span>
      </Link>
      <nav className="careers-bar-links">
        <Link to="/jobs">All jobs</Link>
        <a href="/">What is Collarone?</a>
      </nav>
    </header>
  );
}

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
      <CareersChrome />

      <div className="careers-hero">
        {org?.logoUrl && <img src={org.logoUrl} alt={companyName} className="careers-org-logo" />}
        <p className="careers-kicker">Careers at {companyName}</p>
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
        <p className="careers-more-link"><Link to="/jobs">See jobs from every company on Collarone →</Link></p>
      </main>

      <footer className="careers-footer">
        © {new Date().getFullYear()} {companyName} · Powered by Collarone
      </footer>
    </div>
  );
}

export const CAREERS_CSS = `
  .careers-page { min-height:100%; background:#F7F4EE; display:flex; flex-direction:column; }

  /* ink chrome — the paper logo mark is drawn for this background */
  .careers-bar { display:flex; align-items:center; justify-content:space-between; gap:14px;
    padding:0 22px; height:56px; background:#0A0E1A; }
  .careers-brand { display:flex; align-items:center; gap:9px; text-decoration:none; }
  .careers-mark { height:28px; }
  .careers-wm { font-family:Georgia,'Iowan Old Style',serif; font-size:17px; color:#F4F1EA; }
  .careers-wm em { font-style:italic; color:var(--brand); }
  .careers-bar-links { display:flex; gap:4px; }
  .careers-bar-links a { color:rgba(244,241,234,0.75); text-decoration:none; font-size:13.5px;
    padding:7px 13px; border-radius:100px; }
  .careers-bar-links a:hover { color:#fff; background:rgba(244,241,234,0.1); }

  .careers-hero { max-width:760px; margin:0 auto; padding:52px 24px 30px; text-align:center; }
  .careers-org-logo { height:52px; max-width:180px; object-fit:contain; margin:0 auto 14px; display:block; }
  .careers-kicker { font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--brand-dark); margin:0 0 10px; }
  .careers-hero h1 { font-size:34px; margin:0 0 14px; line-height:1.15; letter-spacing:-.02em; }
  .careers-lede { color:var(--text-2); font-size:16px; line-height:1.6; margin:0; }
  .careers-search { display:block; width:100%; max-width:460px; margin:22px auto 0; height:44px; padding:0 18px;
    border:1px solid var(--line-strong); border-radius:100px; font-size:14.5px; background:#fff; }
  .careers-search:focus { outline:none; border-color:var(--brand); box-shadow:0 0 0 3px rgba(255,91,31,0.18); }

  .careers-list { max-width:720px; margin:0 auto; padding:8px 24px 64px; width:100%; flex:1; display:flex; flex-direction:column; gap:12px; }
  .careers-empty { text-align:center; color:var(--text-2); padding:40px 0; }
  .careers-card { display:flex; align-items:center; justify-content:space-between; gap:16px; background:#fff; border:1px solid var(--line); border-radius:14px; padding:20px 22px; text-decoration:none; color:inherit; transition:border-color .15s, box-shadow .15s, transform .12s; }
  .careers-card:hover { border-color:var(--brand); box-shadow:var(--shadow-8); transform:translateY(-1px); }
  .careers-card h2 { font-size:17px; margin:0 0 6px; }
  .careers-card-meta { font-size:13.5px; color:var(--text-2); margin:0; }
  .careers-card-salary { font-size:13px; color:var(--brand-ink); font-weight:600; margin:6px 0 0; }
  .careers-card-arrow { font-size:20px; color:var(--text-3); flex:none; }
  .careers-footer { text-align:center; padding:24px; font-size:12.5px; color:var(--text-3); }
  .careers-more-link { text-align:center; margin:18px 0 0; font-size:14px; }

  .careers-org-group { display:flex; flex-direction:column; gap:10px; margin-top:16px; }
  .careers-org-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; padding:0 4px; }
  .careers-org-name { font-size:15px; font-weight:700; color:var(--text); text-decoration:none; }
  .careers-org-name:hover { color:var(--brand-dark); }
  .careers-org-count { font-size:12.5px; color:var(--text-3); }
  .careers-hire-cta { display:flex; align-items:center; justify-content:space-between; gap:18px; flex-wrap:wrap;
    margin-top:30px; background:#0A0E1A; color:#F4F1EA; border-radius:16px; padding:22px 26px; }
  .careers-hire-cta p { margin:4px 0 0; font-size:13.5px; color:rgba(244,241,234,0.65); }
  @media (max-width:640px) { .careers-hero h1 { font-size:27px; } .careers-bar-links a:last-child { display:none; } }
`;
