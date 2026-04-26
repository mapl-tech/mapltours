-- ============================================
-- Bookings · atomic idempotency
-- ============================================
-- Adversarial-review fix: the prior `select-then-insert` pattern in
-- /api/checkout and /api/transfers/checkout could race two concurrent
-- requests with the same cart_hash and produce two pending booking rows.
--
-- This migration installs a unique partial index over
-- (cart_hash, booking_type) WHERE status = 'pending' so concurrent inserts
-- collide deterministically and the API can fall through to its
-- conflict-handling branch (refresh mutable fields + reuse PI).
--
-- It also cleans up any pre-existing duplicate pending rows that would
-- block the new index. Safe to re-run.

-- 1. Cancel stale or duplicate pending bookings so the index can be built.
--    Anything older than 1 hour is treated as abandoned.
update public.bookings
   set status = 'canceled'
 where status = 'pending'
   and created_at < (now() - interval '1 hour');

-- 2. Within remaining pendings, keep only the newest row per
--    (cart_hash, booking_type). De-duplicate older siblings to 'canceled'.
with ranked as (
  select id,
         row_number() over (
           partition by cart_hash, booking_type
           order by created_at desc
         ) as rn
    from public.bookings
   where status = 'pending'
     and cart_hash is not null
)
update public.bookings b
   set status = 'canceled'
  from ranked r
 where b.id = r.id and r.rn > 1;

-- 3. Drop the old non-unique index and replace it with a unique partial.
drop index if exists public.bookings_cart_hash_pending_idx;

create unique index if not exists bookings_pending_session_unique
  on public.bookings (cart_hash, booking_type)
  where status = 'pending' and cart_hash is not null;

-- 4. Schema-version sentinel — a tiny readable view the API can query as a
--    health check before insert. If this view returns 0 rows, the deployer
--    forgot one of the migrations and the route will short-circuit with a
--    clear error rather than a generic 500.
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
  ) as has_unique_pending_index;

-- Service role can read the view; anon cannot.
revoke all on public.bookings_schema_health from anon, authenticated;
grant  select on public.bookings_schema_health to service_role;
