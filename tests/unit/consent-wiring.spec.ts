import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { consentPromptAllowedOn, NO_CONSENT_PROMPT_PATHS } from '../../lib/consent'
import { CONSENT_HOLD_MS, consentHoldsPopup } from '../../lib/coupon-popup'

/**
 * The cookie question's place in the site (owner, Nov 14 2026). The rule is
 * tested in consent.spec.ts; this file holds the things around it that a
 * later edit could quietly undo: where the question is never put, that the
 * tags wait for the answer, that the two answers are equals, that it sits at
 * the top of the screen and not over the buttons that book, and that there
 * is a way back to it from every page.
 */
const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('where the question is put', () => {
  test('never where a guest pays or signs in, on the handoff into a checkout, or in the staff tools', () => {
    for (const p of ['/checkout', '/checkout/confirm', '/transfers/checkout', '/transfers/confirm', '/book', '/gifts', '/login', '/login/reset', '/auth/callback', '/admin', '/admin/bookings', '/driver', '/driver/login', '/referrals', '/referrals/login']) {
      expect(consentPromptAllowedOn(p), p).toBe(false)
    }
  })

  test('on every page a visitor browses, the pages that only look like the others included', () => {
    for (const p of ['/', '/explore', '/transfers', '/experience/dunns-river-falls-climb', '/blog', '/blog/negril-guide', '/help', '/privacy', '/terms', '/giveaway', '/connect', '/saved', '/profile', '/about',
      '/checkouts', '/transfers/checklist', '/bookings', '/gift', '/administrators', '/drivers', '/transfers/confirmed']) {
      expect(consentPromptAllowedOn(p), p).toBe(true)
    }
    expect(consentPromptAllowedOn(null)).toBe(true)
    expect(NO_CONSENT_PROMPT_PATHS.flags).toBe('') // no "g": a global regex remembers where it stopped between calls
  })

  test('the checkout pages named are the ones that exist', () => {
    for (const p of ['app/checkout/page.tsx', 'app/checkout/confirm/page.tsx', 'app/transfers/checkout/page.tsx', 'app/transfers/confirm/page.tsx', 'app/book/page.tsx', 'app/gifts/page.tsx', 'app/login/page.tsx']) {
      expect(src(p).length, p).toBeGreaterThan(0)
    }
  })
})

