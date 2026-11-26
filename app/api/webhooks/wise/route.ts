import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NO_STORE_HEADERS } from '@/lib/no-store'
import { supabasePayoutStore } from '@/lib/payouts/store'
import { applyTransferState, parseTransferStateEvent, verifyWiseSignature, WISE_WEBHOOK_KEYS } from '@/lib/payouts/webhook'
import { sendOpsMessage } from '@/lib/payouts/notify'
import { referralEventStore } from '@/lib/referrals/payout-store'

/**
 * Wise webhook: `transfers#state-change` for the driver payouts
 * (lib/payouts/webhook.ts). Built Nov 15 2026 and NOT LIVE: Wise sends
 * nothing here until a subscription is created (GO-LIVE.md section 10).
 *
 * Every request must carry a valid `X-Signature-SHA256` from Wise's key for
 * WISE_ENV (production unless it says sandbox); anything else is refused
 * before the body is read as JSON. Only events for WISE_PROFILE_ID, and only
 * transfers this job created, change anything. Wise retries anything that is
 * not a 200, so a database failure answers 500 and the event comes back.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const answer = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS })

export async function POST(request: NextRequest) {
  const raw = await request.text()
  const env = process.env.WISE_ENV === 'sandbox' ? 'sandbox' : 'production'
  if (!verifyWiseSignature(raw, request.headers.get('x-signature-sha256'), WISE_WEBHOOK_KEYS[env])) {
    return answer(401, { error: 'bad signature' })
  }
  if (request.headers.get('x-test-notification') === 'true') return answer(200, { ok: true, test: true })

  let body: unknown
  try { body = JSON.parse(raw) } catch { return answer(400, { error: 'bad json' }) }
  const ev = parseTransferStateEvent(body)
  if (!ev) return answer(200, { ok: true, ignored: 'not a transfer state change' })
  const profileId = Number(process.env.WISE_PROFILE_ID)
  if (!profileId || ev.profileId !== profileId) return answer(200, { ok: true, ignored: 'another profile' })

  try {
    const nowIso = new Date().toISOString()
    const svc = createServiceClient()
    let result = await applyTransferState(supabasePayoutStore(svc, Date.now()), ev, nowIso)
    // Not a driver payout: perhaps a referral payout (lib/referrals, migration 045), the same states.
    let kind: 'Driver payout' | 'Referral payout' = 'Driver payout'
    if (result.outcome === 'ignored') {
      result = await applyTransferState(referralEventStore(svc), ev, nowIso)
      kind = 'Referral payout'
    }
    if (result.tell) {
      await sendOpsMessage(
        { subject: `${kind}: Wise has news`, title: `${kind}: Wise has news`, body: result.tell, lines: [`Transfer ${ev.transferId}: ${ev.state} at ${ev.occurredAt ?? nowIso}`] },
        `${kind === 'Driver payout' ? 'driver-payouts' : 'referral-payouts'}/webhook/${ev.transferId}/${ev.state}`,
      ).catch(() => false)
    }
    console.log('[wise-webhook]', JSON.stringify({ transfer: ev.transferId, state: ev.state, outcome: result.outcome, kind: result.outcome === 'ignored' ? null : kind }))
    return answer(200, { ok: true, outcome: result.outcome })
  } catch (err) {
    console.error('[wise-webhook] not applied; Wise will retry', err instanceof Error ? err.message : 'error')
    return answer(500, { error: 'not applied' })
  }
}
