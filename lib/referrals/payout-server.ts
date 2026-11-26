import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { WiseApiError, type WiseApi, type WiseRecipientApi } from '@/lib/wise/client'
import { sendOpsMessage } from '@/lib/payouts/notify'
import type { ReferrerRow } from './access'
import { checkPayoutAccount, lastFour, wiseRecipientBody, type PayoutField } from './payout-account'
import { PAYOUT_ACCOUNT_HOLD_HOURS, REAUTH_MAX_AGE_MINUTES } from './rules'
import type { SessionUser } from './server'
import { sendAccountNotice } from './emails'

/**
 * Saving where a referrer is paid (owner, Nov 26 2026: "we will need the
 * referrers to have a USD wise account and enter in their details during
 * setup ... make sure everything is secure as well"). In this order, and
 * nothing is saved unless every step passes:
 *
 *  1. A recent sign-in (REAUTH_MAX_AGE_MINUTES): a session left open on a
 *     shared computer, or a stolen cookie, cannot move the money.
 *  2. The page's view: the account it showed must still be the account (a
 *     change made elsewhere is never overwritten from an old screen).
 *  3. The form's own rules (lib/referrals/payout-account): Wise's field
 *     patterns, the routing checksum, the account number typed twice.
 *  4. Wise creates the recipient from the details. Wise's refusal points at
 *     fields; its message is never shown or logged (it can echo a value).
 *  5. It must be a Wise account: a quote to it must route balance to balance
 *     (payOut BALANCE) for no fee, as MAPL's payment to Collin's own Wise
 *     account does. Anything else is refused and the recipient switched off,
 *     so a mistyped number that happens to be someone's US bank account can
 *     never receive a payout.
 *  6. The database saves it over exactly the account read at step 2
 *     (save_referrer_payout_account), with payouts held for
 *     PAYOUT_ACCOUNT_HOLD_HOURS, and the event logged (last four digits only).
 *  7. The recipient it replaced is switched off in Wise, unless a payout to it
 *     is still in flight.
 *  8. The referrer is emailed (operations on BCC). If that email fails, the
 *     operations inbox is told instead, because the notice is the safety net.
 *
 * The account and routing numbers exist only in this request and at Wise.
 */

type DB = SupabaseClient

export interface PayoutAccountDeps {
  svc: DB
  wise: (WiseApi & WiseRecipientApi) | null
  config: { profileId: number; balanceId: number | null } | null
  nowMs: number
  /** The notice to the referrer; lib/referrals/emails by default. */
  notify?: typeof sendAccountNotice
  /** A message for the operations inbox; lib/payouts/notify by default. */
  ops?: (subject: string, body: string, lines: string[], key: string) => Promise<boolean>
}

export type SaveAccountResult =
  | { ok: true; last4: string; holdUntil: string; kind: 'added' | 'changed'; noticeSent: boolean }
  | { ok: false; status: number; message: string; errors?: Partial<Record<PayoutField, string>>; reauth?: boolean }

const NOT_WISE =
  'This is not a Wise account. Payouts go only to a Wise US-dollar account: in Wise, open your US dollar balance, then Account details, and copy the routing and account numbers from there.'

/** Wise's names for the fields, as ours. */
const FIELD_OF: Record<string, PayoutField> = {
  legalType: 'legalType',
  accountHolderName: 'holderName',
  abartn: 'routingNumber',
  accountNumber: 'accountNumber',
  accountType: 'accountType',
  'address.country': 'country',
  'address.state': 'state',
  'address.city': 'city',
  'address.firstLine': 'street',
  'address.postCode': 'postCode',
}
const FIELD_MESSAGE: Partial<Record<PayoutField, string>> = {
  holderName: 'Wise did not accept this name. Type it exactly as Wise shows it.',
  routingNumber: 'Wise did not accept this routing number. Copy it from Account details in Wise.',
  accountNumber: 'Wise did not accept this account number. Copy it from Account details in Wise.',
  accountType: 'Wise did not accept this account type.',
  country: 'Wise did not accept this country.',
  state: 'Wise did not accept this state or province.',
  city: 'Wise did not accept this town or city.',
  street: 'Wise did not accept this address.',
  postCode: 'Wise did not accept this post code.',
  legalType: 'Wise did not accept this account holder type.',
}

