-- Payment intents: the record that a given Paystack reference belongs to a
-- given invoice, written BEFORE the customer is sent to checkout.
--
-- Why this exists. invoice-pay.js `verify` used to accept any reference from
-- the request body, confirm it with Paystack, and credit it to whichever
-- invoice the caller named. Paystack only ever answers "yes, that is a real
-- successful charge on this merchant's account" — it cannot know which invoice
-- the caller had in mind. Combined with idempotency that was scoped per
-- invoice, one genuine reference could be replayed across every other invoice
-- from the same merchant, marking each one paid. This table is the missing
-- fact: reference -> invoice, recorded by us, at the moment we created the
-- transaction.
--
-- It also solves webhook routing. Invoice money settles into the MERCHANT's
-- own Paystack account, so their webhook is signed with THEIR secret, not
-- Collarone's. To pick the right secret we must first know which org a
-- reference belongs to — and that is exactly what this table stores.
--
-- Service-role only: it is written by the public payment endpoint and read by
-- the webhook. No tenant ever queries it directly, so it carries no policies
-- for authenticated users at all.

create table if not exists public.trade_doc_payment_intents (
  reference   text primary key,
  doc_id      uuid not null references public.trade_documents(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  amount      numeric not null,
  created_at  timestamptz not null default now(),
  settled_at  timestamptz
);

create index if not exists trade_doc_payment_intents_doc_idx
  on public.trade_doc_payment_intents (doc_id);

alter table public.trade_doc_payment_intents enable row level security;
-- No permissive policy on purpose. RLS with zero policies denies every
-- authenticated request; the service role bypasses RLS and is the only caller.
revoke all on public.trade_doc_payment_intents from anon, authenticated;

comment on table public.trade_doc_payment_intents is
  'Maps a Paystack reference to the invoice it was created for. Written at checkout-init, read at verify and by the merchant webhook. Prevents a reference being credited to an invoice it was not raised against.';
