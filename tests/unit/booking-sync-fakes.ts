/**
 * Fakes for the booking sync tests: an in-memory `bookings` table behind a
 * PostgREST-shaped builder, merge_dispatch with its real once-only rule, and
 * a fetch that plays HubSpot and Resend. Every call is recorded in order so a
 * test can prove what happened before what.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { CRM_PAID_KEY, CRM_REFUND_KEY, CRM_RETRY_AT_KEY, type SyncBooking } from '@/lib/booking-sync'

export type Row = SyncBooking & { dispatch: Record<string, unknown> | null }

export interface FakeWorld {
  rows: Row[]
  /** Every external call and every stamp, in order. */
  log: Array<{ kind: 'fetch'; method: string; url: string; body: unknown } | { kind: 'rpc'; name: string; args: Record<string, unknown> }>
  /** HubSpot contacts by lower-cased email. */
  hubspot: Map<string, { id: string; lifecyclestage: string | null; properties: Record<string, string> }>
  /** Resend contacts (lower-cased emails). */
  resendContacts: Set<string>
  /** Knobs. */
  fail: {
    candidateQuery?: boolean
    addressQuery?: boolean
    rpc?: boolean
    hubspotGet?: number
    hubspotWrite?: number
    /** Answer the create with 409 naming this id, as HubSpot does for a secondary address. */
    hubspotCreateConflictId?: string
    resendGet?: number
    resendEvent?: number
    /** Calls that never answer on their own: they settle only when their signal aborts. */
    hang?: (method: string, url: string) => boolean
  }
  /** Runs just before the per-address query reads the table (a write landing mid-run). */
  beforeAddressQuery?: () => void
}

export function makeWorld(rows: Row[] = []): FakeWorld {
  return { rows, log: [], hubspot: new Map(), resendContacts: new Set(), fail: {} }
}

let nextId = 0
export function booking(p: Partial<Row> & { email?: string | null }): Row {
  nextId += 1
  return {
    id: p.id ?? `00000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`,
    status: 'paid',
    booking_type: 'tour',
    first_name: 'Ana',
    last_name: 'Brown',
    total_paid: 100,
    paid_at: '2026-09-20T12:00:00.000Z',
    refunded_at: null,
    refund_amount: null,
    admin_charge: null,
    ...p,
    dispatch: p.dispatch ?? null,
  } as Row
}

/**
 * PostgREST's like/ilike as the server applies it: `*` in the value is an
 * alias for `%` (rewritten before LIKE sees it, so a backslash cannot escape
 * it), then LIKE with backslash as the escape character.
 */
function likeToRegExp(value: string): RegExp {
  const p = value.replace(/\*/g, '%')
  let re = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    if (c === '\\' && i + 1 < p.length) re += p[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    else if (c === '%') re += '.*'
    else if (c === '_') re += '.'
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'is')
}

