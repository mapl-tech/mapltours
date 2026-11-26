import { describe, test, expect, vi, beforeEach } from 'vitest'
import { savePayoutAccount, recentSignIn, type PayoutAccountDeps } from '@/lib/referrals/payout-server'
import { WiseApiError, type WiseQuote, type WiseRecipient } from '@/lib/wise/client'
import type { ReferrerRow } from '@/lib/referrals/access'
import { TERMS_VERSION } from '@/lib/referrals/rules'

/**
 * Saving where a referrer is paid (lib/referrals/payout-server), over a fake
 * Wise and a fake database that keeps save_referrer_payout_account's rule
 * (it saves only over the account the caller expected). Every refusal must
 * happen before anything is saved, a recipient Wise created for a refused
 * attempt must be switched off, and no account number may reach a log, an
 * answer or an email. Made-up people and numbers.
 */

const NOW = Date.parse('2026-11-26T15:00:00Z')
const ACCOUNT = '8310001234567'
const form = {
  legalType: 'PRIVATE', holderName: 'Ann Lee', routingNumber: '026073150', accountNumber: ACCOUNT, accountNumberConfirm: ACCOUNT,
  accountType: 'CHECKING', country: 'JM', city: 'Montego Bay', street: '12 Gloucester Avenue', currentLast4: null as string | null,
}
const user = { id: 'u1', email: 'ann@example.com', lastSignInAt: new Date(NOW - 10 * 60_000).toISOString() }
const referrer = (o: Partial<ReferrerRow> = {}): ReferrerRow => ({
  id: 'r1', email: 'ann@example.com', name: 'Ann Lee', business: null, status: 'active', commission_percent: 3, user_id: 'u1',
  invited_at: '2026-11-26T00:00:00Z', invite_sent_at: null, invite_sends: 1, terms_version: TERMS_VERSION, terms_accepted_at: '2026-11-26T01:00:00Z',
  wise_recipient_id: null, payout_holder: null, payout_last4: null, payout_legal_type: null, payout_added_at: null, payout_hold_until: null,
  created_at: '2026-11-26T00:00:00Z', updated_at: '2026-11-26T00:00:00Z', ...o,
})

function quote(payOut: string, fee = 0): WiseQuote {
  return { id: 'q1', status: 'PENDING', payOut, sourceCurrency: 'USD', targetCurrency: 'USD', targetAmount: 10, option: { payIn: 'BALANCE', payOut, disabled: false, disabledReason: null, feeTotal: fee, sourceAmount: 10 + fee, targetAmount: 10, estimatedDelivery: null }, expirationTime: null }
}

let calls: string[]
let wise: { createRecipient: ReturnType<typeof vi.fn>; deactivateRecipient: ReturnType<typeof vi.fn>; createQuote: ReturnType<typeof vi.fn> } & Record<string, unknown>
let db: { current: number | null; rpcFails: boolean; savedAnyway: boolean; openPayoutTo: number | null }
let notices: unknown[]
let opsMsgs: string[]

