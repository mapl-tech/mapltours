-- 025 — Atomic booking_items replacement
--
-- Both checkout routes reuse a pending booking row when the same cart is
-- re-POSTed (23505 on the pending unique index from 007), and both did the
-- item refresh as two separate auto-committed statements: DELETE the reused
-- row's items, then INSERT the fresh set. Adversarial review traced two real
-- interleavings of concurrent same-cart requests (two tabs, a refresh
-- mid-flight) where request B's DELETE lands between request A's row insert
-- and A's items insert — or B's re-insert lands after A's — leaving the
-- booking with doubled line items or none at all, under a PaymentIntent that
-- is still payable either way.
--
-- This function collapses delete + insert into ONE transaction, so any two
-- concurrent replacements serialize: last writer wins wholesale, and the
-- row's items are always exactly one request's coherent set.
--
-- Extra jsonb keys on an item are ignored (jsonb_to_recordset only reads the
-- declared columns), so callers pass their insert rows verbatim.
--
-- SAFETY: strictly additive; the legacy two-statement path keeps working and
-- remains the code's fallback until this has run (lib/booking-items.ts
-- detects the missing function and degrades). Service role only.

create or replace function public.replace_booking_items(
  p_booking_id uuid,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.booking_items where booking_id = p_booking_id;

  insert into public.booking_items (
    booking_id, experience_id, title, destination, travelers, date,
    price_per_person, line_total, item_type, airport, hotel, zone,
    trip_type, arrival_flight, arrival_at, departure_flight, departure_at,
    passengers
  )
  select
    p_booking_id,
    x.experience_id,
    x.title,
    x.destination,
    coalesce(x.travelers, 2),
    x.date,
    x.price_per_person,
    x.line_total,
    coalesce(x.item_type, 'experience'),
    x.airport,
    x.hotel,
    x.zone,
    x.trip_type,
    x.arrival_flight,
    x.arrival_at,
    x.departure_flight,
    x.departure_at,
    x.passengers
  from jsonb_to_recordset(p_items) as x(
    experience_id   int,
    title           text,
    destination     text,
    travelers       int,
    date            date,
    price_per_person numeric(10, 2),
    line_total      numeric(10, 2),
    item_type       text,
    airport         text,
    hotel           text,
    zone            text,
    trip_type       text,
    arrival_flight  text,
    arrival_at      timestamptz,
    departure_flight text,
    departure_at    timestamptz,
    passengers      int
  );

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.replace_booking_items(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_booking_items(uuid, jsonb) to service_role;
