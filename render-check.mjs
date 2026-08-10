// Render every route in a real browser and fail on any runtime error.
//
// Lazy routes are the one change that a green build tells you nothing about.
// Splitting App.jsx into 35 dynamically-imported pages either works or leaves
// a blank screen, and `vite build` is perfectly happy either way — a missing
// Suspense boundary, a typo in an import path and a route that suspends on
// synchronous input all compile fine and fail only when someone visits.
//
// Not wired into CI: it needs Playwright plus a ~100MB browser download, which
// is a lot to carry for a check that matters on the deploys that touch
// routing. Run it by hand when they do.
//
//   npm install --no-save playwright && npx playwright install chromium
//   (cd client && npx vite preview --port 4180 &)
//   node render-check.mjs
import { chromium } from 'playwright';
const base = 'http://127.0.0.1:4180';
const routes = ['/', '/login', '/signup', '/pricing', '/try', '/status', '/terms',
                '/privacy', '/contact', '/jobs', '/themes', '/help', '/workspace', '/platform'];
const browser = await chromium.launch();
let bad = 0;
for (const r of routes) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 110)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 110)); });
  try {
    await page.goto(base + r, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(900);
    const txt = (await page.locator('body').innerText()).trim();
    const stuck = txt.length <= 40 && (await page.locator('.boot-spinner').count()) > 0;
    const real = errors.filter((e) => !/favicon|404|track|net::ERR|Failed to load resource/i.test(e));
    const ok = txt.length > 40 && real.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${r.padEnd(11)} chars:${String(txt.length).padStart(5)}${stuck ? '  STUCK ON SPINNER' : ''}${real.length ? '  ERR: ' + real[0] : ''}`);
  } catch (e) { bad++; console.log(`✗ ${r.padEnd(11)} ${String(e).slice(0, 90)}`); }
  await page.close();
}
await browser.close();
console.log(bad ? `\nFAILED: ${bad} route(s)` : '\nAll routes rendered, no runtime errors.');
process.exit(bad ? 1 : 0);