/** A chainable, thenable fake of the PostgREST select builder. */
function selectBuilder(world: FakeWorld) {
  const filters: Array<(r: Row) => boolean> = []
  let limitN = Infinity
  let orderCol: string | null = null
  let asc = true
  let isAddressQuery = false
  const b = {
    select: () => b,
    eq: (col: string, v: unknown) => { filters.push((r) => (r as unknown as Record<string, unknown>)[col] === v); return b },
    in: (col: string, vs: unknown[]) => { filters.push((r) => vs.includes((r as unknown as Record<string, unknown>)[col])); return b },
    is: (path: string, v: null) => {
      if (v !== null) throw new Error('fake only supports is null')
      const m = /^dispatch->([^>].*)$/.exec(path)
      if (!m) throw new Error(`fake does not support is(${path})`)
      const key = m[1]
      filters.push((r) => !(r.dispatch && Object.prototype.hasOwnProperty.call(r.dispatch, key)))
      return b
    },
    lte: (path: string, v: string) => {
      // dispatch->>key: the value as text, compared as text (SQL NULL never matches).
      const m = /^dispatch->>(.+)$/.exec(path)
      if (!m) throw new Error(`fake does not support lte(${path})`)
      const key = m[1]
      filters.push((r) => {
        const d = r.dispatch
        if (!d || !Object.prototype.hasOwnProperty.call(d, key) || d[key] === null) return false
        return String(d[key]) <= v
      })
      return b
    },
    ilike: (col: string, pattern: string) => {
      if (col !== 'email') throw new Error('fake only supports ilike on email')
      isAddressQuery = true
      // A % or _ the caller left unescaped would be a bug in the caller.
      if (/[%_]/.test(pattern.replace(/\\[\\%_]/g, ''))) throw new Error('unescaped wildcard in ilike')
      const re = likeToRegExp(pattern)
      filters.push((r) => re.test(r.email ?? ''))
      return b
    },
    order: (col: string, o?: { ascending?: boolean }) => { orderCol = col; asc = o?.ascending ?? true; return b },
    limit: (n: number) => { limitN = n; return b },
    then: (resolve: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) => {
      if (isAddressQuery) world.beforeAddressQuery?.()
      if (isAddressQuery ? world.fail.addressQuery : world.fail.candidateQuery) {
        return Promise.resolve(resolve({ data: null, error: { message: 'boom' } }))
      }
      let out = world.rows.filter((r) => filters.every((f) => f(r)))
      if (orderCol) {
        const c = orderCol
        out = [...out].sort((x, y) => {
          const a = String((x as unknown as Record<string, unknown>)[c] ?? '')
          const bb = String((y as unknown as Record<string, unknown>)[c] ?? '')
          return asc ? a.localeCompare(bb) : bb.localeCompare(a)
        })
      }
      // Rows go out as copies, like JSON over the wire.
      return Promise.resolve(resolve({ data: JSON.parse(JSON.stringify(out.slice(0, limitN))), error: null }))
    },
  }
  return b
}

