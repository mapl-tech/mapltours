-- Refunds are REQUESTED by the traveler and APPROVED by an admin before any
-- money moves. Nothing in the customer-facing flow calls Stripe any more.
--
-- Lifecycle, held in refund_state:
--
--   none      no request outstanding (default)
--   requested traveler asked to cancel; booking.status is still 'paid'
--   approved  admin approved; Stripe refunded; booking.status flips 'refunded'
--   declined  admin refused; booking stays 'paid' and usable
--
-- The quoted amounts are captured AT REQUEST TIME on purpose. Approval can
-- happen hours later, by then the 48-hour window may well have closed, and
-- re-quoting then would deny every request that was valid when it was made.
-- The traveler is owed what they were quoted when they asked.
alter table public.bookings
  add column if not exists refund_state text not null default 'none'
    check (refund_state in ('none', 'requested', 'approved', 'declined')),
  add column if not exists refund_requested_at        timestamptz,
  add column if not exists refund_decided_at          timestamptz,
  add column if not exists refund_decided_by          uuid,
  add column if not exists refund_decline_reason      text,
  add column if not exists refund_quoted_amount       numeric(10, 2),
  add column if not exists refund_quoted_admin_charge numeric(10, 2);

-- The approval queue is "everything still awaiting a decision", so index for
-- that read rather than for the whole column.
create index if not exists bookings_refund_pending_idx
  on public.bookings (refund_requested_at desc)
  where refund_state = 'requested';
