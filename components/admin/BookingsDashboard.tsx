'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Search } from 'lucide-react'
import { nextStep, progress } from '@/lib/dispatch'
import { AI_ASSISTANT_GROUP, aiAssistantLabel, attributionLabel, browserLabel, firstTouchLabel } from '@/lib/attribution'
import Arrow, { RouteText } from '@/components/ui/Arrow'
import Segmented from '@/components/admin/Segmented'
import { ageLabel, bookingRef, clockTime, count, jamaicaToday, legTime, money, plural, stamp, tripDay } from '@/lib/admin-format'

/**
 * Client dashboard for the admin bookings page. The parent server component
 * has already confirmed the caller is an admin and fetched the rows with the
 * service role, so this component only renders.
 *
 * It leads with what an operator schedules around: each card opens with the
 * day of the trip, then the guest and the route; upcoming trips list the
 * soonest first, split into the next 14 days and later, and one field finds a
 * guest by name, email, phone, reference, hotel or flight. A row shows only
 * what differs between rows: no "Paid" badge in the paid view (only
 * "Refunded"), no Ride or Tour badge once the list is filtered to one kind.
 *
 * Money and time follow lib/admin-format: trip times in the guest's Jamaica
 * wall-clock, our own events on the owner's Toronto clock with the zone named,
 * never this year's year, and the currency code once per block.
 *
 * Styles: the .adm classes in app/globals.css.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any


/**
 * The first moment of service, as its Jamaica wall-clock value: a ride's
 * landing (or its pickup for the flight home when that is its only leg), a
 * tour's day. Null when nothing names a day.
 */
export function firstService(b: Row): { day: string; at: string | null; kind: 'lands' | 'pickup' | 'tour' } | null {
  const legs: { day: string; at: string | null; kind: 'lands' | 'pickup' | 'tour' }[] = []
  for (const i of (b.booking_items ?? []) as Row[]) {
    if (i.arrival_at) legs.push({ day: String(i.arrival_at).slice(0, 10), at: i.arrival_at, kind: 'lands' })
    else if (i.departure_at) legs.push({ day: String(i.departure_at).slice(0, 10), at: i.departure_at, kind: 'pickup' })
    else if (i.date) legs.push({ day: String(i.date).slice(0, 10), at: null, kind: 'tour' })
  }
  return legs.filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.day)).sort((a, b) => (a.at ?? a.day).localeCompare(b.at ?? b.day))[0] ?? null
}

/** A ride's two ends in travel order: a ride with only the leg home starts at the hotel. */
function rideEnds(i: Row): [string, string] {
  const airport = i?.airport ?? 'MBJ'
  const place = i?.hotel ?? i?.destination ?? ''
  return !i?.arrival_at && i?.departure_at ? [place, airport] : [airport, place]
}
function rideKind(i: Row): string {
  if (i?.trip_type === 'round_trip') return 'Round trip'
  return !i?.arrival_at && i?.departure_at ? 'One way to the airport' : 'One way from the airport'
}
/** A line's charge as checkout recorded it. line_total is authoritative; older rows multiply back. */
function lineTotal(i: Row): number {
  return i.line_total != null ? Number(i.line_total) : Number(i.price_per_person ?? 0) * Number(i.travelers ?? 1)
}

/** Everything a search can match: reference, guest, contact, places, flights. */
function haystack(b: Row): string {
  const items = (b.booking_items ?? []) as Row[]
  return [
    bookingRef(b.id), b.id, b.first_name, b.last_name, b.email, b.phone, b.pickup, b.dropoff,
    ...items.flatMap((i) => [i.hotel, i.destination, i.title, i.arrival_flight, i.departure_flight]),
  ].filter(Boolean).join(' ').toLowerCase()
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  if (v == null || v === '') return null
  return (
    <div className="adm-fact">
      <dt className="adm-fact-k">{k}</dt>
      <dd className="adm-fact-v">{v}</dd>
    </div>
  )
}

