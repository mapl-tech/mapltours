import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeLikePattern } from '@/lib/pg-like'
import {
  SYNC_BOOKING_SELECT,
  SYNC_BATCH,
  SYNC_DEADLINE_MS,
  SYNC_CALL_TIMEOUT_MS,
  CRM_PAID_FILTER,
  CRM_REFUND_FILTER,
  CRM_NEVER_FAILED_FILTER,
  CRM_RETRY_DUE_FILTER,
  CRM_RETRY_KEYS,
  STUCK_AFTER,
  aggregateForEmail,
  contactName,
  crmProperties,
  failurePatch,
  groupCandidates,
  maskEmail,
  mayStamp,
  paidEventFor,
  priorFailures,
  reconcileGroup,
  shouldSetCustomer,
  stampKeyFor,
  stampPatch,
  type ResendOutcome,
  type SyncBooking,
  type SyncGroup,
  type SyncState,
} from '@/lib/booking-sync'

/**
 * One run of the booking sync: the I/O around lib/booking-sync.ts.
 *
 * For each address with a booking whose money state has not reached the CRM:
 *   1. recompute the address's totals from ALL its bookings;
 *   2. set them on the HubSpot contact (create it if HubSpot has none),
 *      moving the lifecycle stage up to customer, never down;
 *   3. for a newly PAID booking, if the address is already a Resend contact
 *      (someone who asked for trip tips), send booking.paid so the welcome
 *      tips stop. Never creates a Resend contact: events/send with an unknown
 *      address would create one, so the contact is looked up first. This
 *      step runs whatever HubSpot answered: a guest who booked must not get
 *      "book your ride" tips because the CRM is down, and a repeated
 *      booking.paid is harmless (it only ends a wait);
 *   4. stamp the bookings, and only when both steps went through. A failed
 *      booking gets retry bookkeeping instead (see CRM_RETRY_AT_KEY) and is
 *      tried again with a growing wait, after any booking that never failed.
 *
 * Everything external takes an injected fetch so the tests drive it with
 * fakes. `dry` does the reads (Supabase, and the HubSpot and Resend lookups)
 * and reports what it would do; it never calls a write endpoint and never
 * stamps.
 */

const HUBSPOT_API = 'https://api.hubapi.com'
const RESEND_API = 'https://api.resend.com'

export interface SyncDeps {
  svc: SupabaseClient
  hubspotKey: string
  resendKey?: string | null
  dry: boolean
  fetch?: typeof fetch
  now?: () => number
  batch?: number
  deadlineMs?: number
  /** Per external call. Tests shorten it. */
  callTimeoutMs?: number
}

export interface GroupReport {
  /** Masked. */
  email: string
  bookings: number
  states: SyncState[]
  test: boolean
  hubspot: 'create' | 'update' | 'failed' | 'skipped'
  lifecycle?: 'set_customer' | 'kept'
  properties?: Record<string, string>
  resend: ResendOutcome | 'would_send'
  /** Short machine reason when something failed. Never contains an address. */
  error?: string
}

export interface SyncReport {
  ok: true
  dry: boolean
  /** Waiting bookings this run read. */
  scanned: number
  /** Distinct addresses among them. */
  addresses: number
  /** Bookings stamped as synced (in a dry run: that would be). */
  synced: number
  skipped_test: number
  skipped_no_email: number
  /** Bookings left unstamped because a step failed; the next run retries. */
  failed: number
  /**
   * Bookings this run left for the next: past the deadline, or changed while
   * the run was under way (refunded, a refund released, stamped elsewhere).
   */
  deferred: number
  /** Failed bookings that have now failed STUCK_AFTER times or more in a row. */
  stuck: number
  hubspot_created: number
  hubspot_updated: number
  events_sent: number
  /** Stamps that did not land although the CRM writes had. */
  stamp_errors: number
  /** Failure reasons with counts, e.g. { "hubspot_get_401": 1 }. */
  errors: Record<string, number>
  /** Per address, masked. Dry runs only. */
  groups?: GroupReport[]
}

type Fetch = typeof fetch
type Reply = { ok: boolean; status: number; j: Record<string, unknown> }
/** One external call. Never throws: a network error or a timeout is status 0. */
type Http = (url: string, key: string, method: string, body?: unknown) => Promise<Reply>

