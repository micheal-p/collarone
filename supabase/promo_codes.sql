-- ============================================================================
-- Collarone — promo codes + payment reminder notices, managed from Platform
-- Admin. Idempotent.
--
-- promo_codes: percent-off discounts applied to the signup activation fee.
--   Created/managed by platform admins straight through RLS (no serverless
--   hop needed); redeemed inside client/api/signup.js via the service role.
--
-- org_notices: messages a platform admin pushes to one organization's staff
--   (today: "your payment is pending — pay to keep your workspace"), shown
--   as a banner in the tenant app until dismissed.
-- ============================================================================

create table if not exists public.promo_codes (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  percent_off  int  not null check (percent_off between 1 and 100),
  expires_at   timestamptz,
  max_uses     int check (max_uses is null or max_uses > 0),
  uses         int  not null default 0,
  active       boolean not null default true,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.promo_codes enable row level security;

drop policy if exists promo_codes_platform_admin on public.promo_codes;
create policy promo_codes_platform_admin on public.promo_codes
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());
-- No anon/authenticated policy: public validation at signup goes through the
-- service role in client/api/signup.js, which never reveals other codes.

alter table public.billing_transactions add column if not exists promo_code text;

create table if not exists public.org_notices (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  kind         text not null default 'payment_reminder',
  message      text not null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  dismissed_at timestamptz
);

alter table public.org_notices enable row level security;

drop policy if exists org_notices_platform_admin on public.org_notices;
create policy org_notices_platform_admin on public.org_notices
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists org_notices_org_read on public.org_notices;
create policy org_notices_org_read on public.org_notices
  for select using (public.same_org(org_id));

-- Any member of the org can dismiss its banner (it's a shared org-level notice).
drop policy if exists org_notices_org_dismiss on public.org_notices;
create policy org_notices_org_dismiss on public.org_notices
  for update using (public.same_org(org_id)) with check (public.same_org(org_id));
