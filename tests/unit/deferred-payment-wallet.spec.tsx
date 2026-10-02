import { describe, test, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { act, type ComponentProps } from 'react'
import type { Root } from 'react-dom/client'
import type { StripeExpressCheckoutElementClickEvent, StripeExpressCheckoutElementConfirmEvent } from '@stripe/stripe-js'
import { installMiniDom, allElements, click, type MiniElement } from '../stubs/mini-dom'
import type { IntentResult } from '@/components/checkout/one-page/DeferredPaymentPanel'
import { isPaymentInFlight } from '@/lib/payment-lock'

/**
 * The wallet row's money guard in DeferredPaymentPanel (Link button, Sept 27
 * 2026), proved against the real PayForm.
 *
 * Link opens in its own window and leaves the page editable behind it, so a
 * guest can approve $199 in Link after raising the order to $220 on the page.
 * The page-total check cannot catch that (the page already shows $220), so
 * the panel records the total when a wallet sheet opens and refuses to
 * confirm a wallet for more than that. These tests hold that rule, and hold
 * that it touches nothing else: the card path, a lower total, and a re-tap.
 *
 * Stripe is mocked at its React boundary: the Express Checkout Element hands
 * its onClick and onConfirm props to the test, which calls them the way the
 * wallet iframe does, and the fake stripe/elements record what would reach
 * Stripe. The Pay button is clicked through React's own event delegation.
 */

type ExpressProps = {
  onClick: (e: StripeExpressCheckoutElementClickEvent) => void
  onConfirm: (e: StripeExpressCheckoutElementConfirmEvent) => void
}

const h = vi.hoisted(() => ({
  express: null as ExpressProps | null,
  payment: null as { onReady?: () => void } | null,
  stripe: null as unknown,
  elements: null as unknown,
}))

vi.mock('@stripe/react-stripe-js', async () => {
  const { useEffect } = await import('react')
  return {
    Elements: ({ children }: { children?: unknown }) => children,
    // react-stripe-js swaps in a changed handler prop from a passive effect
    // (useAttachEvent keeps it in a ref), which is when the iframe starts
    // calling it. So does this: a stale-closure bug in the panel shows here.
    ExpressCheckoutElement: (props: ExpressProps) => { useEffect(() => { h.express = props }); return null },
    PaymentElement: (props: { onReady?: () => void }) => { useEffect(() => { h.payment = props }); return null },
    useStripe: () => h.stripe,
    useElements: () => h.elements,
  }
})
vi.mock('@/lib/stripe', () => ({ getStripe: () => Promise.resolve(null) }))

import DeferredPaymentPanel from '@/components/checkout/one-page/DeferredPaymentPanel'

const BOOKING = '0a0a0a0a-0000-4000-8000-00000000000a'
const SECRET = 'pi_test_1_secret_abc'
const ORIGIN = 'http://localhost:3160'
const refusal = (usd: string) => `The total is now ${usd}. Check it, then tap the button again.`

const location = { origin: ORIGIN, assign: vi.fn() }
let dom: ReturnType<typeof installMiniDom>
let createRoot: typeof import('react-dom/client').createRoot

beforeAll(async () => {
  // Before react-dom loads, so it sees a browser.
  dom = installMiniDom(location)
  ;({ createRoot } = await import('react-dom/client'))
})
afterAll(() => dom.uninstall())

// ── The world outside the panel ──

/** What the server will charge, in cents: the intent's amount and amountDue. */
let serverCents: number
/** What the page's own form gate answers. */
let formValid: boolean

let stripe: { confirmPayment: ReturnType<typeof vi.fn>; retrievePaymentIntent: ReturnType<typeof vi.fn> }
let elements: { submit: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; getElement: ReturnType<typeof vi.fn> }
let createIntent: ReturnType<typeof vi.fn<(opts?: unknown) => Promise<IntentResult>>>
let validate: ReturnType<typeof vi.fn<() => boolean>>
let onAmountResolved: ReturnType<typeof vi.fn<(usd: number) => void>>
let onPaid: ReturnType<typeof vi.fn<() => void>>

const intentFor = (cents: number): IntentResult => ({ clientSecret: SECRET, bookingId: BOOKING, amountDue: cents / 100 })

beforeEach(() => {
  serverCents = 19900
  formValid = true
  location.assign.mockReset()
  stripe = {
    confirmPayment: vi.fn(async () => ({ paymentIntent: { id: 'pi_test_1', status: 'succeeded' } })),
    retrievePaymentIntent: vi.fn(async () => ({ paymentIntent: { status: 'requires_payment_method', amount: serverCents } })),
  }
  elements = {
    submit: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    getElement: vi.fn(() => null),
  }
  h.stripe = stripe
  h.elements = elements
  h.express = null
  h.payment = null
  createIntent = vi.fn(async () => intentFor(serverCents))
  validate = vi.fn(() => formValid)
  onAmountResolved = vi.fn()
  onPaid = vi.fn()
})

let root: Root | null = null
let container: MiniElement
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = null
})

