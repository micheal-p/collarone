// Quote-aware CSV parser — tiny and dependency-free on purpose. Handles
// quoted fields, escaped quotes ("") and \n / \r\n line endings. Shared by
// the staff bulk import and the bank statement reconciliation.
export function parseCsv(text) {
  const rows = []; let row = []; let cur = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

// ---- writing CSV ------------------------------------------------------------
// Added next to the parser rather than in a new file: reading and writing the
// same format belong together, and there were already two ad-hoc copies of the
// writing half (attendanceApi.js with a hard-coded header row, and an inline
// one in VisitorsApp). HR needed a third, which is the point at which it
// belongs here.
//
// Nigerian HR managers are asked for a staff schedule in Excel by auditors,
// banks and pension administrators, and "you can't export" ends the
// conversation.

// Quote only when needed, and double any embedded quotes. A name like O'Brien,
// or an address containing a comma, must not shift every later column.
const csvEscape = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// rows: array of arrays. headers: array of strings.
export const toCsv = (headers, rows) =>
  [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');

export const downloadCsv = (csv, filename) => {
  // A BOM so Excel reads UTF-8 correctly — without it, Nigerian names with
  // accents arrive mangled in the very file someone forwards to a bank.
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// One date shape everywhere, and one Excel parses rather than reformats.
export const csvDate = (d) => (d ? String(d).slice(0, 10) : '');

// Stamped into filenames so two exports never overwrite each other in Downloads.
export const csvStamp = () => new Date().toISOString().slice(0, 10);
