// The home page's working layer: what is waiting on this person today, the
// few things they most often come here to do, and where they were last.
//
// Every number comes from the suite's OWN api module, so row-level security
// decides what this person may see, exactly as it does inside the suite.
// Promise.allSettled, never Promise.all: a suite the company has not bought,
// or one this person may not read, is a card that does not appear, never a
// broken page. Only suites the person can open are even asked.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SuiteIcon from '../../components/SuiteIcon.jsx';
import { SUITE_META } from '../../config/suites.js';
import { getRecent } from '../../lib/recent.js';
import { todayISO, localDayISO } from '../../lib/today.js';
import { APPROVAL_SOURCES } from '../Approvals.jsx';
import * as L from '../../suites/leave/leaveApi.js';
import * as PR from '../../suites/payroll/payrollApi.js';
import * as A from '../../suites/attendance/attendanceApi.js';
import * as T from '../../suites/tasks/taskApi.js';
import * as TD from '../../suites/tradeDocs/tradeDocsApi.js';
import * as C from '../../suites/compliance/complianceApi.js';

const money = (n) => `₦${Math.round(Number(n || 0)).toLocaleString('en-NG')}`;
// Today means today in Lagos, not on the server or in UTC (lib/today.js).
const todayKey = () => todayISO();
const sameDay = (iso) => Boolean(iso) && localDayISO(new Date(iso)) === todayISO();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* Each card is a small adapter: which suite it needs, how to load, and what
   to say. `quiet: true` means the card is worth showing even at zero (payroll
   status is news either way); the rest hide when there is nothing to do. */
