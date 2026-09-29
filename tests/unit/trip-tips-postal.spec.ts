import { describe, test, expect, vi } from 'vitest'
import { buildTip, TIP_TRACK, TRIP_TIPS_POSTAL_ADDRESS } from '../../lib/trip-tips/emails'
import { TIP_KEYS } from '../../lib/trip-tips/plan'
import { pages } from '../../lib/trip-tips/unsubscribe'

/*
 * The one-change path for a mailing address: when TRIP_TIPS_POSTAL_ADDRESS
 * (lib/trip-tips/postal.ts) is set, every tip prints it in the HTML footer
 * and the plain text, and the unsubscribe page shows it. The constant is null
 * (owner, Sept 27 2026: no address); this file stands in a set value, as a
 * PO box would be, with the module mocked for this file only (vi.mock is
 * hoisted above the imports).
 */
const BOX = 'MAPL Tours Jamaica, PO Box 123, Montego Bay'
vi.mock('../../lib/trip-tips/postal', () => ({ TRIP_TIPS_POSTAL_ADDRESS: 'MAPL Tours Jamaica, PO Box 123, Montego Bay' }))

const UNSUB = 'https://mapltours.com/api/trip-tips/unsubscribe?e=guest%40example.com&t=abc123'
const ctx = {
  unsubscribeUrl: UNSUB,
  firstName: 'Alex',
  hotel: 'Couples Negril',
  arrival: { date: '2027-01-09', time: '11:05', flight: 'AA 0987' },
  departure: { date: '2027-01-16', time: '08:30', flight: 'AA 0988' },
  tours: [{ title: "Rick's Cafe Cliff Diving & Sunset", date: '2027-01-11', experienceId: 14, travelers: 2 }],
  passengers: 2,
}

describe('a mailing address, once one is set', () => {
  test('the mock is the constant the builder reads', () => {
    expect(TRIP_TIPS_POSTAL_ADDRESS).toBe(BOX)
  })

  test.each([...TIP_KEYS])('%s prints it once in the HTML footer and once in the plain text, between the unsubscribe line and the privacy link', (key) => {
    const t = buildTip(key, { ...ctx, track: TIP_TRACK[key] })
    expect(t.html.split(BOX).length - 1).toBe(1)
    expect(t.text.split(BOX).length - 1).toBe(1)
    expect(t.html).toMatch(new RegExp(`>Unsubscribe</a></p>\\n<p [^>]*>${BOX}</p>\\n<p [^>]*><a [^>]*>Privacy</a></p>`))
    expect(t.text).toContain(`Unsubscribe: ${UNSUB}\n${BOX}\nPrivacy: `)
  })

  test('the unsubscribe page shows it in its footer', () => {
    for (const html of [pages.confirm('guest@example.com', 'e', 't'), pages.done(), pages.broken()]) {
      expect(html).toContain(`<footer><p>${BOX}. <a `)
    }
  })
})
