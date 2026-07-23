import { useCallback, useEffect, useState } from 'react';
import * as B from './benefitsApi.js';
import { apiGet } from '../../api/client.js';
import { useToast, useConfirm, Modal } from '../../components/ui.jsx';

function Field({ label, children }) { return <div className="field"><label>{label}</label>{children}</div>; }

function PlanModal({ plan, onClose, onSaved, flash }) {
  const [f, setF] = useState(() => plan
    ? { name: plan.name, type: plan.type, provider: plan.provider, notes: plan.notes }
    : { name: '', type: 'hmo', provider: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return flash('Plan name is required.', true);
    setBusy(true);
    try {
      const saved = plan ? await B.updatePlan(plan.id, f) : await B.createPlan(f);
      flash(plan ? 'Plan updated.' : 'Plan added.');
      onSaved(saved); onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title={plan ? 'Edit plan' : 'Add benefit plan'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Plan name *"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></Field>
        <Field label="Type">
          <select className="select" value={f.type} onChange={(e) => set('type', e.target.value)}>
            {Object.entries(B.PLAN_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Provider"><input className="input" value={f.provider} onChange={(e) => set('provider', e.target.value)} /></Field>
        <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></Field>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : plan ? 'Save changes' : 'Add plan'}</button>
        </div>
      </form>
    </Modal>
  );
}

function EnrollModal({ plans, enrollment = null, onClose, onSaved, flash }) {
  const [staff, setStaff] = useState([]);
  const [f, setF] = useState(() => enrollment
    ? { employeeId: enrollment.employee_id, planId: enrollment.plan?.id || enrollment.plan_id, memberId: enrollment.member_id || '', pfaName: enrollment.pfa_name || '', pfaPin: enrollment.pfa_pin || '', status: enrollment.status || 'active' }
    : { employeeId: '', planId: plans[0]?.id || '', memberId: '', pfaName: '', pfaPin: '', status: 'active' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => { if (!enrollment) apiGet('/staff').then((d) => setStaff(d.staff)).catch(() => flash('Could not load the staff list.', true)); }, []); // eslint-disable-line

  const selectedPlan = plans.find((p) => p.id === f.planId);

  const submit = async (e) => {
    e.preventDefault();
    if (!enrollment && (!f.employeeId || !f.planId)) return flash('Employee and plan are required.', true);
    setBusy(true);
    try {
      const saved = enrollment
        ? await B.updateEnrollment(enrollment.id, { memberId: f.memberId, pfaName: f.pfaName, pfaPin: f.pfaPin, status: f.status })
        : await B.enroll(f);
      flash(enrollment ? 'Enrollment updated.' : 'Employee enrolled.');
      onSaved(saved); onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title={enrollment ? `Edit enrollment — ${enrollment.employee?.name || ''}` : 'Enroll employee'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="form-grid">
          {!enrollment && (
          <Field label="Employee *">
            <select className="select" value={f.employeeId} onChange={(e) => set('employeeId', e.target.value)} required>
              <option value="">— Select —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          )}
          {enrollment && (
          <Field label="Status">
            <select className="select" value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          )}
          <Field label="Plan *">
            <select className="select" value={f.planId} onChange={(e) => set('planId', e.target.value)} required disabled={Boolean(enrollment)}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({B.PLAN_TYPES[p.type]})</option>)}
            </select>
          </Field>
          <Field label="Member / policy no."><input className="input" value={f.memberId} onChange={(e) => set('memberId', e.target.value)} /></Field>
          {selectedPlan?.type === 'pension' && (
            <>
              <Field label="PFA name"><input className="input" value={f.pfaName} onChange={(e) => set('pfaName', e.target.value)} /></Field>
              <Field label="RSA PIN"><input className="input" value={f.pfaPin} onChange={(e) => set('pfaPin', e.target.value)} /></Field>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Enroll'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function ManagerView({ flash }) {
  const [plans, setPlans] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('plans');
  const [planModal, setPlanModal] = useState(null);
  const [enrollModal, setEnrollModal] = useState(false);
  const [editEnrollment, setEditEnrollment] = useState(null);
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try { const [p, e] = await Promise.all([B.getPlans(), B.getEnrollments()]); setPlans(p); setEnrollments(e); }
    catch (e2) { flash(e2.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const removePlan = async (p) => {
    const ok = await confirm({
      title: 'Delete benefit plan',
      message: `${p.name} will be deleted, and every enrollment under this plan will be removed with it.`,
      confirmLabel: 'Delete plan',
      danger: true,
    });
    if (!ok) return;
    try { await B.deletePlan(p.id); flash('Plan deleted.'); load(); } catch (e) { flash(e.message, true); }
  };
  const removeEnrollment = async (en) => {
    const ok = await confirm({
      title: 'Remove enrollment',
      message: `${en.employee?.name} will be removed from ${en.plan?.name}.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try { await B.deleteEnrollment(en.id); flash('Enrollment removed.'); load(); } catch (e) { flash(e.message, true); }
  };

  return (
    <>
      <div className="lv-tabs">
        <button className={`lv-tab ${tab === 'plans' ? 'active' : ''}`} onClick={() => setTab('plans')}>Plans</button>
        <button className={`lv-tab ${tab === 'enrollments' ? 'active' : ''}`} onClick={() => setTab('enrollments')}>Enrollments</button>
        {tab === 'plans' && <button className="btn btn-primary lv-apply" onClick={() => setPlanModal('new')}>Add plan</button>}
        {tab === 'enrollments' && plans.length > 0 && <button className="btn btn-primary lv-apply" onClick={() => setEnrollModal(true)}>Enroll employee</button>}
      </div>

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {!loading && tab === 'plans' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Plan</th><th>Type</th><th>Provider</th><th></th></tr></thead>
            <tbody>
              {plans.length === 0 && <tr><td colSpan={4} className="td-empty">No benefit plans yet.</td></tr>}
              {plans.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{B.PLAN_TYPES[p.type]}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{p.provider || '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setPlanModal(p)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => removePlan(p)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'enrollments' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Employee</th><th>Plan</th><th>Member/Policy no.</th><th>PFA / RSA PIN</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {enrollments.length === 0 && <tr><td colSpan={6} className="td-empty">No enrollments yet.</td></tr>}
              {enrollments.map((en) => (
                <tr key={en.id}>
                  <td style={{ fontWeight: 500 }}>{en.employee?.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{en.plan?.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{en.member_id || '—'}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{en.pfa_name ? `${en.pfa_name}${en.pfa_pin ? ` · ${en.pfa_pin}` : ''}` : '—'}</td>
                  <td><span className={`st-pill ${en.status === 'active' ? 'st-success' : 'st-neutral'}`}>{en.status === 'active' ? 'On' : 'Off'}</span></td>
                  <td>
                    <div className="row-actions" style={{ display: 'inline-flex', gap: 6 }}>
                      {/* one-click switch — a contractor or intern just gets this benefit turned off */}
                      <button className="btn btn-ghost btn-sm" onClick={async () => {
                        try {
                          await B.updateEnrollment(en.id, { status: en.status === 'active' ? 'inactive' : 'active' });
                          flash(en.status === 'active' ? `${en.plan?.name} switched OFF for ${en.employee?.name}.` : `${en.plan?.name} switched on for ${en.employee?.name}.`);
                          load();
                        } catch (e) { flash(e.message, true); }
                      }}>{en.status === 'active' ? 'Switch off' : 'Switch on'}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditEnrollment(en)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeEnrollment(en)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(planModal === 'new' || (planModal && planModal !== 'new')) && (
        <PlanModal plan={planModal === 'new' ? null : planModal} onClose={() => setPlanModal(null)} onSaved={load} flash={flash} />
      )}
      {enrollModal && <EnrollModal plans={plans} onClose={() => setEnrollModal(false)} onSaved={load} flash={flash} />}
      {editEnrollment && <EnrollModal plans={plans} enrollment={editEnrollment} onClose={() => setEditEnrollment(null)} onSaved={load} flash={flash} />}
      {confirmNode}
    </>
  );
}

export function StaffView({ flash }) {
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    B.getMyBenefits().then(setMine).catch((e) => flash(e.message, true)).finally(() => setLoading(false));
  }, [flash]);

  if (loading) return <div className="suite-loading"><div className="boot-spinner" /></div>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Plan</th><th>Type</th><th>Provider</th><th>Member/Policy no.</th><th>PFA / RSA PIN</th><th>Enrolled</th></tr></thead>
        <tbody>
          {mine.length === 0 && <tr><td colSpan={6} className="td-empty">You are not enrolled in any benefit plans yet.</td></tr>}
          {mine.map((en) => (
            <tr key={en.id}>
              <td style={{ fontWeight: 500 }}>{en.plan?.name}</td>
              <td className="muted" style={{ fontSize: 13 }}>{B.PLAN_TYPES[en.plan?.type] || en.plan?.type}</td>
              <td className="muted" style={{ fontSize: 13 }}>{en.plan?.provider || '—'}</td>
              <td className="muted" style={{ fontSize: 13 }}>{en.member_id || '—'}</td>
              <td className="muted" style={{ fontSize: 13 }}>{en.pfa_name ? `${en.pfa_name}${en.pfa_pin ? ` · ${en.pfa_pin}` : ''}` : '—'}</td>
              <td className="muted" style={{ fontSize: 13 }}>{B.fmtDate(en.enrollment_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BenefitsApp({ access }) {
  const isManager = access?.role === 'manager';
  const { flash, toastNode } = useToast();
  return (
    <div className="lv">
      {isManager ? <ManagerView flash={flash} /> : <StaffView flash={flash} />}
      {toastNode}
    </div>
  );
}
