/**
 * Whether an address is a Tor exit, from the Tor Project's own list.
 *
 * Every contact-form spam post on record (twelve, Oct 31 to Nov 3 2026) came
 * through a Tor exit, and no real message on record has. On its own Tor says
 * nothing (people use it for privacy), so the contact route holds a post from
 * Tor only with one of the bot's marks, and otherwise delivers it unanswered.
 *
 * The list is fetched only when asked, at most once an hour, and one request
 * is shared by concurrent callers. Anything that goes wrong (no answer within
 * 2 s, an error, a page that is not the list) answers false, which delivers
 * the post as before, and the next try waits 5 minutes. A list that cannot be
 * refreshed is used for up to a day.
 */

const LIST_URL = 'https://check.torproject.org/torbulkexitlist'
const FRESH_MS = 60 * 60_000
const STALE_MS = 24 * 60 * 60_000
const RETRY_MS = 5 * 60_000
const TIMEOUT_MS = 2_000

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/
const IPV6 = /^[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}$/

let list: { exits: Set<string>; at: number } | null = null
let failedAt = 0
let loading: Promise<void> | null = null

/** One address as the list writes it: IPv4, or lowercase IPv6. IPv4-mapped IPv6 is read as IPv4. */
function normalise(ip: string): string | null {
  const s = ip.trim().toLowerCase().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '')
  return IPV4.test(s) || IPV6.test(s) ? s : null
}

/** The exits in the list's text, or null when the text is not the list. */
export function parseExitList(text: string): Set<string> | null {
  const exits = new Set<string>()
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    const ip = normalise(s)
    if (!ip) return null
    exits.add(ip)
  }
  // The list has held over a thousand exits for years; a handful means a
  // broken answer, not a quiet network.
  return exits.size >= 100 ? exits : null
}

async function load(): Promise<void> {
  try {
    const res = await fetch(LIST_URL, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
    const exits = res.ok ? parseExitList(await res.text()) : null
    if (!exits) throw new Error(res.ok ? 'not the list' : `status ${res.status}`)
    list = { exits, at: Date.now() }
  } catch (err) {
    failedAt = Date.now()
    console.warn('[tor-exit] list unavailable:', err instanceof Error ? err.message : String(err))
  }
}

/** True only when the address is on a list fetched within the last day. */
export async function isTorExit(ip: string): Promise<boolean> {
  const addr = normalise(ip)
  if (!addr) return false
  if ((!list || Date.now() - list.at >= FRESH_MS) && Date.now() - failedAt >= RETRY_MS) {
    loading ??= load().finally(() => { loading = null })
    await loading
  }
  return !!list && Date.now() - list.at < STALE_MS && list.exits.has(addr)
}
