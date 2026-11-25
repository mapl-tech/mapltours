import { bookingRef, legInstantMs, type Bk } from '@/lib/dispatch'
import { clockWords, type Leg } from '@/lib/driver-update'
import type { ChangePlan, LegPlan } from '@/lib/dispatch-change'
import { aboutWhen, firstWord, guestNames, relativeDay, rideLabel, rideWhen, sentWhen, type QuestionWords, type Tone } from '@/lib/dispatch-change-words'
import type { EditField, DriverRole } from '@/lib/driver-edit'
import type { DriverFields } from '@/lib/drivers'

/**
 * The words of the review step when a saved driver's details change (Nov 25
 * 2026), built on the server from the plan (lib/driver-edit-server) and read
 * line by line in tests/unit/driver-edit.spec.ts. The same house rules as the
 * change dialog: the guest by first name, never a pronoun, Jamaica times, no
 * em dashes.
 */

export interface EditRideWords {
  bookingId: string
  /** "MAPL-1A2B3C4D · Ada" */
  title: string
  lines: { leg: Leg | null; label: string; when: string | null; note: string; next?: string; tone: Tone }[]
}

export interface EditWords {
  title: string
  diff: { label: string; from: string; to: string }[]
  rides: EditRideWords[]
  /** One plain line under the rides' heading, when there are rides: what saving does to them. */
  ridesIntro: string | null
  notes: { text: string; tone: Tone }[]
  primary: string
  question: QuestionWords | null
}

const LABEL: Record<EditField, string> = { name: 'Name', whatsapp: 'WhatsApp', vehicle: 'Vehicle', colour: 'Vehicle', plate: 'Plate', email: 'Sign-in email' }

const vehicleWords = (d: Pick<DriverFields, 'vehicle' | 'colour'>) => `${d.colour} ${d.vehicle}`

/** The changed details as Now/New rows; the vehicle and its colour are one row. */
export function diffRows(before: DriverFields, after: DriverFields, changed: EditField[], role?: { from: DriverRole; to: DriverRole }) {
  const rows: { label: string; from: string; to: string }[] = []
  for (const k of changed) {
    if (k === 'colour' && changed.includes('vehicle')) continue
    if (k === 'vehicle' || k === 'colour') { rows.push({ label: LABEL.vehicle, from: vehicleWords(before), to: vehicleWords(after) }); continue }
    rows.push({ label: LABEL[k], from: (before[k] as string | null) || 'None', to: (after[k] as string | null) || 'None' })
  }
  if (role && role.from !== role.to) rows.push({ label: 'Role', from: role.from === 'fleet_manager' ? 'Fleet manager' : 'Driver', to: role.to === 'fleet_manager' ? 'Fleet manager' : 'Driver' })
  return rows
}

function legLine(b: Bk, l: LegPlan, nowMs: number): EditRideWords['lines'][number] {
  const g = guestNames(b.first_name)
  const base = { leg: l.leg, label: rideLabel(l.leg), when: rideWhen(l.at) }
  switch (l.outcome) {
    case 'automatic':
      return { ...base, note: `${g.Whose} day-of email, ${aboutWhen(l.dayOfAt as number, nowMs)}, will have the new details.`, tone: 'ok' }
    case 'decide':
      return l.why === 'sent_old'
        ? { ...base, note: `${g.Whose} day-of email went ${l.dayOfSentAt ? sentWhen(l.dayOfSentAt, nowMs) : 'earlier'} with the old details.`, next: `You choose next whether to email ${g.who} now.`, tone: 'ask' }
        : { ...base, note: `It's too late for ${g.whose} day-of email to carry this.`, next: `You choose next whether to email ${g.who} now.`, tone: 'ask' }
    case 'unreachable':
      return { ...base, note: `This booking has no email address, so ${g.who} can't be emailed. Tell ${g.who} on WhatsApp. MAPL Tours Jamaica will be told.`, tone: 'warn' }
    case 'no_driver':
      return { ...base, note: `${g.Whose} day-of email will have the new details.`, tone: 'ok' }
    default:
      return { ...base, note: 'This ride is over.', tone: 'muted' }
  }
}

export interface EditWordsInput {
  name: string
  before: DriverFields
  after: DriverFields
  changed: EditField[]
  role?: { from: DriverRole; to: DriverRole }
  rides: { b: Bk; plan: ChangePlan }[]
  /** Rides that name this driver with other details: left as they are. */
  other: number
  nowMs: number
  payeeUnset: boolean
}

