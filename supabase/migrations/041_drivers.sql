-- Saved drivers for the dispatch console (Nov 18 2026).
--
-- The owner, Nov 18 2026: "We have had a couple of situations where we have
-- needed to send a new driver update email. Can you build a way to do that in
-- the admin dashboard, the driver details should be stored somewhere ...
-- selecting the driver should come from a dropdown."
--
-- One row per driver, with the details a guest is given: the name, the
-- WhatsApp number guests should message, the vehicle, its colour and plate.
-- The dispatch console picks a driver from this list, copies the details onto
-- the booking's own driver_* columns (the booking keeps them, so an edit here
-- never rewrites what a guest was already told) and can email the guest.
--
-- `email` is optional: when set, the driver gets a blind copy of the update.
-- A driver is retired (active = false), never deleted, so the console can
-- still name who drove an old booking. Two active drivers may not share a
-- name: payouts and the console identify the driver on a booking by name.
--
-- Service role only: no browser session reads or writes this table. The
-- admin pages and routes check the admins allowlist first.

create table if not exists public.drivers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  whatsapp    text not null check (whatsapp ~ '^\+[0-9][0-9 ()-]{6,24}$'),
  vehicle     text not null check (char_length(vehicle) between 2 and 80),
  colour      text not null check (char_length(colour) between 2 and 30),
  plate       text not null check (char_length(plate) between 2 and 20),
  email       text null check (email is null or email ~* '^[^\s@]+@[^\s@]+\.[a-z]{2,}$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.drivers is
  'Saved drivers for the dispatch console and the driver-update email (lib/drivers.ts). Service role only.';
comment on column public.drivers.whatsapp is 'The number guests are told to message, with its country code, e.g. +1 876 919-7534.';
comment on column public.drivers.vehicle is 'Make and model as guests should read it, e.g. Toyota Hiace.';
comment on column public.drivers.colour is 'Lower case, e.g. silver. The booking stores "<vehicle>, <colour>".';
comment on column public.drivers.email is 'Optional. When set, the driver gets a blind copy of a driver-update email.';

create unique index if not exists drivers_active_name_once on public.drivers (lower(name)) where active;

alter table public.drivers enable row level security;
revoke all on public.drivers from anon, authenticated;
