-- ============================================================================
-- Storage was not tenant-isolated. Idempotent. CLOSE THE CROSS-TENANT HOLE.
--
-- Six private buckets were protected by bucket_id alone:
--   for all to authenticated using (bucket_id = 'X') with check (bucket_id = 'X')
-- Table RLS is a separate system from storage.objects, and storage.list()
-- returns paths without touching any table — so ANY authenticated user of ANY
-- tenant could list, download, overwrite and delete every other company's
-- private files: contracts, payslips, IDs, receipts, invoices, resumes.
--
-- The fix is the pattern the team already uses on org-logos and avatars: the
-- org id is the first path segment, and the policy refuses any object whose
-- first folder is not your org. Every uploader now prefixes ${orgId}/ (the
-- server invoice filer already did). Buckets are EMPTY, so there is nothing to
-- migrate — this is the cheapest this fix will ever be.
--
-- Reads are scoped by org. Writes are scoped by org AND blocked for support
-- (read-only) sessions, so a future support identity can look but not touch
-- files either. Anonymous resume upload (careers) stays bucket-only on INSERT,
-- because an applicant has no org identity; the org id is still put first in
-- the path so the hiring org's recruiters — and only them — can read it back.
-- ============================================================================

-- The original permissive policies were named by hand and do NOT follow the
-- bucket name (employee-documents was "employee_docs_all", task-attachments was
-- "task_attach_all", candidate-resumes was "resumes_all"). Drop them by their
-- real names — a generated name would miss them and leave the bucket open,
-- which the storage_tenant_scoped guard catches.
drop policy if exists "org_documents_all"    on storage.objects;
drop policy if exists "employee_docs_all"    on storage.objects;
drop policy if exists "hr_letters_all"       on storage.objects;
drop policy if exists "finance_receipts_all" on storage.objects;
drop policy if exists "task_attach_all"      on storage.objects;
drop policy if exists "resumes_all"          on storage.objects;

do $$
declare
  b text;
  buckets text[] := array[
    'org-documents', 'employee-documents', 'hr-letters',
    'finance-receipts', 'task-attachments', 'candidate-resumes'
  ];
  p text;      -- policy-name stem (hyphens are illegal in unquoted identifiers)
  scope text := '(storage.foldername(name))[1] = (public.my_org_id())::text';
begin
  foreach b in array buckets loop
    p := replace(b, '-', '_');

    -- drop the permissive ALL policy and any prior run of these
    execute format('drop policy if exists %I on storage.objects', p || '_all');
    execute format('drop policy if exists %I on storage.objects', p || '_read');
    execute format('drop policy if exists %I on storage.objects', p || '_insert');
    execute format('drop policy if exists %I on storage.objects', p || '_update');
    execute format('drop policy if exists %I on storage.objects', p || '_delete');

    -- READ: your org's files only. No support-session exclusion here — a
    -- read-only support view is allowed to see files, just not change them.
    execute format(
      'create policy %I on storage.objects for select to authenticated '
      || 'using (bucket_id = %L and %s)', p || '_read', b, scope);

    -- WRITE: your org, and never from a support (read-only) session.
    execute format(
      'create policy %I on storage.objects for insert to authenticated '
      || 'with check (bucket_id = %L and %s and not public.is_support_session())',
      p || '_insert', b, scope);
    execute format(
      'create policy %I on storage.objects for update to authenticated '
      || 'using (bucket_id = %L and %s and not public.is_support_session()) '
      || 'with check (bucket_id = %L and %s and not public.is_support_session())',
      p || '_update', b, scope, b, scope);
    execute format(
      'create policy %I on storage.objects for delete to authenticated '
      || 'using (bucket_id = %L and %s and not public.is_support_session())',
      p || '_delete', b, scope);
  end loop;
end $$;

-- Anonymous applicants keep the ability to upload a resume (they have no org
-- to scope by). Insert-only, no read/list for anon — unchanged. Recreated here
-- only so the intent is documented next to the rest.
drop policy if exists "resumes_anon_insert" on storage.objects;
create policy "resumes_anon_insert" on storage.objects
  for insert to anon
  with check (bucket_id = 'candidate-resumes');
