-- The referral program (Nov 26 2026; NOT applied).
--
-- The owner, Nov 26 2026: "I want a referal program built. The admin can add
-- an email account that initiates and invitation; when the user signs in with
-- their gmail, they go to their referral page; on the ferral page they can
-- create there coupon code and create different coupons, max 7; the coupons
-- should give 5% off and give the referrer a certain amount", then "3% of
-- what guest pays", "mapltours.com/referrals", "make sure everything is
-- secure as well".
--
-- A referral code is a coupon (031, 032) with a referrer_id. Checkout prices
-- it as any coupon and the Stripe webhook counts it as any coupon (one
-- coupon_redemptions row per paid booking), so neither checkout route nor the
-- webhook changes. The trigger below turns that redemption row into a
-- referral earning in the same statement, recording the referrer's rate at
-- the moment the booking is paid: a later change of rate never reaches a
-- booking already paid. The commission itself (rate x what the guest paid,
-- never more than MAPL keeps) is worked out from the booking by
-- lib/referrals/rules commissionFor, and frozen into a payout item when paid.
--
--   referrers               one row per invited person; the address is the invitation
--   coupons.referrer_id     the codes they make (status active | paused | void)
--   referral_earnings       one row per paid booking that used a referral code
--   referral_payouts        one row per payment to one referrer by Wise
--   referral_payout_items   the earnings each payout covers; one live item per earning
--   referral_events         what happened, by whom, for the admin page
--
-- Bank details never reach this database: a referrer's account goes from the
-- page to Wise, and only the Wise recipient id, the holder's name and the last
-- four digits are kept.
--
-- Service role only: RLS on with no policies, every privilege revoked from
-- anon and authenticated, functions executable by service_role alone. The
-- referral routes check the signed-in address (lib/referrals/server) and the
-- admin routes the admins table before the service client is touched.
--
-- Written to apply twice safely, as every migration here.

create table if not exists public.referrers (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name                text not null check (char_length(btrim(name)) between 1 and 120),
  business            text null check (business is null or char_length(btrim(business)) between 1 and 120),
  status              text not null default 'invited' check (status in ('invited', 'active', 'paused', 'removed')),
  commission_percent  numeric(4, 2) not null default 3 check (commission_percent >= 0 and commission_percent <= 10),
  user_id             uuid null,
  invited_at          timestamptz not null default now(),
  invited_by          text null check (invited_by is null or char_length(invited_by) <= 254),
  invite_sent_at      timestamptz null,
  invite_sends        integer not null default 0 check (invite_sends >= 0),
  terms_version       text null check (terms_version is null or char_length(terms_version) <= 40),
  terms_accepted_at   timestamptz null,
  wise_recipient_id   bigint null check (wise_recipient_id is null or wise_recipient_id > 0),
  payout_holder       text null check (payout_holder is null or char_length(payout_holder) between 2 and 140),
  payout_last4        text null check (payout_last4 is null or payout_last4 ~ '^[0-9]{4}$'),
  payout_legal_type   text null check (payout_legal_type is null or payout_legal_type in ('PRIVATE', 'BUSINESS')),
  payout_added_at     timestamptz null,
  payout_hold_until   timestamptz null,
  note                text null check (note is null or char_length(note) <= 500),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  removed_at          timestamptz null,
  -- The payout account is whole or absent, never half saved.
  constraint referrers_payout_whole check (
    (wise_recipient_id is null and payout_holder is null and payout_last4 is null and payout_legal_type is null)
    or (wise_recipient_id is not null and payout_holder is not null and payout_last4 is not null and payout_legal_type is not null and payout_added_at is not null)
  )
);

comment on table public.referrers is 'Referral program: one row per invited referrer (lib/referrals). The address is the invitation. Service role only.';
comment on column public.referrers.commission_percent is 'Percent of what the guest paid, recorded on each earning when its booking is paid. Capped at MAPL''s margin in lib/referrals/rules commissionFor.';
comment on column public.referrers.wise_recipient_id is 'The referrer''s Wise US-dollar account as a recipient on MAPL''s Wise profile. Bank details live only in Wise.';
comment on column public.referrers.payout_hold_until is 'Payouts to a newly added or changed account wait until then (72 hours).';