describe('the tags wait for the answer', () => {
  const trackers = src('components/Trackers.tsx')

  test('nothing is rendered for the tags unless this is the live site and the decision is to allow', () => {
    expect(trackers).toContain("const [decision, setDecision] = useState<ConsentDecision>('wait')")
    expect(trackers).toContain("const allowed = tracked && decision === 'allow'")
    // Every tag sits inside the one guarded block: the four of them after it, none before.
    const guard = trackers.indexOf('{allowed && <>')
    expect(guard).toBeGreaterThan(0)
    for (const tag of ['googletagmanager.com/gtag/js', "gtag('config', 'AW-", 'connect.facebook.net/en_US/fbevents.js', 'static.hotjar.com']) {
      expect(trackers.indexOf(tag), tag).toBeGreaterThan(guard)
      expect(trackers.slice(0, guard)).not.toContain(tag)
    }
    // The pixel's later PageViews are behind the same word.
    expect(trackers).toContain('if (!allowed) return\n    if (firstPath.current)')
  })

  test('the decision is lib/consent\'s, kept current by its one watcher, and read again on every page', () => {
    // What the watcher does (read at once, look the country up, read again on an answer and when the tab is
    // looked at again) is tested where it lives, in consent.spec.ts. Here: that this component uses it and nothing else.
    expect(trackers).toContain('const watch = watchConsent(setDecision, optedOut)')
    expect(trackers).toContain('return () => { watch.stop(); offOpen(); watcher.current = null }')
    expect(trackers).toMatch(/useEffect\(\(\) => \{\s*watcher\.current\?\.read\(\)\s*setRequest\(0\)\s*opener\.current = null\s*\}, \[pathname\]\)/)
    // No second way to the decision, and no lookup of its own.
    expect(trackers).not.toMatch(/consentDecision\(|resolveRegion\(|countryFromGeoEndpoint|onConsentChange\(/)
  })

  test('a no stops the tags, and loads the page again without them only where that is safe', () => {
    // A tag cannot be taken off a page. What can be switched off is, at once, before the tags' cookies are cleared
    // (a tag still running would write them straight back as the page goes): Google's off switch for the
    // measurement id with its consent signal, and the pixel's.
    expect(trackers).toContain("w[`ga-disable-${GA4_ID}`] = !on")
    expect(trackers).toContain("const GA4_ID = 'G-2JVWPL4GBE'")
    expect(trackers).toContain("gtag('config', 'G-2JVWPL4GBE');")
    expect(trackers).toContain("w.gtag?.('consent', 'update', { ad_storage: state, ad_user_data: state, ad_personalization: state, analytics_storage: state })")
    expect(trackers).toContain("w.fbq?.('consent', on ? 'grant' : 'revoke')")
    const answer = trackers.slice(trackers.indexOf('const answer = (a: ConsentAnswer) => {'))
    expect(answer.indexOf("if (a === 'no' && tagsMounted.current) { tagsStopped.current = true; setTagsRunning(false) }")).toBeGreaterThan(0)
    expect(answer.indexOf('setTagsRunning(false)')).toBeLessThan(answer.indexOf('setConsent(a)'))
    // The page is loaded again whenever the answer stops being yes on a page that has the tags (a no here, in
    // another tab or on the bio page, or a yes that lapsed), but never where a guest pays or signs in and never
    // while a payment is going through; leaving such a page is when it happens instead.
    expect(trackers).toContain('if (!tagsMounted.current || decision === \'wait\') return')
    // ...and (Nov 26 2026) on arriving with the tags at a page that may never carry them (lib/tracker-gate NO_TRACKER_PATHS: /referrals).
    expect(trackers).toContain('if ((consentPromptAllowedOn(pathname) || !trackersAllowedOn(pathname)) && !isPaymentInFlight()) window.location.reload()')
    expect(trackers).toContain("const allowed = tracked && decision === 'allow' && trackersAllowedOn(pathname)")
    expect(trackers).toContain('}, [allowed, decision, pathname])')
    expect((trackers.match(/window\.location\.reload\(\)/g) ?? []).length).toBe(1)
    expect(trackers).toContain("import { isPaymentInFlight } from '@/lib/payment-lock'")
    for (const p of ['/checkout', '/transfers/checkout', '/transfers/confirm', '/checkout/confirm', '/gifts', '/login', '/book']) expect(consentPromptAllowedOn(p), p).toBe(false)
    // Our own events ask before every send, at the moment the tag is ready, so they stop with the answer.
    const analytics = src('lib/analytics.ts')
    for (const fn of ['whenGtagReady', 'whenFbqReady', 'whenHjReady']) {
      const body = analytics.slice(analytics.indexOf(`function ${fn}(`), analytics.indexOf('window.setTimeout(() => ' + fn))
      expect(body, fn).toMatch(/=== 'function'\) \{\s*(\/\/[^\n]*\n\s*)*if \(trackingOptedOut\(\)\) return/)
    }
  })

  test('Google is told the visitor agreed before its tag is configured, and only inside the guarded block', () => {
    const line = "gtag('consent', 'default', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });"
    expect((trackers.match(/gtag\('consent', 'default'/g) ?? []).length).toBe(1)
    expect(trackers.indexOf(line)).toBeGreaterThan(trackers.indexOf('{allowed && <>'))
    // After gtag is defined, before anything is sent.
    expect(trackers.indexOf('function gtag(){dataLayer.push(arguments);}')).toBeLessThan(trackers.indexOf(line))
    expect(trackers.indexOf(line)).toBeLessThan(trackers.indexOf("gtag('js', new Date());"))
    expect(trackers.indexOf(line)).toBeLessThan(trackers.indexOf("gtag('config', 'G-2JVWPL4GBE');"))
    // The question covers what the four keys say: measuring the site, measuring ads, and ads shown because of a visit.
    expect(src('components/ConsentPrompt.tsx')).toContain('to see how people use the site, measure our ads, and show our ads to people who have visited?')
  })

  test('our own note of where a visitor came from waits for the same answer', () => {
    const a = src('lib/attribution.ts')
    // Capture: held, not written, while the visitor may not be measured; the write below it is the one that was always there.
    const capture = a.slice(a.indexOf('export function captureAttribution(): void {'), a.indexOf('function storeLanding('))
    expect(capture.indexOf('if (consentBlocksTracking()) {')).toBeGreaterThan(0)
    expect(capture.indexOf('if (consentBlocksTracking()) {')).toBeLessThan(capture.indexOf('localStorage.getItem(KEY)'))
    expect(capture.indexOf('holdLanding(')).toBeLessThan(capture.indexOf('localStorage.setItem(KEY, JSON.stringify(fresh))'))
    // The checkout's read: nothing from storage or the tags' cookies for such a visitor.
    const read = a.slice(a.indexOf('export function getStoredAttribution(): Attribution | null {'), a.indexOf('/** This browser\'s family as the `ua` key'))
    expect(read.indexOf('if (consentBlocksTracking()) {')).toBeGreaterThan(0)
    expect(read.indexOf('if (consentBlocksTracking()) {')).toBeLessThan(read.indexOf('localStorage.getItem(KEY)'))
    expect(read.indexOf('if (consentBlocksTracking()) {')).toBeLessThan(read.indexOf('readGaIds(cookie)'))
    expect(read).toContain("return { ...(held?.touch ?? {}), dnt: '1', ...liveBrowserFamily() }")
    // An agent-started booking: the same.
    const agent = a.slice(a.indexOf('export function markAgentAttribution(tool: string): void {'), a.indexOf('export function getStoredAttribution(): Attribution | null {'))
    expect(agent.indexOf('if (consentBlocksTracking()) {')).toBeLessThan(agent.indexOf('localStorage.getItem(KEY)'))
    // A yes stores what was held; a no removes what was stored, on the click and on arriving with one already given.
    expect(a).toMatch(/if \(storedConsent\(\) === 'no'\) \{\s*pending = null\s*forgetAttribution\(\)\s*return\s*\}/)
    expect(a).toContain("if (storedConsent() === 'no') forgetAttribution()\n    if (isCapturePausedPath(window.location.pathname)) return")
    expect(a).toMatch(/pending = null\s*storeHeldAttribution\(\)/)
    // What the clock let through before the visitor was placed is taken back out if they turn out to be in the region.
    expect(a).toMatch(/if \(pending\) \{\s*forgetAttribution\(\)\s*holdLanding\(pending\.touch, pending\.hasSignal, pending\.returnLanding\)\s*pending = null\s*\}/)
    expect(a).toContain('for (const key of [KEY, FIRST_TOUCH_KEY, FIRST_TOUCH_SINCE_KEY]) {')
    // Every write to the browser in this module is one of the three keys, and there are no others to forget.
    expect(Array.from(a.matchAll(/localStorage\.setItem\(([A-Z_]+),/g)).map((m) => m[1]).sort()).toEqual(['FIRST_TOUCH_KEY', 'FIRST_TOUCH_SINCE_KEY', 'KEY', 'KEY', 'KEY'])
  })

  test('the opt-out every other tracking path asks includes the consent rule', () => {
    expect(src('lib/attribution.ts')).toContain('return dnt || gpc || consentBlocksTracking()')
    // The paths that ask it: the booking\'s flag for the server, the discount code\'s Lead, the pixel\'s purchase match.
    expect(src('lib/attribution.ts')).toContain("const optOut: Attribution = trackingOptedOut() ? { dnt: '1' } : {}")
    expect(src('components/CouponPopup.tsx')).toContain('const eventId = trackingOptedOut() ? undefined : safeUuid()')
    expect(src('lib/analytics.ts')).toContain('if (trackingOptedOut()) return')
    // And the server skips a booking that carries the flag.
    expect(src('lib/meta-capi.ts')).toContain("if (attr.dnt === '1') return { skipped: 'visitor opted out of tracking' }")
    expect(src('lib/ga4-server.ts')).toContain("if (attr.dnt === '1') return { skipped: 'visitor opted out of tracking' }")
  })
})

describe('the question itself is an honest one', () => {
  const prompt = src('components/ConsentPrompt.tsx')
  const css = src('app/globals.css')
  const block = css.slice(css.indexOf('/* ── The cookie question'))

  test('two answers with one class between them, "No thanks" first, and no third way out while it is being asked', () => {
    const buttons = Array.from(prompt.matchAll(/<button type="button" className="([a-z-]+)" onClick=\{([^}]*\}?)\}>\{t\('([^']+)'\)\}<\/button>/g)).map((m) => [m[1], m[3]])
    expect(buttons).toEqual([['consent-btn', 'Close'], ['consent-btn', 'No thanks'], ['consent-btn', 'Yes, that’s fine']])
    // The one other control, a Close in the corner, exists only on a card the guest opened: when the page asks,
    // there is no third way out, and looking at a card you opened is not answering it.
    expect(prompt).toContain("{requested > 0 && mode !== 'browser' && (\n        <button type=\"button\" className=\"consent-close\" aria-label={t('Close')} onClick={onClose}>")
    expect((prompt.match(/<button /g) ?? []).length).toBe(4)
    expect(prompt.indexOf("onAnswer('no')")).toBeLessThan(prompt.indexOf("onAnswer('yes')"))
    // One rule styles both; nothing styles one of them alone.
    expect((block.match(/\.consent-btn[^{]*\{/g) ?? []).length).toBe(3) // the button, its hover, and its size on a narrow phone: each for both answers
    expect(block).not.toMatch(/consent-btn--|consent-yes|consent-no|consent-primary/)
    // Nothing is chosen for the visitor, and nothing counts down.
    expect(prompt).not.toMatch(/defaultChecked|checked=|autoFocus|setTimeout|setInterval/)
  })

  test('it says who and why, and that booking works either way', () => {
    expect(prompt).toContain("t('Can we use cookies from Google, Meta and Hotjar to see how people use the site, measure our ads, and show our ads to people who have visited? Booking works the same either way.')")
    expect(prompt).toContain('<Link href="/privacy">')
    expect(prompt).not.toContain('\u2014')
  })

  test('it is a card at the top of the page that scrolls away with it, and never names the bottom', () => {
    // Absolute, not fixed: it belongs to the top of the page, so a guest who reads on without answering never
    // has it over the form they are filling in.
    expect(block).toMatch(/\.consent \{\s*--consent-top: 64px;\s*position: absolute; z-index: 95;\s*top: calc\(var\(--consent-top\) \+ env\(safe-area-inset-top, 0px\)\); left: 12px; right: 12px;/)
    expect((block.replace(/\/\*[\s\S]*?\*\//g, '').match(/position: fixed/g) ?? []).length).toBe(1) // only the card a guest opened
    // No declaration places it from the bottom (its own comment is free to say why).
    expect(block.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\bbottom\s*:/)
    // Above the page (its sticky bars stop at 90), below everything that opens over the page: every level between is checked.
    const levels = { card: 95, stickyBars: 90, phoneMenu: 99, navigation: 100, search: 120, cart: 200, reelBar: 310, reelSheet: 320, dialogs: 1000 }
    expect(css).toMatch(/\.opc-sticky \{\s*position: fixed;\s*left: 0; right: 0; bottom: 0;\s*z-index: 90;/)
    expect(src('components/TopNav.tsx')).toContain("padding: '12px 0 24px', overflowY: 'auto', zIndex: 99,")
    expect(src('components/TopNav.tsx')).toContain('zIndex: 100, height: 56')
    expect(src('components/TopNav.tsx')).toContain("position: 'fixed', inset: 0, zIndex: 120,")
    expect(src('components/ItineraryPanel.tsx')).toContain("background: 'rgba(0,0,0,0.25)', zIndex: 200")
    expect(src('components/ExperienceDetail.tsx')).toContain('zIndex: 310,')
    expect(src('components/ExperienceDetail.tsx')).toContain('zIndex: 320,')
    expect(src('components/checkout/LegalModal.tsx')).toContain('zIndex: 1000')
    expect(levels.stickyBars).toBeLessThan(levels.card)
    for (const above of [levels.phoneMenu, levels.navigation, levels.search, levels.cart, levels.reelBar, levels.reelSheet, levels.dialogs]) expect(levels.card).toBeLessThan(above)
    // A card the guest opened is pinned where they are, above the menus it can be opened from and below every dialog,
    // and never taller than the screen: pinned, it could not be scrolled to, so it scrolls inside itself.
    expect(block).toMatch(/\.consent\[data-requested="true"\] \{[^}]*position: fixed; z-index: 400;\s*max-height: calc\(100vh - var\(--consent-top\) - env\(safe-area-inset-top, 0px\) - 12px\);\s*max-height: calc\(100dvh - var\(--consent-top\) - env\(safe-area-inset-top, 0px\) - 12px\);\s*overflow-y: auto;/)
    // Both answers are a full touch target, and the text is body size.
    expect(block).toContain('min-height: 48px')
    expect(block).toContain('.consent-text { margin: 0; font-size: 16px;')
  })

  test('it comes first in the document, and is a region, not a dialog that takes the keyboard', () => {
    const layout = src('app/layout.tsx')
    expect(layout.indexOf('<div id="consent-root" />')).toBeGreaterThan(0)
    expect(layout.indexOf('<div id="consent-root" />')).toBeLessThan(layout.indexOf('<LayoutShell>'))
    expect(prompt).toContain("document.getElementById('consent-root')")
    expect(prompt).toMatch(/<section\s+ref=\{card\}\s+className="consent"\s+data-consent-prompt=""/)
    expect(prompt).not.toMatch(/role="dialog"|aria-modal/)
  })

  test('opened from the footer it takes the keyboard, Escape puts it away, and the keyboard goes back to the button', () => {
    // The card is first in the document and the footer is last: without this a keyboard user who opens it is a whole page of links away from it.
    expect(prompt).toContain('useEffect(() => { if (requested > 0 && root) card.current?.focus() }, [requested, root])')
    expect(prompt).toContain('tabIndex={-1}')
    expect(prompt).toContain("onKeyDown={requested > 0 ? (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } } : undefined}")
    expect(prompt).toContain("data-requested={requested > 0 ? 'true' : undefined}")
    const trackers = src('components/Trackers.tsx')
    // The button hands itself over (Safari gives a clicked button no focus to find it by), each press counts, so a
    // second press brings the keyboard to the card again, and the card does not follow the guest to another page.
    expect(trackers).toMatch(/onConsentPromptRequest\(\(from\) => \{\s*opener\.current = from\s*setRequest\(\(n\) => n \+ 1\)\s*\}\)/)
    expect(trackers).toContain('if (back && document.contains(back)) back.focus({ preventScroll: true })')
    expect(trackers).toContain('requested={request} onAnswer={answer} onClose={close}')
    // When the page asks by itself nothing takes the focus: `requested` is only ever the guest's own doing.
    expect(prompt).not.toMatch(/autoFocus|\.focus\(\)[^\n]*\[\]\)/)
    // The card's own ring is drawn inside its edge, on its own dark ground: outside, it would be white on a white page.
    expect(css).toContain('.consent:focus-visible { outline: 2px solid #fff !important; outline-offset: -5px; }')
  })

  test('in the four European languages the site speaks, every sentence of it is translated', () => {
    const i18n = src('lib/i18n.ts')
    const keys = ['Can we use cookies from Google, Meta and Hotjar to see how people use the site, measure our ads, and show our ads to people who have visited? Booking works the same either way.', 'They are on now.', 'They are off now.', 'No thanks', 'Yes, that’s fine', 'Close', 'Cookie choice',
      'Measurement and advertising cookies are off, because your browser asks sites not to track you. There is nothing to choose here.']
    const lines = i18n.split('\n').filter((l) => l.includes('"Can we use cookies from Google, Meta and Hotjar'))
    expect(lines.length).toBe(4) // es, fr, de, pt
    for (const line of lines) {
      for (const k of keys) expect(line, k).toContain(`"${k}": "`)
      expect(line).not.toContain('\u2014')
      // The three companies are named in each language's own sentence.
      const asked = (line.match(/"Can we use cookies[^"]*": "([^"]*)"/) ?? [])[1] ?? ''
      for (const who of ['Google', 'Meta', 'Hotjar']) expect(asked, who).toContain(who)
      expect(asked.endsWith('.')).toBe(true)
    }
    // Every key the card uses is one of those, or already in the dictionary.
    for (const m of Array.from(prompt.matchAll(/t\('([^']+)'\)/g))) expect(keys.concat(['Privacy Policy']), m[1]).toContain(m[1])
  })
})

describe('one question at a time, and a way back to it', () => {
  test('the discount popup waits for the cookie question, but only while the card is fresh', () => {
    // One question at a time; and a card nobody answers must not keep the discount from a visitor for good.
    const popup = src('components/CouponPopup.tsx')
    expect(popup).toContain("|| consentHoldsPopup(document.querySelector('[data-consent-prompt]')?.getAttribute('data-since'), Date.now()),")
    expect(popup).not.toContain("document.querySelector('[data-consent-prompt]') !== null")
    const prompt = src('components/ConsentPrompt.tsx')
    expect(prompt).toContain('const [since] = useState(() => Date.now())')
    expect(prompt).toContain('data-since={since}')
    expect(CONSENT_HOLD_MS).toBe(20_000)
    const t = 1_794_700_000_000
    expect(consentHoldsPopup(null, t)).toBe(false) // no card on the page
    expect(consentHoldsPopup(String(t), t)).toBe(true)
    expect(consentHoldsPopup(String(t - 19_999), t)).toBe(true)
    expect(consentHoldsPopup(String(t - 20_000), t)).toBe(false)
    expect(consentHoldsPopup(String(t - 600_000), t)).toBe(false) // ignored for ten minutes
    // A card whose time cannot be read does not hold the popup: it could never be told to let go.
    for (const bad of ['', 'abc', '-5', '1.5', undefined]) expect(consentHoldsPopup(bad, t), String(bad)).toBe(false)
    // A clock that moved: a time from the future holds only inside the same window.
    expect(consentHoldsPopup(String(t + 10_000), t)).toBe(true)
    expect(consentHoldsPopup(String(t + 3_600_000), t)).toBe(false)
    // The popup's scrim is above the card, so when it does open the card is under it, not over the form.
    expect(src('app/globals.css')).toMatch(/\.cpop-scrim \{\s*position: fixed; inset: 0; z-index: 2100;/)
  })

  test('there is a way back to it from every page that has the navigation, and from the footer and the Privacy Policy', () => {
    // The footer's link, which hands itself over as the button to return to.
    const footer = src('components/Footer.tsx')
    expect(footer).toContain("import { requestConsentPrompt } from '@/lib/consent'")
    expect(footer).toContain('<button type="button" className="footer-cookie-choices" onClick={(e) => requestConsentPrompt(e.currentTarget)}>{t(\'Cookie Preferences\')}</button>')
    expect(src('components/CookiePreferencesButton.tsx')).toContain('onClick={(e) => requestConsentPrompt(e.currentTarget)}')
    // Several pages have no footer (transfers, contact, the account, saved). The language and currency menu is in
    // the navigation of every one of them, on a phone (in the menu sheet) and on a desktop, and carries the same control.
    const switcher = src('components/LanguageSwitcher.tsx')
    expect(switcher).toContain("onClick={() => { setOpen(false); requestConsentPrompt(toggle.current) }}")
    expect(switcher).toContain("{t('Cookie Preferences')}")
    expect(switcher).toContain('minHeight: 44')
    const nav = src('components/TopNav.tsx')
    expect((nav.match(/<LanguageSwitcher /g) ?? []).length).toBe(2) // the desktop bar, and the phone menu sheet
    for (const page of ['app/transfers/page.tsx', 'app/contact/page.tsx', 'app/profile/page.tsx', 'app/saved/page.tsx']) expect(src(page).length, page).toBeGreaterThan(0)
    // "Cookie Preferences" is translated in every language the site speaks.
    expect((src('lib/i18n.ts').match(/'Cookie Preferences': '/g) ?? []).length).toBe(7)
  })

})
