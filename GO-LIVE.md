# Go-Live Checklist — Payments

Run through this in order before accepting real money. Once all boxes are ticked, swap keys and announce.

---

## 1. Stripe keys

**Test mode (today):** `sk_test_…` / `pk_test_…` in `.env.local`.
**Live mode (go-live):** replace both.

### Local
1. In Stripe Dashboard, toggle **View test data** OFF → copy live keys from **Developers → API keys**.
2. `.env.local`:
   ```
   STRIPE_SECRET_KEY=sk_live_…
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…
   ```
3. Don't commit `.env.local`. It's already in `.gitignore`.

### Vercel
Project → **Settings → Environment Variables** (Production scope only):
- `STRIPE_SECRET_KEY` = sk_live_…
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = pk_live_…
- `STRIPE_WEBHOOK_SECRET` = whsec_… (from step 2 below)
- `OPERATIONS_EMAIL` = ops@mapltours.com (or wherever ops should be paged)

Redeploy. Verify in Vercel logs that no request still carries a `pk_test` prefix.

---

## 2. Stripe webhook

Endpoint is already wired at **`/api/webhooks/stripe`** (see [app/api/webhooks/stripe/route.ts](app/api/webhooks/stripe/route.ts)). You only need to register it in Stripe.

1. **Stripe Dashboard → Developers → Webhooks → Add endpoint.**
2. URL: `https://mapltours.com/api/webhooks/stripe`
3. Events to send:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
4. Copy the **Signing secret** (`whsec_…`) → paste into `STRIPE_WEBHOOK_SECRET` env var (Vercel + local).
5. Click **Send test webhook** → pick `payment_intent.succeeded`. Vercel logs should show `received: true`.

