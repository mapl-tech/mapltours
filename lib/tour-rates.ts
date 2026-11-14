/**
 * Live tour rate cards: what Collin charges for each tour, edited in
 * /admin/tour-rates and published with every deploy.
 *
 * The flow, end to end:
 *  1. An admin saves a card. /api/admin/tour-rates validates it with
 *     parseRateCard, stores it in public.tour_rate_cards and logs the change
 *     in public.tour_rate_changes (migration 037), then starts a deploy.
 *  2. The deploy runs scripts/snapshot-tour-rates.mjs before `next build`,
 *     which copies every stored card into lib/tour-rates.snapshot.json.
 *  3. lib/experiences.ts applies the snapshot when the catalog loads.
 *
 * So the browser, the checkout server, the emails, llms.txt and the agent
 * tools all price from the same cards in the same deploy, and what a guest is
 * shown is what checkout charges. A tour with no stored card keeps the
 * catalog's default. A stored card that does not validate throws while the
 * catalog loads, which fails that deploy and leaves the one already live.
 *
 * Pure: no I/O, safe on the server and in the browser.
 */
import type { Experience, TourPricing } from './experiences'
import { TOUR_ZONES, TOUR_ZONE_LABEL, isTourZone, type TourZone } from './tour-zones'

export interface RateCard {
  pricing: TourPricing
  /** The smallest party the operator takes; 1 means anyone. */
  minGuests: number
}

/** No operator rate above this: a guard against a typo such as 2800 for 280. */
export const RATE_MAX = 3000
/** Largest party checkout sells (lib/checkout-pricing, lib/cart). */
export const PARTY_MAX = 12

/** The desk field a refusal is about, so /admin/tour-rates can mark that field. */
export type RateField = 'mode' | 'baseRate' | 'tierMax' | 'extraPerPerson' | 'perPersonAddon' | 'minGuests' | 'zoneRates' | TourZone

type Parsed = { ok: true; card: RateCard } | { ok: false; error: string; field?: RateField }

const fail = (error: string, field?: RateField): Parsed => (field ? { ok: false, error, field } : { ok: false, error })

/** A dollar amount to the cent, or the reason it is not one. */
function money(v: unknown, label: string, positive: boolean): number | { error: string } {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) return { error: `${label}: enter an amount in dollars` }
  if (positive ? n <= 0 : n < 0) return { error: positive ? `${label}: must be more than $0` : `${label}: cannot be below $0` }
  if (n > RATE_MAX) return { error: `${label}: $${n} is above the $${RATE_MAX} limit. Check for a typo.` }
  const cents = Math.round(n * 100)
  if (Math.abs(cents - n * 100) > 1e-6) return { error: `${label}: use whole cents at most` }
  return cents / 100
}

function wholeNumber(v: unknown, label: string, min: number, max: number): number | { error: string } {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) return { error: `${label}: a whole number from ${min} to ${max}` }
  return n
}

const isErr = (v: unknown): v is { error: string } => typeof v === 'object' && v !== null && 'error' in v

const PRICING_KEYS = ['mode', 'baseRate', 'tierMax', 'extraPerPerson', 'zoneRates', 'perPersonAddon']

/**
 * Validate a rate card and return it in its one canonical shape (fixed key
 * order, zones west to east, empty optional parts left out), or the first
 * problem in a sentence an admin can act on. Used for every card the admin
 * saves and for every card a deploy publishes.
 */
