import { apiGet, apiPost } from '../../api/client.js';
import { supabase } from '../../lib/supabaseClient.js';

export const getOrgInfo = (orgSlug) => apiGet(`/careers/org/${orgSlug}`).then((d) => d.org);
export const getPostings = (orgSlug) => apiGet(`/careers/postings/${orgSlug}`).then((d) => d.postings);
export const getPosting  = (orgSlug, id) => apiGet(`/careers/postings/${orgSlug}/${id}`).then((d) => d.posting);

export const submitApplication = (body) => apiPost('/careers/apply', body).then((d) => d.applicationId);

// Anonymous applicants upload before a candidate record exists — key by a
// throwaway token rather than an id.
export const uploadResume = async (file) => {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `public/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from('candidate-resumes').upload(path, file);
  if (error) throw new Error(error.message);
  return path;
};

export const EMPLOYMENT_TYPE_LABEL = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', intern: 'Internship' };

export const fmtSalary = (n) => n ? `₦${Number(n).toLocaleString('en-NG')}` : null;

export const fmtSalaryRange = (min, max) => {
  if (min && max) return `${fmtSalary(min)} – ${fmtSalary(max)} / yr`;
  if (min) return `From ${fmtSalary(min)} / yr`;
  if (max) return `Up to ${fmtSalary(max)} / yr`;
  return null;
};
