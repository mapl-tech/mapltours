/**
 * A booking's travel party: the people a booker adds AFTER paying, on the
 * confirmation page or from the link in their confirmation email, so each
 * gets their own copy of that trip's emails (owner, Nov 24 2026).
 *
 * What a party member gets: the confirmation, and for a ride the driver's
 * details before pickup, any driver change, and a cancellation; then, the day
 * after the trip, one request for a review, as the booker gets (owner, Nov 24
 * 2026: "Make sure the party members also receive review emails as well").
 * Never a trip tip, reminder or anything for advertising: the booker typed
 * their address, they never agreed to anything themselves. Never CC: each
 * person gets their own email, so nobody sees anyone else's address.
 *
 * Pure and dependency-free, so the confirmation page's form can check an
 * address with the same rule the server stores it by. Storage and sends live
 * in lib/travel-party-server.ts; the table is migration 042.
 */

import type { DriverUpdateProps } from '@/emails/DriverUpdate'

/** The page the booker's confirmation email links to. */
export const TRAVEL_PARTY_PATH = '/travel-party'

/** Nobody adds more than this many, whatever the party size. */
export const PARTY_MAX = 12

/** The checkout's own address rule (lib/checkout-form EMAIL_RE), kept here so this module stays import-free for the browser. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The address as it is stored (trimmed, lower case), or null when it is not one. Matches migration 042's check. */
export function partyEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const e = raw.trim().toLowerCase()
  if (e.length < 6 || e.length > 254 || !EMAIL_SHAPE.test(e)) return null
  return e
}

interface SizedItem {
  item_type?: string | null
  passengers?: number | null
  travelers?: number | null
}

/**
 * How many people a booking may add: its party size, at least one and at most
 * PARTY_MAX. The whole party, not one fewer, because the person who booked is
 * not always one of the travellers (a trip booked for parents).
 */
export function partyCap(items: SizedItem[] | null | undefined): number {
  let size = 0
  for (const i of items ?? []) {
    const n = Number(i.item_type === 'transfer' ? (i.passengers ?? i.travelers) : (i.travelers ?? i.passengers))
    if (Number.isFinite(n) && n > size) size = Math.floor(n)
  }
  return Math.max(1, Math.min(PARTY_MAX, size))
}

/** What the server answered about one address. */
export type PartyAddResult = 'added' | 'exists' | 'stopped' | 'full' | 'own' | 'not_paid'

/** One person on the booker's list, as the confirmation page shows them. */
export interface PartyMemberView {
  email: string
  /** Their copy of the confirmation went. */
  sent: boolean
  /** They stopped these emails themselves; nothing more goes to them. */
  stopped: boolean
}

/** Every sentence the booker can see about an address, shared by the form and the server so they never disagree. */
export const PARTY_COPY = {
  invalid: 'Check the address. It should look like name@example.com.',
  own: 'That is your own address, and you already get every email.',
  exists: 'Already added.',
  stopped: 'This person stopped our emails about this trip, so we cannot add them again.',
  full: (cap: number) => `You have added ${cap} ${cap === 1 ? 'person' : 'people'}, the most for this booking. Remove someone to add another.`,
  notPaid: 'Your payment is still being confirmed. Try again in a minute.',
  notAllowed: 'Open this page from the link in your confirmation email to add people.',
  busy: 'Too many tries at once. Wait a minute and try again.',
  failed: 'That did not save. Try again.',
  added: (email: string) => `Sent the trip details to ${email}.`,
  addedNotSent: (email: string) => `Added ${email}, but the email did not go yet. Tap Send again.`,
  removed: (email: string) => `Removed ${email}. They will not get any more emails about this trip.`,
} as const

interface LineItem {
  item_type: string | null
  title: string | null
  destination: string | null
  date: string | null
  hotel: string | null
  arrival_at: string | null
  departure_at: string | null
}

// A leg's stamp is the booking's Jamaica wall clock and a tour's date a
// calendar day: both read in UTC (a day at noon), so no zone moves them.
function shortDay(isoOrYmd: string | null): string | null {
  if (!isoOrYmd) return null
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(isoOrYmd) ? `${isoOrYmd}T12:00:00Z` : isoOrYmd)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** One line per ride or tour, for the party's cancellation notice: what and when, never money. */
export function partyTripLines(items: LineItem[], isTransfer: boolean): string[] {
  if (isTransfer) {
    return items.map((i) => {
      const legs = [
        shortDay(i.arrival_at) ? `arrival ${shortDay(i.arrival_at)}` : null,
        shortDay(i.departure_at) ? `departure ${shortDay(i.departure_at)}` : null,
      ].filter(Boolean).join(', ')
      return `Airport ride · ${(i.hotel ?? i.destination ?? 'your hotel').trim()}${legs ? ` · ${legs}` : ''}`
    })
  }
  return items
    .filter((i) => i.item_type !== 'transfer')
    .sort((x, y) => String(x.date ?? '').localeCompare(String(y.date ?? '')))
    .map((i) => `${(i.title ?? 'Tour').trim()}${shortDay(i.date) ? ` · ${shortDay(i.date)}` : ''}`)
}

/** "Ana" for a booker named Ana; never a surname, never an address. */
export function bookerName(firstName: string | null | undefined): string | null {
  const n = (firstName ?? '').trim().split(/\s+/)[0] ?? ''
  return n && n.length <= 40 && !/[@/:]/.test(n) ? n : null
}

/** "Ana's name" for the sign at arrivals; the booking's name when the booker gave none. */
export function signName(addedBy: string | null): string {
  return addedBy ? `${addedBy}${/s$/i.test(addedBy) ? "'" : "'s"} name` : 'the name on the booking'
}

/**
 * Why a party member is getting a trip email, and how to stop them. Every
 * party email ends with it, the review request included, so it names
 * everything they get: this trip's emails, then one request for a review.
 */
export function partyFooter(addedBy: string | null): string {
  return `${addedBy ?? 'The person who booked'} added your email to their MAPL Tours Jamaica booking, so we email you about this trip, and once after it to ask for a review. We use your address for nothing else.`
}

/**
 * The driver update (lib/driver-update) as a party member reads it. The
 * booker's copy says the sign at arrivals shows "your name"; for someone
 * travelling with them it shows the booker's. Every other line is the same.
 * tests/unit/travel-party.spec.ts fails if the booker's wording changes and
 * this stops matching it, so a copy can never say "your name" to the wrong
 * person.
 */
export function driverUpdateForParty(props: DriverUpdateProps, addedBy: string | null, stopUrl: string): DriverUpdateProps {
  const sign = signName(addedBy)
  return {
    ...props,
    lead: props.lead.replace('sign showing your name', `sign showing ${sign}`),
    steps: props.steps.map((step) => step.map((part) => (part.t === ' sign with your name on it.' ? { ...part, t: ` sign with ${sign} on it.` } : part))),
    party: { footer: partyFooter(addedBy), stopUrl },
  }
}
