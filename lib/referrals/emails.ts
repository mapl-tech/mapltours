import 'server-only'
import { createElement } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import ReferralInvite from '@/emails/ReferralInvite'
import ReferralPayoutAccount from '@/emails/ReferralPayoutAccount'
import ReferralPaid from '@/emails/ReferralPaid'
import { siteUrl, supportEmail } from '@/emails/_Layout'
import { sendEmail } from '@/lib/email/send'
import { opsRecipients } from '@/lib/payouts/notify'
import type { ReferrerRow } from './access'
import { dayText, percentText, REFERRAL_DISCOUNT_PERCENT, usd } from './rules'
import { jamaicaDay } from '@/lib/payouts/business-days'

/**
 * The referral program's emails, in the site's letterhead (emails/_Layout):
 * the invitation, the payout-account notice and the payout notice. Each goes
 * to the referrer alone with the operations inbox on BCC (never a CC), so the
 * owner holds the same paper trail; a test goes to the one address typed,
 * with "[Test]" before the subject and nobody copied.
 */

export const pageUrl = () => `${siteUrl()}/referrals`
export const firstNameOf = (name: string): string => (name.trim().split(/\s+/)[0] || 'there').slice(0, 60)
const bccOps = (to: string) => opsRecipients().filter((e) => e.toLowerCase() !== to.toLowerCase())

export function inviteEmail(r: Pick<ReferrerRow, 'name' | 'email' | 'commission_percent'>) {
  return {
    subject: 'You’re invited to refer guests to MAPL Tours Jamaica',
    react: createElement(ReferralInvite, {
      firstName: firstNameOf(r.name),
      email: r.email,
      discountPercent: percentText(REFERRAL_DISCOUNT_PERCENT),
      commissionPercent: percentText(r.commission_percent),
      pageUrl: pageUrl(),
      supportEmail: supportEmail(),
    }),
  }
}

/**
 * Sends the invitation, or a test of it. A real send records when and how
 * many times it went and logs it; a test writes nothing. The Resend key names
 * the referrer and the send count, so a double tap is delivered once.
 */
export async function sendInvite(svc: SupabaseClient, r: ReferrerRow, actor: string, opts: { testTo?: string } = {}): Promise<boolean> {
  const m = inviteEmail(r)
  if (opts.testTo) {
    const res = await sendEmail({ to: opts.testTo, subject: `[Test] ${m.subject}`, react: m.react, tags: [{ name: 'type', value: 'referral_invite_test' }], timeoutMs: 4000 })
    return !!res.ok
  }
  const res = await sendEmail({
    to: r.email,
    bcc: bccOps(r.email),
    subject: m.subject,
    react: m.react,
    tags: [{ name: 'type', value: 'referral_invite' }],
    idempotencyKey: `referral-invite/${r.id}/${r.invite_sends + 1}`,
    timeoutMs: 4000,
  })
  if (!res.ok) return false
  const now = new Date().toISOString()
  await svc.from('referrers').update({ invite_sent_at: now, invite_sends: r.invite_sends + 1, updated_at: now }).eq('id', r.id).eq('invite_sends', r.invite_sends)
  await svc.from('referral_events').insert({ referrer_id: r.id, kind: 'invite_sent', detail: { sends: r.invite_sends + 1 }, actor })
  return true
}

/** The security notice: the payout account was added or changed. */
export async function sendAccountNotice(
  r: Pick<ReferrerRow, 'id' | 'name' | 'email'>,
  n: { kind: 'added' | 'changed'; last4: string; holder: string; previousLast4: string | null; holdUntilIso: string; changeId: string },
): Promise<boolean> {
  const startsDay = jamaicaDay(Date.parse(n.holdUntilIso))
  const res = await sendEmail({
    to: r.email,
    bcc: bccOps(r.email),
    subject: n.kind === 'changed' ? 'Your MAPL Tours Jamaica payout account was changed' : 'Your MAPL Tours Jamaica payout account is set',
    react: createElement(ReferralPayoutAccount, {
      firstName: firstNameOf(r.name),
      kind: n.kind,
      last4: n.last4,
      holder: n.holder,
      previousLast4: n.previousLast4,
      startsText: dayText(startsDay, { weekday: true }),
      pageUrl: pageUrl(),
      supportEmail: supportEmail(),
    }),
    tags: [{ name: 'type', value: 'referral_payout_account' }],
    idempotencyKey: `referral-account/${r.id}/${n.changeId}`,
    timeoutMs: 3500,
  })
  return !!res.ok
}

/** The payout notice, once the money has left the balance. */
export async function sendPaidNotice(
  r: Pick<ReferrerRow, 'id' | 'name' | 'email'>,
  p: { payoutId: string; amountCents: number; last4: string; lines: Array<{ what: string; days: string; code: string; guestPaidCents: number; commissionCents: number }> },
): Promise<boolean> {
  const res = await sendEmail({
    to: r.email,
    bcc: bccOps(r.email),
    subject: `We sent you ${usd(p.amountCents)} for your referrals`,
    react: createElement(ReferralPaid, {
      firstName: firstNameOf(r.name),
      amount: usd(p.amountCents),
      last4: p.last4,
      lines: p.lines.map((l) => ({ what: l.what, days: l.days, code: l.code, guestPaid: usd(l.guestPaidCents), commission: usd(l.commissionCents) })),
      pageUrl: pageUrl(),
      supportEmail: supportEmail(),
    }),
    tags: [{ name: 'type', value: 'referral_paid' }],
    idempotencyKey: `referral-paid/${p.payoutId}`,
    timeoutMs: 3000,
  })
  return !!res.ok
}
