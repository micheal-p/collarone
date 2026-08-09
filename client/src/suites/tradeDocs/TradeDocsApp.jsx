import { useCallback, useEffect, useState } from 'react';
import * as TD from './tradeDocsApi.js';
import { getContacts } from '../crm/crmApi.js';
import { getVendors } from '../procurement/procurementApi.js';
import { getWarehouses, getItems } from '../inventory/inventoryApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { EmptyState, Modal, useConfirm, useToast } from '../../components/ui.jsx';
import { amountInWords } from '../../lib/amountInWords.js';
import ProductTour, { tourSeen } from '../../components/ProductTour.jsx';
import PaystackConnect from '../../components/PaystackConnect.jsx';

function Field({ label, children }) { return <div className="field"><label>{label}</label>{children}</div>; }

// Best-effort cross-suite lookups — an org may have Trade Documents without
// CRM/Procurement/Inventory granted, so a failed fetch just means "no picker,
// free-text only" rather than blocking the whole suite.
function useOptional(loader) {
  const [data, setData] = useState([]);
  useEffect(() => { loader().then(setData).catch(() => setData([])); }, [loader]);
  return data;
}

// Fake-but-realistic data so the letterhead preview shows something
// meaningful before a single real document exists — never saved, never sent.
const SAMPLE_DOCS = {
  invoice: {
    doc_type: 'invoice', doc_no: 'INV-000123', created_at: new Date().toISOString(), status: 'issued',
    party_name: 'Adaeze Okonkwo', party_phone: '0803 555 1234', party_email: 'adaeze@example.com', party_address: 'Lekki Phase 1, Lagos',
    due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), reference: 'PO-2201',
    items: [{ description: 'Web design services', qty: 1, unit_price: 250000 }, { description: 'Hosting (1 year)', qty: 1, unit_price: 60000 }],
    subtotal: 310000, vat_rate: 0.075, vat_amount: 23250, total: 333250, amount_paid: 100000, notes: 'Thank you for your business.',
  },
  quote: {
    doc_type: 'quote', doc_no: 'QUO-000018', created_at: new Date().toISOString(), status: 'issued',
    party_name: 'Adaeze Okonkwo', party_phone: '0803 555 1234', party_email: 'adaeze@example.com', party_address: 'Lekki Phase 1, Lagos',
    reference: 'Enquiry, March', items: [{ description: 'Office fit-out (per floor)', qty: 2, unit_price: 450000 }],
    subtotal: 900000, vat_rate: 0.075, vat_amount: 67500, total: 967500, notes: 'Valid for 14 days.',
  },
  receipt: {
    doc_type: 'receipt', doc_no: 'RCT-000045', created_at: new Date().toISOString(), status: 'issued',
    party_name: 'Adaeze Okonkwo', party_phone: '0803 555 1234', party_email: 'adaeze@example.com',
    items: [{ description: 'Consulting session', qty: 2, unit_price: 50000 }],
    subtotal: 100000, vat_rate: 0.075, vat_amount: 7500, total: 107500, amount_paid: 107500,
  },
  grn: {
    doc_type: 'grn', doc_no: 'GRN-000012', created_at: new Date().toISOString(),
    party_name: 'Lagos Paper Supplies Ltd', reference: 'PO-1187',
    items: [{ description: 'A4 paper (reams)', qty: 50 }, { description: 'Toner cartridges', qty: 4 }],
  },
  srp: {
    doc_type: 'srp', doc_no: 'SRP-000031', created_at: new Date().toISOString(),
    party_name: 'Warehouse, Ikeja', reference: 'Internal transfer',
    items: [{ description: 'Office chairs', qty: 6 }],
  },
  handover: {
    doc_type: 'handover', doc_no: 'HOV-000007', created_at: new Date().toISOString(),
    party_name: 'Emeka Obi, Field Technician', reference: 'Takeout',
    items: [{ description: 'Dell Latitude laptop, SN 4432', qty: 1 }, { description: 'Site toolkit', qty: 1 }],
    notes: 'Return expected on project completion.',
  },
  return_note: {
    doc_type: 'return_note', doc_no: 'RTN-000003', created_at: new Date().toISOString(),
    party_name: 'Emeka Obi, Field Technician', reference: 'HOV-000007',
    items: [{ description: 'Dell Latitude laptop, SN 4432', qty: 1 }],
    notes: 'Returned in good condition.',
  },
};

function LineItems({ type, items, setItems, stockItems, vatRate = 0 }) {
  const isStock = TD.DOC_TYPES[type]?.isStock;
  const hasVat = TD.DOC_TYPES[type]?.hasVat;
  const addRow = () => setItems((rows) => [...rows, isStock ? { item_id: '', description: '', qty: 1, unit_price: 0 } : { description: '', qty: 1, unit_price: 0 }]);
  const setRow = (i, patch) => setItems((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i) => setItems((rows) => rows.filter((_, idx) => idx !== i));
  const subtotal = TD.lineTotal(items);

  return (
    <div className="field">
      <label>Line items *</label>
      <div className="table-wrap" style={{ marginBottom: 8 }}>
        <table className="table">
          <thead>
            <tr>
              <th>{isStock ? 'Item' : 'Description'}</th>
              <th style={{ width: 90 }}>Qty</th>
              {!isStock && <th style={{ width: 130 }}>Unit price</th>}
              {!isStock && <th style={{ width: 120 }} className="num">Amount</th>}
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={i}>
                <td>
                  {isStock ? (
                    <select className="select" value={row.item_id} onChange={(e) => {
                      const it = stockItems.find((s) => s.id === e.target.value);
                      setRow(i, { item_id: e.target.value, description: it?.name || '' });
                    }}>
                      <option value="">— free text —</option>
                      {stockItems.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.sku})</option>)}
                    </select>
                  ) : (
                    <input className="input" value={row.description} onChange={(e) => setRow(i, { description: e.target.value })} placeholder="Item / service description" />
                  )}
                  {isStock && !row.item_id && (
                    <input className="input" style={{ marginTop: 4 }} value={row.description} onChange={(e) => setRow(i, { description: e.target.value })} placeholder="Description" />
                  )}
                </td>
                <td><input className="input" type="number" min="0" step="0.01" value={row.qty} onChange={(e) => setRow(i, { qty: e.target.value })} /></td>
                {!isStock && <td><input className="input" type="number" min="0" step="0.01" value={row.unit_price} onChange={(e) => setRow(i, { unit_price: e.target.value })} /></td>}
                {!isStock && <td className="muted num" style={{ fontSize: 13 }}>{TD.money((Number(row.qty) || 0) * (Number(row.unit_price) || 0))}</td>}
                <td><button type="button" className="iconbtn" aria-label="Remove line" onClick={() => removeRow(i)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-ghost" onClick={addRow}>+ Add line</button>
      {/* The number people actually check before sending is the TOTAL, not the
          subtotal. Showing only the subtotal meant doing the VAT in your head,
          or sending it and finding out. aria-live so it's announced as it
          changes rather than being a silent visual update. */}
      {!isStock && (
        <div className="td-livetotals" aria-live="polite">
          <span>Subtotal <strong>{TD.money(subtotal)}</strong></span>
          {hasVat && vatRate > 0 && <span>VAT {(vatRate * 100).toFixed(1)}% <strong>{TD.money(subtotal * vatRate)}</strong></span>}
          <span className="td-livetotal">Total <strong>{TD.money(subtotal * (1 + (hasVat ? Number(vatRate) || 0 : 0)))}</strong></span>
        </div>
      )}
    </div>
  );
}

