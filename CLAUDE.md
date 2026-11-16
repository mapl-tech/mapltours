# MAPL Tours — Claude Code Project Bible

> Build an experiential travel platform focused on Jamaica. Users discover experiences through vertical video reels (like YouTube Shorts), build an itinerary by tapping "+", and check out like Shopify. The aesthetic blends Snapchat's social dark UI with TikTok's reel format and Wander.com's travel polish.

---

## Stack

- **Framework**: Next.js 14 (App Router, TypeScript)
- **Styling**: Tailwind CSS + CSS custom properties (design tokens in `globals.css`)
- **State**: Zustand with `persist` middleware (localStorage cart)
- **Fonts**: `next/font/google` — `Syne` (700, 800) for headings/prices, `DM_Sans` (300–600) for all UI
- **Animation**: Framer Motion for page transitions and cart slide-ins; CSS keyframes for micro-interactions
- **Icons**: No icon library — use emoji and Unicode symbols throughout
- **Payments**: Stripe PaymentIntents + Payment Element — **LIVE, real charges**. Server-priced checkout (`app/api/checkout`, `app/api/transfers/checkout`, `app/api/gifts/checkout` — gift-card purchases mint live PaymentIntents too), fulfillment via the Stripe webhook (`app/api/webhooks/stripe`), Supabase `bookings` as ground truth. Anything touching these paths moves real money — see GO-LIVE.md before changing them.

---

## Project Structure

```
mapl-tours/
├── app/
│   ├── layout.tsx            # Root layout: fonts, metadata, LeftNav wraps all pages
│   ├── globals.css           # Design tokens + utility classes
│   ├── page.tsx              # / → FeedView + ItineraryPanel
│   ├── explore/page.tsx      # /explore → ExploreView + ItineraryPanel
│   ├── checkout/page.tsx     # /checkout → CheckoutView (no panel)
│   └── profile/page.tsx      # /profile → ProfileView
├── components/
│   ├── LeftNav.tsx           # Snapchat-style 66px vertical nav with cart badge
│   ├── FeedView.tsx          # scroll-snap container, scroll tracking
│   ├── ReelCard.tsx          # Individual reel: gradient bg, overlays, action buttons
│   ├── ExploreView.tsx       # Search + category/parish filters + 2-col grid
│   ├── ItineraryPanel.tsx    # 300px right drawer, renders null when cart empty
│   ├── ProfileView.tsx       # User stats, saved creators, past trips
│   └── checkout/
│       └── CheckoutView.tsx  # 2-step: DetailsStep → Stripe Payment Element; confirm lives at /checkout/confirm
├── lib/
│   ├── experiences.ts        # All Jamaica experience data + types + CATEGORY_COLORS
│   └── cart.ts               # Zustand store
└── public/
    └── og-image.png
```

---

## Design System

### Aesthetic Direction
**Dark Immersive Premium** — feels like opening Netflix at midnight, but for Jamaican adventures. Every gradient should make you want to book a flight. Rooted in Jamaican culture, not a resort brochure. Editorial, cinematic, social-native.

### Typography Rules
- **Headings, prices, logo**: `font-family: var(--font-syne)` — weight 700 or 800 only
- **All other text**: `font-family: var(--font-dm-sans)` — weight 300–600
- **Never**: Arial, Inter, system-ui, Roboto

### CSS Custom Properties (globals.css)

```css
:root {
  --bg:            #08080A;
  --nav-bg:        #0F0F12;
  --card-bg:       #141418;
  --card-hover:    #1C1C22;
  --border:        rgba(255, 179, 0, 0.12);
  --border-subtle: rgba(255, 255, 255, 0.08);
  --gold:          #FFB300;
  --gold-dim:      rgba(255, 179, 0, 0.15);
  --green:         #00A550;
  --green-dim:     rgba(0, 165, 80, 0.15);
  --caribbean:     #006994;
  --coral:         #FF5A36;
  --text-primary:  #FFFFFF;
  --text-secondary:rgba(255, 255, 255, 0.60);
  --text-muted:    rgba(255, 255, 255, 0.35);
}
```

### Category Colors

```ts
export const CATEGORY_COLORS: Record<ExperienceCategory, string> = {
  Adventure: '#FF5A36',
  Nature:    '#00A550',
  Music:     '#FFB300',
  Food:      '#FF7A3D',
  Culture:   '#8B5CF6',
  Water:     '#006994',
}
```

### Destination Gradients (170deg, 3 stops)

```ts
"Negril (Cliff/Sunset)":  "linear-gradient(170deg, #003B5C 0%, #006994 52%, #00B4D8 100%)"
"Blue Mountains":         "linear-gradient(170deg, #0D2B1B 0%, #1B5E3B 52%, #7B9E3B 100%)"
"Kingston (Music)":       "linear-gradient(170deg, #1A0A00 0%, #4B2A00 52%, #FFB300 100%)"
"Boston Bay (Jerk)":      "linear-gradient(170deg, #3D0A00 0%, #8B1A00 52%, #D4521A 100%)"
"Ocho Rios":              "linear-gradient(170deg, #003D2E 0%, #006B52 52%, #00A878 100%)"
"Nine Mile (Marley)":     "linear-gradient(170deg, #1A2A00 0%, #3A5A00 52%, #7B9B1A 100%)"
"Treasure Beach":         "linear-gradient(170deg, #2B1500 0%, #7B4500 52%, #D4921A 100%)"
"Port Antonio":           "linear-gradient(170deg, #0A2B0A 0%, #1A5B1A 52%, #2B8B5B 100%)"
"Negril (Snorkel)":       "linear-gradient(170deg, #002B5B 0%, #0066A0 52%, #00B4D8 100%)"
"Kingston (Food)":        "linear-gradient(170deg, #2B0A1A 0%, #6B1A3A 52%, #C4455A 100%)"
```

### Required CSS Classes in globals.css

```css
/* Feed */
.feed-container {
  overflow-y: scroll;
  scroll-snap-type: y mandatory;
  scrollbar-width: none;
  height: 100dvh;
}
.reel-card {
  scroll-snap-align: start;
  scroll-snap-stop: always;
  height: 100dvh;
  position: relative;
  overflow: hidden;
}

/* Buttons */
.btn-primary { background: var(--gold); color: #000; font-weight: 700; border-radius: 9999px; border: none; cursor: pointer; transition: all 0.2s ease; font-family: var(--font-dm-sans); }
.btn-primary:hover { filter: brightness(1.08); transform: scale(1.02); }
.btn-primary:active { transform: scale(0.97); }

.btn-ghost { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); border-radius: 9999px; border: 1px solid rgba(255,255,255,0.12); cursor: pointer; transition: all 0.2s ease; }
.btn-ghost:hover { background: rgba(255,255,255,0.14); color: white; }

/* Inputs */
.field-input { width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10); border-radius: 10px; padding: 12px 14px; color: white; font-size: 14px; outline: none; transition: border-color 0.2s ease; font-family: var(--font-dm-sans); }
.field-input:focus { border-color: var(--gold); }
.field-input::placeholder { color: var(--text-muted); }

/* Story segments */
.story-segment { flex: 1; height: 2.5px; border-radius: 2px; background: rgba(255,255,255,0.28); transition: background 0.4s ease; }
.story-segment.active { background: white; }

/* Tags */
.tag { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.8); font-size: 11px; font-weight: 500; white-space: nowrap; }

/* Surface card */
.surface-card { background: var(--card-bg); border: 1px solid var(--border-subtle); border-radius: 16px; }

/* Horizontal scroll row */
.scroll-x { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }

/* Animations */
@keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideInRight { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
@keyframes heartPop { 0% { transform: scale(1); } 40% { transform: scale(1.5); } 100% { transform: scale(1); } }
@keyframes ringPulse { 0% { box-shadow: 0 0 0 0 rgba(255,179,0,0.5); } 70% { box-shadow: 0 0 0 12px rgba(255,179,0,0); } 100% { box-shadow: 0 0 0 0 rgba(255,179,0,0); } }

.animate-fade-up { animation: fadeUp 0.4s ease forwards; }
.animate-slide-right { animation: slideInRight 0.35s ease forwards; }
.animate-heart-pop { animation: heartPop 0.3s ease; }
.stagger-1 { animation-delay: 0.05s; }
.stagger-2 { animation-delay: 0.10s; }
.stagger-3 { animation-delay: 0.15s; }
.stagger-4 { animation-delay: 0.20s; }
```

---

## Data Model

### Experience Type

```ts
// lib/experiences.ts
export type ExperienceCategory = 'Adventure' | 'Nature' | 'Music' | 'Food' | 'Culture' | 'Water'

export interface Experience {
  id: number
  destination: string     // "Negril"
  parish: string          // "Westmoreland"
  title: string
  price: number           // per person USD
  duration: string        // "4 hrs"
  rating: number          // 4.7–5.0
  reviews: number
  category: ExperienceCategory
  creator: string         // handle without @
  followers: string       // "287K"
  gradient: string        // CSS gradient
  emoji: string           // thumbnail placeholder
  description: string     // 1–2 sentence reel card copy
  tags: string[]          // 3 short pills
  highlights?: string[]   // 4 bullet points
}
```

### Cart Item & Zustand Store

```ts
// lib/cart.ts
export interface CartItem extends Experience {
  travelers: number   // default 2
  date: string        // ISO date, default today+14
}

interface CartStore {
  items: CartItem[]
  addItem:         (exp: Experience) => void   // idempotent
  removeItem:      (id: number) => void
  updateTravelers: (id: number, travelers: number) => void
  updateDate:      (id: number, date: string) => void
  clearCart:       () => void
  isInCart:        (id: number) => boolean
  subtotal:        () => number                // sum(price * travelers)
  fee:             () => number                // Math.round(subtotal * 0.05)
  grandTotal:      () => number                // subtotal + fee
}
// Use persist middleware, key = 'mapl-cart'
```

---

## Jamaica Experiences (10 total)

Populate `lib/experiences.ts` with exactly these:

