'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RouteText } from '@/components/ui/Arrow'
import { bookingRef, count, legTime, money, plural, stamp, tripDay } from '@/lib/admin-format'
import { CANCELLATION_WINDOW_HOURS } from '@/lib/refund-pricing'

/**
 * Approve or decline refund requests.
 *
 * Every decision goes through /api/admin/refunds/[id], which re-checks the
 * admin allowlist server-side: this component is convenience, never the
 * security boundary. The request it sends ({ action, reason }) and how it
 * reads the answer are unchanged from before the Nov 13 2026 redesign.
 *
 * Approving moves real money, so it opens a confirmation that says exactly
 * where the money goes (the card, the gift card, or both, as the route splits
 * it) with the figure on the button. Declining asks for an optional reason,
 * which is emailed to the traveler word for word. Each confirmation's heading
 * takes focus when it opens, so a second key press can never confirm by
 * accident; Back returns focus to the button that opened it.
 *
 * Money and time follow lib/admin-format. Styles: the .adm classes in
 * app/globals.css.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

/**
 * What approving sends back, and where, exactly as the decision route computes
 * it: the stored split, or all cash for rows quoted before gift cards existed.
 * Exported for tests/unit/refund-queue.spec.tsx.
 */
export function refundSplit(row: Row): { total: number; cash: number; gift: number } {
  const totalCents = Math.round(Number(row.refund_quoted_amount ?? 0) * 100)
  const giftCents = Math.round(Number(row.refund_quoted_gift ?? 0) * 100)
  const cashCents = row.refund_quoted_cash != null
    ? Math.round(Number(row.refund_quoted_cash) * 100)
    : totalCents - (Number.isFinite(giftCents) ? giftCents : 0)
  return { total: totalCents / 100, cash: cashCents / 100, gift: Number.isFinite(giftCents) ? giftCents / 100 : 0 }
}

/** The sentence the owner confirms: where every dollar goes. */
export function approveLine(s: { cash: number; gift: number }): string {
  const parts: string[] = []
  if (s.cash > 0) parts.push(`sends ${money(s.cash)} back to the traveler’s card`)
  if (s.gift > 0) parts.push(`puts ${money(s.gift)} back on their gift card`)
  return `This ${parts.join(' and ')}, and cancels the trip. It cannot be undone.`
}

/**
 * When the traveler asked, measured the way the policy measures it: from the
 * booking, against the cancellation window. Null when either time is missing.
 * Exported for tests/unit/refund-queue.spec.tsx.
 */
export function askedLine(row: Row): string | null {
  const booked = row.paid_at ?? row.created_at
  if (!booked || !row.refund_requested_at) return null
  const ms = new Date(row.refund_requested_at).getTime() - new Date(booked).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const h = ms / 3_600_000
  const when = h < 1 ? 'within an hour of booking' : h < 48 ? `${plural(Math.floor(h), 'hour')} after booking` : `${plural(Math.floor(h / 24), 'day')} after booking`
  const side = h < CANCELLATION_WINDOW_HOURS ? 'inside' : 'after'
  return `Asked ${when}, ${side} the ${CANCELLATION_WINDOW_HOURS}-hour window.`
}

