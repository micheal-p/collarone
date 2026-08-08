-- Accept the payment that actually arrives.
--
-- record_trade_doc_payment refused anything that took amount_paid above the
-- invoice total, to the naira. In Nigeria that is the wrong rule: transfers
-- routinely land a little over or under because the sending bank's charge is
-- added or deducted at the far end, and customers round up. A ₦1,000,000
-- invoice paid as ₦1,000,050 was rejected outright, so the staff member either
-- recorded a false figure to make it fit, or gave up and left the invoice
-- showing unpaid. Both are worse than banking the money.
--
-- The rule now: accept a small overpayment, cap the recorded credit at the
-- outstanding balance so the ledger cannot claim more was owed than was, and
-- keep refusing anything that is a genuine mistake rather than a rounding.
--
-- 1% or ₦1,000, whichever is larger — big enough for bank charges and rounding
-- on any realistic invoice, small enough that a duplicate payment or a
-- misplaced decimal is still caught and questioned.

create or replace function public.record_trade_doc_payment(
  p_doc_id uuid, p_amount numeric, p_method text default 'transfer',
  p_reference text default '', p_note text default '', p_paid_at timestamptz default now()
) returns public.trade_documents language plpgsql security definer set search_path = public as $$
declare
  doc public.trade_documents;
  outstanding numeric;
  tolerance numeric;
  credited numeric;
begin
  if not public.has_trade_docs_suite() then raise exception 'Not authorised'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be above zero'; end if;
  if p_method not in ('transfer','cash','card','other') then raise exception 'Invalid payment method'; end if;

  select * into doc from public.trade_documents where id = p_doc_id;
  if doc.id is null or doc.org_id <> public.my_org_id() then raise exception 'Document not found'; end if;
  if doc.doc_type <> 'invoice' then raise exception 'Payments are recorded against invoices'; end if;
  if doc.status = 'void' then raise exception 'This invoice is void'; end if;

  outstanding := doc.total - doc.amount_paid;
  if outstanding <= 0 then
    raise exception 'This invoice is already fully paid.';
  end if;
  tolerance := greatest(1000, round(doc.total * 0.01, 2));

  if p_amount > outstanding + tolerance then
    raise exception 'That is % more than the % still owed. Check the amount — if the customer really overpaid, record the outstanding balance and handle the surplus separately.',
      to_char(p_amount - outstanding, 'FM999,999,999.00'),
      to_char(outstanding, 'FM999,999,999.00');
  end if;

  -- Bank what arrived, but never credit more than was owed: an invoice cannot
  -- be 101% paid, and letting amount_paid exceed total quietly breaks every
  -- outstanding-balance sum built on it.
  credited := least(p_amount, outstanding);

  insert into public.trade_doc_payments (org_id, doc_id, amount, method, reference, note, paid_at, recorded_by)
  values (doc.org_id, doc.id, credited, p_method,
          coalesce(trim(p_reference),''),
          -- The surplus is recorded in words rather than silently dropped, so
          -- whoever reconciles the bank statement can see why the two differ.
          trim(coalesce(trim(p_note),'') ||
            case when p_amount > credited
                 then ' (received ' || to_char(p_amount, 'FM999,999,999.00')
                      || ', ' || to_char(p_amount - credited, 'FM999,999,999.00') || ' over)'
                 else '' end),
          coalesce(p_paid_at, now()), auth.uid());

  update public.trade_documents set
    amount_paid = amount_paid + credited,
    status = case when amount_paid + credited >= total then 'paid' else 'part_paid' end
  where id = doc.id
  returning * into doc;

  return doc;
end;
$$;
grant execute on function public.record_trade_doc_payment(uuid, numeric, text, text, text, timestamptz) to authenticated;
