import { describe, test, expect } from 'vitest'
import { render } from '@react-email/render'
import DriverUpdate from '@/emails/DriverUpdate'
import { planChange } from '@/lib/dispatch-change'
import { planWords, resultWords, relativeDay, vehicleFromBooking, guestNames, type PlanWords } from '@/lib/dispatch-change-words'
import { buildDriverUpdate, clockWords } from '@/lib/driver-update'

/**
 * The words of the driver portal's change dialogs (lib/dispatch-change-words)
 * and of the new-time email (lib/driver-update, `about: time`). The reader of
 * the dialogs is a fleet manager on a phone; the reader of the email is the
 * guest. Every sentence is checked against the ride it describes. Made-up
 * guests and drivers.
 */

const HOUR = 3_600_000
const wall = (s: string) => `${s}:00+00:00`
const ja = (s: string) => Date.parse(`${s}:00Z`) + 5 * HOUR
const devon = { driver_name: 'Devon Brown', driver_phone: '+1 876 555 0100', driver_vehicle: 'Toyota Hiace, silver', driver_plate: 'PJ 1234' }
const ann = { driver_name: 'Ann Lee', driver_phone: '+1 876 555 0101', driver_vehicle: 'Toyota Noah, black', driver_plate: 'PK 0001' }
const annShown = { name: 'Ann Lee', vehicle: 'black Toyota Noah', plate: 'PK 0001' }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ride = (over: Record<string, any> = {}, item: Record<string, any> = {}) => ({
  id: 'abcd1234-6c73-444e-83c6-1f79f15a59d1', booking_type: 'transfer', status: 'paid', email: 'guest@example.com', first_name: 'Maya', ...devon, dispatch: {},
  booking_items: [{ item_type: 'transfer', hotel: 'Seaview Resort, Negril', trip_type: 'round_trip', passengers: 2, arrival_at: wall('2026-11-27T14:10'), arrival_flight: 'AA 1311', departure_at: wall('2026-11-30T15:30'), departure_flight: 'AA1312', ...item }],
  ...over,
})
const sentAt = (s: string) => new Date(ja(s) + 4000).toISOString()
const tour = { id: 'b2', booking_type: 'tour', status: 'paid', email: 'g@example.com', first_name: 'Maya', pickup_time: null, driver_name: null, booking_items: [{ item_type: 'experience', date: '2026-12-02' }] }

/** Every string in a words object, for the copy rules. */
function allText(w: PlanWords): string[] {
  return [w.title, w.from.value, w.to.value, w.primary, ...w.rides.flatMap((r) => [r.label, r.when, r.note, r.next ?? '']), ...w.notes.map((n) => n.text),
    ...(w.question ? Object.values(w.question) : [])]
}

