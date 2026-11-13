-- 037: tour rate cards, editable in /admin/tour-rates (Nov 12 2026).
--
-- What Collin charges for each tour (lib/experiences TourPricing: the rate for
-- the party, per-person rates, the rate per pickup zone, a per-person add-on,
-- the smallest party). An admin saves a card; the deploy it starts copies
-- every card here into lib/tour-rates.snapshot.json (scripts/
-- snapshot-tour-rates.mjs), and the site prices from that snapshot, so the
-- page, the checkout server, the emails and the agent tools all agree.
--
-- A tour with no row keeps the catalog's default. Cards are validated by
-- lib/tour-rates parseRateCard before they are stored and again when a deploy
-- publishes them; the checks here are the last line.
--
-- Every save and every reset goes through one function that writes the card
-- and its change-log row in the same transaction, so the log can never miss a
-- change. Service role only: no policies, nothing for anon or signed-in users.
--
-- Idempotent, safe to re-run.

create table if not exists public.tour_rate_cards (
  experience_id    integer primary key check (experience_id > 0),
  pricing          jsonb not null check (jsonb_typeof(pricing) = 'object'),
  min_guests       integer not null default 1 check (min_guests between 1 and 12),
  updated_at       timestamptz not null default now(),
  updated_by       uuid,
  updated_by_email text
);

comment on table public.tour_rate_cards is
  'Live tour rate cards edited in /admin/tour-rates. Published to the site by the deploy each save starts (scripts/snapshot-tour-rates.mjs). Validated by lib/tour-rates parseRateCard.';

create table if not exists public.tour_rate_changes (
  id               bigint generated always as identity primary key,
  experience_id    integer not null,
  action           text not null check (action in ('save', 'reset')),
  before           jsonb,
  after            jsonb,
  changed_by       uuid,
  changed_by_email text,
  changed_at       timestamptz not null default now()
);

create index if not exists tour_rate_changes_recent_idx on public.tour_rate_changes (changed_at desc);

alter table public.tour_rate_cards enable row level security;
alter table public.tour_rate_changes enable row level security;
revoke all on public.tour_rate_cards from anon, authenticated;
revoke all on public.tour_rate_changes from anon, authenticated;

-- Save a card and log it, in one transaction. p_default is the catalog's own
-- card, logged as "before" the first time a tour is edited.
create or replace function public.save_tour_rate_card(
  p_experience_id integer,
  p_pricing jsonb,
  p_min_guests integer,
  p_default jsonb,
  p_by uuid,
  p_by_email text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prev public.tour_rate_cards%rowtype;
  found_prev boolean;
begin
  select * into prev from public.tour_rate_cards where experience_id = p_experience_id for update;
  found_prev := found;

  insert into public.tour_rate_cards (experience_id, pricing, min_guests, updated_at, updated_by, updated_by_email)
  values (p_experience_id, p_pricing, p_min_guests, now(), p_by, p_by_email)
  on conflict (experience_id) do update
    set pricing = excluded.pricing,
        min_guests = excluded.min_guests,
        updated_at = now(),
        updated_by = excluded.updated_by,
        updated_by_email = excluded.updated_by_email;

  insert into public.tour_rate_changes (experience_id, action, before, after, changed_by, changed_by_email)
  values (
    p_experience_id,
    'save',
    case when found_prev then jsonb_build_object('pricing', prev.pricing, 'minGuests', prev.min_guests) else p_default end,
    jsonb_build_object('pricing', p_pricing, 'minGuests', p_min_guests),
    p_by,
    p_by_email
  );

  return jsonb_build_object('ok', true, 'firstEdit', not found_prev);
end;
$$;

-- Put a tour back on the catalog's card: delete its row and log it.
create or replace function public.reset_tour_rate_card(
  p_experience_id integer,
  p_default jsonb,
  p_by uuid,
  p_by_email text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prev public.tour_rate_cards%rowtype;
begin
  delete from public.tour_rate_cards where experience_id = p_experience_id returning * into prev;
  if not found then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;
  insert into public.tour_rate_changes (experience_id, action, before, after, changed_by, changed_by_email)
  values (
    p_experience_id,
    'reset',
    jsonb_build_object('pricing', prev.pricing, 'minGuests', prev.min_guests),
    p_default,
    p_by,
    p_by_email
  );
  return jsonb_build_object('ok', true, 'changed', true);
end;
$$;

revoke all on function public.save_tour_rate_card(integer, jsonb, integer, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.reset_tour_rate_card(integer, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.save_tour_rate_card(integer, jsonb, integer, jsonb, uuid, text) to service_role;
grant execute on function public.reset_tour_rate_card(integer, jsonb, uuid, text) to service_role;
