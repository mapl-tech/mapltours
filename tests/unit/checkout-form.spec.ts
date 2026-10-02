import { describe, test, expect } from 'vitest'
import {
  validateContact, validateTourForm, validateTransferForm, flightOk, pickupFromFlight, flightFromPickup,
  formatWallClock, formatDate, orderKey, legsFor, PICKUP_LEAD_TEXT,
  readCheckoutAnswer, PAYMENT_NOT_SET_UP,
  DATE_VALUE_FORMAT, DATETIME_VALUE_FORMAT, LEG_TIME_RE, incompleteDateMessage, attentionLine, shiftWallClock,
} from '../../lib/checkout-form'

const NOW = new Date('2026-09-05T15:00:00Z') // 10:00 Jamaica, Sep 5
const contact = { firstName: 'Ann', lastName: 'Lee', email: 'ann@example.com', phone: '+1 416 555 0100' }

describe('contact validation', () => {
  test('accepts a complete contact and names every missing field', () => {
    expect(validateContact(contact)).toEqual({})
    const e = validateContact({})
    expect(Object.keys(e).sort()).toEqual(['email', 'firstName', 'lastName', 'phone'])
    expect(validateContact({ ...contact, email: 'ann@' }).email).toMatch(/does not look right/)
    expect(validateContact({ ...contact, phone: '12' }).phone).toMatch(/too short/)
  })
})

describe('tour form', () => {
  test('needs a pickup place, a bookable date and the waiver', () => {
    expect(validateTourForm({ contact, pickup: 'Sandals Negril Beach Resort', tripDate: '2026-09-07', waiverAccepted: true, now: NOW })).toEqual({})
    const e = validateTourForm({ contact, pickup: '', tripDate: '2026-09-06', waiverAccepted: false, now: NOW })
    expect(e.pickup).toMatch(/Choose where/)
    expect(e.tripDate).toMatch(/earliest date is Mon, Sep 7/)
    expect(e.waiver).toMatch(/waiver/)
    expect(validateTourForm({ contact, pickup: 'x', tripDate: '', waiverAccepted: true, now: NOW }).tripDate).toBe('Pick a date')
  })
})

describe('transfer form', () => {
  const min = '2026-09-06T10:00'
  test('a round trip needs both legs, in order, with flight numbers', () => {
    const ok = validateTransferForm({ contact, minDateTime: min, legs: { tripType: 'round_trip', fromAirport: true, arrivalAt: '2026-10-10T14:30', arrivalFlight: 'AA1234', departureAt: '2026-10-17T10:00', departureFlight: 'AA4321' } })
    expect(ok).toEqual({})
    const e = validateTransferForm({ contact, minDateTime: min, legs: { tripType: 'round_trip', fromAirport: true, arrivalAt: '2026-10-17T14:30', arrivalFlight: 'A', departureAt: '2026-10-10T10:00', departureFlight: '' } })
    expect(e.arrivalFlight).toMatch(/AA1234/)
    expect(e.departureAt).toMatch(/after you arrive/)
    expect(e.departureFlight).toMatch(/AA4321/)
    expect(validateTransferForm({ contact, minDateTime: min, legs: { tripType: 'round_trip', fromAirport: true, arrivalAt: '2026-09-06T09:00', arrivalFlight: 'AA1', departureAt: '2026-09-20T10:00', departureFlight: 'AA2' } }).arrivalAt).toMatch(/24 hours/)
  })
  test('a one-way carries only its own leg', () => {
    expect(legsFor('one_way', false)).toEqual({ hasArrivalLeg: false, hasDepartureLeg: true })
    const toAirport = validateTransferForm({ contact, minDateTime: min, legs: { tripType: 'one_way', fromAirport: false, departureAt: '2026-10-17T10:00', departureFlight: 'AA4321' } })
    expect(toAirport).toEqual({})
    const fromAirport = validateTransferForm({ contact, minDateTime: min, legs: { tripType: 'one_way', fromAirport: true } })
    expect(Object.keys(fromAirport)).toEqual(['arrivalAt', 'arrivalFlight'])
  })
  test('flight numbers are permissive but not empty', () => {
    expect(flightOk('AA1234')).toBe(true); expect(flightOk('521')).toBe(true); expect(flightOk('vs165')).toBe(true)
    expect(flightOk('')).toBe(false); expect(flightOk('AA')).toBe(false); expect(flightOk('12345678901')).toBe(false)
  })
})

/**
 * What a browsing agent reads before it types into a native date field. The
 * pickers refuse every spelling but one ("Dec 5, 12:54 PM" throws "Malformed
 * value"), so the example in each description must be exactly that one.
 */
