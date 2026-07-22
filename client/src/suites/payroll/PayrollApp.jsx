import { useEffect, useMemo, useState } from 'react';
import * as P from './payrollApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { EmptyState, Modal, searchMatcher, useConfirm, useToast } from '../../components/ui.jsx';
import CoachTour, { useCoachTour } from '../../components/CoachTour.jsx';

const I = {
  add:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  close:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  back:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>,
  expand: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>,
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 3v13M6 11l6 6 6-6"/><path d="M4 21h16"/></svg>,
};

const NG_STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT (Abuja)','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara'];

/* ---- SalaryModal ------------------------------------------------------------- */
function SalaryModal({ employee, structure = null, onClose, onSaved, onError }) {
  const { user } = useAuth();
  const [f, setF] = useState(() => structure
    ? { basic: String(structure.basic), housing: String(structure.housing), transport: String(structure.transport), otherAllowances: String(structure.other_allowances), annualRent: String(structure.annual_rent ?? 0), effectiveDate: structure.effective_date }
    : { basic:'', housing:'', transport:'', otherAllowances:'', annualRent:'', effectiveDate: new Date().toISOString().slice(0,10) });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const gross = ['basic','housing','transport','otherAllowances'].reduce((s, k) => s + (Number(f[k]) || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        employeeId: employee.id, basic: Number(f.basic) || 0, housing: Number(f.housing) || 0,
        transport: Number(f.transport) || 0, otherAllowances: Number(f.otherAllowances) || 0, annualRent: Number(f.annualRent) || 0, effectiveDate: f.effectiveDate,
      };
      if (structure) {
        // Correcting the latest structure — no new contract for a typo fix.
        onSaved(await P.updateSalaryStructure(structure.id, body));
      } else {
        const saved = await P.addSalaryStructure(body);
        // Every salary agreement generates a real contract document, filed
        // into the company's Documents — best-effort, never blocks the save.
        P.generateContractDocument({
          employeeId: employee.id, employeeName: employee.name, companyName: user?.org?.name || 'Collarone',
          jobTitle: employee.jobTitle, ...body,
        }).catch(() => {});
        onSaved(saved);
      }
    } catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={`New salary — ${employee.name}`} onClose={onClose}>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field"><label>Basic (₦/mo)</label>
              <input className="input" type="number" min="0" value={f.basic} onChange={(e) => set('basic', e.target.value)} required autoFocus /></div>
            <div className="field"><label>Housing (₦/mo)</label>
              <input className="input" type="number" min="0" value={f.housing} onChange={(e) => set('housing', e.target.value)} /></div>
          </div>
          <div className="form-grid">
            <div className="field"><label>Transport (₦/mo)</label>
              <input className="input" type="number" min="0" value={f.transport} onChange={(e) => set('transport', e.target.value)} /></div>
            <div className="field"><label>Other allowances (₦/mo)</label>
              <input className="input" type="number" min="0" value={f.otherAllowances} onChange={(e) => set('otherAllowances', e.target.value)} /></div>
          </div>
          <div className="form-grid">
            <div className="field"><label>Annual rent (₦/yr — rent relief)</label>
              <input className="input" type="number" min="0" value={f.annualRent} onChange={(e) => set('annualRent', e.target.value)} placeholder="0" /></div>
            <div className="field"><label>Effective date</label>
              <input className="input" type="date" value={f.effectiveDate} onChange={(e) => set('effectiveDate', e.target.value)} required /></div>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>2026 Tax Act: PAYE relief is 20% of declared annual rent, capped at ₦500,000. Leave 0 if none declared.</p>
          <p className="muted" style={{ fontSize:13, margin:'4px 0 12px' }}>Gross: <b>{P.money(gross)}</b> / month</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Save salary'}</button>
          </div>
        </form>
    </Modal>
  );
}

