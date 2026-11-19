/**
 * Payouts by Wise: what a `transfers#state-change` event does to a
 * payout (app/api/webhooks/wise). Only transfers this job created are
 * touched; any other transfer on the account (one sent by hand in Wise) is
 * ignored.
 *
 * Authenticity: Wise signs every event with RSA-SHA256 over the raw body,
 * Base64 in `X-Signature-SHA256`, with the public keys below (docs.wise.com,
 * "Event handling", read Nov 15 2026). An event that fails verification is
 * refused and nothing is read from it.
 *
 * Order: Wise does not promise delivery order, so an event older than the one
 * already recorded (`data.occurred_at` against `wise_state_at`) changes
 * nothing. Retries share an `X-Delivery-Id`; applying the same state twice is
 * harmless anyway.
 *
 *   processing / funds_converted / incoming_payment_initiated
 *       the money left the balance. A payout the run could not confirm
 *       (created, needs_review) becomes `funded` and its parts are stamped paid.
 *   outgoing_payment_sent
 *       `sent` (and `funded` first, with the stamps, if it was not yet).
 *   funds_refunded / charged_back
 *       the money came back: `returned`, the items voided and this payout's
 *       stamps taken back, so the parts are owed again; the recipient is held
 *       until a person sets resolved_at (the bank details may be wrong).
 *   cancelled
 *       never paid: `failed` and the items voided, unless it had been
 *       recorded as funded, which needs a person.
 *   bounced_back
 *       recorded, and the owner is told; it either arrives late or comes back.
 */

import { verify } from 'node:crypto'
import type { WiseEnv } from '@/lib/wise/client'
import type { PayoutRow, PayoutStatus } from './run'
import type { PayoutEventStore } from './store'
import type { PayPart } from './plan'

export const WISE_WEBHOOK_KEYS: Record<WiseEnv, string> = {
  production: [
    '-----BEGIN PUBLIC KEY-----',
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvO8vXV+JksBzZAY6GhSO',
    'XdoTCfhXaaiZ+qAbtaDBiu2AGkGVpmEygFmWP4Li9m5+Ni85BhVvZOodM9epgW3F',
    'bA5Q1SexvAF1PPjX4JpMstak/QhAgl1qMSqEevL8cmUeTgcMuVWCJmlge9h7B1CS',
    'D4rtlimGZozG39rUBDg6Qt2K+P4wBfLblL0k4C4YUdLnpGYEDIth+i8XsRpFlogx',
    'CAFyH9+knYsDbR43UJ9shtc42Ybd40Afihj8KnYKXzchyQ42aC8aZ/h5hyZ28yVy',
    'Oj3Vos0VdBIs/gAyJ/4yyQFCXYte64I7ssrlbGRaco4nKF3HmaNhxwyKyJafz19e',
    'HwIDAQAB',
    '-----END PUBLIC KEY-----',
  ].join('\n'),
  sandbox: [
    '-----BEGIN PUBLIC KEY-----',
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwpb91cEYuyJNQepZAVfP',
    'ZIlPZfNUefH+n6w9SW3fykqKu938cR7WadQv87oF2VuT+fDt7kqeRziTmPSUhqPU',
    'ys/V2Q1rlfJuXbE+Gga37t7zwd0egQ+KyOEHQOpcTwKmtZ81ieGHynAQzsn1We3j',
    'wt760MsCPJ7GMT141ByQM+yW1Bx+4SG3IGjXWyqOWrcXsxAvIXkpUD/jK/L958Cg',
    'nZEgz0BSEh0QxYLITnW1lLokSx/dTianWPFEhMC9BgijempgNXHNfcVirg1lPSyg',
    'z7KqoKUN0oHqWLr2U1A+7kqrl6O2nx3CKs1bj1hToT1+p4kcMoHXA7kA+VBLUpEs',
    'VwIDAQAB',
    '-----END PUBLIC KEY-----',
  ].join('\n'),
}

/** true only for a body Wise signed with this key. */
export function verifyWiseSignature(rawBody: string, signatureB64: string | null | undefined, publicKeyPem: string): boolean {
  if (!signatureB64 || !/^[A-Za-z0-9+/=\s]+$/.test(signatureB64)) return false
  try {
    return verify('RSA-SHA256', Buffer.from(rawBody, 'utf8'), publicKeyPem, Buffer.from(signatureB64, 'base64'))
  } catch {
    return false
  }
}

export interface TransferStateEvent {
  transferId: number
  profileId: number
  state: string
  occurredAt: string | null
}

export function parseTransferStateEvent(body: unknown): TransferStateEvent | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (b.event_type !== 'transfers#state-change') return null
  const data = (b.data ?? {}) as Record<string, unknown>
  const resource = (data.resource ?? {}) as Record<string, unknown>
  const transferId = Number(resource.id)
  const profileId = Number(resource.profile_id)
  const state = typeof data.current_state === 'string' ? data.current_state : ''
  if (!Number.isSafeInteger(transferId) || transferId <= 0 || !state) return null
  const occurred = typeof data.occurred_at === 'string' && Number.isFinite(Date.parse(data.occurred_at)) ? data.occurred_at : null
  return { transferId, profileId: Number.isSafeInteger(profileId) ? profileId : 0, state, occurredAt: occurred }
}

export type EventOutcome = 'ignored' | 'stale' | 'recorded' | 'funded' | 'sent' | 'returned' | 'failed' | 'review'