-- One referrer per address that has not been removed: the address is the key to /referrals.
create unique index if not exists referrers_live_email_once on public.referrers (email) where status <> 'removed';
create index if not exists referrers_status_idx on public.referrers (status, created_at desc);

-- The codes: coupons with a referrer. referral_hold marks a code paused by
-- MAPL (with its referrer, or alone), which the referrer cannot resume.
alter table public.coupons add column if not exists referrer_id uuid null references public.referrers (id) on delete restrict;
alter table public.coupons add column if not exists referral_hold boolean not null default false;
alter table public.coupons add column if not exists retired_at timestamptz null;
create index if not exists coupons_referrer_idx on public.coupons (referrer_id, created_at desc) where referrer_id is not null;

comment on column public.coupons.referrer_id is 'A referral code (migration 045): the referrer it earns for. Checkout treats it as any other coupon.';

-- One row per paid booking that used a referral code, written by the trigger
-- on coupon_redemptions below. No foreign key to bookings, on purpose (as
-- driver_payout_items): the script that purges test bookings must not be
-- blocked, and an earning's history must not vanish with a booking.
create table if not exists public.referral_earnings (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null,
  referrer_id         uuid not null references public.referrers (id) on delete restrict,
  coupon_id           uuid not null references public.coupons (id) on delete restrict,
  code                text not null,
  commission_percent  numeric(4, 2) not null check (commission_percent >= 0 and commission_percent <= 10),
  -- Recorded by the payout run's check rather than at payment (the trigger could not), at the rate then.
  recorded_late       boolean not null default false,
  voided_at           timestamptz null,
  void_reason         text null check (void_reason is null or char_length(btrim(void_reason)) between 1 and 300),
  voided_by           text null,
  created_at          timestamptz not null default now(),
  constraint referral_earnings_void_whole check ((voided_at is null) = (void_reason is null))
);

comment on table public.referral_earnings is 'Referral program: one row per paid booking made with a referral code, with the rate recorded at payment. Service role only.';

create unique index if not exists referral_earnings_one_per_booking on public.referral_earnings (booking_id);
create index if not exists referral_earnings_referrer_idx on public.referral_earnings (referrer_id, created_at desc);

-- Payouts, the same shape and states as driver_payouts (038), so the Wise
-- webhook applies one state machine to both (lib/payouts/webhook).
create table if not exists public.referral_payouts (
  id                      uuid primary key default gen_random_uuid(),
  referrer_id             uuid not null references public.referrers (id) on delete restrict,
  payee                   text not null check (char_length(payee) between 1 and 200),
  recipient_id            bigint not null check (recipient_id > 0),
  -- The account it went to, as the referrer knows it (never more than the last four digits).
  account_last4           text not null check (account_last4 ~ '^[0-9]{4}$'),
  amount_usd              numeric(10, 2) not null check (amount_usd > 0),
  fee_usd                 numeric(10, 2) null,
  source_amount_usd       numeric(10, 2) null,
  status                  text not null check (status in ('claimed', 'created', 'funded', 'sent', 'failed', 'returned', 'needs_review')),
  customer_transaction_id uuid not null unique,
  wise_quote_id           text null,
  wise_transfer_id        bigint null unique,
  wise_state              text null,
  wise_state_at           timestamptz null,
  pay_day                 date not null,
  error                   text null,
  notified_at             timestamptz null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  funded_at               timestamptz null,
  sent_at                 timestamptz null,
  resolved_at             timestamptz null
);

comment on table public.referral_payouts is 'Referral program: one row per payment to one referrer by Wise (lib/referrals/payout-run). Service role only.';

create index if not exists referral_payouts_open_idx on public.referral_payouts (status) where status in ('claimed', 'created', 'needs_review', 'returned');
create index if not exists referral_payouts_referrer_idx on public.referral_payouts (referrer_id, created_at desc);

