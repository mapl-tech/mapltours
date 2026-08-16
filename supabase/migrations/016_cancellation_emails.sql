-- Cancellation email dispatch tracking.
--
-- Mirrors confirmation_email_sent_at / operator_email_sent_at from 005: each
-- column is CLAIMED with a conditional update before the send, so a retried
-- Stripe webhook (charge.refunded redelivers on 5xx) cannot email the
-- traveler twice about the same cancellation.
alter table public.bookings
  add column if not exists cancellation_email_sent_at     timestamptz,
  add column if not exists ops_cancellation_email_sent_at timestamptz;
