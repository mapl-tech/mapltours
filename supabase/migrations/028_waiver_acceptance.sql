-- Durable proof the guest accepted the liability waiver.
--
-- The checkout form has always required ticking the waiver box, but the tick
-- lived only in client state: nothing reached the server and nothing was
-- stored. For cliff jumping and water tours that meant no durable evidence
-- any guest ever accepted the release. The tour checkout now refuses a
-- booking whose request does not carry the acceptance, and stamps the moment
-- here when the schema supports it (same optional-write contract as
-- attribution and pickup_time, so a deploy that lands before this migration
-- degrades to the old behaviour instead of 500ing checkouts).
--
-- Transfers deliberately have no waiver: riding in a car is not an activity
-- release, and the transfers checkout sends no such field.

alter table public.bookings
  add column if not exists waiver_accepted_at timestamptz;

comment on column public.bookings.waiver_accepted_at is
  'When the guest accepted the liability waiver at checkout. Tours only; null for transfers and for bookings that predate migration 028.';

-- Recreate the health view from 023 verbatim, plus has_waiver, so the
-- checkout route can gate the optional write the same way it gates
-- attribution and pickup_time.
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
  ) as has_pickup_time,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'bookings' and column_name = 'waiver_accepted_at'
  ) as has_waiver;

revoke all on public.bookings_schema_health from anon, authenticated;
grant  select on public.bookings_schema_health to service_role;