export function recentSignIn(lastSignInAt: string | null, nowMs: number): boolean {
  const t = Date.parse(String(lastSignInAt ?? ''))
  return Number.isFinite(t) && nowMs - t <= REAUTH_MAX_AGE_MINUTES * 60_000 && t <= nowMs + 60_000
}

const defaultOps = (subject: string, body: string, lines: string[], key: string) =>
  sendOpsMessage({ subject, title: subject, body, lines }, key).catch(() => false)

async function switchOff(wise: WiseRecipientApi, id: number): Promise<boolean> {
  try {
    await wise.deactivateRecipient(id)
    return true
  } catch (err) {
    // Already inactive (Wise answers 403 to a repeat) counts as off.
    return err instanceof WiseApiError && (err.status === 403 || err.status === 404)
  }
}

export async function savePayoutAccount(deps: PayoutAccountDeps, r: ReferrerRow, user: SessionUser, body: Record<string, unknown>): Promise<SaveAccountResult> {
  const ops = deps.ops ?? defaultOps
  const notify = deps.notify ?? sendAccountNotice
  if (r.status === 'removed') return { ok: false, status: 403, message: 'Referrals for this account have ended.' }

  // 1. A recent sign-in.
  if (!recentSignIn(user.lastSignInAt, deps.nowMs)) {
    return { ok: false, status: 401, reauth: true, message: 'For your safety, sign in again before you change where you are paid. It takes a few seconds.' }
  }

  // 2. The account the page showed is still the account.
  const shown = typeof body.currentLast4 === 'string' && /^\d{4}$/.test(body.currentLast4) ? body.currentLast4 : null
  if (shown !== (r.payout_last4 ?? null)) {
    return { ok: false, status: 409, message: 'Your payout account was changed somewhere else. Reload the page to see it.' }
  }

  // 3. The form's rules.
  const checked = checkPayoutAccount(body as Partial<Record<PayoutField, unknown>>)
  if (!checked.ok) return { ok: false, status: 400, message: 'Check the highlighted details.', errors: checked.errors }
  const a = checked.account

  if (!deps.wise || !deps.config) {
    await ops('Referral payout account: Wise is not set up', `A referrer tried to add a payout account, but Wise is not configured on the site, so nothing was saved.`, [`Referrer ${r.id}`], `referrals/no-wise/${r.id}/${new Date(deps.nowMs).toISOString().slice(0, 13)}`)
    return { ok: false, status: 503, message: 'Payout accounts cannot be added just now. We have been told and will fix it. Try again tomorrow.' }
  }
  const wise = deps.wise

  // 4. Wise creates the recipient.
  let recipient
  try {
    recipient = await wise.createRecipient(wiseRecipientBody(a, deps.config.profileId))
  } catch (err) {
    if (err instanceof WiseApiError && !err.ambiguous) {
      const errors: Partial<Record<PayoutField, string>> = {}
      for (const p of err.paths) {
        const f = FIELD_OF[p] ?? FIELD_OF[p.replace(/^details\./, '')]
        if (f && FIELD_MESSAGE[f]) errors[f] = FIELD_MESSAGE[f]
      }
      // Field names and the status only: Wise's own words can carry the value typed.
      console.warn('[referrals] Wise refused a payout account', { status: err.status, code: err.code, paths: err.paths })
      return Object.keys(errors).length
        ? { ok: false, status: 400, message: 'Wise did not accept some of these details.', errors }
        : { ok: false, status: 400, message: 'Wise did not accept these details. Check them against Account details in Wise and try again.' }
    }
    console.error('[referrals] Wise did not answer creating a payout account', { status: err instanceof WiseApiError ? err.status : 0 })
    return { ok: false, status: 503, message: 'Wise did not answer, so nothing was saved. Try again in a minute.' }
  }

  // 5. It must be a Wise US-dollar account, paid balance to balance for nothing.
  let isWise = false
  try {
    // Wise's 2026Q4 API names the type 'Aba', v1 'aba': compared without case.
    if (recipient.active && recipient.currency === 'USD' && recipient.type.toLowerCase() === 'aba') {
      const quote = await wise.createQuote({ profileId: deps.config.profileId, currency: 'USD', targetAmount: 10, targetAccount: recipient.id, balanceId: deps.config.balanceId })
      isWise = quote.payOut === 'BALANCE' && !!quote.option && quote.option.payOut === 'BALANCE' && quote.option.feeTotal === 0
    }
  } catch {
    await switchOff(wise, recipient.id)
    return { ok: false, status: 503, message: 'We could not check this account with Wise just now, so nothing was saved. Try again in a minute.' }
  }
  if (!isWise) {
    await switchOff(wise, recipient.id)
    return { ok: false, status: 400, message: NOT_WISE, errors: { accountNumber: NOT_WISE } }
  }

  // 6. Saved over exactly the account read at step 2, with the hold.
  const holdUntil = new Date(deps.nowMs + PAYOUT_ACCOUNT_HOLD_HOURS * 3_600_000).toISOString()
  const last4 = lastFour(a.accountNumber)
  const expected = r.wise_recipient_id == null ? null : Number(r.wise_recipient_id)
  const { data, error } = await deps.svc.rpc('save_referrer_payout_account', {
    p_referrer: r.id, p_expected: expected, p_recipient: recipient.id, p_holder: a.holderName, p_last4: last4,
    p_legal: a.legalType, p_hold_until: holdUntil, p_actor: user.email,
  })
  let previous: number | null = null
  if (error) {
    // The save may have landed before the answer was lost: read it back before undoing anything.
    const { data: now } = await deps.svc.from('referrers').select('wise_recipient_id').eq('id', r.id).maybeSingle()
    if (!now || Number((now as { wise_recipient_id: unknown }).wise_recipient_id) !== recipient.id) {
      await switchOff(wise, recipient.id)
      return { ok: false, status: 500, message: 'That did not save. Nothing changed. Try again in a moment.' }
    }
    previous = expected
  } else {
    const res = data as { result?: string; previous?: number | string | null } | null
    if (res?.result === 'changed') {
      await switchOff(wise, recipient.id)
      return { ok: false, status: 409, message: 'Your payout account was changed somewhere else. Reload the page to see it.' }
    }
    if (res?.result !== 'saved') {
      await switchOff(wise, recipient.id)
      return { ok: false, status: res?.result === 'not_found' ? 403 : 400, message: 'That did not save. Nothing changed.' }
    }
    previous = res.previous == null ? null : Number(res.previous)
  }

  // 7. The account it replaced, switched off unless a payout to it is in flight.
  if (previous && previous !== recipient.id) {
    const { data: open } = await deps.svc
      .from('referral_payouts')
      .select('id')
      .eq('recipient_id', previous)
      .in('status', ['claimed', 'created', 'needs_review'])
      .limit(1)
    if (!open || open.length === 0) {
      if (!(await switchOff(wise, previous))) {
        await ops('Referral payout account: an old Wise recipient is still on', 'A referrer changed their payout account. The recipient it replaced could not be switched off in Wise, so switch it off by hand (Recipients). Nothing is paid to it.', [`Referrer ${r.id}`, `Old recipient ${previous}`], `referrals/old-recipient/${previous}`)
      }
    }
  }

  // 8. The notice.
  const kind = expected ? 'changed' : 'added'
  const noticeSent = await notify(r, { kind, last4, holder: a.holderName, previousLast4: r.payout_last4, holdUntilIso: holdUntil, changeId: randomUUID() }).catch(() => false)
  if (!noticeSent) {
    await ops('Referral payout account: the notice did not send', `A referrer's payout account was ${kind}, and the email telling them did not go. Tell them by another way, in case it was not them.`, [`${r.name} (${r.email})`, `Now the Wise account ending ${last4}${r.payout_last4 ? `, was ${r.payout_last4}` : ''}`], `referrals/notice-failed/${r.id}/${last4}`)
  }
  return { ok: true, last4, holdUntil, kind, noticeSent }
}
