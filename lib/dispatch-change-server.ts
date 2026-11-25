import 'server-only'
import { createElement } from 'react'
import OpsAlert from '@/emails/OpsAlert'
import { sendEmail } from '@/lib/email/send'
import { bookingRef, type Bk } from '@/lib/dispatch'
import { jaDateKey, stampKey } from '@/lib/dayof-rules'
import { bookingDriverColumns, bookingHasDriver, type Driver } from '@/lib/drivers'
import { clockWords, guestSendProblem, legAt, legsOf, type Leg } from '@/lib/driver-update'
import { sendDriverUpdate } from '@/lib/driver-update-send'
import { parseRecipients, payoutsEnabled } from '@/lib/payouts/config'
import { nameKey, type DriverAccess } from '@/lib/driver-access'
import { DRIVER_ROLE_COLS } from '@/lib/driver-access-server'
import {
  bookingAfter, legPlan, planChange, planKey, storedWallClock, timeChangeProblem, legIsAhead,
  TOUR_TIME_RE, type ChangePlan, type ChangeRequest,
} from '@/lib/dispatch-change'
import {
  guestNames, planWords, resultWords, rideDayLong, rideLabel, shownDriverOf, driverLine, firstWord, sentWhen,
  type GuestOutcome, type PlanWords, type ShownDriver,
} from '@/lib/dispatch-change-words'
import { updateBookingInCalendar } from '@/lib/google-calendar'

/**
 * Changes saved from the driver portal by a fleet manager (Nov 24 2026): who
 * drives a booking, a ride's time, a tour's pickup time. The rules are in
 * lib/dispatch-change (what the guest hears) and the words in
 * lib/dispatch-change-words; this file reads, saves and sends.
 *
 *   plan     what saving would do, in words; writes nothing
 *   commit   saves through apply_dispatch_change (migration 043: locked,
 *            paid only, refused if the booking no longer holds what the
 *            person was shown), then emails the guest or tells the office,
 *            as the person chose, and moves the ops calendar for a new time
 *   email    a saved change whose email is still open (the day-of email went
 *            just as it was saved, or the send failed): send or don't
 *   calendar the ops calendar again, when the commit could not reach it
 *
 * SAFETY: no money column, booking status, Stripe call or webhook is touched.
 * The booking is written only by the database function; the dispatch map
 * only by sendDriverUpdate's existing stamp. Payouts read the driver's name,
 * so a new name not on WISE_PAYOUT_RECIPIENTS is told to the office.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = any

export type ChangeInput =
  | { kind: 'driver'; driverId: string }
  | { kind: 'time'; leg: Leg; at: string }
  | { kind: 'tour_time'; time: string }

export interface Answer {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: Record<string, any>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BOOKING_COLS = 'id, status, booking_type, email, first_name, last_name, phone, pickup, dropoff, pickup_time, driver_name, driver_phone, driver_vehicle, driver_plate, dispatch, booking_items(*)'

/** How long an email outcome may stay open before the sweep tells the office. */
export const PENDING_ALERT_MIN = 10

/** Why a change's email is still open: the detail recorded with 'pending', read back by the sweep. */
export const PENDING = {
  raced: 'raced: the day-of email went as this was saved',
  skipped: 'skipped: chose not to email; the office alert has not gone yet',
  failed: 'failed: the email did not send; the office alert has not gone yet;',
  unreachable: 'unreachable: no email address; the office alert has not gone yet',
} as const

/** A booking-level problem in words, or null. */
function bookingProblem(b: Bk | null): string | null {
  if (!b) return 'That booking was not found.'
  if (b.status !== 'paid') return 'This booking is not paid, so nothing on it can be changed here.'
  if (b.booking_type !== 'transfer' && b.booking_type !== 'tour') return 'This booking cannot be changed here.'
  return null
}

