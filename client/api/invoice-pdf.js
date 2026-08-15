// The invoice as a downloadable PDF, and the same bytes filed into Documents.
//
// Two jobs, one generator, so the file a customer receives and the file kept on
// record are byte-identical:
//   POST { docId }              -> streams the PDF back for download
//   POST { docId, file: true }  -> also stores it in Documents, under Invoices
//
// Filing is idempotent: the storage path is derived from the document number,
// and the documents row is matched on that path, so re-running after a payment
// is recorded replaces the file and bumps the version instead of littering the
// folder with copies.
import { createClient } from '@supabase/supabase-js';
import { renderInvoicePdf, invoiceFilename } from './_lib/invoicePdf.js';
import { buildInvoiceHtml } from './_lib/invoiceHtml.js';
import { htmlToPdf } from './_lib/htmlToPdf.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'org-documents';
const FOLDER_NAME = 'Invoices';

const json = (res, s, o) => res.status(s).json(o);

// The downloaded/filed/emailed PDF is the REAL letterhead template (all six
// designs, accent colour, orientation), rendered from HTML by headless
// Chromium so it matches the on-screen preview exactly. If Chromium is
// unavailable or the render errors, fall back to the always-present PDFKit
// renderer — a download must never fail over the styled path.
async function renderDocPdf({ doc, settings }) {
  const s = settings || {};
  try {
    const html = buildInvoiceHtml({ doc, settings: s });
    return await htmlToPdf(html, { landscape: s.orientation === 'landscape' });
  } catch (e) {
    console.error('[invoice-pdf] template render failed, using PDFKit fallback:', e.message);
    return renderInvoicePdf({ doc, settings: s, meta: DOC_META[doc.doc_type] || {} });
  }
}

// Mirrors DOC_TYPES in client/src/suites/tradeDocs/tradeDocsApi.js. A
// serverless function can't import the suite module (it reaches for the browser
// API client), and these flags decide what the document SAYS about money, so
// they have to be right. Kept next to each other for review.
const DOC_META = {
  invoice: { hasVat: true, hasDueDate: true, demandsPayment: true },
  quote: { hasVat: true },
  receipt: { hasVat: true, isReceipt: true },
  grn: { hasVat: false, isStock: true },
  srp: { hasVat: false, isStock: true },
  handover: { hasVat: false, isCustody: true },
  return_note: { hasVat: false, isCustody: true },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  if (!SERVICE_KEY) return json(res, 500, { message: 'Server not configured.' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(res, 401, { message: 'Authentication required.' });
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json(res, 401, { message: 'Invalid session.' });
  const { data: caller } = await admin.from('profiles').select('id, org_id, role, suites').eq('id', user.id).single();
  if (!caller) return json(res, 403, { message: 'No profile.' });

  const { data: doc } = await admin.from('trade_documents').select('*').eq('id', String(body.docId || '')).maybeSingle();
  if (!doc) return json(res, 404, { message: 'Document not found.' });
  // Service role bypasses RLS, so the org check has to be explicit here.
  if (doc.org_id !== caller.org_id) return json(res, 403, { message: 'Not your organization.' });
  const hasTd = caller.role === 'super_admin' || (Array.isArray(caller.suites) && caller.suites.some((s) => s.key === 'trade-docs'));
  if (!hasTd) return json(res, 403, { message: 'Invoicing access required.' });

  const { data: settings } = await admin.from('trade_doc_settings').select('*').eq('org_id', doc.org_id).maybeSingle();

  let pdf;
  try {
    pdf = await renderDocPdf({ doc, settings });
  } catch (e) {
    return json(res, 500, { message: `Could not build the PDF: ${e.message}` });
  }

  if (body.file) {
    try {
      await fileIntoDocuments({ admin, doc, pdf, callerId: caller.id });
    } catch (e) {
      // Filing is a bonus; never fail the download because the copy didn't save.
      if (body.fileOnly) return json(res, 500, { message: `Could not file the invoice: ${e.message}` });
    }
  }
  if (body.fileOnly) return json(res, 200, { filed: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoiceFilename(doc)}"`);
  res.setHeader('Content-Length', String(pdf.length));
  return res.status(200).send(pdf);
}

// Exported so notify.js can attach the same bytes without a second render.
export async function buildInvoicePdf(admin, doc) {
  const { data: settings } = await admin.from('trade_doc_settings').select('*').eq('org_id', doc.org_id).maybeSingle();
  return renderDocPdf({ doc, settings });
}

export async function fileIntoDocuments({ admin, doc, pdf, callerId }) {
  // The folder is created once per org, on demand — an empty "Invoices" folder
  // in every workspace that never raises one is clutter.
  let { data: folder } = await admin.from('doc_folders')
    .select('id').eq('org_id', doc.org_id).eq('name', FOLDER_NAME).is('parent_folder_id', null).maybeSingle();
  if (!folder) {
    const { data: made, error } = await admin.from('doc_folders')
      .insert({ org_id: doc.org_id, name: FOLDER_NAME, created_by: callerId }).select('id').single();
    if (error) throw new Error(error.message);
    folder = made;
  }

  const path = `${doc.org_id}/invoices/${invoiceFilename(doc)}`;
  const { error: upErr } = await admin.storage.from(BUCKET)
    .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(upErr.message);

  const { data: existing } = await admin.from('documents')
    .select('id, current_version').eq('org_id', doc.org_id).eq('file_path', path).maybeSingle();

  if (existing) {
    // Same invoice re-filed (a payment was recorded, say). Bump the version so
    // the history shows it changed rather than pretending it never did.
    await admin.from('documents').update({
      file_size: pdf.length, current_version: (existing.current_version || 1) + 1, updated_at: new Date().toISOString(),
    }).eq('id', existing.id);
    await admin.from('document_versions').insert({
      document_id: existing.id, version: (existing.current_version || 1) + 1,
      file_path: path, file_size: pdf.length, uploaded_by: callerId,
    }).then(() => {}, () => {});   // history is best-effort
    return existing.id;
  }

  // RESTRICTED, not org-wide. `visibility` defaults to 'org', so every invoice
  // filed automatically became readable by everyone in the company — customer
  // names, what they were charged, and what they still owe, visible to any
  // employee who opened Documents. Nobody chose that; it was the default
  // winning because this insert never set the field.
  const { data: made, error } = await admin.from('documents').insert({
    org_id: doc.org_id, folder_id: folder.id, name: invoiceFilename(doc),
    file_path: path, file_size: pdf.length, created_by: callerId,
    visibility: 'restricted',
  }).select('id').single();
  if (error) throw new Error(error.message);

  // A restricted document with no grants is readable by nobody but a documents
  // manager, so the person who filed it would lose their own invoice.
  if (callerId) {
    await admin.from('document_permissions').insert({
      org_id: doc.org_id, document_id: made.id, user_id: callerId, granted_by: callerId,
    }).then(() => {}, () => {});
  }
  return made.id;
}
