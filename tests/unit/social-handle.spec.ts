import { describe, it, expect } from 'vitest'
import { normalizeSocialHandle, guestLabel, formatGuestLabel } from '@/lib/social-handle'

describe('normalizeSocialHandle', () => {
  it('strips a leading @ and lowercases', () => {
    expect(normalizeSocialHandle('@Yardie.Adventures')).toBe('yardie.adventures')
  })

  it('strips repeated leading @s', () => {
    expect(normalizeSocialHandle('@@leshan_p')).toBe('leshan_p')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeSocialHandle('  irie.kingston  ')).toBe('irie.kingston')
  })

  it('accepts digits, dots and underscores', () => {
    expect(normalizeSocialHandle('guest_92.jm')).toBe('guest_92.jm')
  })

  it('rejects inner spaces', () => {
    expect(normalizeSocialHandle('leshan patterson')).toBeNull()
  })

  it('rejects characters outside the shared IG/TikTok alphabet', () => {
    expect(normalizeSocialHandle('léshan')).toBeNull()
    expect(normalizeSocialHandle('guest!')).toBeNull()
    expect(normalizeSocialHandle('🌊vibes')).toBeNull()
  })

  it('rejects too short and too long', () => {
    expect(normalizeSocialHandle('a')).toBeNull()
    expect(normalizeSocialHandle('a'.repeat(31))).toBeNull()
  })

  it('accepts the boundary lengths', () => {
    expect(normalizeSocialHandle('ab')).toBe('ab')
    expect(normalizeSocialHandle('a'.repeat(30))).toBe('a'.repeat(30))
  })

  it('returns null for empty, whitespace and nullish input', () => {
    expect(normalizeSocialHandle('')).toBeNull()
    expect(normalizeSocialHandle('   ')).toBeNull()
    expect(normalizeSocialHandle('@')).toBeNull()
    expect(normalizeSocialHandle(null)).toBeNull()
    expect(normalizeSocialHandle(undefined)).toBeNull()
  })
})

describe('guestLabel', () => {
  it('prefers the handle and marks it as one', () => {
    expect(guestLabel('leshan.travels', 'Leshan Patterson', 'Anonymous'))
      .toEqual({ text: 'leshan.travels', isHandle: true })
  })

  it('normalizes a legacy un-normalized handle instead of trusting it', () => {
    expect(guestLabel('@Leshan.Travels', null, 'Anonymous'))
      .toEqual({ text: 'leshan.travels', isHandle: true })
  })

  it('falls back to the FIRST name only, not the full name', () => {
    expect(guestLabel(null, 'Leshan Patterson', 'Anonymous'))
      .toEqual({ text: 'Leshan', isHandle: false })
  })

  it('ignores an invalid stored handle and uses the name', () => {
    expect(guestLabel('has spaces', 'Ann Marie', 'Anonymous'))
      .toEqual({ text: 'Ann', isHandle: false })
  })

  it('falls back to the given word when there is nothing', () => {
    expect(guestLabel(null, null, 'guest')).toEqual({ text: 'guest', isHandle: false })
    expect(guestLabel(null, '   ', 'Anonymous')).toEqual({ text: 'Anonymous', isHandle: false })
  })
})

describe('formatGuestLabel', () => {
  it('prefixes @ only for handles', () => {
    expect(formatGuestLabel('irie.kingston', null, 'guest')).toBe('@irie.kingston')
    expect(formatGuestLabel(null, 'Devon Taylor', 'guest')).toBe('Devon')
    expect(formatGuestLabel(null, null, 'guest')).toBe('guest')
  })
})
