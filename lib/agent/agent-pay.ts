/**
 * book_and_pay_transfer: an AI assistant books an airport ride AND pays for
 * it in one call, with a Stripe Shared Payment Token (SPT) the traveller
 * approved in their Link wallet (https://docs.stripe.com/agentic-commerce/
 * sellers/use-cases/booking).
 *
 * The money path is the site's own, unchanged: the ride goes through the real
 * /api/transfers/checkout handler with the same body a browser sends, so the
 * server prices it from the rate card, enforces the 24-hour rule and the
 * flight numbers, inserts the pending booking (unique on the cart hash) and
 * mints the PaymentIntent (idempotency-keyed per booking row). The route
 * never confirms an intent; only step 9 below does, with the SPT, server side,
 * and the existing webhook then flips the booking to paid and sends the
 * confirmation emails.
 *
 * Guards, in the order they run:
 *   1. The ride is validated by the in-browser tool's own code (capture.ts).
 *   2. The price the traveller approved must equal the rate-card price to the
 *      cent; a changed price is returned for them to approve again.
 *   3. Payment attempts are limited per connection and per traveller, before
 *      anything costs a call.
 *   4. The SPT must EXIST (Stripe only returns tokens granted to this
 *      account), so a caller without a real approval learns nothing more.
 *   5. Bookings of this same ride (same cart hash: hotel, trip, direction,
 *      party, times, email, amount) that are paid, or whose intent has been
 *      paid, is processing or waits on the bank, are reported, never booked
 *      again. The checkout route only de-duplicates PENDING rows, so without
 *      this a retry after a lost response, or a second approval, would book
 *      and charge the same ride twice.
 *   6. The SPT must be active, in USD, allow at least the price and not
 *      expire within a minute. No row exists before this.
 *   7. The intent checkout returns must be for this booking, in USD, for
 *      exactly the approved price.
 *   8. If the request has already used most of the function's time, the
 *      confirm is not attempted: nothing is charged, and the same call can be
 *      made again (it reuses the row, the intent and the unspent token).
 * Nothing here retries a confirm. A confirm whose answer is unclear is
 * re-read from Stripe and reported as what actually happened.
 *
 * A pending row with the traveller's address can be left behind when a valid
 * token's payment is refused or needs the bank's approval; the abandoned-cart
 * email may then reach them, as it would after a browser checkout. Each such
 * row costs the caller one approval in a real Link wallet.
 *
 * Bookings made here carry dnt: '1', so the traveller, who never saw this
 * site's privacy notice, is not reported to Meta's Conversions API.
 */
import { MAX_TRANSFER_PASSENGERS } from '../airport-transfers'
import { CANCELLATION_SUMMARY } from '../refund-pricing'
import { bookingRef } from '../dispatch'
import { hashTransferCart, type TransferCartLine } from '../transfer-cart-hash'
import type { WebMcpTool } from '../webmcp-tools'
import type { Via } from './booking-link'
import { validateRide } from './capture'

export const PAY_TOOL_NAME = 'book_and_pay_transfer'

/**
 * Past this (from the request's arrival), the confirm is not started. Netlify
 * ends a function at 10 s; the confirm is given 3.5 s and the read-back 1.5 s,
 * each with no retry (pay-deps), so a confirm started in time is reported in time.
 */
export const CONFIRM_DEADLINE_MS = 4_000

export interface GrantedToken {
  id: string
  deactivated_at?: number | null
  usage_limits?: { currency?: string | null; max_amount?: number | null; expires_at?: number | null } | null
}

export interface IntentLike {
  id: string
  amount: number
  currency: string
  status: string
  metadata?: Record<string, string> | null
  next_action?: { type?: string | null; redirect_to_url?: { url?: string | null } | null } | null
  last_payment_error?: { message?: string | null } | null
}

export type ConfirmOutcome =
  | { intent: IntentLike }
  | { error: { kind: 'declined' | 'invalid' | 'unknown'; message: string } }

/** What already exists for one ride (cart hash), most decisive first. */
export type RideState =
  | { kind: 'none' }
  | { kind: 'paid'; bookingId: string }
  | { kind: 'processing'; bookingId: string }
  | { kind: 'needs_authentication'; bookingId: string; url: string | null }

