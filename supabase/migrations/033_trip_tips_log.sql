-- Trip tips v2: the ledger of tips sent to subscribers.
--
-- The daily job (app/api/trip-tips, lib/trip-tips/run.ts) sends each Trip
-- tips subscriber at most one tip at a time, chosen by what they have booked.
-- This table is its once-only record and its cadence memory:
--
--   claimed  the run took this tip for this address and is sending it (or
--            stopped mid-send: the outcome is unknown, so it is never sent
--            again automatically)
--   sent     Resend accepted it; resend_id is the email's id
--   failed   Resend refused it; the next run deletes this row and tries again
--
-- unique (email, tip_key) is the claim: two runs that plan the same tip both
-- insert, one wins, the other meets the constraint and skips. The job reads
-- every row for an address to space tips out (never two within 7 days, never
-- more than 2 in 30).
--
-- Addresses are stored lower-cased and trimmed (the job normalizes before it
-- writes). No booking foreign key: a tip for a prospect has no booking, and a
-- booking deleted later must not take the history with it.
--
-- Service role only: no browser session ever reads or writes it.

create table if not exists public.trip_tips_log (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  tip_key     text not null,
  track       text not null,
  booking_id  uuid null,
  status      text not null check (status in ('claimed', 'sent', 'failed')),
  resend_id   text null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz null,
  unique (email, tip_key)
);

comment on table public.trip_tips_log is
  'Trip tips v2 ledger: one row per (address, tip). Claimed before the send, sent after Resend accepts it, failed when refused. Service role only.';
comment on column public.trip_tips_log.email is 'Lower-cased, trimmed.';
comment on column public.trip_tips_log.tip_key is 'p1_ride_costs .. p4_booking_rules, r1/r2, t1/t2, b1/b2 (lib/trip-tips/plan.ts TIP_KEYS).';
comment on column public.trip_tips_log.track is 'PROSPECT, RIDE, TOUR or BOTH at the time of the send.';

alter table public.trip_tips_log enable row level security;
revoke all on public.trip_tips_log from anon, authenticated;
