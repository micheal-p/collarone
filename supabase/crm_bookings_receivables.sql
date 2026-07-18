-- ============================================================================
-- Collarone CRM — Bookings + Money owed (receivables), the two service-
-- business gaps. Idempotent. Run after crm.sql / crm_deals.sql.
--
-- Bookings: appointments a service business runs its day on — who's coming,
-- when, for what. Reminders are in-app (today/tomorrow strip in the CRM);
-- no SMS/WhatsApp sending until the messaging-channel decision.
-- Receivables: who owes the business money and how overdue it is. Standalone
-- amounts (not tied to an invoice engine that doesn't exist yet).
-- ============================================================================

create table if not exists public.crm_bookings (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  contact_id    uuid references public.crm_contacts(id) on delete set null,
  customer_name text not null,
  phone         text not null default '',
  service       text not null default '',
  starts_at     timestamptz not null,
  duration_mins int not null default 60 check (duration_mins between 5 and 1440),
  status        text not null default 'booked' check (status in ('booked','completed','cancelled','no_show')),
  notes         text not null default '',
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists crm_bookings_org_time_idx on public.crm_bookings (org_id, starts_at);
alter table public.crm_bookings enable row level security;
drop policy if exists "crm_bookings_all" on public.crm_bookings;
create policy "crm_bookings_all" on public.crm_bookings for all using (
  public.same_org(org_id) and public.has_crm_suite()
) with check (
  public.same_org(org_id) and public.has_crm_suite()
);

create table if not exists public.crm_receivables (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  contact_id    uuid references public.crm_contacts(id) on delete set null,
  customer_name text not null,
  amount_naira  numeric not null check (amount_naira > 0),
  due_date      date,
  status        text not null default 'outstanding' check (status in ('outstanding','part_paid','paid','written_off')),
  note          text not null default '',
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  settled_at    timestamptz
);
create index if not exists crm_receivables_org_idx on public.crm_receivables (org_id, status, due_date);
alter table public.crm_receivables enable row level security;
drop policy if exists "crm_receivables_all" on public.crm_receivables;
create policy "crm_receivables_all" on public.crm_receivables for all using (
  public.same_org(org_id) and public.has_crm_suite()
) with check (
  public.same_org(org_id) and public.has_crm_suite()
);
