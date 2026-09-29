import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeLikePattern } from '@/lib/pg-like'
import { TEST_EMAIL, maskEmail, normalizeEmail } from '@/lib/booking-sync'
import { buildTip as emailsBuildTip } from './emails'
import {
  cadenceHold,
  jamaicaDay,
  parseInstant,
  planPerson,
  sendOrder,
  type Decision,
  type LedgerRow,
  type TipBooking,
  type TipKey,
  type Track,
  type TripFacts,
} from './plan'
import { SITE, contactPath, listUnsubscribeHeaders, unsubscribeUrl, verifyStop } from './unsubscribe'

/**
 * One run of the trip tips job: the I/O around lib/trip-tips/plan.ts.
 *
 *   1. Read the Resend "Trip tips" segment (TIPS_SEGMENT_ID): the subscribed
 *      contacts, lower-cased, once each. Test addresses (TEST_EMAIL, the
 *      booking sync's rule) leave here and are never read further.
 *   2. Batch-read HubSpot: only mapl_tips "yes" goes on. mapl_tips_at is when
 *      they joined, which times the first prospect tip.
 *   3. Read the ledger (trip_tips_log) for everyone left.
 *   4. For each address the cadence does not hold anyway, read its bookings
 *      (escaped ilike, then an exact compare, as the booking sync does) and
 *      plan: at most one tip.
 *   5. Send, most urgent window first, at most MAX_SENDS and until the
 *      deadline. Per send: build the email, check the Resend contact is still
 *      subscribed, CLAIM the key in the ledger (the unique (email, tip_key)
 *      decides between two runs), POST /emails with an idempotency key, then
 *      mark the row sent. A definite refusal releases the claim (status
 *      'failed'; the next run deletes it and tries again). An answer that
 *      leaves the outcome unknown (timeout, 5xx after one retry with the same
 *      idempotency key) leaves the row claimed, so the key is never mailed
 *      twice; the report counts it as unconfirmed.
 *
 * Every read fails closed: a segment, HubSpot or ledger read that does not
 * come back whole stops the run before anything is sent, and a booking read
 * that fails skips that one address.
 *
 * `send: false` (a dry run, or TRIP_TIPS_ENABLED not '1') does every read and
 * builds every email, but never claims, never sends and never writes. Its
 * report lists masked addresses only.
 */

export const LEDGER_TABLE = 'trip_tips_log'
export const TIPS_FROM = 'MAPL Tours Jamaica <contact@mapltours.com>'
export const TIPS_REPLY_TO = 'contact@mapltours.com'
/** Sends one run makes at most. Real volume is a handful a day. */
export const MAX_SENDS = 25
/** Stop starting new work after this; a synchronous Netlify function is cut off at 10 s. */
export const RUN_DEADLINE_MS = 7_000
/** Each external call gives up after this. */
export const CALL_TIMEOUT_MS = 2_500
/** Gap between Resend calls: about 4 a second, well under the team's 10, which the live site shares. */
export const RESEND_SPACING_MS = 250
/** Gmail clips a message past 102 KB and hides the unsubscribe link with it. */
export const MAX_HTML_BYTES = 102 * 1024
/** Parallel booking reads. */
export const READ_CONCURRENCY = 6
/** Segment pages read (100 each). A longer list is a failure, never a silent cut. */
export const SEGMENT_MAX_PAGES = 20
/** A 'claimed' row older than this belongs to a run that stopped mid-send. */
export const STALE_CLAIM_MS = 60 * 60_000

/** The booking columns the planner reads. refund_state: migration 017, read live by the refund routes. */
export const TIPS_BOOKING_SELECT =
  'id, status, booking_type, email, first_name, paid_at, refunded_at, refund_state, pickup, dispatch, ' +
  'booking_items(item_type, experience_id, title, date, travelers, hotel, zone, trip_type, arrival_flight, arrival_at, departure_flight, departure_at, passengers)'

const LEDGER_SELECT = 'id, email, tip_key, track, status, created_at, sent_at, booking_id'

const RESEND_API = 'https://api.resend.com'
const HUBSPOT_API = 'https://api.hubapi.com'

/** What lib/trip-tips/emails.ts buildTip receives. */
export type TipContext = TripFacts & {
  track: Track
  unsubscribeUrl: string
}

export interface BuiltTip {
  subject: string
  preheader: string
  html: string
  text: string
}

export type BuildTip = (key: TipKey, ctx: TipContext) => BuiltTip

