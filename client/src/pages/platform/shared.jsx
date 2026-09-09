// Pieces shared by Platform Control's working sections: labels, formatters,
// the org modals, and the small building blocks every section page uses.
import { useState, useEffect } from 'react';
import { apiPost } from '../../api/client.js';
import { safeExternalUrl, EXTERNAL_LINK_REL } from '../../lib/safeUrl.js';

export const STATUS_LABEL = { pending_payment: 'Pending payment', active: 'Active', past_due: 'Past due', read_only: 'Read-only', suspended: 'Suspended', cancelled: 'Cancelled' };
export const STATUS_DOT = { active: 'var(--ok)', pending_payment: 'var(--warn)', past_due: 'var(--warn)', read_only: 'var(--warn)', suspended: 'var(--err)', cancelled: 'var(--faint)' };
export const AUDIT_LABEL = { confirm_payment: 'Confirmed payment', refund_transaction: 'Recorded refund', delete_org: 'Deleted organization', impersonate: 'Impersonated admin (retired)', guest_mode: 'Guested into organization', payment_gateway: 'Changed card-payment gateway' };
export const TX_TYPE = { activation_fee: 'Activation fee', credit_purchase: 'Seat credits', renewal: 'Renewal' };
export const ALL_SUITE_KEYS = ['hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm', 'attendance', 'procurement', 'inventory', 'finance', 'projects', 'documents'];

export const naira = (kobo) => `₦${Math.round(Number(kobo || 0) / 100).toLocaleString()}`;
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
export const DAY_MS = 24 * 60 * 60 * 1000;

// "2h", "3d", or the date: recency without a column of timestamps.
export function ago(d) {
  if (!d) return '';
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function SectionHead({ title, count, children }) {
  return (
    <div className="pc-sec-head">
      <h2 className="pc-sec-title">{title}</h2>
      {count !== undefined && <span className="pc-sec-count">{count}</span>}
      <span className="pc-sec-spacer" />
      {children}
    </div>
  );
}

export function Seg({ value, onChange, options, label }) {
  return (
    <div className="pc-seg" role="tablist" aria-label={label}>
      {options.map(([k, text, n]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'active' : ''} onClick={() => onChange(k)}>
          {text}{n > 0 && <span className="pc-seg-n">{n}</span>}
        </button>
      ))}
    </div>
  );
}