const scenarios: Record<string, () => PlanWords> = {
  driverAhead: () => planWords({ plan: planChange(ride(), { kind: 'driver', after: ann }, ja('2026-11-26T09:00')), b: ride(), nowMs: ja('2026-11-26T09:00'), driverAfter: annShown }),
  driverPayee: () => planWords({ plan: planChange(ride(), { kind: 'driver', after: ann }, ja('2026-11-26T09:00')), b: ride(), nowMs: ja('2026-11-26T09:00'), driverAfter: annShown, payeeUnset: true }),
  driverAfterDayOf: () => {
    const b = ride({ dispatch: { dayof_departure_sent: sentAt('2026-11-30T03:00') } })
    return planWords({ plan: planChange(b, { kind: 'driver', after: ann }, ja('2026-11-30T08:00')), b, nowMs: ja('2026-11-30T08:00'), driverAfter: annShown })
  },
  pickupAhead: () => planWords({ plan: planChange(ride(), { kind: 'time', leg: 'departure', at: wall('2026-11-30T12:00') }, ja('2026-11-28T09:00')), b: ride(), nowMs: ja('2026-11-28T09:00') }),
  pickupNewDay: () => planWords({ plan: planChange(ride(), { kind: 'time', leg: 'departure', at: wall('2026-12-01T06:30') }, ja('2026-11-28T09:00')), b: ride(), nowMs: ja('2026-11-28T09:00') }),
  pickupAfterDayOf: () => {
    const b = ride({ dispatch: { dayof_departure_sent: sentAt('2026-11-30T03:00') } })
    return planWords({ plan: planChange(b, { kind: 'time', leg: 'departure', at: wall('2026-11-30T12:00') }, ja('2026-11-30T08:00')), b, nowMs: ja('2026-11-30T08:00') })
  },
  pickupTooLate: () => planWords({ plan: planChange(ride(), { kind: 'time', leg: 'departure', at: wall('2026-11-30T12:00') }, ja('2026-11-30T11:20')), b: ride(), nowMs: ja('2026-11-30T11:20') }),
  landingAfterDayOf: () => {
    const b = ride({ dispatch: { dayof_arrival_sent: sentAt('2026-11-27T01:00') } })
    return planWords({ plan: planChange(b, { kind: 'time', leg: 'arrival', at: wall('2026-11-27T16:05') }, ja('2026-11-27T08:00')), b, nowMs: ja('2026-11-27T08:00') })
  },
  tourTime: () => planWords({ plan: planChange(tour, { kind: 'tour_time', time: '12:00' }, ja('2026-11-28T09:00')), b: tour, nowMs: ja('2026-11-28T09:00') }),
  tourDriver: () => planWords({ plan: planChange(tour, { kind: 'driver', after: ann }, ja('2026-11-28T09:00')), b: tour, nowMs: ja('2026-11-28T09:00'), driverAfter: annShown }),
  noName: () => planWords({ plan: planChange(ride({ first_name: '  ' }), { kind: 'driver', after: ann }, ja('2026-11-26T09:00')), b: ride({ first_name: '  ' }), nowMs: ja('2026-11-26T09:00'), driverAfter: annShown }),
  noEmail: () => planWords({ plan: planChange(ride({ email: null }), { kind: 'driver', after: ann }, ja('2026-11-26T09:00')), b: ride({ email: null }), nowMs: ja('2026-11-26T09:00'), driverAfter: annShown }),
}

