import { NextRequest, NextResponse } from 'next/server'
import { render } from '@react-email/render'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NO_STORE_HEADERS } from '@/lib/no-store'
import { emailKey, type ReferrerRow } from '@/lib/referrals/access'
import { composeAdminView, composeEarnings } from '@/lib/referrals/ledger'
import { cleanLabelLong, readLedger, REFERRER_COLS, sameSiteRequest } from '@/lib/referrals/server'
import { inviteEmail, sendInvite, sendPaidNotice } from '@/lib/referrals/emails'
import { DEFAULT_COMMISSION_PERCENT, MAX_COMMISSION_PERCENT } from '@/lib/referrals/rules'
import { decideResolution } from '@/lib/referrals/resolve'
import { referralWiseFromEnv } from '@/lib/referrals/wise-env'
import { cancelSafely } from '@/lib/payouts/run'

/**
 * The admin's referral desk (components/admin/ReferralDesk). Admins only,
 * checked before the service client is touched, as every admin desk; a
 * change must come from the site's own page (Origin and JSON).
 *
 *   GET                                                  every referrer, their codes, earnings, payouts and log
 *   POST  { action: 'invite', email, name, business?, percent? }   add a referrer and email the invitation
 *   POST  { action: 'preview_invite', name?, email?, percent? }    the invitation as it would look (writes nothing)
 *   POST  { action: 'test_invite', to, name?, percent? }           the invitation to one address, "[Test]", writes nothing
 *   PATCH { action: 'resend', id }                                 the invitation again
 *   PATCH { action: 'status', id, status: 'paused' | 'active' | 'removed' }
 *   PATCH { action: 'rate', id, percent }                          for bookings paid from now on
 *   PATCH { action: 'note', id, note }
 *   PATCH { action: 'code', id, codeId, op: 'hold' | 'release' | 'retire' }
 *   PATCH { action: 'earning', earningId, void: true, reason } | { action: 'earning', earningId, void: false }
 *   PATCH { action: 'resolve_payout', payoutId, outcome: 'paid' | 'not_paid' }   a payout that needed a look: what Wise
 *         shows, checked with Wise before anything is saved (lib/referrals/resolve). A returned payout takes no outcome.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const json = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS })

type Gate = { ok: false; error: NextResponse } | { ok: true; svc: ReturnType<typeof createServiceClient>; actor: string }

async function requireAdmin(): Promise<Gate> {
  const { data: { user } } = await createServerSupabase().auth.getUser()
  if (!user) return { ok: false, error: json(401, { error: 'unauthorized' }) }
  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return { ok: false, error: json(403, { error: 'forbidden' }) }
  return { ok: true, svc, actor: emailKey(user.email) || 'admin' }
}

function percentOf(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_COMMISSION_PERCENT
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > MAX_COMMISSION_PERCENT) return null
  const r = Math.round(n * 100) / 100
  return Math.abs(r - n) < 1e-9 ? r : null
}

async function adminView(svc: ReturnType<typeof createServiceClient>) {
  return composeAdminView(await readLedger(svc, { events: true }), Date.now())
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json()
    return b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : null
  } catch {
    return null
  }
}

export async function GET() {
  const a = await requireAdmin()
  if (!a.ok) return a.error
  try {
    return json(200, { view: await adminView(a.svc) })
  } catch (err) {
    console.error('[admin/referrals] read failed', err instanceof Error ? err.message : 'error')
    return json(503, { error: 'The referrals could not be read. If migration 045 has not been applied, apply it first.' })
  }
}

export async function POST(request: NextRequest) {
  if (!sameSiteRequest(request)) return json(403, { error: 'That request did not come from the admin page.' })
  const a = await requireAdmin()
  if (!a.ok) return a.error
  const b = await readBody(request)
  if (!b) return json(400, { error: 'That request could not be read.' })

  const sample = (): ReferrerRow => ({
    id: '00000000-0000-4000-8000-000000000000',
    email: emailKey(typeof b.email === 'string' ? b.email : '') || 'their.address@example.com',
    name: cleanLabelLong(b.name, 120) ?? 'Their name',
    business: null, status: 'invited', commission_percent: percentOf(b.percent) ?? DEFAULT_COMMISSION_PERCENT,
    user_id: null, invited_at: new Date().toISOString(), invite_sent_at: null, invite_sends: 0, terms_version: null, terms_accepted_at: null,
    wise_recipient_id: null, payout_holder: null, payout_last4: null, payout_legal_type: null, payout_added_at: null, payout_hold_until: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  })

  if (b.action === 'preview_invite') {
    const m = inviteEmail(sample())
    return json(200, { subject: m.subject, html: await render(m.react) })
  }

  if (b.action === 'test_invite') {
    const to = emailKey(typeof b.to === 'string' ? b.to : '')
    if (!EMAIL.test(to)) return json(400, { error: 'Type the address to send the test to.', field: 'to' })
    const ok = await sendInvite(a.svc, sample(), a.actor, { testTo: to })
    return ok ? json(200, { ok: true, message: `A test went to ${to}.` }) : json(502, { error: 'The test did not send. Try again in a moment.' })
  }

  if (b.action !== 'invite') return json(400, { error: 'Unknown action.' })
  const email = emailKey(typeof b.email === 'string' ? b.email : '')
  const name = cleanLabelLong(b.name, 120)
  const business = cleanLabelLong(b.business, 120)
  const percent = percentOf(b.percent)
  if (!EMAIL.test(email) || email.length > 254) return json(400, { error: 'Type the address they sign in with.', field: 'email' })
  if (!name) return json(400, { error: 'Type their name.', field: 'name' })
  if (percent === null) return json(400, { error: `The rate is a percent from 0 to ${MAX_COMMISSION_PERCENT}, at most two decimals.`, field: 'percent' })

  const { data: row, error } = await a.svc
    .from('referrers')
    .insert({ email, name, business, commission_percent: percent, invited_by: a.actor })
    .select(REFERRER_COLS)
    .single()
  if (error) {
    if (error.code === '23505') return json(409, { error: `${email} is already on the list.`, field: 'email' })
    console.error('[admin/referrals] invite insert failed', error.code ?? '')
    return json(500, { error: 'That did not save. Try again in a moment.' })
  }
  await a.svc.from('referral_events').insert({ referrer_id: (row as ReferrerRow).id, kind: 'invited', detail: { percent }, actor: a.actor })
  const sent = await sendInvite(a.svc, row as unknown as ReferrerRow, a.actor)
  let view = null
  try { view = await adminView(a.svc) } catch { /* the page reloads */ }
  return json(200, {
    ok: true,
    sent,
    id: (row as ReferrerRow).id,
    message: sent ? `Invitation sent to ${email}.` : `${name} is on the list, but the invitation did not send. Send it from their card.`,
    view,
  })
}

