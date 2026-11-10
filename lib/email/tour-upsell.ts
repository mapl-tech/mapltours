import 'server-only'
import { sendEmail } from '@/lib/email/send'
import { maskEmail } from '@/lib/booking-sync'
import { escapeLikePattern } from '@/lib/pg-like'
import TourUpsell, { upsellSubject, type TourUpsellProps } from '@/emails/TourUpsell'
import { unsubscribeUrl, verifyStop, listUnsubscribeHeaders, contactPath } from '@/lib/trip-tips/unsubscribe'
import { TRIP_TIPS_POSTAL_ADDRESS } from '@/lib/trip-tips/postal'
import {
  planUpsell,
  arrivalMs,
  upsellSendDueMs,
  UPSELL_STAMP_KEY,
  UPSELL_TIP_GAP_DAYS,
  UPSELL_MIN_LEAD_DAYS,
  type UpsellBooking,
  type UpsellPlan,
  type UpsellSkipReason,
} from '@/lib/tour-upsell'

/**
 * The I/O half of the tour email (rules in lib/tour-upsell, words in
 * emails/TourUpsell.tsx): the checks that need a database or Resend, the
 * claim that makes it send once, the links, and the send itself.
 *
 * Before any send, in this order, each failing closed:
 *   1. the guest has bought no tour (any booking, by email);
 *   2. no trip tip went to them in the last UPSELL_TIP_GAP_DAYS days;
 *   3. Resend does not have them unsubscribed (one stop covers both kinds of
 *      marketing mail, lib/trip-tips/unsubscribe);
 *   4. their stop link verifies, so the email never carries a dead one;
 *   5. the stamp is claimed (merge_dispatch only-if-absent), so two runs can
 *      never both send.
 * A guest whose note mentions an accessibility or care need, or a baby, gets
 * no email at all (lib/tour-upsell accessibilityNeed and hasBaby; owner, Nov
 * 10 2026), and nothing else is sent about them either.
 */

export const UPSELL_FROM = 'MAPL Tours Jamaica <contact@mapltours.com>'
export const UPSELL_REPLY_TO = 'contact@mapltours.com'
const SITE = 'https://mapltours.com'
const SUPPORT_EMAIL = 'contact@mapltours.com'
const RESEND_API = 'https://api.resend.com'
const MS_PER_DAY = 86_400_000

export type UpsellRunSkip = UpsellSkipReason | 'claimed_elsewhere' | 'tip_recent' | 'unsubscribed' | 'contact_check_failed' | 'no_unsubscribe_link'

export interface TourUpsellResult {
  ok: boolean
  bookingId: string
  /** Masked address, never the address itself. */
  sentTo?: string
  skipped?: UpsellRunSkip
  subject?: string
  picks?: string[]
  error?: string
}

/** Columns the eligibility rules and the email both need. */
export const UPSELL_BOOKING_SELECT =
  'id, email, first_name, last_name, status, booking_type, created_at, refund_state, special_requests, dispatch, booking_items(item_type, hotel, destination, passengers, travelers, arrival_at, departure_at)'

/* ── Formatting ───────────────────────────────────────────────────────────── */

/** "Mon, Jan 11" for a Jamaica instant. */
export function dayLabelFromMs(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Jamaica' }).format(new Date(ms))
}

/** "Tue, Jan 12" for a "YYYY-MM-DD" calendar day. */
export function dayLabel(day: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
}

/** "3.5 to 4 hours door to door", "About 3 hours door to door". */
export function doorToDoorLabel(d: { lo: number; hi: number } | null): string | null {
  if (!d) return null
  return d.lo === d.hi ? `About ${d.lo} hours door to door` : `${d.lo} to ${d.hi} hours door to door`
}

/** "Ages 8 and up", "All ages", "Ages 16+ to drive, 8+ to ride". */
export function agesLabel(ages: string | null): string | null {
  if (!ages) return null
  return /^all ages/i.test(ages) ? ages : `Ages ${ages}`
}

const UTM = 'utm_source=email&utm_medium=lifecycle&utm_campaign=tour_upsell'

/**
 * The button's link: /book fills the tour cart with this tour, the day, the
 * party and the hotel pickup, then opens checkout (components/agent/BookHandoff,
 * which re-checks the date against the notice rule and explains a stale link).
 */
