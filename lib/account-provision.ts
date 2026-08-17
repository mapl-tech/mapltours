import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Give a paying guest an account, without ever asking them to make one.
 *
 * Checkout is deliberately open to guests — a signup wall before payment is a
 * measurable drop in completed bookings. But a guest with no account cannot
 * see their itinerary, their trip details, or the cancel button they are
 * entitled to for 48 hours after booking. So the account is created for them
 * at the moment payment clears, from the email they already gave us.
 *
 * The other half of this already existed: app/api/profile/bookings/route.ts
 * matches bookings by VERIFIED email as well as user_id, and stamps user_id
 * onto email-matched rows on first sign-in. This closes the loop by making
 * sure an account exists at all, and by linking the booking immediately so the
 * profile is correct the first time they open it.
 *
 * Everything here is best-effort and never throws. It runs after a successful
 * charge: failing the webhook over an account would have Stripe retry a
 * payment that already went through.
 */

export interface ProvisionResult {
  status: 'created' | 'existing' | 'linked' | 'skipped' | 'failed'
  userId?: string
  /** One-time sign-in link, only ever present for a NEWLY created account. */
  magicLink?: string
}

/** Find an existing auth user by email, or null. */
async function findUserByEmail(
  supabase: ReturnType<typeof createServiceClient>,
  email: string,
): Promise<string | null> {
  // listUsers is paginated and has no exact-email filter in every SDK version,
  // so page through a bounded number of pages rather than assuming page one.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === email)
    if (hit) return hit.id
    if (data.users.length < 200) return null
  }
  return null
}

export async function provisionAccountForBooking(bookingId: string): Promise<ProvisionResult> {
  try {
    const supabase = createServiceClient()

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, email, user_id, first_name, last_name, status')
      .eq('id', bookingId)
      .maybeSingle()

    if (!booking) return { status: 'skipped' }
    // Only ever provision against a booking that actually got paid for.
    if (booking.status !== 'paid') return { status: 'skipped' }
    // Already belongs to someone — either they were signed in, or a previous
    // delivery of this webhook linked it. Nothing to do; this is the retry path.
    if (booking.user_id) return { status: 'existing', userId: booking.user_id as string }

    const email = (booking.email ?? '').trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 'skipped' }

    const existingId = await findUserByEmail(supabase, email)

    let userId = existingId
    let magicLink: string | undefined

    if (!userId) {
      const fullName = [booking.first_name, booking.last_name]
        .map((s) => (s ?? '').trim())
        .filter(Boolean)
        .join(' ')

      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        // They proved control of this address by receiving the booking
        // confirmation at it, and marking it confirmed is what lets the
        // profile's verified-email booking match work at all.
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      })

      if (createErr || !created?.user) {
        // A concurrent delivery may have created it a moment ago; re-check
        // before treating this as a failure.
        const raced = await findUserByEmail(supabase, email)
        if (!raced) {
          console.error('[account-provision] createUser failed', bookingId, createErr?.message)
          return { status: 'failed' }
        }
        userId = raced
      } else {
        userId = created.user.id
        // A sign-in link ONLY for an account we just made. Someone who already
        // had an account signs in the way they always have; emailing them a
        // bypass link they did not ask for would be a gift to anyone reading
        // their inbox.
        magicLink = await generateMagicLink(supabase, email)
      }
    }

    if (!userId) return { status: 'failed' }

    // Link the booking. Conditional on user_id still being NULL so two
    // concurrent deliveries cannot fight over it.
    const { data: linked } = await supabase
      .from('bookings')
      .update({ user_id: userId })
      .eq('id', bookingId)
      .is('user_id', null)
      .select('id')
      .maybeSingle()

    return {
      status: linked ? (magicLink ? 'created' : 'linked') : 'existing',
      userId,
      magicLink,
    }
  } catch (err) {
    console.error('[account-provision] threw', bookingId, err instanceof Error ? err.message : err)
    return { status: 'failed' }
  }
}

/** One-time sign-in link for a brand-new account. Null if it cannot be made. */
async function generateMagicLink(
  supabase: ReturnType<typeof createServiceClient>,
  email: string,
): Promise<string | undefined> {
  try {
    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mapltours.com').replace(/\/$/, '')
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${site}/profile` },
    })
    if (error) {
      console.warn('[account-provision] magic link failed', error.message)
      return undefined
    }
    return data?.properties?.action_link ?? undefined
  } catch (err) {
    console.warn('[account-provision] magic link threw', err instanceof Error ? err.message : err)
    return undefined
  }
}
