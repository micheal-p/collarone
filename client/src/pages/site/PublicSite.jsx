import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getPublicSite, getPreviewSite } from '../admin/website/websiteApi.js';
import { LAYOUTS } from './siteLayouts.jsx';

export default function PublicSite() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === '1';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeSlug, setActiveSlug] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchSite = isPreview ? getPreviewSite() : getPublicSite(slug);
    fetchSite
      .then((d) => { if (cancelled) return; if (!d) { setError(true); } else { setData(d); setActiveSlug(d.pages.find((p) => p.is_home)?.slug || d.pages[0]?.slug); } })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug, isPreview]);

  // Anonymous per-page visit beacon for the org's own Insights tab (page +
  // country only, resolved server-side). Previews don't count as traffic.
  useEffect(() => {
    if (isPreview || !slug || !activeSlug) return;
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgSlug: slug, path: activeSlug }),
      keepalive: true,
    }).catch(() => {});
  }, [slug, activeSlug, isPreview]);

  if (loading) return <div className="full-center"><div className="boot-spinner" /></div>;

  if (error || !data) {
    return (
      <div className="full-center" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 22 }}>Site not found</h1>
        <p style={{ color: 'var(--text-2)' }}>
          {isPreview ? "You haven't set up a website yet, or aren't signed in as this org's admin." : "This site doesn't exist or hasn't been published yet."}
        </p>
      </div>
    );
  }

  const Layout = LAYOUTS[data.theme?.layoutKey] || LAYOUTS['company-profile'];
  return (
    <>
      {isPreview && (
        <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#111', color: '#fff', textAlign: 'center', padding: '6px 12px', fontSize: 12.5 }}>
          Preview mode — {data.published ? 'this site is live.' : 'not published yet, only you can see this.'}
        </div>
      )}
      <Layout data={data} activeSlug={activeSlug} setActiveSlug={setActiveSlug} />
    </>
  );
}
