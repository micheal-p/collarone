import { useCallback, useEffect, useState } from 'react';
import * as TD from './tradeDocsApi.js';
import { getContacts } from '../crm/crmApi.js';
import { getVendors } from '../procurement/procurementApi.js';
import { getWarehouses, getItems } from '../inventory/inventoryApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';

function Toast({ toast }) { if (!toast) return null; return <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>; }
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
    subtotal: 310000, vat_rate: 0.075, vat_amount: 23250, total: 333250, notes: 'Thank you for your business.',
  },
  receipt: {
    doc_type: 'receipt', doc_no: 'RCT-000045', created_at: new Date().toISOString(), status: 'issued',
    party_name: 'Adaeze Okonkwo', party_phone: '0803 555 1234', party_email: 'adaeze@example.com',
    items: [{ description: 'Consulting session', qty: 2, unit_price: 50000 }],
    subtotal: 100000, vat_rate: 0.075, vat_amount: 7500, total: 107500,
  },
  grn: {
    doc_type: 'grn', doc_no: 'GRN-000012', created_at: new Date().toISOString(),
    party_name: 'Lagos Paper Supplies Ltd', reference: 'PO-1187',
    items: [{ description: 'A4 paper (reams)', qty: 50 }, { description: 'Toner cartridges', qty: 4 }],
  },
  srp: {
    doc_type: 'srp', doc_no: 'SRP-000031', created_at: new Date().toISOString(),
    party_name: 'Warehouse — Ikeja', reference: 'Internal transfer',
    items: [{ description: 'Office chairs', qty: 6 }],
  },
};

function LineItems({ type, items, setItems, stockItems }) {
  const isStock = TD.DOC_TYPES[type]?.isStock;
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
              {!isStock && <th style={{ width: 120 }}>Amount</th>}
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
                {!isStock && <td className="muted" style={{ fontSize: 13 }}>{TD.money((Number(row.qty) || 0) * (Number(row.unit_price) || 0))}</td>}
                <td><button type="button" className="iconbtn" onClick={() => removeRow(i)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-ghost" onClick={addRow}>+ Add line</button>
      {!isStock && <div style={{ marginTop: 8, fontSize: 13, textAlign: 'right' }}>Subtotal: <strong>{TD.money(subtotal)}</strong></div>}
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
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>New {meta.label}</h2></div>
        <form className="modal-body" onSubmit={submit}>
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

          <LineItems type={docType} items={items} setItems={setItems} stockItems={stockItems} />

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
      </div>
    </div>
  );
}

const TEMPLATE_CSS = `
  .tdt-doc { --accent: #0A0E1A; font-family: Georgia, serif; }
  .tdt-band { display: none; }
  .tdt-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 4px; }
  .tdt-logo { max-height: 56px; max-width: 180px; object-fit: contain; margin-bottom: 6px; }
  .tdt-company { font-size: 18px; font-weight: 700; }
  .tdt-tagline { font-size: 12px; font-style: italic; color: #6b7280; margin-top: 2px; }
  .tdt-contactline { font-size: 12px; color: #6b7280; margin: 4px 0 10px; }
  .tdt-doctitle { text-align: right; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  .tdt-docno { font-size: 12px; color: #6b7280; font-family: monospace; margin-top: 2px; }
  .tdt-rule { border: none; border-top: 2px solid #14171f; margin: 10px 0 14px; }
  .tdt-sigblock { display: flex; justify-content: space-between; gap: 24px; margin-top: 32px; }
  .tdt-sig { flex: 1; border-top: 1px solid #14171f; padding-top: 6px; font-size: 12px; }
  .tdt-sig img { height: 40px; display: block; margin-bottom: 4px; mix-blend-mode: multiply; }
  .tdt-signame { font-weight: 600; }
  .tdt-sigtitle { color: #6b7280; font-style: italic; }
  .tdt-sig-blank { color: #6b7280; }

  .tdt-modern { font-family: -apple-system, Segoe UI, Roboto, sans-serif; }
  .tdt-modern .tdt-header { border-left: 4px solid var(--accent); padding-left: 12px; }
  .tdt-modern .tdt-rule { border-top: 1px solid #e2e2e2; }
  .tdt-modern .tdt-doctitle { color: var(--accent); }

  .tdt-bold { font-family: -apple-system, Segoe UI, Roboto, sans-serif; }
  .tdt-bold .tdt-band { display: block; height: 10px; background: var(--accent); margin: -16px -16px 18px; border-radius: 3px 3px 0 0; }
  .tdt-bold .tdt-doctitle { color: var(--accent); font-size: 20px; }
  .tdt-bold .tdt-rule { border-top: 3px solid var(--accent); }

  .tdt-minimal { font-family: -apple-system, Segoe UI, Roboto, sans-serif; }
  .tdt-minimal .tdt-rule { border: none; margin: 6px 0 12px; }
  .tdt-minimal .tdt-doctitle { font-weight: 400; letter-spacing: 0.02em; }
  .tdt-minimal .tdt-docno, .tdt-minimal .table td { font-family: monospace; }

  .tdt-corporate { font-family: -apple-system, Segoe UI, Roboto, sans-serif; }
  .tdt-corporate .table th { background: #f3f4f6; }
  .tdt-corporate .tdt-rule { border-top: 3px double #14171f; }

  .tdt-elegant { font-family: Georgia, serif; }
  .tdt-elegant .tdt-doctitle { font-style: italic; text-transform: none; letter-spacing: 0.02em; }
  .tdt-elegant .tdt-rule { border-top: 1px solid var(--accent); }
  .tdt-elegant .tdt-company { font-style: italic; }
`;

