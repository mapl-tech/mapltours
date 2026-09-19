import { describe, test, expect } from 'vitest'
import { POPUP_COOLDOWN_MS, POPUP_DELAY_MS, popupPathEligible, shouldShowPopup } from '../../lib/coupon-popup'

const DAY = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 8, 19, 15, 0, 0)
const fresh = { lastShownAt: null, doneAt: null }

describe('the 5% code popup rules', () => {
  test('the owner asked for ten seconds and a seven-day rest', () => {
    expect(POPUP_DELAY_MS).toBe(10_000)
    expect(POPUP_COOLDOWN_MS).toBe(7 * DAY)
  })

  test('only the home, explore and transfers pages', () => {
    expect(popupPathEligible('/')).toBe(true)
    expect(popupPathEligible('/explore')).toBe(true)
    expect(popupPathEligible('/transfers')).toBe(true)
    for (const p of ['/checkout', '/transfers/checkout', '/transfers/confirm', '/transfers/sandals-negril', '/experience/ricks-cafe', '/explore/', '/blog', '/admin', '/login']) {
      expect(popupPathEligible(p), p).toBe(false)
      expect(shouldShowPopup({ pathname: p, memory: fresh, now })).toBe(false)
    }
  })

  test('a first visit on an eligible page shows it', () => {
    expect(shouldShowPopup({ pathname: '/', memory: fresh, now })).toBe(true)
    expect(shouldShowPopup({ pathname: '/explore', memory: fresh, now })).toBe(true)
    expect(shouldShowPopup({ pathname: '/transfers', memory: fresh, now })).toBe(true)
  })

  test('once shown, not again for seven days: this covers once a day too', () => {
    const shown = { lastShownAt: now, doneAt: null }
    expect(shouldShowPopup({ pathname: '/', memory: shown, now: now + 1000 })).toBe(false)
    expect(shouldShowPopup({ pathname: '/', memory: shown, now: now + 1 * DAY })).toBe(false)
    expect(shouldShowPopup({ pathname: '/explore', memory: shown, now: now + 6 * DAY + 23 * 60 * 60 * 1000 })).toBe(false)
    expect(shouldShowPopup({ pathname: '/', memory: shown, now: now + 7 * DAY })).toBe(true)
    expect(shouldShowPopup({ pathname: '/', memory: shown, now: now + 30 * DAY })).toBe(true)
  })

  test('a guest who took the code never sees it again', () => {
    const done = { lastShownAt: now - 30 * DAY, doneAt: now - 30 * DAY }
    expect(shouldShowPopup({ pathname: '/', memory: done, now })).toBe(false)
    expect(shouldShowPopup({ pathname: '/explore', memory: done, now: now + 400 * DAY })).toBe(false)
  })

  test('a visit that started on the bio page already has the code', () => {
    expect(shouldShowPopup({ pathname: '/', memory: fresh, now, cameFromBio: true })).toBe(false)
    expect(shouldShowPopup({ pathname: '/', memory: fresh, now, cameFromBio: false })).toBe(true)
  })

  test('a clock that moved backwards does not show it twice', () => {
    expect(shouldShowPopup({ pathname: '/', memory: { lastShownAt: now + DAY, doneAt: null }, now })).toBe(false)
  })
})
