import type { Metadata } from 'next'
import Link from 'next/link'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import ConfirmClient from './ConfirmClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Transfer Confirmation',
  description: 'Your MAPL Tours Jamaica airport transfer booking confirmation.',
  robots: { index: false, follow: false },
}

interface SearchParams {
  payment_intent?: string
  redirect_status?: string
}

interface ConfirmedTransfer {
  destination: string
  zone: string
  tripType: 'one_way' | 'round_trip'
  passengers: number
  priceUsd: number
  arrivalAt: string | null
  arrivalFlight: string | null
  departureAt: string | null
  departureFlight: string | null
}

interface ConfirmData {
  status: 'succeeded' | 'processing' | 'failed' | 'unknown'
  bookingRef: string | null
  paidAt: string | null
  customerName: string | null
  email: string | null
  phone: string | null
  country: string | null
  specialRequests: string | null
  subtotal: number | null
  bookingFee: number | null
  totalPaid: number | null
  currency: string
  transfers: ConfirmedTransfer[]
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
    specialRequests: null,
    subtotal: null,
    bookingFee: null,
    totalPaid: null,
    currency: 'USD',
    transfers: [],
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

  const status: ConfirmData['status'] =
    redirectStatus === 'failed' || redirectStatus === 'requires_payment_method'
      ? 'failed'
      : stripeStatus

  const supabase = createServiceClient()
  let { data: booking } = await supabase
    .from('bookings')
    .select(
      'id, email, first_name, last_name, phone, country, special_requests, subtotal, booking_fee, total_paid, currency, paid_at, booking_type',
    )
    .eq('stripe_payment_id', piId)
    .eq('booking_type', 'transfer')
    .maybeSingle()

  // Fall back to metadata.booking_id if attach update never persisted.
  if (!booking && typeof pi.metadata?.booking_id === 'string') {
    const { data: byMeta } = await supabase
      .from('bookings')
      .select(
        'id, email, first_name, last_name, phone, country, special_requests, subtotal, booking_fee, total_paid, currency, paid_at, booking_type',
      )
      .eq('id', pi.metadata.booking_id)
      .eq('booking_type', 'transfer')
      .maybeSingle()
    booking = byMeta
  }

  const { data: items } = booking
    ? await supabase
        .from('booking_items')
        .select(
          'hotel, destination, zone, trip_type, passengers, price_per_person, arrival_at, arrival_flight, departure_at, departure_flight',
        )
        .eq('booking_id', booking.id)
        .eq('item_type', 'transfer')
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
    specialRequests: booking?.special_requests ?? null,
    subtotal: booking?.subtotal != null ? Number(booking.subtotal) : null,
    bookingFee: booking?.booking_fee != null ? Number(booking.booking_fee) : null,
    totalPaid: booking?.total_paid != null ? Number(booking.total_paid) : pi.amount / 100,
    currency: (booking?.currency ?? pi.currency ?? 'usd').toUpperCase(),
    transfers: (items ?? []).map((i) => ({
      destination: i.hotel ?? i.destination,
      zone: i.zone ?? '',
      tripType: ((i.trip_type ?? 'one_way') as 'one_way' | 'round_trip'),
      passengers: i.passengers ?? 1,
      priceUsd: Number(i.price_per_person),
      arrivalAt: i.arrival_at,
      arrivalFlight: i.arrival_flight,
      departureAt: i.departure_at,
      departureFlight: i.departure_flight,
    })),
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

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default async function TransferConfirmPage({
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

        <div
          style={{
            marginTop: 40,
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link href="/explore" className="btn-primary" style={{ height: 46, padding: '0 26px' }}>
            Add tours to your trip
          </Link>
          <Link href="/transfers" className="btn-outline" style={{ height: 46, padding: '0 22px' }}>
            Book another transfer
          </Link>
        </div>
      </div>

      {data.status === 'succeeded' && <ConfirmClient />}
    </div>
  )
}

function Success({ data }: { data: ConfirmData }) {
  const showBreakdown = data.subtotal !== null || data.bookingFee !== null

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
        Transfer confirmed
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
        Your driver{' '}
        <span style={{ fontStyle: 'italic', fontWeight: 500 }}>will be there.</span>
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-syne)',
          fontStyle: 'italic',
          fontSize: 17,
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
          maxWidth: 560,
          margin: '0 auto 24px',
        }}
      >
        {data.email
          ? `Confirmation on its way to ${data.email}.`
          : 'A confirmation email is on the way.'}{' '}
        MAPL dispatch will reach out 24 hours before pickup.
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