/* ---- BankModal ----------------------------------------------------------------- */
function BankModal({ employee, onClose, onSaved, onError }) {
  const [f, setF] = useState({ bankName:'', bankCode:'', accountNumber:'', accountName:'' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.bankName.trim() || !f.accountNumber.trim() || !f.accountName.trim()) return onError('Bank, account number and account name are required.');
    setBusy(true);
    try { onSaved(await P.addBankAccount({ employeeId: employee.id, ...f })); }
    catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Bank account — ${employee.name}`} onClose={onClose}>
        <form onSubmit={submit}>
          <div className="field"><label>Account name</label>
            <input className="input" value={f.accountName} onChange={(e) => set('accountName', e.target.value)} required autoFocus /></div>
          <div className="form-grid">
            <div className="field"><label>Bank name</label>
              <input className="input" value={f.bankName} onChange={(e) => set('bankName', e.target.value)} required /></div>
            <div className="field"><label>Bank code</label>
              <input className="input" value={f.bankCode} onChange={(e) => set('bankCode', e.target.value)} placeholder="e.g. 058" /></div>
          </div>
          <div className="field"><label>Account number</label>
            <input className="input" value={f.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} required /></div>
          <p className="muted" style={{ fontSize:12, margin:'4px 0 12px' }}>Set as the primary account — used for the next payroll run.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Save account'}</button>
          </div>
        </form>
    </Modal>
  );
}

/* ---- EmployeeRow (expandable) --------------------------------------------------- */
function EmployeeRow({ emp, onFlash, isPayrollManager }) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [salaryModal, setSalaryModal] = useState(false);
  const [editStructure, setEditStructure] = useState(null);
  const { confirm, confirmNode } = useConfirm();

  const removeAccount = async (a) => {
    const ok = await confirm({ title: 'Remove bank account', danger: true, confirmLabel: 'Remove',
      message: `${a.bank_name} ·${' '}${a.account_number} will be removed from ${emp.name}'s record.` });
    if (!ok) return;
    try { await P.deleteBankAccount(a.id); setAccounts((l) => (l || []).filter((x) => x.id !== a.id)); onFlash('Bank account removed.'); }
    catch (e) { onFlash(e.message, true); }
  };
  const [bankModal, setBankModal] = useState(false);
  const [state, setState] = useState(emp.stateOfResidence || '');

  const load = () => {
    P.getSalaryHistory(emp.id).then(setHistory).catch((e) => onFlash(e.message, true));
    P.getBankAccounts(emp.id).then(setAccounts).catch((e) => onFlash(e.message, true));
  };
  useEffect(() => { if (expanded && history === null) load(); }, [expanded]); // eslint-disable-line

  const saveState = async (v) => {
    setState(v);
    try { await P.setEmployeeState(emp.id, v); } catch (e) { onFlash(e.message, true); }
  };

  const current = history?.[0];

  return (
    <>
      <tr>
        <td>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button className="iconbtn" onClick={() => setExpanded((v) => !v)} aria-label="Expand"
              style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition:'transform .15s' }}>{I.expand}</button>
            <div>
              <div style={{ fontWeight:500 }}>{emp.name}</div>
              <div className="muted" style={{ fontSize:12 }}>{emp.email}</div>
            </div>
          </div>
        </td>
        <td className="muted" style={{ fontSize:13 }}>{emp.deptName || '—'}</td>
        <td>
          {isPayrollManager ? (
            <select className="select" value={state} onChange={(e) => saveState(e.target.value)} style={{ fontSize:13, padding:'3px 8px', height:'auto' }}>
              <option value="">— Not set —</option>
              {NG_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : <span className="muted" style={{ fontSize:13 }}>{state || '—'}</span>}
        </td>
      </tr>
      {expanded && (
        <tr><td colSpan={3} style={{ padding:'0 16px 16px', background:'var(--surface)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginTop:10 }}>
            <div>
              <div className="lc-checklist-head"><span style={{ fontSize:13, fontWeight:600 }}>Salary history</span>
                {isPayrollManager && <button className="btn btn-primary" style={{ fontSize:12, padding:'3px 12px' }} onClick={() => setSalaryModal(true)}>{I.add} New</button>}</div>
              {history === null ? <div className="boot-spinner" style={{ width:16, height:16 }} /> : history.length === 0 ? (
                <p className="muted" style={{ fontSize:13 }}>No salary on file.</p>
              ) : history.map((h, i) => (
                <div key={h.id} className="lc-interview-card" style={{ opacity: i === 0 ? 1 : .7 }}>
                  <div style={{ fontSize:13 }}>
                    <b>{P.money(h.basic + h.housing + h.transport + h.other_allowances)}</b> gross/mo
                    {i === 0 && <span className="lc-badge lc-exit-done" style={{ marginLeft:8 }}>Current</span>}
                  </div>
                  <div className="muted" style={{ fontSize:12, marginTop:2 }}>
                    Basic {P.money(h.basic)} · Housing {P.money(h.housing)} · Transport {P.money(h.transport)} · Other {P.money(h.other_allowances)}
                  </div>
                  <div className="muted" style={{ fontSize:11, marginTop:2 }}>Effective {new Date(h.effective_date).toLocaleDateString('en-GB')}</div>
                  {i === 0 && isPayrollManager && (
                    <button className="btn btn-ghost btn-sm" style={{ marginTop:6, fontSize:12 }} onClick={() => setEditStructure(h)}>Edit</button>
                  )}
                </div>
              ))}
            </div>
            <div>
              <div className="lc-checklist-head"><span style={{ fontSize:13, fontWeight:600 }}>Bank accounts</span>
                {isPayrollManager && <button className="btn btn-primary" style={{ fontSize:12, padding:'3px 12px' }} onClick={() => setBankModal(true)}>{I.add} New</button>}</div>
              {accounts === null ? <div className="boot-spinner" style={{ width:16, height:16 }} /> : accounts.length === 0 ? (
                <p className="muted" style={{ fontSize:13 }}>No bank account on file.</p>
              ) : accounts.map((a) => (
                <div key={a.id} className="lc-interview-card">
                  <div style={{ fontSize:13, fontWeight:500 }}>{a.account_name} {a.is_primary && <span className="lc-badge lc-exit-done" style={{ marginLeft:6 }}>Primary</span>}</div>
                  {/* The wall: full account numbers only for the bank liaison
                      (payroll manager); everyone else sees the last 4 digits. */}
                  <div className="muted" style={{ fontSize:12, marginTop:2 }}>{a.bank_name} ({a.bank_code || '—'}) · {isPayrollManager ? a.account_number : `••••${String(a.account_number).slice(-4)}`}</div>
                  {!a.is_primary && isPayrollManager && (
                    <button className="btn btn-danger btn-sm" style={{ marginTop:6, fontSize:12 }} onClick={() => removeAccount(a)}>Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </td></tr>
      )}
      {salaryModal && (
        <SalaryModal employee={emp} onClose={() => setSalaryModal(false)}
          onSaved={(s) => { setHistory((h) => [s, ...(h || [])]); setSalaryModal(false); onFlash('Salary structure saved.'); }}
          onError={(m) => onFlash(m, true)} />
      )}
      {editStructure && (
        <SalaryModal employee={emp} structure={editStructure} onClose={() => setEditStructure(null)}
          onSaved={(s) => { setHistory((h) => (h || []).map((x) => (x.id === s.id ? s : x))); setEditStructure(null); onFlash('Salary structure corrected.'); }}
          onError={(m) => onFlash(m, true)} />
      )}
      {confirmNode}
      {bankModal && (
        <BankModal employee={emp} onClose={() => setBankModal(false)}
          onSaved={(a) => { setAccounts((l) => [a, ...(l || []).map((x) => a.is_primary ? { ...x, is_primary:false } : x)]); setBankModal(false); onFlash('Bank account saved.'); }}
          onError={(m) => onFlash(m, true)} />
      )}
    </>
  );
}

/* ---- EmployeesTab ---------------------------------------------------------------- */
function EmployeesTab({ flash, isPayrollManager }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => { P.getEmployees().then(setEmployees).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); }, []); // eslint-disable-line

  const view = useMemo(() => {
    const match = searchMatcher(q);
    return employees.filter((e) => match(e.name, e.email));
  }, [employees, q]);

  if (loading) return <div className="suite-loading"><div className="boot-spinner" /></div>;
  return (
    <>
      <div className="filterbar" style={{ marginTop:8 }}>
        <div className="cmd-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8886" strokeWidth="1.7" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
          <input placeholder="Search employees" value={q} onChange={(e) => setQ(e.target.value)}
            style={{ border:'none', outline:'none', background:'transparent', fontSize:13, marginLeft:6, width:180 }} />
        </div>
        <span className="count" style={{ marginLeft:'auto' }}>{view.length} of {employees.length}</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Employee</th><th>Department</th><th>State of residence</th></tr></thead>
          <tbody>
            {view.length === 0 && <tr><td colSpan={3} className="td-empty">No employees found.</td></tr>}
            {view.map((e) => <EmployeeRow key={e.id} emp={e} onFlash={flash} isPayrollManager={isPayrollManager} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---- RatesTab: PAYE bands + deduction rates, editable, no code deploy needed ------ */
function RatesTab({ flash, isPayrollManager }) {
  const [rates, setRates] = useState(null);
  const [bands, setBands] = useState(null);

  const load = () => { P.getRates().then((d) => { setRates(d.deductionRates); setBands(d.payeBands); }).catch((e) => flash(e.message, true)); };
  useEffect(load, []); // eslint-disable-line

  const saveRate = async (key, value) => {
    try { const updated = await P.updateDeductionRate(key, value); setRates((rs) => rs.map((r) => (r.key === updated.key ? updated : r))); flash('Rate updated.'); }
    catch (e) { flash(e.message, true); }
  };
  const saveBand = async (id, patch) => {
    try { const updated = await P.updatePayeBand(id, patch); setBands((bs) => bs.map((b) => (b.id === updated.id ? updated : b))); flash('Band updated.'); }
    catch (e) { flash(e.message, true); }
  };

  if (rates === null) return <div className="suite-loading"><div className="boot-spinner" /></div>;

  return (
    <div style={{ marginTop: 8 }}>
      <div className="callout-hint">
        These drive every payroll calculation. Editing a rate or band takes effect on the <b>next</b> run generated — it never rewrites a run already created. Verify against current Nigerian tax/statutory guidance before changing.
      </div>

      <h3 style={{ fontSize: 14, margin: '18px 0 8px' }}>Statutory deduction rates</h3>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Deduction</th><th>Basis</th><th>Rate</th></tr></thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className="muted" style={{ fontSize: 13, textTransform: 'capitalize' }}>{r.basis}</td>
                <td>
                  {isPayrollManager ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input className="input" type="number" step="0.001" min="0" max="1" defaultValue={r.rate}
                        style={{ width: 90, fontSize: 13, padding: '4px 8px', height: 'auto' }}
                        onBlur={(e) => Number(e.target.value) !== Number(r.rate) && saveRate(r.key, Number(e.target.value))} />
                      <span className="muted" style={{ fontSize: 12 }}>({(r.rate * 100).toFixed(1)}%)</span>
                    </div>
                  ) : `${(r.rate * 100).toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 14, margin: '22px 0 8px' }}>PAYE bands (annual, graduated)</h3>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>From</th><th>To</th><th>Rate</th></tr></thead>
          <tbody>
            {bands.map((b) => (
              <tr key={b.id}>
                <td className="muted" style={{ fontSize: 13 }}>{P.money(b.min_annual)}</td>
                <td className="muted" style={{ fontSize: 13 }}>{b.max_annual == null ? 'No limit' : P.money(b.max_annual)}</td>
                <td>
                  {isPayrollManager ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input className="input" type="number" step="0.001" min="0" max="1" defaultValue={b.rate}
                        style={{ width: 90, fontSize: 13, padding: '4px 8px', height: 'auto' }}
                        onBlur={(e) => Number(e.target.value) !== Number(b.rate) && saveBand(b.id, { rate: Number(e.target.value) })} />
                      <span className="muted" style={{ fontSize: 12 }}>({(b.rate * 100).toFixed(1)}%)</span>
                    </div>
                  ) : `${(b.rate * 100).toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---- RunDetail ------------------------------------------------------------------- */
function RunDetail({ run, onBack, onUpdated, onDeleted, flash, isPayrollManager }) {
  const [lines, setLines] = useState(null);
  const [busy, setBusy] = useState(false);
  const { confirm, confirmNode } = useConfirm();

  const load = () => { P.getRunLines(run.id).then(setLines).catch((e) => flash(e.message, true)); };
  useEffect(load, [run.id]); // eslint-disable-line

  const totals = useMemo(() => {
    if (!lines) return null;
    return lines.reduce((t, l) => ({
      gross: t.gross + Number(l.gross), net: t.net + Number(l.net),
      paye: t.paye + Number(l.paye), pension: t.pension + Number(l.pension_employee) + Number(l.pension_employer),
    }), { gross:0, net:0, paye:0, pension:0 });
  }, [lines]);

  const act = async (action, extra) => {
    setBusy(true);
    try { onUpdated(await P.runAction(run.id, action, extra)); flash(`Run ${action === 'reopen' ? 'reopened' : action + 'd'}.`); }
    catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  const editDeduction = async (line, value) => {
    try { const updated = await P.updateLine(line.id, { otherDeductions: value }); setLines((ls) => ls.map((l) => (l.id === updated.id ? updated : l))); }
    catch (e) { flash(e.message, true); }
  };

  const period = `${P.MONTHS[run.period_month - 1]} ${run.period_year}`;

  const approveRun = async () => {
    const ok = await confirm({
      title: 'Approve this run?',
      message: `Approve the ${period} run? Figures are locked in for release — you can still reopen it before payslips go out.`,
      confirmLabel: 'Approve',
    });
    if (ok) act('approve');
  };

  const releaseRun = async () => {
    const ok = await confirm({
      title: 'Release payslips?',
      message: `Release the ${period} payslips? They become visible to every employee on the run immediately.`,
      confirmLabel: 'Release payslips',
    });
    if (ok) act('release');
  };

  const disburseRun = async () => {
    const res = await confirm({
      title: 'Mark disbursed?',
      message: `Mark the ${period} run as paid out. This is the final state of a run.`,
      confirmLabel: 'Mark disbursed',
      input: { label: 'Bank/transfer reference', placeholder: 'Optional', required: false },
    });
    if (res) act('disburse', { reference: res.value });
  };

  const reopenRun = async () => {
    const ok = await confirm({
      title: 'Reopen this run?',
      message: `Reopen the ${period} run? It moves back to draft so lines can be edited before approving again.`,
      confirmLabel: 'Reopen',
    });
    if (ok) act('reopen');
  };

  const removeDraft = async () => {
    const ok = await confirm({
      title: 'Delete this draft?',
      message: `Delete the ${period} draft? This can't be undone.`,
      confirmLabel: 'Delete draft',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try { await P.deleteRun(run.id); onDeleted(run.id); flash('Draft deleted.'); }
    catch (e) { flash(e.message, true); setBusy(false); }
  };

  const st = P.RUN_STATUS[run.status];
  const editable = isPayrollManager && (run.status === 'draft' || run.status === 'review');
  const missingBank = lines?.filter((l) => !l.bank_snapshot?.accountNumber) || [];
  // Payment tracking only makes sense once the run is handed to the bank.
  const payable = run.status === 'approved' || run.status === 'released' || run.status === 'disbursed';
  const setPayment = async (l, status) => {
    let note = '';
    if (status === 'failed') {
      note = window.prompt('Why did this payment fail? (e.g. wrong account number)') || '';
      if (note === '' && !window.confirm('Mark as failed without a note?')) return;
    }
    try {
      const updated = await P.updateLine(l.id, { paymentStatus: status, paymentNote: note });
      setLines((s2) => s2.map((x) => (x.id === l.id ? updated : x)));
    } catch (e) { flash(e.message, true); }
  };

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        <button className="iconbtn" onClick={onBack} aria-label="Back">{I.back}</button>
        <div>
          <h2 style={{ margin:0, fontSize:19 }}>{P.MONTHS[run.period_month - 1]} {run.period_year}</h2>
          <span className={`lc-badge ${st.cls}`}>{st.label}</span>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, flexWrap:'wrap' }}>
          {isPayrollManager && run.status === 'draft'   && <button className="btn btn-primary" disabled={busy} onClick={approveRun}>Approve</button>}
          {isPayrollManager && run.status === 'approved'&& <button className="btn btn-primary" disabled={busy} onClick={releaseRun}>Release payslips</button>}
          {isPayrollManager && run.status === 'released'&& (
            <button className="btn btn-primary" disabled={busy} onClick={disburseRun}>Mark disbursed</button>
          )}
          {isPayrollManager && (run.status === 'approved' || run.status === 'released' || run.status === 'disbursed') && lines?.length > 0 && (
            <button className="btn btn-ghost" onClick={() => P.exportBankCsv(run, lines)}>{I.download} Export bank CSV</button>
          )}
          {isPayrollManager && run.status !== 'draft' && run.status !== 'disbursed' && (
            <button className="btn btn-ghost" disabled={busy} onClick={reopenRun}>Reopen</button>
          )}
          {isPayrollManager && run.status === 'draft' && (
            <button className="btn btn-ghost danger-icon" disabled={busy} onClick={removeDraft}>Delete draft</button>
          )}
        </div>
      </div>

      {isPayrollManager && missingBank.length > 0 && (
        <div className="callout-hint">{missingBank.length} employee{missingBank.length>1?'s':''} on this run have no bank account on file — their CSV row will be blank. Add one from the Employees tab before disbursing.</div>
      )}

      {totals && (
        <div className="tk-kpi-row" style={{ margin:'8px 0 16px' }}>
          <div className="tk-kpi"><div className="tk-kpi-val">{P.money(totals.gross)}</div><div className="tk-kpi-label">Total gross</div></div>
          <div className="tk-kpi"><div className="tk-kpi-val">{P.money(totals.paye)}</div><div className="tk-kpi-label">Total PAYE</div></div>
          <div className="tk-kpi"><div className="tk-kpi-val">{P.money(totals.pension)}</div><div className="tk-kpi-label">Total pension (both sides)</div></div>
          <div className="tk-kpi"><div className="tk-kpi-val">{P.money(totals.net)}</div><div className="tk-kpi-label">Total net payout</div></div>
        </div>
      )}

      {lines === null ? <div className="suite-loading"><div className="boot-spinner" /></div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Employee</th><th>Gross</th><th>Pension</th><th>NHF</th><th>PAYE</th><th>Other ded.</th><th>Net</th>{payable && <th>Payment</th>}</tr></thead>
            <tbody>
              {lines.length === 0 && <tr><td colSpan={7} className="td-empty">No lines — every active employee is missing a salary structure.</td></tr>}
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.employee?.name}</td>
                  <td className="muted" style={{ fontSize:13 }}>{P.money(l.gross)}</td>
                  <td className="muted" style={{ fontSize:13 }}>{P.money(l.pension_employee)}</td>
                  <td className="muted" style={{ fontSize:13 }}>{P.money(l.nhf)}</td>
                  <td className="muted" style={{ fontSize:13 }}>{P.money(l.paye)}</td>
                  <td>
                    {editable ? (
                      <input className="input" type="number" min="0" defaultValue={l.other_deductions}
                        onBlur={(e) => Number(e.target.value) !== Number(l.other_deductions) && editDeduction(l, Number(e.target.value) || 0)}
                        style={{ width:100, fontSize:13, padding:'3px 8px', height:'auto' }} />
                    ) : P.money(l.other_deductions)}
                  </td>
                  <td style={{ fontWeight:600 }}>{P.money(l.net)}</td>
                  {payable && (
                    <td>
                      {l.payment_status === 'paid' && <span style={{ fontSize:11, fontWeight:700, background:'#dff6dd', color:'#1a6a1a', borderRadius:100, padding:'2px 10px' }}>PAID</span>}
                      {l.payment_status === 'failed' && <span title={l.payment_note} style={{ fontSize:11, fontWeight:700, background:'#fde7e9', color:'#a4262c', borderRadius:100, padding:'2px 10px' }}>FAILED{l.payment_note ? ' *' : ''}</span>}
                      {(!l.payment_status || l.payment_status === 'pending') && <span className="muted" style={{ fontSize:11.5 }}>pending</span>}
                      {isPayrollManager && l.payment_status !== 'paid' && (
                        <button className="btn btn-ghost" style={{ fontSize:11, padding:'1px 8px', marginLeft:6 }} onClick={() => setPayment(l, 'paid')}>Paid</button>
                      )}
                      {isPayrollManager && l.payment_status !== 'failed' && (
                        <button className="btn btn-ghost" style={{ fontSize:11, padding:'1px 8px', color:'#a4262c' }} onClick={() => setPayment(l, 'failed')}>Failed</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmNode}
    </div>
  );
}

/* ---- GenerateModal ---------------------------------------------------------------- */
function GenerateModal({ onClose, onSaved, onError }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { onSaved(await P.generateRun(Number(month), Number(year))); }
    catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="New payroll run" onClose={onClose}>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field"><label>Month</label>
              <select className="select" value={month} onChange={(e) => setMonth(e.target.value)}>
                {P.MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select></div>
            <div className="field"><label>Year</label>
              <input className="input" type="number" value={year} onChange={(e) => setYear(e.target.value)} required /></div>
          </div>
          <p className="muted" style={{ fontSize:13, margin:'4px 0 12px' }}>Pulls the current salary structure for every active employee and computes statutory deductions. You can still edit or reopen before releasing.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Generate'}</button>
          </div>
        </form>
    </Modal>
  );
}

/* ---- Banking Wall ------------------------------------------------------------------- */
// A running feed so whoever liaises with the bank always knows: which
// employees are newly added to payroll (bank needs their details for the
// first time) and which runs just got approved (ready to hand to the bank).
function BankWallTab({ flash }) {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  const load = () => { setLoading(true); P.getBankWall().then(setActions).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line

  // The wall hands the liaison the actual thing the bank needs — the same
  // schedule the run-detail export produces, one click from the queue.
  const [downloading, setDownloading] = useState(null);
  const downloadSchedule = async (a) => {
    setDownloading(a.id);
    try {
      const lines = await P.getRunLines(a.run.id);
      P.exportBankCsv(a.run, lines);
    } catch (e) { flash(e.message, true); } finally { setDownloading(null); }
  };

  const mark = async (a, status) => {
    try { await P.markBankAction(a.id, status); flash(status === 'actioned' ? 'Marked as actioned.' : 'Reopened.'); load(); }
    catch (e) { flash(e.message, true); }
  };

  const view = filter === 'all' ? actions : actions.filter((a) => a.status === filter);

  return (
    <>
      <div className="lv-tabs" style={{ marginTop: 8 }}>
        <button className={`lv-tab ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>Pending</button>
        <button className={`lv-tab ${filter === 'actioned' ? 'active' : ''}`} onClick={() => setFilter('actioned')}>Actioned</button>
        <button className={`lv-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
      </div>
      {loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : (
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="table">
            <thead><tr><th>Type</th><th>Who / What</th><th>Logged</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {view.length === 0 && <tr><td colSpan={5} className="td-empty">Nothing here.</td></tr>}
              {view.map((a) => (
                <tr key={a.id}>
                  <td>{{ new_employee: 'New payroll addition', account_changed: 'Bank account changed', run_approved: 'Run approved' }[a.action_type] || a.action_type}</td>
                  <td style={{ fontWeight: 500 }}>
                    {a.action_type === 'run_approved' ? `${P.MONTHS[(a.run?.period_month || 1) - 1]} ${a.run?.period_year}` : a.employee?.name}
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>{P.fmtDt(a.created_at)}</td>
                  <td>
                    <span className={`lc-badge ${a.status === 'actioned' ? 'lc-req-filled' : 'lc-req-draft'}`}>
                      {a.status === 'actioned' ? `Actioned by ${a.actionedBy?.name || ''}` : 'Pending'}
                    </span>
                  </td>
                  <td style={{ display:'flex', gap:8, alignItems:'center' }}>
                    {a.action_type === 'run_approved' && a.run?.id && (
                      <button className="iconbtn" disabled={downloading === a.id} onClick={() => downloadSchedule(a)}>
                        {downloading === a.id ? 'Preparing…' : 'Download bank schedule'}
                      </button>
                    )}
                    {a.status === 'pending'
                      ? <button className="iconbtn" onClick={() => mark(a, 'actioned')}>Mark actioned</button>
                      : <button className="iconbtn" onClick={() => mark(a, 'pending')}>Reopen</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---- Loans & advances ---------------------------------------------------------------- */
function LoanModal({ isPayrollManager, employees, meId, onClose, onSaved, flash }) {
  const [f, setF] = useState({ employeeId: '', loanType: 'loan', principal: '', monthlyInstallment: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const months = Number(f.principal) > 0 && Number(f.monthlyInstallment) > 0
    ? Math.ceil(Number(f.principal) / Number(f.monthlyInstallment)) : 0;

  const submit = async (e) => {
    e.preventDefault();
    if (Number(f.monthlyInstallment) > Number(f.principal)) return flash('The installment cannot exceed the amount.', true);
    setBusy(true);
    try {
      const saved = await P.requestLoan({ ...f, employeeId: f.employeeId || meId, principal: Number(f.principal), monthlyInstallment: Number(f.monthlyInstallment) });
      flash('Request submitted — it takes effect once approved.');
      onSaved(saved); onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title="New loan / salary advance" onClose={onClose}>
      <form onSubmit={submit}>
        {isPayrollManager && employees.length > 0 && (
          <div className="field"><label>Employee</label>
            <select className="select" value={f.employeeId} onChange={(e) => set('employeeId', e.target.value)}>
              <option value="">Myself</option>
              {employees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
        <div className="form-grid">
          <div className="field"><label>Type</label>
            <select className="select" value={f.loanType} onChange={(e) => set('loanType', e.target.value)}>
              <option value="loan">Staff loan</option>
              <option value="advance">Salary advance</option>
            </select>
          </div>
          <div className="field"><label>Amount (₦) *</label><input className="input" type="number" min="1" value={f.principal} onChange={(e) => set('principal', e.target.value)} required autoFocus /></div>
          <div className="field"><label>Monthly deduction (₦) *</label><input className="input" type="number" min="1" value={f.monthlyInstallment} onChange={(e) => set('monthlyInstallment', e.target.value)} required /></div>
        </div>
        {months > 0 && <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>Repaid over about {months} payroll run{months > 1 ? 's' : ''}, deducted automatically from net pay.</p>}
        <div className="field"><label>Reason</label><input className="input" value={f.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Optional" /></div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Submit request'}</button>
        </div>
      </form>
    </Modal>
  );
}

function LoansTab({ flash, isPayrollManager }) {
  const { user } = useAuth();
  const [loans, setLoans] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const { confirm, confirmNode } = useConfirm();

  const load = () => {
    setLoading(true);
    Promise.all([P.getLoans(), isPayrollManager ? P.getEmployees().catch(() => []) : Promise.resolve([])])
      .then(([l, e]) => { setLoans(l); setEmployees(e); })
      .catch((e) => flash(e.message, true)).finally(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line

  const decide = async (loan, decision) => {
    if (decision === 'cancel') {
      const ok = await confirm({ title: 'Cancel this loan?', message: 'Future payroll runs will stop deducting it. Recorded repayments stay.', confirmLabel: 'Cancel loan', danger: true });
      if (!ok) return;
    }
    try {
      const saved = await P.decideLoan(loan.id, decision);
      flash(decision === 'approve' ? 'Approved — deductions start with the next payroll run.' : `Loan ${decision === 'reject' ? 'rejected' : 'cancelled'}.`);
      setLoans((ls) => ls.map((x) => (x.id === saved.id ? { ...x, ...saved } : x)));
    } catch (e) { flash(e.message, true); }
  };

  if (loading) return <div className="suite-loading"><div className="boot-spinner" /></div>;

  const active = loans.filter((l) => l.status === 'active');
  const outstanding = active.reduce((s, l) => s + P.loanBalance(l), 0);

  return (
    <>
      {confirmNode}
      <div className="tk-kpi-row" style={{ marginBottom: 16 }}>
        <div className="tk-kpi"><div className="tk-kpi-val">{active.length}</div><div className="tk-kpi-label">Active loans</div></div>
        <div className="tk-kpi"><div className="tk-kpi-val">{P.money(outstanding)}</div><div className="tk-kpi-label">Outstanding balance</div></div>
        <div className="tk-kpi"><div className="tk-kpi-val">{loans.filter((l) => l.status === 'pending').length}</div><div className="tk-kpi-label">Awaiting approval</div></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn btn-primary" onClick={() => setModal(true)}>{isPayrollManager ? 'New loan / advance' : 'Request loan / advance'}</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Employee</th><th>Type</th><th>Amount</th><th>Monthly</th><th>Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loans.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 0 }}>
                <EmptyState title="No loans or advances" hint="Approved loans are deducted from net pay automatically on every payroll run until repaid." />
              </td></tr>
            )}
            {loans.map((l) => {
              const st = P.LOAN_STATUS[l.status] || P.LOAN_STATUS.pending;
              return (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500 }}>{l.employee?.name || '—'}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{l.loan_type === 'advance' ? 'Advance' : 'Loan'}</td>
                  <td style={{ fontSize: 13 }}>{P.money(l.principal)}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{P.money(l.monthly_installment)}</td>
                  <td style={{ fontSize: 13, fontWeight: l.status === 'active' ? 650 : 400 }}>{['active', 'closed'].includes(l.status) ? P.money(P.loanBalance(l)) : '—'}</td>
                  <td><span className={`lc-badge ${st.cls}`}>{st.label}</span></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {isPayrollManager && l.status === 'pending' && (
                      <>
                        <button className="iconbtn" onClick={() => decide(l, 'approve')}>Approve</button>
                        <button className="iconbtn danger-icon" onClick={() => decide(l, 'reject')}>Reject</button>
                      </>
                    )}
                    {isPayrollManager && l.status === 'active' && (
                      <button className="iconbtn danger-icon" onClick={() => decide(l, 'cancel')}>Cancel</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {modal && <LoanModal isPayrollManager={isPayrollManager} employees={employees} meId={user?.id}
        onClose={() => setModal(false)} onSaved={(l) => setLoans((ls) => [l, ...ls])} flash={flash} />}
    </>
  );
}

/* ---- Main PayrollApp ---------------------------------------------------------------- */
export default function PayrollApp({ access }) {
  const isPayrollManager = access?.role === 'manager';
  const [tab, setTab] = useState('runs');
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openRun, setOpenRun] = useState(null);
  const [modal, setModal] = useState(false);
  const { flash, toastNode } = useToast();

  const load = () => { setLoading(true); P.getRuns().then(setRuns).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line

  // First-visit product tour (managers) — reshow anytime via the Tour button.
  const tour = useCoachTour(isPayrollManager ? 'tour-payroll-v1' : null);
  const TOUR_STEPS = [
    { title: 'Payroll, end to end', body: 'This suite runs Nigerian payroll on the 2026 Tax Act rules — new PAYE bands, the ₦800,000 exemption and rent relief. This one-minute tour shows how a month gets paid.' },
    { selector: '[data-tour="pr-employees"]', title: '1 · Set people up', body: 'Give each employee a salary structure (basic, housing, transport, allowances — plus their declared annual rent for rent relief) and their bank account. Everything else is computed from this.' },
    { selector: '[data-tour="pr-runs"]', title: '2 · Run the month', body: 'Generate a run and every active employee is computed in one go — gross, PAYE, pension, NHF, loan deductions, net. Review it, approve it, release payslips to staff, then mark it disbursed once the bank pays.' },
    { selector: '[data-tour="pr-rates"]', title: 'Your rates, your rules', body: "These are your organization's own PAYE bands and deduction rates — already on the 2026 Tax Act schedule. If a regulator circular changes a number, edit it here and the next run uses it." },
    { selector: '[data-tour="pr-loans"]', title: 'Loans & advances', body: 'Approve a staff loan or salary advance and it repays itself — deducted from net pay on every run until cleared, with the balance visible the whole way.' },
    { selector: '[data-tour="pr-bankwall"]', title: 'The Banking Wall', body: "Collarone never touches your bank account. This queue is for whoever liaises with the bank: new staff accounts, CHANGED accounts, and approved runs with a downloadable payment schedule. Mark each item actioned once the bank has it — nothing slips." },
  ];

  const upsertRun = (r) => { setRuns((l) => { const i = l.findIndex((x) => x.id === r.id); return i >= 0 ? l.map((x) => (x.id === r.id ? r : x)) : [r, ...l]; }); setOpenRun(r); };

  if (openRun) return (
    <div className="lv"><style>{PAYROLL_CSS}</style>
      <RunDetail run={openRun} onBack={() => { setOpenRun(null); load(); }} onUpdated={upsertRun}
        onDeleted={(id) => { setRuns((l) => l.filter((x) => x.id !== id)); setOpenRun(null); }}
        flash={flash} isPayrollManager={isPayrollManager} />
      {toastNode}
    </div>
  );

  return (
    <div className="lv">
      <style>{PAYROLL_CSS}</style>
      <div className="lv-tabs">
        <button data-tour="pr-runs" className={`lv-tab ${tab === 'runs' ? 'active' : ''}`} onClick={() => setTab('runs')}>Payroll runs</button>
        <button data-tour="pr-employees" className={`lv-tab ${tab === 'employees' ? 'active' : ''}`} onClick={() => setTab('employees')}>Employees</button>
        <button data-tour="pr-rates" className={`lv-tab ${tab === 'rates' ? 'active' : ''}`} onClick={() => setTab('rates')}>Rates</button>
        <button data-tour="pr-loans" className={`lv-tab ${tab === 'loans' ? 'active' : ''}`} onClick={() => setTab('loans')}>Loans &amp; advances</button>
        {isPayrollManager && <button data-tour="pr-bankwall" className={`lv-tab ${tab === 'bankwall' ? 'active' : ''}`} onClick={() => setTab('bankwall')}>Banking Wall</button>}
        {isPayrollManager && <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={tour.start}>Tour</button>}
        {isPayrollManager && tab === 'runs' && <button className="btn btn-primary lv-apply" onClick={() => setModal(true)}>{I.add} New run</button>}
      </div>

      {tab === 'runs' && (
        loading ? <div className="suite-loading"><div className="boot-spinner" /></div> : (
          <div className="table-wrap" style={{ marginTop:8 }}>
            <table className="table">
              <thead><tr><th>Period</th><th>Status</th><th>Approved by</th><th>Disbursed</th></tr></thead>
              <tbody>
                {runs.length === 0 && (
                  <tr><td colSpan={4}>
                    <EmptyState title="No payroll runs yet"
                      hint="Generate a run to compute gross pay and statutory deductions for every active employee." />
                  </td></tr>
                )}
                {runs.map((r) => {
                  const st = P.RUN_STATUS[r.status];
                  return (
                    <tr key={r.id}>
                      <td><a href="#" onClick={(e) => { e.preventDefault(); setOpenRun(r); }} style={{ fontWeight:500, textDecoration:'none', color:'inherit' }}>{P.MONTHS[r.period_month - 1]} {r.period_year}</a></td>
                      <td><span className={`lc-badge ${st.cls}`}>{st.label}</span></td>
                      <td className="muted" style={{ fontSize:13 }}>{r.approvedBy?.name || '—'}</td>
                      <td className="muted" style={{ fontSize:13 }}>{r.disbursed_at ? P.fmtDt(r.disbursed_at) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'employees' && <EmployeesTab flash={flash} isPayrollManager={isPayrollManager} />}
      {tab === 'rates' && <RatesTab flash={flash} isPayrollManager={isPayrollManager} />}
      {tab === 'loans' && <LoansTab flash={flash} isPayrollManager={isPayrollManager} />}
      {tab === 'bankwall' && isPayrollManager && <BankWallTab flash={flash} />}

      <CoachTour steps={TOUR_STEPS} open={tour.open} onClose={tour.close} />

      {modal && (
        <GenerateModal onClose={() => setModal(false)}
          onSaved={(r) => { setModal(false); upsertRun(r); flash('Payroll run generated.'); }}
          onError={(m) => flash(m, true)} />
      )}
      {toastNode}
    </div>
  );
}

const PAYROLL_CSS = `
  .tk-kpi-row { display:flex; gap:14px; flex-wrap:wrap; }
  .tk-kpi { background:var(--surface); border:1px solid var(--line); border-top:3px solid var(--brand); border-radius:var(--radius-lg); padding:16px 20px; min-width:140px; flex:1; }
  .tk-kpi-val { font-size:22px; font-weight:700; line-height:1; margin-bottom:4px; }
  .tk-kpi-label { font-size:12px; color:var(--text-2); }
  .lc-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:700; }
  .lc-req-draft { background:#f3f2f1; color:#605e5c; }
  .lc-stage-interview { background:#f0e6ff; color:#4f00b3; }
  .lc-req-filled { background:#ddeeff; color:#004578; }
  .lc-exit-settled { background:#fff4e0; color:#8f3b00; }
  .lc-exit-done { background:#dff6dd; color:#1a6a1a; }
  .lc-checklist-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
  .lc-interview-card { background:#faf9f8; border:1px solid var(--line); border-radius:6px; padding:10px 12px; margin-top:8px; }
  .callout-hint { background:#fff4e0; border:1px solid #f0bea0; border-radius:6px; padding:10px 14px; font-size:13px; color:#8f3b00; margin:0 0 14px; }
  .danger-icon { color:#a4262c; }
  .danger-icon:hover { background:#fde7e9; }
`;
