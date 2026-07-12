-- ============================================================================
-- Collarone — Documents suite (Stage 6 catalog item, built early — last of
-- the original 13-module catalog)
-- Run after projects.sql. Idempotent. Native multi-tenant from day one.
--
-- Permissions model, v0: a document is either 'org' visibility (anyone
-- holding the documents suite can view) or 'restricted' (only the creator,
-- a documents manager, or an explicitly granted user in document_permissions
-- can view). Storage bucket itself is gated to any authenticated user
-- holding the suite — same pattern as task-attachments/finance-receipts —
-- the real access boundary is the DB row (documents/document_permissions
-- RLS) plus the fact that storage paths are unguessable UUIDs, not the
-- bucket policy. Versioning is a plain append-only history table.
-- ============================================================================

create or replace function public.has_documents_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"documents"}]'::jsonb);
$$;
grant execute on function public.has_documents_suite() to authenticated;

create or replace function public.is_documents_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"documents","role":"manager"}]'::jsonb);
$$;
grant execute on function public.is_documents_manager() to authenticated;

create table if not exists public.doc_folders (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id),
  name             text not null,
  parent_folder_id uuid references public.doc_folders(id) on delete cascade,
  created_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now()
);

create table if not exists public.documents (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id),
  folder_id        uuid references public.doc_folders(id) on delete set null,
  name             text not null,
  file_path        text not null,
  file_size        numeric,
  current_version  int not null default 1,
  visibility       text not null default 'org' check (visibility in ('org','restricted')),
  created_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.document_versions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id),
  document_id uuid not null references public.documents(id) on delete cascade,
  version     int not null,
  file_path   text not null,
  file_size   numeric,
  notes       text not null default '',
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  unique (document_id, version)
);

create table if not exists public.document_permissions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  granted_by  uuid not null references public.profiles(id),
  granted_at  timestamptz not null default now(),
  unique (document_id, user_id)
);

-- Helper so the documents RLS check on document_permissions doesn't recurse.
create or replace function public.has_document_grant(p_document_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.document_permissions where document_id = p_document_id and user_id = auth.uid());
$$;
grant execute on function public.has_document_grant(uuid) to authenticated;

alter table public.doc_folders         enable row level security;
alter table public.documents           enable row level security;
alter table public.document_versions   enable row level security;
alter table public.document_permissions enable row level security;

drop policy if exists "doc_folders_select" on public.doc_folders;
create policy "doc_folders_select" on public.doc_folders for select using (
  public.same_org(org_id) and public.has_documents_suite()
);
drop policy if exists "doc_folders_write" on public.doc_folders;
create policy "doc_folders_write" on public.doc_folders for all using (
  public.same_org(org_id) and public.is_documents_manager()
) with check (
  public.same_org(org_id) and public.is_documents_manager()
);

drop policy if exists "documents_select" on public.documents;
create policy "documents_select" on public.documents for select using (
  public.same_org(org_id) and (
    public.is_documents_manager() or created_by = auth.uid()
    or (visibility = 'org' and public.has_documents_suite())
    or (visibility = 'restricted' and public.has_document_grant(id))
  )
);
drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert" on public.documents for insert with check (
  public.same_org(org_id) and public.has_documents_suite() and created_by = auth.uid()
);
drop policy if exists "documents_update" on public.documents;
create policy "documents_update" on public.documents for update using (
  public.same_org(org_id) and (public.is_documents_manager() or created_by = auth.uid())
);
drop policy if exists "documents_delete" on public.documents;
create policy "documents_delete" on public.documents for delete using (
  public.same_org(org_id) and (public.is_documents_manager() or created_by = auth.uid())
);

drop policy if exists "document_versions_select" on public.document_versions;
create policy "document_versions_select" on public.document_versions for select using (
  public.same_org(org_id) and exists (
    select 1 from public.documents d where d.id = document_id and (
      public.is_documents_manager() or d.created_by = auth.uid()
      or (d.visibility = 'org' and public.has_documents_suite())
      or (d.visibility = 'restricted' and public.has_document_grant(d.id))
    )
  )
);
drop policy if exists "document_versions_insert" on public.document_versions;
create policy "document_versions_insert" on public.document_versions for insert with check (
  public.same_org(org_id) and exists (
    select 1 from public.documents d where d.id = document_id and (public.is_documents_manager() or d.created_by = auth.uid())
  )
);

drop policy if exists "document_permissions_select" on public.document_permissions;
create policy "document_permissions_select" on public.document_permissions for select using (
  public.same_org(org_id) and (
    public.is_documents_manager() or user_id = auth.uid()
    or exists (select 1 from public.documents d where d.id = document_id and d.created_by = auth.uid())
  )
);
drop policy if exists "document_permissions_write" on public.document_permissions;
create policy "document_permissions_write" on public.document_permissions for all using (
  public.same_org(org_id) and (
    public.is_documents_manager()
    or exists (select 1 from public.documents d where d.id = document_id and d.created_by = auth.uid())
  )
) with check (
  public.same_org(org_id) and (
    public.is_documents_manager()
    or exists (select 1 from public.documents d where d.id = document_id and d.created_by = auth.uid())
  )
);

-- ---- storage bucket -----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('org-documents', 'org-documents', false, 52428800)  -- 50 MB cap
on conflict (id) do nothing;

drop policy if exists "org_documents_all" on storage.objects;
create policy "org_documents_all" on storage.objects
  for all to authenticated
  using  (bucket_id = 'org-documents')
  with check (bucket_id = 'org-documents');

-- ---- Phase 2 whitelist --------------------------------------------------------
create or replace function public.enforce_phase1_suite_scope() returns trigger
language plpgsql as $$
declare
  safe_suites text[] := array['hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm', 'attendance', 'benefits', 'it-assets', 'procurement', 'inventory', 'finance', 'projects', 'documents'];
begin
  if new.org_id <> '00000000-0000-0000-0000-000000000001' then
    select coalesce(jsonb_agg(g), '[]'::jsonb) into new.suites
    from jsonb_array_elements(new.suites) g
    where g->>'key' = any(safe_suites);
  end if;
  return new;
end;
$$;
