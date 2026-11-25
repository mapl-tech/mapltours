import { describe, test, expect } from 'vitest'
import { render } from '@react-email/render'
import DriverUpdate from '@/emails/DriverUpdate'
import { planChange } from '@/lib/dispatch-change'
import { bookingAhead, carries, changedFields, columnsOf, lockedFields, touchesGuests, type SavedDriver } from '@/lib/driver-edit'
import { diffRows, editWords, type EditWords, type EditWordsInput } from '@/lib/driver-edit-words'
import { buildDriverUpdate } from '@/lib/driver-update'
import type { Driver, DriverFields } from '@/lib/drivers'

/**
 * Changing a saved driver's details (Nov 25 2026): the rules (lib/driver-edit),
 * the words of the review a fleet manager or an admin reads before saving
 * (lib/driver-edit-words), and the email a guest gets when the details they
 * were given changed (lib/driver-update, `about: details`). The owner: "have
 * the fleet manager be able to enter the vehicle information for drivers as
 * well. So make him able to edit driver details. Make sure it is perfect.
 * There can be no mistake." Made-up guests and drivers.
 */

const HOUR = 3_600_000
const wall = (s: string) => `${s}:00+00:00`
const ja = (s: string) => Date.parse(`${s}:00Z`) + 5 * HOUR
const NOW = ja('2026-11-26T09:00')

const devonRow: SavedDriver = { id: '11111111-1111-4111-8111-111111111111', name: 'Devon Brown', whatsapp: '+1 876 555 0100', vehicle: 'Toyota Hiace', colour: 'silver', plate: 'PJ 1234', email: 'devon@example.com', active: true, role: 'driver' }
const leeRow: SavedDriver = { id: '33333333-3333-4333-8333-333333333333', name: 'Lee Grant', whatsapp: '+1 876 555 0102', vehicle: 'Toyota Noah', colour: 'white', plate: 'PK 0002', email: 'lee@example.com', active: true, role: 'fleet_manager' }
const fields = (d: SavedDriver): DriverFields => ({ name: d.name, whatsapp: d.whatsapp, vehicle: d.vehicle, colour: d.colour, plate: d.plate, email: d.email })
const newVan: DriverFields = { ...fields(devonRow), vehicle: 'Toyota Noah', colour: 'white', plate: 'PK 0009' }
const devonCols = columnsOf(devonRow)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ride = (over: Record<string, any> = {}, item: Record<string, any> = {}) => ({
  id: 'abcd1234-6c73-444e-83c6-1f79f15a59d1', booking_type: 'transfer', status: 'paid', email: 'maya@example.com', first_name: 'Maya', ...devonCols, dispatch: {},
  booking_items: [{ item_type: 'transfer', hotel: 'Seaview Resort, Negril', trip_type: 'round_trip', passengers: 2, arrival_at: wall('2026-11-27T14:10'), arrival_flight: 'AA 1311', departure_at: wall('2026-11-30T15:30'), departure_flight: 'AA1312', ...item }],
  ...over,
})
const sentAt = (s: string) => new Date(ja(s) + 4000).toISOString()
/** Kim lands today at 4:00 PM, and the day-of email went at 6:00 this morning with the old details. */
const kim = () => ride({ id: 'bbbb5678-6c73-444e-83c6-1f79f15a59d1', first_name: 'Kim', email: 'kim@example.com', dispatch: { dayof_arrival_sent: sentAt('2026-11-26T06:00') } }, { trip_type: 'one_way', arrival_at: wall('2026-11-26T16:00'), departure_at: null })
const tour = (over: Record<string, unknown> = {}) => ({ id: 'cccc9012-6c73-444e-83c6-1f79f15a59d1', booking_type: 'tour', status: 'paid', email: 'tom@example.com', first_name: 'Tom', pickup_time: null, ...devonCols, booking_items: [{ item_type: 'experience', title: 'River rafting', date: '2026-12-02' }], ...over })

