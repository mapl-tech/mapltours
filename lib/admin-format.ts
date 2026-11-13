/**
 * One way of writing money and time on every admin screen (Nov 13 2026):
 * - money prints its currency code once per block (the caller adds it to the
 *   block's headline amount);
 * - our own events (paid, emails sent, refunds decided) are on the owner's
 *   Toronto clock with the zone named, one fixed zone so the server render and
 *   the browser agree;
 * - trip days and leg times are the guest's Jamaica wall-clock, which is
 *   stored verbatim and so is read back in UTC (read in the viewer's zone, a
 *   Toronto operator once saw every pickup hours out from what the driver and
 *   the guest had agreed);
 * - this year's year is never printed.
 * Tested in tests/unit/admin-format.spec.ts.
 */

/** The owner's clock, for what happened on our side. */
export const OWNER_ZONE = 'America/Toronto'

/** "$162.00". */
export function money(n: number | null | undefined): string {
  return '$' + Number(n ?? 0).toFixed(2)
}

/** "MAPL-ABCDEF12": the reference guests see on their confirmation. */
export function bookingRef(id: string): string {
  return 'MAPL-' + String(id).slice(0, 8).toUpperCase()
}

export function plural(n: number, w: string): string {
  return `${n} ${w}${n === 1 ? '' : 's'}`
}

/** The same, kept on one line: "2 passengers" never breaks after the 2. */
export function count(n: number, w: string): string {
  return plural(n, w).replace(' ', ' ')
}

function yearIn(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(d)
}

/** Today in Jamaica as YYYY-MM-DD: the day trips are planned in. */
export function jamaicaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Jamaica', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** When something happened on our side: "Nov 11, 8:31 PM EST", or "Nov 11" for the day alone. */
export function stamp(iso: string | null | undefined, dayOnly = false): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const year = yearIn(d, OWNER_ZONE) === yearIn(new Date(), OWNER_ZONE) ? {} : { year: 'numeric' as const }
  const time = dayOnly ? {} : { hour: 'numeric' as const, minute: '2-digit' as const, timeZoneName: 'short' as const }
  return d.toLocaleString('en-US', { timeZone: OWNER_ZONE, month: 'short', day: 'numeric', ...year, ...time })
}

/** A trip day: "Sat, Dec 5". Empty for anything that is not a date. */
export function tripDay(day: string | null | undefined): string {
  const s = String(day ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const year = s.slice(0, 4) === jamaicaToday().slice(0, 4) ? {} : { year: 'numeric' as const }
  return new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...year })
}

/** A leg time: "Thu, Dec 3, 4:06 PM". */
export function legTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const year = String(d.getUTCFullYear()) === jamaicaToday().slice(0, 4) ? {} : { year: 'numeric' as const }
  return d.toLocaleString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...year, hour: 'numeric', minute: '2-digit' })
}

/** A leg's clock time alone: "4:06 PM". */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' })
}

/** "3h ago", "2d ago". */
export function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min ago`
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
