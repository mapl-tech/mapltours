import { describe, test, expect, beforeEach } from 'vitest'
import { planReferralPayouts, runReferralPayouts, referralRunSummary, holdFor, type ReferralRunStore, type ReferralPayoutPatch, DEFAULT_REFERRAL_LIMITS } from '@/lib/referrals/payout-run'
import type { LedgerRows, ReferralPayoutRow, EarningRow, LedgerBooking } from '@/lib/referrals/ledger'
import type { ReferrerRow } from '@/lib/referrals/access'
import { TERMS_VERSION } from '@/lib/referrals/rules'
import { WiseApiError, type WiseApi, type WiseQuote } from '@/lib/wise/client'

/**
 * The referral payout run (lib/referrals/payout-run) over an in-memory store
 * that keeps claim_referral_payout's rule (one live item per earning) and a
 * fake Wise. Made-up referrers, bookings and Wise ids.
 *
 * Jamaica is UTC-5. Monday Dec 7 2026, 09:45 in Jamaica, is the run.
 */

const at = (s: string) => Date.parse(`${s}:00Z`) + 5 * 3_600_000
const MONDAY = at('2026-12-07T09:45')
const TUESDAY = at('2026-12-08T09:45')
const SUNDAY = at('2026-12-06T09:45')

const referrer = (o: Partial<ReferrerRow> = {}): ReferrerRow => ({
  id: 'r1', email: 'ann@example.com', name: 'Ann Lee', business: 'Charela Inn', status: 'active', commission_percent: 3, user_id: 'u1',
  invited_at: '2026-11-01T00:00:00Z', invite_sent_at: '2026-11-01T00:00:00Z', invite_sends: 1, terms_version: TERMS_VERSION, terms_accepted_at: '2026-11-01T01:00:00Z',
  wise_recipient_id: 2001, payout_holder: 'Ann Lee', payout_last4: '4567', payout_legal_type: 'PRIVATE', payout_added_at: '2026-11-01T02:00:00Z', payout_hold_until: '2026-11-04T02:00:00Z',
  created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...o,
})
const booking = (id: string, o: Partial<LedgerBooking> = {}): LedgerBooking => ({
  id, status: 'paid', booking_type: 'transfer', total_paid: 184.3, subtotal: 162, coupon_discount: 9.7, refund_state: 'none', refunded_at: null,
  created_at: '2026-11-10T12:00:00Z', booking_items: [{ item_type: 'transfer', trip_type: 'round_trip', arrival_at: '2026-11-28T14:00:00+00:00', departure_at: '2026-12-05T10:00:00+00:00' }], ...o,
})
const earning = (id: string, bookingId: string, o: Partial<EarningRow> = {}): EarningRow => ({
  id, booking_id: bookingId, referrer_id: 'r1', coupon_id: 'c1', code: 'CHARELA5', commission_percent: 3, recorded_late: false,
  voided_at: null, void_reason: null, voided_by: null, created_at: '2026-11-10T12:00:00Z', ...o,
})
const B1 = '11111111-1111-4111-8111-111111111111'
const B2 = '22222222-2222-4222-8222-222222222222'

function rowsWith(o: Partial<LedgerRows> = {}): LedgerRows {
  return {
    referrers: [referrer()],
    codes: [{ id: 'c1', referrer_id: 'r1', code: 'CHARELA5', note: null, status: 'active', referral_hold: false, uses: 2, created_at: '2026-11-01T03:00:00Z', retired_at: null }],
    earnings: [earning('e1', B1), earning('e2', B2)],
    bookings: [booking(B1), booking(B2, { booking_type: 'tour', total_paid: 318.25, subtotal: 266, booking_items: [{ item_type: 'experience', title: "Dunn's River Falls Climb", date: '2026-12-02' }] })],
    payouts: [],
    items: [],
    events: [],
    ...o,
  }
}

