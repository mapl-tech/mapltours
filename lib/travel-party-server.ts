import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type React from 'react'
import { sendEmail, sendEmailBatch } from '@/lib/email/send'
import { bookingProof, canSeeConfirmation } from '@/lib/confirm-proof-server'
import { SITE_ORIGIN } from '@/lib/site-origin'
import TravelPartyTrip, { type TravelPartyTripProps } from '@/emails/TravelPartyTrip'
import TravelPartyCancelled from '@/emails/TravelPartyCancelled'
import {
  TRAVEL_PARTY_PATH,
  bookerName,
  partyCap,
  partyTripLines,
  type PartyAddResult,
  type PartyMemberView,
} from '@/lib/travel-party'

/**
 * The server half of lib/travel-party: the table (migration 042), the signed
 * links, and every email a party member gets.
 *
 * Nothing here can change a booking, a payment or the booker's own emails.
 * The senders run only AFTER the booker's email went, every one of them is
 * best effort, and none throws: a party copy that fails is logged and the
 * caller's result stays exactly what it was. Each copy goes to one person
 * (never CC or BCC), carries a stop link and a one-click List-Unsubscribe, and
 * has its own Resend idempotency key, so a retry is delivered once.
 */

const SUPPORT_EMAIL = 'contact@mapltours.com'
export const PARTY_TABLE = 'booking_party'
/** A party copy waits at most this long, so a slow mail service never holds a cron run or a page. */
const PARTY_SEND_TIMEOUT_MS = 2500

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = any

/* ── Links ───────────────────────────────────────────────────────────── */

/**
 * The booker's link to their party page, from the confirmation email. It
 * carries the same signed booking proof the checkout gives the browser that
 * paid (lib/confirm-proof-server); the middleware moves it into the HttpOnly
 * proof cookie and drops it from the address before the page or any tag
 * exists. Null when no proof can be made, and the email then shows no link.
 */
export function travelPartyUrl(bookingId: string): string | null {
  if (typeof bookingId !== 'string' || !UUID.test(bookingId)) return null
  const proof = bookingProof(bookingId)
  return proof ? `${SITE_ORIGIN}${TRAVEL_PARTY_PATH}?b=${bookingId.toLowerCase()}&trip_proof=${proof}` : null
}

const STOP_PREFIX = 'travel-party:v1:stop:'
export const PARTY_STOP_PATH = '/api/travel-party/stop'

/** The cart reminders' key (or the mention or trip-tips key), under this module's own prefix: no new environment variable. */
export function partySecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const s = env.CART_REMINDER_SECRET || env.MENTIONS_SECRET || env.TRIP_TIPS_SECRET
  return s && s.length >= 16 ? s : null
}

export function signPartyStop(memberId: string, secret: string): string {
  return createHmac('sha256', secret).update(`${STOP_PREFIX}${memberId.toLowerCase()}`).digest('base64url')
}

export function verifyPartyStop(memberId: unknown, token: unknown, secret: string): memberId is string {
  if (typeof memberId !== 'string' || !UUID.test(memberId) || typeof token !== 'string' || token.length > 100) return false
  const want = Buffer.from(signPartyStop(memberId, secret))
  const got = Buffer.from(token)
  return want.length === got.length && timingSafeEqual(want, got)
}

/** The link names the party row, never the address. */
export function partyStopUrl(memberId: string, secret: string): string {
  const id = memberId.toLowerCase()
  return `${SITE_ORIGIN}${PARTY_STOP_PATH}?p=${id}&t=${signPartyStop(id, secret)}`
}

