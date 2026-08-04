import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';
import { supabase } from '../../lib/supabaseClient.js';

export const getFolders  = () => apiGet('/docfolders').then((d) => d.folders);
export const createFolder = (body) => apiPost('/docfolders', body).then((d) => d.folder);
export const deleteFolder = (id) => apiDelete(`/docfolders/${id}`);

export const getDocuments  = () => apiGet('/documents').then((d) => d.documents);
export const createDocument = (body) => apiPost('/documents', body).then((d) => d.document);
export const updateDocument = (id, body) => apiPatch(`/documents/${id}`, body).then((d) => d.document);
export const deleteDocument = (id) => apiDelete(`/documents/${id}`);

export const getVersions  = (docId) => apiGet(`/documents/${docId}/versions`).then((d) => d.versions);
export const uploadVersion = (docId, body) => apiPost(`/documents/${docId}/versions`, body).then((d) => d.document);

export const getPermissions = (docId) => apiGet(`/documents/${docId}/permissions`).then((d) => d.permissions);
export const grantPermission = (docId, userId) => apiPost(`/documents/${docId}/permissions`, { userId }).then((d) => d.permission);
export const revokePermission = (docId, userId) => apiDelete(`/documents/${docId}/permissions/${userId}`);

// Browsers do not always report a file's type: pick it up from a file manager,
// an unusual extension, or some Android pickers, and file.type is ''. Supabase
// then stores the object as text/plain, and a PDF saved that way can never be
// previewed inline, only downloaded. The extension is a good enough fallback.
const MIME_BY_EXT = {
  pdf: 'application/pdf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml',
  txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', json: 'application/json',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export const mimeFor = (file) => {
  if (file?.type) return file.type;
  const ext = String(file?.name || '').split('.').pop().toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
};

// Upload a file to Supabase Storage; returns {path, size}
export const uploadFile = async (file, prefix = '') => {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${prefix}${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('org-documents')
    .upload(path, file, { contentType: mimeFor(file) });
  if (error) throw new Error(error.message);
  return { path, size: file.size };
};

export const getDownloadUrl = async (path) => {
  const { data, error } = await supabase.storage.from('org-documents').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
};

export const fmtBytes = (n) => {
  if (n == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = Number(n);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
};

export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

// ---- e-signatures + expiry ---------------------------------------------------
export const getSignatures = (docId) => apiGet(`/documents/${docId}/signatures`).then((d) => d.signatures);
export const requestSignature = (docId, of, note) => apiPost(`/documents/${docId}/signatures`, { of, note }).then((d) => d.signature);
export const signDocument = (sigId, body) => apiPost(`/signatures/${sigId}/sign`, body).then((d) => d.signature);
export const setExpiry = (docId, expiresAt) => apiPatch(`/documents/${docId}`, { expiresAt }).then((d) => d.document);
