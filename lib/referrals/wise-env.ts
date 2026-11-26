import 'server-only'
import { wiseClient } from '@/lib/wise/client'

/**
 * The Wise client the referral routes use, from Netlify env (the same token,
 * profile and balance the driver payouts use). Null when Wise is not set up,
 * so a route can say so instead of throwing.
 */
export function referralWiseFromEnv(timeoutMs = 6000) {
  const token = (process.env.WISE_API_TOKEN ?? '').trim()
  const profileId = Number(process.env.WISE_PROFILE_ID)
  const balanceRaw = (process.env.WISE_BALANCE_ID ?? '').trim()
  const balanceId = /^\d+$/.test(balanceRaw) ? Number(balanceRaw) : null
  const env = process.env.WISE_ENV === 'sandbox' ? 'sandbox' : 'production'
  if (!token || !Number.isSafeInteger(profileId) || profileId <= 0) return null
  return { wise: wiseClient({ token, env, timeoutMs }), config: { profileId, balanceId } }
}
