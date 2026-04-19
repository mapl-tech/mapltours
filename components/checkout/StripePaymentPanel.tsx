'use client'

import { useState } from 'react'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { CreditCard, Lock, ShieldCheck } from 'lucide-react'
import { getStripe } from '@/lib/stripe'
import { useI18n } from '@/lib/i18n'

/**
 * Stripe payment UI — extracted into its own chunk so the ~80 KB gz
 * Stripe SDK only downloads when the user actually reaches step 3.
 * Imported via next/dynamic from CheckoutView.
 */
export default function StripePaymentPanel({
  clientSecret,
  onPaymentSuccess,
}: {
  clientSecret: string
  onPaymentSuccess: () => void | Promise<void>
}) {
  return (
    <Elements
      stripe={getStripe()}
      options={{
        clientSecret,
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
      <PaymentStep onPaymentSuccess={onPaymentSuccess} />
    </Elements>
  )
}

function PaymentStep({ onPaymentSuccess }: { onPaymentSuccess: () => void | Promise<void> }) {
  const stripe = useStripe()
  const elements = useElements()
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

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

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.origin + '/checkout' },
      redirect: 'if_required',
    })

    if (confirmError) {
      setError(confirmError.message || 'Payment failed')
      setProcessing(false)
    } else {
      await onPaymentSuccess()
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
                fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-dm-sans)',
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
        fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)',
      }}>
        <ShieldCheck size={11} color="var(--emerald)" style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
        {t('Encrypted & secure')} · {t('Free cancellation within 48 hrs')}
      </p>
    </div>
  )
}
