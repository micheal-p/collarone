-- ============================================================================
-- Collarone — platform admin: suite health check (replaces impersonation)
-- Real privacy fix: "impersonate" generated a genuine magic-link login as a
-- customer's own admin — full access to real business data (salaries,
-- contacts, HR records). Per explicit correction: platform admin must NEVER
-- see a customer's internal data, only confirm a suite is reachable and
-- error-free. This RPC returns a row COUNT only, never any row content, from
-- a hardcoded allow-list of (suite key -> table), never from user input.
-- ============================================================================

create or replace function public.platform_admin_test_suite(p_org_id uuid, p_suite_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_table text;
  v_count bigint;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;

  v_table := case p_suite_key
    when 'hr'          then 'profiles'
    when 'leave'       then 'leave_requests'
    when 'tasks'       then 'tasks'
    when 'visitors'    then 'visits'
    when 'payroll'     then 'payroll_runs'
    when 'crm'         then 'crm_contacts'
    when 'attendance'  then 'attendance_records'
    when 'benefits'    then 'employee_benefits'
    when 'it-assets'   then 'it_assets'
    when 'procurement' then 'purchase_requests'
    when 'inventory'   then 'stock_items'
    when 'finance'     then 'expenses'
    when 'projects'    then 'projects'
    when 'documents'   then 'documents'
    else null
  end;
  if v_table is null then raise exception 'Unknown suite'; end if;

  begin
    execute format('select count(*) from public.%I where org_id = $1', v_table) into v_count using p_org_id;
  exception when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;

  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;
grant execute on function public.platform_admin_test_suite(uuid, text) to authenticated;
