import { useEffect, useMemo, useState } from 'react';
import * as L from './leaveApi.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const within = (k, a, b) => k >= a && k <= b;

export default function LeaveCalendar({ year, holidays, myRequests }) {
  const [month, setMonth] = useState(new Date().getMonth());
  const [team, setTeam] = useState([]);

  useEffect(() => { L.getTeamCalendar().then(setTeam).catch(() => {}); }, []);

  const holidayMap = useMemo(() => Object.fromEntries(holidays.map((h) => [h.day, h.name])), [holidays]);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7; // Mon=0
    const days = new Date(year, month + 1, 0).getDate();
    const out = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [year, month]);

  const mine = (myRequests || []).filter((r) => r.status === 'pending' || r.status === 'approved');

  return (
    <div className="lv-cal">
      <div className="lv-cal-head">
        <button className="btn btn-ghost btn-sm" onClick={() => setMonth((m) => (m + 11) % 12)}>‹</button>
        <h3>{MONTHS[month]} {year}</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => setMonth((m) => (m + 1) % 12)}>›</button>
        <div className="lv-cal-legend">
          <span><i className="lg holiday" /> Holiday</span>
          <span><i className="lg mine" /> Your leave</span>
          <span><i className="lg team" /> Colleague away</span>
        </div>
      </div>
      <div className="lv-grid">
        {DOW.map((d) => <div key={d} className="lv-dow">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="lv-cell empty" />;
          const k = key(year, month, d);
          const hol = holidayMap[k];
          const dow = new Date(year, month, d).getDay();
          const weekend = dow === 0 || dow === 6;
          const myHere = mine.filter((r) => within(k, r.start_date, r.end_date));
          const teamHere = team.filter((t) => within(k, t.start_date, t.end_date));
          return (
            <div key={i} className={`lv-cell ${weekend ? 'weekend' : ''} ${hol ? 'holiday' : ''}`}>
              <div className="lv-cell-num">{d}</div>
              {hol && <div className="lv-chip hol" title={hol}>{hol}</div>}
              {myHere.map((r) => <div key={r.id} className={`lv-chip ${r.status === 'pending' ? 'mine-pending' : 'mine'}`} style={r.status === 'approved' ? { background: r.leave_types?.color } : undefined}>You{r.status === 'pending' ? ' (pending)' : ''}</div>)}
              {teamHere.slice(0, 2).map((t) => <div key={t.id} className="lv-chip team" title={`${t.person} — away`}>{t.person.split(' ')[0]}</div>)}
              {teamHere.length > 2 && <div className="lv-more">+{teamHere.length - 2} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
