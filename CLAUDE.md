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
- **Payments**: Stripe Elements (UI only at MVP, no real charges)

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
│       └── CheckoutView.tsx  # 3-step: ReviewStep + DetailsStep + PaymentStep + ConfirmedView
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

### CheckoutView (3-step shell)
- `'use client'`, state: `step` (1-3), `confirmed` (boolean)
- If `confirmed`: render `<ConfirmedView />`
- **Top bar**: back (Link to "/"), "Checkout" (Syne 700), `<StepIndicator step={step} />`
- **StepIndicator**: 3 circles (done=gold fill, active=gold, future=dim) + "Review / Details / Payment" labels + connector lines
- **Body**: flex row:
  - Left (flex-1, scrollable, max-width 640px): `{step === 1 && <ReviewStep />}` etc.
  - Right (280px, sticky): order summary + CTA button

**ReviewStep**: Each cart item card — gradient thumbnail (80px wide) + title + parish + duration + tags + `<input type="date">` + traveler counter (-/n/+, clamp 1-12) + `$price x travelers` in gold. Remove link.

**DetailsStep**: 2-col grid inputs — First Name, Last Name, Email (col-span-2), Phone, Country. Textarea for Special Requests (col-span-2). SSL notice with green-tint background.

**PaymentStep**: Dark gradient card (`#1A1A2E to #2D2D4A`) with VISA/MC/AMEX badges, Card Number input (letter-spacing:2), Expiry + CVV side-by-side, Name on Card. Terms copy below.

**Right order summary**: Items list (emoji + title + travelers x price), Subtotal + fee rows, Total (Syne gold), CTA button:
- Step 1: "Continue to Details"
- Step 2: "Continue to Payment"
- Step 3: "Pay $grand"
- On step 3 click: `setConfirmed(true)`

**ConfirmedView**: "Booking Confirmed!" (Syne 800), body copy ending "No problem.", summary card with all items + dates + travelers + total paid, "Explore More Experiences +" button -> `clearCart()` + redirect to `/`.

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