export function bookLink(slug: string, plan: Pick<UpsellPlan, 'party' | 'tourDay' | 'hotel'>, site = SITE): string {
  const q = new URLSearchParams({ tour: slug, guests: String(plan.party), date: plan.tourDay, hotel: plan.hotel })
  return `${site}/book?${q.toString()}&${UTM}&utm_content=${encodeURIComponent(slug)}`
}

/** The template's props for a plan: pure, so the preview script and the tests build exactly what is sent. */
export function upsellProps(plan: UpsellPlan, opts: { unsubscribeUrl: string; site?: string; postalAddress?: string | null }): TourUpsellProps {
  const site = opts.site ?? SITE
  const shortestHi = Math.min(...plan.picks.map((p) => p.doorToDoor?.hi ?? Infinity))
  return {
    firstName: plan.firstName,
    hotel: plan.hotel,
    town: plan.town,
    arrivalLabel: dayLabelFromMs(plan.arrivalMs),
    tourDayLabel: dayLabel(plan.tourDay),
    freeDays: plan.freeDays,
    party: plan.party,
    childAware: plan.youngest !== null,
    picks: plan.picks.map((p, i) => ({
      title: p.title,
      description: p.description,
      duration: p.duration,
      doorToDoor: doorToDoorLabel(p.doorToDoor),
      ages: agesLabel(p.ages),
      total: p.total,
      bookUrl: bookLink(p.slug, plan, site),
      detailsUrl: `${site}/experience/${p.slug}?${UTM}&utm_content=${encodeURIComponent(p.slug)}`,
      imageUrl: `${site}${p.emailImage}`,
      // Marked only when it really is the shortest of the cards, and only one.
      shortest: plan.picks.length > 1 && i === plan.picks.findIndex((q) => (q.doorToDoor?.hi ?? Infinity) === shortestHi) && Number.isFinite(shortestHi),
    })),
    eat: plan.eat ? { name: plan.eat.name, town: plan.eat.town, description: plan.eat.description, mapsUrl: plan.eat.mapsUrl } : null,
    exploreUrl: `${site}/explore?${UTM}&utm_content=explore`,
    unsubscribeUrl: opts.unsubscribeUrl,
    postalAddress: opts.postalAddress ?? TRIP_TIPS_POSTAL_ADDRESS,
    supportEmail: SUPPORT_EMAIL,
  }
}

/* ── Checks that need I/O (each fails closed) ─────────────────────────────── */

/**
 * Has this guest already bought a tour? Asked by email, because a tour bought
 * as a separate order still counts. An error answers yes, so an outage makes
 * the job send nothing rather than send wrongly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function guestHasTour(svc: any, email: string | null | undefined): Promise<boolean> {
  if (!email) return true
  const { data, error } = await svc
    .from('bookings')
    .select('id')
    .eq('status', 'paid')
    .eq('booking_type', 'tour')
    .ilike('email', escapeLikePattern(email.trim()))
    .limit(1)
  if (error) return true
  return Array.isArray(data) && data.length > 0
}

/**
 * Did a trip tip go to this address recently (sent, or claimed and possibly
 * sent)? The tips job gives this email the same courtesy, so the two never
 * land within a week of each other. An error answers yes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function tipSentRecently(svc: any, email: string, nowMs: number): Promise<boolean> {
  const since = new Date(nowMs - UPSELL_TIP_GAP_DAYS * MS_PER_DAY).toISOString()
  const { data, error } = await svc
    .from('trip_tips_log')
    .select('status, sent_at, created_at')
    .eq('email', email.trim().toLowerCase())
    .in('status', ['sent', 'claimed'])
    .gte('created_at', new Date(nowMs - 60 * MS_PER_DAY).toISOString())
    .limit(50)
  if (error || !Array.isArray(data)) return true
  return data.some((r: { sent_at: string | null; created_at: string }) => (r.sent_at ?? r.created_at) >= since)
}

/**
 * Has this address stopped our marketing mail? Resend's global flag, read
 * fresh before the send. No contact (404) is "no". Anything unclear is "yes".
 */