### Local testing
```
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
`stripe listen` prints a local `whsec_…`. Paste that into `.env.local` for dev; swap back to the real one for production.

---

## 3. Supabase migrations

Apply **all three** in order to the production database. The checkout APIs query a schema-health view and will short-circuit with a 503 if any of these aren't present.

| Migration | What it adds | Required by |
|---|---|---|
| [005_bookings_payment_flow.sql](supabase/migrations/005_bookings_payment_flow.sql) | `status`, `cart_hash`, `paid_at`, `failed_at`, `confirmation_email_sent_at`, `operator_email_sent_at`, etc. Makes `user_id` nullable. Unique index on `stripe_payment_id`. | Tour checkout |
| [006_airport_transfers.sql](supabase/migrations/006_airport_transfers.sql) | `bookings.booking_type`. `booking_items.item_type` plus transfer-specific columns (airport, hotel, zone, trip_type, arrival/departure flight + datetime, passengers). | Transfer checkout |
| [007_bookings_atomic_idempotency.sql](supabase/migrations/007_bookings_atomic_idempotency.sql) | Cleans up stale duplicate pendings, replaces the non-unique `cart_hash` index with a **unique partial index** on `(cart_hash, booking_type) WHERE status = 'pending'`. Adds the `bookings_schema_health` view used as the runtime guard. | Concurrent checkout safety + schema guard |

Run in the Supabase SQL editor (or via `supabase db push`). All three are idempotent — re-running is safe.

**Verify:** after running them, paste this query into the SQL editor and confirm all four columns return `true`:

```sql
select * from public.bookings_schema_health;
```

If any column is `false`, that migration didn't apply cleanly; re-run that file specifically.

---

## 4. Email

Resend is already wired via `RESEND_API_KEY` and [lib/email/send.ts](lib/email/send.ts). Templates:

- [emails/BookingConfirmed.tsx](emails/BookingConfirmed.tsx) — traveler-facing voucher, sent from the webhook.
- [emails/OperatorBookingAlert.tsx](emails/OperatorBookingAlert.tsx) — internal ops alert.

Env vars required:
- `RESEND_API_KEY` — already set
- `EMAIL_FROM` — already set (`MAPL Tours <trips@mapltours.com>`)
- `EMAIL_SUPPORT` — reply-to / fallback ops address
- `OPERATIONS_EMAIL` — **NEW**, add this for operator alerts. Falls back to `EMAIL_SUPPORT` if unset.

Verify the Resend sending domain (`mapltours.com`) is authenticated (SPF, DKIM, DMARC) so confirmation emails don't go to spam. Resend dashboard → **Domains**.

---

## 5. Smoke-test end to end

In test mode (before flipping live keys):

1. Start dev, run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
2. Add 2 experiences to cart, proceed to checkout.
3. Step 1 → Step 2 → fill all fields → Step 3.
4. Open Supabase table editor, watch `bookings` — a row should appear with `status='pending'`.
5. Pay with test card `4242 4242 4242 4242`, expiry `12/30`, CVC `123`.
6. After confirmation:
   - Supabase `bookings.status` flips to `paid`, `paid_at` is set.
   - `booking_items` has one row per cart line.
   - Traveler email arrives (check Resend dashboard for delivery).
   - Ops email arrives.
   - `/checkout/confirm?payment_intent=…` shows the success view.

**3DS test:** card `4000 0025 0000 3155` forces the 3DS modal. After completing the challenge, Stripe redirects to `/checkout/confirm` — verify the success view renders there.

**Failure test:** card `4000 0000 0000 0002` → payment fails. Supabase `bookings.status` → `failed`. No traveler email sent.

**Double-click test:** hit the "Pay" button twice fast. Only one `bookings` row should be created — idempotency key = cart_hash prevents duplicates.

---

## 6. Post-go-live monitoring

- Stripe Dashboard → **Payments** → watch the first 10 live transactions.
- Resend Dashboard → **Logs** → confirm confirmation emails are being delivered.
- Supabase **Database → bookings** → quick scan for rows stuck in `pending` longer than 30 min. Those are users who abandoned at step 3 — fine, but flag if the percentage is very high.
- Vercel → **Logs** → filter for `/api/webhooks/stripe` and `/api/checkout`. Watch for 4xx / 5xx.

---

## 7. Outstanding items (not blockers, but worth scheduling)

- **Admin booking view** — `/app/admin/` already exists. Add a bookings list + detail for ops. Currently bookings are visible only in Supabase.
- **Refund flow** — you advertise 48-hour free cancellation. MVP: refund manually in Stripe Dashboard, then mark the row `status='refunded'` via SQL. Post-MVP: self-serve cancel button in the user's `/profile`.
- **Rate limit `/api/checkout`** — no throttle today. Someone could hammer it to create thousands of PaymentIntents. Add an IP-based throttle (Vercel middleware or `@upstash/ratelimit`).
- **Jamaica GCT (15%)** — confirm with your accountant whether MAPL owes GCT on tours sold via the platform. If yes, surface on the order summary and reconcile with Stripe.
- **Stripe Connect** — if you want automatic split payouts to operators, migrate to Connect. Single-merchant for now is fine; you pay operators manually on a schedule.

---

## Fast reference — env vars

| Var | Scope | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | server | Stripe API |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client | Stripe Elements |
| `STRIPE_WEBHOOK_SECRET` | server | signature verification on `/api/webhooks/stripe` |
| `RESEND_API_KEY` | server | email dispatch |
| `EMAIL_FROM` | server | from-address on outbound |
| `EMAIL_SUPPORT` | server | reply-to fallback |
| `OPERATIONS_EMAIL` | server | operator alert recipient (new) |
| `NEXT_PUBLIC_SUPABASE_URL` | both | Supabase client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Supabase anon |
| `SUPABASE_SERVICE_ROLE_KEY` | server | bookings insert from webhook |
| `SUPABASE_WEBHOOK_SECRET` | server | Supabase → Next webhooks (video rewards) |
| `NEXT_PUBLIC_SITE_URL` | both | canonical URLs in emails / OG tags |
