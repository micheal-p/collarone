// The notification bell — the visible face of the org event spine
// (org_events). Every suite that emits an event shows up here, so the
// platform reads as ONE product whose parts talk, not 15 silos.
//
// Unread state is a per-user "last seen" watermark in localStorage — cheap,
// no schema, good enough until per-user read-receipts matter. RLS scopes the
// event read to the caller's own org.
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../auth/AuthContext.jsx';

function useClickOutside(ref, onOut) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

const naira = (kobo) => `₦${(Number(kobo) / 100).toLocaleString('en-NG')}`;

// Friendly one-liners per event type. Fallback renders the raw type so a new
// emitter is visible immediately even before it gets copy here.
const COPY = {
  'payment.confirmed': (p) => `Payment received${p.amountKobo ? ` — ${naira(p.amountKobo)}` : ''}${p.reference ? ` (${p.reference})` : ''}`,
  'payment.refunded': (p) => `Refund recorded${p.amountKobo ? ` — ${naira(p.amountKobo)}` : ''}`,
  'billing.renewal_due': () => 'Subscription renewal coming up — see Billing',
  'billing.past_due': () => 'Renewal is due — renew from Billing to keep full access',
  'billing.read_only': () => 'Workspace is read-only — renew from Billing to make changes',
  'billing.suspended': () => 'Workspace suspended for an overdue payment',
  'billing.trial_expired': () => 'Free trial ended — complete activation to continue',
  'hr.hired': (p) => `${p.name || 'A new teammate'} joined the team${p.jobTitle ? ` as ${p.jobTitle}` : ''}`,
  'hr.bulk_imported': (p) => `${p.count || 'New'} staff imported to the team`,
  'invoice.recurring_generated': (p) => `Recurring invoice ${p.docNo || ''} ready for ${p.party || 'your customer'} — review & send`,
  'chat.mention': (p, uid) => `${p.by || 'Someone'} mentioned ${p.mentioned === uid ? 'you' : 'a teammate'} in chat: “${p.snippet || ''}”`,
  'automation.notice': (p) => p.message || 'Automation ran',
  'task.comment': (p, uid) => `${p.by || 'Someone'} commented on ${Array.isArray(p.for) && p.for.includes(uid) ? 'your task' : 'a task'} “${p.title || ''}”: ${p.snippet || ''}`,
};
const ICON = (type) => {
  if (type.startsWith('payment.')) return '₦'; // currency symbol, not decoration
  if (type.startsWith('billing.')) return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>;
  if (type.startsWith('hr.')) return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" /></svg>;
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /></svg>;
};

const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function NotificationBell() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [open, setOpen] = useState(false);
  const seenKey = `co-notif-seen:${user?.id || 'anon'}`;
  const [seenAt, setSeenAt] = useState(() => localStorage.getItem(seenKey) || '1970-01-01');
  const wrapRef = useRef(null);
  useClickOutside(wrapRef, () => setOpen(false));

  const load = () =>
    supabase.from('org_events').select('id, type, payload, created_at')
      .order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => setEvents(data || []), () => {});

  useEffect(() => {
    load();
    const t = setInterval(load, 90 * 1000); // light poll; events are not chat
    return () => clearInterval(t);
  }, []);

  const unread = events.filter((e) => e.created_at > seenAt).length;
  const markSeen = () => {
    const now = new Date().toISOString();
    localStorage.setItem(seenKey, now);
    setSeenAt(now);
  };

  return (
    <div className="waffle-wrap" ref={wrapRef}>
      <button className="iconbtn notif-btn" aria-label={`Notifications${unread ? ` — ${unread} unread` : ''}`}
        onClick={() => { setOpen((v) => !v); if (!open) markSeen(); }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="flyout notif-flyout">
          <div className="flyout-head">Activity</div>
          <div className="notif-list">
            {events.length === 0 && (
              <div className="notif-empty">Nothing yet — payments, approvals and team changes will show up here.</div>
            )}
            {events.map((e) => (
              <div key={e.id} className="notif-row">
                <span className="notif-ic" aria-hidden="true">{ICON(e.type)}</span>
                <span className="notif-body">
                  <span className="notif-text">{(COPY[e.type] || (() => e.type.replace(/[._]/g, ' ')))(e.payload || {}, user?.id)}</span>
                  <span className="notif-time">{ago(e.created_at)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
