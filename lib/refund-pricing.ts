/**
 * Refund maths, the single source of truth for the published cancellation
 * policy. Mirrors lib/checkout-pricing.ts: a pure function, no I/O, so the
 * boundary cases are unit-testable and the profile UI can quote a customer
 * the exact figure BEFORE they confirm, using the same code the server uses
 * to authorise the refund.
 *
 * Published policy (app/terms, checkout ToS modal, both FAQs):
 *
 *   • Cancel within 48 hours of booking → refund of the amount paid, less an
 *     administration charge equivalent to 20% of the total amount of your
 *     fees plus taxes (if applicable).
 *   • After 48 hours → non-refundable.
 *   • No-show → charged in full.
 *
 * The charge base is the FULL amount paid (subtotal + service fee +
 * transport − reward), not the service fee alone. Taxes are included in the
 * base by construction: nothing in the money model collects tax today, so
 * total_paid is tax-free; if a tax line is added later it lands in
 * total_paid and is charged on automatically.
 */

/** Administration charge retained from an in-window cancellation. */
export const ADMIN_CHARGE_RATE = 0.20

/** Hours from booking during which a cancellation is refundable. */
export const CANCELLATION_WINDOW_HOURS = 48

/**
 * The cancellation promise, in the guest's words, derived from the numbers
 * above so the microcopy and the rule can never disagree.
 *
 * Four surfaces state this: the line under each of the two pay buttons, the
 * line under the Stripe panel, and the summary pinned at the top of the policy
 * dialog those lines open. They were four hand-typed sentences, which is three
 * chances for one of them to keep saying 48 hours after the rule moves.
 */
export const CANCELLATION_SUMMARY = {
  /** One clause, for a trust line beside other microcopy. */
  short: `Cancel within ${CANCELLATION_WINDOW_HOURS} hrs of booking, less a ${Math.round(ADMIN_CHARGE_RATE * 100)}% admin charge`,
  /** The headline answer, for the top of the policy dialog. */
  lead: `Free to cancel within ${CANCELLATION_WINDOW_HOURS} hours of booking.`,
  /** What it costs and when it stops, immediately under the headline. */
  detail:
    `You get the amount paid back, less a ${Math.round(ADMIN_CHARGE_RATE * 100)}% administration charge plus taxes where they apply. ` +
    `After that window, and once a tour or pickup has begun, the booking is non-refundable.`,
} as const

const MS_PER_HOUR = 3_600_000

/** The booking fields the quote depends on. Deliberately minimal. */
export interface RefundableBooking {
  status: string
  /** When payment succeeded. The window runs from here, NOT created_at. */
  paid_at: string | null
  /** Fallback only, for rows predating the paid_at column. */
  created_at: string
  total_paid: number | string
  /**
   * How much of total_paid came off a gift card rather than a payment card.
   * Null/absent means none.
   *
   * This matters because total_paid is the whole cart, while Stripe only ever
   * captured total_paid - gift_card_amount. Quoting a refund off total_paid
   * asks Stripe to refund more than it took, which it rejects outright once
   * the gift covered more than the admin charge.
   */
  gift_card_amount?: number | string | null
  /**
   * When the earliest part of the booking starts (ISO), from
   * earliestServiceStart(). Once that moment passes the booking has been
   * delivered and is no longer refundable, even inside the 48 hours.
   *
   * Undefined/null means "unknown", which does NOT block a refund: a booking
   * with no usable date is a data anomaly, and refusing on it would deny
   * legitimate refunds automatically. The approval step catches those.
   */
  serviceStartsAt?: string | null
}

export type RefundBlockedReason =
  /** Not a completed payment (pending, failed, canceled). */
  | 'not_paid'
  /** Already refunded; refunding again would double-pay. */
  | 'already_refunded'
  /** Past the 48-hour window. */
  | 'window_closed'
  /** The experience or pickup has already started; it has been delivered. */
  | 'service_started'
  /** Row is missing paid_at and created_at, so the window is unknowable. */
  | 'unknown_booking_time'

export type RefundQuote =
  | {
      refundable: true
      /** Cents, so the caller hands Stripe an integer with no float drift. */
      grossCents: number
      adminChargeCents: number
      /** Total value returned to the traveler: cash + gift credit. */
      refundCents: number
      /** Of refundCents, how much goes back to the payment card via Stripe. */
      cashRefundCents: number
      /** Of refundCents, how much goes back onto the gift card's balance. */
      giftRefundCents: number
      /** What Stripe actually captured for this booking. */
      cashCapturedCents: number
      hoursSinceBooking: number
      /** When the window shuts, for "cancel free until…" copy. */
      deadline: Date
    }
  | {
      refundable: false
      reason: RefundBlockedReason
      hoursSinceBooking: number | null
      deadline: Date | null
    }

