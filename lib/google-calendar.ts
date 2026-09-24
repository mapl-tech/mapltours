import 'server-only'
import { createSign } from 'node:crypto'

/**
 * Ops Google Calendar sync: every PAID booking lands on the shared
 * "MAPL Bookings" calendar automatically; a refund takes it off again.
 *
 * Written against the Calendar REST API directly (no googleapis dependency,
 * same policy as the GA and Stripe integrations): a JWT minted from the
 * service-account key exchanges for a bearer token, cached until expiry.
 *
 * THREE RULES, mirroring lib/attribution and the email senders:
 *
 *   1. Best-effort garnish, never a gate. Every export catches everything and
 *      returns { ok } — a calendar hiccup must never fail the Stripe webhook
 *      that just confirmed a guest's payment.
 *   2. Idempotent by construction. Event ids are DERIVED from the booking id
 *      (Calendar ids allow [a-v0-9], and UUID hex is a subset), so a Stripe
 *      redelivery re-inserting the same event gets a 409 and treats it as
 *      done. No new DB column, no claim protocol.
 *   3. Jamaica wall-clock, verbatim. Stored leg times are the guest's typed
 *      wall-clock carrying a fake +00:00 (see lib/dispatch's time model), so
 *      the UTC fields of the parsed date ARE Jamaica local time. They are
 *      sent as a floating dateTime plus an explicit America/Jamaica timeZone,
 *      never converted through epoch math.
 *
 * Config (all three required, absent config disables the sync silently):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL   the service account's client_email
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  its PEM key ("\n" escapes accepted)
 *   GOOGLE_BOOKINGS_CALENDAR_ID    the shared calendar's id
 */

const AIRPORT = 'Sangster International Airport (MBJ), Montego Bay, Jamaica'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

/** Every Google fetch is timeboxed (audit finding, 2026-08-22): this module
 *  runs inside the Stripe webhook, which must answer within ~20s or Stripe
 *  records the delivery as failed and retries. An un-timed fetch during a
 *  Google hanging-connection incident would stall every delivery past that
 *  window. 3.5s bounds the worst case (token + first event) well under it,
 *  and the first failure aborts the remaining calls. Matches the codebase
 *  convention: every other outbound fetch uses AbortSignal.timeout. */
const FETCH_TIMEOUT_MS = 3500

/* ── Shapes (structural: the webhook passes its own row objects) ── */

export interface CalendarBooking {
  id: string
  booking_type: 'tour' | 'transfer'
  first_name: string | null
  last_name: string | null
  phone: string | null
  /** 'HH:MM' Jamaica local (tours), dispatch information only. */
  pickup_time: string | null
  pickup: string | null
  dropoff: string | null
}

export interface CalendarBookingItem {
  title: string
  destination: string
  travelers: number
  /** 'YYYY-MM-DD' for experience items. */
  date: string
  item_type: 'experience' | 'transfer'
  hotel: string | null
  trip_type: 'one_way' | 'round_trip' | null
  arrival_flight: string | null
  /** Jamaica wall-clock stored with a fake +00:00 (flight lands). */
  arrival_at: string | null
  departure_flight: string | null
  /** Jamaica wall-clock stored with a fake +00:00 (hotel pickup, guest-chosen). */
  departure_at: string | null
  passengers: number | null
}

export interface CalendarEvent {
  id: string
  summary: string
  description: string
  location: string
  start: { dateTime: string; timeZone: string } | { date: string }
  end: { dateTime: string; timeZone: string } | { date: string }
}

/* ── Pure builders (unit-tested; no I/O) ── */

/** 'YYYY-MM-DDTHH:MM:SS' from a stored wall-clock ISO, read verbatim via the
 *  UTC fields — the same convention as lib/dispatch's wallStamp. */
