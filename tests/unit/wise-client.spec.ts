import { describe, test, expect, vi } from 'vitest'
import { wiseClient, parseQuote, parseRequirements, WiseApiError, WISE_API_VERSION } from '@/lib/wise/client'

/**
 * The Wise client: the 2026Q4 paths, the bodies the payout run depends on
 * (the idempotency key, paying from the balance, SWIFT_OUR), and an honest
 * account of every failure: refused (nothing happened) or unknown.
 */

const TOKEN = 'test-token-never-printed'

function recorder(answer: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; method: string; body: unknown; auth: string | null }[] = []
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, method: String(init?.method), body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: new Headers(init?.headers).get('authorization') })
    return answer(u, init ?? {})
  })
  return { calls, fetch: f as unknown as typeof fetch }
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('paths and bodies', () => {
  test('every call goes to the 2026Q4 path on the right host, with the bearer token', async () => {
    const r = recorder((url) => {
      if (url.includes('/quotes')) return json(200, { id: 'q1', status: 'PENDING', payOut: 'SWIFT_OUR', preferredPayIn: 'BALANCE', targetAmount: 441, sourceCurrency: 'USD', targetCurrency: 'USD', paymentOptions: [{ payIn: 'BALANCE', payOut: 'SWIFT_OUR', disabled: false, fee: { total: 22.84 }, sourceAmount: 463.84, targetAmount: 441 }] })
      if (url.includes('/payments')) return json(201, { status: 'COMPLETED', type: 'BALANCE' })
      if (url.includes('/transfer-requirements')) return json(200, [{ type: 'transfer', fields: [{ name: 'Reference', group: [{ key: 'reference', required: false, maxLength: 35 }] }] }])
      if (url.includes('/accounts/')) return json(200, { id: 900001, currency: 'USD', type: 'swift_code', active: true, name: { fullName: 'Collin Example' } })
      return json(200, { id: 50000001, status: 'incoming_payment_waiting', targetAccount: 900001, quoteUuid: 'q1', targetValue: 441, details: { reference: 'MAPL Tours Jamaica Oct 2026' } })
    })
    const w = wiseClient({ token: TOKEN, env: 'production', fetch: r.fetch })
    await w.getRecipient(900001)
    await w.createQuote({ profileId: 154050700, currency: 'USD', targetAmount: 441, targetAccount: 900001, payOut: 'SWIFT_OUR', balanceId: null })
    await w.transferRequirements({ targetAccount: 900001, quoteUuid: 'q1', customerTransactionId: 'ctid-1', reference: 'MAPL Tours Jamaica Oct 2026' })
    await w.createTransfer({ targetAccount: 900001, quoteUuid: 'q1', customerTransactionId: 'ctid-1', reference: 'MAPL Tours Jamaica Oct 2026' })
    await w.fundFromBalance(154050700, 50000001)
    await w.getTransfer(50000001)
    await w.cancelTransfer(50000001)

    expect(WISE_API_VERSION).toBe('2026Q4')
    expect(r.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://api.wise.com/2026Q4/accounts/900001',
      'POST https://api.wise.com/2026Q4/profiles/154050700/quotes',
      'POST https://api.wise.com/2026Q4/transfer-requirements',
      'POST https://api.wise.com/2026Q4/transfers',
      'POST https://api.wise.com/2026Q4/profiles/154050700/transfers/50000001/payments',
      'GET https://api.wise.com/2026Q4/transfers/50000001',
      'PUT https://api.wise.com/2026Q4/transfers/50000001/cancel',
    ])
    expect(r.calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true)
    expect(r.calls[1].body).toEqual({ sourceCurrency: 'USD', targetCurrency: 'USD', targetAmount: 441, targetAccount: 900001, preferredPayIn: 'BALANCE', payInMethod: 'BALANCE', payOut: 'SWIFT_OUR' })
    expect(r.calls[3].body).toEqual({ targetAccount: 900001, quoteUuid: 'q1', customerTransactionId: 'ctid-1', details: { reference: 'MAPL Tours Jamaica Oct 2026' } })
    expect(r.calls[4].body).toEqual({ type: 'BALANCE' })
  })

  test('the sandbox host, and a named balance', async () => {
    const r = recorder(() => json(201, { status: 'COMPLETED' }))
    const w = wiseClient({ token: TOKEN, env: 'sandbox', fetch: r.fetch })
    await w.fundFromBalance(1, 2, 77)
    expect(r.calls[0].url).toBe('https://api.wise-sandbox.com/2026Q4/profiles/1/transfers/2/payments')
    expect(r.calls[0].body).toEqual({ type: 'BALANCE', balanceId: 77 })
  })
})

