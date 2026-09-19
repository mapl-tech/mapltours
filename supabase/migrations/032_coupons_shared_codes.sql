-- Coupons, round two: one shared code for everyone.
--
-- 031 modelled a coupon as a personal, single-use code issued to one address.
-- JAMAICA5 is the other shape: one public word code, unlimited overall, one
-- use per email address, valid on tours AND airport rides. Two columns move:
--
--   max_uses        NULL now means "no overall limit". The CHECK already let
--                   NULL through; only the NOT NULL stood in the way.
--   uses_per_email  NEW. When set, a guest may redeem the code this many
--                   times, counted from coupon_redemptions by lowercased
--                   email. NULL means no per-address limit.
--
-- The redemption ledger's email is normalised (lowercased, trimmed) so the
-- per-address count can be an equality, and indexed for it.

alter table public.coupons alter column max_uses drop not null;
alter table public.coupons alter column max_uses drop default;
alter table public.coupons drop constraint if exists coupons_max_uses_check;
alter table public.coupons add constraint coupons_max_uses_check check (max_uses is null or max_uses > 0);

alter table public.coupons add column if not exists uses_per_email integer
  check (uses_per_email is null or uses_per_email > 0);

comment on column public.coupons.max_uses is 'Overall redemption limit. NULL = unlimited.';
comment on column public.coupons.uses_per_email is 'Redemptions allowed per (lowercased) email address. NULL = unlimited per address.';

update public.coupon_redemptions set email = lower(trim(email)) where email is not null and email <> lower(trim(email));
create index if not exists coupon_redemptions_coupon_email_idx
  on public.coupon_redemptions (coupon_id, email);

-- The health view gains a flag for the shared-code columns. The routes do not
-- gate on it (a deploy that lands before this migration answers a typed code
-- with a 503 from the column-missing error, which the page shows as "codes
-- cannot be checked right now"); it is there so an operator can see at a
-- glance whether 032 has run, per the migrations-drift rule.
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
  ) as has_coupon,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'coupons' and column_name = 'uses_per_email'
  ) as has_shared_coupons;

revoke all on public.bookings_schema_health from anon, authenticated;
grant  select on public.bookings_schema_health to service_role;