function wallClock(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

function plusMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function jamaica(iso: string, durationMin: number) {
  return {
    start: { dateTime: wallClock(iso), timeZone: 'America/Jamaica' },
    end: { dateTime: wallClock(plusMinutes(iso, durationMin)), timeZone: 'America/Jamaica' },
  }
}

/** Derived, deterministic event id: Calendar accepts [a-v0-9]{5,1024} and
 *  UUID hex is a subset, so the booking id IS the idempotency key. */
export function calendarEventId(bookingId: string, index: number): string {
  return `mapl${bookingId.toLowerCase().replace(/-/g, '')}i${index}`
}

const short = (id: string) => id.slice(0, 8).toUpperCase()

export function calendarEventsForBooking(
  booking: CalendarBooking,
  items: CalendarBookingItem[],
): CalendarEvent[] {
  const guest = `${booking.first_name ?? ''} ${booking.last_name ?? ''}`.trim() || 'Guest'
  const ref = short(booking.id)
  const events: CalendarEvent[] = []

  if (booking.booking_type === 'transfer') {
    const leg = items.find((i) => i.item_type === 'transfer')
    if (!leg) return []
    const hotel = leg.hotel ?? leg.destination
    const pax = leg.passengers ?? leg.travelers ?? 1
    const contact = booking.phone ? `Guest phone/WhatsApp: ${booking.phone}` : 'No phone on file'
    if (leg.arrival_at) {
      events.push({
        id: calendarEventId(booking.id, events.length),
        summary: `MBJ pickup · ${guest} → ${hotel}`,
        description: [
          `Booking #${ref} · ${pax} passenger${pax === 1 ? '' : 's'} · ${leg.trip_type === 'round_trip' ? 'round trip' : 'one-way'}`,
          `Flight lands ${wallClock(leg.arrival_at).slice(11, 16)} Jamaica time${leg.arrival_flight ? ` (${leg.arrival_flight})` : ''}`,
          contact,
        ].join('\n'),
        location: AIRPORT,
        ...jamaica(leg.arrival_at, 60),
      })
    }
    if (leg.trip_type === 'round_trip' && leg.departure_at) {
      events.push({
        id: calendarEventId(booking.id, events.length),
        summary: `Departure pickup · ${guest} · ${hotel} → MBJ`,
        description: [
          `Booking #${ref} · ${pax} passenger${pax === 1 ? '' : 's'}`,
          `Hotel pickup ${wallClock(leg.departure_at).slice(11, 16)} Jamaica time (guest-chosen)`,
          ...(leg.departure_flight ? [`Departure flight: ${leg.departure_flight}`] : []),
          contact,
        ].join('\n'),
        location: hotel,
        ...jamaica(leg.departure_at, 60),
      })
    }
    return events
  }

  // Tours: one event per experience item. bookings.pickup_time gives a timed
  // pickup marker when the guest chose one; otherwise an all-day event says
  // "this trip happens today" without inventing an hour.
  for (const item of items) {
    if (item.item_type !== 'experience') continue
    if (!/^\d{4}-\d{2}-\d{2}/.test(item.date)) continue
    const date = item.date.slice(0, 10)
    const timed = booking.pickup_time && /^\d{2}:\d{2}$/.test(booking.pickup_time)
    events.push({
      id: calendarEventId(booking.id, events.length),
      summary: `${item.title} · ${guest} (${item.travelers})`,
      description: [
        `Booking #${ref} · ${item.travelers} guest${item.travelers === 1 ? '' : 's'}`,
        ...(booking.pickup ? [`Pickup: ${booking.pickup}`] : []),
        booking.phone ? `Guest phone/WhatsApp: ${booking.phone}` : 'No phone on file',
      ].join('\n'),
      location: booking.pickup ?? item.destination,
      ...(timed
        ? jamaica(`${date}T${booking.pickup_time}:00+00:00`, 60)
        : { start: { date }, end: { date: nextDay(date) } }),
    })
  }
  return events
}

/* ── Auth (JWT → bearer token, cached until expiry) ── */

let cachedToken: { token: string; expiresAt: number } | null = null

function config() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const calendarId = process.env.GOOGLE_BOOKINGS_CALENDAR_ID
  return email && key && calendarId ? { email, key, calendarId } : null
}

async function accessToken(email: string, key: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: email,
    scope: CALENDAR_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key).toString('base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 }
  return json.access_token
}

/* ── Sync (best-effort; callers never need try/catch) ── */

export async function syncBookingToCalendar(
  booking: CalendarBooking,
  items: CalendarBookingItem[],
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const cfg = config()
    if (!cfg) return { ok: false, reason: 'not configured' }
    const events = calendarEventsForBooking(booking, items)
    if (events.length === 0) return { ok: true }
    const token = await accessToken(cfg.email, cfg.key)
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cfg.calendarId)}/events`
    for (const event of events) {
      const res = await fetch(base, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      // 409 = this event id already exists (Stripe redelivery, or a refund
      // already cancelled it). Both mean "nothing to do", not failure.
      if (!res.ok && res.status !== 409) {
        const body = await res.text()
        console.warn('[google-calendar] event insert failed', { booking: booking.id, event: event.id, status: res.status, body: body.slice(0, 200) })
        return { ok: false, reason: `insert ${res.status}` }
      }
    }
    return { ok: true }
  } catch (e) {
    console.warn('[google-calendar] sync failed', { booking: booking.id, error: e instanceof Error ? e.message : String(e) })
    return { ok: false, reason: 'exception' }
  }
}

/**
 * Remove a refunded booking's events. The refund handler has no items in
 * hand, so this sweeps the first MAX_EVENT_SLOTS derived ids; deletes of
 * ids that were never created answer 404/410, which is success here.
 * 24 covers any cart the checkout can produce (the whole catalog is ~23
 * experiences and a transfer makes at most 2 events) — an 8-slot sweep
 * left slots 8+ live on the calendar after a refund (audit finding,
 * 2026-08-22). Unused slots cost one cheap 404 each.
 */
const MAX_EVENT_SLOTS = 24

export async function removeBookingFromCalendar(
  bookingId: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const cfg = config()
    if (!cfg) return { ok: false, reason: 'not configured' }
    const token = await accessToken(cfg.email, cfg.key)
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cfg.calendarId)}/events`
    for (let i = 0; i < MAX_EVENT_SLOTS; i++) {
      const res = await fetch(`${base}/${calendarEventId(bookingId, i)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        console.warn('[google-calendar] event delete failed', { booking: bookingId, slot: i, status: res.status })
        return { ok: false, reason: `delete ${res.status}` }
      }
    }
    return { ok: true }
  } catch (e) {
    console.warn('[google-calendar] removal failed', { booking: bookingId, error: e instanceof Error ? e.message : String(e) })
    return { ok: false, reason: 'exception' }
  }
}
