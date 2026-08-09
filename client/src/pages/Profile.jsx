import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiGet, apiPatch } from '../api/client.js';
import { supabase } from '../lib/supabaseClient.js';
import { privateFileUrl } from '../lib/privateFile.js';
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
              <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 400 }}>(optional, leave blank if same as phone)</span>
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
        <MyLetters />
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

// An employee's own letters. The RLS policy on hr_letters has always allowed
// this (`employee_id = auth.uid()`) — there was simply no screen, so the way to
// get a copy of your own confirmation letter was to email HR and wait. Banks
// and embassies ask for these at short notice, which is exactly when nobody
// wants to be waiting on somebody else's inbox.
function MyLetters() {
  const [letters, setLetters] = useState(null);
  useEffect(() => {
    apiGet('/hr/issued-letters').then((d) => setLetters(d.letters || []), () => setLetters([]));
  }, []);

  const open = async (l) => {
    try {
      if (l.file_path) {
        window.open(await privateFileUrl('hr-letters', l.file_path), '_blank', 'noopener');
        return;
      }
      // Older letters were stored as text with no rendered file. Print the body
      // rather than tell the employee their letter is unavailable.
      const w = window.open('', '_blank', 'noopener,width=820,height=900');
      if (!w) return;
      const esc = (t) => String(t ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      w.document.write(`<title>${esc(l.title)}</title><body style="font:14px/1.7 Georgia,serif;max-width:640px;margin:40px auto;white-space:pre-wrap">${esc(l.body)}</body>`);
      w.document.close();
    } catch (e) { /* the button simply does nothing rather than break the page */ }
  };

  if (letters === null || letters.length === 0) return null;
  const LABEL = {
    confirmation: 'Confirmation', promotion: 'Promotion', introduction: 'Introduction',
    employment_verification: 'Employment verification', query: 'Query', warning: 'Warning', custom: 'Letter',
  };

  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>
        My letters
      </div>
      {letters.map((l) => (
        <div key={l.id} style={{ borderTop: '1px solid var(--line)', padding: '10px 0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{l.title}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {LABEL[l.letter_type] || 'Letter'} · {new Date(l.issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 12px' }} onClick={() => open(l)}>
            View / print
          </button>
        </div>
      ))}
      <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
        Use your browser's print dialog to save any of these as a PDF.
      </p>
    </div>
  );
}

function MyPayslips() {
  const { user } = useAuth();
  const [payslips, setPayslips] = useState(null);
  const [open, setOpen] = useState(null);
  const [printSlip, setPrintSlip] = useState(null);

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500, cursor: 'pointer', flex: 1 }} onClick={() => setOpen(open === p.id ? null : p.id)}>
              {P.MONTHS[p.run.period_month - 1]} {p.run.period_year}
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{P.money(p.net)}</span>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 12px' }} onClick={() => setPrintSlip(p)}>View / print</button>
          </div>
          {open === p.id && <PayComputation slip={p} />}
        </div>
      ))}
      {printSlip && <PayslipPrint slip={printSlip} user={user} onClose={() => setPrintSlip(null)} />}
    </div>
  );
}

// "How this was computed" — the line-by-line walk from gross to net.
//
// A payslip that states a number without showing the arithmetic invites the
// question everyone actually asks: "why is my tax that much?". The answer used
// to be a one-line summary that restated the figures without explaining any of
// them, so the question came to HR instead. Every value here comes off the
// payslip row itself; nothing is recalculated in the browser, so this can never
// disagree with what was paid.
function PayComputation({ slip }) {
  const n = (v) => Number(v || 0);
  const base = n(slip.basic) + n(slip.housing) + n(slip.transport) + n(slip.other_allowances);
  const days = slip.days_worked && slip.days_in_month && n(slip.days_worked) < n(slip.days_in_month);
  const line = (label, value, opts = {}) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0',
      fontWeight: opts.strong ? 700 : 400, color: opts.muted ? 'var(--text-3)' : undefined }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {opts.minus ? '− ' : ''}{P.money(Math.abs(n(value)))}
      </span>
    </div>
  );
  return (
    <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 10, lineHeight: 1.6,
      background: 'var(--surface-2, #faf9f7)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
        How this was worked out
      </div>
      {line('Basic', slip.basic)}
      {n(slip.housing) > 0 && line('Housing', slip.housing)}
      {n(slip.transport) > 0 && line('Transport', slip.transport)}
      {n(slip.other_allowances) > 0 && line('Other allowances', slip.other_allowances)}
      {n(slip.taxable_earnings) > 0 && line('Bonus / commission / arrears', slip.taxable_earnings)}
      {line('Gross pay', slip.gross, { strong: true })}
      {days && (
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', padding: '2px 0 6px' }}>
          Prorated for {slip.days_worked} of {slip.days_in_month} days — you were not employed for the whole month.
        </div>
      )}
      <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
      {line('Pension (your 8%)', slip.pension_employee, { minus: true })}
      {n(slip.nhf) > 0 && line('NHF (2.5% of basic)', slip.nhf, { minus: true })}
      {line('PAYE tax', slip.paye, { minus: true })}
      {n(slip.loan_deductions) > 0 && line('Loan / advance repayment', slip.loan_deductions, { minus: true })}
      {n(slip.manual_deductions) > 0 && line('Other deductions', slip.manual_deductions, { minus: true })}
      {n(slip.late_deduction) > 0 && line('Lateness', slip.late_deduction, { minus: true })}
      {n(slip.nontaxable_earnings) > 0 && line('Reimbursement (not taxed)', slip.nontaxable_earnings)}
      <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
      {line('Take-home', slip.net, { strong: true })}
      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '8px 0 0', lineHeight: 1.5 }}>
        PAYE is worked out on your yearly pay under the 2026 Tax Act — your salary is annualised, the
        relief and your pension and NHF are taken off, the tax bands are applied, and the result is
        divided by twelve. That is why it is not a flat percentage of this month.
      </p>
    </div>
  );
}

