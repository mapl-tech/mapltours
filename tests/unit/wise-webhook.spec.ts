import { describe, test, expect } from 'vitest'
import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import { applyTransferState, parseTransferStateEvent, verifyWiseSignature, WISE_WEBHOOK_KEYS } from '@/lib/payouts/webhook'
import { memStore, ride, type MemStore } from './payouts-fakes'

/**
 * The Wise webhook: only a body Wise signed is read, and each transfer state
 * moves only this job's payouts, in order, without ever paying twice.
 */

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const signed = (body: string) => sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64')

describe('signature', () => {
  test('a body signed with the key passes; tampered, unsigned or other-key bodies do not', () => {
    const body = JSON.stringify({ event_type: 'transfers#state-change', data: { resource: { id: 1 } } })
    const sig = signed(body)
    expect(verifyWiseSignature(body, sig, PEM)).toBe(true)
    expect(verifyWiseSignature(body.replace('1', '2'), sig, PEM)).toBe(false)
    expect(verifyWiseSignature(body, null, PEM)).toBe(false)
    expect(verifyWiseSignature(body, 'not base64 !!', PEM)).toBe(false)
    expect(verifyWiseSignature(body, sig, WISE_WEBHOOK_KEYS.production)).toBe(false)
  })

  test("Wise's published keys are real RSA public keys", () => {
    for (const k of Object.values(WISE_WEBHOOK_KEYS)) expect(createPublicKey(k).asymmetricKeyType).toBe('rsa')
  })
})

describe('parsing', () => {
  test('a state change, or nothing', () => {
    expect(parseTransferStateEvent({ event_type: 'transfers#state-change', data: { resource: { id: 50000001, profile_id: 154050700 }, current_state: 'outgoing_payment_sent', occurred_at: '2026-11-02T10:00:00.123Z' } }))
      .toEqual({ transferId: 50000001, profileId: 154050700, state: 'outgoing_payment_sent', occurredAt: '2026-11-02T10:00:00.123Z' })
    expect(parseTransferStateEvent({ event_type: 'balances#credit' })).toBeNull()
    expect(parseTransferStateEvent({ event_type: 'transfers#state-change', data: { resource: { id: 'x' }, current_state: 'processing' } })).toBeNull()
  })
})

/** A store holding one payout for one round trip, at the given status, with its transfer. */
function withPayout(status: 'claimed' | 'created' | 'funded' | 'sent' | 'failed' | 'needs_review', stamped = status === 'funded' || status === 'sent') {
  const b = ride()
  const s = memStore([b])
  s.payouts.set('p1', {
    id: 'p1', payee: 'Collin', recipient_id: 900001, amount_usd: 147, status, customer_transaction_id: 'c',
    wise_quote_id: 'q', wise_transfer_id: 50000001, wise_state: null, wise_state_at: null, pay_day: '2026-11-01', error: null,
    created_at: '2026-11-01T14:30:00Z', funded_at: stamped ? '2026-11-01T14:30:05Z' : null, sent_at: null, resolved_at: null,
  })
  s.ledger.push({ payout_id: 'p1', booking_id: b.id, part: 'first', amount_usd: 73.5, active: status !== 'failed' })
  s.ledger.push({ payout_id: 'p1', booking_id: b.id, part: 'second', amount_usd: 73.5, active: status !== 'failed' })
  if (stamped) s.dispatch.set(b.id, { paid_first: '2026-11-01T14:30:05Z', paid_first_via: 'wise:50000001', paid_second: '2026-11-01T14:30:05Z', paid_second_via: 'wise:50000001' })
  return { s, b }
}
const ev = (state: string, at = '2026-11-02T10:00:00.000Z') => ({ transferId: 50000001, profileId: 154050700, state, occurredAt: at })
const NOW = '2026-11-02T10:00:01.000Z'
const p1 = (s: MemStore) => s.payouts.get('p1')!

describe('state changes', () => {
  test('outgoing_payment_sent: a funded payout becomes sent', async () => {
    const { s } = withPayout('funded')
    const r = await applyTransferState(s, ev('outgoing_payment_sent'), NOW)
    expect(r.outcome).toBe('sent')
    expect(p1(s)).toMatchObject({ status: 'sent', sent_at: '2026-11-02T10:00:00.000Z', wise_state: 'outgoing_payment_sent' })
    expect(r.tell).toBeNull()
  })

  test('an unconfirmed payout that Wise says moved becomes funded, with its trips stamped, and the owner hears', async () => {
    const { s, b } = withPayout('needs_review')
    const r = await applyTransferState(s, ev('processing'), NOW)
    expect(r.outcome).toBe('funded')
    expect(p1(s).status).toBe('funded')
    expect(s.dispatch.get(b.id)).toMatchObject({ paid_first: expect.any(String), paid_second_via: 'wise:50000001' })
    expect(r.tell).toMatch(/had not been confirmed/)
  })

  test('the money came back: returned, items voided, only this payout\'s stamps taken back', async () => {
    const { s, b } = withPayout('sent')
    s.dispatch.get(b.id)!.paid_second_via = 'by hand' // somebody else's stamp on the second half
    const r = await applyTransferState(s, ev('funds_refunded'), NOW)
    expect(r.outcome).toBe('returned')
    expect(p1(s).status).toBe('returned')
    expect(s.ledger.every((i) => !i.active)).toBe(true)
    expect(s.dispatch.get(b.id)).toEqual({ paid_second: '2026-11-01T14:30:05Z', paid_second_via: 'by hand' })
    expect(r.tell).toMatch(/came back/)
  })

  test('cancelled before it was paid: failed and freed; recorded as paid: needs a person', async () => {
    const a = withPayout('created')
    expect((await applyTransferState(a.s, ev('cancelled'), NOW)).outcome).toBe('failed')
    expect(a.s.ledger.every((i) => !i.active)).toBe(true)
    const b = withPayout('funded')
    const r = await applyTransferState(b.s, ev('cancelled'), NOW)
    expect(r.outcome).toBe('review')
    expect(p1(b.s).status).toBe('needs_review')
    expect(b.s.ledger.every((i) => i.active)).toBe(true)
  })

  test('money moved on a payout recorded as failed: needs a person, loudly', async () => {
    const { s } = withPayout('failed')
    const r = await applyTransferState(s, ev('outgoing_payment_sent'), NOW)
    expect(r.outcome).toBe('review')
    expect(p1(s).status).toBe('needs_review')
    expect(r.tell).toMatch(/paid twice/)
  })

  test('an older event than the one recorded changes nothing', async () => {
    const { s } = withPayout('funded')
    await applyTransferState(s, ev('outgoing_payment_sent', '2026-11-02T10:00:00.000Z'), NOW)
    const r = await applyTransferState(s, ev('processing', '2026-11-02T09:00:00.000Z'), NOW)
    expect(r.outcome).toBe('stale')
    expect(p1(s).status).toBe('sent')
  })

  test('another transfer on the account is ignored', async () => {
    const { s } = withPayout('funded')
    const r = await applyTransferState(s, { ...ev('outgoing_payment_sent'), transferId: 1 }, NOW)
    expect(r.outcome).toBe('ignored')
    expect(s.writes).toEqual([])
  })

  test('bounced back: recorded, and the owner is told it may arrive late or come back', async () => {
    const { s } = withPayout('sent')
    const r = await applyTransferState(s, ev('bounced_back'), NOW)
    expect(r.outcome).toBe('recorded')
    expect(p1(s).status).toBe('sent')
    expect(r.tell).toMatch(/bounced back/)
  })
})
