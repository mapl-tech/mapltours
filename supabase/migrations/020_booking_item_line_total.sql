-- ============================================
-- booking_items.line_total
-- ============================================
-- Receipts render a line as `price_per_person × travelers`. That figure is
-- rounded to cents at write time, so an indivisible party price no longer
-- multiplies back to what was charged: a $103 tour split three ways stores
-- $34.33, which renders as $102.99 beside a $103.00 total on the same email.
--
-- Storing the authoritative line total removes the arithmetic entirely.
-- Additive and nullable on purpose: existing rows keep working, and every
-- reader falls back to the old computation when the column is null, so the
-- code is safe to deploy whether or not this has run yet.

alter table public.booking_items
  add column if not exists line_total numeric(10, 2);

comment on column public.booking_items.line_total is
  'Exact amount charged for this line. Authoritative for receipts; price_per_person is a display-only per-head derivation that may round.';