function words(over: Partial<EditWordsInput> & { bookings?: Record<string, unknown>[]; to?: DriverFields } = {}): EditWords {
  const to = over.to ?? newVan
  const before = over.before ?? fields(devonRow)
  const changed = over.changed ?? changedFields({ ...devonRow, ...before } as SavedDriver, to)
  const bookings = over.bookings ?? [ride()]
  return editWords({
    name: over.name ?? before.name,
    before,
    after: to,
    changed,
    role: over.role,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rides: bookings.map((b) => ({ b: b as any, plan: planChange(b as any, { kind: 'driver', after: columnsOf(to) }, over.nowMs ?? NOW) })),
    other: over.other ?? 0,
    nowMs: over.nowMs ?? NOW,
    payeeUnset: over.payeeUnset ?? false,
  })
}

function allText(w: EditWords): string[] {
  return [w.title, w.primary, w.ridesIntro ?? '', ...w.diff.flatMap((r) => [r.label, r.from, r.to]), ...w.rides.flatMap((r) => [r.title, ...r.lines.flatMap((l) => [l.label, l.when ?? '', l.note, l.next ?? ''])]),
    ...w.notes.map((n) => n.text), ...(w.question ? Object.values(w.question) : [])]
}

describe('the rules', () => {
  test('a fleet manager may change any regular driver in full, and a fleet manager except the name and the sign-in email; an admin, anything', () => {
    expect(lockedFields(devonRow, 'fleet_manager')).toEqual([])
    expect(lockedFields(leeRow, 'fleet_manager')).toEqual(['name', 'email'])
    expect(lockedFields(leeRow, 'admin')).toEqual([])
    expect(lockedFields({ ...devonRow, role: null }, 'fleet_manager')).toEqual([])
  })

  test('what changed, in display order, spaces aside; only what a guest is told moves rides', () => {
    expect(changedFields(devonRow, { ...newVan, email: 'devon@example.com' })).toEqual(['vehicle', 'colour', 'plate'])
    expect(changedFields(devonRow, { ...fields(devonRow), name: ' Devon Brown ' })).toEqual([])
    expect(changedFields(devonRow, { ...fields(devonRow), email: null, whatsapp: '+1 876 555 0199' })).toEqual(['whatsapp', 'email'])
    expect(touchesGuests(['email'])).toBe(false)
    expect(touchesGuests([])).toBe(false)
    for (const k of ['name', 'whatsapp', 'vehicle', 'colour', 'plate'] as const) expect(touchesGuests([k])).toBe(true)
  })

  test('a booking carries a driver only with every detail exactly as saved', () => {
    expect(carries(ride() as never, devonCols)).toBe(true)
    expect(carries(ride({ driver_vehicle: 'Toyota Hiace, grey' }) as never, devonCols)).toBe(false)
    expect(carries(ride({ driver_phone: '+18765550100' }) as never, devonCols)).toBe(false)
    expect(carries(ride({ driver_name: 'devon brown' }) as never, devonCols)).toBe(false)
  })

  test('still ahead: an arrival until two hours after landing, a pickup until its time, a tour day from today', () => {
    const b = ride({}, { trip_type: 'one_way', arrival_at: wall('2026-11-26T08:00'), departure_at: null })
    expect(bookingAhead(b as never, ja('2026-11-26T09:59'))).toBe(true)
    expect(bookingAhead(b as never, ja('2026-11-26T10:00'))).toBe(false)
    const home = ride({}, { trip_type: 'one_way', arrival_at: null, departure_at: wall('2026-11-26T12:00') })
    expect(bookingAhead(home as never, ja('2026-11-26T11:59'))).toBe(true)
    expect(bookingAhead(home as never, ja('2026-11-26T12:00'))).toBe(false)
    // A round trip whose arrival is over is still ahead by its ride home.
    expect(bookingAhead(ride() as never, ja('2026-11-28T09:00'))).toBe(true)
    expect(bookingAhead(ride() as never, ja('2026-11-30T15:31'))).toBe(false)
    expect(bookingAhead(tour() as never, ja('2026-12-02T23:00'))).toBe(true)
    expect(bookingAhead(tour() as never, ja('2026-12-03T00:01'))).toBe(false)
    expect(bookingAhead(ride({ booking_items: [] }) as never, NOW)).toBe(false)
  })
})