/** The input from a request body, checked for shape only. */
export function parseChangeInput(raw: unknown): ChangeInput | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.kind === 'driver' && typeof r.driverId === 'string' && UUID.test(r.driverId)) return { kind: 'driver', driverId: r.driverId }
  if (r.kind === 'time' && (r.leg === 'arrival' || r.leg === 'departure') && typeof r.at === 'string' && r.at.length <= 20) return { kind: 'time', leg: r.leg, at: r.at }
  if (r.kind === 'tour_time' && typeof r.time === 'string' && r.time.length <= 5) return { kind: 'tour_time', time: r.time }
  return null
}

export const isBookingId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

async function loadBooking(svc: Svc, bookingId: string): Promise<{ b: Bk | null; error?: string }> {
  const { data, error } = await svc.from('bookings').select(BOOKING_COLS).eq('id', bookingId).maybeSingle()
  if (error) return { b: null, error: error.message }
  return { b: data ?? null }
}

async function loadDriver(svc: Svc, driverId: string): Promise<{ d: Driver | null; error?: string }> {
  const { data, error } = await svc.from('drivers').select(DRIVER_ROLE_COLS).eq('id', driverId).maybeSingle()
  if (error) return { d: null, error: error.message }
  return { d: (data as Driver) ?? null }
}

/** The saved, working driver whose details the booking carries exactly, if any. */
async function savedDriverOnBooking(svc: Svc, b: Bk): Promise<Driver | null> {
  if (!b.driver_name) return null
  const { data } = await svc.from('drivers').select(DRIVER_ROLE_COLS).eq('active', true)
  return ((data ?? []) as Driver[]).find((d) => bookingHasDriver(b, d)) ?? null
}

const shown = (d: Driver): ShownDriver => ({ name: d.name, vehicle: `${d.colour} ${d.vehicle}`, plate: d.plate })

/** Is this name one the payout job can pay (lib/payouts/plan's key)? Null when payouts are off or the map cannot be read. */
export function payeeKnown(name: string, env: Record<string, string | undefined> = process.env): boolean | null {
  if (!payoutsEnabled(env)) return null
  const map = parseRecipients(env.WISE_PAYOUT_RECIPIENTS)
  if (map === null) return null
  return Object.keys(map).some((n) => nameKey(n) === nameKey(name))
}

interface Prepared {
  b: Bk
  req: ChangeRequest
  plan: ChangePlan
  driverAfter: Driver | null
  words: PlanWords
  payeeUnset: boolean
}

/** Read the booking, check the change, plan it. The same for plan and commit, so both judge alike. */
async function prepare(svc: Svc, bookingId: string, input: ChangeInput, nowMs: number): Promise<Prepared | Answer> {
  const { b, error } = await loadBooking(svc, bookingId)
  if (error) return { status: 500, json: { ok: false, message: 'The booking could not be read. Try again.' } }
  const bp = bookingProblem(b)
  if (bp) return { status: b ? 409 : 404, json: { ok: false, message: bp } }

  if (b!.booking_type === 'tour') {
    const days = ((b!.booking_items ?? []) as { date?: string | null }[]).map((i) => String(i.date ?? '').slice(0, 10)).filter(Boolean).sort()
    if (days.length && days[days.length - 1] < jaDateKey(nowMs)) return { status: 409, json: { ok: false, message: 'This tour is over.' } }
  }

  let req: ChangeRequest
  let driverAfter: Driver | null = null
  if (input.kind === 'driver') {
    const { d, error: dErr } = await loadDriver(svc, input.driverId)
    if (dErr) return { status: 500, json: { ok: false, message: 'The saved drivers could not be read. Try again.' } }
    if (!d) return { status: 404, json: { ok: false, message: 'That driver is not on the list.' } }
    if (!d.active) return { status: 409, json: { ok: false, message: `${d.name} is retired. Choose another driver.` } }
    if (bookingHasDriver(b, d)) return { status: 409, json: { ok: false, message: `${d.name} is already on this ${b!.booking_type === 'tour' ? 'tour' : 'ride'}.` } }
    if (b!.booking_type === 'transfer') {
      const legs = ['arrival', 'departure'] as Leg[]
      const ahead = legs.some((leg) => { const at = legAt(b, leg); return !!at && legIsAhead(at, leg, nowMs) })
      if (!ahead) return { status: 409, json: { ok: false, message: 'The rides on this booking are over.' } }
    }
    driverAfter = d
    req = { kind: 'driver', after: { ...bookingDriverColumns(d) } }
  } else if (input.kind === 'time') {
    const problem = timeChangeProblem(b, input.leg, input.at, nowMs)
    if (problem) return { status: problem.startsWith('That is the time') ? 409 : 400, json: { ok: false, message: problem } }
    req = { kind: 'time', leg: input.leg, at: storedWallClock(input.at) as string }
  } else {
    if (b!.booking_type !== 'tour') return { status: 400, json: { ok: false, message: 'Only a tour has a tour pickup time.' } }
    if (!TOUR_TIME_RE.test(input.time)) return { status: 400, json: { ok: false, message: 'Choose a time.' } }
    if ((b!.pickup_time ?? null) === input.time) return { status: 409, json: { ok: false, message: 'That is the pickup time the tour already has.' } }
    req = { kind: 'tour_time', time: input.time }
  }

  const plan = planChange(b, req, nowMs)
  const payeeUnset = req.kind === 'driver' && b!.booking_type === 'transfer' && payeeKnown(driverAfter!.name) === false
  const words = planWords({ plan, b, nowMs, driverAfter: driverAfter ? shown(driverAfter) : null, payeeUnset })
  return { b: b!, req, plan, driverAfter, words, payeeUnset }
}

