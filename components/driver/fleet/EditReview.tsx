'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, Clock, Mail } from 'lucide-react'
import type { EditWords } from '@/lib/driver-edit-words'
import type { QuestionWords, Tone } from '@/lib/dispatch-change-words'

/**
 * The review of a saved driver's new details (Nov 25 2026), shared by the
 * driver portal's Drivers tab (a fleet manager, /api/driver/drivers) and the
 * admin Drivers page (/api/admin/drivers). The same steps as a ride change
 * (ChangeDialog):
 *
 *   check     what changes, every ride still ahead that carries the old
 *             details, and when each guest hears; the server worked it out
 *             (mode 'plan') and wrote nothing
 *   email     only where a guest already has the old details, or no email
 *             can reach them in time: email them, or save without (the
 *             office is told)
 *   saving    one request saves the driver and the rides and sends (mode
 *             'commit'); the server refuses a plan that moved under it
 *   done      what happened, in a sentence or two
 */

export type EditPlan = { key: string; driverId: string; decide: string[]; words: EditWords }
export type ReviewStep = 'confirm' | 'question' | 'saving' | 'done' | 'error'
type Json = Record<string, unknown>

const CONNECTION = 'The connection dropped before an answer came back. Reload the page to see whether it saved.'

async function patch(endpoint: string, body: Json): Promise<{ status: number; json: Json }> {
  const res = await fetch(endpoint, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Json }
}

const said = (j: Json, fallback: string) => String(j.message ?? j.error ?? fallback)

/**
 * The review's state. `start` asks for the plan; a refusal comes back to the
 * form (with the field it is about), never as a step.
 */
export function useEditReview(endpoint: string, hooks: { onSaved: () => void; onFieldError: (field: string, message: string) => void }) {
  const [step, setStep] = useState<ReviewStep | null>(null)
  const [plan, setPlan] = useState<EditPlan | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [result, setResult] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const body = useRef<Json | null>(null)
  const hooksRef = useRef(hooks)
  hooksRef.current = hooks

  const reset = useCallback(() => {
    setStep(null); setPlan(null); setNotice(null); setResult(null); setError(null); setPending(false)
    body.current = null
  }, [])

  async function start(fields: Json): Promise<{ ok: true } | { ok: false; message: string; field?: string }> {
    if (pending) return { ok: false, message: 'Checking…' }
    setPending(true)
    try {
      const r = await patch(endpoint, { ...fields, mode: 'plan' })
      if (r.status === 200 && r.json.plan) {
        body.current = fields
        setPlan(r.json.plan as EditPlan)
        setNotice(null); setResult(null); setError(null)
        setStep('confirm')
        return { ok: true }
      }
      return { ok: false, message: said(r.json, 'That change could not be checked. Try again.'), field: typeof r.json.field === 'string' ? r.json.field : undefined }
    } catch {
      return { ok: false, message: 'The connection dropped. Check your signal and try again.' }
    } finally {
      setPending(false)
    }
  }

  async function commit(notify?: 'send' | 'skip') {
    if (!plan || !body.current || pending) return
    setPending(true)
    setStep('saving')
    try {
      const r = await patch(endpoint, { ...body.current, mode: 'commit', planKey: plan.key, ...(notify ? { notify } : {}) })
      if (r.status === 200 && r.json.ok) {
        hooksRef.current.onSaved()
        setResult({ text: said(r.json, 'Saved.'), tone: r.json.warn ? 'warn' : 'ok' })
        setStep('done')
      } else if (r.status === 409 && r.json.plan) {
        // Something moved since the plan: show what saving does now.
        const next = r.json.plan as EditPlan
        setPlan(next)
        setNotice(said(r.json, 'Something changed while you were looking.'))
        setStep(r.json.code === 'decide' && next.words.question ? 'question' : 'confirm')
      } else if (typeof r.json.field === 'string') {
        // A clash with another driver, or a field that cannot change: back to the form, at the field.
        const field = r.json.field
        const message = said(r.json, 'That did not save.')
        reset()
        hooksRef.current.onFieldError(field, message)
      } else {
        setError(said(r.json, 'Nothing was saved. Try again.'))
        setStep('error')
      }
    } catch {
      setError(CONNECTION)
      setStep('error')
    } finally {
      setPending(false)
    }
  }

  return { step, setStep, plan, notice, result, error, pending, start, commit, reset }
}

export type EditReviewState = ReturnType<typeof useEditReview>

/** Where the person is: change the details, check what saving does, then (only when a guest needs it now) email. */
export function EditSteps({ at, withEmail }: { at: 0 | 1 | 2; withEmail: boolean }) {
  const names = withEmail ? ['Change', 'Check', 'Email'] : ['Change', 'Check']
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

/** A time or a date stays on one line: "12:00 noon", "3:30 PM", "Dec 12" never break inside. */
function keepTogether(v: string): string {
  return v.replace(/(\d) (AM|PM|noon|midnight)\b/g, '$1 $2').replace(/\b([A-Z][a-z]{2}) (\d{1,2})\b/g, '$1 $2')
}

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === 'ok') return <CheckCircle2 size={18} aria-hidden="true" />
  if (tone === 'ask') return <Mail size={18} aria-hidden="true" />
  if (tone === 'warn' || tone === 'caution') return <CircleAlert size={18} aria-hidden="true" />
  return <Clock size={18} aria-hidden="true" />
}

