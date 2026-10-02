import { describe, test, expect } from 'vitest'
import { POPUP_COOLDOWN_MS, POPUP_DELAY_MS, POPUP_FORM_QUIET_MS, POPUP_UNSEEN_MS, nextPopupStep, popupBusy, popupPathEligible, popupWasUnseen, shouldShowPopup } from '../../lib/coupon-popup'

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

  test('the timer only waits while busy: it never opens early, and the seven-day rule is untouched', () => {
    // popupBusy only ever turns an 'open' into a 'wait'; nothing here can
    // make shouldShowPopup say yes sooner or more often.
    expect(on('/transfers', true, false)).toBe('wait')
    expect(shouldShowPopup({ pathname: '/transfers', memory: { lastShownAt: now, doneAt: null }, now: now + DAY })).toBe(false)
  })

  test('a showing the page left within moments was unseen; a longer one was seen', () => {
    expect(POPUP_UNSEEN_MS).toBe(3000)
    expect(popupWasUnseen(now, now + 400)).toBe(true)
    expect(popupWasUnseen(now, now + POPUP_UNSEEN_MS)).toBe(false)
    expect(popupWasUnseen(now, now + 60_000)).toBe(false)
    expect(popupWasUnseen(now, now - 1), 'a clock that moved back is not a quick leave').toBe(false)
  })
})

describe('the popup never opens over someone filling a booking form', () => {
  const quiet = { hidden: false, otherDialog: false, focusInField: false, lastFormActivityAt: null, now }

  test('a quiet page with no form use is not busy', () => {
    expect(popupBusy(quiet)).toBe(false)
  })

  test('a hidden tab, another dialog, or focus in a field or open list holds it', () => {
    expect(popupBusy({ ...quiet, hidden: true })).toBe(true)
    expect(popupBusy({ ...quiet, otherDialog: true })).toBe(true)
    expect(popupBusy({ ...quiet, focusInField: true })).toBe(true)
  })

  test('recent use of a booking form holds it even with focus on a button or nowhere', () => {
    // Seen from a browsing agent at 390 and 1440: between "type the hotel"
    // and "add a passenger" focus was on a button, and the popup opened over
    // the fare finder. A slow step is still inside the window.
    expect(POPUP_FORM_QUIET_MS).toBe(15_000)
    expect(popupBusy({ ...quiet, lastFormActivityAt: now - 1_000 })).toBe(true)
    expect(popupBusy({ ...quiet, lastFormActivityAt: now - 14_999 })).toBe(true)
  })

  test('once the guest has stopped for the whole window, it may open', () => {
    expect(popupBusy({ ...quiet, lastFormActivityAt: now - POPUP_FORM_QUIET_MS })).toBe(false)
    expect(popupBusy({ ...quiet, lastFormActivityAt: now - 60_000 })).toBe(false)
  })

  test('a clock that moved backwards holds it only as long as the window, not for good', () => {
    expect(popupBusy({ ...quiet, lastFormActivityAt: now + 2_000 })).toBe(true)
    expect(popupBusy({ ...quiet, lastFormActivityAt: now + 60 * 60 * 1000 })).toBe(false)
  })

  test('busy feeds the timer: a busy tick waits, and so does the quiet tick after it', () => {
    const tick = (busy: boolean, wasBusy: boolean) => nextPopupStep({ startedOn: '/transfers', pathNow: '/transfers', busy, wasBusy })
    const b = popupBusy({ ...quiet, lastFormActivityAt: now - 5_000 })
    expect(tick(b, false)).toBe('wait')
    const later = popupBusy({ ...quiet, lastFormActivityAt: now - 5_000, now: now + 12_000 })
    expect(tick(later, b)).toBe('wait')
    expect(tick(later, later)).toBe('open')
  })
})
