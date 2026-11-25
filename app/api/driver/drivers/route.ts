import { NextResponse } from 'next/server'
import { createElement } from 'react'
import { createServiceClient } from '@/lib/supabase/service'
import { getDriverAccess, DRIVER_ROLE_COLS } from '@/lib/driver-access-server'
import { isFleetManager, type DriverAccess } from '@/lib/driver-access'
import { parseDriverFields } from '@/lib/drivers'
import { payeeKnown } from '@/lib/dispatch-change-server'
import { rateLimit } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/email/send'
import OpsAlert from '@/emails/OpsAlert'

/**
 * The saved drivers, for a fleet manager in the driver portal (Nov 24 2026:
 * "Fleet Manager: Can ... create new drivers"). The same rules as the admin
 * desk (lib/drivers parseDriverFields), with three limits:
 *
 *   - a driver added here is always a regular driver: only MAPL Tours
 *     Jamaica makes someone a fleet manager (/admin/drivers);
 *   - a fleet manager's own row, and any other fleet manager's, is not
 *     editable here (a rename would stop their payouts matching, a new
 *     address would lock them out);
 *   - the email is the address the driver signs in to the portal with.
 *
 * A new name, or a renamed driver, is told to the office when payouts run
 * and the name is not on WISE_PAYOUT_RECIPIENTS: the payout job pays by name.
 *
 *   GET                                   every driver, working ones first
 *   POST  { name, whatsapp, vehicle, colour, plate, email? }   add one
 *   PATCH { id, ...the same fields }      change one
 *   PATCH { id, action: 'retire' | 'restore' }
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Gate =
  | { ok: false; res: NextResponse }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { ok: true; access: DriverAccess; svc: any }

async function gate(req: Request): Promise<Gate> {
  const g = await getDriverAccess()
  if (!g.ok) {
    const status = g.denied === 'not_signed_in' ? 401 : g.denied === 'unavailable' ? 503 : 403
    return { ok: false, res: NextResponse.json({ ok: false, message: status === 503 ? 'Your access could not be checked. Try again.' : 'Only a fleet manager can manage drivers.' }, { status }) }
  }
  if (!isFleetManager(g.access)) return { ok: false, res: NextResponse.json({ ok: false, message: 'Only a fleet manager can manage drivers.' }, { status: 403 }) }
  if (req.method !== 'GET' && rateLimit(`user:${g.userId}`, { bucket: 'driver-roster', max: 30, windowMs: 60_000 })) {
    return { ok: false, res: NextResponse.json({ ok: false, message: 'Too many changes at once. Wait a minute and try again.' }, { status: 429 }) }
  }
  return { ok: true, access: g.access, svc: createServiceClient() }
}

/** Which unique rule a Postgres 23505 broke: the working name, or the sign-in address. */
function duplicateMessage(err: { message?: string; details?: string } | null, name: string): { message: string; field: 'name' | 'email' } {
  const text = `${err?.message ?? ''} ${err?.details ?? ''}`
  if (/email/i.test(text)) return { field: 'email', message: 'Another working driver already signs in with that email.' }
  return { field: 'name', message: `${name} is already on the list. Edit that driver instead, or retire them first.` }
}

async function tellOfficeAboutName(actorLabel: string, name: string, what: 'added' | 'renamed', oldName?: string) {
  if (payeeKnown(name) !== false) return
  const to = (process.env.OPERATIONS_EMAIL ?? 'contact@mapltours.com').split(',').map((e) => e.trim()).filter((e) => e.includes('@'))
  if (!to.length) return
  const lead = what === 'added' ? `${actorLabel} added a driver, ${name}, in the driver portal.` : `${actorLabel} renamed ${oldName} to ${name} in the driver portal.`
  try {
    await sendEmail({
      to,
      subject: `Driver not set up for payment: ${name}`,
      react: createElement(OpsAlert, {
        title: `${name} is not set up for payment`,
        body: `${lead} The payout job pays rides by the driver's name, and ${name} is not on WISE_PAYOUT_RECIPIENTS, so any ride ${name} drives is held, not paid, until the name is added on Netlify (with Collin's recipient id, if Collin is paid for this driver) and the site is redeployed.`,
        lines: [`Driver: ${name}`, `By: ${actorLabel}`, 'Drivers: https://mapltours.com/admin/drivers'],
      }),
      tags: [{ name: 'type', value: 'driver_roster' }],
      dedupe: `driver-roster/${what}/${name.toLowerCase()}`,
      timeoutMs: 3000,
    })
  } catch (e) {
    console.error('[driver-roster] office alert did not send', e instanceof Error ? e.message : String(e))
  }
}

