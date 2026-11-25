import { legInstantMs, type Bk } from '@/lib/dispatch'
import { jaDateKey } from '@/lib/dayof-rules'
import { clockWords, type Leg } from '@/lib/driver-update'
import type { ChangePlan, LegPlan } from '@/lib/dispatch-change'

/**
 * Every word the driver portal shows about a change before it is saved, and
 * after: the first step (what changes, which rides, when the guest hears), the
 * second (email the guest now, or not), and the result. Pure, built on the
 * server from the plan (lib/dispatch-change) so the words match what saving
 * does, and read line by line in tests/unit/dispatch-change-words.spec.ts.
 *
 * The reader is a fleet manager (Collin) on a phone. Short sentences, the
 * guest by first name and never by a pronoun, Jamaica times, no em dashes.
 */

export interface ShownDriver {
  name: string
  /** "silver Toyota Hiace", or the stored vehicle when it cannot be split. */
  vehicle: string | null
  plate: string | null
}

/** ok: all good; ask: a question follows; caution: worth knowing; warn: something is wrong; muted: background. */
export type Tone = 'ok' | 'ask' | 'caution' | 'warn' | 'muted'

export interface RideWords {
  leg: Leg
  label: string
  when: string
  /** What the guest has, or will get. */
  note: string
  /** What happens next, on its own line ("You choose next whether to email Ada now."). */
  next?: string
  tone: Tone
}

export interface QuestionWords {
  title: string
  body: string
  summary: string
  send: string
  skip: string
  skipNote: string
}

export interface PlanWords {
  title: string
  from: { label: string; value: string }
  to: { label: string; value: string }
  rides: RideWords[]
  notes: { text: string; tone: Tone }[]
  primary: string
  question: QuestionWords | null
}

const HOUR = 3_600_000

/** The guest as the words name them: their first name, or "the guest". */
export function guestNames(firstName: string | null | undefined): { who: string; Who: string; whose: string; Whose: string } {
  const f = (firstName ?? '').replace(/\s+/g, ' ').trim()
  if (f) return { who: f, Who: f, whose: `${f}'s`, Whose: `${f}'s` }
  return { who: 'the guest', Who: 'The guest', whose: "the guest's", Whose: "The guest's" }
}

export const firstWord = (name: string): string => name.trim().split(/\s+/)[0] ?? name

/** "Sun, Nov 30 · 12:00 noon" from a stored wall-clock time. */
export function rideWhen(iso: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
  return `${day} · ${clockWords(iso)}`
}

/** "Sunday, November 30" from a stored wall-clock time. */
export function rideDayLong(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })
}

/** A real instant as the Jamaica wall clock, stored-style (so clockWords and rideWhen read it). */
const asWall = (ms: number): string => new Date(ms - 5 * HOUR).toISOString()

/**
 * When a real instant falls, said from now on the Jamaica calendar: "today",
 * "tomorrow", "yesterday", or "on Saturday" within the week, else "on
 * Saturday, Nov 29".
 */
export function relativeDay(ms: number, nowMs: number): string {
  const day = jaDateKey(ms)
  const today = jaDateKey(nowMs)
  if (day === today) return 'today'
  if (day === jaDateKey(nowMs + 24 * HOUR)) return 'tomorrow'
  if (day === jaDateKey(nowMs - 24 * HOUR)) return 'yesterday'
  const wall = asWall(ms)
  const days = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / (24 * HOUR))
  if (days > 1 && days < 7) return `on ${new Date(wall).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' })}`
  return `on ${new Date(wall).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' })}`
}

/** "about 6:00 PM tomorrow": when the hourly job will send. */
export function aboutWhen(ms: number, nowMs: number): string {
  return `about ${clockWords(asWall(ms))} ${relativeDay(ms, nowMs)}`
}

/** "at 6:02 PM yesterday": when something was sent. */
export function sentWhen(iso: string, nowMs: number): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return 'earlier'
  return `at ${clockWords(asWall(ms))} ${relativeDay(ms, nowMs)}`
}

export const rideLabel = (leg: Leg): string => (leg === 'arrival' ? 'Arrival' : 'Ride to the airport')

export function driverLine(d: ShownDriver | null): string {
  if (!d) return 'No driver yet'
  return [d.name, d.vehicle, d.plate].filter(Boolean).join(' · ')
}

/** "silver Toyota Hiace" from a booking's "Toyota Hiace, silver" (as lib/drivers stores it); else as stored. */
export function vehicleFromBooking(stored: string | null | undefined): string | null {
  const v = (stored ?? '').trim()
  if (!v) return null
  const m = v.match(/^(.+),\s*([a-z][a-z /-]*)$/)
  return m ? `${m[2]} ${m[1]}` : v
}

