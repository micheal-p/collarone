import { useCallback, useEffect, useState } from 'react';
import * as D from './documentsApi.js';
import { apiGet } from '../../api/client.js';

function Toast({ toast }) { if (!toast) return null; return <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>; }
function Field({ label, children }) { return <div className="field"><label>{label}</label>{children}</div>; }

function UploadModal({ folders, defaultFolderId, onClose, onSaved, flash }) {
  const [name, setName] = useState('');
  const [folderId, setFolderId] = useState(defaultFolderId || '');
  const [visibility, setVisibility] = useState('org');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return flash('Choose a file to upload.', true);
    setBusy(true);
    try {
      const { path, size } = await D.uploadFile(file);
      const saved = await D.createDocument({ name: name.trim() || file.name, folderId: folderId || null, filePath: path, fileSize: size, visibility });
      flash('Document uploaded.'); onSaved(saved); onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Upload document</h2></div>
        <form className="modal-body" onSubmit={submit}>
          <Field label="File *"><input className="input" type="file" onChange={(e) => setFile(e.target.files[0])} required /></Field>
          <Field label="Display name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to file name" /></Field>
          <div className="form-grid">
            <Field label="Folder">
              <select className="select" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                <option value="">— No folder —</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="Visibility">
              <select className="select" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                <option value="org">Anyone with Documents access</option>
                <option value="restricted">Restricted (only me + granted people)</option>
              </select>
            </Field>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Upload'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VersionModal({ doc, onClose, flash }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { D.getVersions(doc.id).then(setVersions).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); }, [doc.id, flash]);
  useEffect(() => { load(); }, [load]);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return flash('Choose a file.', true);
    setBusy(true);
    try {
      const { path, size } = await D.uploadFile(file, `${doc.id}/`);
      await D.uploadVersion(doc.id, { filePath: path, fileSize: size, notes });
      flash('New version uploaded.'); setFile(null); setNotes(''); load();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  const download = async (v) => {
    try { window.open(await D.getDownloadUrl(v.file_path), '_blank'); } catch (e) { flash(e.message, true); }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Versions — {doc.name}</h2></div>
        <div className="modal-body">
          <form onSubmit={upload} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <input type="file" onChange={(e) => setFile(e.target.files[0])} />
            <input className="input" placeholder="Version notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Upload new version'}</button>
          </form>
          {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Version</th><th>Uploaded by</th><th>When</th><th>Notes</th><th></th></tr></thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id}>
                      <td style={{ fontWeight: 500 }}>v{v.version}</td>
                      <td className="muted" style={{ fontSize: 13 }}>{v.uploader?.name}</td>
                      <td className="muted" style={{ fontSize: 13 }}>{D.fmtDt(v.uploaded_at)}</td>
                      <td className="muted" style={{ fontSize: 13 }}>{v.notes || '—'}</td>
                      <td><button className="iconbtn" onClick={() => download(v)}>Download</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PermissionsModal({ doc, onClose, flash }) {
  const [perms, setPerms] = useState([]);
  const [staff, setStaff] = useState([]);
  const [userId, setUserId] = useState('');

  const load = useCallback(() => { D.getPermissions(doc.id).then(setPerms).catch((e) => flash(e.message, true)); }, [doc.id, flash]);
  useEffect(() => { load(); apiGet('/staff').then((d) => setStaff(d.staff)).catch(() => {}); }, [load]);

  const grant = async () => {
    if (!userId) return;
    try { await D.grantPermission(doc.id, userId); setUserId(''); flash('Access granted.'); load(); } catch (e) { flash(e.message, true); }
  };
  const revoke = async (uid) => {
    try { await D.revokePermission(doc.id, uid); flash('Access revoked.'); load(); } catch (e) { flash(e.message, true); }
  };

  const available = staff.filter((s) => !perms.some((p) => p.user_id === s.id));

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Permissions — {doc.name}</h2></div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)} style={{ flex: 1 }}>
              <option value="">— Select person —</option>
              {available.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn btn-primary" onClick={grant} disabled={!userId}>Grant access</button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th></th></tr></thead>
              <tbody>
                {perms.length === 0 && <tr><td colSpan={2} className="td-empty">Only you and documents managers can view this.</td></tr>}
                {perms.map((p) => (
                  <tr key={p.id}><td style={{ fontWeight: 500 }}>{p.user?.name}</td><td><button className="iconbtn" onClick={() => revoke(p.user_id)}>Revoke</button></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const FOLDER_CSS = `
  .doc-layout { display: flex; gap: 20px; }
  .doc-sidebar { width: 200px; flex-shrink: 0; }
  .doc-folder-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 6px; cursor: pointer; font-size: 13.5px; margin-bottom: 2px; }
  .doc-folder-item:hover { background: var(--surface-2); }
  .doc-folder-item.active { background: var(--surface-2); font-weight: 600; }
  .doc-folder-count { margin-left: auto; font-size: 11.5px; color: var(--text-2); }
  .doc-content { flex: 1; min-width: 0; }
  .doc-icon { flex-shrink: 0; }
`;

const FolderIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="doc-icon">
    <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

function NewFolderForm({ onAdd, flash }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { await D.createFolder({ name: name.trim() }); setName(''); flash('Folder added.'); onAdd(); } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 6, marginTop: 10 }}>
      <input className="input" placeholder="New folder" value={name} onChange={(e) => setName(e.target.value)} style={{ fontSize: 12.5, padding: '6px 8px' }} />
      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={busy}>+</button>
    </form>
  );
}

function FolderSidebar({ folders, docs, activeFolder, onSelect, onAdd, onDelete, flash, isManager }) {
  const countFor = (folderId) => docs.filter((d) => (d.folder_id || d.folder?.id || null) === folderId).length;
  return (
    <div className="doc-sidebar">
      <div className={`doc-folder-item ${activeFolder === null ? 'active' : ''}`} onClick={() => onSelect(null)}>
        <FolderIcon /> All documents <span className="doc-folder-count">{docs.length}</span>
      </div>
      {folders.map((f) => (
        <div key={f.id} className={`doc-folder-item ${activeFolder === f.id ? 'active' : ''}`} onClick={() => onSelect(f.id)}>
          <FolderIcon /> {f.name} <span className="doc-folder-count">{countFor(f.id)}</span>
          {isManager && (
            <button className="iconbtn" style={{ marginLeft: 4, fontSize: 10 }} onClick={(e) => { e.stopPropagation(); onDelete(f); }}>&times;</button>
          )}
        </div>
      ))}
      {isManager && <NewFolderForm onAdd={onAdd} flash={flash} />}
    </div>
  );
}

export default function DocumentsApp({ access }) {
  const isManager = access?.role === 'manager';
  const [docs, setDocs] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null); // null = "All documents"
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState(false);
  const [versionDoc, setVersionDoc] = useState(null);
  const [permDoc, setPermDoc] = useState(null);
  const [toast, setToast] = useState(null);
  const flash = (msg, isErr = false) => { setToast({ msg, isErr }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try { const [d, f] = await Promise.all([D.getDocuments(), D.getFolders()]); setDocs(d); setFolders(f); }
    catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const download = async (doc) => {
    try { window.open(await D.getDownloadUrl(doc.file_path), '_blank'); } catch (e) { flash(e.message, true); }
  };
  const remove = async (doc) => {
    if (!confirm(`Delete ${doc.name}?`)) return;
    try { await D.deleteDocument(doc.id); flash('Document deleted.'); load(); } catch (e) { flash(e.message, true); }
  };
  const removeFolder = async (folder) => {
    if (!confirm(`Delete folder "${folder.name}"? Documents inside move to "All documents", nothing is deleted.`)) return;
    try { await D.deleteFolder(folder.id); flash('Folder deleted.'); if (activeFolder === folder.id) setActiveFolder(null); load(); }
    catch (e) { flash(e.message, true); }
  };

  const visibleDocs = activeFolder === null ? docs : docs.filter((d) => (d.folder?.id || null) === activeFolder);
  const activeFolderName = activeFolder ? folders.find((f) => f.id === activeFolder)?.name : 'All documents';

  return (
    <div className="lv">
      <style>{FOLDER_CSS}</style>
      <div className="filterbar" style={{ marginTop: 8 }}>
        <span className="count">{visibleDocs.length} document{visibleDocs.length === 1 ? '' : 's'} in "{activeFolderName}"</span>
        <button className="btn btn-primary lv-apply" onClick={() => setUploadModal(true)}>Upload document</button>
      </div>

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {!loading && (
        <div className="doc-layout">
          <FolderSidebar folders={folders} docs={docs} activeFolder={activeFolder} onSelect={setActiveFolder}
            onAdd={load} onDelete={removeFolder} flash={flash} isManager={isManager} />
          <div className="doc-content">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Version</th><th>Size</th><th>Visibility</th><th>Updated</th><th></th></tr></thead>
                <tbody>
                  {visibleDocs.length === 0 && <tr><td colSpan={6} className="td-empty">No documents in this folder yet.</td></tr>}
                  {visibleDocs.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 500 }}>{d.name}</td>
                      <td className="muted" style={{ fontSize: 13 }}>v{d.current_version}</td>
                      <td className="muted" style={{ fontSize: 13 }}>{D.fmtBytes(d.file_size)}</td>
                      <td className="muted" style={{ fontSize: 13 }}>{d.visibility === 'restricted' ? 'Restricted' : 'Org'}</td>
                      <td className="muted" style={{ fontSize: 13 }}>{D.fmtDt(d.updated_at)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="iconbtn" onClick={() => download(d)}>Download</button>
                        <button className="iconbtn" onClick={() => setVersionDoc(d)}>Versions</button>
                        {d.visibility === 'restricted' && <button className="iconbtn" onClick={() => setPermDoc(d)}>Access</button>}
                        <button className="iconbtn" onClick={() => remove(d)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {uploadModal && <UploadModal folders={folders} defaultFolderId={activeFolder} onClose={() => setUploadModal(false)} onSaved={load} flash={flash} />}
      {versionDoc && <VersionModal doc={versionDoc} onClose={() => { setVersionDoc(null); load(); }} flash={flash} />}
      {permDoc && <PermissionsModal doc={permDoc} onClose={() => setPermDoc(null)} flash={flash} />}
      <Toast toast={toast} />
    </div>
  );
}
