import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../api/client.js';
import { useConfirm, EmptyState } from '../../components/ui.jsx';
import * as L from './lettersApi.js';
import * as C from './complianceApi.js';
import * as D from '../documents/documentsApi.js';
import { LETTER_TYPES, LETTERHEAD_TEMPLATES, LETTERHEAD_CSS, letterHeadHtml, letterBodyHtml, buildLetterDocument, suggestReference, LETTER_FOLDER_SUGGESTION, compressLogo, compressSignature } from './letterheadTemplates.js';

/* =========================================================================
   HR Letters engine — compose company letters (manually or with Collarone
   AI), on a saved letterhead: generated from company details across 8
   templates, or an uploaded .docx. Fulfils employee letter requests, files
   every issued letter into Documents, and keeps an issued-letters register.
   ========================================================================= */

const IC = {
  add:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  spark: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.4L22 18l-2.1.6L19 21l-.9-2.4L16 18l2.1-.6z"/></svg>,
  doc:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  down:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 3v13M6 11l6 6 6-6"/><path d="M4 21h16"/></svg>,
};

const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const downloadHtml = (html, filename) => {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// Best-effort filing into the Documents suite (same pattern as employment
// contracts from Payroll) — never blocks issuing.
async function fileToDocuments({ html, title, employeeId, folderName = 'HR Letters' }) {
  const folders = await D.getFolders();
  const folder = folders.find((f) => f.name === folderName) || await D.createFolder({ name: folderName });
  const safe = title.replace(/[^a-zA-Z0-9]+/g, '-');
  const file = new File([html], `${safe}.html`, { type: 'text/html' });
  const { path, size } = await D.uploadFile(file, 'hr-letters/');
  const doc = await D.createDocument({ name: title, folderId: folder.id, filePath: path, fileSize: size, visibility: 'restricted' });
  try { await D.grantPermission(doc.id, employeeId); } catch { /* HR can grant manually */ }
  return doc;
}

/* ---- live letterhead preview ------------------------------------------------ */
function LetterPreview({ letterhead, letter, scale = 1 }) {
  const inner = letterBodyHtml(letter);
  const html = letterHeadHtml(letterhead).replace('%BODY%', inner);
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-2)', background: '#fff' }}>
      <style>{LETTERHEAD_CSS}</style>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: `${100 / scale}%` }}
        dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

