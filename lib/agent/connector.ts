/**
 * The MAPL Tours Jamaica connector: the tools a remote AI assistant (Meta's
 * Muse, ChatGPT, Claude, Gemini, Perplexity, Copilot...) gets from /mcp.
 *
 * One source of truth with the in-browser WebMCP tools (lib/webmcp-tools):
 *   - The five read tools ARE the WebMCP tools: same code, same prices
 *     (buildQuote / tourPrice, which checkout also uses), same answers.
 *   - The two booking tools run the WebMCP booking tools' own validation
 *     unchanged, capturing the validated ride or tour (capture.ts) and
 *     returning a mapltours.com/book link built from it (booking-link.ts). A
 *     remote booking can never accept a ride the in-browser path refuses.
 *   - book_and_pay_transfer (agent-pay.ts) is listed only when agent payments
 *     are switched on AND the assistant's directory allows payment tools:
 *     Claude's directory bans tools that move money, and ChatGPT's requires
 *     checkout on the merchant's own site.
 *
 * Nothing here writes to the database, sends email or touches Stripe except
 * book_and_pay_transfer, which goes through the real checkout route.
 */
import { MAX_TRANSFER_PASSENGERS } from '../airport-transfers'
import { MIN_LEAD_TIME_HOURS } from '../booking-window'
import { CANCELLATION_SUMMARY } from '../refund-pricing'
import { PICKUP_RULE, resolveDestination } from '../webmcp-tools'
import { bookingLink, MAX_TOUR_GUESTS, type Handoff, type Via } from './booking-link'
import { bookAndPayTransfer, PAY_TOOL_NAME, payToolDefinition, type AgentPayDeps } from './agent-pay'
import { capturingTools, rideHandoff, toolNamed, validateRide } from './capture'

export interface ConnectorAnnotations {
  title: string
  readOnlyHint: boolean
  destructiveHint: boolean
  idempotentHint: boolean
  openWorldHint: boolean
}

export interface ConnectorTool {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: ConnectorAnnotations
  execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
}

export interface ConnectorContext {
  /** Absolute origin for links, e.g. https://mapltours.com */
  origin: string
  /** Which assistant this endpoint was added to (/mcp?via=...). */
  via: Via
  now?: () => Date
  /** Present only when agent payments are switched on (AGENT_PAYMENTS_ENABLED=1). */
  pay?: AgentPayDeps | null
  /** The caller's IP, passed to the checkout route's own rate limit. */
  ip?: string
  /** When the HTTP request arrived (ms), for the payment tool's time budget. */
  startedAt?: number
}

/** Bumped when the tool list or a tool's contract changes; reported in serverInfo. */
export const CONNECTOR_VERSION = '1.0.0'

/** Directories whose rules forbid payment tools. */
export const NO_PAY_VIAS: ReadonlySet<Via> = new Set<Via>(['claude', 'chatgpt'])

const READ_TOOLS: ReadonlyArray<[string, string]> = [
  ['find_transfer_destination', 'Find a hotel or villa'],
  ['get_transfer_quote', 'Price an airport ride'],
  ['check_transfer_timing', 'Check pickup timing'],
  ['list_tours', 'List tours'],
  ['get_tour', 'Tour details and price'],
]

const readOnly = (title: string): ConnectorAnnotations => ({ title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false })

