import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { canSeeConfirmation } from '@/lib/confirm-proof-server'
import { partyCap, partyTripLines, type PartyMemberView } from '@/lib/travel-party'
import { partyView, readPartyRows } from '@/lib/travel-party-server'
import TravelPartyCard from '@/components/checkout/TravelPartyCard'

/**
 * The booker's travel party page (lib/travel-party), opened from the link in
 * their confirmation email on any device. The link's booking proof is moved
 * into the HttpOnly proof cookie by the middleware before this page renders,
 * so the address holds only the booking id; the page then applies the
 * confirmation page's own rule (lib/confirm-proof-server canSeeConfirmation).
 * Anyone else is told where the link is and learns nothing about the booking.
 *
 * It shows what the booker needs to recognise the trip (its reference and
 * what and when), never money or contact details, and it reports no sale and
 * clears no cart: that is the confirmation page's ConfirmClient alone.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your travel party',
  description: 'Send the people traveling with you their own copy of your MAPL Tours Jamaica trip details.',
  robots: { index: false, follow: false },
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type View =
  | { state: 'private' }
  | { state: 'inactive'; ref: string; pending: boolean }
  | { state: 'ok'; ref: string; bookingId: string; kind: 'transfer' | 'tour'; cap: number; lines: string[]; members: PartyMemberView[] }

const refOf = (id: string) => 'MAPL-' + id.slice(0, 8).toUpperCase()

async function load(raw: string | undefined): Promise<View> {
  if (typeof raw !== 'string' || !UUID.test(raw)) return { state: 'private' }
  const svc = createServiceClient()
  const { data: b } = await svc
    .from('bookings')
    .select('id, email, user_id, status, booking_type, booking_items(item_type, title, destination, date, travelers, hotel, trip_type, passengers, arrival_at, departure_at)')
    .eq('id', raw.toLowerCase())
    .maybeSingle()
  if (!b || !(await canSeeConfirmation({ id: b.id, email: b.email ?? null, user_id: b.user_id ?? null }))) return { state: 'private' }
  if (b.status !== 'paid') return { state: 'inactive', ref: refOf(b.id), pending: b.status === 'pending' }
  const items = (b.booking_items ?? []) as Parameters<typeof partyTripLines>[0] & Parameters<typeof partyCap>[0]
  const rows = await readPartyRows(svc, b.id)
  const kind = b.booking_type === 'transfer' ? 'transfer' : 'tour'
  return {
    state: 'ok',
    ref: refOf(b.id),
    bookingId: b.id,
    kind,
    cap: partyCap(items),
    lines: partyTripLines(items, kind === 'transfer'),
    members: rows ? partyView(rows) : [],
  }
}

const eyebrow: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans)', fontSize: 12, fontWeight: 700, letterSpacing: '0.22em',
  textTransform: 'uppercase', color: 'var(--emerald)', margin: '0 0 12px',
}
const h1: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 'clamp(2rem, 5vw, 2.75rem)',
  lineHeight: 1.08, letterSpacing: '-0.02em', margin: '0 0 12px', color: 'var(--text-primary)',
}
const lead: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans)', fontSize: 17, lineHeight: 1.55, color: 'var(--text-secondary)', margin: '0 0 24px',
}

export default async function TravelPartyPage({ searchParams }: { searchParams: { b?: string } }) {
  const view = await load(searchParams.b)

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--nav-h)', background: 'var(--bg-warm)', color: 'var(--text-primary)' }}>
      <div className="container" style={{ maxWidth: 720, padding: 'clamp(40px, 9vw, 72px) 20px' }}>
        {view.state === 'ok' ? (
          <>
            <p style={eyebrow}>Booking {view.ref}</p>
            <h1 style={h1}>Your travel party</h1>
            <p style={lead}>Send the people traveling with you their own copy of your trip details.</p>
            {view.lines.length > 0 && (
              <ul className="tp-trip" aria-label="Your trip">
                {view.lines.map((l) => <li key={l}>{l}</li>)}
              </ul>
            )}
            <TravelPartyCard bookingId={view.bookingId} cap={view.cap} initial={view.members} kind={view.kind} ask={false} />
          </>
        ) : view.state === 'inactive' ? (
          <>
            <p style={eyebrow}>Booking {view.ref}</p>
            <h1 style={h1}>{view.pending ? 'Your payment is still being confirmed.' : 'This booking is not active.'}</h1>
            <p style={lead}>
              {view.pending
                ? 'Open this link again in a minute to add your travel party.'
                : 'There is nothing to send for it. Questions? Write to contact@mapltours.com.'}
            </p>
          </>
        ) : (
          <>
            <h1 style={h1}>Open this from your confirmation email.</h1>
            <p style={lead}>
              To add your travel party, tap &ldquo;Add your travel party&rdquo; in your booking confirmation email. It works on
              any device. Can&rsquo;t find the email? Write to{' '}
              <a href="mailto:contact@mapltours.com" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>contact@mapltours.com</a>.
            </p>
            <Link href="/" className="btn-outline" style={{ height: 46, padding: '0 22px' }}>
              Back to MAPL Tours Jamaica
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
