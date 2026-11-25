'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { PARTY_COPY, partyEmail, type PartyMemberView } from '@/lib/travel-party'

/**
 * The booker's travel party (lib/travel-party): on the confirmation page,
 * after payment, and on /travel-party from the link in the confirmation email.
 *
 * One field and one button. Each person added gets their own email with the
 * trip's details, sent the moment they are added; the list says whether it
 * went, lets the booker send it again or take someone off, and shows who
 * stopped our emails. Optional, nothing pre-filled, and nothing here touches
 * the booking or its payment (app/api/travel-party).
 *
 * Keyboard focus is never dropped. A pressed button stays focusable while its
 * request runs (aria-disabled, not disabled), and when the control that had
 * focus goes away (a row removed, its email sent, the last place filled),
 * focus moves to the field, or to the count when the field is closed. A full
 * party closes the field without taking it out of the Tab order: it is
 * read-only and aria-disabled, and its description says why.
 *
 * A refusal is heard once. Typed with focus in the field, it is an alert
 * (focus does not move, so nothing else would say it); after a press of the
 * button, focus moves to the field, whose description carries it.
 */

interface Props {
  bookingId: string
  /** The party size: how many people may be added (lib/travel-party partyCap). */
  cap: number
  initial: PartyMemberView[]
  kind: 'transfer' | 'tour'
  /** The payment is still being confirmed: explain, and show no form yet. */
  pending?: boolean
  /** Open with "Traveling with others?": the confirmation pages. /travel-party, opened to add people, leaves it out. */
  ask?: boolean
}

interface Answer {
  ok?: boolean
  message?: string
  members?: PartyMemberView[]
  cap?: number
}

type Busy = { action: 'add' } | { action: 'send' | 'remove'; email: string } | null
type Tone = 'ok' | 'warn' | 'error'

/**
 * An address that wraps on a narrow phone only after its @ or a dot before it,
 * never mid-word and never inside the domain ('example.co.uk' stays whole).
 */
function breakable(email: string): React.ReactNode[] {
  const at = email.lastIndexOf('@')
  if (at < 0) return [email]
  const local = email.slice(0, at).split(/(?<=\.)/).flatMap((part, i) => (i === 0 ? [part] : [<wbr key={`l${i}`} />, part]))
  return [...local, '@', <wbr key="at" />, email.slice(at + 1)]
}

