-- ============================================================================
-- Org-Ops ERP — Payroll & Compensation (own suite, own RBAC)
-- Deliberately NOT part of the `hr` suite: most hr-suite holders (directory,
-- recruiting, onboarding) have no business seeing salary data. Only
-- `payroll` suite role='manager' (Finance/HR-Payroll) runs payroll.
-- Employees see only their OWN released payslips — never anyone else's,
-- never a draft/unapproved run.
--
-- Money movement model: this schema computes the payroll register and
-- produces a bank disbursement export (client-side CSV). It never holds or
-- moves funds — the partner bank's own payroll wall executes the actual
-- debit/credit. See the CSV export in payrollApi.js.
--
-- ⚠ TAX RATES ARE SEEDED, NOT VERIFIED. PAYE bands below reflect the
-- long-standing Nigerian graduated structure and are a starting point only —
-- Finance/tax counsel MUST confirm current rates (they change with each
-- Finance Act) before this is used for a real payroll run. Rates live in
-- paye_bands, a plain table, precisely so they can be corrected without a
-- code change.
--
-- Run in Supabase SQL Editor after hr.sql. Idempotent — safe to re-run.
-- ============================================================================

-- ---- State of residence on profiles (PAYE is remitted per-state, not centrally) --
alter table public.profiles
  add column if not exists state_of_residence text;

-- ---- Helper: caller has payroll suite role='manager' -------------------------
create or replace function public.is_payroll_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and suites @> '[{"key":"payroll","role":"manager"}]'::jsonb
  );
$$;
grant execute on function public.is_payroll_manager() to authenticated;

-- ---- Helper: caller holds the payroll suite (any role) -----------------------
create or replace function public.has_payroll_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and suites @> '[{"key":"payroll"}]'::jsonb
  );
$$;
grant execute on function public.has_payroll_suite() to authenticated;

-- Broaden profiles read access the same safe way hr.sql did: a payroll
-- manager needs employee names to assign salary structures and bank
-- accounts, so extend the existing policy through the SECURITY DEFINER
-- helper above — never an inline subquery on profiles (that recurses).
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (
  id = auth.uid()
  or public.is_super_admin()
  or public.has_hr_suite()
  or public.has_payroll_suite()
);

-- ---- RPC: payroll manager sets an employee's state of residence (PAYE routing) --
create or replace function public.payroll_set_state(p_employee_id uuid, p_state text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare result public.profiles;
begin
  if not (public.is_payroll_manager() or public.is_super_admin()) then
    raise exception 'Not authorised to edit payroll records';
  end if;
  update public.profiles set state_of_residence = nullif(trim(p_state), '')
  where id = p_employee_id returning * into result;
  if result.id is null then raise exception 'Employee not found'; end if;
  return result;
end;
$$;
grant execute on function public.payroll_set_state(uuid, text) to authenticated;

-- ============================================================================
-- Bank accounts (for the disbursement export)
-- ============================================================================
create table if not exists public.bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.profiles(id) on delete cascade,
  bank_name      text not null,
  bank_code      text not null default '',
  account_number text not null,
  account_name   text not null,
  is_primary     boolean not null default true,
  created_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now()
);

alter table public.bank_accounts enable row level security;

drop policy if exists "bank_accounts_select" on public.bank_accounts;
create policy "bank_accounts_select" on public.bank_accounts for select using (
  public.is_super_admin() or public.is_payroll_manager() or employee_id = auth.uid()
);
drop policy if exists "bank_accounts_write" on public.bank_accounts;
create policy "bank_accounts_write" on public.bank_accounts for all using (
  public.is_super_admin() or public.is_payroll_manager()
) with check (
  public.is_super_admin() or public.is_payroll_manager()
);

-- ============================================================================
-- Salary structures (one row per change — history, not a single mutable row)
-- ============================================================================
create table if not exists public.salary_structures (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.profiles(id) on delete cascade,
  basic            numeric not null default 0,
  housing          numeric not null default 0,
  transport        numeric not null default 0,
  other_allowances numeric not null default 0,
  effective_date   date not null default current_date,
  created_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now()
);

alter table public.salary_structures enable row level security;

drop policy if exists "salary_structures_select" on public.salary_structures;
create policy "salary_structures_select" on public.salary_structures for select using (
  public.is_super_admin() or public.is_payroll_manager() or employee_id = auth.uid()
);
drop policy if exists "salary_structures_write" on public.salary_structures;
create policy "salary_structures_write" on public.salary_structures for all using (
  public.is_super_admin() or public.is_payroll_manager()
) with check (
  public.is_super_admin() or public.is_payroll_manager()
);

