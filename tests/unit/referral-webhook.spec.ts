import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { sign } from 'node:crypto'

/**
 * Wise's webhook for a referral payout (app/api/webhooks/wise): a transfer
 * that is not a driver payout is tried against the referral payouts, and the
 * same state machine (lib/payouts/webhook applyTransferState) moves it. Money
 * coming back voids its items, so those commissions are owed again, and the
 * office is told under "Referral payout". Before migration 045 the referral
 * lookup reads as "not ours", never a 500 that Wise would retry forever.
 */

const state = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { generateKeyPairSync } = require('node:crypto') as typeof import('node:crypto')
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return {
    pem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: keys.privateKey,
    payout: null as null | Record<string, unknown>,
    tableMissing: false,
    updates: [] as Array<Record<string, unknown>>,
    voided: [] as string[],
    ops: [] as string[],
  }
})

vi.mock('@/lib/payouts/store', async (orig) => ({
  ...(await orig<typeof import('@/lib/payouts/store')>()),
  supabasePayoutStore: () => ({ findByTransfer: async () => null, update: async () => {}, voidItems: async () => {}, items: async () => [], stamp: async () => true, unstamp: async () => {} }),
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const api: Record<string, unknown> = {}
      let patch: Record<string, unknown> | null = null
      Object.assign(api, {
        select: () => api, eq: () => api, in: () => api,
        update: (p: Record<string, unknown>) => { patch = p; return api },
        maybeSingle: async () => (state.tableMissing
          ? { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.referral_payouts'" } }
          : { data: state.payout, error: null }),
        then: (resolve: (v: unknown) => unknown) => {
          if (patch && table === 'referral_payouts') { state.updates.push(patch); Object.assign(state.payout ?? {}, patch) }
          if (patch && table === 'referral_payout_items') state.voided.push('items')
          if (!patch && table === 'referral_payout_items') return resolve({ data: [{ booking_id: 'b1', amount_usd: 5.53 }], error: null })
          return resolve({ data: null, error: null })
        },
      })
      return api
    },
  }),
}))
vi.mock('@/lib/payouts/notify', async (orig) => ({ ...(await orig<typeof import('@/lib/payouts/notify')>()), sendOpsMessage: async (m: { subject: string }) => { state.ops.push(m.subject); return true } }))
vi.mock('@/lib/payouts/webhook', async (orig) => {
  const real = await orig<typeof import('@/lib/payouts/webhook')>()
  return { ...real, WISE_WEBHOOK_KEYS: { production: state.pem, sandbox: state.pem } }
})

import { POST as WEBHOOK } from '@/app/api/webhooks/wise/route'

const body = (s: string, transferId = 777) =>
  JSON.stringify({ event_type: 'transfers#state-change', schema_version: '4.0.0', data: { resource: { type: 'transfer', id: transferId, profile_id: 9001 }, current_state: s, occurred_at: '2026-12-07T15:00:00.000Z' } })
const hook = (raw: string) => new NextRequest('https://mapltours.com/api/webhooks/wise', {
  method: 'POST', body: raw, headers: { 'x-signature-sha256': sign('RSA-SHA256', Buffer.from(raw), state.privateKey).toString('base64') },
})

beforeEach(() => {
  process.env.WISE_PROFILE_ID = '9001'
  state.payout = {
    id: 'p1', referrer_id: 'r1', payee: 'Ann Lee', recipient_id: 2001, account_last4: '4567', amount_usd: 5.53, status: 'funded',
    customer_transaction_id: 'ctid', wise_quote_id: 'q1', wise_transfer_id: 777, wise_state: 'processing', wise_state_at: '2026-12-07T14:45:00.000Z',
    pay_day: '2026-12-07', error: null, created_at: '2026-12-07T14:45:00Z', funded_at: '2026-12-07T14:45:01Z', sent_at: null, resolved_at: null,
  }
  state.tableMissing = false
  state.updates = []
  state.voided = []
  state.ops = []
})

describe('a referral payout through the Wise webhook', () => {
  test('paid out: recorded as sent', async () => {
    const r = await (await WEBHOOK(hook(body('outgoing_payment_sent')))).json()
    expect(r.outcome).toBe('sent')
    expect(state.updates.some((u) => u.status === 'sent')).toBe(true)
  })

  test('money came back: returned, items voided, the office told under Referral payout', async () => {
    const r = await (await WEBHOOK(hook(body('funds_refunded')))).json()
    expect(r.outcome).toBe('returned')
    expect(state.voided).toEqual(['items'])
    expect(state.ops).toEqual(['Referral payout: Wise has news'])
  })

  test('a transfer that is neither ours nor a referral payout: ignored', async () => {
    state.payout = null
    expect((await (await WEBHOOK(hook(body('outgoing_payment_sent', 999)))).json()).outcome).toBe('ignored')
  })

  test('before migration 045: ignored, never a 500 Wise would retry forever', async () => {
    state.tableMissing = true
    const res = await WEBHOOK(hook(body('outgoing_payment_sent', 999)))
    expect(res.status).toBe(200)
    expect((await res.json()).outcome).toBe('ignored')
  })
})
