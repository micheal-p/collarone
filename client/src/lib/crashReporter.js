// Global crash reporter — ships uncaught front-end errors to /api/track so
// real user-facing crashes surface in Platform Control instead of dying
// silently in someone's browser. The /status uptime checks only prove the
// API and database answer; they can't see an exception inside the bundle.
const seen = new Set();
let sent = 0;

export function reportCrash(message, stack) {
  if (import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true') return;
  const key = String(message).slice(0, 120);
  // one report per distinct error, hard cap per session — a render loop that
  // throws 60×/second must not turn into 60 requests/second
  if (seen.has(key) || sent >= 5) return;
  seen.add(key);
  sent += 1;
  const body = JSON.stringify({
    type: 'client_error',
    message: String(message || 'Unknown error').slice(0, 500),
    stack: String(stack || '').slice(0, 3000),
    path: window.location.pathname,
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
    }
  } catch { /* the reporter must never throw */ }
}

export function installCrashReporter() {
  window.addEventListener('error', (e) => reportCrash(e.error?.message || e.message || 'Script error', e.error?.stack));
  window.addEventListener('unhandledrejection', (e) => reportCrash(e.reason?.message || String(e.reason || 'Unhandled rejection'), e.reason?.stack));
}