describe('the plan', () => {
  test('on the Monday after the trips: one payout for both, 3% each, never on a Sunday', () => {
    const plan = planReferralPayouts(rowsWith(), [], MONDAY)
    expect(plan.payDay).toBe('2026-12-07')
    expect(plan.payees).toHaveLength(1)
    const p = plan.payees[0]
    expect(p).toMatchObject({ referrerId: 'r1', payee: 'Ann Lee (Charela Inn)', recipientId: 2001, last4: '4567', status: 'ready', reason: null })
    // 3% of 184.30 = 5.53; 3% of 318.25 = 9.55 (9.5475 rounds up).
    expect(p.lines.map((l) => l.amountCents).sort()).toEqual([553, 955])
    expect(p.totalCents).toBe(1508)
    expect(planReferralPayouts(rowsWith(), [], SUNDAY).payees).toEqual([])
    expect(planReferralPayouts(rowsWith(), [], TUESDAY).payees[0].status).toBe('ready') // a missed Monday catches up
  })

  test('a trip that has not happened, a refund asked for, a refund, a booking not counted: none of them paid', () => {
    const rows = rowsWith({
      bookings: [
        booking(B1, { booking_items: [{ item_type: 'transfer', trip_type: 'one_way', arrival_at: '2026-12-09T14:00:00+00:00' }] }),
        booking(B2, { refund_state: 'requested' }),
        booking('33333333-3333-4333-8333-333333333333', { status: 'refunded', refunded_at: '2026-11-11T00:00:00Z' }),
        booking('44444444-4444-4444-8444-444444444444'),
      ],
      earnings: [
        earning('e1', B1), earning('e2', B2), earning('e3', '33333333-3333-4333-8333-333333333333'),
        earning('e4', '44444444-4444-4444-8444-444444444444', { voided_at: '2026-11-20T00:00:00Z', void_reason: 'Your own booking' }),
      ],
    })
    expect(planReferralPayouts(rows, [], MONDAY).payees).toEqual([])
  })

  test('held, with the reason, and never sent', () => {
    const reasons = (r: Partial<ReferrerRow>, open: ReferralPayoutRow[] = []) => planReferralPayouts(rowsWith({ referrers: [referrer(r)] }), open, MONDAY).payees[0]
    expect(reasons({ status: 'paused' })).toMatchObject({ status: 'held', reason: 'the referrer is paused' })
    expect(reasons({ wise_recipient_id: null, payout_last4: null, payout_holder: null, payout_legal_type: null })).toMatchObject({ status: 'held', reason: 'no payout account yet' })
    expect(reasons({ payout_hold_until: '2026-12-08T00:00:00Z' }).reason).toMatch(/new payout account is waiting/)
    const open = { id: 'p0', referrer_id: 'r1', status: 'needs_review', resolved_at: null, amount_usd: 4 } as unknown as ReferralPayoutRow
    expect(reasons({}, [open]).reason).toMatch(/needs a look/)
    expect(holdFor([{ ...open, resolved_at: '2026-12-01T00:00:00Z' }], 'r1')).toBeNull()
  })

  test('a removed referrer is still paid what they earned (the terms say so)', () => {
    expect(planReferralPayouts(rowsWith({ referrers: [referrer({ status: 'removed' })] }), [], MONDAY).payees[0].status).toBe('ready')
  })

  test('under US$1 waits; over the limits waits for a person', () => {
    const tiny = rowsWith({ bookings: [booking(B1, { total_paid: 18.05, subtotal: 15.65 })], earnings: [earning('e1', B1)] })
    expect(planReferralPayouts(tiny, [], MONDAY).payees[0]).toMatchObject({ status: 'held', reason: expect.stringMatching(/under US\$1/), needsPerson: false })
    expect(planReferralPayouts(rowsWith(), [], MONDAY, { maxReferrerUsd: 10, maxRunUsd: 3000 }).payees[0]).toMatchObject({ reason: expect.stringMatching(/limit for one referrer/), needsPerson: true })
    expect(planReferralPayouts(rowsWith(), [], MONDAY, { maxReferrerUsd: 1500, maxRunUsd: 10 }).payees[0]).toMatchObject({ reason: expect.stringMatching(/run would pass/), needsPerson: true })
  })

  test('an earning already in a live payout is not planned again', () => {
    const rows = rowsWith({
      payouts: [{ id: 'p1', referrer_id: 'r1', payee: 'Ann Lee', recipient_id: 2001, account_last4: '4567', amount_usd: 5.53, fee_usd: 0, status: 'funded', wise_transfer_id: 9, pay_day: '2026-11-30', error: null, created_at: '2026-11-30T15:00:00Z', funded_at: '2026-11-30T15:00:01Z', sent_at: null, resolved_at: null }],
      items: [{ id: 'i1', payout_id: 'p1', earning_id: 'e1', booking_id: B1, amount_usd: 5.53, active: true }],
    })
    expect(planReferralPayouts(rows, [], MONDAY).payees[0].lines.map((l) => l.earningId)).toEqual(['e2'])
  })
})

