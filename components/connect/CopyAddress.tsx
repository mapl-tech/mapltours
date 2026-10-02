'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { breakable } from './breakable'
import CheckIcon from './CheckIcon'
import { copyText } from './copy'
import { FONT, SUPPORT_SIZE } from './tokens'
import { usePop } from './usePop'

/**
 * The connector address with a copy button (/connect).
 *
 * - The button is 48px tall. On a narrow screen it drops under the address
 *   and runs the full width (flex-wrap plus a small grow factor), so it is a
 *   thumb-sized target without a media query.
 * - The line under the row is never empty: at rest it says where the address
 *   goes ("You paste it in step 3"), after a copy it says what to do next, in
 *   emerald, and the button turns emerald with a tick for four seconds. The
 *   line is a polite live region whose text only changes when the guest
 *   copies, so nothing is announced on load and nothing is announced when the
 *   button settles back. A repeat copy toggles a trailing no-break space so
 *   it is announced again.
 * - Copying can fail (an old browser, a page inside another app's web view).
 *   Then the address is selected for the guest to copy by hand, and the line
 *   says so.
 */

type CopyState = 'idle' | 'copied' | 'manual'

export default function CopyAddress({
  address,
  label,
  pasteInto = 'your assistant',
  hint,
  nameSuffix,
}: {
  address: string
  /** Visible label above the address. Omit when the surrounding text already names it. */
  label?: string
  /** Who the guest pastes it into, for the confirmation line. */
  pasteInto?: string
  /** What the line under the button says before anything is copied. */
  hint: string
  /**
   * Read after "Copy address" by screen readers only ("for Claude"), so the
   * page's copy buttons have distinct names. The visible label stays the
   * start of the accessible name (WCAG 2.5.3).
   */
  nameSuffix?: string
}) {
  const [state, setState] = useState<CopyState>('idle')
  const [message, setMessage] = useState(hint)
  const addressId = useId()
  const textRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const repeat = useRef(false)
  const tickRef = useRef<HTMLSpanElement>(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const done = state === 'copied'

  // The tick in the button pops in on every copy (message changes each time).
  usePop(tickRef, done, message)

  const say = (text: string) => {
    repeat.current = !repeat.current
    setMessage(repeat.current ? text : `${text}\u00A0`)
  }

  const copied = () => {
    clearTimeout(timer.current)
    setState('copied')
    say(`Copied. Now paste it into ${pasteInto}.`)
    timer.current = setTimeout(() => setState('idle'), 4000)
  }

  const selectAddress = () => {
    const el = textRef.current
    const selection = window.getSelection()
    if (!el || !selection) return
    const range = document.createRange()
    range.selectNodeContents(el)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  const copy = async () => {
    if (await copyText(address, buttonRef.current)) {
      copied()
      return
    }
    selectAddress()
    clearTimeout(timer.current)
    setState('manual')
    say('This browser would not let us copy, so the address is selected. Copy it from there.')
  }

  return (
    <div>
      {label && (
        <p style={{ margin: '0 0 8px', fontFamily: FONT, fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: 'var(--text-secondary)' }}>
          {label}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 8 }}>
        <span
          id={addressId}
          translate="no"
          style={{
            flex: '10 1 240px',
            minWidth: 0,
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            fontFamily: FONT,
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.4,
            letterSpacing: '-0.005em',
            color: 'var(--text-primary)',
            overflowWrap: 'anywhere',
          }}
        >
          {/* One inline run: the pill is a flex box, and bare parts would each become a column.
              The run, not the pill, is what a tap or a failed copy selects: selecting the
              pill would add a line break after the address. */}
          <span ref={textRef} style={{ userSelect: 'all', WebkitUserSelect: 'all' }}>
            {breakable(address)}
          </span>
        </span>
        <button
          ref={buttonRef}
          type="button"
          className="btn-primary"
          onClick={copy}
          aria-describedby={addressId}
          style={{
            flex: '1 0 160px',
            height: 48,
            // Inline so the site-wide :focus-visible radius (3px) cannot square the pill.
            borderRadius: 9999,
            padding: '0 24px',
            fontSize: 15,
            fontWeight: 600,
            ...(done ? { background: 'var(--emerald)', boxShadow: 'none' } : {}),
          }}
        >
          {done ? (
            <>
              <span ref={tickRef} aria-hidden="true" style={{ display: 'inline-flex' }}>
                <CheckIcon size={16} />
              </span>
              Copied
            </>
          ) : (
            <>
              Copy address
              {nameSuffix && <span className="visually-hidden"> {nameSuffix}</span>}
            </>
          )}
        </button>
      </div>
      <p
        role="status"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          margin: '8px 0 0',
          fontFamily: FONT,
          // 16px on a phone, where this line is the instruction that links
          // step 1 to step 3; 15px on a wide screen.
          fontSize: SUPPORT_SIZE,
          fontWeight: state === 'idle' ? 400 : 600,
          lineHeight: 1.45,
          color: state === 'copied' ? 'var(--emerald)' : 'var(--text-secondary)',
        }}
      >
        {state === 'copied' && (
          <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', height: '1.45em' }}>
            <CheckIcon size={14} />
          </span>
        )}
        {/* Keyed on the text so each new message fades in (opacity only). */}
        <span key={message} style={{ animation: 'fadeIn 0.2s ease both' }}>
          {message}
        </span>
      </p>
    </div>
  )
}