/**
 * Quote a cancellation.
 *
 * `now` is injected rather than read from the clock so tests can pin the
 * 47.9h / 48.1h boundary exactly, and so a quote shown to the customer and
 * the refund authorised a moment later agree on the instant being judged.
 */
export function quoteRefund(booking: RefundableBooking, now: Date = new Date()): RefundQuote {
  const bookedAtRaw = booking.paid_at ?? booking.created_at
  const bookedAt = bookedAtRaw ? new Date(bookedAtRaw) : null

  if (!bookedAt || Number.isNaN(bookedAt.getTime())) {
    return { refundable: false, reason: 'unknown_booking_time', hoursSinceBooking: null, deadline: null }
  }

  const deadline = new Date(bookedAt.getTime() + CANCELLATION_WINDOW_HOURS * MS_PER_HOUR)
  const hoursSinceBooking = (now.getTime() - bookedAt.getTime()) / MS_PER_HOUR

  if (booking.status === 'refunded') {
    return { refundable: false, reason: 'already_refunded', hoursSinceBooking, deadline }
  }
  if (booking.status !== 'paid') {
    return { refundable: false, reason: 'not_paid', hoursSinceBooking, deadline }
  }
  // Inclusive at exactly 48h: a customer on the boundary keeps the refund.
  if (now.getTime() > deadline.getTime()) {
    return { refundable: false, reason: 'window_closed', hoursSinceBooking, deadline }
  }

  // Delivered services are not refundable, whatever the clock says. Without
  // this, the 24-hour booking cutoff and the 48-hour refund window overlap:
  // book Monday for Tuesday, take the tour, then cancel Tuesday night still
  // inside the 48 hours and collect 80% back on a trip already taken.
  if (booking.serviceStartsAt) {
    const startMs = Date.parse(booking.serviceStartsAt)
    if (!Number.isNaN(startMs) && now.getTime() >= startMs) {
      return { refundable: false, reason: 'service_started', hoursSinceBooking, deadline }
    }
  }

  // Round to cents ONCE, off the paid total, then derive the refund by
  // subtraction. Rounding both parts independently can make them sum to a
  // cent more or less than what was actually captured.
  const grossCents = Math.round(Number(booking.total_paid) * 100)
  if (!Number.isFinite(grossCents) || grossCents <= 0) {
    return { refundable: false, reason: 'not_paid', hoursSinceBooking, deadline }
  }
  const adminChargeCents = Math.round(grossCents * ADMIN_CHARGE_RATE)
  const refundCents = grossCents - adminChargeCents

  // Split the refund by where the money actually came from. The card is made
  // whole FIRST, up to the refund, and only what is left rides back onto the
  // gift card as credit — so the admin charge comes out of gift credit before
  // it touches the traveler's cash. Real money back beats store credit back,
  // and Stripe can never be asked for more than it captured.
  const giftCents = Math.round(Number(booking.gift_card_amount ?? 0) * 100)
  const cashCapturedCents = Math.max(0, grossCents - (Number.isFinite(giftCents) ? giftCents : 0))
  const cashRefundCents = Math.min(refundCents, cashCapturedCents)
  const giftRefundCents = refundCents - cashRefundCents

  return {
    refundable: true,
    grossCents,
    adminChargeCents,
    refundCents,
    cashRefundCents,
    giftRefundCents,
    cashCapturedCents,
    hoursSinceBooking,
    deadline,
  }
}

/** Cents → "$123.45", for UI and email copy. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/** Customer-facing explanation of why a cancellation was refused. */
export function refundBlockedMessage(reason: RefundBlockedReason): string {
  switch (reason) {
    case 'window_closed':
      return 'The 48-hour cancellation window for this booking has closed, so it is no longer refundable.'
    case 'service_started':
      return 'This booking has already started, so it is no longer refundable.'
    case 'already_refunded':
      return 'This booking has already been refunded.'
    case 'not_paid':
      return 'This booking is not a completed payment, so there is nothing to refund.'
    case 'unknown_booking_time':
      return 'We could not determine when this booking was made. Please contact support.'
  }
}
