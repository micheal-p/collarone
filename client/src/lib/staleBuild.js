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

function recover(reason) {
  if (sessionStorage.getItem(KEY)) return false;   // already tried; let it surface
  sessionStorage.setItem(KEY, reason.slice(0, 80));
  // replace() so the broken state doesn't sit in history behind a back button
  window.location.replace(window.location.href);
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

// A tab that reloaded once and is still fine should forget it happened, so a
// genuinely stale tab weeks later can still recover itself.
export function clearStaleBuildFlag() {
  if (sessionStorage.getItem(KEY)) sessionStorage.removeItem(KEY);
}
