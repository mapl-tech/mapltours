import type { Metadata } from 'next'
import Link from 'next/link'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import ConfirmClient from './ConfirmClient'

/**
 * Post-checkout confirmation page. Lands here from:
 *   • A 3DS / bank-auth redirect (Stripe attaches `payment_intent` to the
 *     return_url query string).
 *   • A non-3DS local success — StripePaymentPanel navigates here with the
 *     same query string so both paths share one comprehensive view.
 *
 * Reads the full booking row + line items from Supabase so customers see
 * everything that's on file: booking ref, paid-at, customer details,
 * pickup/dropoff, breakdown, special requests. Stripe is the source of
 * truth for payment status; Supabase is the source of truth for itinerary.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Booking Confirmation',
  description: 'Your MAPL Tours Jamaica booking confirmation.',
  robots: { index: false, follow: false },
}

interface SearchParams {
  payment_intent?: string
  payment_intent_client_secret?: string
  redirect_status?: string
}

interface ConfirmedItem {
  title: string
  destination: string
  date: string
  travelers: number
  pricePerPerson: number
  lineTotal: number
}

interface ConfirmData {
  status: 'succeeded' | 'processing' | 'failed' | 'unknown'
  bookingRef: string | null
  paidAt: string | null
  customerName: string | null
  email: string | null
  phone: string | null
  country: string | null
  pickup: string | null
  dropoff: string | null
  specialRequests: string | null
  subtotal: number | null
  bookingFee: number | null
  transportCost: number | null
  rewardDiscount: number | null
  totalPaid: number | null
  currency: string
  items: ConfirmedItem[]
}

function emptyData(): ConfirmData {
  return {
    status: 'unknown',
    bookingRef: null,
    paidAt: null,
    customerName: null,
    email: null,
    phone: null,
    country: null,
    pickup: null,
    dropoff: null,
    specialRequests: null,
    subtotal: null,
    bookingFee: null,
    transportCost: null,
    rewardDiscount: null,
    totalPaid: null,
    currency: 'USD',
    items: [],
  }
}

async function resolveConfirm(
  piId: string | undefined,
  redirectStatus: string | undefined,
): Promise<ConfirmData> {
  const empty = emptyData()
  if (!piId) return empty

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  let pi: Stripe.PaymentIntent
  try {
    pi = await stripe.paymentIntents.retrieve(piId)
  } catch {
    return empty
  }

  const stripeStatus: ConfirmData['status'] =
    pi.status === 'succeeded'
      ? 'succeeded'
      : pi.status === 'processing'
      ? 'processing'
      : pi.status === 'requires_payment_method' || pi.status === 'canceled'
      ? 'failed'
      : 'unknown'

  // Stripe's redirect_status is the most authoritative signal for redirect
  // returns; otherwise fall back to the PI's current status.
  const status: ConfirmData['status'] =
    redirectStatus === 'failed'
      ? 'failed'
      : redirectStatus === 'requires_payment_method'
      ? 'failed'
      : redirectStatus === 'succeeded'
      ? stripeStatus // still respect the PI in case of a stale redirect
      : stripeStatus

  // Look up the booking by stripe_payment_id first, then fall back to
  // metadata.booking_id (the orphan-recovery path also used by the webhook).
  const supabase = createServiceClient()
  let { data: booking } = await supabase
    .from('bookings')
    .select(
      'id, email, first_name, last_name, phone, country, pickup, dropoff, special_requests, subtotal, booking_fee, transport_cost, reward_discount, total_paid, currency, paid_at, booking_type',
    )
    .eq('stripe_payment_id', piId)
    .eq('booking_type', 'tour')
    .maybeSingle()

  if (!booking && typeof pi.metadata?.booking_id === 'string') {
    const { data: byMeta } = await supabase
      .from('bookings')
      .select(
        'id, email, first_name, last_name, phone, country, pickup, dropoff, special_requests, subtotal, booking_fee, transport_cost, reward_discount, total_paid, currency, paid_at, booking_type',
      )
      .eq('id', pi.metadata.booking_id)
      .eq('booking_type', 'tour')
      .maybeSingle()
    booking = byMeta
  }

  const { data: items } = booking
    ? await supabase
        .from('booking_items')
        .select('title, destination, date, travelers, price_per_person')
        .eq('booking_id', booking.id)
        .eq('item_type', 'experience')
    : { data: null }

  const customerName = booking
    ? `${booking.first_name ?? ''} ${booking.last_name ?? ''}`.trim() || null
    : null

  return {
    status,
    bookingRef: booking ? humanizeId(booking.id) : null,
    paidAt: booking?.paid_at ?? null,
    customerName,
    email: booking?.email ?? pi.receipt_email ?? null,
    phone: booking?.phone ?? null,
    country: booking?.country ?? null,
    pickup: booking?.pickup ?? null,
    dropoff: booking?.dropoff ?? null,
    specialRequests: booking?.special_requests ?? null,
    subtotal: booking?.subtotal != null ? Number(booking.subtotal) : null,
    bookingFee: booking?.booking_fee != null ? Number(booking.booking_fee) : null,
    transportCost: booking?.transport_cost != null ? Number(booking.transport_cost) : null,
    rewardDiscount: booking?.reward_discount != null ? Number(booking.reward_discount) : null,
    totalPaid: booking?.total_paid != null ? Number(booking.total_paid) : pi.amount / 100,
    currency: (booking?.currency ?? pi.currency ?? 'usd').toUpperCase(),
    items: (items ?? []).map((i) => {
      const pricePerPerson = Number(i.price_per_person)
      return {
        title: i.title,
        destination: i.destination,
        date: i.date,
        travelers: i.travelers,
        pricePerPerson,
        lineTotal: pricePerPerson * i.travelers,
      }
    }),
  }
}

function humanizeId(id: string): string {
  return 'MAPL-' + id.slice(0, 8).toUpperCase()
}

function formatMoney(n: number | null, currency: string): string {
  if (n === null || !Number.isFinite(n)) return '—'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n).toFixed(2)
  return `${sign}${currency === 'USD' ? '$' : currency + ' '}${abs}`
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch {
    return iso
  }
}

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const data = await resolveConfirm(searchParams.payment_intent, searchParams.redirect_status)

  return (
    <div
      style={{
        minHeight: '100vh',
        paddingTop: 56,
        background: 'var(--bg-warm)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="container" style={{ maxWidth: 720, padding: '72px 20px' }}>
        {data.status === 'succeeded' ? (
          <Success data={data} />
        ) : data.status === 'processing' ? (
          <Processing />
        ) : data.status === 'failed' ? (
          <Failed />
        ) : (
          <Unknown />
        )}

        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Link href="/explore" className="btn-primary" style={{ height: 46, padding: '0 28px', fontSize: 14 }}>
            Browse more experiences
          </Link>
          <Link href="/" className="btn-outline" style={{ height: 46, padding: '0 22px' }}>
            Home
          </Link>
        </div>
      </div>

      {data.status === 'succeeded' && <ConfirmClient />}
    </div>
  )
}

/* ─── Success — comprehensive details ─── */

