-- ============================================================================
-- Collarone — website messages become a real inbox + promo codes v2
--
-- Messages: submissions from the site contact form / embed widget get their
-- own activity type ('web_message') instead of hiding among hand-logged
-- notes, a replied_at marker so the dashboard can show what's been answered,
-- and contact dedupe by email so one person messaging twice isn't two
-- contacts. (Direct email replies will send over SMTP from the org's own
-- collarone.app mailbox once that exists — the reply UI ships "coming soon".)
--
-- Promo codes v2: beyond a % discount, a code can grant seat credits and/or
-- a time-boxed trial ("free for 3 days / 1 month" — set per code). Trials
-- stamp organizations.trial_ends_at; expiry enforcement runs in
-- client/api/health.js alongside the throttled status check.
-- ============================================================================

-- allow the new activity type
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.crm_activities'::regclass and contype = 'c' and conname like '%type%';
  if c is not null then execute format('alter table public.crm_activities drop constraint %I', c); end if;
end $$;
alter table public.crm_activities
  add constraint crm_activities_type_check check (type in ('call','whatsapp','email','meeting','note','web_message'));

alter table public.crm_activities add column if not exists replied_at timestamptz;

-- promo codes v2 + trial window on orgs
alter table public.promo_codes add column if not exists grant_credits int not null default 0 check (grant_credits >= 0);
alter table public.promo_codes add column if not exists trial_days int check (trial_days is null or trial_days > 0);
alter table public.organizations add column if not exists trial_ends_at timestamptz;

-- lead submission v2: distinct type + email dedupe
create or replace function public.public_submit_lead(p_org_slug text, p_name text, p_email text, p_phone text, p_message text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_admin_id uuid;
  v_contact_id uuid;
begin
  select id into v_org_id from public.organizations where slug = p_org_slug;
  if v_org_id is null then raise exception 'Unknown company page'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name is required'; end if;

  select id into v_admin_id from public.profiles where org_id = v_org_id and role = 'super_admin' limit 1;
  if v_admin_id is null then raise exception 'This company cannot receive leads right now'; end if;

  -- same person writing again (matched by email) stays one contact
  if coalesce(trim(p_email), '') <> '' then
    select id into v_contact_id from public.crm_contacts
    where org_id = v_org_id and lower(email) = lower(trim(p_email)) limit 1;
  end if;

  if v_contact_id is null then
    insert into public.crm_contacts (org_id, name, email, phone, notes, created_by)
    values (v_org_id, trim(p_name), coalesce(p_email, ''), coalesce(p_phone, ''), 'Came in through the website contact form.', v_admin_id)
    returning id into v_contact_id;
  end if;

  insert into public.crm_activities (org_id, contact_id, type, notes, created_by)
  values (v_org_id, v_contact_id, 'web_message', coalesce(nullif(trim(p_message), ''), '(No message provided.)'), v_admin_id);

  return true;
end;
$$;
grant execute on function public.public_submit_lead(text, text, text, text, text) to anon, authenticated;

-- a 100%-off promo produces a zero-kobo activation record — allow it
alter table public.billing_transactions drop constraint if exists billing_transactions_amount_kobo_check;
alter table public.billing_transactions add constraint billing_transactions_amount_kobo_check check (amount_kobo >= 0);

-- promo-granted seat credits get their own ledger reason
alter table public.org_credit_ledger drop constraint if exists org_credit_ledger_reason_check;
alter table public.org_credit_ledger add constraint org_credit_ledger_reason_check
  check (reason in ('purchase','staff_created','adjustment','refund','promo_grant'));
