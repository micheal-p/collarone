// API facade. Pages call apiGet/apiPost/... against a stable endpoint contract;
// the implementation underneath is either Supabase (default) or a localStorage
// demo mock (VITE_DEMO_MODE=true).
import { demoApi } from './demo.js';
import { supabaseApi } from './supabaseApi.js';

export const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

let accessToken = null;
const listeners = new Set();

export const setAccessToken = (t) => { accessToken = t; };
export const getAccessToken = () => accessToken;

/** Reserved hook for forced sign-out; kept for API stability. */
export const onAuthExpired = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const backend = (path, opts) => (DEMO ? demoApi(path, opts) : supabaseApi(path, opts));

/** Restore a session on app boot. */
export async function bootSession() {
  try {
    const d = await backend('/auth/refresh', { method: 'POST' });
    accessToken = d.accessToken;
    return d;
  } catch {
    return null;
  }
}

export async function api(path, opts = {}) {
  const data = await backend(path, opts);
  if (data && data.accessToken) accessToken = data.accessToken;
  return data;
}

export const apiGet = (p) => api(p);
export const apiPost = (p, body) => api(p, { method: 'POST', body });
export const apiPatch = (p, body) => api(p, { method: 'PATCH', body });
export const apiPut = (p, body) => api(p, { method: 'PUT', body });
