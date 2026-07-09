import { useEffect, useState } from 'react';
import * as C from './complianceApi.js';

const I = {
  add:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  close:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  doc:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
};

/* ---- DocumentModal --------------------------------------------------------------- */
function DocumentModal({ staff, onClose, onSaved, onError }) {
  const [f, setF] = useState({ employeeId:'', title:'', category:'contract', expiryDate:'' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.employeeId || !f.title.trim() || !file) return onError('Employee, title and file are required.');
    setBusy(true);
    try {
      const filePath = await C.uploadDocument(f.employeeId, file);
      onSaved(await C.createDocument({ ...f, filePath }));
    } catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Upload document</h2><button className="iconbtn dark" onClick={onClose}>{I.close}</button></div>
        <form className="modal-body" onSubmit={submit}>
          <div className="field"><label>Employee</label>
            <select className="select" value={f.employeeId} onChange={(e) => set('employeeId', e.target.value)} required autoFocus>
              <option value="">— Select —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div className="field"><label>Title</label>
            <input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} required placeholder="e.g. Employment contract" /></div>
          <div className="form-grid">
            <div className="field"><label>Category</label>
              <select className="select" value={f.category} onChange={(e) => set('category', e.target.value)}>
                {Object.entries(C.DOC_CATEGORY).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div className="field"><label>Expiry date <span className="muted">(optional)</span></label>
              <input className="input" type="date" value={f.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} /></div>
          </div>
          <div className="field"><label>File</label>
            <input type="file" onChange={(e) => setFile(e.target.files[0] || null)} style={{ fontSize:13 }} required /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Upload'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DocumentsTab({ staff, flash }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const load = () => { setLoading(true); C.getDocuments().then(setDocs).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line

  const remove = async (d) => {
    if (!confirm(`Delete "${d.title}"?`)) return;
    try { await C.deleteDocument(d.id); setDocs((ds) => ds.filter((x) => x.id !== d.id)); } catch (e) { flash(e.message, true); }
  };
  const open = async (d) => { try { window.open(await C.getDocumentUrl(d.file_path), '_blank'); } catch (e) { flash(e.message, true); } };

  return (
    <>
      <div className="filterbar" style={{ marginTop:8 }}>
        <button className="btn btn-primary lv-apply" onClick={() => setModal(true)}>{I.add} Upload document</button>
        <span className="count" style={{ marginLeft:'auto' }}>{docs.length}</span>
      </div>
      {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Employee</th><th>Document</th><th>Category</th><th>Expiry</th><th></th></tr></thead>
            <tbody>
              {docs.length === 0 && <tr><td colSpan={5} className="td-empty">No documents on file.</td></tr>}
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>{d.employee?.name}</td>
                  <td><button className="btn btn-ghost tk-attach-btn" onClick={() => open(d)} style={{ fontSize:13, padding:'3px 10px' }}>{I.doc} {d.title}</button></td>
                  <td className="muted" style={{ fontSize:13 }}>{C.DOC_CATEGORY[d.category]}</td>
                  <td>
                    {d.expiry_date ? (
                      <span className={C.isExpired(d.expiry_date) ? 'lc-badge lc-stage-rejected' : C.isExpiringSoon(d.expiry_date) ? 'lc-badge lc-exit-settled' : 'muted'} style={{ fontSize:13 }}>
                        {C.fmtDate(d.expiry_date)}
                      </span>
                    ) : '—'}
                  </td>
                  <td><button className="iconbtn danger-icon" onClick={() => remove(d)}>{I.close}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <DocumentModal staff={staff} onClose={() => setModal(false)}
        onSaved={(d) => { setDocs((ds) => [d, ...ds]); setModal(false); flash('Document uploaded.'); }}
        onError={(m) => flash(m, true)} />}
    </>
  );
}

/* ---- CaseModal --------------------------------------------------------------- */
function CaseModal({ staff, onClose, onSaved, onError }) {
  const [f, setF] = useState({ employeeId:'', category:'warning', description:'' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!f.employeeId || !f.description.trim()) return onError('Employee and description are required.');
    setBusy(true);
    try { onSaved(await C.createCase(f)); } catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Open case</h2><button className="iconbtn dark" onClick={onClose}>{I.close}</button></div>
        <form className="modal-body" onSubmit={submit}>
          <div className="field"><label>Employee</label>
            <select className="select" value={f.employeeId} onChange={(e) => set('employeeId', e.target.value)} required autoFocus>
              <option value="">— Select —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div className="field"><label>Category</label>
            <select className="select" value={f.category} onChange={(e) => set('category', e.target.value)}>
              {Object.entries(C.CASE_CATEGORY).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div className="field"><label>Description</label>
            <textarea className="input" rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} required style={{ resize:'vertical', fontFamily:'inherit' }} /></div>
          <p className="muted" style={{ fontSize:12, margin:'4px 0 12px' }}>Only HR managers can see this record.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Open case'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CasesTab({ staff, flash }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const load = () => { setLoading(true); C.getCases().then(setCases).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line

  const resolve = async (c) => {
    const notes = prompt('Resolution notes:') || '';
    try { const updated = await C.updateCase(c.id, { status: 'resolved', resolutionNotes: notes }); setCases((cs) => cs.map((x) => (x.id === updated.id ? updated : x))); }
    catch (e) { flash(e.message, true); }
  };

  return (
    <>
      <div className="callout-hint" style={{ marginTop:8 }}>Confidential — visible only to HR managers, never to the employee or other staff.</div>
      <div className="filterbar">
        <button className="btn btn-primary lv-apply" onClick={() => setModal(true)}>{I.add} Open case</button>
        <span className="count" style={{ marginLeft:'auto' }}>{cases.length}</span>
      </div>
      {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : cases.length === 0 ? (
        <p className="muted" style={{ padding:'24px 0' }}>No cases on record.</p>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:8 }}>
          {cases.map((c) => (
            <div key={c.id} className="lc-interview-card">
              <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                <div><b>{c.employee?.name}</b> <span className="muted" style={{ textTransform:'capitalize' }}>— {c.category}</span></div>
                <span className={`lc-badge ${c.status === 'open' ? 'lc-req-draft' : 'lc-exit-done'}`}>{c.status === 'open' ? 'Open' : 'Resolved'}</span>
              </div>
              <p style={{ fontSize:13, margin:'8px 0 0', whiteSpace:'pre-wrap' }}>{c.description}</p>
              <div className="muted" style={{ fontSize:12, marginTop:4 }}>Opened by {c.openedBy?.name} · {C.fmtDate(c.created_at)}</div>
              {c.status === 'resolved' && c.resolution_notes && <p style={{ fontSize:13, margin:'8px 0 0' }}><b>Resolution:</b> {c.resolution_notes}</p>}
              {c.status === 'open' && <button className="btn btn-ghost" style={{ marginTop:8, fontSize:12, padding:'3px 12px' }} onClick={() => resolve(c)}>Mark resolved</button>}
            </div>
          ))}
        </div>
      )}
      {modal && <CaseModal staff={staff} onClose={() => setModal(false)}
        onSaved={(c) => { setCases((cs) => [c, ...cs]); setModal(false); flash('Case opened.'); }}
        onError={(m) => flash(m, true)} />}
    </>
  );
}

/* ---- Main ComplianceApp ------------------------------------------------------------ */
export default function ComplianceApp({ staff }) {
  const [tab, setTab] = useState('documents');
  const [toast, setToast] = useState(null);
  const flash = (msg, isErr) => { setToast({ msg, isErr }); setTimeout(() => setToast(null), 2800); };

  return (
    <div>
      <div className="lv-tabs">
        <button className={`lv-tab ${tab === 'documents' ? 'active' : ''}`} onClick={() => setTab('documents')}>Documents</button>
        <button className={`lv-tab ${tab === 'cases' ? 'active' : ''}`} onClick={() => setTab('cases')}>Cases</button>
      </div>
      {tab === 'documents' && <DocumentsTab staff={staff} flash={flash} />}
      {tab === 'cases'     && <CasesTab staff={staff} flash={flash} />}
      {toast && <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>}
    </div>
  );
}