function guestName(row: Row): string {
  return [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Traveler'
}

/** One line per booked item: what, and when in Jamaica time. */
function ItemLine({ i }: { i: Row }) {
  if (i.item_type === 'transfer' || i.airport) {
    const airport = i.airport ?? 'MBJ'
    const place = i.hotel ?? i.destination ?? 'hotel'
    const homeOnly = !i.arrival_at && i.departure_at
    const route = homeOnly ? `${place} → ${airport}` : `${airport} → ${place}`
    const when = i.arrival_at ? `Lands ${legTime(i.arrival_at)}` : i.departure_at ? `Hotel pickup ${legTime(i.departure_at)}` : ''
    return <li><RouteText text={route} />{i.trip_type === 'round_trip' ? ' · Round trip' : ''}{when ? <> · <span className="adm-nowrap">{when}</span></> : null}</li>
  }
  return <li>{[i.title ?? 'Tour', tripDay(i.date), i.travelers ? count(i.travelers, 'traveler') : null].filter(Boolean).join(' · ')}</li>
}

function RequestCard({ row, onDecided }: { row: Row; onDecided: (message: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState<null | 'approve' | 'decline'>(null)
  const [reason, setReason] = useState('')
  // A refund whose cash left but whose gift credit did not is decided: no
  // second decision is offered, only what to do by hand.
  const [settled, setSettled] = useState(false)
  // Decided here: nothing is offered again while the list refreshes.
  const [finished, setFinished] = useState<string | null>(null)
  // The confirmation eases out before it closes (instantly under reduced motion).
  const [leaving, setLeaving] = useState(false)
  const uid = useId()
  const askHeading = useRef<HTMLHeadingElement>(null)
  const approveBtn = useRef<HTMLButtonElement>(null)
  const declineBtn = useRef<HTMLButtonElement>(null)
  const opener = useRef<'approve' | 'decline' | null>(null)

  const state = row.refund_state as string
  const pending = state === 'requested' && !settled && !finished
  const split = refundSplit(row)
  const name = guestName(row)
  const items = (row.booking_items ?? []) as Row[]
  const asked = askedLine(row)

  // The confirmation's heading takes focus as it opens; closing it hands
  // focus back to the button that opened it.
  useEffect(() => {
    if (asking) askHeading.current?.focus()
    else if (opener.current) (opener.current === 'approve' ? approveBtn : declineBtn).current?.focus()
  }, [asking])

  function open(kind: 'approve' | 'decline') { opener.current = kind; setError(null); setAsking(kind) }
  function back() {
    if (busy || leaving) return
    setError(null)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setAsking(null)
    else setLeaving(true)
  }
  // The leave animation's end closes it; Escape works like Back.
  const askProps = {
    onAnimationEnd: (e: React.AnimationEvent<HTMLElement>) => { if (leaving && e.target === e.currentTarget) { setLeaving(false); setAsking(null) } },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => { if (e.key === 'Escape') { e.preventDefault(); back() } },
  }

  async function decide(action: 'approve' | 'decline') {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/refunds/${row.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: action === 'decline' ? reason : undefined }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (body.cashRefunded) setSettled(true)
        setError(body.message ?? body.error ?? 'Something went wrong.')
        return
      }
      const message = action === 'approve' ? `Refund of ${money(split.total)} approved for ${name}.` : `${name}’s request declined.`
      setFinished(message)
      onDecided(message)
    } catch {
      setError('Network error. Nothing was decided; try again.')
    } finally {
      setBusy(false)
    }
  }

  const outcome = state === 'approved'
    ? { kicker: null, amount: money(row.refund_amount ?? split.total), quiet: false, badge: { cls: 'adm-badge--ok', text: 'Refunded' } }
    : state === 'declined'
      ? { kicker: 'Asked for', amount: money(split.total), quiet: true, badge: { cls: 'adm-badge--bad', text: 'Declined' } }
      : { kicker: 'To refund', amount: money(split.total), quiet: false, badge: null }

  return (
    <li className="adm-card adm-rf">
      <div className="adm-card-in">
        <div className="adm-rf-head">
          <div className="adm-rf-who">
            <h3 className="adm-h3">{name}</h3>
            {items.length > 0 && <ul className="adm-rf-items">{items.map((i, n) => <ItemLine key={i.id ?? n} i={i} />)}</ul>}
            <p className="adm-meta">
              <span className="adm-nowrap">{bookingRef(row.id)}</span> · <span className="adm-nowrap">Requested {stamp(row.refund_requested_at)}</span>
              {row.refund_decided_at ? <> · <span className="adm-nowrap">Decided {stamp(row.refund_decided_at)}</span></> : null}
            </p>
            {asked && <p className="adm-rf-asked">{asked}</p>}
          </div>
          <div className="adm-rf-sum">
            {outcome.badge && <span className={`adm-badge ${outcome.badge.cls}`}>{outcome.badge.text}</span>}
            {outcome.kicker && <p className="adm-kicker">{outcome.kicker}</p>}
            <p className={outcome.quiet ? 'adm-rf-amount adm-rf-amount--quiet' : 'adm-rf-amount'}>
              {outcome.amount} <span className="adm-rf-cur">{String(row.currency ?? 'usd').toUpperCase()}</span>
            </p>
            <p className="adm-meta">of {money(row.total_paid)} paid</p>
          </div>
        </div>

        {pending && split.gift > 0 && (
          <p className="adm-rf-split">
            {split.cash > 0 ? <>{money(split.cash)} back to the card · </> : null}{money(split.gift)} back to the gift card
          </p>
        )}

        {row.refund_decline_reason && (
          <p className="adm-block"><span className="adm-block-label">Reason given</span>{row.refund_decline_reason}</p>
        )}

        <div className="adm-contact">
          {row.email ? <a className="adm-inline-link" href={`mailto:${row.email}`}>{row.email}</a> : <span className="adm-meta">No email</span>}
          {row.phone ? <a className="adm-inline-link adm-tnum" href={`tel:${String(row.phone).replace(/[^\d+]/g, '')}`}>{row.phone}</a> : null}
        </div>

        {error && !(pending && asking) && <p role="alert" className="adm-error adm-rf-error">{error}</p>}
        {finished && <p className="adm-note adm-note--ok adm-enter">{finished}</p>}

        {pending && !asking && (
          <div className="adm-actions adm-rf-actions">
            {split.total > 0
              ? <button ref={approveBtn} type="button" className="adm-btn adm-btn--primary" onClick={() => open('approve')}>Approve refund</button>
              : <p className="adm-help adm-help--warn">No refund amount was stored. Refund by hand in Stripe.</p>}
            <button ref={declineBtn} type="button" className="adm-btn" onClick={() => open('decline')}>Decline</button>
          </div>
        )}

        {pending && asking === 'approve' && (
          <section aria-labelledby={`${uid}-ask`} className={leaving ? 'adm-ask adm-leave adm-rf-ask' : 'adm-ask adm-enter adm-rf-ask'} {...askProps}>
            <h4 id={`${uid}-ask`} ref={askHeading} tabIndex={-1} className="adm-h4 adm-h4--ask">Refund {money(split.total)} to {name}?</h4>
            <p className="adm-block">{approveLine(split)}</p>
            {error && <p role="alert" className="adm-error">{error}</p>}
            <div className="adm-actions">
              {/* aria-disabled, not disabled: a button that disables under the
                  keyboard drops focus to the page body mid-refund. */}
              <button type="button" className="adm-btn adm-btn--ok" aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={() => void decide('approve')}>
                {busy ? 'Refunding…' : `Yes, refund ${money(split.total)}`}
              </button>
              <button type="button" className="adm-btn" aria-disabled={busy || undefined} onClick={back}>Back</button>
            </div>
          </section>
        )}

        {pending && asking === 'decline' && (
          <section aria-labelledby={`${uid}-ask`} className={leaving ? 'adm-ask adm-leave adm-rf-ask' : 'adm-ask adm-enter adm-rf-ask'} {...askProps}>
            <h4 id={`${uid}-ask`} ref={askHeading} tabIndex={-1} className="adm-h4 adm-h4--ask">Decline {name}&rsquo;s request?</h4>
            <div>
              <label htmlFor={`${uid}-reason`} className="adm-label">Reason for the traveler (optional)</label>
              <textarea
                id={`${uid}-reason`} className="adm-input adm-textarea" rows={3} value={reason}
                onChange={(e) => setReason(e.target.value)} aria-describedby={`${uid}-reason-help`}
              />
              <p id={`${uid}-reason-help`} className="adm-help">Emailed to them word for word. Nothing is refunded.</p>
            </div>
            {error && <p role="alert" className="adm-error">{error}</p>}
            <div className="adm-actions">
              <button type="button" className="adm-btn adm-btn--bad" aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={() => void decide('decline')}>
                {busy ? 'Declining…' : 'Yes, decline'}
              </button>
              <button type="button" className="adm-btn" aria-disabled={busy || undefined} onClick={back}>Back</button>
            </div>
          </section>
        )}
      </div>
    </li>
  )
}

const DECIDED_PAGE = 20

export default function RefundQueue({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const [done, setDone] = useState<string | null>(null)
  const [decidedLimit, setDecidedLimit] = useState(DECIDED_PAGE)
  const waitingHeading = useRef<HTMLHeadingElement>(null)
  const pending = rows.filter((r) => r.refund_state === 'requested')
  const decided = rows.filter((r) => r.refund_state !== 'requested')
  const approved = decided.filter((r) => r.refund_state === 'approved')
  const toRefund = pending.reduce((s, r) => s + refundSplit(r).total, 0)
  const refunded = approved.reduce((s, r) => s + Number(r.refund_amount ?? refundSplit(r).total), 0)

  function onDecided(message: string) {
    setDone(message)
    router.refresh()
    // The decided card moves to the list below; the reader stays at the queue.
    waitingHeading.current?.focus()
  }

  const stats = [
    { label: 'Awaiting decision', value: String(pending.length), sub: `${money(toRefund)} USD to refund` },
    { label: 'Refunded', value: String(approved.length), sub: `${money(refunded)} USD sent back` },
    { label: 'Declined', value: String(decided.length - approved.length), sub: `of ${decided.length} decided` },
  ]

  return (
    <div className="adm">
      <h1 className="adm-h1">Refunds</h1>
      <p className="adm-lead">
        Travelers ask to cancel; no money moves until someone here approves it. Approving refunds the amount quoted when they asked,
        honoured even if the 48-hour window has since closed.
      </p>

      <dl className="adm-tiles">
        {stats.map((s) => (
          <div key={s.label} className="adm-tile">
            <dt className="adm-kicker">{s.label}</dt>
            <dd className="adm-tile-v">{s.value}</dd>
            <dd className="adm-tile-sub">{s.sub}</dd>
          </div>
        ))}
      </dl>

      <p role="status" className={done ? 'adm-note adm-note--ok adm-enter' : 'visually-hidden'}>{done ?? ''}</p>

      <section className="adm-section" aria-labelledby="rf-waiting">
        <h2 id="rf-waiting" ref={waitingHeading} tabIndex={-1} className="adm-h2">Awaiting decision</h2>
        {pending.length === 0 ? (
          <p className="adm-empty">Nothing waiting. 🇯🇲</p>
        ) : (
          <ol className="adm-list">{pending.map((r) => <RequestCard key={r.id} row={r} onDecided={onDecided} />)}</ol>
        )}
      </section>

      {decided.length > 0 && (
        <section className="adm-section" aria-labelledby="rf-decided">
          <h2 id="rf-decided" className="adm-h2">Decided</h2>
          <ol className="adm-list">{decided.slice(0, decidedLimit).map((r) => <RequestCard key={r.id} row={r} onDecided={onDecided} />)}</ol>
          {decided.length > decidedLimit && (
            <button type="button" className="adm-btn adm-more" onClick={() => setDecidedLimit((n) => n + DECIDED_PAGE)}>
              Show {Math.min(DECIDED_PAGE, decided.length - decidedLimit)} more
            </button>
          )}
        </section>
      )}
      {rows.length >= 200 && <p className="adm-meta adm-rf-cap">Showing the latest 200 requests.</p>}
    </div>
  )
}
