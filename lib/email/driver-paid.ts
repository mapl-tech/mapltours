import { firstLeg, moneyBlock, money, round2, bookingRef, jaDate, jaTime, type Bk } from '@/lib/dispatch'
import { sendEmail, opsBcc, driverNotifyEmail } from '@/lib/email/send'
import { prepaidFor } from '@/lib/payouts/plan'
import DriverPaid from '@/emails/DriverPaid'
import TourPaid from '@/emails/TourPaid'

/**
 * Email the driver that a payment was sent, with an atomic once-only claim.
 *
 * Two callers, one email: the dispatch console when an operator ticks a pay
 * step (app/api/admin/dispatch), and the Wise payout job once a payment has
 * left the balance (app/api/payouts, lib/payouts/run.ts recordFunded). Both
 * take the same claim, so a ride half is announced once whichever paid it.
 *
 * The claim key (`paid_first_notified` / `paid_second_notified`) lives in the
 * same dispatch map as everything else, and the conditional update means two
 * operators double-clicking in two tabs produce exactly one email. Unchecking
 * and re-checking the step does NOT resend: the claim survives, because a
 * second "payment sent" email for the same half would be a false record.
 * Amounts come from moneyBlock, the same figures the console shows.
 *
 * `opts` is the job's: a time limit, so a slow mail service cannot hold the
 * payout run past its function's limit, and a Resend idempotency key. The
 * console passes none and behaves exactly as before.
 */