describe('failures say what is known', () => {
  test('a 4xx is a refusal (nothing happened), with Wise\'s code', async () => {
    const w = wiseClient({ token: TOKEN, env: 'production', fetch: recorder(() => json(422, { errors: [{ code: 'error.route', message: 'route unsupported' }] })).fetch })
    const err = await w.createTransfer({ targetAccount: 1, quoteUuid: 'q', customerTransactionId: 'c', reference: 'r' }).catch((e) => e)
    expect(err).toBeInstanceOf(WiseApiError)
    expect(err).toMatchObject({ status: 422, code: 'error.route', ambiguous: false })
  })

  test('a 5xx, a 429 and no answer are unknown outcomes', async () => {
    for (const status of [500, 502, 503, 429]) {
      const w = wiseClient({ token: TOKEN, env: 'production', fetch: recorder(() => json(status, {})).fetch })
      expect(await w.getTransfer(5).catch((e) => e)).toMatchObject({ status, ambiguous: true })
    }
    const lost = wiseClient({ token: TOKEN, env: 'production', fetch: (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch })
    expect(await lost.fundFromBalance(1, 2).catch((e) => e)).toMatchObject({ status: 0, ambiguous: true })
  })

  test('the token is never in an error message', async () => {
    const w = wiseClient({ token: TOKEN, env: 'production', fetch: recorder(() => json(401, { error: 'unauthorized', message: 'bad token' })).fetch })
    const err = await w.getRecipient(1).catch((e) => e)
    expect(String(err.message)).not.toContain(TOKEN)
  })

  test('a REJECTED funding comes back as data, with its code', async () => {
    const w = wiseClient({ token: TOKEN, env: 'production', fetch: recorder(() => json(201, { status: 'REJECTED', errorCode: 'payment.exists' })).fetch })
    expect(await w.fundFromBalance(1, 2)).toEqual({ status: 'REJECTED', errorCode: 'payment.exists', errorMessage: null })
  })
})

describe('parsing', () => {
  test('the quote option is the one matching its own payIn and payOut, as the live API answered on Nov 15 2026', () => {
    const q = parseQuote({
      id: '859f285c-e5a3-4deb-b9f3-192043c6b747', status: 'PENDING', payOut: 'SWIFT_OUR', preferredPayIn: 'BALANCE', targetAmount: 441,
      sourceCurrency: 'USD', targetCurrency: 'USD', expirationTime: '2026-11-15T06:01:52Z',
      paymentOptions: [
        { payIn: 'BANK_TRANSFER', payOut: 'SWIFT_OUR', disabled: false, fee: { total: 30 }, sourceAmount: 471, targetAmount: 441 },
        { payIn: 'BALANCE', payOut: 'SWIFT_OUR', disabled: true, disabledReason: { code: 'error.payInmethod.disabled', message: 'Sorry, you do not have USD in your account.' }, fee: { transferwise: 22.84, total: 22.84 }, sourceAmount: 463.84, targetAmount: 441 },
      ],
    })
    expect(q.option).toEqual({ payIn: 'BALANCE', payOut: 'SWIFT_OUR', disabled: true, disabledReason: 'error.payInmethod.disabled', feeTotal: 22.84, sourceAmount: 463.84, targetAmount: 441 })
  })

  test('requirements flatten to fields', () => {
    expect(parseRequirements([{ type: 'transfer', fields: [{ name: 'Reference', group: [{ key: 'reference', required: true, maxLength: 18, minLength: 1, validationRegexp: '^.{1,18}$' }] }, { name: 'Purpose', group: [{ key: 'transferPurpose', required: true, valuesAllowed: [{ key: 'SERVICES', name: 'Services' }] }] }] }])).toEqual([
      { key: 'reference', required: true, minLength: 1, maxLength: 18, validationRegexp: '^.{1,18}$', valuesAllowed: null },
      { key: 'transferPurpose', required: true, minLength: null, maxLength: null, validationRegexp: null, valuesAllowed: ['SERVICES'] },
    ])
  })
})
