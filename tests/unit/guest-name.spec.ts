import { describe, it, expect } from 'vitest'
import { guestNames } from '@/lib/guest-name'

/**
 * The guest's name in clip emails comes from user_metadata, which the guest
 * writes, on an account whose address nobody confirmed. The first name said
 * back to them must be a name; the full name (to us only) must be one line
 * of text.
 */
describe('guestNames', () => {
  it('reads full_name, then name, and only text', () => {
    expect(guestNames({ full_name: 'Ada Lovelace' })).toEqual({ fullName: 'Ada Lovelace', firstName: 'Ada' })
    expect(guestNames({ name: 'Grace Hopper' })).toEqual({ fullName: 'Grace Hopper', firstName: 'Grace' })
    expect(guestNames({ full_name: { nested: true }, name: 42 })).toEqual({ fullName: null, firstName: null })
    expect(guestNames(null)).toEqual({ fullName: null, firstName: null })
    expect(guestNames('Ada')).toEqual({ fullName: null, firstName: null })
  })

  it('keeps the full name to one line of at most 80 characters', () => {
    expect(guestNames({ full_name: '  Ada\n\tLovelace\u0000 ' }).fullName).toBe('Ada Lovelace')
    expect(guestNames({ full_name: 'R'.repeat(500) }).fullName).toBe('R'.repeat(80))
  })

  it('says back only a first name that is a name', () => {
    for (const ok of ['Zoë', 'José', 'Siân', "O'Brien", 'D’Angelo', 'Jean-Luc', 'Ŀuis']) {
      expect(guestNames({ full_name: `${ok} Smith` }).firstName).toBe(ok)
    }
    for (const bad of ['evil.com', 'http://x.y', 'a@b.co', 'R2D2', '5%', '-Ada', "'Ada", 'A'.repeat(41)]) {
      expect(guestNames({ full_name: `${bad} Smith` }).firstName).toBeNull()
    }
  })
})
