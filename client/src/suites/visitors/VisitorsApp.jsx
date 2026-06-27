import { useCallback, useEffect, useMemo, useState } from 'react';
import * as V from './visitorApi.js';

/* ---- icons ---------------------------------------------------------------- */
const I = {
  add:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  search: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>,
  check:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12l4 4 10-10"/></svg>,
  exit:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>,
  flag:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/></svg>,
  ban:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M6.5 6.5l11 11"/></svg>,
  close:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  copy:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  refresh:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 11a8 8 0 1 0-.6 4"/><path d="M20 4v5h-5"/></svg>,
  alert:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>,
};

/* ---- CSS ------------------------------------------------------------------ */
const CSS = `
  .vs-badge { display:inline-block; padding:2px 9px; border-radius:10px; font-size:11px; font-weight:700; letter-spacing:.03em; }
  .vs-expected { background:#fff4ce; color:#7a5200; }
  .vs-in       { background:#dff6dd; color:#1a6a1a; }
  .vs-out      { background:#f3f2f1; color:#605e5c; }
  .vs-canc     { background:#f3f2f1; color:#a19f9d; }
  .vs-noshow   { background:#fde7e9; color:#a4262c; }

  .vs-code-input { font-size:22px; font-weight:700; letter-spacing:.18em; text-align:center; max-width:200px; }
  .vs-code-display { font-size:42px; font-weight:700; letter-spacing:.2em; background:#f3f2f1; padding:18px 32px; border-radius:8px; display:inline-block; font-family:monospace; color:var(--text-1); }

  .vs-lookup { padding:0; }
  .vs-lookup-form { display:flex; gap:10px; align-items:center; margin-bottom:16px; }
  .vs-not-found { padding:14px 16px; background:#fff4f4; border:1px solid #fde7e9; border-radius:6px; color:#a4262c; font-size:13px; }

  .vs-card { border:1px solid var(--line); border-radius:8px; padding:16px 20px; background:var(--surface); margin-top:4px; }
  .vs-card-banned { border-color:#a4262c; background:#fff8f8; }
  .vs-banned-warning { background:#a4262c; color:#fff; padding:8px 12px; border-radius:5px; font-size:12px; font-weight:700; margin-bottom:12px; }
  .vs-card-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; }
  .vs-card-name { font-size:17px; font-weight:600; }
  .vs-card-sub { font-size:13px; color:var(--text-2); margin-top:2px; }
  .vs-card-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 16px; font-size:13px; margin-bottom:14px; }
  .vs-label { color:var(--text-2); font-size:12px; margin-right:4px; }
  .vs-card-actions { display:flex; gap:8px; flex-wrap:wrap; padding-top:10px; border-top:1px solid var(--line); }
  .vs-checkin-form { display:flex; gap:8px; flex-wrap:wrap; align-items:center; width:100%; }

  .vs-fieldset { border:1px solid var(--line); border-radius:6px; padding:14px 16px; margin:10px 0 4px; }
  .vs-fieldset legend { font-size:12px; font-weight:600; color:var(--text-2); padding:0 6px; }
  .vs-found-banner { background:#dff6dd; border:1px solid #a8d5a2; border-radius:5px; padding:8px 12px; font-size:13px; display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }

  .vs-kpi-row { display:flex; gap:14px; flex-wrap:wrap; margin-bottom:20px; }
  .vs-kpi { background:var(--surface); border:1px solid var(--line); border-top:3px solid var(--brand); border-radius:var(--radius-lg); padding:16px 20px; min-width:120px; flex:1; }
  .vs-kpi-val { font-size:28px; font-weight:700; line-height:1; margin-bottom:4px; }
  .vs-kpi-label { font-size:12px; color:var(--text-2); }
  .vs-overstay { border-top-color:#a4262c; }
  .vs-overstay .vs-kpi-val { color:#a4262c; }

  .vs-row-overstay td { background:#fff8f8 !important; }
  .vs-row-banned td { background:#fff4f4 !important; }
  .danger-icon { color:#a4262c; }
  .danger-icon:hover { background:#fde7e9; }
`;

