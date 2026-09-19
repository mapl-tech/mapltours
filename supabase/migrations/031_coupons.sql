-- Coupons: a price reduction on tours.
--
-- A coupon is NOT tender. Unlike a gift card it carries no balance and no
-- refundable share: the guest simply owes less, bookings.total_paid stays
-- equal to what Stripe captures, and every refund, cash-flow and email reader
-- keeps working unchanged. The discount is recorded on the booking for the
-- receipt and the admin.
--
-- Use counting happens when the booking is PAID (the webhook), with a
-- compare-and-swap on `uses`, exactly like the video reward. Nothing is
-- reserved on a pending booking, so an abandoned checkout never locks a code.

create table if not exists public.coupons (
  id          uuid primary key default gen_random_uuid(),
  -- Stored normalized and uppercase: MAPL-XXXX-XXXX from the issuer, or a
  -- word code an admin chose (letters and digits only).
  code        text not null unique,
  kind        text not null check (kind in ('percent', 'fixed')),
  -- percent: whole percent off (5 = 5%). fixed: dollars off.
  value       numeric(10, 2) not null check (value > 0),
  -- Tours only for now; the column exists so transfers can join later
  -- without a schema change.
  applies_to  text not null default 'tour' check (applies_to in ('tour', 'transfer', 'both')),
  -- When set, only this (lowercased) address may redeem the code.
  email       text,
  max_uses    integer not null default 1 check (max_uses > 0),
  uses        integer not null default 0 check (uses >= 0),
  -- Smallest cart total (dollars, after the reward) the code applies to.
  min_total   numeric(10, 2),
  starts_at   timestamptz not null default now(),
  expires_at  timestamptz,
  status      text not null default 'active' check (status in ('active', 'paused', 'void')),
  -- Where it came from: 'bio' (the landing page), 'admin', ...
  source      text,
  note        text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists coupons_email_idx  on public.coupons (email);
create index if not exists coupons_status_idx on public.coupons (status, created_at desc);

-- One row per paid booking that carried a coupon. The admin reads it; the
-- webhook writes it once (the unique index below makes a redelivery a no-op).
create table if not exists public.coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references public.coupons (id) on delete cascade,
  booking_id  uuid references public.bookings (id) on delete set null,
  email       text,
  amount      numeric(10, 2) not null check (amount >= 0),
  created_at  timestamptz not null default now()
);

create unique index if not exists coupon_redemptions_one_per_booking
  on public.coupon_redemptions (booking_id) where booking_id is not null;
create index if not exists coupon_redemptions_coupon_idx
  on public.coupon_redemptions (coupon_id, created_at desc);

-- On the booking, for the receipt, the confirm page and the admin.
alter table public.bookings add column if not exists coupon_code text;
alter table public.bookings add column if not exists coupon_discount numeric(10, 2) not null default 0;

comment on column public.bookings.coupon_code is
  'Normalized coupon code applied at checkout, or null. total_paid is already net of coupon_discount.';
comment on column public.bookings.coupon_discount is
  'Dollars taken off by the coupon. Informational: total_paid is net of it.';

-- Service role only. Codes are read and written by the checkout, the issuer
-- endpoint and the admin, never by a browser session.
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
revoke all on public.coupons from anon, authenticated;
revoke all on public.coupon_redemptions from anon, authenticated;

-- Recreate the health view with every flag the routes may gate on, so a
-- deploy that lands before this migration skips the coupon write instead of
-- failing the checkout (same contract as attribution and pickup_time).
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
  ) as has_waiver,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'bookings' and column_name = 'coupon_code'
  ) as has_coupon;

revoke all on public.bookings_schema_health from anon, authenticated;
grant  select on public.bookings_schema_health to service_role;
