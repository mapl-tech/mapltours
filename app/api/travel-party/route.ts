import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { canSeeConfirmation } from '@/lib/confirm-proof-server'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { PARTY_COPY, partyCap, partyEmail, type PartyMemberView } from '@/lib/travel-party'
import { addToParty, partyView, readPartyRows, removeFromParty, sendPartyConfirmation } from '@/lib/travel-party-server'

/**
 * The booker's travel party (lib/travel-party), from the confirmation page
 * and the party page their confirmation email links to.
 *
 *   POST    { bookingId, email }  add a person and send them their copy of the
 *           confirmation; for someone already added whose copy did not go,
 *           send it again
 *   DELETE  { bookingId, email }  take a person off: nothing more goes to them
 *
 * Only the browser that booked (its booking proof) or the guest signed in as
 * the booking's owner may change the party: the confirmation page's own rule,
 * lib/confirm-proof-server canSeeConfirmation, without the client-secret path
 * (the checkout always gives the browser that paid its booking proof). Any
 * other caller learns nothing, not even whether the booking exists.
 *
 * Nothing here touches the booking, its payment or the booker's own emails.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Answer {
  ok: boolean
  message?: string
  members?: PartyMemberView[]
  cap?: number
}

const answer = (status: number, body: Answer) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } })

type Booking = {
  id: string
  email: string | null
  user_id: string | null
  status: string
  booking_items: { item_type: string | null; passengers: number | null; travelers: number | null }[] | null
}

/** The booking, when this request may change its party; else the answer to give. */
async function authorize(req: NextRequest, body: unknown): Promise<{ booking: Booking; email: unknown; svc: ReturnType<typeof createServiceClient> } | NextResponse> {
  if (rateLimit(getIp(req), { bucket: 'travel-party', max: 30, windowMs: 60_000 })) {
    return answer(429, { ok: false, message: PARTY_COPY.busy })
  }
  const b = (body ?? {}) as { bookingId?: unknown; email?: unknown }
  if (typeof b.bookingId !== 'string' || !UUID.test(b.bookingId)) return answer(403, { ok: false, message: PARTY_COPY.notAllowed })
  const svc = createServiceClient()
  const { data, error } = await svc
    .from('bookings')
    .select('id, email, user_id, status, booking_items(item_type, passengers, travelers)')
    .eq('id', b.bookingId.toLowerCase())
    .maybeSingle()
  if (error) {
    console.error('[travel-party] booking read failed', error.message)
    return answer(500, { ok: false, message: PARTY_COPY.failed })
  }
  const booking = data as Booking | null
  // The same answer for "no such booking" and "not yours".
  if (!booking || !(await canSeeConfirmation({ id: booking.id, email: booking.email, user_id: booking.user_id }))) {
    return answer(403, { ok: false, message: PARTY_COPY.notAllowed })
  }
  if (booking.status !== 'paid') return answer(409, { ok: false, message: PARTY_COPY.notPaid })
  return { booking, email: b.email, svc }
}

async function list(svc: ReturnType<typeof createServiceClient>, bookingId: string): Promise<PartyMemberView[] | null> {
  const rows = await readPartyRows(svc, bookingId)
  return rows ? partyView(rows) : null
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const auth = await authorize(req, body)
  if (auth instanceof NextResponse) return auth
  const { booking, svc } = auth
  const cap = partyCap(booking.booking_items)
  const email = partyEmail(auth.email)
  if (!email) return answer(400, { ok: false, message: PARTY_COPY.invalid, cap })

  const added = await addToParty(svc, booking.id, email, cap)
  if (!added) return answer(500, { ok: false, message: PARTY_COPY.failed, cap })
  const after = async (status: number, ok: boolean, message: string) =>
    answer(status, { ok, message, cap, members: (await list(svc, booking.id)) ?? undefined })

  switch (added.result) {
    case 'not_paid': return answer(409, { ok: false, message: PARTY_COPY.notPaid, cap })
    case 'own': return answer(409, { ok: false, message: PARTY_COPY.own, cap })
    case 'stopped': return after(409, false, PARTY_COPY.stopped)
    case 'full': return after(409, false, PARTY_COPY.full(added.cap ?? cap))
    case 'exists':
    case 'added': {
      if (!added.id) return answer(500, { ok: false, message: PARTY_COPY.failed, cap })
      const sent = await sendPartyConfirmation(svc, booking.id, added.id)
      if (sent === 'sent') return after(200, true, PARTY_COPY.added(email))
      if (sent === 'already') return after(200, true, PARTY_COPY.exists)
      return after(200, true, PARTY_COPY.addedNotSent(email))
    }
  }
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const auth = await authorize(req, body)
  if (auth instanceof NextResponse) return auth
  const { booking, svc } = auth
  const cap = partyCap(booking.booking_items)
  const email = partyEmail(auth.email)
  if (!email) return answer(400, { ok: false, message: PARTY_COPY.invalid, cap })
  const removed = await removeFromParty(svc, booking.id, email)
  if (!removed) return answer(500, { ok: false, message: PARTY_COPY.failed, cap })
  return answer(200, { ok: true, message: PARTY_COPY.removed(email), cap, members: (await list(svc, booking.id)) ?? undefined })
}
