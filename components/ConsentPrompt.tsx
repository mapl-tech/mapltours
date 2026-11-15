'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import type { ConsentAnswer } from '@/lib/consent'

/**
 * What the card is showing:
 *  - 'ask': the visitor is in the UK, the EU or the EEA and has not answered;
 *  - 'on' / 'off': opened from the footer's "Cookie Preferences" by somebody whose
 *    cookies are on or off now, to change their mind;
 *  - 'browser': opened from the footer by somebody whose browser sends Do Not
 *    Track or Global Privacy Control, which nothing here can override.
 */
export type ConsentPromptMode = 'ask' | 'on' | 'off' | 'browser'

/**
 * The cookie question (owner, Nov 14 2026). A small card at the TOP of the
 * page, never a bar at the bottom: on this site the buttons that book sit
 * at the bottom (Add to Trip on a reel, the total and Pay on a phone), and
 * the question must never cover them. It belongs to the top of the page and
 * not to the screen: it scrolls away with the page, so a guest who reads on
 * without answering never has it over the form they are filling in. It is
 * not put at all on the pages where a guest pays or signs in (lib/consent
 * NO_CONSENT_PROMPT_PATHS).
 *
 * Honest by construction, and it has to stay that way:
 *  - two answers of the same size, weight and colour, side by side, "No
 *    thanks" first; neither is a link, neither is pre-chosen;
 *  - nothing measures or advertises until "Yes" is tapped, so ignoring the
 *    card is a no;
 *  - the sentence says who and what for (measuring the site and our ads,
 *    and showing our ads to people who have visited: a yes covers all three,
 *    because the Meta pixel and the Google tag do all three), and that
 *    booking works either way;
 *  - when the page puts it up by itself it does not take the keyboard's
 *    focus or trap it: it is a region a guest can answer or leave.
 *
 * Rendered into #consent-root, the first element of <body> (app/layout.tsx),
 * so a keyboard or screen-reader user meets it before the page. That is the
 * right place when the page asks, and the wrong one when the guest opens it
 * from the footer, a whole page away: then (`requested`) the card is pinned
 * to the screen where they are, takes the focus, has a Close of its own
 * (looking is not answering), Escape puts it away too, and Trackers hands
 * the focus back to the button that opened it.
 */
export default function ConsentPrompt({ mode, bare, requested, onAnswer, onClose }: {
  mode: ConsentPromptMode
  /** A page without the top navigation (the reel): the card sits under that page's own top controls. */
  bare: boolean
  /**
   * 0 when the page is asking. Otherwise the guest opened it (the footer's or
   * the Privacy Policy's "Cookie Preferences"), and this counts the times, so
   * that pressing the button again brings the keyboard back to the card.
   */
  requested: number
  onAnswer: (answer: ConsentAnswer) => void
  onClose: () => void
}) {
  // In the visitor's language where the site has one (lib/i18n: Spanish, French, German, Portuguese); English otherwise.
  const { t } = useI18n()
  const [root, setRoot] = useState<HTMLElement | null>(null)
  const card = useRef<HTMLElement>(null)
  // When this card went up, for the discount popup, which waits for it only so long (lib/coupon-popup CONSENT_HOLD_MS).
  const [since] = useState(() => Date.now())
  useEffect(() => { setRoot(document.getElementById('consent-root')) }, [])
  useEffect(() => { if (requested > 0 && root) card.current?.focus() }, [requested, root])
  if (!root) return null

  return createPortal(
    <section
      ref={card}
      className="consent"
      data-consent-prompt=""
      data-since={since}
      data-bare={bare ? 'true' : undefined}
      data-requested={requested > 0 ? 'true' : undefined}
      aria-label={t('Cookie choice')}
      tabIndex={-1}
      onKeyDown={requested > 0 ? (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } } : undefined}
    >
      {requested > 0 && mode !== 'browser' && (
        <button type="button" className="consent-close" aria-label={t('Close')} onClick={onClose}>
          <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" focusable="false">
            <path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      )}
      {mode === 'browser' ? (
        <>
          <p className="consent-text">
            {t('Measurement and advertising cookies are off, because your browser asks sites not to track you. There is nothing to choose here.')}
          </p>
          <div className="consent-actions">
            <button type="button" className="consent-btn" onClick={onClose}>{t('Close')}</button>
          </div>
        </>
      ) : (
        <>
          <p className="consent-text">
            {t('Can we use cookies from Google, Meta and Hotjar to see how people use the site, measure our ads, and show our ads to people who have visited? Booking works the same either way.')}
            {mode === 'on' && <> {t('They are on now.')}</>}
            {mode === 'off' && <> {t('They are off now.')}</>}
            {' '}<Link href="/privacy">{t('Privacy Policy')}</Link>
          </p>
          <div className="consent-actions">
            <button type="button" className="consent-btn" onClick={() => onAnswer('no')}>{t('No thanks')}</button>
            <button type="button" className="consent-btn" onClick={() => onAnswer('yes')}>{t('Yes, that’s fine')}</button>
          </div>
        </>
      )}
    </section>,
    root,
  )
}
