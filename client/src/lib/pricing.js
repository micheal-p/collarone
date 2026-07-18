// The ONE pricing model. Landing, Signup, and the chat assistant all import
// from here — a price change edited anywhere else is a bug. (This exists
// because the model was previously triplicated and drifted risk was real.)
export const PER_STAFF_FEE = 2000;
export const ANNUAL_DISCOUNT = 0.15;
export const PLANS = [
  { key: 'startup',    name: 'Startup',    baseFee: 15000, includedSuites: 3, extraSuiteFee: 8000, price: '₦15,000/mo · 3 suites incl., ₦8,000/extra suite, ₦2,000/staff' },
  { key: 'standard',   name: 'Standard',   baseFee: 25000, includedSuites: 5, extraSuiteFee: 6000, price: '₦25,000/mo · 5 suites incl., ₦6,000/extra suite, ₦2,000/staff' },
  { key: 'enterprise', name: 'Enterprise', baseFee: 45000, includedSuites: 8, extraSuiteFee: 4000, price: '₦45,000/mo · 8 suites incl., ₦4,000/extra suite, ₦2,000/staff' },
];
export const naira = (n) => `₦${Math.round(n).toLocaleString('en-NG')}`;
