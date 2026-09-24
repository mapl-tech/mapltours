-- MAPL Tours — let a reward be RESERVED while a checkout holds it
-- Idempotent, safe to re-run.
--
-- A video reward priced a cart without any claim on the row: two tabs, two
-- carts, one 'available' reward, and each POST /api/checkout independently
-- read it, priced its cart with the discount, and stamped reward_id into its
-- PaymentIntent metadata. Whichever webhook landed first flipped the row to
-- 'used'; the second consume matched zero rows, logged nothing anyone read,
-- and the second cart kept a discount no reward backed.
--
-- 'reserved' is the claim-once state between "priced into a live checkout"
-- and "paid". The checkout takes it with a conditional UPDATE before the
-- PaymentIntent is created; the webhook consumes reserved -> used on payment
-- success and releases reserved -> available on payment_intent.canceled. A
-- reservation stranded by an abandoned checkout is stolen by the next
-- checkout once its holder is no longer pending or paid.

alter table public.user_rewards
  drop constraint if exists user_rewards_status_check;

alter table public.user_rewards
  add constraint user_rewards_status_check
  check (status in ('available', 'reserved', 'used', 'expired'));

-- Only the server moves reward rows. Migration 003 let a signed-in user
-- UPDATE their own user_rewards row without any column or status
-- restriction, because the client used to flip a reward to 'used' itself.
-- That client write is gone (the checkout route reserves, the webhook
-- consumes, both with the service role), and with the policy still live a
-- guest could set their consumed reward back to 'available' from the
-- browser console and take the discount on every booking after the first.
-- RLS stays enabled, so with no UPDATE policy the anon and authenticated
-- roles can no longer write the table at all; the service role bypasses
-- RLS and is unaffected. The SELECT policy stays: the profile reads it.
drop policy if exists "Users can consume their own rewards" on public.user_rewards;
