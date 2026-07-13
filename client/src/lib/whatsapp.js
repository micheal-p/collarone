// One WhatsApp number normalizer for the whole app. Merchants and staff
// type numbers the normal Nigerian way ("0814 812 8551"); wa.me needs the
// international form with no leading zero. Divergent copies of this logic
// (some missing the 0→234 step) broke storefront order buttons — every
// wa.me link goes through here now.
export const waDigits = (phone = '') => {
  let d = String(phone).replace(/[^0-9]/g, '');
  if (d.startsWith('00')) d = d.slice(2);          // 00234… international prefix
  if (d.startsWith('0')) d = `234${d.slice(1)}`;   // local 0814… → 234814…
  return d;
};

export const waLink = (phone, text = '') => {
  const d = waDigits(phone);
  if (!d) return '';
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};
