import { useEffect, useMemo, useState } from 'react';
import * as PR from './projectsApi.js';
import { EmptyState, useToast } from '../../components/ui.jsx';
import { todayISO } from '../../lib/today.js';

/* ===========================================================================
   ProjectReports — the four questions a project lead actually asks:

     1. Are the milestones on track?           done vs open per milestone
     2. Who is behind?                         overdue tasks by assignee
     3. Who is buried?                         open tasks per person
     4. What can we bill?                      logged time, billable vs not

   Props (the integrator wires this in as a tab inside ProjectsApp):

     projectId  string   uuid of the project. Required.
     tasks      array    project_tasks rows exactly as PR.getTasks() returns
                         them: joined `assignee {id,name,email}` and
                         `milestone {id,title}`, plus status_id / parent_task_id.
     statuses   array    project_statuses rows from PR.getStatuses(). May be
                         empty or omitted, see isTaskDone below.
     members    array    project_members rows from PR.getMembers(), each with
                         `user_id` and a joined `user {id,name}`.

   Milestones and time entries are NOT props: they are fetched here, because
   the board tab has no reason to hold them and a milestone with no tasks at
   all still has to appear in the progress table.
   =========================================================================== */

/* Billable and non-billable are two categories on one bar, so they need hues a
   deuteranope can still separate, not two greens. This pair clears the CVD
   check with room to spare, and every segment is labelled with its own number
   in the table below anyway, so colour is never carrying the meaning alone. */
const C_BILLABLE = '#0E7A3D';
const C_NONBILL  = '#215FA8';
const C_DONE     = '#0E7A3D';
/* Workload is one magnitude, not two categories, so its bar takes a neutral
   ink. Reusing either hue above would imply a meaning it does not have. */
const C_LOAD     = '#6B6558';

const CSS = `
  .pr-sec { margin-top: 26px; }
  .pr-sec h3 { font-size: 14px; font-weight: 700; color: var(--text-2); margin: 0 0 3px; }
  .pr-note { font-size: 12.5px; color: var(--text-3); margin: 0 0 10px; }
  .pr-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pr-kpis { display: flex; gap: 12px; flex-wrap: wrap; margin: 4px 0 2px; }
  .pr-kpi { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg);
            box-shadow: var(--shadow-2); padding: 14px 18px; min-width: 128px; flex: 1; }
  .pr-kpi-val { font-size: 26px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
  .pr-kpi-label { font-size: 12px; color: var(--text-2); margin-top: 6px; }
  .pr-late { color: var(--danger); font-weight: 650; }
  .pr-legend { display: flex; gap: 16px; flex-wrap: wrap; align-items: center;
               font-size: 12.5px; color: var(--text-2); margin: 10px 2px 0; }
  .pr-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  .pr-clip { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Row headers are real <th scope="row"> for screen readers, but .table th is
     styled for a column head (uppercase, tinted, small). Put them back to
     looking like the body cells they sit among. */
  .pr-table tbody th, .pr-table tfoot th {
    text-align: left; text-transform: none; letter-spacing: 0; font-size: 14px;
    font-weight: 500; background: transparent; color: inherit; white-space: normal;
  }
  .pr-table tfoot td, .pr-table tfoot th { border-top: 1px solid var(--line-strong); font-weight: 650; font-size: 13.5px; }
`;

const METER_W = 150;
const METER_H = 8;

/* A proportion bar, not a chart: it sits beside the numbers it summarises and
   is aria-hidden because the same figures are already in the row's own cells.
   Announcing it again would just make the table twice as long to listen to. */
function Meter({ parts, total }) {
  const whole = Number(total) || 0;
  const shown = (parts || []).filter((p) => Number(p.value) > 0);
  let x = 0;
  const rects = shown.map((p, i) => {
    const raw = (Number(p.value) / whole) * METER_W;
    // A segment worth 1 of 400 still has to be visible, so nothing narrower
    // than 3px is drawn; the 2px cut keeps neighbouring fills from touching.
    const w = Math.max(3, raw - (i < shown.length - 1 ? 2 : 0));
    const rect = <rect key={p.key} x={x} y="0" width={w} height={METER_H} rx={METER_H / 2} fill={p.colour} />;
    x += raw;
    return rect;
  });
  return (
    <svg width={METER_W} height={METER_H} viewBox={`0 0 ${METER_W} ${METER_H}`} aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      <rect x="0" y="0" width={METER_W} height={METER_H} rx={METER_H / 2} fill="var(--surface-2)" />
      {whole > 0 && rects}
    </svg>
  );
}

