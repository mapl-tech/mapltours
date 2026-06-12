-- MAPL Tours — pending prod migrations (idempotent, safe to re-run).
-- Fixes: checkout 503 (missing migration 007 schema) + comment replies (002).
-- Paste this whole file into Supabase Dashboard → SQL Editor → Run.

-- ======================================================
-- 002_comment_replies.sql
-- ======================================================
-- Add reply support to comments
-- parent_id references another comment (null = top-level comment)
-- Idempotent — safe to re-run.
alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

-- Index for fast reply lookups
create index if not exists idx_comments_parent_id on public.comments(parent_id);

-- ======================================================
-- 005_bookings_payment_flow.sql
-- ======================================================
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

-- ======================================================
-- 006_airport_transfers.sql
-- ======================================================
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

-- ======================================================
-- 007_bookings_atomic_idempotency.sql
-- ======================================================
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