// ── Driving the panel ──

type PanelProps = ComponentProps<typeof DeferredPaymentPanel>

/** One stable set of page callbacks; only the total changes between renders. */
function props(amountCents: number): PanelProps {
  return {
    amountCents,
    returnUrl: '/transfers/confirm',
    payLabel: 'Pay',
    validate,
    createIntent,
    onPaid,
    onAmountResolved,
  }
}

async function mount(amountCents: number) {
  container = dom.document.createElement('div')
  dom.document.body.appendChild(container)
  root = createRoot(container as unknown as HTMLElement)
  await act(async () => root!.render(<DeferredPaymentPanel {...props(amountCents)} />))
  // The card form reports ready, which enables the Pay button.
  await act(async () => h.payment?.onReady?.())
}

/** The page re-renders with a new total; the same PayForm (and its refs) stays. */
async function pageTotal(amountCents: number) {
  await act(async () => root!.render(<DeferredPaymentPanel {...props(amountCents)} />))
}

/** Lets every awaited fake settle: they all resolve on microtasks. */
const settle = () => new Promise((r) => setTimeout(r, 0))

function walletClickEvent(type: 'link' | 'apple_pay' | 'google_pay' = 'link') {
  return { elementType: 'expressCheckout' as const, expressPaymentType: type, resolve: vi.fn(), reject: vi.fn() }
}

/** The guest taps a wallet button: Stripe emits click and waits for resolve or reject. */
async function tapWallet(type: 'link' | 'apple_pay' | 'google_pay' = 'link') {
  const event = walletClickEvent(type)
  await act(async () => h.express!.onClick(event as unknown as StripeExpressCheckoutElementClickEvent))
  return event
}

/** The guest approves in the wallet: Stripe emits confirm and waits for an outcome. */
async function approveWallet(type: 'link' | 'apple_pay' | 'google_pay' = 'link') {
  const event = { expressPaymentType: type, paymentFailed: vi.fn() }
  await act(async () => { h.express!.onConfirm(event as unknown as StripeExpressCheckoutElementConfirmEvent); await settle() })
  return event
}

const payButton = () => allElements(container).find((el) => el.tagName === 'BUTTON' && el.hasAttribute('data-checkout-cta'))!

/** The guest taps the card Pay button, through React's own click handling. */
async function tapPay() {
  await act(async () => { click(payButton()); await settle() })
}

const shownError = () => allElements(container).find((el) => el.getAttribute('role') === 'alert')?.textContent ?? null

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const confirmedWith = () => ({
  elements,
  clientSecret: SECRET,
  confirmParams: { return_url: `${ORIGIN}/transfers/confirm` },
  redirect: 'if_required',
})

// ── (a) The guard ──

describe('a wallet approved at one total, confirmed after the page total rose', () => {
  test('refuses: the sheet said $199, the order is now $220, and nothing reaches confirmPayment', async () => {
    await mount(19900)
    const opened = await tapWallet('link')
    expect(opened.resolve).toHaveBeenCalledTimes(1)
    expect(opened.reject).not.toHaveBeenCalled()

    // Behind the Link window the guest adds a traveller; the page and the
    // server now both say $220.
    await pageTotal(22000)
    serverCents = 22000

    const approved = await approveWallet('link')
    expect(approved.paymentFailed).toHaveBeenCalledTimes(1)
    expect(approved.paymentFailed).toHaveBeenCalledWith({ reason: 'fail', message: refusal('$220.00') })
    expect(stripe.confirmPayment).not.toHaveBeenCalled()
    expect(location.assign).not.toHaveBeenCalled()
    // The page says the same thing, and hands the buttons back.
    expect(shownError()).toContain(refusal('$220.00'))
    expect(payButton().hasAttribute('disabled')).toBe(false)
    expect(isPaymentInFlight()).toBe(false)
  })

  test('a re-tap after the refusal opens the sheet at the new total and pays it (no refusal loop, no stale total)', async () => {
    await mount(19900)
    await tapWallet('link')
    await pageTotal(22000)
    serverCents = 22000
    await approveWallet('link')
    expect(stripe.confirmPayment).not.toHaveBeenCalled()

    const reopened = await tapWallet('link')
    expect(reopened.resolve).toHaveBeenCalledTimes(1)
    const approved = await approveWallet('link')
    expect(approved.paymentFailed).not.toHaveBeenCalled()
    expect(stripe.confirmPayment).toHaveBeenCalledTimes(1)
    expect(stripe.confirmPayment).toHaveBeenCalledWith(confirmedWith())
    expect(location.assign).toHaveBeenCalledWith(`${ORIGIN}/transfers/confirm?payment_intent=pi_test_1&redirect_status=succeeded`)
  })

  test('a price rise that arrives while an Apple Pay sheet is open is refused the same way', async () => {
    // The sheet cannot be edited, but an answer already on the wire (the
    // quiet save, a code check) can move the page total underneath it.
    await mount(19900)
    await tapWallet('apple_pay')
    serverCents = 22000
    await pageTotal(22000)
    const approved = await approveWallet('apple_pay')
    expect(approved.paymentFailed).toHaveBeenCalledWith({ reason: 'fail', message: refusal('$220.00') })
    expect(stripe.confirmPayment).not.toHaveBeenCalled()
  })
})

