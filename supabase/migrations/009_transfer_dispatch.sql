-- 009 — Transfer dispatch workflow
--
-- Operational state for coordinating a paid transfer with the Jamaica driver:
-- a per-step completion map plus the confirmed driver/vehicle details. This is
-- purely additive bookkeeping used by the admin dispatch console. It NEVER
-- touches the money columns (total_paid, subtotal, booking_fee, stripe_*,
-- status) or the payment/webhook path.
--
--   dispatch:  jsonb map of step-key -> ISO completion timestamp, e.g.
--              {"verified":"2026-08-12T...","sent_to_driver":"...", ...}
--   driver_*:  the details the driver sends back (name, phone, vehicle, plate)

alter table public.bookings
  add column if not exists dispatch jsonb not null default '{}'::jsonb,
  add column if not exists driver_name text,
  add column if not exists driver_phone text,
  add column if not exists driver_vehicle text,
  add column if not exists driver_plate text;