describe('the first step: what changes and when the guest hears', () => {
  test('a new driver days ahead: both rides, each with the time its day-of email will name the new driver', () => {
    const w = scenarios.driverAhead()
    expect(w.title).toBe('Change the driver')
    expect(w.from).toEqual({ label: 'Now', value: 'Devon Brown · silver Toyota Hiace · PJ 1234' })
    expect(w.to).toEqual({ label: 'New', value: 'Ann Lee · black Toyota Noah · PK 0001' })
    expect(w.rides).toEqual([
      { leg: 'arrival', label: 'Arrival', when: 'Fri, Nov 27 · 2:10 PM', note: "Maya's day-of email, about 2:00 AM tomorrow, will name Ann.", tone: 'ok' },
      { leg: 'departure', label: 'Ride to the airport', when: 'Mon, Nov 30 · 3:30 PM', note: "Maya's day-of email, about 3:00 AM on Monday, will name Ann.", tone: 'ok' },
    ])
    expect(w.notes).toEqual([])
    expect(w.primary).toBe('Save change')
    expect(w.question).toBe(null)
  })

  test('a driver the payout job cannot pay: the person is told before saving', () => {
    expect(scenarios.driverPayee().notes).toEqual([{ text: "Ann Lee isn't set up for payment yet, so payment for these rides is held until MAPL Tours Jamaica adds Ann. Saving tells them.", tone: 'caution' }])
  })

  test('after the day-of email went: what it said, and that a second step follows', () => {
    const w = scenarios.driverAfterDayOf()
    expect(w.rides[0].note).toBe("Maya's day-of email went at 3:00 AM today and named Devon.")
    expect(w.rides[0].next).toBe('You choose next whether to email Maya now.')
    expect(w.rides[0].tone).toBe('ask')
    expect(w.primary).toBe('Continue')
  })

  test('a new pickup time days ahead, and one that moves the ride to another day', () => {
    const w = scenarios.pickupAhead()
    expect(w.title).toBe('Change the hotel pickup')
    expect(w.from.value).toBe('Mon, Nov 30 · 3:30 PM')
    expect(w.to.value).toBe('Mon, Nov 30 · 12:00 noon')
    expect(w.rides[0].note).toBe("Maya's day-of email, about 11:00 PM tomorrow, will show the new pickup time.")
    const d = scenarios.pickupNewDay()
    expect(d.notes).toEqual([{ text: 'This moves the ride to Tuesday, December 1.', tone: 'caution' }])
    expect(d.rides[0].note).toBe("Maya's day-of email, about 6:00 PM on Monday, will show the new pickup time.")
  })

  test('a new pickup time after the day-of email, or too late for it', () => {
    expect(scenarios.pickupAfterDayOf().rides[0]).toMatchObject({ note: "Maya's day-of email went at 3:00 AM today and said 3:30 PM.", next: 'You choose next whether to email Maya now.' })
    expect(scenarios.pickupTooLate().rides[0]).toMatchObject({ note: "It's too late for Maya's day-of email to carry this.", next: 'You choose next whether to email Maya now.' })
  })

  test('a landing time', () => {
    const w = scenarios.landingAfterDayOf()
    expect(w.title).toBe('Change the landing time')
    expect(w.rides[0].note).toBe("Maya's day-of email went at 1:00 AM today and said the flight lands at 2:10 PM.")
  })

  test('tours: no email, said plainly', () => {
    const t = scenarios.tourTime()
    expect(t.title).toBe('Set the tour pickup time')
    expect(t.from.value).toBe('Not set')
    expect(t.to.value).toBe('12:00 noon')
    expect(t.notes[0].text).toBe("MAPL Tours Jamaica doesn't email tour guests their pickup time. Tell Maya yourself, on WhatsApp or by phone.")
    expect(t.question).toBe(null)
    const d = scenarios.tourDriver()
    expect(d.title).toBe('Assign a driver')
    expect(d.from.value).toBe('No driver yet')
    expect(d.notes[0].text).toBe("Tour guests aren't emailed about their driver. Tell Maya yourself if needed.")
  })

  test('a booking with no first name says "the guest"; one with no email says nobody can be emailed', () => {
    expect(scenarios.noName().rides[0].note).toBe("The guest's day-of email, about 2:00 AM tomorrow, will name Ann.")
    expect(scenarios.noEmail().rides[0].note).toBe("This booking has no email address, so Maya can't be emailed. Tell Maya on WhatsApp. MAPL Tours Jamaica will be told.")
    expect(guestNames(null).who).toBe('the guest')
  })
})

describe('the second step: email the guest now?', () => {
  test('a driver change after the day-of email', () => {
    expect(scenarios.driverAfterDayOf().question).toEqual({
      title: 'Email Maya now?',
      body: "Maya's day-of email named Devon. Without a new email, Maya will look for the wrong driver.",
      summary: "The email gives Ann Lee's WhatsApp number, vehicle and plate, for the ride to the airport today at 3:30 PM.",
      send: 'Save and email Maya',
      skip: 'Save without emailing',
      skipNote: "MAPL Tours Jamaica gets an alert that Maya wasn't emailed.",
    })
  })
  test('a pickup time after the day-of email, and too late for one', () => {
    expect(scenarios.pickupAfterDayOf().question).toMatchObject({
      body: "Maya's day-of email said 3:30 PM. Without a new email, Maya will expect the old time.",
      summary: "The email gives the new pickup time, 12:00 noon today, with Devon's details.",
    })
    expect(scenarios.pickupTooLate().question?.body).toBe('No automatic email reaches Maya before the new pickup time.')
  })
  test('a landing time after the day-of email', () => {
    expect(scenarios.landingAfterDayOf().question).toMatchObject({
      body: "Maya's day-of email said the flight lands at 2:10 PM. Without a new email, Maya has the old time.",
      summary: "The email gives the new landing time, 4:05 PM today, with Devon's details.",
    })
  })
})

