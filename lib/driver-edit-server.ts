import 'server-only'
import { bookingRef, legInstantMs, type Bk } from '@/lib/dispatch'
import { jaDateKey, stampKey } from '@/lib/dayof-rules'
import { transferLegWindow } from '@/lib/driver'
import { parseDriverFields, type DriverFields } from '@/lib/drivers'
import { guestSendProblem, legAt, legsOf, type Leg } from '@/lib/driver-update'
import { sendDriverUpdate } from '@/lib/driver-update-send'
import { bookingAfter, legIsAhead, planChange, type ChangePlan } from '@/lib/dispatch-change'
import { nameKey } from '@/lib/driver-access'
import { escapeLikePattern } from '@/lib/pg-like'
import { guestNames } from '@/lib/dispatch-change-words'
import { DRIVER_ROLE_COLS } from '@/lib/driver-access-server'
import { BOOKING_COLS, PENDING, payeeKnown, recordOutcome, tellOffice, type Answer } from '@/lib/dispatch-change-server'
import { bookingAhead, carries, changedFields, columnsOf, lockedFields, roleOf, touchesGuests, type DriverRole, type EditField, type Editor, type SavedDriver } from '@/lib/driver-edit'
import { editWords, type EditWords } from '@/lib/driver-edit-words'
import type { GuestOutcome } from '@/lib/dispatch-change-words'

/**
 * Changing a saved driver's details (Nov 25 2026), for the driver portal's
 * Drivers tab (a fleet manager) and the admin Drivers page alike. The rules
 * are in lib/driver-edit, the words in lib/driver-edit-words.
 *
 *   plan    what saving would change: the details, and every ride still
 *           ahead that carries the old ones, each with when its guest hears;
 *           writes nothing
 *   commit  saves the driver and moves those rides in one transaction
 *           (apply_driver_edit, migration 044), then emails the guests who
 *           already had the old details, or tells the office, as chosen
 *
 * The same guarantees as a ride change (lib/dispatch-change-server): saved
 * only as confirmed (a plan key), refused if the driver changed meanwhile,
 * the email checked before anything is saved, an open outcome swept to the
 * office. No money column, status, Stripe call or webhook is touched; the
 * payout job pays by name, so a new name it cannot pay is told to the office.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = any

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INNER_COLS = BOOKING_COLS.replace('booking_items(*)', 'booking_items!inner(*)')
const LIMIT = 300

/**
 * The paid rides and tours still ahead that name this driver (by name, in any
 * case, as the portal and the payouts match it), split into those carrying
 * exactly these details, which an edit moves, and the rest, left alone.
 */
export async function upcomingFor(svc: Svc, cols: ReturnType<typeof columnsOf>, nowMs: number): Promise<{ rows: Bk[]; others: Bk[]; error?: string }> {
  const { orFilter } = transferLegWindow(nowMs, { backDays: 1 })
  const like = `%${escapeLikePattern(cols.driver_name.trim())}%`
  const [rides, tours] = await Promise.all([
    svc.from('bookings').select(INNER_COLS).eq('status', 'paid').eq('booking_type', 'transfer').ilike('driver_name', like)
      .or(orFilter, { referencedTable: 'booking_items' }).order('created_at', { ascending: true }).limit(LIMIT),
    svc.from('bookings').select(INNER_COLS).eq('status', 'paid').eq('booking_type', 'tour').ilike('driver_name', like)
      .gte('booking_items.date', jaDateKey(nowMs)).order('created_at', { ascending: true }).limit(LIMIT),
  ])
  if (rides.error || tours.error) return { rows: [], others: [], error: (rides.error ?? tours.error).message }
  const ahead = ([...(rides.data ?? []), ...(tours.data ?? [])] as Bk[])
    .filter((b) => nameKey(b.driver_name) === nameKey(cols.driver_name) && bookingAhead(b, nowMs))
  return { rows: ahead.filter((b) => carries(b, cols)), others: ahead.filter((b) => !carries(b, cols)) }
}

