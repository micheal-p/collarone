import { apiGet, apiPost, apiDelete } from '../../api/client.js';

export const getCompliance = () => apiGet('/compliance');
export const savePref = (body) => apiPost('/compliance/prefs', body).then((d) => d.pref);
export const markDone = (body) => apiPost('/compliance/marks', body).then((d) => d.mark);
export const unmark = (id) => apiDelete(`/compliance/marks/${id}`);

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const clampDay = (year, monthIdx, day) => {
  const last = new Date(year, monthIdx + 1, 0).getDate();
  return Math.min(day || last, last);
};

// Build the list of deadline occurrences to show: for monthly rules, the
// obligation for month P is due on day D of month P+1.
//
// This used to look back exactly one month, which meant an unmarked period
// silently DISAPPEARED the moment it was two months old. A business that
// forgot April's PAYE would find, in June, that April had quietly stopped
// existing — the one thing a compliance calendar must never do, since an
// unremitted month is precisely the thing you need shown. Now every period
// from the tracking start date to now is generated, and anything already
// marked done is simply rendered as done.
//
// `startFrom` is the org's chosen tracking start (a YYYY-MM string, from the
// per-rule preference or the org's first month). Without it we would generate
// deadlines predating the customer's existence and open the module on a wall
// of red for months they were never trading.
export function buildDeadlines(rules, prefs, marks, today = new Date(), startFrom = null) {
  const prefBy = Object.fromEntries((prefs || []).map((p) => [p.rule_key, p]));
  const doneKey = new Set((marks || []).map((m) => `${m.rule_key}|${m.period}`));
  const markBy = Object.fromEntries((marks || []).map((m) => [`${m.rule_key}|${m.period}`, m]));
  const out = [];

  for (const r of rules || []) {
    const pref = prefBy[r.key];
    if (pref && pref.enabled === false) continue;

    if (r.frequency === 'monthly') {
      // Every period from the tracking start to this month, so nothing that
      // was never remitted can age out of view. Capped at 24 months so a badly
      // set start date cannot render three years of rows.
      const start = (pref?.start_period || startFrom || '').match(/^\d{4}-\d{2}$/)
        ? (pref?.start_period || startFrom) : null;
      let months = 1;
      if (start) {
        const [sy, sm] = start.split('-').map(Number);
        months = Math.min(24, Math.max(1, (today.getFullYear() - sy) * 12 + (today.getMonth() + 1 - sm)));
      }
      const backs = Array.from({ length: months + 1 }, (_, i) => months - i);
      for (const back of backs) {
        const p = new Date(today.getFullYear(), today.getMonth() - back, 1);
        const period = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`;
        const dueMonth = new Date(p.getFullYear(), p.getMonth() + 1, 1);
        const due = new Date(dueMonth.getFullYear(), dueMonth.getMonth(), clampDay(dueMonth.getFullYear(), dueMonth.getMonth(), r.due_day));
        out.push({ rule: r, period, periodLabel: `${MONTHS[p.getMonth()]} ${p.getFullYear()}`, due, done: doneKey.has(`${r.key}|${period}`), mark: markBy[`${r.key}|${period}`] });
      }
    } else {
      const month = (pref?.annual_month || r.default_month);
      if (!month) {
        out.push({ rule: r, period: String(today.getFullYear()), periodLabel: String(today.getFullYear()), due: null, needsSetup: true, done: doneKey.has(`${r.key}|${today.getFullYear()}`), mark: markBy[`${r.key}|${today.getFullYear()}`] });
        continue;
      }
      const day = pref?.annual_day || r.due_day || 28;
      const year = today.getFullYear();
      const due = new Date(year, month - 1, clampDay(year, month - 1, day));
      const period = String(year);
      out.push({ rule: r, period, periodLabel: `${year}`, due, done: doneKey.has(`${r.key}|${period}`), mark: markBy[`${r.key}|${period}`] });
    }
  }

  return out.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.due) return 1; if (!b.due) return -1;
    return a.due - b.due;
  });
}

export const daysUntil = (due, today = new Date()) => {
  if (!due) return null;
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due - t0) / 86400000);
};

export const fmtDue = (d) => d
  ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';