describe('date field formats an agent can read', () => {
  const example = (text: string) => text.match(/\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/)?.[0] ?? ''

  test('the date-and-time example is a value the field and the validators accept', () => {
    const v = example(DATETIME_VALUE_FORMAT)
    expect(v).toBe('2026-12-05T14:30')
    expect(LEG_TIME_RE.test(v)).toBe(true)
    // A real calendar time that survives the zone-free arithmetic.
    expect(shiftWallClock(v, 0)).toBe(v)
    expect(DATETIME_VALUE_FORMAT).toMatch(/24-hour/)
  })

  test('the date example is a value the tour date field accepts', () => {
    const v = example(DATE_VALUE_FORMAT)
    expect(v).toBe('2026-12-05')
    expect(validateTourForm({ contact, pickup: 'x', tripDate: v, waiverAccepted: true, now: NOW })).toEqual({})
  })

  test('a half-filled date names the field and what to fill in', () => {
    expect(incompleteDateMessage('Flight lands', 'datetime')).toBe('Flight lands is missing part of the date or time. Fill in the day, month, year and time.')
    expect(incompleteDateMessage('Trip date', 'date')).toBe('Trip date is missing part of the date. Fill in the day, month and year.')
  })

  test('the Pay announcement names every field that needs fixing, in page order', () => {
    const labels = { arrivalAt: 'Flight lands', arrivalFlight: 'Arrival flight', email: 'Email' }
    const order = ['arrivalAt', 'arrivalFlight', 'email']
    expect(attentionLine({}, labels, order)).toBe('')
    expect(attentionLine({ email: 'x' }, labels, order)).toBe('1 thing needs attention before you can pay: Email.')
    expect(attentionLine({ email: 'x', arrivalAt: 'y' }, labels, order)).toBe('2 things need attention before you can pay: Flight lands, Email.')
    // A key the page did not list still counts, by its key, at the end.
    expect(attentionLine({ other: 'z', arrivalFlight: 'y' }, labels, order)).toBe('2 things need attention before you can pay: Arrival flight, other.')
  })

  test('no em dashes in any of it', () => {
    for (const text of [DATE_VALUE_FORMAT, DATETIME_VALUE_FORMAT, incompleteDateMessage('A', 'date'), incompleteDateMessage('A', 'datetime'), attentionLine({ a: 'x' }, {}, [])]) {
      expect(text).not.toMatch(/\u2014/)
    }
  })
})

describe('departure pickup from the flight time', () => {
  test('is the lead time before the flight, and round-trips back', () => {
    expect(PICKUP_LEAD_TEXT).toBe('3½ hours')
    expect(pickupFromFlight('2026-10-17T13:30')).toBe('2026-10-17T10:00')
    expect(pickupFromFlight('2026-10-17T02:00')).toBe('2026-10-16T22:30')
    expect(flightFromPickup('2026-10-17T10:00')).toBe('2026-10-17T13:30')
    expect(pickupFromFlight('nonsense')).toBe('')
  })
  test('formats wall-clock values without touching the browser zone', () => {
    expect(formatWallClock('2026-10-17T10:00')).toBe('Sat, Oct 17 · 10:00 AM')
    expect(formatWallClock('2026-10-17T00:05')).toBe('Sat, Oct 17 · 12:05 AM')
    expect(formatWallClock('2026-10-17T13:30')).toBe('Sat, Oct 17 · 1:30 PM')
    expect(formatDate('2026-09-07')).toBe('Mon, Sep 7')
  })
})

