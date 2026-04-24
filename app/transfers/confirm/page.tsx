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

interface ConfirmData {
  status: 'succeeded' | 'processing' | 'failed' | 'unknown'
  bookingRef: string | null
  totalPaid: number | null
  currency: string
  email: string | null
  transfers: Array<{
    destination: string
    zone: string
    tripType: string
    passengers: number
    priceUsd: number
    arrivalAt: string | null
    arrivalFlight: string | null
    departureAt: string | null
    departureFlight: string | null
  }>
}

async function resolveConfirm(piId: string | undefined): Promise<ConfirmData> {
  const empty: ConfirmData = {
    status: 'unknown',
    bookingRef: null,
    totalPaid: null,
    currency: 'USD',
    email: null,
    transfers: [],
  }
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

  const supabase = createServiceClient()
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, email, total_paid, currency, booking_type')
    .eq('stripe_payment_id', piId)
    .eq('booking_type', 'transfer')
    .maybeSingle()

  const { data: items } = booking
    ? await supabase
        .from('booking_items')
        .select(
          'hotel, destination, zone, trip_type, passengers, price_per_person, arrival_at, arrival_flight, departure_at, departure_flight',
        )
        .eq('booking_id', booking.id)
    : { data: null }

  return {
    status: stripeStatus,
    bookingRef: booking ? 'MAPL-' + booking.id.slice(0, 8).toUpperCase() : null,
    totalPaid: booking ? Number(booking.total_paid) : pi.amount / 100,
    currency: (booking?.currency ?? pi.currency ?? 'usd').toUpperCase(),
    email: booking?.email ?? pi.receipt_email ?? null,
    transfers: (items ?? []).map((i) => ({
      destination: i.hotel ?? i.destination,
      zone: i.zone ?? '',
      tripType: i.trip_type ?? 'one_way',
      passengers: i.passengers ?? 1,
      priceUsd: Number(i.price_per_person),
      arrivalAt: i.arrival_at,
      arrivalFlight: i.arrival_flight,
      departureAt: i.departure_at,
      departureFlight: i.departure_flight,
    })),
  }
}

export default async function TransferConfirmPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const data = await resolveConfirm(searchParams.payment_intent)

  return (
    <div
      style={{
        minHeight: '100vh',
        paddingTop: 72,
        background: 'var(--bg)',
        color: 'var(--text-primary)',
      }}
    >
      <div
        className="container"
        style={{ maxWidth: 640, padding: '72px 20px', textAlign: 'center' }}
      >
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
            gap: 14,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link
            href="/explore"
            className="btn-primary"
            style={{ height: 46, padding: '0 28px', fontSize: 14 }}
          >
            Add tours to your trip
          </Link>
          <Link
            href="/transfers"
            style={{
              height: 46,
              padding: '0 24px',
              fontSize: 14,
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 9999,
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              fontFamily: 'var(--font-dm-sans)',
            }}
          >
            Book another transfer
          </Link>
        </div>
      </div>

      {data.status === 'succeeded' && <ConfirmClient />}
    </div>
  )
}

function Success({ data }: { data: ConfirmData }) {
  return (
    <>
      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--emerald, #00A550)',
          marginBottom: 16,
        }}
      >
        Transfer confirmed
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 800,
          fontSize: 'clamp(2rem, 5vw, 3.25rem)',
          lineHeight: 1.05,
          marginBottom: 16,
        }}
      >
        Your ride is booked.
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-syne)',
          fontStyle: 'italic',
          fontSize: 17,
          color: 'var(--text-secondary)',
          maxWidth: 520,
          margin: '0 auto 28px',
        }}
      >
        {data.email
          ? `Confirmation on its way to ${data.email}.`
          : 'Confirmation email on the way.'}{' '}
        Your driver will meet you at arrivals.
      </p>

      {data.bookingRef && (
        <div
          style={{
            display: 'inline-block',
            padding: '12px 22px',
            borderRadius: 12,
            border: '1px solid rgba(255,179,0,0.3)',
            background: 'rgba(255,179,0,0.06)',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--gold, #FFB300)',
            marginBottom: 24,
          }}
        >
          {data.bookingRef}
        </div>
      )}

      {data.transfers.length > 0 && (
        <div
          style={{
            marginTop: 16,
            textAlign: 'left',
            background: 'var(--card-bg)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 16,
            padding: '20px 24px',
          }}
        >
          {data.transfers.map((t, i) => (
            <div
              key={i}
              style={{
                padding: '14px 0',
                borderBottom:
                  i < data.transfers.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-syne)',
                  fontWeight: 700,
                  fontSize: 16,
                  marginBottom: 4,
                }}
              >
                {t.destination}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                }}
              >
                Zone {t.zone} ·{' '}
                {t.tripType === 'round_trip' ? 'Round-trip' : 'One-way'} ·{' '}
                {t.passengers} pax
              </p>
              {t.arrivalAt && (
                <p
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: 12.5,
                    color: 'var(--text-tertiary)',
                    marginTop: 4,
                  }}
                >
                  Arrival: {new Date(t.arrivalAt).toLocaleString()}
                  {t.arrivalFlight ? ` · ${t.arrivalFlight}` : ''}
                </p>
              )}
            </div>
          ))}
          {data.totalPaid !== null && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: 14,
                marginTop: 6,
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                }}
              >
                Total paid
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-syne)',
                  fontWeight: 800,
                  fontSize: 20,
                  color: 'var(--gold, #FFB300)',
                }}
              >
                {data.currency === 'USD' ? '$' : data.currency + ' '}
                {data.totalPaid.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function Processing() {
  return (
    <>
      <h1
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 800,
          fontSize: 'clamp(2rem, 4.5vw, 3rem)',
          marginBottom: 14,
        }}
      >
        Payment processing.
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-syne)',
          fontStyle: 'italic',
          fontSize: 17,
          color: 'var(--text-secondary)',
        }}
      >
        We&rsquo;ll email you the moment your bank confirms — usually under a
        minute.
      </p>
    </>
  )
}

function Failed() {
  return (
    <>
      <h1
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 800,
          fontSize: 'clamp(2rem, 4.5vw, 3rem)',
          marginBottom: 14,
        }}
      >
        Payment didn&rsquo;t go through.
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-syne)',
          fontStyle: 'italic',
          fontSize: 17,
          color: 'var(--text-secondary)',
        }}
      >
        Nothing was charged. Try another card.
      </p>
      <div style={{ marginTop: 24 }}>
        <Link
          href="/transfers/checkout"
          className="btn-primary"
          style={{ height: 46, padding: '0 28px' }}
        >
          Try again
        </Link>
      </div>
    </>
  )
}

function Unknown() {
  return (
    <>
      <h1
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 800,
          fontSize: 'clamp(2rem, 4.5vw, 3rem)',
          marginBottom: 14,
        }}
      >
        We can&rsquo;t find that transfer.
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-syne)',
          fontStyle: 'italic',
          fontSize: 17,
          color: 'var(--text-secondary)',
        }}
      >
        If you just paid, your email will arrive shortly.
      </p>
    </>
  )
}
