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
  cart from the catalog (never trusts client amounts), enforces the 24h lead
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

## WebMCP: tools the site offers to visitors' browser agents

`lib/webmcp-tools.ts` + `components/WebMcpTools.tsx` (mounted in `LayoutShell`) register seven tools with `document.modelContext` on every page, for browsers that have WebMCP (Chrome 149+ via origin trial or `chrome://flags/#enable-webmcp-testing`). Spec: https://developer.chrome.com/docs/ai/webmcp.

| Tool | Kind | What it does |
|---|---|---|
| `find_transfer_destination` | read-only | Search the 199 hotels and villas on the rate card |
| `get_transfer_quote` | read-only | Exact all-in fare, per vehicle, round trip or one way |
| `check_transfer_timing` | read-only | Applies the 24-hour rule in Jamaica time; returns the earliest bookable time; derives the hotel pickup from `departure_flight_at` |
| `start_transfer_booking` | consequential | Puts the ride and flight details in the cart and opens `/transfers/checkout`; a one-way carries only the legs its direction allows |
| `list_tours` / `get_tour` | read-only | Catalogue, details, price per party size |
| `start_tour_booking` | consequential | Puts a tour, date and party in the cart and opens `/checkout` |

Rules, enforced in code, not just described:
- No tool pays or submits a checkout. The traveller taps "Continue to payment" and completes Stripe themselves; the `start_*` tools carry `consequentialHint` so the agent confirms first.
- Prices come from the same `buildQuote` / `tourPrice` the checkout uses, so an agent can never quote a number the server will refuse.
- Errors are returned as `{ error }` objects with a next step. A thrown error reaches the agent only as "invocation failed", so nothing in `execute` throws.
- Descriptions stay under 500 characters and outputs compact (Chrome's prompt-injection guidance). Never put user-generated content in a result without `untrustedContentHint`.
- Leg times are validated to `YYYY-MM-DDTHH:MM` (Jamaica wall clock, calendar-checked) and judged against the 24-hour rule as `${value}:00Z`, so the visitor's browser timezone never changes the answer. A date-only value or a `Z`/offset suffix is an error, never stored.
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