export interface TipsDeps {
  svc: SupabaseClient
  resendKey: string
  hubspotKey: string
  segmentId: string
  /** TRIP_TIPS_SECRET. Required to send; a dry run without it signs with a placeholder. */
  secret: string | null
  /** True only when the send gate is open (TRIP_TIPS_ENABLED === '1' and not ?dry=1). */
  send: boolean
  fetch?: typeof fetch
  now?: () => number
  pause?: (ms: number) => Promise<void>
  maxSends?: number
  deadlineMs?: number
  callTimeoutMs?: number
  buildTip?: BuildTip
  /** Base for unsubscribe links. */
  site?: string
}

export interface PlanRow {
  /** Masked. */
  email: string
  track: Track | null
  key?: TipKey
  /** would_send / sent / a hold reason / a send-time skip / deferred / failed / unconfirmed. */
  outcome: string
}

export interface TipsReport {
  ok: true
  dry: boolean
  /** Subscribed contacts on the segment (test addresses included). */
  subscribers: number
  skipped_test: number
  /** On the segment but HubSpot does not say "yes". */
  not_yes: number
  /** Addresses whose bookings were not read (a failed read, or the deadline): the next run reads them. */
  unread: number
  /** Addresses a tip was due for today. */
  planned: number
  sent: number
  would_send: number
  /** Due, but past the cap or the deadline: the next run takes them while the window is open. */
  deferred: number
  /** Why addresses got nothing today, counted. */
  held: Record<string, number>
  /** Due, but stopped at send time (unsubscribed meanwhile, claimed by another run, build failed). */
  skipped: Record<string, number>
  /** Refused by Resend and released: the next run tries again. */
  failed: number
  /** Outcome unknown: left claimed, never retried automatically. */
  unconfirmed: number
  /** Rows still 'claimed' from a run that stopped mid-send. Check them in Resend (tag campaign=trip_tips). */
  stale_claims: number
  errors: Record<string, number>
  /** Dry runs only. Masked. */
  plans?: PlanRow[]
}

type Reply = { ok: boolean; status: number; j: Record<string, unknown>; retryAfter: number | null }

async function call(
  f: typeof fetch,
  timeoutMs: number,
  url: string,
  key: string,
  method: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Reply> {
  try {
    const r = await f(url, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })
    const text = await r.text()
    let j: Record<string, unknown> = {}
    try { j = text ? (JSON.parse(text) as Record<string, unknown>) : {} } catch { j = {} }
    const ra = Number(r.headers.get('retry-after'))
    return { ok: r.ok, status: r.status, j, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : null }
  } catch {
    return { ok: false, status: 0, j: {}, retryAfter: null }
  }
}

/** The idempotency key for one tip to one address: the same on every retry, for 24 hours. */
export function idempotencyKey(key: TipKey, email: string): string {
  return `trip-tips-${key}-${createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16)}`
}

/** A stable daily order, so a run cut short by the deadline does not starve the same addresses every day. */
function dailyRank(email: string, nowMs: number): string {
  return createHash('sha256').update(`${jamaicaDay(nowMs)}:${email}`).digest('hex')
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return out
}

export class TipsRunError extends Error {}

