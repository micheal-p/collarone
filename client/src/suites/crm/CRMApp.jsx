import { useCallback, useEffect, useMemo, useState } from 'react';
import * as C from './crmApi.js';

/* ---- icons ---------------------------------------------------------------- */
const I = {
  add:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  search: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>,
  close:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  chev:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>,
  trash:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>,
  log:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h5"/></svg>,
};

const CSS = `
  .crm-badge { display:inline-block; padding:2px 9px; border-radius:10px; font-size:11px; font-weight:700; letter-spacing:.03em; }
  .crm-t-call     { background:#deecfd; color:#194b8f; }
  .crm-t-wa       { background:#dff6dd; color:#1a6a1a; }
  .crm-t-email    { background:#f0e6ff; color:#5a2ca0; }
  .crm-t-meet     { background:#fff4ce; color:#7a5200; }
  .crm-t-note     { background:#f3f2f1; color:#605e5c; }

  .crm-expand-row td { padding:0 16px 16px !important; background:var(--surface); }
  .crm-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; font-size:13px; margin:10px 0 16px; }
  .crm-label { color:var(--text-2); font-size:12px; margin-right:4px; }
  .crm-activity-item { display:flex; gap:10px; padding:10px 0; border-top:1px solid var(--line); }
  .crm-activity-item:first-child { border-top:none; }
  .crm-activity-meta { font-size:12px; color:var(--text-2); margin-top:2px; }
  .crm-activity-empty { font-size:13px; color:var(--text-2); padding:10px 0; }
`;

/* ---- shared bits ------------------------------------------------------------ */
function Field({ label, children }) { return <div className="field"><label>{label}</label>{children}</div>; }

function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>;
}

function ActivityBadge({ type }) {
  const t = C.ACTIVITY_TYPES[type] || C.ACTIVITY_TYPES.note;
  return <span className={`crm-badge ${t.cls}`}>{t.label}</span>;
}

function ActivityList({ activities, onDelete }) {
  if (!activities?.length) return <div className="crm-activity-empty">No activity logged yet.</div>;
  return (
    <div>
      {activities.map((a) => (
        <div className="crm-activity-item" key={a.id}>
          <ActivityBadge type={a.type} />
          <div style={{ flex: 1 }}>
            <div>{a.notes || <span className="muted">No notes</span>}</div>
            <div className="crm-activity-meta">{C.fmtDt(a.occurred_at)} &bull; logged by {a.author?.name || '—'}</div>
          </div>
          <button className="iconbtn" aria-label="Delete" onClick={() => onDelete(a.id)}>{I.trash}</button>
        </div>
      ))}
    </div>
  );
}