export default function TravelPartyCard({ bookingId, cap: initialCap, initial, kind, pending, ask = true }: Props) {
  const uid = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const countRef = useRef<HTMLParagraphElement>(null)
  const [members, setMembers] = useState<PartyMemberView[]>(initial)
  const [cap, setCap] = useState(initialCap)
  const [value, setValue] = useState('')
  // A refusal under the field. `n` changes with each one, so an alert is announced again when the words repeat.
  const [error, setError] = useState<{ text: string; n: number; alert: boolean } | null>(null)
  const [status, setStatus] = useState<{ text: string; tone: Tone }>({ text: '', tone: 'ok' })
  const [busy, setBusy] = useState<Busy>(null)
  // The address just added, so only its row plays the entrance.
  const [fresh, setFresh] = useState<string | null>(null)
  // A request to put focus back on the form. It runs after the render, which may have closed the field.
  const [refocus, setRefocus] = useState(0)

  useEffect(() => {
    if (refocus === 0) return
    const input = inputRef.current
    if (input && input.getAttribute('aria-disabled') !== 'true') input.focus()
    else countRef.current?.focus()
  }, [refocus])

  const active = members.filter((m) => !m.stopped).length
  const full = active >= cap
  const lead =
    kind === 'transfer'
      ? 'Each person you add gets their own email with this trip’s details and, before pickup, the driver’s name, plate and WhatsApp.'
      : 'Each person you add gets their own email with this trip’s details.'

  async function call(method: 'POST' | 'DELETE', email: string): Promise<{ ok: boolean; message: string; members: PartyMemberView[] | null }> {
    try {
      const res = await fetch('/api/travel-party', {
        method,
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ bookingId, email }),
      })
      const body = (await res.json().catch(() => ({}))) as Answer
      const list = Array.isArray(body.members) ? body.members : null
      if (list) setMembers(list)
      if (typeof body.cap === 'number') setCap(body.cap)
      return { ok: res.ok && body.ok === true, message: body.message || PARTY_COPY.failed, members: list }
    } catch {
      return { ok: false, message: PARTY_COPY.failed, members: null }
    }
  }

  /** Green when the email went, gold when the person is on the list but the email did not go yet, red when refused. */
  function toneOf(ok: boolean, email: string, list: PartyMemberView[] | null): Tone {
    if (!ok) return 'error'
    const row = list?.find((m) => m.email === email)
    return row && !row.sent && !row.stopped ? 'warn' : 'ok'
  }

  function refuse(text: string) {
    const inField = typeof document !== 'undefined' && document.activeElement === inputRef.current
    setError((e) => ({ text, n: (e?.n ?? 0) + 1, alert: inField }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    // Full: nothing to send; the count, which says why, takes focus.
    if (full) {
      setRefocus((n) => n + 1)
      return
    }
    const email = partyEmail(value)
    setStatus({ text: '', tone: 'ok' })
    if (!email) {
      refuse(PARTY_COPY.invalid)
      setRefocus((n) => n + 1)
      return
    }
    const isNew = !members.some((m) => m.email === email)
    setBusy({ action: 'add' })
    setError(null)
    const r = await call('POST', email)
    setBusy(null)
    if (r.ok) {
      setValue('')
      setStatus({ text: r.message, tone: toneOf(true, email, r.members) })
      if (isNew) setFresh(email)
    } else {
      refuse(r.message)
    }
    setRefocus((n) => n + 1)
  }

  async function sendAgain(email: string) {
    if (busy) return
    setBusy({ action: 'send', email })
    setError(null)
    setStatus({ text: '', tone: 'ok' })
    const r = await call('POST', email)
    setBusy(null)
    setStatus({ text: r.message, tone: toneOf(r.ok, email, r.members) })
    // Sent: its Send again button is gone, so focus goes back to the form. Otherwise the button is still there, and keeps it.
    if (r.members?.find((m) => m.email === email)?.sent) setRefocus((n) => n + 1)
  }

  async function remove(email: string) {
    if (busy) return
    setBusy({ action: 'remove', email })
    setError(null)
    setStatus({ text: '', tone: 'ok' })
    const r = await call('DELETE', email)
    setBusy(null)
    setStatus({ text: r.message, tone: r.ok ? 'ok' : 'error' })
    // The row, and the button that had focus, is gone: the field is the natural next stop.
    if (r.members && !r.members.some((m) => m.email === email)) setRefocus((n) => n + 1)
  }

  const titleId = `${uid}-title`
  const promiseId = `${uid}-promise`
  const hintId = `${uid}-hint`
  const errorId = `${uid}-error`
  const sending = busy?.action === 'add'

  return (
    <section className="tp-card" aria-labelledby={titleId} id="travel-party">
      <div className="tp-head">
        <h2 id={titleId} className="tp-title">Travel party</h2>
      </div>
      <div className="tp-body">
        {ask && <p className="tp-ask">Traveling with others?</p>}
        <p className="tp-lead">{lead}</p>

        {pending ? (
          <p className="tp-note">
            Your payment is still being confirmed. Refresh this page in a minute to add people, or use the link in your
            confirmation email.
          </p>
        ) : (
          <>
            <form className="tp-form" onSubmit={onSubmit} noValidate>
              <div className="tp-field">
                <label htmlFor={`${uid}-email`} className="tp-label">Their email address</label>
                {/* The promise sits where the booker types someone else's address. */}
                <p id={promiseId} className="tp-hint">We email them about this trip only, then once to ask for a review. They can stop at any time.</p>
                <input
                  ref={inputRef}
                  id={`${uid}-email`}
                  className="tp-input"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="send"
                  placeholder="name@example.com"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value)
                    if (error) setError(null)
                  }}
                  readOnly={full}
                  aria-disabled={full || undefined}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={[error ? errorId : null, promiseId, hintId].filter(Boolean).join(' ')}
                />
              </div>
              <button
                type="submit"
                className="btn-primary tp-send"
                aria-disabled={busy || full ? true : undefined}
                data-busy={sending ? '' : undefined}
                data-full={full ? '' : undefined}
              >
                {sending ? 'Sending…' : 'Send trip details'}
              </button>
            </form>
            {error && (
              <p key={error.n} id={errorId} className="tp-error" role={error.alert ? 'alert' : undefined}>{error.text}</p>
            )}
            <p id={hintId} ref={countRef} tabIndex={-1} className="tp-meta">
              {full ? PARTY_COPY.full(cap) : `${active} of ${cap} added.`}
            </p>
            <p className={`tp-status tp-status--${status.tone}`} role="status" aria-live="polite">{status.text}</p>
          </>
        )}

        {members.length > 0 && (
          <ul className="tp-list" aria-label="People you added">
            {members.map((m) => {
              const pressed = busy && busy.action !== 'add' && busy.email === m.email ? busy.action : null
              const sendLabel = pressed === 'send' ? 'Sending' : 'Send again'
              const removeLabel = pressed === 'remove' ? 'Removing' : 'Remove'
              return (
                <li key={m.email} className={`tp-row${m.email === fresh ? ' tp-row--new' : ''}`}>
                  <span className="tp-email">{breakable(m.email)}</span>
                  <span className={`tp-chip ${m.stopped ? 'tp-chip--stopped' : m.sent ? 'tp-chip--sent' : 'tp-chip--waiting'}`}>
                    {m.stopped ? 'Stopped our emails' : m.sent ? 'Sent' : 'Not sent yet'}
                  </span>
                  {!m.stopped && !pending && (
                    <span className="tp-actions">
                      {!m.sent && (
                        <button
                          type="button"
                          className="tp-act"
                          onClick={() => sendAgain(m.email)}
                          aria-disabled={busy ? true : undefined}
                          data-busy={pressed === 'send' ? '' : undefined}
                          aria-label={`${sendLabel} to ${m.email}`}
                        >
                          {pressed === 'send' ? 'Sending…' : 'Send again'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="tp-act"
                        onClick={() => remove(m.email)}
                        aria-disabled={busy ? true : undefined}
                        data-busy={pressed === 'remove' ? '' : undefined}
                        aria-label={`${removeLabel} ${m.email}`}
                      >
                        {pressed === 'remove' ? 'Removing…' : 'Remove'}
                      </button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