async function call(f: Fetch, timeoutMs: number, url: string, key: string, method: string, body?: unknown): Promise<Reply> {
  try {
    const r = await f(url, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })
    const text = await r.text()
    let j: Record<string, unknown> = {}
    try { j = text ? (JSON.parse(text) as Record<string, unknown>) : {} } catch { j = {} }
    return { ok: r.ok, status: r.status, j }
  } catch {
    return { ok: false, status: 0, j: {} }
  }
}

/**
 * This run's candidates. Bookings that never failed come first, oldest first,
 * so a backlog drains in order; failed bookings whose retry is due fill what
 * is left of the batch. A failed booking whose retry is not due is not read
 * at all. However many bookings keep failing, a new one is never crowded out.
 */
async function loadCandidates(svc: SupabaseClient, batch: number, nowIso: string): Promise<SyncBooking[]> {
  const query = (status: 'paid' | 'refunded', retries: boolean) => {
    const q = svc
      .from('bookings')
      .select(SYNC_BOOKING_SELECT)
      .eq('status', status)
      .is(status === 'paid' ? CRM_PAID_FILTER : CRM_REFUND_FILTER, null)
    return (retries ? q.lte(CRM_RETRY_DUE_FILTER, nowIso) : q.is(CRM_NEVER_FAILED_FILTER, null))
      .order(status === 'paid' ? 'paid_at' : 'refunded_at', { ascending: true, nullsFirst: true })
      .limit(batch)
  }
  const results = await Promise.all([query('paid', false), query('refunded', false), query('paid', true), query('refunded', true)])
  for (const r of results) {
    if (r.error) throw new Error(`candidate query failed: ${r.error.message}`)
  }
  const [paidNew, refundNew, paidRetry, refundRetry] = results.map((r) => (r.data ?? []) as SyncBooking[])
  const at = (b: SyncBooking) => {
    const iso = b.status === 'refunded' ? (b.refunded_at ?? b.paid_at) : b.paid_at
    const ms = iso ? Date.parse(iso) : NaN
    return Number.isNaN(ms) ? 0 : ms
  }
  const byTime = (a: SyncBooking, b: SyncBooking) => at(a) - at(b)
  const fresh = [...paidNew, ...refundNew].sort(byTime)
  const retries = [...paidRetry, ...refundRetry].sort(byTime)
  return [...fresh, ...retries].slice(0, batch)
}

/** Every booking this address has that took money, as it is now. */
async function loadAddressBookings(svc: SupabaseClient, group: SyncGroup): Promise<SyncBooking[] | null> {
  const { data, error } = await svc
    .from('bookings')
    .select(SYNC_BOOKING_SELECT)
    // ilike without wildcards is a case-insensitive equality; the escape
    // keeps an underscore in the address from matching any character. It
    // cannot neutralise `*` (PostgREST rewrites it to % first), which is why
    // reconcileGroup keeps only the rows whose address is exactly this one.
    .ilike('email', escapeLikePattern(group.email))
    .in('status', ['paid', 'refunded'])
    .limit(500)
  if (error) return null
  return (data ?? []) as SyncBooking[]
}

type HubspotStep = {
  ok: boolean
  action: 'create' | 'update' | 'failed'
  lifecycle?: 'set_customer' | 'kept'
  properties: Record<string, string>
  error?: string
}

/**
 * Create the contact, or set the booking properties on the one HubSpot has.
 * The stage is read before it is written, so a contact already past customer
 * (evangelist, other, a custom stage) is never moved back.
 */