/* ---- LogActivityModal ------------------------------------------------------ */
function LogActivityModal({ contact, company, onClose, onSaved, flash }) {
  const [type, setType] = useState('call');
  const [notes, setNotes] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const activity = await C.createActivity({
        contactId: contact?.id || null, companyId: company?.id || null,
        type, notes, occurredAt: new Date(occurredAt).toISOString(),
      });
      flash('Activity logged.');
      onSaved(activity);
      onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Log activity — {contact?.name || company?.name}</h2>
          <button className="iconbtn dark" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <Field label="Type">
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(C.ACTIVITY_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="When">
            <input className="input" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </Field>
          <Field label="Notes">
            <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} autoFocus />
          </Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Log activity'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---- CompanyModal ----------------------------------------------------------- */
function CompanyModal({ company, onClose, onSaved, flash }) {
  const [f, setF] = useState(() => company
    ? { name: company.name, industry: company.industry, phone: company.phone, email: company.email, website: company.website, address: company.address, notes: company.notes }
    : { name: '', industry: '', phone: '', email: '', website: '', address: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return flash('Company name is required.', true);
    setBusy(true);
    try {
      const saved = company ? await C.updateCompany(company.id, f) : await C.createCompany(f);
      flash(company ? 'Company updated.' : 'Company added.');
      onSaved(saved);
      onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{company ? 'Edit company' : 'Add company'}</h2>
          <button className="iconbtn dark" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="form-grid">
            <Field label="Company name *"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></Field>
            <Field label="Industry"><input className="input" value={f.industry} onChange={(e) => set('industry', e.target.value)} /></Field>
            <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Website"><input className="input" value={f.website} onChange={(e) => set('website', e.target.value)} /></Field>
            <Field label="Address"><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
          </div>
          <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : company ? 'Save changes' : 'Add company'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---- ContactModal ------------------------------------------------------------ */
function ContactModal({ contact, companies, onClose, onSaved, flash }) {
  const [f, setF] = useState(() => contact
    ? { name: contact.name, companyId: contact.company_id || '', jobTitle: contact.job_title, email: contact.email, phone: contact.phone, whatsapp: contact.whatsapp, notes: contact.notes }
    : { name: '', companyId: '', jobTitle: '', email: '', phone: '', whatsapp: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return flash('Contact name is required.', true);
    setBusy(true);
    try {
      const payload = { ...f, companyId: f.companyId || null };
      const saved = contact ? await C.updateContact(contact.id, payload) : await C.createContact(payload);
      flash(contact ? 'Contact updated.' : 'Contact added.');
      onSaved(saved);
      onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{contact ? 'Edit contact' : 'Add contact'}</h2>
          <button className="iconbtn dark" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="form-grid">
            <Field label="Full name *"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></Field>
            <Field label="Company">
              <select className="select" value={f.companyId} onChange={(e) => set('companyId', e.target.value)}>
                <option value="">— No company —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Job title"><input className="input" value={f.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} /></Field>
            <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="WhatsApp"><input className="input" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="+234..." /></Field>
          </div>
          <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : contact ? 'Save changes' : 'Add contact'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---- CompaniesTab ------------------------------------------------------------ */
function CompaniesTab({ flash }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null); // null | 'new' | company
  const [expand, setExpand] = useState(null);
  const [activities, setActivities] = useState({});
  const [logFor, setLogFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCompanies(await C.getCompanies()); } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => {
    if (!q.trim()) return companies;
    const rx = new RegExp(q.trim(), 'i');
    return companies.filter((c) => rx.test(c.name) || rx.test(c.industry || ''));
  }, [companies, q]);

  const toggleExpand = async (c) => {
    if (expand === c.id) { setExpand(null); return; }
    setExpand(c.id);
    if (!activities[c.id]) {
      try { const a = await C.getActivities(`companyId=${c.id}`); setActivities((s) => ({ ...s, [c.id]: a })); } catch { /* noop */ }
    }
  };

  const removeCompany = async (c) => {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    try { await C.deleteCompany(c.id); flash('Company deleted.'); load(); } catch (e) { flash(e.message, true); }
  };

  const removeActivity = async (companyId, activityId) => {
    try {
      await C.deleteActivity(activityId);
      setActivities((s) => ({ ...s, [companyId]: s[companyId].filter((a) => a.id !== activityId) }));
    } catch (e) { flash(e.message, true); }
  };

  return (
    <>
      <div className="filterbar" style={{ marginTop: 8 }}>
        <div className="cmd-search">
          {I.search}
          <input placeholder="Search companies" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, marginLeft: 6, width: 200 }} />
        </div>
        <span className="count">{view.length} compan{view.length === 1 ? 'y' : 'ies'}</span>
        <button className="btn btn-primary lv-apply" onClick={() => setModal('new')}><span style={{ marginRight: 6 }}>{I.add}</span>Add company</button>
      </div>

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {!loading && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Company</th><th>Industry</th><th>Phone</th><th>Email</th><th></th></tr></thead>
            <tbody>
              {view.length === 0 && <tr><td colSpan={5} className="td-empty">No companies yet.</td></tr>}
              {view.map((c) => (
                <>
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{c.industry || '—'}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{c.phone || '—'}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{c.email || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="iconbtn" aria-label="Log activity" onClick={() => setLogFor(c)}>{I.log}</button>
                      <button className="iconbtn" aria-label="Edit" onClick={() => setModal(c)}>Edit</button>
                      <button className="iconbtn" aria-label="Delete" onClick={() => removeCompany(c)}>{I.trash}</button>
                      <button className="iconbtn" aria-label="Details" onClick={() => toggleExpand(c)}>{I.chev}</button>
                    </td>
                  </tr>
                  {expand === c.id && (
                    <tr className="crm-expand-row" key={`${c.id}-exp`}>
                      <td colSpan={5}>
                        <div className="crm-detail-grid">
                          <div><span className="crm-label">Website</span>{c.website || '—'}</div>
                          <div><span className="crm-label">Address</span>{c.address || '—'}</div>
                        </div>
                        {c.notes && <p style={{ fontSize: 13, margin: '0 0 12px' }}>{c.notes}</p>}
                        <h4 style={{ fontSize: 13, margin: '0 0 4px' }}>Activity</h4>
                        <ActivityList activities={activities[c.id]} onDelete={(id) => removeActivity(c.id, id)} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(modal === 'new' || (modal && modal !== 'new')) && (
        <CompanyModal company={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={load} flash={flash} />
      )}
      {logFor && (
        <LogActivityModal company={logFor} onClose={() => setLogFor(null)} flash={flash}
          onSaved={(a) => setActivities((s) => ({ ...s, [logFor.id]: [a, ...(s[logFor.id] || [])] }))} />
      )}
    </>
  );
}

/* ---- ContactsTab -------------------------------------------------------------- */
function ContactsTab({ flash }) {
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [expand, setExpand] = useState(null);
  const [activities, setActivities] = useState({});
  const [logFor, setLogFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ct, co] = await Promise.all([C.getContacts(), C.getCompanies()]);
      setContacts(ct); setCompanies(co);
    } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => {
    if (!q.trim()) return contacts;
    const rx = new RegExp(q.trim(), 'i');
    return contacts.filter((c) => rx.test(c.name) || rx.test(c.company?.name || '') || rx.test(c.job_title || ''));
  }, [contacts, q]);

  const toggleExpand = async (c) => {
    if (expand === c.id) { setExpand(null); return; }
    setExpand(c.id);
    if (!activities[c.id]) {
      try { const a = await C.getActivities(`contactId=${c.id}`); setActivities((s) => ({ ...s, [c.id]: a })); } catch { /* noop */ }
    }
  };

  const removeContact = async (c) => {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    try { await C.deleteContact(c.id); flash('Contact deleted.'); load(); } catch (e) { flash(e.message, true); }
  };

  const removeActivity = async (contactId, activityId) => {
    try {
      await C.deleteActivity(activityId);
      setActivities((s) => ({ ...s, [contactId]: s[contactId].filter((a) => a.id !== activityId) }));
    } catch (e) { flash(e.message, true); }
  };

  return (
    <>
      <div className="filterbar" style={{ marginTop: 8 }}>
        <div className="cmd-search">
          {I.search}
          <input placeholder="Search contacts" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, marginLeft: 6, width: 200 }} />
        </div>
        <span className="count">{view.length} contact{view.length === 1 ? '' : 's'}</span>
        <button className="btn btn-primary lv-apply" onClick={() => setModal('new')}><span style={{ marginRight: 6 }}>{I.add}</span>Add contact</button>
      </div>

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {!loading && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Company</th><th>Job title</th><th>Phone</th><th>WhatsApp</th><th></th></tr></thead>
            <tbody>
              {view.length === 0 && <tr><td colSpan={6} className="td-empty">No contacts yet.</td></tr>}
              {view.map((c) => (
                <>
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{c.company?.name || '—'}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{c.job_title || '—'}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{c.phone || '—'}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{c.whatsapp || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="iconbtn" aria-label="Log activity" onClick={() => setLogFor(c)}>{I.log}</button>
                      <button className="iconbtn" aria-label="Edit" onClick={() => setModal(c)}>Edit</button>
                      <button className="iconbtn" aria-label="Delete" onClick={() => removeContact(c)}>{I.trash}</button>
                      <button className="iconbtn" aria-label="Details" onClick={() => toggleExpand(c)}>{I.chev}</button>
                    </td>
                  </tr>
                  {expand === c.id && (
                    <tr className="crm-expand-row" key={`${c.id}-exp`}>
                      <td colSpan={6}>
                        <div className="crm-detail-grid">
                          <div><span className="crm-label">Email</span>{c.email || '—'}</div>
                        </div>
                        {c.notes && <p style={{ fontSize: 13, margin: '0 0 12px' }}>{c.notes}</p>}
                        <h4 style={{ fontSize: 13, margin: '0 0 4px' }}>Activity</h4>
                        <ActivityList activities={activities[c.id]} onDelete={(id) => removeActivity(c.id, id)} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(modal === 'new' || (modal && modal !== 'new')) && (
        <ContactModal contact={modal === 'new' ? null : modal} companies={companies} onClose={() => setModal(null)} onSaved={load} flash={flash} />
      )}
      {logFor && (
        <LogActivityModal contact={logFor} onClose={() => setLogFor(null)} flash={flash}
          onSaved={(a) => setActivities((s) => ({ ...s, [logFor.id]: [a, ...(s[logFor.id] || [])] }))} />
      )}
    </>
  );
}

/* ---- ActivityTab -------------------------------------------------------------- */
function ActivityTab({ flash }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setActivities(await C.getActivities()); } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const removeActivity = async (id) => {
    try { await C.deleteActivity(id); setActivities((s) => s.filter((a) => a.id !== id)); } catch (e) { flash(e.message, true); }
  };

  return (
    <>
      <div className="filterbar" style={{ marginTop: 8 }}>
        <span className="count">{activities.length} activit{activities.length === 1 ? 'y' : 'ies'} logged</span>
      </div>
      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}
      {!loading && (
        <div style={{ maxWidth: 720 }}>
          {activities.length === 0 && <div className="crm-activity-empty">No activity logged yet — log calls, WhatsApp messages, emails, meetings and notes from a contact or company's row.</div>}
          {activities.map((a) => (
            <div className="crm-activity-item" key={a.id}>
              <ActivityBadge type={a.type} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{a.contact?.name || a.company?.name}</div>
                <div>{a.notes || <span className="muted">No notes</span>}</div>
                <div className="crm-activity-meta">{C.fmtDt(a.occurred_at)} &bull; logged by {a.author?.name || '—'}</div>
              </div>
              <button className="iconbtn" aria-label="Delete" onClick={() => removeActivity(a.id)}>{I.trash}</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* =========================================================================
   Main CRMApp
   ========================================================================= */
export default function CRMApp() {
  const [tab, setTab] = useState('companies');
  const [toast, setToast] = useState(null);
  const flash = useCallback((msg, isErr = false) => {
    setToast({ msg, isErr });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const TABS = [
    { key: 'companies',  label: 'Companies' },
    { key: 'contacts',   label: 'Contacts' },
    { key: 'activities', label: 'Activity log' },
  ];

  return (
    <div className="lv">
      <style>{CSS}</style>
      <div className="lv-tabs">
        {TABS.map((t) => <button key={t.key} className={`lv-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      {tab === 'companies'  && <CompaniesTab flash={flash} />}
      {tab === 'contacts'   && <ContactsTab flash={flash} />}
      {tab === 'activities' && <ActivityTab flash={flash} />}
      <Toast toast={toast} />
    </div>
  );
}
