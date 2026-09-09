// Every sensitive action taken from Platform Control, as a timeline grouped
// by day. Read newest first; filter by kind of action when looking for one.
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../api/client.js';
import { AUDIT_LABEL, Empty, Seg, fmtTime, naira } from './shared.jsx';

const TONE = { delete_org: 'err', refund_transaction: 'warn', confirm_payment: 'ok', guest_mode: '', payment_gateway: '', impersonate: 'warn' };

const dayKey = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export default function Audit() {
  const [entries, setEntries] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [kind, setKind] = useState('all');

  useEffect(() => {
    Promise.all([apiGet('/platform/audit-log'), apiGet('/platform/organizations')])
      .then(([a, o]) => { setEntries(a.entries || []); setOrgs(o.organizations || []); })
      .catch(() => setEntries([]));
  }, []);

  const orgName = (id) => orgs.find((o) => o.id === id)?.name || (id ? `${id.slice(0, 8)}… (deleted)` : '');
  const all = entries || [];
  const kinds = useMemo(() => {
    const c = {};
    all.forEach((e) => { c[e.action] = (c[e.action] || 0) + 1; });
    return c;
  }, [all]);
  const shown = all.filter((e) => kind === 'all' || e.action === kind);
  const days = useMemo(() => {
    const m = new Map();
    shown.forEach((e) => { const k = dayKey(e.created_at); if (!m.has(k)) m.set(k, []); m.get(k).push(e); });
    return [...m.entries()];
  }, [shown]);

  const detail = (e) => {
    if (e.action === 'confirm_payment') return `${e.details?.type ? e.details.type.replace(/_/g, ' ') : 'payment'} · ${naira(e.details?.amountKobo || 0)}`;
    if (e.action === 'refund_transaction') return `${naira(e.details?.amountKobo || 0)}${e.details?.reason ? ` · ${e.details.reason}` : ''}`;
    if (e.action === 'delete_org') return `${e.details?.memberCount ?? 0} staff account${e.details?.memberCount === 1 ? '' : 's'} removed`;
    if (e.action === 'guest_mode') return e.details?.reason ? `Reason: ${e.details.reason}` : '';
    if (e.action === 'payment_gateway') return e.details?.enabled === false ? 'Card payments disabled' : 'Card payments enabled';
    if (e.action === 'impersonate') return e.details?.targetEmail || '';
    return '';
  };

  const options = [['all', 'All', all.length], ...Object.keys(AUDIT_LABEL).filter((k) => kinds[k]).map((k) => [k, AUDIT_LABEL[k], kinds[k]])];

  return (
    <>
      <div className="pc-toolbar"><Seg label="Action" value={kind} onChange={setKind} options={options} /></div>
      {entries == null ? <div className="pc-empty">Loading…</div> : shown.length === 0 ? (
        <div className="pc-card"><Empty title="No sensitive actions recorded">Confirming a payment, refunding, guesting into a workspace, changing a card gateway or deleting an organization all write a line here.</Empty></div>
      ) : (
        <div>
          {days.map(([day, list]) => (
            <div key={day}>
              <div className="pc-day">{day}</div>
              <div className="pc-panel">
                {list.map((e) => (
                  <div key={e.id} className="pc-event">
                    <span className="pc-event-time">{fmtTime(e.created_at)}</span>
                    <span className={`pc-event-dot ${TONE[e.action] || ''}`} />
                    <div>
                      <div className="pc-event-what"><b>{AUDIT_LABEL[e.action] || e.action}</b>{e.target_org_id && <> · {orgName(e.target_org_id)}</>}</div>
                      {detail(e) && <div className="pc-event-detail">{detail(e)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {all.length >= 100 && <p className="pc-note" style={{ marginTop: 14 }}>Showing the most recent 100 actions.</p>}
        </div>
      )}
    </>
  );
}
