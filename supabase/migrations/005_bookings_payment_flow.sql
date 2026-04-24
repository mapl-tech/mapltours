-- ============================================
-- Bookings · Stripe PaymentIntent webhook flow
-- ============================================
-- Adds: status lifecycle, idempotency key, guest checkout, email dispatch tracking.
-- Safe to re-run (idempotent — uses IF NOT EXISTS / IF EXISTS).

-- 1. Allow guest checkouts. Bookings are initiated server-side from the Stripe
--    flow, and we don't require a Supabase auth session to pay.
alter table public.bookings
  alter column user_id drop not null;

-- 2. Lifecycle + financial + idempotency columns.
alter table public.bookings
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'canceled', 'refunded')),
  add column if not exists currency text not null default 'usd',
  add column if not exists subtotal numeric(10, 2),
  add column if not exists booking_fee numeric(10, 2),
  add column if not exists transport_cost numeric(10, 2),
  add column if not exists reward_discount numeric(10, 2) default 0,
  add column if not exists cart_hash text,
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists operator_email_sent_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists updated_at timestamptz default now();

-- 3. One PaymentIntent ↔ one booking. Webhook relies on this for idempotency.
create unique index if not exists bookings_stripe_payment_id_key
  on public.bookings (stripe_payment_id)
  where stripe_payment_id is not null;

-- 4. Reuse a pending booking for the same cart (e.g. user backs up then returns).
create index if not exists bookings_cart_hash_pending_idx
  on public.bookings (cart_hash)
  where status = 'pending';

-- 5. Service role bypasses RLS, so guest-inserted rows (user_id NULL) remain
--    unreachable from anon / authenticated clients. That's the desired shape.
--    Authenticated users still see only their own rows via the existing policy.

-- 6. keep updated_at fresh on any write
create or replace function public.touch_bookings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists bookings_touch_updated_at on public.bookings;
create trigger bookings_touch_updated_at
  before update on public.bookings
  for each row execute function public.touch_bookings_updated_at();