describe('the review, sentence by sentence', () => {
  test('a new van, rides days ahead: the change, each ride and when its guest hears, then save', () => {
    const w = words()
    expect(w.title).toBe("Change Devon Brown's details")
    expect(w.diff).toEqual([
      { label: 'Vehicle', from: 'silver Toyota Hiace', to: 'white Toyota Noah' },
      { label: 'Plate', from: 'PJ 1234', to: 'PK 0009' },
    ])
    expect(w.rides).toEqual([{
      bookingId: 'abcd1234-6c73-444e-83c6-1f79f15a59d1',
      title: 'MAPL-ABCD1234 · Maya',
      lines: [
        { leg: 'arrival', label: 'Arrival', when: 'Fri, Nov 27 · 2:10 PM', note: "Maya's day-of email, about 2:00 AM tomorrow, will have the new details.", tone: 'ok' },
        { leg: 'departure', label: 'Ride to the airport', when: 'Mon, Nov 30 · 3:30 PM', note: "Maya's day-of email, about 3:00 AM on Monday, will have the new details.", tone: 'ok' },
      ],
    }])
    // The summary is a plain line under the rides' heading, never a card that looks like another ride.
    expect(w.ridesIntro).toBe("Saving gives this ride Devon's new details. Past rides keep what their guests were told.")
    expect(w.notes).toEqual([])
    expect(w.primary).toBe('Save changes')
    expect(w.question).toBeNull()
  })

  test('a guest whose day-of email already went with the old details: asked about, by name, with what could go wrong', () => {
    const w = words({ bookings: [kim(), ride()] })
    expect(w.rides[0].lines).toEqual([
      { leg: 'arrival', label: 'Arrival', when: 'Thu, Nov 26 · 4:00 PM', note: "Kim's day-of email went at 6:00 AM today with the old details.", next: 'You choose next whether to email Kim now.', tone: 'ask' },
    ])
    expect(w.ridesIntro).toBe("Saving gives these rides Devon's new details. Past rides keep what their guests were told.")
    expect(w.primary).toBe('Continue')
    expect(w.question).toEqual({
      title: 'Email Kim now?',
      body: "Kim (arrival today at 4:00 PM) has Devon's old details. Without a new email, Kim may look for the wrong vehicle.",
      summary: "The email gives Devon's new details for that ride.",
      send: 'Save and email Kim',
      skip: 'Save without emailing',
      skipNote: "MAPL Tours Jamaica gets an alert that Kim wasn't emailed.",
    })
  })

  test("a round trip on one day with both day-of emails gone: one guest, both rides in one bracket", () => {
    const b = ride({ first_name: 'Joy', dispatch: { dayof_arrival_sent: sentAt('2026-11-26T05:00'), dayof_departure_sent: sentAt('2026-11-26T06:00') } }, { arrival_at: wall('2026-11-26T10:00'), departure_at: wall('2026-11-26T20:00') })
    const w = words({ bookings: [b] })
    expect(w.question?.title).toBe('Email Joy now?')
    expect(w.question?.body).toBe("Joy (arrival today at 10:00 AM and ride to the airport today at 8:00 PM) has Devon's old details. Without a new email, Joy may look for the wrong vehicle.")
    expect(w.question?.send).toBe('Save and email Joy')
  })

  test('two or three guests to ask: named together, with a button for all of them', () => {
    const two = words({ bookings: [kim(), { ...kim(), id: 'dddd3456-6c73-444e-83c6-1f79f15a59d1', first_name: 'Ana', email: 'ana@example.com' }] })
    expect(two.question).toMatchObject({
      title: 'Email these 2 guests now?',
      body: "Kim (arrival today at 4:00 PM) and Ana (arrival today at 4:00 PM) have Devon's old details. Without a new email, they may look for the wrong vehicle.",
      summary: "Each email gives Devon's new details for that ride.",
      send: 'Save and email both',
      skipNote: "MAPL Tours Jamaica gets an alert that they weren't emailed.",
    })
    const three = words({ bookings: [kim(), { ...kim(), id: 'dddd3456-6c73-444e-83c6-1f79f15a59d1', first_name: 'Ana' }, { ...kim(), id: 'eeee3456-6c73-444e-83c6-1f79f15a59d1', first_name: 'Sol' }] })
    expect(three.question?.send).toBe('Save and email all 3')
    expect(three.question?.body.startsWith('Kim (arrival today at 4:00 PM), Ana (arrival today at 4:00 PM) and Sol (arrival today at 4:00 PM) have')).toBe(true)
  })

  test('what could go wrong follows what changed', () => {
    const ask = (to: DriverFields) => words({ bookings: [kim()], to }).question?.body.replace(/^.* may /, '')
    expect(ask({ ...fields(devonRow), whatsapp: '+1 876 555 0199' })).toBe('message the old number.')
    expect(ask({ ...fields(devonRow), name: 'Devon Browne' })).toBe('ask for the wrong driver.')
    expect(ask({ ...fields(devonRow), plate: 'PJ 1235' })).toBe('look for the wrong vehicle.')
    expect(ask({ ...newVan, whatsapp: '+1 876 555 0199' })).toBe('look for the wrong vehicle or message the old number.')
    expect(ask({ ...newVan, whatsapp: '+1 876 555 0199', name: 'Devon Browne' })).toBe('look for the wrong vehicle, message the old number or ask for the wrong driver.')
  })

  test('a renamed driver: the old details are said by the old name, the new ones by the new', () => {
    const w = words({ bookings: [kim()], to: { ...fields(devonRow), name: 'Devin Brown' } })
    expect(w.title).toBe("Change Devon Brown's details")
    expect(w.diff).toEqual([{ label: 'Name', from: 'Devon Brown', to: 'Devin Brown' }])
    expect(w.question?.body).toBe("Kim (arrival today at 4:00 PM) has Devon's old details. Without a new email, Kim may ask for the wrong driver.")
    expect(w.question?.summary).toBe("The email gives Devin's new details for that ride.")
  })

  test('no email address: the person is told to tell the guest on WhatsApp, and that the office will know', () => {
    const w = words({ bookings: [{ ...kim(), email: null }] })
    expect(w.rides[0].lines[0]).toMatchObject({ tone: 'warn', note: "This booking has no email address, so Kim can't be emailed. Tell Kim on WhatsApp. MAPL Tours Jamaica will be told." })
    expect(w.question).toBeNull()
    expect(w.primary).toBe('Save changes')
  })

  test('a tour: carried along, and the person is told tour guests are not emailed about their driver', () => {
    const w = words({ bookings: [tour() as never] })
    expect(w.rides[0]).toEqual({
      bookingId: 'cccc9012-6c73-444e-83c6-1f79f15a59d1', title: 'MAPL-CCCC9012 · Tom',
      lines: [{ leg: null, label: 'Tour', when: 'Wed, Dec 2', note: "Tour guests aren't emailed about their driver. Tell Tom yourself if needed.", tone: 'muted' }],
    })
    expect(w.question).toBeNull()
  })

  test('only the sign-in email, or only the role: no ride moves, and the review says what follows', () => {
    const email = words({ bookings: [], to: { ...fields(devonRow), email: 'devon.b@example.com' } })
    expect(email.diff).toEqual([{ label: 'Sign-in email', from: 'devon@example.com', to: 'devon.b@example.com' }])
    expect(email.rides).toEqual([])
    expect(email.ridesIntro).toBeNull()
    expect(email.notes).toEqual([
      { text: 'No guest sees the sign-in email, so no ride changes.', tone: 'muted' },
      { text: 'Devon will sign in to the driver portal with devon.b@example.com.', tone: 'muted' },
    ])
    const gone = words({ bookings: [], to: { ...fields(devonRow), email: null } })
    expect(gone.diff).toEqual([{ label: 'Sign-in email', from: 'devon@example.com', to: 'None' }])
    expect(gone.notes[1]).toEqual({ text: 'With no email, Devon can no longer sign in to the driver portal.', tone: 'caution' })
    const role = words({ bookings: [], to: fields(devonRow), changed: [], role: { from: 'driver', to: 'fleet_manager' } })
    expect(role.diff).toEqual([{ label: 'Role', from: 'Driver', to: 'Fleet manager' }])
    expect(role.notes).toEqual([
      { text: 'No guest sees the role, so no ride changes.', tone: 'muted' },
      { text: 'As fleet manager, Devon will see every ride and tour in the driver portal, with pay, and can change drivers and times and add drivers.', tone: 'caution' },
    ])
    const back = words({ bookings: [], to: fields(devonRow), changed: [], role: { from: 'fleet_manager', to: 'driver' } })
    expect(back.notes[1].text).toBe('As a driver, Devon will see only the rides and tours given to Devon, with no pay.')
    const both = words({ bookings: [], to: { ...fields(devonRow), email: 'devon.b@example.com' }, role: { from: 'driver', to: 'fleet_manager' } })
    expect(both.notes[0].text).toBe('No guest sees the sign-in email or the role, so no ride changes.')
  })

  test('no rides ahead, rides with other details, and a name the payout job cannot pay', () => {
    expect(words({ bookings: [] }).notes).toEqual([{ text: 'Devon has no rides ahead with these details. Rides given to Devon from now on carry the new ones.', tone: 'muted' }])
    expect(words({ bookings: [] }).ridesIntro).toBeNull()
    expect(words({ other: 1 }).notes[0]).toEqual({ text: '1 ride ahead names Devon with other details and is left as it is.', tone: 'caution' })
    expect(words({ other: 2 }).notes[0].text).toBe('2 rides ahead name Devon with other details and are left as they are.')
    const renamed = words({ to: { ...fields(devonRow), name: 'Devin Brown' }, payeeUnset: true })
    expect(renamed.notes.at(-1)).toEqual({ text: "Devin Brown isn't set up for payment yet, so rides under the new name are held until MAPL Tours Jamaica adds it. Saving tells them.", tone: 'caution' })
  })

  test('the vehicle and its colour are one row; an empty value reads None', () => {
    expect(diffRows(fields(devonRow), { ...fields(devonRow), colour: 'grey' }, ['colour'])).toEqual([{ label: 'Vehicle', from: 'silver Toyota Hiace', to: 'grey Toyota Hiace' }])
    expect(diffRows({ ...fields(devonRow), email: null }, fields(devonRow), ['email'])).toEqual([{ label: 'Sign-in email', from: 'None', to: 'devon@example.com' }])
  })

  test('the house rules, in every sentence of every review', () => {
    const texts = [
      words(), words({ bookings: [kim(), ride()] }), words({ bookings: [{ ...kim(), email: null }] }), words({ bookings: [tour() as never] }),
      words({ bookings: [kim()], to: { ...newVan, whatsapp: '+1 876 555 0199', name: 'Devin Brown' }, payeeUnset: true, other: 2 }),
      words({ bookings: [], to: { ...fields(devonRow), email: null }, role: { from: 'driver', to: 'fleet_manager' } }),
      words({ bookings: [ride({ first_name: '  ' })] }),
    ].flatMap(allText)
    for (const t of texts) {
      expect(t).not.toMatch(/[—–→←]|->/)
      expect(t).not.toMatch(/\b(he|she|him|her|his|hers)\b/i)
      expect(t).not.toMatch(/\bcollect/i)
      for (const m of Array.from(t.matchAll(/MAPL(?!-[A-Z0-9])[^\n]{0,14}/g))) expect(m[0]).toMatch(/^MAPL Tours Jamaica/)
    }
  })
})