const isAnswer = (x: Prepared | Answer): x is Answer => 'status' in x && 'json' in x

function planJson(p: Prepared) {
  return { key: planKey(p.plan), kind: p.plan.kind, leg: p.plan.leg, ref: bookingRef(p.b.id), decide: p.plan.decide, words: p.words }
}

export async function planFor(svc: Svc, bookingId: string, input: ChangeInput, nowMs: number): Promise<Answer> {
  const p = await prepare(svc, bookingId, input, nowMs)
  if (isAnswer(p)) return p
  return { status: 200, json: { ok: true, plan: planJson(p) } }
}

/* ── The office ── */

function opsInbox(): string[] {
  return (process.env.OPERATIONS_EMAIL ?? 'contact@mapltours.com').split(',').map((e) => e.trim()).filter((e) => e.includes('@'))
}

async function tellOffice(subject: string, title: string, body: string, lines: string[], dedupe: string): Promise<boolean> {
  const to = opsInbox()
  if (!to.length) return false
  try {
    const res = await sendEmail({
      to,
      subject,
      react: createElement(OpsAlert, { title, body, lines }),
      tags: [{ name: 'type', value: 'dispatch_change' }],
      dedupe,
      timeoutMs: 3000,
    })
    return !!res?.ok
  } catch (e) {
    console.error('[dispatch-change] the office alert did not send', { dedupe, error: e instanceof Error ? e.message : String(e) })
    return false
  }
}

/** What changed, in one line for the office. */
function changeLine(plan: ChangePlan, b: Bk, driverAfter: ShownDriver | null): string {
  if (plan.kind === 'driver') return `Driver: ${driverLine(shownDriverOf(b))}, now ${driverLine(driverAfter)}`
  if (plan.kind === 'time') {
    const was = plan.before.at as string
    const now = plan.after.at as string
    const what = plan.leg === 'arrival' ? 'Flight lands' : 'Hotel pickup'
    return `${what}: ${rideDayLong(was)} ${clockWords(was)}, now ${rideDayLong(now)} ${clockWords(now)}`
  }
  return `Tour pickup time: ${plan.before.pickup_time ?? 'not set'}, now ${plan.after.pickup_time}`
}

