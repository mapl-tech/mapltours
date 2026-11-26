import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTransferPrice, driverCost } from '@/lib/airport-transfers'
import { couponDiscountCents } from '@/lib/coupons'
import { acceptedTerms, deniedMessage } from '@/lib/referrals/access'
import { composeReferrerView } from '@/lib/referrals/ledger'
import { getReferrerSession, readLedger } from '@/lib/referrals/server'
import { commissionFor, percentText, REFERRAL_DISCOUNT_PERCENT, usd } from '@/lib/referrals/rules'
import { referralTerms } from '@/lib/referrals/terms'
import ReferralBar from '@/components/referrals/ReferralBar'
import ReferralApp from '@/components/referrals/ReferralApp'

/**
 * /referrals: a referrer's page (lib/referrals). Server component: the
 * session decides who this is before anything is read (lib/referrals/access),
 * and anyone who is not a referrer goes to /referrals/login with the reason.
 * No guest's name, contact, hotel or flight reaches this page
 * (lib/referrals/ledger).
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** A real example from today's prices: a round trip to Negril for two, with this referrer's rate. */
function exampleFor(percent: number): string {
  const price = getTransferPrice('sandals-negril', 'round_trip', 2)
  const cost = driverCost('sandals-negril', 'round_trip', 2)
  if (price == null || cost == null) return `Your guests save ${REFERRAL_DISCOUNT_PERCENT}% and you earn ${percentText(percent)} of what they pay.`
  const base = Math.round(price * 100)
  const paid = base - couponDiscountCents('percent', REFERRAL_DISCOUNT_PERCENT, base)
  const c = commissionFor({ totalPaid: paid / 100, subtotal: cost, percent })
  return `For example, an airport ride to Negril and back for two is ${usd(base)}. With your code your guests pay ${usd(paid)}, and you earn ${usd(c.cents)} once their trip has happened.`
}

export default async function ReferralsPage() {
  const s = await getReferrerSession()
  if (!s.ok) {
    if (s.denied === 'not_signed_in') redirect('/referrals/login')
    redirect(`/referrals/login?error=${s.denied}`)
  }

  let view
  try {
    const rows = await readLedger(s.svc, { referrerId: s.referrer.id })
    view = composeReferrerView(rows, rows.referrers[0] ?? s.referrer, Date.now())
  } catch (err) {
    console.error('[referrals] page read failed', err instanceof Error ? err.message : 'error')
    return (
      <div className="ref-page">
        <ReferralBar email={s.user.email} />
        <div className="ref-main" style={{ paddingTop: 'var(--sp-7)' }}>
          <h1 className="ref-h1">Your referrals</h1>
          <p className="ref-lead" role="alert">{deniedMessage('unavailable')}</p>
        </div>
      </div>
    )
  }

  // Which way they signed in, so "sign in again" uses the same door.
  const { data } = await createClient().auth.getUser()
  const provider = data.user?.app_metadata?.provider === 'google' ? 'google' : 'email'

  return (
    <div className="ref-page">
      <ReferralBar email={s.user.email} />
      <div className="ref-main">
        <ReferralApp
          initialView={view}
          needsTerms={!acceptedTerms(s.referrer)}
          terms={referralTerms(view.me.percent)}
          example={exampleFor(view.me.percent)}
          lastSignInAt={s.user.lastSignInAt}
          provider={provider}
        />
      </div>
    </div>
  )
}