describe('two wallet sheets, each held to its own total', () => {
  test('Link opened at $199 stays held to $199 after Google Pay is tapped at $220 and dismissed', async () => {
    await mount(19900)
    await tapWallet('link')
    // Behind the Link window the order grows, and the guest taps Google Pay
    // at the new total, then closes that sheet without paying.
    await pageTotal(22000)
    serverCents = 22000
    await tapWallet('google_pay')

    const approved = await approveWallet('link')
    expect(approved.paymentFailed).toHaveBeenCalledWith({ reason: 'fail', message: refusal('$220.00') })
    expect(stripe.confirmPayment).not.toHaveBeenCalled()
  })

  test('Google Pay approved at the $220 its own sheet showed pays, even though Link was opened earlier at $199', async () => {
    await mount(19900)
    await tapWallet('link')
    await pageTotal(22000)
    serverCents = 22000
    await tapWallet('google_pay')

    const approved = await approveWallet('google_pay')
    expect(approved.paymentFailed).not.toHaveBeenCalled()
    expect(stripe.confirmPayment).toHaveBeenCalledTimes(1)
  })
})

// ── (b) At or under the approved total ──

describe('a wallet confirmed for no more than its sheet showed', () => {
  test.each([
    ['the server charges exactly the approved $199', 22000, 19900],
    ['the server charges less than the approved $199', 22000, 15000],
    ['a gift card lowered both the page and the charge', 15000, 15000],
  ])('%s: confirmPayment is called once', async (_label, pageAfter, server) => {
    await mount(19900)
    await tapWallet('link')
    await pageTotal(pageAfter)
    serverCents = server

    const approved = await approveWallet('link')
    expect(approved.paymentFailed).not.toHaveBeenCalled()
    expect(stripe.confirmPayment).toHaveBeenCalledTimes(1)
    expect(stripe.confirmPayment).toHaveBeenCalledWith(confirmedWith())
    // Elements always carries the intent's amount at confirm time.
    if (server !== pageAfter) {
      expect(elements.update).toHaveBeenCalledWith({ amount: server })
      expect(onAmountResolved).toHaveBeenCalledWith(server / 100)
    }
    expect(shownError()).toBeNull()
  })

  test('the total unchanged from tap to approval pays, for every wallet', async () => {
    for (const type of ['apple_pay', 'google_pay', 'link'] as const) {
      await mount(19900)
      await tapWallet(type)
      const approved = await approveWallet(type)
      expect(approved.paymentFailed, type).not.toHaveBeenCalled()
      await act(async () => root!.unmount())
      root = null
    }
    expect(stripe.confirmPayment).toHaveBeenCalledTimes(3)
    expect(elements.update).not.toHaveBeenCalled()
  })
})

// ── (c) The card path does not consult the wallet's record ──

describe('the card Pay button', () => {
  test('does nothing until the card form is ready (the click runs through React, which honours disabled)', async () => {
    container = dom.document.createElement('div')
    dom.document.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await act(async () => root!.render(<DeferredPaymentPanel {...props(19900)} />))
    expect(payButton().hasAttribute('disabled')).toBe(true)
    await tapPay()
    expect(createIntent).not.toHaveBeenCalled()

    await act(async () => h.payment?.onReady?.())
    expect(payButton().hasAttribute('disabled')).toBe(false)
    await tapPay()
    expect(stripe.confirmPayment).toHaveBeenCalledTimes(1)
  })

  test('a $199 page and a $199 intent confirms', async () => {
    await mount(19900)
    await tapPay()
    expect(createIntent).toHaveBeenCalledTimes(1)
    expect(stripe.confirmPayment).toHaveBeenCalledTimes(1)
    expect(stripe.confirmPayment).toHaveBeenCalledWith(confirmedWith())
    expect(shownError()).toBeNull()
    expect(onPaid).toHaveBeenCalledTimes(1)
    expect(location.assign).toHaveBeenCalledTimes(1)
  })

  test('a wallet sheet opened at $199 and abandoned does not block paying $220 by card once the page shows $220', async () => {
    await mount(19900)
    await tapWallet('link')
    await pageTotal(22000)
    serverCents = 22000
    await tapPay()
    expect(stripe.confirmPayment).toHaveBeenCalledTimes(1)
    expect(shownError()).toBeNull()
  })
})

