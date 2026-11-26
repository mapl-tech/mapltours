import { redirect } from 'next/navigation'
import { deniedMessage, type ReferralDenied } from '@/lib/referrals/access'
import { getReferrerSession } from '@/lib/referrals/server'
import ReferralBar from '@/components/referrals/ReferralBar'
import ReferralLogin from '@/components/referrals/ReferralLogin'

/**
 * /referrals/login: the referral program's own sign-in (owner, Nov 26 2026:
 * "The refer login should have it's own slug"). A signed-in referrer goes
 * straight to their page; anyone else sees why they are here, in plain words.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function ReferralLoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const s = await getReferrerSession()
  if (s.ok) redirect('/referrals')
  // Signed in but not a referrer: the live session says why. Signed out: nothing to say, unless the
  // referral page itself could not be read a moment ago.
  const signedIn = s.denied !== 'not_signed_in'
  const reason: ReferralDenied | 'unavailable' | null = signedIn ? s.denied : searchParams.error === 'unavailable' ? 'unavailable' : null
  return (
    <div className="ref-page">
      <ReferralBar />
      <ReferralLogin message={reason ? deniedMessage(reason, s.email) : null} signedInAs={signedIn ? s.email ?? null : null} />
    </div>
  )
}