export interface EventResult {
  outcome: EventOutcome
  payout: PayoutRow | null
  /** A sentence for the operations inbox, when a person should hear about it. */
  tell: string | null
}

const MOVED = new Set(['processing', 'funds_converted', 'incoming_payment_initiated'])
const UNCONFIRMED: PayoutStatus[] = ['claimed', 'created', 'needs_review']
const usd = (n: number) => `US$${Number(n).toFixed(2)}`

async function stampAll(store: PayoutEventStore, p: PayoutRow, iso: string): Promise<void> {
  const via = `wise:${p.wise_transfer_id}`
  for (const it of await store.items(p.id)) {
    try { await store.stamp(it.booking_id, it.part as PayPart, iso, via) } catch { /* the payout itself is recorded */ }
  }
}

async function unstampAll(store: PayoutEventStore, p: PayoutRow): Promise<void> {
  const via = `wise:${p.wise_transfer_id}`
  for (const it of await store.items(p.id)) {
    try { await store.unstamp(it.booking_id, it.part as PayPart, via) } catch { /* reported by the caller's email */ }
  }
}

export async function applyTransferState(store: PayoutEventStore, ev: TransferStateEvent, nowIso: string): Promise<EventResult> {
  const p = await store.findByTransfer(ev.transferId)
  if (!p) return { outcome: 'ignored', payout: null, tell: null }
  if (p.wise_state_at && ev.occurredAt && Date.parse(ev.occurredAt) <= Date.parse(p.wise_state_at)) {
    return { outcome: 'stale', payout: p, tell: null }
  }
  const at = ev.occurredAt ?? nowIso
  const base = { wise_state: ev.state, wise_state_at: at }
  const who = `${p.payee}, ${usd(p.amount_usd)} (transfer ${p.wise_transfer_id})`

  if ((MOVED.has(ev.state) || ev.state === 'outgoing_payment_sent') && p.status === 'failed') {
    // Recorded as not paid (its trips were freed for the next run), but Wise says the money moved.
    await store.update(p.id, { ...base, status: 'needs_review', error: `Wise says ${ev.state} on a payout recorded as failed` })
    return {
      outcome: 'review',
      payout: p,
      tell: `Wise says the payout to ${who} was paid (${ev.state}), but it had been recorded as failed and its trips were freed for the next run. Check whether they were paid twice before the next run.`,
    }
  }

  if (MOVED.has(ev.state) || ev.state === 'outgoing_payment_sent') {
    const wasUnconfirmed = UNCONFIRMED.includes(p.status)
    if (wasUnconfirmed) {
      await store.update(p.id, { ...base, status: 'funded', funded_at: p.funded_at ?? at, error: null })
      await stampAll(store, p, p.funded_at ?? at)
    }
    if (ev.state === 'outgoing_payment_sent' && p.status !== 'returned') {
      await store.update(p.id, { ...base, status: 'sent', sent_at: at })
      return {
        outcome: 'sent',
        payout: p,
        tell: wasUnconfirmed ? `Wise confirms the payout to ${who} was paid out; it had not been confirmed when it was sent.` : null,
      }
    }
    if (!wasUnconfirmed) await store.update(p.id, base)
    return {
      outcome: wasUnconfirmed ? 'funded' : 'recorded',
      payout: p,
      tell: wasUnconfirmed ? `Wise confirms the payout to ${who} was paid; it had not been confirmed when it was sent.` : null,
    }
  }

  if (ev.state === 'funds_refunded' || ev.state === 'charged_back') {
    if (p.status === 'returned') { await store.update(p.id, base); return { outcome: 'recorded', payout: p, tell: null } }
    await store.update(p.id, { ...base, status: 'returned', error: `Wise: ${ev.state}` })
    await store.voidItems(p.id)
    await unstampAll(store, p)
    return {
      outcome: 'returned',
      payout: p,
      tell: `The payout to ${who} came back (${ev.state}). The money is back in the Wise balance and those trips show as unpaid again. Nothing more goes to this account until someone checks the bank details in Wise and sets resolved_at on payout ${p.id}.`,
    }
  }

  if (ev.state === 'cancelled') {
    if (UNCONFIRMED.includes(p.status) || p.status === 'failed') {
      if (p.status !== 'failed') {
        await store.update(p.id, { ...base, status: 'failed', error: p.error ?? 'Wise: cancelled before it was paid' })
        await store.voidItems(p.id)
      } else {
        await store.update(p.id, base)
      }
      return { outcome: 'failed', payout: p, tell: null }
    }
    await store.update(p.id, { ...base, status: 'needs_review', error: 'Wise says cancelled, but it was recorded as paid' })
    return { outcome: 'review', payout: p, tell: `Wise says the payout to ${who} was cancelled, but it had been recorded as paid. Check it in Wise.` }
  }

  await store.update(p.id, base)
  if (ev.state === 'bounced_back' || ev.state === 'unknown') {
    return {
      outcome: 'recorded',
      payout: p,
      tell: ev.state === 'bounced_back'
        ? `The payout to ${who} bounced back from the bank. Wise will either deliver it late or return the money; nothing to do yet.`
        : `Wise lists the payout to ${who} as status unknown and will email the account. Check it in Wise.`,
    }
  }
  return { outcome: 'recorded', payout: p, tell: null }
}