describe('after saving', () => {
  test('one line per outcome', () => {
    expect(resultWords('sent', 'Maya')).toBe('Saved. Maya was emailed.')
    expect(resultWords('automatic', 'Maya')).toBe("Saved. Maya's day-of email will carry it.")
    expect(resultWords('skipped', 'Maya')).toBe("Saved. Maya wasn't emailed, and MAPL Tours Jamaica was told.")
    expect(resultWords('failed', 'Maya')).toBe("Saved, but the email to Maya didn't go. MAPL Tours Jamaica was told. Tell Maya on WhatsApp, or try the email again.")
    expect(resultWords('unreachable', 'Maya')).toBe('Saved. Maya has no email address, so MAPL Tours Jamaica was told.')
    expect(resultWords('not_needed', null)).toBe('Saved.')
  })
})

describe('the house rules, in every sentence', () => {
  const texts = Object.values(scenarios).flatMap((s) => allText(s()))
  test('no em or en dashes, no typed arrows', () => {
    for (const t of texts) expect(t).not.toMatch(/[—–→←]|->/)
  })
  test('the brand in full, never "MAPL Tours" alone or "MAPL" alone', () => {
    for (const t of texts) {
      for (const m of Array.from(t.matchAll(/MAPL[^\n]{0,14}/g))) expect(m[0]).toMatch(/^MAPL Tours Jamaica/)
    }
  })
  test('no pronoun for a guest or a driver, and never "collect"', () => {
    for (const t of texts) {
      expect(t).not.toMatch(/\b(he|she|him|her|his|hers)\b/i)
      expect(t).not.toMatch(/\bcollect/i)
    }
  })
})

describe('the helpers', () => {
  test('relative days on the Jamaica calendar', () => {
    const now = ja('2026-11-28T09:00')
    expect(relativeDay(ja('2026-11-28T23:00'), now)).toBe('today')
    expect(relativeDay(ja('2026-11-29T00:30'), now)).toBe('tomorrow')
    expect(relativeDay(ja('2026-11-27T22:00'), now)).toBe('yesterday')
    expect(relativeDay(ja('2026-11-30T12:00'), now)).toBe('on Monday')
    expect(relativeDay(ja('2026-12-08T12:00'), now)).toBe('on Tuesday, Dec 8')
  })
  test('clock words: noon and midnight said in words', () => {
    expect(clockWords(wall('2026-11-30T12:00'))).toBe('12:00 noon')
    expect(clockWords(wall('2026-11-30T00:00'))).toBe('12:00 midnight')
    expect(clockWords(wall('2026-11-30T12:30'))).toBe('12:30 PM')
    expect(clockWords(wall('2026-11-30T00:15'))).toBe('12:15 AM')
  })
  test('a stored vehicle read back in words', () => {
    expect(vehicleFromBooking('Toyota Hiace, silver')).toBe('silver Toyota Hiace')
    expect(vehicleFromBooking('Toyota Noah minivan, black')).toBe('black Toyota Noah minivan')
    expect(vehicleFromBooking('A van')).toBe('A van')
    expect(vehicleFromBooking(null)).toBe(null)
  })
})

