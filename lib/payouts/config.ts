/**
 * Payouts by Wise: configuration, read from the environment.
 *
 *   WISE_API_TOKEN          personal API token of the Wise Business account (secret; Netlify env only, never the repo)
 *   WISE_PROFILE_ID         the business profile id (MAPL TECH INC.: 154050700 on Nov 15 2026)
 *   WISE_ENV                'production' (default) or 'sandbox'
 *   WISE_BALANCE_ID         optional: the US-dollar balance to pay from (Wise picks it when unset)
 *   WISE_PAYOUT_RECIPIENTS  JSON, name as stored on bookings -> Wise recipient id,
 *                           e.g. {"Collin": 123456789, "Devon Brown": 123456789}. Names
 *                           on one id share a payment. A name not listed is reported, never paid.
 *   WISE_TOUR_PAYEE         the name tours are paid to, one of WISE_PAYOUT_RECIPIENTS (e.g. Collin).
 *                           Unset: tours are reported, never paid.
 *   PAYOUT_FROM             required to send: 'YYYY-MM-DD', the first ride or tour day the job pays.
 *                           Nothing before it is ever paid (rides already paid by hand).
 *   PAYOUT_TRANSIT_BUSINESS_DAYS  optional, default 2: the business days Wise takes to put a payment in
 *                           the account. Each part is sent that many business days before the day it
 *                           should arrive (the day before its trip; lib/payouts/business-days).
 *                           PAYOUT_LEAD_BUSINESS_DAYS (until Nov 21 2026) is refused if set.
 *   WISE_PAYOUTS_ENABLED    exactly '1' to send. Anything else, or unset, keeps every run dry.
 *   PAYOUT_MAX_PAYEE_USD    optional limits (lib/payouts/plan DEFAULT_LIMITS)
 *   PAYOUT_MAX_RUN_USD
 *   PAYOUT_MAX_FEE_USD
 *
 * A problem is reported by the variable's NAME only, never its value.
 */

import { DEFAULT_LIMITS, type PayoutLimits } from './plan'
import { isYmd } from './business-days'
import type { WiseEnv } from '@/lib/wise/client'

export interface PayoutConfig {
  token: string
  env: WiseEnv
  profileId: number
  balanceId: number | null
  recipients: Record<string, number>
  tourPayee: string | null
  fromDay: string
  limits: PayoutLimits
}

/** What a dry run plans with when the configuration is incomplete. */
export interface PayoutPlanSettings {
  recipients: Record<string, number>
  tourPayee: string | null
  fromDay: string | null
  limits: PayoutLimits
}

type Env = Record<string, string | undefined>

const positiveInt = (v: string | undefined): number | null => {
  if (!v || !/^\d+$/.test(v.trim())) return null
  const n = Number(v.trim())
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

const positiveNumber = (v: string | undefined): number | null => {
  if (v == null || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** The recipients map, or null when it is not a JSON object of names to positive whole numbers. */
export function parseRecipients(raw: string | undefined): Record<string, number> | null {
  if (raw == null || raw.trim() === '') return {}
  let j: unknown
  try { j = JSON.parse(raw) } catch { return null }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null
  const out: Record<string, number> = {}
  for (const [name, id] of Object.entries(j as Record<string, unknown>)) {
    const n = typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : NaN
    if (!name.trim() || !Number.isSafeInteger(n) || n <= 0) return null
    out[name.trim()] = n
  }
  return out
}

export function payoutsEnabled(env: Env = process.env): boolean {
  return env.WISE_PAYOUTS_ENABLED === '1'
}

export function readPayoutConfig(env: Env = process.env): { config: PayoutConfig | null; problems: string[]; settings: PayoutPlanSettings } {
  const problems: string[] = []
  const token = (env.WISE_API_TOKEN ?? '').trim()
  if (!token) problems.push('WISE_API_TOKEN not set')
  const profileId = positiveInt(env.WISE_PROFILE_ID)
  if (!profileId) problems.push('WISE_PROFILE_ID not set or not a number')
  const wiseEnv = (env.WISE_ENV ?? 'production').trim() || 'production'
  if (wiseEnv !== 'production' && wiseEnv !== 'sandbox') problems.push('WISE_ENV must be production or sandbox')
  const balanceRaw = env.WISE_BALANCE_ID
  const balanceId = balanceRaw && balanceRaw.trim() ? positiveInt(balanceRaw) : null
  if (balanceRaw && balanceRaw.trim() && !balanceId) problems.push('WISE_BALANCE_ID is not a number')
  const parsed = parseRecipients(env.WISE_PAYOUT_RECIPIENTS)
  if (parsed === null) problems.push('WISE_PAYOUT_RECIPIENTS is not a JSON object of driver names to recipient ids')
  const recipients = parsed ?? {}

  const tourPayee = (env.WISE_TOUR_PAYEE ?? '').trim() || null
  if (tourPayee && parsed && !Object.keys(recipients).some((n) => n.trim().toLowerCase() === tourPayee.toLowerCase())) {
    problems.push('WISE_TOUR_PAYEE is not one of the names in WISE_PAYOUT_RECIPIENTS')
  }

  const fromRaw = (env.PAYOUT_FROM ?? '').trim()
  const fromDay = isYmd(fromRaw) ? fromRaw : null
  if (!fromRaw) problems.push('PAYOUT_FROM not set')
  else if (!fromDay) problems.push('PAYOUT_FROM is not a date (YYYY-MM-DD)')

  const limits: PayoutLimits = { ...DEFAULT_LIMITS }
  for (const [name, field] of [
    ['PAYOUT_MAX_PAYEE_USD', 'maxPayeeUsd'],
    ['PAYOUT_MAX_RUN_USD', 'maxRunUsd'],
    ['PAYOUT_MAX_FEE_USD', 'maxFeeUsd'],
  ] as const) {
    const raw = env[name]
    if (raw == null || raw.trim() === '') continue
    const n = positiveNumber(raw)
    if (n == null) problems.push(`${name} is not a positive number`)
    else limits[field] = n
  }
  // Until Nov 21 2026 the lead was counted back from the trip day, which put weekend
  // money in the account after the trip. A value left set would now mean something else.
  if ((env.PAYOUT_LEAD_BUSINESS_DAYS ?? '').trim() !== '') {
    problems.push('PAYOUT_LEAD_BUSINESS_DAYS is no longer read: remove it (PAYOUT_TRANSIT_BUSINESS_DAYS is the business days Wise takes)')
  }
  const transitRaw = (env.PAYOUT_TRANSIT_BUSINESS_DAYS ?? '').trim()
  if (transitRaw !== '') {
    const n = /^\d{1,2}$/.test(transitRaw) ? Number(transitRaw) : NaN
    if (!(n >= 0 && n <= 10)) problems.push('PAYOUT_TRANSIT_BUSINESS_DAYS is not a whole number from 0 to 10')
    else limits.transitBusinessDays = n
  }

  const settings: PayoutPlanSettings = { recipients, tourPayee, fromDay, limits }
  const config =
    problems.length === 0
      ? { token, env: wiseEnv as WiseEnv, profileId: profileId as number, balanceId, recipients, tourPayee, fromDay: fromDay as string, limits }
      : null
  return { config, problems, settings }
}
