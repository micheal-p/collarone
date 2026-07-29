-- ============================================================================
-- Recurring invoices. Run after trade_documents.sql. Idempotent.
--
-- Rent, retainers, school fees — half of SMB billing is the same invoice
-- every cycle, typed by hand. An invoice marked recurring re-raises itself
-- as a DRAFT each period; the owner gets a banner + feed event and sends it
-- after a glance (deliberate: auto-drafting is safe, auto-SENDING a stale
-- price is not — v1 keeps a human on the send button). Pairs with the
-- existing overdue_invoice_reminder automation: raises itself, chases itself.
--
--   recur_every       'monthly' | 'yearly' on the SOURCE invoice
--   recur_until       optional stop date
--   recur_last_period idempotency stamp ('YYYY-MM' / 'YYYY') on the source —
--                     however often the generator runs, one copy per period
--   recur_source_id   on generated copies, points at the source
--
-- generate_recurring_invoices() is SERVICE-ROLE ONLY (called by the cron
-- path); it mints doc numbers via trade_doc_counters directly since the
-- interactive create RPC needs an auth context.
-- ============================================================================
alter table public.trade_documents add column if not exists recur_every text check (recur_every in ('monthly','yearly'));
alter table public.trade_documents add column if not exists recur_until date;
alter table public.trade_documents add column if not exists recur_last_period text;
alter table public.trade_documents add column if not exists recur_source_id uuid references public.trade_documents(id) on delete set null;
create index if not exists trade_documents_recur_idx on public.trade_documents (org_id) where recur_every is not null;

create or replace function public.generate_recurring_invoices()
returns table (org_id uuid, doc_no text, source_doc_no text)
language plpgsql security definer set search_path = public as $$
declare
  src record;
  v_period text;
  v_day int;
  v_seq bigint;
  v_doc_no text;
  v_due date;
begin
  for src in
    select * from public.trade_documents d
    where d.doc_type = 'invoice' and d.recur_every is not null and d.status <> 'void'
      and (d.recur_until is null or d.recur_until >= current_date)
      and d.recur_source_id is null              -- only sources generate, never copies
  loop
    v_period := case src.recur_every when 'monthly' then to_char(current_date, 'YYYY-MM') else to_char(current_date, 'YYYY') end;

    -- not yet due this period? (same day-of-month as the source, clamped to
    -- short months; yearly also matches the source month)
    v_day := least(extract(day from src.created_at)::int,
                   extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))::int);
    if extract(day from current_date)::int < v_day then continue; end if;
    if src.recur_every = 'yearly' and extract(month from current_date) <> extract(month from src.created_at) then continue; end if;

    -- already generated for this period (or the source itself was created this period)?
    if src.recur_last_period is not null and src.recur_last_period >= v_period then continue; end if;
    if (case src.recur_every when 'monthly' then to_char(src.created_at, 'YYYY-MM') else to_char(src.created_at, 'YYYY') end) >= v_period then continue; end if;

    insert into public.trade_doc_counters (org_id, doc_type, next_no) values (src.org_id, 'invoice', 2)
    on conflict (org_id, doc_type) do update set next_no = public.trade_doc_counters.next_no + 1
    returning next_no - 1 into v_seq;
    v_doc_no := 'INV-' || lpad(v_seq::text, 6, '0');

    v_due := case when src.due_date is not null and src.due_date >= src.created_at::date
                  then current_date + (src.due_date - src.created_at::date)
                  else current_date + 14 end;

    insert into public.trade_documents (
      org_id, doc_type, doc_no, party_name, party_phone, party_email, party_address,
      contact_id, items, subtotal, vat_rate, vat_amount, total, status, due_date,
      reference, notes, created_by, recur_source_id
    ) values (
      src.org_id, 'invoice', v_doc_no, src.party_name, src.party_phone, src.party_email, src.party_address,
      src.contact_id, src.items, src.subtotal, src.vat_rate, src.vat_amount, src.total, 'draft', v_due,
      src.reference, src.notes, src.created_by, src.id
    );

    update public.trade_documents set recur_last_period = v_period where id = src.id;

    insert into public.org_notices (org_id, kind, message) values (
      src.org_id, 'automation',
      'Recurring invoice ready: ' || v_doc_no || ' for ' || coalesce(nullif(src.party_name, ''), 'your customer')
      || ' (from ' || src.doc_no || '). Review it in Invoicing and send.'
    );
    insert into public.org_events (org_id, type, payload) values (
      src.org_id, 'invoice.recurring_generated',
      jsonb_build_object('docNo', v_doc_no, 'sourceDocNo', src.doc_no, 'party', src.party_name, 'total', src.total)
    );

    org_id := src.org_id; doc_no := v_doc_no; source_doc_no := src.doc_no;
    return next;
  end loop;
end;
$$;
revoke execute on function public.generate_recurring_invoices() from anon, authenticated, public;
