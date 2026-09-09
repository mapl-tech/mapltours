'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { StripeElementsOptions, StripeExpressCheckoutElementClickEvent, StripeExpressCheckoutElementConfirmEvent, StripeExpressCheckoutElementReadyEvent } from '@stripe/stripe-js'
import { Lock } from 'lucide-react'
import { getStripe } from '@/lib/stripe'
import { setPaymentInFlight } from '@/lib/payment-lock'

/**
 * Card fields and wallet buttons that are on the page BEFORE anything exists
 * on the server.
 *
 * Stripe's deferred-intent flow: the Payment Element mounts with only an
 * amount and currency, so the guest sees and fills the card form as part of
 * the one page. When they tap Pay we validate our own form, let Stripe
 * validate the card (elements.submit), then create the pending booking and
 * PaymentIntent with the same server call the two-step checkout used, size
 * the elements to the server's amount, and confirm. Nothing in the money
 * path changed: the server still prices the cart, owns the booking row and
 * mints the intent; this only moves when the card fields appear.
 *
 * Apple Pay and Google Pay sit above the card fields (a wallet collapses the
 * card form into one biometric confirmation), and only render when the
 * browser actually offers one, so nobody sees an empty row.
 */

export type IntentResult =
  | { clientSecret: string; bookingId: string; amountDue: number }
  | { navigate: string }
  | { error: string }

export interface DeferredPaymentPanelProps {
  /** What the guest will be charged, in cents. Below Stripe's $0.50 minimum means "nothing to charge". */
  amountCents: number
  returnUrl: string
  payLabel: string
  /** The page's own form gate. Must focus its own errors. False aborts the tap. */
  validate: () => boolean
  /** Creates (or reuses) the pending booking and PaymentIntent on the server. */
  createIntent: () => Promise<IntentResult>
  /** Runs after Stripe confirms, before navigating to the confirmation page. */
  onPaid?: () => Promise<void> | void
  /** Hands the pay action to the page so a sticky bar can trigger it. */
  registerPay?: (fn: (() => void) | null) => void
  /** Prefills the card form's billing details from the contact fields. */
  billing?: { name?: string; email?: string; phone?: string }
  /** Rendered between the card fields and the pay button (the terms line). */
  children?: ReactNode
  /** Rendered under the pay button (reassurance). */
  footer?: ReactNode
  /** A message from the page that should show in the panel's error slot. */
  externalError?: string | null
  /** The amount Stripe will really charge, once the intent exists (dollars). */
  onAmountResolved?: (usd: number) => void
}

const APPEARANCE: StripeElementsOptions['appearance'] = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#171614',
    colorBackground: '#ffffff',
    colorText: '#171614',
    colorDanger: '#b00020',
    fontFamily: 'DM Sans, sans-serif',
    fontSizeBase: '16px',
    borderRadius: '12px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: '1px solid rgba(23,22,20,0.16)', padding: '14px', fontSize: '16px' },
    '.Input:focus': { borderColor: '#171614', boxShadow: '0 0 0 3px rgba(23,22,20,0.06)' },
    '.Label': { fontWeight: '600', fontSize: '13px', marginBottom: '6px', color: '#5E5C57' },
    '.Tab': { borderRadius: '12px', border: '1px solid rgba(23,22,20,0.10)' },
    '.Tab--selected': { borderColor: '#171614', backgroundColor: '#171614', color: '#fff' },
  },
}

const FONTS: StripeElementsOptions['fonts'] = [
  { cssSrc: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap' },
]

export default function DeferredPaymentPanel(props: DeferredPaymentPanelProps) {
  const chargeable = props.amountCents >= 50
  // react-stripe-js calls elements.update() when these change, so the card
  // form always reflects the live total (gift card applied, party changed).
  const options = useMemo<StripeElementsOptions>(
    () => ({
      mode: 'payment',
      amount: Math.max(50, props.amountCents),
      currency: 'usd',
      // No paymentMethodTypes here: the server mints the intent with
      // automatic payment methods, and Stripe refuses to confirm details
      // collected under one configuration against an intent made with the
      // other. The Dashboard's method list applies to both sides.
      appearance: APPEARANCE,
      fonts: FONTS,
    }),
    [props.amountCents],
  )
  if (!chargeable) return <NothingToCharge {...props} />
  return (
    <Elements stripe={getStripe()} options={options}>
      <PayForm {...props} />
    </Elements>
  )
}

function useBusy(onChange?: (b: boolean) => void) {
  const [busy, setBusyState] = useState(false)
  const setBusy = useCallback((b: boolean) => {
    setBusyState(b)
    setPaymentInFlight(b)
    onChange?.(b)
  }, [onChange])
  useEffect(() => () => setPaymentInFlight(false), [])
  return [busy, setBusy] as const
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" style={{
      marginTop: 12, padding: '12px 14px', borderRadius: 'var(--r-md)',
      background: 'rgba(176,0,32,0.05)', border: '1px solid rgba(176,0,32,0.18)',
      fontSize: 13.5, lineHeight: 1.45, color: '#b00020', fontFamily: 'var(--font-dm-sans)',
      display: 'flex', alignItems: 'flex-start', gap: 8,
    }}>
      <span aria-hidden style={{ flexShrink: 0 }}>&#9888;</span>
      <span>{message}</span>
    </div>
  )
}

