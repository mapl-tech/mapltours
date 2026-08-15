import { sendEmail, opsBcc } from '@/lib/email/send'
import TransferDayOf from '@/emails/TransferDayOf'
import { firstLeg, bookingRef, jaDate, jaTime, type Bk } from '@/lib/dispatch'

/**
 * Day-of-travel emails for transfers: when they are due, and sending one.
 *
 * Shared by the manual dispatch-console button and the hourly cron so both
 * paths send byte-identical mail and share one idempotency stamp. A guest can
 * therefore never get two copies, whichever path fires first.
 *
 * SAFETY: strictly additive. This reads bookings and writes only the two
 * `dispatch.dayof_*_sent` bookkeeping keys. It never touches money columns,
 * booking status, or the Stripe/webhook path.
 */

export const AIRPORT = 'Sangster International Airport (MBJ), Montego Bay'
export const SUPPORT_EMAIL = 'contact@mapltours.com'

export type Leg = 'arrival' | 'departure'

/** Jamaica is UTC-5 all year. It has never observed daylight saving. */
const JA_OFFSET_MIN = -300

/**
 * The real instant a leg happens.
 *
 * Leg times are stored as the guest's Jamaica wall-clock carrying a `Z`, which
 * every guest-facing surface reads back verbatim in UTC. So a row reading
 * `16:05Z` means 4:05 PM IN JAMAICA, which is really 21:05 UTC. Scheduling off
 * the raw parse would fire every email five hours early.
 */
export function legInstantMs(iso: string): number {
  return Date.parse(iso) - JA_OFFSET_MIN * 60_000
}

/** Hour of the day in Jamaica, 0-23, for a real instant. */
export function jaHour(nowMs: number): number {
  return new Date(nowMs + JA_OFFSET_MIN * 60_000).getUTCHours()
}

/** The Jamaica calendar date (YYYY-MM-DD) of a real instant. */
export function jaDateKey(nowMs: number): string {
  return new Date(nowMs + JA_OFFSET_MIN * 60_000).toISOString().slice(0, 10)
}

/**
 * Is this leg's day-of email due right now?
 *
 * Two ways to qualify, so a dawn pickup is not emailed while the guest sleeps:
 *   • within 13 hours of the pickup, which reaches a 7 AM airport run at 6 PM
 *     the evening before, while they can still act on it; or
 *   • the same Jamaica calendar day, once it is 5 AM there.
 *
 * Never after the fact: once the pickup time passes, the email is only noise,
 * and the guest is already in the car.
 */
export function isDue(legIso: string, nowMs: number): boolean {
  const at = legInstantMs(legIso)
  const hoursAway = (at - nowMs) / 3_600_000
  if (hoursAway <= 0) return false
  if (hoursAway <= 13) return true
  return jaDateKey(at) === jaDateKey(nowMs) && jaHour(nowMs) >= 5
}

export const stampKey = (leg: Leg) => (leg === 'arrival' ? 'dayof_arrival_sent' : 'dayof_departure_sent')

/**
 * Why this booking+leg cannot be mailed, or null if it can.
 *
 * The driver's name and number are required rather than optional: the whole
 * point of this email is telling a guest who is meeting them, and one that
 * says "being confirmed" in both fields is worse than none at all. The manual
 * console can still force a send once an operator has eyes on it.
 */
export function blockedReason(b: Bk, leg: Leg): string | null {
  if (b.status !== 'paid') return 'booking is not paid'
  if (!b.email) return 'booking has no email'
  const l = firstLeg(b)
  if (!l) return 'booking has no transfer leg'
  const at = leg === 'arrival' ? l.arrivalAt : l.departureAt
  if (!at) return `no ${leg} time on this booking`
  if ((b.dispatch ?? {})[stampKey(leg)]) return 'already sent'
  if (!b.driver_name || !b.driver_phone) return 'driver not assigned yet'
  // Temporal gate, shared by the cron and the manual button. Without it an
  // operator on a booking weeks out could fire a day-of email that claims the
  // stamp, which would permanently suppress the correctly-timed automated
  // send. The label is also only 'Today' | 'Tomorrow', so a send outside that
  // window would put a false day in the subject line.
  const nowMs = Date.now()
  const atMs = legInstantMs(at)
  if (atMs <= nowMs) return 'pickup time has passed'
  const today = jaDateKey(nowMs)
  const legDay = jaDateKey(atMs)
  const tomorrow = jaDateKey(nowMs + 24 * 3_600_000)
  if (legDay !== today && legDay !== tomorrow) {
    return `not until ${legDay}; the hourly job sends it on the day`
  }
  return null
}