-- ============================================================================
-- PAYE bands — a swappable rule pack, not a hardcoded formula
-- ============================================================================
create table if not exists public.paye_bands (
  id          serial primary key,
  min_annual  numeric not null,
  max_annual  numeric,              -- null = no upper bound (top band)
  rate        numeric not null,     -- e.g. 0.07 = 7%
  sort_order  int not null unique
);

-- De-dupe + add the unique constraint for installs that already ran an
-- earlier version of this file without it (ON CONFLICT needs a real target).
delete from public.paye_bands a using public.paye_bands b
  where a.sort_order = b.sort_order and a.id > b.id;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'paye_bands_sort_order_key'
  ) then
    alter table public.paye_bands add constraint paye_bands_sort_order_key unique (sort_order);
  end if;
end $$;

alter table public.paye_bands enable row level security;

drop policy if exists "paye_bands_select" on public.paye_bands;
create policy "paye_bands_select" on public.paye_bands for select using (auth.role() = 'authenticated');
drop policy if exists "paye_bands_write" on public.paye_bands;
create policy "paye_bands_write" on public.paye_bands for all using (
  public.is_super_admin() or public.is_payroll_manager()
) with check (
  public.is_super_admin() or public.is_payroll_manager()
);

insert into public.paye_bands (min_annual, max_annual, rate, sort_order) values
  (0,        300000,   0.07, 1),
  (300000,   600000,   0.11, 2),
  (600000,   1100000,  0.15, 3),
  (1100000,  1600000,  0.19, 4),
  (1600000,  3200000,  0.21, 5),
  (3200000,  null,     0.24, 6)
on conflict (sort_order) do update set min_annual = excluded.min_annual, max_annual = excluded.max_annual, rate = excluded.rate;

-- Graduated PAYE on annual taxable income, band by band.
create or replace function public.compute_paye_annual(p_taxable_annual numeric)
returns numeric language plpgsql stable set search_path = public as $$
declare
  band record;
  remaining numeric := greatest(0, p_taxable_annual);
  tax numeric := 0;
  band_width numeric;
  taxed_in_band numeric;
begin
  for band in select * from public.paye_bands order by sort_order loop
    exit when remaining <= 0;
    band_width := coalesce(band.max_annual, remaining + band.min_annual) - band.min_annual;
    taxed_in_band := least(remaining, band_width);
    tax := tax + taxed_in_band * band.rate;
    remaining := remaining - taxed_in_band;
  end loop;
  return round(tax, 2);
end;
$$;
grant execute on function public.compute_paye_annual(numeric) to authenticated;

-- ============================================================================
-- Payroll runs + lines
-- ============================================================================
create table if not exists public.payroll_runs (
  id                       uuid primary key default gen_random_uuid(),
  period_month             int not null check (period_month between 1 and 12),
  period_year              int not null,
  status                   text not null default 'draft' check (status in ('draft','review','approved','released','disbursed')),
  notes                    text not null default '',
  disbursement_reference   text not null default '',
  created_by               uuid not null references public.profiles(id),
  approved_by              uuid references public.profiles(id),
  approved_at              timestamptz,
  released_at              timestamptz,
  disbursed_at             timestamptz,
  created_at               timestamptz not null default now(),
  unique (period_month, period_year)
);

create table if not exists public.payroll_lines (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id       uuid not null references public.profiles(id) on delete cascade,
  basic             numeric not null default 0,
  housing           numeric not null default 0,
  transport         numeric not null default 0,
  other_allowances  numeric not null default 0,
  gross             numeric not null default 0,
  pension_employee  numeric not null default 0,
  pension_employer  numeric not null default 0,
  nhf               numeric not null default 0,
  nsitf             numeric not null default 0,   -- employer cost, not deducted from net
  paye              numeric not null default 0,
  other_deductions  numeric not null default 0,   -- loans, advances, etc. — manual entry in v1
  net               numeric not null default 0,
  state_of_residence text not null default '',
  bank_snapshot     jsonb not null default '{}',  -- bank details AT RUN TIME, so later account edits don't rewrite history
  created_at        timestamptz not null default now(),
  unique (run_id, employee_id)
);

alter table public.payroll_runs  enable row level security;
alter table public.payroll_lines enable row level security;

-- An employee needs to read the run's period/released_at to render their own
-- payslip (the embedded join in GET /payroll/mypayslips hits this table's
-- RLS too) — but must never see a run they don't have a released line in.
-- SECURITY DEFINER so checking payroll_lines here doesn't chain back into
-- payroll_lines' own RLS (which itself checks released_at on this table).
create or replace function public.has_released_payslip(p_run_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.payroll_lines where run_id = p_run_id and employee_id = auth.uid());
$$;
grant execute on function public.has_released_payslip(uuid) to authenticated;

