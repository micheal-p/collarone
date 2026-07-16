import { useCallback, useEffect, useState } from 'react';
import * as TD from './tradeDocsApi.js';
import { getContacts } from '../crm/crmApi.js';
import { getVendors } from '../procurement/procurementApi.js';
import { getWarehouses, getItems } from '../inventory/inventoryApi.js';

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

function PrintView({ doc, onClose }) {
  const meta = TD.DOC_TYPES[doc.doc_type];
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-head no-print"><h2>{meta.label} {doc.doc_no}</h2></div>
        <div className="modal-body" id="td-print-area">
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #td-print-area, #td-print-area * { visibility: visible; }
              #td-print-area { position: absolute; top: 0; left: 0; width: 100%; }
              .no-print { display: none !important; }
            }
          `}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{meta.label}</div>
              <div className="muted" style={{ fontSize: 13 }}>{doc.doc_no} · {TD.fmtDate(doc.created_at)}</div>
            </div>
            {doc.status && <span className="badge">{TD.STATUS_LABELS[doc.status]}</span>}
          </div>
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
  const isManager = access?.role === 'manager';
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('invoice');
  const [createOpen, setCreateOpen] = useState(false);
  const [viewDoc, setViewDoc] = useState(null);
  const [toast, setToast] = useState(null);
  const flash = (msg, isErr = false) => { setToast({ msg, isErr }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(() => {
    setLoading(true);
    TD.getDocuments().then(setDocs).catch((e) => flash(e.message, true)).finally(() => setLoading(false));
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
      {viewDoc && <PrintView doc={viewDoc} onClose={() => setViewDoc(null)} />}
      <Toast toast={toast} />
    </div>
  );
}