      {/* Itinerary card — flight info per leg */}
      {data.transfers.length > 0 && (
        <Card title={`Itinerary · ${data.transfers.length} transfer${data.transfers.length !== 1 ? 's' : ''}`}>
          {data.transfers.map((t, i) => (
            <div
              key={i}
              style={{
                padding: '18px 24px',
                borderBottom: i < data.transfers.length - 1 ? '1px solid var(--border)' : 'none',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                <p
                  style={{
                    fontFamily: 'var(--font-syne)',
                    fontWeight: 700,
                    fontSize: 16,
                    letterSpacing: '-0.005em',
                  }}
                >
                  {t.destination}
                </p>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontWeight: 700, color: 'var(--text-primary)', fontFeatureSettings: '"tnum" 1' }}>
                  {formatMoney(t.priceUsd, data.currency)}
                </span>
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: 12.5,
                  color: 'var(--text-tertiary)',
                  marginBottom: 10,
                }}
              >
                Zone {t.zone} ·{' '}
                {t.tripType === 'round_trip' ? 'Round-trip' : 'One-way'} · {t.passengers} pax
              </p>

              {t.arrivalAt && (
                <Leg
                  label="Arrival · MBJ → hotel"
                  whenLabel={formatDateTime(t.arrivalAt)}
                  flight={t.arrivalFlight}
                  dot="var(--emerald)"
                />
              )}
              {t.tripType === 'round_trip' && t.departureAt && (
                <Leg
                  label="Departure · hotel → MBJ"
                  whenLabel={formatDateTime(t.departureAt)}
                  flight={t.departureFlight}
                  dot="var(--gold)"
                />
              )}
            </div>
          ))}
        </Card>
      )}

      {/* Customer */}
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

      {/* On arrival */}
      <Card title="On arrival at MBJ">
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
            <li>· Clear immigration and collect your bags.</li>
            <li>
              · Exit the terminal at arrivals — your driver will be holding a
              MAPL Tours sign with your name.
            </li>
            <li>
              · 24/7 dispatch:{' '}
              <Link href="mailto:dispatch@mapltours.com" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>
                dispatch@mapltours.com
              </Link>
            </li>
            <li>· Free cancellation up to 24 hours before pickup.</li>
          </ul>
        </div>
      </Card>
    </div>
  )
}

/* ─── Card primitives (mirror the tours confirm page) ─── */

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
        >
          {title}
        </p>
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

function Leg({
  label,
  whenLabel,
  flight,
  dot,
}: {
  label: string
  whenLabel: string | null
  flight: string | null
  dot: string
}) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'flex-start' }}>
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          marginTop: 5,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dot,
          flexShrink: 0,
        }}
      />
      <div>
        <p
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
            marginBottom: 2,
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontFamily: 'var(--font-syne)',
            fontSize: 14,
            color: 'var(--text-primary)',
          }}
        >
          {whenLabel ?? 'Time TBC'}
          {flight ? ` · ${flight}` : ''}
        </p>
      </div>
    </div>
  )
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
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
      <span style={{ fontFamily: 'var(--font-open-sans)', fontFeatureSettings: '"tnum" 1', color: 'var(--text-primary)', fontWeight: 600 }}>
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
        Try another card and we&rsquo;ll have your ride on the books.
      </p>
      <Link href="/transfers/checkout" className="btn-primary" style={{ height: 46, padding: '0 26px' }}>
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
        new booking from the transfers page.
      </p>
    </div>
  )
}
