import { useCallback, useEffect, useRef, useState } from 'react';

/* =========================================================================
   Shared UI primitives — one toast, one modal, one confirm dialog for every
   suite, instead of per-suite copies of each (and native confirm/prompt).
   ========================================================================= */

/* ---- crash-proof search matching ------------------------------------------
   Replaces the `new RegExp(userInput, 'i')` pattern — a raw "(" or "[" in a
   search box throws inside useMemo and white-screens the suite. Returns a
   function that is true when ANY of its arguments contains the query. */
export const searchMatcher = (q) => {
  const needle = (q || '').trim().toLowerCase();
  if (!needle) return () => true;
  return (...haystacks) => haystacks.some((h) => String(h ?? '').toLowerCase().includes(needle));
};

/* ---- toast -----------------------------------------------------------------
   const { flash, toastNode } = useToast();
   flash('Saved.');  flash(msg, true) for errors.  Render {toastNode} once.
   Clears the previous timer so overlapping toasts don't cut each other off. */
export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = useCallback((msg, isErr = false) => {
    clearTimeout(timer.current);
    setToast({ msg, isErr });
    timer.current = setTimeout(() => setToast(null), isErr ? 4200 : 2800);
  }, []);
  const toastNode = toast
    ? <div className={`toast ${toast.isErr ? 'error' : ''}`} role="status">{toast.msg}</div>
    : null;
  return { flash, toastNode };
}

/* ---- modal -----------------------------------------------------------------
   <Modal title="New record" onClose={...} wide>...body...</Modal>
   Escape closes. Overlay mousedown closes. Always has an X button. */
export function Modal({ title, onClose, wide = false, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ---- confirm dialog --------------------------------------------------------
   Styled replacement for window.confirm()/prompt():

     const { confirm, confirmNode } = useConfirm();   // render {confirmNode} once
     const ok = await confirm({ title: 'Delete run?', message: '…', confirmLabel: 'Delete', danger: true });
     const res = await confirm({ title: 'Reject request', input: { label: 'Reason', required: false } });
     // res === null when cancelled; { value } when confirmed with an input.

   Escape or overlay click cancels — cancelling NEVER proceeds. */
export function useConfirm() {
  const [req, setReq] = useState(null); // { opts, resolve }
  const confirm = useCallback((opts) => new Promise((resolve) => setReq({ opts, resolve })), []);
  const close = (result) => { req?.resolve(result); setReq(null); };

  const confirmNode = req ? (
    <ConfirmDialog key={req.opts.title} opts={req.opts} onDone={close} />
  ) : null;
  return { confirm, confirmNode };
}

function ConfirmDialog({ opts, onDone }) {
  const { title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, input = null } = opts;
  const [value, setValue] = useState('');
  const cancel = () => onDone(null);
  const ok = () => onDone(input ? { value: value.trim() } : true);
  const okDisabled = Boolean(input?.required) && !value.trim();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') cancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line

  return (
    <div className="modal-overlay" onMouseDown={cancel}>
      <div className="modal" style={{ maxWidth: 420 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-body" style={{ padding: '24px 24px 20px' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 17 }}>{title}</h2>
          {message && <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>{message}</p>}
          {input && (
            <div className="field" style={{ marginTop: 12 }}>
              {input.label && <label>{input.label}</label>}
              <textarea className="input" rows={3} autoFocus placeholder={input.placeholder || ''}
                value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
          )}
          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={cancel}>{cancelLabel}</button>
            <button type="button" className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`} disabled={okDisabled} onClick={ok} autoFocus={!input}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- empty state ----------------------------------------------------------- */
export function EmptyState({ icon = null, title, hint, action = null }) {
  return (
    <div className="empty-state">
      <span className="es-icon">
        {icon || <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18" /></svg>}
      </span>
      <span className="es-title">{title}</span>
      {hint && <span className="es-hint">{hint}</span>}
      {action}
    </div>
  );
}