export async function PATCH(request: NextRequest) {
  if (!sameSiteRequest(request)) return json(403, { error: 'That request did not come from the admin page.' })
  const a = await requireAdmin()
  if (!a.ok) return a.error
  const b = await readBody(request)
  if (!b) return json(400, { error: 'That request could not be read.' })
  const { svc, actor } = a

  const readOne = async (id: unknown): Promise<ReferrerRow | null> => {
    if (typeof id !== 'string' || !UUID.test(id)) return null
    const { data } = await svc.from('referrers').select(REFERRER_COLS).eq('id', id).maybeSingle()
    return (data as unknown as ReferrerRow) ?? null
  }
  const done = async (message: string) => {
    let view = null
    try { view = await adminView(svc) } catch { /* the page reloads */ }
    return json(200, { ok: true, message, view })
  }

  try {
    switch (b.action) {
      case 'resend': {
        const r = await readOne(b.id)
        if (!r || r.status === 'removed') return json(404, { error: 'That referrer was not found.' })
        const sent = await sendInvite(svc, r, actor)
        return sent ? done(`Invitation sent again to ${r.email}.`) : json(502, { error: 'The invitation did not send. Try again in a moment.' })
      }
      case 'status': {
        const r = await readOne(b.id)
        if (!r) return json(404, { error: 'That referrer was not found.' })
        if (b.status !== 'paused' && b.status !== 'active' && b.status !== 'removed') return json(400, { error: 'Unknown status.' })
        const { data, error } = await svc.rpc('set_referrer_status', { p_referrer: r.id, p_status: b.status, p_actor: actor })
        if (error) return json(500, { error: 'That did not save. Try again in a moment.' })
        const res = (data as { result?: string } | null)?.result
        if (res === 'removed') return json(409, { error: 'That referrer was removed and cannot come back. Invite the address again instead.' })
        if (res !== 'done' && res !== 'unchanged') return json(400, { error: 'That did not save.' })
        return done(b.status === 'paused' ? `${r.name} is paused: their codes stop working and payouts wait.` : b.status === 'removed' ? `${r.name} is removed and their codes have ended.` : `${r.name} is back: their codes work again.`)
      }
      case 'rate': {
        const r = await readOne(b.id)
        if (!r || r.status === 'removed') return json(404, { error: 'That referrer was not found.' })
        const percent = b.percent === '' || b.percent == null ? null : percentOf(b.percent)
        if (percent === null) return json(400, { error: `The rate is a percent from 0 to ${MAX_COMMISSION_PERCENT}, at most two decimals.`, field: 'percent' })
        if (Number(r.commission_percent) === percent) return done('The rate is unchanged.')
        const { error } = await svc.from('referrers').update({ commission_percent: percent, updated_at: new Date().toISOString() }).eq('id', r.id).eq('commission_percent', r.commission_percent)
        if (error) return json(500, { error: 'That did not save. Try again in a moment.' })
        await svc.from('referral_events').insert({ referrer_id: r.id, kind: 'rate_changed', detail: { from: Number(r.commission_percent), to: percent }, actor })
        return done(`${r.name} now earns ${percent}% on bookings paid from now on. Bookings already paid keep their rate.`)
      }
      case 'note': {
        const r = await readOne(b.id)
        if (!r) return json(404, { error: 'That referrer was not found.' })
        const note = cleanLabelLong(b.note, 500)
        const { error } = await svc.from('referrers').update({ note, updated_at: new Date().toISOString() }).eq('id', r.id)
        if (error) return json(500, { error: 'That did not save. Try again in a moment.' })
        return done('Note saved.')
      }
      case 'code': {
        const r = await readOne(b.id)
        if (!r) return json(404, { error: 'That referrer was not found.' })
        if (b.op !== 'hold' && b.op !== 'release' && b.op !== 'retire') return json(400, { error: 'Unknown change.' })
        if (typeof b.codeId !== 'string' || !UUID.test(b.codeId)) return json(400, { error: 'Unknown code.' })
        const { data, error } = await svc.rpc('set_referral_code_status', { p_referrer: r.id, p_coupon: b.codeId, p_action: b.op, p_actor: actor })
        if (error) return json(500, { error: 'That did not save. Try again in a moment.' })
        const res = (data as { result?: string } | null)?.result
        if (res === 'done' || res === 'unchanged') return done(b.op === 'hold' ? 'Code paused by MAPL Tours Jamaica. The referrer cannot resume it.' : b.op === 'release' ? 'Code released.' : 'Code retired for good.')
        return json(409, { error: res === 'retired' ? 'That code is already retired.' : 'That code was not found.' })
      }
      case 'earning': {
        if (typeof b.earningId !== 'string' || !UUID.test(b.earningId)) return json(400, { error: 'Unknown booking.' })
        const reason = cleanLabelLong(b.reason, 300)
        if (b.void === true && !reason) return json(400, { error: 'Say why it is not counted. The referrer reads it.', field: 'reason' })
        const { data, error } = await svc.rpc('set_referral_earning_void', { p_earning: b.earningId, p_void: b.void === true, p_reason: reason, p_actor: actor })
        if (error) return json(500, { error: 'That did not save. Try again in a moment.' })
        const res = (data as { result?: string } | null)?.result
        if (res === 'in_payout') return json(409, { error: 'That commission is already in a payout, so it cannot be changed here.' })
        if (res === 'done' || res === 'unchanged') return done(b.void === true ? 'Not counted. The referrer sees why.' : 'Counted again.')
        return json(404, { error: 'That booking was not found.' })
      }
      case 'resolve_payout': {
        if (typeof b.payoutId !== 'string' || !UUID.test(b.payoutId)) return json(400, { error: 'Unknown payout.' })
        const read = await svc
          .from('referral_payouts')
          .select('id, referrer_id, status, resolved_at, amount_usd, account_last4, wise_transfer_id, sent_at, funded_at, notified_at')
          .eq('id', b.payoutId)
          .maybeSingle()
        if (read.error) return json(500, { error: 'That did not save. Try again in a moment.' })
        const p = read.data as null | { id: string; referrer_id: string; status: string; resolved_at: string | null; amount_usd: number | string; account_last4: string | null; wise_transfer_id: number | string | null; sent_at: string | null; funded_at: string | null; notified_at: string | null }
        if (!p || p.resolved_at || (p.status !== 'needs_review' && p.status !== 'returned')) return json(409, { error: 'That payout does not need resolving.' })
        const now = new Date().toISOString()

        // Money that came back: the webhook already freed its commissions; resolving lifts the hold, and the next run pays them.
        if (p.status === 'returned') {
          const { data, error } = await svc.from('referral_payouts').update({ resolved_at: now, updated_at: now }).eq('id', p.id).eq('status', 'returned').is('resolved_at', null).select('id')
          if (error) return json(500, { error: 'That did not save. Try again in a moment.' })
          if (!data || !data.length) return json(409, { error: 'That payout does not need resolving.' })
          await svc.from('referral_events').insert({ referrer_id: p.referrer_id, kind: 'payout_resolved', detail: { payout_id: p.id, outcome: 'returned' }, actor })
          return done('Marked as resolved. The next payout run pays these commissions again.')
        }

        // Needs a look: the admin says what Wise shows, and Wise is asked before anything is written.
        const answer = b.outcome
        if (answer !== 'paid' && answer !== 'not_paid') return json(400, { error: 'Choose what Wise shows: It was paid, or It was not paid.' })
        const transferId = p.wise_transfer_id == null ? null : Number(p.wise_transfer_id)
        const w = transferId ? referralWiseFromEnv() : null
        if (transferId && !w) return json(503, { error: 'Wise is not set up here, so the transfer cannot be checked.' })
        let state: string | null = null
        if (transferId && w) {
          try { state = (await w.wise.getTransfer(transferId)).status } catch { return json(502, { error: 'Wise did not answer. Try again in a moment.' }) }
        }
        const d = decideResolution(answer, state)
        if (!d.ok) return json(409, { error: d.message })
        if (d.cancelFirst && transferId && w && !(await cancelSafely(w.wise, transferId))) {
          return json(502, { error: 'Wise did not cancel the transfer, so nothing was saved. Try again, or cancel it in Wise first.' })
        }
        if (d.status === 'failed') {
          // Free the commissions first: if the next write fails, the payout is still unresolved and holds the
          // referrer, so nothing is paid twice, and the same answer can simply be given again.
          const freed = await svc.from('referral_payout_items').update({ active: false }).eq('payout_id', p.id)
          if (freed.error) return json(500, { error: 'That did not save. Try again in a moment.' })
        }
        const patch: Record<string, unknown> = { status: d.status, resolved_at: now, updated_at: now }
        if (state) patch.wise_state = state
        if (d.status === 'sent') patch.sent_at = p.sent_at ?? now
        if (d.status !== 'failed') patch.funded_at = p.funded_at ?? now
        const { data, error } = await svc.from('referral_payouts').update(patch).eq('id', p.id).eq('status', 'needs_review').is('resolved_at', null).select('id')
        if (error) return json(500, { error: 'That did not save. Try again in a moment.' })
        if (!data || !data.length) return json(409, { error: 'That payout does not need resolving.' })
        await svc.from('referral_events').insert({ referrer_id: p.referrer_id, kind: 'payout_resolved', detail: { payout_id: p.id, outcome: answer, wise_state: state }, actor })
        if (d.status === 'failed') return done('Marked as not paid. The next payout run pays these commissions.')

        // Paid: the referrer gets the payout email the run would have sent, once.
        let mailed = !!p.notified_at
        if (!mailed) {
          try {
            // The id is the payout row's own, not the request's, so it is read as it is.
            const r = ((await svc.from('referrers').select(REFERRER_COLS).eq('id', p.referrer_id).maybeSingle()).data as unknown as ReferrerRow | null) ?? null
            const rows = await readLedger(svc)
            const live = new Set(rows.items.filter((i) => i.payout_id === p.id && i.active).map((i) => i.earning_id))
            const lines = composeEarnings(rows, Date.now()).earnings
              .filter((e) => live.has(e.id))
              .sort((x, y) => (x.lastDay ?? '').localeCompare(y.lastDay ?? '') || x.bookingId.localeCompare(y.bookingId))
              .map((e) => ({ what: e.what, days: e.days, code: e.code, guestPaidCents: e.guestPaidCents, commissionCents: e.commissionCents }))
            if (r && lines.length && p.account_last4) {
              mailed = await sendPaidNotice(r, { payoutId: p.id, amountCents: Math.round(Number(p.amount_usd) * 100), last4: p.account_last4, lines })
              if (mailed) await svc.from('referral_payouts').update({ notified_at: new Date().toISOString() }).eq('id', p.id)
            }
          } catch {
            mailed = false
          }
        }
        return done(mailed ? 'Marked as paid. They have the payout email.' : 'Marked as paid. The payout email did not go: tell them it is in their Wise account.')
      }
      default:
        return json(400, { error: 'Unknown action.' })
    }
  } catch (err) {
    console.error('[admin/referrals] change failed', err instanceof Error ? err.message : 'error')
    return json(500, { error: 'That did not save. Try again in a moment.' })
  }
}
