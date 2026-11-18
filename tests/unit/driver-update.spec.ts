import { describe, test, expect } from 'vitest'
import { render } from '@react-email/render'
import DriverUpdate from '@/emails/DriverUpdate'
import {
  AIRPORT, buildDriverUpdate, buildProblem, flightLabel, guestSendProblem, jaDateKey, legsOf, toldBefore, whenWords,
} from '@/lib/driver-update'
import { AIRPORT as DAYOF_AIRPORT, jaDateKey as dayofJaDateKey } from '@/lib/dayof'
import { parseDriverFields, aVehicle, bookingDriverColumns, bookingHasDriver, type Driver } from '@/lib/drivers'

/**
 * The driver-update email (lib/driver-update.ts). Owner, Nov 18 2026: "the
 * information on the email should be perfect." So every line is read here
 * against the booking it came from: the day, the time, the flight, the
 * places, the party, the driver, the van, the plate and the number, and the
 * one sentence that may only be said when it is true ("This replaces the
 * driver and vehicle we sent you earlier").
 *
 * Made-up guest and driver; the shapes are those of the real arrivals of
 * Nov 17 and 18 2026.
 */

const HOUR = 3_600_000
/** 8:35 AM in Jamaica on Wednesday, November 18 2026 (13:35 UTC). */
const NOW = Date.parse('2026-11-18T13:35:00Z')

const driver = (over: Partial<Driver> = {}): Driver => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Devon Brown', whatsapp: '+1 876 555-0100', vehicle: 'Toyota Hiace', colour: 'silver', plate: 'PS 0000',
  email: null, active: true, ...over,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function booking(over: Record<string, any> = {}, item: Record<string, any> = {}) {
  return {
    id: 'abcd1234-6c73-444e-83c6-1f79f15a59d1',
    booking_type: 'transfer', status: 'paid', email: 'guest@example.com', first_name: 'Ana',
    driver_name: 'Collin', driver_phone: '+1 876 919-7534', driver_vehicle: 'Toyota Noah minivan, black', driver_plate: 'PM 9482',
    dispatch: { dayof_arrival_sent: '2026-11-18T06:00:54.936Z' },
    booking_items: [{
      hotel: 'Grand Palladium Jamaica, Lucea', trip_type: 'round_trip', passengers: 2,
      // Jamaica wall clock carrying a Z: lands 1:09 PM, hotel pickup 4:22 PM a week later.
      arrival_at: '2026-11-18T13:09:00+00:00', arrival_flight: '521',
      departure_at: '2026-11-25T16:22:00+00:00', departure_flight: '922',
      ...item,
    }],
    ...over,
  }
}

const textOf = async (b: ReturnType<typeof booking>, leg: 'arrival' | 'departure', d = driver(), now = NOW) => {
  const { subject, props } = buildDriverUpdate(b, leg, d, now)
  const el = DriverUpdate(props)
  return { subject, props, html: await render(el), text: await render(el, { plainText: true }) }
}