function stopHeaders(url: string): Record<string, string> {
  return { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
}

/* ── The table ───────────────────────────────────────────────────────── */

export interface PartyRow {
  id: string
  email: string
  removed_at: string | null
  stopped_at: string | null
  confirmation_sent_at: string | null
}

/** Every row for a booking, oldest first; null when it cannot be read. */
export async function readPartyRows(svc: Svc, bookingId: string): Promise<PartyRow[] | null> {
  try {
    const { data, error } = await svc
      .from(PARTY_TABLE)
      .select('id, email, removed_at, stopped_at, confirmation_sent_at')
      .eq('booking_id', bookingId)
      .order('added_at', { ascending: true })
    if (error) {
      console.error('[travel-party] read failed', { bookingId, error: error.message })
      return null
    }
    return (data ?? []) as PartyRow[]
  } catch (err) {
    console.error('[travel-party] read threw', { bookingId, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/** The booker's list: everyone not removed, with whether their copy went and whether they stopped the emails. */
export function partyView(rows: PartyRow[]): PartyMemberView[] {
  return rows.filter((r) => !r.removed_at).map((r) => ({ email: r.email, sent: !!r.confirmation_sent_at, stopped: !!r.stopped_at }))
}

/** Who gets the next email: not removed, not stopped. */
export function activeRows(rows: PartyRow[]): PartyRow[] {
  return rows.filter((r) => !r.removed_at && !r.stopped_at)
}

const RESULTS: readonly PartyAddResult[] = ['added', 'exists', 'stopped', 'full', 'own', 'not_paid']

/** booking_party_add (migration 042): atomic, under a lock on the booking row. Null when it could not run. */
export async function addToParty(svc: Svc, bookingId: string, email: string, cap: number): Promise<{ result: PartyAddResult; id?: string; cap?: number } | null> {
  try {
    const { data, error } = await svc.rpc('booking_party_add', { p_booking_id: bookingId, p_email: email, p_cap: cap })
    if (error || !data || typeof data !== 'object') {
      console.error('[travel-party] add failed', { bookingId, error: error?.message ?? 'no answer' })
      return null
    }
    const d = data as { result?: unknown; id?: unknown; cap?: unknown }
    if (!RESULTS.includes(d.result as PartyAddResult)) return null
    return {
      result: d.result as PartyAddResult,
      ...(typeof d.id === 'string' ? { id: d.id } : {}),
      ...(typeof d.cap === 'number' ? { cap: d.cap } : {}),
    }
  } catch (err) {
    console.error('[travel-party] add threw', { bookingId, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/** The booker takes a person off: they get nothing more. True when the change saved. */
export async function removeFromParty(svc: Svc, bookingId: string, email: string): Promise<boolean> {
  try {
    const { error } = await svc
      .from(PARTY_TABLE)
      .update({ removed_at: new Date().toISOString() })
      .eq('booking_id', bookingId)
      .eq('email', email)
      .is('removed_at', null)
    if (error) console.error('[travel-party] remove failed', { bookingId, error: error.message })
    return !error
  } catch {
    return false
  }
}

/** The person stops the emails themselves (the stop link). Kept once set; the booker cannot add them again. */
export async function stopPartyMember(svc: Svc, memberId: string): Promise<boolean> {
  try {
    const { error } = await svc.from(PARTY_TABLE).update({ stopped_at: new Date().toISOString() }).eq('id', memberId).is('stopped_at', null)
    if (error) console.error('[travel-party] stop failed', { memberId, error: error.message })
    return !error
  } catch {
    return false
  }
}

/** What a confirmation page needs to show the booker their party card. */
export interface ConfirmParty {
  bookingId: string
  cap: number
  members: PartyMemberView[]
  /** Paid at Stripe, the webhook not yet in: the card explains and waits. */
  pending: boolean
}

/**
 * The party card for a confirmation page, or null when there is none to
 * show. Only the browser holding the booking proof, or the guest signed in as
 * its owner, may change the party (app/api/travel-party): the client secret
 * that can also open the page does not, so neither does the card. A booking
 * that is neither paid nor waiting on its webhook shows no card.
 */
export async function partyForConfirmation(
  svc: Svc,
  booking: { id: string; email: string | null; user_id: string | null; status?: string | null },
  items: Parameters<typeof partyCap>[0],
): Promise<ConfirmParty | null> {
  try {
    if (!(await canSeeConfirmation({ id: booking.id, email: booking.email, user_id: booking.user_id }))) return null
    const cap = partyCap(items)
    if (booking.status === 'pending') return { bookingId: booking.id, cap, members: [], pending: true }
    if (booking.status !== 'paid') return null
    const rows = await readPartyRows(svc, booking.id)
    return { bookingId: booking.id, cap, members: rows ? partyView(rows) : [], pending: false }
  } catch {
    return null
  }
}

/* ── What a party member reads ───────────────────────────────────────── */

export const PARTY_BOOKING_COLS =
  'id, status, booking_type, first_name, pickup, booking_items(item_type, title, destination, date, travelers, hotel, trip_type, passengers, arrival_at, arrival_flight, departure_at, departure_flight)'

interface PartyBooking {
  id: string
  status: string
  booking_type: string
  first_name: string | null
  pickup: string | null
  booking_items: Array<{
    item_type: string | null
    title: string | null
    destination: string | null
    date: string | null
    travelers: number | null
    hotel: string | null
    trip_type: string | null
    passengers: number | null
    arrival_at: string | null
    arrival_flight: string | null
    departure_at: string | null
    departure_flight: string | null
  }> | null
}

const refOf = (id: string) => 'MAPL-' + id.slice(0, 8).toUpperCase()

/** The trip as a party member's confirmation shows it: what, where and when; never money, contact details or notes. */
export function tripPropsOf(b: PartyBooking): Omit<TravelPartyTripProps, 'stopUrl'> {
  const items = b.booking_items ?? []
  const isRide = b.booking_type === 'transfer'
  return {
    bookingRef: refOf(b.id),
    addedBy: bookerName(b.first_name),
    kind: isRide ? 'transfer' : 'tour',
    transfers: isRide
      ? items.map((i) => ({
          destination: (i.hotel ?? i.destination ?? 'Your hotel').trim(),
          tripType: i.trip_type === 'round_trip' ? 'round_trip' : 'one_way',
          passengers: Math.max(1, Number(i.passengers ?? i.travelers ?? 1) || 1),
          arrivalAt: i.arrival_at,
          arrivalFlight: i.arrival_flight,
          departureAt: i.departure_at,
          departureFlight: i.departure_flight,
        }))
      : [],
    tours: isRide
      ? []
      : items
          .filter((i) => i.item_type !== 'transfer')
          .sort((x, y) => String(x.date ?? '').localeCompare(String(y.date ?? '')))
          .map((i) => ({ title: (i.title ?? 'Your tour').trim(), destination: (i.destination ?? 'Jamaica').trim(), date: i.date ?? '', travelers: Math.max(1, Number(i.travelers ?? 1) || 1) })),
    pickup: isRide ? null : (b.pickup ?? null),
    supportEmail: SUPPORT_EMAIL,
  }
}

function tripSubject(p: Omit<TravelPartyTripProps, 'stopUrl'>): string {
  const what = p.kind === 'transfer' ? 'Your Jamaica airport ride' : 'Your Jamaica tour'
  return p.addedBy ? `${what}, booked by ${p.addedBy} (${p.bookingRef})` : `${what} details (${p.bookingRef})`
}

export type PartyConfirmationOutcome = 'sent' | 'already' | 'skipped' | 'failed'

/**
 * One person's copy of the confirmation, once. Sent only while the booking is
 * paid and the person is still on the party; stamped after Resend accepts it.
 * The idempotency key is the row's, so two taps send one email.
 */
export async function sendPartyConfirmation(svc: Svc, bookingId: string, memberId: string): Promise<PartyConfirmationOutcome> {
  try {
    const secret = partySecret()
    if (!secret) {
      console.error('[travel-party] no signing key: a party email needs a stop link, so nothing was sent')
      return 'skipped'
    }
    const { data: b, error } = await svc.from('bookings').select(PARTY_BOOKING_COLS).eq('id', bookingId).maybeSingle()
    if (error || !b) return 'failed'
    if ((b as PartyBooking).status !== 'paid') return 'skipped'
    const { data: m, error: mErr } = await svc
      .from(PARTY_TABLE)
      .select('id, email, removed_at, stopped_at, confirmation_sent_at')
      .eq('id', memberId)
      .eq('booking_id', bookingId)
      .maybeSingle()
    if (mErr || !m) return 'failed'
    const row = m as PartyRow
    if (row.removed_at || row.stopped_at) return 'skipped'
    if (row.confirmation_sent_at) return 'already'

    const stopUrl = partyStopUrl(row.id, secret)
    const base = tripPropsOf(b as PartyBooking)
    const res = await sendEmail({
      to: row.email,
      subject: tripSubject(base),
      react: TravelPartyTrip({ ...base, stopUrl }),
      headers: stopHeaders(stopUrl),
      tags: [{ name: 'type', value: 'travel_party_confirmation' }],
      idempotencyKey: `travel-party/confirm/${row.id}`,
      timeoutMs: PARTY_SEND_TIMEOUT_MS,
    })
    if (!res.ok) {
      console.error('[travel-party] confirmation copy not sent', { bookingId, memberId, error: res.error })
      return 'failed'
    }
    const { error: sErr } = await svc
      .from(PARTY_TABLE)
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq('id', row.id)
      .is('confirmation_sent_at', null)
    if (sErr) console.error('[travel-party] sent, but not stamped', { bookingId, memberId, error: sErr.message })
    return 'sent'
  } catch (err) {
    console.error('[travel-party] confirmation copy threw', { bookingId, memberId, error: err instanceof Error ? err.message : String(err) })
    return 'failed'
  }
}

/**
 * The same email to every person still on the party, each their own copy,
 * after the booker's went. Best effort and bounded: it never throws, and the
 * copies wait at most PARTY_SEND_TIMEOUT_MS.
 *
 * One Resend request for the whole party (sendEmailBatch), never a CC or BCC:
 * each copy is still its own email, to that person alone, with their own stop
 * link. One request because Resend allows 10 a second, and a party of up to
 * 12 sent one request each, right after the booker's, could pass it and have
 * the last copies refused. Its idempotency key is built from the per-person
 * keys, so a repeat for the same people is delivered once.
 */
export async function sendToParty(
  svc: Svc,
  bookingId: string,
  kind: 'dayof' | 'driver_update' | 'cancelled' | 'review',
  build: (m: { id: string; stopUrl: string }) => { subject: string; react: React.ReactElement; key: string },
): Promise<{ sent: number; failed: number }> {
  // How many copies were due, so a failure past this point is counted, not hidden.
  let due = 0
  try {
    const secret = partySecret()
    if (!secret) return { sent: 0, failed: 0 }
    const rows = await readPartyRows(svc, bookingId)
    if (!rows) return { sent: 0, failed: 0 }
    const people = activeRows(rows)
    if (people.length === 0) return { sent: 0, failed: 0 }
    due = people.length
    const copies = people.map((m) => {
      const stopUrl = partyStopUrl(m.id, secret)
      const e = build({ id: m.id, stopUrl })
      return { key: e.key, email: { to: m.email, subject: e.subject, react: e.react, headers: stopHeaders(stopUrl), tags: [{ name: 'type', value: `travel_party_${kind}` }] } }
    })
    const batchKey = `travel-party-batch/${createHash('sha256').update(copies.map((c) => c.key).sort().join('\n')).digest('hex').slice(0, 40)}`
    const res = await sendEmailBatch(copies.map((c) => c.email), { idempotencyKey: batchKey, timeoutMs: PARTY_SEND_TIMEOUT_MS })
    const failed = res.results.filter((r) => !r.ok).length
    if (failed) console.error('[travel-party] some party copies did not send', { bookingId, kind, failed, of: people.length })
    return { sent: people.length - failed, failed }
  } catch (err) {
    console.error('[travel-party] party copies threw', { bookingId, kind, error: err instanceof Error ? err.message : String(err) })
    return { sent: 0, failed: due }
  }
}

/** The cancellation, to everyone still on the party: the trip only, no money. */
export async function sendPartyCancellation(svc: Svc, bookingId: string): Promise<{ sent: number; failed: number }> {
  try {
    const { data: b, error } = await svc.from('bookings').select(PARTY_BOOKING_COLS).eq('id', bookingId).maybeSingle()
    if (error || !b) return { sent: 0, failed: 0 }
    const booking = b as PartyBooking
    const isTransfer = booking.booking_type === 'transfer'
    const addedBy = bookerName(booking.first_name)
    const lines = partyTripLines(booking.booking_items ?? [], isTransfer)
    const ref = refOf(booking.id)
    return sendToParty(svc, bookingId, 'cancelled', (m) => ({
      subject: `Cancelled: ${isTransfer ? 'your Jamaica airport ride' : 'your Jamaica tour'} (${ref})`,
      react: TravelPartyCancelled({ bookingRef: ref, addedBy, isTransfer, lines, supportEmail: SUPPORT_EMAIL }),
      key: `travel-party/cancelled/${booking.id}/${m.id}`,
    }))
  } catch (err) {
    console.error('[travel-party] cancellation copies threw', { bookingId, error: err instanceof Error ? err.message : String(err) })
    return { sent: 0, failed: 0 }
  }
}
