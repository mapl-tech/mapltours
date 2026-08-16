-- Refunds: what we actually sent back, and what we kept.
--
-- `status` already allows 'refunded' (005), but nothing recorded the amounts,
-- so a refunded row could not be reconciled against Stripe after the fact.
-- These three columns make each refund self-describing:
--
--   refund_amount  what the customer received
--   admin_charge   what we retained (20% of total_paid at time of cancel)
--   refunded_at    when the Stripe refund was created
--
-- Storing admin_charge rather than recomputing it means a later change to the
-- rate can never retroactively rewrite the history of past refunds.
--
-- Additive and nullable; existing rows and the payment path are untouched.
alter table public.bookings
  add column if not exists refund_amount numeric(10, 2),
  add column if not exists admin_charge  numeric(10, 2),
  add column if not exists refunded_at   timestamptz;
