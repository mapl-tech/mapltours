import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PROOF_COOKIE, addProof, proofCookie, readProofs } from '@/lib/confirm-proof'

/**
 * The server half of lib/confirm-proof: minting a booking proof when a
 * checkout route answers with a booking, and deciding whether the request
 * rendering a confirmation page may see that booking.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Derived from the service-role key with a fixed label rather than a new
 * environment variable: that key already exists wherever bookings are read,
 * and a proof only has to outlive the trip. Rotating the key ends every proof,
 * which shows those guests the signed-out page until they sign in.
 */
function signingKey(): Buffer | null {
  const root = process.env.SUPABASE_SERVICE_ROLE_KEY
  return root ? createHmac('sha256', root).update('mapl confirm proof v1').digest() : null
}

/** `b_<booking id without dashes>_<signature>`, or null for a malformed id or no key. */
export function bookingProof(bookingId: string): string | null {
  const key = signingKey()
  if (!key || typeof bookingId !== 'string' || !UUID.test(bookingId)) return null
  const id = bookingId.toLowerCase()
  const sig = createHmac('sha256', key).update(id).digest('base64url').slice(0, 32)
  return `b_${id.replace(/-/g, '')}_${sig}`
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Give the browser that asked proof of the booking a checkout route answered
 * with: a fresh or reused intent (`clientSecret`), a booking a gift card paid
 * in full, or the already-paid twin of the same order (same email, items,
 * amount and codes). Wraps the route's own answer and never changes its
 * status or body; any failure here returns the answer exactly as it was.
 */
export async function withConfirmProof(request: NextRequest, response: Response): Promise<Response> {
  try {
    if (!(response instanceof NextResponse) || response.status !== 200) return response
    if (!(response.headers.get('content-type') ?? '').includes('application/json')) return response
    const body = (await response.clone().json()) as Record<string, unknown> | null
    const bookingId = typeof body?.bookingId === 'string' ? body.bookingId : null
    const names = !!body && (body.alreadyPaid === true || body.fullyCoveredByGift === true || typeof body.clientSecret === 'string')
    if (!bookingId || !names) return response
    const proof = bookingProof(bookingId)
    if (!proof) return response
    const held = request.cookies?.get(PROOF_COOKIE)?.value
    response.cookies.set(proofCookie(addProof(held, proof), new URL(request.url).protocol === 'https:'))
  } catch {
    // The proof is a convenience for the confirmation page; the answer is the
    // payment. Never let one cost the other.
  }
  return response
}

export interface ConfirmOwner {
  /** Null when the intent succeeded but no booking row was found. */
  id: string | null
  email: string | null
  user_id: string | null
}

/**
 * May this request see the booking's full confirmation? Yes for the browser
 * holding its booking proof or the intent's client secret, and for a guest
 * signed in as the booking's owner: the same rule /api/profile/bookings uses
 * (the account the booking is linked to, or the booking's email once
 * verified). Never throws; any doubt is a no, which shows the signed-out page.
 */
export async function canSeeConfirmation(booking: ConfirmOwner, clientSecret?: string | null): Promise<boolean> {
  try {
    const proofs = readProofs(cookies().get(PROOF_COOKIE)?.value)
    const mine = booking.id ? bookingProof(booking.id) : null
    if (mine && proofs.some((p) => same(p, mine))) return true
    if (clientSecret && proofs.some((p) => same(p, clientSecret))) return true
    if (!booking.id) return false

    const { data: { user } } = await createClient().auth.getUser()
    if (!user) return false
    if (booking.user_id && booking.user_id === user.id) return true
    const email = user.email_confirmed_at && user.email ? user.email.trim().toLowerCase() : null
    return !!email && (booking.email ?? '').trim().toLowerCase() === email
  } catch {
    return false
  }
}