describe('the email a guest gets about new details', () => {
  const driver = (f: DriverFields): Driver => ({ id: devonRow.id, ...f, active: true })
  const mail = async (b: ReturnType<typeof ride>, leg: 'arrival' | 'departure', to: DriverFields, nowMs = NOW) => {
    const after = { ...b, ...columnsOf(to) }
    const m = buildDriverUpdate(after as never, leg, driver(to), nowMs, true, { kind: 'details', before: devonCols })
    return { ...m, text: await render(DriverUpdate(m.props), { plainText: true }) }
  }

  test('a new van for tomorrow\'s arrival: the subject, the headline, and what changed, said once', async () => {
    const m = await mail(ride(), 'arrival', newVan)
    expect(m.subject).toBe('Your driver tomorrow: updated details (MAPL-ABCD1234)')
    expect(m.props.eyebrow).toBe('Tomorrow · Driver details')
    expect(m.props.headline).toBe('Updated details for your driver tomorrow.')
    expect(m.props.lead).toBe('Devon Brown now drives a white Toyota Noah, plate PK 0009. Everything else about your ride stays the same.')
    expect(m.props.preheader).toBe('Devon Brown, white Toyota Noah, plate PK 0009, WhatsApp +1 876 555 0100 · MAPL-ABCD1234')
    expect(m.text).toContain('PK 0009')
    expect(m.text).not.toContain('PJ 1234')
    expect(m.text).not.toContain('silver')
  })

  test('the ride home on a later day, a new number, a new name', async () => {
    const home = await mail(ride(), 'departure', newVan)
    expect(home.subject).toBe('Your ride to the airport on Monday, November 30: updated driver details (MAPL-ABCD1234)')
    expect(home.props.eyebrow).toBe('Driver details')
    const phone = await mail(ride(), 'arrival', { ...fields(devonRow), whatsapp: '+1 876 555 0199' })
    expect(phone.props.lead).toBe("Devon's WhatsApp number is now +1 876 555 0199. Everything else about your ride stays the same.")
    expect(phone.text).toContain('+1 876 555 0199')
    const name = await mail(ride(), 'arrival', { ...fields(devonRow), name: 'Devin Brown' })
    expect(name.props.lead).toBe("We had your driver's name as Devon Brown. It is Devin Brown. Everything else about your ride stays the same.")
    const all = await mail(ride(), 'arrival', { ...newVan, name: 'Devin Brown', whatsapp: '+1 876 555 0199' })
    expect(all.props.lead).toBe("We had your driver's name as Devon Brown. It is Devin Brown. Devin Brown now drives a white Toyota Noah, plate PK 0009. Devin's WhatsApp number is now +1 876 555 0199. Everything else about your ride stays the same.")
  })

  test('the house rules hold in every new-details email', async () => {
    for (const [leg, to] of [['arrival', newVan], ['departure', { ...newVan, whatsapp: '+1 876 555 0199' }], ['arrival', { ...fields(devonRow), name: 'Devin Brown' }]] as const) {
      const m = await mail(ride(), leg, to)
      const all = `${m.subject}\n${m.props.preheader}\n${m.text}`
      expect(all).not.toMatch(/[—–]/)
      expect(all).not.toMatch(/\bcollect/i)
      expect(all).not.toMatch(/\b(he|she|him|her|his|hers)\b/i)
      for (const x of Array.from(all.matchAll(/MAPL(?!-[A-Z0-9])[^\n]{0,14}/g))) expect(x[0]).toMatch(/^MAPL Tours Jamaica/)
    }
  })
})
