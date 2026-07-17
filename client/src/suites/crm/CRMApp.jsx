import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import * as C from './crmApi.js';
import { waDigits as normalizeWa } from '../../lib/whatsapp.js';
import { EmptyState, Modal, Paginator, searchMatcher, useConfirm, usePagedList, useToast } from '../../components/ui.jsx';

/* ---- icons ---------------------------------------------------------------- */
const I = {
  add:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  search: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>,
  close:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  chev:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>,
  trash:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>,
  log:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h5"/></svg>,
  clock:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>,
};

const CSS = `
  .crm-badge { display:inline-block; padding:2px 9px; border-radius:10px; font-size:11px; font-weight:700; letter-spacing:.03em; }
  .crm-t-call     { background:#deecfd; color:#194b8f; }
  .crm-t-wa       { background:#dff6dd; color:#1a6a1a; }
  .crm-t-email    { background:#f0e6ff; color:#5a2ca0; }
  .crm-t-meet     { background:#fff4ce; color:#7a5200; }
  .crm-t-note     { background:#f3f2f1; color:#605e5c; }
  .crm-t-web      { background:#ffe9df; color:#b3400f; }
  .crm-msg-card { border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:12px; background:var(--surface); }
  .crm-msg-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
  .crm-msg-body { font-size:14px; line-height:1.6; margin:0 0 12px; white-space:pre-wrap; }
  .crm-msg-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .crm-reply-btn { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; padding:7px 14px; border-radius:8px; border:1px solid var(--line); background:var(--surface); cursor:pointer; text-decoration:none; color:var(--text); }
  .crm-reply-btn.wa { background:#dff6dd; border-color:#b5e3b1; color:#1a6a1a; }
  .crm-reply-btn.soon { opacity:.55; cursor:not-allowed; }
  .crm-soon-chip { font-size:10px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; background:var(--surface-2); border:1px solid var(--line); border-radius:100px; padding:2px 8px; color:var(--text-2); }
  .crm-replied { font-size:11.5px; font-weight:700; padding:3px 10px; border-radius:100px; background:#dff6dd; color:#1a6a1a; }
  .crm-awaiting { font-size:11.5px; font-weight:700; padding:3px 10px; border-radius:100px; background:#fff4ce; color:#7a5200; }

  .crm-expand-row td { padding:0 16px 16px !important; background:var(--surface); }
  .crm-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; font-size:13px; margin:10px 0 16px; }
  .crm-label { color:var(--text-2); font-size:12px; margin-right:4px; }
  .crm-activity-item { display:flex; gap:10px; padding:10px 0; border-top:1px solid var(--line); }
  .crm-activity-item:first-child { border-top:none; }
  .crm-activity-meta { font-size:12px; color:var(--text-2); margin-top:2px; }
  .crm-activity-empty { font-size:13px; color:var(--text-2); padding:10px 0; }

  .crm-pill-row { display:flex; gap:8px; align-items:center; }
  .crm-pill { font-size:12px; font-weight:600; padding:5px 12px; border-radius:100px; border:1px solid var(--line); background:var(--surface); color:var(--text-2); cursor:pointer; }
  .crm-pill.active { background:#deecfd; border-color:#b3d3f7; color:#194b8f; }
  .crm-fu-pill { display:inline-block; font-size:11px; font-weight:700; padding:2px 9px; border-radius:100px; background:#deecfd; color:#194b8f; white-space:nowrap; }
  .crm-fu-pill.overdue { background:#fde7e9; color:#a4262c; }
  .crm-fu-strip { border:1px solid var(--line); background:var(--surface); border-radius:12px; padding:12px 16px; margin:8px 0 14px; max-width:720px; }
  .crm-kanban { display:flex; gap:12px; align-items:flex-start; overflow-x:auto; padding:4px 0 12px; }
  .crm-kcol { flex:0 0 232px; min-width:232px; background:var(--surface-2); border:1px solid var(--line); border-radius:12px; padding:10px; }
  .crm-kcol-head { display:flex; align-items:center; gap:8px; }
  .crm-kcol-total { font-size:12px; font-weight:600; color:var(--text-2); margin:6px 2px 10px; }
  .crm-deal-card { background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:10px 12px; margin-bottom:8px; cursor:pointer; }
  .crm-deal-card:hover { border-color:var(--text-2); }
  .crm-deal-title { font-weight:600; font-size:13.5px; margin-bottom:2px; }
  .crm-deal-meta { font-size:12px; color:var(--text-2); }
  .crm-overdue { color:#a4262c !important; font-weight:600; }
`;

