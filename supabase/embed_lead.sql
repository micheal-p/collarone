-- ============================================================================
-- Collarone — embeddable lead-capture widget (first "attachable surface" for
-- companies keeping their own external website)
-- Anonymous submission → CRM contact + activity note, scoped by org slug.
-- Attributed to the org's own super_admin as created_by since anon has no
-- staff identity — same reasoning as careers' public_submit_application.
-- ============================================================================

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

  insert into public.crm_contacts (org_id, name, email, phone, notes, created_by)
  values (v_org_id, trim(p_name), coalesce(p_email, ''), coalesce(p_phone, ''), 'Submitted via website embed widget.', v_admin_id)
  returning id into v_contact_id;

  insert into public.crm_activities (org_id, contact_id, type, notes, created_by)
  values (v_org_id, v_contact_id, 'note', coalesce(nullif(trim(p_message), ''), '(No message provided.)'), v_admin_id);

  return true;
end;
$$;
grant execute on function public.public_submit_lead(text, text, text, text, text) to anon, authenticated;