async function alertNotEmailed(
  why: 'skipped' | 'failed' | 'unreachable' | 'unanswered',
  ctx: { b: Bk; plan: ChangePlan; actor: { label: string }; changeId: string; driverAfter: ShownDriver | null; nowMs: number; detail?: string },
): Promise<boolean> {
  const ref = bookingRef(ctx.b.id)
  const g = guestNames(ctx.b.first_name)
  const lead: Record<typeof why, string> = {
    skipped: `${ctx.actor.label} saved a change on ${ref} and chose not to email ${g.who}.`,
    failed: `${ctx.actor.label} saved a change on ${ref}, but the email to ${g.who} did not send.`,
    unreachable: `${ctx.actor.label} saved a change on ${ref}. The booking has no email address, so ${g.who} was not emailed.`,
    unanswered: `${ctx.actor.label} saved a change on ${ref}, and nobody chose whether to email ${g.who} about it.`,
  }
  const lastGot = ctx.plan.legs
    .filter((l) => l.dayOfSentAt)
    .map((l) => `${g.Whose} day-of email for the ${rideLabel(l.leg).toLowerCase()} went ${sentWhen(l.dayOfSentAt as string, ctx.nowMs)}`)
  const body = `${lead[why]} ${lastGot.length ? `${lastGot.join('; ')}, with the details this replaced.` : ''} Check that ${g.who} knows, by WhatsApp or by email.`.replace(/\s+/g, ' ').trim()
  const lines = [
    `Booking: ${ref}`,
    changeLine(ctx.plan, ctx.b, ctx.driverAfter),
    ...ctx.plan.legs.map((l) => `${rideLabel(l.leg)}: ${rideDayLong(l.at)} ${clockWords(l.at)}`),
    `Changed by: ${ctx.actor.label}`,
    ...(ctx.detail ? [`Detail: ${ctx.detail}`] : []),
    `Dispatch: https://mapltours.com/admin/dispatch/${ctx.b.id}`,
  ]
  return tellOffice(`Guest not emailed about a change: ${ref}`, `Guest not emailed: ${ref}`, body, lines, `dispatch-change/${ctx.changeId}/office/${why}`)
}

async function alertPayeeUnset(ctx: { b: Bk; actor: { label: string }; changeId: string; name: string }): Promise<boolean> {
  const ref = bookingRef(ctx.b.id)
  return tellOffice(
    `New driver not set up for payment: ${ctx.name}`,
    `${ctx.name} is not set up for payment`,
    `${ctx.actor.label} put ${ctx.name} on ${ref}. ${ctx.name} is not on WISE_PAYOUT_RECIPIENTS, so the payout job holds this ride's payment until the name is added on Netlify (with Collin's recipient id, if Collin is paid for this driver) and the site is redeployed.`,
    [`Booking: ${ref}`, `Driver: ${ctx.name}`, `Changed by: ${ctx.actor.label}`, `Dispatch: https://mapltours.com/admin/dispatch/${ctx.b.id}`],
    `dispatch-change/${ctx.changeId}/office/payee`,
  )
}

/* ── Saving ── */

async function recordOutcome(svc: Svc, changeId: string, outcome: GuestOutcome, detail: string | null) {
  const { error } = await svc.from('dispatch_changes').update({ guest_email: outcome, guest_email_detail: detail ? detail.slice(0, 500) : null }).eq('id', changeId)
  if (error) console.error('[dispatch-change] outcome not recorded', { changeId, outcome, error: error.message })
}

/** Email the guest about the rides in `legs`, for a saved change. Each ride its own email, as the console sends them. */
async function emailGuest(svc: Svc, b: Bk, plan: ChangePlan, legs: Leg[], driverId: string, changeId: string, nowMs: number): Promise<{ ok: boolean; error?: string }> {
  const about = plan.kind === 'time' ? { kind: 'time' as const, fromAt: plan.before.at as string } : { kind: 'driver' as const }
  const results = await Promise.all(legs.map((leg) =>
    sendDriverUpdate(svc, b.id, leg, driverId, nowMs, { about, key: `dispatch-change/${changeId}/${leg}`, timeoutMs: 4000 })))
  const failed = results.find((r) => !r.ok) as { ok: false; error: string } | undefined
  return failed ? { ok: false, error: failed.error } : { ok: true }
}