export async function runTripTips(deps: TipsDeps): Promise<TipsReport> {
  const f = deps.fetch ?? fetch
  const now = deps.now ?? Date.now
  const pause = deps.pause ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const timeoutMs = deps.callTimeoutMs ?? CALL_TIMEOUT_MS
  const deadline = deps.deadlineMs ?? RUN_DEADLINE_MS
  const maxSends = deps.maxSends ?? MAX_SENDS
  const build = deps.buildTip ?? (emailsBuildTip as BuildTip)
  const site = deps.site ?? SITE
  const { svc } = deps
  const dry = !deps.send
  if (deps.send && !deps.secret) throw new TipsRunError('secret_missing')

  const startedAt = now()
  const nowMs = startedAt
  const report: TipsReport = {
    ok: true,
    dry,
    subscribers: 0,
    skipped_test: 0,
    not_yes: 0,
    unread: 0,
    planned: 0,
    sent: 0,
    would_send: 0,
    deferred: 0,
    held: {},
    skipped: {},
    failed: 0,
    unconfirmed: 0,
    stale_claims: 0,
    errors: {},
    ...(dry ? { plans: [] as PlanRow[] } : {}),
  }
  const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1 }
  const row = (email: string, track: Track | null, outcome: string, key?: TipKey) => {
    report.plans?.push({ email: maskEmail(email), track, ...(key ? { key } : {}), outcome })
  }

  // Resend calls are spaced: the team limit is shared with the live site's sends.
  let lastResend = 0
  const resend = async (path: string, method: string, body?: unknown, headers?: Record<string, string>) => {
    const wait = lastResend + RESEND_SPACING_MS - now()
    if (lastResend && wait > 0) await pause(wait)
    lastResend = now()
    return call(f, timeoutMs, `${RESEND_API}${path}`, deps.resendKey, method, body, headers)
  }

  /* 1. The segment. */
  const subscribed: string[] = []
  {
    let after = ''
    let complete = false
    for (let page = 0; page < SEGMENT_MAX_PAGES; page++) {
      const a = await resend(`/segments/${encodeURIComponent(deps.segmentId)}/contacts?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`, 'GET')
      if (!a.ok || !Array.isArray(a.j.data)) throw new TipsRunError(`segment_read_${a.status}`)
      const data = a.j.data as Array<Record<string, unknown>>
      for (const c of data) {
        if (c?.unsubscribed === true) continue
        const e = normalizeEmail(typeof c?.email === 'string' ? c.email : null)
        if (e) subscribed.push(e)
      }
      if (a.j.has_more !== true || !data.length) { complete = true; break }
      after = String(data[data.length - 1]?.id ?? '')
      if (!after) throw new TipsRunError('segment_page_without_id')
    }
    if (!complete) throw new TipsRunError('segment_too_long')
  }
  const unique = Array.from(new Set(subscribed))
  report.subscribers = unique.length
  const real = unique.filter((e) => !TEST_EMAIL.test(e))
  report.skipped_test = unique.length - real.length

  /* 2. HubSpot consent. */
  const joined = new Map<string, number | null>()
  for (let i = 0; i < real.length; i += 100) {
    const chunk = real.slice(i, i + 100)
    const r = await call(f, timeoutMs, `${HUBSPOT_API}/crm/v3/objects/contacts/batch/read`, deps.hubspotKey, 'POST', {
      idProperty: 'email',
      properties: ['email', 'mapl_tips', 'mapl_tips_at'],
      inputs: chunk.map((id) => ({ id })),
    })
    if ((r.status !== 200 && r.status !== 207) || !Array.isArray(r.j.results)) throw new TipsRunError(`hubspot_read_${r.status}`)
    for (const c of r.j.results as Array<{ properties?: Record<string, unknown> }>) {
      const p = c?.properties ?? {}
      const e = normalizeEmail(typeof p.email === 'string' ? p.email : null)
      if (e && p.mapl_tips === 'yes') joined.set(e, parseInstant(p.mapl_tips_at))
    }
  }
  const yes = real.filter((e) => joined.has(e))
  report.not_yes = real.length - yes.length

  /* 3. The ledger. */
  const ledger = new Map<string, LedgerRow[]>()
  for (let i = 0; i < yes.length; i += 100) {
    const chunk = yes.slice(i, i + 100)
    const { data, error } = await svc.from(LEDGER_TABLE).select(LEDGER_SELECT).in('email', chunk)
    if (error) throw new TipsRunError('ledger_read')
    for (const r of (data ?? []) as LedgerRow[]) {
      const e = normalizeEmail(r.email)
      if (!e) continue
      if (!ledger.has(e)) ledger.set(e, [])
      ledger.get(e)!.push(r)
      if (r.status === 'claimed' && nowMs - (parseInstant(r.created_at) ?? nowMs) > STALE_CLAIM_MS) report.stale_claims += 1
    }
  }

  /* 4. Plan. */
  type Planned = { email: string; decision: Decision } | { email: string; unread: 'deadline' | 'booking_read' }
  const order = [...yes].sort((a, b) => (dailyRank(a, nowMs) < dailyRank(b, nowMs) ? -1 : 1))
  const planned = await pool(order, READ_CONCURRENCY, async (email): Promise<Planned> => {
    const rows = ledger.get(email) ?? []
    const early = cadenceHold(rows, nowMs)
    if (early) return { email, decision: { send: false, track: null, reason: early } }
    if (now() - startedAt > deadline) return { email, unread: 'deadline' }
    const bookings = await readBookings(svc, email)
    if (!bookings) return { email, unread: 'booking_read' }
    return { email, decision: planPerson({ email, joinedAtMs: joined.get(email) ?? null, bookings, ledger: rows }, nowMs) }
  })

  const due: Array<{ email: string; runsLeft: number; d: Extract<Decision, { send: true }> }> = []
  for (const p of planned) {
    if ('unread' in p) {
      // The next run reads them. A failed read is an error; the deadline is not.
      report.unread += 1
      if (p.unread === 'booking_read') bump(report.errors, 'booking_read')
      row(p.email, null, `unread_${p.unread}`)
      continue
    }
    if (p.decision.send) due.push({ email: p.email, runsLeft: p.decision.runsLeft, d: p.decision })
    else {
      bump(report.held, p.decision.reason)
      row(p.email, p.decision.track, p.decision.reason)
    }
  }
  due.sort(sendOrder)
  report.planned = due.length

  /* 5. Send. */
  for (let i = 0; i < due.length; i++) {
    const { email, d } = due[i]
    if (i >= maxSends || now() - startedAt > deadline) {
      report.deferred += 1
      row(email, d.track, 'deferred', d.key)
      continue
    }
    const skip = (why: string) => { bump(report.skipped, why); row(email, d.track, why, d.key) }

    const secret = deps.secret ?? 'dry-run-placeholder-secret'
    const url = unsubscribeUrl(email, secret, site)
    // The link must work before the tip goes: the unsubscribe route checks
    // it with verifyStop, so check it the same way here. An address the
    // route could not read back would get a tip whose stop link and
    // one-click both answer 400.
    const signed = new URL(url).searchParams
    if (verifyStop(signed.get('e'), signed.get('t'), secret) !== email) { skip('unsubscribe_unverifiable'); continue }
    let built: BuiltTip
    try {
      built = build(d.key, { ...d.facts, track: d.track, unsubscribeUrl: url })
    } catch {
      skip('build_failed')
      continue
    }
    const whole = built && [built.subject, built.html, built.text].every((s) => typeof s === 'string' && s.trim().length > 0)
    // The unsubscribe link must be in both parts (in the HTML, as written or
    // with its & escaped): a tip without a working stop is never sent.
    const linked = whole && (built.html.includes(url) || built.html.includes(url.replace(/&/g, '&amp;'))) && built.text.includes(url)
    if (!linked) { skip('build_failed'); continue }
    if (Buffer.byteLength(built.html, 'utf8') > MAX_HTML_BYTES) { skip('build_too_large'); continue }

    // Still subscribed, right now? The segment list is seconds old; a stop
    // tapped since (or Resend's own unsubscribe) wins.
    const contact = await resend(contactPath(email), 'GET')
    if (contact.status === 404) { skip('no_contact'); continue }
    if (!contact.ok) { bump(report.errors, `resend_contact_${contact.status}`); skip('contact_check_failed'); continue }
    if (contact.j.unsubscribed === true) { skip('unsubscribed'); continue }
    if (contact.j.unsubscribed !== false) { skip('contact_check_failed'); continue }

    if (dry) {
      report.would_send += 1
      row(email, d.track, 'would_send', d.key)
      continue
    }

    const claim = await claimTip(svc, { email, tip_key: d.key, track: d.track, booking_id: d.bookingId })
    if (!claim.ok) {
      if (claim.taken) skip('claimed_elsewhere')
      else { bump(report.errors, claim.error); skip('claim_failed') }
      continue
    }

    const outcome = await sendTip(resend, pause, {
      from: TIPS_FROM,
      to: [email],
      reply_to: TIPS_REPLY_TO,
      subject: built.subject,
      html: built.html,
      text: built.text,
      headers: listUnsubscribeHeaders(url),
      tags: [
        { name: 'campaign', value: 'trip_tips' },
        { name: 'tip', value: d.key },
      ],
    }, idempotencyKey(d.key, email))

    if (outcome.kind === 'sent') {
      report.sent += 1
      const { error } = await svc
        .from(LEDGER_TABLE)
        .update({ status: 'sent', resend_id: outcome.id, sent_at: new Date(now()).toISOString() })
        .eq('id', claim.id)
        .eq('status', 'claimed')
      // The row stays 'claimed' if this fails, which still blocks a resend.
      if (error) bump(report.errors, 'ledger_mark_sent')
      continue
    }
    bump(report.errors, `resend_send_${outcome.status}`)
    if (outcome.kind === 'refused') {
      report.failed += 1
      row(email, d.track, 'failed', d.key)
      const { error } = await svc.from(LEDGER_TABLE).update({ status: 'failed' }).eq('id', claim.id).eq('status', 'claimed')
      if (error) bump(report.errors, 'ledger_release')
    } else {
      report.unconfirmed += 1
      row(email, d.track, 'unconfirmed', d.key)
    }
  }

  return report
}

