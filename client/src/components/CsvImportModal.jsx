import { useState } from 'react';
import { Modal } from './ui.jsx';
import { parseCsv } from '../lib/csv.js';

// Bring an existing list in from Excel instead of typing it.
//
// The same three steps as the staff import in Admin → Users, which is the one
// people already know: choose a CSV, match its columns (guessed from the
// header row, correctable), review what will and will not go in. Nothing is
// written until the last button, and every row that is skipped says why.
//
//   fields    [{ key, label, required?, guess: /regex for the header/ }]
//   validate  (row, seen) => problem string or null. `seen` is a Set shared
//             across the file, for catching duplicates within it.
//   onImport  (rows) => Promise<{ created, skipped: [{ label, error }] }>
//   extra     optional node rendered above the preview (an option the
//             import needs, like which warehouse opening stock goes into)
export default function CsvImportModal({ title, noun, intro, fields, validate, onImport, onClose, onDone, extra = null, flash }) {
  const [rows, setRows] = useState(null);
  const [map, setMap] = useState({});
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);

  const loadText = (text) => {
    const parsed = parseCsv(text.replace(/^﻿/, ''));
    if (parsed.length < 2) { flash(`That file needs a header row plus at least one ${noun} row.`, true); return; }
    const header = parsed[0];
    const guessed = {};
    for (const f of fields) {
      const idx = header.findIndex((h) => f.guess.test(String(h).trim()));
      if (idx >= 0 && !Object.values(guessed).includes(idx)) guessed[f.key] = idx;
    }
    setMap(guessed); setRows(parsed);
  };
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      flash('That is an Excel workbook. In Excel choose File → Save As → CSV, then pick the CSV here.', true);
      e.target.value = '';
      return;
    }
    file.text().then(loadText, () => flash('Could not read that file.', true));
    e.target.value = '';
  };

  const header = rows?.[0] || [];
  const body = rows ? rows.slice(1) : [];
  const mapped = body.map((r) => Object.fromEntries(fields.map((f) => [f.key, map[f.key] != null ? String(r[map[f.key]] ?? '').trim() : ''])));
  const seen = new Set();
  const problems = mapped.map((m) => {
    for (const f of fields) if (f.required && !m[f.key]) return `Missing ${f.label.toLowerCase()}`;
    return validate ? validate(m, seen) : null;
  });
  const valid = mapped.filter((_, i) => !problems[i]);
  const ready = fields.every((f) => !f.required || map[f.key] != null) && valid.length > 0;

  const run = async () => {
    setBusy(true);
    try {
      const result = await onImport(valid);
      setOutcome(result);
      onDone?.(result);
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  if (outcome) {
    const skipped = outcome.skipped || [];
    return (
      <Modal title="Import finished" onClose={onClose}>
        <p style={{ fontSize: 14, margin: '2px 0 12px' }}>
          <strong>{outcome.created}</strong> {noun}{outcome.created === 1 ? '' : 's'} added
          {skipped.length > 0 && <> · <strong>{skipped.length}</strong> skipped</>}.
        </p>
        {skipped.length > 0 && (
          <div className="field" style={{ maxHeight: 200, overflowY: 'auto' }}>
            {skipped.map((s, i) => <div key={i} style={{ fontSize: 12.5, padding: '3px 0' }}><strong>{s.label}</strong>, {s.error}</div>)}
          </div>
        )}
        <div className="modal-actions"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
      </Modal>
    );
  }

  const shown = fields.filter((f) => map[f.key] != null || f.required);
  return (
    <Modal title={title} onClose={onClose} wide>
      {!rows ? (
        <div>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>
            {intro} In Excel or Google Sheets: <strong>File → Save As / Download → CSV</strong>, then choose the file here.
            You'll match the columns and review before anything is added.
          </p>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            Choose CSV file
            <input type="file" accept=".csv,text/csv,.xls,.xlsx" onChange={onFile} style={{ display: 'none' }} />
          </label>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
            Needs at least {fields.filter((f) => f.required).map((f) => f.label.toLowerCase()).join(' and ')}. These come along too if you have them: {fields.filter((f) => !f.required).map((f) => f.label.toLowerCase()).join(', ')}.
          </p>
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0 12px' }}>
            {fields.map((f) => (
              <div className="field" key={f.key}>
                <label>{f.label}{f.required && ' *'}</label>
                <select className="input" value={map[f.key] ?? ''} onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) }))}>
                  <option value="">— not in file —</option>
                  {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
          {extra}
          <div style={{ margin: '10px 0 4px', fontSize: 13 }}>
            <strong>{valid.length}</strong> of {body.length} row{body.length === 1 ? '' : 's'} ready to import
            {valid.length < body.length && <span className="muted">, rows with problems are skipped, shown below</span>}
          </div>
          <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
            <table className="table" style={{ fontSize: 12.5 }}>
              <thead><tr>{shown.map((f) => <th key={f.key}>{f.label}</th>)}<th /></tr></thead>
              <tbody>
                {mapped.slice(0, 80).map((m, i) => (
                  <tr key={i} style={problems[i] ? { opacity: 0.55 } : undefined}>
                    {shown.map((f) => <td key={f.key}>{m[f.key]}</td>)}
                    <td style={{ color: 'var(--danger, #a4262c)', fontSize: 11.5 }}>{problems[i] || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {body.length > 80 && <p className="muted" style={{ fontSize: 12 }}>Showing the first 80 of {body.length} rows.</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setRows(null)}>Choose another file</button>
            <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={run}>
              {busy ? <span className="spinner" /> : `Import ${valid.length} ${noun}${valid.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