export function buildConnectorTools(ctx: ConnectorContext): ConnectorTool[] {
  const now = ctx.now ?? (() => new Date())
  const origin = ctx.origin.replace(/\/$/, '')
  const base = capturingTools(origin, now).tools
  const payOn = !!ctx.pay && !NO_PAY_VIAS.has(ctx.via)

  const read = Object.fromEntries(
    READ_TOOLS.map(([name, title]) => {
      const t = toolNamed(base, name)
      const tool: ConnectorTool = { name, title, description: t.description, inputSchema: t.inputSchema, annotations: readOnly(title), execute: t.execute }
      return [name, tool]
    }),
  ) as Record<string, ConnectorTool>

  // Every quote carries a link that books exactly that ride: the traveller
  // taps once and lands on checkout with the hotel, trip and party set (and
  // adds flights there). start_transfer_booking still makes the fuller link.
  const quoteTool = read.get_transfer_quote
  read.get_transfer_quote = {
    ...quoteTool,
    execute: async (input) => {
      const r = await quoteTool.execute(input)
      if (typeof r.error === 'string' || typeof r.priceUsd !== 'number') return r
      const d = resolveDestination(input.destination)
      if (!('dest' in d)) return r
      const tripType = r.tripType === 'one_way' ? 'one_way' : 'round_trip'
      const h: Handoff = { kind: 'ride', destinationId: d.dest.id, tripType, passengers: Number(r.passengers), fromAirport: r.direction !== 'hotel_to_airport' }
      return { ...r, bookingUrl: bookingLink(origin, h, ctx.via, 'get_transfer_quote') }
    },
  }

  const browserRide = toolNamed(base, 'start_transfer_booking')
  const start_transfer_booking: ConnectorTool = {
    name: 'start_transfer_booking',
    title: 'Get a booking link for a ride',
    description:
      'Make a mapltours.com booking link for an airport transfer. The traveller opens it and lands on checkout with the hotel, trip type, passengers, flights and times filled in; they add name, email and phone and pay there (card, Apple Pay, Google Pay or Link). Books and charges nothing by itself. A one-way needs direction: airport_to_hotel takes arrival_at and arrival_flight; hotel_to_airport takes departure_at (or departure_flight_at) and departure_flight. Confirm the details and the price from get_transfer_quote with the traveller first.',
    inputSchema: browserRide.inputSchema,
    annotations: readOnly('Get a booking link for a ride'),
    execute: async (input) => {
      const { result, captured } = await validateRide(input, origin, now)
      if (typeof result.error === 'string') return result
      const h = rideHandoff(captured)
      if (!h) return { error: 'The ride could not be prepared. Check the hotel, trip type and passengers.' }
      return {
        status: 'booking_link_ready',
        bookingUrl: bookingLink(origin, h, ctx.via, 'start_transfer_booking'),
        ride: result.ride,
        prefilled: result.prefilled,
        ...(result.departurePickupSet ? { departurePickupSet: result.departurePickupSet } : {}),
        ...(result.warning ? { warning: result.warning } : {}),
        nextStep: payOn
          ? `Give the traveller bookingUrl. On that page they add contact details and pay; nothing is charged until they do. If they would rather you pay for them with a Stripe shared payment token, use ${PAY_TOOL_NAME} instead.`
          : 'Give the traveller bookingUrl. On that page they add contact details and pay; nothing is charged until they do.',
      }
    },
  }

  const browserTour = toolNamed(base, 'start_tour_booking')
  const tourSchema = browserTour.inputSchema as Record<string, unknown>
  const start_tour_booking: ConnectorTool = {
    name: 'start_tour_booking',
    title: 'Get a booking link for a tour',
    description: `Make a mapltours.com booking link for a tour or day package on a date for a party size. The traveller opens it and lands on checkout with the tour, date and guests filled in; they add contact details, accept the activity waiver and pay there. Books and charges nothing by itself. Needs ${MIN_LEAD_TIME_HOURS} hours' notice; get_tour gives the earliest date and the exact price. Confirm tour, date, guests and price with the traveller first.`,
    // The date is required here: without one, checkout would open on a
    // default day the traveller never chose.
    inputSchema: { ...tourSchema, required: ['tour', 'guests', 'date'] },
    annotations: readOnly('Get a booking link for a tour'),
    execute: async (input) => {
      if (typeof input.date !== 'string' || !input.date.trim()) {
        return { error: 'date is required, "YYYY-MM-DD" (Jamaica). get_tour gives the earliest bookable date.' }
      }
      const { tools, captured } = capturingTools(origin, now)
      const result = await toolNamed(tools, 'start_tour_booking').execute(input)
      if (typeof result.error === 'string') return result
      const t = captured.tour
      if (!t || !t.slug || !t.date) return { error: 'The tour could not be prepared. Check the tour, date and guests.' }
      const h: Handoff = { kind: 'tour', slug: t.slug, guests: t.guests, date: t.date, ...(t.pickupHotel ? { pickupHotel: t.pickupHotel } : {}) }
      return {
        status: 'booking_link_ready',
        bookingUrl: bookingLink(origin, h, ctx.via, 'start_tour_booking'),
        tour: result.tour,
        priceForParty: result.priceForParty,
        date: t.date,
        nextStep: 'Give the traveller bookingUrl. On that page they confirm the pickup, add contact details, accept the activity waiver and pay; nothing is charged until they do.',
      }
    },
  }

  const get_booking_terms: ConnectorTool = {
    name: 'get_booking_terms',
    title: 'Booking terms',
    description:
      'What a MAPL Tours Jamaica booking includes and the rules that apply: all-in pricing, notice needed, flight tracking, cancellation and refunds, payment methods and contact. Tell the traveller the cancellation terms before they book. Read-only.',
    inputSchema: { type: 'object', properties: {} },
    annotations: readOnly('Booking terms'),
    execute: async () => ({
      rides: {
        pricing: `One all-in price per vehicle for 1 to 4 passengers; 5 to ${MAX_TRANSFER_PASSENGERS} are priced per person; larger groups are quoted by email at contact@mapltours.com. Nothing is added at checkout.`,
        includes: [
          'private driver',
          'meet and greet at Sangster (MBJ) arrivals with a name sign',
          'flight tracking, so a late landing moves the pickup at no extra charge',
          "the driver's name, vehicle, plate and WhatsApp number, emailed before pickup",
        ],
        notice: `${MIN_LEAD_TIME_HOURS} hours' notice for every pickup, in Jamaica time`,
        flightHome: PICKUP_RULE,
      },
      tours: {
        pricing: 'Each tour has a set price for the party size; get_tour gives the exact total.',
        includes: 'Hotel pickup, plus what get_tour lists as included.',
        notice: `${MIN_LEAD_TIME_HOURS} hours' notice, counted from midnight Jamaica time`,
        waiver: 'Every tour needs the activity waiver, which the traveller accepts on the checkout page.',
      },
      // .short, as every site surface: .lead alone says "free" and leaves out the admin charge.
      cancellation: { summary: CANCELLATION_SUMMARY.short, detail: CANCELLATION_SUMMARY.detail },
      payment: 'Paid in US dollars when booking, by card, or by Apple Pay, Google Pay or Link where the device offers them. Stripe processes the payment.',
      currency: 'USD',
      contact: 'contact@mapltours.com',
      terms: `${origin}/terms`,
      privacy: `${origin}/privacy`,
    }),
  }

  const tools: ConnectorTool[] = [
    read.find_transfer_destination,
    read.get_transfer_quote,
    read.check_transfer_timing,
    start_transfer_booking,
    read.list_tours,
    read.get_tour,
    start_tour_booking,
    get_booking_terms,
  ]
  if (payOn && ctx.pay) {
    const deps = ctx.pay
    const def = payToolDefinition(browserRide)
    tools.push({ ...def, execute: (input) => bookAndPayTransfer(input, { deps, origin, via: ctx.via, ip: ctx.ip ?? '', now, ...(ctx.startedAt ? { startedAt: ctx.startedAt } : {}) }) })
  }
  return tools
}

/** Bounds the tools enforce, for the /connect page and the tests. */
export const LIMITS = { maxPassengers: MAX_TRANSFER_PASSENGERS, maxTourGuests: MAX_TOUR_GUESTS }
