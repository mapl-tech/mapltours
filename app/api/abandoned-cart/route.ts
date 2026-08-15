import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email/send'
import AbandonedCart from '@/emails/AbandonedCart'

/**
 * Abandoned-cart recovery.
 *
 * A "pending" booking whose PaymentIntent never succeeded is an abandoned
 * cart. This endpoint finds those, verifies with Stripe that nothing was
 * actually charged, and sends one branded recovery email, exactly once.
 *
 * SAFETY: this route is strictly additive. It never creates a charge, never
 * mutates money columns, and never touches the confirmation/webhook path. It
 * only reads bookings and writes the two recovery_* bookkeeping columns.
 *
 * Auth: a shared secret in `?secret=` or `Authorization: Bearer`. Fails
 * closed if CRON_SECRET is unset.
 *
 * Modes:
 *   • cron (default): pending rows older than GRACE_MINUTES and newer than
 *     MAX_AGE_DAYS that have not had a recovery email.
 *   • targeted: `?bookingId=<uuid>` processes exactly that row (still only if
 *     pending + genuinely unpaid + not already recovered).
 */

export const runtime = 'nodejs'
// Declared dynamic on its own merits. Without this the route stays dynamic
// only because it happens to export POST; if that handler were ever removed,
// the GET would be prerendered at build and the cron would poll a frozen body.
export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const GRACE_MINUTES = 30 // give people time to finish before we nudge
const MAX_AGE_DAYS = 7 // don't chase stale carts
const BATCH = 50

function humanizeId(id: string): string {
  return 'MAPL-' + id.slice(0, 8).toUpperCase()
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const url = new URL(request.url)
  const q = url.searchParams.get('secret')
  const header = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return q === secret || header === secret
}

async function handle(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const bookingId = url.searchParams.get('bookingId')
  const supabase = createServiceClient()

  // Candidate abandoned carts.
  let query = supabase
    .from('bookings')
    .select('*, booking_items(*)')
    .eq('status', 'pending')
    .is('recovery_email_sent_at', null)
    .order('created_at', { ascending: false })
    .limit(BATCH)

  if (bookingId) {
    query = supabase
      .from('bookings')
      .select('*, booking_items(*)')
      .eq('id', bookingId)
      .eq('status', 'pending')
      .is('recovery_email_sent_at', null)
      .limit(1)
  }

  const { data: rows, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const now = Date.now()
  const graceMs = GRACE_MINUTES * 60 * 1000
  const maxAgeMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000

  const summary = { scanned: rows?.length ?? 0, emailed: 0, skipped: [] as string[] }

  for (const b of (rows ?? []) as Row[]) {
    const ref = humanizeId(b.id)

    // Basic viability.
    const email = (b.email ?? '').trim()
    if (!email.includes('@')) { summary.skipped.push(`${ref}:no_email`); continue }
    const items = (b.booking_items ?? []) as Row[]
    if (items.length === 0) { summary.skipped.push(`${ref}:no_items`); continue }

    // Time window (skipped in targeted mode).
    if (!bookingId) {
      const age = now - new Date(b.created_at).getTime()
      if (age < graceMs) { summary.skipped.push(`${ref}:too_fresh`); continue }
      if (age > maxAgeMs) { summary.skipped.push(`${ref}:too_old`); continue }
    }

    // Verify with Stripe that this was genuinely NOT paid. Never nudge someone
    // who actually completed payment (protects against any status lag).
    if (!b.stripe_payment_id) { summary.skipped.push(`${ref}:no_pi`); continue }
    try {
      const pi = await stripe.paymentIntents.retrieve(b.stripe_payment_id)
      if (pi.status === 'succeeded') { summary.skipped.push(`${ref}:already_paid`); continue }
      if (pi.status === 'canceled') { summary.skipped.push(`${ref}:canceled`); continue }
    } catch {
      summary.skipped.push(`${ref}:stripe_error`); continue
    }

    // Atomic claim: only one worker wins the NULL → now() transition.
    const nowIso = new Date().toISOString()
    const { data: claimed } = await supabase
      .from('bookings')
      .update({ recovery_email_sent_at: nowIso, recovery_email_count: 1 })
      .eq('id', b.id)
      .is('recovery_email_sent_at', null)
      .select('id')
      .maybeSingle()
    if (!claimed) { summary.skipped.push(`${ref}:claimed_elsewhere`); continue }

    const isTransfer = b.booking_type === 'transfer'
    const currency = (b.currency ?? 'usd').toUpperCase()
    const emailItems = items.map((i) => {
      if (isTransfer) {
        const trip = i.trip_type === 'round_trip' ? 'Round-trip' : 'One-way'
        return {
          title: `Airport transfer to ${i.hotel ?? i.destination}`,
          sub: `Zone ${i.zone ?? ''} · ${trip} · ${plural(i.passengers ?? i.travelers ?? 1, 'passenger')}`.replace(' ·  · ', ' · '),
          price: Number(i.price_per_person),
        }
      }
      return {
        title: i.title,
        sub: [i.destination, fmtDate(i.date), `${i.travelers} traveler${i.travelers !== 1 ? 's' : ''}`]
          .filter(Boolean)
          .join(' · '),
        price: Number(i.price_per_person) * (i.travelers ?? 1),
      }
    })

    const siteBase = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mapltours.com'
    const ctaUrl = isTransfer ? `${siteBase}/transfers` : `${siteBase}/explore`
    const ctaLabel = isTransfer ? 'Finish booking your transfer' : 'Finish planning your trip'

    const res = await sendEmail({
      to: email,
      subject: `Your Jamaica trip is still saved (${ref})`,
      react: AbandonedCart({
        firstName: b.first_name,
        bookingRef: ref,
        currency,
        total: Number(b.total_paid),
        ctaUrl,
        ctaLabel,
        items: emailItems,
      }),
      tags: [
        { name: 'category', value: 'abandoned_cart' },
        { name: 'booking_id', value: b.id },
      ],
    })

    if (res.ok) {
      summary.emailed += 1
    } else {
      // Release the claim so a later run retries.
      await supabase
        .from('bookings')
        .update({ recovery_email_sent_at: null, recovery_email_count: 0 })
        .eq('id', b.id)
      summary.skipped.push(`${ref}:send_failed`)
    }
  }

  return NextResponse.json({ ok: true, ...summary })
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
