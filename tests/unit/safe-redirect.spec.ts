import { describe, test, expect } from 'vitest'
import { getSafeRedirect } from '../../lib/safe-redirect'

describe('post-login redirects', () => {
  test('returns the guest to the page that asked them to sign in', () => {
    // The bug this locks down: SavedView sends the signed-out guest to
    // /login?redirect=%2Fsaved, and /saved was missing from the allowlist, so
    // signing in to see your shortlist landed you on /profile instead.
    expect(getSafeRedirect('/saved')).toBe('/saved')
    expect(getSafeRedirect('/profile')).toBe('/profile')
    expect(getSafeRedirect('/explore')).toBe('/explore')
    expect(getSafeRedirect('/checkout')).toBe('/checkout')
    expect(getSafeRedirect('/transfers')).toBe('/transfers')
    expect(getSafeRedirect('/experience/dunns-river-falls-climb')).toBe('/experience/dunns-river-falls-climb')
  })

  test('still refuses anything that could leave the site', () => {
    expect(getSafeRedirect('//evil.com')).toBe('/profile')
    expect(getSafeRedirect('https://evil.com')).toBe('/profile')
    expect(getSafeRedirect('/\\evil.com')).toBe('/profile')
    expect(getSafeRedirect('/saved%2f%2fevil.com')).toBe('/profile')
    expect(getSafeRedirect('evil.com')).toBe('/profile')
    expect(getSafeRedirect(null)).toBe('/profile')
    expect(getSafeRedirect('')).toBe('/profile')
  })

  test('strips query and hash rather than passing them through', () => {
    expect(getSafeRedirect('/saved?next=//evil.com')).toBe('/saved')
    expect(getSafeRedirect('/profile#x')).toBe('/profile')
  })

  test('a guest who signed in to post a clip lands back on the upload sheet', () => {
    expect(getSafeRedirect('/experience/ricks-cafe-cliff-diving-and-sunset?clips=post'))
      .toBe('/experience/ricks-cafe-cliff-diving-and-sunset?clips=post')
    // Only that exact query, only on a tour, and nothing appended survives.
    expect(getSafeRedirect('/experience/x?clips=post&next=//evil.com')).toBe('/experience/x')
    expect(getSafeRedirect('/experience/x?clips=other')).toBe('/experience/x')
    expect(getSafeRedirect('/saved?clips=post')).toBe('/saved')
    expect(getSafeRedirect('//evil.com/experience/?clips=post')).toBe('/profile')
  })

  test('an unknown path falls back rather than 404ing the guest', () => {
    expect(getSafeRedirect('/does-not-exist')).toBe('/profile')
  })
})
