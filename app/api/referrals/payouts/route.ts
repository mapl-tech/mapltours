import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NO_STORE_HEADERS } from '@/lib/no-store'
import { wiseClient } from '@/lib/wise/client'
import { sendOpsMessage } from '@/lib/payouts/notify'
import { DEFAULT_REFERRAL_LIMITS, referralCounts, referralRunSummary, ReferralRunError, runReferralPayouts } from '@/lib/referrals/payout-run'
import { supabaseReferralRunStore } from '@/lib/referrals/payout-store'
import { sendPaidNotice } from '@/lib/referrals/emails'

/**
 * Referral payouts by Wise: the daily job (netlify/functions/referral-payouts-cron.mjs,
 * 14:45 UTC, 09:45 in Jamaica). Pays each referrer every commission whose
 * payout day (the Monday after the trip) has come; lib/referrals/payout-run
 * says how.
 *
 * THE SEND GATE: nothing is sent unless REFERRAL_PAYOUTS_ENABLED is exactly
 * '1' and the Wise configuration (WISE_API_TOKEN, WISE_PROFILE_ID) is there.
 * Otherwise every run is dry: it reads and plans and never calls Wise or
 * writes a row. `?dry=1` makes any run dry and answers the plan (referrer
 * names, amounts and booking ids; no guest details).
 *
 * Auth: CRON_SECRET in `Authorization: Bearer`, compared in constant time;
 * fails closed when unset.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorized(request: NextRequest, secret: string): boolean {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')
  if (!m) return false
  const got = Buffer.from(m[1])
  const want = Buffer.from(secret)
  return got.length === want.length && timingSafeEqual(got, want)
}

const fail = (status: number, error: string, detail?: unknown) => NextResponse.json({ error, ...(detail ? { detail } : {}) }, { status, headers: NO_STORE_HEADERS })

const positive = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return v && Number.isFinite(n) && n > 0 ? n : fallback
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return fail(500, 'CRON_SECRET not set')
  if (!authorized(request, secret)) return fail(401, 'unauthorized')

  const enabled = process.env.REFERRAL_PAYOUTS_ENABLED === '1'
  const askedDry = request.nextUrl.searchParams.get('dry') === '1'
  const token = (process.env.WISE_API_TOKEN ?? '').trim()
  const profileId = Number(process.env.WISE_PROFILE_ID)
  const balanceRaw = (process.env.WISE_BALANCE_ID ?? '').trim()
  const balanceId = /^\d+$/.test(balanceRaw) ? Number(balanceRaw) : null
  const configured = !!token && Number.isSafeInteger(profileId) && profileId > 0
  const send = enabled && !askedDry
  if (send && !configured) {
    console.error('[referral-payouts] REFERRAL_PAYOUTS_ENABLED is on but Wise is not configured; nothing sent')
    return fail(503, 'referral payouts not configured')
  }
  const nowMs = Date.now()
  const svc = createServiceClient()
  try {
    const report = await runReferralPayouts({
      store: supabaseReferralRunStore(svc),
      wise: send ? wiseClient({ token, env: process.env.WISE_ENV === 'sandbox' ? 'sandbox' : 'production' }) : null,
      config: {
        profileId: configured ? profileId : 0,
        balanceId,
        limits: {
          maxReferrerUsd: positive(process.env.REFERRAL_MAX_PAYEE_USD, DEFAULT_REFERRAL_LIMITS.maxReferrerUsd),
          maxRunUsd: positive(process.env.REFERRAL_MAX_RUN_USD, DEFAULT_REFERRAL_LIMITS.maxRunUsd),
        },
      },
      send,
      nowMs,
      notifyPaid: send ? (referrer, p) => sendPaidNotice(referrer, { payoutId: p.payoutId, amountCents: p.amountCents, last4: p.last4, lines: p.lines.map((l) => ({ what: l.what, days: l.days, code: l.code, guestPaidCents: l.guestPaidCents, commissionCents: l.amountCents })) }) : undefined,
      notifyOps: send ? async (r) => { const m = referralRunSummary(r); await sendOpsMessage({ subject: m.subject, title: m.subject, body: m.body, lines: m.lines }, `referral-payouts/${r.payDay}/${m.lines.length}`) } : undefined,
    })
    const counts = referralCounts(report)
    console.log('[referral-payouts]', JSON.stringify(counts))
    return NextResponse.json({ ...counts, enabled, ...(askedDry ? { plan: report } : {}) }, { headers: NO_STORE_HEADERS })
  } catch (err) {
    const code = err instanceof ReferralRunError ? err.message : 'run_failed'
    console.error('[referral-payouts] run stopped', code)
    return fail(500, 'referral payout run failed', code)
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