/**
 * Retiring a driver who still has rides ahead is refused (Nov 25 2026): the
 * rides would keep a driver who can no longer sign in, be offered or be
 * emailed about. Null when the driver may be retired.
 */
export async function retireBlock(svc: Svc, name: string, nowMs: number): Promise<Answer | null> {
  const { rows, others, error } = await upcomingFor(svc, { driver_name: name, driver_phone: '', driver_vehicle: '', driver_plate: '' }, nowMs)
  if (error) return { status: 500, json: { ok: false, message: `${name}'s rides could not be checked, so nothing was changed. Try again.` } }
  // Soonest first: the ride to hand over next leads the list.
  const all = [...rows, ...others].sort((x, y) => firstAheadMs(x, nowMs) - firstAheadMs(y, nowMs))
  if (!all.length) return null
  const first = name.trim().split(/\s+/)[0]
  const rides = all.map((b) => ({ bookingId: b.id, ref: bookingRef(b.id), guest: guestNames(b.first_name).Who, when: firstDayWords(b, nowMs) }))
  const n = rides.length
  return {
    status: 409,
    json: {
      ok: false,
      code: 'has_rides',
      rides,
      message: `${first} still has ${n === 1 ? '1 ride' : `${n} rides`} ahead. Give ${n === 1 ? 'it' : 'each one'} to another driver first, then retire ${first}.`,
    },
  }
}

/** When a booking's next ride or tour day is, for ordering (a tour day reads as its noon). */
function firstAheadMs(b: Bk, nowMs: number): number {
  const today = jaDateKey(nowMs)
  const times = b.booking_type === 'transfer'
    ? legsOf(b).map((leg) => ({ leg, at: legAt(b, leg) })).filter((x): x is { leg: Leg; at: string } => !!x.at && legIsAhead(x.at, x.leg, nowMs)).map((x) => legInstantMs(x.at))
    : ((b.booking_items ?? []) as { date?: string | null }[]).map((i) => String(i.date ?? '').slice(0, 10)).filter((d) => !!d && d >= today).map((d) => Date.parse(`${d}T17:00:00Z`))
  return times.length ? Math.min(...times) : Number.MAX_SAFE_INTEGER
}

/** "Fri, Dec 12": the first day a booking still has ahead (Jamaica calendar), for a list. */
function firstDayWords(b: Bk, nowMs: number): string | null {
  const today = jaDateKey(nowMs)
  const days = b.booking_type === 'transfer'
    ? legsOf(b).map((leg) => ({ leg, at: legAt(b, leg) })).filter((x): x is { leg: Leg; at: string } => !!x.at && legIsAhead(x.at, x.leg, nowMs)).map((x) => x.at.slice(0, 10))
    : ((b.booking_items ?? []) as { date?: string | null }[]).map((i) => String(i.date ?? '').slice(0, 10)).filter((d) => !!d && d >= today)
  const day = days.sort()[0]
  return day ? new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }) : null
}

export interface PreparedEdit {
  row: SavedDriver
  after: DriverFields
  role: { from: DriverRole; to: DriverRole } | undefined
  changed: EditField[]
  colsBefore: ReturnType<typeof columnsOf>
  colsAfter: ReturnType<typeof columnsOf>
  rides: { b: Bk; plan: ChangePlan }[]
  other: number
  payeeUnset: boolean
  words: EditWords
  key: string
}

const isAnswer = (x: PreparedEdit | Answer): x is Answer => 'status' in x && 'json' in x

