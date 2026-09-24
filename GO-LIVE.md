# Go-Live Checklist — Payments

Run through this in order before accepting real money — and re-run the relevant
section after any payments change. The deploy target is **Netlify**
(`netlify.toml`, `@netlify/plugin-nextjs`); anywhere an older version of this
doc said Vercel, it meant the Netlify UI.

---

## 1. Stripe keys

**Rule: live keys live ONLY in Netlify's production environment. Local
`.env.local` carries TEST keys (`sk_test_…` / `pk_test_…`), always.**

A live secret key in `.env.local` means every local `next dev` session can mint
real PaymentIntents, and the smoke test below would charge real cards. If a
live key has ever sat in a local file, rotate it (Stripe Dashboard →
Developers → API keys → Roll key) and re-enter it in Netlify only.

### Local (`.env.local`, gitignored)
```
STRIPE_SECRET_KEY=sk_test_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…   # the one `stripe listen` prints, see §2
```

### Netlify
Site → **Site configuration → Environment variables** (Production scope):
- `STRIPE_SECRET_KEY` = sk_live_…
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = pk_live_…
- `STRIPE_WEBHOOK_SECRET` = whsec_… (from §2)
- `OPERATIONS_EMAIL` = comma-separated ops recipients
- `CRON_SECRET` = the shared secret the scheduled functions send (as an
  `Authorization: Bearer` header) to `/api/abandoned-cart`, `/api/dayof`,
  `/api/review-requests`

Redeploy after changing env vars — Netlify functions read them at deploy time.

---

## 2. Stripe webhook

Endpoint is wired at **`/api/webhooks/stripe`**
([app/api/webhooks/stripe/route.ts](app/api/webhooks/stripe/route.ts)). Register it in Stripe:

1. **Stripe Dashboard → Developers → Webhooks → Add endpoint.**
2. URL: `https://mapltours.com/api/webhooks/stripe`
3. Events to send — all FOUR:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
   - `charge.refunded` — **without this, a refund issued from the Stripe
     Dashboard never reaches the database**: the booking stays `paid`, the
     guest stays on the driver's schedule, and gift-share credits are never
     returned. The handler for it already ships; it just needs the
     subscription.
4. Copy the **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET` in
   Netlify.
5. **Send test webhook** → `payment_intent.succeeded` → Netlify function logs
   (Site → Logs → Functions) should show `received: true`.
6. **Verify the refund path end to end**: make a test-mode charge, refund it
   from the Dashboard, and confirm the booking row flips to `refunded`.

### Local testing
```
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
`stripe listen` prints a local `whsec_…` for `.env.local`.

### Safety net
The hourly abandoned-cart sweep also acts as a reconciliation alarm: any
booking whose PaymentIntent has **succeeded** while the row still says
`pending` (a missed/misconfigured webhook) triggers an "ACTION NEEDED" ops
email, repeating hourly until the row is healed. Heal by re-sending the event
from Stripe (Webhooks → endpoint → event → Resend).

---

## 3. Supabase migrations

Apply everything under [supabase/migrations](supabase/migrations) in numeric
order — `supabase db push`, or paste files into the SQL editor. All are
idempotent. The checkout APIs query a schema-health view and short-circuit
with a 503 if the core payment migrations are missing.

The payments-critical set:

| Migration | What it adds | Required by |
|---|---|---|
| 005 | booking status columns, `cart_hash`, unique index on `stripe_payment_id` | tour checkout |
| 006 | `booking_type`, transfer item columns | transfer checkout |
| 007 | unique partial pending index + `bookings_schema_health` view | concurrency safety + schema guard |
| 008 | `recovery_email_sent_at` + recovery columns | §2 safety-net sweep — `/api/abandoned-cart` 500s without it, so the reconciliation alarm never runs |
| 010, 023 | `attribution`, `pickup_time` | needed for the verify below to read all-true |
| 015–017 | refund quotes, cancellation emails, admin refund approval | refund flow |
| 018–019 | gift cards + gift refund split | gift purchases |
| 020 | `booking_items.line_total` | tour checkout item insert — hard 500 ("Could not persist cart items") without it, and **NOT checked by `bookings_schema_health`** |
| 025 | `replace_booking_items` RPC | atomic item replacement (degrades to a logged fallback, but the fallback still needs 020) |
| 028 | `waiver_accepted_at` + view refresh | waiver stamping (optional-write: deploys before it degrade gracefully) |

**Verify:**
```sql
select * from public.bookings_schema_health;
```
Every column must read `true` (including `has_waiver` once 028 is applied).

The view does **not** verify `booking_items.line_total` (020) or the recovery
columns (008) — confirm those two directly:
```sql
select line_total from public.booking_items limit 0;
select recovery_email_sent_at from public.bookings limit 0;
```
(Both statements error if the column is missing, and return silently if not.)

---

## 4. Email

Resend via `RESEND_API_KEY` and [lib/email/send.ts](lib/email/send.ts). Templates:

- [emails/BookingConfirmed.tsx](emails/BookingConfirmed.tsx) — traveler voucher (webhook)
- [emails/TransferConfirmed.tsx](emails/TransferConfirmed.tsx) — transfer voucher (webhook)
- [emails/OperatorBookingAlert.tsx](emails/OperatorBookingAlert.tsx) — internal ops alert
- [emails/OpsAlert.tsx](emails/OpsAlert.tsx) — automated incident alerts (paid-but-pending
  reconciliation, gift-covered email failures)

