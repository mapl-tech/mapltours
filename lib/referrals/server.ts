import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { SITE_ORIGIN } from '@/lib/site-origin'
import { emailKey, mayCreateCodes, resolveReferrerAccess, type ReferralDenied, type ReferrerRow } from './access'
import {
  codeProblem, codeProblemMessage, cleanLabel, normalizeReferralCode,
  MAX_LIVE_CODES, REFERRAL_DISCOUNT_PERCENT, TERMS_VERSION,
} from './rules'
import type { CodeRow, EarningRow, EventRow, LedgerBooking, LedgerRows, PayoutItemRow, ReferralPayoutRow } from './ledger'

/**
 * The referral program's database and session (lib/referrals, migration 045).
 * Everything a referral route or page reads or writes goes through here, and
 * every write names the referrer from the SESSION, never from the request:
 * the database functions then refuse a code that is not theirs.
 *
 * Reads are service role (the tables have no browser policies); the session
 * decides who is asking first. A read that fails throws, and the caller shows
 * "unavailable": nothing is ever decided on half the rows.
 */

type DB = SupabaseClient

export const REFERRER_COLS =
  'id, email, name, business, status, commission_percent, user_id, invited_at, invite_sent_at, invite_sends, terms_version, terms_accepted_at, wise_recipient_id, payout_holder, payout_last4, payout_legal_type, payout_added_at, payout_hold_until, note, created_at, updated_at, removed_at'
export const CODE_COLS = 'id, referrer_id, code, note, status, referral_hold, uses, created_at, retired_at'
export const EARNING_COLS = 'id, booking_id, referrer_id, coupon_id, code, commission_percent, recorded_late, voided_at, void_reason, voided_by, created_at'
export const LEDGER_BOOKING_COLS =
  'id, status, booking_type, total_paid, subtotal, coupon_discount, refund_state, refunded_at, created_at, booking_items(item_type, title, trip_type, date, arrival_at, departure_at)'
export const PAYOUT_COLS =
  'id, referrer_id, payee, recipient_id, account_last4, amount_usd, fee_usd, status, wise_transfer_id, pay_day, error, created_at, funded_at, sent_at, resolved_at'
export const ITEM_COLS = 'id, payout_id, earning_id, booking_id, amount_usd, active'
export const EVENT_COLS = 'id, referrer_id, kind, detail, actor, created_at'

export interface SessionUser {
  id: string
  email: string
  /** When this person last signed in (not a token refresh): the age a payout change is checked against. */
  lastSignInAt: string | null
}

export type ReferrerSession =
  | { ok: true; referrer: ReferrerRow; user: SessionUser; svc: DB }
  | { ok: false; denied: ReferralDenied | 'unavailable'; email?: string }

/** The signed-in person as a referrer, or why not. Any doubt denies. */
export async function getReferrerSession(): Promise<ReferrerSession> {
  let user: { id: string; email?: string | null; email_confirmed_at?: string | null; confirmed_at?: string | null; last_sign_in_at?: string | null } | null = null
  try {
    const { data } = await createClient().auth.getUser()
    user = data.user
  } catch {
    return { ok: false, denied: 'unavailable' }
  }
  if (!user?.email) return { ok: false, denied: 'not_signed_in' }
  const email = emailKey(user.email)
  let svc: DB
  try {
    svc = createServiceClient()
  } catch {
    return { ok: false, denied: 'unavailable', email }
  }
  // Stored lower case (a CHECK in 045), so equality is exact: no pattern, no wildcard.
  const { data: rows, error } = await svc.from('referrers').select(REFERRER_COLS).eq('email', email)
  if (error) {
    console.error('[referrals] could not read referrers', error.code ?? '')
    return { ok: false, denied: 'unavailable', email }
  }
  const res = resolveReferrerAccess({ email, confirmed: !!(user.email_confirmed_at || user.confirmed_at), rows: (rows ?? []) as unknown as ReferrerRow[] })
  if (!res.ok) return { ok: false, denied: res.denied, email }
  return { ok: true, referrer: res.referrer, user: { id: user.id, email, lastSignInAt: user.last_sign_in_at ?? null }, svc }
}

/* ── Reads ───────────────────────────────────────────────────────────── */

