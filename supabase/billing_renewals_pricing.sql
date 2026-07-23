-- ============================================================================
-- Collarone — renewals (monthly + yearly at 15% off), platform-editable
-- pricing, and the dunning grace window set to 5 days (operator decision,
-- 2026-07-21). Run after billing.sql + pricing_lock.sql + paywall.sql.
-- Idempotent.
--
--   platform_pricing / platform_billing_settings — the published price list,
--   editable from Platform Control. PUBLISHED prices only: an existing org's
--   charges always come from the rates LOCKED on its own row at sign-up
--   (pricing_lock.sql) — editing the price list never re-prices a customer.
--
--   request_renewal(months) — an org admin starts a renewal (1 or 12 months;
--   12 gets the annual discount). Amount is computed server-side from the
--   org's locked rates + live seat and suite counts.
--
--   apply_confirmed_renewal(tx) — service-role only; both confirm paths
--   (platform admin manual + Paystack self-serve verify) call it. Extends
--   current_period_end from wherever it currently stands (never shortens),
--   reactivates the org, clears grace. Idempotent per transaction.
-- ============================================================================

-- ---- published price list ---------------------------------------------------
create table if not exists public.platform_pricing (
  plan_key            text primary key check (plan_key in ('startup','standard','enterprise')),
  name                text not null,
  base_fee_kobo       bigint not null check (base_fee_kobo >= 0),
  included_suites     int not null check (included_suites > 0),
  extra_suite_fee_kobo bigint not null check (extra_suite_fee_kobo >= 0),
  sort_order          int not null default 100,
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);
insert into public.platform_pricing (plan_key, name, base_fee_kobo, included_suites, extra_suite_fee_kobo, sort_order) values
  ('startup',    'Startup',    1500000, 3, 800000, 10),
  ('standard',   'Standard',   2500000, 5, 600000, 20),
  ('enterprise', 'Enterprise', 4500000, 8, 400000, 30)
on conflict (plan_key) do nothing;   -- seed once; edits only via Platform Control

create table if not exists public.platform_billing_settings (
  id               boolean primary key default true check (id),   -- single row
  per_staff_kobo   bigint not null default 200000 check (per_staff_kobo >= 0),
  annual_discount  numeric not null default 0.15 check (annual_discount >= 0 and annual_discount < 1),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);
insert into public.platform_billing_settings (id) values (true) on conflict (id) do nothing;

-- prices are public marketing information; edits are platform-admin only
alter table public.platform_pricing enable row level security;
drop policy if exists "platform_pricing_select" on public.platform_pricing;
create policy "platform_pricing_select" on public.platform_pricing for select to anon, authenticated using (true);
drop policy if exists "platform_pricing_write" on public.platform_pricing;
create policy "platform_pricing_write" on public.platform_pricing for update using (public.is_platform_admin()) with check (public.is_platform_admin());

alter table public.platform_billing_settings enable row level security;
drop policy if exists "platform_billing_settings_select" on public.platform_billing_settings;
create policy "platform_billing_settings_select" on public.platform_billing_settings for select to anon, authenticated using (true);
drop policy if exists "platform_billing_settings_write" on public.platform_billing_settings;
create policy "platform_billing_settings_write" on public.platform_billing_settings for update using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---- renewals ---------------------------------------------------------------
alter table public.billing_transactions drop constraint if exists billing_transactions_type_check;
alter table public.billing_transactions add constraint billing_transactions_type_check
  check (type in ('activation_fee','credit_purchase','renewal'));
alter table public.billing_transactions add column if not exists months int not null default 1 check (months in (1, 12));

create or replace function public.request_renewal(p_months int)
returns public.billing_transactions language plpgsql security definer set search_path = public as $$
declare
  v_org record;
  v_settings record;
  v_seats int;
  v_suites int;
  v_monthly_kobo bigint;
  v_amount_kobo bigint;
  v_ref text;
  row public.billing_transactions;
