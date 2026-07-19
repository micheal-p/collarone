-- Self-serve Paystack payment of Collarone's own fees. Idempotent.
alter table public.billing_transactions add column if not exists paystack_ref text not null default '';
