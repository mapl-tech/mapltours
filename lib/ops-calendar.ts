import 'server-only'
import { syncBookingToCalendar, type CalendarBooking, type CalendarBookingItem } from '@/lib/google-calendar'

/** How long a request the guest is waiting on gives Google before moving on. */
export const OPS_CALENDAR_BUDGET_MS = 3_000

/**
 * Put a booking the checkout route settled itself on the shared ops calendar.
 *
 * The Stripe webhook syncs every booking it flips to paid. A booking paid in
 * full by gift card, or with a remainder under Stripe's 50-cent minimum
 * absorbed, is settled inside the checkout route instead: there is no
 * PaymentIntent, so no webhook ever fires for it, and without this it never
 * reached the calendar ops schedule from (and the privacy page's "When a
 * booking is paid, we add it there" was untrue for it). Same reason the
 * route already mirrors the webhook's default-driver assignment.
 *
 * Capped at OPS_CALENDAR_BUDGET_MS with the same Promise.race time box the
 * admin refund route uses for removals, because the guest is waiting on this
 * response. Never throws and never gates: the booking is already paid and
 * emailed by the time this runs. Event ids derive from the booking id, so a
 * later sync of the same booking is a harmless 409.
 */
export async function addSettledBookingToOpsCalendar(
  booking: CalendarBooking,
  items: CalendarBookingItem[],
  tag: string,
): Promise<{ ok: boolean; reason?: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const res = await Promise.race([
      syncBookingToCalendar(booking, items),
      new Promise<{ ok: false; reason: string }>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, reason: `no answer within ${OPS_CALENDAR_BUDGET_MS} ms` }), OPS_CALENDAR_BUDGET_MS)
      }),
    ])
    if (!res.ok && res.reason !== 'not configured') {
      console.error(tag, 'ops calendar event NOT added, add it by hand', { booking: booking.id, reason: res.reason })
    }
    return res
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(tag, 'ops calendar event NOT added, add it by hand', { booking: booking.id, reason })
    return { ok: false, reason }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
