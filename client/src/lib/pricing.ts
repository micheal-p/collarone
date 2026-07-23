// The ONE pricing model. Landing, Signup, and the chat assistant all import
// from here — a price change edited anywhere else is a bug. (This exists
// because the model was previously triplicated and drifted risk was real.)
//
// Since 2026-07-21 the published prices live in the DB (platform_pricing +
// platform_billing_settings, editable from Platform Control). The constants
// below are the FALLBACK/seed values; loadPricing() overwrites them in place
// with whatever the platform admin has published, so every consumer that
// renders after the fetch — landing cards, the signup wizard, the chat
// assistant's quotes — quotes the live numbers. Existing customers are never
// re-priced by an edit: their org row carries locked rates (pricing_lock.sql).
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';
import type { Plan } from '../types';

export const PER_STAFF_FEE = 2000;
export const ANNUAL_DISCOUNT = 0.15;
export const PLANS: Plan[] = [
  { key: 'startup',    name: 'Startup',    baseFee: 15000, includedSuites: 3, extraSuiteFee: 8000, price: '₦15,000/mo · 3 suites incl., ₦8,000/extra suite, ₦2,000/staff' },
  { key: 'standard',   name: 'Standard',   baseFee: 25000, includedSuites: 5, extraSuiteFee: 6000, price: '₦25,000/mo · 5 suites incl., ₦6,000/extra suite, ₦2,000/staff' },
  { key: 'enterprise', name: 'Enterprise', baseFee: 45000, includedSuites: 8, extraSuiteFee: 4000, price: '₦45,000/mo · 8 suites incl., ₦4,000/extra suite, ₦2,000/staff' },
];
export const naira = (n: number): string => `₦${Math.round(n).toLocaleString('en-NG')}`;

// Mutable live values — read these (not the constants) wherever a number is
// used at call time rather than captured at import time.
export const PRICING = { perStaff: PER_STAFF_FEE, annualDiscount: ANNUAL_DISCOUNT, loaded: false };

const priceLine = (p: Plan): string =>
  `${naira(p.baseFee)}/mo · ${p.includedSuites} suites incl., ${naira(p.extraSuiteFee)}/extra suite, ${naira(PRICING.perStaff)}/staff`;

let loadPromise: Promise<void> | null = null;
export const loadPricing = (): Promise<void> => {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const [{ data: rows }, { data: settings }] = await Promise.all([
        supabase.from('platform_pricing').select('*').order('sort_order'),
        supabase.from('platform_billing_settings').select('*').maybeSingle(),
      ]);
      if (settings) {
        PRICING.perStaff = Number(settings.per_staff_kobo) / 100;
        PRICING.annualDiscount = Number(settings.annual_discount);
      }
      for (const r of rows || []) {
        const p = PLANS.find((x) => x.key === r.plan_key);
        if (!p) continue;
        p.baseFee = Number(r.base_fee_kobo) / 100;
        p.includedSuites = Number(r.included_suites);
        p.extraSuiteFee = Number(r.extra_suite_fee_kobo) / 100;
        p.name = r.name || p.name;
      }
      for (const p of PLANS) p.price = priceLine(p);
      PRICING.loaded = true;
    } catch {
      // offline/unreachable → the shipped fallback numbers stand
    }
  })();
  return loadPromise;
};

// React hook: triggers a re-render once live prices land.
export const usePricing = (): { plans: Plan[]; perStaff: number; annualDiscount: number; loaded: boolean } => {
  const [, setTick] = useState(0);
  useEffect(() => { loadPricing().then(() => setTick((t) => t + 1)); }, []);
  return { plans: PLANS, perStaff: PRICING.perStaff, annualDiscount: PRICING.annualDiscount, loaded: PRICING.loaded };
};
