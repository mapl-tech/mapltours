import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NO_STORE_HEADERS } from '@/lib/no-store'
import { wiseClient } from '@/lib/wise/client'
import { readPayoutConfig, payoutsEnabled } from '@/lib/payouts/config'
import { runDriverPayouts, payoutCounts, PayoutRunError } from '@/lib/payouts/run'
import { supabasePayoutStore } from '@/lib/payouts/store'
import { notifyPayoutRun } from '@/lib/payouts/notify'
import { notifyDriverPaid } from '@/lib/email/driver-paid'
import type { Bk } from '@/lib/dispatch'

/**
 * Payouts by Wise: the daily job (netlify/functions/driver-payouts-cron.mjs).
 * Built Nov 15 2026, changed Nov 18 2026 to pay before each trip.
 *
 * Pays, through Wise from the US-dollar balance, every ride half and every
 * tour whose send day has come: two business days before its day by default,
 * so the money lands before the driver or the operator works
 * (lib/payouts/plan.ts, lib/payouts/run.ts). Nothing with a day before
 * PAYOUT_FROM is ever paid.
 *
 * THE SEND GATE: nothing is sent unless WISE_PAYOUTS_ENABLED is exactly '1'
 * and the Wise configuration is complete. Otherwise every run, the cron's
 * included, is a dry run: it reads the bookings and the ledger and plans, and
 * never calls Wise or writes a row. `?dry=1` makes any run dry and answers
 * with the plan (payee names, amounts and booking references; no guest
 * details). Any other run answers counts only.
 *
 * Auth: CRON_SECRET in `Authorization: Bearer` only, compared in constant
 * time; fails closed when it is unset. Needs migration 038 (driver_payouts,
 * driver_payout_items, claim_driver_payout): before it is applied every run
 * stops at the ledger read and sends nothing.
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

const fail = (status: number, error: string, detail?: unknown) =>
  NextResponse.json({ error, ...(detail ? { detail } : {}) }, { status, headers: NO_STORE_HEADERS })

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return fail(500, 'CRON_SECRET not set')
  if (!authorized(request, secret)) return fail(401, 'unauthorized')

  const enabled = payoutsEnabled()
  const askedDry = request.nextUrl.searchParams.get('dry') === '1'
  const send = enabled && !askedDry
  const { config, problems, settings } = readPayoutConfig()
  if (send && (!config || problems.length)) {
    console.error('[payouts] WISE_PAYOUTS_ENABLED is on but the configuration is incomplete; nothing sent', problems.join(', '))
    return fail(503, 'payouts not configured', problems)
  }

  const nowMs = Date.now()
  const svc = createServiceClient()
  // The driver's "payment sent" email for a ride half the run has just paid
  // and stamped: the console's own email and once-only claim, so a half is
  // announced once whoever paid it. Only for a paid transfer, as the console.
  const notifyPaid = async (bookingId: string, part: 'first' | 'second'): Promise<boolean> => {
    const { data: b, error } = await svc.from('bookings').select('*, booking_items(*)').eq('id', bookingId).maybeSingle()
    if (error || !b || b.booking_type !== 'transfer' || b.status !== 'paid') return false
    const step = part === 'first' ? 'paid_first' : 'paid_second'
    return notifyDriverPaid(svc, b as Bk, step, part, { timeoutMs: 2500, idempotencyKey: `driver-paid/${bookingId}/${step}` })
  }
  try {
    const report = await runDriverPayouts({
      store: supabasePayoutStore(svc, nowMs),
      wise: send && config ? wiseClient({ token: config.token, env: config.env }) : null,
      config: {
        profileId: config?.profileId ?? 0,
        balanceId: config?.balanceId ?? null,
        recipients: config?.recipients ?? settings.recipients,
        tourPayee: config?.tourPayee ?? settings.tourPayee,
        fromDay: config?.fromDay ?? settings.fromDay,
        limits: config?.limits ?? settings.limits,
      },
      send,
      nowMs,
      notify: send ? (r) => notifyPayoutRun(r, nowMs) : undefined,
      notifyPaid: send ? notifyPaid : undefined,
    })
    const counts = payoutCounts(report)
    console.log('[payouts]', JSON.stringify(counts))
    if (counts.needs_review > 0 || counts.failed > 0) console.error('[payouts] payouts that did not go; the operations inbox has the details')
    return NextResponse.json(
      { ...counts, enabled, ...(askedDry ? { plan: report, config_problems: problems } : {}) },
      { headers: NO_STORE_HEADERS },
    )
  } catch (err) {
    const code = err instanceof PayoutRunError ? err.message : 'run_failed'
    console.error('[payouts] run stopped', code)
    return fail(500, 'payout run failed', code)
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