/** Every booking at exactly this address that took money, or null when the read failed. */
async function readBookings(svc: SupabaseClient, email: string): Promise<TipBooking[] | null> {
  const { data, error } = await svc
    .from('bookings')
    .select(TIPS_BOOKING_SELECT)
    // ilike without wildcards is a case-insensitive equality; the escape keeps
    // an underscore from matching any character. It cannot neutralise `*`
    // (PostgREST rewrites it to % first), so only exact matches are kept.
    .ilike('email', escapeLikePattern(email))
    .in('status', ['paid', 'refunded'])
    .limit(200)
  if (error) return null
  return ((data ?? []) as unknown as TipBooking[]).filter((b) => normalizeEmail(b.email) === email)
}

/**
 * Take the key for this address. A 'failed' row of the same key is released
 * first (deleted, and only while it is still 'failed'), so a refused tip can
 * be tried again; then the insert either takes the key or meets the unique
 * (email, tip_key) because another run has it.
 */
async function claimTip(
  svc: SupabaseClient,
  r: { email: string; tip_key: TipKey; track: Track; booking_id: string | null },
): Promise<{ ok: true; id: string } | { ok: false; taken: boolean; error: string }> {
  const del = await svc.from(LEDGER_TABLE).delete().eq('email', r.email).eq('tip_key', r.tip_key).eq('status', 'failed')
  if (del.error) return { ok: false, taken: false, error: 'ledger_release_failed_row' }
  const ins = await svc.from(LEDGER_TABLE).insert({ ...r, status: 'claimed' }).select('id').single()
  if (ins.error) {
    const taken = (ins.error as { code?: string }).code === '23505'
    return { ok: false, taken, error: taken ? 'taken' : 'ledger_claim' }
  }
  const id = (ins.data as { id?: string } | null)?.id
  return id ? { ok: true, id } : { ok: false, taken: false, error: 'ledger_claim' }
}