function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.code ?? res.error.message}`)
  return (res.data ?? []) as T
}

async function inChunks<T>(ids: string[], read: (chunk: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 150) {
    out.push(...must(await read(ids.slice(i, i + 150)) as { data: T[] | null; error: { message: string } | null }, what))
  }
  return out
}

/**
 * The rows behind one referrer's page, or behind the admin page (no id).
 * Bookings are read only for the referrer's own earnings, with only the
 * columns the ledger needs: never a guest's name or contact.
 */
export async function readLedger(svc: DB, scope: { referrerId?: string; events?: boolean } = {}): Promise<LedgerRows> {
  const id = scope.referrerId
  const [referrers, codes, earnings, payouts] = await Promise.all([
    (async () => (id
      ? must(await svc.from('referrers').select(REFERRER_COLS).eq('id', id), 'referrers')
      : must(await svc.from('referrers').select(REFERRER_COLS).order('created_at', { ascending: true }).limit(2000), 'referrers')) as unknown as ReferrerRow[])(),
    (async () => (id
      ? must(await svc.from('coupons').select(CODE_COLS).eq('referrer_id', id), 'coupons')
      : must(await svc.from('coupons').select(CODE_COLS).not('referrer_id', 'is', null).limit(20000), 'coupons')) as unknown as CodeRow[])(),
    (async () => (id
      ? must(await svc.from('referral_earnings').select(EARNING_COLS).eq('referrer_id', id).limit(20000), 'referral_earnings')
      : must(await svc.from('referral_earnings').select(EARNING_COLS).limit(20000), 'referral_earnings')) as unknown as EarningRow[])(),
    (async () => (id
      ? must(await svc.from('referral_payouts').select(PAYOUT_COLS).eq('referrer_id', id), 'referral_payouts')
      : must(await svc.from('referral_payouts').select(PAYOUT_COLS).limit(20000), 'referral_payouts')) as unknown as ReferralPayoutRow[])(),
  ])
  const bookingIds = Array.from(new Set(earnings.map((e) => e.booking_id)))
  const payoutIds = payouts.map((p) => p.id)
  const [bookings, items, events] = await Promise.all([
    inChunks<LedgerBooking>(bookingIds, (c) => svc.from('bookings').select(LEDGER_BOOKING_COLS).in('id', c), 'bookings'),
    inChunks<PayoutItemRow>(payoutIds, (c) => svc.from('referral_payout_items').select(ITEM_COLS).in('payout_id', c), 'referral_payout_items'),
    scope.events
      ? (async () => must(await svc.from('referral_events').select(EVENT_COLS).order('created_at', { ascending: false }).limit(1000), 'referral_events') as unknown as EventRow[])()
      : Promise.resolve([] as EventRow[]),
  ])
  return { referrers, codes, earnings, bookings, payouts, items, events }
}

/* ── Requests ────────────────────────────────────────────────────────── */

/**
 * A state-changing request must come from this site's own pages: the browser
 * sends Origin on every POST, PATCH and DELETE, and the referral routes take
 * only JSON (a cross-site form cannot send it without a preflight, which is
 * never allowed). Behind the custom domain the function's own URL is
 * Netlify's per-deploy host, so that origin is accepted too.
 */
export function sameSiteRequest(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return false
  const allowed = new Set([SITE_ORIGIN, 'https://www.mapltours.com'])
  try { allowed.add(new URL(req.url).origin) } catch { /* no URL: only the site */ }
  const fwd = req.headers.get('x-forwarded-host')
  if (fwd && /^[a-z0-9.-]+(:\d+)?$/i.test(fwd)) allowed.add(`https://${fwd}`)
  const ct = (req.headers.get('content-type') ?? '').toLowerCase()
  return allowed.has(origin) && ct.startsWith('application/json')
}

/* ── A referrer's own actions ────────────────────────────────────────── */

export type ActionResult = { ok: true; message?: string } | { ok: false; status: number; message: string; field?: string }

/** Accept the terms and confirm the name (the first sign-in). */
export async function acceptTerms(svc: DB, r: ReferrerRow, user: SessionUser, body: { name?: unknown; business?: unknown; accept?: unknown }): Promise<ActionResult> {
  if (body.accept !== true) return { ok: false, status: 400, message: 'Tick the box to agree to the referral terms.', field: 'accept' }
  const name = cleanLabelLong(body.name, 120)
  const business = cleanLabelLong(body.business, 120)
  if (!name) return { ok: false, status: 400, message: 'Type your name.', field: 'name' }
  const { data, error } = await svc.rpc('accept_referral_terms', {
    p_referrer: r.id, p_version: TERMS_VERSION, p_name: name, p_business: business, p_user: user.id, p_actor: user.email,
  })
  if (error) return { ok: false, status: 500, message: 'That did not save. Try again in a moment.' }
  const result = (data as { result?: string } | null)?.result
  if (result === 'accepted') return { ok: true }
  if (result === 'not_found') return { ok: false, status: 403, message: 'Referrals for this account have ended.' }
  return { ok: false, status: 400, message: 'Check your name and try again.', field: 'name' }
}

