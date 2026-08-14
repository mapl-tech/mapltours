-- Attribution: where each booking came from (referrer + UTM, captured at
-- checkout). Additive nullable column; nothing existing reads or writes it
-- until the app code that ships alongside this migration.
alter table public.bookings add column if not exists attribution jsonb;
