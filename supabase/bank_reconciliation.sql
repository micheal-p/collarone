-- ============================================================================
-- Finance — bank statement import + reconciliation. Run after finance.sql.
-- Idempotent.
--
-- The feature that makes Finance real: import the bank's own CSV, match every
-- line against what the workspace already knows — customer payments
-- (trade_doc_payments), approved expenses, payroll runs — and see exactly
-- what's matched, what's unexplained, and what the books are missing.
--
-- Matching itself happens in the client (suggestions the manager CONFIRMS —
-- reconciliation is a judgment call, never silent automation); this table
-- stores the imported lines and the confirmed verdicts.
-- ============================================================================
create table if not exists public.bank_statement_lines (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  import_batch uuid not null,                      -- one upload = one batch
  line_date    date not null,
  description  text not null default '',
  reference    text not null default '',
  amount       numeric not null,                   -- signed: +credit (money in), -debit (money out)
  matched_kind text check (matched_kind in ('invoice_payment','expense','payroll_run','manual','ignored')),
  matched_id   uuid,                               -- row id in the matched table (null for manual/ignored)
  matched_note text not null default '',
  matched_by   uuid references public.profiles(id),
  matched_at   timestamptz,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index if not exists bank_lines_org_idx on public.bank_statement_lines (org_id, line_date desc);
create index if not exists bank_lines_batch_idx on public.bank_statement_lines (import_batch);

alter table public.bank_statement_lines enable row level security;
drop policy if exists bank_lines_select on public.bank_statement_lines;
create policy bank_lines_select on public.bank_statement_lines
  for select using (public.same_org(org_id) and public.is_finance_manager());
drop policy if exists bank_lines_write on public.bank_statement_lines;
create policy bank_lines_write on public.bank_statement_lines
  for all using (public.same_org(org_id) and public.is_finance_manager())
  with check (public.same_org(org_id) and public.is_finance_manager());