function MoneyRow({ k, v, em, total }: { k: string; v: React.ReactNode; em?: boolean; total?: boolean }) {
  return (
    <div className={total ? 'adm-money-row adm-money-row--total' : 'adm-money-row'}>
      <dt>{k}</dt>
      <dd className={em ? 'adm-money-v adm-money-v--em' : 'adm-money-v'}>{v}</dd>
    </div>
  )
}

function RideItem({ i }: { i: Row }) {
  const [from, to] = rideEnds(i)
  return (
    <>
      <p className="adm-bk-item-title">{from}<Arrow place="between" />{to}</p>
      <p className="adm-bk-item-line">{[i.zone ? `Zone ${i.zone}` : null, rideKind(i), count(i.passengers ?? i.travelers ?? 1, 'passenger')].filter(Boolean).join(' · ')}</p>
      {i.arrival_at || i.arrival_flight ? (
        <p className="adm-bk-item-line">Lands {legTime(i.arrival_at) || '(no time given)'}{i.arrival_flight ? ` · flight ${i.arrival_flight}` : ''}</p>
      ) : null}
      {i.departure_at || i.departure_flight ? (
        <p className="adm-bk-item-line">Hotel pickup {legTime(i.departure_at) || '(no time given)'}{i.departure_flight ? ` · flight home ${i.departure_flight}` : ''}</p>
      ) : null}
    </>
  )
}

function TourItem({ i }: { i: Row }) {
  return (
    <>
      <p className="adm-bk-item-title">{i.title}</p>
      <p className="adm-bk-item-line">{[i.destination, tripDay(i.date), count(i.travelers ?? 1, 'traveler')].filter(Boolean).join(' · ')}</p>
    </>
  )
}