async function moveCalendar(svc: Svc, bookingId: string): Promise<'done' | 'failed' | 'skipped'> {
  const { b } = await loadBooking(svc, bookingId)
  if (!b || b.status !== 'paid') return 'skipped'
  const res = await Promise.race([
    updateBookingInCalendar(b, b.booking_items ?? []),
    new Promise<{ ok: false; reason: string }>((r) => setTimeout(() => r({ ok: false, reason: 'timeout' }), 4500)),
  ])
  if (!res.ok && res.reason === 'not configured') return 'skipped'
  return res.ok ? 'done' : 'failed'
}

const APPLY_REFUSED: Record<string, { status: number; message: string }> = {
  not_found: { status: 404, message: 'That booking was not found.' },
  not_paid: { status: 409, message: 'This booking is no longer paid, so nothing was changed.' },
  order: { status: 400, message: 'A round trip has to land before its ride back to the airport. Nothing was changed.' },
  bad_request: { status: 400, message: 'That change could not be saved. Nothing was changed.' },
}

export async function commitChange(
  svc: Svc,
  actor: DriverAccess,
  body: { bookingId: string; change: ChangeInput; planKey: string; email?: 'send' | 'skip' },
  nowMs: number,
): Promise<Answer> {
  const p = await prepare(svc, body.bookingId, body.change, nowMs)
  if (isAnswer(p)) return p
  if (planKey(p.plan) !== body.planKey) {
    return { status: 409, json: { ok: false, code: 'replan', message: 'This ride changed while you were looking. Here is what saving does now.', plan: planJson(p) } }
  }
  if (p.plan.decide.length && body.email !== 'send' && body.email !== 'skip') {
    return { status: 409, json: { ok: false, code: 'decide', message: 'Choose whether to email the guest.', plan: planJson(p) } }
  }
  // The email can only be written about a saved driver on the booking, and
  // only where the console would send it. Checked before anything is saved,
  // so a change is never saved with an email that was promised and cannot go.
  let emailDriverId: string | null = null
  if (p.plan.decide.length && body.email === 'send') {
    const d = p.req.kind === 'driver' ? p.driverAfter : await savedDriverOnBooking(svc, p.b)
    if (!d) return { status: 409, json: { ok: false, message: 'The driver on this ride is not on the drivers list, so the email cannot be written. Choose the driver again, then change the time. Nothing was changed.' } }
    const after = bookingAfter(p.b, p.req)
    for (const leg of p.plan.decide) {
      const why = guestSendProblem(after, leg, d, nowMs)
      if (why) return { status: 409, json: { ok: false, message: `${why} Nothing was changed.` } }
    }
    emailDriverId = d.id
  }

  const { data, error } = await svc.rpc('apply_dispatch_change', {
    p_booking_id: p.b.id,
    p_kind: p.plan.kind,
    p_leg: p.plan.leg,
    p_before: p.plan.before,
    p_after: p.plan.after,
    p_actor_email: actor.email,
    p_actor_label: actor.label,
  })
  if (error) {
    console.error('[dispatch-change] apply failed', { bookingId: p.b.id, error: error.message })
    return { status: 500, json: { ok: false, message: 'Nothing was saved. Try again.' } }
  }
  const result = (data ?? {}) as { result?: string; id?: string }
  if (result.result === 'changed') {
    const again = await prepare(svc, body.bookingId, body.change, Date.now())
    return { status: 409, json: { ok: false, code: 'changed', message: 'Someone else changed this ride a moment ago. Nothing was saved.', ...(isAnswer(again) ? {} : { plan: planJson(again) }) } }
  }
  if (result.result !== 'applied' || !result.id) {
    const r = APPLY_REFUSED[result.result ?? ''] ?? APPLY_REFUSED.bad_request
    return { status: r.status, json: { ok: false, message: r.message } }
  }
  const changeId = result.id
  const savedAt = Date.now()
  const driverShown = p.driverAfter ? shown(p.driverAfter) : null
  const ctx = { b: p.b, plan: p.plan, actor, changeId, driverAfter: driverShown, nowMs }

  // Beside the email, and never deciding the answer: the ops calendar follows
  // a new time, and the office hears about a driver the payout job cannot pay.
  const calendar = p.plan.kind === 'driver' ? Promise.resolve('skipped' as const) : moveCalendar(svc, p.b.id).catch(() => 'failed' as const)
  const payee = p.payeeUnset && p.driverAfter ? alertPayeeUnset({ b: p.b, actor, changeId, name: p.driverAfter.name }) : Promise.resolve(true)

  // The outcome is recorded as settled only once the office has been told
  // whatever it must be told. Until then it stays 'pending' with the reason,
  // and the sweep (sweepUnanswered) tells the office within the hour.
  let outcome: GuestOutcome
  let detail: string | null = null
  if (p.plan.decide.length) {
    if (body.email === 'send') {
      const sent = await emailGuest(svc, p.b, p.plan, p.plan.decide, emailDriverId as string, changeId, nowMs)
      if (sent.ok) outcome = 'sent'
      else {
        detail = `${PENDING.failed} ${sent.error ?? 'send failed'}`
        outcome = (await alertNotEmailed('failed', { ...ctx, detail: sent.error })) ? 'failed' : 'pending'
      }
    } else {
      detail = PENDING.skipped
      outcome = (await alertNotEmailed('skipped', ctx)) ? 'skipped' : 'pending'
    }
  } else if (p.plan.unreachable.length) {
    detail = PENDING.unreachable
    outcome = (await alertNotEmailed('unreachable', ctx)) ? 'unreachable' : 'pending'
  } else if (p.plan.legs.some((l) => l.outcome === 'automatic')) {
    outcome = 'automatic'
  } else {
    outcome = 'not_needed'
  }
  await payee

  // The hourly job may have sent a day-of email for one of these rides while
  // this was being saved, from the booking as it was. Ask again about those.
  let raced: Leg[] = []
  if (outcome === 'automatic' || outcome === 'not_needed') {
    const watch = p.plan.legs.filter((l) => l.outcome === 'automatic').map((l) => l.leg)
    if (watch.length) {
      const { data: now } = await svc.from('bookings').select('dispatch').eq('id', p.b.id).maybeSingle()
      const d = ((now?.dispatch ?? {}) as Record<string, unknown>)
      raced = watch.filter((leg) => {
        const stamp = d[stampKey(leg)]
        const t = typeof stamp === 'string' ? Date.parse(stamp) : NaN
        return !Number.isNaN(t) && t < savedAt + 2000
      })
    }
  }
  if (raced.length) {
    outcome = 'pending'
    detail = PENDING.raced
  }
  await recordOutcome(svc, changeId, outcome, detail)
  const cal = await calendar

  const g = guestNames(p.b.first_name)
  let question: PlanWords['question'] = null
  if (raced.length) {
    const fresh = await loadBooking(svc, p.b.id)
    const after = fresh.b ?? p.b
    const legs = raced.map((leg) => legPlan(after, leg, Date.now(), true))
    const racedPlan: ChangePlan = { ...p.plan, legs, decide: raced }
    question = planWords({ plan: racedPlan, b: p.b, nowMs: Date.now(), driverAfter: driverShown, raced: true }).question
  }
  return {
    status: 200,
    json: {
      ok: true,
      changeId,
      outcome,
      message: raced.length
        ? `Saved. ${g.Whose} day-of email went out just as you saved.`
        : resultWords(outcome === 'pending' ? (body.email === 'skip' ? 'skipped' : p.plan.unreachable.length && !p.plan.decide.length ? 'unreachable' : 'failed') : outcome, p.b.first_name),
      question,
      calendar: cal,
    },
  }
}

