import { useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { applyOrgTheme } from '../../lib/theme.js';
import AppLayout from '../../components/AppLayout.jsx';

const SWATCHES = ['#FF5B1F', '#C2410C', '#0F766E', '#1D4ED8', '#7C3AED', '#BE185D', '#0A0E1A', '#166534'];
const WEBSITE_TYPE_LABEL = { ecommerce: 'Online store', hr_corporate: 'Company site', job_board: 'Careers / job board', none: 'Not set up yet' };

export default function AdminWebsite() {
  const { user, refreshUser } = useAuth();
  const org = user?.org;
  const [themeColor, setThemeColor] = useState(org?.themeColor || '#FF5B1F');
  const [logoUrl, setLogoUrl] = useState(org?.logoUrl || '');
  const [logoPreview, setLogoPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  const flash = (msg, isErr) => { setToast({ msg, isErr }); setTimeout(() => setToast(null), 3000); };

  const pickLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return flash('Logo must be under 3 MB.', true);
    setLogoPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const path = `${user.id}/logo.${ext}`;
      const { error } = await supabase.storage.from('org-logos').upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw new Error(error.message);
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
      setLogoUrl(`${SUPABASE_URL}/storage/v1/object/public/org-logos/${path}?t=${Date.now()}`);
    } catch (e2) {
      flash(e2.message, true);
      setLogoPreview('');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('organizations').update({ theme_color: themeColor, logo_url: logoUrl }).eq('id', org.id);
      if (error) throw new Error(error.message);
      applyOrgTheme(themeColor);
      await refreshUser();
      flash('Saved.');
    } catch (e) {
      flash(e.message, true);
    } finally {
      setSaving(false);
    }
  };

  const displayLogo = logoPreview || logoUrl;

  return (
    <AppLayout breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Website' }]} title="Your website & brand">
      <div style={{ maxWidth: 560 }}>
        <div style={{ padding: 24, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, margin: '0 0 16px' }}>Dashboard branding</h2>

          <div className="field" style={{ marginBottom: 18 }}>
            <label>Logo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6 }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--surface-2)', border: '1.5px dashed var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {displayLogo ? <img src={displayLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Logo</span>}
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? 'Uploading…' : 'Change logo'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={pickLogo} style={{ display: 'none' }} />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 18 }}>
            <label>Brand colour</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
              {SWATCHES.map((c) => (
                <button key={c} type="button" onClick={() => setThemeColor(c)} aria-label={c}
                  style={{ width: 30, height: 30, borderRadius: '50%', background: c, cursor: 'pointer',
                    border: themeColor === c ? '2px solid var(--text)' : '2px solid transparent',
                    boxShadow: themeColor === c ? '0 0 0 2px #fff, 0 0 0 4px rgba(0,0,0,0.12)' : 'none' }} />
              ))}
            </div>
          </div>

          <button className="btn btn-primary" onClick={save} disabled={saving || uploading}>
            {saving ? <span className="spinner" /> : 'Save changes'}
          </button>
        </div>

        <div style={{ padding: 24, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)' }}>
          <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>Public website</h2>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 12px' }}>
            You told us you're building: <strong style={{ color: 'var(--text)' }}>{WEBSITE_TYPE_LABEL[org?.websiteType] || 'Not set up yet'}</strong>
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0 }}>
            The public site builder is launching soon — your <strong style={{ color: 'var(--text)' }}>{org?.slug}.collarone.app</strong> handle is already reserved for it. We'll email you the moment it's ready.
          </p>
        </div>
      </div>
      {toast && <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>}
    </AppLayout>
  );
}
