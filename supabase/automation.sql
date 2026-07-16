-- ============================================================================
-- Collarone — Automation suite v0 (turns the 'automation' catalog entry from
-- status:'soon' into a real, live suite). Run after trade_documents.sql and
-- inventory_booking.sql (the checks below query those tables). Idempotent.
--
-- Deliberately NOT a generic rule-builder for v0 — six pre-built, genuinely
-- useful checks a Nigerian SME actually needs, each independently toggleable
-- per org. The evaluation logic itself lives in client/api/automations-run.js
-- (a daily Vercel Cron function using the service-role key, same pattern as
-- health.js's trial-expiry piggyback) — this file only holds the per-org
-- settings/audit-log tables and their RLS, since the actual checks need to
-- read/write across many suites' tables in ways that are simpler to express
-- once in JS than as one giant cross-suite PL/pgSQL function.
-- ============================================================================

create or replace function public.has_automation_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"automation"}]'::jsonb);
$$;
grant execute on function public.has_automation_suite() to authenticated;

create or replace function public.is_automation_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"automation","role":"manager"}]'::jsonb);
$$;
grant execute on function public.is_automation_manager() to authenticated;

-- Six fixed keys, enforced client- and server-side against this list:
--   low_stock_alert, overdue_invoice_reminder, new_lead_auto_task,
--   task_overdue_alert, leave_pending_reminder, stock_booking_expiry
create table if not exists public.automation_settings (
  org_id     uuid not null references public.organizations(id),
  key        text not null check (key in (
               'low_stock_alert','overdue_invoice_reminder','new_lead_auto_task',
               'task_overdue_alert','leave_pending_reminder','stock_booking_expiry'
             )),
  enabled    boolean not null default true,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (org_id, key)
);

alter table public.automation_settings enable row level security;
drop policy if exists "automation_settings_select" on public.automation_settings;
create policy "automation_settings_select" on public.automation_settings for select using (
  public.same_org(org_id) and public.has_automation_suite()
);
-- writes only through upsert_automation_setting() below

create or replace function public.upsert_automation_setting(p_key text, p_enabled boolean, p_config jsonb default '{}'::jsonb)
returns public.automation_settings language plpgsql security definer set search_path = public as $$
declare
  caller_org uuid;
  row public.automation_settings;
begin
  if not public.is_automation_manager() then raise exception 'Not authorised to change automation settings'; end if;
  caller_org := public.my_org_id();
  insert into public.automation_settings (org_id, key, enabled, config, updated_at)
  values (caller_org, p_key, p_enabled, coalesce(p_config, '{}'::jsonb), now())
  on conflict (org_id, key) do update set enabled = excluded.enabled, config = excluded.config, updated_at = now()
  returning * into row;
  return row;
end;
$$;
grant execute on function public.upsert_automation_setting(text, boolean, jsonb) to authenticated;

-- Audit trail so the suite UI can show "last ran … found 3" instead of being
-- a black box — same non-fake-status principle as status_checks. Written
-- only by the service-role cron function, never by regular users.
create table if not exists public.automation_runs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id),
  key        text not null,
  ran_at     timestamptz not null default now(),
  count      int not null default 0,
  note       text not null default ''
);
create index if not exists automation_runs_org_idx on public.automation_runs (org_id, key, ran_at desc);

alter table public.automation_runs enable row level security;
drop policy if exists "automation_runs_select" on public.automation_runs;
create policy "automation_runs_select" on public.automation_runs for select using (
  public.same_org(org_id) and public.has_automation_suite()
);

-- ---- Phase 2 whitelist — canonical, run last -----------------------------
-- Full superset carried forward from documents.sql plus 'trade-docs' and
-- 'automation'. This is the file that should run after all the others so it
-- wins; every future new suite should append itself here, not fork a new
-- copy of the array in its own file (that's exactly the landmine the
-- 2026-07 code review flagged once already).
create or replace function public.enforce_phase1_suite_scope() returns trigger
language plpgsql as $$
declare
  safe_suites text[] := array[
    'hr','leave','tasks','visitors','payroll','crm','attendance','benefits','it-assets',
    'procurement','inventory','finance','projects','documents','trade-docs','automation'
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
