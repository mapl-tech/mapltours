import { describe, test, expect, vi, afterEach } from 'vitest'

/**
 * The real Stripe call behind book_and_pay_transfer. The first live test
 * (Oct 9 2026) was refused with "The return_url is provided by the agent when
 * a Payment Intent is backed by an SPT": the confirm must carry the token and
 * nothing that belongs to the agent.
 */
const { confirm } = vi.hoisted(() => ({ confirm: vi.fn() }))
vi.mock('stripe', () => {
  class StripeCardError extends Error {}
  class StripeInvalidRequestError extends Error {}
  function Stripe() {
    return { paymentIntents: { confirm, retrieve: vi.fn() } }
  }
  Stripe.errors = { StripeCardError, StripeInvalidRequestError }
  return { default: Stripe }
})

import { agentPayDeps } from '../../lib/agent/pay-deps'

afterEach(() => {
  vi.unstubAllEnvs()
  confirm.mockReset()
})

describe('confirming with a shared payment token', () => {
  test('sends the token and the idempotency key, and no return_url', async () => {
    vi.stubEnv('AGENT_PAYMENTS_ENABLED', '1')
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x')
    confirm.mockResolvedValue({ id: 'pi_1', amount: 2200, currency: 'usd', status: 'succeeded' })

    const out = await agentPayDeps('https://mapltours.com')!.confirmPaymentIntent('pi_1', 'spt_1', 'agentpay2:pi_1:spt_1')

    expect(out).toEqual({ intent: expect.objectContaining({ id: 'pi_1', status: 'succeeded' }) })
    expect(confirm).toHaveBeenCalledTimes(1)
    const [id, params, opts] = confirm.mock.calls[0]
    expect(id).toBe('pi_1')
    expect(params).toEqual({ payment_method_data: { shared_payment_granted_token: 'spt_1' } })
    expect(params).not.toHaveProperty('return_url')
    expect(opts).toMatchObject({ idempotencyKey: 'agentpay2:pi_1:spt_1', maxNetworkRetries: 0 })
  })

  test('is not offered at all while payments are switched off', () => {
    vi.stubEnv('AGENT_PAYMENTS_ENABLED', '')
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x')
    expect(agentPayDeps('https://mapltours.com')).toBeNull()
  })
})
