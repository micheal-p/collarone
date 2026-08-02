import { useEffect } from 'react';

// Publishes the on-screen keyboard's height as `--kb-inset` on <html>.
//
// Why this exists: iOS Safari does NOT shrink the layout viewport when the
// keyboard opens — 100vh AND 100dvh both stay at their full value, and the
// browser simply slides the page up to reveal the focused field. So a composer
// pinned to the bottom of a full-height shell ends up UNDER the keyboard, and
// Safari's own scroll-into-view scramble is what reads as the screen "shaking".
// window.visualViewport is the only thing that reports the real visible area.
//
// Android Chrome resizes the layout viewport instead, so window.innerHeight
// shrinks along with the visual viewport — the subtraction below lands on ~0
// there, which is correct: the layout already made room, don't pad twice.
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined; // older browsers: composer just sits in flow
    const root = document.documentElement;
    const apply = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // Ignore hairline differences (URL-bar chrome), only react to a keyboard.
      root.style.setProperty('--kb-inset', inset > 60 ? `${Math.round(inset)}px` : '0px');
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      root.style.removeProperty('--kb-inset');
    };
  }, []);
}
