-- ============================================================================
-- Collarone — demo requests are OFFICE VISITS, not screen shares
-- Run AFTER demo_requests.sql. Idempotent.
-- ============================================================================
--
-- The first version of /book-demo was built as a remote product walkthrough
-- ("half an hour, screen shared"). That was wrong. A demo here means a member
-- of the Collarone team travelling to the prospect's premises to sit with them.
--
-- That changes what the form has to capture. You cannot visit an office whose
-- address you did not ask for, and a request without one is a phone call to get
-- it before anything can be scheduled. So `location` is required by the
-- function, not optional like the other qualifying fields.

alter table public.platform_contact_messages
  add column if not exists location text not null default '';

-- The signature changes, so the old function has to go rather than be replaced:
-- `create or replace` with a different argument list creates an OVERLOAD, which
-- would leave the previous version callable by anon with no location captured.
drop function if exists public.public_request_demo(text, text, text, text, text, text, timestamptz, text);

create or replace function public.public_request_demo(
  p_name text,
  p_email text,
  p_phone text default '',
  p_company text default '',
  p_location text default '',
  p_staff_count text default '',
  p_interest text default '',
  p_preferred_at timestamptz default null,
  p_message text default ''
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Your name is required'; end if;
  if coalesce(trim(p_company), '') = '' then raise exception 'Your company name is required'; end if;
  -- Required, unlike the other qualifying fields: this is a visit.
  if coalesce(trim(p_location), '') = '' then
    raise exception 'We need the office address so we know where to come';
  end if;
  if coalesce(trim(p_email), '') = '' and coalesce(trim(p_phone), '') = '' then
    raise exception 'An email or phone number is required so we can confirm the visit';
  end if;
  if length(coalesce(p_message, '')) > 4000 then raise exception 'Message is too long'; end if;
  if p_preferred_at is not null and p_preferred_at < now() - interval '1 day' then
    raise exception 'Pick a time in the future';
  end if;
  if p_preferred_at is not null and p_preferred_at > now() + interval '365 days' then
    raise exception 'Pick a time within the next year';
  end if;

  insert into public.platform_contact_messages
    (kind, name, email, phone, company, location, staff_count, interest, preferred_at, message)
  values (
    'demo',
    trim(p_name), coalesce(trim(p_email), ''), coalesce(trim(p_phone), ''),
    trim(p_company), trim(p_location),
    coalesce(trim(p_staff_count), ''), coalesce(trim(p_interest), ''),
    p_preferred_at,
    coalesce(nullif(trim(p_message), ''), 'Requested an office visit.')
  );

  return true;
end;
$$;

revoke execute on function public.public_request_demo(text, text, text, text, text, text, text, timestamptz, text) from public;
grant execute on function public.public_request_demo(text, text, text, text, text, text, text, timestamptz, text) to anon, authenticated;