export async function resendUnsubscribed(email: string, key: string | undefined, f: typeof fetch = fetch): Promise<boolean | 'error'> {
  if (!key) return 'error'
  try {
    const r = await f(`${RESEND_API}${contactPath(email)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(2_500), cache: 'no-store' })
    if (r.status === 404) return false
    if (!r.ok) return 'error'
    const j = (await r.json()) as { unsubscribed?: unknown }
    return j.unsubscribed === true ? true : j.unsubscribed === false ? false : 'error'
  } catch {
    return 'error'
  }
}

/* ── The send ─────────────────────────────────────────────────────────────── */

export interface SendDeps {
  now?: number
  force?: boolean
  /** Plan and check everything, claim and send nothing. */
  dry?: boolean
  resendKey?: string
  stopSecret?: string
  fetchImpl?: typeof fetch
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendTourUpsell(svc: any, booking: UpsellBooking, deps: SendDeps = {}): Promise<TourUpsellResult> {
  const base = { bookingId: booking.id }
  const now = deps.now ?? Date.now()
  const key = deps.resendKey ?? process.env.RESEND_API_KEY
  const secret = deps.stopSecret ?? process.env.TRIP_TIPS_SECRET ?? ''
  const f = deps.fetchImpl ?? fetch

  const hasTour = await guestHasTour(svc, booking.email)
  let planned = planUpsell(booking, now, { hasTour })
  // `force` bypasses ONLY the already-sent stamp (an operator resend), and
  // re-plans so the resend is curated afresh. It never bypasses the rest.
  if (deps.force && 'skipped' in planned && planned.skipped === 'already_sent') {
    planned = planUpsell({ ...booking, dispatch: {} }, now, { hasTour })
  }
  if ('skipped' in planned) return { ...base, ok: false, skipped: planned.skipped }
  const p = planned.plan

  if (await tipSentRecently(svc, p.email, now)) return { ...base, ok: false, skipped: 'tip_recent' }
  const unsub = await resendUnsubscribed(p.email, key, f)
  if (unsub === 'error') return { ...base, ok: false, skipped: 'contact_check_failed' }
  if (unsub) return { ...base, ok: false, skipped: 'unsubscribed' }

  if (!secret) return { ...base, ok: false, skipped: 'no_unsubscribe_link' }
  const stop = unsubscribeUrl(p.email, secret)
  const sp = new URL(stop).searchParams
  if (verifyStop(sp.get('e'), sp.get('t'), secret) !== p.email) return { ...base, ok: false, skipped: 'no_unsubscribe_link' }

  const props = upsellProps(p, { unsubscribeUrl: stop })
  const subject = upsellSubject(props)
  const picks = p.picks.map((k) => k.title)
  if (deps.dry) return { ...base, ok: true, sentTo: maskEmail(p.email), subject, picks }

  const claimedAt = new Date(now).toISOString()
  const { data: claimed } = await svc.rpc('merge_dispatch', {
    p_booking_id: booking.id,
    p_patch: { [UPSELL_STAMP_KEY]: claimedAt },
    p_only_if_absent: deps.force ? null : UPSELL_STAMP_KEY,
  })
  if (!deps.force && (!claimed || claimed.length === 0)) return { ...base, ok: false, skipped: 'claimed_elsewhere' }

  const res = await sendEmail({
    to: p.email,
    from: UPSELL_FROM,
    replyTo: UPSELL_REPLY_TO,
    subject,
    react: TourUpsell(props),
    headers: listUnsubscribeHeaders(stop),
    idempotencyKey: `tour-upsell:${booking.id}${deps.force ? `:${claimedAt}` : ''}`,
    tags: [{ name: 'category', value: 'tour_upsell' }],
  })
  if (!res?.ok) {
    // Release the claim so a later run retries, removing only OUR key.
    await svc.rpc('merge_dispatch', { p_booking_id: booking.id, p_remove: [UPSELL_STAMP_KEY] })
    return { ...base, ok: false, error: res?.error ?? 'send failed' }
  }
  return { ...base, ok: true, sentTo: maskEmail(p.email), subject, picks }
}

/** Exposed for the route's report: the window a booking is in, as dates. */
export function windowFor(booking: UpsellBooking): { due: string | null; closes: string | null } {
  const due = upsellSendDueMs(booking)
  const arrival = arrivalMs(booking)
  return {
    due: due === null ? null : new Date(due).toISOString().slice(0, 10),
    closes: arrival === null ? null : new Date(arrival - UPSELL_MIN_LEAD_DAYS * MS_PER_DAY).toISOString().slice(0, 10),
  }
}