/** Side effects, supplied by the route (or a test). */
export interface AgentPayDeps {
  /** True when this connection, or this traveller, has made too many payment attempts lately. */
  tooManyAttempts: (ip: string, email: string) => boolean
  /**
   * Bookings of this ride (cart hash) that are paid, or pending / failed with
   * an intent Stripe reports paid, processing or waiting on the bank.
   */
  findRideState: (cartHash: string) => Promise<RideState>
  /** GET /v1/shared_payment/granted_tokens/:id; null when Stripe says it does not exist. */
  retrieveGrantedToken: (spt: string) => Promise<GrantedToken | null>
  /** The real transfer checkout handler, called with a browser-shaped body. */
  createCheckout: (body: Record<string, unknown>, ip: string) => Promise<{ status: number; json: Record<string, unknown> }>
  /** `quick` bounds the read for the time-critical re-read after an unclear confirm. */
  retrievePaymentIntent: (id: string, quick?: boolean) => Promise<IntentLike>
  /** Confirm with payment_method_data[shared_payment_granted_token]; card errors come back as { error }. */
  confirmPaymentIntent: (id: string, spt: string, returnUrl: string, idempotencyKey: string) => Promise<ConfirmOutcome>
}

export interface PayContext {
  deps: AgentPayDeps
  origin: string
  via: Via
  ip: string
  now: () => Date
  /** Clock for the time budget; defaults to Date.now. */
  clock?: () => number
  /** When the HTTP request arrived (clock units); the budget runs from here. */
  startedAt?: number
}