describe('order key', () => {
  test('ignores key order and changes with any value', () => {
    expect(orderKey({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(orderKey({ a: [{ x: 1, y: 2 }], b: 1 }))
    expect(orderKey({ a: 1 })).not.toBe(orderKey({ a: 2 }))
  })
})

/**
 * The pages' reading of a checkout route's answer (readCheckoutAnswer).
 * Both one-page checkouts only apply what this returns, so a regression in
 * how a refusal, a settled booking or a reward conflict is handled shows up
 * here rather than only in a browser.
 */
describe('reading a checkout answer', () => {
  const ID = '0a0a0a0a-0000-4000-8000-00000000000a'
  const tour = { confirmPath: '/checkout/confirm', shownCents: 25500, shownTotal: 255, rewardOnPage: true }
  const ride = { confirmPath: '/transfers/confirm', shownCents: 9900, shownTotal: 99, rewardOnPage: false }

  test('a reward conflict unticks the reward and leaves the words to the page, never reused', () => {
    const a = readCheckoutAnswer({ error: 'Your reward is already in use on another checkout.', rewardConflict: true, bookingId: ID }, tour)
    expect(a.untickReward).toBe(true)
    expect(a.result).toEqual({ error: 'Your reward is already in use on another checkout.', shownOnPage: true })
    // The no-intent row the conflict created is the next one to supersede.
    expect(a.bookingId).toBe(ID)
    expect(a.reusable).toBe(false)
    expect(a.dropGift || a.dropCoupon).toBe(false)
    expect(a.codeError).toBeNull()
  })

  test('on a page with no reward box, a reward conflict is a plain refusal the panel shows', () => {
    const a = readCheckoutAnswer({ error: 'Your reward is already in use on another checkout.', rewardConflict: true, bookingId: ID }, ride)
    expect(a.untickReward).toBe(false)
    expect(a.result).toEqual({ error: 'Your reward is already in use on another checkout.' })
  })

  test('a refused gift card or coupon comes off the page with the reason under the code field', () => {
    const g = readCheckoutAnswer({ error: 'That gift card has no balance left.', giftCode: true }, tour)
    expect(g).toMatchObject({ dropGift: true, dropCoupon: false, codeError: 'That gift card has no balance left.', untickReward: false, bookingId: null, reusable: false })
    expect(g.result).toEqual({ error: 'That gift card has no balance left.' })
    const c = readCheckoutAnswer({ error: 'That code has expired.', couponCode: true }, ride)
    expect(c).toMatchObject({ dropGift: false, dropCoupon: true, codeError: 'That code has expired.' })
  })

  test('any other refusal is shown by the panel and keeps no code error', () => {
    const a = readCheckoutAnswer({ error: 'Could not confirm your payment state just now. Please try again in a moment.', bookingId: ID }, tour)
    expect(a.result).toEqual({ error: 'Could not confirm your payment state just now. Please try again in a moment.' })
    expect(a).toMatchObject({ codeError: null, untickReward: false, reusable: false, bookingId: ID })
  })

  test('an already-paid booking goes to its own confirmation page and is never reused', () => {
    expect(readCheckoutAnswer({ alreadyPaid: true, bookingId: ID }, tour)).toMatchObject({
      result: { navigate: `/checkout/confirm?booking_id=${ID}` }, reusable: false, bookingId: ID, untickReward: false,
    })
    // The losing half of a double-submitted gift-covered cart answers both flags.
    expect(readCheckoutAnswer({ fullyCoveredByGift: true, alreadyPaid: true, bookingId: ID }, ride).result)
      .toEqual({ navigate: `/transfers/confirm?booking_id=${ID}` })
  })

  test('a booking the gift card settled navigates, carrying the gift figure', () => {
    const a = readCheckoutAnswer({ fullyCoveredByGift: true, bookingId: ID, giftAmount: 255 }, tour)
    expect(a.result).toEqual({ navigate: `/checkout/confirm?booking_id=${ID}` })
    expect(a).toMatchObject({ giftAmount: 255, reusable: false })
  })

  test('an intent is reusable and carries the server figures', () => {
    const a = readCheckoutAnswer({ clientSecret: 'pi_1_secret', bookingId: ID, amountDue: 242.25, giftAmount: 0, couponDiscount: 12.75 }, tour)
    expect(a.result).toEqual({ clientSecret: 'pi_1_secret', bookingId: ID, amountDue: 242.25 })
    expect(a).toMatchObject({ reusable: true, bookingId: ID, amountDue: 242.25, giftAmount: 0, couponDiscount: 12.75, giftShortfall: false, untickReward: false })
  })

  test('an intent with no amountDue falls back to the figure the page showed', () => {
    const a = readCheckoutAnswer({ clientSecret: 'pi_1_secret', bookingId: ID }, ride)
    expect(a.result).toEqual({ clientSecret: 'pi_1_secret', bookingId: ID, amountDue: 99 })
    expect(a).toMatchObject({ amountDue: null, giftAmount: null, couponDiscount: null })
  })

  test('a gift card that no longer covers everything is flagged only when the page showed nothing to charge', () => {
    const covered = { ...tour, shownCents: 0, shownTotal: 0 }
    expect(readCheckoutAnswer({ clientSecret: 's', bookingId: ID, amountDue: 12 }, covered).giftShortfall).toBe(true)
    expect(readCheckoutAnswer({ clientSecret: 's', bookingId: ID, amountDue: 0 }, covered).giftShortfall).toBe(false)
    expect(readCheckoutAnswer({ clientSecret: 's', bookingId: ID, amountDue: 12 }, tour).giftShortfall).toBe(false)
  })

  test('an answer with neither an intent nor a verdict is a refusal, and so is garbage', () => {
    for (const data of [{ bookingId: ID }, null, 'oops', 42, { clientSecret: 7 }]) {
      const a = readCheckoutAnswer(data, tour)
      expect(a.result).toEqual({ error: PAYMENT_NOT_SET_UP })
      expect(a.reusable).toBe(false)
    }
  })
})
