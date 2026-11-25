'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, CircleAlert, Clock, Mail, PlaneTakeoff } from 'lucide-react'
import Sheet from './Sheet'
import type { PlanWords, QuestionWords, Tone } from '@/lib/dispatch-change-words'
import type { PortalDriver } from '@/lib/driver-portal-data'
import { MIN_PICKUP_LEAD_MIN } from '@/lib/booking-window'
import { flightDate, type FlightStatus } from '@/lib/flight'

/**
 * A fleet manager's change, in steps (owner, Nov 24 2026: "display a
 * confirmation prompt asking the user to confirm the change before it is
 * saved ... send the email after a second confirmation popup"):
 *
 *   choose    the new driver or time; nothing is sent yet
 *   confirm   what changes, which rides, and when the guest hears; the
 *             server worked this out (POST mode 'plan') and wrote nothing
 *   question  only where the guest needs an email now: email them, or save
 *             without (the office is told)
 *   saving    one request saves and sends (mode 'commit'); the server checks
 *             again and refuses a change that moved under it
 *   done      what happened, in one line
 *
 * A change saved earlier whose email is still open comes in at the question.
 */

export type ChangeRequest =
  | { mode: 'change'; kind: 'driver'; bookingId: string; ref: string; guest: string; current: string | null; isTour: boolean }
  | { mode: 'change'; kind: 'time'; bookingId: string; ref: string; guest: string; leg: 'arrival' | 'departure'; current: string; flight: string | null }
  | { mode: 'change'; kind: 'tour_time'; bookingId: string; ref: string; guest: string; current: string | null; day: string | null }
  | { mode: 'followup'; changeId: string; ref: string; guest: string; text: string }

type Plan = { key: string; ref: string; decide: string[]; words: PlanWords }
type Step = 'choose' | 'confirm' | 'question' | 'saving' | 'done' | 'error'

const API = '/api/driver/change'
const CONNECTION = 'The connection dropped before an answer came back. Check your signal, then open the ride again to see whether it saved.'

async function call(body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, json }
}

/** "2026-11-30T15:30" from a stored "2026-11-30T15:30:00+00:00". */
const fieldValue = (stored: string | null): string => (stored ?? '').slice(0, 16)

/** Minutes after midnight from "3:40 PM". */
function minutesOf(clock: string | null | undefined): number | null {
  const m = (clock ?? '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  return (Number(m[1]) % 12 + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + Number(m[2])
}

/** The wall-clock "YYYY-MM-DDTHH:MM" that is `lead` minutes before `clock` on `day`. */
function before(day: string, clock: number, lead: number): string {
  const ms = Date.parse(`${day}T00:00:00Z`) + (clock - lead) * 60_000
  return new Date(ms).toISOString().slice(0, 16)
}

/** "12:10 PM" from "YYYY-MM-DDTHH:MM" (zone-free). */
function clockOf(v: string): string {
  const d = new Date(`${v}:00Z`)
  if (Number.isNaN(d.getTime())) return v
  const t = d.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' })
  return t === '12:00 PM' ? '12:00 noon' : t === '12:00 AM' ? '12:00 midnight' : t
}

const LEAD_TEXT = (() => {
  const h = Math.floor(MIN_PICKUP_LEAD_MIN / 60)
  const m = MIN_PICKUP_LEAD_MIN % 60
  return m === 30 ? `${h}½ hours` : m ? `${h} hours ${m} minutes` : `${h} hours`
})()

/**
 * Where the person is in a change: choose, then check, then (only when the
 * guest needs an email now) email. Shown as three short bars with words; the
 * current one is aria-current="step".
 */
function Steps({ at, withEmail }: { at: 0 | 1 | 2; withEmail: boolean }) {
  const names = withEmail ? ['Choose', 'Check', 'Email'] : ['Choose', 'Check']
  return (
    <ol className="fm-steps" aria-label="Progress">
      {names.map((n, i) => (
        <li key={n} className={i < at ? 'is-done' : i === at ? 'is-now' : undefined} aria-current={i === at ? 'step' : undefined}>
          <span className="fm-steps-bar" aria-hidden="true" />
          {n}
        </li>
      ))}
    </ol>
  )
}

/** A time or a date stays on one line: "12:00 noon", "3:30 PM", "Oct 18" never break inside. */
function keepTogether(v: string): string {
  return v.replace(/(\d) (AM|PM|noon|midnight)\b/g, '$1\u00a0$2').replace(/\b([A-Z][a-z]{2}) (\d{1,2})\b/g, '$1\u00a0$2')
}

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === 'ok') return <CheckCircle2 size={18} aria-hidden="true" />
  if (tone === 'ask') return <Mail size={18} aria-hidden="true" />
  if (tone === 'warn' || tone === 'caution') return <CircleAlert size={18} aria-hidden="true" />
  return <Clock size={18} aria-hidden="true" />
}

