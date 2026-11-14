import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * The page-scroll lock (lib/scroll-lock). The bug it replaces: the reel page
 * and a sheet opened on it each remembered the body's overflow and wrote it
 * back on unmount; leaving the page with the sheet open ran the page's
 * cleanup first, so the sheet's cleanup put 'hidden' back for good and the
 * next page (/checkout, /explore) could not scroll.
 */
describe('lockScroll', () => {
  const body = { style: { overflow: '' } }
  let lockScroll: typeof import('@/lib/scroll-lock').lockScroll

  beforeEach(async () => {
    body.style.overflow = ''
    vi.stubGlobal('document', { body })
    vi.resetModules()
    ;({ lockScroll } = await import('@/lib/scroll-lock'))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  test('one lock holds the page and gives back what was there', () => {
    body.style.overflow = 'auto'
    const unlock = lockScroll()
    expect(body.style.overflow).toBe('hidden')
    unlock()
    expect(body.style.overflow).toBe('auto')
  })

  test('the page first, then the sheet: released in the order React unmounts them (page first), the page still scrolls', () => {
    const page = lockScroll()
    const sheet = lockScroll()
    page()                                   // the route changes: the page's cleanup runs first
    expect(body.style.overflow).toBe('hidden') // the sheet still holds it
    sheet()
    expect(body.style.overflow).toBe('')     // and the next page can scroll
  })

  test('released in the other order, the same', () => {
    const page = lockScroll()
    const sheet = lockScroll()
    sheet()
    expect(body.style.overflow).toBe('hidden')
    page()
    expect(body.style.overflow).toBe('')
  })

  test('releasing twice does not unlock somebody else\'s hold', () => {
    const a = lockScroll()
    const b = lockScroll()
    a(); a(); a()
    expect(body.style.overflow).toBe('hidden')
    b()
    expect(body.style.overflow).toBe('')
  })

  test('a new lock after everything was released starts clean', () => {
    lockScroll()()
    body.style.overflow = 'clip'
    const again = lockScroll()
    expect(body.style.overflow).toBe('hidden')
    again()
    expect(body.style.overflow).toBe('clip')
  })

  test('on the server it does nothing', () => {
    vi.stubGlobal('document', undefined)
    expect(() => lockScroll()()).not.toThrow()
  })
})