// Exported for tests/unit/attribution-first-touch-dashboard.spec.tsx.
export function BookingCard({ b, variant, open, onToggle, showType = true }: {
  b: Row
  variant: 'abandoned' | 'paid'
  open: boolean
  onToggle: () => void
  /** The Ride or Tour badge; off once the list is filtered to one kind. */
  showType?: boolean
}) {
  const cardRef = useRef<HTMLLIElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const uid = useId()
  const id = { panel: `${uid}panel`, name: `${uid}name`, sub: `${uid}sub`, meta: `${uid}meta`, side: `${uid}side` }

  // Once the card has opened, bring the whole of it into view.
  useEffect(() => {
    const card = cardRef.current
    const panel = panelRef.current
    if (!open || !card || !panel) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let done = false
    const reveal = () => {
      if (done) return
      done = true
      card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' })
    }
    const onEnd = (e: TransitionEvent) => { if (e.target === panel && e.propertyName === 'grid-template-rows') reveal() }
    panel.addEventListener('transitionend', onEnd)
    // Reduced motion has no transition to wait for; otherwise a fallback in case none ends.
    const timer = window.setTimeout(reveal, reduce ? 0 : 400)
    return () => { panel.removeEventListener('transitionend', onEnd); window.clearTimeout(timer) }
  }, [open])

  const isTransfer = b.booking_type === 'transfer'
  const currency = String(b.currency ?? 'usd').toUpperCase()
  const items = (b.booking_items ?? []) as Row[]
  const refunded = b.status === 'refunded'
  const item0 = items[0]
  const customerName = [b.first_name, b.last_name].filter(Boolean).join(' ') || '(no name)'
  const routeSummary = isTransfer
    ? rideEnds(item0).join(' → ')
    : items.length === 1 ? (item0?.title ?? 'Tour') : `${items.length} experiences`
  const paxSummary = isTransfer ? count(item0?.passengers ?? item0?.travelers ?? 1, 'passenger') : count(item0?.travelers ?? 1, 'traveler')
  const first = firstService(b)
  const firstDate = first ? new Date(`${first.day}T12:00:00Z`) : null
  const when = first?.at
    ? `${first.kind === 'lands' ? 'Lands' : 'Hotel pickup'} ${clockTime(first.at)}`
    : b.pickup_time ? `Pickup ${formatPickupTime(b.pickup_time)}` : first ? 'Tour day' : 'No date'
  const prog = progress(b)
  const next = nextStep(b)
  // The first outside touch, shown only when it differs from "Found via".
  const firstVia = b.attribution ? firstTouchLabel(b.attribution) : null
  // "Found via" an AI assistant (ChatGPT, Muse, ...) says so, so they read as one group.
  const viaAi = b.attribution ? aiAssistantLabel(b.attribution) : null
  const coupon = Number(b.coupon_discount ?? 0)
  // A recovery email goes out from the hourly job once a cart is 30 minutes
  // old, so by two hours one that has not gone was skipped.
  const recoveryDue = Date.now() - new Date(b.created_at).getTime() < 2 * 3_600_000

  return (
    <li ref={cardRef} className={open ? 'adm-bk is-open' : 'adm-bk'}>
      {/* A heading holding one native button (the accordion pattern): the
          name and route name it, the rest describes it. The dispatch link
          sits on its own row below (no nested controls). */}
      <h3 className="adm-bk-h">
        <button
          type="button" className="adm-bk-head" onClick={onToggle}
          aria-expanded={open} aria-controls={id.panel}
          aria-labelledby={`${id.name} ${id.sub}`} aria-describedby={`${id.meta} ${id.side}`}
        >
          <span className="adm-bk-date" aria-hidden="true">
            {firstDate ? (
              <>
                <span className="adm-bk-date-m">{firstDate.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short' })}</span>
                <span className="adm-bk-date-d">{firstDate.getUTCDate()}</span>
                <span className="adm-bk-date-w">{firstDate.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' })}</span>
              </>
            ) : <span className="adm-bk-date-w">No date</span>}
          </span>
          <span className="adm-bk-who">
            <span id={id.name} className="adm-bk-name">{customerName}</span>
            <span id={id.sub} className="adm-bk-sub">
              {first && <span className="visually-hidden">{tripDay(first.day)}, </span>}
              <RouteText text={routeSummary} /> · {paxSummary}
            </span>
            <span id={id.meta} className="adm-bk-meta" suppressHydrationWarning>
              <span className="adm-nowrap adm-bk-when">{when}</span> · <span className="adm-nowrap">{bookingRef(b.id)}</span> · <span className="adm-nowrap">{variant === 'paid' ? `Paid ${stamp(b.paid_at ?? b.created_at, true)}` : `Started ${ageLabel(b.created_at)}`}</span>
            </span>
          </span>
          <span id={id.side} className="adm-bk-side">
            <span className="adm-bk-price">{money(b.total_paid)} <span className="adm-bk-cur">{currency}</span></span>
            {(refunded || showType) && (
              <span className="adm-bk-badges">
                {refunded && <span className="adm-badge adm-badge--bad">Refunded</span>}
                {showType && <span className="adm-badge adm-badge--plain">{isTransfer ? 'Ride' : 'Tour'}</span>}
              </span>
            )}
          </span>
          <ChevronRight className="adm-bk-chev" size={20} strokeWidth={2.25} aria-hidden />
        </button>
      </h3>
      {variant === 'paid' && isTransfer && (
        <div className="adm-bk-dispatch">
          {/* Progress, and the step to do next, so the list says what is
              waiting without opening dispatch. A refunded ride has none. */}
          <span className={next ? 'adm-meta' : 'adm-meta adm-good'} suppressHydrationWarning>
            {!next ? 'Dispatch done' : <>Dispatch: {prog.done} of {prog.total} steps{!refunded && <> · <span className="adm-bk-next">Next: {next.title}</span></>}</>}
          </span>
          {/* Filled only on the open card, so one action leads at a time. */}
          <Link href={`/admin/dispatch/${b.id}`} className={open ? 'adm-btn adm-btn--primary adm-btn--sm' : 'adm-btn adm-btn--sm'}>
            Manage dispatch<Arrow />
          </Link>
        </div>
      )}

      {/* Always in the page, so aria-controls always names it; collapsed and
          hidden from everyone while the card is shut. */}
      <div id={id.panel} ref={panelRef} className="adm-bk-panel">
        <div className="adm-bk-clip">
          <div className="adm-bk-body">
            {/* What and who at the left; money and records at the right. */}
            <div className="adm-bk-part">
              <section className="adm-bk-trip">
                <div className="adm-bk-sec">
                  <h4 className="adm-kicker">{isTransfer || b.pickup_time ? 'Trip (Jamaica time)' : 'Trip'}</h4>
                  <div className="adm-bk-items">
                    {items.length === 0 && <p className="adm-meta">(no items recorded)</p>}
                    {items.map((i, idx) => (
                      <div key={i.id ?? idx} className="adm-bk-item">
                        {isTransfer ? <RideItem i={i} /> : <TourItem i={i} />}
                        {items.length > 1 && <p className="adm-bk-item-line adm-bk-item-line--quiet">{money(lineTotal(i))}</p>}
                      </div>
                    ))}
                  </div>
                </div>
                {(b.pickup || b.dropoff || b.pickup_time) && (
                  <dl className="adm-facts adm-bk-rule">
                    {/* The requested start time leads: it is what dispatch
                        schedules a driver around, and unlike the addresses it
                        is a commitment made to the guest at checkout. */}
                    <Fact k="Pickup time" v={b.pickup_time ? formatPickupTime(b.pickup_time) : null} />
                    <Fact k="Pickup" v={b.pickup} />
                    {b.dropoff && b.dropoff !== b.pickup && <Fact k="Drop-off" v={b.dropoff} />}
                  </dl>
                )}
                {b.special_requests && (
                  <div className="adm-callout adm-callout--warn">
                    <p className="adm-kicker">Special requests</p>
                    <p className="adm-callout-text">{b.special_requests}</p>
                  </div>
                )}
              </section>

              <section>
                <h4 className="adm-kicker">Guest</h4>
                <div className="adm-contact">
                  {b.email ? <a className="adm-inline-link" href={`mailto:${b.email}`}>{b.email}</a> : <p className="adm-meta">(no email)</p>}
                  {b.phone ? <a className="adm-inline-link adm-tnum" href={`tel:${String(b.phone).replace(/[^\d+]/g, '')}`}>{b.phone}</a> : null}
                </div>
                {b.country ? <p className="adm-meta">{b.country}</p> : null}
              </section>
            </div>

            <div className="adm-bk-part">
              <section>
                <h4 className="adm-kicker">Payment</h4>
                <dl className="adm-money">
                  {b.subtotal != null && <MoneyRow k="Subtotal" v={money(b.subtotal)} />}
                  {b.booking_fee != null && <MoneyRow k="Service fee" v={money(b.booking_fee)} />}
                  {Number(b.transport_cost) > 0 && <MoneyRow k="Transport" v={money(b.transport_cost)} />}
                  {Number(b.reward_discount) > 0 && <MoneyRow k="Reward" v={`−${money(b.reward_discount)}`} em />}
                  {coupon > 0 && <MoneyRow k={b.coupon_code ? `Code ${b.coupon_code}` : 'Code'} v={`−${money(coupon)}`} em />}
                  <MoneyRow total k={variant === 'paid' ? 'Total paid' : 'Cart total'} v={<>{money(b.total_paid)} <span className="adm-bk-cur">{currency}</span></>} />
                </dl>
              </section>

              <section>
                <h4 className="adm-kicker">Status</h4>
                <dl className="adm-facts">
                  {variant === 'paid' ? <Fact k="Paid" v={stamp(b.paid_at ?? b.created_at)} /> : <Fact k="Started" v={stamp(b.created_at)} />}
                  {variant === 'abandoned' ? (
                    <Fact k="Recovery" v={b.recovery_email_sent_at
                      ? <span className="adm-good">Sent {stamp(b.recovery_email_sent_at)}{b.recovery_email_count > 1 ? ` (${b.recovery_email_count} times)` : ''}</span>
                      : <span className="adm-quiet" suppressHydrationWarning>{recoveryDue ? 'Queued, goes out within 90 minutes' : 'Not sent'}</span>} />
                  ) : (
                    <>
                      <Fact k="Guest email" v={b.confirmation_email_sent_at ? <span className="adm-good">Sent {stamp(b.confirmation_email_sent_at)}</span> : <span className="adm-quiet">not sent</span>} />
                      <Fact k="Ops alert" v={b.operator_email_sent_at ? <span className="adm-good">Sent {stamp(b.operator_email_sent_at)}</span> : <span className="adm-quiet">not sent</span>} />
                    </>
                  )}
                  {b.stripe_payment_id ? <Fact k="Stripe" v={<span className="adm-tnum">{String(b.stripe_payment_id).slice(0, 20)}…</span>} /> : null}
                  <Fact k="Found via" v={b.attribution
                    ? <span className="adm-strong">{attributionLabel(b.attribution)}{viaAi ? <span className="adm-quiet"> · {AI_ASSISTANT_GROUP}</span> : null}{firstVia ? <span className="adm-plain"> (first: {firstVia})</span> : null}{b.attribution.landing ? <span className="adm-quiet"> · landed on {String(b.attribution.landing).slice(0, 40)}</span> : null}</span>
                    : <span className="adm-quiet">not captured</span>} />
                  <Fact k="Browser" v={browserLabel(b.attribution?.ua)} />
                </dl>
              </section>
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}

type Status = 'paid' | 'abandoned'
type When = 'upcoming' | 'past' | 'recent'
type Kind = 'all' | 'tour' | 'transfer'
const PAGE = 30

/**
 * The bookings a view shows, in its order. Paid views hold paid and refunded
 * bookings: upcoming is every trip from today (Jamaica) on, soonest first;
 * past is the rest, latest first; recent is newest payment first. Abandoned
 * carts are newest first. The search matches anything haystack() lists.
 * Pure, so tests/unit/bookings-dashboard.spec.ts pins it.
 */
export function viewOf(bookings: Row[], o: { status: Status; when: When; kind: Kind; query: string; today: string }): Row[] {
  const q = o.query.trim().toLowerCase()
  let rows = bookings.filter((b) => (o.status === 'abandoned' ? b.status === 'pending' : b.status === 'paid' || b.status === 'refunded'))
  if (o.kind !== 'all') rows = rows.filter((b) => (b.booking_type ?? 'tour') === o.kind)
  if (q) rows = rows.filter((b) => haystack(b).includes(q))
  if (o.status === 'abandoned') return [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  const key = (b: Row) => { const f = firstService(b); return f ? (f.at ?? f.day) : '' }
  if (o.when === 'upcoming') return rows.filter((b) => (firstService(b)?.day ?? '') >= o.today).sort((a, b) => key(a).localeCompare(key(b)))
  if (o.when === 'past') return rows.filter((b) => { const d = firstService(b)?.day; return !!d && d < o.today }).sort((a, b) => key(b).localeCompare(key(a)))
  return [...rows].sort((a, b) => String(b.paid_at ?? b.created_at).localeCompare(String(a.paid_at ?? a.created_at)))
}

const LIST_NAME = { upcoming: 'Upcoming trips', past: 'Past trips', recent: 'Recently paid', abandoned: 'Abandoned checkouts' } as const

export default function BookingsDashboard({ bookings, focusId = null }: {
  bookings: Row[]
  /** A booking to open on arrival (/admin/bookings?booking=<id>, as the coupon desk links): found by its reference, whatever its date. */
  focusId?: string | null
}) {
  const focus = focusId ? bookings.find((b) => b.id === focusId) ?? null : null
  const [status, setStatus] = useState<Status>(focus?.status === 'pending' ? 'abandoned' : 'paid')
  const [when, setWhen] = useState<When>(focus ? 'recent' : 'upcoming')
  const [kind, setKind] = useState<Kind>('all')
  const [query, setQuery] = useState(focus ? bookingRef(focus.id) : '')
  const [limit, setLimit] = useState(PAGE)
  // Accordion: exactly one booking card open at a time.
  const [openId, setOpenId] = useState<string | null>(focus?.id ?? null)
  const searchId = useId()
  const today = jamaicaToday()
  const soonEnd = shiftDay(today, 14)

  const abandoned = bookings.filter((b) => b.status === 'pending')
  // Refunded bookings stay in the paid list with a badge: a trip that took
  // money and gave it back is exactly what an operator needs to SEE, not lose.
  const paid = bookings.filter((b) => b.status === 'paid' || b.status === 'refunded')
  const genuinelyPaid = bookings.filter((b) => b.status === 'paid')
  const refundedCount = paid.length - genuinelyPaid.length
  const recovered = abandoned.filter((b) => b.recovery_email_sent_at)
  const paidRevenue = genuinelyPaid.reduce((s, b) => s + Number(b.total_paid ?? 0), 0)
  const abandonedValue = abandoned.reduce((s, b) => s + Number(b.total_paid ?? 0), 0)
  const upcoming = genuinelyPaid.filter((b) => (firstService(b)?.day ?? '') >= today)
  const inTwoWeeks = upcoming.filter((b) => (firstService(b)?.day ?? '') <= soonEnd)

  const stats = [
    { label: 'Upcoming trips', value: String(upcoming.length), sub: `${inTwoWeeks.length} in the next 14 days` },
    { label: 'Paid bookings', value: String(genuinelyPaid.length), sub: `${money(paidRevenue)} USD collected${refundedCount ? `, ${refundedCount} refunded` : ''}` },
    { label: 'Abandoned carts', value: String(abandoned.length), sub: `${money(abandonedValue)} USD recoverable` },
    { label: 'Recovery emails sent', value: String(recovered.length), sub: `of ${abandoned.length} abandoned` },
  ]

  const list = useMemo(() => viewOf(bookings, { status, when, kind, query, today }), [bookings, status, when, kind, query, today])

  // A new view starts at the top of its list.
  useEffect(() => { setLimit(PAGE) }, [status, when, kind, query])
  const shown = list.slice(0, limit)
  const listKey = `${status}-${when}-${kind}`
  const listName = LIST_NAME[status === 'abandoned' ? 'abandoned' : when]
  const shownText = `Showing ${Math.min(shown.length, list.length)} of ${plural(list.length, 'booking')}.`

  // Screen readers hear the result once the choices or the typing settle,
  // not after every keystroke.
  const spokenNow = `${listName}${kind === 'tour' ? ', tours' : kind === 'transfer' ? ', rides' : ''}${query.trim() ? `, matching "${query.trim()}"` : ''}: ${shownText.toLowerCase()}`
  const [spoken, setSpoken] = useState(spokenNow)
  useEffect(() => {
    const t = window.setTimeout(() => setSpoken(spokenNow), 700)
    return () => window.clearTimeout(t)
  }, [spokenNow])

  // Upcoming trips split at two weeks out, the stretch being prepared for;
  // every other view is one list, named for screen readers only.
  const groups = status === 'paid' && when === 'upcoming'
    ? [
        { key: 'soon', title: 'Next 14 days', visible: true, rows: shown.filter((b) => (firstService(b)?.day ?? '') <= soonEnd), none: 'None in the next 14 days.' },
        { key: 'later', title: 'Later', visible: true, rows: shown.filter((b) => (firstService(b)?.day ?? '') > soonEnd), none: null },
      ]
    : [{ key: 'all', title: listName, visible: false, rows: shown, none: null }]

  const describe = status === 'abandoned'
    ? 'Checkouts that were never paid. A recovery email goes out by itself 30 to 90 minutes after a cart starts, if it is still unpaid.'
    : when === 'upcoming' ? 'Paid trips from today on, soonest first.' : when === 'past' ? 'Trips that have happened, most recent first.' : 'Every paid booking, newest payment first.'
  const empty = query.trim()
    ? `Nothing matches "${query.trim()}". Try a surname, an email or the MAPL reference.`
    : status === 'abandoned' ? 'No abandoned carts. 🇯🇲' : when === 'upcoming' ? 'No upcoming trips yet. New bookings show here as they come in. 🇯🇲' : 'No bookings here.'

  return (
    <div className="adm">
      <h1 className="adm-h1">Bookings</h1>
      <p className="adm-lead">Trip times are Jamaica time. Search finds a booking by guest, reference, hotel or flight.</p>

      <dl className="adm-tiles">
        {stats.map((s) => (
          <div key={s.label} className="adm-tile">
            <dt className="adm-kicker">{s.label}</dt>
            <dd className="adm-tile-v">{s.value}</dd>
            <dd className="adm-tile-sub">{s.sub}</dd>
          </div>
        ))}
      </dl>

      <div className="adm-toolbar">
        <div className="adm-search">
          <label htmlFor={searchId} className="visually-hidden">Search bookings</label>
          <Search className="adm-search-icon" size={18} strokeWidth={2.25} aria-hidden />
          <input
            id={searchId} type="search" className="adm-input adm-search-input" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, email, ref, hotel or flight" autoComplete="off" spellCheck={false} enterKeyHint="search"
          />
        </div>
        <div className="adm-toolbar-row">
          <Segmented label="Booking status" value={status} onChange={setStatus} options={[
            { key: 'paid', label: 'Paid', count: paid.length },
            { key: 'abandoned', label: 'Abandoned', count: abandoned.length },
          ]} />
          {status === 'paid' && (
            <Segmented label="When" value={when} onChange={setWhen} options={[
              { key: 'upcoming', label: 'Upcoming' },
              { key: 'past', label: 'Past' },
              { key: 'recent', label: 'Recently paid' },
            ]} />
          )}
          <Segmented label="Type" value={kind} onChange={setKind} options={[
            { key: 'all', label: 'All' },
            { key: 'tour', label: 'Tours' },
            { key: 'transfer', label: 'Rides' },
          ]} />
        </div>
      </div>

      <p className="adm-meta adm-bk-count">{describe} {shownText}</p>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">{spoken}</p>
      {list.length === 0 ? (
        <p className="adm-empty adm-enter">{empty}</p>
      ) : (
        <div key={listKey} className="adm-bk-groups adm-rows">
          {groups.filter((g) => g.rows.length > 0 || g.none).map((g) => (
            <div key={g.key} className="adm-bk-group">
              <h2 className={g.visible ? 'adm-h2' : 'visually-hidden'}>{g.title}</h2>
              {g.rows.length > 0 ? (
                <ol className="adm-bk-list">
                  {g.rows.map((b) => (
                    <BookingCard
                      key={b.id} b={b} variant={status} showType={kind === 'all'}
                      open={openId === b.id} onToggle={() => setOpenId((o) => (o === b.id ? null : b.id))}
                    />
                  ))}
                </ol>
              ) : (
                <p className="adm-meta">{g.none}</p>
              )}
            </div>
          ))}
        </div>
      )}
      {list.length > shown.length && (
        <button type="button" className="adm-btn adm-more" onClick={() => setLimit((n) => n + PAGE)}>
          Show {Math.min(PAGE, list.length - shown.length)} more
        </button>
      )}
    </div>
  )
}

/** YYYY-MM-DD plus n days. */
function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** '08:30' -> '8:30 AM'. Returns the raw value if it is not HH:MM. */
function formatPickupTime(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  const h = Number(m[1])
  const suffix = h < 12 ? 'AM' : 'PM'
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${suffix}`
}
