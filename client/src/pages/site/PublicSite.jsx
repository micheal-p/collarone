import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicSite } from '../admin/website/websiteApi.js';
import { LAYOUTS } from './siteLayouts.jsx';

export default function PublicSite() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeSlug, setActiveSlug] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getPublicSite(slug)
      .then((d) => { if (cancelled) return; if (!d) { setError(true); } else { setData(d); setActiveSlug(d.pages.find((p) => p.is_home)?.slug || d.pages[0]?.slug); } })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) return <div className="full-center"><div className="boot-spinner" /></div>;

  if (error || !data) {
    return (
      <div className="full-center" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 22 }}>Site not found</h1>
        <p style={{ color: 'var(--text-2)' }}>This site doesn&rsquo;t exist or hasn&rsquo;t been published yet.</p>
      </div>
    );
  }

  const Layout = LAYOUTS[data.theme?.layoutKey] || LAYOUTS['company-profile'];
  return <Layout data={data} activeSlug={activeSlug} setActiveSlug={setActiveSlug} />;
}