/** A saved change whose email is still open: send it now, or not (the office is told). */
export async function followUpEmail(svc: Svc, actor: DriverAccess, body: { changeId: string; email: 'send' | 'skip' }, nowMs: number): Promise<Answer> {
  const { data: row, error } = await svc.from('dispatch_changes').select('id, booking_id, kind, leg, before, after, guest_email, created_at').eq('id', body.changeId).maybeSingle()
  if (error) return { status: 500, json: { ok: false, message: 'The change could not be read. Try again.' } }
  if (!row) return { status: 404, json: { ok: false, message: 'That change was not found.' } }
  if (row.guest_email !== 'pending' && row.guest_email !== 'failed') {
    return { status: 409, json: { ok: false, message: 'The email for this change has already been dealt with.', outcome: row.guest_email } }
  }
  const { data: newer } = await svc.from('dispatch_changes').select('id').eq('booking_id', row.booking_id).gt('created_at', row.created_at).limit(1)
  if ((newer ?? []).length) return { status: 409, json: { ok: false, message: 'A newer change was saved on this ride. Its email is dealt with there.' } }

  const { b, error: bErr } = await loadBooking(svc, row.booking_id)
  if (bErr) return { status: 500, json: { ok: false, message: 'The booking could not be read. Try again.' } }
  const bp = bookingProblem(b)
  if (bp) return { status: 409, json: { ok: false, message: bp } }
  if (row.kind === 'tour_time' || b!.booking_type === 'tour') {
    await recordOutcome(svc, row.id, 'not_needed', null)
    return { status: 200, json: { ok: true, outcome: 'not_needed', message: resultWords('not_needed', b!.first_name) } }
  }

  // The rides this change touched that are still ahead.
  const touched: Leg[] = row.kind === 'time' ? [row.leg as Leg] : legsOf(b)
  const legs = touched.filter((leg) => { const at = legAt(b, leg); return !!at && legIsAhead(at, leg, nowMs) })
  const plan: ChangePlan = {
    kind: row.kind, leg: row.kind === 'time' ? row.leg : null, before: row.before, after: row.after,
    legs: legs.map((leg) => legPlan(b, leg, nowMs, true)), decide: legs, unreachable: [],
  }
  const driverOnBooking = await savedDriverOnBooking(svc, b!)
  const ctx = { b: b!, plan, actor, changeId: row.id, driverAfter: driverOnBooking ? shown(driverOnBooking) : shownDriverOf(b), nowMs }

  if (!legs.length) {
    await recordOutcome(svc, row.id, 'not_needed', 'the rides are over')
    return { status: 200, json: { ok: true, outcome: 'not_needed', message: 'Saved. The ride is over, so there is nothing to send.' } }
  }
  if (body.email === 'skip') {
    await alertNotEmailed('skipped', ctx)
    await recordOutcome(svc, row.id, 'skipped', `${actor.label} chose not to email`)
    return { status: 200, json: { ok: true, outcome: 'skipped', message: resultWords('skipped', b!.first_name) } }
  }
  if (!b!.email) {
    await alertNotEmailed('unreachable', ctx)
    await recordOutcome(svc, row.id, 'unreachable', null)
    return { status: 200, json: { ok: true, outcome: 'unreachable', message: resultWords('unreachable', b!.first_name) } }
  }
  if (!driverOnBooking) {
    return { status: 409, json: { ok: false, message: 'The driver on this ride is not on the drivers list, so the email cannot be written. Choose the driver again first.' } }
  }
  const sent = await emailGuest(svc, b!, plan, legs, driverOnBooking.id, row.id, nowMs)
  if (!sent.ok) {
    await alertNotEmailed('failed', { ...ctx, detail: sent.error })
    await recordOutcome(svc, row.id, 'failed', sent.error ?? 'send failed')
    return { status: 502, json: { ok: false, outcome: 'failed', message: resultWords('failed', b!.first_name) } }
  }
  await recordOutcome(svc, row.id, 'sent', null)
  return { status: 200, json: { ok: true, outcome: 'sent', message: resultWords('sent', b!.first_name) } }
}

