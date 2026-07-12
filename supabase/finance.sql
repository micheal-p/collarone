-- ============================================================================
-- Collarone — Finance suite (Stage 6 catalog item, built early)
-- Run after inventory.sql. Idempotent. Native multi-tenant from day one.
--
-- VAT-aware (7.5% standard rate, per-expense not hardcoded, same swappable-
-- rate principle as payroll/procurement) and NGN-native (all amounts stored
-- as plain numeric in naira — no multi-currency in v0, so no FX volatility
-- handling needed yet; flagged here for whoever picks up multi-currency).
-- ============================================================================

create or replace function public.has_finance_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"finance"}]'::jsonb);
$$;
grant execute on function public.has_finance_suite() to authenticated;

create or replace function public.is_finance_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"finance","role":"manager"}]'::jsonb);
$$;
grant execute on function public.is_finance_manager() to authenticated;

create table if not exists public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id),
  name       text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

alter table public.expense_categories enable row level security;
drop policy if exists "expense_categories_select" on public.expense_categories;
create policy "expense_categories_select" on public.expense_categories for select using (
  public.same_org(org_id) and public.has_finance_suite()
);
drop policy if exists "expense_categories_write" on public.expense_categories;
create policy "expense_categories_write" on public.expense_categories for all using (
  public.same_org(org_id) and public.is_finance_manager()
) with check (
  public.same_org(org_id) and public.is_finance_manager()
);

create table if not exists public.budgets (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id),
  department_id int references public.departments(id) on delete set null,
  category_id   uuid references public.expense_categories(id) on delete set null,
  period_year   int not null,
  period_month  int check (period_month between 1 and 12),  -- null = annual budget
  amount        numeric not null default 0,
  notes         text not null default '',
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now()
);

alter table public.budgets enable row level security;
drop policy if exists "budgets_select" on public.budgets;
create policy "budgets_select" on public.budgets for select using (
  public.same_org(org_id) and public.has_finance_suite()
);
drop policy if exists "budgets_write" on public.budgets;
create policy "budgets_write" on public.budgets for all using (
  public.same_org(org_id) and public.is_finance_manager()
) with check (
  public.same_org(org_id) and public.is_finance_manager()
);

create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id),
  category_id   uuid references public.expense_categories(id) on delete set null,
  department_id int references public.departments(id) on delete set null,
  vendor        text not null default '',
  description   text not null,
  amount        numeric not null default 0,
  vat_rate      numeric not null default 0.075,
  total_amount  numeric generated always as (amount * (1 + vat_rate)) stored,
  expense_date  date not null default current_date,
  submitted_by  uuid not null references public.profiles(id),
  status        text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  approved_by   uuid references public.profiles(id),
  approved_at   timestamptz,
  receipt_path  text,
  notes         text not null default '',
  created_at    timestamptz not null default now()
);

alter table public.expenses enable row level security;
drop policy if exists "expenses_select" on public.expenses;
create policy "expenses_select" on public.expenses for select using (
  public.same_org(org_id) and (public.is_finance_manager() or submitted_by = auth.uid())
);
drop policy if exists "expenses_insert" on public.expenses;
create policy "expenses_insert" on public.expenses for insert with check (
  public.same_org(org_id) and public.has_finance_suite() and submitted_by = auth.uid()
);
drop policy if exists "expenses_update" on public.expenses;
create policy "expenses_update" on public.expenses for update using (
  public.same_org(org_id) and (
    public.is_finance_manager() or (submitted_by = auth.uid() and status = 'pending')
  )
);
drop policy if exists "expenses_delete" on public.expenses;
create policy "expenses_delete" on public.expenses for delete using (
  public.same_org(org_id) and (public.is_finance_manager() or (submitted_by = auth.uid() and status = 'pending'))
);

create or replace function public.decide_expense(_id uuid, _decision text)
returns public.expenses language plpgsql security definer set search_path = public as $$
declare row public.expenses;
begin
  if not public.is_finance_manager() then raise exception 'Not authorised to decide expenses'; end if;
  if _decision not in ('approved','rejected','paid') then raise exception 'Invalid decision'; end if;
  update public.expenses
     set status = _decision,
         approved_by = case when _decision = 'approved' then auth.uid() else approved_by end,
         approved_at = case when _decision = 'approved' then now() else approved_at end
   where id = _id and org_id = public.my_org_id()
   returning * into row;
  if not found then raise exception 'Expense not found'; end if;
  return row;
end;
$$;
grant execute on function public.decide_expense(uuid, text) to authenticated;

-- ---- receipts storage bucket --------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('finance-receipts', 'finance-receipts', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "finance_receipts_all" on storage.objects;
create policy "finance_receipts_all" on storage.objects
  for all to authenticated
  using  (bucket_id = 'finance-receipts')
  with check (bucket_id = 'finance-receipts');

-- ---- Phase 2 whitelist --------------------------------------------------------
create or replace function public.enforce_phase1_suite_scope() returns trigger
language plpgsql as $$
declare
  safe_suites text[] := array['hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm', 'attendance', 'benefits', 'it-assets', 'procurement', 'inventory', 'finance'];
begin
  if new.org_id <> '00000000-0000-0000-0000-000000000001' then
    select coalesce(jsonb_agg(g), '[]'::jsonb) into new.suites
    from jsonb_array_elements(new.suites) g
    where g->>'key' = any(safe_suites);
  end if;
  return new;
end;
$$;
