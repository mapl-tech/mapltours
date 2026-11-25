/**
 * An in-memory stand-in for the service client, enough for the travel party
 * modules: select / eq / is / order / maybeSingle, update, insert-free, and
 * booking_party_add with migration 042's rules (the SQL itself is checked in
 * PGlite). Rows are plain objects; updates are recorded.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>

export function fakeDb(init: { bookings?: Row[]; party?: Row[] } = {}) {
  const db = {
    bookings: init.bookings ?? [],
    party: init.party ?? [],
    rpc: [] as Array<{ fn: string; args: Row }>,
    updates: [] as Array<{ table: string; patch: Row; matched: number }>,
    failRead: null as string | null,
  }
  let seq = 0
  const svc = {
    from(table: string) {
      const rows = table === 'bookings' ? db.bookings : table === 'booking_party' ? db.party : null
      if (!rows) throw new Error(`unexpected table ${table}`)
      const filters: Array<(r: Row) => boolean> = []
      let patch: Row | null = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: () => q,
        eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return q },
        is: (col: string, val: unknown) => { filters.push((r) => (r[col] ?? null) === val); return q },
        order: () => q,
        update: (p: Row) => { patch = p; return q },
        maybeSingle: async () => {
          if (db.failRead) return { data: null, error: { message: db.failRead } }
          const m = rows.filter((r) => filters.every((f) => f(r)))
          return { data: m[0] ? structuredClone(m[0]) : null, error: null }
        },
        then(resolve: (v: unknown) => void) {
          if (db.failRead && !patch) return resolve({ data: null, error: { message: db.failRead } })
          const m = rows.filter((r) => filters.every((f) => f(r)))
          if (patch) {
            for (const r of m) Object.assign(r, patch)
            db.updates.push({ table, patch, matched: m.length })
            return resolve({ data: null, error: null })
          }
          return resolve({ data: m.map((r) => structuredClone(r)), error: null })
        },
      }
      return q
    },
    rpc: async (fn: string, args: Row) => {
      db.rpc.push({ fn, args })
      if (fn !== 'booking_party_add') throw new Error(`unexpected rpc ${fn}`)
      const email = String(args.p_email ?? '').trim().toLowerCase()
      const b = db.bookings.find((x) => x.id === args.p_booking_id)
      if (!b || b.status !== 'paid') return { data: { result: 'not_paid' }, error: null }
      if (String(b.email ?? '').trim().toLowerCase() === email) return { data: { result: 'own' }, error: null }
      const cap = Math.max(1, Math.min(Number(args.p_cap ?? 1), 12))
      const row = db.party.find((r) => r.booking_id === b.id && r.email === email)
      if (row?.stopped_at) return { data: { result: 'stopped' }, error: null }
      if (row && !row.removed_at) return { data: { result: 'exists', id: row.id }, error: null }
      const active = db.party.filter((r) => r.booking_id === b.id && !r.removed_at && !r.stopped_at).length
      if (active >= cap) return { data: { result: 'full', cap }, error: null }
      if (row) { row.removed_at = null; return { data: { result: 'added', id: row.id }, error: null } }
      const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
      db.party.push({ id, booking_id: b.id, email, added_at: new Date().toISOString(), removed_at: null, stopped_at: null, confirmation_sent_at: null })
      return { data: { result: 'added', id }, error: null }
    },
  }
  return { db, svc }
}

export const BOOKING_ID = 'abcd1234-6c73-444e-83c6-1f79f15a59d1'

export function rideBooking(over: Row = {}): Row {
  return {
    id: BOOKING_ID,
    status: 'paid',
    booking_type: 'transfer',
    email: 'ana@example.com',
    user_id: null,
    first_name: 'Ana Maria',
    pickup: null,
    total_paid: 194,
    phone: '+1 555 0100',
    booking_items: [{
      item_type: 'transfer', title: 'Airport transfer', destination: 'Negril', date: '2026-11-25', travelers: 3,
      hotel: 'Riu Negril', trip_type: 'round_trip', passengers: 3,
      arrival_at: '2026-11-25T15:09:00+00:00', arrival_flight: 'aa1311', departure_at: '2026-12-02T09:30:00+00:00', departure_flight: 'aa922',
    }],
    ...over,
  }
}

export function member(n: number, over: Row = {}): Row {
  return {
    id: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`,
    booking_id: BOOKING_ID,
    email: `friend${n}@example.com`,
    added_at: `2026-11-24T10:0${n}:00Z`,
    removed_at: null,
    stopped_at: null,
    confirmation_sent_at: null,
    ...over,
  }
}