async function hubspotUpsert(call: Http, key: string, email: string, rows: SyncBooking[], dry: boolean): Promise<HubspotStep> {
  const agg = aggregateForEmail(rows)
  const booking = crmProperties(agg)
  const contacts = `${HUBSPOT_API}/crm/v3/objects/contacts`

  const update = async (path: string, found: Reply): Promise<HubspotStep> => {
    const props = (found.j.properties ?? {}) as Record<string, unknown>
    const stage = typeof props.lifecyclestage === 'string' ? props.lifecyclestage : null
    const upgrade = shouldSetCustomer(stage, agg.hasPaid)
    const properties = { ...booking, ...(upgrade ? { lifecyclestage: 'customer' } : {}) }
    const lifecycle = upgrade ? ('set_customer' as const) : ('kept' as const)
    if (dry) return { ok: true, action: 'update', lifecycle, properties }
    const patched = await call(`${contacts}/${path}`, key, 'PATCH', { properties })
    return patched.ok
      ? { ok: true, action: 'update', lifecycle, properties }
      : { ok: false, action: 'failed', properties, error: `hubspot_patch_${patched.status}` }
  }

  const byEmail = `${encodeURIComponent(email)}?idProperty=email`
  const existing = await call(`${contacts}/${byEmail}&properties=lifecyclestage`, key, 'GET')
  if (existing.ok) return update(byEmail, existing)
  if (existing.status !== 404) {
    return { ok: false, action: 'failed', properties: booking, error: `hubspot_get_${existing.status}` }
  }

  // New contact. Name only on create: an existing contact's name is theirs to
  // keep. mapl_source 'booking' is the value the bio's property describes.
  const properties = {
    email,
    mapl_source: 'booking',
    ...contactName(rows),
    ...booking,
    ...(agg.hasPaid ? { lifecyclestage: 'customer' } : {}),
  }
  const lifecycle = agg.hasPaid ? ('set_customer' as const) : ('kept' as const)
  if (dry) return { ok: true, action: 'create', lifecycle, properties }
  const created = await call(contacts, key, 'POST', { properties })
  if (created.ok) return { ok: true, action: 'create', lifecycle, properties }

  // 409: the address belongs to a contact the email lookup did not find (it
  // appeared since, or it is that contact's secondary address). HubSpot names
  // the contact; update it by id, reading its stage first like any update.
  if (created.status === 409) {
    const id = /Existing ID:\s*(\d+)/.exec(String(created.j.message ?? ''))?.[1]
    if (id) {
      const found = await call(`${contacts}/${id}?properties=lifecyclestage`, key, 'GET')
      if (found.ok) return update(id, found)
    }
  }
  return { ok: false, action: 'failed', properties, error: `hubspot_create_${created.status}` }
}

/** Properties as a dry run may show them: no address, no name. */
function redact(properties: Record<string, string>, email: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(properties)) {
    if (k === 'email') out[k] = maskEmail(email)
    else if (k === 'firstname' || k === 'lastname') out[k] = '(from booking)'
    else out[k] = v
  }
  return out
}

async function resendStep(
  call: Http,
  key: string | null | undefined,
  email: string,
  group: SyncGroup,
  dry: boolean,
): Promise<{ outcome: ResendOutcome | 'would_send'; error?: string }> {
  const event = paidEventFor(group)
  if (!event) return { outcome: 'not_needed' }
  if (!key) return { outcome: 'failed', error: 'resend_key_missing' }

  const contact = await call(`${RESEND_API}/contacts/${encodeURIComponent(email)}`, key, 'GET')
  if (contact.status === 404) return { outcome: 'no_contact' }
  if (!contact.ok) return { outcome: 'failed', error: `resend_get_${contact.status}` }
  if (dry) return { outcome: 'would_send' }

  const sent = await call(`${RESEND_API}/events/send`, key, 'POST', {
    event: 'booking.paid',
    email,
    payload: { type: event.type },
  })
  return sent.ok ? { outcome: 'sent' } : { outcome: 'failed', error: `resend_event_${sent.status}` }
}

async function stamp(svc: SupabaseClient, bookingId: string, state: SyncState, nowIso: string, skipped?: 'test_address' | 'no_email'): Promise<boolean> {
  const { error } = await svc.rpc('merge_dispatch', {
    p_booking_id: bookingId,
    p_patch: stampPatch(state, nowIso, skipped),
    // Synced: the retry bookkeeping of any earlier failure goes with it.
    p_remove: CRM_RETRY_KEYS,
    // Once only: a concurrent run that already stamped wins, and this write
    // becomes a no-op rather than moving the timestamp.
    p_only_if_absent: stampKeyFor(state),
  })
  return !error
}

/**
 * Record a failed attempt, so the row waits before it is read again. Only
 * while it is unstamped: if an overlapping run synced it meanwhile, nothing
 * is written. Best effort: if this write fails, the row is simply retried on
 * the next run, as before.
 */
async function markFailed(svc: SupabaseClient, c: { booking: SyncBooking; state: SyncState }, nowMs: number, reason: string): Promise<void> {
  await svc.rpc('merge_dispatch', {
    p_booking_id: c.booking.id,
    p_patch: failurePatch(c.booking, nowMs, reason),
    p_only_if_absent: stampKeyFor(c.state),
  })
}