/**
 * The review's steps inside a Sheet. `onBack` from the check step returns to
 * the form (the portal's own step, or the admin page's form behind the sheet).
 */
export function EditReviewSteps({ review, titleId, onBack, onClose }: {
  review: EditReviewState
  titleId: string
  onBack: () => void
  onClose: () => void
}) {
  const { step, plan, notice, result, error, pending } = review
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Each step announces itself: focus moves to its heading.
  useEffect(() => {
    if (step) requestAnimationFrame(() => headingRef.current?.focus())
  }, [step])
  if (!step) return null
  const words = plan?.words
  const question: QuestionWords | null = words?.question ?? null
  const ridesCount = words?.rides.length ?? 0

  return (
    <>
      {step === 'confirm' && words && (
        <div className="fm-step">
          <EditSteps at={1} withEmail={!!question} />
          <h2 className="fm-title" id={titleId} ref={headingRef} tabIndex={-1}>{words.title}</h2>
          {notice && <p className="fm-notice" role="status">{notice}</p>}
          <dl className="fm-edits">
            {words.diff.map((r) => (
              <div className="fm-edit" key={r.label}>
                <dt className="fm-subtitle">{r.label}</dt>
                <dd className="fm-diff">
                  <p className="fm-diff-row fm-diff-was"><span className="fm-diff-tag">Now</span><span className="fm-diff-val">{r.from}</span></p>
                  <p className="fm-diff-row fm-diff-new"><span className="fm-diff-tag">New</span><span className="fm-diff-val">{r.to}</span></p>
                </dd>
              </div>
            ))}
          </dl>
          {ridesCount > 0 && (
            <section className="fm-block" aria-labelledby={`${titleId}-rides`}>
              <h3 className="fm-subtitle" id={`${titleId}-rides`}>{ridesCount === 1 ? 'The ride that changes' : `The ${ridesCount} rides that change`}</h3>
              {words.ridesIntro && <p className="fm-hint">{words.ridesIntro}</p>}
              <ul className="fm-rides">
                {words.rides.flatMap((r) => r.lines.map((l) => (
                  <li key={`${r.bookingId}-${l.leg ?? 'tour'}`} className={`fm-ride fm-tone-${l.tone}`}>
                    <ToneIcon tone={l.tone} />
                    <div>
                      <p className="fm-ride-head"><span className="fm-num">{r.title}</span></p>
                      <p className="fm-ride-sub">{l.label}{l.when ? <> · <span className="fm-num fm-nowrap">{keepTogether(l.when)}</span></> : null}</p>
                      <p className="fm-ride-note">{l.note}</p>
                      {l.next && <p className="fm-ride-next">{l.next}</p>}
                    </div>
                  </li>
                )))}
              </ul>
            </section>
          )}
          {words.notes.map((n) => (
            <p key={n.text} className={`fm-callout fm-tone-${n.tone}`}><ToneIcon tone={n.tone} /><span>{n.text}</span></p>
          ))}
          <div className="fm-actions">
            <button
              type="button" className="fm-btn fm-btn-primary" aria-disabled={pending || undefined}
              onClick={() => { if (question) review.setStep('question'); else void review.commit() }}
            >
              {words.primary}
            </button>
            <button type="button" className="fm-btn fm-btn-ghost" onClick={onBack}>Back</button>
          </div>
        </div>
      )}

      {step === 'question' && question && (
        <div className="fm-step">
          <EditSteps at={2} withEmail />
          <h2 className="fm-title" id={titleId} ref={headingRef} tabIndex={-1}>{question.title}</h2>
          {notice && <p className="fm-notice" role="status">{notice}</p>}
          <p className="fm-body">{keepTogether(question.body)}</p>
          <p className="fm-callout fm-tone-muted"><Mail size={18} aria-hidden="true" /><span>{question.summary}</span></p>
          <div className="fm-actions">
            <button type="button" className="fm-btn fm-btn-primary" aria-disabled={pending || undefined} onClick={() => void review.commit('send')}>
              {question.send}
            </button>
            <button type="button" className="fm-btn fm-btn-outline" aria-disabled={pending || undefined} aria-describedby={`${titleId}-skip`} onClick={() => void review.commit('skip')}>
              {question.skip}
            </button>
            <p className="fm-foot" id={`${titleId}-skip`}>{question.skipNote}</p>
            <button type="button" className="fm-btn fm-btn-ghost" onClick={() => review.setStep('confirm')}>Back</button>
          </div>
        </div>
      )}

      {step === 'saving' && (
        <div className="fm-step" role="status" aria-live="polite">
          <h2 className="fm-title" id={titleId} ref={headingRef} tabIndex={-1}>Saving</h2>
          <p className="fm-body fm-saving"><span className="fm-spinner" aria-hidden="true" />Saving the new details and telling everyone who needs to know.</p>
        </div>
      )}

      {step === 'done' && result && (
        <div className="fm-step">
          <h2 className="fm-title" id={titleId} ref={headingRef} tabIndex={-1}>{result.tone === 'ok' ? 'Done' : 'Saved, with one thing to do'}</h2>
          <p className={`fm-callout fm-tone-${result.tone}`} role="status">
            {result.tone === 'ok' ? <CheckCircle2 size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
            <span>{result.text}</span>
          </p>
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
            <button type="button" className="fm-btn fm-btn-primary" onClick={onBack}>Start again</button>
            <button type="button" className="fm-btn fm-btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </>
  )
}
