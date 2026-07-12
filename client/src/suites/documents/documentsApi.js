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

// Upload a file to Supabase Storage; returns {path, size}
export const uploadFile = async (file, prefix = '') => {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${prefix}${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('org-documents').upload(path, file);
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
