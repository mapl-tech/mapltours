'use client'

import { useEffect, useState } from 'react'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { CreditCard, Lock, ShieldCheck } from 'lucide-react'
import { getStripe } from '@/lib/stripe'
import { useI18n } from '@/lib/i18n'
import LegalModal from './LegalModal'
import { CANCELLATION_SUMMARY } from '@/lib/refund-pricing'
import { setPaymentInFlight } from '@/lib/payment-lock'

/**
 * Stripe payment UI, extracted into its own chunk so the ~80 KB gz
 * Stripe SDK only downloads when the user actually reaches step 3.
 * Imported via next/dynamic from CheckoutView.
 */
export default function StripePaymentPanel({
  clientSecret,
  onPaymentSuccess,
  returnUrl = '/checkout/confirm',
}: {
  clientSecret: string
  onPaymentSuccess: () => void | Promise<void>
  /** Page to hand users back to after 3DS/bank redirects. Defaults to the
   *  tour-booking confirm page; transfers pass `/transfers/confirm`. */
  returnUrl?: string
}) {
  return (
    <Elements
      stripe={getStripe()}
      options={{
        clientSecret,
        // Register DM Sans inside Stripe's iframe, without this the
        // `fontFamily` below silently falls back to a system sans, so the
        // card number / expiry / CVC digits wouldn't actually be DM Sans.
        fonts: [
          {
            cssSrc: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap',
          },
        ],
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#171614',
            colorBackground: '#ffffff',
            colorText: '#171614',
            colorDanger: '#c00',
            fontFamily: 'DM Sans, sans-serif',
            borderRadius: '12px',
            spacingUnit: '4px',
          },
          rules: {
            '.Input': { border: '1px solid rgba(0,0,0,0.08)', padding: '14px', fontSize: '15px' },
            '.Input:focus': { borderColor: '#171614', boxShadow: '0 0 0 3px rgba(23,22,20,0.06)' },
            '.Label': { fontWeight: '600', fontSize: '12.5px', marginBottom: '6px' },
            '.Tab': { borderRadius: '10px', border: '1px solid rgba(0,0,0,0.08)' },
            '.Tab--selected': { borderColor: '#171614', backgroundColor: '#171614', color: '#fff' },
          },
        },
      }}
    >
      <PaymentStep onPaymentSuccess={onPaymentSuccess} returnUrl={returnUrl} />
    </Elements>
  )
}

function PaymentStep({
  onPaymentSuccess,
  returnUrl,
}: {
  onPaymentSuccess: () => void | Promise<void>
  returnUrl: string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [legalOpen, setLegalOpen] = useState(false)
  // Tell the WebMCP tools (any page) that a confirm is in flight, so an
  // agent cannot rewrite the cart while the PaymentIntent is settling.
  useEffect(() => {
    setPaymentInFlight(processing)
    return () => setPaymentInFlight(false)
  }, [processing])

  const handleSubmit = async () => {
    if (!stripe || !elements) return
    setProcessing(true)
    setError(null)

    const { error: submitError } = await elements.submit()
    if (submitError) {
      setError(submitError.message || 'Payment failed')
      setProcessing(false)
      return
    }

    // 3DS and other bank-side auth redirect the user to the caller-supplied
    // confirm page, which reads ?payment_intent=... and renders the success
    // / retry UI for the relevant flow (tours vs transfers).
    //
    // For non-3DS cards, Stripe resolves the promise locally with the
    // succeeded PaymentIntent attached. We navigate to the same confirm
    // URL ourselves so the post-payment page is server-rendered from the
    // booking row (booking ref, breakdown, pickup/dropoff, etc.) instead
    // of just the client-side cart state.
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.origin + returnUrl },
      redirect: 'if_required',
    })

    if (result.error) {
      setError(result.error.message || 'Payment failed')
      setProcessing(false)
      return
    }

    await onPaymentSuccess()
    const piId = result.paymentIntent?.id
    if (piId) {
      const url = new URL(returnUrl, window.location.origin)
      url.searchParams.set('payment_intent', piId)
      url.searchParams.set('redirect_status', result.paymentIntent?.status ?? 'succeeded')
      window.location.assign(url.toString())
    }
  }

  return (
    <div>
      <div style={{
        borderRadius: 'var(--r-xl)', overflow: 'hidden',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
      }}>
        <div style={{ padding: '18px 22px', background: 'var(--accent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CreditCard size={17} color="#fff" />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-dm-sans)' }}>
                {t('Payment Details')}
              </span>
            </div>
            <Lock size={13} color="rgba(255,255,255,0.4)" />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['SSL Encrypted', 'PCI Compliant', 'Stripe'].map((b) => (
              <span key={b} style={{
                fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-dm-sans)',
                color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.08)',
                padding: '3px 10px', borderRadius: 9999,
              }}>
                {b}
              </span>
            ))}
          </div>
        </div>

        <div style={{ padding: '24px 22px', background: '#fff' }}>
          <PaymentElement
            options={{
              layout: 'tabs',
              defaultValues: { billingDetails: { address: { country: 'US' } } },
            }}
          />
        </div>
      </div>

      {error && (
        <div style={{
          marginTop: 14, padding: '12px 16px', borderRadius: 'var(--r-md)',
          background: 'rgba(200,0,0,0.04)', border: '1px solid rgba(200,0,0,0.12)',
          fontSize: 13, color: '#c00', fontFamily: 'var(--font-dm-sans)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ flexShrink: 0 }}>&#9888;</span>
          {error}
        </div>
      )}

      <button
        className="btn-primary"
        onClick={handleSubmit}
        disabled={!stripe || processing}
        /* The mobile sticky bar delegates its tap to whichever element carries
           this attribute, so the same submit path serves both. Exactly one is
           mounted at a time: the step-1 summary CTA, or this. Without it the
           sticky "Complete booking" on the payment step was inert. */
        data-checkout-cta
        style={{
          width: '100%', height: 52, fontSize: 15, fontWeight: 700, marginTop: 18,
          opacity: processing ? 0.6 : 1,
          cursor: processing ? 'not-allowed' : 'pointer',
          boxShadow: processing ? 'none' : '0 4px 16px rgba(23,22,20,0.15)',
        }}
      >
        {processing ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'inline-block' }} />
            {t('Processing...')}
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={14} />
            {t('Complete Booking')}
          </span>
        )}
      </button>

      <p style={{
        marginTop: 12, textAlign: 'center',
        fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)',
      }}>
        <ShieldCheck size={11} color="var(--emerald)" style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
        {/* The cancellation half comes from the rule rather than from two
            translation keys that were never actually translated (neither
            string exists in lib/i18n.ts), so the numbers here cannot drift
            from lib/refund-pricing.ts the way four hand-typed copies could. */}
        {t('Encrypted & secure')} · {CANCELLATION_SUMMARY.short} ·{' '}
        {/* The most important of the three: this line sits directly under the
            pay button, so it is read at the exact moment someone decides to
            hand over a card. Opening a second tab there is the worst place on
            the site to lose someone. */}
        <button
          type="button"
          onClick={() => setLegalOpen(true)}
          style={{
            background: 'none', border: 'none', padding: 0,
            font: 'inherit', color: 'inherit', cursor: 'pointer',
            textDecoration: 'underline', textUnderlineOffset: 2,
          }}
        >
          {t('full policy')}
        </button>
      </p>

      {legalOpen && <LegalModal kind="terms" answer="cancellation" onClose={() => setLegalOpen(false)} />}
    </div>
  )
}
