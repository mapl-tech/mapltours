import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Admin bookings + abandoned-cart dashboard.
 *
 * Server component: it confirms the caller is an admin (session cookie ->
 * user -> admins allowlist) BEFORE ever touching the service-role client, so
 * customer PII is never exposed to a non-admin. Read-only; it issues no
 * charges and mutates nothing.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ink = 'var(--text-primary, #171614)'
const soft = 'var(--text-secondary, #57534C)'
const faint = 'var(--text-tertiary, #8A857D)'
const green = 'var(--green, #1D7A50)'
const border = '1px solid var(--border, #E7E1D6)'
const borderSoft = '1px solid var(--border-subtle, #F1ECE3)'
const dm = 'var(--font-dm-sans)'
const tnum = { fontVariantNumeric: 'tabular-nums' as const }

function money(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  return '$' + v.toFixed(2)
}
function dateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    })
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
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-warm, #F4F1EB)' }}>
      <div className="container" style={{ maxWidth: 1120, padding: '40px 20px 90px', fontFamily: dm, color: ink }}>
        {children}
      </div>
    </div>
  )
}

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

/** A fully detailed booking card, used for both abandoned carts and paid bookings. */
function BookingCard({ b, variant }: { b: Row; variant: 'abandoned' | 'paid' }) {
  const isTransfer = b.booking_type === 'transfer'
  const currency = (b.currency ?? 'usd').toUpperCase()
  const items = (b.booking_items ?? []) as Row[]
  const statusColor = variant === 'paid' ? green : '#B8873D'
  const statusText = variant === 'paid' ? 'Paid' : 'Abandoned'

  const money2 = (n: number | null | undefined) =>
    n == null ? null : `${money(n)} ${currency}`

  return (
    <div style={{ background: '#fff', border, borderRadius: 14, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: borderSoft, background: '#FCFBF8', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 15, ...tnum }}>{ref(b.id)}</span>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: faint }}>{b.booking_type ?? 'tour'}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: statusColor }}>{statusText}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: 20, ...tnum }}>{money(b.total_paid)} <span style={{ fontSize: 12, fontWeight: 600, color: faint }}>{currency}</span></div>
          <div style={{ fontSize: 11.5, color: faint }}>
            {variant === 'paid' ? `Paid ${dateTime(b.paid_at ?? b.created_at)}` : `Started ${ageLabel(b.created_at)} · ${dateTime(b.created_at)}`}
          </div>
        </div>
      </div>

      {/* Body: customer + itinerary + money */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 0 }} className="admin-card-grid">
        {/* Left: itinerary */}
        <div style={{ padding: '16px 18px', borderRight: borderSoft }}>
          <p style={{ ...label, marginBottom: 10 }}>Itinerary</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {items.length === 0 && <span style={{ fontSize: 13, color: faint }}>(no items recorded)</span>}
            {items.map((i, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {isTransfer ? (
                  <>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {(i.airport ?? 'MBJ')} → {i.hotel ?? i.destination}
                    </div>
                    <div style={{ fontSize: 12.5, color: soft }}>
                      {[i.zone ? `Zone ${i.zone}` : null, i.trip_type === 'round_trip' ? 'Round-trip' : 'One-way', plural(i.passengers ?? i.travelers ?? 1, 'passenger')].filter(Boolean).join(' · ')}
                    </div>
                    {i.arrival_at || i.arrival_flight ? (
                      <div style={{ fontSize: 12.5, color: soft, ...tnum }}>
                        Arrive: {[i.arrival_flight ? `flight ${i.arrival_flight}` : null, flightTime(i.arrival_at)].filter(Boolean).join(', ')}
                      </div>
                    ) : null}
                    {i.departure_at || i.departure_flight ? (
                      <div style={{ fontSize: 12.5, color: soft, ...tnum }}>
                        Depart: {[i.departure_flight ? `flight ${i.departure_flight}` : null, flightTime(i.departure_at)].filter(Boolean).join(', ')}
                      </div>
                    ) : null}
                    <div style={{ fontSize: 12.5, color: faint, ...tnum }}>{money2(i.price_per_person)}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{i.title}</div>
                    <div style={{ fontSize: 12.5, color: soft, ...tnum }}>
                      {[i.destination, dateShort(i.date), plural(i.travelers ?? 1, 'traveler')].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{ fontSize: 12.5, color: faint, ...tnum }}>
                      {money(i.price_per_person)} each · line {money((i.price_per_person ?? 0) * (i.travelers ?? 1))} {currency}
                    </div>
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

        {/* Right: customer + money + status */}
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
              {b.reward_discount != null && Number(b.reward_discount) > 0 && <MoneyRow k="Reward" v={`- ${money2(b.reward_discount)}`} accent />}
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
              {b.stripe_payment_id ? <Field k="Stripe" v={<span style={{ ...tnum }}>{b.stripe_payment_id.slice(0, 20)}…</span>} /> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MoneyRow({ k, v, accent }: { k: string; v: string | null; accent?: boolean }) {
  if (v == null) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: soft }}>{k}</span>
      <span style={{ color: accent ? green : ink, fontWeight: accent ? 600 : 400, ...tnum }}>{v}</span>
    </div>
  )
}

export default async function AdminBookingsPage() {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return (
      <Shell>
        <h1 style={{ fontFamily: dm, fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em' }}>Bookings</h1>
        <p style={{ marginTop: 10, color: soft }}>
          Please <Link href="/login?redirect=/admin/bookings" style={{ color: ink, fontWeight: 600 }}>sign in</Link> to view this page.
        </p>
      </Shell>
    )
  }

  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) {
    return (
      <Shell>
        <h1 style={{ fontFamily: dm, fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em' }}>Not authorised</h1>
        <p style={{ marginTop: 10, color: soft }}>This dashboard is limited to MAPL admins.</p>
      </Shell>
    )
  }

  const { data: bookings } = await svc
    .from('bookings')
    .select('*, booking_items(*)')
    .order('created_at', { ascending: false })
    .limit(300)

  const all = (bookings ?? []) as Row[]
  const abandoned = all.filter((b) => b.status === 'pending')
  const paid = all.filter((b) => b.status === 'paid')
  const recovered = abandoned.filter((b) => b.recovery_email_sent_at)
  const paidRevenue = paid.reduce((s, b) => s + Number(b.total_paid ?? 0), 0)
  const abandonedValue = abandoned.reduce((s, b) => s + Number(b.total_paid ?? 0), 0)

  const stats = [
    { label: 'Paid bookings', value: String(paid.length), sub: money(paidRevenue) + ' collected' },
    { label: 'Abandoned carts', value: String(abandoned.length), sub: money(abandonedValue) + ' recoverable' },
    { label: 'Recovery emails sent', value: String(recovered.length), sub: 'of ' + abandoned.length + ' abandoned' },
    { label: 'Total bookings', value: String(all.length), sub: 'last 300' },
  ]

  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: dm, fontWeight: 800, fontSize: 26, letterSpacing: '-0.025em', margin: 0 }}>Bookings</h1>
        <span style={{ fontSize: 13, color: faint }}>
          <Link href="/admin/videos" style={{ color: soft }}>Video moderation</Link>
        </span>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginTop: 22 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: '#fff', border, borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ ...label }}>{s.label}</div>
            <div style={{ fontFamily: dm, fontWeight: 800, fontSize: 30, letterSpacing: '-0.02em', marginTop: 8, ...tnum }}>{s.value}</div>
            <div style={{ fontSize: 12.5, color: soft, marginTop: 2, ...tnum }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Abandoned carts */}
      <section style={{ marginTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ fontFamily: dm, fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em', margin: 0 }}>Abandoned carts</h2>
          <span style={{ fontSize: 12.5, color: faint }}>pending checkouts that were never paid</span>
        </div>
        <p style={{ fontSize: 12.5, color: faint, marginTop: 6, maxWidth: 760, lineHeight: 1.5 }}>
          A recovery email is sent automatically once a cart is 30 minutes old and still unpaid, then it shows as recovered here. Nothing is ever charged.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          {abandoned.length === 0 && (
            <div style={{ background: '#fff', border, borderRadius: 14, padding: 22, color: faint, textAlign: 'center' }}>No abandoned carts. 🇯🇲</div>
          )}
          {abandoned.map((b) => <BookingCard key={b.id} b={b} variant="abandoned" />)}
        </div>
      </section>

      {/* Recent paid */}
      <section style={{ marginTop: 44 }}>
        <h2 style={{ fontFamily: dm, fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em', margin: 0 }}>Recent paid bookings</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          {paid.length === 0 && (
            <div style={{ background: '#fff', border, borderRadius: 14, padding: 22, color: faint, textAlign: 'center' }}>No paid bookings yet.</div>
          )}
          {paid.slice(0, 40).map((b) => <BookingCard key={b.id} b={b} variant="paid" />)}
        </div>
      </section>
    </Shell>
  )
}