export async function runBookingSync(deps: SyncDeps): Promise<SyncReport> {
  const f = deps.fetch ?? fetch
  const now = deps.now ?? Date.now
  const batch = deps.batch ?? SYNC_BATCH
  const deadline = deps.deadlineMs ?? SYNC_DEADLINE_MS
  const timeoutMs = deps.callTimeoutMs ?? SYNC_CALL_TIMEOUT_MS
  const http: Http = (url, key, method, body) => call(f, timeoutMs, url, key, method, body)
  const startedAt = now()
  const { svc, dry } = deps

  const report: SyncReport = {
    ok: true,
    dry,
    scanned: 0,
    addresses: 0,
    synced: 0,
    skipped_test: 0,
    skipped_no_email: 0,
    failed: 0,
    deferred: 0,
    stuck: 0,
    hubspot_created: 0,
    hubspot_updated: 0,
    events_sent: 0,
    stamp_errors: 0,
    errors: {},
    ...(dry ? { groups: [] as GroupReport[] } : {}),
  }
  const noteError = (e: string) => { report.errors[e] = (report.errors[e] ?? 0) + 1 }

  const rows = await loadCandidates(svc, batch, new Date(startedAt).toISOString())
  report.scanned = rows.length
  const { groups, noEmail } = groupCandidates(rows)
  report.addresses = groups.length
  const nowIso = () => new Date(now()).toISOString()

  // No usable address: nothing can ever be synced, so the rows leave the queue.
  for (const c of noEmail) {
    report.skipped_no_email += 1
    if (!dry && !(await stamp(svc, c.booking.id, c.state, nowIso(), 'no_email'))) report.stamp_errors += 1
  }

  // A failed group: its bookings stay unstamped and wait before the next try.
  const fail = async (candidates: SyncGroup['candidates'], reason: string) => {
    report.failed += candidates.length
    if (dry) return
    const at = now()
    for (const c of candidates) {
      if (priorFailures(c.booking) + 1 >= STUCK_AFTER) report.stuck += 1
      await markFailed(svc, c, at, reason)
    }
  }

  for (const group of groups) {
    const n = group.candidates.length
    if (now() - startedAt > deadline) {
      report.deferred += n
      continue
    }
    const g: GroupReport = {
      email: maskEmail(group.email),
      bookings: n,
      states: group.candidates.map((c) => c.state),
      test: group.test,
      hubspot: 'skipped',
      resend: 'not_needed',
    }

    if (group.test) {
      // Ours or synthetic: never sent anywhere, stamped skipped.
      report.skipped_test += n
      if (!dry) {
        for (const c of group.candidates) {
          if (!(await stamp(svc, c.booking.id, c.state, nowIso(), 'test_address'))) report.stamp_errors += 1
        }
      }
      report.groups?.push(g)
      continue
    }

    const fresh = await loadAddressBookings(svc, group)
    if (!fresh) {
      noteError('address_query')
      g.hubspot = 'failed'
      g.error = 'address_query'
      await fail(group.candidates, 'address_query')
      report.groups?.push(g)
      continue
    }

    // Only the rows whose address is exactly this one, as they are now. A
    // candidate that changed since it was read is left for the next run.
    const { live, stale, aggregate } = reconcileGroup(group, fresh)
    report.deferred += stale
    if (!live.length) {
      g.error = 'changed_during_run'
      report.groups?.push(g)
      continue
    }
    const current: SyncGroup = { ...group, candidates: live }
    const m = live.length
    g.bookings = m
    g.states = live.map((c) => c.state)

    const hs = await hubspotUpsert(http, deps.hubspotKey, group.email, aggregate, dry)
    g.hubspot = hs.action
    g.lifecycle = hs.lifecycle
    if (dry) g.properties = redact(hs.properties, group.email)
    if (!hs.ok) noteError(hs.error ?? 'hubspot')

    // Whatever HubSpot answered: see step 3 above.
    const rs = await resendStep(http, deps.resendKey, group.email, current, dry)
    g.resend = rs.outcome
    if (rs.error) noteError(rs.error)
    g.error = hs.ok ? rs.error : hs.error
    if (!dry && rs.outcome === 'sent') report.events_sent += 1

    if (!mayStamp(hs.ok, rs.outcome as ResendOutcome)) {
      await fail(live, (hs.ok ? rs.error : hs.error) ?? 'unknown')
      report.groups?.push(g)
      continue
    }

    if (dry) {
      report.synced += m
      report.groups?.push(g)
      continue
    }

    if (hs.action === 'create') report.hubspot_created += 1
    else report.hubspot_updated += 1
    for (const c of live) {
      if (await stamp(svc, c.booking.id, c.state, nowIso())) report.synced += 1
      else report.stamp_errors += 1
    }
  }

  return report
}
