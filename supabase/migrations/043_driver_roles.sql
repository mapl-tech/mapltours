-- Driver roles, and changes to a ride made from the driver portal (Nov 24 2026).
--
-- The owner, Nov 24 2026: "Implement role-based permissions for drivers, with
-- two roles ... Regular Drivers: Have access to their assigned rides and
-- tours. Fleet Manager: Can assign and reassign drivers to rides and tours, as
-- well as update pickup times and create new drivers. Collin should be a
-- Fleet Manager."
--
-- 1) drivers.role: 'driver' (sees only the rides and tours on which the
--    booking names them) or 'fleet_manager' (sees every ride and tour, and
--    may change who drives and when). drivers.email, until now only a blind
--    copy of the driver-update email, is also the address a driver signs in
--    to the portal with (lib/driver-access.ts), so two working drivers may
--    not share one. Nobody's role or address is set here: the repo is public,
--    so Collin's row is updated by hand after this runs.
--
-- 2) dispatch_changes: one row per change saved from the portal (who drives a
--    booking, a ride's time, a tour's pickup time), with what it was, what it
--    became, who changed it and what the guest was told. The portal shows the
--    latest on the ride; nothing reads it to decide anything about money.
--
-- 3) apply_dispatch_change: the only way the portal writes a change. In one
--    transaction it locks the booking, refuses one that is not paid, refuses
--    when the value is no longer the one the person was shown (somebody else
--    changed it first), keeps a round trip's arrival before its ride back,
--    writes the change and its log row. Money columns, status and Stripe
--    fields are never touched. Service role only.

alter table public.drivers add column if not exists role text not null default 'driver';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drivers_role_known' and conrelid = 'public.drivers'::regclass) then
    alter table public.drivers add constraint drivers_role_known check (role in ('driver', 'fleet_manager'));
  end if;
end $$;

comment on column public.drivers.role is
  'driver: sees only bookings that name them. fleet_manager: sees all, assigns drivers, changes times, adds drivers (lib/driver-access.ts).';
comment on column public.drivers.email is
  'Optional. The address the driver signs in to the portal with, and a blind copy of a driver-update email.';

create unique index if not exists drivers_active_email_once on public.drivers (lower(email)) where active and email is not null;

create table if not exists public.dispatch_changes (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references public.bookings(id) on delete cascade,
  kind                text not null check (kind in ('driver', 'time', 'tour_time')),
  leg                 text null check (leg is null or leg in ('arrival', 'departure')),
  before              jsonb not null,
  after               jsonb not null,
  actor_email         text not null check (char_length(actor_email) between 3 and 320),
  actor_label         text not null check (char_length(actor_label) between 1 and 80),
  guest_email         text not null default 'pending'
                      check (guest_email in ('pending', 'automatic', 'sent', 'failed', 'skipped', 'not_needed', 'unreachable')),
  guest_email_detail  text null check (guest_email_detail is null or char_length(guest_email_detail) <= 500),
  created_at          timestamptz not null default now(),
  constraint dispatch_changes_leg_fits check (
    (kind = 'time' and leg is not null) or (kind <> 'time' and leg is null)
  )
);

comment on table public.dispatch_changes is
  'Changes saved from the driver portal (lib/dispatch-change.ts): who changed what on a booking, and what the guest was told. Service role only.';

create index if not exists dispatch_changes_booking_newest on public.dispatch_changes (booking_id, created_at desc);

alter table public.dispatch_changes enable row level security;
revoke all on public.dispatch_changes from anon, authenticated;

