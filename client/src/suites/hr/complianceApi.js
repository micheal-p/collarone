import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';
import { supabase } from '../../lib/supabaseClient.js';

export const getDocuments = (employeeId) => apiGet(`/hr/documents${employeeId ? `?employeeId=${employeeId}` : ''}`).then((d) => d.documents);
export const createDocument = (body) => apiPost('/hr/documents', body).then((d) => d.document);
export const deleteDocument = (id) => apiDelete(`/hr/documents/${id}`);

export const uploadDocument = async (employeeId, file) => {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${employeeId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('employee-documents').upload(path, file);
  if (error) throw new Error(error.message);
  return path;
};
export const getDocumentUrl = async (path) => {
  const { data, error } = await supabase.storage.from('employee-documents').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
};

export const getCases = () => apiGet('/hr/cases').then((d) => d.cases);
export const createCase = (body) => apiPost('/hr/cases', body).then((d) => d.case);
export const updateCase = (id, body) => apiPatch(`/hr/cases/${id}`, body).then((d) => d.case);

export const DOC_CATEGORY = { contract: 'Contract', id: 'ID document', certificate: 'Certificate', other: 'Other' };
export const CASE_CATEGORY = { warning: 'Warning', investigation: 'Investigation', suspension: 'Suspension', other: 'Other' };

export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';
export const isExpiringSoon = (d) => d && new Date(d) < new Date(Date.now() + 60 * 86400000) && new Date(d) >= new Date();
export const isExpired = (d) => d && new Date(d) < new Date();
