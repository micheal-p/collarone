// The invoice as a real PDF file.
//
// Drawn with PDFKit rather than rendered from the HTML, because the file has to
// exist without a browser: it gets attached to the email and filed into
// Documents by the server, with nobody clicking anything. Headless Chrome would
// have kept one source of truth for the layout at the cost of ~300MB of
// Chromium on a VPS whose deploys already fail intermittently.
//
// The trade of that choice is that the LAYOUT lives in two places. The CONTENT
// does not: moneyState() and amountInWords() are the same modules the on-screen
// document uses, so what the PDF says about money can never disagree with what
// the screen says, even if the two drift visually.
import PDFDocument from 'pdfkit';
import { moneyState } from '../../src/suites/tradeDocs/docRules.js';
import { amountInWords } from '../../src/lib/amountInWords.js';

const INK = '#14171f';
const MUTED = '#6b7280';
const RULE = '#d9d5c9';
const RED = '#a4262c';
const GREEN = '#1a7f42';

// PDFKit's built-in fonts are WinAnsi, which has no ₦. Spell the currency
// rather than emit a wrong glyph — "NGN 487,500.00" is unambiguous and prints
// everywhere. (An embedded TTF with ₦ would be the nicer fix; it needs a font
// file shipped with the app, which is a bigger change than this is worth today.)
const money = (n) => `NGN ${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

const DOC_LABEL = {
  invoice: 'INVOICE', quote: 'QUOTATION', receipt: 'RECEIPT',
  grn: 'GOODS RECEIVED NOTE', srp: 'STOCK RELEASE NOTE',
  handover: 'HANDOVER NOTE', return_note: 'GOODS RETURN',
};

export function invoiceFilename(doc) {
  const safe = String(doc?.doc_no || 'document').replace(/[^A-Za-z0-9._-]/g, '-');
  return `${safe}.pdf`;
}

/**
 * @returns {Promise<Buffer>} the finished PDF
 */
export function renderInvoicePdf({ doc, settings = {}, meta }) {
  return new Promise((resolve, reject) => {
    try {
      // Every position below is derived from pdf.page.width/height (W, R,
      // BOTTOM), so switching layout reflows the whole document — column widths
      // widen, the vertical page-break threshold shortens — with no other change.
      const pdf = new PDFDocument({ size: 'A4', layout: settings.orientation === 'landscape' ? 'landscape' : 'portrait', margin: 40, info: {
        Title: `${DOC_LABEL[doc.doc_type] || 'Document'} ${doc.doc_no || ''}`.trim(),
        Author: settings.company_name || 'Collarone',
      } });
      const chunks = [];
      pdf.on('data', (c) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);

      const m = meta || {};
      const mny = moneyState(doc, m);
      const L = pdf.page.margins.left;
      const R = pdf.page.width - pdf.page.margins.right;
      const W = R - L;

      // ---- header ---------------------------------------------------------
      pdf.fillColor(INK).font('Helvetica-Bold').fontSize(16)
        .text(settings.company_name || 'Your company', L, 44, { width: W * 0.55 });
      if (settings.tagline) {
        pdf.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED)
          .text(settings.tagline, L, pdf.y + 1, { width: W * 0.55 });
      }
      const contact = [settings.address, settings.phone, settings.email].filter(Boolean).join('  |  ');
      if (contact) {
        pdf.font('Helvetica').fontSize(8.5).fillColor(MUTED)
          .text(contact, L, pdf.y + 2, { width: W * 0.55 });
      }

      pdf.font('Helvetica-Bold').fontSize(15).fillColor(INK)
        .text(DOC_LABEL[doc.doc_type] || 'DOCUMENT', L, 44, { width: W, align: 'right' });
      pdf.font('Helvetica').fontSize(9.5).fillColor(MUTED)
        .text(`${doc.doc_no || ''}   ${fmtDate(doc.created_at)}`, L, pdf.y + 2, { width: W, align: 'right' });

      let y = Math.max(pdf.y, 108) + 10;
      pdf.moveTo(L, y).lineTo(R, y).lineWidth(1.4).strokeColor(INK).stroke();
      y += 16;

      // ---- bill to, and the amount due beside it --------------------------
      const boxW = 190;
      const boxX = R - boxW;
      pdf.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
        .text(m.isStock || m.isCustody ? 'ISSUED TO' : 'BILL TO', L, y);
      pdf.font('Helvetica-Bold').fontSize(11).fillColor(INK)
        .text(doc.party_name || '', L, y + 12, { width: W - boxW - 24 });
      let partyY = pdf.y;
      for (const line of [doc.party_address, doc.party_phone, doc.party_email, doc.reference && `Ref: ${doc.reference}`].filter(Boolean)) {
        pdf.font('Helvetica').fontSize(9).fillColor(MUTED).text(String(line), L, partyY, { width: W - boxW - 24 });
        partyY = pdf.y;
      }

      if (mny.show) {
        const accent = mny.overdue ? RED : mny.settled ? GREEN : INK;
        // Tall box only when a caption line is drawn under the amount ("Received
        // with thanks" / "Due …"). Without this the caption cleared the bottom
        // border and read as overflow.
        const hasCaption = mny.settled || (m.hasDueDate && doc.due_date);
        const boxH = hasCaption ? 66 : 50;
        pdf.roundedRect(boxX, y - 4, boxW, boxH, 6).lineWidth(1.2).strokeColor(accent).stroke();
        pdf.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
          .text(mny.label.toUpperCase(), boxX, y + 6, { width: boxW - 14, align: 'right' });
        pdf.font('Helvetica-Bold').fontSize(17).fillColor(accent)
          .text(money(mny.amount), boxX, y + 20, { width: boxW - 14, align: 'right' });
        if (mny.settled) {
          pdf.font('Helvetica').fontSize(8.5).fillColor(MUTED)
            .text(m.isReceipt ? 'Received with thanks' : 'Paid in full, thank you', boxX, y + 42, { width: boxW - 14, align: 'right' });
        } else if (m.hasDueDate && doc.due_date) {
          pdf.font('Helvetica').fontSize(8.5).fillColor(mny.overdue ? RED : MUTED)
            .text(`${mny.overdue ? 'Overdue since' : 'Due'} ${fmtDate(doc.due_date)}`, boxX, y + 42, { width: boxW - 14, align: 'right' });
        }
      }

      y = Math.max(partyY, y + 70) + 12;

      // ---- line items -----------------------------------------------------
      const showMoney = !!m.hasVat;
      const cols = showMoney
        ? [{ w: W - 250 }, { w: 50, align: 'right' }, { w: 95, align: 'right' }, { w: 105, align: 'right' }]
        : [{ w: W - 60 }, { w: 60, align: 'right' }];
      const heads = showMoney ? ['DESCRIPTION', 'QTY', 'UNIT PRICE', 'AMOUNT'] : ['DESCRIPTION', 'QTY'];

      const headerRow = (atY) => {
        pdf.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
        let x = L;
        heads.forEach((h, i) => { pdf.text(h, x, atY, { width: cols[i].w, align: cols[i].align }); x += cols[i].w; });
        pdf.moveTo(L, atY + 12).lineTo(R, atY + 12).lineWidth(0.8).strokeColor(RULE).stroke();
        return atY + 18;
      };
      y = headerRow(y);

      const BOTTOM = pdf.page.height - pdf.page.margins.bottom - 90;
      for (const line of doc.items || []) {
        const amount = (Number(line.qty) || 0) * (Number(line.unit_price) || 0);
        const cells = showMoney
          ? [String(line.description || ''), String(line.qty ?? ''), money(line.unit_price), money(amount)]
          : [String(line.description || ''), String(line.qty ?? '')];
        pdf.font('Helvetica').fontSize(9.5).fillColor(INK);
        const h = Math.max(pdf.heightOfString(cells[0], { width: cols[0].w }), 12) + 6;
        // New page rather than a row split across the fold, and repeat the
        // column headers so page 2 is readable on its own.
        if (y + h > BOTTOM) { pdf.addPage(); y = headerRow(pdf.page.margins.top); }
        let x = L;
        cells.forEach((c, i) => { pdf.text(c, x, y, { width: cols[i].w, align: cols[i].align }); x += cols[i].w; });
        y += h;
      }

      pdf.moveTo(L, y + 2).lineTo(R, y + 2).lineWidth(0.8).strokeColor(RULE).stroke();
      y += 12;

      // ---- totals ---------------------------------------------------------
      if (mny.showTotals) {
        const labelW = 120;
        const valueW = 120;
        const tX = R - labelW - valueW;
        const row = (label, value, bold) => {
          pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11.5 : 9.5).fillColor(INK);
          pdf.text(label, tX, y, { width: labelW });
          pdf.text(value, tX + labelW, y, { width: valueW, align: 'right' });
          y += bold ? 18 : 14;
        };
        row('Subtotal', money(doc.subtotal));
        row(`VAT (${((Number(doc.vat_rate) || 0) * 100).toFixed(1)}%)`, money(doc.vat_amount));
        if (m.demandsPayment) {
          row('Total', money(doc.total));
          const paid = Number(doc.amount_paid) || 0;
          if (paid > 0) row('Paid', `- ${money(paid)}`);
          pdf.moveTo(tX, y).lineTo(R, y).lineWidth(1.2).strokeColor(INK).stroke();
          y += 6;
          row(mny.settled ? 'Balance' : 'Balance due', money(mny.settled ? 0 : mny.amount), true);
        } else {
          pdf.moveTo(tX, y).lineTo(R, y).lineWidth(1.2).strokeColor(INK).stroke();
          y += 6;
          row(m.isReceipt ? 'Total paid' : 'Total', money(doc.total), true);
        }

        pdf.font('Helvetica-Oblique').fontSize(8.5).fillColor('#444')
          .text(`${mny.wordsLabel}: ${amountInWords(mny.wordsAmount)}`, L, y + 2, { width: W * 0.62 });
        y = Math.max(y, pdf.y) + 10;
      }

      if (doc.notes) {
        pdf.font('Helvetica').fontSize(9).fillColor(MUTED).text(String(doc.notes), L, y, { width: W });
        y = pdf.y + 10;
      }

      // ---- how to pay ------------------------------------------------------
      if (mny.showPayTo && (settings.account_number || settings.bank_name || settings.payment_note)) {
        const payLines = [
          [settings.account_name || settings.company_name, settings.bank_name, settings.account_number].filter(Boolean).join('  |  '),
          settings.payment_note,
          doc.doc_no ? `Quote ${doc.doc_no} as your payment reference.` : '',
        ].filter(Boolean);
        const boxH = 22 + payLines.length * 13;
        if (y + boxH > pdf.page.height - pdf.page.margins.bottom) { pdf.addPage(); y = pdf.page.margins.top; }
        pdf.roundedRect(L, y, W, boxH, 5).lineWidth(0.8).strokeColor(RULE).stroke();
        pdf.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('PAY TO', L + 12, y + 8);
        let py = y + 20;
        payLines.forEach((line, i) => {
          pdf.font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(i === 0 ? 10 : 8.5)
            .fillColor(i === 0 ? INK : MUTED).text(line, L + 12, py, { width: W - 24 });
          py += 13;
        });
        y += boxH + 14;
      }

      // ---- signature(s) ----------------------------------------------------
      // A stock or custody note with one company signature proves nothing — the
      // value is the counter-signature from whoever received or checked the
      // goods. These docs get the same three-party block the on-screen template
      // draws (Released/Delivered by · Collected/Returned/Received by · Checked
      // by), so what you download matches what you preview. Everything else
      // (invoice/quote/receipt) keeps the single issuer signature.
      const isCheck = !!(m.isStock || m.isCustody);
      if (isCheck) {
        if (y > pdf.page.height - pdf.page.margins.bottom - 74) { pdf.addPage(); y = pdf.page.margins.top; }
        const stockDir = doc.doc_type === 'grn' ? 'in' : doc.doc_type === 'srp' ? 'out' : null;
        const custodyDir = doc.doc_type === 'handover' ? 'out' : doc.doc_type === 'return_note' ? 'in' : null;
        const cols = [
          { role: stockDir === 'in' ? 'Delivered by' : 'Released by', meta: 'Name, signature & date' },
          {
            role: custodyDir === 'out' ? 'Collected by' : custodyDir === 'in' ? 'Returned by' : 'Received by',
            meta: doc.party_name ? `${doc.party_name}, signature & date` : 'Name, signature & date',
          },
          { role: 'Checked by', meta: m.isCustody ? 'Condition on return' : 'Store officer' },
        ];
        const gap = 24;
        const colW = (W - gap * 2) / 3;
        const sigY = y + 34; // room to actually sign, above the line
        cols.forEach((c, i) => {
          const x = L + i * (colW + gap);
          pdf.moveTo(x, sigY).lineTo(x + colW, sigY).lineWidth(0.8).strokeColor(INK).stroke();
          pdf.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(c.role, x, sigY + 5, { width: colW });
          pdf.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(c.meta, x, pdf.y + 1, { width: colW });
        });
        y = sigY + 34;
      } else if (settings.signature_name || settings.signature_title) {
        if (y > pdf.page.height - pdf.page.margins.bottom - 60) { pdf.addPage(); y = pdf.page.margins.top; }
        pdf.moveTo(L, y + 18).lineTo(L + 200, y + 18).lineWidth(0.8).strokeColor(INK).stroke();
        pdf.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(settings.signature_name || '', L, y + 22);
        if (settings.signature_title) {
          pdf.font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED).text(settings.signature_title, L, pdf.y);
        }
      }

      pdf.end();
    } catch (e) {
      reject(e);
    }
  });
}