/* ── The run ─────────────────────────────────────────────────────────── */

let rows: LedgerRows
let store: ReferralRunStore & { payouts: Map<string, ReferralPayoutRow & ReferralPayoutPatch>; liveItems: Set<string>; claims: number; late: number }
let wiseCalls: string[]
let wise: WiseApi
const quote = (o: Partial<WiseQuote> = {}, fee = 0, payOut = 'BALANCE'): WiseQuote => ({
  id: 'q1', status: 'PENDING', payOut, sourceCurrency: 'USD', targetCurrency: 'USD', targetAmount: 15.08,
  option: { payIn: 'BALANCE', payOut, disabled: false, disabledReason: null, feeTotal: fee, sourceAmount: 15.08 + fee, targetAmount: 15.08, estimatedDelivery: null }, expirationTime: null, ...o,
})

function makeStore() {
  const payouts = new Map<string, ReferralPayoutRow & ReferralPayoutPatch>()
  const liveItems = new Set<string>()
  const s = {
    payouts, liveItems, claims: 0, late: 0,
    async loadRows() { return rows },
    async openPayouts() { return Array.from(payouts.values()).filter((p) => p.status === 'claimed' || p.status === 'created' || ((p.status === 'needs_review' || p.status === 'returned') && !p.resolved_at)) },
    async claim(input: Parameters<ReferralRunStore['claim']>[0]) {
      s.claims++
      if (input.items.some((i) => liveItems.has(i.earning_id))) return null
      const total = input.items.reduce((a, i) => a + Math.round(i.amount_usd * 100), 0)
      expect(total).toBe(Math.round(input.amountUsd * 100))
      const id = `p${payouts.size + 1}`
      payouts.set(id, { id, referrer_id: input.referrerId, payee: input.payee, recipient_id: input.recipientId, account_last4: input.last4, amount_usd: input.amountUsd, fee_usd: null, status: 'claimed', wise_transfer_id: null, pay_day: input.payDay, error: null, created_at: new Date(MONDAY).toISOString(), funded_at: null, sent_at: null, resolved_at: null })
      for (const i of input.items) liveItems.add(i.earning_id)
      return id
    },
    async update(id: string, patch: ReferralPayoutPatch) { Object.assign(payouts.get(id)!, patch) },
    async voidItems(payoutId: string) {
      // In this fake each payout's items are its earnings in the plan; free them all.
      const p = payouts.get(payoutId)!
      for (const e of rows.earnings) if (p) liveItems.delete(e.id)
    },
    async recordMissingEarnings() { return s.late },
  }
  return s
}