function SettingsModal({ orgId, settings, onClose, onSaved, flash }) {
  const [f, setF] = useState({
    companyName: settings?.company_name || '', address: settings?.address || '', tagline: settings?.tagline || '',
    phone: settings?.phone || '', email: settings?.email || '', logoUrl: settings?.logo_url || '',
    accentColor: settings?.accent_color || '#0A0E1A', signatureName: settings?.signature_name || '',
    signatureTitle: settings?.signature_title || '', signatureUrl: settings?.signature_url || '',
    templateKey: settings?.template_key || 'classic',
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
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()} style={mode === 'preview' ? { maxWidth: 760 } : undefined}>
        <div className="modal-head"><h2>Letterhead settings</h2></div>
        <div className="lv-tabs" style={{ margin: '0 20px' }}>
          <button type="button" className={`lv-tab ${mode === 'edit' ? 'active' : ''}`} onClick={() => setMode('edit')}>Edit</button>
          <button type="button" className={`lv-tab ${mode === 'preview' ? 'active' : ''}`} onClick={() => setMode('preview')}>Preview</button>
        </div>
        <form className="modal-body" onSubmit={submit}>
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
              <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>Sample data — updates live as you edit, nothing here is saved or sent.</p>
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
      </div>
    </div>
  );
}

// Shared by the real print view and the live letterhead preview — same
// markup, same template CSS, just a different doc/settings source.
function DocPreviewBody({ doc, settings }) {
  const meta = TD.DOC_TYPES[doc.doc_type];
  const s = settings || {};
  return (
    <div id="td-print-area" className={`tdt-doc tdt-${s.template_key || 'classic'}`} style={{ '--accent': s.accent_color || '#0A0E1A' }}>
      <div className="tdt-band" />
      <div className="tdt-header">
        <div>
          {s.logo_url && <img className="tdt-logo" src={s.logo_url} alt="" />}
          <div className="tdt-company">{s.company_name || 'Your company'}</div>
          {s.tagline && <div className="tdt-tagline">{s.tagline}</div>}
        </div>
        <div>
          <div className="tdt-doctitle">{meta.label}</div>
          <div className="tdt-docno">{doc.doc_no} · {TD.fmtDate(doc.created_at)}</div>
          {doc.status && <div style={{ marginTop: 6, textAlign: 'right' }}><span className="badge">{TD.STATUS_LABELS[doc.status]}</span></div>}
        </div>
      </div>
      {(s.address || s.phone || s.email) && (
        <div className="tdt-contactline">{[s.address, s.phone, s.email].filter(Boolean).join(' · ')}</div>
      )}
      <hr className="tdt-rule" />

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600 }}>{doc.party_name}</div>
        {doc.party_phone && <div className="muted" style={{ fontSize: 13 }}>{doc.party_phone}</div>}
        {doc.party_email && <div className="muted" style={{ fontSize: 13 }}>{doc.party_email}</div>}
        {doc.party_address && <div className="muted" style={{ fontSize: 13 }}>{doc.party_address}</div>}
        {doc.due_date && <div className="muted" style={{ fontSize: 13 }}>Due {TD.fmtDate(doc.due_date)}</div>}
        {doc.reference && <div className="muted" style={{ fontSize: 13 }}>Ref: {doc.reference}</div>}
      </div>
      <table className="table" style={{ marginBottom: 12 }}>
        <thead><tr><th>Description</th><th style={{ width: 70 }}>Qty</th>{meta.hasVat && <><th style={{ width: 110 }}>Unit price</th><th style={{ width: 110 }}>Amount</th></>}</tr></thead>
        <tbody>
          {(doc.items || []).map((l, i) => (
            <tr key={i}>
              <td>{l.description}</td>
              <td>{l.qty}</td>
              {meta.hasVat && <><td>{TD.money(l.unit_price)}</td><td>{TD.money((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
      {meta.hasVat && (
        <div style={{ textAlign: 'right', fontSize: 14 }}>
          <div>Subtotal: {TD.money(doc.subtotal)}</div>
          <div>VAT ({(doc.vat_rate * 100).toFixed(1)}%): {TD.money(doc.vat_amount)}</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Total: {TD.money(doc.total)}</div>
        </div>
      )}
      {doc.notes && <div className="muted" style={{ fontSize: 13, marginTop: 16 }}>{doc.notes}</div>}

      <div className="tdt-sigblock">
        <div className="tdt-sig">
          {s.signature_url && <img src={s.signature_url} alt="" />}
          <div className="tdt-signame">{s.signature_name || '_________________________'}</div>
          {s.signature_title && <div className="tdt-sigtitle">{s.signature_title}</div>}
        </div>
        {meta.isStock && (
          <div className="tdt-sig tdt-sig-blank">
            <div style={{ height: 40 }} />
            <div>{meta.stockDirection === 'in' ? 'Received by' : 'Released by'} (name &amp; signature)</div>
          </div>
        )}
      </div>
    </div>
  );
}

function PrintView({ doc, settings, onClose }) {
  const meta = TD.DOC_TYPES[doc.doc_type];
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-head no-print"><h2>{meta.label} {doc.doc_no}</h2></div>
        <div className="modal-body">
          <style>{`
            ${TEMPLATE_CSS}
            @media print {
              body * { visibility: hidden; }
              #td-print-area, #td-print-area * { visibility: visible; }
              #td-print-area { position: absolute; top: 0; left: 0; width: 100%; }
              .no-print { display: none !important; }
            }
          `}</style>
          <DocPreviewBody doc={doc} settings={settings} />
        </div>
        <div className="modal-actions no-print">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>
    </div>
  );
}

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
  const [toast, setToast] = useState(null);
  const flash = (msg, isErr = false) => { setToast({ msg, isErr }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([TD.getDocuments(), TD.getSettings()])
      .then(([d, s]) => { setDocs(d); setSettings(s); })
      .catch((e) => flash(e.message, true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = docs.filter((d) => d.doc_type === tab);
  const meta = TD.DOC_TYPES[tab];

  const markStatus = async (doc, status) => {
    try { const saved = await TD.setDocumentStatus(doc.id, status); flash(`Marked ${TD.STATUS_LABELS[status].toLowerCase()}.`); setDocs((ds) => ds.map((d) => (d.id === saved.id ? saved : d))); }
    catch (e) { flash(e.message, true); }
  };

  const remove = async (doc) => {
    if (!confirm(`Delete ${doc.doc_no}? This can't be undone.`)) return;
    try { await TD.deleteDocument(doc.id); flash('Deleted.'); setDocs((ds) => ds.filter((d) => d.id !== doc.id)); }
    catch (e) { flash(e.message, true); }
  };

  return (
    <div className="lv">
      <div className="lv-tabs">
        {Object.entries(TD.DOC_TYPES).map(([k, m]) => (
          <button key={k} className={`lv-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{m.label}</button>
        ))}
        {isManager && <button className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>Letterhead</button>}
        <button className="btn btn-primary lv-apply" onClick={() => setCreateOpen(true)}>New {meta.label}</button>
      </div>

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {!loading && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Doc No.</th><th>Party</th>{meta.hasVat && <th>Total</th>}{meta.hasStatus && <th>Status</th>}<th>Date</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="td-empty">No {meta.label.toLowerCase()}s yet.</td></tr>}
              {rows.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{d.doc_no}</td>
                  <td style={{ fontWeight: 500 }}>{d.party_name || '—'}</td>
                  {meta.hasVat && <td className="muted" style={{ fontSize: 13 }}>{TD.money(d.total)}</td>}
                  {meta.hasStatus && (
                    <td>
                      <select className="select" style={{ fontSize: 12, padding: '2px 6px' }} value={d.status} disabled={!isManager} onChange={(e) => markStatus(d, e.target.value)}>
                        {Object.entries(TD.STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                  )}
                  <td className="muted" style={{ fontSize: 13 }}>{TD.fmtDate(d.created_at)}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="iconbtn" onClick={() => setViewDoc(d)}>View</button>
                    {isManager && <button className="iconbtn" onClick={() => remove(d)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && <CreateModal docType={tab} onClose={() => setCreateOpen(false)} onSaved={(d) => setDocs((ds) => [d, ...ds])} flash={flash} />}
      {settingsOpen && <SettingsModal orgId={orgId} settings={settings} onClose={() => setSettingsOpen(false)} onSaved={setSettings} flash={flash} />}
      {viewDoc && <PrintView doc={viewDoc} settings={settings} onClose={() => setViewDoc(null)} />}
      <Toast toast={toast} />
    </div>
  );
}
