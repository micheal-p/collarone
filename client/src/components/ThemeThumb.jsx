// A LIVE thumbnail of a theme — it renders the exact same renderer a customer's
// published site uses (a folder theme like Atelier, or a legacy layout) with
// Nigerian sample content, at full 1280px width, then scales the whole thing
// down to fit the card. So the card shows the real web screen, not a mock.
// Lazy-loaded by PublicThemeGallery so the theme code never weighs down a page
// that is only showing cards until it's actually visible.
import { useLayoutEffect, useRef, useState } from 'react';
import { LAYOUTS } from '../pages/site/siteLayouts.jsx';
import { getSiteTheme } from '../pages/site/themes/index.js';
import { samplePayload } from './ThemePreview.jsx';

const BASE_W = 1280; // design width we render at, then scale to fit the card

export default function ThemeThumb({ theme }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0.26);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { if (el.clientWidth) setScale(el.clientWidth / BASE_W); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = samplePayload(theme);
  const home = data.pages.find((p) => p.is_home)?.slug || data.pages[0]?.slug;
  const folder = getSiteTheme(theme.key);
  const Layout = LAYOUTS[data.theme.layoutKey] || LAYOUTS['company-profile'];
  const noop = () => {};

  return (
    <div ref={ref} className="ptg-thumb" aria-hidden="true">
      <div className="ptg-thumb-canvas" style={{ width: BASE_W, transform: `scale(${scale})` }}>
        {folder
          ? <folder.Component data={data} activeSlug={home} setActiveSlug={noop} />
          : <Layout data={data} activeSlug={home} setActiveSlug={noop} />}
      </div>
    </div>
  );
}
