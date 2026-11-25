-- A saved driver's details changed, and the upcoming rides that carry them (Nov 25 2026).
--
-- The owner, Nov 25 2026: "have the fleet manager be able to enter the vehicle
-- information for drivers as well. So make him able to edit driver details.
-- Make sure it is perfect. There can be no mistake."
--
-- A booking keeps its own copy of the driver's details (driver_name, _phone,
-- _vehicle, _plate), which every email and screen reads. So a driver who
-- changes van, or number, has to have that change on every ride still ahead,
-- or a guest is told the wrong plate. apply_driver_edit does both in one
-- transaction:
--
--   - the saved driver is locked and must still hold what the person was
--     shown (p_before); it is updated to p_after (name, WhatsApp, vehicle,
--     colour, plate, email, and the role when an admin sets one);
--   - each booking named in p_booking_ids is locked and changed only if it is
--     paid and still carries exactly the old details (p_cols_before), to
--     p_cols_after, with a dispatch_changes row (kind 'driver') like any
--     other driver change from the portal; any other booking is left alone
--     and reported.
--
-- Past rides are never in the list: what a guest was told stays on record.
-- No money column, status, Stripe field or webhook state is touched.
-- Service role only.

create or replace function public.apply_driver_edit(
  p_driver_id     uuid,
  p_before        jsonb,
  p_after         jsonb,
  p_cols_before   jsonb,
  p_cols_after    jsonb,
  p_booking_ids   uuid[],
  p_actor_email   text,
  p_actor_label   text
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_driver   public.drivers%rowtype;
  v_booking  public.bookings%rowtype;
  v_id       uuid;
  v_bid      uuid;
  v_changes  jsonb := '[]'::jsonb;
  v_skipped  jsonb := '[]'::jsonb;
begin
  if p_before is null or p_after is null or jsonb_typeof(p_before) <> 'object' or jsonb_typeof(p_after) <> 'object' then
    return jsonb_build_object('result', 'bad_request', 'why', 'values');
  end if;
  if coalesce(array_length(p_booking_ids, 1), 0) > 0
     and (p_cols_before is null or p_cols_after is null or jsonb_typeof(p_cols_before) <> 'object' or jsonb_typeof(p_cols_after) <> 'object') then
    return jsonb_build_object('result', 'bad_request', 'why', 'columns');
  end if;
  if p_after ? 'role' and (p_after->>'role') not in ('driver', 'fleet_manager') then
    return jsonb_build_object('result', 'bad_request', 'why', 'role');
  end if;

  -- The lock: one edit of a driver at a time.
  select * into v_driver from public.drivers where id = p_driver_id for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if not v_driver.active then
    return jsonb_build_object('result', 'retired');
  end if;
  -- What the person was shown must still be what is saved.
  if v_driver.name     is distinct from (p_before->>'name')
  or v_driver.whatsapp is distinct from (p_before->>'whatsapp')
  or v_driver.vehicle  is distinct from (p_before->>'vehicle')
  or v_driver.colour   is distinct from (p_before->>'colour')
  or v_driver.plate    is distinct from (p_before->>'plate')
  or v_driver.email    is distinct from (p_before->>'email')
  or v_driver.role     is distinct from (p_before->>'role') then
    return jsonb_build_object('result', 'changed');
  end if;

  -- Two working drivers may not share a name or a sign-in email (migrations
  -- 041 and 043). Said in words here; a clash that slips in between this
  -- check and the update still raises 23505 and the whole edit rolls back.
  if exists (select 1 from public.drivers where active and id <> p_driver_id and lower(name) = lower(p_after->>'name')) then
    return jsonb_build_object('result', 'duplicate', 'constraint', 'drivers_active_name_once');
  end if;
  if nullif(btrim(coalesce(p_after->>'email', '')), '') is not null
     and exists (select 1 from public.drivers where active and id <> p_driver_id and email is not null and lower(email) = lower(p_after->>'email')) then
    return jsonb_build_object('result', 'duplicate', 'constraint', 'drivers_active_email_once');
  end if;

  update public.drivers set
    name       = p_after->>'name',
    whatsapp   = p_after->>'whatsapp',
    vehicle    = p_after->>'vehicle',
    colour     = p_after->>'colour',
    plate      = p_after->>'plate',
    email      = p_after->>'email',
    role       = coalesce(p_after->>'role', role),
    updated_at = now()
  where id = p_driver_id;

  foreach v_bid in array coalesce(p_booking_ids, '{}'::uuid[]) loop
    select * into v_booking from public.bookings where id = v_bid for update;
    if not found then
      v_skipped := v_skipped || jsonb_build_object('booking_id', v_bid, 'why', 'not_found');
    elsif v_booking.status is distinct from 'paid' then
      v_skipped := v_skipped || jsonb_build_object('booking_id', v_bid, 'why', 'not_paid');
    elsif v_booking.driver_name    is distinct from (p_cols_before->>'driver_name')
       or v_booking.driver_phone   is distinct from (p_cols_before->>'driver_phone')
       or v_booking.driver_vehicle is distinct from (p_cols_before->>'driver_vehicle')
       or v_booking.driver_plate   is distinct from (p_cols_before->>'driver_plate') then
      v_skipped := v_skipped || jsonb_build_object('booking_id', v_bid, 'why', 'changed');
    else
      update public.bookings set
        driver_name    = p_cols_after->>'driver_name',
        driver_phone   = p_cols_after->>'driver_phone',
        driver_vehicle = p_cols_after->>'driver_vehicle',
        driver_plate   = p_cols_after->>'driver_plate'
      where id = v_bid;
      insert into public.dispatch_changes (booking_id, kind, leg, before, after, actor_email, actor_label)
      values (v_bid, 'driver', null, p_cols_before, p_cols_after, lower(btrim(p_actor_email)), btrim(p_actor_label))
      returning id into v_id;
      v_changes := v_changes || jsonb_build_object('booking_id', v_bid, 'change_id', v_id);
    end if;
  end loop;

  return jsonb_build_object('result', 'applied', 'changes', v_changes, 'skipped', v_skipped);
end;
$$;

revoke all on function public.apply_driver_edit(uuid, jsonb, jsonb, jsonb, jsonb, uuid[], text, text) from public;
revoke all on function public.apply_driver_edit(uuid, jsonb, jsonb, jsonb, jsonb, uuid[], text, text) from anon, authenticated;
grant execute on function public.apply_driver_edit(uuid, jsonb, jsonb, jsonb, jsonb, uuid[], text, text) to service_role;
