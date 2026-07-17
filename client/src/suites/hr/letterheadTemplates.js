// ============================================================================
// HR letterhead templates — 8 designs rendered from saved company details.
// Same philosophy as Trade Documents' invoice templates: pure CSS on a shared
// HTML skeleton, so previews are live and printing needs no server.
// ============================================================================

export const LETTERHEAD_TEMPLATES = {
  classic:   { label: 'Classic',   hint: 'Serif, centered — the traditional Nigerian business letterhead' },
  executive: { label: 'Executive', hint: 'Ink band across the top, reversed company name' },
  modern:    { label: 'Modern',    hint: 'Accent bar on the left, clean sans-serif' },
  minimal:   { label: 'Minimal',   hint: 'Hairline rule, understated' },
  elegant:   { label: 'Elegant',   hint: 'Italic serif wordmark, generous whitespace' },
  corporate: { label: 'Corporate', hint: 'Two-column head: name left, contact right' },
  bold:      { label: 'Bold',      hint: 'Oversized name, heavy accent underline' },
  warm:      { label: 'Warm',      hint: 'Cream paper tone, soft serif' },
};

export const LETTER_TYPES = {
  confirmation: {
    label: 'Confirmation letter',
    hint: 'Confirms an employee after probation',
    skeleton: (c) => `Dear ${c.employeeName},\n\nFollowing the satisfactory completion of your probationary period, we are pleased to confirm your appointment as ${c.jobTitle || '[job title]'} with effect from [date].\n\nAll other terms and conditions of your employment remain as stated in your letter of engagement.\n\nWe congratulate you and look forward to your continued contribution.\n\nYours faithfully,`,
  },
  promotion: {
    label: 'Promotion letter',
    hint: 'Announces a promotion and new terms',
    skeleton: (c) => `Dear ${c.employeeName},\n\nWe are pleased to inform you of your promotion to the position of [new title], effective [date].\n\nYour new remuneration and any revised terms will be communicated in the attached schedule. All other terms of your employment remain unchanged.\n\nCongratulations on this well-deserved recognition.\n\nYours faithfully,`,
  },
  introduction: {
    label: 'Introduction letter',
    hint: 'Introduces the employee to a bank, embassy or third party',
    skeleton: (c) => `TO WHOM IT MAY CONCERN\n\nDear Sir/Madam,\n\nRE: LETTER OF INTRODUCTION — ${(c.employeeName || '').toUpperCase()}\n\nThis is to confirm that ${c.employeeName} is a staff member of ${c.companyName}, currently serving as ${c.jobTitle || '[job title]'}${c.startDate ? ` since ${c.startDate}` : ''}.\n\nThis letter is issued at the employee's request for [purpose]. Kindly accord them the necessary assistance.\n\nYours faithfully,`,
  },
  employment_verification: {
    label: 'Employment verification',
    hint: 'Verifies employment status and role',
    skeleton: (c) => `TO WHOM IT MAY CONCERN\n\nDear Sir/Madam,\n\nRE: EMPLOYMENT VERIFICATION — ${(c.employeeName || '').toUpperCase()}\n\nWe confirm that ${c.employeeName} is employed by ${c.companyName} as ${c.jobTitle || '[job title]'}${c.startDate ? `, having joined the company on ${c.startDate}` : ''}. They remain a staff member in good standing as at the date of this letter.\n\nThis letter is issued upon the employee's request and confers no liability on the company.\n\nYours faithfully,`,
  },
  query: {
    label: 'Query letter',
    hint: 'Formal query — first step of fair-hearing discipline',
    skeleton: (c) => `Dear ${c.employeeName},\n\nRE: QUERY — [subject]\n\nIt has been observed that [describe the conduct/incident, with date and place].\n\nThis conduct, if established, contravenes the company's policies. You are hereby required to submit a written explanation to the undersigned within 48 hours of receipt of this letter, stating why disciplinary action should not be taken against you.\n\nYours faithfully,`,
  },
  warning: {
    label: 'Warning letter',
    hint: 'Formal warning following a disciplinary process',
    skeleton: (c) => `Dear ${c.employeeName},\n\nRE: LETTER OF WARNING\n\nFollowing the review of your written response dated [date] regarding [subject], management has resolved to issue you this formal warning.\n\nA repeat of this conduct may attract further disciplinary action, up to and including termination of employment. This letter will be kept in your personnel file.\n\nYours faithfully,`,
  },
  custom: {
    label: 'Custom letter',
    hint: 'Free-form — write anything on the letterhead',
    skeleton: (c) => `Dear ${c.employeeName},\n\n\n\nYours faithfully,`,
  },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// Reference numbers: <TYPE>/<YEAR>/<NNN>, sequenced from the org's issued
// register — auto-suggested on compose, still editable before issuing.
export const LETTER_TYPE_ABBREV = {
  confirmation: 'CONF', promotion: 'PROM', introduction: 'INTR',
  employment_verification: 'VERF', query: 'QRY', warning: 'WARN', custom: 'LTR',
};
export function suggestReference(letterType, issuedLetters) {
  const year = new Date().getFullYear();
  const n = (issuedLetters || []).filter((l) => String(l.issued_at || '').startsWith(String(year))).length + 1;
  return `HR/${LETTER_TYPE_ABBREV[letterType] || 'LTR'}/${year}/${String(n).padStart(3, '0')}`;
}

// Safe-filing suggestions — which Documents folder a letter belongs in.
export const LETTER_FOLDER_SUGGESTION = {
  confirmation: 'HR Letters — Employment',
  promotion: 'HR Letters — Employment',
  introduction: 'HR Letters — Verifications',
  employment_verification: 'HR Letters — Verifications',
  query: 'HR Letters — Disciplinary',
  warning: 'HR Letters — Disciplinary',
  custom: 'HR Letters',
};

// Client-side logo compression: resize to letterhead scale and keep it small
// (PNG for transparency; falls back to JPEG when the PNG runs heavy).
export const compressLogo = (file) => new Promise((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const scale = Math.min(1, 320 / img.width, 160 / img.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL('image/png');
    if (png.length < 90000) return resolve(png); // ~65KB — fine for jsonb
    resolve(canvas.toDataURL('image/jpeg', 0.85));
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
  img.src = url;
});

export const LETTERHEAD_CSS = `
  .lh-page { background: #fff; color: #14161a; font-family: Georgia, 'Times New Roman', serif; line-height: 1.65; font-size: 13.5px; padding: 44px 52px; min-height: 640px; --accent: #0A0E1A; }
  .lh-head { margin-bottom: 26px; }
  .lh-name { font-weight: 700; font-size: 21px; letter-spacing: .01em; }
  .lh-logo { display: block; max-height: 52px; max-width: 220px; object-fit: contain; margin-bottom: 6px; }
  .lh-classic .lh-logo, .lh-elegant .lh-logo { margin-left: auto; margin-right: auto; }
  .lh-executive .lh-logo { filter: none; }
  .lh-meta { font-size: 11px; color: #5a5a55; margin-top: 3px; line-height: 1.5; }
  .lh-tagline { font-size: 11px; font-style: italic; color: #7a7a72; margin-top: 2px; }
  .lh-body { white-space: pre-wrap; margin-top: 18px; }
  .lh-date { text-align: right; font-size: 12.5px; margin-bottom: 6px; }
  .lh-ref { font-size: 11.5px; color: #5a5a55; margin-bottom: 14px; }
  .lh-sig { margin-top: 34px; }
  .lh-sig-name { font-weight: 700; }
  .lh-sig-role { font-size: 12px; color: #5a5a55; }
  .lh-foot { margin-top: 40px; padding-top: 10px; border-top: 1px solid #e4e1da; font-size: 10px; color: #8a877f; text-align: center; }

  .lh-classic .lh-head { text-align: center; border-bottom: 2.5px solid var(--accent); padding-bottom: 14px; }
  .lh-classic .lh-name { font-size: 23px; text-transform: uppercase; letter-spacing: .06em; color: var(--accent); }

  .lh-executive .lh-head { background: var(--accent); color: #fff; margin: -44px -52px 26px; padding: 26px 52px 20px; }
  .lh-executive .lh-name { color: #fff; }
  .lh-executive .lh-meta { color: rgba(255,255,255,.72); }
  .lh-executive .lh-tagline { color: rgba(255,255,255,.6); }

  .lh-modern { font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif; }
  .lh-modern .lh-head { border-left: 5px solid var(--accent); padding-left: 16px; }
  .lh-modern .lh-name { letter-spacing: -.01em; }

  .lh-minimal { font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif; }
  .lh-minimal .lh-head { border-bottom: 1px solid #d8d5cd; padding-bottom: 12px; }
  .lh-minimal .lh-name { font-size: 16px; font-weight: 650; letter-spacing: .12em; text-transform: uppercase; }

  .lh-elegant .lh-head { text-align: center; padding-bottom: 6px; }
  .lh-elegant .lh-name { font-style: italic; font-size: 26px; font-weight: 400; color: var(--accent); }
  .lh-elegant .lh-meta { letter-spacing: .08em; text-transform: uppercase; font-size: 9.5px; }

  .lh-corporate { font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif; }
  .lh-corporate .lh-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--accent); padding-bottom: 12px; }
  .lh-corporate .lh-meta { text-align: right; margin-top: 0; }

  .lh-bold { font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif; }
  .lh-bold .lh-name { font-size: 28px; font-weight: 800; letter-spacing: -.02em; }
  .lh-bold .lh-head::after { content: ''; display: block; width: 64px; height: 6px; background: var(--accent); margin-top: 8px; }

  .lh-warm.lh-page { background: #FBF7EE; }
  .lh-warm .lh-head { border-bottom: 1.5px solid #d9cfb8; padding-bottom: 12px; }
  .lh-warm .lh-name { color: #4a3d22; }
`;

// Company details come from the saved letterhead; letter fields from the composer.
export function letterHeadHtml(letterhead, { forPrint = false } = {}) {
  const d = letterhead?.details || {};
  const key = letterhead?.template_key || 'classic';
  const contact = [d.address, d.phone, d.email].filter(Boolean).join(' · ');
  // headerStyle: 'name' (default) | 'logo' (logo only) | 'logo-name' (both)
  const style = d.logo ? (d.headerStyle || 'logo-name') : 'name';
  const logoImg = d.logo && style !== 'name' ? `<img class="lh-logo" src="${d.logo}" alt="${esc(d.companyName || 'Company logo')}"/>` : '';
  const nameBlock = style === 'logo' ? '' : `<div class="lh-name">${esc(d.companyName || 'Your Company Ltd')}</div>`;
  return `
    <div class="lh-page lh-${esc(key)}" style="--accent: ${esc(d.accent || '#0A0E1A')}; ${forPrint ? 'padding:0; min-height:auto;' : ''}">
      <div class="lh-head">
        <div>
          ${logoImg}
          ${nameBlock}
          ${d.tagline ? `<div class="lh-tagline">${esc(d.tagline)}</div>` : ''}
        </div>
        <div class="lh-meta">${esc(contact)}${d.rcNumber ? `${contact ? '<br/>' : ''}RC ${esc(d.rcNumber)}` : ''}</div>
      </div>
      %BODY%
      ${d.rcNumber || contact ? `<div class="lh-foot">${esc(d.companyName || '')}${d.rcNumber ? ` · RC ${esc(d.rcNumber)}` : ''}</div>` : ''}
    </div>`;
}

export function letterBodyHtml({ date, reference, body, signerName, signerRole }) {
  return `
    <div class="lh-date">${esc(date)}</div>
    ${reference ? `<div class="lh-ref">Our ref: ${esc(reference)}</div>` : ''}
    <div class="lh-body">${esc(body)}</div>
    <div class="lh-sig">
      <div class="lh-sig-name">${esc(signerName || '')}</div>
      <div class="lh-sig-role">${esc(signerRole || '')}</div>
    </div>`;
}

// Full standalone HTML document — used for download/print and Documents filing.
export function buildLetterDocument({ letterhead, title, date, reference, body, signerName, signerRole }) {
  const sig = `
    <div class="lh-date">${esc(date)}</div>
    ${reference ? `<div class="lh-ref">Our ref: ${esc(reference)}</div>` : ''}
    <div class="lh-body">${esc(body)}</div>
    <div class="lh-sig">
      <div class="lh-sig-name">${esc(signerName || '')}</div>
      <div class="lh-sig-role">${esc(signerRole || '')}</div>
    </div>`;
  const page = letterHeadHtml(letterhead).replace('%BODY%', sig);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{margin:0;background:#fff;} ${LETTERHEAD_CSS} @media print { .lh-page { padding: 24px 8px; min-height: auto; } }</style>
</head><body>${page}</body></html>`;
}
