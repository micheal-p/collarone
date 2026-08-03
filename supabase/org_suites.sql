-- ============================================================================
-- What the customer actually bought. Run after billing_best_tier.sql. Idempotent.
--
-- The hole this closes: pricing is à-la-carte — base tier + a fee per suite over
-- the tier's included count — but nothing recorded WHICH suites an org bought.
-- Signup collected the selection to work out the cheapest tier and then threw it
-- away, and request_renewal counted suite GRANTS on profiles instead. An org's
-- owner is a super_admin, and super_admins bypass grants to see everything, so
-- their grant list is empty and every org on the platform billed for ZERO extra
-- suites while having access to all of them. Verified 2026-08-02: Collarone,
-- Dr CV and ggggggg all counted 0.
--
-- organizations.suites is that missing record.
--
-- NULL is meaningful and is NOT the same as '[]': it means "signed up before
-- this column existed", and every read below falls back to the old behaviour
-- for those orgs. That is deliberate — guessing a retrospective suite list for
-- a live customer would either cut off access they have today or raise their
-- invoice without them agreeing to it. Existing orgs keep exactly the access
-- and exactly the price they have now until someone sets their list on purpose.
-- ============================================================================

alter table public.organizations add column if not exists suites jsonb;

comment on column public.organizations.suites is
  'Suite keys this org bought, e.g. ["hr","leave"]. NULL = pre-dates the column: unrestricted access, billed off profile grants (legacy). [] = bought nothing.';

-- How many suites do we charge this org for?
--   • a real list  → its length, which is what they picked and were quoted
--   • NULL (legacy) → distinct grants across profiles, the old behaviour
create or replace function public.org_billable_suite_count(p_org uuid)
returns int language sql stable set search_path = public as $$
  select case
    when (select o.suites from public.organizations o where o.id = p_org) is not null
      then (select jsonb_array_length(o.suites) from public.organizations o where o.id = p_org)
    else (
      select count(distinct g->>'key')::int
      from public.profiles p, jsonb_array_elements(coalesce(p.suites, '[]'::jsonb)) g
      where p.org_id = p_org
    )
  end;
$$;
grant execute on function public.org_billable_suite_count(uuid) to authenticated;

-- Same as billing_best_tier.sql's version, with the suite count coming from
-- org_billable_suite_count() instead of counting grants inline.
create or replace function public.request_renewal(p_months int)
returns public.billing_transactions language plpgsql security definer set search_path = public as $$
declare
  v_org record;
  v_seats int;
  v_suites int;
  v_rate_card jsonb;
  v_amount_kobo bigint;
  v_ref text;
  row public.billing_transactions;
begin
  if not public.is_super_admin() then raise exception 'Only your workspace admin can renew the subscription'; end if;
  if p_months not in (1, 12) then raise exception 'Renew for 1 month or 12 months'; end if;

  select * into v_org from public.organizations where id = public.my_org_id();
  if v_org.id is null then raise exception 'Organization not found'; end if;

  -- reuse an open renewal request instead of stacking duplicates
  select * into row from public.billing_transactions
    where org_id = v_org.id and type = 'renewal' and status = 'pending' and months = p_months
    order by created_at desc limit 1;
  if row.id is not null then return row; end if;

  select count(*) into v_seats from public.profiles
    where org_id = v_org.id and status = 'active' and role <> 'super_admin';
  v_suites := public.org_billable_suite_count(v_org.id);

  -- LOCKED rate card (all tiers, per-seat, discount as of sign-up); published
  -- list only fills in for orgs created before the snapshot existed.
  v_rate_card := coalesce(v_org.rate_card, public.current_published_rate_card());
  v_amount_kobo := public.best_plan_kobo(v_rate_card, v_seats, v_suites, p_months);
  if v_amount_kobo <= 0 then raise exception 'Nothing to charge — contact support'; end if;

  v_ref := 'REN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.billing_transactions (org_id, type, amount_kobo, reference, months, notes)
  values (v_org.id, 'renewal', v_amount_kobo, v_ref, p_months,
          p_months || ' month(s) · ' || v_seats || ' staff · ' || v_suites || ' suites · best-tier')
  returning * into row;
  return row;
end;
$$;
grant execute on function public.request_renewal(int) to authenticated;

-- Only a platform admin changes what an org bought — it moves their invoice,
-- so it is not something a tenant's own admin does to themselves.
create or replace function public.set_org_suites(p_org uuid, p_suites jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Only Collarone can change a plan'; end if;
  if p_suites is not null and jsonb_typeof(p_suites) <> 'array' then raise exception 'suites must be an array'; end if;
  update public.organizations set suites = p_suites where id = p_org;
end;
$$;
grant execute on function public.set_org_suites(uuid, jsonb) to authenticated;
