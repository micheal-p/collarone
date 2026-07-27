# Attendance ↔ Payroll — design & build plan

**Goal:** turn Time & Attendance from a logbook into a system that *feeds payroll*.
Clock-in (phone or fingerprint device) → work-hours + lateness + approved overtime →
**auto-computed additions and deductions on the payslip.** This is the "join the
brothers" move: Attendance, Payroll, HR and Leave become one connected People engine
that a standalone attendance app or a standalone payroll app can't match.

---

## 1. What exists today (don't rebuild it)
- `attendance_records` — geo clock-in/out, one open shift per person, RLS by org + self/manager. RPCs `attendance_clock_in(lat,lng)` / `attendance_clock_out(lat,lng)`.
- `is_attendance_manager()`, `has_attendance_suite()` helpers.
- Payroll `generate_payroll_run(month, year)` — loops active staff, computes gross → pension/NHF/PAYE → loans → net, writes `payroll_lines`. Loans use a clean pattern: **plan** the deduction into a side table (`payroll_line_loans`), **bake** the total into the line, settle balances only when the run is `disbursed`. We mirror this for overtime/late.

## 2. New data model
**Config (employer sets, one row per org):** `attendance_settings`
- clock methods: `phone_enabled`, `device_enabled`, `require_fingerprint` (phone WebAuthn)
- geofence: `office_lat`, `office_lng`, `geofence_radius_m` (0 = off)
- hours: `work_start` (time), `work_close` (time), `working_days` (int[] 0–6), `grace_minutes`
- lateness: `late_mode` (`flag` | `per_day` | `per_minute` | `after_n`), `late_amount`, `late_after_n`
- overtime: `overtime_multiplier` (e.g. 1.5), `overtime_needs_approval` (bool), `overtime_basis` (`gross`|`basic`), `standard_monthly_hours` (default 173.33 → hourly rate)

**Overtime requests (approval flow, like Leave):** `overtime_requests`
- `employee_id, work_date, hours, reason, status` (pending/approved/rejected), `decided_by, decided_at`
- RPCs `request_overtime(...)` and `decide_overtime(id, approve, note)` — **decide_overtime must org-check the specific row** (the recurring `decide_leave_request` bug class: "allowed in general" ≠ "allowed on *this* row").

**Fingerprint-device support:** `attendance_device_map` (`device_uid` → `employee_id`, per org). Punches ingested via CSV upload (phase-1-safe) or live push (phase 3).

**Altered:**
- `attendance_records` += `source` (`phone`|`device`|`manual`), `device_uid`, `is_late` (bool), `late_minutes` (int) — stamped at clock-in against the schedule so we never re-derive it.
- `payroll_lines` += `overtime_pay` (addition), `late_deduction` (deduction).
- Side table `payroll_line_adjustments` (run_id, employee_id, kind `overtime`|`late`, hours, amount) so the payslip can show the breakdown, same shape as `payroll_line_loans`.

## 3. Clock-in — both methods, employer picks in Settings

**A) Phone (with location) — works today, no hardware.**
- Staff open Collarone on their phone → **Clock In**. Browser captures GPS; if `geofence_radius_m > 0`, the server rejects a clock-in outside the office radius. If `require_fingerprint` is on, the phone's fingerprint/Face ID (WebAuthn) must pass first.
- *Setup instructions (employer):* Settings → turn on Phone clock-in → drop your office pin + set radius (e.g. 100 m) → (optional) require fingerprint. Staff enrol their phone once.

**B) Wall-mounted fingerprint device (ZKTeco-style) — for offices that own one.**
- *Phase 1 (build blind, no device needed):* employer exports the machine's daily punch log (CSV/Excel) and uploads it; we map each device fingerprint-ID → staff via `attendance_device_map` and create `attendance_records`.
- *Phase 3 (needs a real device to test):* device pushes punches to a Collarone endpoint in real time.
- *Setup instructions (employer):* Settings → turn on Device clock-in → add each staff's device ID once → upload the daily/weekly export (or connect live push in phase 3).

## 4. Lateness (employer-configured, safe by default)
At clock-in we compare time-of-day to `work_start + grace_minutes` on that weekday and stamp `is_late` / `late_minutes`. At payroll time the employer's `late_mode` decides the money:
- `flag` (default) — record it, **no deduction** (legally safest; Labour Act limits arbitrary pay deductions)
- `per_day` — `late_amount` × late days
- `per_minute` — `late_amount` × total late minutes
- `after_n` — deduct once lateness exceeds `late_after_n` days in the period
The employer chooses; we never invent a deduction.

## 5. Overtime → pay
- Staff/manager submits `request_overtime(date, hours, reason)`. If `overtime_needs_approval`, the overtime approver signs off; only **approved** hours count.
- Hourly rate = `(gross or basic per overtime_basis) / standard_monthly_hours`. Overtime pay = approved hours × hourly × `overtime_multiplier`.

## 6. The payroll join (the point)
`generate_payroll_run` gains two steps per employee, mirroring the loan pattern:
1. **Overtime:** sum approved overtime hours for the period → compute pay → record in `payroll_line_adjustments` → add to the line as `overtime_pay`.
2. **Lateness:** apply `late_mode` to the period's late records → `late_deduction`.
Payslip shows both as clear line items. Net = gross + overtime_pay − pension − NHF − PAYE − loans − late_deduction.

**⚠ Open decision — overtime taxation.** PAYE here annualises monthly gross (×12). Overtime is a one-off, so annualising it would over-tax. Correct handling: add overtime to the *month's* taxable income without ×12 annualising, or tax it at the marginal rate. **This is the one genuinely tricky bit — I'll get it right in Phase 2, not hand-wave it.** Late deductions are post-tax (disciplinary), so they don't touch PAYE.

## 7. Security
- Every new table: `org_id` + `same_org()` RLS from birth; manager-or-self where relevant.
- Every `SECURITY DEFINER` RPC that takes an id (`decide_overtime`, CSV ingest, device map) **org-checks the target row**, never just the caller's role.
- Add `attendance` config + overtime tables to the Phase-1 multi-tenant safe whitelist (they already are for attendance).

## 8. Phasing
- **Phase 1 (now):** schema + `attendance_settings` config + overtime request/approval + lateness stamping + device CSV mapping + phone geofence. *No payroll auto-calc yet* (so taxation is done carefully, not rushed).
- **Phase 2:** wire overtime_pay + late_deduction into `generate_payroll_run` with correct overtime taxation; payslip line items; the Settings UI.
- **Phase 3:** live device push; phone WebAuthn fingerprint; per-staff schedule overrides.

## 9. Priority note
This is a multi-week join and bigger than what lands the first customer. Build the backbone now; wire the payroll maths once a real payroll has been run at least once (the golden tests + one real run first). A paper-clocking pilot only needs Phase 1's config + manual entry.
