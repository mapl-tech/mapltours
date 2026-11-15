import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail, operatorAlertRecipients } from '@/lib/email/send'
import { resolveOpsRecipients } from '@/lib/email/booking'
import AbandonedCart from '@/emails/AbandonedCart'
import { siteUrl } from '@/emails/_Layout'
import { transferTitle } from '@/lib/transfer-legs'
import OpsAlert from '@/emails/OpsAlert'
import { mailboxKey } from '@/lib/contact-spam'
import { guestNames } from '@/lib/guest-name'
import AbandonedCartFollowUp, { followUpSubject, type FollowUpCoupon } from '@/emails/AbandonedCartFollowUp'
import { resolveCoupon } from '@/lib/coupon-lookup'
import {
  FOLLOW_UPS, FOLLOW_UP_COUPON, FOLLOW_UP_LOOKBACK_DAYS, FOLLOW_UP_WINDOW_HOURS, type FollowUpStep,
  cartReminderSecret, cartStopUrl, couponBasis, followUpLink, handoffFromBooking, stillBookable,
} from '@/lib/cart-reminders'

/**
 * Abandoned-cart recovery.
 *
 * A "pending" booking whose PaymentIntent never succeeded is an abandoned
 * cart. This endpoint finds those, verifies with Stripe that nothing was
 * actually charged, and sends one branded recovery email, exactly once.
 *
 * SAFETY: this route is strictly additive. It never creates a charge, never
 * mutates money columns, and never touches the confirmation/webhook path. It
 * only reads bookings and writes the two recovery_* bookkeeping columns, plus
 * one informational `dispatch.paid_but_pending_at` key (through
 * merge_dispatch) on a row whose payment it finds stuck.
 *
 * Auth: a shared secret in `?secret=` or `Authorization: Bearer`. Fails
 * closed if CRON_SECRET is unset.
 *
 * Modes:
 *   • cron (default): pending rows older than GRACE_MINUTES and newer than
 *     MAX_AGE_DAYS that have not had a recovery email.
 *   • targeted: `?bookingId=<uuid>` processes exactly that row (still only if
 *     pending + genuinely unpaid + not already recovered).
 *
 * Anyone can start a checkout with any address and any first name, so the
 * nudge is aimed by whoever typed them: one inbox gets at most one a week
 * (cron mode; Gmail dot and +tag variants are one inbox), and the greeting
 * uses the first name only when it is a name (lib/guest-name).
 *
 * The follow-ups (owner, Nov 15 2026): step 2 three days after the first
 * reminder, without a code, and step 3 seven days after it, with JAMAICA5
 * (recovery_email_count 1 → 2 → 3), each with a button that rebuilds the trip
 * on any device (lib/cart-reminders). A guest who has paid for anything since
 * starting the cart gets no further step. Never a fourth. Every reminder
 * carries a stop link and a one-click List-Unsubscribe; an inbox in
 * cart_reminder_stops (migration 040) gets none, and a run that cannot read
 * that list sends nothing.
 */

export const runtime = 'nodejs'
// Declared dynamic on its own merits. Without this the route stays dynamic
// only because it happens to export POST; if that handler were ever removed,
// the GET would be prerendered at build and the cron would poll a frozen body.
export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const GRACE_MINUTES = 30 // give people time to finish before we nudge
const MAX_AGE_DAYS = 7 // don't chase stale carts

/**
 * How many carts one run will look at, and how long it may spend doing it.
 *
 * Each candidate costs a Stripe round trip (~130 ms) before we know whether to
 * mail it, and each mail costs a render plus a Resend call. A synchronous
 * Netlify function is cut off at 10 seconds, so a batch of 50 could not finish:
 * runs were dying partway through and only ever reaching the newest few rows.
 * With a backlog sitting in the table that is invisible, the sweep looks like
 * it is working while carts behind the backlog are never contacted at all.
 *
 * The batch is now sized to fit, and the deadline is the real guarantee: the
 * loop stops on its own and reports what it left, rather than being killed
 * mid-send. It runs hourly and carts become eligible at 30 minutes, so this is
 * far more headroom than real volume needs.
 */