async function prepareEdit(svc: Svc, editor: Editor, body: Record<string, unknown>, nowMs: number): Promise<PreparedEdit | Answer> {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!UUID.test(id)) return { status: 400, json: { ok: false, message: 'Invalid request.' } }
  const { data: row, error } = await svc.from('drivers').select(DRIVER_ROLE_COLS).eq('id', id).maybeSingle()
  if (error) return { status: 500, json: { ok: false, message: 'The driver could not be read. Try again.' } }
  if (!row) return { status: 404, json: { ok: false, message: 'That driver is not on the list.' } }
  if (!row.active) return { status: 409, json: { ok: false, message: `${row.name} is retired. Bring ${row.name} back first.` } }

  const parsed = parseDriverFields(body)
  if (!parsed.ok) return { status: 400, json: { ok: false, message: parsed.error, field: parsed.field } }
  // A locked field (a fleet manager's name and sign-in email, for a fleet
  // manager) must come back as it is, compared loosely, and is then kept
  // exactly as saved, so tidying never shows as a change.
  const locked = lockedFields(row, editor)
  const loose = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  for (const k of locked) {
    if (loose(parsed.fields[k]) !== loose(row[k])) {
      return { status: 403, json: { ok: false, field: k, message: "Only MAPL Tours Jamaica changes a fleet manager's name or sign-in email. Write to contact@mapltours.com." } }
    }
  }
  const after: DriverFields = { ...parsed.fields }
  for (const k of locked) (after as Record<string, string | null>)[k] = (row[k] as string | null) ?? null
  let role: PreparedEdit['role']
  if (body.role !== undefined && body.role !== null) {
    if (editor !== 'admin') return { status: 403, json: { ok: false, field: 'role', message: 'Only MAPL Tours Jamaica changes a role.' } }
    if (body.role !== 'driver' && body.role !== 'fleet_manager') return { status: 400, json: { ok: false, field: 'role', message: 'Choose a role: driver or fleet manager.' } }
    if (body.role !== roleOf(row.role)) role = { from: roleOf(row.role), to: body.role }
  }
  const changed = changedFields(row, after)
  if (!changed.length && !role) return { status: 409, json: { ok: false, message: 'Nothing has changed.' } }

  const colsBefore = columnsOf(row)
  const colsAfter = columnsOf(after)
  let rows: Bk[] = []
  let other = 0
  if (touchesGuests(changed)) {
    const up = await upcomingFor(svc, colsBefore, nowMs)
    if (up.error) return { status: 500, json: { ok: false, message: "The driver's rides could not be read. Nothing was changed. Try again." } }
    rows = up.rows
    other = up.others.length
  }
  // Soonest first: the ride the guest takes next leads the list.
  const rides = [...rows].sort((x, y) => firstAheadMs(x, nowMs) - firstAheadMs(y, nowMs))
    .map((b) => ({ b, plan: planChange(b, { kind: 'driver', after: { ...colsAfter } }, nowMs) }))
  const payeeUnset = changed.includes('name') && payeeKnown(after.name) === false
  const words = editWords({ name: row.name, before: row, after, changed, role, rides, other, nowMs, payeeUnset })
  const key = JSON.stringify([
    row.id, columnsOf(row), row.email ?? null, roleOf(row.role), after, role ?? null,
    rides.map(({ b, plan }) => [b.id, plan.legs.map((l) => [l.leg, l.outcome, l.why])]), other,
  ])
  return { row, after, role, changed, colsBefore, colsAfter, rides, other, payeeUnset, words, key }
}

function planJson(p: PreparedEdit) {
  return { key: p.key, driverId: p.row.id, decide: p.rides.filter((r) => r.plan.decide.length).map((r) => r.b.id), words: p.words }
}

export async function planEdit(svc: Svc, editor: Editor, body: Record<string, unknown>, nowMs: number): Promise<Answer> {
  const p = await prepareEdit(svc, editor, body, nowMs)
  if (isAnswer(p)) return p
  return { status: 200, json: { ok: true, plan: planJson(p) } }
}

/* ── The office ── */