export async function calendarAgain(svc: Svc, changeId: string): Promise<Answer> {
  const { data: row } = await svc.from('dispatch_changes').select('booking_id, kind').eq('id', changeId).maybeSingle()
  if (!row) return { status: 404, json: { ok: false, message: 'That change was not found.' } }
  if (row.kind === 'driver') return { status: 200, json: { ok: true, calendar: 'skipped' } }
  const cal = await moveCalendar(svc, row.booking_id)
  return { status: 200, json: { ok: cal !== 'failed', calendar: cal } }
}

/**
 * Changes whose email nobody settled (the person closed the page at the
 * second question, or the answer never arrived): the office is told once, and
 * the change is marked so it is not told again. Run by the sweep cron.
 */
export async function sweepUnanswered(svc: Svc, nowMs: number): Promise<{ told: number; failed: number }> {
  const cutoff = new Date(nowMs - PENDING_ALERT_MIN * 60_000).toISOString()
  const { data: rows, error } = await svc.from('dispatch_changes')
    .select('id, booking_id, kind, leg, before, after, actor_label, guest_email_detail')
    .eq('guest_email', 'pending').lt('created_at', cutoff).order('created_at', { ascending: true }).limit(25)
  if (error) throw new Error(error.message)
  let told = 0
  let failed = 0
  for (const row of rows ?? []) {
    const { b } = await loadBooking(svc, row.booking_id)
    if (!b) { await recordOutcome(svc, row.id, 'not_needed', 'booking gone'); continue }
    const legs: Leg[] = row.kind === 'time' ? [row.leg] : row.kind === 'driver' && b.booking_type === 'transfer' ? legsOf(b) : []
    const plan: ChangePlan = { kind: row.kind, leg: row.kind === 'time' ? row.leg : null, before: row.before, after: row.after, legs: legs.map((leg) => legPlan(b, leg, nowMs, true)), decide: [], unreachable: [] }
    // The reason it is open decides what the office is told and what it is recorded as.
    const d = String(row.guest_email_detail ?? '')
    const why = d.startsWith('skipped') ? 'skipped' : d.startsWith('failed') ? 'failed' : d.startsWith('unreachable') ? 'unreachable' : 'unanswered'
    const settled: GuestOutcome = why === 'skipped' ? 'skipped' : why === 'unreachable' ? 'unreachable' : 'failed'
    const ok = await alertNotEmailed(why, { b, plan, actor: { label: row.actor_label }, changeId: row.id, driverAfter: shownDriverOf(b), nowMs, detail: why === 'failed' ? d.replace(PENDING.failed, '').trim() || undefined : undefined })
    if (ok) { told++; await recordOutcome(svc, row.id, settled, why === 'unanswered' ? 'nobody chose whether to email; the office was told' : `${d.split(':')[0]}; the office was told by the sweep`) } else failed++
  }
  return { told, failed }
}

