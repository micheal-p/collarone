import { useEffect, useRef } from 'react';

// Cloudflare Turnstile widget — the "I am human" check on public forms.
//
// Graceful: with no VITE_TURNSTILE_SITE_KEY it renders nothing and TURNSTILE_ON
// is false, so forms behave exactly as before. Set the key (and the matching
// TURNSTILE_SECRET on the server) to switch protection on everywhere at once.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
export const TURNSTILE_ON = Boolean(SITE_KEY);

const SCRIPT_ID = 'cf-turnstile-script';
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// onToken(token) is called with the solved token, or '' when it expires/errors
// (so the parent can disable submit again). Pass a stable callback — e.g. a
// useState setter — since the effect depends on it.
export default function Turnstile({ onToken }) {
  const boxRef = useRef(null);

  useEffect(() => {
    if (!SITE_KEY) return undefined;
    let widgetId;
    let poll;

    const render = () => {
      if (!window.turnstile || !boxRef.current || boxRef.current.dataset.rendered) return;
      boxRef.current.dataset.rendered = '1';
      widgetId = window.turnstile.render(boxRef.current, {
        sitekey: SITE_KEY,
        callback: (t) => onToken(t),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    };

    if (window.turnstile) {
      render();
    } else {
      if (!document.getElementById(SCRIPT_ID)) {
        const s = document.createElement('script');
        s.id = SCRIPT_ID; s.src = SRC; s.async = true; s.defer = true;
        document.head.appendChild(s);
      }
      poll = setInterval(() => { if (window.turnstile) { clearInterval(poll); render(); } }, 200);
    }

    return () => {
      if (poll) clearInterval(poll);
      if (widgetId && window.turnstile) { try { window.turnstile.remove(widgetId); } catch { /* gone */ } }
      if (boxRef.current) delete boxRef.current.dataset.rendered;
    };
  }, [onToken]);

  if (!SITE_KEY) return null;
  return <div ref={boxRef} className="cf-turnstile" style={{ margin: '10px 0' }} />;
}
