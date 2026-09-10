// A full-screen overlay must not live inside an element that traps it.
//
// THE BUG THIS EXISTS TO STOP HAPPENING TWICE
//
// The landing page's mobile menu shipped with its scrim inside <nav>. The nav
// carries `backdrop-filter: blur(16px)`, and backdrop-filter (like transform,
// filter and perspective) makes an element the CONTAINING BLOCK for any
// position:fixed descendant. So `position: fixed; inset: 0` no longer meant
// "the screen", it meant "the nav" — measured live at 390px wide, the scrim
// was 390x436 instead of 390x844.
//
// Two things followed, and both are what the founder actually saw:
//
//   * the scrim covered the burger and every menu link (it is positioned,
//     z-index 29; the menu was static, so the scrim painted over it). Tapping
//     "Platform" hit the scrim, whose onClick closes the menu — the tap was
//     eaten, nothing navigated, the menu just shut.
//   * tapping the page BELOW the menu hit nothing at all, because the scrim
//     stopped 436px down.
//
// "it doesnt work. it close and there seems to be like a cover." Exactly that.
//
// Nothing threw. No test failed. The menu was in the DOM with the right
// classes, and every earlier check only asked whether it mounted and unmounted
// — which it did. Presence is not reachability.
//
// This guard is structural because the real rule is structural: an overlay
// that must cover the viewport cannot be a descendant of a containing-block
// former, and it must paint below the menu it dims.
//
// Run:  node test/overlay_containing_block.mjs
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(`${root}${p}`, 'utf8');
let failures = 0;
const fail = (msg, why) => { failures++; console.log(`x ${msg}`); if (why) console.log(`    ${why}`); };
const ok = (msg) => console.log(`✓ ${msg}`);

// Properties that make an element the containing block for fixed descendants.
const TRAPS = /(backdrop-filter|(?<!-)\btransform|\bfilter|\bperspective|\bwill-change|contain)\s*:\s*(?!none)/;

// --- 1. the landing menu and its scrim are not inside <nav> ------------------
{
  const src = read('client/src/pages/Landing.jsx');
  const navStart = src.indexOf('<nav className={`cl-nav');
  const navEnd = src.indexOf('</nav>', navStart);
  if (navStart === -1 || navEnd === -1) {
    fail('Landing.jsx: could not find the <nav> block — has the nav been renamed?',
      'This test locates it to prove the overlay is outside it. Update the test with the new markup.');
  } else {
    const inNav = src.slice(navStart, navEnd);
    if (/className="cl-nav-scrim"/.test(inNav)) {
      fail('the mobile-menu scrim is inside <nav> again',
        '.cl-nav has backdrop-filter, so a position:fixed scrim inside it is sized to the NAV, not the screen. It then covers the burger and the menu links, and a tap on either is eaten. Keep it a sibling of <nav>.');
    }
    if (/className="cl-mobile-menu"/.test(inNav)) {
      fail('the mobile menu is inside <nav> again',
        'Same containing-block trap: the menu is position:fixed and would be measured against the nav.');
    }
    if (!failures) ok('the landing menu and its scrim sit outside <nav>, so "fixed" means the screen');
  }
}

// --- 2. the scrim paints below the menu, and below the nav ------------------
{
  const css = read('client/src/pages/Landing.css');
  const zOf = (selector) => {
    // last declaration wins, so scan every rule for this selector
    const re = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`, 'g');
    let z = null, m;
    while ((m = re.exec(css))) {
      const hit = /z-index\s*:\s*(-?\d+)/.exec(m[1]);
      if (hit) z = Number(hit[1]);
    }
    return z;
  };
  const scrim = zOf('.cl-nav-scrim');
  const menu = zOf('.cl-mobile-menu');
  const nav = zOf('.cl-nav');

  if (scrim == null) fail('.cl-nav-scrim has no z-index', 'Without one it cannot be ordered against the menu and the nav.');
  if (menu == null) fail('.cl-mobile-menu has no z-index', 'It must paint ABOVE the scrim or its links cannot be tapped.');
  if (scrim != null && menu != null && scrim >= menu) {
    fail(`the scrim (z-index ${scrim}) is not below the menu (z-index ${menu})`,
      'A dimming layer above the thing it dims eats every tap meant for it.');
  }
  if (scrim != null && nav != null && scrim >= nav) {
    fail(`the scrim (z-index ${scrim}) is not below the nav (z-index ${nav})`,
      'The burger lives in the nav. A scrim above it means the only way to close the menu is the tap that also closes it by accident.');
  }
  if (scrim != null && menu != null && nav != null && scrim < menu && scrim < nav) {
    ok(`stacking is right: scrim ${scrim} < nav ${nav}, and scrim ${scrim} < menu ${menu}`);
  }

  // The menu must be positioned at all — a static element loses to any
  // positioned sibling regardless of DOM order, which is how this started.
  const menuRules = [...css.matchAll(/\.cl-mobile-menu\s*\{([^}]*)\}/g)].map((m) => m[1]).join(' ');
  if (!/position\s*:\s*(fixed|absolute|sticky|relative)/.test(menuRules)) {
    fail('.cl-mobile-menu is not positioned',
      'z-index does nothing on a static element, so the scrim would paint over it again.');
  }
}

// --- 3. no OTHER full-viewport overlay is nested in a trap -------------------
// Cheap structural sweep: for each stylesheet, find selectors that are both
// position:fixed and full-viewport, and report any whose own rule ALSO sets a
// containing-block-forming property (the self-trap case, e.g. a scrim that
// blurs itself and then holds a fixed child).
{
  const files = ['client/src/pages/Landing.css', 'client/src/styles/app.css', 'client/src/styles/platform.css'];
  const suspicious = [];
  for (const f of files) {
    const css = read(f);
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const body = m[2];
      const isFixed = /position\s*:\s*fixed/.test(body);
      const isFullScreen = /inset\s*:\s*0/.test(body) || (/top\s*:\s*0/.test(body) && /bottom\s*:\s*0/.test(body));
      if (isFixed && isFullScreen && TRAPS.test(body) && !/backdrop-filter\s*:\s*blur\(\s*[0-9.]+px\s*\)/.test(body.replace(/position[^;]*;/, ''))) {
        suspicious.push(`${f}: ${m[1].trim().slice(0, 60)}`);
      }
    }
  }
  // Informational only: a self-blurring scrim is a normal, working pattern
  // (.pc-scrim, .modal-overlay). It is listed so a human can eyeball whether
  // any of them has gained a fixed CHILD, which is the failing shape.
  if (suspicious.length) {
    console.log(`~ ${suspicious.length} full-screen overlay(s) also set a containing-block property. Fine on their own; check none has gained a position:fixed CHILD:`);
    suspicious.forEach((x) => console.log(`    ${x}`));
  }
}

if (failures) { console.error(`\nFAILED, ${failures} overlay containing-block problem(s)`); process.exit(1); }
console.log('Full-screen overlays escape their ancestors and sit under what they dim. ALL PASSED');