/* ---- helpers -------------------------------------------------------------- */
function StatusBadge({ status }) {
  const s = V.STATUS[status] || V.STATUS.expected;
  return <span className={`vs-badge ${s.cls}`}>{s.label}</span>;
}

function KpiCard({ label, value, accent, warn }) {
  return (
    <div className={`vs-kpi ${warn && Number(value) > 0 ? 'vs-overstay' : ''}`} style={{ borderTopColor: accent }}>
      <div className="vs-kpi-val">{value ?? '—'}</div>
      <div className="vs-kpi-label">{label}</div>
    </div>
  );
}

/* ---- VisitorResultCard ---------------------------------------------------- */
function VisitorResultCard({ visit, canAct, onRefresh, flash }) {
  const [showCheckin, setShowCheckin]   = useState(false);
  const [badge, setBadge]               = useState('');
  const [point, setPoint]               = useState(V.ACCESS_POINTS[0]);
  const [flagNote, setFlagNote]         = useState('');
  const [showFlag, setShowFlag]         = useState(false);
  const [busy, setBusy]                 = useState(false);

  const act = async (fn) => { setBusy(true); try { await fn(); onRefresh?.(); } catch (e) { flash(e.message, true); } finally { setBusy(false); } };

  const checkin  = () => act(() => V.updateVisit(visit.id, { action: 'checkin', badgeNumber: badge, accessPoint: point }));
  const checkout = () => { if (!confirm('Check out this visitor?')) return; act(() => V.updateVisit(visit.id, { action: 'checkout' })); };
  const doFlag   = () => act(() => V.updateVisit(visit.id, { action: 'flag', flagReason: flagNote }).then(() => setShowFlag(false)));
  const cancel   = () => { if (!confirm('Cancel this visit?')) return; act(() => V.updateVisit(visit.id, { action: 'cancel' })); };

  const isBanned = visit.visitor?.is_banned;
  return (
    <div className={`vs-card ${isBanned ? 'vs-card-banned' : ''}`}>
      {isBanned && <div className="vs-banned-warning">BANNED — {visit.visitor.ban_reason || 'Entry not permitted by management'}</div>}
      {visit.flagged && <div className="vs-banned-warning" style={{ background: '#ca5010' }}>FLAGGED — {visit.flag_reason || 'Flagged by security'}</div>}
      <div className="vs-card-header">
        <div>
          <div className="vs-card-name">{visit.visitor?.name}</div>
          <div className="vs-card-sub">{visit.visitor?.company || 'Individual'} &bull; {visit.visitor?.phone}</div>
        </div>
        <StatusBadge status={visit.status} />
      </div>
      <div className="vs-card-grid">
        <div><span className="vs-label">Host</span>{visit.host?.name}</div>
        <div><span className="vs-label">Purpose</span>{visit.purpose}</div>
        <div><span className="vs-label">Expected</span>{V.fmtDt(visit.expected_at)}</div>
        <div><span className="vs-label">Access point</span>{visit.access_point}</div>
        {visit.badge_number && <div><span className="vs-label">Badge</span>{visit.badge_number}</div>}
        {visit.checked_in_at && <div><span className="vs-label">Checked in</span>{V.fmtDt(visit.checked_in_at)}</div>}
        {visit.checked_out_at && <div><span className="vs-label">Duration</span>{V.duration(visit.checked_in_at, visit.checked_out_at)}</div>}
      </div>

      {canAct && !isBanned && (
        <div className="vs-card-actions">
          {visit.status === 'expected' && !showCheckin && (
            <>
              <button className="btn btn-primary" onClick={() => setShowCheckin(true)}>{I.check} Check in</button>
              <button className="btn btn-ghost" onClick={cancel}>Cancel visit</button>
            </>
          )}
          {visit.status === 'expected' && showCheckin && (
            <div className="vs-checkin-form">
              <input className="input" placeholder="Badge no." value={badge} onChange={(e) => setBadge(e.target.value)} style={{ maxWidth: 140 }} />
              <select className="select" value={point} onChange={(e) => setPoint(e.target.value)} style={{ maxWidth: 180 }}>
                {V.ACCESS_POINTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className="btn btn-primary" disabled={busy} onClick={checkin}>
                {busy ? <span className="spinner" /> : 'Confirm check-in'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowCheckin(false)}>Cancel</button>
            </div>
          )}
          {visit.status === 'checked_in' && !showFlag && (
            <>
              <button className="btn btn-primary" disabled={busy} onClick={checkout}>
                {busy ? <span className="spinner" /> : <>{I.exit} Check out</>}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowFlag(true)}>{I.flag} Flag</button>
            </>
          )}
          {showFlag && (
            <div className="vs-checkin-form">
              <input className="input" placeholder="Reason for flagging…" value={flagNote} onChange={(e) => setFlagNote(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
              <button className="btn btn-primary" style={{ background: '#ca5010' }} disabled={busy || !flagNote.trim()} onClick={doFlag}>
                {busy ? <span className="spinner" /> : 'Submit flag'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowFlag(false)}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- CodeLookupWidget ----------------------------------------------------- */
function CodeLookupWidget({ canAct = false, flash, hero = false }) {
  const [code, setCode]     = useState('');
  const [result, setResult] = useState(null); // null | 'not_found' | visit object
  const [busy, setBusy]     = useState(false);
  const [rev, setRev]       = useState(0);

  const lookup = async (e) => {
    e?.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await V.lookupCode(code));
    } catch (e2) {
      setResult(e2.status === 404 ? 'not_found' : null);
      if (e2.status !== 404) flash(e2.message, true);
    } finally { setBusy(false); }
  };

  useEffect(() => { if (rev > 0) setResult(null); }, [rev]);

  return (
    <div className="vs-lookup">
      <form onSubmit={lookup} className="vs-lookup-form">
        <input
          className={`input vs-code-input ${hero ? '' : ''}`}
          style={hero ? { fontSize: 28, maxWidth: 220 } : {}}
          placeholder="000000"
          maxLength={6}
          value={code}
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setResult(null); }}
          autoFocus={hero}
        />
        <button type="submit" className="btn btn-primary" disabled={code.length !== 6 || busy}>
          {busy ? <span className="spinner" /> : <>{I.search} Find</>}
        </button>
      </form>
      {result === 'not_found' && (
        <div className="vs-not-found">No active visit found for code <strong>{code}</strong>. It may have expired or already checked out.</div>
      )}
      {result && result !== 'not_found' && (
        <VisitorResultCard visit={result} canAct={canAct} flash={flash} onRefresh={() => { setCode(''); setRev((r) => r + 1); }} />
      )}
    </div>
  );
}

/* ---- VisitModal (pre-register / walk-in) ---------------------------------- */
function VisitModal({ onClose, onSaved, flash, showHostPicker = false, staff = [] }) {
  const [step,         setStep]         = useState('form');   // 'form' | 'success'
  const [searchPhone,  setSearchPhone]  = useState('');
  const [foundVisitor, setFoundVisitor] = useState(null);
  const [searching,    setSearching]    = useState(false);
  const [accessCode,   setAccessCode]   = useState('');
  const [busy,         setBusy]         = useState(false);

  const [vis, setVis] = useState({ name:'', company:'', phone:'', email:'' });
  const [vst, setVst] = useState({ purpose:'', notes:'', expectedAt:'', accessPoint: V.ACCESS_POINTS[0], hostId:'' });

  const setV = (k, v) => setVis((s) => ({ ...s, [k]: v }));
  const setW = (k, v) => setVst((s) => ({ ...s, [k]: v }));

  const searchByPhone = async () => {
    if (!searchPhone.trim()) return;
    setSearching(true);
    try {
      const res = await V.searchVisitors(searchPhone.trim());
      if (res.length > 0) {
        const r = res[0];
        setFoundVisitor(r);
        setVis({ name: r.name, company: r.company, phone: r.phone, email: r.email });
      } else {
        setFoundVisitor(null);
        setV('phone', searchPhone.trim());
        flash('No existing visitor found — fill in the details below.', false);
      }
    } catch (e) { flash(e.message, true); } finally { setSearching(false); }
  };

  const clearFoundVisitor = () => { setFoundVisitor(null); setVis({ name:'', company:'', phone: searchPhone, email:'' }); };

  const submit = async (e) => {
    e.preventDefault();
    if (!vis.name.trim())     return flash('Visitor name is required.', true);
    if (!vis.phone.trim())    return flash('Visitor phone is required.', true);
    if (!vst.purpose.trim())  return flash('Purpose is required.', true);
    if (!vst.expectedAt)      return flash('Expected arrival date/time is required.', true);
    setBusy(true);
    try {
      const result = await V.createVisit({
        visitorId:      foundVisitor?.id || null,
        visitorName:    vis.name, visitorCompany: vis.company,
        visitorPhone:   vis.phone, visitorEmail: vis.email,
        purpose:   vst.purpose, notes: vst.notes,
        expectedAt: vst.expectedAt, accessPoint: vst.accessPoint,
        hostId:    vst.hostId || null,
      });
      setAccessCode(result.access_code);
      setStep('success');
      onSaved(result);
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  if (step === 'success') {
    return (
      <div className="modal-overlay" onMouseDown={onClose}>
        <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
          <div className="modal-head"><h2>Visitor registered</h2>
            <button className="iconbtn dark" onClick={onClose} aria-label="Close">{I.close}</button>
          </div>
          <div className="modal-body" style={{ textAlign:'center', padding:'24px 32px' }}>
            <div style={{ fontSize:13, color:'var(--text-2)', marginBottom:12 }}>Share this access code with your visitor:</div>
            <div className="vs-code-display">{accessCode}</div>
            <div style={{ fontSize:12, color:'var(--text-2)', marginTop:8 }}>Valid for 24 hours from expected arrival time. Any access point can verify it.</div>
            <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:24 }}>
              <button className="btn btn-ghost" onClick={() => { navigator.clipboard?.writeText(accessCode); flash('Code copied.'); }}>
                {I.copy} Copy code
              </button>
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Register visitor</h2>
          <button className="iconbtn dark" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <form className="modal-body" onSubmit={submit}>

          {/* Phone search */}
          <div className="field">
            <label>Search returning visitor by phone</label>
            <div style={{ display:'flex', gap:8 }}>
              <input className="input" placeholder="+234..." value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchByPhone())}
                style={{ flex:1 }} />
              <button type="button" className="btn btn-ghost" onClick={searchByPhone} disabled={searching}>
                {searching ? <span className="spinner" /> : 'Search'}
              </button>
            </div>
          </div>

          {foundVisitor && (
            <div className="vs-found-banner">
              Returning visitor: <strong>{foundVisitor.name}</strong> &bull; {foundVisitor.company || 'Individual'}
              <button type="button" className="iconbtn" onClick={clearFoundVisitor} aria-label="Clear">{I.close}</button>
            </div>
          )}

          {/* Visitor fields */}
          <fieldset className="vs-fieldset">
            <legend>Visitor details</legend>
            <div className="form-grid">
              <div className="field"><label>Full name *</label>
                <input className="input" value={vis.name} onChange={(e) => setV('name', e.target.value)} required autoFocus={!foundVisitor} />
              </div>
              <div className="field"><label>Company / Organisation</label>
                <input className="input" value={vis.company} onChange={(e) => setV('company', e.target.value)} />
              </div>
              <div className="field"><label>Phone *</label>
                <input className="input" value={vis.phone} onChange={(e) => setV('phone', e.target.value)} required />
              </div>
              <div className="field"><label>Email</label>
                <input className="input" type="email" value={vis.email} onChange={(e) => setV('email', e.target.value)} />
              </div>
            </div>
          </fieldset>

          {/* Visit fields */}
          <fieldset className="vs-fieldset">
            <legend>Visit details</legend>
            <div className="field"><label>Purpose of visit *</label>
              <input className="input" value={vst.purpose} onChange={(e) => setW('purpose', e.target.value)} required />
            </div>
            <div className="form-grid">
              <div className="field"><label>Expected arrival *</label>
                <input className="input" type="datetime-local" value={vst.expectedAt} onChange={(e) => setW('expectedAt', e.target.value)} required />
              </div>
              <div className="field"><label>Access point</label>
                <select className="select" value={vst.accessPoint} onChange={(e) => setW('accessPoint', e.target.value)}>
                  {V.ACCESS_POINTS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {showHostPicker && (
                <div className="field"><label>Host (staff member)</label>
                  <select className="select" value={vst.hostId} onChange={(e) => setW('hostId', e.target.value)}>
                    <option value="">— Select host —</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="field"><label>Notes <span className="muted">(optional)</span></label>
              <textarea className="input" rows={2} value={vst.notes} onChange={(e) => setW('notes', e.target.value)} style={{ resize:'vertical', fontFamily:'inherit' }} />
            </div>
          </fieldset>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? <span className="spinner" /> : 'Register & generate code'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---- VisitsTable (shared list component) ---------------------------------- */
function VisitsTable({ visits, canAct, flash, onRefresh, showHost = true, emptyMsg = 'No visits found.' }) {
  const [expand, setExpand] = useState(null);

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Visitor</th>
            {showHost && <th>Host</th>}
            <th>Purpose</th>
            <th>Expected</th>
            <th>Status</th>
            <th>Badge</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visits.length === 0 && <tr><td colSpan={showHost ? 7 : 6} className="td-empty">{emptyMsg}</td></tr>}
          {visits.map((v) => (
            <>
              <tr key={v.id} className={`${V.isOverstay(v) ? 'vs-row-overstay' : ''} ${v.visitor?.is_banned ? 'vs-row-banned' : ''}`}>
                <td>
                  <div style={{ fontWeight:500 }}>{v.visitor?.name}</div>
                  <div className="muted" style={{ fontSize:12 }}>{v.visitor?.company || 'Individual'}</div>
                </td>
                {showHost && <td className="muted" style={{ fontSize:13 }}>{v.host?.name || '—'}</td>}
                <td style={{ fontSize:13, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v.purpose}</td>
                <td className="muted" style={{ fontSize:13, whiteSpace:'nowrap' }}>{V.fmtDt(v.expected_at)}</td>
                <td><StatusBadge status={v.status} /></td>
                <td className="muted" style={{ fontSize:13 }}>{v.badge_number || '—'}</td>
                <td>
                  <button className="iconbtn" onClick={() => setExpand(expand === v.id ? null : v.id)} aria-label="Details">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                  </button>
                </td>
              </tr>
              {expand === v.id && (
                <tr key={`${v.id}-exp`}>
                  <td colSpan={showHost ? 7 : 6} style={{ padding:'0 16px 16px', background:'var(--surface)' }}>
                    <VisitorResultCard visit={v} canAct={canAct} flash={flash} onRefresh={() => { setExpand(null); onRefresh?.(); }} />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================================
   ROLE VIEWS
   ========================================================================= */

/* ---- StaffView ------------------------------------------------------------ */
function StaffView({ flash }) {
  const [visits,  setVisits]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('mine');
  const [modal,   setModal]   = useState(false);
  const [q,       setQ]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await V.markNoShows();
      setVisits(await V.getVisits('mine=true'));
    } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => {
    let list = visits;
    if (tab === 'active')   list = list.filter((v) => v.status === 'checked_in');
    if (tab === 'upcoming') list = list.filter((v) => v.status === 'expected');
    if (tab === 'past')     list = list.filter((v) => ['checked_out','cancelled','no_show'].includes(v.status));
    if (q.trim()) { const rx = new RegExp(q.trim(),'i'); list = list.filter((v) => rx.test(v.visitor?.name) || rx.test(v.purpose)); }
    return list;
  }, [visits, tab, q]);

  const TABS = [
    { key:'mine',     label:'All my visits' },
    { key:'active',   label:'Active' },
    { key:'upcoming', label:'Upcoming' },
    { key:'past',     label:'Past' },
    { key:'lookup',   label:'Code lookup' },
  ];

  return (
    <>
      <div className="lv-tabs">
        {TABS.map((t) => <button key={t.key} className={`lv-tab ${tab===t.key?'active':''}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
        <button className="btn btn-primary lv-apply" onClick={() => setModal(true)}>
          <span style={{ marginRight:6 }}>{I.add}</span>Pre-register visitor
        </button>
      </div>

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {!loading && tab !== 'lookup' && (
        <>
          <div className="filterbar" style={{ marginTop:8 }}>
            <div className="cmd-search" style={{ marginLeft:'auto' }}>
              {I.search}
              <input placeholder="Search visits" value={q} onChange={(e) => setQ(e.target.value)} style={{ border:'none', outline:'none', background:'transparent', fontSize:13, marginLeft:6, width:180 }} />
            </div>
            <span className="count">{view.length} visit{view.length===1?'':'s'}</span>
          </div>
          <VisitsTable visits={view} canAct={false} flash={flash} onRefresh={load} showHost={false} emptyMsg="No visits in this filter." />
        </>
      )}

      {!loading && tab === 'lookup' && (
        <div style={{ padding:'16px 0' }}>
          <p className="muted" style={{ fontSize:13, marginBottom:12 }}>Enter a 6-digit access code to check any visit status.</p>
          <CodeLookupWidget canAct={false} flash={flash} />
        </div>
      )}

      {modal && (
        <VisitModal onClose={() => setModal(false)} flash={flash} onSaved={() => { load(); setModal(false); }} />
      )}
    </>
  );
}

/* ---- ReceptionistView ----------------------------------------------------- */
function ReceptionistView({ flash }) {
  const [visits,  setVisits]  = useState([]);
  const [staff,   setStaff]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('expected');
  const [modal,   setModal]   = useState(false);
  const [q,       setQ]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await V.markNoShows();
      setVisits(await V.getVisits());
    } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => {
    load();
    import('../../api/client.js').then(({ apiGet }) => apiGet('/staff').then((d) => setStaff(d.staff)).catch(() => {}));
  }, []); // eslint-disable-line

  const today = new Date().toDateString();

  const view = useMemo(() => {
    let list = visits;
    if (tab === 'expected') list = list.filter((v) => v.status === 'expected' && new Date(v.expected_at).toDateString() === today);
    if (tab === 'active')   list = list.filter((v) => v.status === 'checked_in');
    if (tab === 'all')      list = [...list];
    if (q.trim()) { const rx = new RegExp(q.trim(),'i'); list = list.filter((v) => rx.test(v.visitor?.name) || rx.test(v.host?.name) || rx.test(v.purpose) || rx.test(v.access_code)); }
    return list.sort((a,b) => new Date(a.expected_at) - new Date(b.expected_at));
  }, [visits, tab, q, today]);

  const TABS = [
    { key:'expected', label:'Expected today' },
    { key:'active',   label:'Active visitors' },
    { key:'all',      label:'All visits' },
    { key:'lookup',   label:'Code lookup' },
  ];

  return (
    <>
      <div className="lv-tabs">
        {TABS.map((t) => <button key={t.key} className={`lv-tab ${tab===t.key?'active':''}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
        <button className="btn btn-primary lv-apply" onClick={() => setModal(true)}>
          <span style={{ marginRight:6 }}>{I.add}</span>Walk-in / New visit
        </button>
      </div>

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {!loading && tab !== 'lookup' && (
        <>
          <div className="filterbar" style={{ marginTop:8 }}>
            <div className="cmd-search" style={{ marginLeft:'auto' }}>
              {I.search}
              <input placeholder="Search visitor, host, code…" value={q} onChange={(e) => setQ(e.target.value)} style={{ border:'none', outline:'none', background:'transparent', fontSize:13, marginLeft:6, width:200 }} />
            </div>
            <span className="count">{view.length} record{view.length===1?'':'s'}</span>
          </div>
          <VisitsTable visits={view} canAct flash={flash} onRefresh={load} />
        </>
      )}

      {!loading && tab === 'lookup' && (
        <div style={{ padding:'16px 0' }}>
          <p className="muted" style={{ fontSize:13, marginBottom:12 }}>Enter the visitor's 6-digit code to check them in or out.</p>
          <CodeLookupWidget canAct flash={flash} onRefresh={load} />
        </div>
      )}

      {modal && (
        <VisitModal showHostPicker staff={staff} onClose={() => setModal(false)} flash={flash}
          onSaved={() => { load(); setModal(false); }} />
      )}
    </>
  );
}

/* ---- SecurityView --------------------------------------------------------- */
function SecurityView({ flash }) {
  const [visits,  setVisits]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('lookup');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await V.markNoShows();
      setVisits(await V.getVisits('status=checked_in'));
    } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const TABS = [
    { key:'lookup', label:'Code lookup' },
    { key:'active', label:'Active on premises' },
  ];

  return (
    <>
      <div className="lv-tabs">
        {TABS.map((t) => <button key={t.key} className={`lv-tab ${tab===t.key?'active':''}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
        <button className="btn btn-ghost lv-apply" onClick={load}>{I.refresh} Refresh</button>
      </div>

      {tab === 'lookup' && (
        <div style={{ padding:'20px 0' }}>
          <p style={{ fontSize:13, color:'var(--text-2)', marginBottom:16 }}>
            Ask the visitor for their 6-digit access code and enter it below to verify and check them in or out.
          </p>
          <CodeLookupWidget canAct hero flash={flash} onRefresh={load} />
        </div>
      )}

      {tab === 'active' && (
        <>
          {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}
          {!loading && (
            <>
              <div className="filterbar" style={{ marginTop:8 }}>
                <span className="count">{visits.length} visitor{visits.length===1?'':' s'} on premises</span>
              </div>
              <VisitsTable visits={visits} canAct flash={flash} onRefresh={load} emptyMsg="No visitors currently on premises." />
            </>
          )}
        </>
      )}
    </>
  );
}

/* ---- ManagementView ------------------------------------------------------- */
function ManagementView({ flash }) {
  const [visits,  setVisits]  = useState([]);
  const [banned,  setBanned]  = useState([]);
  const [stats,   setStats]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('dashboard');
  const [q,       setQ]       = useState('');
  const [banModal, setBanModal] = useState(null); // visitor object to ban/unban

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await V.markNoShows();
      const [v, b, s] = await Promise.all([V.getVisits(), V.getBanned(), V.getVisitorStats()]);
      setVisits(v);
      setBanned(b);
      setStats(s);
    } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const statsMap = useMemo(() => Object.fromEntries((stats || []).map((r) => [r.metric, Number(r.value)])), [stats]);

  const overstay = useMemo(() => visits.filter(V.isOverstay), [visits]);

  const logView = useMemo(() => {
    let list = visits;
    if (q.trim()) { const rx = new RegExp(q.trim(),'i'); list = list.filter((v) => rx.test(v.visitor?.name) || rx.test(v.host?.name) || rx.test(v.purpose) || rx.test(v.access_code)); }
    return list;
  }, [visits, q]);

  const unban = async (vis) => {
    try { await V.banVisitor(vis.id, { banned: false, reason: '' }); flash(`${vis.name} unbanned.`); load(); }
    catch (e) { flash(e.message, true); }
  };

  const TABS = [
    { key:'dashboard', label:'Dashboard' },
    { key:'log',       label:'Visitor log' },
    { key:'overstay',  label:`Overstay${overstay.length > 0 ? ` (${overstay.length})` : ''}` },
    { key:'banned',    label:'Banned visitors' },
  ];

  const KPI_COLORS = { total_today:'var(--brand)', checked_in_now:'#1aa564', checked_out_today:'#605e5c', no_shows_today:'#ca5010', overstay:'#a4262c' };

  return (
    <>
      <div className="lv-tabs">
        {TABS.map((t) => <button key={t.key} className={`lv-tab ${tab===t.key?'active':''}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
        <button className="btn btn-ghost lv-apply" onClick={load}>{I.refresh} Refresh</button>
      </div>

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {!loading && tab === 'dashboard' && (
        <div style={{ padding:'12px 0' }}>
          <div className="vs-kpi-row">
            <KpiCard label="Visits today"         value={statsMap.total_today}      accent={KPI_COLORS.total_today} />
            <KpiCard label="Currently inside"     value={statsMap.checked_in_now}   accent={KPI_COLORS.checked_in_now} />
            <KpiCard label="Checked out today"    value={statsMap.checked_out_today} accent={KPI_COLORS.checked_out_today} />
            <KpiCard label="No-shows today"       value={statsMap.no_shows_today}   accent={KPI_COLORS.no_shows_today} />
            <KpiCard label="Overstay (4h+ inside)" value={statsMap.overstay}        accent={KPI_COLORS.overstay} warn />
          </div>
          {statsMap.overstay > 0 && (
            <div style={{ background:'#fff8f4', border:'1px solid #fde7c3', borderRadius:6, padding:'10px 14px', fontSize:13, color:'#8f3b00', marginBottom:16 }}>
              {I.alert} <strong>{statsMap.overstay}</strong> visitor{statsMap.overstay === 1 ? ' has' : 's have'} been inside for over 4 hours.
              <button className="btn btn-ghost" style={{ marginLeft:10, padding:'2px 10px', fontSize:12 }} onClick={() => setTab('overstay')}>View</button>
            </div>
          )}
          <h3 style={{ fontSize:14, color:'var(--text-2)', margin:'0 0 10px' }}>Recent activity</h3>
          <VisitsTable visits={visits.slice(0,10)} canAct={false} flash={flash} onRefresh={load} />
        </div>
      )}

      {!loading && tab === 'log' && (
        <>
          <div className="filterbar" style={{ marginTop:8 }}>
            <div className="cmd-search" style={{ marginLeft:'auto' }}>
              {I.search}
              <input placeholder="Search visitor, host, purpose, code…" value={q} onChange={(e) => setQ(e.target.value)} style={{ border:'none', outline:'none', background:'transparent', fontSize:13, marginLeft:6, width:220 }} />
            </div>
            <span className="count">{logView.length} record{logView.length===1?'':'s'}</span>
          </div>
          <VisitsTable visits={logView} canAct={false} flash={flash} onRefresh={load} />
        </>
      )}

      {!loading && tab === 'overstay' && (
        <>
          <p className="muted" style={{ fontSize:13, margin:'8px 0 12px' }}>Visitors who have been inside for more than 4 hours without checking out.</p>
          <VisitsTable visits={overstay} canAct flash={flash} onRefresh={load} emptyMsg="No overstay visitors." />
        </>
      )}

      {!loading && tab === 'banned' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Phone</th><th>Company</th><th>Reason</th><th></th></tr></thead>
            <tbody>
              {banned.length === 0 && <tr><td colSpan={5} className="td-empty">No banned visitors.</td></tr>}
              {banned.map((vis) => (
                <tr key={vis.id}>
                  <td style={{ fontWeight:500 }}>{vis.name}</td>
                  <td className="muted" style={{ fontSize:13 }}>{vis.phone}</td>
                  <td className="muted" style={{ fontSize:13 }}>{vis.company || '—'}</td>
                  <td className="muted" style={{ fontSize:13 }}>{vis.ban_reason || '—'}</td>
                  <td>
                    <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => unban(vis)}>Unban</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {banModal && (
        <BanModal visitor={banModal} onClose={() => setBanModal(null)} onDone={() => { setBanModal(null); load(); }} flash={flash} />
      )}
    </>
  );
}

/* ---- BanModal ------------------------------------------------------------- */
function BanModal({ visitor, onClose, onDone, flash }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy]     = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return flash('Reason is required.', true);
    setBusy(true);
    try { await V.banVisitor(visitor.id, { banned: true, reason }); flash(`${visitor.name} has been banned.`); onDone(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Ban visitor</h2>
          <button className="iconbtn dark" onClick={onClose}>{I.close}</button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <p style={{ fontSize:13, margin:'0 0 12px' }}>
            Banning <strong>{visitor.name}</strong> will block entry on all future code lookups.
          </p>
          <div className="field"><label>Reason *</label>
            <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus style={{ resize:'vertical', fontFamily:'inherit' }} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ background:'#a4262c' }} disabled={busy}>
              {busy ? <span className="spinner" /> : 'Ban visitor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================================
   Main VisitorsApp
   ========================================================================= */
export default function VisitorsApp({ access }) {
  const role = access?.role;
  const isManagement   = role === 'management' || role === 'manager';
  const isReceptionist = role === 'receptionist';
  const isSecurity     = role === 'security';

  const [toast, setToast] = useState(null);
  const flash = useCallback((msg, isErr = false) => {
    setToast({ msg, isErr });
    setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <div className="lv">
      <style>{CSS}</style>
      {isManagement   && <ManagementView   flash={flash} />}
      {isReceptionist && <ReceptionistView flash={flash} />}
      {isSecurity     && <SecurityView     flash={flash} />}
      {!isManagement && !isReceptionist && !isSecurity && <StaffView flash={flash} />}
      {toast && <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>}
    </div>
  );
}
