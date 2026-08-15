// Trade-document letterhead CSS — the single source shared by the on-screen
// preview / browser Print (TradeDocsApp.jsx) and the server-side PDF renderer
// (client/api/_lib/invoiceHtml.js). Keeping ONE copy is what guarantees the
// downloaded file looks exactly like the preview across all six templates.
export const TEMPLATE_CSS = `
/* ===== Trade document templates =========================================
   One skeleton, six looks. The skeleton is what makes a document READABLE
   (a metadata strip you can scan, columns that line up, signature blocks
   that say who signs); the template only changes how it feels.
   ======================================================================== */
.tdt-doc { --accent: #0A0E1A; position: relative; color: #14171f;
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 13px; line-height: 1.5; }
.tdt-doc .table { min-width: 0; }
/* On screen, give the preview the SHAPE of the chosen page so portrait vs
   landscape is visible before printing — the real page size for print/PDF is
   set by @page and the PDF renderer's own layout, not this. ~96dpi A4 widths. */
@media screen {
  .tdt-doc[data-orientation] { max-width: 794px; margin-left: auto; margin-right: auto; }
  .tdt-doc[data-orientation="landscape"] { max-width: 1123px; }
}
.tdt-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.tdt-label { display: block; font-size: 9px; font-weight: 700; letter-spacing: .12em;
  text-transform: uppercase; color: #8b8578; margin-bottom: 3px; }

/* ---- header ---- */
.tdt-band { display: none; }
.tdt-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
.tdt-logo { max-height: 54px; max-width: 190px; object-fit: contain; margin-bottom: 8px; display: block; }
.tdt-wordmark { font-family: Georgia, 'Times New Roman', serif; font-size: 23px; font-weight: 700; letter-spacing: -.015em; line-height: 1; margin-bottom: 8px; color: var(--accent); }
.tdt-company { font-size: 19px; font-weight: 700; letter-spacing: -.01em; }
.tdt-tagline { font-size: 11.5px; color: #6b7280; margin-top: 2px; }
.tdt-contactline { font-size: 10.5px; color: #8b8578; margin-top: 6px; line-height: 1.6; max-width: 46ch; }
.tdt-headright { text-align: right; flex: none; }
.tdt-doctitle { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: .16em; }
.tdt-docno { font-size: 12.5px; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }
.tdt-docdate { font-size: 11px; color: #8b8578; margin-top: 1px; }
.tdt-rule { border: none; border-top: 1.5px solid #14171f; margin: 14px 0 16px; }

/* ---- metadata strip: the facts you scan for, in one row ---- */
.tdt-metastrip { display: flex; gap: 0; border: 1px solid #e3ded2; border-radius: 8px;
  overflow: hidden; margin-bottom: 16px; }
.tdt-meta { flex: 1; padding: 9px 14px; border-right: 1px solid #e3ded2; min-width: 0; }
.tdt-meta:last-child { border-right: none; }
.tdt-meta strong { font-size: 12.5px; font-weight: 600; display: block; overflow: hidden; text-overflow: ellipsis; }

/* ---- party + amount due (money documents) ---- */
.tdt-partyrow { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 18px; }
.tdt-partyname { font-size: 15px; font-weight: 700; }
.tdt-partyline { font-size: 12px; color: #6b7280; }
.tdt-duebox { flex: none; min-width: 200px; text-align: right; border: 1.5px solid var(--accent);
  border-radius: 10px; padding: 11px 15px; }
.tdt-dueamount { font-size: 23px; font-weight: 700; line-height: 1.15; color: var(--accent); font-variant-numeric: tabular-nums; }
.tdt-duemeta { font-size: 11px; color: #6b7280; margin-top: 3px; }
.tdt-duebox-overdue { border-color: #a4262c; } .tdt-duebox-overdue .tdt-dueamount { color: #a4262c; }
.tdt-duebox-paid { border-color: #1a7f42; } .tdt-duebox-paid .tdt-dueamount { color: #1a7f42; }

/* ---- items ---- */
.tdt-items { width: 100%; border-collapse: collapse; }
.tdt-items th { font-size: 9px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
  color: #8b8578; text-align: left; padding: 0 10px 7px; border-bottom: 1.5px solid #14171f; }
.tdt-items td { padding: 9px 10px; border-bottom: 1px solid #efece3; vertical-align: top;
  font-variant-numeric: tabular-nums; }
.tdt-items tr:last-child td { border-bottom: none; }
.tdt-num { text-align: right; }
.tdt-idx { width: 26px; color: #b9b3a6; font-size: 11px; text-align: right; padding-right: 4px; }
.tdt-remarks { width: 30%; }
/* A goods-received note is completed BY HAND at the gate. Ruled space is the
   point of the document, not an empty cell. */
.tdt-checklist .tdt-blank { border-bottom: 1px solid #cfc9ba; }
/* The generic "no rule under the last row" tidy-up removes the writing line
   from the final item, leaving nowhere to record it. On a checklist the rule
   IS the field, so it wins. */
.tdt-checklist tr:last-child .tdt-blank { border-bottom: 1px solid #cfc9ba; }
.tdt-checklist td { height: 26px; }

/* ---- totals ---- */
.tdt-totals { display: flex; justify-content: flex-end; margin-top: 12px; }
.tdt-totals table { border-collapse: separate; border-spacing: 0; min-width: 300px; }
.tdt-totals th { text-align: left; font-weight: 400; padding: 3px 22px 3px 0; font-size: 12.5px; color: #55504a; }
.tdt-totals td { text-align: right; padding: 3px 0; font-size: 12.5px; font-variant-numeric: tabular-nums; }
/* The amount the customer is looking for gets a filled strip, not a plain
   underlined row — the single biggest lift from "generated" to "designed". */
.tdt-spacer td { height: 8px; padding: 0; }
.tdt-totals-due th, .tdt-totals-due td { background: var(--accent); color: #fff; border-top: none; padding: 12px 15px; }
.tdt-totals-due th { border-radius: 10px 0 0 10px; font-weight: 700; font-size: 12.5px; text-align: left; }
.tdt-totals-due td { border-radius: 0 10px 10px 0; font-weight: 800; font-size: 17px; }
.tdt-words { margin-top: 8px; font-size: 11px; color: #6b7280; max-width: 62%; font-style: italic; }
.tdt-notes { margin-top: 14px; font-size: 12px; color: #6b7280; white-space: pre-wrap; }

/* ---- pay to ---- */
.tdt-paybox { margin-top: 18px; border: 1px solid #e3ded2; border-left: 3px solid var(--accent);
  border-radius: 8px; padding: 11px 15px; background: #fbfaf7; }
.tdt-payline { font-size: 13.5px; font-weight: 600; }
.tdt-pay-grid { display: flex; flex-wrap: wrap; gap: 30px; margin-top: 4px; }
.tdt-pay-item span { display: block; font-size: 8.5px; letter-spacing: .08em; text-transform: uppercase; color: #a29b8c; margin-bottom: 1px; }
.tdt-pay-item strong { font-size: 14px; font-weight: 700; color: #14171f; font-variant-numeric: tabular-nums; }
.tdt-paynote { font-size: 11.5px; color: #6b7280; margin-top: 8px; }

/* ---- signatures: who signs, and space to do it ---- */
.tdt-sigblock { display: flex; gap: 26px; margin-top: 34px; }
.tdt-sigblock-3 .tdt-sig { flex: 1; }
.tdt-sig { flex: 0 1 240px; }
.tdt-sig img { height: 38px; display: block; margin-bottom: 4px; mix-blend-mode: multiply; }
.tdt-sigline { border-top: 1px solid #14171f; margin-top: 30px; }
.tdt-signame { font-size: 12.5px; font-weight: 600; margin-top: 5px; }
.tdt-sigtitle { font-size: 11px; color: #6b7280; }
.tdt-sigrole { font-size: 11.5px; font-weight: 700; margin-top: 5px; }
.tdt-sigmeta { font-size: 10.5px; color: #8b8578; margin-top: 1px; }

/* ---- footer strip: who issued this, on every copy ---- */
.tdt-foot { margin-top: 30px; padding-top: 9px; border-top: 1px solid #e5e2d9;
  font-size: 10px; color: #8b8578; text-align: center; line-height: 1.6; }

.tdt-stamp { position: absolute; top: 104px; right: 40px; transform: rotate(-13deg);
  font-size: 38px; font-weight: 800; letter-spacing: .1em; color: rgba(26,127,66,.15);
  border: 5px solid rgba(26,127,66,.15); border-radius: 10px; padding: 3px 16px; pointer-events: none; }
.tdt-stamp-overdue { color: rgba(164,38,44,.15); border-color: rgba(164,38,44,.15); }

/* ===== CLASSIC, formal, serif, double rule =============================== */
.tdt-classic { font-family: Georgia, "Times New Roman", serif; }
.tdt-classic .tdt-doctitle { letter-spacing: .2em; }
.tdt-classic .tdt-rule { border-top: 3px double #14171f; }
.tdt-classic .tdt-metastrip, .tdt-classic .tdt-duebox, .tdt-classic .tdt-paybox { border-radius: 0; }
.tdt-classic .tdt-totals-due th, .tdt-classic .tdt-totals-due td { border-radius: 0; }
.tdt-classic .tdt-items th { border-bottom-width: 2px; }

/* ===== MODERN, accent rail, tight type =================================== */
.tdt-modern .tdt-header { border-left: 3px solid var(--accent); padding-left: 16px; }
.tdt-modern .tdt-doctitle { color: var(--accent); }
.tdt-modern .tdt-rule { border-top: 1px solid #e3ded2; }
.tdt-modern .tdt-metastrip { border: none; background: #f7f5f0; }
.tdt-modern .tdt-meta { border-right-color: #e8e4da; }

/* ===== BOLD, full-width colour band, reversed header ===================== */
.tdt-bold .tdt-band { display: none; }
/* The header carries the colour itself instead of a fixed-height bar sitting
   behind it. A bleeding band has to know the container's padding, which is
   different in the letterhead preview and the print view, and any header
   taller than the bar (a long address, a tagline) hangs out of the bottom of
   it — the email was being cut in half. This grows with its content. */
.tdt-bold .tdt-header { background: var(--accent); color: #fff;
  padding: 20px 22px; border-radius: 10px; margin-bottom: 18px; }
.tdt-bold .tdt-company, .tdt-bold .tdt-doctitle, .tdt-bold .tdt-docno { color: #fff; }
.tdt-bold .tdt-tagline, .tdt-bold .tdt-contactline, .tdt-bold .tdt-docdate { color: rgba(255,255,255,.78); }
.tdt-bold .tdt-rule { display: none; }
.tdt-bold .tdt-metastrip { border: none; background: #f7f5f0; }
.tdt-bold .tdt-items th { border-bottom-color: var(--accent); }

/* ===== MINIMAL, hairlines, air, mono figures ============================= */
.tdt-minimal { font-size: 12.5px; }
.tdt-minimal .tdt-doctitle { font-weight: 400; letter-spacing: .28em; font-size: 13px; }
.tdt-minimal .tdt-company { font-weight: 600; }
.tdt-minimal .tdt-rule { border-top: 1px solid #ded9cd; margin: 18px 0 22px; }
.tdt-minimal .tdt-metastrip { border: none; border-top: 1px solid #ede9df; border-bottom: 1px solid #ede9df; border-radius: 0; }
.tdt-minimal .tdt-meta { border-right: none; padding-left: 0; }
.tdt-minimal .tdt-items th { border-bottom: 1px solid #ded9cd; }
.tdt-minimal .tdt-items td, .tdt-minimal .tdt-docno, .tdt-minimal .tdt-totals td, .tdt-minimal .tdt-dueamount {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.tdt-minimal .tdt-duebox { border-width: 1px; border-radius: 2px; }
.tdt-minimal .tdt-paybox { background: none; border: none; border-top: 1px solid #ede9df; border-radius: 0; padding-left: 0; }

/* ===== CORPORATE, shaded header row, boxed feel ========================== */
.tdt-corporate .tdt-header { background: #f4f2ec; padding: 16px 18px; border-radius: 8px; }
.tdt-corporate .tdt-rule { display: none; }
.tdt-corporate .tdt-metastrip { margin-top: 16px; background: #fff; }
.tdt-corporate .tdt-items thead th { background: #f4f2ec; padding-top: 8px; padding-bottom: 8px;
  border-bottom: 1px solid #ded9cd; }
.tdt-corporate .tdt-items tbody tr:nth-child(even) td { background: #faf9f5; }
.tdt-corporate .tdt-duebox { background: #f4f2ec; border-width: 1px; }

/* ===== ELEGANT, serif italic accents, thin gold rule ===================== */
.tdt-elegant { font-family: "Iowan Old Style", Georgia, serif; }
.tdt-elegant .tdt-doctitle { font-weight: 400; font-style: italic; text-transform: none;
  letter-spacing: .04em; font-size: 22px; }
.tdt-elegant .tdt-rule { border-top: 1px solid #c3a14e; }
.tdt-elegant .tdt-label { color: #a08a5c; letter-spacing: .16em; }
.tdt-elegant .tdt-metastrip { border-color: #ecdfc4; border-radius: 0; }
.tdt-elegant .tdt-meta { border-right-color: #ecdfc4; }
.tdt-elegant .tdt-items th { border-bottom-color: #c3a14e; }
.tdt-elegant .tdt-duebox { border-color: #c3a14e; border-radius: 0; }
.tdt-elegant .tdt-dueamount { color: #14171f; }
.tdt-elegant .tdt-paybox { border-color: #ecdfc4; border-left-color: #c3a14e; background: #fdfbf6; }

/* Ribbon — soft, friendly, modern-SaaS: the header and every panel are rounded
   and washed with a faint tint of the brand accent (color-mix, so it tracks
   whatever colour the tenant picks). Reads warm and approachable, the opposite
   of Bold's solid slab. */
.tdt-ribbon .tdt-header { background: color-mix(in srgb, var(--accent) 8%, #fff); border: 1px solid color-mix(in srgb, var(--accent) 16%, #fff); border-radius: 16px; padding: 20px 22px; }
.tdt-ribbon .tdt-rule { display: none; }
.tdt-ribbon .tdt-wordmark, .tdt-ribbon .tdt-company { color: var(--accent); }
.tdt-ribbon .tdt-doctitle { color: var(--accent); }
.tdt-ribbon .tdt-metastrip { border: none; background: color-mix(in srgb, var(--accent) 6%, #fff); border-radius: 14px; }
.tdt-ribbon .tdt-meta { border-right-color: color-mix(in srgb, var(--accent) 14%, #fff); }
.tdt-ribbon .tdt-duebox { border-radius: 16px; border-color: color-mix(in srgb, var(--accent) 22%, #fff); background: color-mix(in srgb, var(--accent) 6%, #fff); }
.tdt-ribbon .tdt-items thead th { background: color-mix(in srgb, var(--accent) 7%, #fff); }
.tdt-ribbon .tdt-paybox { border-radius: 16px; border-left-width: 1px; border-color: color-mix(in srgb, var(--accent) 20%, #fff); background: color-mix(in srgb, var(--accent) 5%, #fff); }

/* Slate — structured and corporate/legal: a bold accent rail runs down the
   whole left edge, section labels and column heads are set in accent-coloured
   uppercase. Feels formal and organised without going serif. */
.tdt-slate { border-left: 5px solid var(--accent); padding-left: 22px; }
.tdt-slate .tdt-doctitle { color: var(--accent); }
.tdt-slate .tdt-rule { border-top: 2px solid var(--accent); }
.tdt-slate .tdt-label { color: var(--accent); letter-spacing: .14em; }
.tdt-slate .tdt-items thead th { border-bottom: 2px solid var(--accent); text-transform: uppercase; letter-spacing: .05em; font-size: 10px; }
.tdt-slate .tdt-metastrip { border-left: 4px solid var(--accent); border-radius: 0 8px 8px 0; }
.tdt-slate .tdt-duebox { border-left: 4px solid var(--accent); border-radius: 0 8px 8px 0; }
.tdt-slate .tdt-paybox { border-left-width: 4px; border-left-color: var(--accent); }

/* Mono — technical/engineering: everything set in a monospace face with dashed
   hairlines and small uppercase heads, like a well-kept worksheet. Figures line
   up perfectly. Distinct from Minimal, which stays sans and only monospaces the
   numbers. */
.tdt-mono { font-family: "SFMono-Regular", ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace; font-size: 12px; }
.tdt-mono .tdt-wordmark, .tdt-mono .tdt-company { font-family: inherit; letter-spacing: -.02em; }
.tdt-mono .tdt-doctitle { font-weight: 700; letter-spacing: .08em; }
.tdt-mono .tdt-rule { border-top: 1px dashed #b3ada0; }
.tdt-mono .tdt-label { letter-spacing: .1em; }
.tdt-mono .tdt-items thead th { border-bottom: 1px solid #14171f; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; }
.tdt-mono .tdt-metastrip { border-style: dashed; border-radius: 0; }
.tdt-mono .tdt-duebox { border-style: dashed; border-radius: 0; }
.tdt-mono .tdt-paybox { border-style: dashed; border-radius: 0; }
.tdt-mono .tdt-totals-due th, .tdt-mono .tdt-totals-due td { border-radius: 0; }
`;