export function StatusPill({ status }) {
  return (
    <span className="pc-pill">
      <span className="pc-dot" style={{ background: STATUS_DOT[status] || 'var(--faint)' }} />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function Facts({ items }) {
  return (
    <dl className="pc-facts">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="pc-empty-block">
      {title && <div className="pc-empty-title">{title}</div>}
      <div>{children}</div>
    </div>
  );
}

export function WebsiteLink({ org, site, themes }) {
  const themeName = site && (themes.find((t) => t.key === site.theme_key)?.name || site.theme_key);
  if (site) {
    return site.published ? (
      <a href={`/site/${org.slug}`} target="_blank" rel="noreferrer" title={`"${site.site_name}", ${themeName} theme`} className="pc-pill" style={{ color: 'var(--ok)' }}>
        <span className="pc-dot" style={{ background: 'var(--ok)' }} />Live site
      </a>
    ) : (
      <span title={`"${site.site_name}", ${themeName} theme, not published yet`} className="pc-pill">
        <span className="pc-dot" style={{ background: 'var(--faint)' }} />Draft site
      </span>
    );
  }
  if (safeExternalUrl(org.external_website_url)) {
    return <a href={safeExternalUrl(org.external_website_url)} target="_blank" rel={EXTERNAL_LINK_REL} title={org.external_website_url} className="pc-pill" style={{ color: 'var(--blue)' }}>External site ↗</a>;
  }
  return <span className="pc-faint">No website</span>;
}

export function DeleteOrgModal({ org, onClose, onConfirm, busy }) {
  const [text, setText] = useState('');
  // The comparison ignores case and surrounding spaces: a confirm-by-typing
  // box exists to prove intent, not to test your shift key. The token is
  // rendered in its real case, never inside an uppercasing label.
  const typed = text.trim().toLowerCase();
  const target = String(org.slug || '').trim().toLowerCase();
  const matches = typed === target;
  return (
    <div className="pc-scrim" onMouseDown={onClose}>
      <div className="pc-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Delete {org.name}</h2>
        <p style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.6, margin: 0 }}>
          This permanently deletes {org.name}, every staff account, the organization record, and its billing history. This cannot be undone.
        </p>
        <div className="pc-field" style={{ margin: '16px 0 0' }}>
          <span>Confirm by typing the workspace address</span>
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--dim)' }}>
            Type <code style={{ fontFamily: 'var(--mono)', fontSize: 13, background: 'rgba(0,0,0,.06)', padding: '1px 6px', borderRadius: 5, color: 'var(--text)' }}>{org.slug}</code> below.
          </p>
          <input className="pc-input" value={text} autoFocus autoCapitalize="off" autoCorrect="off" spellCheck={false}
            onChange={(e) => setText(e.target.value)} placeholder={org.slug}
            onKeyDown={(e) => { if (e.key === 'Enter' && matches && !busy) onConfirm(); }} />
          {text.trim() !== '' && !matches && (
            <span style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit', fontSize: 12.5, color: 'var(--err)' }}>
              That doesn’t match “{org.slug}” yet.
            </span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button className="pc-btn" onClick={onClose}>Cancel</button>
          <button className="pc-btn danger" disabled={!matches || busy} onClick={onConfirm}
            title={matches ? 'This cannot be undone' : `Type “${org.slug}” to enable this`}
            style={matches ? { color: 'var(--err)', borderColor: 'rgba(180,35,24,0.5)' } : undefined}>
            {busy ? '…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Manual billing controls: how the operator runs the dunning ladder by hand
// (the auto-advance cron is off unless PAYWALL_ENFORCE is set).
export function BillingModal({ org, onClose, onSaved, flash }) {
  const [busy, setBusy] = useState('');
  const act = async (label, payload) => {
    setBusy(label);
    try {
      const d = await apiPost('/platform/set-billing-state', { orgId: org.id, ...payload });
      flash('Billing updated.');
      onSaved(d);
    } catch (e) { flash(e.message, true); } finally { setBusy(''); }
  };
  return (
    <div className="pc-scrim" onMouseDown={onClose}>
      <div className="pc-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>Billing, {org.name}</h2>
        <p style={{ fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.6, margin: '0 0 14px' }}>
          Current state: <strong>{STATUS_LABEL[org.status] || org.status}</strong>
          {org.current_period_end && <> · renews {fmtDate(org.current_period_end)}</>}
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="pc-btn" disabled={!!busy} onClick={() => act('renew', { status: 'active', periodEndDays: 30 })}>{busy === 'renew' ? '…' : 'Restore to active + renew 30 days'}</button>
          <button className="pc-btn" disabled={!!busy} onClick={() => act('extend', { periodEndDays: 30 })}>{busy === 'extend' ? '…' : 'Extend renewal by 30 days'}</button>
          <button className="pc-btn" disabled={!!busy} onClick={() => act('pastdue', { status: 'past_due' })}>{busy === 'pastdue' ? '…' : 'Mark past due (start 7-day grace)'}</button>
          <button className="pc-btn" disabled={!!busy} onClick={() => act('readonly', { status: 'read_only' })}>{busy === 'readonly' ? '…' : 'Make read-only'}</button>
          <button className="pc-btn danger" disabled={!!busy} onClick={() => act('suspend', { status: 'suspended' })}>{busy === 'suspend' ? '…' : 'Suspend (lock out)'}</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="pc-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// Merchant's own Paystack keys, stored via the service role, never readable
// from the browser, never displayed back (only a masked prefix).
export function GatewayModal({ org, onClose, flash }) {
  const [state, setState] = useState(null);
  const [f, setF] = useState({ publicKey: '', secretKey: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiPost('/platform/payment-gateway', { orgId: org.id, mode: 'get' }).then(setState).catch((e) => flash(e.message, true));
  }, [org.id]); // eslint-disable-line

  const save = async (enabled) => {
    setBusy(true);
    try {
      const d = await apiPost('/platform/payment-gateway', { orgId: org.id, mode: 'set', publicKey: f.publicKey, secretKey: f.secretKey, enabled });
      flash(enabled ? `Card payments enabled for ${org.name}.` : `Card payments disabled for ${org.name}.`);
      setState((s) => ({ ...s, enabled: d.enabled, hasKeys: s?.hasKeys || Boolean(f.secretKey) }));
      onClose();
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="pc-scrim" onMouseDown={onClose}>
      <div className="pc-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>Card payments, {org.name}</h2>
        <p style={{ fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.6, margin: '0 0 14px' }}>
          The merchant's OWN Paystack keys, payments settle to their bank, Collarone never holds funds.
          {state && (state.hasKeys
            ? ` Keys on file (${state.publicKeyMasked || 'set'}), currently ${state.enabled ? 'ENABLED' : 'disabled'}. Paste new keys only to replace them.`
            : ' No keys on file yet.')}
        </p>
        <label className="pc-field" style={{ marginBottom: 10 }}>
          <span>Paystack public key</span>
          <input className="pc-input" value={f.publicKey} onChange={(e) => setF((s) => ({ ...s, publicKey: e.target.value }))} placeholder="pk_live_…" />
        </label>
        <label className="pc-field">
          <span>Paystack secret key</span>
          <input className="pc-input" type="password" value={f.secretKey} onChange={(e) => setF((s) => ({ ...s, secretKey: e.target.value }))} placeholder="sk_live_…" />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button className="pc-btn" onClick={onClose}>Cancel</button>
          {state?.enabled && <button className="pc-btn danger" disabled={busy} onClick={() => save(false)}>Disable</button>}
          <button className="pc-btn primary" disabled={busy || (!state?.hasKeys && (!f.publicKey || !f.secretKey))} onClick={() => save(true)}>
            {busy ? '…' : 'Enable card payments'}
          </button>
        </div>
      </div>
    </div>
  );
}
