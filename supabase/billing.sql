-- ============================================================================
-- Collarone — billing: activation fee + seat-credit packs
-- Run AFTER organizations.sql. Idempotent.
--
-- Payment is a generated reference + manual platform-admin confirmation, not
-- live Paystack automation — see the project plan for why. `amount_kobo` is
-- an integer count of kobo (1 naira = 100 kobo) to avoid float rounding on
-- money. Balance = sum(delta) over org_credit_ledger, computed on read.
-- ============================================================================

create table if not exists public.billing_transactions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id),
  type             text not null check (type in ('activation_fee','credit_purchase')),
  amount_kobo      bigint not null check (amount_kobo > 0),
  currency         text not null default 'NGN',
  reference        text not null unique,
  method           text not null default 'manual_transfer' check (method in ('manual_transfer','paystack')),
  status           text not null default 'pending' check (status in ('pending','confirmed','failed','cancelled')),
  credits_granted  int not null default 0,
  confirmed_by     uuid references auth.users(id),
  confirmed_at     timestamptz,
  notes            text not null default '',
  created_at       timestamptz not null default now()
);
alter table public.billing_transactions enable row level security;

create table if not exists public.org_credit_ledger (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id),
  delta                   int not null,   -- +N on a confirmed purchase, -1 per staff account created
  reason                  text not null check (reason in ('purchase','staff_created','adjustment','refund')),
  related_transaction_id  uuid references public.billing_transactions(id),
  related_profile_id      uuid references public.profiles(id),
  created_by              uuid references auth.users(id),
  created_at              timestamptz not null default now()
);
alter table public.org_credit_ledger enable row level security;

-- RLS: an org's own super_admin can read its own billing/ledger rows; Collarone
-- platform admins can read everything (needed to confirm cross-org payments).
-- No insert/update/delete policy for `authenticated` — writes only via the
-- service-role /api/admin function, same convention as profiles.
drop policy if exists "billing_transactions_select" on public.billing_transactions;
create policy "billing_transactions_select" on public.billing_transactions for select
  using ( (public.is_super_admin() and public.same_org(org_id)) or public.is_platform_admin() );

drop policy if exists "org_credit_ledger_select" on public.org_credit_ledger;
create policy "org_credit_ledger_select" on public.org_credit_ledger for select
  using ( (public.is_super_admin() and public.same_org(org_id)) or public.is_platform_admin() );

-- Convenience view: current credit balance per org.
create or replace view public.org_credit_balance as
  select org_id, coalesce(sum(delta), 0) as balance
  from public.org_credit_ledger
  group by org_id;

grant select on public.org_credit_balance to authenticated;
alter view public.org_credit_balance set (security_invoker = true);

-- the founding org isn't credit-gated — seed a large adjustment so today's usage (admin.js
-- create-user flow) isn't affected by the new credit check.
insert into public.org_credit_ledger (org_id, delta, reason)
select '00000000-0000-0000-0000-000000000001', 999999, 'adjustment'
where not exists (
  select 1 from public.org_credit_ledger
  where org_id = '00000000-0000-0000-0000-000000000001' and reason = 'adjustment'
);
