import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiPatch } from '../api/client.js';
import { supabase } from '../lib/supabaseClient.js';
import AppLayout from '../components/AppLayout.jsx';
import * as P from '../suites/payroll/payrollApi.js';
import * as PF from '../suites/hr/performanceApi.js';
import * as L from '../suites/hr/lettersApi.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';

const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

const ROLE_LABEL = { super_admin: 'System Admin', manager: 'Manager', staff: 'Staff' };

export default function Profile() {
  const { user, setUser } = useAuth();
  const [phone, setPhone] = useState(user?.phone || '');
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [dateOfBirth, setDateOfBirth] = useState(user?.dateOfBirth || '');
  const [address, setAddress] = useState(user?.address || '');
  const [ecName, setEcName] = useState(user?.emergencyContactName || '');
  const [ecPhone, setEcPhone] = useState(user?.emergencyContactPhone || '');
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
      const { user: updated } = await apiPatch('/me', { phone, whatsapp, avatarUrl: finalUrl, dateOfBirth, address, emergencyContactName: ecName, emergencyContactPhone: ecPhone });
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
      <style>{`
        .lc-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:700; }
        .lc-exit-done    { background:#dff6dd; color:#1a6a1a; }
        .lc-req-draft    { background:#f3f2f1; color:#605e5c; }
        .lc-stage-rejected { background:#fde7e9; color:#a4262c; }
      `}</style>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Date of birth
                <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 400 }}>(for the team birthdays board)</span>
              </label>
              <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div className="field">
              <label>Emergency contact name</label>
              <input value={ecName} onChange={(e) => setEcName(e.target.value)} placeholder="Next of kin" style={{ width: '100%' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
            <div className="field">
              <label>Emergency contact phone</label>
              <input type="tel" value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} placeholder="+234 800 000 0000" style={{ width: '100%' }} />
            </div>
            <div className="field">
              <label>Home address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, state" style={{ width: '100%' }} />
            </div>
          </div>
        </div>

        <MyPayslips />
        <MyGoals />
        <MyReviews />
        <LetterRequests />

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

function MyPayslips() {
  const [payslips, setPayslips] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => { P.getMyPayslips().then(setPayslips).catch(() => setPayslips([])); }, []);

  if (payslips === null) return null;
  if (payslips.length === 0) return null;

  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>
        My payslips
      </div>
      {payslips.map((p) => (
        <div key={p.id} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setOpen(open === p.id ? null : p.id)}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{P.MONTHS[p.run.period_month - 1]} {p.run.period_year}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{P.money(p.net)}</span>
          </div>
          {open === p.id && (
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.8 }}>
              Gross {P.money(p.gross)} · Pension {P.money(p.pension_employee)} · NHF {P.money(p.nhf)} · PAYE {P.money(p.paye)}
              {p.other_deductions > 0 && <> · Other deductions {P.money(p.other_deductions)}</>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MyGoals() {
  const [goals, setGoals] = useState(null);

  useEffect(() => { PF.getGoals().then(setGoals).catch(() => setGoals([])); }, []);

  const markDone = async (g) => {
    try { const updated = await PF.updateGoal(g.id, { status: 'done' }); setGoals((gs) => gs.map((x) => (x.id === updated.id ? updated : x))); }
    catch { /* silent — non-critical self-service action */ }
  };

  if (goals === null || goals.length === 0) return null;

  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>
        My goals
      </div>
      {goals.map((g) => {
        const st = PF.GOAL_STATUS[g.status];
        return (
          <div key={g.id} style={{ borderTop: '1px solid var(--line)', padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{g.title}</div>
              {g.target_date && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Target {PF.fmtDate(g.target_date)}</div>}
            </div>
            {g.status !== 'done' ? (
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => markDone(g)}>Mark done</button>
            ) : <span className={`lc-badge ${st.cls}`}>{st.label}</span>}
          </div>
        );
      })}
    </div>
  );
}

function MyReviews() {
  const [reviews, setReviews] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => { PF.getReviews().then((rs) => setReviews(rs.filter((r) => r.status !== 'draft'))).catch(() => setReviews([])); }, []);

  const ack = async (r) => {
    try { const updated = await PF.acknowledgeReview(r.id); setReviews((rs) => rs.map((x) => (x.id === updated.id ? updated : x))); }
    catch { /* silent */ }
  };

  if (reviews === null || reviews.length === 0) return null;

  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>
        My reviews
      </div>
      {reviews.map((r) => (
        <div key={r.id} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setOpen(open === r.id ? null : r.id)}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{r.cycle_label}</span>
            {r.status === 'submitted'
              ? <button className="btn btn-primary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={(e) => { e.stopPropagation(); ack(r); }}>Acknowledge</button>
              : <span className="lc-badge lc-exit-done">Acknowledged</span>}
          </div>
          {open === r.id && (
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.7 }}>
              {r.rating && <div>Rating: {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>}
              {r.strengths && <p style={{ margin: '4px 0 0' }}><b>Strengths:</b> {r.strengths}</p>}
              {r.improvements && <p style={{ margin: '4px 0 0' }}><b>Areas to improve:</b> {r.improvements}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LetterRequests() {
  const [letters, setLetters] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [type, setType] = useState('employment_verification');
  const [purpose, setPurpose] = useState('');

  const load = () => { L.getLetters().then(setLetters).catch(() => setLetters([])); };
  useEffect(load, []);

  const submit = async () => {
    setRequesting(true);
    try { await L.requestLetter({ letterType: type, purpose }); setPurpose(''); load(); }
    catch { /* silent */ } finally { setRequesting(false); }
  };

  if (letters === null) return null;

  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>
        Letter requests
      </div>
      {letters.map((l) => {
        const st = L.LETTER_STATUS[l.status];
        return (
          <div key={l.id} style={{ borderTop: '1px solid var(--line)', padding: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>{L.LETTER_TYPE[l.letter_type]} · {L.fmtDate(l.requested_at)}</span>
            <span className={`lc-badge ${st.cls}`}>{st.label}</span>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <select className="select" value={type} onChange={(e) => setType(e.target.value)} style={{ fontSize: 13 }}>
          {Object.entries(L.LETTER_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className="input" placeholder="Purpose (optional)" value={purpose} onChange={(e) => setPurpose(e.target.value)} style={{ fontSize: 13, flex: 1, minWidth: 160 }} />
        <button className="btn btn-primary" style={{ fontSize: 13 }} disabled={requesting} onClick={submit}>Request letter</button>
      </div>
    </div>
  );
}

const CameraIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);
