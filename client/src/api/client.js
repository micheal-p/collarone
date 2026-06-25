// Thin fetch wrapper. Holds the access token in memory and transparently
// refreshes it (via the httpOnly refresh cookie) on a 401, once.

let accessToken = null;
const listeners = new Set();

export const setAccessToken = (t) => {
  accessToken = t;
};
export const getAccessToken = () => accessToken;

/** Subscribe to a forced sign-out (refresh failed). */
export const onAuthExpired = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const fireExpired = () => listeners.forEach((fn) => fn());

const BASE = '/api/v1';

async function raw(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function tryRefresh() {
  const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!res.ok) return false;
  const data = await res.json();
  accessToken = data.accessToken;
  return true;
}

export async function api(path, opts = {}) {
  let res = await raw(path, opts);

  // One transparent refresh-and-retry on expiry.
  if (res.status === 401 && !opts._retried && path !== '/auth/login') {
    const ok = await tryRefresh();
    if (ok) res = await raw(path, { ...opts, _retried: true });
    else fireExpired();
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON response — usually the API isn't reachable (proxy/backend down),
      // so we got an HTML/plain-text error page instead of JSON.
      const err = new Error(
        res.status === 404
          ? 'Cannot reach the server. The backend may be starting up or not deployed yet — try again in a minute.'
          : `Unexpected server response (${res.status}). Please try again shortly.`
      );
      err.status = res.status;
      err.code = 'bad_gateway';
      throw err;
    }
  }
  if (!res.ok) {
    const err = new Error(data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.error;
    throw err;
  }
  return data;
}

export const apiGet = (p) => api(p);
export const apiPost = (p, body) => api(p, { method: 'POST', body });
export const apiPatch = (p, body) => api(p, { method: 'PATCH', body });
export const apiPut = (p, body) => api(p, { method: 'PUT', body });