const SPT_RE = /^spt_[A-Za-z0-9_]{6,190}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PAYABLE = new Set(['requires_payment_method', 'requires_confirmation'])

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '')
/** The server's own flight-number rule (app/api/transfers/checkout): 2 to 10 characters with a digit. */
const flightOk = (v: string | undefined) => !!v && v.length >= 2 && v.length <= 10 && /\d/.test(v)
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`
const LINK_FALLBACK = 'Use start_transfer_booking to send the traveller a booking link instead.'
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

/** The tool's listing: the ride fields are the in-browser booking tool's own schema. */
export function payToolDefinition(rideTool: WebMcpTool) {
  const ride = rideTool.inputSchema as { properties: Record<string, unknown> }
  return {
    name: PAY_TOOL_NAME,
    title: 'Book and pay for a ride',
    description:
      "Book an airport transfer and pay for it now with a Stripe shared payment token (spt_...) the traveller approved, for example from their Link wallet. CHARGES the traveller. Before calling: get the exact price with get_transfer_quote, tell the traveller the price and the cancellation terms (get_booking_terms), and get their explicit yes; pass that price as approved_total_usd. Needs every flight number and time the ride has, and the traveller's name, email and phone. An identical ride that is already paid is reported, never charged twice. Returns the booking reference; the confirmation email follows.",
    inputSchema: {
      type: 'object',
      properties: {
        ...ride.properties,
        guest: {
          type: 'object',
          description: 'The traveller the booking is for',
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            email: { type: 'string', description: 'Where the confirmation and driver details are sent' },
            phone: { type: 'string', description: 'Mobile number with country code, e.g. +1 305 555 0142' },
          },
          required: ['first_name', 'last_name', 'email', 'phone'],
        },
        special_requests: { type: 'string', description: 'Optional note for the driver, e.g. a car seat' },
        approved_total_usd: { type: 'number', description: 'The total in USD the traveller approved; must equal the price from get_transfer_quote' },
        shared_payment_token: { type: 'string', description: 'Stripe shared payment token (spt_...) granted to MAPL Tours Jamaica for at least this amount in USD' },
      },
      required: ['destination', 'trip_type', 'passengers', 'guest', 'approved_total_usd', 'shared_payment_token'],
    },
    // Not idempotent in the protocol's sense: it charges money. An identical
    // repeat is harmless (step 4), but clients must not treat it as a free retry.
    annotations: { title: 'Book and pay for a ride', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }
}

export async function bookAndPayTransfer(input: Record<string, unknown>, ctx: PayContext): Promise<Record<string, unknown>> {
  const { deps, origin, via, ip, now } = ctx
  const clock = ctx.clock ?? (() => Date.now())
  const startedAt = ctx.startedAt ?? clock()

  // 1. The traveller, then the ride by the in-browser tool's own rules.
  const g = (input.guest && typeof input.guest === 'object' ? input.guest : {}) as Record<string, unknown>
  const firstName = clean(g.first_name, 60)
  const lastName = clean(g.last_name, 60)
  const email = clean(g.email, 254).toLowerCase()
  const phone = clean(g.phone, 30)
  const specialRequests = clean(input.special_requests, 500)
  if (!firstName || !lastName) return { error: 'guest.first_name and guest.last_name are required.' }
  if (!EMAIL_RE.test(email)) return { error: 'guest.email must be a valid email address; the confirmation goes there.' }
  if ((phone.match(/\d/g) ?? []).length < 7) return { error: 'guest.phone must be a phone number with country code, e.g. +1 305 555 0142.' }

  const { result, captured } = await validateRide(input, origin, now)
  if (typeof result.error === 'string') return result
  const q = captured.quote
  if (!q) return { error: 'The ride could not be prepared. Check the hotel, trip type and passengers.' }
  if (q.passengers > MAX_TRANSFER_PASSENGERS) return { error: `Rides can be booked online for 1 to ${MAX_TRANSFER_PASSENGERS} passengers.` }
  const fromAirport = captured.fromAirport ?? true
  const p = captured.patch ?? {}
  const hasArrival = q.tripType === 'round_trip' || fromAirport
  const hasDeparture = q.tripType === 'round_trip' || !fromAirport
  // The checkout route requires a time and a flight number for every leg; say
  // so here, before a booking row exists, rather than relaying its refusal.
  if (hasArrival && (!p.arrivalAt || !flightOk(p.arrivalFlight))) {
    return { error: 'arrival_at and arrival_flight (e.g. AA1234) are required: the driver tracks that flight.' }
  }
  if (hasDeparture && (!p.departureAt || !flightOk(p.departureFlight))) {
    return { error: 'departure_at (or departure_flight_at) and departure_flight are required for the ride back to the airport.' }
  }

  // 2. The price the traveller approved.
  const cents = Math.round(q.priceUsd * 100)
  const approved = typeof input.approved_total_usd === 'number' ? input.approved_total_usd : Number(input.approved_total_usd)
  if (!Number.isFinite(approved) || Math.round(approved * 100) !== cents) {
    return {
      error: 'price_not_approved',
      message: `This ride costs ${usd(cents)}. Tell the traveller this price and the cancellation terms, and call again with approved_total_usd: ${(cents / 100).toFixed(2)} once they agree.`,
      priceUsd: cents / 100,
    }
  }
  const spt = clean(input.shared_payment_token, 200)
  if (!SPT_RE.test(spt)) return { error: 'shared_payment_token must be a Stripe shared payment token (spt_...).' }

  // 3. Rate limits, before anything costs a call.
  if (deps.tooManyAttempts(ip, email)) {
    return { error: `Too many payment attempts. Nothing was booked or charged. Wait a minute, or ${lowerFirst(LINK_FALLBACK)}` }
  }

  // 4. The token must exist before anything about bookings is said.
  let token: GrantedToken | null
  try {
    token = await deps.retrieveGrantedToken(spt)
  } catch {
    return { error: 'The payment token could not be checked just now. Nothing was booked or charged; try again in a moment.' }
  }
  if (!token) return { error: 'This payment token was not found, or was not granted to MAPL Tours Jamaica. Nothing was booked or charged.' }

  // 5. Already booked? Same identity the checkout route keys on.
  const item: Record<string, unknown> = { destinationId: q.destinationId, tripType: q.tripType, passengers: q.passengers, fromAirport }
  if (hasArrival) Object.assign(item, { arrivalAt: p.arrivalAt, arrivalFlight: p.arrivalFlight })
  if (hasDeparture) Object.assign(item, { departureAt: p.departureAt, departureFlight: p.departureFlight })
  const cartHash = hashTransferCart([item as unknown as TransferCartLine], cents, email)
  let state: RideState
  try {
    state = await deps.findRideState(cartHash)
  } catch {
    return { error: 'Bookings could not be checked just now. Nothing was booked or charged; try again in a moment.' }
  }
  if (state.kind === 'paid') {
    const r = bookingRef(state.bookingId)
    return {
      status: 'already_paid',
      bookingRef: r,
      message: `This exact ride is already booked and paid (${r}); nothing new was charged. It keeps the details it was booked with; for a change of flight, name or phone, write to contact@mapltours.com. The confirmation went to ${email}.`,
    }
  }
  if (state.kind === 'processing') {
    return { status: 'processing', bookingRef: bookingRef(state.bookingId), message: 'A payment for this ride is still being confirmed. Do not pay again; the confirmation email follows as soon as it clears.' }
  }
  if (state.kind === 'needs_authentication') {
    return {
      status: 'needs_authentication',
      bookingRef: bookingRef(state.bookingId),
      ...(state.url ? { authenticateUrl: state.url } : {}),
      message: "A payment for this ride is waiting for the traveller's bank to approve it. Do not pay again; once they approve, the confirmation email follows.",
    }
  }

  // 6. The token's limits.
  if (token.deactivated_at) return { error: 'This payment token is no longer active (used, expired or revoked). Nothing was booked or charged. Ask the traveller to approve a new one.' }
  const lim = token.usage_limits ?? {}
  if ((lim.currency ?? '').toLowerCase() !== 'usd') return { error: 'The payment token must be in USD. Nothing was booked or charged.' }
  if (typeof lim.max_amount !== 'number' || lim.max_amount < cents) {
    return { error: `The payment token allows less than the ${usd(cents)} price. Ask the traveller to approve at least ${usd(cents)}. Nothing was booked or charged.` }
  }
  if (typeof lim.expires_at === 'number' && lim.expires_at * 1000 < now().getTime() + 60_000) {
    return { error: 'The payment token expires within a minute. Ask the traveller to approve a new one. Nothing was booked or charged.' }
  }

  // 7. The booking, through the real checkout route with a browser-shaped body.
  //    The route never confirms an intent, so nothing is charged before step 10;
  //    only an answer about an EARLIER attempt (processing, unknown) can mean
  //    money is moving.
  const body = {
    amount: q.priceUsd,
    items: [item],
    customer: { email, firstName, lastName, phone, ...(specialRequests ? { specialRequests } : {}) },
    attribution: { source: via, medium: 'ai_agent', campaign: 'connector', content: PAY_TOOL_NAME, landing: '/mcp', ts: now().toISOString(), dnt: '1' },
  }
  let res: { status: number; json: Record<string, unknown> }
  try {
    res = await deps.createCheckout(body, ip)
  } catch {
    return { error: 'The booking could not be created just now. Nothing was charged; try again in a moment.' }
  }
  const bookingId = typeof res.json.bookingId === 'string' ? res.json.bookingId : ''
  const ref = bookingId ? bookingRef(bookingId) : undefined
  if (res.json.alreadyPaid === true) {
    return { status: 'already_paid', ...(ref ? { bookingRef: ref } : {}), message: 'This ride is already booked and paid; nothing new was charged. The confirmation email was sent when it was paid.' }
  }
  if (res.json.paymentProcessing === true) {
    return { status: 'processing', ...(ref ? { bookingRef: ref } : {}), message: 'An earlier payment for this ride is still being confirmed. Do not pay again; the confirmation email follows as soon as it clears.' }
  }
  if (res.status === 503 && bookingId) {
    return { error: 'payment_unknown', bookingRef: ref, message: `An earlier payment for this ride (${ref}) could not be checked just now. Do not pay again yet; try this call again in a minute, or write to contact@mapltours.com.` }
  }
  if (res.status !== 200 || typeof res.json.clientSecret !== 'string' || !bookingId) {
    const why = typeof res.json.error === 'string' ? res.json.error : 'The booking could not be created.'
    return { error: `${why} Nothing was charged.`, ...(ref ? { bookingRef: ref } : {}) }
  }
  const dueCents = Math.round(Number(res.json.amountDue) * 100)
  const piId = /^(pi_[A-Za-z0-9]+)_secret_/.exec(res.json.clientSecret)?.[1]
  if (!piId || dueCents !== cents) {
    console.error('[agent-pay]', { via, bookingRef: ref, why: 'amount or intent mismatch', dueCents, cents })
    return { error: `The amount due did not match the approved price, so nothing was charged. ${LINK_FALLBACK}` }
  }

  // 8. The intent must be this booking's, in USD, for exactly the approved price.
  let pi: IntentLike
  try {
    pi = await deps.retrievePaymentIntent(piId)
  } catch {
    return { error: 'The payment could not be prepared just now. Nothing was charged; try again in a moment.', bookingRef: ref }
  }
  if (pi.amount !== cents || pi.currency !== 'usd' || pi.metadata?.booking_id !== bookingId) {
    console.error('[agent-pay]', { via, bookingRef: ref, why: 'intent does not match booking', pi: pi.id })
    return { error: `The payment did not match the booking, so nothing was charged. ${LINK_FALLBACK}`, bookingRef: ref }
  }
  const confirmationUrl = `${origin}/transfers/confirm?payment_intent=${encodeURIComponent(pi.id)}&redirect_status=succeeded`
  const paid = (intent: IntentLike) => ({
    status: 'paid',
    bookingRef: ref,
    amountPaidUsd: intent.amount / 100,
    confirmationUrl,
    ride: result.ride,
    nextStep: `Tell the traveller the ride is booked (${ref}). The confirmation goes to ${email} within a few minutes, and the driver's name, vehicle and WhatsApp number follow before pickup.`,
    cancellation: CANCELLATION_SUMMARY.short,
  })
  const processing = () => ({ status: 'processing', bookingRef: ref, message: 'The payment is processing. Do not pay again; the confirmation email is sent as soon as it settles.' })
  if (pi.status === 'succeeded') return paid(pi)
  if (pi.status === 'processing') return processing()
  if (!PAYABLE.has(pi.status)) {
    return { error: `This booking's payment is waiting on another step (${pi.status}). Nothing new was charged. ${LINK_FALLBACK}`, bookingRef: ref }
  }

  // 9. Time budget, from the request's arrival: never start a confirm the function may not live to report.
  if (clock() - startedAt > CONFIRM_DEADLINE_MS) {
    return {
      status: 'not_completed',
      bookingRef: ref,
      message: 'This took too long, so the payment was not attempted and nothing was charged. Call book_and_pay_transfer again with the same details and token to finish.',
    }
  }

  // 10. Pay. One attempt per intent and token; never retried here.
  const outcome = await deps.confirmPaymentIntent(pi.id, spt, `${origin}/transfers/confirm`, `agentpay:${pi.id}:${spt}`)
  if ('error' in outcome) {
    console.warn('[agent-pay]', { via, bookingRef: ref, outcome: outcome.error.kind })
    if (outcome.error.kind === 'declined') {
      return { error: 'payment_declined', message: `The card was declined: ${outcome.error.message} Nothing was charged. Ask the traveller for another payment method, or ${lowerFirst(LINK_FALLBACK)}`, bookingRef: ref }
    }
    // An unclear answer: ask Stripe what actually happened to this intent
    // (another call may have paid it a moment ago) and report that.
    let reread: IntentLike | null = null
    try {
      reread = await deps.retrievePaymentIntent(pi.id, true)
    } catch {
      reread = null
    }
    if (reread?.status === 'succeeded') return paid(reread)
    if (reread?.status === 'processing') return processing()
    if (outcome.error.kind === 'invalid' && reread && PAYABLE.has(reread.status)) {
      return { error: 'payment_refused', message: `Stripe refused the payment token: ${outcome.error.message} Nothing was charged.`, bookingRef: ref }
    }
    return {
      error: 'payment_unknown',
      bookingRef: ref,
      message: `The payment result is not known yet (${ref}). Do not pay again. If it goes through, the confirmation email follows; if not, nothing is charged. The traveller can write to contact@mapltours.com.`,
    }
  }
  const after = outcome.intent
  console.info('[agent-pay]', { via, bookingRef: ref, status: after.status })
  if (after.status === 'succeeded') return paid(after)
  if (after.status === 'processing') return processing()
  if (after.status === 'requires_action') {
    const url = after.next_action?.redirect_to_url?.url ?? null
    return {
      status: 'needs_authentication',
      bookingRef: ref,
      ...(url ? { authenticateUrl: url } : {}),
      message: url
        ? "The traveller's bank wants them to approve this payment. Send them authenticateUrl; the booking is confirmed by email once they approve."
        : "The traveller's bank wants them to approve this payment in their banking or Link app; the booking is confirmed by email once they approve.",
    }
  }
  const reason = after.last_payment_error?.message ?? 'The payment did not go through.'
  return { error: 'payment_declined', message: `${reason} Nothing was charged. Ask the traveller for another payment method, or ${lowerFirst(LINK_FALLBACK)}`, bookingRef: ref }
}
