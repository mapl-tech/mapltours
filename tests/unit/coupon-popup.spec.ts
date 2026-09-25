import { describe, test, expect } from 'vitest'
import { POPUP_COOLDOWN_MS, POPUP_DELAY_MS, POPUP_UNSEEN_MS, nextPopupStep, popupPathEligible, popupWasUnseen, shouldShowPopup } from '../../lib/coupon-popup'

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

describe('the popup timer never lands on a page the guest is leaving', () => {
  const on = (pathNow: string, busy = false, wasBusy = false) => nextPopupStep({ startedOn: '/transfers', pathNow, busy, wasBusy })

  test('a quiet eligible page opens it', () => {
    expect(on('/transfers')).toBe('open')
  })

  test('while the guest types, it waits', () => {
    expect(on('/transfers', true, false)).toBe('wait')
    expect(on('/transfers', true, true)).toBe('wait')
  })

  test('the tick right after typing stops still waits: the Book tap that ended the typing may be leaving the page', () => {
    // Seen on production at 390: the hotel search held the popup back, the
    // Book tap took focus away, and the next tick opened it over
    // /transfers/checkout a moment later.
    expect(on('/transfers', false, true)).toBe('wait')
    expect(on('/transfers', false, false)).toBe('open')
  })

  test('a page change stops the timer for good, eligible page or not', () => {
    expect(on('/transfers/checkout')).toBe('stop')
    expect(on('/checkout')).toBe('stop')
    expect(nextPopupStep({ startedOn: '/', pathNow: '/explore', busy: false, wasBusy: false })).toBe('stop')
  })

  test('a showing the page left within moments was unseen; a longer one was seen', () => {
    expect(POPUP_UNSEEN_MS).toBe(3000)
    expect(popupWasUnseen(now, now + 400)).toBe(true)
    expect(popupWasUnseen(now, now + POPUP_UNSEEN_MS)).toBe(false)
    expect(popupWasUnseen(now, now + 60_000)).toBe(false)
    expect(popupWasUnseen(now, now - 1), 'a clock that moved back is not a quick leave').toBe(false)
  })
})
