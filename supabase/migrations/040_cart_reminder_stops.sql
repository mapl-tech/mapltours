-- 040: cart reminder stops (owner, Nov 15 2026).
--
-- The cart reminders (the first, and since Nov 15 2026 a follow-up three days
-- later with JAMAICA5) carry a "Stop these reminders" link and a one-click
-- List-Unsubscribe header. A stop is kept here by inbox, the same key the
-- sweep already uses to tell two spellings of one address apart
-- (lib/contact-spam mailboxKey: lower case, no +tag, Gmail dots removed), and
-- the sweep sends no reminder of either kind to an inbox listed here.
--
-- Written and read only by the server (service role). No browser access: the
-- table holds addresses. Nothing ever lifts a stop automatically.
--
-- Idempotent: safe to run twice.

create table if not exists public.cart_reminder_stops (
  inbox text primary key,
  booking_id uuid,
  created_at timestamptz not null default now(),
  constraint cart_reminder_stops_inbox_shape check (inbox = lower(inbox) and position('@' in inbox) > 1 and length(inbox) <= 320)
);

alter table public.cart_reminder_stops enable row level security;
revoke all on table public.cart_reminder_stops from anon, authenticated;
grant select, insert, update on table public.cart_reminder_stops to service_role;