function Success({ data }: { data: ConfirmData }) {
  const showBreakdown =
    data.subtotal !== null ||
    data.bookingFee !== null ||
    data.transportCost !== null ||
    (data.rewardDiscount !== null && data.rewardDiscount > 0)

  return (
    <div style={{ textAlign: 'center' }}>
      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--emerald)',
          marginBottom: 14,
        }}
      >
        Booking confirmed
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 700,
          fontSize: 'clamp(2.25rem, 5vw, 3.5rem)',
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          marginBottom: 14,
        }}
      >
        Jamaica is{' '}
        <span style={{ fontStyle: 'italic', fontWeight: 500 }}>yours.</span>
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-syne)',
          fontStyle: 'italic',
          fontSize: 17,
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
          maxWidth: 540,
          margin: '0 auto 24px',
        }}
      >
        {data.email
          ? `Confirmation on its way to ${data.email}.`
          : 'A confirmation email is on the way.'}{' '}
        Your guide will reach out 24–48 hours before each experience.
      </p>

      {data.bookingRef && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 22px',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border-strong)',
            background: '#fff',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--text-primary)',
            marginBottom: 32,
          }}
        >
          <span style={{ color: 'var(--text-tertiary)', fontSize: 11, letterSpacing: '0.22em' }}>BOOKING REF</span>
          {data.bookingRef}
        </div>
      )}

      {/* Itinerary card */}
      {data.items.length > 0 && (
        <Card title={`Itinerary · ${data.items.length} experience${data.items.length !== 1 ? 's' : ''}`}>
          {data.items.map((item, i) => (
            <div
              key={i}
              style={{
                padding: '18px 24px',
                borderBottom: i < data.items.length - 1 ? '1px solid var(--border)' : 'none',
                textAlign: 'left',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-syne)',
                  fontWeight: 700,
                  fontSize: 16,
                  letterSpacing: '-0.005em',
                  marginBottom: 6,
                }}
              >
                {item.title}
              </p>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <span>
                  {item.destination} · {formatDate(item.date)} · {item.travelers} traveler
                  {item.travelers !== 1 ? 's' : ''}
                </span>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontWeight: 700, color: 'var(--text-primary)', fontFeatureSettings: '"tnum" 1' }}>
                  {formatMoney(item.lineTotal, data.currency)}
                </span>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Customer block */}
      {(data.customerName || data.email || data.phone || data.country) && (
        <Card title="Your details">
          <DetailRows
            rows={[
              data.customerName && { label: 'Name', value: data.customerName },
              data.email && { label: 'Email', value: data.email },
              data.phone && { label: 'Phone', value: data.phone },
              data.country && { label: 'Country', value: data.country },
            ].filter(Boolean) as { label: string; value: string }[]}
          />
        </Card>
      )}

      {/* Logistics */}
      {(data.pickup || data.dropoff) && (
        <Card title="Pickup &amp; drop-off">
          <DetailRows
            rows={[
              data.pickup && { label: 'Pickup', value: data.pickup, dot: 'var(--emerald)' },
              data.dropoff && { label: 'Drop-off', value: data.dropoff, dot: 'var(--gold)' },
            ].filter(Boolean) as { label: string; value: string; dot?: string }[]}
          />
        </Card>
      )}

      {/* Special requests */}
      {data.specialRequests && (
        <Card title="Special requests" accent>
          <div style={{ padding: '16px 24px', textAlign: 'left' }}>
            <p
              style={{
                fontFamily: 'var(--font-syne)',
                fontStyle: 'italic',
                fontSize: 14.5,
                color: 'var(--text-primary)',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
              }}
            >
              {data.specialRequests}
            </p>
          </div>
        </Card>
      )}

      {/* Breakdown */}
      <Card title="Payment summary">
        <div style={{ padding: '16px 24px 18px' }}>
          {showBreakdown && (
            <>
              {data.subtotal !== null && (
                <BreakdownRow label="Subtotal" value={formatMoney(data.subtotal, data.currency)} />
              )}
              {data.bookingFee !== null && (
                <BreakdownRow label="Service fee" value={formatMoney(data.bookingFee, data.currency)} />
              )}
              {data.transportCost !== null && data.transportCost > 0 && (
                <BreakdownRow
                  label="Private transport"
                  value={formatMoney(data.transportCost, data.currency)}
                />
              )}
              {data.rewardDiscount !== null && data.rewardDiscount > 0 && (
                <BreakdownRow
                  label="Reward discount"
                  value={`− ${formatMoney(data.rewardDiscount, data.currency)}`}
                  emphasis="emerald"
                />
              )}
            </>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              paddingTop: showBreakdown ? 12 : 0,
              marginTop: showBreakdown ? 8 : 0,
              borderTop: showBreakdown ? '1px solid var(--border)' : 'none',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 700,
                fontSize: 14,
                color: 'var(--text-primary)',
              }}
            >
              Total paid
              {data.paidAt && (
                <span
                  style={{
                    display: 'block',
                    marginTop: 2,
                    fontFamily: 'var(--font-dm-sans)',
                    fontStyle: 'normal',
                    fontWeight: 500,
                    fontSize: 11.5,
                    color: 'var(--text-tertiary)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {formatDateTime(data.paidAt)}
                </span>
              )}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontWeight: 800,
                fontSize: 24,
                letterSpacing: '-0.01em',
                color: 'var(--text-primary)',
                fontFeatureSettings: '"tnum" 1',
              }}
            >
              {formatMoney(data.totalPaid, data.currency)}
            </span>
          </div>
        </div>
      </Card>

      {/* Next steps */}
      <Card title="Before you go">
        <div style={{ padding: '14px 24px 18px', textAlign: 'left' }}>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              fontFamily: 'var(--font-syne)',
              fontSize: 14.5,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
            }}
          >
            <li>· Your guide will reach out 24–48 hours before each experience with the meeting point.</li>
            <li>· Bring a valid ID, reef-safe sunscreen, and water.</li>
            <li>· Free cancellation up to 48 hours before the experience — just reply to your confirmation email.</li>
            <li>
              · Questions? Email{' '}
              <Link href="mailto:trips@mapltours.com" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>
                trips@mapltours.com
              </Link>{' '}
              with your booking ref.
            </li>
          </ul>
        </div>
      </Card>
    </div>
  )
}

