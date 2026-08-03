// Naira amounts spelled out, for the line every Nigerian invoice carries above
// the signature. It is not decoration: approvers and banks read the words to
// check the figures haven't been altered, which is why it has to say the same
// thing as the number, including the kobo.
//
// "Only" is the conventional terminator here, and kobo are said as kobo rather
// than as a fraction: ₦1,234.50 → "One thousand, two hundred and thirty-four
// naira, fifty kobo only".

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
// Short scale, which is what Nigerian business English uses.
const SCALES = [
  { value: 1e12, name: 'trillion' },
  { value: 1e9, name: 'billion' },
  { value: 1e6, name: 'million' },
  { value: 1e3, name: 'thousand' },
];

function under1000(n) {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const r = n % 10;
    return r ? `${t}-${ONES[r]}` : t;
  }
  const h = `${ONES[Math.floor(n / 100)]} hundred`;
  const r = n % 100;
  return r ? `${h} and ${under1000(r)}` : h;
}

export function numberToWords(n) {
  const num = Math.floor(Math.abs(Number(n) || 0));
  if (num === 0) return 'zero';
  const parts = [];
  let rest = num;
  for (const { value, name } of SCALES) {
    if (rest >= value) {
      parts.push(`${under1000(Math.floor(rest / value))} ${name}`);
      rest %= value;
    }
  }
  if (rest > 0) {
    // "and" before a final chunk under 100 is how it's said out loud:
    // one thousand AND fifty, but one thousand, two hundred and fifty.
    parts.push(rest < 100 && parts.length ? `and ${under1000(rest)}` : under1000(rest));
  }
  return parts.join(', ').replace(/, and /g, ' and ');
}

// ₦487,500.00 → "Four hundred and eighty-seven thousand, five hundred naira only"
export function amountInWords(amount, { currency = 'naira', subunit = 'kobo' } = {}) {
  const value = Number(amount) || 0;
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs);
  // round rather than truncate, or ₦0.999 prints as zero kobo
  const sub = Math.round((abs - whole) * 100);

  let out = `${numberToWords(whole)} ${currency}`;
  if (sub > 0) out += `, ${numberToWords(sub)} ${subunit}`;
  out += ' only';
  if (negative) out = `minus ${out}`;
  return out.charAt(0).toUpperCase() + out.slice(1);
}
