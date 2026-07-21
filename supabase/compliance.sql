-- ============================================================================
-- Collarone — Compliance Calendar suite (catalog item #17, key 'compliance').
-- Nigerian statutory deadline tracker: PAYE, VAT, pension, NHF, NSITF, WHT,
-- CAC annual returns, CIT — with per-org enable/disable and mark-as-done per
-- period. Native multi-tenant. Idempotent. Run after organizations.sql.
--
-- The dataset is GUIDANCE, not legal or tax advice — deadlines move by
-- regulator circular. The UI carries that disclaimer permanently; keep it.
-- Reminders are in-app for v1 (email waits on the messaging channel).
-- ============================================================================

create or replace function public.has_compliance_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"compliance"}]'::jsonb);
$$;
grant execute on function public.has_compliance_suite() to authenticated;

create or replace function public.is_compliance_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"compliance","role":"manager"}]'::jsonb);
$$;
grant execute on function public.is_compliance_manager() to authenticated;

-- ---- the rule catalogue (global, curated by the platform) -------------------
create table if not exists public.compliance_rules (
  key         text primary key,
  title       text not null,
  authority   text not null,
  description text not null default '',
  frequency   text not null check (frequency in ('monthly','annual')),
  -- monthly: due this day of the FOLLOWING month. annual: org sets month/day.
  due_day     int,
  default_month int,      -- annual only: suggested month (org can override)
  info_url    text not null default '',
  sort_order  int not null default 100
);
alter table public.compliance_rules enable row level security;
drop policy if exists "compliance_rules_select" on public.compliance_rules;
create policy "compliance_rules_select" on public.compliance_rules for select using (
  public.has_compliance_suite()
);

insert into public.compliance_rules (key, title, authority, description, frequency, due_day, default_month, info_url, sort_order) values
  ('paye',        'PAYE remittance',            'State IRS (e.g. LIRS)', 'Remit PAYE deducted from staff salaries to the state tax authority of each employee''s residence. Due by the 10th of the month after payroll.', 'monthly', 10, null, 'https://www.firs.gov.ng', 10),
  ('vat',         'VAT filing & remittance',    'FIRS',                  'File the VAT return and remit 7.5% VAT collected. Due by the 21st of the month following the transaction month — file even for nil months.', 'monthly', 21, null, 'https://www.firs.gov.ng', 20),
  ('wht',         'Withholding tax remittance', 'FIRS / State IRS',      'Remit WHT deducted from vendor and contract payments. Federal (companies) due by the 21st of the following month; state timelines vary.', 'monthly', 21, null, 'https://www.firs.gov.ng', 30),
  ('pension',     'Pension remittance',         'PenCom / your PFAs',    'Remit employee (8%) + employer (10%) pension contributions to each employee''s PFA within 7 working days of paying salaries.', 'monthly', 7, null, 'https://www.pencom.gov.ng', 40),
  ('nhf',         'NHF remittance',             'FMBN',                  'Remit the 2.5% National Housing Fund deduction to the Federal Mortgage Bank within one month of deduction.', 'monthly', 28, null, 'https://www.fmbn.gov.ng', 50),
  ('nsitf',       'NSITF ECS contribution',     'NSITF',                 'Remit the 1% Employee Compensation Scheme contribution on monthly payroll. Remit monthly; NSITF circulars set the exact window.', 'monthly', 15, null, 'https://nsitf.gov.ng', 60),
  ('paye_annual', 'PAYE annual returns',        'State IRS',             'File employer annual PAYE returns (all staff, all remittances for the year). Due 31 January for the previous year.', 'annual', 31, 1, '', 70),
  ('cac_annual',  'CAC annual returns',         'CAC',                   'File the company''s annual return with the Corporate Affairs Commission. Timing follows your incorporation anniversary — set your month.', 'annual', 30, null, 'https://www.cac.gov.ng', 80),
  ('cit',         'Companies Income Tax',       'FIRS',                  'File CIT self-assessment within 6 months of your financial year end. Set the month that matches your year end.', 'annual', 30, 6, 'https://www.firs.gov.ng', 90)
on conflict (key) do update set
  title = excluded.title, authority = excluded.authority, description = excluded.description,
  frequency = excluded.frequency, due_day = excluded.due_day, default_month = excluded.default_month,
  info_url = excluded.info_url, sort_order = excluded.sort_order;

-- ---- per-org preferences ----------------------------------------------------
create table if not exists public.org_compliance_prefs (
  org_id       uuid not null references public.organizations(id) on delete cascade,
  rule_key     text not null references public.compliance_rules(key) on delete cascade,
  enabled      boolean not null default true,
  annual_month int check (annual_month between 1 and 12),
  annual_day   int check (annual_day between 1 and 31),
  note         text not null default '',
  updated_at   timestamptz not null default now(),
  primary key (org_id, rule_key)
);
alter table public.org_compliance_prefs enable row level security;
drop policy if exists "org_compliance_prefs_select" on public.org_compliance_prefs;
create policy "org_compliance_prefs_select" on public.org_compliance_prefs for select using (
  public.same_org(org_id) and public.has_compliance_suite()
);
drop policy if exists "org_compliance_prefs_write" on public.org_compliance_prefs;
create policy "org_compliance_prefs_write" on public.org_compliance_prefs for all using (
  public.same_org(org_id) and public.is_compliance_manager()
) with check (
  public.same_org(org_id) and public.is_compliance_manager()
);

-- ---- done marks, one per rule per period ------------------------------------
create table if not exists public.compliance_marks (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizations(id) on delete cascade,
  rule_key  text not null references public.compliance_rules(key) on delete cascade,
  period    text not null,           -- '2026-07' for monthly, '2026' for annual
  note      text not null default '',
  done_by   uuid references public.profiles(id),
  done_at   timestamptz not null default now(),
  unique (org_id, rule_key, period)
);
create index if not exists compliance_marks_org_idx on public.compliance_marks (org_id, rule_key, period);
alter table public.compliance_marks enable row level security;
drop policy if exists "compliance_marks_select" on public.compliance_marks;
create policy "compliance_marks_select" on public.compliance_marks for select using (
  public.same_org(org_id) and public.has_compliance_suite()
);
drop policy if exists "compliance_marks_insert" on public.compliance_marks;
create policy "compliance_marks_insert" on public.compliance_marks for insert with check (
  public.same_org(org_id) and public.has_compliance_suite() and done_by = auth.uid()
);
drop policy if exists "compliance_marks_delete" on public.compliance_marks;
create policy "compliance_marks_delete" on public.compliance_marks for delete using (
  public.same_org(org_id) and public.is_compliance_manager()
);

-- ---- Phase-2 whitelist: 'compliance' joins the safe list --------------------
-- Canonical trigger moves here (supersedes automation.sql's copy) — strict
-- superset of every earlier list.
create or replace function public.enforce_phase1_suite_scope() returns trigger
language plpgsql as $$
declare
  safe_suites text[] := array[
    'hr','leave','tasks','visitors','payroll','crm','attendance','benefits','it-assets',
    'procurement','inventory','finance','projects','documents','trade-docs','automation',
    'compliance'
  ];
begin
  if new.org_id <> '00000000-0000-0000-0000-000000000001' then
    select coalesce(jsonb_agg(g), '[]'::jsonb) into new.suites
    from jsonb_array_elements(new.suites) g
    where g->>'key' = any(safe_suites);
  end if;
  return new;
end;
$$;