/* ---- Compose tab ------------------------------------------------------------- */
function ComposeTab({ staff, letterhead, letterheads = [], flash, onIssued, prefill, me, issued, folders, confirm, onFolderCreated }) {
  // Which saved letterhead this letter uses (defaults to the org default),
  // plus a per-letter template override that doesn't touch the saved design.
  const [lhId, setLhId] = useState(letterhead?.id || null);
  const [tplOverride, setTplOverride] = useState('');
  const [useSignature, setUseSignature] = useState(true);
  const chosenLetterhead = letterheads.find((x) => x.id === lhId) || letterhead;
  const effectiveLetterhead = tplOverride
    ? { ...chosenLetterhead, template_key: tplOverride }
    : chosenLetterhead;
  const savedSignature = chosenLetterhead?.details?.signature || null;
  const signature = useSignature ? savedSignature : null;
  const initialType = prefill?.letterType || 'confirmation';
  const [f, setF] = useState(() => ({
    employeeId: prefill?.employeeId || '', letterType: initialType,
    reference: suggestReference(initialType, issued), refTouched: false,
    folderName: LETTER_FOLDER_SUGGESTION[initialType] || 'HR Letters',
    instructions: prefill?.instructions || '', body: '', requestId: prefill?.requestId || null,
    caseId: prefill?.caseId || null, caseField: prefill?.caseField || null,
    signerName: me?.name || '', signerRole: 'Human Resources',
  }));
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  // Changing letter type refreshes the auto ref (unless hand-edited) and the
  // suggested filing folder.
  const setType = (t) => setF((s) => ({
    ...s, letterType: t,
    reference: s.refTouched ? s.reference : suggestReference(t, issued),
    folderName: LETTER_FOLDER_SUGGESTION[t] || 'HR Letters',
  }));
  const emp = staff.find((s) => s.id === f.employeeId);
  const type = LETTER_TYPES[f.letterType] || LETTER_TYPES.custom;
  const title = emp ? `${type.label} — ${emp.name}` : type.label;
  const existingNames = useMemo(() => new Set((folders || []).map((x) => x.name)), [folders]);
  const folderOptions = useMemo(() => {
    const names = new Set([f.folderName, ...Object.values(LETTER_FOLDER_SUGGESTION), ...existingNames]);
    return [...names];
  }, [existingNames, f.folderName]);

  // "+ New folder…" — creates the folder in Documents right away (it appears
  // in the Documents suite immediately), then selects it here.
  const createFolder = async () => {
    const res = await confirm({
      title: 'New Documents folder', confirmLabel: 'Create folder',
      message: 'The folder is created in the Documents suite now and this letter will file into it.',
      input: { label: 'Folder name', placeholder: 'e.g. HR Letters — Promotions', required: true },
    });
    if (!res) return;
    const name = res.value.trim();
    if (existingNames.has(name)) { set('folderName', name); return; }
    try {
      const folder = await D.createFolder({ name });
      onFolderCreated?.(folder);
      set('folderName', name);
      flash(`Folder "${name}" created in Documents.`);
    } catch (e) { flash(`Could not create the folder: ${e.message}`, true); }
  };

  const ctx = () => ({
    letterType: f.letterType, letterTypeLabel: type.label,
    employeeName: emp?.name || '', jobTitle: emp?.jobTitle || '', department: emp?.deptName || '',
    startDate: emp?.startDate || '', companyName: effectiveLetterhead?.details?.companyName || '',
    tone: 'formal Nigerian business correspondence', instructions: f.instructions,
  });

  const useTemplate = () => {
    if (!emp) return flash('Pick an employee first.', true);
    set('body', type.skeleton(ctx()));
  };

  const aiDraft = async () => {
    if (!emp) return flash('Pick an employee first.', true);
    setAiBusy(true);
    try { set('body', await L.aiDraftLetter(ctx())); flash('Draft ready — review and edit before issuing.'); }
    catch (e) { flash(e.message, true); }
    finally { setAiBusy(false); }
  };

  const issue = async () => {
    if (!emp || !f.body.trim()) return flash('Employee and letter body are required.', true);
    setBusy(true);
    try {
      const html = buildLetterDocument({
        letterhead: effectiveLetterhead, title, date: today(), reference: f.reference,
        body: f.body, signerName: f.signerName, signerRole: f.signerRole, signature,
      });
      let filePath = null;
      try { filePath = await L.uploadIssuedLetterHtml(html, title); } catch { /* register still records it */ }
      const saved = await L.issueLetter({
        employeeId: emp.id, letterType: f.letterType, title, letterBody: f.body,
        letterheadId: chosenLetterhead?.id || null, requestId: f.requestId, filePath,
      });
      if (f.requestId) {
        try { await L.decideLetter(f.requestId, { status: 'issued', issuedFilePath: filePath }); } catch { /* request row may already be decided */ }
      }
      if (f.caseId && f.caseField) {
        // Disciplinary flow: stamp the query/outcome letter onto the case.
        try { await C.updateCase(f.caseId, { [f.caseField]: saved.id }); } catch { /* case link is best-effort */ }
      }
      downloadHtml(html, `${title.replace(/[^a-zA-Z0-9]+/g, '-')}.html`);
      fileToDocuments({ html, title: `${title} · ${f.reference}`, employeeId: emp.id, folderName: f.folderName }).catch(() => {});
      flash(`Letter issued — filing to "${f.folderName}" in the background.`);
      onIssued(saved);
      setF((s) => ({ ...s, body: '', instructions: '', requestId: null, caseId: null, caseField: null, refTouched: false, reference: suggestReference(s.letterType, [saved, ...(issued || [])]) }));
    } catch (e) { flash(e.message, true); }
    finally { setBusy(false); }
  };

  return (
    <div className="lt-compose">
      <div className="lt-form">
        {f.requestId && (
          <div className="callout-hint" style={{ marginBottom: 12 }}>
            Fulfilling {emp?.name || 'an employee'}&rsquo;s letter request — issuing will mark the request as issued.
          </div>
        )}
        <div className="form-grid">
          <div className="field"><label>Employee</label>
            <select className="select" value={f.employeeId} onChange={(e) => set('employeeId', e.target.value)} autoFocus>
              <option value="">— Select —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div className="field"><label>Letter type</label>
            <select className="select" value={f.letterType} onChange={(e) => setType(e.target.value)}>
              {Object.entries(LETTER_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></div>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '-6px 0 12px' }}>{type.hint}</p>

        <div className="field"><label>Letter body</label>
          <div className="lt-ai-row">
            <button type="button" className="btn btn-primary btn-sm" onClick={aiDraft} disabled={aiBusy}>
              {aiBusy ? <span className="spinner" /> : IC.spark} Write with Collarone AI
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={useTemplate}>Use template</button>
          </div>
          <input className="input" style={{ margin: '8px 0' }} placeholder="Anything the AI should know? (optional — e.g. 'mention her transfer to the Abuja office')"
            value={f.instructions} onChange={(e) => set('instructions', e.target.value)} />
          <textarea className="input" rows={12} value={f.body} onChange={(e) => set('body', e.target.value)}
            placeholder="Write the letter here, use the template, or let Collarone AI draft it — you always review before issuing." />
        </div>

        <div className="form-grid">
          <div className="field"><label>Our ref <span className="muted">(auto)</span></label>
            <input className="input" value={f.reference} onChange={(e) => setF((s) => ({ ...s, reference: e.target.value, refTouched: true }))} /></div>
          <div className="field"><label>File into <span className="muted">(Documents folder)</span></label>
            <select className="select" value={f.folderName}
              onChange={(e) => { if (e.target.value === '__new__') { e.target.value = f.folderName; createFolder(); } else set('folderName', e.target.value); }}>
              {folderOptions.map((n) => (
                <option key={n} value={n}>{n}{existingNames.has(n) ? '' : ' (created on issue)'}</option>
              ))}
              <option value="__new__">+ New folder…</option>
            </select></div>
        </div>
        <div className="form-grid">
          <div className="field"><label>Signed by</label>
            <input className="input" value={f.signerName} onChange={(e) => set('signerName', e.target.value)} /></div>
          <div className="field"><label>Signer title</label>
            <input className="input" value={f.signerRole} onChange={(e) => set('signerRole', e.target.value)} /></div>
        </div>
        {savedSignature ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '0 0 14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={useSignature} onChange={(e) => setUseSignature(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />
            Include the saved signature on this letter
          </label>
        ) : (
          <p className="muted" style={{ fontSize: 12, margin: '0 0 14px' }}>Tip: upload an authorized signature in the Letterhead tab and it signs every letter automatically.</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-primary" onClick={issue} disabled={busy}>
            {busy ? <span className="spinner" /> : IC.doc} Issue letter
          </button>
        </div>
      </div>

      <div className="lt-preview">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Live preview</span>
          {letterheads.length > 1 && (
            <select className="select" style={{ width: 'auto', height: 30, fontSize: 12, padding: '0 8px' }}
              value={lhId || ''} onChange={(e) => setLhId(e.target.value)} title="Saved letterhead">
              {letterheads.map((x) => <option key={x.id} value={x.id}>{x.name}{x.is_default ? ' (default)' : ''}</option>)}
            </select>
          )}
          <select className="select" style={{ width: 'auto', height: 30, fontSize: 12, padding: '0 8px' }}
            value={tplOverride} onChange={(e) => setTplOverride(e.target.value)} title="Template for this letter">
            <option value="">Saved template — {LETTERHEAD_TEMPLATES[chosenLetterhead?.template_key]?.label || 'Classic'}</option>
            {Object.entries(LETTERHEAD_TEMPLATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <LetterPreview letterhead={effectiveLetterhead} scale={0.82}
          letter={{ date: today(), reference: f.reference, body: f.body || '(The letter body appears here as you write.)', signerName: f.signerName, signerRole: f.signerRole, signature }} />
      </div>
    </div>
  );
}

/* ---- Requests tab -------------------------------------------------------------- */
function RequestsTab({ requests, flash, onCompose, onDecided, confirm }) {
  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');

  const decline = async (r) => {
    const res = await confirm({
      title: 'Decline letter request', danger: true, confirmLabel: 'Decline',
      message: `${r.employee?.name}'s request will be declined.`,
      input: { label: 'Reason (shared with the employee)', required: false },
    });
    if (!res) return;
    try { onDecided(await L.decideLetter(r.id, { status: 'declined', declineReason: res.value })); flash('Request declined.'); }
    catch (e) { flash(e.message, true); }
  };

  const typeToEngine = (t) => (t === 'employment_verification' ? 'employment_verification' : t === 'reference' ? 'introduction' : 'custom');

  return (
    <>
      {pending.length === 0
        ? <EmptyState title="No pending requests" hint="When staff request a letter from their profile, it lands here for you to issue or decline." />
        : (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="table">
              <thead><tr><th>Employee</th><th>Letter</th><th>Purpose</th><th>Requested</th><th className="ta-r">Action</th></tr></thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500 }}>{r.employee?.name}</td>
                    <td>{L.LETTER_TYPE[r.letter_type] || r.letter_type}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{r.purpose || '—'}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{L.fmtDate(r.requested_at)}</td>
                    <td className="ta-r">
                      <div style={{ display: 'inline-flex', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => onCompose({ employeeId: r.employee?.id, letterType: typeToEngine(r.letter_type), requestId: r.id })}>Compose</button>
                        <button className="btn btn-danger btn-sm" onClick={() => decline(r)}>Decline</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {decided.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, color: 'var(--text-2)', margin: '20px 0 8px' }}>Decided</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Employee</th><th>Letter</th><th>Status</th><th>Decided</th></tr></thead>
              <tbody>
                {decided.slice(0, 15).map((r) => (
                  <tr key={r.id}>
                    <td>{r.employee?.name}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{L.LETTER_TYPE[r.letter_type] || r.letter_type}</td>
                    <td><span className={`st-pill ${r.status === 'issued' ? 'st-success' : 'st-danger'}`}>{r.status}</span></td>
                    <td className="muted" style={{ fontSize: 13 }}>{L.fmtDate(r.decided_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/* ---- Issued register ------------------------------------------------------------ */
function IssuedTab({ issued, letterheads, flash }) {
  const open = async (l) => {
    try {
      if (l.file_path) { window.open(await L.getLetterUrl(l.file_path), '_blank'); return; }
      const lh = letterheads.find((x) => x.id === l.letterhead_id) || letterheads.find((x) => x.is_default);
      const html = buildLetterDocument({ letterhead: lh, title: l.title, date: L.fmtDate(l.issued_at), reference: '', body: l.body, signerName: l.issuedBy?.name || '', signerRole: '' });
      downloadHtml(html, `${l.title.replace(/[^a-zA-Z0-9]+/g, '-')}.html`);
    } catch (e) { flash(e.message, true); }
  };

  if (issued.length === 0) return <EmptyState title="No letters issued yet" hint="Every letter you issue from Compose is recorded here, with a copy filed into Documents." />;
  return (
    <div className="table-wrap" style={{ marginTop: 8 }}>
      <table className="table">
        <thead><tr><th>Letter</th><th>Employee</th><th>Type</th><th>Issued by</th><th>Date</th><th className="ta-r"></th></tr></thead>
        <tbody>
          {issued.map((l) => (
            <tr key={l.id}>
              <td style={{ fontWeight: 500 }}>{l.title}</td>
              <td className="muted" style={{ fontSize: 13 }}>{l.employee?.name}</td>
              <td><span className="st-pill st-info">{LETTER_TYPES[l.letter_type]?.label || l.letter_type}</span></td>
              <td className="muted" style={{ fontSize: 13 }}>{l.issuedBy?.name || '—'}</td>
              <td className="muted" style={{ fontSize: 13 }}>{L.fmtDate(l.issued_at)}</td>
              <td className="ta-r"><button className="btn btn-ghost btn-sm" onClick={() => open(l)}>{IC.down} Open</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Letterhead settings --------------------------------------------------------- */
function LetterheadTab({ letterheads, orgName, flash, onSaved, onDeleted, confirm }) {
  const current = letterheads.find((l) => l.is_default) || letterheads[0] || null;
  const [mode, setMode] = useState(current?.mode || 'generated');
  const [tpl, setTpl] = useState(current?.template_key || 'classic');
  const [lhName, setLhName] = useState(current?.name || '');
  const [d, setD] = useState(() => ({
    companyName: current?.details?.companyName || orgName || '', address: current?.details?.address || '',
    phone: current?.details?.phone || '', email: current?.details?.email || '',
    rcNumber: current?.details?.rcNumber || '', tagline: current?.details?.tagline || '',
    accent: current?.details?.accent || '#0A0E1A',
    logo: current?.details?.logo || null, headerStyle: current?.details?.headerStyle || 'logo-name',
    signature: current?.details?.signature || null,
  }));
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setD((s) => ({ ...s, [k]: v }));

  const previewLh = useMemo(() => ({ template_key: tpl, details: d }), [tpl, d]);

  const save = async (saveAsNew = false) => {
    setBusy(true);
    try {
      let filePath = current?.file_path || null;
      if (mode === 'upload') {
        if (!file && !filePath) { flash('Choose a .docx or .pdf letterhead file.', true); setBusy(false); return; }
        if (file) filePath = await L.uploadLetterheadFile(file);
      }
      const body = { name: lhName.trim() || d.companyName || 'Company letterhead', mode, templateKey: tpl, details: d, filePath, isDefault: true };
      const saved = (current?.id && !saveAsNew) ? await L.updateLetterhead(current.id, body) : await L.saveLetterhead(body);
      onSaved(saved);
      flash(saveAsNew ? 'Saved as a new letterhead and set as default.' : 'Letterhead saved — it will be used for every letter you issue.');
    } catch (e) { flash(e.message, true); }
    finally { setBusy(false); }
  };

  return (
    <div className="lt-compose" style={{ marginTop: 8 }}>
      <div className="lt-form">
        <div className="filter-pills" style={{ marginBottom: 14 }}>
          <button className={`pill ${mode === 'generated' ? 'active' : ''}`} onClick={() => setMode('generated')}>Generated letterhead</button>
          <button className={`pill ${mode === 'upload' ? 'active' : ''}`} onClick={() => setMode('upload')}>Upload my letterhead</button>
        </div>

        {mode === 'generated' ? (
          <>
            <div className="form-grid">
              <div className="field"><label>Company name</label>
                <input className="input" value={d.companyName} onChange={(e) => set('companyName', e.target.value)} /></div>
              <div className="field"><label>RC number <span className="muted">(optional)</span></label>
                <input className="input" value={d.rcNumber} onChange={(e) => set('rcNumber', e.target.value)} placeholder="e.g. 1234567" /></div>
            </div>
            <div className="field"><label>Address</label>
              <input className="input" value={d.address} onChange={(e) => set('address', e.target.value)} placeholder="12 Adeola Odeku Street, Victoria Island, Lagos" /></div>
            <div className="form-grid">
              <div className="field"><label>Phone</label>
                <input className="input" value={d.phone} onChange={(e) => set('phone', e.target.value)} /></div>
              <div className="field"><label>Email</label>
                <input className="input" type="email" value={d.email} onChange={(e) => set('email', e.target.value)} /></div>
            </div>
            <div className="form-grid">
              <div className="field"><label>Tagline <span className="muted">(optional)</span></label>
                <input className="input" value={d.tagline} onChange={(e) => set('tagline', e.target.value)} /></div>
              <div className="field"><label>Accent colour</label>
                <input className="input" type="color" value={d.accent} onChange={(e) => set('accent', e.target.value)} style={{ padding: 4, height: 38 }} /></div>
            </div>

            <div className="form-grid">
              <div className="field"><label>Company logo <span className="muted">(optional — compressed automatically)</span></label>
                <input type="file" accept="image/*" style={{ fontSize: 13 }}
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    try { set('logo', await compressLogo(file)); flash('Logo added — compressed for the letterhead.'); }
                    catch (err) { flash(err.message, true); }
                  }} />
                {d.logo && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    <img src={d.logo} alt="Logo preview" style={{ maxHeight: 36, maxWidth: 120, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 6, padding: 3, background: '#fff' }} />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('logo', null)}>Remove</button>
                  </div>
                )}
              </div>
              <div className="field"><label>Letterhead header shows</label>
                <select className="select" value={d.headerStyle} onChange={(e) => set('headerStyle', e.target.value)} disabled={!d.logo}>
                  <option value="logo-name">Logo and company name</option>
                  <option value="logo">Logo only</option>
                  <option value="name">Company name only</option>
                </select>
                {!d.logo && <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>Upload a logo to unlock logo options.</span>}
              </div>
            </div>

            <div className="field"><label>Authorized signature <span className="muted">(optional — appears above the signer's name; compressed automatically)</span></label>
              <input type="file" accept="image/*" style={{ fontSize: 13 }}
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  try { set('signature', await compressSignature(file)); flash('Signature saved to this letterhead.'); }
                  catch (err) { flash(err.message, true); }
                }} />
              {d.signature && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <img src={d.signature} alt="Signature preview" style={{ maxHeight: 40, maxWidth: 150, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 6, padding: 3, background: '#fff' }} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('signature', null)}>Remove</button>
                </div>
              )}
            </div>

            <div className="field"><label>Template — {LETTERHEAD_TEMPLATES[tpl].label}</label>
              <div className="lt-tpl-grid">
                {Object.entries(LETTERHEAD_TEMPLATES).map(([k, v]) => (
                  <button key={k} type="button" className={`lt-tpl ${tpl === k ? 'on' : ''}`} onClick={() => setTpl(k)} title={v.hint}>
                    <span className="lt-tpl-name">{v.label}</span>
                    <span className="lt-tpl-hint">{v.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
              Upload your existing letterhead as a <b>.docx</b> or <b>.pdf</b>. It's stored securely and available to download
              whenever you write letters outside Collarone. Letters issued in-app print with a clean text header —
              for the fully designed version, use a generated template.
            </p>
            <div className="field"><label>Letterhead file</label>
              <input type="file" accept=".docx,.pdf" onChange={(e) => setFile(e.target.files[0] || null)} style={{ fontSize: 13 }} /></div>
            {current?.mode === 'upload' && current?.file_path && !file && (
              <p className="muted" style={{ fontSize: 12 }}>A letterhead file is already saved. Choose a new file to replace it.</p>
            )}
          </>
        )}

        <div className="field"><label>Letterhead name <span className="muted">(how it appears in the composer)</span></label>
          <input className="input" value={lhName} onChange={(e) => setLhName(e.target.value)} placeholder="e.g. Head office letterhead" /></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {current?.id && <button className="btn btn-ghost" onClick={() => save(true)} disabled={busy}>Save as new</button>}
          <button className="btn btn-primary" onClick={() => save(false)} disabled={busy}>{busy ? <span className="spinner" /> : current?.id ? 'Update letterhead' : 'Save letterhead'}</button>
        </div>

        {letterheads.length > 0 && (
          <div className="card" style={{ marginTop: 18, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-3)', marginBottom: 8 }}>Saved letterheads</div>
            {letterheads.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--line)', fontSize: 13.5 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b>{l.name}</b>{' '}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {l.mode === 'upload' ? 'Uploaded file' : (LETTERHEAD_TEMPLATES[l.template_key]?.label || l.template_key)}
                  </span>
                </div>
                {l.is_default
                  ? <span className="st-pill st-success">Default</span>
                  : <button className="btn btn-ghost btn-sm" onClick={async () => {
                      try { onSaved(await L.updateLetterhead(l.id, { isDefault: true })); flash(`"${l.name}" is now the default letterhead.`); }
                      catch (e) { flash(e.message, true); }
                    }}>Make default</button>}
                {!l.is_default && (
                  <button className="btn btn-danger btn-sm" onClick={async () => {
                    const ok = await confirm({ title: 'Delete letterhead', danger: true, confirmLabel: 'Delete', message: `"${l.name}" will be removed. Letters already issued keep their copies.` });
                    if (!ok) return;
                    try { await L.deleteLetterhead(l.id); onDeleted(l.id); flash('Letterhead deleted.'); }
                    catch (e) { flash(e.message, true); }
                  }}>Delete</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="lt-preview">
        <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, marginBottom: 8 }}>Preview</div>
        {mode === 'generated'
          ? <LetterPreview letterhead={previewLh} scale={0.82}
              letter={{ date: today(), reference: 'HR/SAMPLE/001', body: `Dear Adaeze,\n\nThis is how your letters will look on the ${LETTERHEAD_TEMPLATES[tpl].label} letterhead. Every detail above comes from the form on the left — edit anything and the preview updates instantly.\n\nYours faithfully,`, signerName: 'Human Resources', signerRole: d.companyName }} />
          : <EmptyState title="Uploaded letterheads keep their original design" hint="Preview isn't available for .docx/.pdf files — download the file any time from this tab." />}
      </div>
    </div>
  );
}

/* ---- Main -------------------------------------------------------------------------- */
export default function LettersApp({ staff, flash, externalPrefill = null, onPrefillConsumed }) {
  const [tab, setTab] = useState('compose');
  const [letterheads, setLetterheads] = useState([]);
  const [requests, setRequests] = useState([]);
  const [issued, setIssued] = useState([]);
  const [me, setMe] = useState(null);
  const [orgName, setOrgName] = useState('');
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prefill, setPrefill] = useState(externalPrefill);
  const { confirm, confirmNode } = useConfirm();

  // Existing Documents folders feed the "File into" suggestions — best-effort,
  // the letter still issues if the Documents suite isn't reachable.
  useEffect(() => { D.getFolders().then(setFolders).catch(() => {}); }, []);

  // Another tab (probation confirm, disciplinary query) sent us here with a
  // prefilled composer — consume it once.
  useEffect(() => {
    if (externalPrefill) { setPrefill(externalPrefill); setTab('compose'); onPrefillConsumed?.(); }
  }, [externalPrefill]); // eslint-disable-line

  useEffect(() => {
    Promise.allSettled([
      L.getLetterheads(), L.getLetters(), L.getIssuedLetters(), apiGet('/me'),
    ]).then(([lh, rq, il, meRes]) => {
      if (lh.status === 'fulfilled') setLetterheads(lh.value);
      if (rq.status === 'fulfilled') setRequests(rq.value);
      if (il.status === 'fulfilled') setIssued(il.value);
      if (meRes.status === 'fulfilled') { setMe(meRes.value.user); setOrgName(meRes.value.user?.org?.name || ''); }
      const failed = [lh, rq, il].filter((r) => r.status === 'rejected');
      if (failed.length === 3) flash(failed[0].reason?.message || 'Could not load letters.', true);
      setLoading(false);
    });
  }, []); // eslint-disable-line

  const defaultLetterhead = letterheads.find((l) => l.is_default)
    || letterheads[0]
    || { template_key: 'classic', details: { companyName: orgName, accent: '#0A0E1A' } };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  if (loading) return <div className="suite-loading"><div className="boot-spinner" /></div>;

  return (
    <div className="lt">
      <style>{LT_CSS}</style>
      <div className="filter-pills" style={{ margin: '8px 0 16px' }}>
        <button className={`pill ${tab === 'compose' ? 'active' : ''}`} onClick={() => setTab('compose')}>Compose</button>
        <button className={`pill ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>
          Requests{pendingCount > 0 ? ` (${pendingCount})` : ''}
        </button>
        <button className={`pill ${tab === 'issued' ? 'active' : ''}`} onClick={() => setTab('issued')}>Issued letters</button>
        <button className={`pill ${tab === 'letterhead' ? 'active' : ''}`} onClick={() => setTab('letterhead')}>Letterhead</button>
      </div>

      {tab === 'compose' && (
        <ComposeTab key={prefill ? `${prefill.requestId || ''}-${prefill.employeeId || ''}-${prefill.letterType || ''}-${prefill.caseId || ''}` : 'blank'}
          staff={staff} letterhead={defaultLetterhead} flash={flash} me={me} prefill={prefill} issued={issued} folders={folders}
          confirm={confirm} onFolderCreated={(fl) => setFolders((xs) => [fl, ...xs])}
          onIssued={(l) => { setIssued((xs) => [l, ...xs]); setRequests((rs) => rs.map((r) => (r.id === l.request_id ? { ...r, status: 'issued' } : r))); setPrefill(null); }} />
      )}
      {tab === 'requests' && (
        <RequestsTab requests={requests} flash={flash} confirm={confirm}
          onCompose={(p) => { setPrefill(p); setTab('compose'); }}
          onDecided={(r) => setRequests((rs) => rs.map((x) => (x.id === r.id ? r : x)))} />
      )}
      {tab === 'issued' && <IssuedTab issued={issued} letterheads={letterheads} flash={flash} />}
      {tab === 'letterhead' && (
        <LetterheadTab letterheads={letterheads} orgName={orgName} flash={flash} confirm={confirm}
          onSaved={(lh) => setLetterheads((xs) => { const rest = xs.filter((x) => x.id !== lh.id).map((x) => (lh.is_default ? { ...x, is_default: false } : x)); return [lh, ...rest]; })}
          onDeleted={(id) => setLetterheads((xs) => xs.filter((x) => x.id !== id))} />
      )}
      {confirmNode}
    </div>
  );
}

const LT_CSS = `
  .lt-compose { display: grid; grid-template-columns: minmax(340px, 5fr) minmax(320px, 6fr); gap: 22px; align-items: start; margin-top: 8px; }
  .lt-form { min-width: 0; }
  .lt-preview { min-width: 0; position: sticky; top: 12px; }
  .lt-ai-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .lt-tpl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .lt-tpl { text-align: left; border: 1.5px solid var(--line-strong); border-radius: 10px; background: var(--surface); padding: 10px 12px; cursor: pointer; display: grid; gap: 2px; }
  .lt-tpl:hover { border-color: var(--text); }
  .lt-tpl.on { border-color: var(--brand); background: var(--brand-100); }
  .lt-tpl-name { font-weight: 650; font-size: 13px; }
  .lt-tpl-hint { font-size: 11px; color: var(--text-3); line-height: 1.35; }
  @media (max-width: 900px) { .lt-compose { grid-template-columns: 1fr; } .lt-preview { position: static; } }
`;