export default function ChangeDialog({ request, drivers, onClose, returnTo }: {
  request: ChangeRequest | null
  /** The button that opened it, for focus to return to. */
  returnTo?: HTMLElement | null
  drivers: PortalDriver[]
  onClose: () => void
}) {
  const router = useRouter()
  /** A change was saved (or its email settled): the page reads its rides again. */
  const onSaved = () => router.refresh()
  const uid = useId()
  const titleId = `${uid}-title`
  const descId = `${uid}-desc`
  const [step, setStep] = useState<Step>('choose')
  const [value, setValue] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [question, setQuestion] = useState<QuestionWords | null>(null)
  const [changeId, setChangeId] = useState<string | null>(null)
  const [result, setResult] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  const [calendar, setCalendar] = useState<'done' | 'failed' | 'skipped' | 'retrying' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [flight, setFlight] = useState<{ state: 'idle' | 'loading' | 'found' | 'none'; time?: string | null; suggest?: string | null }>({ state: 'idle' })
  const headingRef = useRef<HTMLHeadingElement>(null)
  const fieldRef = useRef<HTMLInputElement & HTMLSelectElement>(null)

  // A new request starts at its first step.
  useEffect(() => {
    if (!request) return
    setPlan(null); setNotice(null); setQuestion(null); setResult(null); setCalendar(null); setError(null); setFieldError(null); setPending(false)
    setFlight({ state: 'idle' })
    if (request.mode === 'followup') {
      setChangeId(request.changeId)
      setQuestion({
        title: `Email ${request.guest} now?`,
        body: `${request.text}. ${request.guest} has not been emailed about it yet.`,
        summary: 'The email gives the ride as it now stands, with the driver\'s details.',
        send: `Email ${request.guest}`,
        skip: 'Don\'t email',
        skipNote: `MAPL Tours Jamaica gets an alert that ${request.guest} wasn't emailed.`,
      })
      setStep('question')
      return
    }
    setChangeId(null)
    setValue(request.kind === 'driver' ? '' : request.kind === 'time' ? fieldValue(request.current) : (request.current ?? ''))
    setStep('choose')
  }, [request])

  // Each step announces itself: focus moves to its heading.
  useEffect(() => {
    if (!request) return
    requestAnimationFrame(() => headingRef.current?.focus())
  }, [step, request])

  if (!request) return <Sheet open={false} onClose={onClose} labelledBy={titleId}>{null}</Sheet>

  const change = (): Record<string, unknown> | null => {
    if (request.mode !== 'change') return null
    if (request.kind === 'driver') return { kind: 'driver', driverId: value }
    if (request.kind === 'time') return { kind: 'time', leg: request.leg, at: value }
    return { kind: 'tour_time', time: value }
  }
  const bookingId = request.mode === 'change' ? request.bookingId : null

  async function review(e?: React.FormEvent) {
    e?.preventDefault()
    if (pending || request?.mode !== 'change') return
    if (!value) {
      setFieldError(request.kind === 'driver' ? 'Choose a driver.' : 'Choose a time.')
      fieldRef.current?.focus()
      return
    }
    setPending(true)
    setFieldError(null)
    try {
      const r = await call({ mode: 'plan', bookingId, change: change() })
      if (r.status === 200 && r.json.plan) {
        setPlan(r.json.plan as Plan)
        setNotice(null)
        setStep('confirm')
      } else {
        setFieldError(String(r.json.message ?? 'That change could not be checked. Try again.'))
        fieldRef.current?.focus()
      }
    } catch {
      setFieldError('The connection dropped. Check your signal and try again.')
    } finally {
      setPending(false)
    }
  }

  async function commit(email?: 'send' | 'skip') {
    if (!plan || pending) return
    setPending(true)
    setStep('saving')
    try {
      const r = await call({ mode: 'commit', bookingId, change: change(), planKey: plan.key, ...(email ? { email } : {}) })
      if (r.status === 200 && r.json.ok) {
        onSaved()
        setChangeId(String(r.json.changeId))
        setCalendar((r.json.calendar as 'done' | 'failed' | 'skipped') ?? null)
        if (r.json.question) {
          // The day-of email went just as this was saved: ask again.
          setQuestion(r.json.question as QuestionWords)
          setNotice(String(r.json.message ?? ''))
          setStep('question')
        } else {
          const outcome = String(r.json.outcome ?? '')
          setResult({ text: String(r.json.message ?? 'Saved.'), tone: outcome === 'failed' || outcome === 'pending' ? 'warn' : 'ok' })
          setStep('done')
        }
      } else if (r.status === 409 && r.json.plan) {
        // The ride moved since the plan: show what saving does now.
        setPlan(r.json.plan as Plan)
        setNotice(String(r.json.message ?? 'This ride changed while you were looking.'))
        setStep('confirm')
      } else {
        setError(String(r.json.message ?? 'Nothing was saved. Try again.'))
        setStep('error')
      }
    } catch {
      setError(CONNECTION)
      setStep('error')
    } finally {
      setPending(false)
    }
  }

  async function followUp(email: 'send' | 'skip') {
    if (!changeId || pending) return
    setPending(true)
    setStep('saving')
    try {
      const r = await call({ mode: 'email', changeId, email })
      onSaved()
      const outcome = String(r.json.outcome ?? '')
      setResult({ text: String(r.json.message ?? (r.json.ok ? 'Done.' : 'That did not go through. Try again.')), tone: r.json.ok && outcome !== 'failed' ? 'ok' : 'warn' })
      setStep('done')
    } catch {
      setError(CONNECTION)
      setStep('error')
    } finally {
      setPending(false)
    }
  }

  async function retryCalendar() {
    if (!changeId) return
    setCalendar('retrying')
    try {
      const r = await call({ mode: 'calendar', changeId })
      setCalendar(r.json.calendar === 'done' ? 'done' : 'failed')
    } catch {
      setCalendar('failed')
    }
  }

  async function checkFlight() {
    if (request?.mode !== 'change' || request.kind !== 'time' || !request.flight) return
    setFlight({ state: 'loading' })
    try {
      const day = (value || fieldValue(request.current)).slice(0, 10)
      const r = await fetch(`/api/driver/flight?flight=${encodeURIComponent(request.flight)}&date=${flightDate(`${day}T12:00:00Z`) ?? ''}&role=${request.leg}`)
      const st = (r.ok ? await r.json() : null) as FlightStatus | null
      const legInfo = st?.found ? (request.leg === 'departure' ? st.departure : st.arrival) : null
      const time = legInfo?.revisedLocal || legInfo?.scheduledLocal || null
      const mins = minutesOf(time)
      if (!time || mins === null) { setFlight({ state: 'none' }); return }
      setFlight({ state: 'found', time, suggest: request.leg === 'departure' ? before(day, mins, MIN_PICKUP_LEAD_MIN) : before(day, mins, 0) })
    } catch {
      setFlight({ state: 'none' })
    }
  }

  const close = () => { if (!pending) onClose() }
  const isFollow = request.mode === 'followup'
  const active = drivers.filter((d) => d.active)
  const currentName = request.mode === 'change' && request.kind === 'driver' ? request.current : null
  const chooseTitle = request.mode !== 'change' ? '' : request.kind === 'driver'
    ? (currentName ? 'Change the driver' : 'Assign a driver')
    : request.kind === 'time'
      ? (request.leg === 'departure' ? 'Change the hotel pickup' : 'Change the landing time')
      : (request.current ? 'Change the tour pickup time' : 'Set the tour pickup time')

  return (
    <Sheet open onClose={close} labelledBy={titleId} describedBy={descId} busy={pending || step === 'saving'} returnTo={returnTo}>
      <div className="fm-sheet-head">
        <p className="fm-eyebrow" id={descId}>{request.ref} · {request.guest}</p>
        {step !== 'saving' && (
          <button type="button" className="fm-x" onClick={close} aria-label="Close without saving">
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>

      {step === 'choose' && request.mode === 'change' && (
        <form className="fm-step" onSubmit={review} noValidate>
          <Steps at={0} withEmail={false} />
          <h2 className="fm-title" id={titleId} ref={headingRef} tabIndex={-1}>{chooseTitle}</h2>
          {request.kind === 'driver' && (
            <div className="fm-field">
              <label className="fm-label" htmlFor={`${uid}-driver`}>New driver</label>
              {currentName && <p className="fm-hint" id={`${uid}-driver-now`}>On it now: {currentName}</p>}
              <select
                id={`${uid}-driver`} ref={fieldRef as React.Ref<HTMLSelectElement>} className="fm-input"
                value={value} onChange={(e) => { setValue(e.target.value); setFieldError(null) }}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={[currentName ? `${uid}-driver-now` : '', fieldError ? `${uid}-err` : ''].filter(Boolean).join(' ') || undefined}
              >
                <option value="">Choose a driver</option>
                {active.map((d) => (
                  <option key={d.id} value={d.id} disabled={d.name === currentName}>
                    {d.name} · {d.colour} {d.vehicle} · {d.plate}{d.name === currentName ? ' (on it now)' : ''}
                  </option>
                ))}
              </select>
              {!active.length && <p className="fm-hint">No working drivers are saved. Add one on the Drivers tab.</p>}
            </div>
          )}
          {request.kind === 'time' && (
            <div className="fm-field">
              <label className="fm-label" htmlFor={`${uid}-at`}>{request.leg === 'departure' ? 'New hotel pickup' : 'New landing time'}</label>
              <p className="fm-hint" id={`${uid}-at-hint`}>Jamaica time. Now {clockOf(fieldValue(request.current))} on {new Date(`${fieldValue(request.current)}:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })}.</p>
              <input
                id={`${uid}-at`} ref={fieldRef as React.Ref<HTMLInputElement>} className="fm-input" type="datetime-local" step={300}
                value={value} onChange={(e) => { setValue(e.target.value); setFieldError(null) }}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={`${uid}-at-hint${fieldError ? ` ${uid}-err` : ''}`}
              />
              {request.flight && (
                <div className="fm-flight" aria-live="polite">
                  {flight.state === 'idle' && (
                    <button type="button" className="fm-btn fm-btn-quiet" onClick={checkFlight}>
                      <PlaneTakeoff size={16} aria-hidden="true" />Check flight {request.flight}
                    </button>
                  )}
                  {flight.state === 'loading' && <p className="fm-hint">Checking flight {request.flight}…</p>}
                  {flight.state === 'none' && <p className="fm-hint">No live time for flight {request.flight} right now. Check it with the guest.</p>}
                  {flight.state === 'found' && flight.suggest && (
                    <div className="fm-flight-found">
                      <p className="fm-flight-line">Airline: flight {request.flight} {request.leg === 'departure' ? 'departs' : 'lands'} {flight.time}</p>
                      {flight.suggest !== value && (
                        <button type="button" className="fm-btn fm-btn-quiet" onClick={() => { setValue(flight.suggest as string); setFieldError(null) }}>
                          {request.leg === 'departure'
                            ? `Use ${clockOf(flight.suggest)}, ${LEAD_TEXT} before the flight`
                            : `Use ${clockOf(flight.suggest)}, the landing time`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {request.kind === 'tour_time' && (
            <div className="fm-field">
              <label className="fm-label" htmlFor={`${uid}-tt`}>Pickup time</label>
              <p className="fm-hint" id={`${uid}-tt-hint`}>Jamaica time, on the day of the tour{request.day ? ` (${new Date(`${request.day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })})` : ''}.</p>
              <input
                id={`${uid}-tt`} ref={fieldRef as React.Ref<HTMLInputElement>} className="fm-input" type="time" step={300}
                value={value} onChange={(e) => { setValue(e.target.value); setFieldError(null) }}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={`${uid}-tt-hint${fieldError ? ` ${uid}-err` : ''}`}
              />
            </div>
          )}
          {fieldError && <p className="fm-error" id={`${uid}-err`} role="alert">{fieldError}</p>}
          <div className="fm-actions">
            <button type="submit" className="fm-btn fm-btn-primary" aria-disabled={pending || undefined}>
              {pending ? 'Checking…' : 'Review change'}
            </button>
            <button type="button" className="fm-btn fm-btn-ghost" onClick={close}>Cancel</button>
          </div>
          <p className="fm-foot">Nothing is saved or sent until you confirm on the next screen.</p>
        </form>
      )}

      {step === 'confirm' && plan && (
        <div className="fm-step">
          <Steps at={1} withEmail={!!plan.words.question} />
          <h2 className="fm-title" id={titleId} ref={headingRef} tabIndex={-1}>{plan.words.title}</h2>
          {notice && <p className="fm-notice" role="status">{notice}</p>}
          <dl className="fm-diff">
            <div className="fm-diff-row fm-diff-was">
              <dt>{plan.words.from.label}</dt>
              <dd>{keepTogether(plan.words.from.value)}</dd>
            </div>
            <div className="fm-diff-row fm-diff-new">
              <dt>{plan.words.to.label}</dt>
              <dd>{keepTogether(plan.words.to.value)}</dd>
            </div>
          </dl>
          {plan.words.rides.length > 0 && (
            <section className="fm-block" aria-labelledby={`${uid}-who`}>
              <h3 className="fm-subtitle" id={`${uid}-who`}>When {request.guest} hears</h3>
              <ul className="fm-rides">
                {plan.words.rides.map((r) => (
                  <li key={r.leg} className={`fm-ride fm-tone-${r.tone}`}>
                    <ToneIcon tone={r.tone} />
                    <div>
                      <p className="fm-ride-head">{r.label} · <span className="fm-num fm-nowrap">{keepTogether(r.when)}</span></p>
                      <p className="fm-ride-note">{r.note}</p>
                      {r.next && <p className="fm-ride-next">{r.next}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {plan.words.notes.map((n) => (
            <p key={n.text} className={`fm-callout fm-tone-${n.tone}`}><ToneIcon tone={n.tone} /><span>{n.text}</span></p>
          ))}
          <div className="fm-actions">
            <button
              type="button" className="fm-btn fm-btn-primary" aria-disabled={pending || undefined}
              onClick={() => { if (plan.words.question) { setQuestion(plan.words.question); setStep('question') } else void commit() }}
            >
              {plan.words.primary}
            </button>
            <button type="button" className="fm-btn fm-btn-ghost" onClick={() => setStep('choose')}>Back</button>
          </div>
        </div>
      )}

      {step === 'question' && question && (
        <div className="fm-step">
          {!isFollow && !changeId && <Steps at={2} withEmail />}
          <h2 className="fm-title" id={titleId} ref={headingRef} tabIndex={-1}>{question.title}</h2>
          {notice && <p className="fm-notice" role="status">{notice}</p>}
          <p className="fm-body">{question.body}</p>
          <p className="fm-callout fm-tone-muted"><Mail size={18} aria-hidden="true" /><span>{question.summary}</span></p>
          <div className="fm-actions">
            <button type="button" className="fm-btn fm-btn-primary" aria-disabled={pending || undefined} onClick={() => (isFollow || changeId ? followUp('send') : commit('send'))}>
              {question.send}
            </button>
            <button type="button" className="fm-btn fm-btn-outline" aria-disabled={pending || undefined} aria-describedby={`${uid}-skip`} onClick={() => (isFollow || changeId ? followUp('skip') : commit('skip'))}>
              {question.skip}
            </button>
            <p className="fm-foot" id={`${uid}-skip`}>{question.skipNote}</p>
            {!isFollow && !changeId && <button type="button" className="fm-btn fm-btn-ghost" onClick={() => setStep('confirm')}>Back</button>}
          </div>
        </div>
      )}

      {step === 'saving' && (
        <div className="fm-step" role="status" aria-live="polite">
          <h2 className="fm-title" id={titleId} ref={headingRef} tabIndex={-1}>Saving</h2>
          <p className="fm-body fm-saving"><span className="fm-spinner" aria-hidden="true" />Saving the change and telling everyone who needs to know.</p>
        </div>
      )}

      {step === 'done' && result && (
        <div className="fm-step">
          <h2 className="fm-title" id={titleId} ref={headingRef} tabIndex={-1}>{result.tone === 'ok' ? 'Done' : 'Saved, with one thing to do'}</h2>
          <p className={`fm-callout fm-tone-${result.tone === 'ok' ? 'ok' : 'warn'}`} role="status">
            {result.tone === 'ok' ? <CheckCircle2 size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
            <span>{result.text}</span>
          </p>
          {(calendar === 'failed' || calendar === 'retrying') && (
            <p className="fm-callout fm-tone-warn">
              <CircleAlert size={18} aria-hidden="true" />
              <span>
                The bookings calendar did not update.{' '}
                <button type="button" className="fm-link" onClick={retryCalendar} aria-disabled={calendar === 'retrying' || undefined}>
                  {calendar === 'retrying' ? 'Trying again…' : 'Try again'}
                </button>
              </span>
            </p>
          )}
          <div className="fm-actions">
            <button type="button" className="fm-btn fm-btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="fm-step">
          <h2 className="fm-title" id={titleId} ref={headingRef} tabIndex={-1}>Not saved</h2>
          <p className="fm-callout fm-tone-warn" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{error}</span></p>
          <div className="fm-actions">
            {request.mode === 'change' && <button type="button" className="fm-btn fm-btn-primary" onClick={() => setStep('choose')}>Start again</button>}
            <button type="button" className={`fm-btn ${request.mode === 'change' ? 'fm-btn-ghost' : 'fm-btn-primary'}`} onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
