// Recover a tab that is running a build the server no longer has.
//
// The failure: assets are content-hashed and served `immutable`, and
// deploy/deploy.sh rsyncs with --delete, so the moment a deploy finishes every
// chunk of the previous build is GONE from the server. A browser still holding
// the old index.html — an open tab, or a cached copy, since nginx sends no
// Cache-Control for the HTML — then asks for assets/index-<oldhash>.js, gets
// nginx's 404 page, and tries to parse `<html>` as JavaScript. That is the
// "Unexpected token '<'" flood, and its siblings "Importing a module script
// failed" and "Failed to fetch dynamically imported module": the same event
// seen through three different browsers' wording.
//
// There is nothing to repair in the page — its code is simply no longer on the
// server — so the only cure is to fetch the current index.html and start again.
// Reloading blind would risk a loop if the failure were anything else, so this
// reloads at most once per session and only for this specific signature.
const KEY = 'co-stale-build-reloaded';

export const looksLikeStaleChunk = (msg = '') => {
  const m = String(msg);
  return (
    // Chrome/Edge: HTML parsed as a module
    m.includes("Unexpected token '<'")
    // Chrome: the dynamic import itself failed
    || m.includes('Failed to fetch dynamically imported module')
    // Safari
    || m.includes('Importing a module script failed')
    // Firefox
    || m.includes('error loading dynamically imported module')
    || m.includes('expected expression, got \'<\'')
  );
};

// ONE reload per tab, ever. The first version of this cleared the flag on every
// successful boot so a long-lived tab could recover twice — which defeated the
// guard completely and shipped an infinite reload loop: boot clears the flag →
// a lazy chunk 404s → reload → boot clears the flag → same chunk → reload.
// A second reload has never fixed anything the first one didn't; if it comes
// back, the page is broken for some other reason and must be allowed to say so.
function recover(reason) {
  if (sessionStorage.getItem(KEY)) return false;   // already tried; let it surface
  sessionStorage.setItem(KEY, String(reason).slice(0, 80));

  // Bust the cache on the way out. index.html is served with no Cache-Control
  // (see ops/nginx/README.md), so a plain reload can be answered from the
  // browser's own copy — the same stale HTML naming the same missing chunk,
  // which is what makes this look like a loop rather than a fix. A query the
  // server ignores forces a fresh fetch; boot() strips it back out.
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_b', String(Date.now()).slice(-6));
    window.location.replace(url.toString());   // replace(): no broken entry in history
  } catch {
    window.location.replace(window.location.href);
  }
  return true;
}

export function installStaleBuildRecovery() {
  // Vite's own signal — fires when a preloaded chunk can't be fetched. This is
  // the cleanest hook and catches the case before it becomes a parse error.
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();               // stop it becoming an unhandled rejection
    recover('vite:preloadError');
  });

  window.addEventListener('error', (e) => {
    if (looksLikeStaleChunk(e?.message)) recover(e.message);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const msg = e?.reason?.message || e?.reason;
    if (looksLikeStaleChunk(msg)) recover(String(msg));
  });
}

// Called once the app has actually booted. It does NOT clear the guard — that
// is what caused the loop — it only tidies the cache-busting query out of the
// address bar so the user isn't left looking at ?_b=123456.
export function cleanRecoveryUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('_b')) return;
    url.searchParams.delete('_b');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch { /* cosmetic only, never let this break boot */ }
}
