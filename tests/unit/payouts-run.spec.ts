import { describe, test, expect, vi } from 'vitest'
import { DEFAULT_LIMITS, type PayoutBooking, type PayPart } from '@/lib/payouts/plan'
import { chooseReference, referenceCandidates, runDriverPayouts, unmetRequirements, STALE_CLAIM_MS, type PayoutRunDeps, type PayoutReport } from '@/lib/payouts/run'
import { payoutSummary } from '@/lib/payouts/notify'
import { ambiguous, fakeWise, memStore, refused, ride, tour, type MemStore } from './payouts-fakes'

/**
 * The payout run over an in-memory ledger and a fake Wise: the order of the
 * steps, the send gate, the idempotency key, single funding, and what each
 * failure leaves behind (freed for the next run, or held for a person).
 * The October rides in these tests are all past their send day on Nov 1, so
 * every part is due; when a part is due is the planner's (payouts-plan.spec).
 */

const NOV_1 = Date.parse('2026-11-01T14:30:00Z')

function setup(bookings: PayoutBooking[], over: Partial<PayoutRunDeps> = {}) {
  const store = memStore(bookings, NOV_1)
  const wise = fakeWise()
  const notify = vi.fn<(r: PayoutReport) => Promise<void>>(async () => {})
  const deps = (more: Partial<PayoutRunDeps> = {}): PayoutRunDeps => ({
    store,
    wise,
    config: { profileId: 154050700, balanceId: null, recipients: { Collin: 900001, 'Marcus Reid': 900002 }, tourPayee: 'Collin', fromDay: '2026-10-01', limits: DEFAULT_LIMITS },
    send: true,
    nowMs: NOV_1,
    notify,
    ...over,
    ...more,
  })
  return { store, wise, notify, deps }
}

const active = (s: MemStore) => s.ledger.filter((i) => i.active).length
const only = <T,>(xs: T[]): T => { expect(xs).toHaveLength(1); return xs[0] }

describe('the send gate', () => {
  test('a dry run plans and touches nothing: no Wise, no claim, no email', async () => {
    const { store, wise, notify, deps } = setup([ride()])
    const r = await runDriverPayouts(deps({ send: false, wise: null }))
    expect(r.mode).toBe('dry')
    expect(only(r.payees)).toMatchObject({ payee: 'Collin', amountUsd: 147, outcome: 'planned' })
    expect(wise.calls).toEqual([])
    expect(store.writes).toEqual([])
    expect(notify).not.toHaveBeenCalled()
  })

  test('send without a Wise client is still dry', async () => {
    const { store, deps } = setup([ride()])
    const r = await runDriverPayouts(deps({ wise: null }))
    expect(r.mode).toBe('dry')
    expect(store.writes).toEqual([])
  })
})

