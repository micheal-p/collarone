// /jobs/post — where anyone registers a lightweight job-board account, waits for
// the platform admin to approve them (we collect enough to vet them), then posts
// jobs (form or paste-from-WhatsApp → AI structures it). Approved posters get a
// clean shareable link to forward back to their WhatsApp groups.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { setSeo } from '../../lib/seo.js';
import { PublicNav, PublicFooter } from '../../components/PublicChrome.jsx';

const post = async (bodyObj, token) => {
  const r = await fetch('/api/job-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(bodyObj),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'Something went wrong.');
  return d;
};
const token = async () => (await supabase.auth.getSession()).data.session?.access_token || null;

const card = { maxWidth: 560, margin: '0 auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '28px 26px' };
const label = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-soft)', margin: '14px 0 6px' };
const input = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', font: 'inherit', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' };

export default function PostJob() {
  const [phase, setPhase] = useState('loading'); // loading | auth | pending | approved
  const [tab, setTab] = useState('register');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSeo({ title: 'Post a job free — Collarone', description: 'Post your job to the Collarone jobs board for free and share it straight to WhatsApp. Register once, get approved, then post.', canonical: 'https://collarone.app/jobs/post' }); }, []);

  const refresh = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setPhase('auth'); return; }
    const { data: poster } = await supabase.from('job_posters').select('status').eq('id', session.user.id).maybeSingle();
    setPhase(poster?.status === 'approved' ? 'approved' : 'pending');
  };
  useEffect(() => { refresh(); }, []);

  if (phase === 'loading') return <Shell><div className="boot-spinner" style={{ margin: '60px auto' }} /></Shell>;

  return (
    <Shell>
      {phase === 'auth' && (
        <div style={card}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <TabBtn on={tab === 'register'} onClick={() => { setTab('register'); setErr(''); }}>Register</TabBtn>
            <TabBtn on={tab === 'login'} onClick={() => { setTab('login'); setErr(''); }}>Log in</TabBtn>
          </div>
          {err && <p style={{ color: 'var(--danger, #a4262c)', fontSize: 13, margin: '6px 0' }}>{err}</p>}
          {tab === 'register'
            ? <RegisterForm busy={busy} setBusy={setBusy} setErr={setErr} onDone={refresh} />
            : <LoginForm busy={busy} setBusy={setBusy} setErr={setErr} onDone={refresh} />}
        </div>
      )}

      {phase === 'pending' && (
        <div style={{ ...card, textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, margin: '4px 0 10px' }}>You&apos;re on the list ✅</h2>
          <p style={{ color: 'var(--text-soft)', fontSize: 14, lineHeight: 1.6 }}>
            Thanks for registering. The Collarone team reviews new posters (usually within a day) to keep the board free of spam and scams. You&apos;ll be able to post the moment you&apos;re approved.
          </p>
          <button className="cl-btn cl-btn-ghost" style={{ marginTop: 18 }} onClick={async () => { await supabase.auth.signOut(); refresh(); }}>Log out</button>
        </div>
      )}

      {phase === 'approved' && <PostForm onLogout={async () => { await supabase.auth.signOut(); refresh(); }} />}

      {(phase === 'pending' || phase === 'approved') && (
        <div style={{ maxWidth: 560, margin: '22px auto 0', padding: '18px 20px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Ready to run your whole business?</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-soft)', marginTop: 2 }}>Add HR, payroll, invoicing, CRM and more — pick just the suites you need, on the same account.</div>
          </div>
          <Link to="/signup" className="cl-btn cl-btn-primary" style={{ flexShrink: 0 }}>Pick your suites</Link>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="cl">
      <PublicNav active="jobs" />
      <main style={{ maxWidth: 1160, margin: '0 auto', padding: '110px 20px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <p className="cl-eyebrow" style={{ color: 'var(--accent-ink)' }}>Post a job — free</p>
          <h1 style={{ fontSize: 30, margin: '6px 0 0' }}>Hire from the Collarone board</h1>
        </div>
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}

const TabBtn = ({ on, onClick, children }) => (
  <button onClick={onClick} className={`cl-btn ${on ? 'cl-btn-primary' : 'cl-btn-ghost'} cl-btn-sm`} style={{ flex: 1 }}>{children}</button>
);
const Text = ({ l, ...p }) => (<><label style={label}>{l}</label><input style={input} {...p} /></>);

function RegisterForm({ busy, setBusy, setErr, onDone }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', company: '', role: '', website: '', about: '', password: '' });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      await post({ action: 'register', ...f });
      // sign them in so they land straight in the "awaiting approval" view
      await supabase.auth.signInWithPassword({ email: f.email.trim().toLowerCase(), password: f.password });
      onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 4px' }}>Tell us a bit about you so we can approve your account. This is a one-time step.</p>
      <Text l="Your name" value={f.name} onChange={set('name')} placeholder="Chidinma Okafor" />
      <Text l="Your role" value={f.role} onChange={set('role')} placeholder="HR Manager, Owner…" />
      <Text l="Company / organisation" value={f.company} onChange={set('company')} placeholder="Your business name" />
      <Text l="Website or social handle" value={f.website} onChange={set('website')} placeholder="yourbusiness.com or @yourbusiness" />
      <label style={label}>About your business & what you hire for</label>
      <textarea style={{ ...input, minHeight: 80, resize: 'vertical' }} value={f.about} onChange={set('about')} placeholder="A line or two: what you do, and the kind of roles you'll post." />
      <Text l="Email" type="email" value={f.email} onChange={set('email')} placeholder="you@company.com" />
      <Text l="Phone / WhatsApp" value={f.phone} onChange={set('phone')} placeholder="0801 234 5678" />
      <Text l="Password" type="password" value={f.password} onChange={set('password')} placeholder="At least 6 characters" />
      <button className="cl-btn cl-btn-primary" style={{ width: '100%', marginTop: 18 }} disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create my posting account'}</button>
    </div>
  );
}

function LoginForm({ busy, setBusy, setErr, onDone }) {
  const [f, setF] = useState({ email: '', password: '' });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim().toLowerCase(), password: f.password });
      if (error) throw new Error('Wrong email or password.');
      onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <Text l="Email" type="email" value={f.email} onChange={set('email')} placeholder="you@company.com" />
      <Text l="Password" type="password" value={f.password} onChange={set('password')} placeholder="Your password" />
      <button className="cl-btn cl-btn-primary" style={{ width: '100%', marginTop: 18 }} disabled={busy} onClick={submit}>{busy ? 'Logging in…' : 'Log in'}</button>
    </div>
  );
}

