-- ============================================================================
-- Collarone — public offer-acceptance links (ATS Phase 1). Idempotent.
-- Run after lifecycle.sql.
--
-- HR marks an application's offer as 'sent' and shares a private tokenized
-- link; the candidate (no account) sees the offer — role, salary, start
-- date, a note — on the company's letterhead colors, and taps Accept or
-- Decline. The decision stamps the application and the pipeline shows it.
-- Token is an unguessable uuid; the link only works while status is 'sent'.
-- ============================================================================

alter table public.applications add column if not exists offer_token uuid not null default gen_random_uuid();
create unique index if not exists applications_offer_token_idx on public.applications (offer_token);
alter table public.applications add column if not exists offer_note text not null default '';
alter table public.applications add column if not exists offer_sent_at timestamptz;
alter table public.applications add column if not exists offer_decided_at timestamptz;

create or replace function public.public_get_offer(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v record;
begin
  select a.offer_status, a.offer_salary, a.offer_start_date, a.offer_note, a.offer_decided_at,
         c.name as candidate_name, r.title as role_title,
         o.name as org_name, o.logo_url, o.theme_color
    into v
    from public.applications a
    join public.candidates c on c.id = a.candidate_id
    join public.job_requisitions r on r.id = a.requisition_id
    join public.organizations o on o.id = r.org_id
   where a.offer_token = p_token
     and a.offer_status in ('sent','accepted','declined');
  if v is null then return null; end if;
  return jsonb_build_object(
    'status', v.offer_status,
    'candidateName', v.candidate_name,
    'roleTitle', v.role_title,
    'salary', v.offer_salary,
    'startDate', v.offer_start_date,
    'note', v.offer_note,
    'decidedAt', v.offer_decided_at,
    'orgName', v.org_name,
    'logoUrl', v.logo_url,
    'themeColor', v.theme_color
  );
end;
$$;
grant execute on function public.public_get_offer(uuid) to anon, authenticated;

create or replace function public.public_decide_offer(p_token uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  update public.applications
     set offer_status = case when p_accept then 'accepted' else 'declined' end,
         offer_decided_at = now(),
         updated_at = now()
   where offer_token = p_token and offer_status = 'sent'
   returning id into v_id;
  if v_id is null then raise exception 'This offer link is no longer active.'; end if;
  return jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end);
end;
$$;
grant execute on function public.public_decide_offer(uuid, boolean) to anon, authenticated;
