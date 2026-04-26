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
        paddingTop: 56,
        background: 'var(--bg-warm)',
        color: 'var(--text-primary)',
      }}
    >
      <div
        className="container"
        style={{ maxWidth: 720, padding: '80px 20px 80px', textAlign: 'center' }}
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
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link
            href="/explore"
            className="btn-primary"
            style={{ height: 46, padding: '0 26px' }}
          >
            Add tours to your trip
          </Link>
          <Link
            href="/transfers"
            className="btn-outline"
            style={{ height: 46, padding: '0 22px' }}
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
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--emerald)',
          marginBottom: 16,
        }}
      >
        Transfer confirmed
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 700,
          fontSize: 'clamp(2.25rem, 5vw, 3.5rem)',
          lineHeight: 1.02,
          letterSpacing: '-0.025em',
          marginBottom: 16,
        }}
      >
        Your driver{' '}
        <span style={{ fontStyle: 'italic', fontWeight: 500 }}>
          will be there.
        </span>
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-syne)',
          fontStyle: 'italic',
          fontSize: 17,
          color: 'var(--text-secondary)',
          maxWidth: 560,
          margin: '0 auto 28px',
          lineHeight: 1.5,
        }}
      >
        {data.email
          ? `A confirmation is on its way to ${data.email}.`
          : 'A confirmation email is on the way.'}{' '}
        Save your booking reference — your driver will look for it.
      </p>

      {data.bookingRef && (
        <div
          style={{
            display: 'inline-block',
            padding: '12px 22px',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border-strong)',
            background: '#fff',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--text-primary)',
            marginBottom: 32,
          }}
        >
          {data.bookingRef}
        </div>
      )}

      {data.transfers.length > 0 && (
        <div
          style={{
            position: 'relative',
            textAlign: 'left',
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-xl)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
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
              background:
                'linear-gradient(90deg, transparent, var(--gold) 50%, transparent)',
              opacity: 0.55,
            }}
          />
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
                marginBottom: 4,
              }}
            >
              Your itinerary
            </p>
            <h4
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: '-0.005em',
              }}
            >
              {data.transfers.length} transfer
              {data.transfers.length !== 1 ? 's' : ''}
            </h4>
          </div>
          {data.transfers.map((t, i) => (
            <div
              key={i}
              style={{
                padding: '16px 24px',
                borderBottom:
                  i < data.transfers.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-syne)',
                  fontWeight: 700,
                  fontSize: 16,
                  letterSpacing: '-0.005em',
                  marginBottom: 4,
                }}
              >
                {t.destination}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: 12.5,
                  color: 'var(--text-tertiary)',
                  marginBottom: 4,
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
                    color: 'var(--text-secondary)',
                  }}
                >
                  Arrival · {new Date(t.arrivalAt).toLocaleString()}
                  {t.arrivalFlight ? ` · ${t.arrivalFlight}` : ''}
                </p>
              )}
              {t.tripType === 'round_trip' && t.departureAt && (
                <p
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: 12.5,
                    color: 'var(--text-secondary)',
                  }}
                >
                  Departure · {new Date(t.departureAt).toLocaleString()}
                  {t.departureFlight ? ` · ${t.departureFlight}` : ''}
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
                padding: '16px 24px',
                background: 'var(--bg-warm)',
                borderTop: '1px solid var(--border)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                }}
              >
                Total paid
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontWeight: 800,
                  fontSize: 22,
                  letterSpacing: '-0.005em',
                  color: 'var(--text-primary)',
                  fontFeatureSettings: '"tnum" 1',
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
      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
          marginBottom: 16,
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
        <span style={{ fontStyle: 'italic', fontWeight: 500 }}>
          is still confirming.
        </span>
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
    </>
  )
}

function Failed() {
  return (
    <>
      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: '#c00',
          marginBottom: 16,
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
      <Link
        href="/transfers/checkout"
        className="btn-primary"
        style={{ height: 46, padding: '0 26px' }}
      >
        Try again
      </Link>
    </>
  )
}

function Unknown() {
  return (
    <>
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
        <span style={{ fontStyle: 'italic', fontWeight: 500 }}>
          that booking.
        </span>
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
        If you just paid, your email will arrive shortly. Otherwise, start a new
        booking below.
      </p>
    </>
  )
}
