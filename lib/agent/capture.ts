/**
 * Run the in-browser WebMCP booking tools on the server, capturing what they
 * validated instead of writing a browser cart.
 *
 * The WebMCP tools (lib/webmcp-tools) take their side effects through an
 * `actions` object. Handing them actions that only RECORD the call means the
 * connector's booking link and agent-payment tools accept exactly the rides
 * and tours the in-browser tools accept, with the same messages, and no
 * second copy of the rules can drift from the first.
 */
import type { TransferQuote } from '../airport-transfers'
import { getSlug } from '../experiences'
import { buildWebMcpTools, type WebMcpActions, type WebMcpTool } from '../webmcp-tools'
import type { RideHandoff } from './booking-link'

export interface Captured {
  quote?: TransferQuote
  fromAirport?: boolean
  patch?: { arrivalAt?: string; arrivalFlight?: string; departureAt?: string; departureFlight?: string }
  tour?: { slug: string; guests: number; date?: string; pickupHotel?: string }
}

/** A fresh WebMCP tool set whose side effects only record what they were asked to do. */
export function capturingTools(origin: string, now: () => Date): { tools: WebMcpTool[]; captured: Captured } {
  const captured: Captured = {}
  const actions: WebMcpActions = {
    origin,
    now,
    addTransferQuote: (quote, opts) => {
      captured.quote = quote
      captured.fromAirport = opts.fromAirport
      return 'captured'
    },
    updateTransferItem: (_id, patch) => {
      captured.patch = { ...patch }
    },
    addTour: (exp, guests, date, pickupHotel) => {
      captured.tour = { slug: getSlug(exp), guests, date, pickupHotel }
      return { added: true }
    },
    navigate: () => {},
    paymentInFlight: () => false,
  }
  return { tools: buildWebMcpTools(actions), captured }
}

export function toolNamed(tools: WebMcpTool[], name: string): WebMcpTool {
  const t = tools.find((x) => x.name === name)
  if (!t) throw new Error(`WebMCP tool ${name} is missing`)
  return t
}

/** Validate a ride exactly as the in-browser start_transfer_booking does. */
export async function validateRide(input: Record<string, unknown>, origin: string, now: () => Date) {
  const { tools, captured } = capturingTools(origin, now)
  const result = await toolNamed(tools, 'start_transfer_booking').execute(input)
  return { result, captured }
}

/** The validated ride as a booking-link handoff, or null when nothing was captured. */
export function rideHandoff(c: Captured): RideHandoff | null {
  if (!c.quote) return null
  return {
    kind: 'ride',
    destinationId: c.quote.destinationId,
    tripType: c.quote.tripType,
    passengers: c.quote.passengers,
    fromAirport: c.fromAirport ?? true,
    ...(c.patch?.arrivalAt ? { arrivalAt: c.patch.arrivalAt } : {}),
    ...(c.patch?.arrivalFlight ? { arrivalFlight: c.patch.arrivalFlight } : {}),
    ...(c.patch?.departureAt ? { departureAt: c.patch.departureAt } : {}),
    ...(c.patch?.departureFlight ? { departureFlight: c.patch.departureFlight } : {}),
  }
}
