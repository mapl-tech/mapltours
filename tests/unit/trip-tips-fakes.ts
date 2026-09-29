/**
 * Fakes for the trip tips job: an in-memory `bookings` table (with nested
 * booking_items) and `trip_tips_log` ledger behind PostgREST-shaped builders,
 * and a fetch that plays Resend (segment, contacts, emails) and HubSpot
 * (batch read). Every call and write is recorded in order. Synthetic data
 * only: no real guest, booking or address.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TipBooking } from '@/lib/trip-tips/plan'

export interface LedgerRecord {
  id: string
  email: string
  tip_key: string
  track: string
  booking_id: string | null
  status: string
  resend_id: string | null
  created_at: string
  sent_at: string | null
}

export type Logged =
  | { kind: 'fetch'; method: string; url: string; body: unknown; headers: Record<string, string> }
  | { kind: 'db'; table: string; op: 'select' | 'insert' | 'update' | 'delete'; detail: unknown }

export interface TipsWorld {
  now: number
  segment: Array<{ id: string; email: string; unsubscribed: boolean }>
  /** Resend contacts by lower-cased email; absent = 404. */
  contacts: Map<string, { unsubscribed: boolean }>
  /** HubSpot contacts by lower-cased email. */
  hubspot: Map<string, { mapl_tips?: string; mapl_tips_at?: string }>
  bookings: TipBooking[]
  ledger: LedgerRecord[]
  log: Logged[]
  /** Answers for POST /emails, used in order; afterwards 200. status 0 = network error. */
  sendAnswers: Array<{ status: number; body?: Record<string, unknown>; retryAfter?: number }>
  fail: {
    segmentStatus?: number
    hubspotStatus?: number
    ledgerRead?: boolean
    /** Booking reads for these addresses fail. */
    bookingReadFor?: string[]
    claimError?: boolean
    markError?: boolean
    contactStatus?: number
  }
  /** Contacts per segment page (the job asks for 100). */
  pageSize: number
  /** Runs just before a claim insert (another run landing first). */
  beforeClaim?: (row: Record<string, unknown>) => void
  sent: number
}

export function makeTipsWorld(now: number): TipsWorld {
  return {
    now,
    segment: [],
    contacts: new Map(),
    hubspot: new Map(),
    bookings: [],
    ledger: [],
    log: [],
    sendAnswers: [],
    fail: {},
    pageSize: 100,
    sent: 0,
  }
}

/** A subscriber: on the segment, a subscribed Resend contact, HubSpot yes since `joinedAt`. */
export function subscribe(w: TipsWorld, email: string, joinedAt: string): void {
  w.segment.push({ id: `c_${w.segment.length + 1}`, email, unsubscribed: false })
  w.contacts.set(email.toLowerCase(), { unsubscribed: false })
  w.hubspot.set(email.toLowerCase(), { mapl_tips: 'yes', mapl_tips_at: joinedAt })
}

let ids = 0
const uuid = () => {
  ids += 1
  return `00000000-0000-4000-8000-${String(ids).padStart(12, '0')}`
}

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

type Res = { data: unknown; error: { message: string; code?: string } | null }
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

function bookingsSelect(w: TipsWorld) {
  const filters: Array<(b: TipBooking) => boolean> = []
  let pattern = ''
  let limitN = Infinity
  const b = {
    ilike: (col: string, value: string) => {
      if (col !== 'email') throw new Error('fake only supports ilike on email')
      if (/[%_]/.test(value.replace(/\\[\\%_]/g, ''))) throw new Error('unescaped wildcard in ilike')
      pattern = value
      const re = likeToRegExp(value)
      filters.push((r) => re.test(r.email ?? ''))
      return b
    },
    in: (col: string, vs: unknown[]) => {
      filters.push((r) => vs.includes((r as unknown as Record<string, unknown>)[col]))
      return b
    },
    limit: (n: number) => { limitN = n; return b },
    then: (resolve: (v: Res) => unknown) => {
      w.log.push({ kind: 'db', table: 'bookings', op: 'select', detail: { pattern } })
      if (w.fail.bookingReadFor?.some((e) => likeToRegExp(pattern).test(e))) {
        return Promise.resolve(resolve({ data: null, error: { message: 'boom' } }))
      }
      return Promise.resolve(resolve({ data: copy(w.bookings.filter((r) => filters.every((f) => f(r))).slice(0, limitN)), error: null }))
    },
  }
  return b
}

