-- ============================================================================
-- Documents — e-signatures + expiry dates. Run after documents.sql +
-- notification_outbox.sql. Idempotent.
--
-- E-sign: request a signature from a teammate on any document you can see;
-- they sign with a typed or drawn signature, stamped with who/when — the
-- audit trail is the point (an unsigned contract and a signed one are
-- different objects). Signing itself goes through sign_document() so the
-- signed fields can only ever be written by the person asked, once.
--
-- Expiry: a document can carry an expiry date (contracts, licences, permits);
-- the health sweep raises a banner + spine event ~14 days out, once per
-- expiry (dedupe via the notification outbox).
-- ============================================================================
alter table public.documents add column if not exists expires_at date;
create index if not exists documents_expiry_idx on public.documents (org_id, expires_at) where expires_at is not null;

create table if not exists public.document_signatures (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  document_id     uuid not null references public.documents(id) on delete cascade,
  requested_of    uuid not null references public.profiles(id) on delete cascade,
  requested_by    uuid not null references public.profiles(id) on delete cascade,
  note            text not null default '',
  signed_at       timestamptz,
  signature_name  text,
  signature_style text check (signature_style in ('typed','drawn')),
  signature_data  text,                      -- typed name, or a small drawn-path dataURL
  created_at      timestamptz not null default now()
);
create index if not exists doc_sigs_doc_idx on public.document_signatures (document_id);
create index if not exists doc_sigs_of_idx on public.document_signatures (requested_of) where signed_at is null;

alter table public.document_signatures enable row level security;
drop policy if exists doc_sigs_select on public.document_signatures;
create policy doc_sigs_select on public.document_signatures
  for select using (
    public.same_org(org_id) and public.has_documents_suite()
    and (requested_of = auth.uid() or requested_by = auth.uid()
         or public.is_documents_manager() or public.has_document_grant(document_id))
  );
drop policy if exists doc_sigs_insert on public.document_signatures;
create policy doc_sigs_insert on public.document_signatures
  for insert with check (
    public.same_org(org_id) and public.has_documents_suite()
    and requested_by = auth.uid() and signed_at is null
    and exists (select 1 from public.documents d where d.id = document_id and d.org_id = org_id)
  );
-- no update/delete policies: signing only via the RPC below

-- Requests go through an RPC too, so the person being asked hears about it
-- on the spine (client inserts can't emit events).
create or replace function public.request_document_signature(p_document uuid, p_of uuid, p_note text default '')
returns public.document_signatures
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org_id();
  row public.document_signatures;
  v_doc text;
begin
  if not public.has_documents_suite() then raise exception 'Documents access required'; end if;
  select name into v_doc from public.documents where id = p_document and org_id = v_org;
  if v_doc is null then raise exception 'Document not found'; end if;
  if not exists (select 1 from public.profiles where id = p_of and org_id = v_org and status = 'active') then
    raise exception 'Pick someone in your organization';
  end if;

  insert into public.document_signatures (org_id, document_id, requested_of, requested_by, note)
  values (v_org, p_document, p_of, auth.uid(), left(coalesce(p_note, ''), 300))
  returning * into row;

  insert into public.org_events (org_id, type, actor_id, payload)
  values (v_org, 'document.sign_requested', auth.uid(), jsonb_build_object(
    'documentId', p_document, 'name', v_doc,
    'by', (select name from public.profiles where id = auth.uid()),
    'for', jsonb_build_array(p_of)));
  return row;
end;
$$;
grant execute on function public.request_document_signature(uuid, uuid, text) to authenticated;

create or replace function public.sign_document(p_sig uuid, p_name text, p_style text, p_data text)
returns public.document_signatures
language plpgsql security definer set search_path = public as $$
declare
  row public.document_signatures;
begin
  if p_style not in ('typed','drawn') then raise exception 'Invalid signature style'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Type your full name to sign'; end if;
  update public.document_signatures
     set signed_at = now(), signature_name = left(trim(p_name), 120),
         signature_style = p_style, signature_data = left(coalesce(p_data, ''), 20000)
   where id = p_sig and requested_of = auth.uid() and signed_at is null
   returning * into row;
  if row.id is null then raise exception 'This signature request is not yours to sign (or is already signed)'; end if;

  insert into public.org_events (org_id, type, actor_id, payload)
  select row.org_id, 'document.signed', auth.uid(),
         jsonb_build_object('documentId', row.document_id, 'by', row.signature_name,
                            'name', (select name from public.documents where id = row.document_id),
                            'for', jsonb_build_array(row.requested_by))
  ;
  return row;
end;
$$;
grant execute on function public.sign_document(uuid, text, text, text) to authenticated;
