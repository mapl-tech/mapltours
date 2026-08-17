-- A refund on a gift-funded booking has two halves, and they cannot be
-- collapsed into one number.
--
-- `total_paid` is the whole cart. When part of it came off a gift card, Stripe
-- only ever captured `total_paid - gift_card_amount`. Quoting a refund off
-- total_paid therefore asks Stripe to return more than it took, which it
-- rejects outright whenever the gift covered more than the 20% admin charge —
-- i.e. for most real redemptions. The booking would be marked refunded, the
-- Stripe call would fail, and the request would bounce back to the queue
-- forever with no way to approve it.
--
-- So the quote is stored split at request time:
--   refund_quoted_cash  goes back to the payment card through Stripe
--   refund_quoted_gift  goes back onto the gift card's balance
--
-- Their sum is refund_quoted_amount. The admin charge comes out of cash first,
-- so a fully gift-covered booking quotes cash = 0 and settles entirely on the
-- card — which is also what makes such a booking cancellable at all, since it
-- has no PaymentIntent to refund against.

alter table public.bookings
  add column if not exists refund_quoted_cash numeric(10, 2),
  add column if not exists refund_quoted_gift numeric(10, 2);

comment on column public.bookings.refund_quoted_cash is
  'Portion of the quoted refund returned via Stripe. Never exceeds what Stripe captured.';
comment on column public.bookings.refund_quoted_gift is
  'Portion of the quoted refund returned to the gift card balance.';