export function parseRateCard(input: unknown): Parsed {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('The rate card is missing.')
  const { pricing, minGuests, ...rest } = input as Record<string, unknown>
  const stray = Object.keys(rest)[0]
  if (stray) return fail(`Unknown field "${stray}".`)
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) return fail('The rate card has no pricing.')
  const p = pricing as Record<string, unknown>
  const strayPricing = Object.keys(p).find((k) => !PRICING_KEYS.includes(k))
  if (strayPricing) return fail(`Unknown pricing field "${strayPricing}".`)

  if (p.mode !== 'group' && p.mode !== 'per_person') return fail('Choose how the tour is priced.', 'mode')
  // Each refusal names the field the way the desk labels it, so the admin
  // can find it; the desk also marks the field itself.
  const byArea = p.zoneRates !== undefined && p.zoneRates !== null
  // Per person by area: every guest pays the area's rate, so there is no
  // tier and no bigger-group rate to give. Whatever a caller sends for them
  // is not read; the canonical card fills them in below.
  const perHeadByArea = byArea && p.mode === 'per_person'
  let tierMax = PARTY_MAX
  let extra = 0
  if (!perHeadByArea) {
    const t = wholeNumber(p.tierMax, p.mode === 'per_person' ? 'That rate is for up to' : 'Covers up to', 1, PARTY_MAX)
    if (isErr(t)) return fail(t.error, 'tierMax')
    tierMax = t
    const x = money(p.extraPerPerson, byArea ? 'Each extra person' : 'Bigger groups, per person', false)
    if (isErr(x)) return fail(x.error, 'extraPerPerson')
    extra = x
  }

  let addon = 0
  if (p.perPersonAddon !== undefined && p.perPersonAddon !== null && p.perPersonAddon !== '') {
    const a = money(p.perPersonAddon, 'Added for every person', false)
    if (isErr(a)) return fail(a.error, 'perPersonAddon')
    addon = a
  }

  let zoneRates: Partial<Record<TourZone, number>> | undefined
  if (p.zoneRates !== undefined && p.zoneRates !== null) {
    if (typeof p.zoneRates !== 'object' || Array.isArray(p.zoneRates)) return fail('The area rates are not a list of areas.', 'zoneRates')
    const raw = p.zoneRates as Record<string, unknown>
    const strayZone = Object.keys(raw).find((k) => !isTourZone(k))
    if (strayZone) return fail(`Unknown pickup area "${strayZone}".`, 'zoneRates')
    const out: Partial<Record<TourZone, number>> = {}
    for (const z of TOUR_ZONES) {
      const v = raw[z]
      if (v === undefined || v === null || v === '') continue
      const r = money(v, TOUR_ZONE_LABEL[z], true)
      if (isErr(r)) return fail(r.error, z)
      out[z] = r
    }
    if (Object.keys(out).length === 0) return fail('Give a rate for at least one pickup area.', 'zoneRates')
    zoneRates = out
  }

  let baseRate: number
  if (zoneRates) {
    baseRate = Math.min(...Object.values(zoneRates))
    // A reader that knows nothing of areas still prices every guest at the
    // cheapest area's rate: a true "from" at any party size.
    if (perHeadByArea) extra = baseRate
  } else {
    const b = money(p.baseRate, p.mode === 'group' ? 'Rate for the group' : 'Rate per person', true)
    if (isErr(b)) return fail(b.error, 'baseRate')
    baseRate = b
  }

  const min = minGuests === undefined || minGuests === null || minGuests === '' ? 1 : wholeNumber(minGuests, 'Smallest party', 1, PARTY_MAX)
  if (isErr(min)) return fail(min.error, 'minGuests')

  const canonical: TourPricing = { mode: p.mode, baseRate, tierMax, extraPerPerson: extra }
  if (zoneRates) canonical.zoneRates = zoneRates
  if (addon > 0) canonical.perPersonAddon = addon
  return { ok: true, card: { pricing: canonical, minGuests: min } }
}

/** A tour's live card, as the catalog holds it. */
export function cardOf(e: Pick<Experience, 'pricing' | 'minGuests'>): RateCard {
  return { pricing: e.pricing, minGuests: e.minGuests ?? 1 }
}

/** Two cards price every party the same way. Both are compared in canonical form. */
export function sameCard(a: unknown, b: unknown): boolean {
  const pa = parseRateCard(a)
  const pb = parseRateCard(b)
  return pa.ok && pb.ok && JSON.stringify(pa.card) === JSON.stringify(pb.card)
}

/**
 * Put published cards on the catalog. A card for a tour no longer in the
 * catalog prices nothing and is skipped; a card that does not validate
 * throws, naming the tour, so the deploy fails rather than sell at a price
 * nobody set.
 */
export function applyRateCards(catalog: Array<Pick<Experience, 'id' | 'title' | 'pricing' | 'minGuests'>>, cards: Record<string, unknown> | undefined | null): void {
  for (const [key, raw] of Object.entries(cards ?? {})) {
    const e = catalog.find((x) => String(x.id) === key)
    if (!e) continue
    const r = parseRateCard(raw)
    if (!r.ok) throw new Error(`The published rate card for ${e.title} (tour ${key}) is not valid: ${r.error}`)
    e.pricing = r.card.pricing
    if (r.card.minGuests > 1) e.minGuests = r.card.minGuests
    else delete e.minGuests
  }
}