const BATCH = 12
const DEADLINE_MS = 7_000

/**
 * Paid-but-pending bookings (Stripe took the money, the webhook never flipped
 * the row) are found by the Stripe check in the candidate loop, which only
 * sees the newest BATCH unrecovered rows. Found once, a row is flagged under
 * this dispatch key, and every later run re-reads flagged rows in their own
 * query, with no age limit and no dependence on the candidate window, until
 * the row stops saying pending. That is what makes the digest's "repeats
 * hourly until the rows are healed" true: before, a row stopped alerting
 * after 7 days, or as soon as 12 newer pending rows pushed it out of the
 * window. Informational bookkeeping like the webhook's `refunded_at`; no
 * dispatch step reads it. A succeeded intent never un-succeeds, so a flagged
 * row needs no second Stripe call.
 */
const PAID_PENDING_KEY = 'paid_but_pending_at'
/** Bounds the flagged query. Each row is an incident, so real counts are
 *  tiny; past this many the digest is already on fire. */
const PAID_PENDING_MAX = 50
/** One recovery email per inbox in this many days, across all its carts. */
const INBOX_WEEK_DAYS = 7

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

/** The cart's lines as both reminders show them. */
function emailItemsFor(b: Row): Array<{ title: string; sub: string; price: number }> {
  const isTransfer = b.booking_type === 'transfer'
  return ((b.booking_items ?? []) as Row[]).map((i) => {
    if (isTransfer) {
      const trip = i.trip_type === 'round_trip' ? 'Round-trip' : 'One-way'
      return {
        // Says which way the ride goes: a one-way home is not a "transfer to" the hotel.
        title: transferTitle(i),
        sub: `Zone ${i.zone ?? ''} · ${trip} · ${plural(i.passengers ?? i.travelers ?? 1, 'passenger')}`.replace(' ·  · ', ' · '),
        price: i.line_total != null ? Number(i.line_total) : Number(i.price_per_person),
      }
    }
    return {
      title: i.title,
      sub: [i.destination, fmtDate(i.date), `${i.travelers} traveler${i.travelers !== 1 ? 's' : ''}`]
        .filter(Boolean)
        .join(' · '),
      // The line as checkout recorded it. The per-head figure is a rounded
      // derivation, and multiplying it back put "$381.99" beside a $382.00 total.
      price: i.line_total != null ? Number(i.line_total) : Number(i.price_per_person) * (i.travelers ?? 1),
    }
  })
}

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

  const startedAt = Date.now()
  const summary = {
    scanned: rows?.length ?? 0,
    emailed: 0,
    skipped: [] as string[],
    /** Rows this run never reached. Non-zero means a backlog is building. */
    deferred: 0,
    /** Bookings whose PI SUCCEEDED while the row still says pending: the
     *  webhook missed them. Ops is paged below; non-empty means incident. */
    paidButPending: [] as string[],
    /** Carts due a follow-up this run, and how many were sent. */
    followUpScanned: 0,
    followUpEmailed: 0,
  }
  const paidPendingDetails: { ref: string; id: string; pi: string; createdAt: string }[] = []
  const notePaidPending = (p: { ref: string; id: string; pi: string; createdAt: string }) => {
    if (paidPendingDetails.some((q) => q.id === p.id)) return
    paidPendingDetails.push(p)
    summary.paidButPending.push(p.ref)
  }

  // Paid-but-pending rows an earlier run already caught: their own bounded
  // query, with no age limit and no recovery filter, so they keep alerting
  // until someone heals them however far they have fallen out of the
  // candidate window. Cron mode only; a targeted run is about one row.
  if (!bookingId) {
    const { data: flagged, error: flaggedErr } = await supabase
      .from('bookings')
      .select('id, stripe_payment_id, created_at')
      .eq('status', 'pending')
      .not(`dispatch->${PAID_PENDING_KEY}`, 'is', null)
      .order('created_at', { ascending: true })
      .limit(PAID_PENDING_MAX)
    if (flaggedErr) {
      console.error('[abandoned-cart] flagged paid-but-pending query failed', flaggedErr.message)
    }
    for (const f of (flagged ?? []) as Row[]) {
      notePaidPending({ ref: humanizeId(f.id), id: f.id, pi: f.stripe_payment_id ?? 'no intent id', createdAt: f.created_at })
    }
  }

  /**
   * Verify with Stripe that this cart was genuinely NOT paid. Never nudge
   * someone who actually completed payment (protects against any status lag).
   * Returns 'unpaid', or the reason to skip the row.
   */
  const intentVerdict = async (b: Row, ref: string): Promise<string> => {
    if (!b.stripe_payment_id) return 'no_pi'
    try {
      const pi = await stripe.paymentIntents.retrieve(b.stripe_payment_id)
      if (pi.status === 'succeeded') {
        // The money is captured but the row still says pending, so the
        // webhook never landed (misconfigured endpoint, dropped delivery,
        // handler killed mid-run). Fulfillment lives in the webhook alone —
        // duplicating it here would drift — so the sweep's job is to make
        // the incident LOUD: collect it for the ops digest sent after the
        // loop, and flag the row so every later run re-alerts until it is
        // healed, wherever it sits (see PAID_PENDING_KEY). The 30-minute
        // grace above already filtered ordinary webhook lag out of cron runs.
        notePaidPending({ ref, id: b.id, pi: b.stripe_payment_id, createdAt: b.created_at })
        const { error: flagErr } = await supabase.rpc('merge_dispatch', {
          p_booking_id: b.id,
          p_patch: { [PAID_PENDING_KEY]: new Date().toISOString() },
          p_only_if_absent: PAID_PENDING_KEY,
        })
        if (flagErr) console.error('[abandoned-cart] paid-but-pending flag failed', { booking: b.id, error: flagErr.message })
        return 'already_paid'
      }
      if (pi.status === 'canceled') return 'canceled'
      // In-flight is neither abandoned nor paid (audit 2026-08-22). Deferred
      // settlement methods (ACH debit, Cash App Pay) leave the intent in
      // 'processing' for hours-to-days after the guest completed payment, and
      // 'requires_capture' is authorized money awaiting capture; the booking
      // row stays 'pending' the whole time because only the webhook flips it.
      // Nudging here tells a guest who already paid that their trip was never
      // booked, inviting a second booking and a double charge (checkout's own
      // guard refuses to mint a second intent for these exact statuses). But
      // the money is not provably captured either, so the cart cannot be
      // marked recovered. Skip BEFORE the claim so the recovery columns stay
      // as they are and a later sweep re-evaluates once Stripe resolves the
      // intent one way or the other.
      if (pi.status === 'processing' || pi.status === 'requires_capture') return 'payment_in_flight'
      return 'unpaid'
    } catch {
      return 'stripe_error'
    }
  }

  // Inboxes that asked to stop cart reminders (migration 040). A run that
  // cannot read the list sends nothing: a stop must never be missed.
  const stopSecret = cartReminderSecret()
  const stopsFor = async (emails: string[]): Promise<Set<string> | null> => {
    const keys = Array.from(new Set(emails.filter((e) => e.includes('@')).map((e) => mailboxKey(e))))
    if (!keys.length) return new Set()
    const { data, error: stopsErr } = await supabase.from('cart_reminder_stops').select('inbox').in('inbox', keys)
    if (stopsErr) {
      console.error('[abandoned-cart] reminder stops unreadable; sending nothing this run', stopsErr.message)
      return null
    }
    return new Set(((data ?? []) as Row[]).map((r) => String(r.inbox)))
  }
  const siteBase = siteUrl()
  const stopHeaders = (url: string) => ({ 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })

  // Inboxes nudged in the last week. A query that fails leaves the set empty,
  // which is the sweep as it was before the limit, not a sweep that stops.
  const nudged = new Set<string>()
  if (!bookingId) {
    const since = new Date(now - INBOX_WEEK_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: recent, error: recentErr } = await supabase
      .from('bookings')
      .select('email')
      .gte('recovery_email_sent_at', since)
      .limit(2000)
    if (recentErr) console.error('[abandoned-cart] recent recovery query failed', recentErr.message)
    for (const r of (recent ?? []) as Row[]) if (r.email) nudged.add(mailboxKey(String(r.email)))
  }

  // Inboxes that have PAID for a tour or a ride lately, and when. A guest who
  // reloads checkout and changes the order (party, date, a code) gets a new
  // booking row; the page that knew the first row is gone, so nothing
  // supersedes it. It stays pending with a live intent of its own, and this
  // sweep, which only ever asked Stripe about THAT intent, then wrote "Still
  // thinking it over?" to somebody who had paid an hour earlier. A cart is
  // not abandoned if its guest has since paid for the same kind of booking.
  // A failed read leaves the map empty: the sweep as it was, not one that stops.
  const paidSince = new Map<string, number>()
  {
    const since = new Date(now - FOLLOW_UP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: paidRows, error: paidErr } = await supabase
      .from('bookings')
      .select('email, booking_type, paid_at')
      .eq('status', 'paid')
      .gte('paid_at', since)
      .limit(2000)
    if (paidErr) console.error('[abandoned-cart] recent paid query failed', paidErr.message)
    for (const r of (paidRows ?? []) as Row[]) {
      const at = Date.parse(String(r.paid_at ?? ''))
      if (!r.email || Number.isNaN(at)) continue
      const key = `${r.booking_type ?? 'tour'}:${mailboxKey(String(r.email))}`
      if (at > (paidSince.get(key) ?? 0)) paidSince.set(key, at)
    }
  }

  const firstStops = await stopsFor(((rows ?? []) as Row[]).map((r) => String(r.email ?? '')))

  for (const b of (rows ?? []) as Row[]) {
    // Stop before the platform stops us, so the run ends with a summary
    // instead of a truncated log and a silent backlog.
    if (Date.now() - startedAt > DEADLINE_MS) {
      summary.deferred += 1
      continue
    }
    const ref = humanizeId(b.id)

    // Basic viability.
    const email = (b.email ?? '').trim()
    if (!email.includes('@')) { summary.skipped.push(`${ref}:no_email`); continue }
    const items = (b.booking_items ?? []) as Row[]
    if (items.length === 0) { summary.skipped.push(`${ref}:no_items`); continue }

    // Time window (skipped in targeted mode). Only the grace applies before
    // the Stripe check: a row younger than it is ordinary webhook lag. The
    // 7-day limit is about not nudging stale carts, and is applied after the
    // check, so it can never hide a paid-but-pending row from the digest.
    const age = now - new Date(b.created_at).getTime()
    if (!bookingId && age < graceMs) { summary.skipped.push(`${ref}:too_fresh`); continue }

    const verdict = await intentVerdict(b, ref)
    if (verdict !== 'unpaid') { summary.skipped.push(`${ref}:${verdict}`); continue }

    if (!bookingId && age > maxAgeMs) { summary.skipped.push(`${ref}:too_old`); continue }
    // After the Stripe check, so a paid-but-pending row is still caught.
    const inbox = mailboxKey(email)
    if (!firstStops) { summary.skipped.push(`${ref}:stops_unreadable`); continue }
    if (firstStops.has(inbox)) { summary.skipped.push(`${ref}:stopped`); continue }
    if (!bookingId && nudged.has(inbox)) { summary.skipped.push(`${ref}:inbox_nudged_this_week`); continue }
    // They came back and booked (see paidSince above). In a targeted run too:
    // nobody means to nudge a guest who has paid.
    const bookedAt = paidSince.get(`${b.booking_type ?? 'tour'}:${inbox}`)
    if (bookedAt && bookedAt >= new Date(b.created_at).getTime()) { summary.skipped.push(`${ref}:booked_since`); continue }

    // Atomic claim: only one worker wins the NULL → now() transition.
    const nowIso = new Date().toISOString()
    const { data: claimed } = await supabase
      .from('bookings')
      .update({ recovery_email_sent_at: nowIso, recovery_email_count: 1 })
      .eq('id', b.id)
      // Still an unpaid cart at the moment of the claim: the row was read at
      // the top of the run, and a payment or a supersede can land in between.
      .eq('status', 'pending')
      .is('recovery_email_sent_at', null)
      .select('id')
      .maybeSingle()
    if (!claimed) { summary.skipped.push(`${ref}:claimed_elsewhere`); continue }

    const isTransfer = b.booking_type === 'transfer'
    const currency = (b.currency ?? 'usd').toUpperCase()
    const emailItems = emailItemsFor(b)

    // siteUrl() is always https for the live site (the raw env var is http://).
    // The button opens the checkout itself: on the browser the cart was built
    // in, the trip is still there; anywhere else that page says so and offers
    // the tours and the ride finder.
    const ctaUrl = isTransfer ? `${siteBase}/transfers/checkout` : `${siteBase}/checkout`
    const ctaLabel = isTransfer ? 'Finish booking your transfer' : 'Finish planning your trip'

    const stopUrl = stopSecret ? cartStopUrl(siteBase, b.id, stopSecret) : null
    const res = await sendEmail({
      to: email,
      subject: `Your Jamaica trip is still saved (${ref})`,
      ...(stopUrl ? { headers: stopHeaders(stopUrl) } : {}),
      react: AbandonedCart({
        firstName: guestNames({ full_name: b.first_name }).firstName,
        bookingRef: ref,
        currency,
        total: Number(b.total_paid),
        ctaUrl,
        ctaLabel,
        kind: isTransfer ? 'transfer' : 'tour',
        items: emailItems,
        stopUrl,
      }),
      tags: [
        { name: 'category', value: 'abandoned_cart' },
        { name: 'booking_id', value: b.id },
      ],
    })

    if (res.ok) {
      summary.emailed += 1
      nudged.add(inbox)
    } else {
      // Release the claim so a later run retries.
      await supabase
        .from('bookings')
        .update({ recovery_email_sent_at: null, recovery_email_count: 0 })
        .eq('id', b.id)
      summary.skipped.push(`${ref}:send_failed`)
    }
  }

  // ── The follow-ups (owner, Nov 15 2026): step 2 three days after the
  // first reminder, without a code; step 3 seven days after it, with
  // JAMAICA5. Each moves recovery_email_count by one (the first reminder's
  // time stays in recovery_email_sent_at, so both are measured from it), and
  // a guest who has paid for anything since starting the cart gets neither.
  // Cron mode only.
  if (!bookingId) {
    const hour = 60 * 60 * 1000
    const due: Array<{ step: FollowUpStep; row: Row }> = []
    for (const step of FOLLOW_UPS) {
      const { data, error: dueErr } = await supabase
        .from('bookings')
        .select('*, booking_items(*)')
        .eq('status', 'pending')
        .eq('recovery_email_count', step.step - 1)
        .lte('recovery_email_sent_at', new Date(now - step.afterHours * hour).toISOString())
        .gte('recovery_email_sent_at', new Date(now - (step.afterHours + FOLLOW_UP_WINDOW_HOURS) * hour).toISOString())
        .order('recovery_email_sent_at', { ascending: true })
        .limit(BATCH)
      if (dueErr) console.error('[abandoned-cart] follow-up query failed', { step: step.step, error: dueErr.message })
      for (const row of (data ?? []) as Row[]) due.push({ step, row })
    }
    summary.followUpScanned = due.length

    // The newest cart each inbox started, by kind: a guest who started again
    // after this cart gets that cart's own reminders, not this one's.
    const newestCart = new Map<string, number>()
    if (due.length) {
      const since = new Date(now - FOLLOW_UP_LOOKBACK_DAYS * 24 * hour).toISOString()
      const { data: recentCarts, error: cartsErr } = await supabase
        .from('bookings')
        .select('email, booking_type, created_at')
        .gte('created_at', since)
        .limit(2000)
      if (cartsErr) console.error('[abandoned-cart] recent carts query failed', cartsErr.message)
      for (const r of (recentCarts ?? []) as Row[]) {
        const at = Date.parse(String(r.created_at ?? ''))
        if (!r.email || Number.isNaN(at)) continue
        const key = `${r.booking_type ?? 'tour'}:${mailboxKey(String(r.email))}`
        if (at > (newestCart.get(key) ?? 0)) newestCart.set(key, at)
      }
    }
    const followStops = await stopsFor(due.map((d) => String(d.row.email ?? '')))
    const followedUp = new Set<string>()

    for (const { step, row: b } of due) {
      if (Date.now() - startedAt > DEADLINE_MS) { summary.deferred += 1; continue }
      const ref = humanizeId(b.id)
      const skip = (why: string) => summary.skipped.push(`${ref}:follow_up_${step.step}_${why}`)
      const email = (b.email ?? '').trim()
      if (!email.includes('@')) { skip('no_email'); continue }
      if (!((b.booking_items ?? []) as Row[]).length) { skip('no_items'); continue }
      // The stop link is the one thing these emails may not go without.
      if (!stopSecret) { skip('no_stop_secret'); continue }
      const inbox = mailboxKey(email)
      const created = new Date(b.created_at).getTime()
      if (!followStops) { skip('stops_unreadable'); continue }
      if (followStops.has(inbox)) { skip('stopped'); continue }
      if (followedUp.has(inbox)) { skip('inbox_followed_up'); continue }
      // Booked anything since starting this cart, a tour or a ride: the flow
      // stops (owner, Nov 15 2026). Wider than the first reminder's rule.
      const bookedAt = Math.max(paidSince.get(`tour:${inbox}`) ?? 0, paidSince.get(`transfer:${inbox}`) ?? 0)
      if (bookedAt && bookedAt >= created) { skip('booked_since'); continue }
      if ((newestCart.get(`${b.booking_type ?? 'tour'}:${inbox}`) ?? 0) > created) { skip('newer_cart'); continue }

      // The button rebuilds the trip on any device when one link can carry
      // it; the trip must still be bookable a day from now either way.
      const h = handoffFromBooking(b)
      const link = h ? followUpLink(siteBase, h, step.step) : null
      if (!stillBookable(b, link, now)) { skip('not_bookable'); continue }

      // Step 3 is the code: JAMAICA5, judged by the same rules checkout
      // applies to this cart (once per guest, active, capped at MAPL's
      // margin). Without a usable code it has nothing new to say, so it does
      // not go. Asked before Stripe, so a codeless cart costs no Stripe call.
      let coupon: FollowUpCoupon | null = null
      if (step.coupon) {
        const basis = couponBasis(b)
        const r = basis ? await resolveCoupon(supabase, { code: FOLLOW_UP_COUPON, email, ...basis }) : null
        if (r?.kind === 'ok') {
          coupon = { code: r.row.code, discount: r.check.discountCents / 100, totalWithCode: r.check.chargeCents / 100 }
        }
        if (!coupon) { skip('no_code'); continue }
      }

      const verdict = await intentVerdict(b, ref)
      if (verdict !== 'unpaid') { skip(verdict); continue }

      // Atomic claim: only one worker moves the count to this step.
      const { data: claimed } = await supabase
        .from('bookings')
        .update({ recovery_email_count: step.step })
        .eq('id', b.id)
        .eq('status', 'pending')
        .eq('recovery_email_count', step.step - 1)
        .select('id')
        .maybeSingle()
      if (!claimed) { skip('claimed_elsewhere'); continue }

      const isTransfer = b.booking_type === 'transfer'
      const items = (b.booking_items ?? []) as Row[]
      const only = items.length === 1 ? items[0] : null
      const tourTitle = !isTransfer && only ? String(only.title ?? '') || null : null
      const currency = (b.currency ?? 'usd').toUpperCase()
      const stopUrl = cartStopUrl(siteBase, b.id, stopSecret)
      const props = {
        step: step.step,
        firstName: guestNames({ full_name: b.first_name }).firstName,
        bookingRef: ref,
        currency,
        kind: (isTransfer ? 'transfer' : 'tour') as 'transfer' | 'tour',
        items: emailItemsFor(b),
        total: Number(b.total_paid),
        coupon,
        ctaUrl: link ?? (isTransfer ? `${siteBase}/transfers/checkout` : `${siteBase}/checkout`),
        ctaLabel: isTransfer ? 'Finish booking your ride' : tourTitle ? 'Finish booking your tour' : 'Finish planning your trip',
        anyDevice: !!link,
        tourTitle,
        arrives: isTransfer ? !!(only?.arrival_at || only?.trip_type === 'round_trip') : undefined,
        stopUrl,
      }
      const res = await sendEmail({
        to: email,
        subject: followUpSubject(props),
        headers: stopHeaders(stopUrl),
        react: AbandonedCartFollowUp(props),
        tags: [
          { name: 'category', value: 'abandoned_cart_follow_up' },
          { name: 'step', value: String(step.step) },
          { name: 'booking_id', value: b.id },
        ],
        // A repeat of the same email inside Resend's window delivers once.
        dedupe: `cart-reminder-${step.step}/${b.id}`,
      })
      if (res.ok) {
        summary.followUpEmailed += 1
        followedUp.add(inbox)
        nudged.add(inbox)
      } else {
        // Release the claim so a later run retries.
        await supabase
          .from('bookings')
          .update({ recovery_email_count: step.step - 1 })
          .eq('id', b.id)
          .eq('recovery_email_count', step.step)
        skip('send_failed')
      }
    }
  }

  // Page ops about paid-but-pending rows. One digest per run — the sweep is
  // hourly, so an unresolved incident nags every hour until someone heals the
  // booking (re-send the webhook event from the Stripe dashboard, or flip the
  // row by hand after verifying the charge). Deliberately never marked as
  // alerted: repetition is the feature while money is sitting on an
  // unfulfilled booking, and the PAID_PENDING_KEY flag keeps every caught row
  // in this digest until its status leaves pending, however old it gets.
  // Best-effort — the sweep's own summary must return regardless.
  // Also gated on remaining wall-clock: the loop's deadline leaves ~3s of
  // headroom before Netlify's 10s kill, and the digest's render + Resend
  // round trip must fit inside it or the run dies mid-send and loses its
  // summary — the exact failure the deadline exists to prevent. Skipping is
  // free: nothing is marked alerted, so the next hourly sweep re-alerts.
  if (paidPendingDetails.length > 0 && Date.now() - startedAt < DEADLINE_MS + 1_000) {
    // Same validated-recipient path and empty-list guard every other ops
    // email takes (see maybeSendOperatorAlert) — resolveOpsRecipients()
    // alone does no address validation, and Resend rejects an empty `to`.
    const opsTo = operatorAlertRecipients(resolveOpsRecipients())
    if (opsTo.length === 0) {
      console.error('[abandoned-cart] paid-but-pending ops alert dropped: no_ops_email_configured', {
        bookings: paidPendingDetails.map((p) => p.id),
      })
      return NextResponse.json({ ok: true, ...summary })
    }
    try {
      await sendEmail({
        to: opsTo,
        subject: `ACTION NEEDED: ${plural(paidPendingDetails.length, 'paid booking')} stuck in pending`,
        react: OpsAlert({
          title: 'Paid bookings stuck in pending',
          body: 'Stripe shows these payments as succeeded, but the booking rows still say pending — the webhook never processed them, so no confirmation or dispatch email went out. Re-send the event from Stripe (Dashboard → Webhooks → the endpoint → event → Resend), and check STRIPE_WEBHOOK_SECRET on Netlify if this keeps happening. This alert repeats hourly until the rows are healed.',
          lines: paidPendingDetails.map(
            (p) => `${p.ref} · booking ${p.id} · ${p.pi} · created ${p.createdAt}`,
          ),
        }),
        tags: [{ name: 'category', value: 'ops_alert' }],
      })
    } catch (alertErr) {
      console.error('[abandoned-cart] paid-but-pending ops alert failed', alertErr)
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
