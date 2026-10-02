'use client'

import { useEffect, useRef, useState } from 'react'
import CheckIcon from './CheckIcon'
import { copyText } from './copy'
import { FONT, GOLD_EDGE, GOLD_TINT, GOLD_TINT_HOVER, SUPPORT_SIZE } from './tokens'
import { usePop } from './usePop'

/**
 * A sample request on /connect that the traveller copies in one tap and
 * pastes into their assistant, so trying the connector costs no typing.
 * The words are the button's name, with "Copy" or "Copied" after them; a
 * visually hidden polite status says what happened (repeat taps toggle a
 * trailing no-break space so they are announced again).
 *
 * Hover (a mouse only, so a tap does not leave it tinted) deepens the tint,
 * and a press nudges the button down 1px; both are state, because this page
 * adds no stylesheet. If the browser will not copy, the request appears under
 * the button as plain text, already selected, to copy by hand (the address
 * control does the same).
 */
export default function CopyPrompt({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [said, setSaid] = useState('')
  const button = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const repeat = useRef(false)
  const tick = useRef<HTMLSpanElement>(null)
  const fallback = useRef<HTMLSpanElement>(null)
  const [hover, setHover] = useState(false)
  const [pressed, setPressed] = useState(false)

  useEffect(() => () => clearTimeout(timer.current), [])

  // The same tick pop as the address buttons; `said` changes on every copy.
  usePop(tick, state === 'copied', said)

  // No-break spaces keep the words together on screen; the clipboard gets plain spaces.
  const plain = text.replace(/\u00A0/g, ' ')

  // After a failed copy, select the plain request shown under the button.
  useEffect(() => {
    const el = fallback.current
    const selection = window.getSelection()
    if (state !== 'failed' || !el || !selection) return
    const range = document.createRange()
    range.selectNodeContents(el)
    selection.removeAllRanges()
    selection.addRange(range)
  }, [state, said])

  const copy = async () => {
    const ok = await copyText(plain, button.current)
    clearTimeout(timer.current)
    setState(ok ? 'copied' : 'failed')
    const message = ok
      ? 'Copied. Now paste it into your assistant.'
      : 'This browser would not let us copy, so the request is selected below. Copy it from there.'
    repeat.current = !repeat.current
    setSaid(repeat.current ? message : `${message}\u00A0`)
    if (ok) timer.current = setTimeout(() => setState('idle'), 2500)
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={copy}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
        onPointerLeave={() => {
          setHover(false)
          setPressed(false)
        }}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          minHeight: 44,
          maxWidth: '100%',
          padding: '8px 16px',
          textAlign: 'left',
          background: hover ? GOLD_TINT_HOVER : GOLD_TINT,
          border: `1px solid ${GOLD_EDGE}`,
          // Inline so the site-wide :focus-visible radius (3px) cannot square it.
          borderRadius: 'var(--r-xl)',
          color: 'var(--gold-ink)',
          fontFamily: FONT,
          fontSize: SUPPORT_SIZE,
          fontWeight: 400,
          lineHeight: 1.5,
          cursor: 'pointer',
          transform: pressed ? 'translateY(1px)' : 'none',
          transition: 'background-color 0.15s ease, transform 0.1s ease',
        }}
      >
        <span>“{text}”</span>
        <span
          style={{
            flex: '0 0 auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 15,
            fontWeight: 700,
            color: state === 'copied' ? 'var(--emerald)' : 'var(--gold-text)',
          }}
        >
          {state === 'copied' ? (
            <>
              <span ref={tick} aria-hidden="true" style={{ display: 'inline-flex' }}>
                <CheckIcon size={14} />
              </span>
              Copied
            </>
          ) : (
            'Copy'
          )}
        </span>
      </button>
      <span role="status" className="visually-hidden">
        {said}
      </span>
      {state === 'failed' && (
        <span
          ref={fallback}
          style={{
            display: 'block',
            marginTop: 8,
            padding: '12px 16px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            fontFamily: FONT,
            fontSize: SUPPORT_SIZE,
            lineHeight: 1.5,
            color: 'var(--text-primary)',
            userSelect: 'all',
            WebkitUserSelect: 'all',
          }}
        >
          {plain}
        </span>
      )}
    </>
  )
}
