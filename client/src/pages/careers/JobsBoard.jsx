import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as C from './careersApi.js';
import { CareersChrome, CAREERS_CSS } from './CareersIndex.jsx';

/* =========================================================================
   Platform-wide job board — every public posting from every company on
   Collarone, on one page. A bonus surface for the landing: candidates find
   jobs, employers see that companies hire through Collarone.
   ========================================================================= */

export default function JobsBoard() {
  const [postings, setPostings] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    C.getAllPostings().then(setPostings).catch((e) => setError(e.message));
  }, []);

  const groups = useMemo(() => {
    if (!postings) return [];
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? postings.filter((p) => [p.title, p.org_name, p.location, p.department_name].some((x) => String(x || '').toLowerCase().includes(needle)))
      : postings;
    const byOrg = new Map();
    filtered.forEach((p) => {
      if (!byOrg.has(p.org_slug)) byOrg.set(p.org_slug, { slug: p.org_slug, name: p.org_name, roles: [] });
      byOrg.get(p.org_slug).roles.push(p);
    });
    return [...byOrg.values()].sort((a, b) => b.roles.length - a.roles.length);
  }, [postings, q]);

  const total = postings?.length || 0;

  return (
    <div className="careers-page">
      <style>{CAREERS_CSS}</style>
      <CareersChrome />

      <div className="careers-hero">
        <p className="careers-kicker">Jobs on Collarone</p>
        <h1>Work with companies that run on Collarone.</h1>
        <p className="careers-lede">
          Every open role from every company hiring through the platform — apply directly, no account required.
        </p>
        <input
          className="careers-search" type="search" placeholder="Search roles, companies, locations…"
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search jobs"
        />
      </div>

      <main className="careers-list" style={{ maxWidth: 780 }}>
        {error && <p className="careers-empty">Couldn't load jobs right now. Please try again shortly.</p>}
        {postings === null && !error && <div className="boot-spinner" style={{ margin: '40px auto' }} />}
        {postings && total === 0 && <p className="careers-empty">No open roles right now — check back soon.</p>}
        {postings && total > 0 && groups.length === 0 && <p className="careers-empty">Nothing matches "{q}" — try another search.</p>}

        {groups.map((g) => (
          <section key={g.slug} className="careers-org-group">
            <div className="careers-org-head">
              <Link to={`/careers/${g.slug}`} className="careers-org-name">{g.name}</Link>
              <span className="careers-org-count">{g.roles.length} open role{g.roles.length === 1 ? '' : 's'}</span>
            </div>
            {g.roles.map((p) => (
              <Link key={p.id} to={`/careers/${g.slug}/${p.id}`} className="careers-card">
                <div>
                  <h2>{p.title}</h2>
                  <p className="careers-card-meta">
                    {p.department_name || g.name} · {p.location || 'Location on request'} · {C.EMPLOYMENT_TYPE_LABEL[p.employment_type] || p.employment_type}
                  </p>
                  {C.fmtSalaryRange(p.salary_min, p.salary_max) && <p className="careers-card-salary">{C.fmtSalaryRange(p.salary_min, p.salary_max)}</p>}
                </div>
                <span className="careers-card-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </section>
        ))}

        <div className="careers-hire-cta">
          <div>
            <b>Hiring for your own company?</b>
            <p>Post roles, screen candidates and onboard hires — recruiting is one of Collarone's 17 suites.</p>
          </div>
          <Link className="btn btn-primary" to="/signup">Start hiring on Collarone</Link>
        </div>
      </main>

      <footer className="careers-footer">
        © {new Date().getFullYear()} Collarone · Jobs posted by companies on the Collarone platform
      </footer>
    </div>
  );
}