/** A tidy one-line name: no control characters or angle brackets, at most `max`. */
export function cleanLabelLong(input: unknown, max: number): string | null {
  if (typeof input !== 'string') return null
  const s = input.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, max) : null
}

/** Is a code free to take? The rules first (no database call for a code that is not allowed). */
export async function checkCode(svc: DB, raw: unknown): Promise<{ code: string; available: boolean; message: string | null }> {
  const code = normalizeReferralCode(typeof raw === 'string' ? raw : '')
  const problem = codeProblem(code)
  if (problem) return { code, available: false, message: codeProblemMessage(problem) }
  const { data, error } = await svc.from('coupons').select('id').eq('code', code).limit(1)
  if (error) throw new Error('coupons')
  return data && data.length ? { code, available: false, message: `${code} is taken. Try another.` } : { code, available: true, message: null }
}

export async function createCode(svc: DB, r: ReferrerRow, user: SessionUser, body: { code?: unknown; label?: unknown }): Promise<ActionResult & { code?: string }> {
  if (!mayCreateCodes(r)) {
    return { ok: false, status: 403, message: r.status === 'paused' ? 'Your codes are paused by MAPL Tours Jamaica, so new ones cannot be made just now.' : 'Agree to the referral terms first.' }
  }
  const code = normalizeReferralCode(typeof body.code === 'string' ? body.code : '')
  const problem = codeProblem(code)
  if (problem) return { ok: false, status: 400, message: codeProblemMessage(problem), field: 'code' }
  const { data, error } = await svc.rpc('create_referral_code', {
    p_referrer: r.id, p_code: code, p_label: cleanLabel(body.label), p_percent: REFERRAL_DISCOUNT_PERCENT, p_max: MAX_LIVE_CODES, p_actor: user.email,
  })
  if (error) return { ok: false, status: 500, message: 'That code did not save. Try again in a moment.' }
  switch ((data as { result?: string } | null)?.result) {
    case 'created': return { ok: true, code, message: `${code} is ready. Guests get ${REFERRAL_DISCOUNT_PERCENT}% off with it.` }
    case 'taken': return { ok: false, status: 409, message: `${code} is taken. Try another.`, field: 'code' }
    case 'limit': return { ok: false, status: 409, message: `You have ${MAX_LIVE_CODES} codes, the most you can hold. Retire one to make room.`, field: 'code' }
    case 'not_active': return { ok: false, status: 403, message: 'Your codes are paused by MAPL Tours Jamaica, so new ones cannot be made just now.' }
    case 'bad_code': return { ok: false, status: 400, message: codeProblemMessage('letters'), field: 'code' }
    default: return { ok: false, status: 400, message: 'That code did not save. Try again.' }
  }
}

export async function setCodeStatus(svc: DB, r: ReferrerRow, user: SessionUser, body: { id?: unknown; action?: unknown }): Promise<ActionResult> {
  const id = typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null
  const action = body.action === 'pause' || body.action === 'resume' || body.action === 'retire' ? body.action : null
  if (!id || !action) return { ok: false, status: 400, message: 'That did not work. Reload the page and try again.' }
  const { data, error } = await svc.rpc('set_referral_code_status', { p_referrer: r.id, p_coupon: id, p_action: action, p_actor: user.email })
  if (error) return { ok: false, status: 500, message: 'That did not save. Try again in a moment.' }
  switch ((data as { result?: string } | null)?.result) {
    case 'done':
    case 'unchanged': return { ok: true }
    case 'held': return { ok: false, status: 409, message: 'MAPL Tours Jamaica has paused this code. Write to contact@mapltours.com to ask why.' }
    case 'retired': return { ok: false, status: 409, message: 'That code is retired and cannot come back. Make a new one instead.' }
    default: return { ok: false, status: 404, message: 'That code was not found. Reload the page.' }
  }
}