/* ─── Card primitives ─── */

function Card({
  title,
  accent,
  children,
}: {
  title: string
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        position: 'relative',
        borderRadius: 'var(--r-xl)',
        background: '#fff',
        border: accent ? '1px solid rgba(255, 179, 0, 0.36)' : '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: 16,
        overflow: 'hidden',
        textAlign: 'left',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: 'linear-gradient(90deg, transparent, var(--gold) 50%, transparent)',
          opacity: 0.5,
        }}
      />
      <div
        style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
          }}
          dangerouslySetInnerHTML={{ __html: title }}
        />
      </div>
      {children}
    </section>
  )
}

function DetailRows({
  rows,
}: {
  rows: { label: string; value: string; dot?: string }[]
}) {
  return (
    <div style={{ padding: '8px 24px' }}>
      {rows.map((row, i) => (
        <div
          key={row.label}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            padding: '10px 0',
            borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
            gap: 16,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            {row.dot && (
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: row.dot,
                }}
              />
            )}
            {row.label}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 700,
              fontSize: 14.5,
              color: 'var(--text-primary)',
              textAlign: 'right',
              wordBreak: 'break-word',
            }}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function BreakdownRow({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: 'emerald'
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: 'var(--font-dm-sans)',
        fontSize: 13.5,
        color: 'var(--text-secondary)',
        marginBottom: 6,
      }}
    >
      <span>{label}</span>
      <span
        style={{
          fontFamily: 'var(--font-open-sans)',
          fontFeatureSettings: '"tnum" 1',
          color: emphasis === 'emerald' ? 'var(--emerald)' : 'var(--text-primary)',
          fontWeight: emphasis === 'emerald' ? 700 : 600,
        }}
      >
        {value}
      </span>
    </div>
  )
}

