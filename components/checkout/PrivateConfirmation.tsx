import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'

/**
 * What a confirmation link shows to a browser that did not book it: the
 * booking is confirmed, and the guest's own account is where the trip lives.
 * Nothing about the guest or the trip (lib/confirm-proof), because the link
 * travels in analytics, browser history and forwarded emails.
 *
 * Signing in is the one primary action, because it is the only step that gets
 * the real guest to their details on this device. Most guests book without an
 * account, so the second, quieter button opens the sign-up form directly
 * rather than a "Welcome back" password box. /login sends a signed-in visitor
 * straight on to /profile. Styles live in globals.css (.pc-*).
 */
export default function PrivateConfirmation({
  kind,
  bookingRef,
}: {
  kind: 'ride' | 'trip'
  bookingRef: string | null
}) {
  return (
    <div className="pc">
      <p className="pc-kicker">{kind === 'ride' ? 'Transfer confirmed' : 'Booking confirmed'}</p>
      <h1 className="pc-title">
        Your {kind} <em>is booked.</em>
      </h1>
      <p className="pc-lede">
        To keep your trip private, its details only show on the device you
        booked on, or after you sign&nbsp;in.
      </p>

      {bookingRef && (
        <p className="pc-ref">
          <span>BOOKING REF</span>
          {bookingRef}
        </p>
      )}

      <section className="pc-card" aria-labelledby="private-confirmation-signin">
        <div className="pc-card-body">
          <h2 id="private-confirmation-signin">
            <ShieldCheck aria-hidden size={20} strokeWidth={2.2} />
            See your trip details
          </h2>
          <p className="pc-body">
            Use the email you booked with. Your trip is saved under it, so a new
            account with that email finds it too.
          </p>
          <Link href="/login?redirect=%2Fprofile" className="btn-primary">
            Sign in to see my trip
          </Link>
          {/* Most guests book without an account, so this is their way in. */}
          <Link href="/login?mode=signup&redirect=%2Fprofile" className="btn-outline">
            Create my account
          </Link>
          <p className="pc-note">
            {kind === 'ride'
              ? 'Your account also shows your driver’s name, vehicle and plate before pickup.'
              : 'Your account keeps every booking in one place.'}
          </p>
        </div>
      </section>

      <p className="pc-help">
        Your confirmation email has every detail too. Questions? Email{' '}
        <a href="mailto:contact@mapltours.com">contact@mapltours.com</a> and we will help.
      </p>
    </div>
  )
}