describe('the arrival email, line by line', () => {
  test('a guest who was sent a driver is told this one replaces them', async () => {
    const { subject, props } = await textOf(booking(), 'arrival')
    expect(subject).toBe('Your driver today: Devon Brown, silver Toyota Hiace (MAPL-ABCD1234)')
    expect(props.preheader).toBe('Your driver today is Devon Brown, silver Toyota Hiace, plate PS 0000 · MAPL-ABCD1234')
    expect(props.eyebrow).toBe('Today · Driver update')
    expect(props.headline).toBe('A new driver for your arrival today.')
    expect(props.lead).toBe('Devon Brown will be waiting just outside the arrivals hall with a MAPL Tours Jamaica sign showing your name. This replaces the driver and vehicle we sent you earlier. Everything else about your pickup stays the same.')
    expect(props.bookingRef).toBe('MAPL-ABCD1234')
    expect(props.driver).toEqual({ name: 'Devon Brown', vehicle: 'Toyota Hiace, silver', plate: 'PS 0000', whatsapp: '+1 876 555-0100', whatsappLink: 'https://wa.me/18765550100' })
    expect(props.tripTitle).toBe('Your pickup')
    expect(props.tripRows).toEqual([
      { label: 'Flight lands', value: 'Wednesday, November 18, 1:09 PM Jamaica time' },
      { label: 'Flight', value: '521' },
      { label: 'Pick up', value: 'Sangster International Airport (MBJ), Montego Bay' },
      { label: 'Drop off', value: 'Grand Palladium Jamaica, Lucea' },
      { label: 'Passengers', value: '2' },
    ])
    expect(props.stepsTitle).toBe('When you land')
    expect(props.steps.map((s) => s.map((p) => p.t).join(''))).toEqual([
      'Clear immigration and pick up your bags. No rush, we are tracking the flight.',
      'Walk out through customs, past the public hall, and step outside.',
      'Turn right: Devon is in front of the sixth car rental office, holding a MAPL Tours Jamaica sign with your name on it.',
      'If you do not see the sign within a few minutes, message the WhatsApp number above, or reply to this email and we will call Devon for you.',
    ])
    expect(props.steps[2].find((p) => p.b)?.t).toBe('MAPL Tours Jamaica')
    expect(props.notes).toEqual([
      'We will confirm your driver for the ride back to the airport on November 25 closer to the day.',
      'Anything at all, reply to this email or write to contact@mapltours.com and a person will answer. Booking reference MAPL-ABCD1234.',
    ])
  })

  test('a guest never sent a driver is introduced to this one, with no talk of a change', async () => {
    const { subject, props } = await textOf(booking({ dispatch: {} }), 'arrival')
    expect(props.headline).toBe('Your driver for your arrival today.')
    expect(props.lead).toBe('Devon Brown will be waiting just outside the arrivals hall with a MAPL Tours Jamaica sign showing your name.')
    expect(subject).toBe('Your driver today: Devon Brown, silver Toyota Hiace (MAPL-ABCD1234)')
  })

  test('a one-way arrival has no ride-back sentence, and no flight number means no tracking claim and no flight row', async () => {
    const { props } = await textOf(booking({}, { trip_type: 'one_way', departure_at: null, arrival_flight: null }), 'arrival')
    expect(props.notes).toHaveLength(1)
    expect(props.tripRows.map((r) => r.label)).toEqual(['Flight lands', 'Pick up', 'Drop off', 'Passengers'])
    expect(props.steps[0][0].t).toBe('Clear immigration and pick up your bags. No rush.')
  })

  test('the party size is the booking\'s', async () => {
    const { props } = await textOf(booking({}, { passengers: 5 }), 'arrival')
    expect(props.tripRows.find((r) => r.label === 'Passengers')?.value).toBe('5')
  })
})

describe('the ride to the airport, line by line', () => {
  const sevenDaysOn = Date.parse('2026-11-25T13:00:00Z') // 8 AM in Jamaica, the day of the 4:22 PM pickup
  test('says the hotel pickup, the vehicle and plate, in the approved order', async () => {
    const { subject, props } = await textOf(booking(), 'departure', driver(), sevenDaysOn)
    expect(subject).toBe('Your ride to the airport today: Devon Brown, silver Toyota Hiace (MAPL-ABCD1234)')
    expect(props.headline).toBe('A new driver for your ride to the airport today.')
    expect(props.lead).toBe('Devon Brown will pick you up at your hotel at 4:22 PM in a silver Toyota Hiace, and take you to Sangster International Airport for your flight. This replaces the driver and vehicle we sent you earlier. Everything else about your pickup stays the same.')
    expect(props.tripTitle).toBe('Your departure')
    expect(props.tripRows).toEqual([
      { label: 'Hotel pickup', value: 'Wednesday, November 25, 4:22 PM Jamaica time' },
      { label: 'Pick up', value: 'Grand Palladium Jamaica, Lucea' },
      { label: 'Drop off', value: AIRPORT },
      { label: 'Flight', value: '922' },
      { label: 'Passengers', value: '2' },
    ])
    expect(props.stepsTitle).toBe('Before you go')
    expect(props.steps.map((s) => s.map((p) => p.t).join(''))).toEqual([
      'Be in the lobby a few minutes before the pickup time above.',
      'Devon will be waiting in a silver Toyota Hiace, plate PS 0000.',
      'If anything changes with your flight or your plans, message the WhatsApp number above or reply to this email, and we will let Devon know.',
    ])
    expect(props.notes).toHaveLength(1)
  })

  test('sent days ahead, it names the day, and "an" goes before a vowel', async () => {
    const { subject, props } = await textOf(booking(), 'departure', driver({ colour: 'orange' }), NOW)
    expect(subject).toBe('Your ride to the airport on Wednesday, November 25: Devon Brown, orange Toyota Hiace (MAPL-ABCD1234)')
    expect(props.headline).toBe('A new driver for your ride to the airport on Wednesday, November 25.')
    // Named once above the fold, once in the card: the eyebrow and the lead do not repeat it.
    expect(props.eyebrow).toBe('Driver update')
    expect(props.lead.startsWith('Devon Brown will pick you up at your hotel at 4:22 PM in an orange Toyota Hiace,')).toBe(true)
    expect(props.tripRows[0]).toEqual({ label: 'Hotel pickup', value: 'Wednesday, November 25, 4:22 PM Jamaica time' })
  })

  test('the arrival day-of email counts as being told, for the ride back too', () => {
    expect(toldBefore(booking({ dispatch: { dayof_arrival_sent: 'x' } }), 'departure')).toBe(true)
    expect(toldBefore(booking({ dispatch: {} }), 'departure')).toBe(false)
  })
})