create or replace function public.apply_dispatch_change(
  p_booking_id  uuid,
  p_kind        text,
  p_leg         text,
  p_before      jsonb,
  p_after       jsonb,
  p_actor_email text,
  p_actor_label text
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_booking  public.bookings%rowtype;
  v_item     public.booking_items%rowtype;
  v_items    integer;
  v_old      timestamptz;
  v_seen     timestamptz;
  v_new      timestamptz;
  v_first    text;
  v_id       uuid;
begin
  if p_kind is null or p_kind not in ('driver', 'time', 'tour_time') then
    return jsonb_build_object('result', 'bad_request', 'why', 'kind');
  end if;
  if p_before is null or p_after is null or jsonb_typeof(p_before) <> 'object' or jsonb_typeof(p_after) <> 'object' then
    return jsonb_build_object('result', 'bad_request', 'why', 'values');
  end if;

  -- The lock: one change per booking at a time, and the paid check holds until commit.
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_booking.status is distinct from 'paid' then
    return jsonb_build_object('result', 'not_paid', 'status', v_booking.status);
  end if;

  if p_kind = 'driver' then
    if v_booking.booking_type not in ('transfer', 'tour') then
      return jsonb_build_object('result', 'bad_request', 'why', 'type');
    end if;
    if p_leg is not null then
      return jsonb_build_object('result', 'bad_request', 'why', 'leg');
    end if;
    if nullif(btrim(coalesce(p_after->>'driver_name', '')), '') is null then
      return jsonb_build_object('result', 'bad_request', 'why', 'driver_name');
    end if;
    -- What the person was shown must still be what the booking holds.
    if v_booking.driver_name    is distinct from (p_before->>'driver_name')
    or v_booking.driver_phone   is distinct from (p_before->>'driver_phone')
    or v_booking.driver_vehicle is distinct from (p_before->>'driver_vehicle')
    or v_booking.driver_plate   is distinct from (p_before->>'driver_plate') then
      return jsonb_build_object('result', 'changed');
    end if;
    update public.bookings set
      driver_name    = p_after->>'driver_name',
      driver_phone   = p_after->>'driver_phone',
      driver_vehicle = p_after->>'driver_vehicle',
      driver_plate   = p_after->>'driver_plate'
    where id = p_booking_id;

  elsif p_kind = 'time' then
    if v_booking.booking_type is distinct from 'transfer' then
      return jsonb_build_object('result', 'bad_request', 'why', 'type');
    end if;
    if p_leg is null or p_leg not in ('arrival', 'departure') then
      return jsonb_build_object('result', 'bad_request', 'why', 'leg');
    end if;
    -- One ride item per transfer booking, as checkout writes it. Anything else is refused, never guessed.
    select count(*) into v_items from public.booking_items where booking_id = p_booking_id and item_type = 'transfer';
    if v_items <> 1 then
      return jsonb_build_object('result', 'bad_request', 'why', 'items', 'count', v_items);
    end if;
    select * into v_item from public.booking_items where booking_id = p_booking_id and item_type = 'transfer' for update;
    -- A written-out instant only: Postgres would also read 'now', 'today', 'tomorrow' and 'infinity'.
    if coalesce(p_after->>'at', '') !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$'
    or coalesce(p_before->>'at', '') !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$' then
      return jsonb_build_object('result', 'bad_request', 'why', 'at');
    end if;
    begin
      v_new := (p_after->>'at')::timestamptz;
      v_seen := (p_before->>'at')::timestamptz;
    exception when others then
      return jsonb_build_object('result', 'bad_request', 'why', 'at');
    end;
    if v_new is null or v_seen is null then
      return jsonb_build_object('result', 'bad_request', 'why', 'at');
    end if;
    v_old := case when p_leg = 'arrival' then v_item.arrival_at else v_item.departure_at end;
    if v_old is null then
      return jsonb_build_object('result', 'bad_request', 'why', 'no_leg');
    end if;
    if v_old is distinct from v_seen then
      return jsonb_build_object('result', 'changed');
    end if;
    -- A round trip lands before it leaves.
    if p_leg = 'arrival' and v_item.departure_at is not null and v_new >= v_item.departure_at then
      return jsonb_build_object('result', 'order');
    end if;
    if p_leg = 'departure' and v_item.arrival_at is not null and v_new <= v_item.arrival_at then
      return jsonb_build_object('result', 'order');
    end if;
    -- The item's date is the day of its first ride (checkout: the arrival's, else the departure's); it moves with it.
    v_first := case when v_item.arrival_at is not null then 'arrival' else 'departure' end;
    if p_leg = 'arrival' then
      update public.booking_items set arrival_at = v_new,
        date = case when v_first = 'arrival' and date = (v_old at time zone 'UTC')::date then (v_new at time zone 'UTC')::date else date end
      where id = v_item.id;
    else
      update public.booking_items set departure_at = v_new,
        date = case when v_first = 'departure' and date = (v_old at time zone 'UTC')::date then (v_new at time zone 'UTC')::date else date end
      where id = v_item.id;
    end if;

  else -- tour_time
    if v_booking.booking_type is distinct from 'tour' then
      return jsonb_build_object('result', 'bad_request', 'why', 'type');
    end if;
    if p_leg is not null then
      return jsonb_build_object('result', 'bad_request', 'why', 'leg');
    end if;
    if coalesce(p_after->>'pickup_time', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return jsonb_build_object('result', 'bad_request', 'why', 'pickup_time');
    end if;
    if v_booking.pickup_time is distinct from (p_before->>'pickup_time') then
      return jsonb_build_object('result', 'changed');
    end if;
    update public.bookings set pickup_time = p_after->>'pickup_time' where id = p_booking_id;
  end if;

  insert into public.dispatch_changes (booking_id, kind, leg, before, after, actor_email, actor_label)
  values (p_booking_id, p_kind, case when p_kind = 'time' then p_leg else null end, p_before, p_after,
          lower(btrim(p_actor_email)), btrim(p_actor_label))
  returning id into v_id;

  return jsonb_build_object('result', 'applied', 'id', v_id);
end;
$$;

revoke all on function public.apply_dispatch_change(uuid, text, text, jsonb, jsonb, text, text) from public;
revoke all on function public.apply_dispatch_change(uuid, text, text, jsonb, jsonb, text, text) from anon, authenticated;
grant execute on function public.apply_dispatch_change(uuid, text, text, jsonb, jsonb, text, text) to service_role;
