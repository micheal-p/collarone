import { apiGet, apiPost, apiPatch, apiDelete, DEMO } from '../../api/client.js';
import { supabase } from '../../lib/supabaseClient.js';
import { LETTER_TYPES } from './letterheadTemplates.js';

export const getLetters = () => apiGet('/hr/letters').then((d) => d.letters);
export const requestLetter = (body) => apiPost('/hr/letters', body).then((d) => d.letter);
export const decideLetter = (id, body) => apiPatch(`/hr/letters/${id}`, body).then((d) => d.letter);

// ---- letters engine ----------------------------------------------------------
export const getLetterheads   = () => apiGet('/hr/letterheads').then((d) => d.letterheads);
export const saveLetterhead   = (body) => apiPost('/hr/letterheads', body).then((d) => d.letterhead);
export const updateLetterhead = (id, body) => apiPatch(`/hr/letterheads/${id}`, body).then((d) => d.letterhead);
export const deleteLetterhead = (id) => apiDelete(`/hr/letterheads/${id}`);
export const getIssuedLetters = () => apiGet('/hr/issued-letters').then((d) => d.letters);
export const issueLetter      = (body) => apiPost('/hr/issued-letters', body).then((d) => d.letter);

export const uploadLetterheadFile = async (file) => {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `letterheads/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('hr-letters').upload(path, file);
  if (error) throw new Error(error.message);
  return path;
};

export const uploadIssuedLetterHtml = async (html, title) => {
  const safe = title.replace(/[^a-zA-Z0-9]+/g, '-');
  const path = `issued/${Date.now()}-${safe}.html`;
  const file = new File([html], `${safe}.html`, { type: 'text/html' });
  const { error } = await supabase.storage.from('hr-letters').upload(path, file);
  if (error) throw new Error(error.message);
  return path;
};

// ---- Collarone AI draft --------------------------------------------------------
// Calls /api/ai-letter (Vercel function). The AI backend is intentionally left
// to the platform owner (implemented with their own provider/credits); the UI
// only depends on this request/response contract:
//   POST /api/ai-letter
//   body:    { letterType, letterTypeLabel, employeeName, jobTitle, department,
//              startDate, companyName, tone, instructions }
//   returns: { body: "<the drafted letter text>" }  |  { error: "<message>" }
export const aiDraftLetter = async (ctx) => {
  if (DEMO) {
    // Demo mode has no serverless functions — return the skeleton dressed up a
    // little so the flow is demonstrable without any AI backend.
    await new Promise((r) => setTimeout(r, 900));
    const skeleton = (LETTER_TYPES[ctx.letterType] || LETTER_TYPES.custom).skeleton(ctx);
    return `${skeleton}\n\n[Draft generated in demo mode — the live app uses Collarone AI.]`;
  }
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/ai-letter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(ctx),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Collarone AI is not available right now — you can still write the letter manually.');
  if (!data.body) throw new Error('Collarone AI returned an empty draft — try again or write manually.');
  return data.body;
};

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
