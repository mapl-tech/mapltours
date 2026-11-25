-- 042: a booking's travel party (owner, Nov 24 2026).
--
-- After paying, a guest may add the email addresses of the people travelling
-- with them, on the confirmation page or from the link in their confirmation
-- email. Each person gets their own copy of that trip's emails (the
-- confirmation, a ride's driver details and any driver change, a
-- cancellation) and nothing else: never a review request, trip tip, reminder
-- or anything used for advertising. Party members never agreed to our terms;
-- the booker typed their address. See lib/travel-party*.
--
--   removed_at  the booker took the person off; they get nothing more. The
--               booker may add them again.
--   stopped_at  the person stopped the emails from the link in one. Only the
--               person can choose that, so the booker cannot add them again.
--   confirmation_sent_at  their copy of the confirmation went (sent once).
--
-- booking_party_add() is the only way a row is added or brought back: it
-- locks the booking row, so two quick taps can never pass the party-size cap
-- together, and it refuses an unpaid booking, the booker's own address and a
-- person who stopped the emails.
--
-- Service role only: the table holds other people's addresses.
-- Idempotent: safe to run twice.

create table if not exists public.booking_party (
  id                    uuid primary key default gen_random_uuid(),
  booking_id            uuid not null references public.bookings (id) on delete cascade,
  email                 text not null,
  added_at              timestamptz not null default now(),
  removed_at            timestamptz null,
  stopped_at            timestamptz null,
  confirmation_sent_at  timestamptz null,
  constraint booking_party_email_shape check (
    email = lower(btrim(email))
    and char_length(email) between 6 and 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint booking_party_once unique (booking_id, email)
);

create index if not exists booking_party_booking_idx on public.booking_party (booking_id);

comment on table public.booking_party is
  'Travel party addresses a booker added after paying. Each gets that trip''s emails only (lib/travel-party-server). Service role only.';

alter table public.booking_party enable row level security;
revoke all on table public.booking_party from anon, authenticated;
grant select, insert, update, delete on table public.booking_party to service_role;

-- Add (or bring back) one address, atomically. Returns one of:
--   {"result":"added","id":...}     a new row, or a removed one brought back
--   {"result":"exists","id":...}    already on the party
--   {"result":"stopped"}            the person stopped these emails
--   {"result":"full","cap":n}       the party already has n people
--   {"result":"own"}                the booker's own address
--   {"result":"not_paid"}           no such booking, or it is not paid
create or replace function public.booking_party_add(p_booking_id uuid, p_email text, p_cap integer)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_booker  text;
  v_status  text;
  v_row     public.booking_party%rowtype;
  v_exists  boolean := false;
  v_active  integer;
  v_cap     integer := greatest(1, least(coalesce(p_cap, 1), 12));
begin
  -- The lock: one add per booking at a time.
  select lower(btrim(coalesce(email, ''))), status into v_booker, v_status
    from public.bookings where id = p_booking_id for update;
  if not found or v_status is distinct from 'paid' then
    return jsonb_build_object('result', 'not_paid');
  end if;
  if v_email = v_booker then
    return jsonb_build_object('result', 'own');
  end if;

  select * into v_row from public.booking_party where booking_id = p_booking_id and email = v_email;
  -- Kept in a variable: every later statement resets FOUND.
  v_exists := found;
  if v_exists then
    if v_row.stopped_at is not null then
      return jsonb_build_object('result', 'stopped');
    end if;
    if v_row.removed_at is null then
      return jsonb_build_object('result', 'exists', 'id', v_row.id);
    end if;
  end if;

  select count(*) into v_active from public.booking_party
   where booking_id = p_booking_id and removed_at is null and stopped_at is null;
  if v_active >= v_cap then
    return jsonb_build_object('result', 'full', 'cap', v_cap);
  end if;

  if v_exists then
    update public.booking_party set removed_at = null where id = v_row.id;
    return jsonb_build_object('result', 'added', 'id', v_row.id);
  end if;
  insert into public.booking_party (booking_id, email) values (p_booking_id, v_email) returning * into v_row;
  return jsonb_build_object('result', 'added', 'id', v_row.id);
end;
$$;

revoke all on function public.booking_party_add(uuid, text, integer) from public;
revoke all on function public.booking_party_add(uuid, text, integer) from anon, authenticated;
grant execute on function public.booking_party_add(uuid, text, integer) to service_role;