function svc() {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${fn}`)
      if (fn !== 'save_referrer_payout_account') throw new Error('unexpected rpc ' + fn)
      if (db.rpcFails) {
        if (db.savedAnyway) db.current = Number(args.p_recipient)
        return { data: null, error: { message: 'connection reset' } }
      }
      if ((db.current ?? null) !== (args.p_expected ?? null)) return { data: { result: 'changed', current: db.current }, error: null }
      const previous = db.current
      db.current = Number(args.p_recipient)
      return { data: { result: 'saved', previous }, error: null }
    },
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      const chain = () => q
      Object.assign(q, {
        select: chain, eq: chain, in: chain, limit: chain,
        maybeSingle: async () => ({ data: table === 'referrers' ? { wise_recipient_id: db.current } : null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: table === 'referral_payouts' && db.openPayoutTo ? [{ id: 'p1' }] : [], error: null }),
      })
      return q
    },
  }
}

function deps(o: Partial<PayoutAccountDeps> = {}): PayoutAccountDeps {
  return {
    svc: svc() as never,
    wise: wise as never,
    config: { profileId: 9001, balanceId: 70001 },
    nowMs: NOW,
    notify: async (_r, n) => { notices.push(n); return true },
    ops: async (subject) => { opsMsgs.push(subject); return true },
    ...o,
  }
}

// 'Aba': how Wise's 2026Q4 API spells the type (read from MAPL's own recipients, Nov 26 2026).
const recipient = (o: Partial<WiseRecipient> = {}): WiseRecipient => ({ id: 2001, currency: 'USD', type: 'Aba', active: true, name: 'Ann Lee', ...o })

beforeEach(() => {
  calls = []
  notices = []
  opsMsgs = []
  db = { current: null, rpcFails: false, savedAnyway: false, openPayoutTo: null }
  wise = {
    createRecipient: vi.fn(async (body: Record<string, unknown>) => { calls.push('wise:create'); expect(body).toMatchObject({ currency: 'USD', type: 'aba', profile: 9001 }); return recipient() }),
    deactivateRecipient: vi.fn(async (id: number) => { calls.push(`wise:off:${id}`) }),
    createQuote: vi.fn(async () => { calls.push('wise:quote'); return quote('BALANCE') }),
  }
})

describe('a first payout account', () => {
  test('saved, held for 72 hours, the referrer told; only the last four kept', async () => {
    const r = await savePayoutAccount(deps(), referrer(), user, form)
    expect(r).toEqual({ ok: true, last4: '4567', holdUntil: new Date(NOW + 72 * 3_600_000).toISOString(), kind: 'added', noticeSent: true })
    expect(calls).toEqual(['wise:create', 'wise:quote', 'rpc:save_referrer_payout_account'])
    expect(notices).toEqual([expect.objectContaining({ kind: 'added', last4: '4567', holder: 'Ann Lee', previousLast4: null })])
    expect(JSON.stringify(notices)).not.toContain(ACCOUNT)
  })

  test('the type is read without case (v1 says aba, 2026Q4 says Aba)', async () => {
    wise.createRecipient.mockImplementationOnce(async () => { calls.push('wise:create'); return recipient({ type: 'aba' }) })
    expect((await savePayoutAccount(deps(), referrer(), user, form)).ok).toBe(true)
  })

  test('the quote that proves it is a Wise account is for nothing and moves no money', async () => {
    await savePayoutAccount(deps(), referrer(), user, form)
    expect(wise.createQuote).toHaveBeenCalledWith({ profileId: 9001, currency: 'USD', targetAmount: 10, targetAccount: 2001, balanceId: 70001 })
  })
})

describe('refused before anything is saved', () => {
  test('a sign-in older than an hour asks to sign in again, and Wise is never asked', async () => {
    const r = await savePayoutAccount(deps(), referrer(), { ...user, lastSignInAt: new Date(NOW - 61 * 60_000).toISOString() }, form)
    expect(r).toMatchObject({ ok: false, status: 401, reauth: true })
    expect(calls).toEqual([])
    expect(recentSignIn(null, NOW)).toBe(false)
    expect(recentSignIn(new Date(NOW + 5 * 60_000).toISOString(), NOW)).toBe(false)
  })

  test('a page showing an older account cannot overwrite the current one', async () => {
    const r = await savePayoutAccount(deps(), referrer({ wise_recipient_id: 1999, payout_last4: '1111', payout_holder: 'Ann Lee', payout_legal_type: 'PRIVATE', payout_added_at: '2026-11-20T00:00:00Z' }), user, { ...form, currentLast4: null })
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(calls).toEqual([])
  })

  test('form mistakes come back by field, before Wise is asked', async () => {
    const r = await savePayoutAccount(deps(), referrer(), user, { ...form, accountNumberConfirm: '8310001234568', routingNumber: '026073151' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors ?? {}).sort()).toEqual(['accountNumberConfirm', 'routingNumber'])
    expect(calls).toEqual([])
  })

  test('a removed referrer is refused', async () => {
    expect((await savePayoutAccount(deps(), referrer({ status: 'removed' }), user, form)).ok).toBe(false)
  })

  test('with Wise not configured, nothing is saved and the office is told', async () => {
    const r = await savePayoutAccount(deps({ wise: null, config: null }), referrer(), user, form)
    expect(r).toMatchObject({ ok: false, status: 503 })
    expect(opsMsgs).toHaveLength(1)
  })
})

describe('what Wise says', () => {
  test("Wise's refusal points at our fields; its words, which can echo the number, are never logged", async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    wise.createRecipient.mockRejectedValueOnce(new WiseApiError(`POST /v1/accounts: 422 NOT_VALID (Account number ${ACCOUNT} is not valid)`, 422, 'NOT_VALID', false, ['accountNumber', 'address.city']))
    const r = await savePayoutAccount(deps(), referrer(), user, form)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors ?? {}).sort()).toEqual(['accountNumber', 'city'])
    expect(JSON.stringify(r)).not.toContain(ACCOUNT)
    expect(JSON.stringify(log.mock.calls)).not.toContain(ACCOUNT)
    log.mockRestore()
  })

  test('no answer from Wise: nothing saved, try again', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    wise.createRecipient.mockRejectedValueOnce(new WiseApiError('POST /v1/accounts: timed out', 0, null, true))
    expect(await savePayoutAccount(deps(), referrer(), user, form)).toMatchObject({ ok: false, status: 503 })
    expect(calls).not.toContain('rpc:save_referrer_payout_account')
    log.mockRestore()
  })

  test('an account that is not a Wise account (paid by bank transfer, or for a fee) is refused and switched off', async () => {
    for (const q of [quote('BANK_TRANSFER', 0.3), quote('BALANCE', 0.5)]) {
      calls = []
      wise.createQuote.mockImplementationOnce(async () => { calls.push('wise:quote'); return q })
      const r = await savePayoutAccount(deps(), referrer(), user, form)
      expect(r).toMatchObject({ ok: false, status: 400 })
      if (!r.ok) expect(r.errors?.accountNumber).toMatch(/not a Wise account/)
      expect(calls).toEqual(['wise:create', 'wise:quote', 'wise:off:2001'])
    }
  })

  test('a recipient that is not US dollars, or not active, is refused and switched off', async () => {
    wise.createRecipient.mockResolvedValueOnce(recipient({ currency: 'EUR' }))
    expect((await savePayoutAccount(deps(), referrer(), user, form)).ok).toBe(false)
    expect(calls).toContain('wise:off:2001')
    expect(calls).not.toContain('rpc:save_referrer_payout_account')
  })

  test('the check itself failing: nothing saved, the new recipient switched off', async () => {
    wise.createQuote.mockImplementationOnce(async () => { calls.push('wise:quote'); throw new WiseApiError('quote: 500', 500, null, true) })
    expect(await savePayoutAccount(deps(), referrer(), user, form)).toMatchObject({ ok: false, status: 503 })
    expect(calls).toEqual(['wise:create', 'wise:quote', 'wise:off:2001'])
  })
})

describe('the save', () => {
  const current = { wise_recipient_id: 1999, payout_last4: '1111', payout_holder: 'Ann Lee', payout_legal_type: 'PRIVATE', payout_added_at: '2026-11-20T00:00:00Z' }

  test('a change: saved over the current account, the old recipient switched off, the referrer told it changed', async () => {
    db.current = 1999
    const r = await savePayoutAccount(deps(), referrer(current), user, { ...form, currentLast4: '1111' })
    expect(r).toMatchObject({ ok: true, kind: 'changed', last4: '4567' })
    expect(calls).toEqual(['wise:create', 'wise:quote', 'rpc:save_referrer_payout_account', 'wise:off:1999'])
    expect(notices).toEqual([expect.objectContaining({ kind: 'changed', previousLast4: '1111' })])
  })

  test('the old recipient stays on while a payout to it is in flight', async () => {
    db.current = 1999
    db.openPayoutTo = 1999
    await savePayoutAccount(deps(), referrer(current), user, { ...form, currentLast4: '1111' })
    expect(calls).not.toContain('wise:off:1999')
  })

  test('changed somewhere else in between: refused, and the new recipient switched off', async () => {
    db.current = 1500 // another tab saved an account after this page was read
    const r = await savePayoutAccount(deps(), referrer(current), user, { ...form, currentLast4: '1111' })
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(calls).toEqual(['wise:create', 'wise:quote', 'rpc:save_referrer_payout_account', 'wise:off:2001'])
  })

  test('the save answer lost but the save landed: read back and reported as saved, nothing switched off', async () => {
    db.rpcFails = true
    db.savedAnyway = true
    const r = await savePayoutAccount(deps(), referrer(), user, form)
    expect(r).toMatchObject({ ok: true, kind: 'added' })
    expect(calls.filter((c) => c.startsWith('wise:off'))).toEqual([])
  })

  test('the save failed: read back, nothing landed, the new recipient switched off', async () => {
    db.rpcFails = true
    const r = await savePayoutAccount(deps(), referrer(), user, form)
    expect(r).toMatchObject({ ok: false, status: 500 })
    expect(calls).toContain('wise:off:2001')
  })

  test('the notice failing tells the office instead', async () => {
    const r = await savePayoutAccount(deps({ notify: async () => false }), referrer(), user, form)
    expect(r).toMatchObject({ ok: true, noticeSent: false })
    expect(opsMsgs).toEqual(['Referral payout account: the notice did not send'])
  })
})