describe('a payout that goes', () => {
  test('claim, recipient, quote, requirements, transfer, fund; then funded and stamped', async () => {
    const a = ride({ subtotal: 147 })
    const b = ride({ trip: 'one_way', subtotal: 51, arrival: '2026-10-20T10:00:00+00:00', departure: null })
    const { store, wise, notify, deps } = setup([a, b])
    const r = await runDriverPayouts(deps())

    expect(wise.calls).toEqual(['recipient', 'quote', 'requirements', 'transfer', 'fund'])
    const d = only(r.payees)
    expect(d).toMatchObject({ payee: 'Collin', amountUsd: 198, outcome: 'funded', feeUsd: 0.44 })
    expect(d.lines.map((l) => `${l.ref} ${l.part}`)).toHaveLength(3)

    // Exactly what he is owed, from the balance; to a US account, an ordinary US bank transfer.
    expect(only(wise.quotes)).toMatchObject({ profileId: 154050700, currency: 'USD', targetAmount: 198, targetAccount: 900001, payOut: null })
    const t = only(wise.transferInputs)
    expect(t.reference).toBe('MAPL Tours Jamaica 2 bookings')
    const p = only(Array.from(store.payouts.values()))
    expect(t.customerTransactionId).toBe(p.customer_transaction_id)
    expect(p).toMatchObject({ status: 'funded', amount_usd: 198, pay_day: '2026-11-01', fee_usd: 0.44, wise_transfer_id: d.transferId })

    // The console and the driver portal see it paid, and know which payout said so.
    expect(store.dispatch.get(a.id)).toMatchObject({ paid_first: expect.any(String), paid_second: expect.any(String), paid_first_via: `wise:${d.transferId}` })
    expect(store.dispatch.get(b.id)).toMatchObject({ paid_first: expect.any(String) })
    expect(active(store)).toBe(3)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  test('a second run sends nothing and calls nobody', async () => {
    const { wise, deps } = setup([ride()])
    await runDriverPayouts(deps())
    wise.calls.length = 0
    const again = await runDriverPayouts(deps({ nowMs: NOV_1 + 86_400_000 }))
    expect(again.payees).toEqual([])
    expect(wise.calls).toEqual([])
  })

  test('one booking is named in the reference, so the payee knows which trip it is for', async () => {
    const b = ride()
    const { wise, deps } = setup([b])
    await runDriverPayouts(deps())
    expect(only(wise.transferInputs).reference).toBe(`MAPL Tours Jamaica ${b.id.slice(0, 8).toUpperCase()}`)
  })

  test('a foreign account (a wire) is quoted with SWIFT_OUR, so MAPL pays every bank\'s charge', async () => {
    const { wise, deps } = setup([ride()])
    wise.recipient = { ...wise.recipient, type: 'swift_code' }
    await runDriverPayouts(deps())
    expect(only(wise.quotes).payOut).toBe('SWIFT_OUR')
  })

  test('a tour and the operator\'s rides go in one transfer, and the tour is marked paid', async () => {
    const t = tour({ subtotal: 130, dates: ['2026-10-12'] })
    const a = ride({ subtotal: 147 })
    const { store, wise, deps } = setup([t, a])
    const r = await runDriverPayouts(deps())
    expect(only(r.payees)).toMatchObject({ payee: 'Collin', amountUsd: 277, outcome: 'funded' })
    expect(wise.transfers.size).toBe(1)
    expect(store.dispatch.get(t.id)).toMatchObject({ paid_tour: expect.any(String), paid_tour_via: expect.stringMatching(/^wise:/) })
    expect(store.dispatch.get(a.id)).toMatchObject({ paid_first: expect.any(String), paid_second: expect.any(String) })
  })

  test('drivers who share the operator\'s account are one payment', async () => {
    const { store, wise, deps } = setup([ride({ driver: 'Collin' }), ride({ driver: 'Devon Brown', subtotal: 100 })])
    const r = await runDriverPayouts(deps({ config: { profileId: 154050700, balanceId: null, recipients: { Collin: 900001, 'Devon Brown': 900001 }, tourPayee: 'Collin', fromDay: '2026-10-01', limits: DEFAULT_LIMITS } }))
    expect(only(r.payees)).toMatchObject({ payee: 'Collin and Devon Brown', amountUsd: 247, outcome: 'funded' })
    expect(wise.transfers.size).toBe(1)
    expect(only(Array.from(store.payouts.values()))).toMatchObject({ payee: 'Collin and Devon Brown', recipient_id: 900001 })
  })

  test('each recipient is its own payout and its own transfer', async () => {
    const { store, wise, deps } = setup([ride({ driver: 'Collin' }), ride({ driver: 'Marcus Reid', subtotal: 168 })])
    const r = await runDriverPayouts(deps())
    expect(r.payees.map((d) => [d.payee, d.outcome])).toEqual([['Collin', 'funded'], ['Marcus Reid', 'funded']])
    expect(wise.transfers.size).toBe(2)
    expect(new Set(Array.from(store.payouts.values()).map((p) => p.customer_transaction_id)).size).toBe(2)
  })
})

describe('refusals before any money moves free the trips for the next run', () => {
  test('not enough US dollars: no transfer, failed, items voided, and the next day it goes', async () => {
    const { store, wise, notify, deps } = setup([ride()])
    wise.balance = 100
    const r = await runDriverPayouts(deps())
    expect(only(r.payees)).toMatchObject({ outcome: 'failed', detail: 'not enough US dollars in the Wise balance' })
    expect(wise.calls).toEqual(['recipient', 'quote'])
    expect(active(store)).toBe(0)
    expect(Array.from(store.payouts.values())[0].status).toBe('failed')
    expect(notify).toHaveBeenCalledTimes(1)

    wise.balance = 10_000
    const next = await runDriverPayouts(deps({ nowMs: NOV_1 + 86_400_000 }))
    expect(only(next.payees).outcome).toBe('funded')
  })

  test('the recipient is inactive or not in US dollars', async () => {
    const { wise, deps } = setup([ride()])
    wise.recipient = { ...wise.recipient, currency: 'JMD' }
    expect(only((await runDriverPayouts(deps())).payees).detail).toMatch(/takes JMD, not US dollars/)
    const s2 = setup([ride()])
    s2.wise.recipient = { ...s2.wise.recipient, active: false }
    expect(only((await runDriverPayouts(s2.deps())).payees).detail).toBe('the Wise recipient is not active')
  })

  test('a fee over the limit stops it before the transfer', async () => {
    const { wise, deps } = setup([ride()])
    wise.fee = 55
    const r = await runDriverPayouts(deps())
    expect(only(r.payees).detail).toMatch(/fee US\$55\.00 is over the US\$40\.00 limit/)
    expect(wise.calls).not.toContain('transfer')
  })

  test('Wise needs a field we do not fill: it says which, and nothing is created', async () => {
    const { wise, deps } = setup([ride()])
    wise.requirements = [
      { key: 'reference', required: false, minLength: null, maxLength: 35, validationRegexp: null, valuesAllowed: null },
      { key: 'transferPurpose', required: true, minLength: null, maxLength: null, validationRegexp: null, valuesAllowed: ['SERVICES'] },
    ]
    const r = await runDriverPayouts(deps())
    expect(only(r.payees).detail).toBe('Wise needs more for this transfer: transferPurpose')
    expect(wise.calls).not.toContain('transfer')
  })

  test('Wise refuses the transfer outright', async () => {
    const { store, wise, deps } = setup([ride()])
    wise.fail.transfer = [refused('error.recipient', 422)]
    const r = await runDriverPayouts(deps())
    expect(only(r.payees).outcome).toBe('failed')
    expect(active(store)).toBe(0)
  })

  test('the payment is refused (insufficient funds at funding): the transfer is cancelled first', async () => {
    const { store, wise, deps } = setup([ride()])
    wise.fail.fund = ['reject-insufficient']
    const r = await runDriverPayouts(deps())
    expect(only(r.payees)).toMatchObject({ outcome: 'failed', detail: 'not enough US dollars in the Wise balance' })
    expect(wise.calls).toEqual(['recipient', 'quote', 'requirements', 'transfer', 'fund', 'cancel'])
    expect(Array.from(wise.transfers.values())[0].status).toBe('cancelled')
    expect(active(store)).toBe(0)
  })

  test('refused and the cancel fails: needs a person, and the trips stay held', async () => {
    const { store, wise, deps } = setup([ride()])
    wise.fail.fund = ['reject-insufficient']
    wise.fail.cancel = [ambiguous()]
    const r = await runDriverPayouts(deps())
    expect(only(r.payees).outcome).toBe('needs_review')
    expect(only(r.payees).detail).toMatch(/could not be cancelled, so cancel it in Wise/)
    expect(active(store)).toBe(2)
    const next = await runDriverPayouts(deps({ nowMs: NOV_1 + 86_400_000 }))
    expect(next.payees).toEqual([])
    expect(only(next.holds)).toMatchObject({ payee: 'Collin', status: 'needs_review' })
  })
})

describe('an unknown outcome is never guessed', () => {
  test('the transfer answer is lost once: the retry with the same key returns the same transfer', async () => {
    const { wise, deps } = setup([ride()])
    wise.fail.transfer = ['went-through-then-lost']
    const r = await runDriverPayouts(deps())
    expect(only(r.payees).outcome).toBe('funded')
    expect(wise.transferInputs).toHaveLength(2)
    expect(wise.transferInputs[0].customerTransactionId).toBe(wise.transferInputs[1].customerTransactionId)
    expect(wise.transfers.size).toBe(1)
  })

  test('the transfer answer is lost twice: needs a person; the trips stay held, the driver too', async () => {
    const { store, wise, deps } = setup([ride()])
    wise.fail.transfer = [ambiguous(), ambiguous()]
    const r = await runDriverPayouts(deps())
    expect(only(r.payees).outcome).toBe('needs_review')
    expect(active(store)).toBe(2)
    expect(wise.calls).not.toContain('fund')
    const next = await runDriverPayouts(deps({ nowMs: NOV_1 + 86_400_000 }))
    expect(next.payees).toEqual([])
    expect(next.holds).toHaveLength(1)
  })

  test('the funding answer is lost but the money moved: read back, recorded, not funded twice', async () => {
    const { store, wise, deps } = setup([ride()])
    wise.fail.fund = ['went-through-then-lost']
    const r = await runDriverPayouts(deps())
    expect(only(r.payees).outcome).toBe('funded')
    expect(wise.calls.filter((c) => c === 'fund')).toHaveLength(1)
    expect(wise.calls).toContain('get')
    expect(Array.from(store.payouts.values())[0].status).toBe('funded')
  })

  test('the funding answer is lost and it is still waiting: one more attempt, then funded', async () => {
    const { wise, deps } = setup([ride()])
    wise.fail.fund = [ambiguous()]
    const r = await runDriverPayouts(deps())
    expect(only(r.payees).outcome).toBe('funded')
    expect(wise.calls.filter((c) => c === 'fund')).toHaveLength(2)
  })

  test('the funding answer is lost and the read lags: the second attempt hears "already paid" and records it once', async () => {
    const { store, wise, deps } = setup([ride()])
    wise.fail.fund = ['went-through-then-lost']
    wise.fail.get = ['stale-waiting']
    const r = await runDriverPayouts(deps())
    expect(only(r.payees).outcome).toBe('funded')
    expect(wise.calls.filter((c) => c === 'fund')).toHaveLength(2) // the second is answered payment.exists
    expect(wise.calls).not.toContain('cancel')
    expect(Array.from(store.payouts.values())[0].status).toBe('funded')
  })

  test('funding started but unconfirmed, and Wise cannot be read: needs a person', async () => {
    const { store, wise, deps } = setup([ride()])
    wise.fail.fund = ['created-unconfirmed']
    wise.fail.get = [ambiguous()]
    const r = await runDriverPayouts(deps())
    expect(only(r.payees).outcome).toBe('needs_review')
    expect(active(store)).toBe(2)
  })

  test('a quote that Wise does not answer is nothing paid: failed, freed', async () => {
    const { store, wise, deps } = setup([ride()])
    wise.fail.quote = [ambiguous()]
    const r = await runDriverPayouts(deps())
    expect(only(r.payees).outcome).toBe('failed')
    expect(active(store)).toBe(0)
  })
})

describe('earlier runs', () => {
  test('a payout left with its transfer created and unpaid is funded on the next run', async () => {
    const { store, wise, deps } = setup([ride()])
    wise.fail.fund = [ambiguous()]
    wise.fail.get = [ambiguous()] // first run cannot tell
    const first = await runDriverPayouts(deps())
    expect(only(first.payees).outcome).toBe('needs_review')
    // A person checked Wise and marked it created again (still waiting).
    const p = Array.from(store.payouts.values())[0]
    p.status = 'created'
    const next = await runDriverPayouts(deps({ nowMs: NOV_1 + 3_600_000 }))
    expect(only(next.earlier)).toMatchObject({ payee: 'Collin', outcome: 'funded' })
    expect(p.status).toBe('funded')
    expect(wise.calls.filter((c) => c === 'fund').length).toBeGreaterThanOrEqual(2)
    expect(Array.from(wise.transfers.values())[0].funded).toBe(true)
  })

  test('a payout left created whose transfer Wise shows paid is recorded without funding it again', async () => {
    const { store, wise, deps } = setup([ride()])
    wise.fail.fund = ['went-through-then-lost']
    wise.fail.get = [ambiguous()] // the first run cannot tell
    expect(only((await runDriverPayouts(deps())).payees).outcome).toBe('needs_review')
    const p = Array.from(store.payouts.values())[0]
    p.status = 'created' // a person looked: Wise has it, so it is put back in flight
    wise.calls.length = 0
    const next = await runDriverPayouts(deps({ nowMs: NOV_1 + 3_600_000 }))
    expect(only(next.earlier)).toMatchObject({ outcome: 'funded' })
    expect(wise.calls).toEqual(['get'])
    expect(p.status).toBe('funded')
  })

  test('a claim with no transfer recorded after 30 minutes needs a person, and holds the driver', async () => {
    const { store, wise, deps } = setup([ride()])
    store.loseNextClaim = false
    // Simulate a run that died right after claiming.
    await store.claim({ payee: 'Collin', recipientId: 900001, amountUsd: 147, payDay: '2026-11-01', customerTransactionId: 'c0ffee00-0000-4000-8000-000000000000', items: [{ booking_id: (await store.loadBookings())[0].id, part: 'first', amount_usd: 73.5 }, { booking_id: (await store.loadBookings())[0].id, part: 'second', amount_usd: 73.5 }] })
    const r = await runDriverPayouts(deps({ nowMs: NOV_1 + STALE_CLAIM_MS + 60_000 }))
    expect(only(r.earlier).outcome).toBe('needs_review')
    expect(r.payees).toEqual([])
    expect(wise.calls).toEqual([])
  })

  test('a payout that came back holds the driver until someone resolves it', async () => {
    const { store, deps } = setup([ride(), ride({ arrival: '2026-10-12T10:00:00+00:00', departure: '2026-10-19T10:00:00+00:00' })])
    store.payouts.set('returned-1', {
      id: 'returned-1', payee: 'Collin', recipient_id: 900001, amount_usd: 50, status: 'returned', customer_transaction_id: 'x',
      wise_quote_id: null, wise_transfer_id: 1, wise_state: 'funds_refunded', wise_state_at: null, pay_day: '2026-09-30', error: 'Wise: funds_refunded',
      created_at: '2026-10-01T14:30:00Z', funded_at: null, sent_at: null, resolved_at: null,
    })
    const held = await runDriverPayouts(deps())
    expect(only(held.payees)).toMatchObject({ outcome: 'held', detail: expect.stringMatching(/came back from the bank/) })
    store.payouts.get('returned-1')!.resolved_at = '2026-11-01T15:00:00Z'
    const paid = await runDriverPayouts(deps({ nowMs: NOV_1 + 3_600_000 }))
    expect(only(paid.payees).outcome).toBe('funded')
  })
})

describe('races, time and the console', () => {
  test('another run holds the trips: skipped, nothing sent', async () => {
    const { store, wise, deps } = setup([ride()])
    store.loseNextClaim = true
    const r = await runDriverPayouts(deps())
    expect(only(r.payees).outcome).toBe('taken')
    expect(wise.calls).toEqual([])
  })

  test('out of time: no new payout starts; the next daily run sends it', async () => {
    let t = 0
    const { wise, deps } = setup([ride({ driver: 'Collin' }), ride({ driver: 'Marcus Reid' })])
    const clock = () => { t += 4000; return t }
    const r = await runDriverPayouts(deps({ clock, budgetMs: 6000 }))
    expect(r.payees.map((d) => d.outcome)).toEqual(['funded', 'deferred'])
    expect(wise.transfers.size).toBe(1)
  })

  test('paid by hand in the console while the run was paying: said loudly', async () => {
    const b = ride()
    const { store, deps } = setup([b])
    const realStamp = store.stamp
    store.stamp = async (id, part, iso, via) => {
      if (part === 'second') store.dispatch.get(id)!.paid_second = '2026-11-01T14:29:00Z'
      return realStamp(id, part, iso, via)
    }
    const r = await runDriverPayouts(deps())
    expect(only(r.payees).alreadyStamped).toEqual([`${b.id}:second`])
    expect(only(r.payees).detail).toMatch(/not paid twice/)
    // A possible double payment is never reported as a plain success.
    expect(payoutSummary(r).title).toBe('Payouts on Sun, Nov 1 need a look')
  })

  test('the stamps fail: the payout is still recorded as paid, and the email says so', async () => {
    const { store, deps } = setup([ride()])
    store.stampFails = true
    const r = await runDriverPayouts(deps())
    expect(only(r.payees)).toMatchObject({ outcome: 'funded', detail: expect.stringMatching(/could not be marked paid/) })
    expect(Array.from(store.payouts.values())[0].status).toBe('funded')
  })

  test('a driver with no recipient or over the limit is never sent anything, and the inbox hears', async () => {
    const { wise, notify, deps } = setup([ride({ driver: 'Someone New' }), ride({ subtotal: 3200 })])
    const r = await runDriverPayouts(deps())
    expect(r.payees.map((d) => d.outcome).sort()).toEqual(['held', 'no_recipient'])
    expect(wise.calls).toEqual([])
    expect(notify).toHaveBeenCalledTimes(1)
    const m = payoutSummary(r)
    expect(m.title).toBe('Payouts on Sun, Nov 1 need a look')
    expect(m.lines.join('\n')).toMatch(/Someone New: US\$147\.00 for 2 trips, NOT PAID: no Wise recipient/)
  })

  test('nothing owed: no email', async () => {
    const { notify, deps } = setup([])
    const r = await runDriverPayouts(deps())
    expect(r.attention).toBe(false)
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('references and requirements', () => {
  test('the longest reference the route allows: one booking by its reference', () => {
    const c = referenceCandidates([{ ref: 'MAPL-BE0C1B10' }, { ref: 'MAPL-BE0C1B10' }])
    const f = (maxLength: number | null, validationRegexp: string | null = null) => [{ key: 'reference', required: false, minLength: null, maxLength, validationRegexp, valuesAllowed: null }]
    expect(chooseReference(c, [])).toBe('MAPL Tours Jamaica BE0C1B10')
    expect(chooseReference(c, f(35))).toBe('MAPL Tours Jamaica BE0C1B10')
    expect(chooseReference(c, f(13))).toBe('MAPL-BE0C1B10')
    expect(chooseReference(c, f(10))).toBe('BE0C1B10')
    expect(chooseReference(c, f(5))).toBe('MAPL')
    expect(chooseReference(c, f(3))).toBeNull()
    // A pattern that allows capitals, digits and spaces only: the booking code passes, not the hyphenated ref.
    expect(chooseReference(c, f(20, '^[A-Z0-9 ]+$'))).toBe('BE0C1B10')
  })

  test('several bookings are counted', () => {
    const c = referenceCandidates([{ ref: 'MAPL-AAAAAAAA' }, { ref: 'MAPL-BBBBBBBB' }, { ref: 'MAPL-AAAAAAAA' }])
    const f = (maxLength: number) => [{ key: 'reference', required: false, minLength: null, maxLength, validationRegexp: null, valuesAllowed: null }]
    expect(chooseReference(c, [])).toBe('MAPL Tours Jamaica 2 bookings')
    expect(chooseReference(c, f(18))).toBe('MAPL 2 bookings')
    expect(chooseReference(c, f(10))).toBe('MAPL')
  })

  test('only required fields beyond the reference are unmet', () => {
    expect(unmetRequirements([
      { key: 'reference', required: true, minLength: null, maxLength: 35, validationRegexp: null, valuesAllowed: null },
      { key: 'sourceOfFunds', required: false, minLength: null, maxLength: null, validationRegexp: null, valuesAllowed: null },
    ])).toEqual([])
  })
})

describe("the driver's payment email", () => {
  const mailer = (answer: (id: string, part: PayPart) => Promise<boolean> = async () => true) =>
    vi.fn<(id: string, part: PayPart) => Promise<boolean>>(answer)

  test('once per ride half the payout paid, after the money moved and the stamp was written', async () => {
    const a = ride({ subtotal: 147 })
    const b = ride({ trip: 'one_way', subtotal: 51, arrival: '2026-10-20T10:00:00+00:00', departure: null })
    const { store, deps } = setup([a, b])
    const order: string[] = []
    const notifyPaid = mailer(async (id, part) => {
      // By the time the email goes, the payout is funded and this half is stamped.
      order.push(`${Array.from(store.payouts.values())[0].status}:${store.dispatch.get(id)?.[part === 'first' ? 'paid_first' : 'paid_second'] ? 'stamped' : 'not'}`)
      return true
    })
    const r = await runDriverPayouts(deps({ notifyPaid }))
    expect(only(r.payees)).toMatchObject({ outcome: 'funded', detail: null })
    expect(notifyPaid.mock.calls.map(([id, part]) => `${id}:${part}`).sort()).toEqual([`${a.id}:first`, `${a.id}:second`, `${b.id}:first`].sort())
    expect(order).toEqual(['funded:stamped', 'funded:stamped', 'funded:stamped'])
  })

  test('a tour in the same payment gets its own notice, once, beside the ride halves', async () => {
    const r1 = ride()
    const t = tour()
    const { deps } = setup([r1, t])
    const notifyPaid = mailer()
    const r = await runDriverPayouts(deps({ notifyPaid }))
    expect(only(r.payees).outcome).toBe('funded')
    expect(notifyPaid.mock.calls.map(([id, part]) => `${id}:${part}`).sort()).toEqual([`${r1.id}:first`, `${r1.id}:second`, `${t.id}:tour`].sort())
  })

  test('a half someone ticked by hand while the run was paying is not emailed again', async () => {
    const b = ride()
    const { store, deps } = setup([b])
    const realStamp = store.stamp
    store.stamp = async (id, part, iso, via) => {
      if (part === 'second') store.dispatch.get(id)!.paid_second = '2026-11-01T14:29:00Z'
      return realStamp(id, part, iso, via)
    }
    const notifyPaid = mailer()
    await runDriverPayouts(deps({ notifyPaid }))
    expect(notifyPaid.mock.calls).toEqual([[b.id, 'first']])
  })

  test('nothing is emailed when the stamps could not be written', async () => {
    const { store, deps } = setup([ride()])
    store.stampFails = true
    const notifyPaid = mailer()
    await runDriverPayouts(deps({ notifyPaid }))
    expect(notifyPaid).not.toHaveBeenCalled()
  })

  test('nothing is emailed when no money moved: refused, unknown, dry, or another run holds it', async () => {
    const notifyPaid = mailer()
    const s1 = setup([ride()])
    s1.wise.balance = 100
    await runDriverPayouts(s1.deps({ notifyPaid }))
    const s2 = setup([ride()])
    s2.wise.fail.fund = ['created-unconfirmed']
    s2.wise.fail.get = [ambiguous()]
    expect(only((await runDriverPayouts(s2.deps({ notifyPaid }))).payees).outcome).toBe('needs_review')
    const s3 = setup([ride()])
    await runDriverPayouts(s3.deps({ notifyPaid, send: false, wise: null }))
    const s4 = setup([ride()])
    s4.store.loseNextClaim = true
    await runDriverPayouts(s4.deps({ notifyPaid }))
    expect(notifyPaid).not.toHaveBeenCalled()
  })

  test('a payment recorded on a later run (its answer was lost) is emailed then, once', async () => {
    const { store, wise, deps } = setup([ride()])
    wise.fail.fund = ['went-through-then-lost']
    wise.fail.get = [ambiguous()]
    const notifyPaid = mailer()
    const first = await runDriverPayouts(deps({ notifyPaid }))
    expect(only(first.payees).outcome).toBe('needs_review')
    expect(notifyPaid).not.toHaveBeenCalled()
    Array.from(store.payouts.values())[0].status = 'created'
    const next = await runDriverPayouts(deps({ notifyPaid, nowMs: NOV_1 + 3_600_000 }))
    expect(only(next.earlier).outcome).toBe('funded')
    expect(notifyPaid).toHaveBeenCalledTimes(2)
  })

  test('an email that fails, throws or hangs never changes the record; the inbox is told', async () => {
    let n = 0
    const notifyPaid = mailer(async () => {
      n++
      if (n === 1) throw new Error('resend down')
      return new Promise<boolean>(() => {}) // never answers
    })
    const { store, notify, deps } = setup([ride()])
    const r = await runDriverPayouts(deps({ notifyPaid, paidEmailWaitMs: 20 }))
    expect(only(r.payees)).toMatchObject({ outcome: 'funded', detail: expect.stringMatching(/payment email did not go for 2 trip\(s\)/) })
    const p = Array.from(store.payouts.values())[0]
    expect(p.status).toBe('funded')
    expect(active(store)).toBe(2)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(payoutSummary(r).lines.join('\n')).toMatch(/payment email did not go/)
  })

  test('an email that answers "not sent" is reported, and the payout still stands', async () => {
    const { deps } = setup([ride()])
    const r = await runDriverPayouts(deps({ notifyPaid: mailer(async () => false) }))
    expect(only(r.payees)).toMatchObject({ outcome: 'funded', detail: expect.stringMatching(/did not go for 2 trip/) })
  })
})