describe('when it is said to be', () => {
  test('today, tomorrow, a named day, and tonight for a flight met after midnight (Jamaica calendar)', () => {
    expect(whenWords('2026-11-18T13:09:00Z', NOW)).toEqual({ inline: 'today', eyebrow: 'Today' })
    expect(whenWords('2026-11-19T07:00:00Z', NOW)).toEqual({ inline: 'tomorrow', eyebrow: 'Tomorrow' })
    expect(whenWords('2026-11-25T16:22:00Z', NOW)).toEqual({ inline: 'on Wednesday, November 25', eyebrow: '' })
    // 12:30 AM Thursday in Jamaica, meeting a flight that landed at 11:40 PM Wednesday.
    expect(whenWords('2026-11-18T23:40:00Z', Date.parse('2026-11-19T05:30:00Z'))).toEqual({ inline: 'tonight', eyebrow: 'Tonight' })
  })
  test('at 11 PM in Jamaica it is still that day (UTC has already moved on)', () => {
    const elevenPm = Date.parse('2026-11-19T04:00:00Z') // 11 PM Wednesday in Jamaica
    expect(whenWords('2026-11-18T23:50:00Z', elevenPm).inline).toBe('today')
    expect(whenWords('2026-11-19T06:00:00Z', elevenPm).inline).toBe('tomorrow')
  })
  test('the same airport and the same calendar as the day-of email', () => {
    expect(AIRPORT).toBe(DAYOF_AIRPORT)
    for (const t of [NOW, NOW + 11 * HOUR, NOW + 15 * HOUR, Date.parse('2026-12-31T04:59:00Z')]) expect(jaDateKey(t)).toBe(dayofJaDateKey(t))
  })
})

