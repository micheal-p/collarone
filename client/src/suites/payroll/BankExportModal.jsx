import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/ui.jsx';
import * as P from './payrollApi.js';
import { FORMATS, formatById, toRows, validateRows, renderFile, fileName, totalOf } from './bankFormats.js';
import { todayISO } from '../../lib/today.js';

// Handing the salary file to the bank.
//
// This screen exists because of what happens after the download. The file goes
// to a bank liaison, who uploads it to their bank's bulk-payment portal, which
// either accepts it or rejects the WHOLE thing for one bad row — after upload,
// with an error naming a line number and nothing else, on payday.
//
// So three things happen before the download button does anything:
//
//   1. Pre-flight checks. Every row that a portal will reject is listed here,
//      by name, while there is still time to fix it. This is the half we can
//      be certain about, and it is worth more than the layouts.
//
//   2. A preview of the actual first rows. Not a description of the format —
//      the bytes that will be in the file.
//
//   3. For any bank-specific layout, a one-time confirmation that someone has
//      compared that preview against the template their bank actually gave
//      them. Our bank layouts are reconstructions: the portals are behind
//      corporate logins and change without notice. Rather than quietly hope,
//      the app asks once per organisation and remembers.

const money = (n) => `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BankExportModal({ run, lines, onClose, flash }) {
  const [prefs, setPrefs] = useState(null);
  const [formatId, setFormatId] = useState('generic');
  const [valueDate, setValueDate] = useState(todayISO());
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    P.getExportPrefs()
      .then((p) => { setPrefs(p); setFormatId(p.default_format_id || 'generic'); })
      .catch(() => setPrefs({ default_format_id: 'generic', verified_formats: [] }));
  }, []);

  const format = formatById(formatId);
  const rows = useMemo(() => toRows(run, lines, { valueDate }), [run, lines, valueDate]);
  const problems = useMemo(() => validateRows(rows, format), [rows, format]);
  const blocking = problems.filter((p) => p.severity === 'blocking');
  const warnings = problems.filter((p) => p.severity === 'warning');
  const preview = useMemo(() => renderFile(rows.slice(0, 3), format).split('\r\n'), [rows, format]);

  // A layout is trusted if it is our own neutral one, or if this organisation
  // has already checked it against their bank's template.
  const verified = format.verified || (prefs?.verified_formats || []).includes(format.id);
  const canDownload = prefs !== null && verified && blocking.length === 0;

  const persist = async (nextDefault, nextVerified) => {
    setSaving(true);
    try {
      const saved = await P.setExportPrefs(nextDefault, nextVerified);
      setPrefs(saved);
      return true;
    } catch (e) { flash(e.message, true); return false; }
    finally { setSaving(false); }
  };

  const confirmLayout = async () => {
    const next = [...new Set([...(prefs?.verified_formats || []), format.id])];
    if (await persist(prefs?.default_format_id || 'generic', next)) {
      setConfirming(false);
      flash(`${format.label} confirmed. You won't be asked again.`);
    }
  };

  const download = async () => {
    const text = renderFile(rows, format);
    P.downloadBankFile(text, fileName(run, format));
    // Remember what they actually used, so next month opens on it.
    if (prefs && prefs.default_format_id !== format.id) {
      persist(format.id, prefs.verified_formats || []);
    }
  };

  // The suite's own Modal, not the platform-admin one: it closes on Escape and
  // its body scrolls at 92vh. That matters here more than on most screens —
  // a run with a dozen rejected rows makes this the tallest dialog in the
  // product, and in a fixed-height box the download button ends up off-screen.
  return (
    <Modal title="Send to the bank" wide onClose={onClose}>
      <div>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 16px' }}>
          {rows.length} {rows.length === 1 ? 'person' : 'people'}, {money(totalOf(rows))} in total.
        </p>

        {/* ---- which layout ---- */}
        <div className="field">
          <label htmlFor="bank-layout">Your bank&apos;s layout</label>
        </div>
        <select id="bank-layout" className="select" value={formatId} onChange={(e) => setFormatId(e.target.value)} style={{ width: '100%' }}>
          {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0', lineHeight: 1.5 }}>{format.hint}</p>

        {/* A date column only exists in some layouts, so only ask when it does. */}
        {format.columns.some((c) => /date/i.test(c.header)) && (
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="bank-date">Payment date</label>
            <input id="bank-date" className="input" type="date" value={valueDate} onChange={(e) => setValueDate(e.target.value)} />
          </div>
        )}

        {/* ---- what will actually be in the file ---- */}
        <div style={{ marginTop: 16 }}>
          <div className="field"><label>The first rows of your file</label></div>
          <pre style={{
            marginTop: 6, padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)',
            border: '1px solid var(--line)', fontFamily: 'var(--mono)', fontSize: 11.5,
            lineHeight: 1.7, overflowX: 'auto', whiteSpace: 'pre', color: 'var(--text-2)',
          }}>{preview.join('\n')}{rows.length > 3 ? `\n… ${rows.length - 3} more` : ''}</pre>
        </div>

        {/* ---- rows the bank will reject ---- */}
        {blocking.length > 0 && (
          <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8, background: 'rgba(248,81,73,0.07)', border: '1px solid rgba(248,81,73,0.3)' }}>
            <div style={{ fontWeight: 650, fontSize: 13.5, color: 'var(--err)' }}>
              {blocking.length} {blocking.length === 1 ? 'row the bank will reject' : 'rows the bank will reject'}
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px', lineHeight: 1.5 }}>
              A bulk-payment portal refuses the whole file for one bad row. Fix these first.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
              {blocking.slice(0, 8).map((p, i) => (
                <li key={i}><strong>{p.who || `Row ${p.row}`}</strong> — {p.message}</li>
              ))}
              {blocking.length > 8 && <li className="muted">and {blocking.length - 8} more</li>}
            </ul>
          </div>
        )}

        {warnings.length > 0 && (
          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            <div style={{ fontWeight: 650, fontSize: 13.5 }}>{warnings.length} worth a look</div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
              {warnings.slice(0, 5).map((p, i) => (
                <li key={i}><strong>{p.who || `Row ${p.row}`}</strong> — {p.message}</li>
              ))}
              {warnings.length > 5 && <li className="muted">and {warnings.length - 5} more</li>}
            </ul>
          </div>
        )}

        {/* ---- the one-time check on a bank-specific layout ---- */}
        {!verified && prefs && (
          <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--line-strong)' }}>
            <div style={{ fontWeight: 650, fontSize: 13.5 }}>Check this against your bank&apos;s template, once</div>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 10px', lineHeight: 1.55 }}>
              We build this layout from what {format.label.replace(/\s*\(.*\)/, '')} normally asks for, but banks revise
              their templates without telling anyone. Open the template your bank gave you, compare the column order
              above, and confirm. We&apos;ll stop asking after this.
            </p>
            {confirming ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={saving} onClick={confirmLayout}>
                  {saving ? <span className="spinner" /> : 'Yes, the columns match'}
                </button>
                <button className="btn btn-ghost" disabled={saving} onClick={() => setConfirming(false)}>Not yet</button>
              </div>
            ) : (
              <button className="btn btn-ghost" onClick={() => setConfirming(true)}>I&apos;ve checked it</button>
            )}
          </div>
        )}

        {/* ---- the Excel warning, which is not hypothetical ---- */}
        <p className="muted" style={{ fontSize: 12.5, margin: '16px 0 0', lineHeight: 1.55 }}>
          Upload this file to your bank as it downloads. Opening it in Excel first will strip the leading zero from
          account numbers that start with one, and the bank will reject those rows.
        </p>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canDownload} onClick={download}
            title={
              !prefs ? 'Loading your settings'
                : blocking.length ? 'Fix the rejected rows first'
                  : !verified ? "Confirm the layout matches your bank's template first"
                    : 'This is the file your bank uploads'
            }>
            Download for the bank
          </button>
        </div>
      </div>
    </Modal>
  );
}