| # | Destination | Parish | Title | $ | Dur | Cat | Creator | Emoji |
|---|---|---|---|---|---|---|---|---|
| 1 | Negril | Westmoreland | Rick's Cafe Cliff Diving & Sunset | 85 | 4 hrs | Adventure | yardie.adventures / 287K | 🌊 |
| 2 | Blue Mountains | St. Andrew | Sunrise Coffee Trek & Farm Tasting | 120 | 6 hrs | Nature | peak.jamaica / 94K | ☕ |
| 3 | Kingston | Kingston | Reggae Roots: Studio Session & Sound System | 95 | 3 hrs | Music | irie.kingston / 421K | 🎵 |
| 4 | Boston Bay | Portland | Jerk Pit Master Class with Devon | 75 | 4 hrs | Food | jerk.legend / 156K | 🔥 |
| 5 | Ocho Rios | St. Ann | Dunn's River Falls & Hidden Blue Hole | 110 | 5 hrs | Adventure | ochorios.vibes / 203K | 💧 |
| 6 | Nine Mile | St. Ann | Bob Marley Heritage Pilgrimage | 145 | Full day | Culture | roots.culture / 312K | 🌿 |
| 7 | Treasure Beach | St. Elizabeth | Sunrise Fishing with Local Fishermen | 65 | 3 hrs | Culture | trench.treasure / 67K | 🎣 |
| 8 | Port Antonio | Portland | Rio Grande Bamboo Rafting | 130 | 3 hrs | Nature | portantonio.raft / 88K | 🎋 |
| 9 | Negril | Westmoreland | Seven Mile Beach Snorkel & Rum Punch | 90 | 3 hrs | Water | negril.watersports / 145K | 🤿 |
| 10 | Kingston | Kingston | Kingston Street Food & Market Crawl | 55 | 3 hrs | Food | eat.kingston / 198K | 🍖 |

---

## Component Specs

### app/layout.tsx
- Load `Syne` and `DM_Sans` via `next/font/google`, expose as CSS vars `--font-syne` and `--font-dm-sans`
- Body: `overflow: hidden`, background `#08080A`
- Outer wrapper: `display:flex; height:100dvh`
- Children: `<LeftNav />` + `<main style={{flex:1, overflow:'hidden'}}>{children}</main>`
- Metadata: title "MAPL Tours — Experience Jamaica Like a Local", themeColor "#08080A"

### LeftNav
- `'use client'` — uses `usePathname()` and `useCartStore`
- `width: 66px`, `height: 100dvh`, `background: var(--nav-bg)`, `border-right: 1px solid var(--border-subtle)`
- **Top**: logo — Syne 800, `color: var(--gold)`, links to `/`
- **Nav items** (44x44px, `border-radius: 12px`):
  - `>` -> `/` (Feed)
  - `O` -> `/explore` (Explore)
  - `@` -> `/profile` (Profile)
  - Active: `background: rgba(255,179,0,0.15)`, `border: 1px solid rgba(255,179,0,0.3)`, `color: var(--gold)`
  - Inactive: `color: rgba(255,255,255,0.4)`, transparent border
  - Hover tooltip label to the right of each icon
- **Bottom**: Cart icon (only when `items.length > 0`) with gold badge count, links to `/checkout`

### FeedView
- `'use client'`
- Container: `className="feed-container"`, `flex: 1`
- Each reel: `<div style={{height:'100dvh', scrollSnapAlign:'start'}}>` -> `<ReelCard />`
- Track `currentIndex` via `scroll` event: `Math.round(el.scrollTop / el.clientHeight)`
- Like state: `useState<Set<number>>`, passed to each ReelCard

### ReelCard
Layers (bottom to top):

1. Full-card gradient background (`background: exp.gradient`)
2. Radial highlight: `radial-gradient(ellipse at 50% 42%, rgba(255,255,255,0.04), transparent 65%)` — pointer-events none
3. Top scrim (z=2): `linear-gradient(180deg, rgba(0,0,0,0.72), transparent)`, height 200px, position absolute top
4. Bottom scrim (z=2): `linear-gradient(0deg, rgba(0,0,0,0.92), transparent)`, height 340px, position absolute bottom
5. **Story segments** (z=3): `position:absolute, top:16px, left:16px, right:16px` — flex row of segments, filled if `i <= currentIndex`
6. **Creator row** (z=3): `position:absolute, top:36px, left:16px` — gradient avatar circle + @handle + follower count + "Follow" ghost button
7. **Center emoji** (z=1): `position:absolute, top:50%, left:50%, transform:translate(-50%,-58%)`, fontSize 110px, `filter: drop-shadow(0 12px 48px rgba(0,0,0,0.5))`
8. **Right action column** (z=3): `position:absolute, right:14px, bottom:210px` — 3 action buttons stacked with 20px gap
9. **Bottom info** (z=3): `position:absolute, bottom:0, left:0, right:80px, padding: 0 18px 22px`

**Action button component**: 48x48px circle (`rgba(255,255,255,0.12)`, `backdropFilter:blur(12px)`, `border: 1px solid rgba(255,255,255,0.18)`) + label below. Buttons: like, add, share.

**Bottom info layout**:
- Category badge (colored pill, `catColor` bg) + destination, parish
- Title: Syne 700, fontSize 20
- rating (reviews) + duration
- Tag pills (`.tag` class), 3 tags
- Price row: "FROM" label (tiny uppercase) + `$XX` (Syne 800, 24px) + `/person` + spacer + CTA button
- CTA: `btn-primary`, gold when not in cart -> green when in cart; text "Add to Itinerary" / "Added to Trip"

### ExploreView
- `'use client'`, filters: category, parish, search (all local state with `useMemo` for filtering)
- **Sticky header** (`background: var(--nav-bg)`):
  - Title "Explore Jamaica" (Syne 700, 20px)
  - Search bar: rounded-full, search icon + text input
  - Category pills: `['All','Adventure','Nature','Music','Food','Culture','Water']` — active = gold bg
  - Parish pills: `['All Parishes','Kingston','St. Andrew','St. Ann','Westmoreland','Portland','St. Elizabeth']` — active = green tint
- **Grid**: `display:grid, gridTemplateColumns:'1fr 1fr', gap:12px`
- **ExploreCard**: aspect ratio 0.78, gradient bg, emoji centered (fontSize 60px), bottom overlay with category, title, price, "+ Add" button. Hover: `translateY(-4px) scale(1.01)` + box-shadow.
- Empty state: "No experiences found."

### ItineraryPanel
- `'use client'`, returns `null` if `items.length === 0`
- `width:300px, height:100dvh, background:var(--nav-bg), border-left:1px solid var(--border-subtle), flex-shrink:0`
- `className="animate-slide-right"` on mount
- **Header**: "Your Itinerary" (Syne 700) + "{n} experience(s) - Jamaica trip"
- **Item rows**: 58px gradient thumbnail + title (truncated) + destination - duration + `$price x travelers` in gold + remove button
- **Footer** (`border-top`): Subtotal + Booking fee (20%, see `lib/checkout-pricing.ts`) + Total (Syne 800, gold) + "Checkout" `btn-primary` full-width -> href="/checkout" + "Flexible cancellation within 48 hrs of booking" note

### CheckoutView (2-step, REAL payments)

> The MVP-era description of a 3-step shell with a fake card form and
> `setConfirmed(true)` is long gone. The current flow moves real money:

- **Step 1 (details)**: trip date + traveler counters (clamp 1-12), contact
  fields, special requests, and the **liability waiver checkbox** — the
  advance to step 2 is blocked until every required field and the waiver
  validate. The server check is narrower than it sounds: `/api/checkout`
  refuses a tour checkout only when `waiverAccepted` is PRESENT and not
  `true`. A request that leaves the field out is still priced and gets a
  pending row and a PaymentIntent (or, fully gift-covered, a paid booking),
  just without the stamp; the one-page
  quiet save omits it on purpose, and Pay sends `true`.
  `waiver_accepted_at` (migration 028) is stamped only on a request that
  carries `waiverAccepted: true`, so the stamp, not a server gate, is the
  evidence. Making it a hard require would break the quiet save.
- **On entering step 2**: POST `/api/checkout` — the server re-prices the
  cart from the catalog (never trusts client amounts), enforces the 12h lead
  time and the 8h/day cap, inserts a `pending` booking row (atomic on the
  unique `(cart_hash, booking_type)` partial index), mints a PaymentIntent
  (idempotency-keyed per booking row), and returns its `clientSecret`.
- **Step 2 (payment)**: Stripe **Payment Element** (`StripePaymentPanel`) —
  card / Apple Pay, `confirmPayment` with a `return_url` of
  `/checkout/confirm`. A fully-gift-covered tour cart shortcuts straight to
  confirmation with no PaymentIntent — but buying a gift card itself
  (`app/api/gifts/checkout`) always mints one.
- **Fulfillment** happens in the webhook (`app/api/webhooks/stripe`):
  pending→paid CAS flip, traveler + operator emails (Resend), reward
  consumption, calendar sync. The confirm page renders from Stripe +
  Supabase; GA4 `purchase` fires there, deduped by booking ref.

### One-page checkout (Sept 2026, REAL payments)

`app/checkout` and `app/transfers/checkout` now render `components/checkout/one-page/OnePageCheckout.tsx` and `components/transfers/one-page/OnePageTransfersCheckout.tsx`. The two-step views above are no longer mounted. Shape, top to bottom: the trip or ride (editable), the guest's details, payment with the terms line and one pay button. Shared pieces live in `components/checkout/one-page/` (`DeferredPaymentPanel`, `fields`, `useHydrated`) and the pure form rules in `lib/checkout-form.ts` (tested in `tests/unit/checkout-form.spec.ts`).

Rules, enforced in code:
- **The server contract is unchanged.** Both pages POST the same bodies to `/api/checkout` and `/api/transfers/checkout` as the old views did; the server still prices the cart, owns the pending row, mints and reuses the PaymentIntent, and the webhook still flips paid. The only client-side novelty is Stripe's deferred-intent flow: the Payment Element and Apple/Google Pay mount with `{ mode: 'payment', amount, currency }` before any intent exists; on Pay we run our validation, `elements.submit()`, create or reuse the intent, `elements.update({ amount })` to the server's `amountDue`, then `confirmPayment`. Do not pass `paymentMethodTypes` to Elements: the server mints intents with automatic payment methods and Stripe refuses to confirm across the two configurations.
- **Save early.** Once the details are complete (contact, place, date; legs for transfers) the page quietly creates the pending booking after 2.5 s, so an abandoned checkout is visible in the admin and to the recovery email. On transfers the same order key means the Pay tap reuses that intent instead of POSTing again. On tours the quiet save leaves `waiverAccepted` out (so the server neither refuses nor stamps it), and the order key includes the waiver, so Pay POSTs once more with `waiverAccepted: true`; the server hands back the same row and intent by cart hash and stamps `waiver_accepted_at` on it.
- **One POST at a time, and a changed order supersedes.** Both pages send through `components/checkout/one-page/intent-session.ts` and read every answer with `readCheckoutAnswer` (`lib/checkout-form.ts`); do not add a second fetch path. The session reuses the same order's intent, shares a request already on the wire, and sends one POST at a time, so a Pay tap waits for a quiet save in flight. A POST for a changed order (party, date, email, a code, the reward) carries `supersedeBookingId` naming the newest booking any answer issued, success or refusal; it is never part of the order key. The server cancels that row and its intent only if it is still pending or declined and the requester's own, and skips it when it is the row it answers with. On a 409 `rewardConflict` the tour page unticks the reward and shows the repriced total above the Pay button; it never retries for the guest. Before confirming, the panel reads the intent back from Stripe (`payableIntent`): one another tab canceled is asked for once more with `fresh` instead of being confirmed. Tested in `tests/unit/one-page-supersede.spec.ts`, partly against the real tour route.
- **Never "Your itinerary is empty" before the cart has loaded.** `useHydrated` renders a loading card until zustand persist reports hydration; it is false on the server and on the first client render so SSR and hydration always agree (`store.persist` does not exist without localStorage).
- **Fewer decisions.** No pickup-time field on tours (the operator sets it; the page says so), no country field (Stripe reads it from the card), the note and the day builder are collapsed. Transfers ask for the time the flight home DEPARTS and derive the hotel pickup from `MIN_PICKUP_LEAD_MIN`; the guest can adjust it. Flight numbers stay required for every leg the ride has because the server requires them.
- **Mobile.** 16px inputs (no iOS zoom), 44px targets on every standalone control, the order summary inline before payment, and a bottom bar with the total that shows only while the payment card is off screen. From 900px the summary is a sticky rail.
- **Testing.** Walk it on the dev server (`:3100`) with an `@example.com` email; a test card on the live key produces a clean decline and proves the intent path without charging. Remove the rows you created (and cancel their PaymentIntents) afterwards. Never complete the details form on production: that creates a live pending row and intent.