/* ── Exported for the portal's ride cards ── */

export interface LastChange {
  kind: 'driver' | 'time' | 'tour_time'
  leg: Leg | null
  text: string
  by: string
  at: string
  open: boolean
  changeId: string
}

/** The newest change on each booking, in words, for the portal's cards. */
export async function lastChanges(svc: Svc, bookingIds: string[]): Promise<Record<string, LastChange>> {
  const out: Record<string, LastChange> = {}
  if (!bookingIds.length) return out
  // 100 ids a request: a longer id list can overflow the request address.
  for (let i = 0; i < bookingIds.length; i += 100) {
    const ids = bookingIds.slice(i, i + 100)
    const { data, error } = await svc.from('dispatch_changes')
      .select('id, booking_id, kind, leg, before, after, actor_label, guest_email, created_at')
      .in('booking_id', ids).order('created_at', { ascending: false }).limit(1000)
    if (error) { console.error('[dispatch-change] last changes not read', error.message); return out }
    for (const r of data ?? []) {
      if (out[r.booking_id]) continue
      let text: string
      if (r.kind === 'driver') text = `Driver changed to ${firstWord(String(r.after?.driver_name ?? 'a new driver'))}`
      else if (r.kind === 'time') text = `${r.leg === 'arrival' ? 'Landing time' : 'Hotel pickup'} moved to ${clockWords(String(r.after?.at))}${String(r.after?.at).slice(0, 10) !== String(r.before?.at).slice(0, 10) ? ` on ${rideDayLong(String(r.after?.at))}` : ''}`
      else text = `Tour pickup set to ${r.after?.pickup_time}`
      out[r.booking_id] = {
        kind: r.kind, leg: r.leg ?? null, text, by: r.actor_label, at: r.created_at,
        open: r.guest_email === 'pending' || r.guest_email === 'failed', changeId: r.id,
      }
    }
  }
  return out
}

