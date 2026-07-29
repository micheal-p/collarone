-- ============================================================================
-- Collarone — best-tier billing (the honesty fix). Run AFTER
-- billing_renewals_pricing.sql. Idempotent.
--
-- WHY: the landing estimator + signup cart quote the CHEAPEST plan for the
-- suites a customer runs ("you can never be stuck on Startup paying more than
-- Standard would cost"). But request_renewal charged the org's single locked
-- tier + a per-extra-suite fee — the exact "trick" that was removed from the
-- display but never from the engine. This makes the engine match the quote.
--
-- HOW: each org carries a rate_card snapshot (all priced tiers + per-seat +
-- annual discount) locked at sign-up, so a later price rise never re-prices
-- them. best_plan_kobo() picks the cheapest tier from that snapshot for the
-- org's CURRENT suite/seat counts — mirrors client/src/pages/Landing.jsx's
-- priceFor()/reduce() exactly. Enterprise is never auto-priced (custom quote).
-- ============================================================================

-- 1) Snapshot column ---------------------------------------------------------
alter table public.organizations add column if not exists rate_card jsonb;

-- 2) The published price list as a rate_card snapshot (fallback for orgs that
--    predate the snapshot, and the value signup writes at creation).
create or replace function public.current_published_rate_card()
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'perSeatKobo',    (select per_staff_kobo  from public.platform_billing_settings limit 1),
    'annualDiscount', (select annual_discount  from public.platform_billing_settings limit 1),
    'tiers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', plan_key, 'baseKobo', base_fee_kobo,
        'included', included_suites, 'extraKobo', extra_suite_fee_kobo) order by sort_order)
      from public.platform_pricing
      where plan_key <> 'enterprise'   -- enterprise is custom, never auto-priced
    ), '[]'::jsonb)
  );
$$;

-- 3) The best-tier price. Mirrors the estimator: for each priced tier the
--    monthly is base + max(0, suites-included)*extraFee; seat cost is identical
--    across tiers so the cheapest tier is the one with the lowest suite cost.
--    Adds per-seat, then months, then the annual discount on a 12-month term.
create or replace function public.best_plan_kobo(p_rate_card jsonb, p_seats int, p_suites int, p_months int)
returns bigint language sql immutable set search_path = public as $$
  with tiers as (
    select (t->>'baseKobo')::bigint  as base,
           (t->>'included')::int      as included,
           (t->>'extraKobo')::bigint  as extra
    from jsonb_array_elements(coalesce(p_rate_card->'tiers', '[]'::jsonb)) t
  ),
  best as ( select min(base + greatest(0, p_suites - included) * extra) as suite_kobo from tiers )
  select case
    when (select suite_kobo from best) is null then 0::bigint  -- no priced tiers → caller raises
    else (
      with monthly as (
        select (select suite_kobo from best)
             + coalesce((p_rate_card->>'perSeatKobo')::bigint, 200000) * greatest(p_seats, 0) as m
      )
      select case when p_months = 12
        then round((select m from monthly) * 12 * (1 - coalesce((p_rate_card->>'annualDiscount')::numeric, 0.15)))::bigint
        else (select m from monthly) * greatest(p_months, 1)
      end
    )
  end;
$$;

-- 4) Backfill existing orgs from the current published list (we have no
--    historical snapshot for them; going forward signup writes it at creation).
update public.organizations
   set rate_card = public.current_published_rate_card()
 where rate_card is null
   and id <> '00000000-0000-0000-0000-000000000001';  -- founding org isn't billed

-- 5) Rewire request_renewal to charge best-tier from the locked snapshot.
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
  select count(distinct g->>'key') into v_suites from public.profiles p,
    jsonb_array_elements(coalesce(p.suites, '[]'::jsonb)) g where p.org_id = v_org.id;

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
