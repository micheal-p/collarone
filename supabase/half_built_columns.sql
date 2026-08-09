-- Mark the columns that exist for work not yet done.
--
-- A column that is created, sometimes seeded, and acted on nowhere is worse
-- than a missing one: the next person to read the schema assumes it works, and
-- the product ends up SELLING it. That is what happened with overtime —
-- config/suites.js advertised "track hours and overtime", payroll_lines has an
-- overtime_pay column, attendance_settings has overtime_basis, multiplier and
-- needs_approval, and nothing anywhere computes any of it. The only overtime in
-- the product is a client-side `hours - 8` used for display, which ignores
-- every one of those settings.
--
-- The columns are NOT dropped. attendance_payroll.sql states plainly that
-- feeding overtime into generate_payroll_run is Phase 2, and these are where
-- that work lands; dropping them would just mean recreating them later. What
-- was wrong was the silence — so they are documented as inert, and the copy
-- that sold them has been corrected in the same commit.
--
-- If you implement overtime: compute it in generate_payroll_run using
-- overtime_basis and overtime_multiplier, write payroll_lines.overtime_pay,
-- include it in gross (it is taxable earned income), and delete these comments.

comment on column public.payroll_lines.overtime_pay is
  'INERT — Phase 2. Nothing computes this yet; it is always 0. The payslip hides zero rows, so it is invisible rather than wrong. Populate from attendance in generate_payroll_run when overtime is built.';
comment on column public.payroll_lines.late_deduction is
  'INERT — Phase 2. Lateness is measured (attendance_records.late_minutes) but never turned into money. attendance_settings.late_mode/late_after_n/late_amount are the intended inputs.';
comment on column public.attendance_settings.overtime_basis is
  'INERT — Phase 2. Read by nothing. The only overtime figure in the product is a client-side hours-minus-8 used for display.';
comment on column public.attendance_settings.overtime_multiplier is
  'INERT — Phase 2. Read by nothing.';
comment on column public.attendance_settings.overtime_needs_approval is
  'INERT — Phase 2. Read by nothing.';
comment on column public.attendance_settings.late_mode is
  'INERT — Phase 2. Lateness is recorded but never priced.';
comment on column public.attendance_settings.late_after_n is
  'INERT — Phase 2. Read by nothing.';
comment on column public.attendance_settings.late_amount is
  'INERT — Phase 2. Read by nothing.';
comment on column public.attendance_settings.require_fingerprint is
  'INERT. Device punches are accepted from any registered device; biometric templates are never ingested (NDPA), so there is nothing to require.';
comment on column public.leave_types.carryover_cap is
  'INERT — Phase 2. Balances do not carry over between years yet; nothing reads this cap.';