describe('the facts it may print', () => {
  test('flight numbers are tidied, never invented', () => {
    expect(flightLabel('aa1311')).toBe('AA 1311')
    expect(flightLabel('B6 123')).toBe('B6 123')
    expect(flightLabel('WN272')).toBe('WN 272')
    expect(flightLabel('521')).toBe('521')
    expect(flightLabel('  ')).toBeNull()
    expect(flightLabel(null)).toBeNull()
  })

  test('the rendered email holds every fact and breaks no copy rule', async () => {
    for (const [b, leg, now] of [[booking(), 'arrival', NOW], [booking({ dispatch: {} }), 'arrival', NOW], [booking(), 'departure', NOW]] as const) {
      const { html, text, props } = await textOf(b, leg, driver(), now)
      for (const fact of ['Devon Brown', 'Toyota Hiace, silver', 'PS 0000', '+1 876 555-0100', 'Grand Palladium Jamaica, Lucea', 'MAPL-ABCD1234', props.tripRows[0].value]) {
        expect(text).toContain(fact)
      }
      expect(html).toContain('href="https://wa.me/18765550100"')
      expect(text + html).not.toMatch(/[–—]/)
      expect(text.replace(/MAPL Tours Jamaica/g, '')).not.toMatch(/MAPL Tours/)
      expect(text).not.toMatch(/collect you|undefined|null|NaN|\[object/i)
      expect(text).not.toMatch(/[→←⇒]/)
    }
  })
})

describe('when it may not be written or sent', () => {
  test('the booking must have the ride, a hotel and a party', () => {
    expect(buildProblem(booking(), 'arrival', driver())).toBeNull()
    expect(buildProblem(booking({}, { trip_type: 'one_way', departure_at: '2026-11-25T16:22:00Z' }), 'departure', driver())).toBe('This booking has no ride to the airport.')
    expect(buildProblem(booking({}, { hotel: '', destination: '' }), 'arrival', driver())).toMatch(/no hotel/)
    expect(buildProblem(booking({ booking_type: 'tour' }), 'arrival', driver())).toMatch(/not an airport transfer/)
  })
  test('the driver must be chosen, working and complete', () => {
    expect(buildProblem(booking(), 'arrival', null)).toBe('Choose a driver.')
    expect(buildProblem(booking(), 'arrival', driver({ active: false }))).toMatch(/retired/)
    expect(buildProblem(booking(), 'arrival', driver({ plate: '' }))).toMatch(/missing a detail/)
  })
  test('the guest gets it only while paid, with an email, and before the ride is over', () => {
    expect(guestSendProblem(booking(), 'arrival', driver(), NOW)).toBeNull()
    expect(guestSendProblem(booking({ status: 'refunded' }), 'arrival', driver(), NOW)).toMatch(/not paid/)
    expect(guestSendProblem(booking({ email: null }), 'arrival', driver(), NOW)).toMatch(/no email/)
    // Landed 1:09 PM Jamaica (18:09 UTC): still useful until 3:09 PM, not after.
    expect(guestSendProblem(booking(), 'arrival', driver(), Date.parse('2026-11-18T20:08:00Z'))).toBeNull()
    expect(guestSendProblem(booking(), 'arrival', driver(), Date.parse('2026-11-18T20:10:00Z'))).toMatch(/arrival is over/)
    // The ride to the airport: until its pickup time, 4:22 PM Jamaica (21:22 UTC).
    expect(guestSendProblem(booking(), 'departure', driver(), Date.parse('2026-11-25T21:21:00Z'))).toBeNull()
    expect(guestSendProblem(booking(), 'departure', driver(), Date.parse('2026-11-25T21:23:00Z'))).toMatch(/pickup time has passed/)
  })
})

describe('which rides a booking has', () => {
  test('round trip, arrival only, airport only', () => {
    expect(legsOf(booking())).toEqual(['arrival', 'departure'])
    expect(legsOf(booking({}, { trip_type: 'one_way', departure_at: '2026-11-25T16:22:00Z' }))).toEqual(['arrival'])
    expect(legsOf(booking({}, { trip_type: 'one_way', arrival_at: null }))).toEqual(['departure'])
    expect(legsOf(booking({ booking_items: [] }))).toEqual([])
  })
})

describe('a saved driver', () => {
  test('is tidied once: spaces, colour in lower case, plate in capitals', () => {
    const r = parseDriverFields({ name: '  Devon   Brown ', whatsapp: '+1 876 555-0100', vehicle: 'Toyota  Hiace', colour: 'Silver', plate: 'ps 0000', email: '' })
    expect(r).toEqual({ ok: true, fields: { name: 'Devon Brown', whatsapp: '+1 876 555-0100', vehicle: 'Toyota Hiace', colour: 'silver', plate: 'PS 0000', email: null } })
  })
  test('refuses what a guest could not use', () => {
    const base = { name: 'Devon Brown', whatsapp: '+1 876 555-0100', vehicle: 'Toyota Hiace', colour: 'silver', plate: 'PS 0000' }
    expect(parseDriverFields({ ...base, whatsapp: '876 555 0100' })).toMatchObject({ ok: false, field: 'whatsapp' })
    expect(parseDriverFields({ ...base, whatsapp: '+1 876' })).toMatchObject({ ok: false, field: 'whatsapp' })
    expect(parseDriverFields({ ...base, name: 'D' })).toMatchObject({ ok: false, field: 'name' })
    expect(parseDriverFields({ ...base, name: 'see https://x.co' })).toMatchObject({ ok: false, field: 'name' })
    expect(parseDriverFields({ ...base, colour: '#c0c0c0' })).toMatchObject({ ok: false, field: 'colour' })
    expect(parseDriverFields({ ...base, plate: '' })).toMatchObject({ ok: false, field: 'plate' })
    expect(parseDriverFields({ ...base, email: 'devon@' })).toMatchObject({ ok: false, field: 'email' })
  })
  test('is written onto a booking the way the booking already stores a driver', () => {
    expect(bookingDriverColumns(driver({ name: 'Collin', whatsapp: '+1 876 919-7534', vehicle: 'Toyota Noah minivan', colour: 'black', plate: 'PM 9482' })))
      .toEqual({ driver_name: 'Collin', driver_phone: '+1 876 919-7534', driver_vehicle: 'Toyota Noah minivan, black', driver_plate: 'PM 9482' })
    expect(bookingHasDriver(booking(), driver({ name: 'Collin', whatsapp: '+1 876 919-7534', vehicle: 'Toyota Noah minivan', colour: 'black', plate: 'PM 9482' }))).toBe(true)
    expect(aVehicle(driver())).toBe('a silver Toyota Hiace')
  })
})
