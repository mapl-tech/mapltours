import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email/send'
import BookingConfirmed from '@/emails/BookingConfirmed'
import OperatorBookingAlert from '@/emails/OperatorBookingAlert'
import TransferConfirmed from '@/emails/TransferConfirmed'
import TransferOperatorAlert from '@/emails/TransferOperatorAlert'

/**
 * Stripe webhook — single source of truth for payment status.
 *
 * The client-side `onPaymentSuccess` is only an optimistic UI cue. The flip
 * from 'pending' → 'paid', the confirmation email, and the ops notification
 * all happen HERE so a closed browser / failed redirect can't leave a paid
 * cart unfulfilled.
 *
 * Configure in Stripe dashboard → Developers → Webhooks:
 *   Endpoint URL: https://mapltours.com/api/webhooks/stripe
 *   Events:
 *     - payment_intent.succeeded
 *     - payment_intent.payment_failed
 *     - payment_intent.canceled
 *   Copy the "Signing secret" → STRIPE_WEBHOOK_SECRET env var.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

interface BookingItemRow {
  experience_id: number | null
  title: string
  destination: string
  travelers: number
  date: string
  price_per_person: number
  // transfer fields (null for experience items)
  item_type: 'experience' | 'transfer'
  airport: string | null
  hotel: string | null
  zone: string | null
  trip_type: 'one_way' | 'round_trip' | null
  arrival_flight: string | null
  arrival_at: string | null
  departure_flight: string | null
  departure_at: string | null
  passengers: number | null
}

interface BookingRow {
  id: string
  status: string
  booking_type: 'tour' | 'transfer'
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  country: string | null
  pickup: string | null
  dropoff: string | null
  special_requests: string | null
  total_paid: number
  subtotal: number | null
  booking_fee: number | null
  transport_cost: number | null
  reward_discount: number | null
  currency: string
  stripe_payment_id: string | null
  confirmation_email_sent_at: string | null
  operator_email_sent_at: string | null
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 500 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'missing_signature' }, { status: 400 })

  const raw = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'verification_failed'
    console.warn('[stripe-webhook] signature verification failed', msg)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent)
        break
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent)
        break
      case 'payment_intent.canceled':
        await handlePaymentCanceled(event.data.object as Stripe.PaymentIntent)
        break
      default:
        // Ignore unsubscribed events; keep Stripe happy with 200.
        break
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'handler_error'
    console.error('[stripe-webhook] handler threw', event.type, msg)
    // Return 500 so Stripe retries. Idempotency in the handlers makes retries safe.
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function loadBooking(paymentIntentId: string) {
  const supabase = createServiceClient()
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('stripe_payment_id', paymentIntentId)
    .maybeSingle()

  if (error) {
    console.error('[stripe-webhook] booking lookup failed', error)
    return { supabase, booking: null as BookingRow | null, items: [] as BookingItemRow[] }
  }

  if (!booking) return { supabase, booking: null as BookingRow | null, items: [] as BookingItemRow[] }

  const { data: items } = await supabase
    .from('booking_items')
    .select(
      'experience_id, title, destination, travelers, date, price_per_person, item_type, airport, hotel, zone, trip_type, arrival_flight, arrival_at, departure_flight, departure_at, passengers',
    )
    .eq('booking_id', booking.id)

  return { supabase, booking: booking as BookingRow, items: (items ?? []) as BookingItemRow[] }
}

async function handlePaymentSucceeded(pi: Stripe.PaymentIntent) {
  const { supabase, booking, items } = await loadBooking(pi.id)
  if (!booking) {
    console.warn('[stripe-webhook] succeeded for unknown booking', pi.id, pi.metadata)
    return
  }

  // Idempotency — retries are harmless.
  if (booking.status === 'paid') {
    return
  }

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', booking.id)

  if (error) {
    console.error('[stripe-webhook] failed to mark booking paid', error)
    throw new Error(error.message)
  }

  // Emails are best-effort — we do not fail the webhook if they bounce, but
  // we do record sent timestamps so retries can be audited.
  await Promise.allSettled([
    maybeSendTravelerConfirmation(supabase, { ...booking, status: 'paid' }, items),
    maybeSendOperatorAlert(supabase, { ...booking, status: 'paid' }, items),
  ])
}

async function handlePaymentFailed(pi: Stripe.PaymentIntent) {
  const { supabase, booking } = await loadBooking(pi.id)
  if (!booking || booking.status === 'paid') return

  const errMsg =
    pi.last_payment_error?.message ??
    pi.last_payment_error?.code ??
    'payment_failed'

  await supabase
    .from('bookings')
    .update({ status: 'failed', failed_at: new Date().toISOString(), special_requests: booking.special_requests ? `${booking.special_requests}\n[failure: ${errMsg}]` : `[failure: ${errMsg}]` })
    .eq('id', booking.id)
}

async function handlePaymentCanceled(pi: Stripe.PaymentIntent) {
  const { supabase, booking } = await loadBooking(pi.id)
  if (!booking || booking.status === 'paid') return
  await supabase.from('bookings').update({ status: 'canceled' }).eq('id', booking.id)
}

async function maybeSendTravelerConfirmation(
  supabase: ReturnType<typeof createServiceClient>,
  booking: BookingRow,
  items: BookingItemRow[],
) {
  if (booking.confirmation_email_sent_at) return
  if (!booking.email) {
    console.warn('[stripe-webhook] no email on booking', booking.id)
    return
  }

  const bookingRef = humanizeId(booking.id)
  const isTransfer = booking.booking_type === 'transfer'

  const res = isTransfer
    ? await sendEmail({
        to: booking.email,
        subject: `Transfer confirmed — your Jamaica airport ride (${bookingRef})`,
        react: TransferConfirmed({
          bookingRef,
          firstName: booking.first_name,
          totalPaid: Number(booking.total_paid),
          currency: booking.currency.toUpperCase(),
          customerPhone: booking.phone,
          transfers: items.map((i) => ({
            destination: i.hotel ?? i.destination,
            zone: i.zone ?? '',
            tripType: (i.trip_type ?? 'one_way') as 'one_way' | 'round_trip',
            passengers: i.passengers ?? i.travelers,
            priceUsd: Number(i.price_per_person),
            arrivalFlight: i.arrival_flight,
            arrivalAt: i.arrival_at,
            departureFlight: i.departure_flight,
            departureAt: i.departure_at,
          })),
        }),
        tags: [
          { name: 'category', value: 'transfer_confirmed' },
          { name: 'booking_id', value: booking.id },
        ],
      })
    : await sendEmail({
        to: booking.email,
        subject: `Booking confirmed — your Jamaica trip with MAPL (${bookingRef})`,
        react: BookingConfirmed({
          bookingRef,
          firstName: booking.first_name,
          totalPaid: Number(booking.total_paid),
          currency: booking.currency.toUpperCase(),
          pickup: booking.pickup,
          dropoff: booking.dropoff,
          phone: booking.phone,
          items: items.map((i) => ({
            title: i.title,
            destination: i.destination,
            date: i.date,
            travelers: i.travelers,
            linePrice: Number(i.price_per_person) * i.travelers,
          })),
        }),
        tags: [
          { name: 'category', value: 'booking_confirmed' },
          { name: 'booking_id', value: booking.id },
        ],
      })

  if (res.ok) {
    await supabase
      .from('bookings')
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq('id', booking.id)
  }
}

async function maybeSendOperatorAlert(
  supabase: ReturnType<typeof createServiceClient>,
  booking: BookingRow,
  items: BookingItemRow[],
) {
  if (booking.operator_email_sent_at) return
  const opsAddress = process.env.OPERATIONS_EMAIL ?? process.env.EMAIL_SUPPORT
  if (!opsAddress) return

  const bookingRef = humanizeId(booking.id)
  const customerName =
    `${booking.first_name ?? ''} ${booking.last_name ?? ''}`.trim() || 'Guest'
  const isTransfer = booking.booking_type === 'transfer'

  const res = isTransfer
    ? await sendEmail({
        to: opsAddress,
        subject: `Transfer dispatch · ${bookingRef} · ${items.length} ride${items.length !== 1 ? 's' : ''}`,
        react: TransferOperatorAlert({
          bookingRef,
          customerName,
          customerEmail: booking.email ?? '(no email)',
          customerPhone: booking.phone,
          customerCountry: booking.country,
          specialRequests: booking.special_requests,
          totalPaid: Number(booking.total_paid),
          currency: booking.currency.toUpperCase(),
          transfers: items.map((i) => ({
            destination: i.hotel ?? i.destination,
            zone: i.zone ?? '',
            tripType: (i.trip_type ?? 'one_way') as 'one_way' | 'round_trip',
            passengers: i.passengers ?? i.travelers,
            priceUsd: Number(i.price_per_person),
            arrivalFlight: i.arrival_flight,
            arrivalAt: i.arrival_at,
            departureFlight: i.departure_flight,
            departureAt: i.departure_at,
          })),
        }),
        tags: [
          { name: 'category', value: 'transfer_operator_alert' },
          { name: 'booking_id', value: booking.id },
        ],
      })
    : await sendEmail({
        to: opsAddress,
        subject: `New booking · ${bookingRef} · ${items.length} experience${items.length !== 1 ? 's' : ''}`,
        react: OperatorBookingAlert({
          bookingRef,
          customerName,
          customerEmail: booking.email ?? '(no email)',
          customerPhone: booking.phone,
          customerCountry: booking.country,
          pickup: booking.pickup,
          dropoff: booking.dropoff,
          specialRequests: booking.special_requests,
          totalPaid: Number(booking.total_paid),
          currency: booking.currency.toUpperCase(),
          items: items.map((i) => ({
            title: i.title,
            destination: i.destination,
            date: i.date,
            travelers: i.travelers,
            linePrice: Number(i.price_per_person) * i.travelers,
          })),
        }),
        tags: [
          { name: 'category', value: 'operator_alert' },
          { name: 'booking_id', value: booking.id },
        ],
      })

  if (res.ok) {
    await supabase
      .from('bookings')
      .update({ operator_email_sent_at: new Date().toISOString() })
      .eq('id', booking.id)
  }
}

// Short, user-friendly booking reference — first 8 of the uuid, upper-cased.
function humanizeId(id: string): string {
  return 'MAPL-' + id.slice(0, 8).toUpperCase()
}