/* ─── State variants ─── */

function Processing() {
  return (
    <div style={{ textAlign: 'center' }}>
      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
          marginBottom: 14,
        }}
      >
        Processing
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 700,
          fontSize: 'clamp(2rem, 4.5vw, 3rem)',
          letterSpacing: '-0.02em',
          marginBottom: 14,
        }}
      >
        Your bank{' '}
        <span style={{ fontStyle: 'italic', fontWeight: 500 }}>is still confirming.</span>
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-syne)',
          fontStyle: 'italic',
          fontSize: 17,
          color: 'var(--text-secondary)',
          maxWidth: 480,
          margin: '0 auto',
          lineHeight: 1.5,
        }}
      >
        We&rsquo;ll email you the moment it clears — usually under a minute.
      </p>
    </div>
  )
}

function Failed() {
  return (
    <div style={{ textAlign: 'center' }}>
      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: '#c00',
          marginBottom: 14,
        }}
      >
        Payment not completed
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 700,
          fontSize: 'clamp(2rem, 4.5vw, 3rem)',
          letterSpacing: '-0.02em',
          marginBottom: 14,
        }}
      >
        Nothing{' '}
        <span style={{ fontStyle: 'italic', fontWeight: 500 }}>was charged.</span>
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-syne)',
          fontStyle: 'italic',
          fontSize: 17,
          color: 'var(--text-secondary)',
          maxWidth: 480,
          margin: '0 auto 24px',
          lineHeight: 1.5,
        }}
      >
        Try another card and your itinerary will be on the books.
      </p>
      <Link href="/checkout" className="btn-primary" style={{ height: 46, padding: '0 26px' }}>
        Try again
      </Link>
    </div>
  )
}

function Unknown() {
  return (
    <div style={{ textAlign: 'center' }}>
      <h1
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 700,
          fontSize: 'clamp(2rem, 4.5vw, 3rem)',
          letterSpacing: '-0.02em',
          marginBottom: 14,
        }}
      >
        We can&rsquo;t find{' '}
        <span style={{ fontStyle: 'italic', fontWeight: 500 }}>that booking.</span>
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-syne)',
          fontStyle: 'italic',
          fontSize: 17,
          color: 'var(--text-secondary)',
          maxWidth: 480,
          margin: '0 auto',
          lineHeight: 1.5,
        }}
      >
        If you just paid, your email will arrive shortly. Otherwise start a
        new trip from the explore page.
      </p>
    </div>
  )
}