export function shownDriverOf(b: Bk): ShownDriver | null {
  if (!b.driver_name) return null
  return { name: b.driver_name, vehicle: vehicleFromBooking(b.driver_vehicle), plate: b.driver_plate ?? null }
}

function tourTimeWords(t: string | null | undefined): string {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return 'Not set'
  return clockWords(`2000-01-01T${t}:00.000Z`)
}

interface Ctx {
  plan: ChangePlan
  /** The booking before the change. */
  b: Bk
  nowMs: number
  /** The new driver, for a driver change. */
  driverAfter?: ShownDriver | null
  /** The new driver is not on WISE_PAYOUT_RECIPIENTS while payouts run. */
  payeeUnset?: boolean
  /** The question is asked because the day-of email went just as the change was saved. */
  raced?: boolean
}

function rideNote(c: Ctx, l: LegPlan): { note: string; next?: string; tone: Tone } {
  const g = guestNames(c.b.first_name)
  const isTime = c.plan.kind === 'time'
  const isArrival = l.leg === 'arrival'
  const newDriver = c.driverAfter ? firstWord(c.driverAfter.name) : 'the new driver'
  const before = shownDriverOf(c.b)
  const oldAt = isTime ? (c.plan.before.at as string) : null
  switch (l.outcome) {
    case 'automatic': {
      const when = aboutWhen(l.dayOfAt as number, c.nowMs)
      const what = isTime ? (isArrival ? 'the new landing time' : 'the new pickup time') : `will name ${newDriver}`
      return { note: isTime ? `${g.Whose} day-of email, ${when}, will show ${what}.` : `${g.Whose} day-of email, ${when}, ${what}.`, tone: 'ok' }
    }
    case 'decide': {
      if (l.why === 'sent_old') {
        const sent = l.dayOfSentAt ? sentWhen(l.dayOfSentAt, c.nowMs) : 'earlier'
        if (isTime) {
          const said = isArrival ? `said the flight lands at ${clockWords(oldAt as string)}` : `said ${clockWords(oldAt as string)}`
          return { note: `${g.Whose} day-of email went ${sent} and ${said}.`, next: `You choose next whether to email ${g.who} now.`, tone: 'ask' }
        }
        const named = before ? ` and named ${firstWord(before.name)}` : ''
        return { note: `${g.Whose} day-of email went ${sent}${named}.`, next: `You choose next whether to email ${g.who} now.`, tone: 'ask' }
      }
      return { note: `It's too late for ${g.whose} day-of email to carry this.`, next: `You choose next whether to email ${g.who} now.`, tone: 'ask' }
    }
    case 'no_driver':
      return { note: `No driver is on this ride yet, so ${g.whose} day-of email waits until you assign one. It will show the new time.`, tone: 'warn' }
    case 'unreachable':
      return { note: `This booking has no email address, so ${g.who} can't be emailed. Tell ${g.who} on WhatsApp. MAPL Tours Jamaica will be told.`, tone: 'warn' }
    default:
      return { note: 'This ride is over.', tone: 'muted' }
  }
}

function question(c: Ctx): QuestionWords | null {
  const decide = c.plan.legs.filter((l) => c.plan.decide.includes(l.leg))
  if (!decide.length) return null
  const g = guestNames(c.b.first_name)
  const isTime = c.plan.kind === 'time'
  const first = decide[0]
  const isArrival = first.leg === 'arrival'
  const before = shownDriverOf(c.b)
  const newDriver = c.driverAfter ?? shownDriverOf(c.b)
  const newFirst = newDriver ? firstWord(newDriver.name) : 'the driver'
  const sentOld = c.raced || decide.some((l) => l.why === 'sent_old')

  let body: string
  if (c.raced) {
    body = `${g.Whose} day-of email went out just as you saved, so it may still show the old details.`
  } else if (isTime) {
    const oldClock = clockWords(c.plan.before.at as string)
    body = sentOld
      ? (isArrival
        ? `${g.Whose} day-of email said the flight lands at ${oldClock}. Without a new email, ${g.who} has the old time.`
        : `${g.Whose} day-of email said ${oldClock}. Without a new email, ${g.who} will expect the old time.`)
      : `No automatic email reaches ${g.who} before ${isArrival ? 'the flight lands' : 'the new pickup time'}.`
  } else {
    body = sentOld && before
      ? `${g.Whose} day-of email named ${firstWord(before.name)}. Without a new email, ${g.who} will look for the wrong driver.`
      : `No automatic email reaches ${g.who} before this ride. Without one, ${g.who} won't know to look for ${newFirst}.`
  }

  const legsWords = decide.length > 1
    ? 'both rides'
    : `the ${isArrival ? 'arrival' : 'ride to the airport'} ${relativeDay(legInstantMs(first.at), c.nowMs)} at ${clockWords(first.at)}`
  const summary = isTime
    ? (isArrival
      ? `The email gives the new landing time, ${clockWords(first.at)} ${relativeDay(legInstantMs(first.at), c.nowMs)}, with ${newFirst}'s details.`
      : `The email gives the new pickup time, ${clockWords(first.at)} ${relativeDay(legInstantMs(first.at), c.nowMs)}, with ${newFirst}'s details.`)
    : `The email gives ${newDriver ? newDriver.name : 'the driver'}'s WhatsApp number, vehicle and plate, for ${legsWords}.`

  return {
    title: `Email ${g.who} now?`,
    body,
    summary,
    send: `Save and email ${g.who}`,
    skip: 'Save without emailing',
    skipNote: `MAPL Tours Jamaica gets an alert that ${g.who} wasn't emailed.`,
  }
}

