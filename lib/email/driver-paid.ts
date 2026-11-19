import { firstLeg, moneyBlock, money, round2, bookingRef, jaDate, jaTime, type Bk } from '@/lib/dispatch'
import { sendEmail, opsBcc, driverNotifyEmail } from '@/lib/email/send'
import DriverPaid from '@/emails/DriverPaid'

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
  const thisAmount = half === 'second' ? secondAmount : firstAmount
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
