// Render an HTML string to an A4 PDF with headless Chromium. Used to turn the
// real letterhead template (invoiceHtml.js) into the downloaded file, so a
// download looks exactly like the on-screen preview / browser Print.
//
// One browser is launched lazily and reused across requests — launching per
// request would add ~300ms and a chunk of memory each time. If it ever dies,
// the next call transparently launches a fresh one. Any failure here is caught
// by the caller (invoice-pdf.js), which falls back to the always-available
// PDFKit renderer, so a download never breaks even if Chromium is unavailable.
//
// playwright-core (not playwright) so `npm ci` never auto-downloads a browser
// in CI or on the server; the Chromium binary is installed explicitly during
// deploy to a fixed PLAYWRIGHT_BROWSERS_PATH the service can read.
import { chromium } from 'playwright-core';

let browserPromise = null;

async function getBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b && b.isConnected()) return b;
    browserPromise = null; // dead or failed — relaunch below
  }
  browserPromise = chromium.launch({
    headless: true,
    // Servers run this without a display and often as a constrained user;
    // these are the standard flags to keep Chromium from needing either.
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const b = await browserPromise;
  b.on('disconnected', () => { browserPromise = null; });
  return b;
}

export async function htmlToPdf(html, { landscape = false } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // 'load' waits for images (a remote logo/signature) too, but a slow or
    // broken asset must not sink the whole render — swallow the wait timeout
    // and print what is there rather than fail to the plain fallback.
    await page.setContent(html, { waitUntil: 'load', timeout: 12000 }).catch(() => {});
    return await page.pdf({
      format: 'A4',
      landscape,
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
    });
  } finally {
    await page.close().catch(() => {});
  }
}