function makeWise(o: Partial<WiseApi> = {}): WiseApi {
  return {
    async getRecipient(id) { wiseCalls.push(`recipient:${id}`); return { id, currency: 'USD', type: 'Aba', active: true, name: 'Ann Lee' } }, // Wise's 2026Q4 spelling
    async createQuote(i) { wiseCalls.push(`quote:${i.targetAmount}:${i.targetAccount}`); return quote() },
    async transferRequirements() { wiseCalls.push('requirements'); return [{ key: 'reference', required: false, minLength: null, maxLength: 35, validationRegexp: null, valuesAllowed: null }] },
    async createTransfer(i) { wiseCalls.push(`transfer:${i.reference}:${i.customerTransactionId.length}`); return { id: 777, status: 'incoming_payment_waiting', targetAccount: i.targetAccount, quoteUuid: i.quoteUuid, sourceValue: 15.08, targetValue: 15.08, targetCurrency: 'USD', reference: i.reference } },
    async fundFromBalance() { wiseCalls.push('fund'); return { status: 'COMPLETED', errorCode: null, errorMessage: null } },
    async getTransfer(id) { wiseCalls.push(`read:${id}`); return { id, status: 'processing', targetAccount: 2001, quoteUuid: 'q1', sourceValue: 15.08, targetValue: 15.08, targetCurrency: 'USD', reference: 'x' } },
    async cancelTransfer(id) { wiseCalls.push(`cancel:${id}`); return { id, status: 'cancelled', targetAccount: 2001, quoteUuid: 'q1', sourceValue: null, targetValue: null, targetCurrency: 'USD', reference: null } },
    ...o,
  }
}

const config = { profileId: 9001, balanceId: 70001, limits: DEFAULT_REFERRAL_LIMITS }
let emails: Array<{ amountCents: number; last4: string; lines: number }>
let opsReports: number

beforeEach(() => {
  rows = rowsWith()
  store = makeStore()
  wiseCalls = []
  wise = makeWise()
  emails = []
  opsReports = 0
})

const run = (o: Partial<Parameters<typeof runReferralPayouts>[0]> = {}) => runReferralPayouts({
  store, wise, config, send: true, nowMs: MONDAY,
  notifyPaid: async (_r, p) => { emails.push({ amountCents: p.amountCents, last4: p.last4, lines: p.lines.length }); return true },
  notifyOps: async () => { opsReports++ },
  ...o,
})

