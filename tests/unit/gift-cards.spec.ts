import { describe, test, expect, vi } from 'vitest'
import {
  classifyGiftBackendError,
  giftBackendMessage,
  generateGiftCode, normalizeGiftCode, validateGiftAmount, applyGiftCard,
  giftExpiryFrom, GIFT_MIN, GIFT_MAX,
} from '../../lib/gift-cards'

describe('code format', () => {
  test('matches MAPL-XXXX-XXXX', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateGiftCode()).toMatch(/^MAPL-[ACDEFHJKLMNPQRTUVWXY2346789]{4}-[ACDEFHJKLMNPQRTUVWXY2346789]{4}$/)
    }
  })

  test('no confusable pair survives intact', () => {
    // For each look-alike pair, at most one member may appear. A code that
    // contains both G and 6 cannot be dictated reliably.
    const codes = Array.from({ length: 600 }, () => generateGiftCode())
    const body = codes.map((c) => c.slice(5).replace('-', '')).join('')
    for (const [a, b] of [['O', '0'], ['I', '1'], ['S', '5'], ['B', '8'], ['G', '6'], ['Z', '2']]) {
      expect(body.includes(a) && body.includes(b)).toBe(false)
    }
  })

  test('is deterministic for a given index source', () => {
    const src = () => [0, 1, 2, 3, 4, 5, 6, 7]
    expect(generateGiftCode(src)).toBe(generateGiftCode(src))
  })

  test('draws its default randomness from the CSPRNG, not Math.random', () => {
    // A gift code is a bearer instrument. If this ever regresses to
    // Math.random(), an attacker who buys one card can derive its neighbours
    // from V8's recoverable PRNG state.
    const mathSpy = vi.spyOn(Math, 'random')
    const cryptoSpy = vi.spyOn(globalThis.crypto, 'getRandomValues')
    generateGiftCode()
    expect(cryptoSpy).toHaveBeenCalled()
    expect(mathSpy).not.toHaveBeenCalled()
    mathSpy.mockRestore()
    cryptoSpy.mockRestore()
  })

  test('stays inside the confusable-free alphabet under crypto randomness', () => {
    for (let n = 0; n < 200; n++) {
      const body = generateGiftCode().replace(/[^A-Z0-9]/g, '').slice(4)
      expect(body).toMatch(/^[ACDEFHJKLMNPQRTUVWXY2346789]{8}$/)
    }
  })

  test('has enough entropy to make guessing impractical', () => {
    const codes = new Set(Array.from({ length: 3000 }, () => generateGiftCode()))
    expect(codes.size).toBeGreaterThan(2980) // ~28^8 space, collisions vanishing
  })
})

describe('normalising a code the customer typed', () => {
  test('accepts the canonical form', () => {
    expect(normalizeGiftCode('MAPL-ACDE-2346')).toBe('MAPL-ACDE-2346')
  })

  test('forgives lowercase, missing dashes and stray spaces', () => {
    for (const v of ['mapl-acde-2346', 'MAPLACDE2346', ' MAPL ACDE 2346 ', 'mapl_acde_2346']) {
      expect(normalizeGiftCode(v)).toBe('MAPL-ACDE-2346')
    }
  })

  test('rejects wrong length, wrong prefix, and characters outside the alphabet', () => {
    for (const bad of ['MAPL-ACDE-234', 'XXXX-ACDE-2346', 'MAPL-ACDE-2340', 'MAPL-ACDE-23I6', '', 'MAPL']) {
      expect(normalizeGiftCode(bad)).toBeNull()
    }
  })
})

describe('purchase amount', () => {
  test('accepts whole dollars inside the range', () => {
    for (const v of [GIFT_MIN, 50, 100, 250, GIFT_MAX]) {
      expect(validateGiftAmount(v)).toEqual({ ok: true, amount: v })
    }
  })

  test('rejects out of range', () => {
    expect(validateGiftAmount(GIFT_MIN - 1)).toEqual({ ok: false, error: 'below_min' })
    expect(validateGiftAmount(GIFT_MAX + 1)).toEqual({ ok: false, error: 'above_max' })
  })

  test('rejects fractional and non-numeric', () => {
    expect(validateGiftAmount(50.5)).toEqual({ ok: false, error: 'not_whole' })
    expect(validateGiftAmount('abc')).toEqual({ ok: false, error: 'not_a_number' })
    expect(validateGiftAmount(NaN)).toEqual({ ok: false, error: 'not_a_number' })
  })

  test('rejects negatives and zero, which would be free money', () => {
    for (const v of [0, -1, -100]) {
      const r = validateGiftAmount(v)
      expect(r.ok).toBe(false)
    }
  })
})

