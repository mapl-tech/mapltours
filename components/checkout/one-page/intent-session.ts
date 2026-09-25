import { orderKey, supersedeBookingIdFor, type CheckoutIntentResult } from '@/lib/checkout-form'

/**
 * What a one-page checkout remembers between its POSTs to the checkout
 * route, and what each new POST therefore has to carry.
 *
 * Framework-free so the sequencing is unit-tested
 * (tests/unit/one-page-supersede.spec.ts); the pages keep one session per
 * mount and pass their own `post`, which does the fetch and maps the answer.
 *
 * The rules, each one a money bug when missing:
 *  · The same order is sent once. Its intent is reused, and a request already
 *    on the wire for it is shared, so the quiet save and a Pay tap a moment
 *    later never race each other on the server.
 *  · One POST at a time. A Pay tap for an edited order waits for the quiet
 *    save still in flight, so it can name that save's booking to supersede
 *    instead of leaving it pending with a live intent (and, for a reward
 *    holder, holding the reward the Pay then needs).
 *  · A POST for a different order names the page's newest booking as
 *    `supersedeBookingId` (supersedeBookingIdFor) and drops the cached intent
 *    first: the server may cancel that booking and its intent, and a guest
 *    who then went back to the earlier order must not be handed a canceled
 *    intent on every Pay tap.
 *  · Another tab can cancel the intent cached here (it superseded the same
 *    booking, or, on transfers, swept this tab's declined twin). The Pay tap
 *    checks the intent with Stripe first (payableIntent) and, when it can no
 *    longer be confirmed, sends the order once more with `fresh`, which
 *    drops this order's cached intent instead of handing it back.
 */

export interface PostOutcome<R> {
  result: R
  /** The booking id the response issued (issuedBookingId), or null. */
  bookingId: string | null
  /** True when `result` is an intent the same order may reuse without another POST. */
  reusable: boolean
}

export type IntentPost<R> = (body: Record<string, unknown>) => Promise<PostOutcome<R>>

export interface SendOptions {
  /** Drop this order's cached intent and ask the server again. */
  fresh?: boolean
}

export interface IntentSession<R> {
  /** Resolves with the cached, shared or freshly POSTed result for this order. */
  send(payload: Record<string, unknown>, post: IntentPost<R>, opts?: SendOptions): Promise<R>
}

export function createIntentSession<R>(): IntentSession<R> {
  let cached: { key: string; result: R } | null = null
  let inflight: { key: string; promise: Promise<R> } | null = null
  let lastBookingId: string | null = null
  let queue: Promise<unknown> = Promise.resolve()

  return {
    send(payload, post, opts = {}) {
      // The key is the order alone, never the supersede id added below, so
      // the same order always finds its own cache entry and request.
      const key = orderKey(payload)
      // The cached intent for this order is dead at Stripe. A request already
      // on the wire for it is still shared: that one is a new answer.
      if (opts.fresh && cached?.key === key) cached = null
      if (cached && cached.key === key) return Promise.resolve(cached.result)
      if (inflight && inflight.key === key) return inflight.promise
      const promise = queue.then(async () => {
        if (cached && cached.key === key) return cached.result
        const supersedeBookingId = supersedeBookingIdFor(key, { cachedKey: cached?.key ?? null, lastBookingId })
        cached = null
        const out = await post(supersedeBookingId ? { ...payload, supersedeBookingId } : payload)
        if (out.bookingId) lastBookingId = out.bookingId
        if (out.reusable) cached = { key, result: out.result }
        return out.result
      })
      inflight = { key, promise }
      const settle = () => { if (inflight?.promise === promise) inflight = null }
      queue = promise.then(settle, settle)
      return promise
    },
  }
}

/** What the Pay tap needs to know about an intent before confirming it. */
export interface IntentRead {
  status: string
  /** In cents. */
  amount: number
}

/**
 * The statuses Stripe still confirms, and the only ones either checkout
 * route reuses an intent in (PI_REUSABLE_STATUSES in both routes).
 */
const CONFIRMABLE = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action'])

export const STALE_INTENT_MESSAGE = 'This payment could not be set up. Please refresh the page and try again.'

/**
 * The intent a Pay tap may confirm, checked with Stripe first.
 *
 * The session hands back the intent it cached for this order, and another
 * tab can have canceled it since. Confirming a canceled intent is refused,
 * and before this every later tap was refused the same way until the guest
 * edited the order or reloaded. So when Stripe reports a status it will not
 * confirm (canceled, or already processing or paid elsewhere), the order is
 * asked for once more with `fresh`. The server re-reads the row and mints a
 * new intent, reuses a live one, or answers alreadyPaid or processing. At
 * most one retry; a second dead intent is a refusal, never a loop.
 *
 * `read` resolving null means Stripe could not be asked; the intent is then
 * confirmed as before and Stripe itself refuses it if it is dead.
 */
export async function payableIntent(
  create: (opts?: SendOptions) => Promise<CheckoutIntentResult>,
  read: (clientSecret: string) => Promise<IntentRead | null>,
): Promise<{ res: CheckoutIntentResult; intent: IntentRead | null }> {
  let res = await create()
  for (let attempt = 0; ; attempt++) {
    if (!('clientSecret' in res)) return { res, intent: null }
    const intent = await read(res.clientSecret)
    if (!intent || CONFIRMABLE.has(intent.status)) return { res, intent }
    if (attempt > 0) return { res: { error: STALE_INTENT_MESSAGE }, intent: null }
    res = await create({ fresh: true })
  }
}