function ledgerTable(w: TipsWorld) {
  const where = () => {
    const conds: Array<[string, unknown]> = []
    return {
      conds,
      match: (r: LedgerRecord) => conds.every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
    }
  }
  return {
    select: () => {
      const q = { emails: [] as string[] }
      const b = {
        in: (col: string, vs: string[]) => { if (col !== 'email') throw new Error('ledger select by email only'); q.emails = vs; return b },
        then: (resolve: (v: Res) => unknown) => {
          w.log.push({ kind: 'db', table: 'trip_tips_log', op: 'select', detail: { n: q.emails.length } })
          if (w.fail.ledgerRead) return Promise.resolve(resolve({ data: null, error: { message: 'no table' } }))
          return Promise.resolve(resolve({ data: copy(w.ledger.filter((r) => q.emails.includes(r.email))), error: null }))
        },
      }
      return b
    },
    insert: (row: Record<string, unknown>) => ({
      select: () => ({
        single: async (): Promise<Res> => {
          w.log.push({ kind: 'db', table: 'trip_tips_log', op: 'insert', detail: copy(row) })
          w.beforeClaim?.(row)
          if (w.fail.claimError) return { data: null, error: { message: 'down', code: '08006' } }
          if (w.ledger.some((r) => r.email === row.email && r.tip_key === row.tip_key)) {
            return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } }
          }
          const rec: LedgerRecord = {
            id: uuid(),
            email: String(row.email),
            tip_key: String(row.tip_key),
            track: String(row.track),
            booking_id: (row.booking_id as string | null) ?? null,
            status: String(row.status),
            resend_id: null,
            created_at: new Date(w.now).toISOString(),
            sent_at: null,
          }
          w.ledger.push(rec)
          return { data: { id: rec.id }, error: null }
        },
      }),
    }),
    update: (patch: Record<string, unknown>) => {
      const q = where()
      const b = {
        eq: (k: string, v: unknown) => { q.conds.push([k, v]); return b },
        then: (resolve: (v: Res) => unknown) => {
          w.log.push({ kind: 'db', table: 'trip_tips_log', op: 'update', detail: { patch: copy(patch), where: q.conds } })
          if (w.fail.markError && patch.status === 'sent') return Promise.resolve(resolve({ data: null, error: { message: 'down' } }))
          for (const r of w.ledger) if (q.match(r)) Object.assign(r, patch)
          return Promise.resolve(resolve({ data: null, error: null }))
        },
      }
      return b
    },
    delete: () => {
      const q = where()
      const b = {
        eq: (k: string, v: unknown) => { q.conds.push([k, v]); return b },
        then: (resolve: (v: Res) => unknown) => {
          w.log.push({ kind: 'db', table: 'trip_tips_log', op: 'delete', detail: { where: q.conds } })
          w.ledger = w.ledger.filter((r) => !q.match(r))
          return Promise.resolve(resolve({ data: null, error: null }))
        },
      }
      return b
    },
  }
}

export function fakeTipsSupabase(w: TipsWorld): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === 'bookings') {
        return {
          select: () => bookingsSelect(w),
          insert: () => { throw new Error('the job must never write bookings') },
          update: () => { throw new Error('the job must never write bookings') },
          delete: () => { throw new Error('the job must never write bookings') },
          upsert: () => { throw new Error('the job must never write bookings') },
        }
      }
      if (table === 'trip_tips_log') return ledgerTable(w)
      throw new Error(`unexpected table ${table}`)
    },
    rpc: () => { throw new Error('the job calls no rpc') },
  } as unknown as SupabaseClient
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

