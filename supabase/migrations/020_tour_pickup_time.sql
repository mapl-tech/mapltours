-- When the guest wants collecting.
--
-- Tours previously captured a DATE only, and the confirmation told the guest
-- "your guide will reach out 24-48 hours before to confirm your pickup time".
-- That is a phone call per booking, and a guest who wanted an early start had
-- no way to say so before paying.
--
-- Stored on the booking rather than per item because every experience in a
-- checkout runs on one day and starts with one pickup.
--
-- Deliberately NOT wired into lib/booking-window.ts. Tours assume a midnight
-- Jamaica start there, and that assumption feeds earliestServiceStart(), which
-- the refund gate uses to decide when a trip counts as delivered. Feeding a
-- real 08:00 pickup into it would move that boundary and quietly shorten the
-- window in which a guest may cancel. This column is dispatch information; the
-- refund window stays where it is.

alter table public.bookings
  add column if not exists pickup_time text;

comment on column public.bookings.pickup_time is
  'Requested start time as HH:MM, Jamaica local. Dispatch only; does not affect the refund window.';

-- Recreate the health view from 011 verbatim, plus has_pickup_time, so the
-- checkout route can gate the optional write the same way it gates attribution.
create or replace view public.bookings_schema_health as
select
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'bookings' and column_name = 'booking_type'
  ) as has_booking_type,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'bookings' and column_name = 'cart_hash'
  ) as has_cart_hash,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'booking_items' and column_name = 'item_type'
  ) as has_item_type,
  exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'bookings_pending_session_unique'
  ) as has_unique_pending_index,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'bookings' and column_name = 'attribution'
  ) as has_attribution,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'bookings' and column_name = 'pickup_time'
  ) as has_pickup_time;

revoke all on public.bookings_schema_health from anon, authenticated;
grant  select on public.bookings_schema_health to service_role;
