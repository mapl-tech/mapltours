import { NextResponse } from 'next/server'
import { createElement } from 'react'
import { createServiceClient } from '@/lib/supabase/service'
import { getDriverAccess, DRIVER_ROLE_COLS } from '@/lib/driver-access-server'
import { isFleetManager, type DriverAccess } from '@/lib/driver-access'
import { parseDriverFields } from '@/lib/drivers'
import { payeeKnown } from '@/lib/dispatch-change-server'
import { commitEdit, planEdit, retireBlock } from '@/lib/driver-edit-server'
import { rateLimit } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/email/send'
import OpsAlert from '@/emails/OpsAlert'

/**
 * The saved drivers, for a fleet manager in the driver portal (Nov 24 2026:
 * "Fleet Manager: Can ... create new drivers"; Nov 25 2026: "have the fleet
 * manager be able to enter the vehicle information for drivers as well. So
 * make him able to edit driver details"). The same field rules as the admin
 * desk (lib/drivers parseDriverFields), with these limits:
 *
 *   - a driver added here is always a regular driver: only MAPL Tours
 *     Jamaica makes someone a fleet manager (/admin/drivers);
 *   - a fleet manager's WhatsApp number, vehicle, colour and plate can be
 *     changed here (their own included), never their name (the payout job
 *     pays by name) nor their sign-in email (they would lock themselves
 *     out), and a fleet manager is never retired here;
 *   - a driver with rides still ahead is not retired until each ride has
 *     another driver.
 *
 * A change of details goes through the same confirm-first steps as a ride
 * change (lib/driver-edit-server): `plan` says what saving does, including
 * every ride still ahead that carries the old details and when its guest
 * hears; `commit` saves the driver and those rides together and emails or
 * tells the office as chosen. A new name not on WISE_PAYOUT_RECIPIENTS is
 * told to the office.
 *
 *   GET                                   every driver, working ones first
 *   POST  { name, whatsapp, vehicle, colour, plate, email? }   add one
 *   PATCH { id, mode: 'plan', ...the same fields }
 *   PATCH { id, mode: 'commit', ...the same fields, planKey, notify?: 'send' | 'skip' }
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

async function tellOfficeAboutName(actorLabel: string, name: string, what: 'added' | 'restored') {
  if (payeeKnown(name) !== false) return
  const to = (process.env.OPERATIONS_EMAIL ?? 'contact@mapltours.com').split(',').map((e) => e.trim()).filter((e) => e.includes('@'))
  if (!to.length) return
  const lead = what === 'added' ? `${actorLabel} added a driver, ${name}, in the driver portal.` : `${actorLabel} brought ${name} back onto the drivers list in the driver portal.`
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
  if (!body || !UUID.test(id)) return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })

  // A change of details: reviewed first, then saved with the rides that carry them.
  if (body.action !== 'retire' && body.action !== 'restore') {
    if (body.mode !== 'plan' && body.mode !== 'commit') {
      // A page from before the review step: nothing is saved without it.
      return NextResponse.json({ ok: false, code: 'reload', message: 'This page is out of date. Reload it, then make the change again. Nothing was saved.' }, { status: 409 })
    }
    const now = Date.now()
    const answer = body.mode === 'plan'
      ? await planEdit(g.svc, 'fleet_manager', body, now)
      : await commitEdit(g.svc, { email: g.access.email, label: g.access.label }, 'fleet_manager', body, now)
    return NextResponse.json(answer.json, { status: answer.status })
  }

  const { data: current, error: readErr } = await g.svc.from('drivers').select(DRIVER_ROLE_COLS).eq('id', id).maybeSingle()
  if (readErr) return NextResponse.json({ ok: false, message: 'The driver could not be read. Try again.' }, { status: 500 })
  if (!current) return NextResponse.json({ ok: false, message: 'That driver is not on the list.' }, { status: 404 })
  if (current.role === 'fleet_manager') {
    return NextResponse.json({ ok: false, message: 'Only MAPL Tours Jamaica retires a fleet manager. Write to contact@mapltours.com.' }, { status: 403 })
  }
  if (body.action === 'retire' && current.active) {
    const blocked = await retireBlock(g.svc, current.name, Date.now())
    if (blocked) return NextResponse.json(blocked.json, { status: blocked.status })
  }

  // Only a regular driver's row, matched again in the write itself.
  const { data, error } = await g.svc.from('drivers')
    .update({ active: body.action === 'restore', updated_at: new Date().toISOString() })
    .eq('id', id).eq('role', 'driver').select(DRIVER_ROLE_COLS).maybeSingle()
  if (error) {
    if (error.code === '23505') {
      const dup = duplicateMessage(error, current.name)
      return NextResponse.json({ ok: false, message: `A working driver already has ${current.name}'s ${dup.field === 'email' ? 'email' : 'name'}.`, field: dup.field }, { status: 409 })
    }
    console.error('[driver-roster] update failed', error.message)
    return NextResponse.json({ ok: false, message: 'The change was not saved. Try again.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ ok: false, message: 'That driver is not on the list.' }, { status: 404 })
  if (body.action === 'restore') await tellOfficeAboutName(g.access.label, current.name, 'restored')
  return NextResponse.json({ ok: true, driver: data })
}
