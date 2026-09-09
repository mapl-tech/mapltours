import { describe, test, expect } from 'vitest'
import { escapeLikePattern } from '../../lib/pg-like'

describe('escaping PostgREST like patterns', () => {
  test('neutralises the underscore, which is ordinary in an email address', () => {
    // The live defect: john_smith@gmail.com also matched johnXsmith@gmail.com,
    // so one guest saw another guest's bookings on their profile.
    expect(escapeLikePattern('john_smith@gmail.com')).toBe('john\\_smith@gmail.com')
  })

  test('neutralises the percent, which matches any run of characters', () => {
    expect(escapeLikePattern('a%@gmail.com')).toBe('a\\%@gmail.com')
  })

  test('escapes the backslash itself, so the escape cannot be escaped away', () => {
    expect(escapeLikePattern('a\\_b')).toBe('a\\\\\\_b')
  })

  test('leaves an ordinary address untouched', () => {
    const plain = 'ann.lee@example.com'
    expect(escapeLikePattern(plain)).toBe(plain)
    expect(escapeLikePattern('ANN+tag@Example.co.uk')).toBe('ANN+tag@Example.co.uk')
  })

  test('handles every metacharacter at once and is stable when reapplied to a clean value', () => {
    expect(escapeLikePattern('%_\\')).toBe('\\%\\_\\\\')
    expect(escapeLikePattern('')).toBe('')
  })

  test('the escaped pattern matches only the literal address', () => {
    // Mirror of SQL LIKE semantics: build a regex the way Postgres would,
    // so the assertion is about behaviour, not about the string shape.
    const likeToRegExp = (pattern: string) => {
      let out = ''
      for (let i = 0; i < pattern.length; i += 1) {
        const c = pattern[i]
        if (c === '\\') { out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue }
        if (c === '%') { out += '.*'; continue }
        if (c === '_') { out += '.'; continue }
        out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      }
      return new RegExp(`^${out}$`, 'i')
    }
    const victim = 'johnXsmith@gmail.com'
    const attacker = 'john_smith@gmail.com'
    expect(likeToRegExp(attacker).test(victim)).toBe(true)                      // unescaped: leaks
    expect(likeToRegExp(escapeLikePattern(attacker)).test(victim)).toBe(false)  // escaped: does not
    expect(likeToRegExp(escapeLikePattern(attacker)).test(attacker)).toBe(true) // still finds its own
  })
})
