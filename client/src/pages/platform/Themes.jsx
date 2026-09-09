// The website-builder catalog, and who is using what. A gallery, because
// themes are looked at, not read.
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../api/client.js';
import ThemeMockup from '../../components/ThemeMockup.jsx';
import ThemePreviewModal from '../../components/ThemePreview.jsx';
import { Empty, Seg } from './shared.jsx';

const CAT = { ecommerce: 'Online store', landing: 'Landing page', profile: 'Company profile' };
const catLabel = (c) => CAT[c] || 'Company profile';

export default function Themes() {
  const [themes, setThemes] = useState(null);
  const [sites, setSites] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [cat, setCat] = useState('all');
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    Promise.all([apiGet('/platform/site-themes'), apiGet('/platform/sites'), apiGet('/platform/organizations')])
      .then(([t, s, o]) => { setThemes(t.themes || []); setSites(s.sites || []); setOrgs(o.organizations || []); })
      .catch(() => setThemes([]));
  }, []);

  const usage = useMemo(() => {
    const m = {};
    sites.forEach((s) => { (m[s.theme_key] ||= []).push({ ...s, orgName: orgs.find((o) => o.id === s.org_id)?.name || 'an organization' }); });
    return m;
  }, [sites, orgs]);

  const all = themes || [];
  const cats = useMemo(() => {
    const c = { all: all.length };
    all.forEach((t) => { const k = t.category === 'ecommerce' || t.category === 'landing' ? t.category : 'profile'; c[k] = (c[k] || 0) + 1; });
    return c;
  }, [all]);
  const shown = all.filter((t) => cat === 'all' || (cat === 'profile' ? !(t.category === 'ecommerce' || t.category === 'landing') : t.category === cat));
  const inUse = Object.keys(usage).length;

  return (
    <>
      <div className="pc-toolbar">
        <Seg label="Category" value={cat} onChange={setCat} options={[['all', 'All', cats.all], ['profile', 'Company profile', cats.profile], ['ecommerce', 'Online store', cats.ecommerce], ['landing', 'Landing page', cats.landing]]} />
        <span className="pc-sec-spacer" />
        <span className="pc-faint" style={{ fontSize: 12.5 }}>{sites.length} site{sites.length === 1 ? '' : 's'} built on {inUse} theme{inUse === 1 ? '' : 's'}, {sites.filter((s) => s.published).length} live</span>
      </div>

      {themes == null ? <div className="pc-empty">Loading…</div> : shown.length === 0 ? (
        <div className="pc-card"><Empty title="No themes in this category">Themes are added by migration to the site_themes table.</Empty></div>
      ) : (
        <div className="pc-gallery">
          {shown.map((t) => {
            const used = usage[t.key] || [];
            const live = used.filter((s) => s.published).length;
            return (
              <div key={t.key} className="pc-card pc-theme">
                <div className="pc-theme-mock"><ThemeMockup theme={t} height={118} /></div>
                <div>
                  <div className="pc-theme-name">{t.name}</div>
                  <div className="pc-theme-cat">{catLabel(t.category)}</div>
                </div>
                <div className={`pc-theme-use${used.length ? ' on' : ''}`} title={used.map((s) => `${s.orgName}${s.published ? ' (live)' : ' (draft)'}`).join(', ')}>
                  {used.length === 0 ? 'Not in use' : `${used.length} site${used.length === 1 ? '' : 's'}${live ? `, ${live} live` : ''} · ${used.slice(0, 2).map((s) => s.orgName).join(', ')}${used.length > 2 ? ` +${used.length - 2}` : ''}`}
                </div>
                <button className="pc-btn sm" onClick={() => setPreview(t)}>Preview</button>
              </div>
            );
          })}
        </div>
      )}
      {preview && <ThemePreviewModal theme={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
