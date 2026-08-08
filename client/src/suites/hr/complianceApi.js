import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';
import { supabase, currentOrgId } from '../../lib/supabaseClient.js';
import { privateFileUrl } from '../../lib/privateFile.js';

export const getDocuments = (employeeId) => apiGet(`/hr/documents${employeeId ? `?employeeId=${employeeId}` : ''}`).then((d) => d.documents);
export const createDocument = (body) => apiPost('/hr/documents', body).then((d) => d.document);
export const deleteDocument = (id) => apiDelete(`/hr/documents/${id}`);

export const uploadDocument = async (employeeId, file) => {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${await currentOrgId()}/${employeeId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('employee-documents').upload(path, file);
  if (error) throw new Error(error.message);
  return path;
};
export const getDocumentUrl = async (path) => {
  // Authorised server-side: the bucket policy only knows your company,
  // not whether this particular file is yours to read.
  return privateFileUrl('employee-documents', path);
};

export const getCases = () => apiGet('/hr/cases').then((d) => d.cases);
export const createCase = (body) => apiPost('/hr/cases', body).then((d) => d.case);
export const updateCase = (id, body) => apiPatch(`/hr/cases/${id}`, body).then((d) => d.case);

export const DOC_CATEGORY = { contract: 'Contract', id: 'ID document', certificate: 'Certificate', other: 'Other' };
export const CASE_CATEGORY = { warning: 'Warning', investigation: 'Investigation', suspension: 'Suspension', other: 'Other' };

export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';
export const isExpiringSoon = (d) => d && new Date(d) < new Date(Date.now() + 60 * 86400000) && new Date(d) >= new Date();
export const isExpired = (d) => d && new Date(d) < new Date();