export function fakeTipsFetch(w: TipsWorld): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>))
    w.log.push({ kind: 'fetch', method, url, body, headers })
    const u = new URL(url)

    if (u.host === 'api.resend.com') {
      const seg = /^\/segments\/([^/]+)\/contacts$/.exec(u.pathname)
      if (seg && method === 'GET') {
        if (w.fail.segmentStatus) return json(w.fail.segmentStatus, { message: 'nope' })
        const after = u.searchParams.get('after')
        const start = after ? w.segment.findIndex((c) => c.id === after) + 1 : 0
        const page = w.segment.slice(start, start + w.pageSize)
        return json(200, { object: 'list', has_more: start + w.pageSize < w.segment.length, data: page })
      }
      const contact = /^\/contacts\/([^/]+)$/.exec(u.pathname)
      if (contact && method === 'GET') {
        if (w.fail.contactStatus) return json(w.fail.contactStatus, { message: 'down' })
        const email = decodeURIComponent(contact[1]).toLowerCase()
        const c = w.contacts.get(email)
        return c ? json(200, { object: 'contact', id: 'c', email, unsubscribed: c.unsubscribed }) : json(404, { name: 'not_found' })
      }
      if (contact && method === 'PATCH') throw new Error('the job never changes a contact')
      if (u.pathname === '/emails' && method === 'POST') {
        const a = w.sendAnswers.shift()
        if (a?.status === 0) throw new TypeError('fetch failed')
        if (a && a.status !== 200) return json(a.status, a.body ?? { message: 'no' }, a.retryAfter ? { 'retry-after': String(a.retryAfter) } : {})
        w.sent += 1
        return json(200, a?.body ?? { id: `re_${w.sent}` })
      }
      return json(404, { message: 'no route' })
    }

    if (u.host === 'api.hubapi.com' && u.pathname === '/crm/v3/objects/contacts/batch/read' && method === 'POST') {
      if (w.fail.hubspotStatus) return json(w.fail.hubspotStatus, { message: 'hubspot down' })
      const inputs = (body as { inputs: Array<{ id: string }> }).inputs
      const results = inputs
        .map((i) => ({ email: i.id, c: w.hubspot.get(i.id.toLowerCase()) }))
        .filter((x) => x.c)
        .map((x, n) => ({ id: String(n + 1), properties: { email: x.email, ...x.c } }))
      return json(results.length === inputs.length ? 200 : 207, { status: 'COMPLETE', results })
    }

    throw new Error(`unexpected fetch ${method} ${url}`)
  }) as typeof fetch
}

export const fetchesTo = (w: TipsWorld, path: string, method?: string) =>
  w.log.filter((e): e is Extract<Logged, { kind: 'fetch' }> => e.kind === 'fetch' && e.url.includes(path) && (!method || e.method === method))

export const dbWrites = (w: TipsWorld) => w.log.filter((e) => e.kind === 'db' && e.op !== 'select')

/* ── Synthetic bookings ─────────────────────────────────────────────────── */

/** A stored leg time: the Jamaica wall clock typed at checkout, carried with a Z. */
export const wall = (local: string) => `${local}:00+00:00`

export function rideBooking(p: {
  email: string
  arrival?: string | null
  departure?: string | null
  paidAt?: string
  status?: string
  refund_state?: string | null
  hotel?: string
  zone?: string
  passengers?: number
  dispatch?: Record<string, unknown> | null
  first_name?: string | null
}): TipBooking {
  return {
    id: uuid(),
    status: p.status ?? 'paid',
    booking_type: 'transfer',
    email: p.email,
    first_name: p.first_name === undefined ? 'Ana' : p.first_name,
    paid_at: p.paidAt ?? '2026-09-01T12:00:00.000Z',
    refunded_at: p.status === 'refunded' ? '2026-09-02T12:00:00.000Z' : null,
    refund_state: p.refund_state === undefined ? 'none' : p.refund_state,
    dispatch: p.dispatch ?? null,
    booking_items: [{
      item_type: 'transfer',
      experience_id: null,
      title: 'Airport transfer',
      date: (p.arrival ?? p.departure ?? '').slice(0, 10) || null,
      travelers: 1,
      hotel: p.hotel ?? 'Sample Resort Montego Bay',
      zone: p.zone ?? 'montego-bay',
      trip_type: p.arrival && p.departure ? 'round_trip' : 'one_way',
      arrival_flight: p.arrival ? 'AA 123' : null,
      arrival_at: p.arrival ? wall(p.arrival) : null,
      departure_flight: p.departure ? 'AA 456' : null,
      departure_at: p.departure ? wall(p.departure) : null,
      passengers: p.passengers ?? 2,
    }],
  }
}

export function tourBooking(p: {
  email: string
  dates: string[]
  paidAt?: string
  status?: string
  refund_state?: string | null
  experienceId?: number
  title?: string
  travelers?: number
  dispatch?: Record<string, unknown> | null
}): TipBooking {
  return {
    id: uuid(),
    status: p.status ?? 'paid',
    booking_type: 'tour',
    email: p.email,
    first_name: 'Ana',
    paid_at: p.paidAt ?? '2026-09-01T12:00:00.000Z',
    refunded_at: p.status === 'refunded' ? '2026-09-02T12:00:00.000Z' : null,
    refund_state: p.refund_state === undefined ? 'none' : p.refund_state,
    dispatch: p.dispatch ?? null,
    booking_items: p.dates.map((date) => ({
      item_type: 'experience',
      experience_id: p.experienceId ?? 3,
      title: p.title ?? 'Sample Tour',
      date,
      travelers: p.travelers ?? 2,
    })),
  }
}
