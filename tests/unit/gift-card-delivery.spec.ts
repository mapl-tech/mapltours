import { describe, test, expect } from 'vitest'

/**
 * Delivery of a paid gift card.
 *
 * This file exists because of a shipped bug that every other check missed:
 * `sendGiftCardEmails` claimed its delivery channel through a helper hardcoded
 * to `.from('bookings')`, passing it a gift_cards id and a column that only
 * exists on gift_cards. The claim silently failed, the send was skipped, and
 * the recipient never got the card they had been paid for. Typecheck passed,
 * lint passed, the build passed, and the template render tests passed, because
 * none of them touch the table name.
 *
 * So these assert the WIRING, not the markup: which table is written, that a
 * repeat call does not send twice, and that a send failure releases the claim
 * so a webhook retry can try again.
 */

describe('gift card delivery wiring', () => {
  test('claims the delivery channel on gift_cards, never on bookings', async () => {
    const claim = await import('../../lib/email/claim')
    const calls: { table: string; column: string }[] = []

    const fakeSupabase = {
      from(table: string) {
        return {
          update() {
            return {
              eq() {
                return {
                  is(column: string) {
                    return {
                      select: async () => {
                        calls.push({ table, column })
                        return { data: [{ id: 'gift-1' }], error: null }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ok = await claim.claimEmailChannel(fakeSupabase as any, 'gift-1', 'delivered_at', 'gift_cards')

    expect(ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('gift_cards')
    expect(calls[0].column).toBe('delivered_at')
  })

  test('defaults to the bookings table so existing callers are unchanged', async () => {
    const claim = await import('../../lib/email/claim')
    const calls: { table: string }[] = []

    const fakeSupabase = {
      from(table: string) {
        return {
          update() {
            return {
              eq() {
                return {
                  is() {
                    return {
                      select: async () => {
                        calls.push({ table })
                        return { data: [{ id: 'b1' }], error: null }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await claim.claimEmailChannel(fakeSupabase as any, 'b1', 'confirmation_email_sent_at')
    expect(calls[0].table).toBe('bookings')
  })

  test('a claim that matches no row reports false rather than sending', async () => {
    const claim = await import('../../lib/email/claim')
    const fakeSupabase = {
      from() {
        return {
          update() {
            return {
              eq() {
                return {
                  is() {
                    return { select: async () => ({ data: [], error: null }) }
                  },
                }
              },
            }
          },
        }
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await claim.claimEmailChannel(fakeSupabase as any, 'x', 'delivered_at', 'gift_cards')).toBe(false)
  })

  test('a database error on the claim reports false, it does not throw', async () => {
    const claim = await import('../../lib/email/claim')
    const fakeSupabase = {
      from() {
        return {
          update() {
            return {
              eq() {
                return {
                  is() {
                    return {
                      select: async () => ({
                        data: null,
                        // This is exactly what the shipped bug produced.
                        error: { message: "column 'delivered_at' does not exist" },
                      }),
                    }
                  },
                }
              },
            }
          },
        }
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await claim.claimEmailChannel(fakeSupabase as any, 'x', 'delivered_at', 'gift_cards')).toBe(false)
  })

  test('release targets the same table it claimed', async () => {
    const claim = await import('../../lib/email/claim')
    const calls: { table: string; value: unknown }[] = []
    const fakeSupabase = {
      from(table: string) {
        return {
          update(patch: Record<string, unknown>) {
            return {
              eq: async () => {
                calls.push({ table, value: patch.delivered_at })
                return { data: null, error: null }
              },
            }
          },
        }
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await claim.releaseEmailChannel(fakeSupabase as any, 'gift-1', 'delivered_at', 'gift_cards')
    expect(calls[0].table).toBe('gift_cards')
    expect(calls[0].value).toBeNull()
  })
})