describe('the run', () => {
  test('a routine hold never emails the office (the run plans every day); a limit does', async () => {
    const routine: Array<Partial<ReferrerRow>> = [
      { status: 'paused' },
      { wise_recipient_id: null, payout_last4: null, payout_holder: null, payout_legal_type: null },
      { payout_hold_until: '2026-12-08T00:00:00Z' },
    ]
    for (const r of routine) {
      rows = rowsWith({ referrers: [referrer(r)] })
      opsReports = 0
      const rep = await run()
      expect(rep.payees[0].outcome).toBe('held')
      expect(opsReports).toBe(0)
    }
    rows = rowsWith({ bookings: [booking(B1, { total_paid: 18.05, subtotal: 15.65 })], earnings: [earning('e1', B1)] })
    opsReports = 0
    expect((await run()).payees[0].outcome).toBe('held')
    expect(opsReports).toBe(0)
    rows = rowsWith()
    opsReports = 0
    expect((await run({ config: { ...config, limits: { maxReferrerUsd: 10, maxRunUsd: 3000 } } })).payees[0]).toMatchObject({ outcome: 'held', needsPerson: true })
    expect(opsReports).toBe(1)
    expect(wiseCalls).toEqual([])
  })

  test('a clean payout: claimed, quoted balance to balance for nothing, transferred, funded, emailed; the office not bothered', async () => {
    const r = await run()
    expect(r.payees).toEqual([expect.objectContaining({ outcome: 'funded', amountCents: 1508, trips: 2, transferId: 777, emailed: true, detail: null })])
    expect(wiseCalls).toEqual(['recipient:2001', 'quote:15.08:2001', 'requirements', 'transfer:MAPL Tours Jamaica referrals:36', 'fund'])
    const p = store.payouts.get('p1')!
    expect(p).toMatchObject({ status: 'funded', wise_transfer_id: 777, fee_usd: 0, account_last4: '4567' })
    expect(p.notified_at).toBeTruthy()
    expect(emails).toEqual([{ amountCents: 1508, last4: '4567', lines: 2 }])
    expect(opsReports).toBe(0)
  })

  test('a dry run never calls Wise or claims anything', async () => {
    const r = await run({ send: false, wise: null })
    expect(r.mode).toBe('dry')
    expect(r.payees[0].outcome).toBe('planned')
    expect(store.claims).toBe(0)
    expect(wiseCalls).toEqual([])
  })

  test('a second run the same day finds nothing to pay: the earnings are claimed', async () => {
    await run()
    rows = { ...rows, payouts: Array.from(store.payouts.values()), items: Array.from(store.liveItems).map((e, i) => ({ id: `i${i}`, payout_id: 'p1', earning_id: e, booking_id: e === 'e1' ? B1 : B2, amount_usd: e === 'e1' ? 5.53 : 9.55, active: true })) }
    wiseCalls = []
    const again = await run()
    expect(again.payees).toEqual([])
    expect(wiseCalls).toEqual([])
  })

  test('two runs racing: the second claim loses and sends nothing', async () => {
    store.liveItems.add('e1') // the other run holds one of them
    const r = await run()
    expect(r.payees[0].outcome).toBe('taken')
    expect(wiseCalls).toEqual([])
  })

  test('a quote that would not go balance to balance, or would cost anything, is refused before a transfer', async () => {
    for (const q of [quote({}, 0, 'BANK_TRANSFER'), quote({}, 0.05)]) {
      store = makeStore()
      wiseCalls = []
      wise = makeWise({ async createQuote() { wiseCalls.push('quote'); return q } })
      const r = await run()
      expect(r.payees[0].outcome).toBe('failed')
      expect(wiseCalls).not.toContain('fund')
      expect(wiseCalls.some((c) => c.startsWith('transfer'))).toBe(false)
      expect(store.liveItems.size).toBe(0) // freed for the next run
      expect(opsReports).toBeGreaterThan(0)
    }
  })

  test('an inactive or non-dollar recipient is refused', async () => {
    wise = makeWise({ async getRecipient(id) { return { id, currency: 'USD', type: 'aba', active: false, name: 'x' } } })
    expect((await run()).payees[0]).toMatchObject({ outcome: 'failed', detail: 'the Wise recipient is not active' })
  })

  test('not enough dollars: the transfer is cancelled and the commissions owed again', async () => {
    wise = makeWise({ async fundFromBalance() { wiseCalls.push('fund'); return { status: 'REJECTED', errorCode: 'balance.payment-option-unavailable', errorMessage: null } } })
    const r = await run()
    expect(r.payees[0]).toMatchObject({ outcome: 'failed', detail: 'not enough US dollars in the Wise balance' })
    expect(wiseCalls).toContain('cancel:777')
    expect(store.liveItems.size).toBe(0)
  })

  test('Wise answers payment.exists (the transfer was already funded): recorded funded, nothing cancelled, the commissions stay paid', async () => {
    const answers: Array<() => Promise<never> | Promise<{ status: string; errorCode: string | null; errorMessage: string | null }>> = [
      async () => ({ status: 'REJECTED', errorCode: 'payment.exists', errorMessage: null }),
      async () => { throw new WiseApiError('Payment exists', 409, 'payment.exists', false) },
    ]
    for (const answer of answers) {
      store = makeStore()
      wiseCalls = []
      wise = makeWise({ async fundFromBalance() { wiseCalls.push('fund'); return answer() as never } })
      const r = await run()
      expect(r.payees[0].outcome).toBe('funded')
      expect(wiseCalls.some((c) => c.startsWith('cancel'))).toBe(false)
      expect(store.payouts.get('p1')).toMatchObject({ status: 'funded', wise_transfer_id: 777 })
      expect(store.liveItems.size).toBe(2)
    }
  })

  test('funding with no answer, then Wise shows it paid: recorded funded, never funded twice', async () => {
    let n = 0
    wise = makeWise({ async fundFromBalance() { wiseCalls.push('fund'); n++; throw new WiseApiError('timed out', 0, null, true) } })
    const r = await run()
    expect(r.payees[0].outcome).toBe('funded')
    expect(n).toBe(1)
    expect(wiseCalls).toContain('read:777')
  })

  test('funding with no answer and no readable state: needs a person, the commissions stay claimed', async () => {
    wise = makeWise({
      async fundFromBalance() { throw new WiseApiError('timed out', 0, null, true) },
      async getTransfer() { throw new WiseApiError('timed out', 0, null, true) },
    })
    const r = await run()
    expect(r.payees[0].outcome).toBe('needs_review')
    expect(store.liveItems.size).toBe(2)
    expect(store.payouts.get('p1')!.status).toBe('needs_review')
  })

  test('a transfer for a different recipient or amount is never funded', async () => {
    wise = makeWise({ async createTransfer(i) { return { id: 778, status: 'incoming_payment_waiting', targetAccount: 9999, quoteUuid: i.quoteUuid, sourceValue: 15.08, targetValue: 15.08, targetCurrency: 'USD', reference: i.reference } } })
    const r = await run()
    expect(r.payees[0].outcome).toBe('needs_review')
    expect(wiseCalls).not.toContain('fund')
  })

  test('the email failing leaves the payout recorded and tells the office', async () => {
    const r = await run({ notifyPaid: async () => false })
    expect(r.payees[0]).toMatchObject({ outcome: 'funded', emailed: false })
    expect(store.payouts.get('p1')!.status).toBe('funded')
    expect(opsReports).toBe(1)
  })

  test('a payout an earlier run left created and Wise shows paid: recorded, not paid again', async () => {
    store.payouts.set('p9', { id: 'p9', referrer_id: 'r1', payee: 'Ann Lee', recipient_id: 2001, account_last4: '4567', amount_usd: 15.08, fee_usd: 0, status: 'created', wise_transfer_id: 555, pay_day: '2026-11-30', error: null, created_at: '2026-11-30T15:00:00Z', funded_at: null, sent_at: null, resolved_at: null })
    store.liveItems.add('e1'); store.liveItems.add('e2')
    rows = { ...rows, payouts: [store.payouts.get('p9')!], items: [{ id: 'i1', payout_id: 'p9', earning_id: 'e1', booking_id: B1, amount_usd: 5.53, active: true }, { id: 'i2', payout_id: 'p9', earning_id: 'e2', booking_id: B2, amount_usd: 9.55, active: true }] }
    const r = await run()
    expect(r.earlier).toEqual([{ payoutId: 'p9', outcome: 'funded', detail: 'it had been paid; recorded now' }])
    expect(wiseCalls).toEqual(['read:555'])
    expect(store.payouts.get('p9')!.status).toBe('funded')
  })

  test('a claim left with no transfer for 30 minutes needs a person', async () => {
    store.payouts.set('p8', { id: 'p8', referrer_id: 'r1', payee: 'Ann Lee', recipient_id: 2001, account_last4: '4567', amount_usd: 15.08, fee_usd: null, status: 'claimed', wise_transfer_id: null, pay_day: '2026-12-07', error: null, created_at: new Date(MONDAY - 31 * 60_000).toISOString(), funded_at: null, sent_at: null, resolved_at: null })
    const r = await run()
    expect(r.earlier[0]).toMatchObject({ payoutId: 'p8', outcome: 'needs_review' })
    // ...and that referrer is held from a new payout until it is resolved.
    expect(r.payees[0].outcome).toBe('held')
  })

  test('commissions recorded late are reported to the office', async () => {
    store.late = 2
    const r = await run()
    expect(r.recordedLate).toBe(2)
    expect(opsReports).toBe(1)
    expect(referralRunSummary(r).lines.join(' ')).toMatch(/2 commissions recorded late/)
  })

  test('the office summary never carries a bank detail or a guest', async () => {
    wise = makeWise({ async fundFromBalance() { return { status: 'REJECTED', errorCode: 'x', errorMessage: null } } })
    const r = await run()
    const m = referralRunSummary(r)
    expect(m.lines[0]).toMatch(/^Ann Lee \(Charela Inn\): US\$15\.08 for 2 trips, NOT PAID/)
    expect(JSON.stringify(m)).not.toMatch(/8310|026073150|guest/i)
  })
})
