-- Private buckets: stop scoping reads by COMPANY alone.
--
-- storage_tenant_isolation.sql (2026-08-05) fixed the cross-tenant leak by
-- prefixing every object with its org id and checking that prefix. That was
-- right, and it stays. What it does not do is ask whether THIS employee should
-- see THIS file — so within a company everything was readable by everyone: a
-- warning letter about a colleague, someone else's disciplinary attachment, a
-- candidate's CV, a filed invoice. The Documents suite is sold on "control who
-- sees what", which made this the module's central promise and its central
-- hole.
--
-- Reads now go through /api/doc-download, which looks each file up in its
-- owning table USING THE CALLER'S OWN SESSION. If the row-level policy on
-- hr_letters, employee_documents, documents, candidates, task_reports or
-- expenses does not show them the row, they do not get the file. Those
-- policies already encode the real rules, so this adds no second rulebook to
-- drift out of sync.
--
-- ORDER MATTERS. Apply this only AFTER the client that calls /api/doc-download
-- is live, otherwise every download breaks in the gap between deploys.
-- (Client shipped first, deliberately.)
--
-- Uploads are untouched: they still go direct from the browser, still
-- org-prefixed, still blocked for support sessions. Only SELECT changes.

do $$
declare
  b text;
  buckets text[] := array[
    'org-documents', 'employee-documents', 'hr-letters',
    'finance-receipts', 'task-attachments', 'candidate-resumes'
  ];
  p text;
begin
  foreach b in array buckets loop
    p := replace(b, '-', '_');
    -- Drop the org-wide read. The service role bypasses RLS entirely, so
    -- /api/doc-download can still mint signed URLs after it has checked
    -- entitlement; nothing else can read these objects any more.
    execute format('drop policy if exists %I on storage.objects', p || '_read');
  end loop;
end $$;

-- Deliberately NO replacement select policy for `authenticated`.
-- RLS with no matching policy denies, which is exactly the intent: the only
-- read path is the authorised route. If a future bucket needs direct client
-- reads, give it its own narrow policy rather than restoring an org-wide one.