### Purchase matching for Meta and GA4 (Oct 2026)

A paid booking reaches Meta's dataset 0055 three ways under one event id, the booking ref: the pixel on the confirm page, the pixel's Conversions API Gateway relay (OpenBridge, an AWS and a Cloud Run endpoint, operator unknown since Oct 6), and the Stripe webhook's own Conversions API call (`lib/meta-capi.ts`). Event Match Quality for Purchase was 6.1 (IP, browser, `_fbp` only) because the copy Meta keeps carried no email.

- **One normaliser for both halves,** `lib/meta-match.ts`. Email lowercased. Phone to digits with the country code: ten NANP digits get the 1, `+`/`00` carries its own, `(0)` after a country code and a trailing extension are dropped, anything else is left out. Names are lowercase letters only. Country is ISO-2. `external_id` is the normalised email. `tests/unit/meta-match.spec.ts` pins the server's digests to the ones the live pixel produced.
- **Server:** hashed em, ph, fn, ln, country, external_id, plus fbp/fbc. No IP or full user agent, because the booking keeps neither (deliberate, `lib/attribution`). Adding them would change both checkout routes and the privacy page: owner's call.
- **Browser:** `DeferredPaymentPanel` calls `rememberPurchaseMatch` synchronously right before `confirmPayment`, and on the gift-covered and already-paid paths. It stores the normalised fields in sessionStorage (`mapl-meta-match`, bound to the booking ref, never for DNT/GPC). A decline or a failed confirm calls `forgetPurchaseMatch`; a redirect payment that fails at the bank never returns to the panel, so its entry waits in the tab (bound to that booking) until the next Pay or the tab closes. On the confirm page, `trackPurchase` takes them once (always deleting; 6 h limit; another booking's are dropped) and calls `fbq('init', META_PIXEL_ID, fields)` right before the Purchase. The confirm pages still never print contact details.
- **What the pixel then does is in the privacy page; change the two together** (`tests/unit/privacy-processors.spec.tsx` pins the copy). It keeps those details for every later event as the guest moves around the site, until a reload or the tab closes, because a third init is refused as a duplicate. The phone goes to the pixel with a leading `+`, or fbevents prefixes the Gateway's alternate copy with the browser locale's country code. 0055's automatic matching, which predates this, also sends typed details on a button or link tap.
- **Never send a "test" Purchase to 0055** to check the format: Meta counts test events for ads. Verify on the next real sale instead: the Dataset Quality API (`dataset_quality?dataset_id=1607953960710055`) for match keys, and the pixel `stats` with `aggregation=custom_data_field` (only the server copy carries `order_id`). The webhook logs Meta's rejection reason and any warnings.
- **GA4** gets the purchase from gtag on the confirm page and from the webhook's Measurement Protocol call (`lib/ga4-server.ts`, `GA4_API_SECRET`), deduped on `transaction_id`. Both skip opted-out guests, and GA never receives contact details.

### Confirmation pages are private (Oct 31 2026)

The confirmation address carries the PaymentIntent id (or a gift-covered booking's id), and GA4, the Meta pixel and Hotjar all record page addresses, so anyone holding a guest's link used to see their name, hotel, flights and pickup times. `/transfers/confirm` and `/checkout/confirm` now show the trip only to a browser that proves it booked it, or to a guest signed in as the booking's owner; everyone else gets `components/checkout/PrivateConfirmation.tsx` (booked, the reference, "Sign in to see my trip" to `/login?redirect=%2Fprofile`).

- **The proof** is one HttpOnly cookie, `mapl_trip` (`lib/confirm-proof.ts`): a signed booking proof that both checkout routes attach to any answer naming a booking (`withConfirmProof` wraps their POST; the answer itself never changes), and the client secret Stripe appends to a redirect return, which the middleware now keeps in the cookie instead of discarding (still never in the address).
- **Signed in**: the same ownership rule as `/api/profile/bookings` (linked `user_id`, or the booking email once verified), in `canSeeConfirmation`.
- `ConfirmClient` (cart clear, purchase events) renders only in the full view, so opening someone's link never reports a sale.
- **Gift codes too:** the middleware also keeps the client secret on `/gifts`, `StripePaymentPanel` hands it over after a payment that needed no redirect, and `/api/gifts/reveal` refuses (403) any request whose proof cookie lacks that intent's secret, before it says anything about the payment (`gift-reveal-route.spec.ts`). The 30-minute window still applies.
- **Sign-in is Google or email** (Apple is not enabled in Supabase, so its button was removed). A guest sees their bookings once their email is verified; `mailer_autoconfirm` is off, which that rule depends on.
- Any doubt is the private view, never an error. Tested in `confirm-proof.spec.ts`, both page specs and the real tour route (`one-page-supersede.spec.ts`).

### Tour prices by pickup area, and the prices desk (Nov 2026)

Dunn's River (1), Blue Hole (2) and the both-falls package (18) are priced by where we pick the guest up (Collin, Nov 12 2026): a flat rate for 1 to `tierMax` per zone, `extraPerPerson` for each guest past it, plus `perPersonAddon` for every guest on the package. Zones, west to east: `negril`, `lucea`, `montego_bay`, `trelawny`, `runaway_bay`, `ocho_rios` (`lib/tour-zones.ts`). A zone left out of `zoneRates` is not sold online from there.

Bamboo rafting (3) and both horseback rides (8, 9) are priced **per person** by pickup area (Collin, Nov 13 2026: the raft is "$100 per person", "$90 per person" from Montego Bay and "$150 per person" from Negril; horseback is $100 everywhere and $150 from Negril). That is a `per_person` card with `zoneRates`: every guest pays the zone's rate at any party size (`isPerPersonByArea`), and `tierMax` and `extraPerPerson` are not read. The raft had been sold at $128 for a party of up to 3, which lost money on every couple.

The same day he said "all the prices I give you is from 1-4 persons not 1-3", so the first rate of every card covers 1 to 4.

Rasta ATV Safari (5), jet ski (10) and parasailing (11) are priced **per person** (Collin, Nov 14 2026, asked whether three people pay $150 together or $150 each: "Yes each individual pays $150 per person"; and the same from every pickup area: "No all areas or the same that I give"). The card is `per_person`: his sheet's first rate for each of 1 to 4 guests and its "4-more" rate each from 5 (asked what five or more pay with $140, $100 and $90 put to him: "Yes all individual activities goes per person"). They had been held as "$X for 1 to 3" for the party, which sold a couple the safari for $192 against the $300 he is owed. One thing to know: on the jet ski and parasailing five guests pay less in total than four (4 x $130 against 5 x $100), the only cards where that happens. It is his two rates, not a slip, and `collin-sheet.spec.ts` pins it.

What else he said that day, and where it stands:
- **"For all excursions it has to be 2 or more person to book any excursions."** Not enforced yet. `minGuests` exists (the zipline has 2) and only the tour email reads it; checkout, the cart and the agent tools still take a party of 1. Whether a solo guest is refused or pays for two is the owner's call (asked Nov 14 2026). Until it is built, do not describe any tour as bookable for one. The tour email (paused, `TOUR_UPSELL_ENABLED=0`) would say so unasked: `curateForStay` offers a party of one any tour but the zipline, at one guest's price, the three cards settled on Nov 14 among them. Settle this rule before that email is switched back on.
- **The clear kayak shoot is in the sea**, and the guest gets "25 or more edit pictures 3 videos with song of choice". On Nov 15 2026 he added: "Beach in Montego Bay no special beach", "Shoot take 30-35 minutes", "1-2 days time for pictures". The listing (12) and the Raft + Kayak package (17) say so; the duration stays "1 hr at the beach" because the 8-hour daily cap reads that number (`parseDurationHours`), and the shoot's 30 to 35 minutes is in the text. He agreed we may use his kayak photos; whether the woman in them has agreed herself is not known, and the site still shows stock until the owner supplies the files.
- **"Horseback Riding" is both rides**, Rose Hall is in the Montego Bay area (it already was), and to "zipline, ATV Off-Road, tubing and the clear kayak: same price from every area, or more from Negril?" he answered only "Yes"; they stay one price everywhere.
- Still unanswered: the zipline's rate for bigger groups, lunch on the full-day packages, and the hotel areas put to him (Round Hill, Green Island, Couples Tower Isle, Tryall, Meliá Braco).

Rules, enforced in code:
- **Four ways to price, one name each.** `kindOf` (`lib/tour-rates.ts`): `group`, `per_person`, `area`, `area_person`. The desk asks only for what a kind needs (per person by area: the six area rates and nothing about tiers), and `tests/unit/tour-rates-desk.spec.ts` opens every catalogue card and saves it untouched, expecting the same card back. A new shape must reach every reader in the same change: `tourOperatorCost`, `parseRateCard`, `describeRateCard`, `rateCardChanges`, the desk, `ZonePriceList`, the tour page's structured data, `llms.txt`, the agent tools.
- **A price's unit is read from the card, never typed.** `priceUnitLabel`, `ZonePriceList`, and for blog sentences `blogPrice` / `blogUnit` / `blogFrom` / `blogShare` / `blogInArea` (`lib/blog-prices.ts`). Typed sentences outlive the card: on Nov 14 2026 a post still sold the raft at "$128 for up to three" a day after it became $115 per person, and three said Nine Mile was "for up to three" after it covered four. `tests/unit/blog-tour-prices.spec.ts` reads every post: a "$123" in a sentence that links a tour must be a price that tour's card charges, and "for up to N" must be that card's number. Other people's prices are written "US$25" and are left alone. The help page's group answer reads its party size from the cards too (`GROUP_PARTY_LIMITS`).
- **A save at the prices desk must never fail the deploy that publishes it.** The desk accepts a card with any one pickup area or more, so an area can be switched off there. Nothing that loads during a build may throw because of that: a failed build leaves the old prices live and holds back every other change in the same save, with nothing on the desk to say why. A blog clause that quotes one area's price goes through `blogInArea`, which carries the wording for when that area is not sold; for a few hours on Nov 14 2026 `blogPrice` threw instead, and a simulated save (Dunn's River without Montego Bay) stopped the build. Checked with a full build under that save: 510 pages. `blog-tour-prices.spec.ts` fails when a post is on its other wording, which is the cue to rewrite the passage; tests are not part of a deploy.
- **One resolver.** `zoneOfPickup` (`lib/tour-zone-of.ts`) decides the zone for the checkout page, the checkout server, the agent tools and the tour emails alike. Precedence: a listed pickup place, then an exact transfer-hotel name, then the area the guest chose for a typed place. Text naming two areas, or none we price, gets no zone, so nobody is quoted the cheaper one by accident.
- **Checkout never guesses.** `priceTourCart` refuses a zone-priced tour without a zone it sells, in words that say what to do; the guest's area travels as `customer.pickupArea`, a typed place is stored with its area label, and the pickup is part of the order key, so changing it supersedes the intent. Without a zone the site shows the cheapest zone as a "from", never as a price.
- **Prices are never typed.** Every headline price is derived from the rate card. Cards are edited at `/admin/tour-rates` (`components/admin/TourRatesDesk.tsx`, styles: the `.rd` block in `globals.css`), validated by `parseRateCard`, stored with a change-log row by one database function (migration 037), and published by a deploy: `scripts/snapshot-tour-rates.mjs` (prebuild) copies them into `lib/tour-rates.snapshot.json`, `lib/experiences.ts` applies them at load, and a card that does not validate throws, failing that deploy. So the page, checkout, emails, llms.txt and the agents always price from the same cards. Go-live order and the build hook: GO-LIVE.md section 9.
- **The desk's review shows the guest's consequence**, not only Collin's: `lib/tour-rate-impact.ts` finds every group size whose guest price moves, so a change that only touches big groups never reads as "no change".

Tests: `tests/unit/tour-zones.spec.ts` (every transfer hotel has a deliberate zone), `tour-rates.spec.ts`, `tour-rates-desk.spec.ts`, `tour-rate-impact.spec.ts`, `admin-tour-rates-route.spec.ts`, `collin-sheet.spec.ts` (every rate, as Collin gave it), and the zone cases in `checkout-paths.spec.ts` (group and per person, against the real route) and `webmcp-tools.spec.ts`.

### ProfileView
- Hero banner: Jamaica-green gradient, avatar (80px, gold gradient circle), name "Alex Wanderlust", "Toronto - Member since 2024"
- Stats row: Trips (3), Parishes (4), Experiences Saved — Syne gold numbers
- Badges: `['Jamaica Verified', 'Top Reviewer', '3 Trips Completed']` as gold-tint pills
- Upcoming section: pull from `useCartStore().items`; if empty show "No upcoming trips. Start exploring!"
- Past trips: 3 hardcoded rows (Negril/Rick's Cafe, Blue Mountains/Coffee Trek, Kingston/Reggae Roots) with date + star rating
- Saved creators: 3 hardcoded (yardie.adventures, jerk.legend, roots.culture) with gradient avatar + handle + followers + "Following" ghost button

---

## UX Rules

### Feed
- `scroll-snap-stop: always` — strictly one reel at a time
- Story segments fill left-to-right as `currentIndex` increases
- Heart animation on like: apply `.animate-heart-pop` class, remove after 300ms

### Cart
- `addItem` is idempotent — calling it twice with the same experience has no effect
- Cart persists via Zustand `persist` to `localStorage` key `'mapl-cart'`
- When first item added: `ItineraryPanel` slides in (`animate-slide-right`)
- Cart badge on `LeftNav` appears/disappears reactively

### Routing
- All pages share `LeftNav` from `app/layout.tsx`
- `/checkout` full-width (no `ItineraryPanel` — it's already inside `CheckoutView`'s right column)
- After confirmed: `clearCart()` then `router.push('/')`

---

## Build Order

Build files in this sequence:

1. `lib/experiences.ts`
2. `lib/cart.ts`
3. `app/globals.css`
4. `app/layout.tsx`
5. `components/LeftNav.tsx`
6. `components/ReelCard.tsx`
7. `components/FeedView.tsx`
8. `components/ItineraryPanel.tsx`
9. `components/ExploreView.tsx`
10. `components/checkout/CheckoutView.tsx`
11. `components/ProfileView.tsx`
12. `app/page.tsx`
13. `app/explore/page.tsx`
14. `app/checkout/page.tsx`
15. `app/profile/page.tsx`

---

## Dependencies

```json
{
  "dependencies": {
    "next": "^14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "framer-motion": "^11.3.8",
    "zustand": "^4.5.4",
    "clsx": "^2.1.1"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10",
    "postcss": "^8",
    "tailwindcss": "^3.4",
    "typescript": "^5"
  }
}
```

---

## What NOT To Do

- No Inter, Roboto, or system fonts — Syne + DM Sans only
- No purple-gradient-on-white — this is a dark app, always `var(--bg)` as base
- No `position: fixed` — use `position: sticky` or flex layouts
- No direct `localStorage` calls — only through Zustand persist
- No image placeholder CDNs (picsum, lorempixel) — use gradient + emoji system
- No `<style>` tags inside component files — styles go in `globals.css` or inline `style` props
- Don't add `overflow: hidden` to `<body>` without `height: 100dvh`
- Don't wrap Next.js `<Link>` in an `<a>` tag

---

## Brand Voice

- Tagline: **"Discover Jamaica Beyond the Resort"**
- Tone: Confident, warm, local — not a travel agency. "Your Jamaican cousin who knows everywhere."
- Copy: Short, sensory, punchy. "Jump from legendary cliffs." Not "Enjoy our cliff-diving experience."
- Currency: USD
- Empty states: always include a Jamaica emoji + short encouraging line
- After checkout: sign off with "No problem."

---

## Browser MCPs (project-scoped, in `.mcp.json`)

Three headless-browser servers ship with the repo so Claude can open the site the way a guest does. They are pre-approved in `.claude/settings.json`; first use downloads them via npx.

| Server | Use it for | Notes |
|---|---|---|
| `playwright` | Desktop (1440×900) walkthroughs, screenshots, accessibility snapshots, clicking and typing through a flow | Real Google Chrome, isolated profile, output in `.playwright-mcp/desktop/` |
| `playwright-mobile` | The same on an iPhone 13 profile. **Default to this one**; nearly every real prospect is on a phone | Output in `.playwright-mcp/mobile/` |
| `chrome-devtools` | Performance traces, Core Web Vitals, network waterfalls, console and request inspection, CPU/network throttling | Call `list_pages` first; every page tool needs a `pageId`. Use `emulate` for mobile and slow-network profiles before a trace |

Conventions that keep these safe and useful:

- **Analytics is blocked in these browsers** (gtag, GA4, Google Ads, Hotjar origins), so nothing Claude does shows up as traffic or conversions. Do not remove those blocks. If a check needs the trackers themselves, use a one-off Playwright script instead.
- **Production is read-only.** Browse, click, fill forms, but never tap "Continue to payment" on mapltours.com: it creates a pending booking, a live Stripe PaymentIntent and a recovery email. Stop at the filled details step. Flows that must create data run against the local dev server and use an `@example.com` email so `scripts/purge-test-bookings.mjs` can remove the rows.
- **Check every UI change at 390 and 1440.** Mobile first, then desktop. Look at the screenshot; do not infer from the DOM.
- **Measure, do not judge.** Contrast, tap targets, load times and layout shift come from the page (`browser_evaluate`, `performance_start_trace`), not from reading the source.
- **The `browser` agent** (`.claude/agents/browser.md`) owns these tools for delegated work: say "use the browser agent to …" or `@agent-browser …`, or spawn it with the Agent tool. It starts its own isolated copies of the three servers, so several can run in parallel without sharing a page, and a hook stops it from ever clicking into a payment step. The server args are duplicated between `.mcp.json` and the agent file on purpose; change both together.
- `/site-check` runs the standard route check; `/run` launches the app.
- The servers are pinned (`@playwright/mcp@0.0.80`, `chrome-devtools-mcp@1.8.0`). Bump deliberately, then confirm with a `browser_navigate` to the live site.

---

## ChatGPT Wallet and agents that pay in a browser (Nov 14 2026)

OpenAI launched ChatGPT Wallet on Nov 13 2026: US ChatGPT Pro subscribers, eligible US-issued credit cards, inside "dots". The agent's cloud browser fills a merchant's ordinary checkout; once the traveller approves the total with a biometric check, the card network issues a token (a card number, security code and expiry) for that one purchase, and it goes into the payment form. OpenAI's words: "ChatGPT Wallet works out of the box with existing checkout pages and payment forms. No Wallet-specific integration is required." (developers.openai.com/commerce, the Commerce Partner Playbook). Owner, Nov 14: "Make sure we are ready." Four of the eight paid bookings between Oct 15 and Nov 14 2026 came from ChatGPT.

What was checked that day, and has to stay true:
- **Nothing of ours blocks the cloud browser.** No firewall or bot rule on Netlify, nothing in `middleware.ts` looks at who is asking, neither checkout has a CAPTCHA of its own, and the rate limit is 10 a minute per IP on each checkout route. `getIp` (`lib/rate-limit.ts`) reads Netlify's connection IP and never the `Forwarded` or `Signature-Agent` headers ChatGPT adds, so they cannot be used to dodge a limit. If a firewall or bot product is ever put in front of the site, it has to let through requests signed by ChatGPT (Web Bot Auth: `Signature-Agent: "https://chatgpt.com"`, keys at chatgpt.com/.well-known/http-message-signatures-directory). OpenAI lists Akamai, Cloudflare, HUMAN and Vercel as verifying those by themselves; Netlify is not on the list.
- **Both checkouts read cleanly to an agent.** Every control has a real accessible name, the name, email and phone fields carry autocomplete hints, no account is needed, and the button reads "Pay $X". Keep it so: no field named only by its placeholder, no sign-in wall, no CAPTCHA.
- **No card is kept.** No PaymentIntent sets `setup_future_usage`. OpenAI: "Don't reuse or save that payment credential for a separate purchase."
- **llms.txt says how.** Its "For AI agents" section has a paragraph for an agent that can pay in a browser with the traveller's approval: the two checkout addresses, what each form asks for, that the total on the button is the charge, and that the tour waiver is the traveller's own to accept. `tests/unit/llms-agent-checkout.spec.ts` holds each sentence to the forms.
- **WebMCP.** ChatGPT's "site tools" are its implementation of WebMCP and use `document.modelContext.registerTool`, the call `components/WebMcpTools.tsx` already makes. They run only in the ChatGPT desktop app's built-in browser, not in the cloud browser that Wallet uses. Chrome's WebMCP is still an origin trial (extended to milestone 162, March 30 2027), so Chrome still needs the token header described below. Stripe's Payment Element registers its own WebMCP tools for filling the card form; ours never pay (rule below).
- **Stripe.** OpenAI names Stripe among the providers it is working with. Radar has a bot score, a bot risk control (Radar Pro) and an `:is_agent_initiated:` attribute. A bot rule set to block could stop an agent's purchase; that is a Dashboard setting and the owner's to look at.

Not built, and each needs the owner's word:
- **Counting these purchases.** They arrive as ordinary card payments. OpenAI says the cloud browser signs its requests (`Signature-Agent`); the two checkout routes could note that in `bookings.attribution`. It touches both routes.
- **The tour waiver.** An agent ticking the Activity Waiver for a traveller is a question for a lawyer, not for code.
- **The owner's own steps:** claim the business in ChatGPT's Business Hub (a DNS TXT record on mapltours.com, then identity verification with Persona); look at Radar's bot settings; register mapltours.com for Chrome's WebMCP origin trial; submit the `/mcp` connector as a ChatGPT plugin (developers.openai.com/plugins). Product feeds are for physical goods and do not apply to rides and tours.

---

## WebMCP: tools the site offers to visitors' browser agents

`lib/webmcp-tools.ts` + `components/WebMcpTools.tsx` (mounted in `LayoutShell`) register seven tools with `document.modelContext` on every page, for browsers that have WebMCP (Chrome 149+ via origin trial or `chrome://flags/#enable-webmcp-testing`). Spec: https://developer.chrome.com/docs/ai/webmcp.

| Tool | Kind | What it does |
|---|---|---|
| `find_transfer_destination` | read-only | Search the 199 hotels and villas on the rate card |
| `get_transfer_quote` | read-only | Exact all-in fare, per vehicle, round trip or one way |
| `check_transfer_timing` | read-only | Applies the 12-hour rule in Jamaica time; returns the earliest bookable time; derives the hotel pickup from `departure_flight_at` |
| `start_transfer_booking` | consequential | Puts the ride and flight details in the cart and opens `/transfers/checkout`; a one-way carries only the legs its direction allows |
| `list_tours` / `get_tour` | read-only | Catalogue, details, price per party size |
| `start_tour_booking` | consequential | Puts a tour, date and party in the cart and opens `/checkout` |

Rules, enforced in code, not just described:
- No tool pays or submits a checkout. The traveller taps "Continue to payment" and completes Stripe themselves; the `start_*` tools carry `consequentialHint` so the agent confirms first.
- Prices come from the same `buildQuote` / `tourPrice` the checkout uses, so an agent can never quote a number the server will refuse.
- Errors are returned as `{ error }` objects with a next step. A thrown error reaches the agent only as "invocation failed", so nothing in `execute` throws.
- Descriptions stay under 500 characters and outputs compact (Chrome's prompt-injection guidance). Never put user-generated content in a result without `untrustedContentHint`.
- Leg times are validated to `YYYY-MM-DDTHH:MM` (Jamaica wall clock, calendar-checked) and judged against the 12-hour rule as `${value}:00Z`, so the visitor's browser timezone never changes the answer. A date-only value or a `Z`/offset suffix is an error, never stored.
- A one-way carries only the legs its direction allows (mirrors `planTransferLegs` on the server); stray fields are refused. `trip_type` is required, and so is `direction` for a one-way; unrecognised enum values are errors, not defaults.
- Tour adds go through `addTourToCart`, which uses the real store's `conflictsInCart` / `fitTourToDay`, reports refusals and evictions, and applies the date and party size to every line the way checkout does. `start_tour_booking` checks the date against `isExperienceDateBookable` first.
- Both `start_*` tools refuse while `lib/payment-lock` says a Stripe confirm is in flight (`StripePaymentPanel` mirrors its `processing` state into it).
- The tools are not registered on `/login`, `/admin` or `/driver` (`hideTools` in `LayoutShell`); the `/experience` reel is a shop and keeps them.
- Agent input is echoed back only after validation and clipped; `list_tours` returns compact rows (no per-row URL, at most 12, `more` + hint beyond that).
- The pure module is unit-tested (`tests/unit/webmcp-tools.spec.ts`) with fake cart actions AND against the real cart store; the timing tests run under UTC, Los Angeles, Berlin and Tokyo. The component only wires real stores and `router.push`.
- The two `start_*` tools call `onBookingStarted` before navigating; the component maps it to `markAgentAttribution`, which stamps the stored attribution `source: webmcp / medium: browser-agent / content: <tool>`. That flows into `bookings.attribution` at checkout, so agent-started bookings are countable in the admin. `llms.txt` lists the tools for agents that read it.

Testing: launch Chrome with `--enable-features=WebMCP` (the `browser` agent's `chrome-webmcp` server does this, with the DevTools WebMCP tool category), or install Chrome's "Model Context Tool Inspector" extension with the flag on. From a page console: `await document.modelContext.getTools()` and `await document.modelContext.executeTool(tool, JSON.stringify({...}))`.

Going live for real visitors: register mapltours.com for the WebMCP origin trial (link in the Chrome doc), then serve the token as a header from `netlify.toml`:
```
[[headers]]
  for = "/*"
  [headers.values]
    Origin-Trial = "<token>"
```
`window.originAgentCluster` is already true on production, so no `Origin-Agent-Cluster` header is needed.

---

## AI assistant connector: /mcp (Oct 2026)

`app/mcp/route.ts` serves the site's booking tools to any AI assistant as a remote MCP server (Meta's Muse, ChatGPT, Claude, Gemini, Perplexity, Copilot...). Built on the official `@modelcontextprotocol/server` v2 (pinned 2.2.0): stateless, POST only, both protocol eras (2026-07-28 and 2025-era clients through the SDK's stateless legacy fallback), no sign-in. Public docs for travellers and directory reviewers: `/connect`.

| Tool | Kind | What it does |
|---|---|---|
| `find_transfer_destination`, `get_transfer_quote`, `check_transfer_timing`, `list_tours`, `get_tour` | read-only | The WebMCP tools themselves (lib/webmcp-tools), same code and prices |
| `start_transfer_booking`, `start_tour_booking` | read-only | Return a `mapltours.com/book` link that opens checkout filled in; book and charge nothing |
| `get_booking_terms` | read-only | Pricing rules, notice, cancellation (CANCELLATION_SUMMARY), payment, contact |
| `book_and_pay_transfer` | pays | Rides only, with a Stripe Shared Payment Token; listed only when `AGENT_PAYMENTS_ENABLED=1` and never on `?via=claude` or `?via=chatgpt` |

Rules, enforced in code:
- **One source of truth.** The connector never re-implements a rule. Its booking tools run the WebMCP booking tools' own validation with actions that capture the result (`lib/agent/capture.ts`); `tests/unit/agent-connector.spec.ts` checks a 1,008-case matrix against the in-browser tool.
- **Booking links carry no personal data** (`lib/agent/booking-link.ts`): ride or tour, flights, times, party, plus `utm_source=<assistant>&utm_medium=ai_agent&utm_campaign=connector&utm_content=<tool>`. `/book` (components/agent/BookHandoff.tsx) waits for both carts to hydrate, re-checks the link (12-hour rule included), replaces the ride or starts the tour cart from the link, captures attribution and opens checkout. A stale link gets a reason and a way forward, never a silent booking.
- **Links always name https://mapltours.com** (`linkOrigin` in `lib/agent/booking-link.ts`; only a localhost dev server keeps its own origin). Behind the custom domain the function's request URL is Netlify's per-deploy host (`<deploy id>--mapltours.netlify.app`); the first deploy (Oct 2 2026) handed out links to it until this rule, and `tests/unit/mcp-endpoint.spec.ts` now connects through that host.
- **Each directory gets its own address**: `/mcp?via=muse|claude|chatgpt|gemini|perplexity|copilot|grok`; anything else reads as `mcp`. The via names the booking's source and decides whether the payment tool is listed (Claude's directory bans tools that move money; ChatGPT's requires checkout on the merchant's site).
- **Agent payments go through the real checkout.** `lib/agent/agent-pay.ts`, in order: validates the ride (capture.ts); checks the approved price to the cent; limits attempts (60 a minute per connection, 10 per connection and traveller); requires the SPT to EXIST at Stripe (`Stripe-Version: 2026-04-22.preview`) before saying anything about bookings; then refuses to book a ride that already has a booking (same cart hash, `lib/transfer-cart-hash.ts`, moved byte for byte out of the checkout route) that is paid, or pending or failed with an intent Stripe reports paid, processing or waiting on the bank (the route only de-duplicates PENDING rows, so without this a retry after a lost answer, or a second approval, charged the same ride twice); then checks the token is active, USD, allows the price and does not expire within a minute. Only then does it call `app/api/transfers/checkout` POST with the browser's body (pending row, PaymentIntent; the route never confirms), verify the intent (this booking, USD, exact amount) and confirm it once with `payment_method_data[shared_payment_granted_token]`, unless 4 s have passed since the request ARRIVED (`/mcp` stamps `x-mapl-received-at`, replacing any value a caller sends); then nothing is charged and the same call can be repeated. Stripe calls are single-try with short timeouts (confirm 3.5 s, read-back 1.5 s), so a confirm started in time is reported within Netlify's 10 s. An unclear confirm is read back and reported as what happened. The webhook flips paid and sends the emails as for any booking. Agent-paid bookings carry `dnt: '1'`, so Meta's Conversions API skips a traveller who never saw this site's privacy notice. The tool is `idempotentHint: false`. Tours are links only: the activity waiver is accepted by the traveller on the page (Meta's connector terms void connector-imposed user terms).
- **Both checkouts refuse a second intent when a declined twin has in fact paid** (`app/api/checkout` and `app/api/transfers/checkout`, the "3a-bis" sweep): a late decline webhook can mark a row failed after a retry on the same intent paid, and a new POST for the same cart used to mint a fresh payable intent. It now answers `alreadyPaid` (or 409 `paymentProcessing`) with the twin's id and drops the row it made, like the supersede block. Tested against both real routes.
- **No subscription streams** (`maxSubscriptions: 0`, `tools.listChanged: false`): nothing ever changes mid-connection, and an open stream would hold a serverless invocation for an anonymous caller.
- **Tour pickups from a link are only place names** (`pickupText`: letters, digits and `.,'&()/#-`; anything that looks like a link or an email is dropped), because they reach the checkout form and, once paid, the confirmation and operator emails.
- **Logs**: one line per tool call (`[mcp] {tool, via, ok, ms}`); never arguments.
- **Rate limit**: 240 calls a minute per IP (assistants share egress addresses); the checkout route keeps its own limit.

Payments switch: `AGENT_PAYMENTS_ENABLED=1` on Netlify, only after GO-LIVE.md section 8. MCP Registry: `mcp/server.json` (`com.mapltours/booking`), domain proof at `/.well-known/mcp-registry-auth` (public key in the route; the private key lives at `~/.config/mapltours/mcp-registry-key.pem` on the owner's Mac, never in the repo). Tests: `tests/unit/mcp-endpoint.spec.ts` (official client, both eras, against the real route), `agent-booking-link`, `agent-connector`, `agent-pay` (fake Stripe and checkout: every refusal happens before the step it guards).

## Clip phone copies: the GitHub job (Oct 31 2026)

Guest and MAPL clips (`user_tour_videos`) play phone copies (`m/<upload path>.hevc.mp4` and `.mp4`, `clipDerivativePaths` in `lib/video-rules.ts`), falling back to the upload while a clip has none. `.github/workflows/clip-copies.yml` makes them every 15 minutes with `scripts/encode-tour-clips.mjs`, because encoding needs ffmpeg and minutes of CPU that a Netlify function does not have.

- **No secret anywhere.** The job asks `/api/clip-copies` with GitHub's OIDC token; `isClipCopiesJob` (`lib/clip-copies.ts`) accepts only this repo (by id), on main, from that workflow file, scheduled or Run workflow. Renaming the workflow file, moving the repo or changing the default branch breaks it until `CLIP_COPIES_JOB` is updated. The route answers with signed upload URLs for exactly the missing copies, so the job holds no Supabase key.
- **Guest files and rows are untrusted.** Only a `video_path` shaped exactly as `uploadTourVideo` makes it (`<uid>/<experience>-<ms>.<ext>`, `trustedClipPath`) whose file is in that uploader's folder is encoded: storage-js puts the path into the signing URL unencoded, so `%2e%2e`, `?` or `#` would aim an upload outside `m/` or at another bucket. ffmpeg runs with `-format_whitelist mov,matroska -protocol_whitelist file` (a playlist named .mp4 could otherwise read local files into the copy) and without the job's env.
- **A clip that cannot be encoded** (ffmpeg refuses it, over 90 s, an encode past 10 minutes, no such file) gets `m/<path>.failed.txt`, fails that one run (GitHub emails the failure) and is skipped until the workflow is run by hand with its clip id, which also redoes a clip that has copies and goes first. A clip id is refused from a scheduled run's token. No clip starts after 25 minutes; the rest wait for the next run.
- **The Actions logs are public** (public repo): the script names clips by id only, never by storage path, because the bucket is public-read and a path would show a clip still waiting for review.
- Tests: `tests/unit/clip-copies.spec.ts` (planner, token checks with a test key, the route).

## Trip tips v2: the daily tips job (Sept 2026)

`app/api/trip-tips/route.ts`, called daily at 14:00 UTC by `netlify/functions/trip-tips-cron.mjs`, sends each Trip tips subscriber at most one tip a run, chosen by what they have booked. It replaces the Resend automation "Trip tips welcome", which stays disabled; nothing here calls Resend to change it. The rules are in `lib/trip-tips/plan.ts` (pure), the I/O in `lib/trip-tips/run.ts`, the emails in `lib/trip-tips/emails.ts`, the signed stop link in `lib/trip-tips/unsubscribe.ts`.

- **Eligibility, checked every run:** on the Resend "Trip tips" segment and not unsubscribed (checked again just before each send), HubSpot `mapl_tips` "yes", not a `TEST_EMAIL` address, no pending refund request. A paid booking whose refund was declined or approved but not settled also holds the address (it is not treated as a prospect).
- **Tracks from Supabase:** PROSPECT (p1 to p4), RIDE (r1, r2; never a tour pitch), TOUR (t1, t2), BOTH (b1, b2). Leg times go through `legInstantMs`; "N days away" is Jamaica calendar days. Services are grouped into trips (`groupTrips`: an arrival and the next departure are one stay, anything within 7 days joins it) and only the NEXT trip picks the track and fills the email, so an October tour and a December ride never share one tip. The series stops after the last service of the trip. r1, r2 and b1 need an arrival leg (the builder refuses without one); b2 with only a ride home describes that ride.
- **Cadence:** never two tips within 7 days (the tour upsell's `tour_upsell_sent` stamp counts here too), never more than 2 in 30 days, nothing within 2 days after any payment, nothing in the 2 days before a trip or while it is under way (the next trip has begun, however long ago they landed, or anything began in the last 14 days).
- **The week-before tip takes priority (owner, Sept 27 2026):** the early tips (r1, b1 by the arrival, and for b1 also the earlier of arrival and first tour; t1 by the first tour day) go only while that day is `EARLY_TIP_MIN_DAYS_AWAY` (14) or more Jamaica days away, so the 7-day gap an early tip starts can never cover the whole week-before window (days 8 to 5). Booked 9 to 13 days out, a guest gets only the week-before tip. An early tip also waits, and may never go, when sending it would fill the 2-in-30 limit on the window's last day (`crowdsWeekBefore`), which happens to a subscriber who got a prospect tip shortly before booking. A prospect tip sent within 7 days before the window (no early tip involved) can still hold the week-before tip; that is the owner's cadence rule and was left as it is. Tested day by day for every booking distance from 5 to 60 days with the cron's start time moving by minutes, and the edge days 13 and 14 under three server time zones.
- **Once only:** the ledger `trip_tips_log` (migration `033_trip_tips_log.sql`, applied to production Sept 27 2026) has one row per address and tip. The run claims the row, then sends with an idempotency key, then marks it sent. A send is `failed` (retried by a later run) only when every attempt was a definite refusal; once any attempt was ambiguous (no answer, a 5xx, a concurrent request) the outcome is unknown, the row stays `claimed` and is never resent automatically (the route logs it), because Resend's idempotency key lasts only 24 hours. r1 and b1, and r2, t2 and b2, share a slot: one sent blocks the others, also across trips.
- **The send gate:** nothing is sent unless `TRIP_TIPS_ENABLED` is exactly `1`. Otherwise every run, the cron's included, is a dry run. `?dry=1` is always dry. A dry run reads, plans and builds and writes nothing. Only an explicit `?dry=1` answers the per-address plan (masked); the cron's own runs answer and log counts only.
- **Unsubscribe:** `/api/trip-tips/unsubscribe` (GET is a confirm page and records nothing; POST from the button or a mail client's one-click records the stop as Resend `unsubscribed: true`; nothing ever lifts one). Every tip carries `List-Unsubscribe` with the https link and `mailto:contact@mapltours.com?subject=stop`, plus `List-Unsubscribe-Post`. A mailto stop reaches the contact inbox and has to be recorded by hand. The link accepts any address the job mails (`normalizeEmail`'s shape); before each send the run verifies its own link and skips the address (`unsubscribe_unverifiable`) if it would not work.
- **Facts the tips never state:** drive times from MBJ (the site gives two figures for Montego Bay and for Negril), the DRAFT tour detail fields, and anything else map-facts lists as unpublished or contradicted; see the header of `lib/trip-tips/emails.ts`.

New environment variables (Netlify, main site):

| Variable | What it is |
|---|---|
| `TIPS_SEGMENT_ID` | The bio's Resend "Trip tips" segment id (same value as on the bio site) |
| `TRIP_TIPS_SECRET` | HMAC key for the unsubscribe links. Long and random; changing it breaks every link already sent |
| `TRIP_TIPS_ENABLED` | `1` to send. Anything else, or unset, keeps every run dry |

The job also uses `CRON_SECRET`, `RESEND_API_KEY` (it must read contacts and segments, not only send) and `HUBSPOT_SERVICE_KEY`. Order to go live: apply migration 033 and confirm the table in `information_schema`, deploy (the photos must be live at `https://mapltours.com/media/email/tips/` before any tip goes), set the three variables with `TRIP_TIPS_ENABLED` unset, read a dry run (`curl -H "Authorization: Bearer $CRON_SECRET" https://mapltours.com/api/trip-tips?dry=1`), then set `TRIP_TIPS_ENABLED=1`.

**Owner's decisions on the emails (Sept 27 2026):**
- **A photo in every tip.** Email-safe JPEGs in `public/media/email/tips/` (2:1, progressive, 1120 or 1200 wide or the source's own width, never upscaled, each 100 KB or less and the coast road about 90 KB, which the test holds), cut by hand from photos the site already shows; `PHOTOS` in `lib/trip-tips/emails.ts` names each file's source and says what it shows, and `TIPS_MEDIA_BASE` is the one host constant (the preview script swaps it for the local folder). Every photo sits after the first gold button, so none moves the button on a phone, and never between a booking and the section that follows it: r1's ride photo heads "When you land", b1 has exactly one photo (the tour's own, or the coast road) under "Tour day", and t1's sits below the reply line, so the fare and the button lead. Ride and arrival tips show the ride (the /transfers hero's coast road, or the home hero's shore road); a booked-tour tip shows that tour, chosen by catalogue id in `TOUR_PHOTOS` (a new tour fails the test until its photo is chosen). Never use a listing image that is not what it is labelled: `public/media/img/189708.jpg` (a stock waterfall, not Dunn's River) and the other exclusions are listed above `PHOTOS`. Dunn's River Falls Climb has no photo of its own and gets the general one.
- **No sign-off.** "Walk good." is gone and nothing replaces it; every tip ends on its reply line ("...one of us will write back within 24 hours.").
- **No postal address.** The footer and the plain text print none, and neither does the unsubscribe page. `TRIP_TIPS_POSTAL_ADDRESS` in `lib/trip-tips/postal.ts` is `null`; setting it (one change) prints it in every tip and on the page (`tests/unit/trip-tips-postal.spec.ts`). Legal note: US CAN-SPAM (15 U.S.C. 7704(a)(5)) and Canada's CASL (SOR/2012-36 s. 2(1)(d)) require a mailing address in every commercial email, and the prospect tips (p1 to p4, which carry the JAMAICA5 code) and t1 (which prices a ride the guest has not booked) are commercial. A street address is not required: the FTC accepts a USPS-registered PO box or a private mailbox at a commercial mail receiving agency, and the CRTC (Bulletin 2012-548) counts a P.O. box, valid for 60 days after sending. A PO box or virtual mailbox set in that constant would satisfy both.

**The promise ships with the sender.** `TIPS_ON_LINE` (lib/trip-tips.ts, "The first one comes in a couple of days"), the privacy page's trip tips lines, and the bio's `TIPS_ON`, /tips "done" line, code-email tips card and `COVERS` all describe THIS job. Deploy them in the same release that sets `TRIP_TIPS_ENABLED=1` (main site first, then the bio), never before: until the job sends, "a couple of days" is a promise nobody keeps. If the copy has to ship first, hold the old strings until the first real p1 has gone out.

Tests: `tests/unit/trip-tips-{plan,run,unsubscribe,route,emails,postal}.spec.ts` (fakes only; the plan's timing tests run under UTC, Los Angeles and Tokyo). `npx tsx scripts/trip-tips-preview.mts <dir>` renders every tip for reading, photos included.

## Trip calendar and "next up" (Nov 13 2026)

Owner: "it needs to be very clear when there is an upcoming ride, maybe have a calendar available for admins and the driver." `components/schedule/TripCalendar.tsx` (the month grid, a day's trips, and the dark `NextUp` card) is on `/admin/bookings` and in the driver portal. Both read `lib/trip-schedule.ts` (pure, `tests/unit/trip-schedule.spec.ts`). Styles: the `.cal` block in `globals.css`.

Rules, enforced in code:
- **A leg is an event, a booking is not.** `scheduleFromBookings` / `scheduleFromDriver` return one event per ride LEG and per tour day, on its own Jamaica day. Only `paid` bookings are anybody's drive.
- **The Bookings list follows the same rule.** `viewOf` and `BookingCard` use `nextService(b, today)`: a round trip stays under Upcoming, leading with its drive back to the airport, until that drive has run. It used to drop into Past the day after the guest landed.
- **Jamaica time, whatever the machine's zone.** A leg's day is the first ten characters of its stored wall-clock stamp; "today" and "next" use the fixed five-hour offset. Tested under four time zones.
- **The grid is a real table** (weekday column headers), each day with trips is a button named by its whole date and what it holds, a ride is a dot and a tour a ring (shape, not colour), and it opens on the next day that has a trip.
- **The admin body is the width of the admin bar** (`.adm-wrap` has no max-width; owner, Nov 13: "I prefer the body being the same width as the header navigation"). The calendar is a sticky right rail from 1024px and sits between the next-up card and the tiles below that.
- **The pinned calendar is never taller than the window.** In the rail the card has `max-height: calc(100dvh - 32px)` and scrolls inside itself. Without that, a four-trip day on a 1280x640 laptop left its last trips below the window for good: the page scrolled, the pinned card did not, and keyboard focus landed on rows nobody could see. Check any change to the rail at a short window with the busiest day chosen.
- **Day buttons on touch screens** are 44px wide from 360px up and the weeks sit 8px apart. Two trip-days on consecutive dates are 2 to 4px apart side to side; seven 44px columns, 8px gaps and 16px gutters do not fit in a phone's width, so that one is accepted.
- **The driver portal's own design is the pre-Nov-13 one** (owner, Nov 13: "I like how the driver portal was before"; the redesign in 278078a was undone). The calendar was added to it on request; do not restyle the rest of it in a design pass.
- **Three repairs to the driver portal change nothing a driver sees** (Nov 14 2026, on the owner's word). A phone link opens the dialer in place and only web links open a new tab; the time on a paid chip is told in Jamaica's zone, in the same words as before (`paidStamp`); and each card's heading holds its header button, named by the ref and the guest, where the heading used to sit inside the `role=button` element and no screen reader found it. The header stays a `role=button` element with `tabIndex` and its key handler, not a native `<button>`: a native one was built first and measured against the old page, and it picked up the site's `h2` tracking and balanced wrapping (20px off the page's height on a phone), squared the focus ring, dropped out of Safari's Tab order and stopped the booking reference being selected in Safari. Any change to this portal is compared with the version before it to the pixel first: two preview routes with the same made-up rows, Chrome's and Safari's engines, 320 to 1440px, closed, open, focused, hovered and pressed, in a scratch copy of the repo so the preview can never be committed.
- Preview either screen with made-up rows at a temporary `app/zz-*/page.tsx`; delete it and `.next/types/app/zz-*` before committing.

## @mentions in tour comments (Nov 15 2026)

Owner, Nov 15 2026: a guest can tag "anyone with an account" with @ in a tour's comments; the person tagged sees it in the nav and on the profile, lands on the comment from there, and gets a branded email ("Make sure the email is branded and perfect"). A plain reply notifies nobody: "Only @tags" do. Migration `039_comment_mentions.sql` was applied to production on Nov 15 2026 and checked in `information_schema`.

Pieces: `lib/mentions.ts` (pure: tokens, the composer's rules, encoding, labels, query cleaning, `defuseLinks`), `components/comments/` (`useMentionComposer`, `MentionSuggestions`, `MentionText`), `lib/supabase/mentions.ts` (the badge count, the profile list, marking read, the email switch), `app/api/mentions/{search,notify,sweep,unsubscribe}`, `lib/mentions-server.ts` (who gets an email, the send, the stop link and page), `emails/MentionNotification.tsx`, `netlify/functions/mention-emails-cron.mjs` (every 10 minutes). Styles: the `@mentions` block in `globals.css`, colours as `--mention-*` tokens.

Rules, enforced in code:
- **A tag is a token, and the database decides it.** Stored text holds `<@uuid>`; every page renders "@Name" from `public.users` by the byline rule (`guestLabel`). The BEFORE INSERT trigger keeps only existing users, never the author, at most 5 people a comment and 30 tags per author an hour. A token past those limits becomes the person's name as plain text, one naming nobody is removed, and a comment left empty is refused (22023; the page says "Add a few words with your tag, then post."). The AFTER trigger writes one `comment_mentions` row per kept tag, so a gold "@Name" always has a row behind it. Comments have no UPDATE policy; if one is ever added, both triggers must run on update too.
- **The composer works on plain text.** "@" after a space opens a WAI-ARIA combobox list; a picked person shows as "@Ana" in the box and `encodeMentions` turns it into the token at submit. A name typed without picking stays text. Two people with one name get distinct labels in a draft (`draftLabelFor`), and the list shows "Ana B." only when two people in it share a name.
- **Search shows only what comments already show.** `/api/mentions/search` (signed in, 120 a minute) finds a guest with a handle by the handle and anyone else by the start of their name. A surname finds nobody, so the search cannot confirm that someone has an account. At most 8, people already in the thread first; never an email, a surname or a location.
- **Only the tagged guest sees a mention.** RLS lets a guest read their own rows and change `read_at` only (column grants); browsers cannot insert, delete or see the email columns. `notification_prefs.mention_emails` is own-row only and on unless switched off.
- **Emails go once, within limits, and can be stopped.** The poster's browser calls `/api/mentions/notify` (the comment's author only, keepalive) and the sweep catches what it missed. Both claim through `claim_mention_emails` (service role only): pending rows, failed ones up to 3 attempts, claims stale after 10 minutes, nothing older than 24 hours, and the sweep leaves the first minute to notify. Each send carries the Resend key `mention/<row id>`. Skipped: emails switched off, no confirmed address, 6 already sent to that person in 24 hours, the same author emailed them in the last 10 minutes, no stop secret. In-app mentions never depend on email.
- **The stop link** is an HMAC with `MENTIONS_SECRET` (set on Netlify Nov 15 2026; falls back to `TRIP_TIPS_SECRET` under its own prefix). GET is an inert confirm page; the button and a mail app's one-click POST record the stop; the profile switch turns emails back on.
- **A guest's words never carry a link out from our address.** In the email, typed web addresses and bare domains become "(link)", and a name that is a web address is not used as the author or as a tag.
- **Landing on the comment.** `/experience/<slug>?comment=<id>` (the email and the profile) fetches that comment even when it is older than the newest 50 the thread loads, opens the phone sheet, scrolls it to the middle, focuses it, washes it gold for 2.6s (opacity on a layer; static under reduced motion), marks it read, sets "Replying to" for a top-level comment without opening a phone keyboard, and removes the parameter. A deleted comment gets "That comment is no longer here."
- **The nav and the profile.** The unread count sits on the account avatar and the phone Menu button and beside Profile in both menus (their names say "N new mentions"); Profile goes to `/profile#mentions` while any are unread. The profile's Mentions section is at the top when something was unread on arrival and stays where it first appeared for the visit, so "Mark all as read" never moves it.
- **A reply is just a reply.** Reply no longer pre-fills a name that looks like a tag but is not one; "Replying to" above the box carries the context, and Cancel keeps what was typed. Like and Reply have 44x44 hit areas drawn by a layer, so the thread did not move.

Tests: `mentions.spec.ts`, `mentions-server.spec.ts` (the plan, the stop link, link defusing, the email render, the claim-and-send loop against a fake database, the stop route), `mentions-search-route.spec.ts`. The migration was checked in PGlite (39 checks: the token rule, the caps, RLS and column grants, the claim, the cascades). To walk it, use the dev server with two `delivered+<label>@resend.dev` accounts (Resend's test inbox) and delete them afterwards: a test comment is public on the live site while it exists.

## Cart reminders: three emails, then stop (Nov 15 2026)

Owner, Nov 15 2026: a second reminder 3 days after the first and a third 7 days after it; "the second abandoned cart should not send the code", the third does (JAMAICA5, chosen in the question dialog); "make sure to stop the flow of emails if the person books". All three come from the hourly job `app/api/abandoned-cart` (`netlify/functions/abandoned-cart-cron.mjs`); the steps and their rules are in `lib/cart-reminders.ts`, the follow-up email in `emails/AbandonedCartFollowUp.tsx`.

Rules, enforced in code:
- **The sequence.** 1: the first reminder, 30 minutes to 7 days after checkout was left (`recovery_email_count` 1, and `recovery_email_sent_at` is its time and stays it). 2: 72 to 120 hours after the first, no code. 3: 168 to 216 hours after the first, with JAMAICA5. Each step claims `recovery_email_count` n-1 → n atomically on a still-pending row; a refused send puts it back. Never a fourth. A step that misses its 48-hour window does not go late, and step 3 needs step 2 to have gone.
- **Booking stops it.** Steps 2 and 3 skip a guest whose inbox (`mailboxKey`) has paid for anything, tour or ride, since the cart was started; a paid cart is no longer pending and is never selected. Wider than the first reminder's rule (same kind only, unchanged). They also skip a guest who started a newer cart of the same kind, a trip under 36 hours away (`stillBookable`, the /book check a day ahead), and anything Stripe shows as paid, processing or cancelled (paid-but-pending rows are flagged for ops as before).
- **The code only where it can be used.** Step 2 never shows one, whatever it is passed. Step 3 runs `resolveCoupon` on JAMAICA5 with the cart's own base and margin (`couponBasis`: the routes' figures), so the saving shown is what checkout would take; with no usable code (used before, a code or gift card on the cart, paused, no margin) step 3 does not go. The guest types the code at checkout; pre-applying it from the link would change checkout and is the owner's call.
- **The button rebuilds the trip on any device.** A cart one link can carry (one ride, or one tour) gets a `/book` link (`followUpLink`: hotel by exact name, Jamaica wall-clock legs, flights, party, date, pickup; never a name, email or phone), tagged `utm_source=email&utm_medium=email&utm_campaign=cart_reminder&utm_content=reminder_2|3` so a booking is credited in `bookings.attribution`. Anything else opens the checkout and says it is on the device they started on.
- **Every reminder can be stopped.** All three carry "Stop these reminders" and one-click `List-Unsubscribe` (`/api/cart-reminders/stop`, HMAC of the booking id with `CART_REMINDER_SECRET`, set on Netlify Nov 15 2026; GET is an inert page, POST records). Stops live in `cart_reminder_stops` by inbox (migration 040, applied Nov 15 2026, service role only). The job sends no reminder to a listed inbox, and a run that cannot read the list sends none at all. Follow-ups never go without a stop link. No postal address is printed (the owner's standing decision; the trip tips section above has the legal note).
- **What the emails may say.** The trip first, "Nothing is charged until you pay", the three worries answered from claims the site already makes (cancellation from `CANCELLATION_SUMMARY`), the guest's name once, no urgency or scarcity, step 3 ends "This is our last note about this trip." A one-way home never says "Land, spot your name".

Tests: `abandoned-cart.spec.ts` (the real job over fake Stripe, Supabase and Resend: windows, claims, the booking stop, codes, stops, links, wording; each rule was broken on purpose on Nov 15 2026 and a test failed), `cart-reminders.spec.ts` (the steps, links, bookability, coupon basis, the stop route). Migration 040 was checked in PGlite.

## Rules from the Nov 13 2026 audit

- **One `<main>` per page, and it is `LayoutShell`'s** (`<main id="main-content">`, where the skip link lands). A page's own wrapper is a `<div>`; seven screens used to nest a second one (`tests/unit/one-main-landmark.spec.ts`).
- **Lock page scroll only through `lib/scroll-lock`** (`lockScroll()`), never by writing `body.style.overflow`. Two separate locks released in React's parent-first order left `/checkout` unscrollable after leaving the reel with a sheet open.
- **A persisted store may not exist.** Where the browser refuses localStorage zustand attaches no `persist`; `LayoutShell` and `useHydrated` allow for it, and the cart's `merge`/`migrate` accept any stored shape. Do not call `.persist.*` without checking.
- **A checkout answer is about the order that was SENT.** Both one-page checkouts apply a server answer to the page only when `pricingKeyOf(payload)` still equals the order on the page.
- **`/api/gifts/validate` releases stale claims before judging a card** (`releaseStaleGiftClaims`), or a card smaller than the cart stays at $0 after an unfinished payment. Its one refusal message is the same for every unusable code.
- **Paid-booking emails are bounded and repeat-safe:** both senders (the webhook's copies and `lib/email/booking.ts`) pass `CONFIRMATION_SEND` (`lib/email/confirmation-send.ts`, a 3.5 s limit) and a `dedupe` name; `sendEmail` turns that into a Resend idempotency key with a fingerprint of the message. Keep the two copies of the senders identical.
- **The tour confirmation prints a per-person price only for a tour priced per person** (`perPersonPrice` in `emails/BookingConfirmed.tsx`).
- **The abandoned-cart job skips a cart whose guest has since paid for the same kind of booking**, and its claim requires the row to still be `pending`.
- **Review requests go out the day after the last service DAY in Jamaica** (`lastServiceDay`), which the daily 9:00 job sends the next morning.
- **Server redirects name the public site** (`lib/site-origin.ts`): `/auth/callback` used to send a signed-in guest to Netlify's per-deploy host. Password resets return through the callback to `/login/reset`.
- **A hotel's reopening label is read through `reopensAhead`**, so a date that has passed stops being said everywhere.
- **First-visit language never shows a currency the visitor's country does not use** (`COUNTRY_LANGUAGE` in `lib/i18n.ts`); Spanish for the Americas is `es-419`, in US dollars.

## The cookie question: UK, EU and EEA visitors (Nov 14 2026)

Owner, Nov 14 2026: "Build a consent prompt" (UK and EU visitors see a small prompt, and trackers load only after a yes). `lib/consent.ts` holds the rule, `components/ConsentPrompt.tsx` asks, `components/Trackers.tsx` waits for the answer. The bio page has the same module (`lib/consent.mts` there), and one answer serves both sites.

Rules, enforced in code:
- **One rule, `decide`.** Do Not Track or Global Privacy Control wins over everything, a yes included; then an answer on record; then where the visitor is: asked in the region, left alone outside it. The region is the EU's 27, its seven territories with a code of their own, Iceland, Liechtenstein, Norway, the UK with Jersey, Guernsey, the Isle of Man and Gibraltar, and Switzerland (outside the EEA, but Google's EU user consent policy has covered visitors there since July 2024, and two of the tags are Google's).
- **Where the visitor is.** The country comes from `/api/geo` (Netlify's header, never cached), cut off at three seconds. "UK" and "EU" count as the region; a placeholder (`XX`) counts as not known. When the country is not known the browser's time zone decides: `Europe/` and the zones in `REGION_ZONES_OUTSIDE_EUROPE`, which mirror the list (Cyprus is filed under Asia, Ceuta under Africa, the French territories under America and Indian); a clock that says nothing about place (UTC) is asked. So a failed lookup can still get two things wrong, both narrow: a visitor in the region whose device keeps another region's time is not asked on that page (a clock-only placement is never remembered, so the next page looks them up again), and a visitor outside it on a European or placeless clock is asked needlessly.
- **One cookie, `mapl_consent=<yes|no|na>.<seconds>`,** on `.mapltours.com`, so the bio page and the site share it. An answer is written for 180 days; "outside the region" for one day, and only when the lookup named a country. Nothing is stored for a visitor in the region until they answer. A browser that will not keep the cookie can still answer: the answer stands for the page. Safari cuts a cookie written by script to 7 days (24 hours when the visit came from an ad click), so a guest on an iPhone is asked again sooner than 180 days; setting it from the server would lift that and is not built.
- **`watchConsent` keeps the decision current** and is the only place that looks the country up: at load, on an answer, when the tab is looked at again (the answer is a cookie, and another tab or the bio page can change it), on return from the back/forward cache, and on every change of page. "Wait" always has a lookup behind it. A visitor read as outside the region stays placed for the page, so that cookie lapsing mid-visit changes nothing.
- **Everything that measures asks `trackingOptedOut()`** (`lib/attribution`), which asks `consentBlocksTracking()`: the tags, the `dnt` flag on a booking (so the webhook skips Meta and GA4), the discount code's Lead, the pixel's purchase match, and every event in `lib/analytics` at the moment its tag is ready. A new tracking path must ask it too. The tags wait until the visitor has been placed; the paths that cannot wait go by the browser's clock for that moment.
- **Our own note of where a visitor came from waits for the same answer.** For a visitor who may not be measured, `lib/attribution` writes nothing to the browser and reads nothing back. The landing is held in memory for the page (`held`), still goes with a booking made on that visit beside `dnt: '1'`, and is stored on a yes or once the visitor is placed outside the region. A no removes what was stored, on the click and on arriving with a no given elsewhere. In the moment before placement a clock outside the region has the landing written at once, as it always was (so nothing changes for the guests who are most of our bookings), with a copy kept (`pending`): if the lookup then says "in the region", it is taken back out and held.
- **A no stops the tags.** A tag cannot be taken off a page, so when the answer stops being yes (here, in another tab, on the bio page, or because it lapsed) Trackers switches off what can be switched off at once (`ga-disable-<id>`, a consent update, the pixel's revoke), before the tags' cookies are cleared, and loads the page again without them: never on a page where a guest pays or signs in (`NO_CONSENT_PROMPT_PATHS`), never while `lib/payment-lock` says a payment is going through. Leaving such a page is when the reload happens instead. Hotjar has no off switch, which is the reason for the reload.
- **Google is told.** The gtag block opens with `gtag('consent', 'default', ...)`, all four keys granted, because that block only exists for a visitor who may be measured. Without it Google sets aside the visit of somebody in the region who said yes. If the question ever stops covering one of the four uses, that key must stop saying granted.
- **The question is an honest one and has to stay so.** Two answers of the same size, weight and colour, "No thanks" first; nothing chosen for the visitor; ignoring it is a no. It names Google, Meta and Hotjar and the three things a yes allows (seeing how people use the site, measuring our ads, showing our ads to people who have visited), and says booking works either way. It is asked in Spanish, French, German and Portuguese where the site speaks them (`lib/i18n.ts`).
- **A card at the top of the page, which scrolls away with it.** Absolute, not fixed: a guest who reads on without answering never has it over the form they are filling in. Never at the bottom, where the buttons that book are. It sits above the page (95) and below everything that opens over the page: the phone menu (99), the navigation (100), the search sheet, the cart, the reel's sheets, every dialog. It is not put at all where a guest pays or signs in; a visitor in the region who has not answered is simply not tracked there.
- **Opened by the guest, it is a different card:** pinned to the screen where they are and above the menus (400), never taller than the screen, with a Close of its own (looking is not answering), Escape, and the focus handed back to the button that opened it. That button passes itself to `requestConsentPrompt`, because Safari gives a tapped button no focus to find it by. The ways in: "Cookie Preferences" in the footer, in the Privacy Policy's Cookies section, and in the language and currency menu, which is in the navigation of every page, the ones with no footer included (transfers, contact, the account). The reel has no navigation; closing it is one tap from a page that does.
- **The discount popup waits for the card, but only for its first 20 seconds** (`CONSENT_HOLD_MS`). The card stays until it is answered, and without a limit a visitor in the region who ignored it would never be offered the discount.
- **The Privacy Policy's Cookies section describes this; change the two together** (`privacy-processors.spec.tsx`).

Tests: `consent.spec.ts` (the rule, the cookie, the browser, the watcher), `consent-wiring.spec.ts` (where it is asked, the tags behind it, the honest card, the layers), `attribution-consent.spec.ts`. `tests/setup/consent.ts` places every other test's visitor outside the region, so the suite passes in any time zone. No test mounts the two components (the repo has no DOM library): what they do on a page is checked in a browser.

To see it, fake the country at `/api/geo` in a Playwright script (`page.route`), never by changing code. The tags load only on the live host, so a check of the tags themselves serves a local build on the site's real address through a route that answers every `mapltours.com` request from the local server and refuses every other host. Nothing then reaches production or a third party. To see what Google's tag sends, let only its script through and refuse every request it makes: a yes shows `gcs=G111` on each.

Still the owner's to decide:
- The Privacy Policy's Meta section says the pixel shows which ads bring people to us, and does not say that we also show our ads to people who have visited (the "Site visitors 180d" audience). The question says it; the policy needs one sentence, and legal pages are edited only on his word.
- A yes also lets the pixel and the Conversions API send hashed contact details with a purchase, as the policy's Meta section describes. The question names the three uses, not that. Whether a visitor in the region should be matched that way at all is his call, and a lawyer's.
- A ride's `dnt` is the one sent with the quiet save. A no given in another tab between that save and Pay is not sent again, because the order has not changed. Closing it touches the checkout's request and is not done.
- Setting the cookie from the server, so that Safari keeps an answer for the full 180 days.
