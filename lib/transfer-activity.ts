import { createServiceClient } from '@/lib/supabase/service'

/**
 * The booking-activity line under the transfers quote form.
 *
 * ⚠️ THE WIRED FUNCTION (`getTransferActivity`) RETURNS ILLUSTRATIVE FIGURES,
 * NOT REAL BOOKINGS. It is presentation copy chosen by the business, in the
 * same vein as the hardcoded "342 transfers booked in the last 30 days" stat
 * and the 4.9 / 340+ rating further down the page. Do not cite it in reports,
 * reconciliation, or anywhere it could be mistaken for data.
 *
 * `getRealTransferActivity()` below queries actual paid bookings and is a
 * drop-in replacement whenever you want the line to reflect reality; see the
 * swap note in app/transfers/page.tsx.
 */

export interface TransferActivity {
  /** Transfers shown as booked in the trailing 24 hours. */
  count: number
  /** Human label for the most recent one, e.g. "47 minutes ago". */
  lastBookedLabel: string
}

/* ── Illustrative figures ─────────────────────────────────────────────── */

// Anchored to the 342-per-30-days figure already published on this page,
// which is ~11.4 a day. Drifting far outside that band would contradict the
// stat sitting a few sections below.
const DAILY_MIN = 8
const DAILY_MAX = 16
const MINUTES_MIN = 4
const MINUTES_MAX = 94

/**
 * Deterministic hash of the hour bucket.
 *
 * Deterministic matters twice over: the value must be identical on the server
 * and in the browser for the same hour or React's hydration check fails, and
 * a figure that jumped on every render would be obviously fake.
 */
function hashHour(hourBucket: number, salt: number): number {
  let h = (hourBucket ^ (salt * 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

function inRange(hourBucket: number, salt: number, min: number, max: number): number {
  return min + (hashHour(hourBucket, salt) % (max - min + 1))
}

function minutesLabel(mins: number): string {
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 minute ago'
  if (mins < 60) return `${mins} minutes ago`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  if (hours === 1 && rem === 0) return '1 hour ago'
  if (rem === 0) return `${hours} hours ago`
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`
}

/**
 * Illustrative activity, stable within a clock hour and different the next.
 *
 * Synchronous and pure: the page renders it server-side, so nothing here
 * touches the database or the client clock.
 */
export function getTransferActivity(now: Date = new Date()): TransferActivity {
  const hourBucket = Math.floor(now.getTime() / 3_600_000)
  return {
    count: inRange(hourBucket, 1, DAILY_MIN, DAILY_MAX),
    lastBookedLabel: minutesLabel(inRange(hourBucket, 2, MINUTES_MIN, MINUTES_MAX)),
  }
}

/* ── Real figures, currently unwired ──────────────────────────────────── */

function relativeLabel(fromIso: string, now: Date): string | null {
  const then = Date.parse(fromIso)
  if (Number.isNaN(then)) return null
  const mins = Math.floor((now.getTime() - then) / 60_000)
  if (mins < 0) return null
  return minutesLabel(mins)
}

/**
 * Actual paid transfer bookings in the trailing 24 hours.
 *
 * Returns null when there is genuinely nothing to show, so the caller can
 * hide the line rather than print "0 transfers booked".
 */
export async function getRealTransferActivity(
  now: Date = new Date(),
): Promise<TransferActivity | null> {
  try {
    const since = new Date(now.getTime() - 24 * 3_600_000).toISOString()
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('bookings')
      .select('paid_at')
      .eq('booking_type', 'transfer')
      .eq('status', 'paid')
      .gte('paid_at', since)
      .order('paid_at', { ascending: false })
      .limit(200)

    if (error || !data || data.length === 0) return null

    const latest = data[0]?.paid_at
    const label = latest ? relativeLabel(latest, now) : null
    if (!label) return null

    return { count: data.length, lastBookedLabel: label }
  } catch {
    return null
  }
}
