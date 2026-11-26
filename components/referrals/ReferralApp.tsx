'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReferrerView, CodeView, EarningView, PayoutView } from '@/lib/referrals/ledger'
import type { TermsSection } from '@/lib/referrals/terms'
import type { PayoutAccountInput } from '@/lib/referrals/payout-account'
import { codeProblem, codeProblemMessage, dayText, normalizeReferralCode, shortDay, usd, percentText, LABEL_MAX_LENGTH, REAUTH_MAX_AGE_MINUTES } from '@/lib/referrals/rules'
import { createClient } from '@/lib/supabase/client'
import PayoutAccountForm, { type SaveOutcome } from './PayoutAccountForm'

/**
 * The referral page (/referrals): first the terms (one short step), then the
 * page a referrer comes back to: what changed, the next payout, their codes
 * with what each has done, the bookings made with them, the payouts, and the
 * Wise account they are paid into. Every figure comes from the server's view
 * (lib/referrals/ledger), the same one the admin page and the payout run use.
 *
 * One filled button per card. Every action answers in place, under the
 * control that asked, and keeps the keyboard where it was or moves it to
 * what the action made.
 */

interface Props {
  initialView: ReferrerView
  needsTerms: boolean
  terms: TermsSection[]
  /** "A round trip to Negril for 2 is $194 ..." from the real prices, with this referrer's rate. */
  example: string
  lastSignInAt: string | null
  provider: 'google' | 'email'
}

type Api = { ok: boolean; status: number; json: Record<string, unknown> }

async function call(path: string, body: Record<string, unknown>): Promise<Api> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, json }
  } catch {
    return { ok: false, status: 0, json: { error: 'No connection. Check your internet and try again.' } }
  }
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there'

export default function ReferralApp(props: Props) {
  const [view, setView] = useState(props.initialView)
  const [needsTerms, setNeedsTerms] = useState(props.needsTerms)
  const codeInput = useRef<HTMLInputElement>(null)

  // An answer from the server: the fresh view, or, if it could not be read, the page again.
  const take = useCallback((r: Api): boolean => {
    if (r.status === 401) { window.location.assign('/referrals/login'); return false }
    if (r.ok && r.json.view) { setView(r.json.view as ReferrerView); return true }
    if (r.ok) { window.location.reload(); return true }
    return false
  }, [])

  if (needsTerms) {
    return (
      <Welcome view={view} terms={props.terms} example={props.example} onAccepted={(r) => {
        if (take(r)) {
          setNeedsTerms(false)
          requestAnimationFrame(() => { window.scrollTo({ top: 0 }); codeInput.current?.focus() })
        }
      }} />
    )
  }
  return <Dashboard view={view} take={take} terms={props.terms} example={props.example} lastSignInAt={props.lastSignInAt} provider={props.provider} codeInput={codeInput} />
}

/* ── The first step: who you are, and the terms ──────────────────────── */

