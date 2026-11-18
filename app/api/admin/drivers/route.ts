import { NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { DRIVER_COLS, parseDriverFields } from '@/lib/drivers'

/**
 * The saved drivers (table `drivers`, migration 041). Admins only, checked
 * before the service-role client is touched, as every admin desk.
 *
 *   GET                                   every driver, working ones first
 *   POST  { name, whatsapp, vehicle, colour, plate, email? }   add one
 *   PATCH { id, ...the same fields }      change one
 *   PATCH { id, action: 'retire' | 'restore' }
 *
 * A change here never rewrites a booking: a booking keeps the details it was
 * given (its own driver_* columns), so what a guest was told stays on record.
 * Two working drivers may not share a name (payouts and the console know a
 * booking's driver by name); the database's unique index backs that up.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Postgres unique_violation: another working driver already has the name. */
const DUPLICATE = '23505'

async function requireAdmin() {
  const session = createServerSupabase()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { svc }
}

const nameTaken = (name: string) => `${name} is already on the list. Edit that driver instead, or retire them first.`

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { data, error } = await gate.svc!.from('drivers').select(DRIVER_COLS).order('active', { ascending: false }).order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ drivers: data ?? [] })
}

export async function POST(req: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const parsed = parseDriverFields(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error, field: parsed.field }, { status: 400 })
  const { data, error } = await gate.svc!.from('drivers').insert({ ...parsed.fields, active: true }).select(DRIVER_COLS).single()
  if (error) {
    if (error.code === DUPLICATE) return NextResponse.json({ error: nameTaken(parsed.fields.name), field: 'name' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ driver: data })
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!UUID.test(id)) return NextResponse.json({ error: 'bad driver id' }, { status: 400 })

  let update: Record<string, unknown>
  if (body?.action === 'retire' || body?.action === 'restore') {
    update = { active: body.action === 'restore' }
  } else {
    const parsed = parseDriverFields(body!)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error, field: parsed.field }, { status: 400 })
    update = { ...parsed.fields }
  }
  update.updated_at = new Date().toISOString()

  const { data, error } = await gate.svc!.from('drivers').update(update).eq('id', id).select(DRIVER_COLS).maybeSingle()
  if (error) {
    if (error.code === DUPLICATE) return NextResponse.json({ error: 'Another working driver already has that name.', field: 'name' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Driver not found.' }, { status: 404 })
  return NextResponse.json({ driver: data })
}
