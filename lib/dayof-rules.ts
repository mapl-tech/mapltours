/**
 * When the day-of email for a ride is due, as pure functions (no email or
 * database imports), so the driver portal's change rules (lib/dispatch-change)
 * can say when a guest will hear about a change using the very rule the
 * hourly job sends by. lib/dayof.ts re-exports all of it; nothing here may
 * differ from what that job does.
 */

export type DayOfLeg = 'arrival' | 'departure'

/** Jamaica is UTC-5 all year. It has never observed daylight saving. */
const JA_OFFSET_MIN = -300

/** Hour of the day in Jamaica, 0-23, for a real instant. */
export function jaHour(nowMs: number): number {
  return new Date(nowMs + JA_OFFSET_MIN * 60_000).getUTCHours()
}

/** The Jamaica calendar date (YYYY-MM-DD) of a real instant. */
export function jaDateKey(nowMs: number): string {
  return new Date(nowMs + JA_OFFSET_MIN * 60_000).toISOString().slice(0, 10)
}

/**
 * The real instant of a stored leg time. Leg times are the guest's Jamaica
 * wall clock carrying a Z, so the true UTC instant is 5 hours later. The same
 * rule as lib/dispatch legInstantMs, which re-exports this module's callers.
 */
function instantOf(legIso: string): number {
  return Date.parse(legIso) + 5 * 3_600_000
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
  const at = instantOf(legIso)
  const hoursAway = (at - nowMs) / 3_600_000
  if (hoursAway <= 0) return false
  if (hoursAway <= 13) return true
  return jaDateKey(at) === jaDateKey(nowMs) && jaHour(nowMs) >= 5
}

export const stampKey = (leg: DayOfLeg) => (leg === 'arrival' ? 'dayof_arrival_sent' : 'dayof_departure_sent')

/**
 * Where a withheld send is recorded: a claim that was won, then not sent
 * because the booking had stopped being paid. Deliberately NOT the sent key;
 * see lib/dayof.ts.
 */
export const withheldKey = (leg: DayOfLeg) => (leg === 'arrival' ? 'dayof_arrival_withheld' : 'dayof_departure_withheld')