async function tellOfficeAboutGuests(why: 'skipped' | 'failed' | 'unreachable', p: PreparedEdit, actor: { label: string }, list: { b: Bk; legs: Leg[]; changeId: string }[], detail?: string): Promise<boolean> {
  const name = p.row.name
  const who = list.map(({ b }) => `${bookingRef(b.id)} (${guestNames(b.first_name).who})`).join(', ')
  const lead = {
    skipped: `${actor.label} changed ${name}'s details and chose not to email the guests who already had the old ones.`,
    failed: `${actor.label} changed ${name}'s details, but the email to these guests did not send.`,
    unreachable: `${actor.label} changed ${name}'s details. These bookings have no email address, so the guests were not emailed.`,
  }[why]
  const lines = [
    `Driver: ${name}`,
    `Before: ${p.colsBefore.driver_vehicle} · ${p.colsBefore.driver_plate} · ${p.colsBefore.driver_phone}`,
    `Now: ${p.colsAfter.driver_vehicle} · ${p.colsAfter.driver_plate} · ${p.colsAfter.driver_phone}`,
    `Rides: ${who}`,
    `Changed by: ${actor.label}`,
    ...(detail ? [`Detail: ${detail}`] : []),
  ]
  return tellOffice(
    `Guests not emailed about a driver's new details: ${name}`,
    `Guests not emailed: ${name}'s new details`,
    `${lead} Check that each guest knows, by WhatsApp or by email.`,
    lines,
    `driver-edit/${list[0].changeId}/office/${why}`,
  )
}

async function tellOfficeAboutName(p: PreparedEdit, actor: { label: string }, changeKey: string): Promise<boolean> {
  return tellOffice(
    `Driver not set up for payment: ${p.after.name}`,
    `${p.after.name} is not set up for payment`,
    `${actor.label} renamed ${p.row.name} to ${p.after.name}. The payout job pays rides by the driver's name, and ${p.after.name} is not on WISE_PAYOUT_RECIPIENTS, so any ride under the new name is held, not paid, until the name is added on Netlify (with Collin's recipient id, if Collin is paid for this driver) and the site is redeployed.`,
    [`Driver: ${p.after.name} (was ${p.row.name})`, `Upcoming rides under the new name: ${p.rides.length}`, `By: ${actor.label}`],
    `driver-edit/${changeKey}/office/payee`,
  )
}

/* ── Saving ── */

const DUPLICATE: Record<string, { field: 'name' | 'email'; message: string }> = {
  drivers_active_name_once: { field: 'name', message: 'Another working driver already has that name.' },
  drivers_active_email_once: { field: 'email', message: 'Another working driver already signs in with that email.' },
}

