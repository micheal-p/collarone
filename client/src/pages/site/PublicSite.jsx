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
  const [payResult, setPayResult] = useState(null); // { paid, orderNo } after a Paystack redirect

  // Returning from the store's Paystack checkout (?payref=…): confirm the
  // payment server-side — the order marks itself paid, no proof-of-transfer.
  useEffect(() => {
    const ref = searchParams.get('payref') || searchParams.get('reference');
    if (!ref || !slug) return;
    window.history.replaceState({}, '', window.location.pathname);
    fetch('/api/site-pay', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', orgSlug: slug, reference: ref }),
    })
      .then((r) => r.json())
      .then((d) => setPayResult({ paid: Boolean(d.paid), orderNo: d.orderNo || '' }))
      .catch(() => setPayResult({ paid: false, orderNo: '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

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
      {payResult && (
        <div style={{ position: 'sticky', top: 0, zIndex: 51, background: payResult.paid ? '#12833F' : '#B7791F', color: '#fff', textAlign: 'center', padding: '10px 14px', fontSize: 13.5 }}>
          {payResult.paid
            ? <>Payment confirmed — order <strong>{payResult.orderNo}</strong> is paid. The store has your order.</>
            : <>We couldn't confirm that payment yet. If you were debited, the store will still see it — or contact them directly.</>}
          <button onClick={() => setPayResult(null)} aria-label="Dismiss" style={{ marginLeft: 12, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}>Dismiss</button>
        </div>
      )}
      <Layout data={{ ...data, isPreview }} activeSlug={activeSlug} setActiveSlug={setActiveSlug} />
    </>
  );
}