begin
  if not public.is_super_admin() then raise exception 'Only your workspace admin can renew the subscription'; end if;
  if p_months not in (1, 12) then raise exception 'Renew for 1 month or 12 months'; end if;

  select * into v_org from public.organizations where id = public.my_org_id();
  if v_org.id is null then raise exception 'Organization not found'; end if;
  select * into v_settings from public.platform_billing_settings limit 1;

  -- an open renewal request is reused instead of stacking duplicates
  select * into row from public.billing_transactions
    where org_id = v_org.id and type = 'renewal' and status = 'pending' and months = p_months
    order by created_at desc limit 1;
  if row.id is not null then return row; end if;

  select count(*) into v_seats from public.profiles
    where org_id = v_org.id and status = 'active' and role <> 'super_admin';
  select count(distinct g->>'key') into v_suites from public.profiles p,
    jsonb_array_elements(coalesce(p.suites, '[]'::jsonb)) g where p.org_id = v_org.id;

  -- LOCKED rates from the org's own row; published prices only fill gaps for
  -- orgs created before the lock existed.
  v_monthly_kobo :=
      coalesce(v_org.base_fee_kobo, (select base_fee_kobo from public.platform_pricing where plan_key = coalesce(v_org.plan_tier, 'startup')), 1500000)
    + coalesce(v_org.per_seat_kobo, v_settings.per_staff_kobo, 200000) * greatest(v_seats, 0)
    + coalesce(v_org.extra_suite_fee_kobo, (select extra_suite_fee_kobo from public.platform_pricing where plan_key = coalesce(v_org.plan_tier, 'startup')), 800000)
      * greatest(v_suites - coalesce(v_org.included_suites, 3), 0);

  v_amount_kobo := v_monthly_kobo * p_months;
  if p_months = 12 then
    v_amount_kobo := round(v_amount_kobo * (1 - coalesce(v_settings.annual_discount, 0.15)));
  end if;
  if v_amount_kobo <= 0 then raise exception 'Nothing to charge — contact support'; end if;

  v_ref := 'REN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.billing_transactions (org_id, type, amount_kobo, reference, months, notes)
  values (v_org.id, 'renewal', v_amount_kobo, v_ref, p_months,
          p_months || ' month(s) · ' || v_seats || ' staff · ' || v_suites || ' suites')
  returning * into row;
  return row;
end;
$$;
grant execute on function public.request_renewal(int) to authenticated;

-- service-role only: both confirm paths call this after marking tx confirmed
create or replace function public.apply_confirmed_renewal(p_tx_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  tx public.billing_transactions;
begin
  select * into tx from public.billing_transactions where id = p_tx_id and type = 'renewal';
  if tx.id is null then raise exception 'Renewal transaction not found'; end if;
  update public.organizations o set
    status = 'active',
    grace_until = null,
    current_period_end = greatest(coalesce(o.current_period_end, now()), now()) + (tx.months || ' months')::interval
  where o.id = tx.org_id;
end;
$$;
revoke execute on function public.apply_confirmed_renewal(uuid) from anon, authenticated, public;

-- ---- dunning grace window: 5 days (was 7) -----------------------------------
-- Ladder: renewal due -> 5-day grace (full access + banner) -> read-only ->
-- suspended at day 30 from the renewal date (25 days after read-only).
create or replace function public.advance_billing_lifecycle()
returns table(id uuid, from_status text, to_status text)
language plpgsql security definer set search_path = public as $$
declare FOUNDING constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  return query
  with moved as (
    update public.organizations o
       set status = 'past_due', grace_until = now() + interval '5 days'
     where o.status = 'active' and o.current_period_end is not null
       and o.current_period_end < now() and o.id <> FOUNDING
    returning o.id
  ) select m.id, 'active'::text, 'past_due'::text from moved m;

  return query
  with moved as (
    update public.organizations o set status = 'read_only'
     where o.status = 'past_due' and o.grace_until is not null
       and o.grace_until < now() and o.id <> FOUNDING
    returning o.id
  ) select m.id, 'past_due'::text, 'read_only'::text from moved m;

  return query
  with moved as (
    update public.organizations o set status = 'suspended'
     where o.status = 'read_only' and o.grace_until is not null
       and o.grace_until < now() - interval '25 days' and o.id <> FOUNDING
    returning o.id
  ) select m.id, 'read_only'::text, 'suspended'::text from moved m;
end;
$$;
revoke execute on function public.advance_billing_lifecycle() from anon, authenticated;
