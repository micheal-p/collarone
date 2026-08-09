// An issued HR letter as a real PDF file.
//
// Until now a letter existed only as HTML: downloaded to the issuer's computer
// and filed to Documents as a .html file. That is fine on a laptop and wrong
// everywhere else — a bank, an embassy or a landlord asks for a PDF, and an
// employee forwarding an .html attachment from their phone gets a page of
// markup or a broken preview. These letters are precisely the documents people
// need to hand to institutions, so the file format is not a detail.
//
// Same approach as invoicePdf.js and for the same reason: drawn with PDFKit
// rather than rendered from the HTML, because the file must exist server-side
// with no browser involved. It follows that the LAYOUT lives in two places —
// here and in letterheadTemplates.js — while the CONTENT does not: the body
// text, the letterhead details and the reference all come from the same rows
// the screen reads, so the PDF cannot say something different from the preview.
//
// The eight visual templates are deliberately NOT reproduced. A PDF that tries
// to be a slightly-wrong copy of the "Executive" or "Warm" design looks like a
// bug; one clean, formal layout that uses the org's real details, accent colour
// and signature looks intentional. If a customer needs their exact template,
// the HTML preview still prints to PDF from the browser.
import PDFDocument from 'pdfkit';

const INK = '#14171f';
const MUTED = '#6b7280';
const RULE = '#d9d5c9';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '');

// Only png/jpeg data URLs, matching safeImageSrc() on the client — PDFKit
// accepts a Buffer, and anything else (a remote URL, an SVG) is skipped rather
// than risking a throw that would lose the whole letter over a logo.
const imageBuffer = (raw) => {
  const s = String(raw || '');
  const m = /^data:image\/(png|jpe?g);base64,([a-z0-9+/=\s]+)$/i.exec(s);
  if (!m) return null;
  try { return Buffer.from(m[2].replace(/\s/g, ''), 'base64'); } catch { return null; }
};

export function letterFilename(letter) {
  const safe = String(letter.title || 'letter').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const ref = String(letter.reference || '').replace(/[^a-zA-Z0-9]+/g, '-');
  return `${safe}${ref ? `-${ref}` : ''}.pdf`;
}

export function renderLetterPdf({ letter, letterhead = {}, employee = {} }) {
  return new Promise((resolve, reject) => {
    try {
      const d = letterhead.details || {};
      const accent = /^#[0-9a-f]{6}$/i.test(d.accent || '') ? d.accent : '#0A0E1A';
      const pdf = new PDFDocument({ size: 'A4', margin: 56, info: {
        Title: letter.title || 'Letter',
        Author: d.companyName || 'Collarone',
      } });
      const chunks = [];
      pdf.on('data', (c) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);

      const L = pdf.page.margins.left;
      const R = pdf.page.width - pdf.page.margins.right;
      const W = R - L;

      // ---- letterhead --------------------------------------------------
      const logo = imageBuffer(d.logo);
      if (logo) {
        try { pdf.image(logo, L, pdf.y, { fit: [180, 46] }); pdf.moveDown(0.4); }
        catch { /* a bad image must never cost the letter */ }
      }
      pdf.fillColor(INK).font('Helvetica-Bold').fontSize(16)
        .text(d.companyName || 'Your Company Ltd', L, logo ? pdf.y + 8 : pdf.y, { width: W });
      if (d.tagline) pdf.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(d.tagline, { width: W });

      const contact = [d.address, d.phone, d.email].filter(Boolean).join('  ·  ');
      if (contact) pdf.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(contact, { width: W });
      if (d.rcNumber) pdf.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(`RC ${d.rcNumber}`, { width: W });

      pdf.moveDown(0.6);
      pdf.moveTo(L, pdf.y).lineTo(R, pdf.y).lineWidth(2).strokeColor(accent).stroke();
      pdf.moveDown(1.2);

      // ---- date and reference -------------------------------------------
      pdf.font('Helvetica').fontSize(10).fillColor(INK)
        .text(fmtDate(letter.issued_at || new Date()), L, pdf.y, { width: W });
      if (letter.reference) {
        pdf.font('Helvetica').fontSize(9).fillColor(MUTED).text(`Our ref: ${letter.reference}`, { width: W });
      }
      pdf.moveDown(1);

      // ---- addressee ------------------------------------------------------
      if (employee.name) {
        pdf.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(employee.name, { width: W });
        if (employee.job_title) pdf.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(employee.job_title, { width: W });
        pdf.moveDown(0.8);
      }

      // ---- title and body --------------------------------------------------
      if (letter.title) {
        pdf.font('Helvetica-Bold').fontSize(11.5).fillColor(INK)
          .text(String(letter.title).toUpperCase(), { width: W });
        pdf.moveDown(0.6);
      }
      // The body is plain text with real paragraph breaks; PDFKit handles the
      // wrapping, so it reflows properly instead of being clipped like the
      // fixed-height HTML preview can be.
      pdf.font('Helvetica').fontSize(10.5).fillColor(INK)
        .text(String(letter.body || ''), { width: W, align: 'left', lineGap: 3.5 });

      // ---- signature -------------------------------------------------------
      pdf.moveDown(2);
      const sig = imageBuffer(d.signature);
      if (sig) {
        try { pdf.image(sig, L, pdf.y, { fit: [150, 44] }); pdf.moveDown(0.2); }
        catch { /* fall through to the typed block */ }
      }
      pdf.moveTo(L, pdf.y + 6).lineTo(L + 190, pdf.y + 6).lineWidth(0.8).strokeColor(RULE).stroke();
      pdf.moveDown(0.8);
      if (d.signatoryName) pdf.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(d.signatoryName, { width: W });
      if (d.signatoryTitle) pdf.font('Helvetica').fontSize(9).fillColor(MUTED).text(d.signatoryTitle, { width: W });
      if (!d.signatoryName) pdf.font('Helvetica').fontSize(9).fillColor(MUTED).text('For and on behalf of ' + (d.companyName || 'the company'), { width: W });

      // ---- footer ----------------------------------------------------------
      // Pinned to the bottom of the page rather than floated after the
      // signature — the same fix the HTML letterhead needed, for the same
      // reason: a footer halfway up the page reads as a mistake.
      const footY = pdf.page.height - pdf.page.margins.bottom - 22;
      if (contact || d.companyName) {
        pdf.moveTo(L, footY).lineTo(R, footY).lineWidth(0.5).strokeColor(RULE).stroke();
        pdf.font('Helvetica').fontSize(7.5).fillColor(MUTED)
          .text([d.companyName, contact, d.rcNumber ? `RC ${d.rcNumber}` : null].filter(Boolean).join('  ·  '),
            L, footY + 6, { width: W, align: 'center' });
      }

      pdf.end();
    } catch (e) { reject(e); }
  });
}
