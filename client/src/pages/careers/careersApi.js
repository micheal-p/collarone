import { apiGet, apiPost, DEMO } from '../../api/client.js';
import { supabase, currentOrgId } from '../../lib/supabaseClient.js';

export const getOrgInfo = (orgSlug) => apiGet(`/careers/org/${orgSlug}`).then((d) => d.org);
export const getPostings = (orgSlug) => apiGet(`/careers/postings/${orgSlug}`).then((d) => d.postings);
export const getPosting  = (orgSlug, id) => apiGet(`/careers/postings/${orgSlug}/${id}`).then((d) => d.posting);

// Platform-wide board — every org's public postings in one anonymous query.
export const getAllPostings = async () => {
  if (DEMO) {
    return [
      { id: 'j1', title: 'Warehouse Supervisor', location: 'Ikeja, Lagos', employment_type: 'full_time', salary_min: 1800000, salary_max: 3000000, department_name: 'Operations', org_slug: 'kaya-foods', org_name: 'Kaya Foods Ltd', created_at: new Date().toISOString() },
      { id: 'j2', title: 'Front Desk Officer', location: 'Victoria Island, Lagos', employment_type: 'full_time', salary_min: 1200000, salary_max: null, department_name: 'Admin', org_slug: 'kaya-foods', org_name: 'Kaya Foods Ltd', created_at: new Date().toISOString() },
      { id: 'j3', title: 'Sales Executive', location: 'Abuja', employment_type: 'contract', salary_min: null, salary_max: null, department_name: 'Sales', org_slug: 'demo-co', org_name: 'Demo Co', created_at: new Date().toISOString() },
    ];
  }
  const { data, error } = await supabase.from('public_job_postings').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
};

export const submitApplication = (body) => apiPost('/careers/apply', body).then((d) => d.applicationId);

// Anonymous applicants upload before a candidate record exists — key by a
// throwaway token rather than an id. The org id goes first so the resume lands
// in the hiring org's folder and only that org's recruiters can read it back;
// the applicant isn't authenticated, so they can't derive it — the careers
// page passes the id it already loaded for the posting.
export const uploadResume = async (orgId, file) => {
  if (!orgId) throw new Error('Could not attach the resume — reload the page and try again.');
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${orgId}/${crypto.randomUUID()}-${safe}`;
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
