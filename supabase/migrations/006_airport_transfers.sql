-- ============================================
-- Airport transfers · own checkout flow
-- ============================================
-- Transfers share the bookings table with tour bookings but are tagged
-- with booking_type='transfer' (bookings row) and item_type='transfer'
-- (booking_items row). One Stripe PaymentIntent ↔ one bookings row still
-- holds; the webhook dispatches a different email template based on type.
-- Safe to re-run.

-- 1. Tag bookings with their type so the webhook can pick the right email.
alter table public.bookings
  add column if not exists booking_type text not null default 'tour'
    check (booking_type in ('tour', 'transfer'));

create index if not exists bookings_booking_type_idx
  on public.bookings (booking_type);

-- 2. Line items get a kind and transfer-specific columns. Experience bookings
--    leave all the transfer_* columns NULL; transfer bookings leave
--    experience_id NULL.
alter table public.booking_items
  alter column experience_id drop not null;

alter table public.booking_items
  add column if not exists item_type text not null default 'experience'
    check (item_type in ('experience', 'transfer')),
  add column if not exists airport text,
  add column if not exists hotel text,
  add column if not exists zone text,
  add column if not exists trip_type text
    check (trip_type is null or trip_type in ('one_way', 'round_trip')),
  add column if not exists arrival_flight text,
  add column if not exists arrival_at timestamptz,
  add column if not exists departure_flight text,
  add column if not exists departure_at timestamptz,
  add column if not exists passengers int;

create index if not exists booking_items_item_type_idx
  on public.booking_items (item_type);
