import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';
import { supabase } from '../../lib/supabaseClient.js';

export const getStaff = () => apiGet('/staff').then((d) => d.staff);

/* ---- Requisitions ----------------------------------------------------------- */
export const getRequisitions  = () => apiGet('/hr/requisitions').then((d) => d.requisitions);
export const createRequisition = (body) => apiPost('/hr/requisitions', body).then((d) => d.requisition);
export const updateRequisition = (id, body) => apiPatch(`/hr/requisitions/${id}`, body).then((d) => d.requisition);
export const deleteRequisition = (id) => apiDelete(`/hr/requisitions/${id}`);

/* ---- Candidates & applications ----------------------------------------------- */
export const getPipeline = (requisitionId) => apiGet(`/hr/requisitions/${requisitionId}/pipeline`).then((d) => d.applications);
export const addCandidate = (requisitionId, body) => apiPost(`/hr/requisitions/${requisitionId}/pipeline`, body).then((d) => d.application);
export const updateApplication = (id, body) => apiPatch(`/hr/applications/${id}`, body).then((d) => d.application);
export const updateCandidate = (id, body) => apiPatch(`/hr/candidates/${id}`, body).then((d) => d.candidate);
export const deleteApplication = (id) => apiDelete(`/hr/applications/${id}`);

export const uploadResume = async (candidateId, file) => {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${candidateId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('candidate-resumes').upload(path, file);
  if (error) throw new Error(error.message);
  return path;
};
export const getResumeUrl = async (path) => {
  const { data, error } = await supabase.storage.from('candidate-resumes').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
};

/* ---- Interviews --------------------------------------------------------------- */
export const getInterviews = (applicationId) => apiGet(`/hr/applications/${applicationId}/interviews`).then((d) => d.interviews);
export const scheduleInterview = (applicationId, body) => apiPost(`/hr/applications/${applicationId}/interviews`, body).then((d) => d.interview);
export const submitInterview = (id, body) => apiPatch(`/hr/interviews/${id}`, body).then((d) => d.interview);
export const getMyInterviews = () => apiGet('/hr/myinterviews').then((d) => d.interviews);

/* ---- Onboarding ----------------------------------------------------------------- */
export const getTemplates = (phase) => apiGet(`/hr/templates?phase=${phase}`).then((d) => d.templates);
export const getLifecycleTasks = (employeeId, phase) => apiGet(`/hr/lifecycle-tasks?employeeId=${employeeId}&phase=${phase}`).then((d) => d.tasks);
export const generateOnboarding = (employeeId) => apiPost('/hr/onboarding/generate', { employeeId }).then((d) => d.tasks);
export const setProbation = (employeeId, probationEndDate) => apiPatch(`/hr/employees/${employeeId}/probation`, { probationEndDate }).then((d) => d.user);
export const confirmEmployee = (employeeId) => apiPost(`/hr/employees/${employeeId}/confirm`, {}).then((d) => d.user);

/* ---- Offboarding ----------------------------------------------------------------- */
export const getExits = () => apiGet('/hr/exits').then((d) => d.exits);
export const initiateExit = (body) => apiPost('/hr/exits', body).then((d) => d.exit);
export const updateExit = (id, body) => apiPatch(`/hr/exits/${id}`, body).then((d) => d.exit);
export const finalizeExit = (id) => apiPost(`/hr/exits/${id}/finalize`, {}).then((d) => d.exit);

/* ---- Generic lifecycle task mutation -------------------------------------------- */
export const completeTask = (id, notes) => apiPatch(`/hr/lifecycle-tasks/${id}`, { status: 'done', notes }).then((d) => d.task);
export const reopenTask   = (id) => apiPatch(`/hr/lifecycle-tasks/${id}`, { status: 'pending' }).then((d) => d.task);

/* ---- Display helpers ------------------------------------------------------------- */
export const REQ_STATUS = {
  draft:    { label: 'Draft',    cls: 'lc-req-draft' },
  open:     { label: 'Open',     cls: 'lc-req-open' },
  on_hold:  { label: 'On hold',  cls: 'lc-req-hold' },
  closed:   { label: 'Closed',   cls: 'lc-req-closed' },
  filled:   { label: 'Filled',   cls: 'lc-req-filled' },
};

export const STAGE = {
  applied:   { label: 'Applied',   cls: 'lc-stage-applied' },
  screening: { label: 'Screening', cls: 'lc-stage-screen' },
  interview: { label: 'Interview', cls: 'lc-stage-interview' },
  offer:     { label: 'Offer',     cls: 'lc-stage-offer' },
  hired:     { label: 'Hired',     cls: 'lc-stage-hired' },
  rejected:  { label: 'Rejected',  cls: 'lc-stage-rejected' },
};
export const STAGE_ORDER = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];

export const OUTCOME = {
  pending:    { label: 'Pending',    cls: 'lc-out-pending' },
  strong_yes: { label: 'Strong yes', cls: 'lc-out-syes' },
  yes:        { label: 'Yes',        cls: 'lc-out-yes' },
  no:         { label: 'No',         cls: 'lc-out-no' },
  strong_no:  { label: 'Strong no',  cls: 'lc-out-sno' },
};

export const EXIT_STATUS = {
  initiated: { label: 'Initiated', cls: 'lc-exit-init' },
  clearance: { label: 'Clearance', cls: 'lc-exit-clear' },
  settled:   { label: 'Settled',   cls: 'lc-exit-settled' },
  completed: { label: 'Completed', cls: 'lc-exit-done' },
};

export const CATEGORY_LABEL = { hr: 'HR', it: 'IT', manager: 'Manager', finance: 'Finance' };

export const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';
export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';
