-- Two visitor functions never checked whether the caller holds the suite.
--
-- Not the cross-tenant hole the review described — the live definitions are
-- already org-scoped (a later migration fixed that, which is why the definer
-- audit passes them). What is actually missing is the access check every other
-- entry point in the module has:
--
--   mark_no_shows()      writes: flips expected visits to 'no_show'
--   get_visitor_stats()  reads:  who is in the building right now
--
-- Both are callable by any authenticated member of the organisation, suite or
-- no suite. The read is the one that matters: "who is on site, and who is
-- overstaying" is front-desk and security information, not something every
-- employee should be able to pull.
--
-- Same shape as create_visit, which already gets this right.

create or replace function public.mark_no_shows()
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_org uuid := public.my_org_id();
begin
  if not public.has_visitors_access() then raise exception 'Access denied.'; end if;
  if v_org is null then return 0; end if;
  update public.visits
     set status = 'no_show'
   where org_id = v_org
     and status = 'expected'
     and expected_at < now() - interval '2 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public.mark_no_shows() to authenticated;

create or replace function public.get_visitor_stats()
returns table (metric text, value bigint)
language sql security definer stable set search_path = public as $$
  select 'total_today'::text, count(*)::bigint from public.visits
   where public.has_visitors_access() and org_id = public.my_org_id() and expected_at::date = current_date
  union all
  select 'checked_in_now', count(*)::bigint from public.visits
   where public.has_visitors_access() and org_id = public.my_org_id() and status = 'checked_in'
  union all
  select 'checked_out_today', count(*)::bigint from public.visits
   where public.has_visitors_access() and org_id = public.my_org_id() and status = 'checked_out' and checked_out_at::date = current_date
  union all
  select 'no_shows_today', count(*)::bigint from public.visits
   where public.has_visitors_access() and org_id = public.my_org_id() and status = 'no_show' and expected_at::date = current_date
  union all
  select 'overstay', count(*)::bigint from public.visits
   where public.has_visitors_access() and org_id = public.my_org_id() and status = 'checked_in' and checked_in_at < now() - interval '4 hours';
$$;
grant execute on function public.get_visitor_stats() to authenticated;