function CreateModal({ docType, onClose, onSaved, flash }) {
  const meta = TD.DOC_TYPES[docType];
  const contacts = useOptional(getContacts);
  const vendors = useOptional(getVendors);
  const warehouses = useOptional(getWarehouses);
  const stockItems = useOptional(getItems);

  const [f, setF] = useState({
    partyName: '', partyPhone: '', partyEmail: '', partyAddress: '',
    contactId: '', vendorId: '', warehouseId: '', vatRate: meta.hasVat ? 0.075 : 0,
    dueDate: '', reference: '', notes: '', linkStock: false,
  });
  const [items, setItems] = useState(meta.isStock ? [{ item_id: '', description: '', qty: 1, unit_price: 0 }] : [{ description: '', qty: 1, unit_price: 0 }]);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const subtotal = TD.lineTotal(items);
  const vat = meta.hasVat ? subtotal * Number(f.vatRate || 0) : 0;

  const submit = async (e) => {
    e.preventDefault();
    const cleanItems = items.filter((r) => (Number(r.qty) || 0) > 0 && (r.description?.trim() || r.item_id));
    if (!cleanItems.length) return flash('Add at least one line item.', true);
    setBusy(true);
    try {
      const saved = await TD.createDocument({
        docType, partyName: f.partyName, partyPhone: f.partyPhone, partyEmail: f.partyEmail, partyAddress: f.partyAddress,
        contactId: f.contactId || null, vendorId: f.vendorId || null, warehouseId: f.warehouseId || null,
        items: cleanItems.map((r) => ({ item_id: r.item_id || undefined, description: r.description, qty: Number(r.qty), unit_price: Number(r.unit_price) || 0 })),
        vatRate: f.vatRate, dueDate: f.dueDate || null, reference: f.reference, notes: f.notes, linkStock: f.linkStock,
      });
      flash(`${meta.label} ${saved.doc_no} created.`);
      onSaved(saved);
      onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title={`New ${meta.label}`} onClose={onClose} wide>
      <form onSubmit={submit}>
          <div className="form-grid">
            <Field label={docType === 'grn' ? 'Vendor name *' : 'Customer / party name *'}>
              <input className="input" value={f.partyName} onChange={(e) => set('partyName', e.target.value)} required autoFocus />
            </Field>
            <Field label="Phone"><input className="input" value={f.partyPhone} onChange={(e) => set('partyPhone', e.target.value)} /></Field>
            <Field label="Email"><input className="input" value={f.partyEmail} onChange={(e) => set('partyEmail', e.target.value)} /></Field>
            <Field label="Address"><input className="input" value={f.partyAddress} onChange={(e) => set('partyAddress', e.target.value)} /></Field>
            {contacts.length > 0 && !meta.isStock && (
              <Field label="Link to CRM contact">
                <select className="select" value={f.contactId} onChange={(e) => set('contactId', e.target.value)}>
                  <option value="">— none —</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            {vendors.length > 0 && docType === 'grn' && (
              <Field label="Link to vendor">
                <select className="select" value={f.vendorId} onChange={(e) => set('vendorId', e.target.value)}>
                  <option value="">— none —</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </Field>
            )}
            {meta.hasDueDate && (
              <Field label="Due date"><input className="input" type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
            )}
            {meta.isStock && warehouses.length > 0 && (
              <Field label="Warehouse">
                <select className="select" value={f.warehouseId} onChange={(e) => set('warehouseId', e.target.value)}>
                  <option value="">— select —</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Reference"><input className="input" value={f.reference} onChange={(e) => set('reference', e.target.value)} placeholder="PO / order number…" /></Field>
          </div>

          <LineItems type={docType} items={items} setItems={setItems} stockItems={stockItems} vatRate={Number(f.vatRate) || 0} />

          {meta.hasVat && (
            <div className="form-grid">
              <Field label="VAT rate"><input className="input" type="number" step="0.001" value={f.vatRate} onChange={(e) => set('vatRate', e.target.value)} /></Field>
              <Field label="Totals">
                <div style={{ fontSize: 13, padding: '8px 0' }}>
                  Subtotal {TD.money(subtotal)} · VAT {TD.money(vat)} · <strong>Total {TD.money(subtotal + vat)}</strong>
                </div>
              </Field>
            </div>
          )}

          {meta.isStock && f.warehouseId && (
            <Field label="">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 400 }}>
                <input type="checkbox" checked={f.linkStock} onChange={(e) => set('linkStock', e.target.checked)} />
                Also {meta.stockDirection === 'in' ? 'receive this stock in' : 'release this stock out of'} the warehouse (needs Inventory manager access)
              </label>
            </Field>
          )}

          <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></Field>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : `Create ${meta.label}`}</button>
          </div>
      </form>
    </Modal>
  );
}

function PaymentModal({ doc, onClose, onSaved, flash }) {
  const bal = TD.balance(doc);
  const [f, setF] = useState({ amount: bal, payMethod: 'transfer', reference: '', note: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    const amt = Number(f.amount);
    if (!amt || amt <= 0) return flash('Enter the amount received.', true);
    if (amt > bal) return flash(`Only ${TD.money(bal)} is outstanding on this invoice.`, true);
    setBusy(true);
    try {
      const saved = await TD.recordPayment(doc.id, f);
      flash(amt >= bal ? `${doc.doc_no} fully paid.` : `Payment recorded, ${TD.money(TD.balance(saved))} still outstanding.`);
      onSaved(saved); onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Record payment, ${doc.doc_no}`} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Total {TD.money(doc.total)} · paid {TD.money(doc.amount_paid || 0)} · <strong>outstanding {TD.money(bal)}</strong>
        </p>
        <div className="form-grid">
          <Field label="Amount received (₦) *"><input className="input" type="number" min="1" step="0.01" value={f.amount} onChange={(e) => set('amount', e.target.value)} required autoFocus /></Field>
          <Field label="Method">
            <select className="select" value={f.payMethod} onChange={(e) => set('payMethod', e.target.value)}>
              <option value="transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Reference"><input className="input" value={f.reference} onChange={(e) => set('reference', e.target.value)} placeholder="Transfer reference…" /></Field>
        <Field label="Note"><input className="input" value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Record payment'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ShareModal({ doc, orgName, onClose, flash }) {
  const url = TD.publicInvoiceUrl(doc);
  const [emailOn, setEmailOn] = useState(false);
  const [emailing, setEmailing] = useState(false);
  useEffect(() => { TD.emailStatus().then(setEmailOn).catch(() => {}); }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); flash('Link copied.'); }
    catch { flash('Could not copy, long-press the link to copy it.', true); }
  };
  const email = async () => {
    setEmailing(true);
    try { await TD.emailInvoice(doc.id); flash(`Invoice emailed to ${doc.party_email}.`); }
    catch (e) { flash(e.message, true); } finally { setEmailing(false); }
  };
  return (
    <Modal title={`Share ${doc.doc_no}`} onClose={onClose}>
      <p className="muted" style={{ fontSize: 13.5, marginTop: 0 }}>
        Anyone with this link can view the invoice and pay it, by transfer using your instructions, or by card if your Paystack is connected. No account needed.
      </p>
      <div className="field"><label>Invoice link</label>
        <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} style={{ fontFamily: 'monospace', fontSize: 12.5 }} />
      </div>
      <div className="modal-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" onClick={copy}>Copy link</button>
        <a className="btn btn-ghost" href={TD.waShareUrl(doc, orgName)} target="_blank" rel="noreferrer">WhatsApp</a>
        {emailOn && doc.party_email && (
          <button type="button" className="btn btn-primary" disabled={emailing} onClick={email}>{emailing ? 'Sending…' : 'Email invoice'}</button>
        )}
      </div>
    </Modal>
  );
}

const TEMPLATE_CSS = `
/* ===== Trade document templates =========================================
   One skeleton, six looks. The skeleton is what makes a document READABLE
   (a metadata strip you can scan, columns that line up, signature blocks
   that say who signs); the template only changes how it feels.
   ======================================================================== */
.tdt-doc { --accent: #0A0E1A; position: relative; color: #14171f;
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 13px; line-height: 1.5; }
.tdt-doc .table { min-width: 0; }
.tdt-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.tdt-label { display: block; font-size: 9px; font-weight: 700; letter-spacing: .12em;
  text-transform: uppercase; color: #8b8578; margin-bottom: 3px; }

/* ---- header ---- */
.tdt-band { display: none; }
.tdt-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
.tdt-logo { max-height: 54px; max-width: 190px; object-fit: contain; margin-bottom: 8px; display: block; }
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
.tdt-totals table { border-collapse: collapse; min-width: 280px; }
.tdt-totals th { text-align: left; font-weight: 400; padding: 3px 22px 3px 0; font-size: 12.5px; color: #55504a; }
.tdt-totals td { text-align: right; padding: 3px 0; font-size: 12.5px; font-variant-numeric: tabular-nums; }
.tdt-totals-due th, .tdt-totals-due td { font-weight: 700; font-size: 15px; color: #14171f;
  border-top: 1.5px solid #14171f; padding-top: 8px; }
.tdt-words { margin-top: 8px; font-size: 11px; color: #6b7280; max-width: 62%; font-style: italic; }
.tdt-notes { margin-top: 14px; font-size: 12px; color: #6b7280; white-space: pre-wrap; }

/* ---- pay to ---- */
.tdt-paybox { margin-top: 18px; border: 1px solid #e3ded2; border-left: 3px solid var(--accent);
  border-radius: 8px; padding: 11px 15px; background: #fbfaf7; }
.tdt-payline { font-size: 13.5px; font-weight: 600; }
.tdt-paynote { font-size: 11.5px; color: #6b7280; margin-top: 3px; }

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
`;


function SettingsModal({ orgId, settings, onClose, onSaved, flash }) {
  const [f, setF] = useState({
    companyName: settings?.company_name || '', address: settings?.address || '', tagline: settings?.tagline || '',
    phone: settings?.phone || '', email: settings?.email || '', logoUrl: settings?.logo_url || '',
    accentColor: settings?.accent_color || '#0A0E1A', signatureName: settings?.signature_name || '',
    signatureTitle: settings?.signature_title || '', signatureUrl: settings?.signature_url || '',
    templateKey: settings?.template_key || 'classic',
    bankName: settings?.bank_name || '',
    accountName: settings?.account_name || '',
    accountNumber: settings?.account_number || '',
    paymentNote: settings?.payment_note || '',
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState('');
  const [mode, setMode] = useState('edit');
  const [previewType, setPreviewType] = useState('invoice');
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  // Live — reflects whatever's typed/picked right now, not the last saved copy.
  const liveSettings = {
    company_name: f.companyName, address: f.address, tagline: f.tagline, phone: f.phone, email: f.email,
    logo_url: f.logoUrl, accent_color: f.accentColor, signature_name: f.signatureName,
    signature_title: f.signatureTitle, signature_url: f.signatureUrl, template_key: f.templateKey,
    bank_name: f.bankName, account_name: f.accountName, account_number: f.accountNumber, payment_note: f.paymentNote,
  };

  const uploadLogo = async (file) => {
    setUploading('logo');
    try { set('logoUrl', await TD.uploadLogo(orgId, file)); } catch (e) { flash(e.message, true); } finally { setUploading(''); }
  };
  const uploadSig = async (file) => {
    setUploading('sig');
    try { set('signatureUrl', await TD.uploadSignatureImage(orgId, file)); } catch (e) { flash(e.message, true); } finally { setUploading(''); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { const saved = await TD.saveSettings(f); flash('Letterhead saved.'); onSaved(saved); onClose(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title="Letterhead settings" onClose={onClose} wide>
      <div className="lv-tabs" style={{ marginBottom: 12 }}>
        <button type="button" className={`lv-tab ${mode === 'edit' ? 'active' : ''}`} onClick={() => setMode('edit')}>Edit</button>
        <button type="button" className={`lv-tab ${mode === 'preview' ? 'active' : ''}`} onClick={() => setMode('preview')}>Preview</button>
      </div>
      <form onSubmit={submit}>
          {mode === 'edit' ? (
            <>
              <div className="form-grid">
                <Field label="Company name"><input className="input" value={f.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="Shown on every document" /></Field>
                <Field label="Tagline"><input className="input" value={f.tagline} onChange={(e) => set('tagline', e.target.value)} /></Field>
                <Field label="Address"><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
                <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
                <Field label="Email"><input className="input" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
                <Field label="Accent colour"><input className="input" type="color" value={f.accentColor} onChange={(e) => set('accentColor', e.target.value)} style={{ height: 38, padding: 2 }} /></Field>
              </div>

              {/* Without this an invoice never says where to send the money. */}
              <fieldset style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', margin: '4px 0 14px' }}>
                <legend style={{ fontSize: 12.5, fontWeight: 700, padding: '0 6px' }}>How customers pay you</legend>
                <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
                  Printed on every unpaid invoice. Leave blank if you only take card payments through the pay link.
                </p>
                <div className="form-grid">
                  <Field label="Bank"><input className="input" value={f.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="GTBank" /></Field>
                  <Field label="Account name"><input className="input" value={f.accountName} onChange={(e) => set('accountName', e.target.value)} placeholder="Defaults to your company name" /></Field>
                  <Field label="Account number">
                    <input className="input" value={f.accountNumber} inputMode="numeric"
                      onChange={(e) => set('accountNumber', e.target.value.replace(/[^\d\s-]/g, ''))} placeholder="0123456789" />
                  </Field>
                </div>
                <Field label="Payment note">
                  <input className="input" value={f.paymentNote} onChange={(e) => set('paymentNote', e.target.value)}
                    placeholder="e.g. Transfers only, no cash. Or a second account." />
                </Field>
              </fieldset>

              <Field label="Logo">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {f.logoUrl && <img src={f.logoUrl} alt="Logo" style={{ height: 40, objectFit: 'contain' }} />}
                  <input type="file" accept="image/*" disabled={uploading === 'logo'} onChange={(e) => e.target.files[0] && uploadLogo(e.target.files[0])} />
                  {uploading === 'logo' && <span className="spinner" />}
                </div>
              </Field>

              <div className="form-grid">
                <Field label="Signature name"><input className="input" value={f.signatureName} onChange={(e) => set('signatureName', e.target.value)} placeholder="e.g. Aniebiet Pius Nkanta" /></Field>
                <Field label="Signature title"><input className="input" value={f.signatureTitle} onChange={(e) => set('signatureTitle', e.target.value)} placeholder="e.g. Founder" /></Field>
              </div>
              <Field label="Signature image">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {f.signatureUrl && <img src={f.signatureUrl} alt="Signature" style={{ height: 36, mixBlendMode: 'multiply' }} />}
                  <input type="file" accept="image/*" disabled={uploading === 'sig'} onChange={(e) => e.target.files[0] && uploadSig(e.target.files[0])} />
                  {uploading === 'sig' && <span className="spinner" />}
                </div>
              </Field>

              <Field label="Template">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                  {Object.entries(TD.TEMPLATES).map(([k, t]) => (
                    <label key={k} className="card" style={{ padding: 10, cursor: 'pointer', border: f.templateKey === k ? '2px solid var(--brand)' : undefined }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
                        <input type="radio" name="template" checked={f.templateKey === k} onChange={() => set('templateKey', k)} /> {t.name}
                      </div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{t.desc}</div>
                    </label>
                  ))}
                </div>
              </Field>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {Object.entries(TD.DOC_TYPES).map(([k, m]) => (
                  <button key={k} type="button" className={`btn ${previewType === k ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => setPreviewType(k)}>{m.label}</button>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>Sample data, updates live as you edit, nothing here is saved or sent.</p>
              <style>{TEMPLATE_CSS}</style>
              <div style={{ border: '1px solid var(--line, #e4e0d6)', borderRadius: 10, overflow: 'hidden' }}>
                <DocPreviewBody doc={SAMPLE_DOCS[previewType]} settings={liveSettings} />
              </div>
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Save letterhead'}</button>
          </div>
      </form>
    </Modal>
  );
}

// Shared by the real print view and the live letterhead preview — same
// markup, same template CSS, just a different doc/settings source.
function DocPreviewBody({ doc, settings, warehouseName = '' }) {
  const meta = TD.DOC_TYPES[doc.doc_type];
  const s = settings || {};
  const paid = Number(doc.amount_paid) || 0;
  const balance = TD.balance(doc);
  // One rule for what this document says about money, per document type, tested
  // in test/invoice_document_rules.mjs. hasVat is not the question: a quotation
  // and a receipt both carry VAT and neither one asks to be paid.
  const mny = TD.moneyState(doc, meta);
  const settled = mny.settled;
  const overdue = mny.overdue;
  // paperwork that gets checked and signed on delivery
  const isCheck = !!(meta.isStock || meta.isCustody);
  return (
    <div id="td-print-area" className={`tdt-doc tdt-${s.template_key || 'classic'}`} style={{ '--accent': s.accent_color || '#0A0E1A' }}>
      <div className="tdt-band" />
      {mny.stamp && (
        <div className={`tdt-stamp${mny.stamp === 'overdue' ? ' tdt-stamp-overdue' : ''}`} aria-hidden="true">
          {mny.stamp === 'paid' ? 'PAID' : 'OVERDUE'}
        </div>
      )}
      <div className="tdt-header">
        <div className="tdt-headleft">
          {s.logo_url && <img className="tdt-logo" src={s.logo_url} alt="" />}
          <div className="tdt-company">{s.company_name || 'Your company'}</div>
          {s.tagline && <div className="tdt-tagline">{s.tagline}</div>}
          {(s.address || s.phone || s.email) && (
            <div className="tdt-contactline">{[s.address, s.phone, s.email].filter(Boolean).join(' · ')}</div>
          )}
        </div>
        <div className="tdt-headright">
          <div className="tdt-doctitle">{meta.label}</div>
          <div className="tdt-docno">{doc.doc_no}</div>
          <div className="tdt-docdate">{TD.fmtDate(doc.created_at)}</div>
        </div>
      </div>
      <hr className="tdt-rule" />

      {/* Bill-to on the left, what's owed on the right. The amount due is the
          thing the customer is looking for, so it gets the loudest treatment on
          the page rather than being the last line of a totals stack. */}
      {/* Delivery paperwork is scanned for facts, not read: who it came from,
          against which order, into which store, on what date. A strip beats a
          paragraph, and it's the same shape on every one of these notes. */}
      {(meta.isStock || meta.isCustody) && (
        <div className="tdt-metastrip">
          <div className="tdt-meta">
            <span className="tdt-label">{meta.stockDirection === 'in' ? 'Received from' : meta.custodyDirection === 'out' ? 'Issued to' : 'Returned by'}</span>
            <strong>{doc.party_name || '—'}</strong>
          </div>
          {doc.reference && <div className="tdt-meta"><span className="tdt-label">Reference</span><strong>{doc.reference}</strong></div>}
          {warehouseName && <div className="tdt-meta"><span className="tdt-label">Warehouse</span><strong>{warehouseName}</strong></div>}
          <div className="tdt-meta"><span className="tdt-label">Date</span><strong>{TD.fmtDate(doc.created_at)}</strong></div>
        </div>
      )}

      {!(meta.isStock || meta.isCustody) && (
      <div className="tdt-partyrow">
        <div>
          <div className="tdt-label">Bill to</div>
          <div className="tdt-partyname">{doc.party_name}</div>
          {doc.party_address && <div className="tdt-partyline">{doc.party_address}</div>}
          {doc.party_phone && <div className="tdt-partyline">{doc.party_phone}</div>}
          {doc.party_email && <div className="tdt-partyline">{doc.party_email}</div>}
          {doc.reference && <div className="tdt-partyline">Ref: {doc.reference}</div>}
        </div>
        {mny.show && (
          <div className={`tdt-duebox${mny.overdue ? ' tdt-duebox-overdue' : ''}${mny.settled ? ' tdt-duebox-paid' : ''}`}>
            <div className="tdt-label">{mny.label}</div>
            <div className="tdt-dueamount">{TD.money(mny.amount)}</div>
            {mny.settled
              ? <div className="tdt-duemeta">{meta.isReceipt ? 'Received with thanks' : 'Paid in full, thank you'}</div>
              : meta.hasDueDate && doc.due_date
                ? <div className="tdt-duemeta">{mny.overdue ? 'Overdue since' : 'Due'} {TD.fmtDate(doc.due_date)}</div>
                : null}
          </div>
        )}
      </div>
      )}

      {/* A goods note is completed at the gate with a pen: the expected count is
          printed, the received count and any remark are ruled blank space. That
          IS the document — printing only what we already know makes it a
          packing list, not a check. */}
      <table className={`table tdt-items${isCheck ? ' tdt-checklist' : ''}`}>
        <caption className="tdt-visually-hidden">{meta.label} {doc.doc_no} line items</caption>
        <thead>
          <tr>
            <th scope="col" className="tdt-idx">#</th>
            <th scope="col">Description</th>
            <th scope="col" style={{ width: 78 }} className="tdt-num">{isCheck ? 'Expected' : 'Qty'}</th>
            {isCheck && <><th scope="col" style={{ width: 78 }} className="tdt-num">Received</th><th scope="col" className="tdt-remarks">Remarks</th></>}
            {meta.hasVat && <><th scope="col" style={{ width: 110 }} className="tdt-num">Unit price</th><th scope="col" style={{ width: 120 }} className="tdt-num">Amount</th></>}
          </tr>
        </thead>
        <tbody>
          {(doc.items || []).map((l, i) => (
            <tr key={i}>
              <td className="tdt-idx">{i + 1}</td>
              <td>{l.description}</td>
              <td className="tdt-num">{l.qty}</td>
              {isCheck && <><td className="tdt-num tdt-blank" /><td className="tdt-blank" /></>}
              {meta.hasVat && <><td className="tdt-num">{TD.money(l.unit_price)}</td><td className="tdt-num">{TD.money((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}</td></>}
            </tr>
          ))}
        </tbody>
      </table>

      {mny.showTotals && (
        <>
          <div className="tdt-totals">
            <table>
              <tbody>
                <tr><th scope="row">Subtotal</th><td>{TD.money(doc.subtotal)}</td></tr>
                <tr><th scope="row">VAT ({(doc.vat_rate * 100).toFixed(1)}%)</th><td>{TD.money(doc.vat_amount)}</td></tr>
                {/* Only a demand for payment has a balance. A quotation ends at
                    its total, and a receipt has nothing left to owe — printing
                    "Balance due" on either is wrong and, on a quote, misleading. */}
                {meta.demandsPayment ? (
                  <>
                    <tr><th scope="row">Total</th><td>{TD.money(doc.total)}</td></tr>
                    {paid > 0 && <tr><th scope="row">Paid</th><td>&minus;{TD.money(paid)}</td></tr>}
                    <tr className="tdt-totals-due">
                      <th scope="row">{settled ? 'Balance' : 'Balance due'}</th>
                      <td>{TD.money(balance)}</td>
                    </tr>
                  </>
                ) : (
                  <tr className="tdt-totals-due">
                    <th scope="row">{meta.isReceipt ? 'Total paid' : 'Total'}</th>
                    <td>{TD.money(doc.total)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Approvers and banks read the words against the figures, so the
              words must state the figure the document is emphasising, not the
              total. See moneyState(). */}
          <div className="tdt-words">{mny.wordsLabel}: {amountInWords(mny.wordsAmount)}</div>
        </>
      )}

      {doc.notes && <div className="tdt-notes">{doc.notes}</div>}

      {/* An invoice that doesn't say where to pay isn't actionable. */}
      {mny.showPayTo && (s.account_number || s.bank_name || s.payment_note) && (
        <div className="tdt-paybox">
          <div className="tdt-label">Pay to</div>
          <div className="tdt-payline">
            {[s.account_name || s.company_name, s.bank_name, s.account_number].filter(Boolean).join(' · ')}
          </div>
          {s.payment_note && <div className="tdt-paynote">{s.payment_note}</div>}
          {doc.doc_no && <div className="tdt-paynote">Quote <strong>{doc.doc_no}</strong> as your payment reference.</div>}
        </div>
      )}

      {meta.isCustody && doc.meta && (doc.meta.condition || doc.meta.photo_url) && (
        <div style={{ marginTop: 14, border: '1px solid #e5e2d9', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
          <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Return inspection</div>
          {doc.meta.condition && (
            <div>Condition: <strong style={doc.meta.condition === 'damaged' ? { color: '#a4262c' } : {}}>
              {{ optimal: 'Optimal', minor: 'Minor wear', damaged: 'Damaged' }[doc.meta.condition] || doc.meta.condition}
            </strong></div>
          )}
          {doc.meta.issues && <div style={{ marginTop: 3, color: '#555' }}>Issues reported: {doc.meta.issues}</div>}
          {doc.meta.photo_url && <img src={doc.meta.photo_url} alt="Condition on return" style={{ marginTop: 8, maxWidth: 180, borderRadius: 6, display: 'block' }} />}
        </div>
      )}

      {/* Who signs, and room to actually sign. A delivery note with one
          company signature proves nothing — the value is the counter-signature
          from whoever received or checked the goods. */}
      {isCheck ? (
        <div className="tdt-sigblock tdt-sigblock-3">
          <div className="tdt-sig">
            <div className="tdt-sigline" />
            <div className="tdt-sigrole">{meta.stockDirection === 'in' ? 'Delivered by' : 'Released by'}</div>
            <div className="tdt-sigmeta">Name, signature &amp; date</div>
          </div>
          <div className="tdt-sig">
            <div className="tdt-sigline" />
            <div className="tdt-sigrole">
              {meta.custodyDirection === 'out' ? 'Collected by' : meta.custodyDirection === 'in' ? 'Returned by' : 'Received by'}
            </div>
            <div className="tdt-sigmeta">{doc.party_name ? `${doc.party_name}, signature & date` : 'Name, signature & date'}</div>
          </div>
          <div className="tdt-sig">
            <div className="tdt-sigline" />
            <div className="tdt-sigrole">Checked by</div>
            <div className="tdt-sigmeta">{meta.isCustody ? 'Condition on return' : 'Store officer'}</div>
          </div>
        </div>
      ) : (
        <div className="tdt-sigblock">
          <div className="tdt-sig">
            {s.signature_url
              ? <img src={s.signature_url} alt="" />
              : <div className="tdt-sigline" />}
            <div className="tdt-signame">{s.signature_name || ''}</div>
            {s.signature_title && <div className="tdt-sigtitle">{s.signature_title}</div>}
          </div>
        </div>
      )}

      {/* The page used to just stop at the signature. A document that leaves
          the building closes with who issued it, same as the letterheads. */}
      {(s.company_name || s.address || s.phone || s.email) && (
        <div className="tdt-foot">
          {[s.address, s.phone, s.email].filter(Boolean).length > 0 && (
            <>{[s.address, s.phone, s.email].filter(Boolean).join(' · ')}<br /></>
          )}
          {s.company_name || ''}
        </div>
      )}
    </div>
  );
}

function PrintView({ doc, settings, onClose, flash }) {
  const [pdfBusy, setPdfBusy] = useState(false);
  // A real file, named after the document, and filed into Documents on the way
  // past. window.print() only ever offered the browser's own Save-as-PDF, which
  // names the file after the page and can't be attached to anything.
  const downloadPdf = async () => {
    setPdfBusy(true);
    try { await TD.downloadPdf(doc); flash?.('Downloaded, and filed in Documents.'); }
    catch (e) { flash?.(e.message, true); }
    finally { setPdfBusy(false); }
  };
  const meta = TD.DOC_TYPES[doc.doc_type];
  return (
    <Modal title={`${meta.label} ${doc.doc_no}`} onClose={onClose} wide>
      <style>{`
        ${TEMPLATE_CSS}
        @media print {
          /* A4 with real margins. Without @page the browser picks its own and
             the document floats in the middle of the sheet. */
          @page { size: A4; margin: 14mm 12mm; }
          body * { visibility: hidden; }
          #td-print-area, #td-print-area * { visibility: visible; }
          #td-print-area { position: absolute; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }

          /* A long invoice spans pages. Repeat the column headers on each one,
             never split a line item across the fold, and keep the totals, the
             amount in words and the payment details together — a page break
             between "Balance due" and where to pay is a page break in the
             middle of the only two facts that matter. */
          #td-print-area thead { display: table-header-group; }
          #td-print-area tr { page-break-inside: avoid; break-inside: avoid; }
          #td-print-area .tdt-totals,
          #td-print-area .tdt-words,
          #td-print-area .tdt-paybox,
          #td-print-area .tdt-sigblock { page-break-inside: avoid; break-inside: avoid; }
          #td-print-area .tdt-totals { page-break-before: avoid; }
          /* Pin the issuer strip to the bottom of the sheet (it repeats on
             every page), where a document footer belongs — flowing inline it
             sat mid-page under the signature. The padding keeps the last line
             of content from running into it. */
          #td-print-area .tdt-foot { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; }
          #td-print-area { padding-bottom: 44px; }
          /* Backgrounds and the stamp are meaningful here, not decoration. */
          #td-print-area { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <DocPreviewBody doc={doc} settings={settings} />
      <div className="modal-actions no-print">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
        <button type="button" className="btn btn-ghost" onClick={() => window.print()}>Print</button>
        <button type="button" className="btn btn-primary" disabled={pdfBusy} onClick={downloadPdf}>
          {pdfBusy ? 'Preparing…' : 'Download PDF'}
        </button>
      </div>
    </Modal>
  );
}

/* Trade Documents tour. Steps whose target isn't on screen are skipped by
   ProductTour, so a member who can't see the Letterhead button simply never
   hears about it. Copy describes what the suite really does today: no card
   payments until Paystack is connected, no emailing until the mail key is set. */
const TOUR_STEPS = [
  { title: 'Invoicing & Trade Documents',
    body: 'Everything you hand a customer or a supplier, on your own letterhead, numbered automatically so nothing is ever raised twice. A one-minute walkthrough; skip anytime.' },
  { target: '[data-tour="td-tab-invoice"]', title: 'Invoices',
    body: 'Raise an invoice, then share it as a link on WhatsApp. The customer opens it without an account, sees what they owe and how to pay you. Record part-payments against it and the balance follows.' },
  { target: '[data-tour="td-tab-quote"]', title: 'Quotations',
    body: 'Price the job before the work. A quotation shows the total but never asks to be paid, and when the customer says yes you convert it to an invoice in one click, with the items carried over.' },
  { target: '[data-tour="td-tab-receipt"]', title: 'Receipts',
    body: 'Proof that money arrived. Numbered like everything else, so your records and your customer\'s agree.' },
  { target: '[data-tour="td-tab-receivables"]', title: 'Money owed',
    body: 'Everyone who owes you, oldest first, with the total across the top. Open a customer here for a full statement of account you can print or send.' },
  { target: '[data-tour="td-tab-grn"]', title: 'Goods received notes',
    body: 'What arrived from a supplier, signed for. Linked to Inventory when you have it, so stock moves as the paperwork does.' },
  { target: '[data-tour="td-tab-handover"]', title: 'Handover and return notes',
    body: 'Company property changing hands, signed both ways. Raised automatically when Inventory or IT Assets gives something out, and again with a condition check when it comes back.' },
  { target: '[data-tour="td-letterhead"]', title: 'Your letterhead, and your bank details',
    body: 'Logo, address, signature and a choice of six templates. Fill in your bank details here once and they print on every unpaid invoice and on the payment page your customer opens, so nobody has to ring and ask where to send the money.' },
  { target: '[data-tour="td-new"]', title: 'Raise your first one',
    body: 'Pick the customer, add your lines, and the total including VAT updates as you type. Set it to repeat monthly and it re-raises itself as a draft for you to check and send.' },
];

export default function TradeDocsApp({ access }) {
  const { user } = useAuth();
  const orgId = user?.org?.id;
  const isManager = access?.role === 'manager';
  const [docs, setDocs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('invoice');
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewDoc, setViewDoc] = useState(null);
  const [tour, setTour] = useState(false);
  const [payDoc, setPayDoc] = useState(null);
  const [shareDoc, setShareDoc] = useState(null);
  const { flash, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([TD.getDocuments(), TD.getSettings()])
      .then(([d, s]) => { setDocs(d); setSettings(s); })
      .catch((e) => flash(e.message, true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  // First visit per user, replayable from Help via /suite/trade-docs?tour=1.
  // Waits for load so the tabs it points at are actually mounted.
  useEffect(() => {
    if (loading) return undefined;
    const wantsReplay = new URLSearchParams(window.location.search).get('tour') === '1';
    if (wantsReplay || !tourSeen(user?.id, 'tradedocs_v1')) {
      const t = setTimeout(() => setTour(true), 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [loading]); // eslint-disable-line

  const rows = tab === 'receivables'
    ? docs.filter((d) => d.doc_type === 'invoice' && d.status !== 'void' && d.status !== 'draft' && TD.balance(d) > 0)
        .sort((a, b) => (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1)
    : docs.filter((d) => d.doc_type === tab);
  const meta = TD.DOC_TYPES[tab === 'receivables' ? 'invoice' : tab];
  const colCount = 4 + (meta.hasVat ? 1 : 0) + (meta.hasStatus ? 1 : 0);
  const outstandingTotal = docs
    .filter((d) => d.doc_type === 'invoice' && d.status !== 'void' && d.status !== 'draft')
    .reduce((s, d) => s + TD.balance(d), 0);

  const updateDoc = (saved) => setDocs((ds) => ds.map((d) => (d.id === saved.id ? { ...d, ...saved } : d)));

  const markStatus = async (doc, status) => {
    if (status === 'void') {
      const ok = await confirm({ title: 'Void this document?', message: `${doc.doc_no} will be marked void.`, confirmLabel: 'Void', danger: true });
      // force a re-render so the controlled <select> snaps back to the saved status
      if (!ok) { setDocs((ds) => [...ds]); return; }
    }
    try { const saved = await TD.setDocumentStatus(doc.id, status); flash(`Marked ${TD.STATUS_LABELS[status].toLowerCase()}.`); setDocs((ds) => ds.map((d) => (d.id === saved.id ? saved : d))); }
    catch (e) { flash(e.message, true); }
  };

  const setRepeat = async (doc, every) => {
    try {
      const saved = await TD.setRecurring(doc.id, every);
      flash(every ? `${doc.doc_no} now repeats ${every}, a ready-to-send draft is raised each period.` : `${doc.doc_no} no longer repeats.`);
      setDocs((ds) => ds.map((d) => (d.id === saved.id ? saved : d)));
    } catch (e) { flash(e.message, true); setDocs((ds) => [...ds]); }
  };

  const remove = async (doc) => {
    const ok = await confirm({ title: `Delete ${doc.doc_no}?`, message: "This can't be undone.", confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await TD.deleteDocument(doc.id); flash('Deleted.'); setDocs((ds) => ds.filter((d) => d.id !== doc.id)); }
    catch (e) { flash(e.message, true); }
  };

  // Quote accepted → copy it into a fresh invoice (reference points back),
  // retire the quote. Two existing paths, no new machinery.
  const convertQuote = async (q) => {
    const ok = await confirm({ title: `Convert ${q.doc_no} to an invoice?`, message: 'The invoice copies the customer and line items; the quotation is retired with a reference to it.', confirmLabel: 'Convert' });
    if (!ok) return;
    try {
      const inv = await TD.createDocument({
        docType: 'invoice', partyName: q.party_name, partyPhone: q.party_phone,
        partyEmail: q.party_email, partyAddress: q.party_address, contactId: q.contact_id,
        items: q.items, vatRate: Number(q.vat_rate), reference: q.doc_no, notes: q.notes,
      });
      const voided = await TD.setDocumentStatus(q.id, 'void');
      setDocs((ds) => [inv, ...ds.map((d) => (d.id === voided.id ? voided : d))]);
      flash(`${q.doc_no} converted → ${inv.doc_no}.`);
      setTab('invoice');
    } catch (e) { flash(e.message, true); }
  };
  const [statementParty, setStatementParty] = useState(null);

  return (
    <div className="lv trade-docs-app">
      {tour && <ProductTour steps={TOUR_STEPS} userId={user?.id} tourId="tradedocs_v1" onClose={() => setTour(false)} />}

      {/* A real tablist: these look like tabs and behave like tabs, so a screen
          reader should be told that rather than hearing eight unrelated
          buttons. aria-selected is also what makes the current one announce as
          selected, which colour alone never does. */}
      <div className="lv-tabs" role="tablist" aria-label="Document types">
        {Object.entries(TD.DOC_TYPES).map(([k, m]) => (
          <button key={k} role="tab" aria-selected={tab === k} data-tour={`td-tab-${k}`} className={`lv-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{m.label}</button>
        ))}
        <button role="tab" aria-selected={tab === 'receivables'} data-tour="td-tab-receivables" className={`lv-tab ${tab === 'receivables' ? 'active' : ''}`} onClick={() => setTab('receivables')}>
          Money owed{outstandingTotal > 0 ? ` (${TD.money(outstandingTotal)})` : ''}
        </button>
        {isManager && <button data-tour="td-letterhead" className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>Letterhead</button>}
        {tab !== 'receivables' && <button data-tour="td-new" className="btn btn-primary lv-apply" onClick={() => setCreateOpen(true)}>New {meta.label}</button>}
      </div>

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {/* Invoices are where card payments matter, but the connect UI lives in
          Website settings, which an invoicing-only business may never open.
          Nudge here until connected; once ON this renders nothing. */}
      {!loading && (tab === 'invoice' || tab === 'receivables') && (
        <PaystackConnect flash={flash} isAdmin={user?.role === 'super_admin'} nudge />
      )}

      {!loading && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Doc No.</th><th>Party</th>
                {meta.hasVat && <th className="num">Total</th>}
                {(tab === 'invoice' || tab === 'receivables') && <th>Owed</th>}
                {tab === 'receivables' && <th>Due</th>}
                {meta.hasStatus && tab !== 'receivables' && <th>Status</th>}
                <th>Date</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={colCount + 2} style={{ padding: 0 }}>
                  {tab === 'receivables'
                    ? <EmptyState title="Nobody owes you right now" hint="Outstanding invoices, issued but not fully paid, will show here, most overdue first." />
                    : <EmptyState title={`No ${meta.label.toLowerCase()}s yet`} hint={`Create one with the "New ${meta.label}" button above.`} />}
                </td></tr>
              )}
              {rows.map((d) => {
                const bal = TD.balance(d);
                const overdue = TD.isOverdue(d);
                const isInv = d.doc_type === 'invoice';
                return (
                  <tr key={d.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>
                      {d.doc_no}
                      {d.recur_every && (
                        <span title={`Repeats ${d.recur_every}, re-raises itself as a draft each period`} style={{ marginLeft: 5, color: 'var(--brand)', cursor: 'default', display: 'inline-flex', verticalAlign: 'middle' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
                        </span>
                      )}
                      {d.recur_source_id && <span title="Generated automatically from a repeating invoice" style={{ marginLeft: 5, fontSize: 10.5, fontWeight: 700, background: 'var(--brand-100, rgba(255,91,31,0.12))', color: 'var(--brand)', borderRadius: 100, padding: '1px 7px', verticalAlign: 'middle' }}>auto</span>}
                    </td>
                    <td style={{ fontWeight: 500 }}>{d.party_name || '—'}</td>
                    {meta.hasVat && <td className="muted num" style={{ fontSize: 13 }}>{TD.money(d.total)}</td>}
                    {(tab === 'invoice' || tab === 'receivables') && (
                      <td style={{ fontSize: 13, fontWeight: bal > 0 ? 650 : 400, color: bal > 0 ? (overdue ? '#a4262c' : 'inherit') : 'var(--text-2)' }}>
                        {bal > 0 ? TD.money(bal) : '—'}
                      </td>
                    )}
                    {tab === 'receivables' && (
                      <td className="muted" style={{ fontSize: 13, color: overdue ? '#a4262c' : undefined, fontWeight: overdue ? 650 : 400 }}>
                        {d.due_date ? `${TD.fmtDate(d.due_date)}${overdue ? ' · overdue' : ''}` : '—'}
                      </td>
                    )}
                    {meta.hasStatus && tab !== 'receivables' && (
                      <td>
                        <select className="select" style={{ fontSize: 12, padding: '2px 6px' }} value={d.status} disabled={!isManager} onChange={(e) => markStatus(d, e.target.value)}>
                          {Object.entries(TD.STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                    )}
                    <td className="muted" style={{ fontSize: 13 }}>{TD.fmtDate(d.created_at)}</td>
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="iconbtn" onClick={() => setViewDoc(d)}>View</button>
                      {isInv && d.status !== 'void' && d.status !== 'draft' && bal > 0 && (
                        <button className="iconbtn" onClick={() => setPayDoc(d)}>Record payment</button>
                      )}
                      {isInv && d.status !== 'void' && d.status !== 'draft' && d.share_token && (
                        <button className="iconbtn" onClick={() => setShareDoc(d)}>Share</button>
                      )}
                      {d.doc_type === 'quote' && isManager && d.status !== 'void' && (
                        <button className="iconbtn" onClick={() => convertQuote(d)}>→ Invoice</button>
                      )}
                      {tab === 'receivables' && d.party_name && (
                        <button className="iconbtn" onClick={() => setStatementParty(d.party_name)}>Statement</button>
                      )}
                      {isInv && isManager && d.status !== 'void' && !d.recur_source_id && tab !== 'receivables' && (
                        <select className="select" title="Repeat this invoice automatically" style={{ fontSize: 12, padding: '2px 6px' }}
                          value={d.recur_every || ''} onChange={(e) => setRepeat(d, e.target.value || null)}>
                          <option value="">No repeat</option>
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      )}
                      {isManager && tab !== 'receivables' && <button className="iconbtn" onClick={() => remove(d)}>Delete</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && <CreateModal docType={tab === 'receivables' ? 'invoice' : tab} onClose={() => setCreateOpen(false)} onSaved={(d) => setDocs((ds) => [d, ...ds])} flash={flash} />}
      {settingsOpen && <SettingsModal orgId={orgId} settings={settings} onClose={() => setSettingsOpen(false)} onSaved={setSettings} flash={flash} />}
      {viewDoc && <PrintView doc={viewDoc} settings={settings} flash={flash} onClose={() => setViewDoc(null)} />}
      {statementParty && <StatementModal party={statementParty} docs={docs} orgName={settings?.company_name || user?.org?.name} onClose={() => setStatementParty(null)} />}
      {payDoc && <PaymentModal doc={payDoc} onClose={() => setPayDoc(null)} onSaved={updateDoc} flash={flash} />}
      {shareDoc && <ShareModal doc={shareDoc} orgName={settings?.company_name || user?.org?.name} onClose={() => setShareDoc(null)} flash={flash} />}
      {toastNode}
      {confirmNode}
    </div>
  );
}

/* ---- StatementModal: one customer's full account, printable --------------- */
// "How much does Acme owe us across everything?" — every non-void invoice for
// the party, paid vs outstanding, one total, printable for sending.
function StatementModal({ party, docs, orgName, onClose }) {
  const rows = docs.filter((d) => d.doc_type === 'invoice' && d.status !== 'void' && d.party_name === party)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const paidOf = (d) => Number(d.amount_paid || 0);
  const balOf = (d) => Math.max(0, Number(d.total) - paidOf(d));
  const totals = rows.reduce((t, d) => ({ inv: t.inv + Number(d.total), paid: t.paid + paidOf(d), bal: t.bal + balOf(d) }), { inv: 0, paid: 0, bal: 0 });
  const line = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid #eee', fontSize: 13 };
  return (
    <Modal title={`Statement, ${party}`} onClose={onClose} wide>
      <style>{`@media print { body * { visibility: hidden; } #stmt-print, #stmt-print * { visibility: visible; } #stmt-print { position: absolute; top: 0; left: 0; width: 100%; } .no-print { display: none !important; } }`}</style>
      <div id="stmt-print" style={{ background: '#fff', color: '#14161a', padding: '6px 4px' }}>
        <div style={{ borderBottom: '2px solid #14161a', paddingBottom: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{orgName || 'Statement of account'}</div>
          <div style={{ fontSize: 12.5, color: '#667' }}>Statement of account, {party} · as at {new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        {rows.map((d) => (
          <div key={d.id} style={line}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{d.doc_no}</span>
            <span style={{ flex: 1, color: '#667', fontSize: 12 }}>{TD.fmtDate(d.created_at)}{d.due_date ? ` · due ${TD.fmtDate(d.due_date)}` : ''}</span>
            <span>{TD.money(d.total)}</span>
            <span style={{ color: '#1a6a1a' }}>{paidOf(d) > 0 ? `paid ${TD.money(paidOf(d))}` : ''}</span>
            <span style={{ fontWeight: 700, color: balOf(d) > 0 ? '#a4262c' : '#1a6a1a', minWidth: 90, textAlign: 'right' }}>
              {balOf(d) > 0 ? TD.money(balOf(d)) : 'settled'}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, padding: '12px 14px', background: '#f6f4ee', borderRadius: 10, fontSize: 14, fontWeight: 800 }}>
          <span>Outstanding balance</span><span>{TD.money(totals.bal)}</span>
        </div>
        <p style={{ fontSize: 11, color: '#99a', marginTop: 10 }}>
          {rows.length} invoice{rows.length === 1 ? '' : 's'} totalling {TD.money(totals.inv)} · {TD.money(totals.paid)} received.
        </p>
      </div>
      <div className="modal-actions no-print">
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>
    </Modal>
  );
}
