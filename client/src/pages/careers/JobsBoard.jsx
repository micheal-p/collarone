import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as C from './careersApi.js';
import { CAREERS_CSS } from './CareersIndex.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { setSeo } from '../../lib/seo.js';
import { PublicNav, PublicFooter } from '../../components/PublicChrome.jsx';

/* =========================================================================
   The Collarone jobs board, the OPEN community wall (anyone posts free, shared
   from WhatsApp) up top, plus roles from companies that run on Collarone below.
   A public, SEO-driven traffic surface: seekers find jobs, employers see the
   platform, and every shared link points back here.
   ========================================================================= */

export default function JobsBoard() {
  const [wall, setWall] = useState(null);       // community posts
  const [postings, setPostings] = useState(null); // company roles
  const [q, setQ] = useState('');

  useEffect(() => {
    setSeo({
      title: 'Jobs in Nigeria, Collarone jobs board',
      description: 'Free job board for Nigerian businesses. Browse open roles, or post your own job in seconds and share it to WhatsApp. New jobs daily.',
      canonical: 'https://collarone.app/jobs',
      jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Collarone Jobs', url: 'https://collarone.app/jobs' },
    });
    supabase.from('job_wall_posts').select('slug, title, company, location, pay_text, apply_method, created_at')
      .order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setWall(data || [])).catch(() => setWall([]));
    C.getAllPostings().then(setPostings).catch(() => setPostings([]));
  }, []);

  const needle = q.trim().toLowerCase();
  const wallShown = useMemo(() => (wall || []).filter((p) =>
    !needle || [p.title, p.company, p.location].some((x) => String(x || '').toLowerCase().includes(needle))), [wall, needle]);

  const groups = useMemo(() => {
    if (!postings) return [];
    const filtered = needle ? postings.filter((p) => [p.title, p.org_name, p.location].some((x) => String(x || '').toLowerCase().includes(needle))) : postings;
    const byOrg = new Map();
    filtered.forEach((p) => { if (!byOrg.has(p.org_slug)) byOrg.set(p.org_slug, { slug: p.org_slug, name: p.org_name, roles: [] }); byOrg.get(p.org_slug).roles.push(p); });
    return [...byOrg.values()].sort((a, b) => b.roles.length - a.roles.length);
  }, [postings, needle]);

  return (
    <div className="cl careers-page" style={{ background: 'var(--bg)' }}>
      <style>{CAREERS_CSS}</style>
      <PublicNav active="jobs" />

      <div className="careers-hero" style={{ paddingTop: 130 }}>
        <p className="careers-kicker">Collarone jobs board</p>
        <h1>Find a job. Or post one, free.</h1>
        <p className="careers-lede">Fresh roles from Nigerian businesses. Posting takes seconds and you get a link to share straight to your WhatsApp groups.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 6 }}>
          <Link to="/jobs/post" className="cl-btn cl-btn-primary">Post a job, free</Link>
        </div>
        <input className="careers-search" type="search" placeholder="Search roles, companies, locations…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search jobs" style={{ marginTop: 20 }} />
      </div>

      <main className="careers-list" style={{ maxWidth: 780 }}>
        {wall === null && <div className="boot-spinner" style={{ margin: '40px auto' }} />}

        {wall && wallShown.length > 0 && (
          <section className="careers-org-group">
            <div className="careers-org-head"><span className="careers-org-name">Latest jobs</span><span className="careers-org-count">{wallShown.length}</span></div>
            {wallShown.map((p) => (
              <Link key={p.slug} to={`/jobs/${p.slug}`} className="careers-card">
                <div>
                  <h2>{p.title}</h2>
                  <p className="careers-card-meta">{[p.company, p.location].filter(Boolean).join(' · ') || 'Nigeria'}</p>
                  {p.pay_text && <p className="careers-card-salary">{p.pay_text}</p>}
                </div>
                <span className="careers-card-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </section>
        )}

        {wall && wallShown.length === 0 && !needle && (
          <div className="careers-hire-cta" style={{ marginTop: 0 }}>
            <div><b>Be the first to post</b><p>The board is fresh. Post a job free and share it to your WhatsApp groups.</p></div>
            <Link className="cl-btn cl-btn-primary" to="/jobs/post">Post a job</Link>
          </div>
        )}

        {groups.length > 0 && (
          <>
            <div style={{ margin: '30px 0 6px', fontSize: 13, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Companies hiring on Collarone</div>
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
                      <p className="careers-card-meta">{p.department_name || g.name} · {p.location || 'Location on request'} · {C.EMPLOYMENT_TYPE_LABEL[p.employment_type] || p.employment_type}</p>
                      {C.fmtSalaryRange(p.salary_min, p.salary_max) && <p className="careers-card-salary">{C.fmtSalaryRange(p.salary_min, p.salary_max)}</p>}
                    </div>
                    <span className="careers-card-arrow" aria-hidden="true">→</span>
                  </Link>
                ))}
              </section>
            ))}
          </>
        )}

        <div className="careers-hire-cta">
          <div><b>Hiring for your own company?</b><p>Post roles, screen candidates and onboard hires, recruiting is one of Collarone&apos;s 15 suites.</p></div>
          <Link className="cl-btn cl-btn-primary" to="/signup">Start hiring on Collarone</Link>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
