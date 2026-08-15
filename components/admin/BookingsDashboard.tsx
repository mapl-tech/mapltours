'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { visibleSteps } from '@/lib/dispatch'
import { attributionLabel } from '@/lib/attribution'

/**
 * Client dashboard for the admin bookings page. The parent server component
 * has already confirmed the caller is an admin and fetched the rows with the
 * service role, so this component only renders. It owns the tab (paid vs
 * abandoned) and the Tours/Transfers filter.
 */

const ink = 'var(--text-primary, #171614)'
const soft = 'var(--text-secondary, #57534C)'
// AA hard floor: the site --text-tertiary (#8A857D) is only 3.66:1 on white,
// which fails 4.5:1 for the small labels/timestamps used here. Use a darker
// tertiary (5.38:1) so every value on a card is legible.
const faint = '#6E6A62'
const green = 'var(--green, #1D7A50)'
const accent = 'var(--accent, #171614)'
const border = '1px solid var(--border, #E7E1D6)'
const borderSoft = '1px solid var(--border-subtle, #F1ECE3)'
const dm = 'var(--font-dm-sans)'
const tnum = { fontVariantNumeric: 'tabular-nums' as const }

function money(n: number | null | undefined): string {
  return '$' + Number(n ?? 0).toFixed(2)
}
function dateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return '-' }
}
function dateShort(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return String(iso) }
}
function flightTime(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    // Leg times are the guest's Jamaica wall-clock, stored verbatim. Read them
    // back in UTC so this dashboard shows the SAME time the guest was quoted on
    // the confirmation and the day-of email. Without the timeZone this rendered
    // in the admin's own zone, so a Toronto operator saw every pickup 4 hours
    // out from what the driver and the guest had agreed.
    return new Date(iso).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return '' }
}
function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min ago`
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
function ref(id: string): string { return 'MAPL-' + id.slice(0, 8).toUpperCase() }
function plural(n: number, w: string): string { return `${n} ${w}${n === 1 ? '' : 's'}` }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: faint, margin: 0 }

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  if (v == null || v === '') return null
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13.5, lineHeight: 1.5 }}>
      <span style={{ color: faint, minWidth: 78, flexShrink: 0 }}>{k}</span>
      <span style={{ color: ink, ...tnum }}>{v}</span>
    </div>
  )
}

function MoneyRow({ k, v, em }: { k: string; v: string | null; em?: boolean }) {
  if (v == null) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: soft }}>{k}</span>
      <span style={{ color: em ? green : ink, fontWeight: em ? 600 : 400, ...tnum }}>{v}</span>
    </div>
  )
}

function BookingCard({ b, variant, open, onToggle }: { b: Row; variant: 'abandoned' | 'paid'; open: boolean; onToggle: () => void }) {
  // Smooth-scroll the card into view when it opens (honors reduced motion).
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !cardRef.current) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    requestAnimationFrame(() => cardRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }))
  }, [open])
  const isTransfer = b.booking_type === 'transfer'
  const currency = (b.currency ?? 'usd').toUpperCase()
  const items = (b.booking_items ?? []) as Row[]
  // Darker amber so the "Abandoned" label clears AA (4.5:1) on the card header;
  // #B8873D was only 3.08:1.
  const statusColor = variant === 'paid' ? green : '#7A5A08'
  const statusText = variant === 'paid' ? 'Paid' : 'Abandoned'
  const money2 = (n: number | null | undefined) => (n == null ? null : `${money(n)} ${currency}`)

  const item0 = items[0]
  const customerName = [b.first_name, b.last_name].filter(Boolean).join(' ') || '(no name)'
  const routeSummary = isTransfer
    ? `${item0?.airport ?? 'MBJ'} → ${item0?.hotel ?? item0?.destination ?? ''}`
    : items.length === 1 ? (item0?.title ?? 'Tour') : `${items.length} experiences`
  const paxSummary = isTransfer ? plural(item0?.passengers ?? item0?.travelers ?? 1, 'passenger') : null
  const dispatchDone = Object.keys(b.dispatch || {}).length
  const dispatchTotal = visibleSteps(item0?.trip_type === 'round_trip').length

  return (
    <div ref={cardRef} style={{ background: '#fff', border, borderRadius: 14, overflow: 'hidden', scrollMarginTop: 20 }}>
      {/* Clickable header + at-a-glance summary (collapsed view) */}
      {/* Header block: the clickable toggle holds only text (no focusable
          descendants - axe nested-interactive); the dispatch link sits on its
          own row below it. */}
      <div style={{ background: '#FCFBF8', borderBottom: open ? borderSoft : undefined }}>
        <div
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={onToggle}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
          style={{ cursor: 'pointer', padding: '14px 18px' }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 15, ...tnum }}>{ref(b.id)}</span>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: faint }}>{b.booking_type ?? 'tour'}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: statusColor }}>{statusText}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, fontSize: 20, ...tnum }}>{money(b.total_paid)} <span style={{ fontSize: 12, fontWeight: 600, color: faint }}>{currency}</span></div>
                <div style={{ fontSize: 11.5, color: faint }}>
                  {variant === 'paid' ? `Paid ${dateTime(b.paid_at ?? b.created_at)}` : `Started ${ageLabel(b.created_at)}`}
                </div>
              </div>
              <span aria-hidden="true" style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease', color: faint, fontSize: 20, lineHeight: 1 }}>›</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: ink }}>{customerName}</span>
            <span aria-hidden="true" style={{ color: faint }}>·</span>
            <span style={{ fontSize: 13.5, color: soft }}>{routeSummary}</span>
            {paxSummary && (
              <>
                <span aria-hidden="true" style={{ color: faint }}>·</span>
                <span style={{ fontSize: 13.5, color: soft }}>{paxSummary}</span>
              </>
            )}
          </div>
        </div>
        {variant === 'paid' && isTransfer && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '0 18px 12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: faint, ...tnum }}>Dispatch {dispatchDone}/{dispatchTotal}</span>
            <Link href={`/admin/dispatch/${b.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 13px', borderRadius: 9999, border: '1px solid var(--accent, #171614)', background: 'var(--accent, #171614)', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
              Manage dispatch →
            </Link>
          </div>
        )}
      </div>

      {open && (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 0 }} className="admin-card-grid">
        <div style={{ padding: '16px 18px', borderRight: borderSoft }}>
          <p style={{ ...label, marginBottom: 10 }}>Itinerary</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {items.length === 0 && <span style={{ fontSize: 13, color: faint }}>(no items recorded)</span>}
            {items.map((i, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {isTransfer ? (
                  <>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{(i.airport ?? 'MBJ')} → {i.hotel ?? i.destination}</div>
                    <div style={{ fontSize: 12.5, color: soft }}>
                      {[i.zone ? `Zone ${i.zone}` : null, i.trip_type === 'round_trip' ? 'Round-trip' : 'One-way', plural(i.passengers ?? i.travelers ?? 1, 'passenger')].filter(Boolean).join(' · ')}
                    </div>
                    {i.arrival_at || i.arrival_flight ? (
                      <div style={{ fontSize: 12.5, color: soft, ...tnum }}>Arrive: {[i.arrival_flight ? `flight ${i.arrival_flight}` : null, flightTime(i.arrival_at)].filter(Boolean).join(', ')}</div>
                    ) : null}
                    {i.departure_at || i.departure_flight ? (
                      <div style={{ fontSize: 12.5, color: soft, ...tnum }}>Departure pickup: {[flightTime(i.departure_at), i.departure_flight ? `flight ${i.departure_flight}` : null].filter(Boolean).join(' · ')}</div>
                    ) : null}
                    <div style={{ fontSize: 12.5, color: faint, ...tnum }}>{money2(i.price_per_person)}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{i.title}</div>
                    <div style={{ fontSize: 12.5, color: soft, ...tnum }}>{[i.destination, dateShort(i.date), plural(i.travelers ?? 1, 'traveler')].filter(Boolean).join(' · ')}</div>
                    <div style={{ fontSize: 12.5, color: faint, ...tnum }}>{money(i.price_per_person)} each · line {money((i.price_per_person ?? 0) * (i.travelers ?? 1))} {currency}</div>
                  </>
                )}
              </div>
            ))}
          </div>

          {(b.pickup || b.dropoff) && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: borderSoft }}>
              <Field k="Pickup" v={b.pickup} />
              <Field k="Drop-off" v={b.dropoff} />
            </div>
          )}
          {b.special_requests && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#FCF6E4', border: '1px solid #F0E4BE', borderRadius: 8 }}>
              <p style={{ ...label, color: '#7A5A08', marginBottom: 4 }}>Special requests</p>
              <p style={{ fontSize: 13, color: ink, margin: 0, whiteSpace: 'pre-wrap' }}>{b.special_requests}</p>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <p style={{ ...label, marginBottom: 8 }}>Customer</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{[b.first_name, b.last_name].filter(Boolean).join(' ') || '(no name)'}</span>
              <a href={`mailto:${b.email}`} style={{ fontSize: 13, color: soft, textDecoration: 'none' }}>{b.email || '(no email)'}</a>
              {b.phone ? <span style={{ fontSize: 13, color: soft, ...tnum }}>{b.phone}</span> : null}
              {b.country ? <span style={{ fontSize: 13, color: faint }}>{b.country}</span> : null}
            </div>
          </div>

          <div>
            <p style={{ ...label, marginBottom: 8 }}>Payment</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {b.subtotal != null && <MoneyRow k="Subtotal" v={money2(b.subtotal)} />}
              {b.booking_fee != null && <MoneyRow k="Service fee" v={money2(b.booking_fee)} />}
              {b.transport_cost != null && Number(b.transport_cost) > 0 && <MoneyRow k="Transport" v={money2(b.transport_cost)} />}
              {b.reward_discount != null && Number(b.reward_discount) > 0 && <MoneyRow k="Reward" v={`- ${money2(b.reward_discount)}`} em />}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, marginTop: 2, borderTop: borderSoft }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{variant === 'paid' ? 'Total paid' : 'Cart total'}</span>
                <span style={{ fontSize: 15, fontWeight: 800, ...tnum }}>{money(b.total_paid)}</span>
              </div>
            </div>
          </div>

          <div>
            <p style={{ ...label, marginBottom: 8 }}>Status</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {variant === 'abandoned' ? (
                <Field k="Recovery" v={b.recovery_email_sent_at
                  ? <span style={{ color: green, fontWeight: 600 }}>✓ Sent {dateTime(b.recovery_email_sent_at)}{b.recovery_email_count > 1 ? ` (${b.recovery_email_count}x)` : ''}</span>
                  : <span style={{ color: faint }}>Queued (auto-sends at 30 min)</span>} />
              ) : (
                <>
                  <Field k="Guest email" v={b.confirmation_email_sent_at ? <span style={{ color: green }}>✓ {dateTime(b.confirmation_email_sent_at)}</span> : <span style={{ color: faint }}>not sent</span>} />
                  <Field k="Ops alert" v={b.operator_email_sent_at ? <span style={{ color: green }}>✓ {dateTime(b.operator_email_sent_at)}</span> : <span style={{ color: faint }}>not sent</span>} />
                </>
              )}
              {b.stripe_payment_id ? <Field k="Stripe" v={<span style={tnum}>{b.stripe_payment_id.slice(0, 20)}…</span>} /> : null}
              <Field k="Found via" v={b.attribution
                ? <span style={{ fontWeight: 600 }}>{attributionLabel(b.attribution)}{b.attribution.landing ? <span style={{ color: faint, fontWeight: 400 }}> · landed on {String(b.attribution.landing).slice(0, 40)}</span> : null}</span>
                : <span style={{ color: faint }}>not captured</span>} />
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}