const CARDS = [
  {
    key: 'approvals', suite: null, to: '/approvals', tint: 'var(--brand)', icon: 'check',
    load: async (ctx) => {
      const usable = APPROVAL_SOURCES.filter((s) => ctx.can(s.key === 'expenses' ? 'finance' : s.key));
      if (usable.length === 0) return null;
      const settled = await Promise.allSettled(usable.map((s) => s.load()));
      const n = settled.reduce((sum, r) => sum + (r.status === 'fulfilled' ? (r.value || []).length : 0), 0);
      return { value: n, label: n === 0 ? 'Nothing waiting on you' : plural(n, 'approval waiting on you', 'approvals waiting on you'), sub: n === 0 ? 'Leave, purchases and expenses are all decided.' : 'Oldest first, one screen.', show: true };
    },
  },
  {
    key: 'out', suite: 'leave', to: '/suite/leave', tint: SUITE_META.leave?.tint, icon: SUITE_META.leave?.icon,
    load: async () => {
      const rows = await L.getTeamCalendar();
      const today = todayKey();
      const out = (rows || []).filter((r) => (r.status ? r.status === 'approved' : true) && String(r.start_date || r.start || '').slice(0, 10) <= today && String(r.end_date || r.end || '').slice(0, 10) >= today);
      const names = out.map((r) => r.name || r.applicant_name || r.user_name).filter(Boolean);
      return { value: out.length, label: out.length === 0 ? 'Everyone is in today' : plural(out.length, 'person out today', 'people out today'), sub: names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : ''), show: out.length > 0 };
    },
  },
  {
    key: 'payroll', suite: 'payroll', to: '/suite/payroll', tint: SUITE_META.payroll?.tint, icon: SUITE_META.payroll?.icon, adminOnly: true,
    load: async () => {
      const runs = await PR.getRuns();
      const now = new Date(); const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const thisMonth = (runs || []).find((r) => String(r.period || r.period_start || r.month || '').startsWith(ym) || (r.year === now.getFullYear() && r.month === now.getMonth() + 1));
      const latest = thisMonth || (runs || [])[0];
      const status = latest ? (PR.RUN_STATUS?.[latest.status]?.label || latest.status) : null;
      const monthName = now.toLocaleDateString('en-GB', { month: 'long' });
      return {
        value: status || 'Not started',
        label: thisMonth ? `${monthName} payroll: ${status}` : `${monthName} payroll not started`,
        sub: thisMonth ? (latest.status === 'released' || latest.status === 'paid' ? 'Salaries are on their way.' : 'Open the run to move it along.') : 'Start the run when the month closes.',
        show: true, quiet: true,
      };
    },
  },
  {
    key: 'attendance', suite: 'attendance', to: '/suite/attendance', tint: SUITE_META.attendance?.tint, icon: SUITE_META.attendance?.icon, adminOnly: true,
    load: async () => {
      const rows = await A.getAllRecords();
      const todays = (rows || []).filter((r) => sameDay(r.clock_in_at));
      const people = new Set(todays.map((r) => r.user_id || r.employee?.id || r.employee_id || r.id)).size;
      const still = todays.filter((r) => !r.clock_out_at).length;
      return { value: people, label: plural(people, 'person clocked in today', 'people clocked in today'), sub: people ? `${still} still on the clock` : 'No clock-ins yet today.', show: people > 0 };
    },
  },
  {
    key: 'tasks', suite: 'tasks', to: '/suite/tasks', tint: SUITE_META.tasks?.tint, icon: SUITE_META.tasks?.icon,
    load: async () => {
      const tasks = await T.getTasks();
      const overdue = (tasks || []).filter((t) => T.isOverdue(t));
      const dueToday = (tasks || []).filter((t) => t.status !== 'done' && t.status !== 'cancelled' && String(t.due_date || '').slice(0, 10) === todayKey());
      const n = overdue.length + dueToday.length;
      return { value: n, label: overdue.length ? plural(overdue.length, 'task overdue', 'tasks overdue') : plural(dueToday.length, 'task due today', 'tasks due today'), sub: overdue.length && dueToday.length ? `${dueToday.length} more due today` : overdue.length ? 'The oldest one first.' : 'Everything else is on time.', show: n > 0 };
    },
  },
  {
    key: 'invoices', suite: 'trade-docs', to: '/suite/trade-docs', tint: SUITE_META['trade-docs']?.tint, icon: SUITE_META['trade-docs']?.icon, adminOnly: true,
    load: async () => {
      const docs = await TD.getDocuments();
      const open = (docs || []).filter((d) => d.doc_type === 'invoice' && (d.status === 'issued' || d.status === 'part_paid'));
      const owed = open.reduce((s, d) => s + Math.max(0, Number(d.total || 0) - Number(d.amount_paid || 0)), 0);
      const overdue = open.filter((d) => d.due_date && String(d.due_date).slice(0, 10) < todayKey()).length;
      return { value: money(owed), label: open.length === 0 ? 'No invoices outstanding' : `${money(owed)} owed on ${plural(open.length, 'invoice', 'invoices')}`, sub: overdue ? `${overdue} past due date` : open.length ? 'None past their due date.' : '', show: open.length > 0 };
    },
  },
  {
    key: 'compliance', suite: 'compliance', to: '/suite/compliance', tint: SUITE_META.compliance?.tint, icon: SUITE_META.compliance?.icon, adminOnly: true,
    load: async () => {
      const d = await C.getCompliance();
      const items = C.buildDeadlines(d.rules || [], d.prefs || [], d.marks || [], new Date(), d.startFrom || null);
      const soon = items.filter((x) => !x.done && x.due && C.daysUntil(x.due) >= 0 && C.daysUntil(x.due) <= 14);
      const late = items.filter((x) => !x.done && x.due && C.daysUntil(x.due) < 0);
      const first = [...late, ...soon][0];
      const n = soon.length + late.length;
      return { value: n, label: late.length ? plural(late.length, 'filing overdue', 'filings overdue') : plural(soon.length, 'filing due within 14 days', 'filings due within 14 days'), sub: first ? `${first.rule?.name || first.rule?.key} · ${C.fmtDue(first.due)}` : '', show: n > 0 };
    },
  },
];