function Welcome({ view, terms, example, onAccepted }: { view: ReferrerView; terms: TermsSection[]; example: string; onAccepted: (r: Api) => void }) {
  const [name, setName] = useState(view.me.name)
  const [business, setBusiness] = useState(view.me.business ?? '')
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState<{ field: string | null; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const agreeRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) { setError({ field: 'name', message: 'Type your name.' }); nameRef.current?.focus(); return }
    if (!agree) { setError({ field: 'accept', message: 'Tick the box to agree to the referral terms.' }); agreeRef.current?.focus(); return }
    setBusy(true)
    setError(null)
    const r = await call('/api/referrals', { action: 'accept_terms', name, business, accept: true })
    setBusy(false)
    if (r.ok) { onAccepted(r); return }
    setError({ field: (r.json.field as string) ?? null, message: (r.json.error as string) ?? 'That did not save. Try again in a moment.' })
  }

  return (
    <>
      {view.me.business && <p className="ref-eyebrow">{view.me.business}</p>}
      <h1 className="ref-h1">Welcome, {firstName(view.me.name)}.</h1>
      <p className="ref-lead">
        Send your guests to MAPL Tours Jamaica. They save {view.me.discount}% on airport rides and tours with your code, and you earn {percentText(view.me.percent)} of what they pay.
      </p>

      <section className="ref-card" aria-labelledby="ref-setup-title">
        <div className="ref-card-head"><h2 className="ref-card-title" id="ref-setup-title">Set up in four steps</h2><span className="ref-card-meta">1 of 4 done</span></div>
        <div className="ref-card-body">
          <ol className="ref-steps">
            <Step done title="Sign in" note={`You are signed in as ${view.me.email}.`} n={1} />
            <Step now title="Agree to the terms" note="Below. It takes a minute." n={2} />
            <Step title="Create your first code" note="Your guests type it at checkout." n={3} />
            <Step title="Add your Wise account" note="So we can pay you every Monday." n={4} />
          </ol>
        </div>
      </section>

      <section className="ref-card" aria-labelledby="ref-terms-title">
        <div className="ref-card-head"><h2 className="ref-card-title" id="ref-terms-title">Your details and the terms</h2></div>
        <form className="ref-card-body" onSubmit={submit} noValidate>
          <p className="ref-card-lead">{example}</p>
          <div className="ref-pair">
            <div className="ref-field">
              <label className="ref-label" htmlFor="ref-name">Your name</label>
              <input ref={nameRef} id="ref-name" className="ref-input" type="text" autoComplete="name" value={name} maxLength={120}
                onChange={(e) => setName(e.target.value)} aria-invalid={error?.field === 'name' || undefined} aria-describedby={error?.field === 'name' ? 'ref-welcome-err' : undefined} />
            </div>
            <div className="ref-field">
              <label className="ref-label" htmlFor="ref-business">Business <span className="ref-opt">(optional)</span></label>
              <input id="ref-business" className="ref-input" type="text" autoComplete="organization" value={business} maxLength={120} onChange={(e) => setBusiness(e.target.value)} />
            </div>
          </div>
          <details className="ref-details">
            <summary>Read the referral terms</summary>
            <TermsList terms={terms} />
          </details>
          <label className="ref-check" htmlFor="ref-agree">
            <input ref={agreeRef} id="ref-agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)}
              aria-invalid={error?.field === 'accept' || undefined} aria-describedby={error?.field === 'accept' ? 'ref-welcome-err' : undefined} />
            <span>I agree to the referral terms.</span>
          </label>
          <p id="ref-welcome-err" className={error ? 'ref-status ref-status--error' : 'ref-status'} role="alert">{error?.message ?? ''}</p>
          <div className="ref-actions ref-actions--stack" style={{ marginTop: 'var(--sp-4)' }}>
            <button type="submit" className="btn-primary ref-btn" aria-disabled={busy || undefined} data-busy={busy ? '' : undefined}>
              {busy ? 'Saving' : 'Agree and continue'}
            </button>
          </div>
        </form>
      </section>
      <p className="ref-hint">Questions? Write to <a href="mailto:contact@mapltours.com">contact@mapltours.com</a>.</p>
    </>
  )
}

function Step({ n, title, note, done, now }: { n: number; title: string; note: string; done?: boolean; now?: boolean }) {
  return (
    <li className={`ref-step${done ? ' ref-step--done' : ''}${now ? ' ref-step--now' : ''}`} aria-current={now ? 'step' : undefined}>
      <span className="ref-step-mark" aria-hidden="true">{done ? '✓' : n}</span>
      <span className="ref-step-title">{title}<span className="sr-only">{done ? ', done' : now ? ', next' : ''}</span></span>
      <span className="ref-step-note">{note}</span>
    </li>
  )
}

function TermsList({ terms }: { terms: TermsSection[] }) {
  return (
    <ol className="ref-terms">
      {terms.map((t) => (
        <li key={t.title}><h3>{t.title}</h3><p>{t.body}</p></li>
      ))}
    </ol>
  )
}

/* ── The page a referrer comes back to ───────────────────────────────── */