describe('the new-time email', () => {
  const d = { id: 'd1', name: 'Devon Brown', whatsapp: '+1 876 555 0100', vehicle: 'Toyota Hiace', colour: 'silver', plate: 'PJ 1234', email: null, active: true }
  const mail = async (b: ReturnType<typeof ride>, leg: 'arrival' | 'departure', from: string, now: number) => {
    const { subject, props } = buildDriverUpdate(b, leg, d, now, true, { kind: 'time', fromAt: from })
    return { subject, props, text: await render(DriverUpdate(props), { plainText: true }) }
  }

  test('a pickup moved the same day: the new time leads, the old one is named, everything else stays', async () => {
    const m = await mail(ride({}, { departure_at: wall('2026-11-30T12:00') }), 'departure', wall('2026-11-30T15:30'), ja('2026-11-30T08:00'))
    expect(m.subject).toBe('New pickup time today: 12:00 noon (MAPL-ABCD1234)')
    expect(m.props.preheader).toBe('Your pickup today is now at 12:00 noon, with Devon Brown · MAPL-ABCD1234')
    expect(m.props.eyebrow).toBe('Today · New pickup time')
    expect(m.props.headline).toBe('Your new pickup time: 12:00 noon today.')
    expect(m.props.lead).toBe('Devon Brown will now pick you up at your hotel at 12:00 noon, not 3:30 PM, in a silver Toyota Hiace, and take you to Sangster International Airport for your flight. Everything else about your ride stays the same.')
    expect(m.props.tripRows[0]).toEqual({ label: 'Hotel pickup', value: 'Monday, November 30, 12:00 noon Jamaica time' })
    expect(m.text).toContain('PJ 1234')
    expect(m.text).not.toContain('3:30 PM Jamaica time')
  })

  test('a pickup moved to another day: the old day is named, and "everything else" is not claimed', async () => {
    const m = await mail(ride({}, { departure_at: wall('2026-12-01T06:30') }), 'departure', wall('2026-11-30T15:30'), ja('2026-11-30T08:00'))
    expect(m.subject).toBe('New pickup time tomorrow: 6:30 AM (MAPL-ABCD1234)')
    expect(m.props.lead).toBe('Devon Brown will now pick you up at your hotel at 6:30 AM, not 3:30 PM on Monday, November 30, in a silver Toyota Hiace, and take you to Sangster International Airport for your flight.')
  })

  test('a landing time', async () => {
    const m = await mail(ride({}, { arrival_at: wall('2026-11-27T16:05') }), 'arrival', wall('2026-11-27T14:10'), ja('2026-11-27T08:00'))
    expect(m.subject).toBe('Your arrival today: we will meet your flight at 4:05 PM (MAPL-ABCD1234)')
    expect(m.props.headline).toBe('We will meet your flight at 4:05 PM today.')
    expect(m.props.lead).toBe('We now have your flight landing at 4:05 PM, not 2:10 PM. Devon Brown will be waiting just outside the arrivals hall with a MAPL Tours Jamaica sign showing your name. Everything else about your ride stays the same.')
    expect(m.props.tripRows[0]).toEqual({ label: 'Flight lands', value: 'Friday, November 27, 4:05 PM Jamaica time' })
  })

  test('the driver email is unchanged when nothing says otherwise', () => {
    const plain = buildDriverUpdate(ride(), 'departure', d, ja('2026-11-30T08:00'), true)
    const asDriver = buildDriverUpdate(ride(), 'departure', d, ja('2026-11-30T08:00'), true, { kind: 'driver' })
    expect(asDriver).toEqual(plain)
    expect(plain.props.headline).toBe('A new driver for your ride to the airport today.')
  })

  test('the house rules hold in the new-time emails', async () => {
    for (const [b, leg, from] of [
      [ride({}, { departure_at: wall('2026-11-30T12:00') }), 'departure', wall('2026-11-30T15:30')],
      [ride({}, { departure_at: wall('2026-12-01T06:30') }), 'departure', wall('2026-11-30T15:30')],
      [ride({}, { arrival_at: wall('2026-11-27T16:05') }), 'arrival', wall('2026-11-27T14:10')],
    ] as const) {
      const m = await mail(b, leg, from, ja('2026-11-27T08:00'))
      const all = `${m.subject}\n${m.props.preheader}\n${m.text}`
      expect(all).not.toMatch(/[—–]/)
      expect(all).not.toMatch(/\bcollect/i)
      // Booking references (MAPL-ABCD1234) aside, the brand is always in full.
      for (const x of Array.from(all.matchAll(/MAPL(?!-[A-Z0-9])[^\n]{0,14}/g))) expect(x[0]).toMatch(/^MAPL Tours Jamaica/)
    }
  })
})