export function useToday({ suites, isAdmin, enabled }) {
  const [cards, setCards] = useState(null);
  const can = useMemo(() => {
    const open = new Set((suites || []).filter((s) => s.openable).map((s) => s.key));
    return (key) => open.has(key);
  }, [suites]);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const ctx = { can, isAdmin };
    const wanted = CARDS.filter((c) => (c.suite ? can(c.suite) : true) && (!c.adminOnly || isAdmin));
    Promise.allSettled(wanted.map((c) => c.load(ctx))).then((settled) => {
      if (!live) return;
      setCards(wanted.map((c, i) => (settled[i].status === 'fulfilled' && settled[i].value ? { ...c, ...settled[i].value } : null)).filter((c) => c && c.show));
    });
    return () => { live = false; };
  }, [can, isAdmin, enabled]);

  return cards;
}

export function TodayStrip({ cards }) {
  if (cards == null) {
    return <div className="today-grid" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="today-card today-skeleton" />)}</div>;
  }
  if (cards.length === 0) return null;
  return (
    <div className="today-grid">
      {cards.map((c) => (
        <Link key={c.key} to={c.to} className={`today-card${c.quiet ? ' quiet' : ''}`} style={{ '--tint': c.tint || 'var(--brand)' }}>
          <span className="today-icon"><SuiteIcon name={c.icon || 'check'} size={16} color="#fff" /></span>
          <span className="today-body">
            <span className="today-label">{c.label}</span>
            {c.sub && <span className="today-sub">{c.sub}</span>}
          </span>
          <span className="today-go" aria-hidden="true">→</span>
        </Link>
      ))}
    </div>
  );
}

/* The few things a person most often comes here to do, chosen by role and
   limited to suites they can open. Five at most; more is a menu. */
const ACTIONS = [
  { key: 'add-staff', label: 'Add staff', to: '/admin/users', admin: true, icon: 'users' },
  { key: 'run-payroll', label: 'Run payroll', to: '/suite/payroll', suite: 'payroll', admin: true, icon: SUITE_META.payroll?.icon },
  { key: 'new-invoice', label: 'New invoice', to: '/suite/trade-docs', suite: 'trade-docs', admin: true, icon: SUITE_META['trade-docs']?.icon },
  { key: 'approvals', label: 'Approvals', to: '/approvals', admin: true, icon: 'check' },
  { key: 'request-leave', label: 'Request leave', to: '/suite/leave', suite: 'leave', icon: SUITE_META.leave?.icon },
  { key: 'clock-in', label: 'Clock in', to: '/suite/attendance', suite: 'attendance', icon: SUITE_META.attendance?.icon },
  { key: 'payslips', label: 'My payslips', to: '/suite/payroll', suite: 'payroll', member: true, icon: SUITE_META.payroll?.icon },
  { key: 'my-tasks', label: 'My tasks', to: '/suite/tasks', suite: 'tasks', icon: SUITE_META.tasks?.icon },
  { key: 'chat', label: 'Team chat', to: '/chat', icon: 'chat' },
];

export function QuickActions({ suites, isAdmin }) {
  const open = new Set((suites || []).filter((s) => s.openable).map((s) => s.key));
  const list = ACTIONS
    .filter((a) => (a.suite ? open.has(a.suite) : true))
    .filter((a) => (a.admin ? isAdmin : true))
    .filter((a) => (a.member ? !isAdmin : true))
    .slice(0, 5);
  if (list.length === 0) return null;
  return (
    <div className="quick-row" aria-label="Quick actions">
      {list.map((a) => (
        <Link key={a.key} to={a.to} className="quick-btn">
          <SuiteIcon name={a.icon || 'grid'} size={15} color="currentColor" />
          {a.label}
        </Link>
      ))}
    </div>
  );
}

export function RecentRow({ userId }) {
  const items = getRecent(userId);
  if (items.length === 0) return null;
  return (
    <div className="recent-row">
      <span className="recent-label">Pick up where you left off</span>
      {items.slice(0, 5).map((r) => (
        <Link key={r.path} to={r.path} className="recent-chip" style={{ '--tint': r.tint || 'var(--brand)' }}>
          <span className="recent-dot" />
          {r.name}
        </Link>
      ))}
    </div>
  );
}