type SendOutcome =
  | { kind: 'sent'; id: string | null; status: number }
  /** Resend refused it: nothing went out, the claim may be released. */
  | { kind: 'refused'; status: number }
  /** Nobody can say whether it went out: keep the claim. */
  | { kind: 'unknown'; status: number }

/**
 * POST /emails, retried once with the SAME idempotency key when the answer
 * leaves it open (network, timeout, 5xx, a concurrent request with the key) or
 * says not yet (429). Resend answers a repeat of an accepted request with its
 * original response and never sends it twice, but only for 24 hours.
 *
 * 'refused' (the claim is released and a later run posts again, possibly
 * after the 24 hours) only when EVERY attempt was a definite refusal. Once
 * any attempt was ambiguous (no answer, a 5xx, a concurrent request with the
 * key), Resend may already have accepted it, so a later refusal, a 429
 * included, proves nothing about that attempt: the outcome is unknown and the
 * claim stays.
 */
async function sendTip(
  resend: (path: string, method: string, body?: unknown, headers?: Record<string, string>) => Promise<Reply>,
  pause: (ms: number) => Promise<void>,
  body: Record<string, unknown>,
  idem: string,
): Promise<SendOutcome> {
  const once = () => resend('/emails', 'POST', body, { 'Idempotency-Key': idem })
  const ambiguous = (r: Reply) => r.status === 0 || r.status >= 500 || (r.status === 409 && r.j.name === 'concurrent_idempotent_requests')
  const open = (r: Reply) => ambiguous(r) || r.status === 429
  let r = await once()
  let everAmbiguous = !r.ok && ambiguous(r)
  if (!r.ok && open(r)) {
    await pause(r.status === 429 && r.retryAfter ? Math.min(r.retryAfter, 2) * 1000 : 1000)
    r = await once()
    everAmbiguous ||= !r.ok && ambiguous(r)
  }
  if (r.ok) return { kind: 'sent', id: typeof r.j.id === 'string' ? r.j.id : null, status: r.status }
  if (everAmbiguous) return { kind: 'unknown', status: r.status }
  // Every answer was definite. Rate limited throughout: never accepted. Any
  // other 4xx except 409 refuses this request. A 409 means a request with
  // this key exists (its outcome is not ours to know).
  if (r.status === 429 || (r.status >= 400 && r.status < 500 && r.status !== 409)) return { kind: 'refused', status: r.status }
  return { kind: 'unknown', status: r.status }
}