export async function commitEdit(
  svc: Svc,
  actor: { email: string; label: string },
  editor: Editor,
  body: Record<string, unknown>,
  nowMs: number,
): Promise<Answer> {
  const p = await prepareEdit(svc, editor, body, nowMs)
  if (isAnswer(p)) return p
  const planKey = typeof body.planKey === 'string' ? body.planKey : ''
  if (planKey !== p.key) {
    return { status: 409, json: { ok: false, code: 'replan', message: "Something on this driver's rides changed while you were looking. Here is what saving does now.", plan: planJson(p) } }
  }
  const asked = p.rides.filter((r) => r.plan.decide.length)
  const notify = body.notify === 'send' || body.notify === 'skip' ? body.notify : undefined
  if (asked.length && !notify) return { status: 409, json: { ok: false, code: 'decide', message: 'Choose whether to email the guests.', plan: planJson(p) } }

  // Every promised email must be writable before anything is saved.
  if (asked.length && notify === 'send') {
    const d = { id: p.row.id, ...p.after, active: true }
    for (const { b, plan } of asked) {
      for (const leg of plan.decide) {
        const why = guestSendProblem(bookingAfter(b, { kind: 'driver', after: { ...p.colsAfter } }), leg, d, nowMs)
        if (why) return { status: 409, json: { ok: false, message: `${bookingRef(b.id)}: ${why} Nothing was changed.` } }
      }
    }
  }

  const { data, error } = await svc.rpc('apply_driver_edit', {
    p_driver_id: p.row.id,
    p_before: { name: p.row.name, whatsapp: p.row.whatsapp, vehicle: p.row.vehicle, colour: p.row.colour, plate: p.row.plate, email: p.row.email ?? null, role: roleOf(p.row.role) },
    p_after: { ...p.after, ...(p.role ? { role: p.role.to } : {}) },
    // The log row carries the saved driver's id on both sides: the same driver before and after marks an
    // edit of their details, not a new driver, for the follow-up email and the cards (dispatch-change-server).
    p_cols_before: { ...p.colsBefore, driver_id: p.row.id },
    p_cols_after: { ...p.colsAfter, driver_id: p.row.id },
    p_booking_ids: p.rides.map(({ b }) => b.id),
    p_actor_email: actor.email,
    p_actor_label: actor.label,
  })
  if (error) {
    if (error.code === '23505') return { status: 409, json: { ok: false, message: 'Another working driver already has that name or sign-in email. Nothing was changed.' } }
    console.error('[driver-edit] apply failed', { driverId: p.row.id, error: error.message })
    return { status: 500, json: { ok: false, message: 'Nothing was saved. Try again.' } }
  }
  const result = (data ?? {}) as { result?: string; constraint?: string; changes?: { booking_id: string; change_id: string }[]; skipped?: { booking_id: string; why: string }[] }
  if (result.result === 'changed') {
    const again = await prepareEdit(svc, editor, body, Date.now())
    return { status: 409, json: { ok: false, code: 'changed', message: 'This driver was changed by someone else a moment ago. Nothing was saved.', ...(isAnswer(again) ? {} : { plan: planJson(again) }) } }
  }
  if (result.result === 'duplicate') {
    const dup = DUPLICATE[result.constraint ?? ''] ?? { field: 'name' as const, message: 'Another working driver already has that name or sign-in email.' }
    return { status: 409, json: { ok: false, field: dup.field, message: `${dup.message} Nothing was changed.` } }
  }
  if (result.result === 'retired') return { status: 409, json: { ok: false, message: `${p.row.name} was retired a moment ago. Nothing was changed.` } }
  if (result.result === 'not_found') return { status: 404, json: { ok: false, message: 'That driver is not on the list.' } }
  if (result.result !== 'applied') return { status: 400, json: { ok: false, message: 'That change could not be saved. Nothing was changed.' } }

  const changeOf = new Map((result.changes ?? []).map((c) => [c.booking_id, c.change_id]))
  const moved = p.rides.filter(({ b }) => changeOf.has(b.id))
  const savedAt = Date.now()
  const outcomes = new Map<string, { outcome: GuestOutcome; detail: string | null }>()
  const skippedList: { b: Bk; legs: Leg[]; changeId: string }[] = []
  const failedList: { b: Bk; legs: Leg[]; changeId: string; error: string }[] = []
  const unreachableList: { b: Bk; legs: Leg[]; changeId: string }[] = []
  const sentList: Bk[] = []

  // The emails, all at once: each ride its own, keyed to its change.
  await Promise.all(moved.map(async ({ b, plan }) => {
    const changeId = changeOf.get(b.id) as string
    if (plan.decide.length) {
      if (notify === 'send') {
        const results = await Promise.all(plan.decide.map((leg) => sendDriverUpdate(svc, b.id, leg, p.row.id, nowMs, {
          about: { kind: 'details', before: p.colsBefore },
          key: `dispatch-change/${changeId}/${leg}`,
          timeoutMs: 4000,
        })))
        const bad = results.find((r) => !r.ok) as { ok: false; error: string } | undefined
        if (bad) failedList.push({ b, legs: plan.decide, changeId, error: bad.error })
        else { sentList.push(b); outcomes.set(changeId, { outcome: 'sent', detail: null }) }
      } else {
        skippedList.push({ b, legs: plan.decide, changeId })
      }
    } else if (plan.unreachable.length) {
      unreachableList.push({ b, legs: plan.unreachable, changeId })
    } else if (plan.legs.some((l) => l.outcome === 'automatic')) {
      outcomes.set(changeId, { outcome: 'automatic', detail: null })
    } else {
      outcomes.set(changeId, { outcome: 'not_needed', detail: null })
    }
  }))

  // The office: what it must be told, each list once. Settled only once told; until then pending, for the sweep.
  const [toldSkipped, toldFailed, toldUnreachable] = await Promise.all([
    skippedList.length ? tellOfficeAboutGuests('skipped', p, actor, skippedList) : Promise.resolve(true),
    failedList.length ? tellOfficeAboutGuests('failed', p, actor, failedList, failedList[0].error) : Promise.resolve(true),
    unreachableList.length ? tellOfficeAboutGuests('unreachable', p, actor, unreachableList) : Promise.resolve(true),
  ])
  for (const x of skippedList) outcomes.set(x.changeId, toldSkipped ? { outcome: 'skipped', detail: `${actor.label} chose not to email` } : { outcome: 'pending', detail: PENDING.skipped })
  for (const x of failedList) outcomes.set(x.changeId, toldFailed ? { outcome: 'failed', detail: x.error } : { outcome: 'pending', detail: `${PENDING.failed} ${x.error}` })
  for (const x of unreachableList) outcomes.set(x.changeId, toldUnreachable ? { outcome: 'unreachable', detail: null } : { outcome: 'pending', detail: PENDING.unreachable })
  if (p.payeeUnset) await tellOfficeAboutName(p, actor, (result.changes ?? [])[0]?.change_id ?? p.row.id)

  // A day-of email the hourly job claimed while this was saving may carry the old details: ask again on the card.
  const watch = moved.filter(({ b, plan }) => outcomes.get(changeOf.get(b.id) as string)?.outcome === 'automatic' && plan.legs.some((l) => l.outcome === 'automatic'))
  const raced: Bk[] = []
  if (watch.length) {
    const { data: now } = await svc.from('bookings').select('id, dispatch').in('id', watch.map(({ b }) => b.id))
    const stamps = new Map(((now ?? []) as { id: string; dispatch: Record<string, unknown> }[]).map((r) => [r.id, r.dispatch ?? {}]))
    for (const { b, plan } of watch) {
      const d = stamps.get(b.id) ?? {}
      const hit = plan.legs.some((l) => {
        if (l.outcome !== 'automatic') return false
        const t = typeof d[stampKey(l.leg)] === 'string' ? Date.parse(d[stampKey(l.leg)] as string) : NaN
        return !Number.isNaN(t) && t < savedAt + 2000
      })
      if (hit) { raced.push(b); outcomes.set(changeOf.get(b.id) as string, { outcome: 'pending', detail: PENDING.raced }) }
    }
  }
  await Promise.all(Array.from(outcomes.entries()).map(([changeId, o]) => recordOutcome(svc, changeId, o.outcome, o.detail)))

  const first = p.after.name.split(' ')[0]
  const names = (list: Bk[]) => {
    const n = list.map((b) => guestNames(b.first_name).Who)
    return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`
  }
  const parts = [`Saved. ${first}'s details are updated${moved.length ? `, and ${moved.length === 1 ? '1 upcoming ride carries' : `${moved.length} upcoming rides carry`} them` : ''}.`]
  if (sentList.length) parts.push(`${names(sentList)} ${sentList.length === 1 ? 'was' : 'were'} emailed.`)
  if (skippedList.length) parts.push(`${names(skippedList.map((x) => x.b))} ${skippedList.length === 1 ? "wasn't" : "weren't"} emailed, and MAPL Tours Jamaica ${toldSkipped ? 'was told' : 'will be told'}.`)
  if (failedList.length) parts.push(`The email to ${names(failedList.map((x) => x.b))} didn't go. MAPL Tours Jamaica ${toldFailed ? 'was told' : 'will be told'}; open the ride to try again.`)
  if (unreachableList.length) parts.push(`${names(unreachableList.map((x) => x.b))} ${unreachableList.length === 1 ? 'has' : 'have'} no email address. Tell ${names(unreachableList.map((x) => x.b))} on WhatsApp; MAPL Tours Jamaica ${toldUnreachable ? 'was told' : 'will be told'}.`)
  if (raced.length) parts.push(`${names(raced)}'s day-of email went out just as you saved. Open the ride to email ${raced.length === 1 ? names(raced) : 'them'}.`)
  const kept = (result.skipped ?? []).length
  if (kept) parts.push(`${kept === 1 ? '1 ride' : `${kept} rides`} changed while you were saving and kept ${kept === 1 ? 'its' : 'their'} details.`)
  const warn = failedList.length > 0 || raced.length > 0 || kept > 0 || unreachableList.length > 0
  return { status: 200, json: { ok: true, message: parts.join(' '), warn, moved: moved.length } }
}