export function editWords(c: EditWordsInput): EditWords {
  const first = firstWord(c.after.name)
  const notes: EditWords['notes'] = []
  const rides: EditRideWords[] = c.rides.map(({ b, plan }) => {
    const g = guestNames(b.first_name)
    const title = `${bookingRef(b.id)} · ${g.Who}`
    if (b.booking_type === 'tour') {
      const days = ((b.booking_items ?? []) as { date?: string | null; title?: string | null }[])
      const day = days.map((i) => String(i.date ?? '').slice(0, 10)).filter(Boolean).sort()[0] ?? null
      return { bookingId: b.id, title, lines: [{ leg: null, label: 'Tour', when: day ? new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }) : null, note: `Tour guests aren't emailed about their driver. Tell ${g.who} yourself if needed.`, tone: 'muted' as Tone }] }
    }
    return { bookingId: b.id, title, lines: plan.legs.map((l) => legLine(b, l, c.nowMs)) }
  })

  const guestFacing = c.changed.some((k) => k !== 'email')
  const roleMoves = !!c.role && c.role.from !== c.role.to
  if (!guestFacing) {
    const what = c.changed.includes('email') && roleMoves ? 'the sign-in email or the role' : c.changed.includes('email') ? 'the sign-in email' : 'the role'
    notes.push({ text: `No guest sees ${what}, so no ride changes.`, tone: 'muted' })
  } else if (!c.rides.length) {
    notes.push({ text: `${first} has no rides ahead with these details. Rides given to ${first} from now on carry the new ones.`, tone: 'muted' })
  }
  // Said under the rides' heading, not as a card of its own: only rides look like rides.
  const ridesIntro = guestFacing && c.rides.length
    ? `Saving gives ${c.rides.length === 1 ? 'this ride' : 'these rides'} ${first}'s new details. Past rides keep what their guests were told.`
    : null
  if (c.other > 0) notes.push({ text: `${c.other === 1 ? '1 ride ahead names' : `${c.other} rides ahead name`} ${first} with other details and ${c.other === 1 ? 'is' : 'are'} left as ${c.other === 1 ? 'it is' : 'they are'}.`, tone: 'caution' })
  if (c.changed.includes('email')) {
    notes.push(c.after.email
      ? { text: `${first} will sign in to the driver portal with ${c.after.email}.`, tone: 'muted' }
      : { text: `With no email, ${first} can no longer sign in to the driver portal.`, tone: 'caution' })
  }
  if (roleMoves) {
    notes.push(c.role!.to === 'fleet_manager'
      ? { text: `As fleet manager, ${first} will see every ride and tour in the driver portal, with pay, and can change drivers and times and add drivers.`, tone: 'caution' }
      : { text: `As a driver, ${first} will see only the rides and tours given to ${first}, with no pay.`, tone: 'caution' })
  }
  if (c.payeeUnset) notes.push({ text: `${c.after.name} isn't set up for payment yet, so rides under the new name are held until MAPL Tours Jamaica adds it. Saving tells them.`, tone: 'caution' })

  // The question: the guests who already have the old details, or who no automatic email can reach in time.
  const asked = c.rides.flatMap(({ b, plan }) => plan.legs.filter((l) => plan.decide.includes(l.leg)).map((l) => ({ b, l })))
  let question: QuestionWords | null = null
  if (asked.length) {
    // One entry per booking: a round trip's two rides sit together in one bracket.
    const people = Array.from(new Set(asked.map(({ b }) => b.id))).map((id) => ({ b: asked.find((x) => x.b.id === id)!.b, legs: asked.filter((x) => x.b.id === id).map((x) => x.l) }))
    const one = people.length === 1
    const name = (b: Bk) => guestNames(b.first_name).who
    const legWords = (l: LegPlan) => `${l.leg === 'arrival' ? 'arrival' : 'ride to the airport'} ${relativeDay(legInstantMs(l.at), c.nowMs)} at ${clockWords(l.at)}`
    const list = people.map(({ b, legs }) => `${name(b)} (${legs.map(legWords).join(' and ')})`)
    const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
    // What a guest holding the old details might get wrong, from what changed.
    const risks = [
      ...(c.changed.some((k) => k === 'vehicle' || k === 'colour' || k === 'plate') ? ['look for the wrong vehicle'] : []),
      ...(c.changed.includes('whatsapp') ? ['message the old number'] : []),
      ...(c.changed.includes('name') ? ['ask for the wrong driver'] : []),
    ]
    const risk = risks.length <= 1 ? (risks[0] ?? 'miss the change') : `${risks.slice(0, -1).join(', ')} or ${risks[risks.length - 1]}`
    const was = firstWord(c.before.name)
    question = {
      title: one ? `Email ${name(people[0].b)} now?` : `Email these ${people.length} guests now?`,
      body: one
        ? `${joined.charAt(0).toUpperCase() + joined.slice(1)} has ${was}'s old details. Without a new email, ${name(people[0].b)} may ${risk}.`
        : `${joined.charAt(0).toUpperCase() + joined.slice(1)} have ${was}'s old details. Without a new email, they may ${risk}.`,
      summary: `${one ? 'The email gives' : 'Each email gives'} ${first}'s new details for that ride.`,
      send: one ? `Save and email ${name(people[0].b)}` : people.length === 2 ? 'Save and email both' : `Save and email all ${people.length}`,
      skip: 'Save without emailing',
      skipNote: one ? `MAPL Tours Jamaica gets an alert that ${name(people[0].b)} wasn't emailed.` : `MAPL Tours Jamaica gets an alert that they weren't emailed.`,
    }
  }

  return {
    title: `Change ${c.name}'s details`,
    diff: diffRows(c.before, c.after, c.changed, c.role),
    rides,
    ridesIntro,
    notes,
    primary: question ? 'Continue' : 'Save changes',
    question,
  }
}
