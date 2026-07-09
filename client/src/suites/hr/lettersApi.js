import { apiGet, apiPost, apiPatch } from '../../api/client.js';
import { supabase } from '../../lib/supabaseClient.js';

export const getLetters = () => apiGet('/hr/letters').then((d) => d.letters);
export const requestLetter = (body) => apiPost('/hr/letters', body).then((d) => d.letter);
export const decideLetter = (id, body) => apiPatch(`/hr/letters/${id}`, body).then((d) => d.letter);

export const uploadLetter = async (letterId, file) => {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${letterId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('hr-letters').upload(path, file);
  if (error) throw new Error(error.message);
  return path;
};
export const getLetterUrl = async (path) => {
  const { data, error } = await supabase.storage.from('hr-letters').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
};

export const LETTER_TYPE = { employment_verification: 'Employment verification', reference: 'Reference letter', other: 'Other' };
export const LETTER_STATUS = {
  pending:  { label: 'Pending',  cls: 'lc-req-draft' },
  issued:   { label: 'Issued',   cls: 'lc-exit-done' },
  declined: { label: 'Declined', cls: 'lc-stage-rejected' },
};

export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';