Env vars: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_SUPPORT`, `OPERATIONS_EMAIL`.
Verify the sending domain (SPF, DKIM, DMARC) in Resend → **Domains**.

---

## 5. Smoke-test end to end

**In TEST mode, locally** (never with live keys — see §1):

1. `npm run dev` + `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
2. Add 2 experiences to the cart → `/checkout`.
3. Step 1: date, travelers, contact fields, **tick the waiver** → continue.
   (The server now refuses tour checkouts without the waiver tick.)
4. Supabase table editor: a `bookings` row appears with `status='pending'`
   and, post-028, `waiver_accepted_at` set.
5. Step 2: pay with `4242 4242 4242 4242`, `12/30`, `123`.
6. After confirmation:
   - `bookings.status` → `paid`, `paid_at` set; `booking_items` rows present
   - traveler + ops emails arrive (Resend logs)
   - `/checkout/confirm?payment_intent=…` renders the success view
7. **3DS:** `4000 0025 0000 3155` → complete the challenge → confirm page.
8. **Decline:** `4000 0000 0000 0002` → payment fails, row → `failed`, no email.
9. **Double-click:** two fast submits → exactly one `bookings` row (unique
   pending index + per-row idempotency key).
10. **Refund:** Dashboard-refund the test charge → row → `refunded` (needs the
    `charge.refunded` subscription from §2).
11. **Transfers:** repeat 2–6 via `/transfers` → `/transfers/checkout`.

---

## 6. Post-go-live monitoring

- Stripe Dashboard → **Payments** — watch the first live transactions.
- Stripe Dashboard → **Webhooks** — delivery success rate; investigate any 4xx/5xx.
- Resend → **Logs** — confirmation delivery.
- Supabase `bookings` — rows stuck in `pending` > 30 min (the hourly sweep
  emails ops automatically if any of them are actually PAID).
- Netlify → **Logs → Functions** — filter `/api/webhooks/stripe`,
  `/api/checkout`, and the three scheduled functions (`abandoned-cart-cron`,
  `dayof-cron`, `review-request-cron`).

---

## 7. Outstanding items (not blockers, but worth scheduling)

- **Jamaica GCT (15%)** — confirm with the accountant whether GCT is owed on
  tours sold via the platform. Nothing collects tax today.
- **Consent banner** — DNT/GPC signals are honoured (no trackers load for
  those visitors), but there is no consent-mode banner. If EU/UK traffic
  becomes material, add one; Hotjar is the sharpest edge.
- **Capacity model** — nothing caps bookings per date beyond the per-day hour
  limit; a busy date can still over-commit the single-driver fleet. Needs an
  owner decision on real capacity before building.
- **Rate limiting** — the in-process IP throttle on checkout resets per
  function instance. Durable limiting (Upstash or similar) if abuse appears.
- **Stripe Connect** — for automatic split payouts to operators; manual
  Remitly payouts are fine at current volume.

---

## Fast reference — env vars

| Var | Scope | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | server | Stripe API (test locally, live only in Netlify) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client | Stripe Payment Element |
| `STRIPE_WEBHOOK_SECRET` | server | signature verification on `/api/webhooks/stripe` |
| `CRON_SECRET` | server | auth for the three cron-called endpoints (sent as a Bearer header) |
| `RESEND_API_KEY` | server | email dispatch |
| `EMAIL_FROM` | server | from-address on outbound |
| `EMAIL_SUPPORT` | server | reply-to fallback |
| `OPERATIONS_EMAIL` | server | ops alert recipients (comma-separated) |
| `NEXT_PUBLIC_SUPABASE_URL` | both | Supabase client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Supabase anon |
| `SUPABASE_SERVICE_ROLE_KEY` | server | bookings writes from routes + webhook |
| `SUPABASE_WEBHOOK_SECRET` | server | Supabase → Next webhooks (video rewards) |
| `NEXT_PUBLIC_SITE_URL` | both | canonical URLs in emails / OG tags |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | server | ops calendar sync (paid bookings → "MAPL Bookings" Google Calendar) |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | server | ops calendar sync — PEM with `\n` escapes, double-quoted |
| `GOOGLE_BOOKINGS_CALENDAR_ID` | server | ops calendar sync — the shared calendar's id |
| `GOOGLE_DRIVE_CLIPS_FOLDER_ID` | server | optional override of the Drive folder guest clips archive into (same service account; share the folder with it as Editor) |
| `TIKTOK_CLIENT_KEY` | server | TikTok Login Kit (guest account linking); absent = flow dormant |
| `TIKTOK_CLIENT_SECRET` | server | TikTok Login Kit client secret |
| `TIKTOK_REDIRECT_URI` | server | must exactly match the URI registered with TikTok |
| `NEXT_PUBLIC_TIKTOK_ENABLED` | client | `1` shows the Connect TikTok button on the profile page |

Calendar sync setup (already done once, recorded here for rebuilds): Calendar
API enabled on the `mapl-tours` Google Cloud project; the service account
created the "MAPL Bookings" calendar (`America/Jamaica`) and shared it with
`contact@mapltours.com` as owner. The Stripe webhook inserts events on
payment success and removes them on refund; all three vars unset simply
disables the sync — it never blocks a payment.