function PayButton({ label, busy, disabled, onClick }: { label: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn-primary"
      onClick={onClick}
      disabled={disabled || busy}
      data-checkout-cta
      style={{ width: '100%', height: 54, fontSize: 16, fontWeight: 700, marginTop: 16, opacity: busy ? 0.7 : 1, cursor: busy ? 'progress' : 'pointer', boxShadow: busy ? 'none' : '0 6px 18px rgba(23,22,20,0.16)' }}
    >
      {busy ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'inline-block' }} />
          Confirming…
        </span>
      ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Lock size={15} /> {label}</span>
      )}
    </button>
  )
}

/** Fully covered by a gift card: no card form, one button, same server call. */
function NothingToCharge({ payLabel, validate, createIntent, onPaid, registerPay, children, footer, externalError }: DeferredPaymentPanelProps) {
  const [busy, setBusy] = useBusy()
  const [error, setError] = useState<string | null>(null)
  const complete = useCallback(async () => {
    if (busy || !validate()) return
    setBusy(true); setError(null)
    try {
      const res = await createIntent()
      if ('navigate' in res) { await onPaid?.(); window.location.assign(res.navigate); return }
      if ('error' in res) { setError(res.error); return }
      // The server found something left to charge (the gift balance moved
      // underneath us). This component is about to be replaced by the card
      // form, so the page says so through externalError rather than here.
      setBusy(false)
    } catch {
      setError('Something went wrong. Please try again.')
      setBusy(false)
    }
  }, [busy, validate, createIntent, onPaid, setBusy])
  useEffect(() => { registerPay?.(complete); return () => registerPay?.(null) }, [registerPay, complete])
  const shown = error ?? externalError ?? null
  return (
    <div>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        Your gift card covers this booking in full. No card is needed.
      </p>
      {children}
      {shown && <ErrorBox message={shown} />}
      <PayButton label={payLabel} busy={busy} disabled={false} onClick={complete} />
      {footer}
    </div>
  )
}