function PostForm({ onLogout }) {
  const [mode, setMode] = useState('paste'); // paste | form
  const [raw, setRaw] = useState('');
  const [f, setF] = useState({ title: '', company: '', location: '', payText: '', description: '', applyMethod: 'whatsapp', applyContact: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // { url }
  const [usedPaste, setUsedPaste] = useState(false); // origin, independent of the view mode
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const structure = async () => {
    setErr(''); setBusy(true);
    try {
      const d = await post({ action: 'structure', raw }, await token());
      if (d.notAJob) { setErr("That doesn't look like a job advert — check the text."); return; }
      setF((s) => ({ ...s, ...d.fields })); setUsedPaste(true); setMode('form');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const publish = async () => {
    setErr(''); setBusy(true);
    try {
      const d = await post({ action: 'create', ...f, source: usedPaste ? 'paste' : 'form' }, await token());
      setDone(d);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (done) {
    const msg = encodeURIComponent(`${f.title}${f.company ? ' at ' + f.company : ''} — apply here: ${done.url}`);
    return (
      <div style={{ ...card, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, margin: '4px 0 8px' }}>Posted! 🎉</h2>
        {done.quarantined
          ? <p style={{ color: 'var(--text-soft)', fontSize: 14 }}>It&apos;s in for a quick review and will appear on the board shortly.</p>
          : <p style={{ color: 'var(--text-soft)', fontSize: 14 }}>It&apos;s live on the board. Share the link to your WhatsApp groups:</p>}
        <div style={{ margin: '14px 0', padding: '10px 12px', background: 'var(--bg-tint)', borderRadius: 10, fontSize: 13, wordBreak: 'break-all' }}>{done.url}</div>
        <a className="cl-btn cl-btn-primary" style={{ width: '100%' }} href={`https://wa.me/?text=${msg}`} target="_blank" rel="noreferrer">Share to WhatsApp</a>
        <button className="cl-btn cl-btn-ghost" style={{ marginTop: 10 }} onClick={() => { setDone(null); setRaw(''); setF({ title: '', company: '', location: '', payText: '', description: '', applyMethod: 'whatsapp', applyContact: '' }); setUsedPaste(false); setMode('paste'); }}>Post another</button>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <TabBtn on={mode === 'paste'} onClick={() => setMode('paste')}>Paste from WhatsApp</TabBtn>
          <TabBtn on={mode === 'form'} onClick={() => setMode('form')}>Fill the form</TabBtn>
        </div>
        <button className="cl-nl" style={{ fontSize: 12, background: 'none', border: 0, cursor: 'pointer' }} onClick={onLogout}>Log out</button>
      </div>
      {err && <p style={{ color: 'var(--danger, #a4262c)', fontSize: 13 }}>{err}</p>}

      {mode === 'paste' ? (
        <div>
          <label style={label}>Paste the job exactly as it is on WhatsApp</label>
          <textarea style={{ ...input, minHeight: 160, resize: 'vertical' }} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Paste the whole thing — we'll tidy it into a proper post you can review." />
          <button className="cl-btn cl-btn-primary" style={{ width: '100%', marginTop: 14 }} disabled={busy || raw.trim().length < 15} onClick={structure}>{busy ? 'Reading it…' : 'Tidy it up →'}</button>
        </div>
      ) : (
        <div>
          <Text l="Job title" value={f.title} onChange={set('title')} placeholder="Sales Assistant" />
          <Text l="Company" value={f.company} onChange={set('company')} placeholder="Optional" />
          <Text l="Location" value={f.location} onChange={set('location')} placeholder="Ikeja, Lagos" />
          <Text l="Pay (optional)" value={f.payText} onChange={set('payText')} placeholder="₦120,000/month or Negotiable" />
          <label style={label}>Description</label>
          <textarea style={{ ...input, minHeight: 100, resize: 'vertical' }} value={f.description} onChange={set('description')} placeholder="What the role is and who you want." />
          <label style={label}>How do people apply?</label>
          <select style={input} value={f.applyMethod} onChange={set('applyMethod')}>
            <option value="whatsapp">WhatsApp</option><option value="phone">Phone call</option><option value="email">Email</option><option value="link">A link</option>
          </select>
          <Text l="Apply contact (number / email / link)" value={f.applyContact} onChange={set('applyContact')} placeholder="0801 234 5678" />
          <button className="cl-btn cl-btn-primary" style={{ width: '100%', marginTop: 18 }} disabled={busy || f.title.trim().length < 3} onClick={publish}>{busy ? 'Posting…' : 'Post the job'}</button>
        </div>
      )}
    </div>
  );
}