export function fakeSupabase(world: FakeWorld): SupabaseClient {
  const client = {
    from: (table: string) => {
      if (table !== 'bookings') throw new Error(`unexpected table ${table}`)
      return {
        select: () => selectBuilder(world),
        update: () => { throw new Error('the sync must never update bookings directly') },
        insert: () => { throw new Error('the sync must never insert') },
        delete: () => { throw new Error('the sync must never delete') },
        upsert: () => { throw new Error('the sync must never upsert') },
      }
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      world.log.push({ kind: 'rpc', name, args })
      if (name !== 'merge_dispatch') throw new Error(`unexpected rpc ${name}`)
      if (world.fail.rpc) return { data: null, error: { message: 'rpc down' } }
      const row = world.rows.find((r) => r.id === args.p_booking_id)
      if (!row) return { data: [], error: null }
      const only = args.p_only_if_absent as string | null | undefined
      if (only && row.dispatch && Object.prototype.hasOwnProperty.call(row.dispatch, only)) return { data: [], error: null }
      const kept = { ...(row.dispatch ?? {}) }
      for (const k of (args.p_remove as string[] | null | undefined) ?? []) delete kept[k]
      row.dispatch = { ...kept, ...(args.p_patch as Record<string, unknown>) }
      return { data: [row.dispatch], error: null }
    },
  }
  return client as unknown as SupabaseClient
}

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export function fakeFetch(world: FakeWorld): typeof fetch {
  let nextHubspotId = 1000
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    world.log.push({ kind: 'fetch', method, url, body })
    const u = new URL(url)

    if (world.fail.hang?.(method, url)) {
      // Like a real fetch on a dead socket: nothing until the signal aborts.
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal
        if (!signal) return
        if (signal.aborted) reject(signal.reason)
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    }

    if (u.host === 'api.hubapi.com') {
      const m = /^\/crm\/v3\/objects\/contacts(?:\/([^/]+))?$/.exec(u.pathname)
      if (!m) return json(404, { message: 'no route' })
      const ref = m[1] ? decodeURIComponent(m[1]) : null
      const byEmail = u.searchParams.get('idProperty') === 'email'
      const find = () => {
        if (!ref) return null
        if (byEmail) return world.hubspot.get(ref.toLowerCase()) ?? null
        return Array.from(world.hubspot.values()).find((c) => c.id === ref) ?? null
      }
      if (method === 'GET') {
        if (world.fail.hubspotGet) return json(world.fail.hubspotGet, { message: 'hubspot down' })
        const c = find()
        return c ? json(200, { id: c.id, properties: { lifecyclestage: c.lifecyclestage } }) : json(404, { message: 'not found' })
      }
      if (method === 'PATCH') {
        if (world.fail.hubspotWrite) return json(world.fail.hubspotWrite, { message: 'nope' })
        const c = find()
        if (!c) return json(404, { message: 'not found' })
        const props = (body as { properties: Record<string, string> }).properties
        Object.assign(c.properties, props)
        if (props.lifecyclestage) c.lifecyclestage = props.lifecyclestage
        return json(200, { id: c.id, properties: props })
      }
      if (method === 'POST' && !ref) {
        if (world.fail.hubspotWrite) return json(world.fail.hubspotWrite, { message: 'nope' })
        if (world.fail.hubspotCreateConflictId) {
          return json(409, { status: 'error', message: `Contact already exists. Existing ID: ${world.fail.hubspotCreateConflictId}`, category: 'CONFLICT' })
        }
        const props = (body as { properties: Record<string, string> }).properties
        const email = props.email.toLowerCase()
        if (world.hubspot.has(email)) return json(409, { message: `Contact already exists. Existing ID: ${world.hubspot.get(email)!.id}` })
        const c = { id: String(nextHubspotId++), lifecyclestage: props.lifecyclestage ?? null, properties: { ...props } }
        world.hubspot.set(email, c)
        return json(201, { id: c.id, properties: props })
      }
      return json(405, { message: 'method' })
    }

    if (u.host === 'api.resend.com') {
      const contact = /^\/contacts\/([^/]+)$/.exec(u.pathname)
      if (contact && method === 'GET') {
        if (world.fail.resendGet) return json(world.fail.resendGet, { message: 'resend down' })
        const email = decodeURIComponent(contact[1]).toLowerCase()
        return world.resendContacts.has(email)
          ? json(200, { object: 'contact', id: 'c1', email, unsubscribed: false })
          : json(404, { statusCode: 404, message: 'Contact not found', name: 'not_found' })
      }
      if (u.pathname === '/events/send' && method === 'POST') {
        if (world.fail.resendEvent) return json(world.fail.resendEvent, { message: 'rate limited' })
        return json(202, { object: 'event', event: (body as { event: string }).event })
      }
      return json(404, { message: 'no route' })
    }

    throw new Error(`unexpected fetch ${method} ${url}`)
  }) as typeof fetch
}

/** External calls that are not reads. */
export function writes(world: FakeWorld) {
  return world.log.filter((e) => (e.kind === 'fetch' && e.method !== 'GET') || e.kind === 'rpc')
}

export function fetches(world: FakeWorld, host?: string) {
  return world.log.filter((e): e is Extract<FakeWorld['log'][number], { kind: 'fetch' }> => e.kind === 'fetch' && (!host || e.url.includes(host)))
}

type RpcEntry = Extract<FakeWorld['log'][number], { kind: 'rpc' }>
const patchOf = (e: RpcEntry) => (e.args.p_patch ?? {}) as Record<string, unknown>

/** merge_dispatch calls that record a sync (a stamp), in order. */
export function stamps(world: FakeWorld) {
  return world.log.filter((e): e is RpcEntry => e.kind === 'rpc' && (CRM_PAID_KEY in patchOf(e) || CRM_REFUND_KEY in patchOf(e)))
}

/** merge_dispatch calls that record a failed attempt and when to retry it. */
export function failureMarks(world: FakeWorld) {
  return world.log.filter((e): e is RpcEntry => e.kind === 'rpc' && CRM_RETRY_AT_KEY in patchOf(e))
}

/** Calls to HubSpot or Resend that are not reads. */
export function externalWrites(world: FakeWorld) {
  return world.log.filter((e) => e.kind === 'fetch' && e.method !== 'GET')
}
