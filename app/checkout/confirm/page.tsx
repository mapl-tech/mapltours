import type { Metadata } from 'next'
import Link from 'next/link'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import ConfirmClient from './ConfirmClient'

/**
 * Landing page for Stripe's 3DS / bank-authentication redirect
 * (`return_url` on confirmPayment). Reads the payment_intent id from the
 * query string, checks Stripe + our `bookings` row, and renders a success
 * or retry state.
 *
 * The Supabase row is eventually-consistent — the webhook flips status
 * from pending → paid asynchronously — so we prefer Stripe as the source
 * of truth for status here.
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

interface ConfirmData {
  status: 'succeeded' | 'processing' | 'failed' | 'unknown'
  bookingRef: string | null
  totalPaid: number | null
  currency: string
  email: string | null
  items: Array<{
    title: string
    destination: string
    date: string
    travelers: number
    linePrice: number
  }>
}

async function resolveConfirm(piId: string | undefined): Promise<ConfirmData> {
  const empty: ConfirmData = {
    status: 'unknown',
    bookingRef: null,
    totalPaid: null,
    currency: 'USD',
    email: null,
    items: [],
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
    .select('id, email, total_paid, currency')
    .eq('stripe_payment_id', piId)
    .maybeSingle()

  const bookingRef = booking ? humanizeId(booking.id) : null

  const { data: items } = booking
    ? await supabase
        .from('booking_items')
        .select('title, destination, date, travelers, price_per_person')
        .eq('booking_id', booking.id)
    : { data: null }

  return {
    status: stripeStatus,
    bookingRef,
    totalPaid: booking?.total_paid ? Number(booking.total_paid) : pi.amount / 100,
    currency: (booking?.currency ?? pi.currency ?? 'usd').toUpperCase(),
    email: booking?.email ?? pi.receipt_email ?? null,
    items: (items ?? []).map((i) => ({
      title: i.title,
      destination: i.destination,
      date: i.date,
      travelers: i.travelers,
      linePrice: Number(i.price_per_person) * i.travelers,
    })),
  }
}

function humanizeId(id: string): string {
  return 'MAPL-' + id.slice(0, 8).toUpperCase()
}

export default async function ConfirmPage({
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
        background: 'var(--bg)',
        color: 'var(--text-primary)',
      }}
    >
      <div
        className="container"
        style={{
          maxWidth: 640,
          padding: '72px 20px',
          textAlign: 'center',
        }}
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

        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Link href="/explore" className="btn-primary" style={{ height: 46, padding: '0 28px', fontSize: 14 }}>
            Browse more experiences
          </Link>
          <Link
            href="/"
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
            Home
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
        Booking confirmed
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 800,
          fontSize: 'clamp(2.25rem, 5vw, 3.5rem)',
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          marginBottom: 18,
        }}
      >
        Jamaica is yours.
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-syne)',
          fontStyle: 'italic',
          fontSize: 17,
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
          maxWidth: 520,
          margin: '0 auto 28px',
        }}
      >
        {data.email
          ? `A confirmation is on its way to ${data.email}.`
          : 'A confirmation email is on the way.'}{' '}
        Save your booking reference for your guide.
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
            marginBottom: 32,
          }}
        >
          {data.bookingRef}
        </div>
      )}

      {data.items.length > 0 && (
        <div
          style={{
            textAlign: 'left',
            background: 'var(--card-bg)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 16,
            padding: '20px 24px',
            marginTop: 8,
          }}
        >
          {data.items.map((item, i) => (
            <div
              key={i}
              style={{
                padding: '14px 0',
                borderBottom: i < data.items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
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
                {item.title}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                }}
              >
                {item.destination} ·{' '}
                {new Date(item.date).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}{' '}
                · {item.travelers} traveler{item.travelers !== 1 ? 's' : ''}
              </p>
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
          marginBottom: 16,
        }}
      >
        Payment processing.
      </h1>
      <p style={{ fontFamily: 'var(--font-syne)', fontSize: 17, fontStyle: 'italic', color: 'var(--text-secondary)' }}>
        Your bank is still confirming. We&rsquo;ll email you the minute it
        lands — usually under a minute.
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
          marginBottom: 16,
        }}
      >
        Payment didn&rsquo;t go through.
      </h1>
      <p style={{ fontFamily: 'var(--font-syne)', fontSize: 17, fontStyle: 'italic', color: 'var(--text-secondary)' }}>
        Nothing was charged. You can try again with another card below.
      </p>
      <div style={{ marginTop: 28 }}>
        <Link href="/checkout" className="btn-primary" style={{ height: 46, padding: '0 28px' }}>
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
          marginBottom: 16,
        }}
      >
        We can&rsquo;t find that booking.
      </h1>
      <p style={{ fontFamily: 'var(--font-syne)', fontSize: 17, fontStyle: 'italic', color: 'var(--text-secondary)' }}>
        If you just paid, your email will arrive shortly. Otherwise start a new
        trip from the explore page.
      </p>
    </>
  )
}