// ── (d) A wallet approval that arrives while a payment runs, or after one went through ──

describe('a wallet approval that is not the only payment', () => {
  test('while the card payment is running it is told no at once, and the card payment alone confirms', async () => {
    await mount(19900)
    const answer = deferred<IntentResult>()
    createIntent.mockImplementationOnce(() => answer.promise)

    await tapPay()
    expect(createIntent).toHaveBeenCalledTimes(1)
    expect(isPaymentInFlight()).toBe(true)

    const approved = await approveWallet('link')
    expect(approved.paymentFailed).toHaveBeenCalledTimes(1)
    expect(approved.paymentFailed).toHaveBeenCalledWith({ reason: 'fail' })
    expect(createIntent).toHaveBeenCalledTimes(1)
    expect(stripe.confirmPayment).not.toHaveBeenCalled()

    await act(async () => { answer.resolve(intentFor(19900)); await settle() })
    expect(stripe.confirmPayment).toHaveBeenCalledTimes(1)
    expect(location.assign).toHaveBeenCalledTimes(1)
  })

  test('after a payment went through it is told no, and nothing is confirmed twice', async () => {
    await mount(19900)
    await tapPay()
    expect(stripe.confirmPayment).toHaveBeenCalledTimes(1)

    const approved = await approveWallet('link')
    expect(approved.paymentFailed).toHaveBeenCalledWith({ reason: 'fail' })
    expect(stripe.confirmPayment).toHaveBeenCalledTimes(1)
    expect(createIntent).toHaveBeenCalledTimes(1)
    expect(location.assign).toHaveBeenCalledTimes(1)
  })

  test('while another wallet payment is running it is told no, and the first one alone confirms', async () => {
    await mount(19900)
    const answer = deferred<IntentResult>()
    createIntent.mockImplementationOnce(() => answer.promise)
    await tapWallet('apple_pay')
    const first = await approveWallet('apple_pay')
    const second = await approveWallet('link')
    expect(second.paymentFailed).toHaveBeenCalledWith({ reason: 'fail' })
    await act(async () => { answer.resolve(intentFor(19900)); await settle() })
    expect(first.paymentFailed).not.toHaveBeenCalled()
    expect(stripe.confirmPayment).toHaveBeenCalledTimes(1)
  })
})

// ── (e) Opening a wallet sheet ──

describe('a tap on a wallet button', () => {
  test('opens the sheet when the form is complete and nothing is running', async () => {
    await mount(19900)
    const event = await tapWallet('google_pay')
    expect(event.resolve).toHaveBeenCalledTimes(1)
    expect(event.reject).not.toHaveBeenCalled()
  })

  test('is refused when the page form is incomplete', async () => {
    await mount(19900)
    formValid = false
    const event = await tapWallet('link')
    expect(event.reject).toHaveBeenCalledTimes(1)
    expect(event.resolve).not.toHaveBeenCalled()
  })

  test('is refused while a payment is running, and after one went through', async () => {
    await mount(19900)
    const answer = deferred<IntentResult>()
    createIntent.mockImplementationOnce(() => answer.promise)
    await tapPay()

    const during = await tapWallet('link')
    expect(during.reject).toHaveBeenCalledTimes(1)
    expect(during.resolve).not.toHaveBeenCalled()

    await act(async () => { answer.resolve(intentFor(19900)); await settle() })
    expect(stripe.confirmPayment).toHaveBeenCalledTimes(1)

    const after = await tapWallet('apple_pay')
    expect(after.reject).toHaveBeenCalledTimes(1)
    expect(after.resolve).not.toHaveBeenCalled()
  })
})

// ── (f) The rule that was already there ──

describe('a server amount above the page total', () => {
  test('is refused on the card path, and the page is moved to the real total', async () => {
    await mount(19900)
    serverCents = 22000
    await tapPay()
    expect(stripe.confirmPayment).not.toHaveBeenCalled()
    expect(elements.update).toHaveBeenCalledWith({ amount: 22000 })
    expect(onAmountResolved).toHaveBeenCalledWith(220)
    expect(shownError()).toContain(refusal('$220.00'))
  })

  test('is refused on a wallet, and the sheet is told why', async () => {
    await mount(19900)
    await tapWallet('link')
    serverCents = 22000
    const approved = await approveWallet('link')
    expect(approved.paymentFailed).toHaveBeenCalledWith({ reason: 'fail', message: refusal('$220.00') })
    expect(stripe.confirmPayment).not.toHaveBeenCalled()
    expect(elements.update).toHaveBeenCalledWith({ amount: 22000 })
    expect(onAmountResolved).toHaveBeenCalledWith(220)
  })
})
