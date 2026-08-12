-- 008 — Abandoned-cart recovery
--
-- A "pending" booking whose PaymentIntent never succeeded is an abandoned
-- cart: the customer started checkout (which created the row + line items)
-- but never paid. We recover them with a single branded email.
--
-- These columns track that outreach so it fires exactly once per booking,
-- the same idempotency shape the webhook uses for confirmation email
-- (claim-before-send on a NULL timestamp). Purely additive and nullable —
-- no existing column, index, policy, or the money/webhook path is touched.

alter table public.bookings
  add column if not exists recovery_email_sent_at timestamptz,
  add column if not exists recovery_email_count int not null default 0;

-- Find abandoned carts fast: pending rows, newest first.
create index if not exists bookings_pending_recovery_idx
  on public.bookings (created_at)
  where status = 'pending';
