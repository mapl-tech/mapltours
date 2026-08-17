-- Gift cards: real ones. The /gifts page previously rendered a fake
-- confirmation and stored nothing, so a purchase was unrecoverable.
--
-- A gift card is stored value. Two rules drive the shape of this schema:
--
--   1. The balance must never go negative, and must never be spent twice.
--      Redemption therefore goes through a conditional UPDATE guarded by
--      `balance >= amount`, and every spend is recorded as its own row so
--      the ledger can be reconstructed and reconciled against Stripe.
--
--   2. A card is only spendable once the purchase actually cleared. Rows are
--      created 'pending' at checkout and only become 'active' from the
--      Stripe webhook, so an abandoned payment leaves dead weight rather
--      than free money.

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),

  -- Human-readable redemption code, unique. Generated from an alphabet with
  -- no look-alike characters so it survives being read over the phone or
  -- copied off a screenshot.
  code text not null unique,

  initial_amount numeric(10, 2) not null check (initial_amount > 0),
  balance        numeric(10, 2) not null check (balance >= 0),
  currency       text not null default 'USD',

  --   pending   created at checkout, payment not yet confirmed
  --   active    paid for, spendable
  --   depleted  balance reached zero
  --   void      cancelled or refunded by an admin
  status text not null default 'pending'
    check (status in ('pending', 'active', 'depleted', 'void')),

  -- Purchase side
  stripe_payment_id text,
  purchaser_name    text,
  purchaser_email   text,

  -- Recipient side
  recipient_name  text,
  recipient_email text not null,
  message         text,

  created_at   timestamptz not null default now(),
  paid_at      timestamptz,
  -- Claimed before each email is sent, same pattern as the booking email
  -- channels, so a webhook retry cannot send either message twice. The buyer's
  -- receipt needs its own claim: it repeats the code, and Stripe redelivers.
  delivered_at    timestamptz,
  receipt_sent_at timestamptz,
  expires_at   timestamptz
);

alter table public.gift_cards enable row level security;
-- No policies: gift cards are only ever read or written by the service-role
-- client in API routes. A traveler redeeming one goes through an endpoint
-- that returns a balance, never the row.

create index if not exists gift_cards_code_idx on public.gift_cards (code);
create index if not exists gift_cards_stripe_idx on public.gift_cards (stripe_payment_id);

-- One row per spend. The sum of the non-released rows for a card must always
-- equal initial_amount - balance; anything else is a bug worth alerting on.
--
-- Balance is taken at CHECKOUT, not on payment success. That ordering is
-- forced: the PaymentIntent is created for the total minus the gift, so if the
-- deduction waited for the webhook, one $100 card could reduce three separate
-- $200 checkouts to $100 each and only ever be debited once. The card must be
-- spent before it can lower a charge.
--
-- Taking it early means an abandoned checkout would strand the value, so a
-- reservation is a state rather than a fact:
--
--   reserved  taken from the balance, payment not yet confirmed
--   spent     the booking was paid for; permanent
--   released  the checkout died or went stale; the balance was given back
--
-- Stale reservations are swept back on the next checkout that touches the same
-- card (see releaseStaleGiftClaims), so no cron job is required for a traveler
-- to get their own abandoned balance back.
create table if not exists public.gift_card_redemptions (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards(id) on delete cascade,
  booking_id   uuid references public.bookings(id) on delete set null,
  amount       numeric(10, 2) not null check (amount > 0),
  status text not null default 'reserved'
    check (status in ('reserved', 'spent', 'released')),
  created_at   timestamptz not null default now(),
  settled_at   timestamptz
);

alter table public.gift_card_redemptions enable row level security;

create index if not exists gift_card_redemptions_card_idx
  on public.gift_card_redemptions (gift_card_id);

-- A booking may hold at most one live claim. This is the backstop that makes
-- the "reuse the pending booking" branch of /api/checkout safe: a retried
-- request that races past the application-level check collides here instead of
-- debiting the card twice for one cart.
create unique index if not exists gift_card_redemptions_one_live_per_booking
  on public.gift_card_redemptions (booking_id)
  where status in ('reserved', 'spent') and booking_id is not null;

-- What a booking paid for with a gift card, so the confirmation, the admin
-- view and any refund can all see that part of the total never hit a card.
alter table public.bookings
  add column if not exists gift_card_id     uuid references public.gift_cards(id),
  add column if not exists gift_card_amount numeric(10, 2);