export async function notifyDriverPaid(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  b: Bk,
  step: string,
  half: 'first' | 'second',
  opts?: { timeoutMs?: number; idempotencyKey?: string },
): Promise<boolean> {
  const to = driverNotifyEmail()
  if (!to) {
    console.warn('[dispatch] pay step checked but no driver email configured (DRIVER_NOTIFY_EMAIL)')
    return false
  }
  const l = firstLeg(b)
  if (!l) return false

  const m = moneyBlock(b, null)
  // A zero or negative amount is a data problem, never an email. Checked
  // BEFORE the claim, so a fixed subtotal can still notify later.
  const firstAmount = m.driverPerLeg
  const secondAmount = round2(m.driverTotal - m.driverPerLeg)
  // Money already sent for this half outside the job (lib/payouts/plan.ts
  // prepaidFor): this payment is the rest, exactly as the payout job paid it.
  const pre = prepaidFor((b as { dispatch?: Record<string, unknown> | null }).dispatch, half)
  if (pre.invalid) {
    console.warn('[dispatch] pay-step email skipped, unreadable prepaid amount', { booking: b.id, half })
    return false
  }
  const thisAmount = round2((half === 'second' ? secondAmount : firstAmount) - pre.usd)
  if (!(thisAmount > 0)) {
    console.warn('[dispatch] pay-step email skipped, non-positive amount', { booking: b.id, half, thisAmount })
    return false
  }

  // Atomic once-only claim. Deliberately NOT released on a failed send: a
  // send can fail on our side after Resend accepted it, and a resend of a
  // money notice is worse than a missing one the console reports.
  const claimKey = `${step}_notified`
  const { data: claimed } = await svc.rpc('merge_dispatch', {
    p_booking_id: b.id,
    p_patch: { [claimKey]: new Date().toISOString() },
    p_only_if_absent: claimKey,
  })
  if (!claimed || claimed.length === 0) return false

  const effectiveHalf: 'first' | 'second' | 'full' = m.isRoundTrip ? half : 'full'
  // First half pays the leg that happens first; for a departure-only one-way
  // that IS the ride to the airport.
  const isArrivalLeg = half === 'first' ? !!l.arrivalAt : false
  const at = isArrivalLeg ? l.arrivalAt : l.departureAt
  const guestName = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim() || 'Guest'

  const res = await sendEmail({
    to,
    bcc: opsBcc(to),
    subject: `${money(thisAmount)} sent · ${effectiveHalf === 'full' ? 'payment in full' : `${effectiveHalf} half`} · ${bookingRef(b.id)}`,
    react: DriverPaid({
      driverName: b.driver_name?.trim() || 'driver',
      bookingRef: bookingRef(b.id),
      guestName,
      half: effectiveHalf,
      amount: money(thisAmount),
      ...(pre.usd > 0 ? { sentEarlier: `${money(pre.usd)} USD${pre.note ? `, ${pre.note}` : ''}` } : {}),
      totalForTrip: money(m.driverTotal),
      tripLabel: isArrivalLeg ? `MBJ Airport → ${l.hotel}` : `${l.hotel} → MBJ Airport`,
      whenLabel: at ? `${jaDate(at)}, ${jaTime(at)}` : 'time to be confirmed',
      passengers: l.passengers,
    }),
    tags: [{ name: 'type', value: 'driver_paid' }],
    ...(opts?.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    ...(opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
  })
  if (!res?.ok) {
    console.error('[dispatch] driver payment email failed, claim held to prevent doubles', res?.error)
    return false
  }
  return true
}

/** A tour day, "Wednesday, November 25", from the item's YYYY-MM-DD (a Jamaica calendar day; read at noon UTC so no zone moves it). */
export function tourDayLabel(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd ?? '')) return 'day to be confirmed'
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${ymd}T12:00:00Z`))
}

/**
 * Email the tour operator that a tour booking was paid: the payout job's
 * counterpart of notifyDriverPaid, sent once a tour payout has funded and the
 * booking is stamped `paid_tour`. Same inbox as the ride notice (the operator
 * alert reaches Collin there), ops on BCC, the same kind of once-only claim
 * (`paid_tour_notified`), never released after a send attempt.
 *
 * The amount is the booking's subtotal, which is what the payout job paid
 * for a tour (lib/payouts/plan.ts tourPartOf).
 */
export async function notifyTourPaid(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  b: Bk,
  payeeName: string,
  opts?: { timeoutMs?: number; idempotencyKey?: string },
): Promise<boolean> {
  const to = driverNotifyEmail()
  if (!to) {
    console.warn('[payouts] tour paid but no operator email configured (DRIVER_NOTIFY_EMAIL)')
    return false
  }
  const amount = round2(Number(b.subtotal ?? 0))
  if (!(amount > 0)) {
    console.warn('[payouts] tour payment email skipped, non-positive amount', { booking: b.id, amount })
    return false
  }
  const items = ((b.booking_items ?? []) as { item_type?: string; title?: string; date?: string; travelers?: number }[])
    .filter((i) => i.item_type !== 'transfer')
    .sort((x, y) => String(x.date ?? '').localeCompare(String(y.date ?? '')))
  if (items.length === 0) return false

  const { data: claimed } = await svc.rpc('merge_dispatch', {
    p_booking_id: b.id,
    p_patch: { paid_tour_notified: new Date().toISOString() },
    p_only_if_absent: 'paid_tour_notified',
  })
  if (!claimed || claimed.length === 0) return false

  const res = await sendEmail({
    to,
    bcc: opsBcc(to),
    subject: `${money(amount)} sent · tour · ${bookingRef(b.id)}`,
    react: TourPaid({
      payeeName: payeeName.trim() || 'there',
      bookingRef: bookingRef(b.id),
      guestName: `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim() || 'Guest',
      amount: money(amount),
      tours: items.map((i) => ({ title: i.title || 'Tour', dayLabel: tourDayLabel(String(i.date ?? '')), guests: Number(i.travelers ?? 1) })),
      pickup: typeof b.pickup === 'string' && b.pickup.trim() ? b.pickup.trim() : null,
    }),
    tags: [{ name: 'type', value: 'tour_paid' }],
    ...(opts?.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    ...(opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
  })
  if (!res?.ok) {
    console.error('[payouts] tour payment email failed, claim held to prevent doubles', res?.error)
    return false
  }
  return true
}