function PayForm({ amountCents, returnUrl, payLabel, validate, createIntent, onPaid, onAmountResolved, registerPay, billing, children, footer, externalError }: DeferredPaymentPanelProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useBusy()
  const [error, setError] = useState<string | null>(null)
  const [walletReady, setWalletReady] = useState(false)
  const [cardReady, setCardReady] = useState(false)
  const busyRef = useRef(false)

  const leaving = useRef(false)
  const pay = useCallback(async (wallet?: StripeExpressCheckoutElementConfirmEvent) => {
    if (!stripe || !elements || busyRef.current || leaving.current) return
    setError(null)
    if (!validate()) { wallet?.paymentFailed({ reason: 'fail', message: 'Some details are missing on the page.' }); return }
    busyRef.current = true
    setBusy(true)
    // A wallet sheet stays open with a spinner until it is told the outcome;
    // every failure path below has to close it.
    const fail = (message: string | null) => { setError(message); wallet?.paymentFailed({ reason: 'fail', ...(message ? { message } : {}) }) }
    try {
      // Stripe validates the card fields and shows its own inline messages.
      const { error: submitError } = await elements.submit()
      if (submitError) { fail(submitError.message ?? 'Please check your card details.'); return }
      const res = await createIntent()
      if ('navigate' in res) { leaving.current = true; await onPaid?.(); window.location.assign(res.navigate); return }
      if ('error' in res) { fail(res.error); return }
      // What Stripe will really charge, read from the intent rather than from
      // the page's arithmetic. Two server responses carry no amountDue at all
      // (the transfers route, and either route's reuse-an-existing-intent
      // branch), and a gift card is claimed server-side against a live
      // balance, so the page's figure can be stale. Elements must carry the
      // intent's amount or the confirm is refused.
      const retrieved = await stripe.retrievePaymentIntent(res.clientSecret)
      const due = retrieved.paymentIntent?.amount ?? Math.round(res.amountDue * 100)
      if (due !== amountCents) {
        await elements.update({ amount: Math.max(50, due) })
        onAmountResolved?.(due / 100)
        // Never charge more than the page displayed. Less is fine (a gift
        // card covered more than the preview showed); more has to be seen
        // and accepted first.
        if (due > amountCents) {
          fail(`The total is now ${(due / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}. Check it, then tap the button again.`)
          return
        }
      }
      const result = await stripe.confirmPayment({
        elements,
        clientSecret: res.clientSecret,
        confirmParams: { return_url: window.location.origin + returnUrl },
        redirect: 'if_required',
      })
      if (result.error) {
        // A card decline or a field problem is shown by the Payment Element
        // itself, inline, next to the field, so repeating it here would put
        // the same sentence on screen twice. A wallet has no such field: its
        // sheet closes and the guest is left looking at the page, so that
        // message has to be shown here.
        const inline = !wallet && (result.error.type === 'card_error' || result.error.type === 'validation_error')
        fail(inline ? null : (result.error.message ?? 'Payment failed. Please try again.'))
        if (inline) elements.getElement('payment')?.focus?.()
        return
      }
      // Paid. Stay locked: the button must not come back to life in the
      // moment between here and the confirmation page, or a second tap
      // could re-confirm a settled intent.
      leaving.current = true
      await onPaid?.()
      // Same landing as a 3DS return: the confirm page renders from the
      // booking row, keyed by the intent.
      const url = new URL(returnUrl, window.location.origin)
      if (result.paymentIntent?.id) {
        url.searchParams.set('payment_intent', result.paymentIntent.id)
        url.searchParams.set('redirect_status', result.paymentIntent.status ?? 'succeeded')
      }
      window.location.assign(url.toString())
    } catch (e) {
      fail(e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.')
    } finally {
      if (!leaving.current) {
        busyRef.current = false
        setBusy(false)
      }
    }
  }, [stripe, elements, validate, createIntent, onPaid, onAmountResolved, amountCents, returnUrl, setBusy])

  useEffect(() => { registerPay?.(() => pay()); return () => registerPay?.(null) }, [registerPay, pay])

  const onWalletClick = useCallback((event: StripeExpressCheckoutElementClickEvent) => {
    // The sheet opens only when our form is complete. Stripe needs one of
    // these two calls within a second of the tap; returning without either
    // leaves the button in a dead state until the page is reloaded.
    if (validate()) event.resolve()
    else event.reject()
  }, [validate])

  const onWalletReady = useCallback((event: StripeExpressCheckoutElementReadyEvent) => {
    const methods = event.availablePaymentMethods
    setWalletReady(!!methods && Object.values(methods).some(Boolean))
  }, [])

  const shown = error ?? externalError ?? null

  return (
    <div>
      {/* Wallets first: one biometric confirmation instead of a card form. */}
      <div style={{ display: walletReady ? 'block' : 'none', marginBottom: 14 }}>
        <ExpressCheckoutElement
          onReady={onWalletReady}
          onClick={onWalletClick}
          onConfirm={(event) => { void pay(event) }}
          options={{
            buttonType: { applePay: 'book', googlePay: 'book' },
            buttonHeight: 48,
            layout: { maxColumns: 2, maxRows: 1, overflow: 'auto' },
            paymentMethods: { link: 'never', paypal: 'never', amazonPay: 'never', klarna: 'never' },
          }}
        />
        <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0 2px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', fontSize: 12.5 }}>
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          or pay by card
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
      </div>

      <div style={{ minHeight: cardReady ? undefined : 180, position: 'relative' }}>
        {!cardReady && (
          <p aria-live="polite" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-dm-sans)', fontSize: 13.5, color: 'var(--text-tertiary)' }}>
            Loading secure card form…
          </p>
        )}
        <PaymentElement
          onReady={() => setCardReady(true)}
          options={{
            layout: 'tabs',
            defaultValues: { billingDetails: { name: billing?.name || undefined, email: billing?.email || undefined, phone: billing?.phone || undefined } },
            business: { name: 'MAPL Tours Jamaica' },
          }}
        />
      </div>

      {children}
      {shown && <ErrorBox message={shown} />}
      <PayButton label={payLabel} busy={busy} disabled={!stripe || !elements || !cardReady} onClick={() => { void pay() }} />
      {footer}
    </div>
  )
}
