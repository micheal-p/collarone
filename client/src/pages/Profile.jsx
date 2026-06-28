import { useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiPatch } from '../api/client.js';
import { supabase } from '../lib/supabaseClient.js';
import AppLayout from '../components/AppLayout.jsx';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';

const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

const ROLE_LABEL = { super_admin: 'System Admin', manager: 'Manager', staff: 'Staff' };

export default function Profile() {
  const { user, setUser } = useAuth();
  const [phone, setPhone] = useState(user?.phone || '');
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [preview, setPreview] = useState(null);       // blob URL for local preview
  const [pendingFile, setPendingFile] = useState(null); // File object to upload on save
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  const flash = (msg, isErr) => {
    setToast({ msg, isErr });
    setTimeout(() => setToast(null), 3000);
  };

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { flash('Image must be under 5 MB.', true); return; }
    setPendingFile(file);
    setPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const save = async () => {
    if (!phone.trim()) { flash('Phone number is required.', true); return; }
    setSaving(true);
    try {
      let finalUrl = avatarUrl;
      if (pendingFile) {
        const ext  = pendingFile.name.split('.').pop().toLowerCase();
        const path = `${user.id}/avatar.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('avatars')
          .upload(path, pendingFile, { upsert: true, contentType: pendingFile.type });
        if (upErr) throw new Error(upErr.message);
        // public URL + cache-bust
        finalUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
        setAvatarUrl(finalUrl);
        setPendingFile(null);
        if (preview) { URL.revokeObjectURL(preview); setPreview(null); }
      }
      const { user: updated } = await apiPatch('/me', { phone, whatsapp, avatarUrl: finalUrl });
      setUser(updated);
      flash('Profile saved.');
    } catch (e) {
      flash(e.message, true);
    } finally {
      setSaving(false);
    }
  };

  const displayAvatar = preview || avatarUrl;
  const roleLabel = ROLE_LABEL[user?.role] || user?.role || '—';

  return (
    <AppLayout
      breadcrumb={[{ label: 'Home', to: '/' }, { label: 'My profile' }]}
      title="My profile"
    >
      <div style={{ maxWidth: 580, marginTop: 8 }}>

        {/* Avatar card */}
        <div className="card" style={{ padding: 24, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {displayAvatar ? (
              <img
                src={displayAvatar}
                alt="Profile"
                style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--line)' }}
              />
            ) : (
              <span className="avatar" style={{ width: 80, height: 80, fontSize: 28 }}>{initials(user?.name)}</span>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 26, height: 26, borderRadius: '50%',
                border: '2px solid var(--surface)', background: 'var(--brand)',
                display: 'grid', placeItems: 'center', cursor: 'pointer',
              }}
              title="Upload photo"
            >
              <CameraIcon />
            </button>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{user?.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{user?.email}</div>
            <div style={{ marginTop: 6 }}>
              <span className={`role-pill role-${user?.role}`}>{roleLabel}</span>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickFile} />
        </div>

        {/* Read-only info */}
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>
            Account details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 32px' }}>
            {[
              { label: 'Full name',   value: user?.name     || '—' },
              { label: 'Email',       value: user?.email    || '—' },
              { label: 'Job title',   value: user?.jobTitle || '—' },
              { label: 'Department',  value: user?.department || '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13 }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 14, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 4 }}>
            Name, email, job title and department are managed by your administrator.
          </div>
        </div>

        {/* Editable fields */}
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 16 }}>
            Contact details
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label>
              Phone number <span style={{ color: 'var(--brand)' }}>*</span>
            </label>
            <input
              type="tel"
              placeholder="+234 800 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              WhatsApp number
              <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 400 }}>(optional — leave blank if same as phone)</span>
            </label>
            <input
              type="tel"
              placeholder="+234 800 000 0000"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </div>

      {toast && <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>}
    </AppLayout>
  );
}

const CameraIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);