/** The words for a planned change. */
export function planWords(c: Ctx): PlanWords {
  const g = guestNames(c.b.first_name)
  const { plan } = c
  const notes: { text: string; tone: Tone }[] = []
  let title: string
  let from: PlanWords['from']
  let to: PlanWords['to']

  if (plan.kind === 'driver') {
    const before = shownDriverOf(c.b)
    title = before ? 'Change the driver' : 'Assign a driver'
    from = { label: 'Now', value: driverLine(before) }
    to = { label: 'New', value: driverLine(c.driverAfter ?? null) }
    if (c.b.booking_type === 'tour') {
      notes.push({ text: `Tour guests aren't emailed about their driver. Tell ${g.who} yourself if needed.`, tone: 'muted' })
    } else if (c.payeeUnset && c.driverAfter) {
      notes.push({ text: `${c.driverAfter.name} isn't set up for payment yet, so payment for ${plan.legs.length > 1 ? 'these rides' : 'this ride'} is held until MAPL Tours Jamaica adds ${firstWord(c.driverAfter.name)}. Saving tells them.`, tone: 'caution' })
    }
  } else if (plan.kind === 'time') {
    const isArrival = plan.leg === 'arrival'
    title = isArrival ? 'Change the landing time' : 'Change the hotel pickup'
    const was = plan.before.at as string
    const now = plan.after.at as string
    from = { label: 'Now', value: rideWhen(was) }
    to = { label: 'New', value: rideWhen(now) }
    if (was.slice(0, 10) !== now.slice(0, 10)) notes.push({ text: `This moves the ride to ${rideDayLong(now)}.`, tone: 'caution' })
  } else {
    const was = plan.before.pickup_time
    title = was ? 'Change the tour pickup time' : 'Set the tour pickup time'
    from = { label: 'Now', value: tourTimeWords(was) }
    to = { label: 'New', value: tourTimeWords(plan.after.pickup_time) }
    notes.push({ text: `MAPL Tours Jamaica doesn't email tour guests their pickup time. Tell ${g.who} yourself, on WhatsApp or by phone.`, tone: 'muted' })
  }

  const rides: RideWords[] = plan.legs.map((l) => ({ leg: l.leg, label: rideLabel(l.leg), when: rideWhen(l.at), ...rideNote(c, l) }))
  const q = question(c)
  return { title, from, to, rides, notes, primary: q ? 'Continue' : 'Save change', question: q }
}

export type GuestOutcome = 'automatic' | 'sent' | 'failed' | 'skipped' | 'not_needed' | 'unreachable' | 'pending'

/** The line shown once the change is saved. */
export function resultWords(outcome: GuestOutcome, firstName: string | null | undefined): string {
  const g = guestNames(firstName)
  switch (outcome) {
    case 'sent': return `Saved. ${g.Who} was emailed.`
    case 'automatic': return `Saved. ${g.Whose} day-of email will carry it.`
    case 'skipped': return `Saved. ${g.Who} wasn't emailed, and MAPL Tours Jamaica was told.`
    case 'failed': return `Saved, but the email to ${g.who} didn't go. MAPL Tours Jamaica was told. Tell ${g.who} on WhatsApp, or try the email again.`
    case 'unreachable': return `Saved. ${g.Who} has no email address, so MAPL Tours Jamaica was told.`
    case 'pending': return 'Saved.'
    default: return 'Saved.'
  }
}