function Dashboard({ view, take, terms, example, lastSignInAt, provider, codeInput }: {
  view: ReferrerView
  take: (r: Api) => boolean
  terms: TermsSection[]
  example: string
  lastSignInAt: string | null
  provider: 'google' | 'email'
  codeInput: React.RefObject<HTMLInputElement>
}) {
  const live = view.codes.filter((c) => c.state !== 'retired')
  const setupLeft = !live.length || !view.account
  return (
    <>
      {view.me.business && <p className="ref-eyebrow">{view.me.business}</p>}
      <h1 className="ref-h1">Your referrals</h1>
      {view.latest
        ? <p className="ref-latest">{view.latest}</p>
        : <p className="ref-lead">Your guests save {view.me.discount}% with your codes, and you earn {percentText(view.me.percent)} of what they pay.</p>}
      {view.me.status === 'paused' && (
        <p className="ref-note" role="status">MAPL Tours Jamaica has paused your codes and payouts for now. Write to contact@mapltours.com to ask why.</p>
      )}
      {setupLeft && <SetupLeft view={view} />}
      <Tiles view={view} />
      <Codes view={view} take={take} codeInput={codeInput} />
      <Bookings view={view} />
      <Payouts view={view} />
      <Account view={view} take={take} lastSignInAt={lastSignInAt} provider={provider} />
      <section className="ref-card" aria-labelledby="ref-how-title">
        <div className="ref-card-head"><h2 className="ref-card-title" id="ref-how-title">How it works</h2></div>
        <div className="ref-card-body">
          <p className="ref-card-lead">{example}</p>
          <details className="ref-details">
            <summary>The referral terms</summary>
            <TermsList terms={terms} />
          </details>
          <p className="ref-hint" style={{ marginTop: 'var(--sp-3)' }}>Questions? Write to <a href="mailto:contact@mapltours.com">contact@mapltours.com</a>.</p>
        </div>
      </section>
    </>
  )
}

function SetupLeft({ view }: { view: ReferrerView }) {
  const hasCode = view.codes.some((c) => c.state !== 'retired')
  const done = 2 + (hasCode ? 1 : 0) + (view.account ? 1 : 0)
  return (
    <section className="ref-card" aria-labelledby="ref-left-title">
      <div className="ref-card-head"><h2 className="ref-card-title" id="ref-left-title">Finish setting up</h2><span className="ref-card-meta">{done} of 4 done</span></div>
      <div className="ref-card-body">
        <ol className="ref-steps">
          <Step done n={1} title="Sign in" note={`As ${view.me.email}.`} />
          <Step done n={2} title="Agree to the terms" note="Done." />
          <Step done={hasCode} now={!hasCode} n={3} title="Create your first code" note={hasCode ? 'Done.' : 'Below, under Your codes.'} />
          <Step done={!!view.account} now={hasCode && !view.account} n={4} title="Add your Wise account" note={view.account ? 'Done.' : 'Below, under Where we pay you. Until then, what you earn waits for you.'} />
        </ol>
      </div>
    </section>
  )
}

function Tiles({ view }: { view: ReferrerView }) {
  const n = view.next
  const nextNote =
    n.block === 'paused' ? 'Paused by MAPL Tours Jamaica'
    : n.block === 'no_account' ? 'Add your Wise account to be paid'
    : n.block === 'account_hold' ? `New account: payouts start ${shortDay(n.holdUntilDay ?? n.day, view.today)}`
    : n.block === 'below_minimum' ? 'Under US$1: it waits for the next payout'
    : n.amountCents > 0 ? dayText(n.day, { weekday: true, todayYmd: view.today })
    : `Nothing due yet. Payouts go on Mondays.`
  return (
    <dl aria-label="Your figures" className="ref-tiles">
      <div className="ref-tile ref-tile--next">
        <dt className="ref-tile-label">Next payout</dt>
        <dd className="ref-tile-value">{usd(n.amountCents)}</dd>
        <dd className="ref-tile-note">{nextNote}</dd>
      </div>
      <div className="ref-tile">
        <dt className="ref-tile-label">Not paid yet</dt>
        <dd className="ref-tile-value">{usd(view.totals.waitingCents)}</dd>
        <dd className="ref-tile-note">Including the next payout</dd>
      </div>
      <div className="ref-tile">
        <dt className="ref-tile-label">Paid to you</dt>
        <dd className="ref-tile-value">{usd(view.totals.paidCents)}</dd>
        <dd className="ref-tile-note">Since you joined</dd>
      </div>
      <div className="ref-tile">
        <dt className="ref-tile-label">Bookings</dt>
        <dd className="ref-tile-value">{view.totals.bookings}</dd>
        <dd className="ref-tile-note">Counted so far</dd>
      </div>
    </dl>
  )
}

/* ── Codes ───────────────────────────────────────────────────────────── */

