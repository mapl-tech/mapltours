-- Adversarial-review fix for migration 010: the attribution column must be
-- visible to the checkout schema guard, so the routes can GATE the optional
-- attribution write on it instead of 500ing when code deploys ahead of the
-- migration (or the column is rolled back). Recreates the health view from
-- 007 verbatim plus has_attribution.
create or replace view public.bookings_schema_health as
select
  exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'bookings'
       and column_name  = 'booking_type'
  ) as has_booking_type,
  exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'bookings'
       and column_name  = 'cart_hash'
  ) as has_cart_hash,
  exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'booking_items'
       and column_name  = 'item_type'
  ) as has_item_type,
  exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and indexname  = 'bookings_pending_session_unique'
  ) as has_unique_pending_index,
  exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'bookings'
       and column_name  = 'attribution'
  ) as has_attribution;

-- Service role can read the view; anon cannot.
revoke all on public.bookings_schema_health from anon, authenticated;
grant  select on public.bookings_schema_health to service_role;