export interface DayOfResult {
  ok: boolean
  bookingId: string
  leg: Leg
  sentTo?: string
  skipped?: string
  error?: string
}

/**
 * Send one leg's day-of email, exactly once.
 *
 * The stamp is claimed BEFORE the send, conditional on it still being unset,
 * so two overlapping runs cannot both mail the guest: the loser's update
 * matches zero rows and it backs out. If the send then fails, the claim is
 * released so the next run can retry.
 *
 * `force` bypasses ONLY the already-sent stamp, for the operator resending to
 * a guest who lost the mail. It never bypasses the driver-assigned guard: a
 * resend that still cannot name the driver is just as useless as the first.
 */
export async function sendDayOf(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  b: Bk,
  leg: Leg,
  opts: { force?: boolean } = {},
): Promise<DayOfResult> {
  const base = { bookingId: b.id as string, leg }
  const reason = blockedReason(b, leg)
  if (reason && !(opts.force && reason === 'already sent')) {
    return { ...base, ok: false, skipped: reason }
  }

  const l = firstLeg(b)
  if (!l) return { ...base, ok: false, skipped: 'booking has no transfer leg' }
  if (!b.email) return { ...base, ok: false, skipped: 'booking has no email' }
  const at = leg === 'arrival' ? l.arrivalAt : l.departureAt
  if (!at) return { ...base, ok: false, skipped: `no ${leg} time on this booking` }

  const isArrival = leg === 'arrival'
  const ref = bookingRef(b.id)
  const key = stampKey(leg)
  // A dawn pickup is mailed the evening before, so say which day it is rather
  // than asserting "today" and being wrong for exactly the guests who are up
  // earliest. Compared in Jamaica dates, the only calendar that matters here.
  const dayLabel: 'Today' | 'Tomorrow' =
    jaDateKey(legInstantMs(at)) === jaDateKey(Date.now()) ? 'Today' : 'Tomorrow'
  const claimedAt = new Date().toISOString()

  // Claim first, and only if nobody else holds it.
  const { data: claimed } = await svc
    .from('bookings')
    .update({ dispatch: { ...((b.dispatch as Record<string, string>) ?? {}), [key]: claimedAt } })
    .eq('id', b.id)
    .is(`dispatch->>${key}`, null)
    .select('id')
  if (!opts.force && (!claimed || claimed.length === 0)) {
    return { ...base, ok: false, skipped: 'already sent' }
  }

  const res = await sendEmail({
    to: b.email,
    // Operations and the driver hold exactly what the guest holds.
    bcc: opsBcc(b.email),
    subject: isArrival
      ? `${dayLabel}: your MAPL driver at Montego Bay (${ref})`
      : `${dayLabel}: your ride to the airport (${ref})`,
    react: TransferDayOf({
      bookingRef: ref,
      firstName: b.first_name,
      leg,
      whenLabel: `${jaDate(at)}, ${jaTime(at)}`,
      dayLabel,
      pickupLabel: isArrival ? AIRPORT : l.hotel,
      dropoffLabel: isArrival ? l.hotel : AIRPORT,
      flight: (isArrival ? l.arrivalFlight : l.departureFlight) ?? null,
      passengers: l.passengers,
      driverName: b.driver_name ?? null,
      driverPhone: b.driver_phone ?? null,
      driverVehicle: b.driver_vehicle ?? null,
      driverPlate: b.driver_plate ?? null,
      supportEmail: SUPPORT_EMAIL,
    }),
    tags: [{ name: 'type', value: 'transfer_dayof' }],
  })

  if (!res?.ok) {
    // Release the claim so the next run retries rather than silently dropping.
    const revert = { ...((b.dispatch as Record<string, string>) ?? {}) }
    delete revert[key]
    await svc.from('bookings').update({ dispatch: revert }).eq('id', b.id)
    return { ...base, ok: false, error: res?.error ?? 'send failed' }
  }

  return { ...base, ok: true, sentTo: b.email }
}
