/**
 * Payouts by Wise: what the operations inbox is told.
 *
 * After every live run that paid, failed, held or found anything, and after
 * any webhook that says money came back. Booking references and payee names
 * only: never a guest's name, contact or flight, and never a bank detail.
 * Sent with the generic OpsAlert template to OPERATIONS_EMAIL.
 */

import { createElement } from 'react'
import OpsAlert from '@/emails/OpsAlert'
import { sendEmail } from '@/lib/email/send'
import { dayLabel } from './plan'
import type { PayeeReport, PayoutReport } from './run'

export interface OpsMessage {
  subject: string
  title: string
  body: string
  lines: string[]
}

const usd = (n: number) => `US$${n.toFixed(2)}`

function payeeLine(d: PayeeReport): string {
  const trips = `${d.lines.length} trip${d.lines.length === 1 ? '' : 's'}`
  switch (d.outcome) {
    case 'funded':
      return `${d.payee}: ${usd(d.amountUsd)} for ${trips}, PAID (Wise fee ${usd(d.feeUsd ?? 0)}, transfer ${d.transferId})${d.detail ? `. ${d.detail}` : ''}`
    case 'failed':
      return `${d.payee}: ${usd(d.amountUsd)} for ${trips}, NOT PAID: ${d.detail ?? 'refused'}. It will be tried again on the next daily run.`
    case 'needs_review':
      return `${d.payee}: ${usd(d.amountUsd)} for ${trips}, NEEDS A LOOK: ${d.detail ?? 'outcome unknown'}`
    case 'held':
      return `${d.payee}: ${usd(d.amountUsd)} for ${trips}, HELD: ${d.detail ?? ''}`
    case 'no_recipient':
      return `${d.payee}: ${usd(d.amountUsd)} for ${trips}, NOT PAID: ${d.detail ?? 'no Wise recipient is set'}`
    case 'deferred':
      return `${d.payee}: ${usd(d.amountUsd)} for ${trips}, waiting for the next daily run`
    case 'taken':
      return `${d.payee}: skipped, another run already holds these trips`
    default:
      return `${d.payee}: ${usd(d.amountUsd)} for ${trips}`
  }
}

export function payoutSummary(r: PayoutReport): OpsMessage {
  const paid = r.payees.filter((d) => d.outcome === 'funded')
  const paidTotal = paid.reduce((s, d) => s + d.amountUsd, 0)
  const problems = r.payees.filter((d) => ['failed', 'needs_review', 'held', 'no_recipient'].includes(d.outcome))
  const day = r.payDay ? dayLabel(r.payDay) : ''

  const lines: string[] = []
  for (const d of r.payees) {
    lines.push(payeeLine(d))
    for (const l of d.lines) {
      // When names share one account, each trip says whose it was.
      const who = d.payee.includes(' and ') ? ` (${l.name})` : ''
      lines.push(`    ${l.ref} ${l.label}${who}, ${dayLabel(l.serviceDay)}: ${usd(l.amountUsd)}`)
    }
  }
  for (const e of r.earlier) lines.push(`Earlier payout to ${e.payee} (${e.payoutId.slice(0, 8)}): now ${e.outcome}${e.detail ? `. ${e.detail}` : ''}`)
  for (const h of r.holds) lines.push(`Held: ${h.payee}, payout ${h.payoutId.slice(0, 8)} is ${h.status}${h.detail ? `: ${h.detail}` : ''}. Resolve it before this account is paid again.`)
  if (r.refundHeld.length) lines.push(`Not paid while a refund is requested or approved: ${r.refundHeld.join(', ')}`)

  const attention =
    problems.length > 0 ||
    r.holds.length > 0 ||
    r.earlier.some((e) => e.outcome === 'needs_review') ||
    r.payees.some((d) => d.alreadyStamped.length > 0 || (d.outcome === 'funded' && !!d.detail))
  const title = attention
    ? `Payouts on ${day} need a look`
    : `Payouts on ${day}: ${usd(paidTotal)} sent`
  const body = paid.length
    ? `${usd(paidTotal)} went to ${paid.length} account${paid.length === 1 ? '' : 's'} from the Wise US-dollar balance, ahead of the trips below.${attention ? ' Some payments did not go; the lines below say why.' : ''}`
    : attention
      ? 'Nothing was paid in this run. The lines below say why.'
      : 'Nothing was owed in this run.'
  return { subject: title, title, body, lines: lines.slice(0, 80) }
}

/** The operations inbox, as OPERATIONS_EMAIL lists it (contact@mapltours.com when unset). */
export function opsRecipients(env: Record<string, string | undefined> = process.env): string[] {
  return (env.OPERATIONS_EMAIL ?? 'contact@mapltours.com').split(',').map((e) => e.trim()).filter((e) => e.includes('@'))
}

export async function sendOpsMessage(m: OpsMessage, dedupe: string): Promise<boolean> {
  const to = opsRecipients()
  if (!to.length) return false
  const res = await sendEmail({
    to,
    subject: m.subject,
    react: createElement(OpsAlert, { title: m.title, body: m.body, lines: m.lines }),
    tags: [{ name: 'type', value: 'driver_payouts' }],
    dedupe,
    timeoutMs: 3500,
  })
  return !!res?.ok
}

export async function notifyPayoutRun(r: PayoutReport, nowMs: number): Promise<void> {
  await sendOpsMessage(payoutSummary(r), `driver-payouts/${r.payDay || new Date(nowMs).toISOString().slice(0, 10)}`)
}