/* ---- shared bits ------------------------------------------------------------ */
function Field({ label, children }) { return <div className="field"><label>{label}</label>{children}</div>; }

function ActivityBadge({ type }) {
  const t = C.ACTIVITY_TYPES[type] || C.ACTIVITY_TYPES.note;
  return <span className={`crm-badge ${t.cls}`}>{t.label}</span>;
}

function FollowUpPill({ at }) {
  if (!at) return null;
  const overdue = new Date(at).getTime() < Date.now();
  return <span className={`crm-fu-pill ${overdue ? 'overdue' : ''}`}>Follow up {C.fmtDay(at)}</span>;
}

// datetime-local wants local wall-clock time, not the UTC ISO slice.
const toLocalInput = (d) => { const t = new Date(d); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 16); };

function FollowUpModal({ activity, onClose, onSaved, flash }) {
  const [at, setAt] = useState(() => toLocalInput(activity.follow_up_at || Date.now() + 24 * 3600 * 1000));
  const [busy, setBusy] = useState(false);

  const save = async (value) => {
    setBusy(true);
    try {
      const saved = await C.setFollowUp(activity.id, value);
      flash(value ? 'Follow-up set.' : 'Follow-up cleared.');
      onSaved(saved);
      onClose();
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title="Set follow-up" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save(new Date(at).toISOString()); }}>
        <Field label="Follow up on">
          <input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required autoFocus />
        </Field>
        <div className="modal-actions">
          {activity.follow_up_at && (
            <button type="button" className="btn btn-ghost" style={{ marginRight: 'auto', color: '#a4262c' }} disabled={busy} onClick={() => save(null)}>Clear follow-up</button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ActivityList({ activities, onDelete, onUpdated, flash }) {
  const [fuFor, setFuFor] = useState(null);
  if (!activities?.length) return <div className="crm-activity-empty">No activity logged yet.</div>;
  return (
    <div>
      {activities.map((a) => (
        <div className="crm-activity-item" key={a.id}>
          <ActivityBadge type={a.type} />
          <div style={{ flex: 1 }}>
            <div>{a.notes || <span className="muted">No notes</span>} {a.follow_up_at && <FollowUpPill at={a.follow_up_at} />}</div>
            <div className="crm-activity-meta">{C.fmtDt(a.occurred_at)} &bull; logged by {a.author?.name || '—'}</div>
          </div>
          {onUpdated && <button className="iconbtn" aria-label="Set follow-up" title="Set follow-up" onClick={() => setFuFor(a)}>{I.clock}</button>}
          <button className="iconbtn" aria-label="Delete" onClick={() => onDelete(a.id)}>{I.trash}</button>
        </div>
      ))}
      {fuFor && <FollowUpModal activity={fuFor} onClose={() => setFuFor(null)} onSaved={onUpdated} flash={flash} />}
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
    <Modal title={`Log activity — ${contact?.name || company?.name}`} onClose={onClose}>
        <form onSubmit={submit}>
          <Field label="Type">
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(C.LOGGABLE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
    </Modal>
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
    <Modal title={company ? 'Edit company' : 'Add company'} onClose={onClose} wide>
        <form onSubmit={submit}>
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
    </Modal>
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
    <Modal title={contact ? 'Edit contact' : 'Add contact'} onClose={onClose} wide>
        <form onSubmit={submit}>
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
    </Modal>
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
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try { setCompanies(await C.getCompanies()); } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => {
    const match = searchMatcher(q);
    return companies.filter((c) => match(c.name, c.industry));
  }, [companies, q]);
  const { slice, page, pages, setPage, total } = usePagedList(view);

  const toggleExpand = async (c) => {
    if (expand === c.id) { setExpand(null); return; }
    setExpand(c.id);
    if (!activities[c.id]) {
      try { const a = await C.getActivities(`companyId=${c.id}`); setActivities((s) => ({ ...s, [c.id]: a })); } catch { /* noop */ }
    }
  };

  const removeCompany = async (c) => {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      message: 'Contacts linked to this company and its logged activity history are affected. This cannot be undone.',
      confirmLabel: 'Delete company',
      danger: true,
    });
    if (!ok) return;
    try { await C.deleteCompany(c.id); flash('Company deleted.'); load(); } catch (e) { flash(e.message, true); }
  };

  const removeActivity = async (companyId, activityId) => {
    const ok = await confirm({ title: 'Delete this activity?', message: 'The logged entry is removed permanently.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
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
              {view.length === 0 && (
                <tr><td colSpan={5}>
                  {companies.length === 0
                    ? <EmptyState title="No companies yet" hint="Add the organisations you work with to start logging calls, emails and meetings." />
                    : <span className="td-empty" style={{ display: 'block' }}>No companies match your search.</span>}
                </td></tr>
              )}
              {slice.map((c) => (
                <Fragment key={c.id}>
                  <tr>
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
                    <tr className="crm-expand-row">
                      <td colSpan={5}>
                        <div className="crm-detail-grid">
                          <div><span className="crm-label">Website</span>{c.website || '—'}</div>
                          <div><span className="crm-label">Address</span>{c.address || '—'}</div>
                        </div>
                        {c.notes && <p style={{ fontSize: 13, margin: '0 0 12px' }}>{c.notes}</p>}
                        <h4 style={{ fontSize: 13, margin: '0 0 4px' }}>Activity</h4>
                        <ActivityList activities={activities[c.id]} onDelete={(id) => removeActivity(c.id, id)} flash={flash}
                          onUpdated={(a) => setActivities((s) => ({ ...s, [c.id]: s[c.id].map((x) => (x.id === a.id ? a : x)) }))} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <Paginator page={page} pages={pages} onPage={setPage} total={total} />
        </div>
      )}

      {(modal === 'new' || (modal && modal !== 'new')) && (
        <CompanyModal company={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={load} flash={flash} />
      )}
      {logFor && (
        <LogActivityModal company={logFor} onClose={() => setLogFor(null)} flash={flash}
          onSaved={(a) => setActivities((s) => ({ ...s, [logFor.id]: [a, ...(s[logFor.id] || [])] }))} />
      )}
      {confirmNode}
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
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ct, co] = await Promise.all([C.getContacts(), C.getCompanies()]);
      setContacts(ct); setCompanies(co);
    } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => {
    const match = searchMatcher(q);
    return contacts.filter((c) => match(c.name, c.company?.name, c.job_title));
  }, [contacts, q]);
  const { slice, page, pages, setPage, total } = usePagedList(view);

  const toggleExpand = async (c) => {
    if (expand === c.id) { setExpand(null); return; }
    setExpand(c.id);
    if (!activities[c.id]) {
      try { const a = await C.getActivities(`contactId=${c.id}`); setActivities((s) => ({ ...s, [c.id]: a })); } catch { /* noop */ }
    }
  };

  const removeContact = async (c) => {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      message: 'Their details and logged activity history are removed. This cannot be undone.',
      confirmLabel: 'Delete contact',
      danger: true,
    });
    if (!ok) return;
    try { await C.deleteContact(c.id); flash('Contact deleted.'); load(); } catch (e) { flash(e.message, true); }
  };

  const removeActivity = async (contactId, activityId) => {
    const ok = await confirm({ title: 'Delete this activity?', message: 'The logged entry is removed permanently.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
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
              {view.length === 0 && (
                <tr><td colSpan={6}>
                  {contacts.length === 0
                    ? <EmptyState title="No contacts yet" hint="Add the people you deal with — reachable by phone, email or WhatsApp from their row." />
                    : <span className="td-empty" style={{ display: 'block' }}>No contacts match your search.</span>}
                </td></tr>
              )}
              {slice.map((c) => (
                <Fragment key={c.id}>
                  <tr>
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
                    <tr className="crm-expand-row">
                      <td colSpan={6}>
                        <div className="crm-detail-grid">
                          <div><span className="crm-label">Email</span>{c.email || '—'}</div>
                        </div>
                        {c.notes && <p style={{ fontSize: 13, margin: '0 0 12px' }}>{c.notes}</p>}
                        <h4 style={{ fontSize: 13, margin: '0 0 4px' }}>Activity</h4>
                        <ActivityList activities={activities[c.id]} onDelete={(id) => removeActivity(c.id, id)} flash={flash}
                          onUpdated={(a) => setActivities((s) => ({ ...s, [c.id]: s[c.id].map((x) => (x.id === a.id ? a : x)) }))} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <Paginator page={page} pages={pages} onPage={setPage} total={total} />
        </div>
      )}

      {(modal === 'new' || (modal && modal !== 'new')) && (
        <ContactModal contact={modal === 'new' ? null : modal} companies={companies} onClose={() => setModal(null)} onSaved={load} flash={flash} />
      )}
      {logFor && (
        <LogActivityModal contact={logFor} onClose={() => setLogFor(null)} flash={flash}
          onSaved={(a) => setActivities((s) => ({ ...s, [logFor.id]: [a, ...(s[logFor.id] || [])] }))} />
      )}
      {confirmNode}
    </>
  );
}

/* ---- MessagesTab — the website contact-form inbox ----------------------------
   Every message sent through the built site's contact form or the embed
   widget lands here (type 'web_message'), newest first, with the sender's
   details and one-tap replies. WhatsApp replies work today; direct email
   replies will send over SMTP from the org's own collarone.app mailbox once
   that's provisioned — shown as coming soon, not hidden. */
const MsgIcons = {
  wa: <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.2 14.2c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-3-.9-5-3.6-5.6-4.5-.5-.8-1-1.9-1-2.9 0-1 .5-1.5.7-1.7.3-.3.9-.3 1.1-.2.2 0 .5.1.7.6l.7 1.7c.1.2 0 .5-.1.6l-.5.6c-.1.2-.2.3 0 .6.5.8 1.6 2 3 2.6.3.1.5.1.7-.1l.7-.9c.2-.2.4-.2.6-.1l1.8.8c.3.2.5.3.5.5s0 .8-.2 1.3z"/></svg>,
  mail: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>,
  phone: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>,
  check: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12.5 9.5 17 19 7" /></svg>,
};

function MessagesTab({ flash }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | awaiting | replied

  const load = useCallback(async () => {
    setLoading(true);
    // Orders live in the Website builder's Orders tab and mailing-list
    // signups in Contacts — the inbox is real conversations only.
    try { setMessages((await C.getActivities()).filter((a) => a.type === 'web_message' && (a.source == null || a.source === 'contact_form' || a.source === 'product_enquiry'))); }
    catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const toggleReplied = async (m) => {
    try {
      const saved = await C.setActivityReplied(m.id, !m.replied_at);
      setMessages((s) => s.map((x) => (x.id === m.id ? saved : x)));
    } catch (e) { flash(e.message, true); }
  };

  const waDigits = (m) => normalizeWa(m.contact?.whatsapp || m.contact?.phone || '');
  const awaiting = messages.filter((m) => !m.replied_at).length;
  const view = useMemo(
    () => messages.filter((m) => filter === 'all' || (filter === 'awaiting' ? !m.replied_at : !!m.replied_at)),
    [messages, filter],
  );

  return (
    <>
      <div className="filterbar" style={{ marginTop: 8 }}>
        <div className="crm-pill-row">
          {[['all', 'All'], ['awaiting', 'Awaiting reply'], ['replied', 'Replied']].map(([k, label]) => (
            <button key={k} className={`crm-pill ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        <span className="count">
          {messages.length} message{messages.length === 1 ? '' : 's'}{awaiting > 0 && ` · ${awaiting} awaiting reply`}
        </span>
      </div>
      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}
      {!loading && messages.length > 0 && view.length === 0 && (
        <div className="crm-activity-empty">No {filter === 'awaiting' ? 'messages awaiting reply' : 'replied messages'}.</div>
      )}
      {!loading && messages.length === 0 && (
        <div className="crm-activity-empty" style={{ maxWidth: 560 }}>
          No messages yet. When a visitor fills the contact form on your website (or the embedded form on your own site),
          their message lands here with their details, ready to reply.
        </div>
      )}
      {!loading && view.map((m) => (
        <div className="crm-msg-card" key={m.id} style={{ maxWidth: 720, opacity: m.replied_at ? 0.72 : 1 }}>
          <div className="crm-msg-head">
            <strong style={{ fontSize: 14.5 }}>{m.contact?.name || 'Visitor'}</strong>
            {m.contact?.email && <span className="muted" style={{ fontSize: 12.5 }}>{m.contact.email}</span>}
            {m.contact?.phone && <span className="muted" style={{ fontSize: 12.5 }}>{m.contact.phone}</span>}
            <span style={{ flex: 1 }} />
            {m.replied_at ? <span className="crm-replied">Replied</span> : <span className="crm-awaiting">Awaiting reply</span>}
          </div>
          <p className="crm-msg-body">{m.notes}</p>
          <div className="crm-msg-actions">
            {waDigits(m) && (
              <a className="crm-reply-btn wa" target="_blank" rel="noreferrer"
                href={`https://wa.me/${waDigits(m)}?text=${encodeURIComponent(`Hi ${(m.contact?.name || '').split(' ')[0]}, thanks for reaching out through our website — `)}`}
                onClick={() => { if (!m.replied_at) toggleReplied(m); }}>
                {MsgIcons.wa} Reply on WhatsApp
              </a>
            )}
            <button className="crm-reply-btn soon" disabled title="Direct email replies will send from your own collarone.app mailbox — SMTP setup is on the way.">
              {MsgIcons.mail} Reply by email <span className="crm-soon-chip">Coming soon</span>
            </button>
            {m.contact?.phone && <a className="crm-reply-btn" href={`tel:${m.contact.phone}`}>{MsgIcons.phone} Call</a>}
            <span style={{ flex: 1 }} />
            <button className="crm-reply-btn" onClick={() => toggleReplied(m)}>
              {MsgIcons.check} {m.replied_at ? 'Mark as unreplied' : 'Mark as replied'}
            </button>
          </div>
          <div className="crm-activity-meta" style={{ marginTop: 10 }}>Received {C.fmtDt(m.occurred_at || m.created_at)}</div>
        </div>
      ))}
    </>
  );
}

/* ---- ActivityTab -------------------------------------------------------------- */
function ActivityTab({ flash }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fuFor, setFuFor] = useState(null);
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try { setActivities(await C.getActivities()); } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const removeActivity = async (id) => {
    const ok = await confirm({ title: 'Delete this activity?', message: 'The logged entry is removed permanently.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
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
                <div>{a.notes || <span className="muted">No notes</span>} {a.follow_up_at && <FollowUpPill at={a.follow_up_at} />}</div>
                <div className="crm-activity-meta">{C.fmtDt(a.occurred_at)} &bull; logged by {a.author?.name || '—'}</div>
              </div>
              <button className="iconbtn" aria-label="Set follow-up" title="Set follow-up" onClick={() => setFuFor(a)}>{I.clock}</button>
              <button className="iconbtn" aria-label="Delete" onClick={() => removeActivity(a.id)}>{I.trash}</button>
            </div>
          ))}
        </div>
      )}
      {fuFor && (
        <FollowUpModal activity={fuFor} onClose={() => setFuFor(null)} flash={flash}
          onSaved={(saved) => setActivities((s) => s.map((x) => (x.id === saved.id ? saved : x)))} />
      )}
      {confirmNode}
    </>
  );
}

/* ---- PipelineTab — deals kanban ----------------------------------------------
   Deals move lead → qualified → proposal → won/lost via the select on each
   card. Won/lost columns collapse to count + value so the board stays about
   what's still in play. */
const dealLate = (d) =>
  d.expected_close && !['won', 'lost'].includes(d.stage) && new Date(d.expected_close).setHours(23, 59, 59, 999) < Date.now();

function DealModal({ deal, contacts, companies, onClose, onSaved, onDelete, flash }) {
  const [f, setF] = useState(() => deal
    ? { title: deal.title, contactId: deal.contact_id || '', companyId: deal.company_id || '', valueNaira: deal.value_naira || '', stage: deal.stage, expectedClose: (deal.expected_close || '').slice(0, 10), notes: deal.notes || '' }
    : { title: '', contactId: '', companyId: '', valueNaira: '', stage: 'lead', expectedClose: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return flash('Deal title is required.', true);
    setBusy(true);
    try {
      const payload = { ...f, contactId: f.contactId || null, companyId: f.companyId || null, expectedClose: f.expectedClose || null };
      const saved = deal ? await C.updateDeal(deal.id, payload) : await C.createDeal(payload);
      flash(deal ? 'Deal updated.' : 'Deal added.');
      onSaved(saved);
      onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title={deal ? 'Edit deal' : 'New deal'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <Field label="Deal title *"><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} required autoFocus /></Field>
        <div className="form-grid">
          <Field label="Contact">
            <select className="select" value={f.contactId} onChange={(e) => set('contactId', e.target.value)}>
              <option value="">— No contact —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Company">
            <select className="select" value={f.companyId} onChange={(e) => set('companyId', e.target.value)}>
              <option value="">— No company —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Value (₦)"><input className="input" type="number" min="0" step="1" value={f.valueNaira} onChange={(e) => set('valueNaira', e.target.value)} /></Field>
          <Field label="Stage">
            <select className="select" value={f.stage} onChange={(e) => set('stage', e.target.value)}>
              {Object.entries(C.DEAL_STAGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Expected close"><input className="input" type="date" value={f.expectedClose} onChange={(e) => set('expectedClose', e.target.value)} /></Field>
        </div>
        <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></Field>
        <div className="modal-actions">
          {deal && <button type="button" className="btn btn-ghost" style={{ marginRight: 'auto', color: '#a4262c' }} disabled={busy} onClick={() => onDelete(deal)}>Delete deal</button>}
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : deal ? 'Save changes' : 'Add deal'}</button>
        </div>
      </form>
    </Modal>
  );
}

function DealCard({ deal, onEdit, onStage }) {
  const who = [deal.company?.name, deal.contact?.name].filter(Boolean).join(' · ');
  return (
    <div className="crm-deal-card" onClick={() => onEdit(deal)}>
      <div className="crm-deal-title">{deal.title}</div>
      <div className="crm-deal-meta">{who || '—'}</div>
      <div style={{ fontWeight: 600, fontSize: 13, margin: '4px 0 2px' }}>{C.fmtNaira(deal.value_naira)}</div>
      {deal.expected_close && <div className={`crm-deal-meta ${dealLate(deal) ? 'crm-overdue' : ''}`}>Close {C.fmtDay(deal.expected_close)}</div>}
      <select className="select" value={deal.stage} onClick={(e) => e.stopPropagation()}
        onChange={(e) => onStage(deal, e.target.value)} style={{ marginTop: 8, fontSize: 12, padding: '4px 8px', width: '100%' }}>
        {Object.entries(C.DEAL_STAGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
    </div>
  );
}

function PipelineTab({ flash }) {
  const [deals, setDeals] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [acts, setActs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new' | deal
  const [openClosed, setOpenClosed] = useState({}); // { won: bool, lost: bool }
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ds, ct, co, ac] = await Promise.all([C.getDeals(), C.getContacts(), C.getCompanies(), C.getActivities()]);
      setDeals(ds); setContacts(ct); setCompanies(co); setActs(ac);
    } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const byStage = useMemo(() => {
    const m = Object.fromEntries(Object.keys(C.DEAL_STAGES).map((k) => [k, []]));
    deals.forEach((d) => (m[d.stage] || m.lead).push(d));
    return m;
  }, [deals]);

  const dueFollowUps = useMemo(() => {
    const cutoff = Date.now() + 24 * 3600 * 1000;
    return acts
      .filter((a) => a.follow_up_at && !a.replied_at && new Date(a.follow_up_at).getTime() <= cutoff)
      .sort((a, b) => new Date(a.follow_up_at) - new Date(b.follow_up_at));
  }, [acts]);

  const upsert = (saved) => setDeals((s) => (s.some((d) => d.id === saved.id) ? s.map((d) => (d.id === saved.id ? saved : d)) : [saved, ...s]));

  const moveStage = async (deal, stage) => {
    try { upsert(await C.updateDeal(deal.id, { stage })); flash(`Moved to ${C.DEAL_STAGES[stage].label}.`); }
    catch (e) { flash(e.message, true); }
  };

  const removeDeal = async (deal) => {
    const ok = await confirm({ title: `Delete "${deal.title}"?`, message: 'The deal is removed from the pipeline permanently.', confirmLabel: 'Delete deal', danger: true });
    if (!ok) return;
    try { await C.deleteDeal(deal.id); setDeals((s) => s.filter((d) => d.id !== deal.id)); setModal(null); flash('Deal deleted.'); }
    catch (e) { flash(e.message, true); }
  };

  const grandTotal = deals.reduce((s, d) => s + Number(d.value_naira || 0), 0);

  return (
    <>
      <div className="filterbar" style={{ marginTop: 8 }}>
        <span className="count">{deals.length} deal{deals.length === 1 ? '' : 's'} · {C.fmtNaira(grandTotal)}</span>
        <button className="btn btn-primary lv-apply" onClick={() => setModal('new')}><span style={{ marginRight: 6 }}>{I.add}</span>New deal</button>
      </div>

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {!loading && dueFollowUps.length > 0 && (
        <div className="crm-fu-strip">
          <h4 style={{ fontSize: 13, margin: '0 0 8px' }}>Follow-ups due</h4>
          {dueFollowUps.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 13, minWidth: 0 }}>
              <FollowUpPill at={a.follow_up_at} />
              <strong style={{ whiteSpace: 'nowrap' }}>{a.contact?.name || a.company?.name || '—'}</strong>
              <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.notes || ''}</span>
            </div>
          ))}
        </div>
      )}

      {!loading && deals.length === 0 && (
        <EmptyState title="No deals yet" hint="Track every opportunity from lead to won — value, stage and expected close in one board."
          action={<button className="btn btn-primary" onClick={() => setModal('new')}>New deal</button>} />
      )}

      {!loading && deals.length > 0 && (
        <div className="crm-kanban">
          {Object.entries(C.DEAL_STAGES).map(([key, s]) => {
            const col = byStage[key];
            const totalV = col.reduce((sum, d) => sum + Number(d.value_naira || 0), 0);
            const closed = key === 'won' || key === 'lost';
            const collapsed = closed && !openClosed[key];
            return (
              <div className="crm-kcol" key={key}>
                <div className="crm-kcol-head">
                  <span className="crm-badge" style={{ background: s.bg, color: s.fg }}>{s.label}</span>
                  <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{col.length}</span>
                  {closed && (
                    <button className="iconbtn" style={{ marginLeft: 'auto' }} aria-label={collapsed ? 'Expand column' : 'Collapse column'}
                      onClick={() => setOpenClosed((o) => ({ ...o, [key]: !o[key] }))}>
                      <span style={{ display: 'inline-block', transform: collapsed ? 'none' : 'rotate(90deg)' }}>{I.chev}</span>
                    </button>
                  )}
                </div>
                <div className="crm-kcol-total">{C.fmtNaira(totalV)}</div>
                {!collapsed && col.map((d) => <DealCard key={d.id} deal={d} onEdit={setModal} onStage={moveStage} />)}
                {!collapsed && col.length === 0 && <div className="crm-activity-empty" style={{ padding: '2px 2px 6px' }}>No deals</div>}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <DealModal deal={modal === 'new' ? null : modal} contacts={contacts} companies={companies}
          onClose={() => setModal(null)} onSaved={upsert} onDelete={removeDeal} flash={flash} />
      )}
      {confirmNode}
    </>
  );
}

/* =========================================================================
   Main CRMApp
   ========================================================================= */
export default function CRMApp() {
  const [tab, setTab] = useState('messages');
  const { flash, toastNode } = useToast();

  const TABS = [
    { key: 'messages',   label: 'Messages' },
    { key: 'pipeline',   label: 'Pipeline' },
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
      {tab === 'messages'   && <MessagesTab flash={flash} />}
      {tab === 'pipeline'   && <PipelineTab flash={flash} />}
      {tab === 'companies'  && <CompaniesTab flash={flash} />}
      {tab === 'contacts'   && <ContactsTab flash={flash} />}
      {tab === 'activities' && <ActivityTab flash={flash} />}
      {toastNode}
    </div>
  );
}
