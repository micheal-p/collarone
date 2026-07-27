// /jobs/:slug — a single community job post. The page people land on when a
// poster forwards their Collarone link to a WhatsApp group. Carries JobPosting
// JSON-LD so Google can surface it in job results, a one-tap WhatsApp share, and
// a report control. Only live, un-expired posts resolve (RLS enforces it).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { setSeo } from '../../lib/seo.js';
import { PublicNav, PublicFooter } from '../../components/PublicChrome.jsx';

const applyHref = (method, contact) => {
  const c = (contact || '').trim();
  if (!c) return null;
  if (method === 'whatsapp') return `https://wa.me/${c.replace(/[^\d]/g, '').replace(/^0/, '234')}`;
  if (method === 'phone') return `tel:${c}`;
  if (method === 'email') return `mailto:${c}`;
  return /^https?:\/\//.test(c) ? c : `https://${c}`;
};

export default function JobShare() {
  const { slug } = useParams();
  const [post, setPost] = useState(undefined); // undefined=loading, null=not found
  const [reported, setReported] = useState(false);

  useEffect(() => {
    supabase.from('job_wall_posts')
      .select('slug, title, company, location, pay_text, description, apply_method, apply_contact, created_at, expires_at')
      .eq('slug', slug).maybeSingle()
      .then(({ data }) => setPost(data || null)).catch(() => setPost(null));
  }, [slug]);

  useEffect(() => {
    if (!post) return;
    const url = `https://collarone.app/jobs/${post.slug}`;
    setSeo({
      title: `${post.title}${post.company ? ' at ' + post.company : ''} — Collarone Jobs`,
      description: (post.description || '').slice(0, 155),
      canonical: url,
      jsonLd: {
        '@context': 'https://schema.org', '@type': 'JobPosting',
        title: post.title, description: post.description,
        datePosted: post.created_at, validThrough: post.expires_at,
        employmentType: 'OTHER', directApply: false,
        hiringOrganization: { '@type': 'Organization', name: post.company || 'Employer' },
        jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: post.location || 'Nigeria', addressCountry: 'NG' } },
        ...(post.pay_text ? { estimatedSalary: post.pay_text } : {}),
      },
    });
  }, [post]);

  const report = async () => {
    setReported(true);
    fetch('/api/job-post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'report', slug }) }).catch(() => {});
  };

  const wrap = { maxWidth: 680, margin: '0 auto', padding: '120px 20px 80px' };

  return (
    <div className="cl" style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <PublicNav active="jobs" />
      <main style={wrap}>
        {post === undefined && <div className="boot-spinner" style={{ margin: '60px auto' }} />}
        {post === null && (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 24 }}>This job isn&apos;t available</h1>
            <p style={{ color: 'var(--text-soft)' }}>It may have been filled, taken down, or expired.</p>
            <Link className="cl-btn cl-btn-primary" style={{ marginTop: 16 }} to="/jobs">See other jobs</Link>
          </div>
        )}
        {post && (
          <article>
            <Link to="/jobs" className="cl-nl" style={{ fontSize: 13 }}>← All jobs</Link>
            <h1 style={{ fontSize: 30, margin: '14px 0 6px' }}>{post.title}</h1>
            <p style={{ color: 'var(--text-soft)', fontSize: 15 }}>{[post.company, post.location].filter(Boolean).join(' · ') || 'Nigeria'}</p>
            {post.pay_text && <p style={{ color: 'var(--accent-ink)', fontWeight: 600, marginTop: 4 }}>{post.pay_text}</p>}

            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, marginTop: 22, fontSize: 15 }}>{post.description}</div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 28 }}>
              {applyHref(post.apply_method, post.apply_contact)
                ? <a className="cl-btn cl-btn-primary" href={applyHref(post.apply_method, post.apply_contact)} target="_blank" rel="noreferrer">Apply now</a>
                : <span style={{ color: 'var(--text-faint)', fontSize: 14 }}>See the post for how to apply.</span>}
              <a className="cl-btn cl-btn-ghost" target="_blank" rel="noreferrer"
                href={`https://wa.me/?text=${encodeURIComponent(`${post.title}${post.company ? ' at ' + post.company : ''} — apply here: https://collarone.app/jobs/${post.slug}`)}`}>
                Share to WhatsApp
              </a>
            </div>

            <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>Posted on the free Collarone jobs board.</span>
              {reported
                ? <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>Thanks — we&apos;ll review it.</span>
                : <button onClick={report} className="cl-nl" style={{ fontSize: 12.5, background: 'none', border: 0, cursor: 'pointer', color: 'var(--text-faint)' }}>Report this post</button>}
            </div>
          </article>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
