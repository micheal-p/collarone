-- ============================================================================
-- Collarone — self-service profile fields v2. Idempotent. Run after
-- profile_self.sql.
--
-- Staff can now keep their own personal details current: date of birth
-- (feeds the HR analytics birthdays card), home address, and an emergency
-- contact. Deliberately NOT self-editable: name, email, job title,
-- department, salary/bank details — those stay admin-managed (bank
-- self-edits are a payroll-fraud vector).
-- ============================================================================

alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists address text not null default '';
alter table public.profiles add column if not exists emergency_contact_name text not null default '';
alter table public.profiles add column if not exists emergency_contact_phone text not null default '';

-- New signature — drop the old 3-arg version so calls can't bind ambiguously.
drop function if exists public.update_my_profile(text, text, text);

create or replace function public.update_my_profile(
  p_phone text, p_whatsapp text, p_avatar_url text,
  p_date_of_birth date default null,
  p_address text default null,
  p_ec_name text default null,
  p_ec_phone text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set
    phone = coalesce(nullif(trim(p_phone), ''), phone),
    whatsapp = coalesce(trim(p_whatsapp), whatsapp),
    avatar_url = coalesce(trim(p_avatar_url), avatar_url),
    date_of_birth = coalesce(p_date_of_birth, date_of_birth),
    address = coalesce(p_address, address),
    emergency_contact_name = coalesce(p_ec_name, emergency_contact_name),
    emergency_contact_phone = coalesce(p_ec_phone, emergency_contact_phone)
  where id = auth.uid();
end;
$$;
grant execute on function public.update_my_profile(text, text, text, date, text, text, text) to authenticated;