drop policy if exists "payroll_runs_select" on public.payroll_runs;
create policy "payroll_runs_select" on public.payroll_runs for select using (
  public.is_super_admin() or public.is_payroll_manager()
  or (released_at is not null and public.has_released_payslip(id))
);
drop policy if exists "payroll_runs_write" on public.payroll_runs;
create policy "payroll_runs_write" on public.payroll_runs for all using (
  public.is_super_admin() or public.is_payroll_manager()
) with check (
  public.is_super_admin() or public.is_payroll_manager()
);

-- payroll_lines: payroll manager sees/edits all; an employee sees only their
-- OWN line, and only once the run has been released (never a draft/approved-
-- but-unreleased run — approval ≠ visible to staff, release does that).
drop policy if exists "payroll_lines_select" on public.payroll_lines;
create policy "payroll_lines_select" on public.payroll_lines for select using (
  public.is_super_admin() or public.is_payroll_manager()
  or (
    employee_id = auth.uid()
    and exists (select 1 from public.payroll_runs r where r.id = run_id and r.released_at is not null)
  )
);
drop policy if exists "payroll_lines_write" on public.payroll_lines;
create policy "payroll_lines_write" on public.payroll_lines for all using (
  public.is_super_admin() or public.is_payroll_manager()
) with check (
  public.is_super_admin() or public.is_payroll_manager()
);

-- ---- Generate a run: pull every active employee's current salary structure,
-- compute statutory deductions, snapshot their bank details. One transaction,
-- not N client round-trips.
create or replace function public.generate_payroll_run(p_month int, p_year int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_run_id uuid;
  emp record;
  ss record;
  ba record;
  pensionable numeric;
  gross numeric;
  pension_emp numeric;
  pension_er numeric;
  nhf_amt numeric;
  nsitf_amt numeric;
  cra numeric;
  taxable_annual numeric;
  paye_amt numeric;
  period_end date;
begin
  if not (public.is_payroll_manager() or public.is_super_admin()) then
    raise exception 'Not authorised to run payroll';
  end if;

  insert into public.payroll_runs (period_month, period_year, created_by)
  values (p_month, p_year, auth.uid())
  returning id into v_run_id;

  period_end := make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day';

  -- super_admin is a system account, not a staff member — never on payroll.
  for emp in select * from public.profiles where status = 'active' and role <> 'super_admin' loop
    select * into ss from public.salary_structures
      where employee_id = emp.id and effective_date <= period_end
      order by effective_date desc, created_at desc limit 1;
    if ss.id is null then continue; end if; -- no salary on file yet — skip, don't guess

    select * into ba from public.bank_accounts
      where employee_id = emp.id order by is_primary desc, created_at desc limit 1;

    pensionable := ss.basic + ss.housing + ss.transport;
    gross       := pensionable + ss.other_allowances;
    pension_emp := round(pensionable * 0.08, 2);
    pension_er  := round(pensionable * 0.10, 2);
    nhf_amt     := round(ss.basic * 0.025, 2);
    nsitf_amt   := round(gross * 0.01, 2);

    cra := greatest(200000, gross * 12 * 0.01) + gross * 12 * 0.20;
    taxable_annual := greatest(0, gross * 12 - cra - pension_emp * 12 - nhf_amt * 12);
    paye_amt := round(public.compute_paye_annual(taxable_annual) / 12, 2);

    insert into public.payroll_lines (
      run_id, employee_id, basic, housing, transport, other_allowances, gross,
      pension_employee, pension_employer, nhf, nsitf, paye, net,
      state_of_residence, bank_snapshot
    ) values (
      v_run_id, emp.id, ss.basic, ss.housing, ss.transport, ss.other_allowances, gross,
      pension_emp, pension_er, nhf_amt, nsitf_amt, paye_amt,
      gross - pension_emp - nhf_amt - paye_amt,
      coalesce(emp.state_of_residence, ''),
      case when ba.id is not null
        then jsonb_build_object('bankName', ba.bank_name, 'bankCode', ba.bank_code, 'accountNumber', ba.account_number, 'accountName', ba.account_name)
        else '{}'::jsonb end
    )
    on conflict (run_id, employee_id) do nothing;
  end loop;

  return v_run_id;
end;
$$;
grant execute on function public.generate_payroll_run(int, int) to authenticated;