function stateChip(c: CodeView) {
  switch (c.state) {
    case 'active': return <span className="ref-chip ref-chip--good">Live</span>
    case 'paused': return <span className="ref-chip ref-chip--off">Paused</span>
    case 'held': return <span className="ref-chip ref-chip--wait">Paused by MAPL</span>
    case 'retired': return <span className="ref-chip ref-chip--off">Retired</span>
  }
}

function Codes({ view, take, codeInput }: { view: ReferrerView; take: (r: Api) => boolean; codeInput: React.RefObject<HTMLInputElement> }) {
  const live = view.codes.filter((c) => c.state !== 'retired')
  const retired = view.codes.filter((c) => c.state === 'retired')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmRetire, setConfirmRetire] = useState<string | null>(null)
  const [rowStatus, setRowStatus] = useState<{ id: string; text: string; error?: boolean } | null>(null)
  // A retired code leaves the list (and its row's status line with it), so its answer is said here, under the list.
  const [cardStatus, setCardStatus] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({})
  const focusSoon = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus())

  async function act(c: CodeView, action: 'pause' | 'resume' | 'retire') {
    if (busyId) return
    setBusyId(c.id)
    setRowStatus(null)
    setCardStatus(null)
    const r = await call('/api/referrals', { action: 'code_status', id: c.id, action2: action })
    setBusyId(null)
    setConfirmRetire(null)
    const ok = take(r)
    if (ok && action === 'retire') {
      setCardStatus(`${c.code} is retired. Nobody can use it now. Bookings already made with it still count.`)
      focusSoon('ref-codes-title')
      return
    }
    if (ok) {
      setRowStatus({ id: c.id, text: action === 'pause' ? `${c.code} is paused. Guests cannot use it until you resume it.` : `${c.code} works again.` })
    } else {
      setRowStatus({ id: c.id, text: (r.json.error as string) ?? 'That did not save. Try again.', error: true })
    }
    // Focus stays with the control that was used (it is the same button after a pause or a resume).
    focusSoon(action === 'retire' ? `ref-retire-${c.id}` : `ref-toggle-${c.id}`)
  }

  async function copy(c: CodeView, what: 'code' | 'message') {
    const text = what === 'code' ? c.code : `Save ${view.me.discount}% on MAPL Tours Jamaica airport rides and tours with my code ${c.code} at mapltours.com`
    try {
      await navigator.clipboard.writeText(text)
      setRowStatus({ id: c.id, text: what === 'code' ? `${c.code} copied.` : 'Message copied. Paste it wherever you share with guests.' })
    } catch {
      setRowStatus({ id: c.id, text: `Copy did not work here. The code is ${c.code}.`, error: true })
    }
  }

  // The new code's row takes the keyboard once the fresh view has it.
  const made = (code: string) => setFresh(code)
  useEffect(() => {
    if (!fresh) return
    const c = view.codes.find((x) => x.code === fresh)
    if (c) rowRefs.current[c.id]?.focus()
  }, [fresh, view.codes])

  return (
    <section className="ref-card" aria-labelledby="ref-codes-title" id="codes">
      <div className="ref-card-head">
        <h2 className="ref-card-title" id="ref-codes-title" tabIndex={-1}>Your codes</h2>
        <span className="ref-card-meta">{live.length} of {view.maxCodes}</span>
      </div>
      <div className="ref-card-body">
        {live.length > 0 ? (
          <ul className="ref-codes">
            {live.map((c) => (
              <li key={c.id} className={`ref-code${fresh === c.code ? ' ref-code--new' : ''}`} tabIndex={-1} ref={(el) => { rowRefs.current[c.id] = el }} aria-labelledby={`ref-code-${c.id}`}>
                <span className="ref-code-name" id={`ref-code-${c.id}`}>{c.code}</span>
                {stateChip(c)}
                {c.label && <span className="ref-code-label">{c.label}</span>}
                <p className="ref-code-stats">
                  {c.bookings === 0 ? 'No bookings yet.' : `${c.bookings} booking${c.bookings === 1 ? '' : 's'} · guests saved ${usd(c.guestsSavedCents)} · you earned ${usd(c.earnedCents)}`}
                </p>
                <div className="ref-code-actions">
                  <button type="button" className="ref-text-btn" onClick={() => copy(c, 'code')}>Copy code<span className="sr-only"> {c.code}</span></button>
                  <button type="button" className="ref-text-btn" onClick={() => copy(c, 'message')}>Copy message<span className="sr-only"> with {c.code}</span></button>
                  {confirmRetire !== c.id && (
                    // Managing the code: one group, so Pause or Resume and Retire wrap together, never apart.
                    <span className="ref-manage">
                      {(c.state === 'active' || c.state === 'paused') && (
                        <button type="button" id={`ref-toggle-${c.id}`} className="ref-text-btn ref-text-btn--quiet" onClick={() => act(c, c.state === 'active' ? 'pause' : 'resume')} aria-disabled={busyId ? true : undefined}>
                          {c.state === 'active' ? 'Pause' : 'Resume'}<span className="sr-only"> {c.code}</span>
                        </button>
                      )}
                      <button type="button" id={`ref-retire-${c.id}`} className="ref-text-btn ref-text-btn--quiet" onClick={() => { setConfirmRetire(c.id); setRowStatus(null); focusSoon(`ref-keep-${c.id}`) }}>Retire<span className="sr-only"> {c.code}</span></button>
                    </span>
                  )}
                </div>
                {confirmRetire === c.id && (
                  // The question in place of Pause and Retire, the safe answer focused first.
                  <div className="ref-retire-ask" role="group" aria-labelledby={`ref-retire-q-${c.id}`}>
                    <p className="ref-hint" id={`ref-retire-q-${c.id}`}>Retire {c.code} for good? Nobody can use it again.</p>
                    <button type="button" className="ref-text-btn ref-text-btn--danger" onClick={() => act(c, 'retire')} aria-disabled={busyId ? true : undefined}>Yes, retire it</button>
                    <button type="button" id={`ref-keep-${c.id}`} className="ref-text-btn" onClick={() => { setConfirmRetire(null); focusSoon(`ref-retire-${c.id}`) }}>Keep it</button>
                  </div>
                )}
                <p className={rowStatus?.id === c.id && rowStatus.error ? 'ref-status ref-status--error' : 'ref-status'} role="status" style={{ gridColumn: '1 / -1' }}>
                  {rowStatus?.id === c.id ? rowStatus.text : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="ref-status" role="status">{cardStatus ?? ''}</p>
        <NewCode view={view} take={take} codeInput={codeInput} onMade={made} />
        {retired.length > 0 && (
          <details className="ref-retired">
            <summary>Retired codes ({retired.length})</summary>
            <ul className="ref-list" style={{ marginTop: 'var(--sp-2)' }}>
              {retired.map((c) => (
                <li key={c.id} className="ref-item">
                  <span className="ref-item-what">{c.code}</span>
                  <span className="ref-item-amount">{usd(c.earnedCents)}</span>
                  <span className="ref-item-sub">{c.bookings} booking{c.bookings === 1 ? '' : 's'}{c.retiredAt ? ` · retired ${shortDay(c.retiredAt.slice(0, 10), view.today)}` : ''}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  )
}

function NewCode({ view, take, codeInput, onMade }: { view: ReferrerView; take: (r: Api) => boolean; codeInput: React.RefObject<HTMLInputElement>; onMade: (code: string) => void }) {
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [check, setCheck] = useState<{ code: string; available: boolean; message: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const norm = normalizeReferralCode(code)
  const live = view.codes.filter((c) => c.state !== 'retired').length
  const full = live >= view.maxCodes
  const paused = view.me.status !== 'active'

  // Is it free? Asked a moment after typing stops, only for a code the rules allow.
  useEffect(() => {
    setCheck(null)
    if (!norm || codeProblem(norm)) return
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/referrals?check=${encodeURIComponent(norm)}`, { credentials: 'same-origin' })
        if (res.ok) setCheck(await res.json())
      } catch { /* the create answers anyway */ }
    }, 450)
    return () => clearTimeout(t)
  }, [norm])

  const problem = norm && codeProblem(norm)
  const live_msg = error ?? (problem ? codeProblemMessage(problem) : check && check.code === norm && !check.available ? check.message : null)
  const good = !live_msg && check && check.code === norm && check.available ? `${norm} is free.` : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setDone(null)
    const p = codeProblem(norm)
    if (p) { setError(codeProblemMessage(p)); codeInput.current?.focus(); return }
    setBusy(true)
    setError(null)
    const r = await call('/api/referrals', { action: 'create_code', code: norm, label })
    setBusy(false)
    if (r.ok) {
      take(r)
      setCode('')
      setLabel('')
      setCheck(null)
      setDone((r.json.message as string) ?? `${norm} is ready.`)
      onMade(norm)
      return
    }
    if (r.status === 401) { take(r); return }
    setError((r.json.error as string) ?? 'That code did not save. Try again.')
    codeInput.current?.focus()
  }

  if (paused) return <p className="ref-note ref-note--plain" style={{ marginTop: 'var(--sp-4)' }}>New codes cannot be made while your referrals are paused.</p>
  if (full) return <p className="ref-note ref-note--plain" style={{ marginTop: 'var(--sp-4)' }}>You have {view.maxCodes} codes, the most you can hold. Retire one to make room for another.</p>

  return (
    // No border of its own: the last code row's hairline above it is the one rule between the list and the form.
    <form className="ref-new" onSubmit={submit} noValidate aria-label="Create a code">
      <p className="ref-card-ask">{live ? 'Make another code' : 'Create your first code'}</p>
      <p className="ref-hint" style={{ marginBottom: 'var(--sp-3)' }}>Make one for each place you share it, like your welcome book or WhatsApp, to see which one works best.</p>
      <div className="ref-new-row">
        <div className="ref-field">
          <label className="ref-label" htmlFor="ref-new-code">Code</label>
          <input ref={codeInput} id="ref-new-code" className="ref-input ref-input--code" type="text" value={code} maxLength={24}
            autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="For example, VILLA5"
            onChange={(e) => { setCode(e.target.value); setError(null); setDone(null) }}
            aria-invalid={live_msg ? true : undefined} aria-describedby="ref-new-code-hint ref-new-code-msg" />
          <p className="ref-hint" id="ref-new-code-hint">4 to 16 letters and numbers.</p>
        </div>
        <div className="ref-field">
          <label className="ref-label" htmlFor="ref-new-label">Where you&rsquo;ll share it <span className="ref-opt">(optional)</span></label>
          <input id="ref-new-label" className="ref-input" type="text" value={label} maxLength={LABEL_MAX_LENGTH} placeholder="For example, welcome book"
            onChange={(e) => setLabel(e.target.value)} />
          <p className="ref-hint">Only you see this.</p>
        </div>
      </div>
      <p id="ref-new-code-msg" className={live_msg ? 'ref-error' : good ? 'ref-good' : 'ref-status'} role="status">{live_msg ?? good ?? done ?? ''}</p>
      {!live && view.suggestions.length > 0 && !code && (
        <p className="ref-suggest">
          Ideas:
          {view.suggestions.map((s) => (
            <button key={s} type="button" onClick={() => { setCode(s); codeInput.current?.focus() }} aria-label={`Use ${s}`}>{s}</button>
          ))}
        </p>
      )}
      <div className="ref-actions ref-actions--stack" style={{ marginTop: 'var(--sp-3)' }}>
        <button type="submit" className="btn-primary ref-btn" aria-disabled={busy || !!problem || undefined} data-busy={busy ? '' : undefined}>
          {busy ? 'Creating' : 'Create code'}
        </button>
      </div>
    </form>
  )
}

/* ── Bookings and payouts ────────────────────────────────────────────── */

function earningState(e: EarningView, today: string): { chip: React.ReactNode; text: string } {
  switch (e.status) {
    case 'upcoming': return { chip: <span className="ref-chip ref-chip--wait">After the trip</span>, text: e.payDay ? `Paid ${dayText(e.payDay, { weekday: true, todayYmd: today })}, once the trip has happened.` : 'Paid once the trip has happened.' }
    case 'ready': return { chip: <span className="ref-chip ref-chip--good">Ready</span>, text: e.payDay ? `In the payout on ${dayText(e.payDay, { weekday: true, todayYmd: today })}.` : 'In the next payout.' }
    case 'sending': return { chip: <span className="ref-chip ref-chip--wait">Being paid</span>, text: 'On its way to your Wise account.' }
    case 'paid': return { chip: <span className="ref-chip ref-chip--good">Paid</span>, text: e.paidDay ? `Paid ${dayText(e.paidDay, { todayYmd: today })}.` : 'Paid.' }
    case 'held': return { chip: <span className="ref-chip ref-chip--wait">On hold</span>, text: 'The guest asked to cancel. If the trip goes ahead, it counts.' }
    case 'cancelled': return { chip: <span className="ref-chip ref-chip--off">Cancelled</span>, text: 'The booking was refunded, so there is no commission.' }
    case 'void': return { chip: <span className="ref-chip ref-chip--off">Not counted</span>, text: e.note ? (/[.!?]$/.test(e.note) ? e.note : `${e.note}.`) : 'MAPL Tours Jamaica did not count this booking.' }
    case 'check': return { chip: <span className="ref-chip ref-chip--wait">Being checked</span>, text: 'We are checking this booking. Nothing is lost.' }
  }
}

function Bookings({ view }: { view: ReferrerView }) {
  const [all, setAll] = useState(false)
  const list = all ? view.earnings : view.earnings.slice(0, 10)
  return (
    <section className="ref-card" aria-labelledby="ref-bookings-title" id="bookings">
      <div className="ref-card-head">
        <h2 className="ref-card-title" id="ref-bookings-title">Bookings with your codes</h2>
        {view.earnings.length > 0 && <span className="ref-card-meta">{view.earnings.length}</span>}
      </div>
      <div className="ref-card-body">
        {list.length === 0 ? (
          <p className="ref-empty">No bookings yet. When a guest books with one of your codes, it shows here with what you earn and when it is paid.</p>
        ) : (
          <ul className="ref-list">
            {list.map((e) => {
              const s = earningState(e, view.today)
              return (
                <li key={e.id} className="ref-item">
                  <span className="ref-item-what">{e.what}</span>
                  {e.status === 'cancelled' || e.status === 'void' ? (
                    // Not earned: the figure stays for reference, struck and quiet, and said in words to a screen reader.
                    <span className="ref-item-amount ref-item-amount--none"><s>{usd(e.commissionCents)}</s><span className="sr-only"> not earned</span></span>
                  ) : (
                    <span className="ref-item-amount">{usd(e.commissionCents)}</span>
                  )}
                  <span className="ref-item-sub">{e.days} · {e.code} · guest paid {usd(e.guestPaidCents)} · {e.capped ? 'less than ' : ''}{percentText(e.percent)}{e.capped ? ' (the guest also used a reward)' : ''}</span>
                  <span className="ref-item-state">{s.chip}<span>{s.text}</span></span>
                </li>
              )
            })}
          </ul>
        )}
        {!all && view.earnings.length > 10 && (
          <div className="ref-more"><button type="button" className="ref-text-btn" onClick={() => setAll(true)}>Show all {view.earnings.length} bookings</button></div>
        )}
      </div>
    </section>
  )
}

function payoutChip(p: PayoutView) {
  switch (p.state) {
    case 'sent': return <span className="ref-chip ref-chip--good">Sent</span>
    case 'on_its_way': return <span className="ref-chip ref-chip--wait">On its way</span>
    case 'needs_attention': return <span className="ref-chip ref-chip--wait">Being checked</span>
    case 'returned': return <span className="ref-chip ref-chip--bad">Came back</span>
    case 'failed': return <span className="ref-chip ref-chip--off">Not sent</span>
  }
}

function Payouts({ view }: { view: ReferrerView }) {
  return (
    <section className="ref-card" aria-labelledby="ref-payouts-title" id="payouts">
      <div className="ref-card-head"><h2 className="ref-card-title" id="ref-payouts-title">Payouts</h2></div>
      <div className="ref-card-body">
        {view.payouts.length === 0 ? (
          <p className="ref-empty">No payouts yet. We pay every Monday for trips that have happened, free, into your Wise account.</p>
        ) : (
          <ul className="ref-list">
            {view.payouts.map((p) => (
              <li key={p.id} className="ref-item">
                <span className="ref-item-what">{dayText(p.day, { todayYmd: view.today })}</span>
                <span className="ref-item-amount">{usd(p.amountCents)}</span>
                <span className="ref-item-sub">{p.trips} trip{p.trips === 1 ? '' : 's'} · Wise account ending {p.last4}</span>
                <span className="ref-item-state">
                  {payoutChip(p)}
                  <span>{p.state === 'returned' ? 'Wise sent it back. We will be in touch.' : p.state === 'needs_attention' ? 'We are checking it with Wise.' : p.state === 'on_its_way' ? 'Wise usually delivers within seconds.' : 'In your Wise account.'}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/* ── Where we pay you ────────────────────────────────────────────────── */

function Account({ view, take, lastSignInAt, provider }: { view: ReferrerView; take: (r: Api) => boolean; lastSignInAt: string | null; provider: 'google' | 'email' }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  // The server's word that the sign-in is too old, which outranks the clock here.
  const [reauth, setReauth] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const a = view.account
  // A sign-in older than the server allows (with five minutes to spare) asks for a fresh one first.
  const fresh = useMemo(() => {
    const t = Date.parse(String(lastSignInAt ?? ''))
    return Number.isFinite(t) && Date.now() - t < (REAUTH_MAX_AGE_MINUTES - 5) * 60_000
  }, [lastSignInAt, open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function signInAgain() {
    const supabase = createClient()
    try { await supabase.auth.signOut() } catch { /* carry on */ }
    if (provider === 'google') {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent('/referrals')}`, queryParams: { prompt: 'select_account' } },
      })
    } else {
      window.location.assign('/login?redirect=%2Freferrals')
    }
  }

  async function save(values: PayoutAccountInput): Promise<SaveOutcome> {
    const r = await call('/api/referrals/payout-account', { ...values, currentLast4: a?.last4 ?? null })
    if (r.ok) {
      take(r)
      setOpen(false)
      setSaved(r.json.kind === 'changed'
        ? 'Saved. Your payouts now go to the new account, from three days after today. We emailed you about the change.'
        : 'Saved. We emailed you to confirm it. Payouts to it start three days from now.')
      requestAnimationFrame(() => titleRef.current?.focus())
      return { ok: true }
    }
    if (r.status === 401 && !r.json.reauth) { window.location.assign('/referrals/login'); return { ok: false } }
    if (r.json.reauth) { setReauth(true); return { ok: false, reauth: true, message: (r.json.error as string) ?? null } }
    return { ok: false, errors: (r.json.errors as SaveOutcome['errors']) ?? null, message: (r.json.error as string) ?? null }
  }

  return (
    <section className="ref-card" aria-labelledby="ref-account-title" id="account">
      <div className="ref-card-head"><h2 className="ref-card-title" id="ref-account-title" ref={titleRef} tabIndex={-1}>Where we pay you</h2></div>
      <div className="ref-card-body">
        {a ? (
          <div className="ref-account">
            <span className="ref-account-main">Wise account ending {a.last4}</span>
            <span className="ref-account-sub">{a.holder} · {a.legalType === 'BUSINESS' ? "a business's account" : "a person's account"} · US dollars</span>
          </div>
        ) : !open && (
          <>
            <p className="ref-card-ask">Add your Wise account</p>
            <p className="ref-card-lead">We pay you every Monday into a Wise US-dollar account. Wise charges nothing for it, and the money arrives in seconds. No Wise account yet? You can open one free at wise.com, then add US dollars.</p>
          </>
        )}
        {a?.onHold && a.holdUntil && (
          <p className="ref-note" role="status">For your safety, payouts to this account start {dayText(a.holdUntil.slice(0, 10), { weekday: true, todayYmd: view.today })}.</p>
        )}
        <p className="ref-status" role="status">{saved ?? ''}</p>
        {open ? (
          fresh && !reauth ? (
            <PayoutAccountForm defaultHolder={a?.holder ?? view.me.name} changing={!!a} onSave={save} onCancel={() => setOpen(false)} />
          ) : (
            <>
              <p className="ref-note ref-note--plain">For your safety, sign in again before you change where you are paid. It takes a few seconds.</p>
              <div className="ref-actions ref-actions--stack">
                <button type="button" className="btn-primary ref-btn" onClick={signInAgain}>Sign in again</button>
                <button type="button" className="ref-text-btn" onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </>
          )
        ) : (
          <div className="ref-actions ref-actions--stack">
            {a
              ? <button type="button" className="btn-outline ref-btn" onClick={() => { setOpen(true); setSaved(null) }}>Change account</button>
              : <button type="button" className="btn-primary ref-btn" onClick={() => { setOpen(true); setSaved(null) }}>Add your Wise account</button>}
          </div>
        )}
      </div>
    </section>
  )
}
