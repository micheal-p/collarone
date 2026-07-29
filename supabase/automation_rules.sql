-- ============================================================================
-- Custom automation rules — "when X happens (or every Monday), do Y".
-- Run after automation.sql + org_events.sql. Idempotent.
--
-- The six pre-built checks stay; this lets each org BUILD ITS OWN on top of
-- the org_events spine (event rules) or a repeat clock (schedules). Fenced by
-- construction:
--   • actions are a fixed safe set (task / banner / bell / email-to-staff) —
--     never suite grants, never money, never external recipients;
--   • rules cannot trigger on 'automation.%' events (their own output), so
--     loops are impossible;
--   • hard caps enforced by the executor: 25 rules/org, 50 actions/rule/day.
-- Writes: automation managers in their own org. Reads: automation suite.
-- ============================================================================
create table if not exists public.org_automation_rules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null,
  enabled       boolean not null default true,
  trigger_kind  text not null check (trigger_kind in ('event','schedule')),
  event_type    text check (event_type is null or event_type !~ '^automation\.'),
  schedule      jsonb,                    -- {every:'day'|'week'|'month', dow:0-6, dom:1-28}
  event_cursor  timestamptz not null default now(),   -- event rules: only react to what happens AFTER creation
  last_period   text,                     -- schedules: idempotency stamp
  action_kind   text not null check (action_kind in ('task','banner','bell','email')),
  action_config jsonb not null default '{}'::jsonb,
  runs_date     date,
  runs_today    int not null default 0,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists org_automation_rules_org_idx on public.org_automation_rules (org_id) where enabled;

alter table public.org_automation_rules enable row level security;
drop policy if exists automation_rules_select on public.org_automation_rules;
create policy automation_rules_select on public.org_automation_rules
  for select using (public.same_org(org_id) and public.has_automation_suite());
drop policy if exists automation_rules_write on public.org_automation_rules;
create policy automation_rules_write on public.org_automation_rules
  for all using (public.same_org(org_id) and public.is_automation_manager())
  with check (public.same_org(org_id) and public.is_automation_manager());

-- ---- New spine emitters so rules have business events worth reacting to ----
-- SQL triggers (not app code) so they fire no matter which path writes.

create or replace function public.emit_deal_won()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 'won' and old.stage is distinct from 'won' then
    insert into public.org_events (org_id, type, payload)
    values (new.org_id, 'crm.deal_won',
            jsonb_build_object('title', new.title, 'valueNaira', new.value_naira));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_emit_deal_won on public.crm_deals;
create trigger trg_emit_deal_won after update on public.crm_deals
  for each row execute function public.emit_deal_won();

create or replace function public.emit_invoice_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.doc_type = 'invoice' and new.status = 'paid' and old.status is distinct from 'paid' then
    insert into public.org_events (org_id, type, payload)
    values (new.org_id, 'invoice.paid',
            jsonb_build_object('docNo', new.doc_no, 'party', new.party_name, 'total', new.total));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_emit_invoice_paid on public.trade_documents;
create trigger trg_emit_invoice_paid after update on public.trade_documents
  for each row execute function public.emit_invoice_paid();