create table if not exists public.referral_payout_items (
  id          uuid primary key default gen_random_uuid(),
  payout_id   uuid not null references public.referral_payouts (id) on delete cascade,
  earning_id  uuid not null references public.referral_earnings (id) on delete restrict,
  booking_id  uuid not null,
  amount_usd  numeric(10, 2) not null check (amount_usd > 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.referral_payout_items is 'Referral program: the earnings each payout covers. An earning may be in only one active item, which is what makes paying it twice impossible.';

create unique index if not exists referral_payout_items_once on public.referral_payout_items (earning_id) where active;
create index if not exists referral_payout_items_payout_idx on public.referral_payout_items (payout_id);

create table if not exists public.referral_events (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid not null references public.referrers (id) on delete restrict,
  kind         text not null check (kind ~ '^[a-z_]{3,40}$'),
  detail       jsonb not null default '{}'::jsonb,
  actor        text null check (actor is null or char_length(actor) <= 254),
  created_at   timestamptz not null default now()
);

comment on table public.referral_events is 'Referral program: what happened to a referrer, their codes and their payout account, and who did it. Never bank details.';

create index if not exists referral_events_referrer_idx on public.referral_events (referrer_id, created_at desc);

alter table public.referrers enable row level security;
alter table public.referral_earnings enable row level security;
alter table public.referral_payouts enable row level security;
alter table public.referral_payout_items enable row level security;
alter table public.referral_events enable row level security;
revoke all on public.referrers from anon, authenticated;
revoke all on public.referral_earnings from anon, authenticated;
revoke all on public.referral_payouts from anon, authenticated;
revoke all on public.referral_payout_items from anon, authenticated;
revoke all on public.referral_events from anon, authenticated;

-- ── The earning, written when a referral code's booking is paid ──────────
--
-- consumeCoupon (lib/coupon-redemption) inserts one coupon_redemptions row
-- per paid booking, first, under a unique index, from the webhook and from
-- the gift-covered checkout paths. This trigger adds the earning in the same
-- statement. It must never fail that insert, or the coupon's use would go
-- uncounted: any error is caught, raised as a warning for the logs, and the
-- payout run's check (lib/referrals/payout-run) records the earning late.
create or replace function public.referral_earning_from_redemption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
  v_code     text;
  v_percent  numeric;
begin
  if new.booking_id is null then
    return new;
  end if;
  begin
    select c.referrer_id, c.code into v_referrer, v_code from public.coupons c where c.id = new.coupon_id;
    if v_referrer is null then
      return new;
    end if;
    select r.commission_percent into v_percent from public.referrers r where r.id = v_referrer;
    if v_percent is null then
      return new;
    end if;
    insert into public.referral_earnings (booking_id, referrer_id, coupon_id, code, commission_percent)
    values (new.booking_id, v_referrer, new.coupon_id, v_code, v_percent)
    on conflict (booking_id) do nothing;
  exception when others then
    raise warning 'referral earning not recorded for booking %: %', new.booking_id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.referral_earning_from_redemption() from public, anon, authenticated;

drop trigger if exists coupon_redemptions_referral_earning on public.coupon_redemptions;
create trigger coupon_redemptions_referral_earning
  after insert on public.coupon_redemptions
  for each row execute function public.referral_earning_from_redemption();

-- ── A referrer accepts the terms (their first sign-in) ──────────────────
create or replace function public.accept_referral_terms(
  p_referrer uuid,
  p_version  text,
  p_name     text,
  p_business text,
  p_user     uuid,
  p_actor    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.referrers%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_biz  text := nullif(btrim(coalesce(p_business, '')), '');
begin
  if p_version is null or char_length(p_version) not between 1 and 40 then
    return jsonb_build_object('result', 'bad_request');
  end if;
  if char_length(v_name) not between 1 and 120 or (v_biz is not null and char_length(v_biz) > 120) then
    return jsonb_build_object('result', 'bad_request');
  end if;
  select * into v_row from public.referrers where id = p_referrer for update;
  if not found or v_row.status = 'removed' then
    return jsonb_build_object('result', 'not_found');
  end if;
  update public.referrers
     set terms_version = p_version,
         terms_accepted_at = now(),
         name = v_name,
         business = v_biz,
         user_id = coalesce(p_user, user_id),
         status = case when status = 'invited' then 'active' else status end,
         updated_at = now()
   where id = p_referrer;
  insert into public.referral_events (referrer_id, kind, detail, actor)
  values (p_referrer, 'terms_accepted', jsonb_build_object('version', p_version), p_actor);
  return jsonb_build_object('result', 'accepted', 'status', case when v_row.status = 'invited' then 'active' else v_row.status end);
end;
$$;

-- ── A referrer creates a code: at most p_max live, each code once ever ────
create or replace function public.create_referral_code(
  p_referrer uuid,
  p_code     text,
  p_label    text,
  p_percent  numeric,
  p_max      integer,
  p_actor    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.referrers%rowtype;
  v_live  integer;
  v_id    uuid;
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
begin
  if p_code is null or p_code !~ '^[A-Z0-9]{4,16}$' or p_code like 'MAPL%' then
    return jsonb_build_object('result', 'bad_code');
  end if;
  if p_percent is null or p_percent <= 0 or p_percent > 10 or p_max is null or p_max < 1 or p_max > 20 then
    return jsonb_build_object('result', 'bad_request');
  end if;
  if v_label is not null and char_length(v_label) > 40 then
    return jsonb_build_object('result', 'bad_request');
  end if;
  select * into v_row from public.referrers where id = p_referrer for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_row.status <> 'active' then
    return jsonb_build_object('result', 'not_active', 'status', v_row.status);
  end if;
  select count(*) into v_live from public.coupons where referrer_id = p_referrer and status in ('active', 'paused');
  if v_live >= p_max then
    return jsonb_build_object('result', 'limit', 'live', v_live);
  end if;
  begin
    insert into public.coupons (code, kind, value, applies_to, email, max_uses, uses_per_email, min_total, starts_at, expires_at, status, source, note, referrer_id)
    values (p_code, 'percent', p_percent, 'both', null, null, null, null, now(), null, 'active', 'referral', v_label, p_referrer)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('result', 'taken');
  end;
  insert into public.referral_events (referrer_id, kind, detail, actor)
  values (p_referrer, 'code_created', jsonb_build_object('code', p_code, 'coupon_id', v_id), p_actor);
  return jsonb_build_object('result', 'created', 'id', v_id, 'live', v_live + 1);
end;
$$;

-- ── A code paused, resumed or retired (the referrer), held or released (MAPL) ──
--
--   pause    active -> paused, by the referrer; they may resume it
--   resume   paused -> active, unless MAPL holds it or the referrer is not active
--   retire   active | paused -> void, for good (a code is never reused)
--   hold     active | paused -> paused and held, by MAPL
--   release  held -> active (paused if the referrer is not active)
create or replace function public.set_referral_code_status(
  p_referrer uuid,
  p_coupon   uuid,
  p_action   text,
  p_actor    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.referrers%rowtype;
  v_code public.coupons%rowtype;
  v_new  text;
begin
  if p_action not in ('pause', 'resume', 'retire', 'hold', 'release') then
    return jsonb_build_object('result', 'bad_request');
  end if;
  select * into v_row from public.referrers where id = p_referrer for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  -- Someone else's code reads as no code at all.
  select * into v_code from public.coupons where id = p_coupon and referrer_id = p_referrer for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_code.status = 'void' then
    return jsonb_build_object('result', 'retired');
  end if;

  if p_action = 'pause' then
    if v_code.status <> 'active' then return jsonb_build_object('result', 'unchanged', 'status', v_code.status); end if;
    update public.coupons set status = 'paused', updated_at = now() where id = p_coupon;
    v_new := 'paused';
  elsif p_action = 'resume' then
    if v_code.status <> 'paused' then return jsonb_build_object('result', 'unchanged', 'status', v_code.status); end if;
    if v_code.referral_hold or v_row.status <> 'active' then return jsonb_build_object('result', 'held'); end if;
    update public.coupons set status = 'active', updated_at = now() where id = p_coupon;
    v_new := 'active';
  elsif p_action = 'retire' then
    update public.coupons set status = 'void', referral_hold = false, retired_at = now(), updated_at = now() where id = p_coupon;
    v_new := 'void';
  elsif p_action = 'hold' then
    if v_code.referral_hold then return jsonb_build_object('result', 'unchanged', 'status', v_code.status); end if;
    update public.coupons set status = 'paused', referral_hold = true, updated_at = now() where id = p_coupon;
    v_new := 'paused';
  else -- release
    if not v_code.referral_hold then return jsonb_build_object('result', 'unchanged', 'status', v_code.status); end if;
    v_new := case when v_row.status = 'active' then 'active' else 'paused' end;
    -- Released alone, a code of a paused referrer stays held with them.
    update public.coupons
       set status = v_new, referral_hold = (v_row.status = 'paused'), updated_at = now()
     where id = p_coupon;
  end if;

  insert into public.referral_events (referrer_id, kind, detail, actor)
  values (p_referrer, 'code_' || p_action, jsonb_build_object('code', v_code.code, 'coupon_id', p_coupon), p_actor);
  return jsonb_build_object('result', 'done', 'status', v_new);
end;
$$;

-- ── A referrer paused, resumed or removed (MAPL), with their codes ───────
--
--   paused   codes stop working (held), and payouts wait
--   active   back as before: codes MAPL held come back, codes they paused stay paused
--   removed  codes end for good; the address may be invited again later
create or replace function public.set_referrer_status(
  p_referrer uuid,
  p_status   text,
  p_actor    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.referrers%rowtype;
  v_new text;
  v_n   integer := 0;
begin
  if p_status not in ('active', 'paused', 'removed') then
    return jsonb_build_object('result', 'bad_request');
  end if;
  select * into v_row from public.referrers where id = p_referrer for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_row.status = 'removed' then
    return jsonb_build_object('result', 'removed');
  end if;

  if p_status = 'paused' then
    if v_row.status = 'paused' then return jsonb_build_object('result', 'unchanged', 'status', v_row.status); end if;
    update public.coupons set status = 'paused', referral_hold = true, updated_at = now()
     where referrer_id = p_referrer and status = 'active';
    get diagnostics v_n = row_count;
    v_new := 'paused';
  elsif p_status = 'active' then
    if v_row.status <> 'paused' then return jsonb_build_object('result', 'unchanged', 'status', v_row.status); end if;
    v_new := case when v_row.terms_accepted_at is null then 'invited' else 'active' end;
    update public.coupons set status = 'active', referral_hold = false, updated_at = now()
     where referrer_id = p_referrer and status = 'paused' and referral_hold;
    get diagnostics v_n = row_count;
  else
    update public.coupons set status = 'void', referral_hold = false, retired_at = coalesce(retired_at, now()), updated_at = now()
     where referrer_id = p_referrer and status <> 'void';
    get diagnostics v_n = row_count;
    v_new := 'removed';
  end if;

  update public.referrers
     set status = v_new,
         removed_at = case when v_new = 'removed' then now() else removed_at end,
         updated_at = now()
   where id = p_referrer;
  insert into public.referral_events (referrer_id, kind, detail, actor)
  values (p_referrer, case v_new when 'paused' then 'paused' when 'removed' then 'removed' else 'resumed' end, jsonb_build_object('codes', v_n), p_actor);
  return jsonb_build_object('result', 'done', 'status', v_new, 'codes', v_n);
end;
$$;

-- ── Where a referrer is paid: saved only over the account the page was shown ──
--
-- p_expected is the recipient id the page read (null for none): a save made
-- from an older view never overwrites a newer account. Answers the account it
-- replaced, so the caller can switch that recipient off in Wise.
create or replace function public.save_referrer_payout_account(
  p_referrer   uuid,
  p_expected   bigint,
  p_recipient  bigint,
  p_holder     text,
  p_last4      text,
  p_legal      text,
  p_hold_until timestamptz,
  p_actor      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.referrers%rowtype;
begin
  if p_recipient is null or p_recipient <= 0 or p_last4 !~ '^[0-9]{4}$' or p_legal not in ('PRIVATE', 'BUSINESS')
     or char_length(btrim(coalesce(p_holder, ''))) not between 2 and 140 or p_hold_until is null then
    return jsonb_build_object('result', 'bad_request');
  end if;
  select * into v_row from public.referrers where id = p_referrer for update;
  if not found or v_row.status = 'removed' then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_row.wise_recipient_id is distinct from p_expected then
    return jsonb_build_object('result', 'changed', 'current', v_row.wise_recipient_id);
  end if;
  update public.referrers
     set wise_recipient_id = p_recipient,
         payout_holder = btrim(p_holder),
         payout_last4 = p_last4,
         payout_legal_type = p_legal,
         payout_added_at = now(),
         payout_hold_until = p_hold_until,
         updated_at = now()
   where id = p_referrer;
  insert into public.referral_events (referrer_id, kind, detail, actor)
  values (p_referrer, case when v_row.wise_recipient_id is null then 'payout_account_added' else 'payout_account_changed' end,
          jsonb_build_object('last4', p_last4, 'previous_last4', v_row.payout_last4, 'hold_until', p_hold_until), p_actor);
  return jsonb_build_object('result', 'saved', 'previous', v_row.wise_recipient_id);
end;
$$;

-- ── An earning marked not counted, or counted again (MAPL) ─────────────
create or replace function public.set_referral_earning_void(
  p_earning uuid,
  p_void    boolean,
  p_reason  text,
  p_actor   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e      public.referral_earnings%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_e from public.referral_earnings where id = p_earning for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  -- Money on its way or sent is never undone here: a person deals with it in Wise.
  if exists (select 1 from public.referral_payout_items where earning_id = p_earning and active) then
    return jsonb_build_object('result', 'in_payout');
  end if;
  if p_void then
    if v_e.voided_at is not null then return jsonb_build_object('result', 'unchanged'); end if;
    if char_length(v_reason) not between 1 and 300 then return jsonb_build_object('result', 'bad_request'); end if;
    update public.referral_earnings set voided_at = now(), void_reason = v_reason, voided_by = p_actor where id = p_earning;
  else
    if v_e.voided_at is null then return jsonb_build_object('result', 'unchanged'); end if;
    update public.referral_earnings set voided_at = null, void_reason = null, voided_by = null where id = p_earning;
  end if;
  insert into public.referral_events (referrer_id, kind, detail, actor)
  values (v_e.referrer_id, case when p_void then 'earning_voided' else 'earning_restored' end,
          jsonb_build_object('booking_id', v_e.booking_id, 'reason', nullif(v_reason, '')), p_actor);
  return jsonb_build_object('result', 'done');
end;
$$;

-- ── The payout claim: the payout and all its items, or nothing ──────────
-- Returns null when any earning is already in a live item (another run got
-- there first). Refuses items that do not add up to the payout.
create or replace function public.claim_referral_payout(
  p_referrer  uuid,
  p_payee     text,
  p_recipient bigint,
  p_last4     text,
  p_amount    numeric,
  p_pay_day   date,
  p_ctid      uuid,
  p_items     jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_total numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'claim_referral_payout: no items';
  end if;
  select coalesce(sum((i->>'amount_usd')::numeric), 0) into v_total from jsonb_array_elements(p_items) i;
  if v_total <> p_amount then
    raise exception 'claim_referral_payout: items add up to %, not %', v_total, p_amount;
  end if;
  -- Every earning must be this referrer's and still counted.
  if exists (
    select 1 from jsonb_array_elements(p_items) i
      left join public.referral_earnings e on e.id = (i->>'earning_id')::uuid
     where e.id is null or e.referrer_id <> p_referrer or e.voided_at is not null or e.booking_id <> (i->>'booking_id')::uuid
  ) then
    raise exception 'claim_referral_payout: an item is not a counted earning of this referrer';
  end if;

  begin
    insert into public.referral_payouts (referrer_id, payee, recipient_id, account_last4, amount_usd, pay_day, customer_transaction_id, status)
    values (p_referrer, p_payee, p_recipient, p_last4, p_amount, p_pay_day, p_ctid, 'claimed')
    returning id into v_id;

    insert into public.referral_payout_items (payout_id, earning_id, booking_id, amount_usd)
    select v_id, (i->>'earning_id')::uuid, (i->>'booking_id')::uuid, (i->>'amount_usd')::numeric
      from jsonb_array_elements(p_items) i;
  exception when unique_violation then
    return null;
  end;

  return v_id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.accept_referral_terms(uuid, text, text, text, uuid, text)',
    'public.create_referral_code(uuid, text, text, numeric, integer, text)',
    'public.set_referral_code_status(uuid, uuid, text, text)',
    'public.set_referrer_status(uuid, text, text)',
    'public.save_referrer_payout_account(uuid, bigint, bigint, text, text, text, timestamptz, text)',
    'public.set_referral_earning_void(uuid, boolean, text, text)',
    'public.claim_referral_payout(uuid, text, bigint, text, numeric, date, uuid, jsonb)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('revoke all on function %s from authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