/* ---- date helpers ----------------------------------------------------------
   Everything here is date-only. A task due today is not late until tomorrow,
   the same rule the Tasks suite uses, so the two suites never disagree about
   what "overdue" means. Comparisons are string compares on YYYY-MM-DD, and the
   arithmetic parses at UTC midnight so a timezone never shifts a day. */
// Lagos, not the viewer's device: a Nigerian company's accountant working from
// another country must still see the same "today" as the office does.
const asDay = (iso) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
const dayGap = (a, b) => Math.round((asDay(a) - asDay(b)) / 86400000);
const shiftDays = (iso, n) => new Date(asDay(iso) + n * 86400000).toISOString().slice(0, 10);

const num = (n) => (Number(n) || 0);
const hrs = (n) => num(n).toLocaleString('en-GB', { maximumFractionDigits: 2 });
const money = (n) => `₦${Math.round(num(n)).toLocaleString('en-NG')}`;
const share = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const RANGES = [
  { key: 'all',   label: 'All time' },
  { key: 'd30',   label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
];

export default function ProjectReports({ projectId, tasks = [], statuses = [], members = [] }) {
  const [milestones, setMilestones] = useState(null);
  const [entries, setEntries] = useState(null);
  const [range, setRange] = useState('all');
  const { flash, toastNode } = useToast();

  useEffect(() => {
    let live = true;
    setMilestones(null); setEntries(null);
    // Settled one by one, not Promise.all: the two halves of this report are
    // independent, and a route that is missing in demo mode must not blank the
    // half that did load.
    Promise.allSettled([PR.getMilestones(projectId), PR.getTimeEntries(projectId)])
      .then(([ms, es]) => {
        if (!live) return;
        setMilestones(ms.status === 'fulfilled' ? ms.value : []);
        setEntries(es.status === 'fulfilled' ? es.value : []);
        const failed = [ms, es].find((r) => r.status === 'rejected');
        if (failed) flash(failed.reason?.message || 'Part of this report could not be loaded.', true);
      });
    return () => { live = false; };
  }, [projectId, flash]);

  const today = todayISO();
  const statusIndex = useMemo(() => PR.byId(statuses), [statuses]);

  /* status_id is the truth once projects_v2 is applied. A task raised before
     that migration, or read in the moment before the statuses fetch lands,
     only has the legacy text column, so fall back to it rather than report
     every task as open. */
  const isTaskDone = useMemo(() => (t) => {
    const s = statusIndex[t.status_id];
    return s ? Boolean(s.is_done) : t.status === 'done';
  }, [statusIndex]);

  const isTaskOverdue = useMemo(() => (t) => (
    Boolean(t.due_date) && !isTaskDone(t) && String(t.due_date).slice(0, 10) < today
  ), [isTaskDone, today]);

  // Everyone the report might name: current members, plus anyone still holding
  // a task or a time entry after being taken off the project.
  const nameById = useMemo(() => {
    const m = {};
    for (const mem of members || []) if (mem.user_id) m[mem.user_id] = mem.user?.name || 'Unknown';
    for (const t of tasks || []) if (t.assigned_to) m[t.assigned_to] = t.assignee?.name || m[t.assigned_to] || 'Unknown';
    for (const e of entries || []) if (e.user_id) m[e.user_id] = e.person?.name || m[e.user_id] || 'Unknown';
    return m;
  }, [members, tasks, entries]);

  /* ---- 1. headline ------------------------------------------------------- */
  const totals = useMemo(() => {
    const all = tasks || [];
    const done = all.filter(isTaskDone).length;
    return { all: all.length, done, open: all.length - done, overdue: all.filter(isTaskOverdue).length };
  }, [tasks, isTaskDone, isTaskOverdue]);

  const loggedHours = useMemo(
    () => (entries || []).reduce((s, e) => s + num(e.hours), 0),
    [entries],
  );

  /* ---- 2. progress by milestone ------------------------------------------ */
  const milestoneRows = useMemo(() => {
    if (!milestones) return [];
    const bucket = (id) => (tasks || []).filter((t) => (t.milestone_id || null) === id);
    const row = (id, title, dueDate) => {
      const list = bucket(id);
      const done = list.filter(isTaskDone).length;
      return {
        id: id || 'none', title, dueDate,
        total: list.length, done, open: list.length - done,
        overdue: list.filter(isTaskOverdue).length,
      };
    };
    const rows = milestones.map((m) => row(m.id, m.title, m.due_date));
    const loose = row(null, 'No milestone', null);
    if (loose.total > 0) rows.push(loose);
    return rows;
  }, [milestones, tasks, isTaskDone, isTaskOverdue]);

  /* ---- 3 + 4. per person: overdue, workload ------------------------------ */
  const people = useMemo(() => {
    const rows = {};
    const at = (id) => {
      const key = id || 'unassigned';
      if (!rows[key]) {
        rows[key] = {
          key, id: id || null, name: id ? (nameById[id] || 'Unknown') : 'Unassigned',
          open: 0, overdue: 0, dueSoon: 0, worstDays: 0, worstTitle: '',
        };
      }
      return rows[key];
    };
    // Members with nothing on their plate are the point of a workload table, so
    // they get a row before any task is counted.
    for (const mem of members || []) if (mem.user_id) at(mem.user_id);

    const horizon = shiftDays(today, 7);
    for (const t of tasks || []) {
      if (isTaskDone(t)) continue;
      const r = at(t.assigned_to);
      r.open += 1;
      const due = t.due_date ? String(t.due_date).slice(0, 10) : null;
      if (due && due < today) {
        r.overdue += 1;
        const late = dayGap(today, due);
        if (late > r.worstDays) { r.worstDays = late; r.worstTitle = t.title; }
      } else if (due && due <= horizon) {
        r.dueSoon += 1;
      }
    }
    return Object.values(rows);
  }, [tasks, members, nameById, isTaskDone, today]);

  const maxOpen = useMemo(() => people.reduce((m, p) => Math.max(m, p.open), 0), [people]);

  const workloadRows = useMemo(() => [...people].sort((a, b) => (
    b.open - a.open || a.name.localeCompare(b.name)
  )), [people]);

  const overdueRows = useMemo(() => people.filter((p) => p.overdue > 0).sort((a, b) => (
    b.overdue - a.overdue || b.worstDays - a.worstDays || a.name.localeCompare(b.name)
  )), [people]);

  /* ---- 5. time logged ---------------------------------------------------- */
  const timeFrom = useMemo(() => {
    if (range === 'd30') return shiftDays(today, -29);
    if (range === 'month') return `${today.slice(0, 7)}-01`;
    return null;
  }, [range, today]);

  const time = useMemo(() => {
    const list = (entries || []).filter((e) => !timeFrom || String(e.entry_date).slice(0, 10) >= timeFrom);
    const rows = {};
    let billable = 0, nonBillable = 0, value = 0, unbilled = 0, unbilledHours = 0;
    for (const e of list) {
      const key = e.user_id || 'unknown';
      if (!rows[key]) rows[key] = { key, name: nameById[e.user_id] || e.person?.name || 'Unknown', billable: 0, nonBillable: 0, value: 0 };
      const h = num(e.hours);
      const worth = h * num(e.rate_naira);
      if (e.billable) {
        rows[key].billable += h; rows[key].value += worth;
        billable += h; value += worth;
        if (!e.invoiced_doc_id) { unbilled += worth; unbilledHours += h; }
      } else {
        rows[key].nonBillable += h;
        nonBillable += h;
      }
    }
    return {
      rows: Object.values(rows).sort((a, b) => (b.billable + b.nonBillable) - (a.billable + a.nonBillable) || a.name.localeCompare(b.name)),
      billable, nonBillable, total: billable + nonBillable, value, unbilled, unbilledHours,
      count: list.length,
    };
  }, [entries, timeFrom, nameById]);

  if (milestones === null || entries === null) {
    return <div className="suite-loading"><div className="boot-spinner" /></div>;
  }

  if (totals.all === 0 && time.count === 0 && milestones.length === 0) {
    return (
      <>
        <style>{CSS}</style>
        <EmptyState
          title="Nothing to report yet"
          hint="Add milestones, raise a few tasks and log some hours. Progress, overdue work, workload and billable time all appear here."
        />
        {toastNode}
      </>
    );
  }

  return (
    <div>
      <style>{CSS}</style>

      {/* The headline moves whenever a card moves on the board, so it is
          announced rather than silently rewritten under a screen reader. */}
      <div className="pr-kpis" aria-live="polite">
        <div className="pr-kpi">
          <div className="pr-kpi-val">{totals.all}</div>
          <div className="pr-kpi-label">Tasks</div>
        </div>
        <div className="pr-kpi">
          <div className="pr-kpi-val">{totals.done}</div>
          <div className="pr-kpi-label">Done, {share(totals.done, totals.all)}% of all tasks</div>
        </div>
        <div className="pr-kpi">
          <div className="pr-kpi-val">{totals.open}</div>
          <div className="pr-kpi-label">Still open</div>
        </div>
        <div className="pr-kpi">
          <div className={`pr-kpi-val ${totals.overdue > 0 ? 'pr-late' : ''}`}>{totals.overdue}</div>
          <div className="pr-kpi-label">Overdue</div>
        </div>
        <div className="pr-kpi">
          <div className="pr-kpi-val">{hrs(loggedHours)}</div>
          <div className="pr-kpi-label">Hours logged, all time</div>
        </div>
      </div>

      {/* ---- progress by milestone ---- */}
      <section className="pr-sec">
        <h3>Progress by milestone</h3>
        <p className="pr-note">Counts include subtasks. A task is done once it sits in a column flagged as finished.</p>
        {milestoneRows.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No milestones on this project yet, and no task is attached to one.</p>
        ) : (
          <div className="table-wrap">
            <table className="table pr-table">
              <thead>
                <tr>
                  <th scope="col">Milestone</th>
                  <th scope="col">Due</th>
                  <th scope="col" className="pr-num">Done</th>
                  <th scope="col" className="pr-num">Open</th>
                  <th scope="col" className="pr-num">Overdue</th>
                  <th scope="col" className="pr-num">Complete</th>
                  <th scope="col" style={{ width: METER_W + 32 }}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {milestoneRows.map((m) => {
                  const late = m.dueDate && m.open > 0 && String(m.dueDate).slice(0, 10) < today;
                  return (
                    <tr key={m.id}>
                      <th scope="row">
                        {m.title}
                      </th>
                      <td className={`muted ${late ? 'pr-late' : ''}`} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                        {PR.fmtDate(m.dueDate)}{late ? ', late' : ''}
                      </td>
                      <td className="pr-num">{m.done}</td>
                      <td className="pr-num">{m.open}</td>
                      <td className={`pr-num ${m.overdue > 0 ? 'pr-late' : ''}`}>{m.overdue || '—'}</td>
                      <td className="pr-num">{m.total > 0 ? `${share(m.done, m.total)}%` : '—'}</td>
                      <td>
                        {m.total > 0
                          ? <Meter total={m.total} parts={[{ key: 'done', value: m.done, colour: C_DONE }]} />
                          : <span className="muted" style={{ fontSize: 12.5 }}>No tasks yet</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">All tasks</th>
                  <td />
                  <td className="pr-num">{totals.done}</td>
                  <td className="pr-num">{totals.open}</td>
                  <td className={`pr-num ${totals.overdue > 0 ? 'pr-late' : ''}`}>{totals.overdue || '—'}</td>
                  <td className="pr-num">{share(totals.done, totals.all)}%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ---- overdue by assignee ---- */}
      <section className="pr-sec">
        <h3>Overdue by assignee</h3>
        <p className="pr-note">A task is overdue the day after its due date, so anything due today is not counted.</p>
        {overdueRows.length === 0 ? (
          <EmptyState title="Nothing is overdue" hint="Every open task with a due date still has time on it." />
        ) : (
          <div className="table-wrap">
            <table className="table pr-table">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col" className="pr-num">Overdue</th>
                  <th scope="col" className="pr-num">Days late, worst</th>
                  <th scope="col">Most overdue task</th>
                </tr>
              </thead>
              <tbody>
                {overdueRows.map((p) => (
                  <tr key={p.key}>
                    <th scope="row">
                      {p.name}
                    </th>
                    <td className="pr-num pr-late">{p.overdue}</td>
                    <td className="pr-num">{p.worstDays}</td>
                    <td className="muted pr-clip" style={{ fontSize: 13 }} title={p.worstTitle}>{p.worstTitle || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- workload ---- */}
      <section className="pr-sec">
        <h3>Workload, open tasks per person</h3>
        <p className="pr-note">Everyone on the project is listed, including anyone with nothing open. Unassigned work is a row of its own so it cannot hide.</p>
        <div className="table-wrap">
          <table className="table pr-table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col" className="pr-num">Open</th>
                <th scope="col" className="pr-num">Overdue</th>
                <th scope="col" className="pr-num">Due in 7 days</th>
                <th scope="col" style={{ width: METER_W + 32 }}>Share of open work</th>
              </tr>
            </thead>
            <tbody>
              {workloadRows.length === 0 && <tr><td colSpan={5} className="td-empty">Nobody is on this project yet.</td></tr>}
              {workloadRows.map((p) => (
                <tr key={p.key}>
                  <th scope="row">
                    {p.name}
                  </th>
                  <td className="pr-num">{p.open}</td>
                  <td className={`pr-num ${p.overdue > 0 ? 'pr-late' : ''}`}>{p.overdue || '—'}</td>
                  <td className="pr-num">{p.dueSoon || '—'}</td>
                  <td>
                    {/* Scaled against the busiest person, not the total, so the
                        bars stay comparable row to row on a large team. */}
                    <Meter total={maxOpen} parts={[{ key: 'open', value: p.open, colour: C_LOAD }]} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className="pr-num">{totals.open}</td>
                <td className={`pr-num ${totals.overdue > 0 ? 'pr-late' : ''}`}>{totals.overdue || '—'}</td>
                <td className="pr-num">{workloadRows.reduce((s, p) => s + p.dueSoon, 0) || '—'}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ---- time logged ---- */}
      <section className="pr-sec">
        <h3>Time logged</h3>
        <p className="pr-note">Billable hours here are what the Time tab rolls into a draft invoice. Unbilled means billable and not yet on any invoice.</p>

        <div className="filterbar" style={{ marginTop: 10 }}>
          <div className="filter-pills" role="group" aria-label="Time period">
            {RANGES.map((r) => (
              <button key={r.key} type="button" className={`pill ${range === r.key ? 'active' : ''}`}
                aria-pressed={range === r.key} onClick={() => setRange(r.key)}>{r.label}</button>
            ))}
          </div>
          <span className="count">{time.count} entr{time.count === 1 ? 'y' : 'ies'}</span>
        </div>

        {time.total === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No hours logged in this period.</p>
        ) : (
          <>
            <div className="pr-kpis" aria-live="polite">
              <div className="pr-kpi">
                <div className="pr-kpi-val">{hrs(time.total)}</div>
                <div className="pr-kpi-label">Hours logged</div>
              </div>
              <div className="pr-kpi">
                <div className="pr-kpi-val">{hrs(time.billable)}</div>
                <div className="pr-kpi-label">Billable, {share(time.billable, time.total)}% of hours</div>
              </div>
              <div className="pr-kpi">
                <div className="pr-kpi-val">{hrs(time.nonBillable)}</div>
                <div className="pr-kpi-label">Non-billable</div>
              </div>
              <div className="pr-kpi">
                <div className="pr-kpi-val" style={{ fontSize: 22 }}>{money(time.value)}</div>
                <div className="pr-kpi-label">Billable value at the logged rates</div>
              </div>
              <div className="pr-kpi">
                <div className="pr-kpi-val" style={{ fontSize: 22 }}>{money(time.unbilled)}</div>
                <div className="pr-kpi-label">Unbilled, {hrs(time.unbilledHours)}h not yet invoiced</div>
              </div>
            </div>

            <div style={{ margin: '14px 2px 0' }}>
              <Meter
                total={time.total}
                parts={[
                  { key: 'billable', value: time.billable, colour: C_BILLABLE },
                  { key: 'nonbill', value: time.nonBillable, colour: C_NONBILL },
                ]}
              />
              <div className="pr-legend">
                <span><span className="pr-swatch" style={{ background: C_BILLABLE }} />Billable {hrs(time.billable)}h</span>
                <span><span className="pr-swatch" style={{ background: C_NONBILL }} />Non-billable {hrs(time.nonBillable)}h</span>
              </div>
            </div>

            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="table pr-table">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col" className="pr-num">Billable h</th>
                    <th scope="col" className="pr-num">Non-billable h</th>
                    <th scope="col" className="pr-num">Total h</th>
                    <th scope="col" className="pr-num">Billable value</th>
                    <th scope="col" style={{ width: METER_W + 32 }}>Split</th>
                  </tr>
                </thead>
                <tbody>
                  {time.rows.map((r) => (
                    <tr key={r.key}>
                      <th scope="row">
                        {r.name}
                      </th>
                      <td className="pr-num">{hrs(r.billable)}</td>
                      <td className="pr-num">{hrs(r.nonBillable)}</td>
                      <td className="pr-num">{hrs(r.billable + r.nonBillable)}</td>
                      <td className="pr-num">{r.value > 0 ? money(r.value) : '—'}</td>
                      <td>
                        <Meter
                          total={r.billable + r.nonBillable}
                          parts={[
                            { key: 'billable', value: r.billable, colour: C_BILLABLE },
                            { key: 'nonbill', value: r.nonBillable, colour: C_NONBILL },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td className="pr-num">{hrs(time.billable)}</td>
                    <td className="pr-num">{hrs(time.nonBillable)}</td>
                    <td className="pr-num">{hrs(time.total)}</td>
                    <td className="pr-num">{money(time.value)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </section>

      {toastNode}
    </div>
  );
}