// The formal document — banks and embassies ask for payslips; this one prints
// clean on the org's identity via the browser's print-to-PDF.
function PayslipPrint({ slip, user, onClose }) {
  const period = `${P.MONTHS[slip.run.period_month - 1]} ${slip.run.period_year}`;
  const earn = [
    ['Basic', slip.basic], ['Housing', slip.housing], ['Transport', slip.transport],
    ['Other allowances', slip.other_allowances], ['Overtime', slip.overtime_pay],
  ].filter(([, v]) => Number(v) > 0);
  const ded = [
    ['PAYE tax', slip.paye], ['Pension (employee 8%)', slip.pension_employee], ['NHF (2.5%)', slip.nhf],
    ['Lateness', slip.late_deduction], ['Other deductions', slip.other_deductions],
  ].filter(([, v]) => Number(v) > 0);
  const row = { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee', fontSize: 13 };
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <style>{`@media print { body * { visibility: hidden; } #payslip-print, #payslip-print * { visibility: visible; } #payslip-print { position: absolute; top: 0; left: 0; width: 100%; box-shadow: none !important; } .no-print { display: none !important; } }`}</style>
      <div className="modal" style={{ maxWidth: 560 }} onMouseDown={(e) => e.stopPropagation()}>
        <div id="payslip-print" style={{ background: '#fff', color: '#14161a', padding: '28px 30px', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #14161a', paddingBottom: 14, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{user?.org?.name || 'Your company'}</div>
              <div style={{ fontSize: 12, color: '#667' }}>Payslip, {period}</div>
            </div>
            {user?.org?.logo_url && <img src={user.org.logo_url} alt="" style={{ height: 40, objectFit: 'contain' }} />}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 16 }}>
            <div><div style={{ color: '#889', fontSize: 11 }}>EMPLOYEE</div><strong>{user?.name}</strong></div>
            <div style={{ textAlign: 'right' }}><div style={{ color: '#889', fontSize: 11 }}>PERIOD</div><strong>{period}</strong></div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: '#889', margin: '10px 0 2px' }}>EARNINGS</div>
          {earn.map(([l, v]) => <div key={l} style={row}><span>{l}</span><span>{P.money(v)}</span></div>)}
          <div style={{ ...row, fontWeight: 700 }}><span>Gross pay</span><span>{P.money(slip.gross)}</span></div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: '#889', margin: '14px 0 2px' }}>DEDUCTIONS</div>
          {ded.map(([l, v]) => <div key={l} style={row}><span>{l}</span><span>−{P.money(v)}</span></div>)}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, padding: '12px 14px', background: '#f6f4ee', borderRadius: 10, fontSize: 15, fontWeight: 800 }}>
            <span>Net pay</span><span>{P.money(slip.net)}</span>
          </div>
          <p style={{ fontSize: 10.5, color: '#99a', marginTop: 16 }}>
            Generated by Collarone for {user?.org?.name || 'this workspace'}. Employer pension contribution (10%): {P.money(slip.pension_employer)}.
          </p>
        </div>
        <div className="modal-actions no-print" style={{ padding: '0 6px 6px' }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>
    </div>
  );
}

function MyGoals() {
  const [goals, setGoals] = useState(null);

  useEffect(() => { PF.getGoals().then(setGoals).catch(() => setGoals([])); }, []);

  const markDone = async (g) => {
    try { const updated = await PF.updateGoal(g.id, { status: 'done' }); setGoals((gs) => gs.map((x) => (x.id === updated.id ? updated : x))); }
    catch { /* silent, non-critical self-service action */ }
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
              {r.rating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Rating:
                  {[1, 2, 3, 4, 5].map((n) => (
                    <svg key={n} width="12" height="12" viewBox="0 0 24 24" fill={n <= r.rating ? 'var(--brand)' : 'none'} stroke={n <= r.rating ? 'var(--brand)' : 'var(--text-3, #999)'} strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" /></svg>
                  ))}
                </div>
              )}
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