export async function GET(req: Request) {
  const g = await gate(req)
  if (!g.ok) return g.res
  const { data, error } = await g.svc.from('drivers').select(DRIVER_ROLE_COLS).order('active', { ascending: false }).order('name', { ascending: true })
  if (error) return NextResponse.json({ ok: false, message: 'The drivers could not be read. Try again.' }, { status: 500 })
  return NextResponse.json({ ok: true, drivers: data ?? [] })
}

export async function POST(req: Request) {
  const g = await gate(req)
  if (!g.ok) return g.res
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
  const parsed = parseDriverFields(body)
  if (!parsed.ok) return NextResponse.json({ ok: false, message: parsed.error, field: parsed.field }, { status: 400 })
  const { data, error } = await g.svc.from('drivers').insert({ ...parsed.fields, role: 'driver', active: true }).select(DRIVER_ROLE_COLS).single()
  if (error) {
    if (error.code === '23505') {
      const dup = duplicateMessage(error, parsed.fields.name)
      return NextResponse.json({ ok: false, message: dup.message, field: dup.field }, { status: 409 })
    }
    console.error('[driver-roster] insert failed', error.message)
    return NextResponse.json({ ok: false, message: 'The driver was not saved. Try again.' }, { status: 500 })
  }
  await tellOfficeAboutName(g.access.label, parsed.fields.name, 'added')
  return NextResponse.json({ ok: true, driver: data })
}

export async function PATCH(req: Request) {
  const g = await gate(req)
  if (!g.ok) return g.res
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!UUID.test(id)) return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })

  const { data: current, error: readErr } = await g.svc.from('drivers').select(DRIVER_ROLE_COLS).eq('id', id).maybeSingle()
  if (readErr) return NextResponse.json({ ok: false, message: 'The driver could not be read. Try again.' }, { status: 500 })
  if (!current) return NextResponse.json({ ok: false, message: 'That driver is not on the list.' }, { status: 404 })
  if (current.role === 'fleet_manager') {
    return NextResponse.json({ ok: false, message: 'A fleet manager is changed by MAPL Tours Jamaica. Write to contact@mapltours.com.' }, { status: 403 })
  }

  let update: Record<string, unknown>
  if (body?.action === 'retire' || body?.action === 'restore') {
    update = { active: body.action === 'restore' }
  } else {
    const parsed = parseDriverFields(body!)
    if (!parsed.ok) return NextResponse.json({ ok: false, message: parsed.error, field: parsed.field }, { status: 400 })
    update = { ...parsed.fields }
  }
  update.updated_at = new Date().toISOString()

  // Only a regular driver's row, matched again in the write itself.
  const { data, error } = await g.svc.from('drivers').update(update).eq('id', id).eq('role', 'driver').select(DRIVER_ROLE_COLS).maybeSingle()
  if (error) {
    if (error.code === '23505') {
      const dup = duplicateMessage(error, String(update.name ?? current.name))
      return NextResponse.json({ ok: false, message: body?.action === 'restore' ? `A working driver already has ${current.name}'s ${dup.field === 'email' ? 'email' : 'name'}.` : dup.message, field: dup.field }, { status: 409 })
    }
    console.error('[driver-roster] update failed', error.message)
    return NextResponse.json({ ok: false, message: 'The change was not saved. Try again.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ ok: false, message: 'That driver is not on the list.' }, { status: 404 })
  if (typeof update.name === 'string' && update.name !== current.name) await tellOfficeAboutName(g.access.label, update.name, 'renamed', current.name)
  if (body?.action === 'restore') await tellOfficeAboutName(g.access.label, current.name, 'added')
  return NextResponse.json({ ok: true, driver: data })
}
