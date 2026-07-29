-- ============================================================================
-- Trade docs — quotations. Run after trade_docs_custody.sql. Idempotent.
--
-- A quote is priced paperwork BEFORE the sale: same party/items/VAT shape as
-- an invoice, its own QUO numbering, and one honest lifecycle — when the
-- customer says yes, "Convert to invoice" copies it into a fresh invoice and
-- retires the quote with a note pointing at it (client-side, both steps
-- through the existing paths). Statuses reuse the existing set: draft/issued
-- while open, 'void' once converted or dead.
-- ============================================================================
alter table public.trade_doc_counters drop constraint if exists trade_doc_counters_doc_type_check;
alter table public.trade_doc_counters add constraint trade_doc_counters_doc_type_check
  check (doc_type in ('invoice','receipt','grn','srp','handover','return_note','quote'));

alter table public.trade_documents drop constraint if exists trade_documents_doc_type_check;
alter table public.trade_documents add constraint trade_documents_doc_type_check
  check (doc_type in ('invoice','receipt','grn','srp','handover','return_note','quote'));

-- extend the create RPC's type gate + prefix (body otherwise identical to the
-- custody version: recreate with the quote branch added)
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_trade_document';
  if src is null then raise exception 'create_trade_document missing'; end if;
  src := replace(src,
    $q$('invoice','receipt','grn','srp','handover','return_note')$q$,
    $q$('invoice','receipt','grn','srp','handover','return_note','quote')$q$);
  src := replace(src, $q$when 'return_note' then 'RTN'$q$, $q$when 'return_note' then 'RTN' when 'quote' then 'QUO'$q$);
  execute src;
end $$;