const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`

/** The card in one plain sentence, as Collin would say it. For the admin screen and the change log. */
export function describeRateCard(card: RateCard): string {
  const p = card.pricing
  const parts: string[] = []
  const zones = TOUR_ZONES.filter((z) => typeof p.zoneRates?.[z] === 'number')
  if (zones.length && p.mode === 'per_person') {
    parts.push(`By pickup area, per person: ${zones.map((z) => `${TOUR_ZONE_LABEL[z]} ${usd(p.zoneRates![z]!)}`).join(', ')}`)
  } else if (zones.length) {
    parts.push(`By pickup area, for ${p.tierMax === 1 ? '1 person' : `1 to ${p.tierMax} people`}: ${zones.map((z) => `${TOUR_ZONE_LABEL[z]} ${usd(p.zoneRates![z]!)}`).join(', ')}`)
    parts.push(`each extra person ${usd(p.extraPerPerson)}`)
  } else if (p.mode === 'group') {
    parts.push(`${usd(p.baseRate)} for 1 to ${p.tierMax} ${p.tierMax === 1 ? 'person' : 'people'}`)
    parts.push(`from ${p.tierMax + 1}, ${usd(p.extraPerPerson)} a person for the whole group`)
  } else {
    parts.push(`${usd(p.baseRate)} a person for 1 to ${p.tierMax}`)
    parts.push(`from ${p.tierMax + 1}, ${usd(p.extraPerPerson)} a person`)
  }
  if (p.perPersonAddon) parts.push(`plus ${usd(p.perPersonAddon)} for every person`)
  if (card.minGuests > 1) parts.push(`${card.minGuests} people or more`)
  const s = parts.join('; ')
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`
}

/** One line of a change: what moved, as the desk labels it, old and new. */
export interface RateCardChange {
  label: string
  was: string
  now: string
}

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`
/** The four ways a card can price: for the group or per person, with one rate or a rate per pickup area. */
export type RateKind = 'group' | 'per_person' | 'area' | 'area_person'
export const kindOf = (c: RateCard): RateKind => {
  const byArea = TOUR_ZONES.some((z) => typeof c.pricing.zoneRates?.[z] === 'number')
  if (!byArea) return c.pricing.mode
  return c.pricing.mode === 'per_person' ? 'area_person' : 'area'
}

/**
 * What moves between two canonical cards, line by line, in the desk's own
 * words, so the owner reads "Negril $420, was $400" instead of comparing two
 * lists. Null when the new card is priced another way (for the group or per
 * person, with one rate or by area): there a line-by-line list would mislead,
 * and the desk shows the whole new card instead. An empty list means nothing moved.
 */
export function rateCardChanges(before: RateCard, after: RateCard): RateCardChange[] | null {
  const kind = kindOf(after)
  if (kindOf(before) !== kind) return null
  const a = before.pricing
  const b = after.pricing
  const out: RateCardChange[] = []
  const line = (label: string, was: string, now: string) => { if (was !== now) out.push({ label, was, now }) }
  if (kind === 'area' || kind === 'area_person') {
    for (const z of TOUR_ZONES) {
      const w = a.zoneRates?.[z]
      const n = b.zoneRates?.[z]
      line(TOUR_ZONE_LABEL[z], typeof w === 'number' ? usd(w) : 'Not sold online', typeof n === 'number' ? usd(n) : 'Not sold online')
    }
    // Per person by area has no tier and no extra-guest rate to move.
    if (kind === 'area') {
      line('Covers up to', people(a.tierMax), people(b.tierMax))
      line('Each extra person', usd(a.extraPerPerson), usd(b.extraPerPerson))
    }
  } else {
    line(kind === 'group' ? 'Rate for the group' : 'Rate per person', usd(a.baseRate), usd(b.baseRate))
    line(kind === 'group' ? 'Covers up to' : 'That rate is for up to', people(a.tierMax), people(b.tierMax))
    line('Bigger groups, per person', usd(a.extraPerPerson), usd(b.extraPerPerson))
  }
  line('Added for every person', a.perPersonAddon ? usd(a.perPersonAddon) : 'None', b.perPersonAddon ? usd(b.perPersonAddon) : 'None')
  line('Smallest party', before.minGuests > 1 ? people(before.minGuests) : 'Anyone', after.minGuests > 1 ? people(after.minGuests) : 'Anyone')
  return out
}