type Tab = 'abandoned' | 'paid'
type Filter = 'all' | 'tour' | 'transfer'

export default function BookingsDashboard({ bookings }: { bookings: Row[] }) {
  const [tab, setTab] = useState<Tab>('paid')
  // Accordion: exactly one booking card open at a time.
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const abandoned = bookings.filter((b) => b.status === 'pending')
  const paid = bookings.filter((b) => b.status === 'paid')
  const recovered = abandoned.filter((b) => b.recovery_email_sent_at)
  const paidRevenue = paid.reduce((s, b) => s + Number(b.total_paid ?? 0), 0)
  const abandonedValue = abandoned.reduce((s, b) => s + Number(b.total_paid ?? 0), 0)

  const stats = [
    { label: 'Paid bookings', value: String(paid.length), sub: money(paidRevenue) + ' collected' },
    { label: 'Abandoned carts', value: String(abandoned.length), sub: money(abandonedValue) + ' recoverable' },
    { label: 'Recovery emails sent', value: String(recovered.length), sub: 'of ' + abandoned.length + ' abandoned' },
    { label: 'Total bookings', value: String(bookings.length), sub: 'last 300' },
  ]

  const base = tab === 'abandoned' ? abandoned : paid
  const list = filter === 'all' ? base : base.filter((b) => (b.booking_type ?? 'tour') === filter)
  const shown = tab === 'paid' ? list.slice(0, 60) : list

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'paid', label: 'Recent paid bookings', count: paid.length },
    { key: 'abandoned', label: 'Abandoned carts', count: abandoned.length },
  ]
  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'tour', label: 'Tours' },
    { key: 'transfer', label: 'Transfers' },
  ]

  return (
    <div style={{ fontFamily: dm, color: ink }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: dm, fontWeight: 800, fontSize: 26, letterSpacing: '-0.025em', margin: 0 }}>Bookings</h1>
          <Link href="/admin/cashflow" style={{ fontSize: 13, fontWeight: 600, color: soft, textDecoration: 'none' }}>Cash flow →</Link>
          <Link href="/admin/driver" style={{ fontSize: 13, fontWeight: 600, color: soft, textDecoration: 'none' }}>Driver portal →</Link>
          <Link href="/admin/videos" style={{ fontSize: 13, fontWeight: 600, color: soft, textDecoration: 'none' }}>Video moderation →</Link>
        </div>
        <Link
          href="/"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px',
            borderRadius: 9999, border, background: '#fff', color: ink,
            fontFamily: dm, fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}
        >
          <span aria-hidden="true">←</span> Back to website
        </Link>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginTop: 22 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: '#fff', border, borderRadius: 14, padding: '18px 20px' }}>
            <div style={label}>{s.label}</div>
            <div style={{ fontFamily: dm, fontWeight: 800, fontSize: 30, letterSpacing: '-0.02em', marginTop: 8, ...tnum }}>{s.value}</div>
            <div style={{ fontSize: 12.5, color: soft, marginTop: 2, ...tnum }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs + filter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 34, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Booking status" style={{ display: 'inline-flex', gap: 4, background: '#fff', border, borderRadius: 9999, padding: 4 }}>
          {tabs.map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 18px',
                  borderRadius: 9999, border: 'none', cursor: 'pointer', fontFamily: dm, fontSize: 13.5, fontWeight: 600,
                  background: active ? accent : 'transparent', color: active ? '#fff' : soft, transition: 'all 0.15s ease',
                }}
              >
                {t.label}
                <span style={{ ...tnum, fontSize: 12, fontWeight: 700, padding: '1px 8px', borderRadius: 9999, background: active ? 'rgba(255,255,255,0.22)' : 'var(--surface, #F1ECE3)', color: active ? '#fff' : faint }}>{t.count}</span>
              </button>
            )
          })}
        </div>

        <div role="group" aria-label="Filter by type" style={{ display: 'inline-flex', gap: 6 }}>
          {filters.map((f) => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                style={{
                  height: 36, padding: '0 16px', borderRadius: 9999, cursor: 'pointer', fontFamily: dm, fontSize: 13, fontWeight: 600,
                  border: active ? '1px solid var(--gold, #B8873D)' : border,
                  background: active ? 'var(--gold-dim, rgba(184,135,58,0.12))' : '#fff',
                  color: active ? 'var(--gold-text, #8A6D1F)' : soft, transition: 'all 0.15s ease',
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active list */}
      <div style={{ marginTop: 12 }}>
        <p style={{ fontSize: 12.5, color: faint, margin: '10px 2px 0', minHeight: 18 }}>
          {tab === 'abandoned'
            ? 'Pending checkouts that were never paid. A recovery email is sent automatically once a cart is 30 minutes old and still unpaid.'
            : 'Completed, paid bookings.'}
          {'  '}Showing {shown.length}{filter !== 'all' ? ` ${filter === 'tour' ? 'tour' : 'transfer'}` : ''} {shown.length === 1 ? 'booking' : 'bookings'}.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          {shown.length === 0 && (
            <div style={{ background: '#fff', border, borderRadius: 14, padding: 26, color: faint, textAlign: 'center' }}>
              {tab === 'abandoned' ? 'No abandoned carts here. 🇯🇲' : 'No paid bookings here.'}
            </div>
          )}
          {shown.map((b) => <BookingCard key={b.id} b={b} variant={tab} open={openId === b.id} onToggle={() => setOpenId((o) => (o === b.id ? null : b.id))} />)}
        </div>
      </div>
    </div>
  )
}
