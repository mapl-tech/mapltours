-- Payouts by Wise: the ledger (built Nov 15 2026, changed Nov 18 2026 to pay
-- before each trip; NOT applied).
--
-- The daily job (app/api/payouts, lib/payouts/run.ts) pays, through Wise,
-- every ride half and every tour whose send day has come (two business days
-- before its day by default), so the money lands before the driver or the
-- operator works. These two tables are its record and its guard.
--
-- driver_payouts: one row per payment to one Wise recipient.
--   claimed       the run took these parts and is paying them
--   created       the Wise transfer exists (wise_transfer_id), not yet paid
--   funded        Wise took the money from the balance
--   sent          Wise's webhook says it was paid out to the bank
--   failed        Wise refused before any money moved; the items are voided,
--                 so those parts are owed again on the next run
--   returned      the money came back (refunded or charged back); items voided
--   needs_review  the outcome is unknown: the items stay live, so nothing is
--                 paid twice, and the recipient is held until resolved_at is set
--
-- driver_payout_items: one row per part. 'first' = a ride's arrival leg or
-- the only leg of a one-way, 'second' = a round trip's departure leg, 'tour'
-- = a tour booking (paid once, by its first tour day). The partial unique
-- index lets a part sit in only ONE live item, which is what makes paying it
-- twice impossible: a second claim meets the index and claim_driver_payout
-- returns null.
--
-- No foreign key to bookings, on purpose (as trip_tips_log): the purge script
-- that removes test bookings must not be blocked, and a payout's history must
-- not disappear with a booking.
--
-- Service role only: no browser session reads or writes either table.

create table if not exists public.driver_payouts (
  id                      uuid primary key default gen_random_uuid(),
  payee                   text not null check (char_length(payee) between 1 and 200),
  recipient_id            bigint not null,
  amount_usd              numeric(10, 2) not null check (amount_usd > 0),
  fee_usd                 numeric(10, 2) null,
  source_amount_usd       numeric(10, 2) null,
  status                  text not null check (status in ('claimed', 'created', 'funded', 'sent', 'failed', 'returned', 'needs_review')),
  customer_transaction_id uuid not null unique,
  wise_quote_id           text null,
  wise_transfer_id        bigint null unique,
  wise_state              text null,
  wise_state_at           timestamptz null,
  pay_day                 date not null,
  error                   text null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  funded_at               timestamptz null,
  sent_at                 timestamptz null,
  resolved_at             timestamptz null
);

comment on table public.driver_payouts is
  'Payouts by Wise: one row per payment to one Wise recipient (lib/payouts/run.ts). Service role only.';
comment on column public.driver_payouts.payee is 'The names paid, as bookings write them ("Collin", or "Collin and Devon Brown" when they share a recipient).';
comment on column public.driver_payouts.customer_transaction_id is 'Wise idempotency key for the transfer: a retry returns the same transfer.';
comment on column public.driver_payouts.pay_day is 'The Jamaica day of the run that made it.';
comment on column public.driver_payouts.resolved_at is 'Set by a person once a needs_review or returned payout has been dealt with in Wise; until then the recipient is held.';

create index if not exists driver_payouts_open_idx on public.driver_payouts (status) where status in ('claimed', 'created', 'needs_review', 'returned');

create table if not exists public.driver_payout_items (
  id          uuid primary key default gen_random_uuid(),
  payout_id   uuid not null references public.driver_payouts (id) on delete cascade,
  booking_id  uuid not null,
  part        text not null check (part in ('first', 'second', 'tour')),
  amount_usd  numeric(10, 2) not null check (amount_usd > 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.driver_payout_items is
  'Payouts by Wise: the parts (ride halves, tours) each payout covers. A part may be in only one active item.';

create unique index if not exists driver_payout_items_once
  on public.driver_payout_items (booking_id, part) where active;
create index if not exists driver_payout_items_payout_idx on public.driver_payout_items (payout_id);

alter table public.driver_payouts enable row level security;
alter table public.driver_payout_items enable row level security;
revoke all on public.driver_payouts from anon, authenticated;
revoke all on public.driver_payout_items from anon, authenticated;

-- The claim: the payout and all its items in one statement's transaction, or
-- nothing. Returns the new payout id, or null when any part is already in a
-- live item (another run got there first). Refuses items that do not add up
-- to the payout, so a bug cannot pay one amount and record another.
create or replace function public.claim_driver_payout(
  p_payee     text,
  p_recipient bigint,
  p_amount    numeric,
  p_pay_day   date,
  p_ctid      uuid,
  p_items     jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_total numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'claim_driver_payout: no items';
  end if;
  select coalesce(sum((i->>'amount_usd')::numeric), 0) into v_total from jsonb_array_elements(p_items) i;
  if v_total <> p_amount then
    raise exception 'claim_driver_payout: items add up to %, not %', v_total, p_amount;
  end if;

  begin
    insert into public.driver_payouts (payee, recipient_id, amount_usd, pay_day, customer_transaction_id, status)
    values (p_payee, p_recipient, p_amount, p_pay_day, p_ctid, 'claimed')
    returning id into v_id;

    insert into public.driver_payout_items (payout_id, booking_id, part, amount_usd)
    select v_id, (i->>'booking_id')::uuid, i->>'part', (i->>'amount_usd')::numeric
      from jsonb_array_elements(p_items) i;
  exception when unique_violation then
    return null;
  end;

  return v_id;
end;
$$;

revoke all on function public.claim_driver_payout(text, bigint, numeric, date, uuid, jsonb) from public;
revoke all on function public.claim_driver_payout(text, bigint, numeric, date, uuid, jsonb) from anon;
revoke all on function public.claim_driver_payout(text, bigint, numeric, date, uuid, jsonb) from authenticated;
grant execute on function public.claim_driver_payout(text, bigint, numeric, date, uuid, jsonb) to service_role;
