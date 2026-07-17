import { useEffect, useState } from 'react';
import { apiGet } from '../../api/client.js';
import * as H from './hrApi.js';
import * as PERF from './performanceApi.js';
import * as C from './complianceApi.js';
import * as L from '../leave/leaveApi.js';

/* =========================================================================
   Employee 360 record — one page aggregating everything the platform knows
   about an employee across suites. Each section fetches independently and
   degrades gracefully: RLS decides what this viewer may see, so a section
   the viewer can't access shows a quiet note instead of breaking the page.
   HR-manager only (the directory opens the lightweight profile modal for
   everyone else).
   ========================================================================= */

const money = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');

const IC = {
  back:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>,
  mail:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 4h16v16H4z"/><path d="M4 6l8 7 8-7"/></svg>,
  phone: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .6 3a2 2 0 0 1-.5 2L8 10a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2-.5c1 .3 2 .5 3 .6a2 2 0 0 1 1.7 2z"/></svg>,
  edit:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2 2 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>,
};

/* Fetch one section independently; never let one failure break the page. */
function useSection(fetcher, deps) {
  const [s, setS] = useState({ loading: true, error: null, data: null });
  useEffect(() => {
    let on = true;
    setS({ loading: true, error: null, data: null });
    fetcher()
      .then((data) => { if (on) setS({ loading: false, error: null, data }); })
      .catch((e) => { if (on) setS({ loading: false, error: e, data: null }); });
    return () => { on = false; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return s;
}

function Card({ title, count, children }) {
  return (
    <section className="er-card">
      <header className="er-card-head">
        <h3>{title}</h3>
        {count != null && <span className="er-count">{count}</span>}
      </header>
      {children}
    </section>
  );
}

function CardBody({ state, emptyText, render }) {
  if (state.loading) return <div className="er-note"><span className="sk" style={{ display:'block', height: 12, width: '70%' }} /></div>;
  if (state.error) return <div className="er-note">Not available — this section needs its suite's access. </div>;
  const empty = !state.data || (Array.isArray(state.data) && state.data.length === 0);
  if (empty) return <div className="er-note">{emptyText}</div>;
  return render(state.data);
}

const Row = ({ left, right, sub }) => (
  <div className="er-row">
    <div className="er-row-main">
      <div>{left}</div>
      {sub && <div className="er-row-sub">{sub}</div>}
    </div>
    <div className="er-row-right">{right}</div>
  </div>
);

export default function EmployeeRecord({ emp, isHrManager, onBack, onEdit }) {
  const id = emp.id;
  const year = new Date().getFullYear();

  const salary  = useSection(() => apiGet(`/payroll/salary/${id}`).then((d) => d.history), [id]);
  const bank    = useSection(() => apiGet(`/payroll/bank/${id}`).then((d) => d.accounts), [id]);
  const leave   = useSection(() => L.getAllRequests({}).then((rs) => rs.filter((r) => r.user_id === id)), [id]);
  const attend  = useSection(() => apiGet('/attendance/records').then((d) => (d.records || []).filter((r) => (r.employee?.id || r.employee_id) === id)), [id]);
  const assets  = useSection(() => apiGet('/itassets/assets').then((d) => (d.assets || []).filter((a) => (a.employee?.id || a.assigned_to) === id)), [id]);
  const benefit = useSection(() => apiGet('/benefits/enrollments').then((d) => (d.enrollments || []).filter((e) => (e.employee?.id || e.employee_id) === id)), [id]);
  const perf    = useSection(() => Promise.all([PERF.getGoals(id), PERF.getReviews(id), PERF.getTrainings(id)]).then(([goals, reviews, trainings]) => ({ goals, reviews, trainings })), [id]);
  const docs    = useSection(() => C.getDocuments(id), [id]);
  const cases   = useSection(() => C.getCases().then((cs) => cs.filter((c) => c.employee?.id === id)), [id]);
  const tasks   = useSection(() => apiGet('/tasks').then((d) => (d.tasks || []).filter((t) => (t.assignee?.id || t.assigned_to) === id)), [id]);

  const latestSalary = salary.data?.[0];
  const gross = latestSalary
    ? Number(latestSalary.basic) + Number(latestSalary.housing) + Number(latestSalary.transport) + Number(latestSalary.other_allowances)
    : null;
  const primaryBank = bank.data?.find((a) => a.is_primary) || bank.data?.[0];

  const thisYearLeave = (leave.data || []).filter((r) => r.status === 'approved' && String(r.start_date).startsWith(String(year)));
  const leaveDaysUsed = thisYearLeave.reduce((s, r) => s + Number(r.working_days || 0), 0);

  const last30 = (attend.data || []).filter((r) => new Date(r.clock_in_at) > new Date(Date.now() - 30 * 86400000));
  const hours30 = last30.reduce((s, r) => {
    if (!r.clock_out_at) return s;
    return s + (new Date(r.clock_out_at) - new Date(r.clock_in_at)) / 3600000;
  }, 0);

  const assetsHeld = (assets.data || []).filter((a) => a.status === 'in_use');
  const openGoals = (perf.data?.goals || []).filter((g) => g.status === 'not_started' || g.status === 'in_progress');
  const latestReview = perf.data?.reviews?.[0];
  const openCases = (cases.data || []).filter((c) => c.status === 'open');
  const openTasks = (tasks.data || []).filter((t) => t.status !== 'done' && t.status !== 'cancelled');

  const et = H.EMPLOYMENT_TYPE[emp.employmentType] || H.EMPLOYMENT_TYPE.full_time;
  const t = H.tenure(emp.startDate);

  return (
    <div className="er">
      <style>{ER_CSS}</style>

      {/* ---- header ---- */}
      <div className="er-head">
        <button className="iconbtn" onClick={onBack} aria-label="Back to directory">{IC.back}</button>
        {emp.avatarUrl
          ? <img src={emp.avatarUrl} alt="" className="avatar" style={{ width: 54, height: 54, objectFit: 'cover' }} />
          : <span className="avatar" style={{ width: 54, height: 54, fontSize: 19 }}>{H.initials(emp.name)}</span>}
        <div className="er-head-main">
          <h2>{emp.name}</h2>
          <div className="er-head-sub">
            <span>{emp.jobTitle || 'No title'}</span>
            <span className="er-dot" />
            <span>{emp.deptName || 'No department'}</span>
            <span className={`hr-et-badge ${et.cls}`}>{et.label}</span>
            {t && <span className="muted">{t} tenure</span>}
          </div>
          <div className="er-head-contact">
            <span>{IC.mail} {emp.email}</span>
            {emp.phone && <span>{IC.phone} {emp.phone}</span>}
            {emp.manager?.name && <span className="muted">Reports to {emp.manager.name}</span>}
            {emp.startDate && <span className="muted">Started {H.fmtDate(emp.startDate)}</span>}
          </div>
        </div>
        {isHrManager && <button className="btn btn-ghost" onClick={onEdit}>{IC.edit} Edit employment</button>}
      </div>

      {/* ---- at-a-glance strip ---- */}
      <div className="er-kpis">
        <div className="er-kpi"><div className="er-kpi-val">{leave.error ? '—' : leaveDaysUsed}</div><div className="er-kpi-label">Leave days used {year}</div></div>
        <div className="er-kpi"><div className="er-kpi-val">{attend.error ? '—' : Math.round(hours30)}</div><div className="er-kpi-label">Hours clocked, 30 days</div></div>
        <div className="er-kpi"><div className="er-kpi-val">{tasks.error ? '—' : openTasks.length}</div><div className="er-kpi-label">Open tasks</div></div>
        <div className="er-kpi"><div className="er-kpi-val">{assets.error ? '—' : assetsHeld.length}</div><div className="er-kpi-label">Assets held</div></div>
        <div className="er-kpi"><div className="er-kpi-val">{cases.error ? '—' : openCases.length}</div><div className="er-kpi-label">Open cases</div></div>
      </div>

      {/* ---- section grid ---- */}
      <div className="er-grid">
        <Card title="Compensation">
          <CardBody state={salary} emptyText="No salary structure on record."
            render={(history) => (
              <>
                <div className="er-big">{money(gross)} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>/ month gross</span></div>
                <div className="er-row-sub" style={{ marginBottom: 8 }}>
                  Basic {money(history[0].basic)} · Housing {money(history[0].housing)} · Transport {money(history[0].transport)}
                  {Number(history[0].other_allowances) > 0 && <> · Other {money(history[0].other_allowances)}</>}
                  {' '}· effective {C.fmtDate(history[0].effective_date)}
                </div>
                {history.length > 1 && <div className="er-note" style={{ padding: 0 }}>{history.length - 1} earlier structure{history.length > 2 ? 's' : ''} on file.</div>}
                {primaryBank && (
                  <Row left={<b>{primaryBank.bank_name}</b>} sub={primaryBank.account_name}
                    right={<span className="muted">{primaryBank.account_number}</span>} />
                )}
              </>
            )} />
        </Card>

        <Card title={`Leave — ${year}`} count={leave.data ? thisYearLeave.length : null}>
          <CardBody state={leave} emptyText="No leave requests yet."
            render={(rs) => (
              <>
                <div className="er-big">{leaveDaysUsed} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>working days approved this year</span></div>
                {rs.slice(0, 4).map((r) => (
                  <Row key={r.id}
                    left={<><span className="lv-dot" style={{ background: r.leave_types?.color }} />{r.leave_types?.name}</>}
                    sub={`${C.fmtDate(r.start_date)}${r.end_date !== r.start_date ? ` – ${C.fmtDate(r.end_date)}` : ''} · ${r.working_days} day${r.working_days === 1 ? '' : 's'}`}
                    right={<span className={`lv-status st-${r.status === 'approved' ? 'approved' : r.status === 'pending' ? 'pending' : r.status === 'rejected' ? 'rejected' : 'cancelled'}`}>{r.status}</span>} />
                ))}
              </>
            )} />
        </Card>

        <Card title="Attendance — last 30 days" count={attend.data ? last30.length : null}>
          <CardBody state={attend} emptyText="No attendance records."
            render={() => (
              <>
                <div className="er-big">{Math.round(hours30)}h <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>across {last30.length} shift{last30.length === 1 ? '' : 's'}</span></div>
                {last30.slice(0, 4).map((r) => (
                  <Row key={r.id}
                    left={new Date(r.clock_in_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    right={<span className="muted">
                      {new Date(r.clock_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      {' – '}
                      {r.clock_out_at ? new Date(r.clock_out_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : <span className="st-pill st-success" style={{ fontSize: 11 }}>open</span>}
                    </span>} />
                ))}
              </>
            )} />
        </Card>

        <Card title="Performance">
          <CardBody state={perf} emptyText="No goals or reviews yet."
            render={({ goals, reviews, trainings }) => (
              (goals.length + reviews.length + trainings.length) === 0
                ? <div className="er-note">No goals or reviews yet.</div>
                : <>
                    {openGoals.slice(0, 3).map((g) => (
                      <Row key={g.id} left={g.title} sub={g.target_date ? `Target ${C.fmtDate(g.target_date)}` : null}
                        right={<span className="st-pill st-info">{PERF.GOAL_STATUS[g.status]?.label || g.status}</span>} />
                    ))}
                    {latestReview && (
                      <Row left={<b>{latestReview.cycle_label}</b>} sub={`Latest review · by ${latestReview.reviewer?.name || '—'}`}
                        right={latestReview.rating ? <span className="st-pill st-success">{latestReview.rating}/5</span> : <span className="st-pill st-neutral">{latestReview.status}</span>} />
                    )}
                    {trainings.length > 0 && <div className="er-note" style={{ padding: 0 }}>{trainings.length} training record{trainings.length === 1 ? '' : 's'}.</div>}
                  </>
            )} />
        </Card>

        <Card title="Documents" count={docs.data?.length}>
          <CardBody state={docs} emptyText="No documents on file."
            render={(ds) => ds.slice(0, 5).map((d) => (
              <Row key={d.id} left={d.title} sub={C.DOC_CATEGORY[d.category]}
                right={d.expiry_date
                  ? <span className={`st-pill ${C.isExpired(d.expiry_date) ? 'st-danger' : C.isExpiringSoon(d.expiry_date) ? 'st-warn' : 'st-neutral'}`}>{C.fmtDate(d.expiry_date)}</span>
                  : <span className="muted">—</span>} />
            ))} />
        </Card>

        <Card title="Assets held" count={assets.data ? assetsHeld.length : null}>
          <CardBody state={assets} emptyText="No assets assigned."
            render={() => assetsHeld.length === 0
              ? <div className="er-note">No assets assigned.</div>
              : assetsHeld.slice(0, 5).map((a) => (
                  <Row key={a.id} left={a.name} sub={a.category} right={<span className="muted">{a.asset_tag || a.serial_number || ''}</span>} />
                ))} />
        </Card>

        <Card title="Benefits" count={benefit.data?.length}>
          <CardBody state={benefit} emptyText="No enrollments."
            render={(es) => es.slice(0, 5).map((e) => (
              <Row key={e.id} left={e.plan?.name || '—'} sub={`${e.plan?.type || ''}${e.plan?.provider ? ` · ${e.plan.provider}` : ''}`}
                right={<span className={`st-pill ${e.status === 'active' ? 'st-success' : 'st-neutral'}`}>{e.status}</span>} />
            ))} />
        </Card>

        <Card title="Open cases" count={cases.data ? openCases.length : null}>
          <CardBody state={cases} emptyText="No cases on record."
            render={(cs) => cs.length === 0
              ? <div className="er-note">No cases on record.</div>
              : cs.slice(0, 4).map((c) => (
                  <Row key={c.id} left={C.CASE_CATEGORY[c.category] || c.category} sub={`Opened ${C.fmtDate(c.created_at)} by ${c.openedBy?.name || '—'}`}
                    right={<span className={`st-pill ${c.status === 'open' ? 'st-warn' : 'st-success'}`}>{c.status}</span>} />
                ))} />
        </Card>

        <Card title="Tasks" count={tasks.data ? openTasks.length : null}>
          <CardBody state={tasks} emptyText="No tasks assigned."
            render={() => openTasks.length === 0
              ? <div className="er-note">Nothing open right now.</div>
              : openTasks.slice(0, 5).map((tk) => (
                  <Row key={tk.id} left={tk.title} sub={tk.due_date ? `Due ${C.fmtDate(tk.due_date)}` : null}
                    right={<span className="st-pill st-info">{tk.status?.replace('_', ' ')}</span>} />
                ))} />
        </Card>
      </div>
    </div>
  );
}

const ER_CSS = `
  .er-head { display:flex; align-items:center; gap:14px; margin:6px 0 18px; flex-wrap:wrap; }
  .er-head-main { flex:1; min-width:220px; }
  .er-head-main h2 { margin:0 0 3px; font-size:21px; }
  .er-head-sub { display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:13.5px; color:var(--text-2); }
  .er-dot { width:3px; height:3px; border-radius:50%; background:var(--text-3); }
  .er-head-contact { display:flex; gap:16px; flex-wrap:wrap; font-size:12.5px; color:var(--text-2); margin-top:6px; }
  .er-head-contact span { display:inline-flex; align-items:center; gap:5px; }

  .er-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:12px; margin-bottom:18px; }
  .er-kpi { background:var(--surface); border:1px solid var(--line); border-top:3px solid var(--brand); border-radius:var(--radius-lg); box-shadow:var(--shadow-2); padding:12px 16px; }
  .er-kpi-val { font-size:24px; font-weight:700; line-height:1.1; }
  .er-kpi-label { font-size:11.5px; color:var(--text-2); margin-top:3px; }

  .er-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:14px; }
  .er-card { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-lg); box-shadow:var(--shadow-2); padding:14px 16px; }
  .er-card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
  .er-card-head h3 { margin:0; font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-3); font-weight:700; }
  .er-count { font-size:12px; color:var(--text-2); background:var(--surface-2); border-radius:100px; padding:1px 9px; font-weight:650; }
  .er-big { font-size:19px; font-weight:700; margin-bottom:2px; }
  .er-note { font-size:12.5px; color:var(--text-3); padding:6px 0; }
  .er-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:7px 0; border-top:1px solid var(--line); font-size:13.5px; }
  .er-row:first-of-type { border-top:none; }
  .er-row-main { min-width:0; }
  .er-row-main > div:first-child { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .er-row-sub { font-size:12px; color:var(--text-3); margin-top:1px; }
  .er-row-right { flex:none; }
  @media (max-width:640px) { .er-grid { grid-template-columns:1fr; } .er-kpis { grid-template-columns:repeat(2, 1fr); } }
`;