describe('applying a card to a cart', () => {
  const active = (balance: number, expires?: string) =>
    ({ status: 'active', balance, expires_at: expires ?? null })

  test('partial cover leaves the rest due on the card', () => {
    const r = applyGiftCard(active(50), 20000) // $50 card, $200 cart
    if (!r.applicable) throw new Error('expected applicable')
    expect(r.appliesCents).toBe(5000)
    expect(r.remainingDueCents).toBe(15000)
    expect(r.cardBalanceAfterCents).toBe(0)
    expect(r.coversFullAmount).toBe(false)
  })

  test('a card bigger than the cart is only partly spent', () => {
    const r = applyGiftCard(active(500), 12000) // $500 card, $120 cart
    if (!r.applicable) throw new Error('expected applicable')
    expect(r.appliesCents).toBe(12000)
    expect(r.remainingDueCents).toBe(0)
    expect(r.cardBalanceAfterCents).toBe(38000)
    expect(r.coversFullAmount).toBe(true)
  })

  test('never applies more than the balance, at any cart size', () => {
    for (const cart of [1, 999, 5000, 100000]) {
      const r = applyGiftCard(active(50), cart)
      if (!r.applicable) throw new Error('expected applicable')
      expect(r.appliesCents).toBeLessThanOrEqual(5000)
      expect(r.appliesCents).toBeLessThanOrEqual(cart)
      expect(r.remainingDueCents).toBeGreaterThanOrEqual(0)
      expect(r.cardBalanceAfterCents).toBeGreaterThanOrEqual(0)
    }
  })

  test('applied + remaining always equals the cart total', () => {
    for (const [bal, cart] of [[50, 20000], [500, 12000], [33, 3300], [1, 99]] as const) {
      const r = applyGiftCard(active(bal), cart)
      if (!r.applicable) throw new Error('expected applicable')
      expect(r.appliesCents + r.remainingDueCents).toBe(cart)
    }
  })

  test('handles the numeric-as-string shape Supabase returns', () => {
    const r = applyGiftCard({ status: 'active', balance: '75.00' }, 10000)
    if (!r.applicable) throw new Error('expected applicable')
    expect(r.appliesCents).toBe(7500)
  })

  test('refuses cards that are not active', () => {
    for (const s of ['pending', 'void', 'depleted']) {
      const r = applyGiftCard({ status: s, balance: 100 }, 5000)
      expect(r.applicable).toBe(false)
      if (!r.applicable) expect(r.reason).toBe('not_active')
    }
  })

  test('refuses an unknown code and a zero balance', () => {
    expect(applyGiftCard(null, 5000)).toEqual({ applicable: false, reason: 'not_found' })
    const r = applyGiftCard(active(0), 5000)
    if (!r.applicable) expect(r.reason).toBe('no_balance')
  })

  test('refuses an expired card, and allows one expiring later', () => {
    const now = new Date('2026-08-16T12:00:00Z')
    const past = applyGiftCard(active(100, '2026-08-15T12:00:00Z'), 5000, now)
    expect(past.applicable).toBe(false)
    if (!past.applicable) expect(past.reason).toBe('expired')
    expect(applyGiftCard(active(100, '2027-08-15T12:00:00Z'), 5000, now).applicable).toBe(true)
  })
})

test('expiry is 24 months out', () => {
  expect(giftExpiryFrom(new Date('2026-08-16T00:00:00Z')).toISOString().slice(0, 7)).toBe('2028-08')
})

describe('backend fault classification', () => {
  test('a DNS/connection failure reads as unreachable, not as a retryable fault', () => {
    // This is exactly what an unconfigured NEXT_PUBLIC_SUPABASE_URL produces.
    for (const m of ['fetch failed', 'getaddrinfo ENOTFOUND placeholder.supabase.co', 'connect ECONNREFUSED 127.0.0.1:54321']) {
      expect(classifyGiftBackendError(new Error(m))).toBe('unreachable')
    }
  })

  test('a missing table reads as missing_table, so the fix is "run the migrations"', () => {
    for (const m of [
      'relation "public.gift_cards" does not exist',
      "Could not find the table 'public.gift_cards' in the schema cache",
    ]) {
      expect(classifyGiftBackendError({ message: m })).toBe('missing_table')
    }
  })

  test('anything else stays generic and retryable', () => {
    expect(classifyGiftBackendError(new Error('duplicate key value'))).toBe('other')
    expect(classifyGiftBackendError(null)).toBe('other')
  })

  test('never tells a customer to retry something that cannot succeed', () => {
    expect(giftBackendMessage('unreachable')).not.toMatch(/try again/i)
    expect(giftBackendMessage('missing_table')).not.toMatch(/try again/i)
    expect(giftBackendMessage('other')).toMatch(/try again/i)
  })
})
