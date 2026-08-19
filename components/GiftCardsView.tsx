'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { Check, Loader2 } from 'lucide-react'
import { DESTINATION_IMAGES } from '@/lib/experiences'
import { GIFT_MIN, GIFT_MAX, GIFT_VALID_MONTHS } from '@/lib/gift-cards'
import Footer from './Footer'

// Stripe's SDK is ~80 KB gzipped; nobody browsing gift cards should pay for
// it until they've actually chosen an amount.
const StripePaymentPanel = dynamic(() => import('./checkout/StripePaymentPanel'), {
  ssr: false,
  loading: () => (
    <p style={{ fontSize: 14, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
      Loading secure payment…
    </p>
  ),
})

const presetAmounts = [
  { amount: 50, label: '$50', tagline: 'A taste of Jamaica', desc: 'Street food crawl or sunrise fishing' },
  { amount: 100, label: '$100', tagline: 'The essentials', desc: 'Most individual experiences' },
  { amount: 150, label: '$150', tagline: 'Go deeper', desc: 'Full-day cultural immersion' },
  { amount: 250, label: '$250', tagline: 'For two', desc: 'Multi-experience couples package' },
  { amount: 500, label: '$500', tagline: 'The collection', desc: 'The ultimate Jamaica experience' },
]

export default function GiftCardsView() {
  const [selectedAmount, setSelectedAmount] = useState(100)
  const [customAmount, setCustomAmount] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [senderName, setSenderName] = useState('')
  const [message, setMessage] = useState('')
  const [purchaserEmail, setPurchaserEmail] = useState('')

  // 'form' → 'pay' → 'done'. Nothing is created or sent until the card
  // clears; 'done' is only reached after Stripe confirms the payment.
  const [stage, setStage] = useState<'form' | 'pay' | 'done'>('form')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The purchased card, revealed after payment. This is the buyer's own copy
  // of the code — the safety net if the recipient address was mistyped.
  const [purchased, setPurchased] = useState<{
    code: string; amount: number; recipientEmail: string; expiresAt: string | null; delivered: boolean
  } | null>(null)
  const [revealing, setRevealing] = useState(false)

  // Balance check. A card can be spent across several bookings, so a holder
  // needs to see what is left without starting a checkout to find out.
  const [balanceCode, setBalanceCode] = useState('')
  const [balanceResult, setBalanceResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [balanceChecking, setBalanceChecking] = useState(false)

  async function checkBalance() {
    const code = balanceCode.trim()
    if (!code) return
    setBalanceChecking(true)
    setBalanceResult(null)
    try {
      const res = await fetch('/api/gifts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      setBalanceResult(
        data.valid
          ? { ok: true, text: `$${(data.balanceCents / 100).toFixed(2)} left on ${data.code}.` }
          : { ok: false, text: data.message ?? 'That code could not be checked.' },
      )
    } catch {
      setBalanceResult({ ok: false, text: 'Could not check that code. Please try again.' })
    } finally {
      setBalanceChecking(false)
    }
  }

  const reveal = useCallback(async (paymentIntentId: string) => {
    setRevealing(true)
    try {
      const res = await fetch('/api/gifts/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId }),
      })
      const data = await res.json()
      if (data.ready) {
        setPurchased({
          code: data.code, amount: data.amount, recipientEmail: data.recipientEmail,
          expiresAt: data.expiresAt ?? null, delivered: !!data.delivered,
        })
        setStage('done')
      } else if (data.status && data.status !== 'succeeded') {
        setError('That payment did not complete. Nothing has been charged.')
      }
    } catch {
      setError('We could not load your gift card. Check your email, or contact us with your payment reference.')
    } finally {
      setRevealing(false)
    }
  }, [])

  // Stripe sends the buyer back here after payment (and after any 3DS step),
  // which remounts this component with all its state gone. Without this the
  // confirmation — and the code — would be lost every single time.
  useEffect(() => {
    const pi = new URLSearchParams(window.location.search).get('payment_intent')
    if (pi) {
      setStage('pay')
      void reveal(pi)
    }
  }, [reveal])

  const finalAmount = isCustom ? (parseInt(customAmount) || 0) : selectedAmount
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())
  const purchaserLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(purchaserEmail.trim())
  // The buyer's address is required, not optional: it carries the receipt that
  // repeats the code, which is the only recovery path if the recipient address
  // is wrong. Without it a typo makes the purchase unrecoverable.
  const canPurchase =
    finalAmount >= GIFT_MIN && finalAmount <= GIFT_MAX &&
    emailLooksValid && purchaserLooksValid && !creating

  async function startPurchase() {
    setError(null)
    setCreating(true)
    try {
      const res = await fetch('/api/gifts/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: finalAmount,
          recipientName: recipientName.trim(),
          recipientEmail: recipientEmail.trim(),
          senderName: senderName.trim(),
          purchaserEmail: purchaserEmail.trim(),
          message: message.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.clientSecret) {
        setError(data.error ?? 'Could not start the purchase. Please try again.')
        return
      }
      setClientSecret(data.clientSecret)
      setStage('pay')
    } catch {
      setError('Could not reach the payment service. Please check your connection and try again.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: 'var(--nav-h)' }}>

      {/* ── Hero ── */}
      <div style={{
        position: 'relative', height: 420, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Image
          src={DESTINATION_IMAGES['Negril']}
          alt="Gift Cards"
          fill sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: 'center 40%' }}
          priority
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.8) 100%)',
        }} />

        <div style={{
          position: 'relative', zIndex: 1, textAlign: 'center',
          maxWidth: 640, padding: '0 24px',
        }}>
          {/* --gold-warm measures 2.91:1 against this hero's mid-tone
              photograph, under the 4.5 AA floor for 12px text. This lighter
              gold measures 4.59:1 on the same ground and keeps the hue. */}
          <p style={{
            fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.16em', color: '#E8D08A',
            fontFamily: 'var(--font-dm-sans)', marginBottom: 16,
            textShadow: '0 1px 6px rgba(0,0,0,0.5)',
          }}>
            Give Jamaica
          </p>
          <h1 style={{
            fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
            fontSize: 'clamp(2.25rem, 5vw, 3.5rem)', color: 'white',
            lineHeight: 1.05, letterSpacing: '-0.035em',
            marginBottom: 16,
          }}>
            The gift of<br />unforgettable experiences
          </h1>
          <p style={{
            fontSize: 16, color: 'rgba(255,255,255,0.7)',
            fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6,
            maxWidth: 460, margin: '0 auto',
          }}>
            Spend it on anything we run — experiences, a day out, an airport transfer.
            Across as many bookings as it takes to use it up.
          </p>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px', paddingBottom: 80 }}>

        {/* ── Gift Card Preview + Amount Selection ── */}
        <div style={{
          display: 'flex', gap: 48, alignItems: 'flex-start', flexWrap: 'wrap',
          marginTop: -60, position: 'relative', zIndex: 2,
        }}>

          {/* Left: Card preview */}
          <div style={{ flex: '1 1 340px', minWidth: 300 }}>
            <div style={{
              aspectRatio: '1.6',
              borderRadius: 'var(--r-xl)',
              overflow: 'hidden',
              position: 'relative',
              boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)',
            }}>
              <Image
                src={DESTINATION_IMAGES['Ocho Rios']}
                alt="Gift card"
                fill sizes="50vw"
                style={{ objectFit: 'cover' }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(160deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.55) 100%)',
              }} />

              {/* Card content */}
              <div style={{
                position: 'absolute', inset: 0,
                padding: '32px 36px',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{
                      fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
                      fontSize: 18, color: 'white', letterSpacing: '0.04em',
                    }}>
                      MAPL TOURS
                    </p>
                    <p style={{
                      fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
                      fontFamily: 'var(--font-dm-sans)', letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                    }}>
                      Tours Jamaica
                    </p>
                  </div>
                  <p style={{
                    fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
                    fontFamily: 'var(--font-dm-sans)', letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}>
                    Gift Card
                  </p>
                </div>

                <div>
                  {recipientName && (
                    <p style={{
                      fontSize: 13, color: 'rgba(255,255,255,0.6)',
                      fontFamily: 'var(--font-dm-sans)', marginBottom: 6,
                    }}>
                      For {recipientName}
                    </p>
                  )}
                  <p style={{
                    fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
                    fontSize: finalAmount > 0 ? 48 : 36, color: 'white',
                    letterSpacing: '-0.03em', lineHeight: 1,
                  }}>
                    {finalAmount > 0 ? `$${finalAmount}` : '$0'}
                  </p>
                  {senderName && (
                    <p style={{
                      fontSize: 12, color: 'rgba(255,255,255,0.45)',
                      fontFamily: 'var(--font-dm-sans)', marginTop: 8,
                    }}>
                      From {senderName}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Message preview */}
            {message && (
              <div style={{
                marginTop: 16, padding: '16px 20px',
                borderRadius: 'var(--r-lg)',
                background: 'var(--bg-warm)',
                border: '1px solid var(--border)',
              }}>
                <p style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-dm-sans)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  marginBottom: 8,
                }}>
                  Personal message
                </p>
                <p style={{
                  fontSize: 14, color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6,
                  fontStyle: 'italic',
                }}>
                  &ldquo;{message}&rdquo;
                </p>
              </div>
            )}
          </div>

          {/* Right: Amount + Form */}
          <div style={{ flex: '1 1 340px' }}>

            {stage === 'form' ? (
              <>
                {/* Amount selection */}
                <div style={{
                  padding: '32px',
                  background: 'var(--card-bg)',
                  borderRadius: 'var(--r-xl)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-lg)',
                  marginBottom: 20,
                }}>
                  <h2 style={{
                    fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
                    fontSize: 20, color: 'var(--text-primary)',
                    letterSpacing: '-0.02em', marginBottom: 20,
                  }}>
                    Choose an amount
                  </h2>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    {presetAmounts.map((p) => {
                      const active = !isCustom && selectedAmount === p.amount
                      return (
                        <button
                          key={p.amount}
                          onClick={() => { setSelectedAmount(p.amount); setIsCustom(false) }}
                          style={{
                            padding: '16px 12px', borderRadius: 'var(--r-md)',
                            border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                            background: active ? 'var(--surface)' : 'var(--card-bg)',
                            cursor: 'pointer', textAlign: 'left',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <p style={{
                            fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
                            fontSize: 22, color: 'var(--text-primary)',
                            marginBottom: 2,
                          }}>
                            {p.label}
                          </p>
                          <p style={{
                            fontSize: 12, color: 'var(--text-tertiary)',
                            fontFamily: 'var(--font-dm-sans)',
                          }}>
                            {p.tagline}
                          </p>
                        </button>
                      )
                    })}

                    {/* Custom amount */}
                    <button
                      onClick={() => setIsCustom(true)}
                      style={{
                        padding: '16px 12px', borderRadius: 'var(--r-md)',
                        border: isCustom ? '2px solid var(--accent)' : '1px solid var(--border)',
                        background: isCustom ? 'var(--surface)' : 'var(--card-bg)',
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isCustom ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)' }}>$</span>
                          <input
                            type="number"
                            value={customAmount}
                            onChange={(e) => setCustomAmount(e.target.value)}
                            placeholder="0"
                            autoFocus
                            aria-label="Custom gift card amount in dollars"
                            min={GIFT_MIN}
                            max={GIFT_MAX}
                            style={{
                              width: '100%', border: 'none', background: 'transparent',
                              fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 22,
                              color: 'var(--text-primary)', outline: 'none',
                            }}
                          />
                        </div>
                      ) : (
                        <p style={{
                          fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
                          fontSize: 22, color: 'var(--text-primary)', marginBottom: 2,
                        }}>
                          Custom
                        </p>
                      )}
                      <p style={{
                        fontSize: 12, color: 'var(--text-tertiary)',
                        fontFamily: 'var(--font-dm-sans)',
                      }}>
                        Any amount
                      </p>
                    </button>
                  </div>
                </div>

                {/* Personalize */}
                <div style={{
                  padding: '32px',
                  background: 'var(--card-bg)',
                  borderRadius: 'var(--r-xl)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  <h3 style={{
                    fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
                    fontSize: 17, color: 'var(--text-primary)',
                    marginBottom: 20,
                  }}>
                    Personalize
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {[
                      { label: 'Recipient name', value: recipientName, onChange: setRecipientName, placeholder: 'Their name' },
                      { label: 'Recipient email', value: recipientEmail, onChange: setRecipientEmail, placeholder: 'their@email.com', type: 'email' },
                      { label: 'Your name', value: senderName, onChange: setSenderName, placeholder: 'Your name' },
                      { label: 'Your email (for your copy of the code)', value: purchaserEmail, onChange: setPurchaserEmail, placeholder: 'you@email.com', type: 'email' },
                    ].map((f) => (
                      <div key={f.label}>
                        <label
                          htmlFor={`gift-${f.label.replace(/[^a-z]/gi, '').toLowerCase()}`}
                          style={{
                            display: 'block', fontSize: 12, fontWeight: 600,
                            color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)',
                            marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}
                        >
                          {f.label}
                        </label>
                        <input
                          id={`gift-${f.label.replace(/[^a-z]/gi, '').toLowerCase()}`}
                          type={f.type || 'text'}
                          aria-label={f.label}
                          value={f.value}
                          onChange={(e) => f.onChange(e.target.value)}
                          placeholder={f.placeholder}
                          style={{
                            width: '100%', height: 44, borderRadius: 'var(--r-sm)',
                            border: '1px solid var(--border-strong)', padding: '0 14px',
                            fontSize: 14, fontFamily: 'var(--font-dm-sans)',
                            color: 'var(--text-primary)', background: 'var(--bg)',
                            outline: 'none', boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    ))}

                    <div>
                      <label
                        htmlFor="gift-message"
                        style={{
                          display: 'block', fontSize: 12, fontWeight: 600,
                          color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)',
                          marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}
                      >
                        Personal message
                      </label>
                      <textarea
                        id="gift-message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Wishing you an amazing time in Jamaica..."
                        rows={3}
                        style={{
                          width: '100%', borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--border-strong)', padding: '12px 14px',
                          fontSize: 14, fontFamily: 'var(--font-dm-sans)',
                          color: 'var(--text-primary)', background: 'var(--bg)',
                          outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  {error && (
                    <p style={{
                      fontSize: 13, color: '#c00', fontFamily: 'var(--font-dm-sans)',
                      marginTop: 18, lineHeight: 1.5,
                    }}>
                      {error}
                    </p>
                  )}

                  <button
                    onClick={startPurchase}
                    disabled={!canPurchase}
                    className="btn-primary"
                    style={{
                      width: '100%', height: 48, marginTop: 24,
                      fontSize: 15, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      opacity: canPurchase ? 1 : 0.5,
                      cursor: canPurchase ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {creating && <Loader2 size={16} className="spin" />}
                    {creating ? 'Preparing checkout…' : `Continue to payment · $${finalAmount}`}
                  </button>

                  <p style={{
                    fontSize: 12, color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-dm-sans)', textAlign: 'center',
                    marginTop: 12, lineHeight: 1.5,
                  }}>
                    Emailed to {recipientEmail.trim() || 'your recipient'} as soon as payment
                    clears. Between ${GIFT_MIN} and ${GIFT_MAX}. Valid for {GIFT_VALID_MONTHS} months.
                    Gift card purchases are non-refundable.
                  </p>
                </div>
              </>
            ) : stage === 'pay' ? (
              /* ── Payment ── */
              <div style={{
                padding: '32px',
                background: 'var(--card-bg)',
                borderRadius: 'var(--r-xl)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-lg)',
              }}>
                <h2 style={{
                  fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
                  fontSize: 20, color: 'var(--text-primary)',
                  letterSpacing: '-0.02em', marginBottom: 6,
                }}>
                  Pay ${finalAmount}
                </h2>
                <p style={{
                  fontSize: 13.5, color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6,
                  marginBottom: 22,
                }}>
                  The card goes to <strong style={{ color: 'var(--text-primary)' }}>{recipientEmail.trim()}</strong>{' '}
                  once this payment clears.
                </p>

                {clientSecret && (
                  <StripePaymentPanel
                    clientSecret={clientSecret}
                    returnUrl="/gifts"
                    onPaymentSuccess={() => setStage('done')}
                  />
                )}

                <button
                  onClick={() => { setStage('form'); setClientSecret(null) }}
                  style={{
                    marginTop: 18, background: 'none', border: 'none',
                    fontSize: 13, color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-dm-sans)', cursor: 'pointer',
                    textDecoration: 'underline', padding: 0,
                  }}
                >
                  Change the amount or details
                </button>
              </div>
            ) : (
              /* ── Paid ── */
              <div style={{
                padding: '48px 32px', textAlign: 'center',
                background: 'var(--card-bg)',
                borderRadius: 'var(--r-xl)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-lg)',
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'rgba(196,164,74,0.15)',
                  border: '1px solid var(--gold-warm)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                }}>
                  <Check size={26} color="var(--gold-text)" />
                </div>
                <h2 style={{
                  fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
                  fontSize: 24, color: 'var(--text-primary)',
                  marginBottom: 8,
                }}>
                  Payment received
                </h2>

                {purchased ? (
                  <>
                    <p style={{
                      fontSize: 14, color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6,
                      marginBottom: 20,
                    }}>
                      {purchased.delivered
                        ? <>We&rsquo;ve emailed the ${purchased.amount} card to <strong style={{ color: 'var(--text-primary)' }}>{purchased.recipientEmail}</strong>.</>
                        : <>We&rsquo;re emailing the ${purchased.amount} card to <strong style={{ color: 'var(--text-primary)' }}>{purchased.recipientEmail}</strong> now.</>}
                      {' '}Here is the code as well &mdash; write it down.
                    </p>

                    {/* The code, shown on screen. If the recipient address was
                        mistyped, this is the buyer's only recovery path. */}
                    <div style={{
                      padding: '18px 16px', marginBottom: 18,
                      borderRadius: 'var(--r-md)',
                      background: 'var(--surface)',
                      border: '1px dashed var(--gold-warm)',
                    }}>
                      <p style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
                        textTransform: 'uppercase', color: 'var(--text-tertiary)',
                        fontFamily: 'var(--font-dm-sans)', marginBottom: 8,
                      }}>
                        Gift card code
                      </p>
                      <p style={{
                        fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
                        fontSize: 24, letterSpacing: '0.10em',
                        color: 'var(--text-primary)', wordBreak: 'break-all',
                      }}>
                        {purchased.code}
                      </p>
                    </div>

                    <button
                      onClick={() => { void navigator.clipboard?.writeText(purchased.code) }}
                      className="btn-outline"
                      style={{
                        height: 38, padding: '0 20px', fontSize: 13, fontWeight: 600,
                        borderRadius: 'var(--r-sm)', marginBottom: 18,
                      }}
                    >
                      Copy code
                    </button>

                    <p style={{
                      fontSize: 12.5, color: 'var(--text-tertiary)',
                      fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6,
                      marginBottom: 20,
                    }}>
                      A copy is on its way to {purchaserEmail.trim() || 'your email'} too. If the
                      recipient&rsquo;s address above is wrong, reply to that email with this code
                      and we&rsquo;ll send it on &mdash; nothing is lost.
                    </p>
                  </>
                ) : revealing ? (
                  <p style={{
                    fontSize: 14, color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-dm-sans)', marginBottom: 20,
                  }}>
                    Loading your gift card code&hellip;
                  </p>
                ) : (
                  <p style={{
                    fontSize: 14, color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6,
                    marginBottom: 20,
                  }}>
                    Your gift card is on its way by email. If it doesn&rsquo;t arrive within a few
                    minutes, contact us and we&rsquo;ll resend it.
                  </p>
                )}

                <button
                  onClick={() => {
                    // Drop the payment_intent so a refresh doesn't drag the
                    // buyer back into the confirmation they just left.
                    window.history.replaceState(null, '', '/gifts')
                    setStage('form')
                    setClientSecret(null)
                    setPurchased(null)
                    setRecipientName('')
                    setRecipientEmail('')
                    setSenderName('')
                    setMessage('')
                    setError(null)
                  }}
                  className="btn-outline"
                  style={{
                    height: 42, padding: '0 28px',
                    fontSize: 14, fontWeight: 600,
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  Send another
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Check a balance ── */}
        <div style={{
          marginTop: 64, padding: '28px 32px',
          background: 'var(--card-bg)', borderRadius: 'var(--r-xl)',
          border: '1px solid var(--border)', maxWidth: 520,
        }}>
          <h3 style={{
            fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
            fontSize: 17, color: 'var(--text-primary)', marginBottom: 6,
          }}>
            Already have a card?
          </h3>
          <p style={{
            fontSize: 13.5, color: 'var(--text-secondary)',
            fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6, marginBottom: 16,
          }}>
            Check what&rsquo;s left on it. A card can be spent across as many bookings
            as it takes to use up.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <label htmlFor="gift-balance-code" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
              Gift card code
            </label>
            <input
              id="gift-balance-code"
              value={balanceCode}
              onChange={(e) => { setBalanceCode(e.target.value); setBalanceResult(null) }}
              placeholder="MAPL-XXXX-XXXX"
              style={{
                flex: 1, minWidth: 0, height: 44, borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border-strong)', padding: '0 14px',
                fontSize: 14, fontFamily: 'var(--font-dm-sans)',
                color: 'var(--text-primary)', background: 'var(--bg)',
                outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase',
              }}
            />
            <button
              onClick={checkBalance}
              disabled={balanceChecking || balanceCode.trim().length < 4}
              className="btn-outline"
              style={{
                height: 44, padding: '0 20px', fontSize: 14, fontWeight: 600,
                borderRadius: 'var(--r-sm)', whiteSpace: 'nowrap',
                opacity: balanceChecking || balanceCode.trim().length < 4 ? 0.5 : 1,
              }}
            >
              {balanceChecking ? 'Checking…' : 'Check'}
            </button>
          </div>
          {balanceResult && (
            <p style={{
              marginTop: 12, fontSize: 14, fontWeight: 600,
              fontFamily: 'var(--font-dm-sans)',
              color: balanceResult.ok ? 'var(--emerald, #00A550)' : '#c00',
            }}>
              {balanceResult.text}
            </p>
          )}
        </div>

        {/* ── How It Works ── */}
        <div style={{ marginTop: 80 }}>
          <h2 style={{
            fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
            fontSize: 24, color: 'var(--text-primary)',
            letterSpacing: '-0.02em', textAlign: 'center',
            marginBottom: 40,
          }}>
            How it works
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
            {[
              { step: '01', title: 'Choose & personalize', desc: 'Select an amount, add a personal message, and enter the recipient\'s email.' },
              { step: '02', title: 'It lands in their inbox', desc: 'As soon as your payment clears, they get the card and its redemption code by email. You get a receipt with the same code.' },
              { step: '03', title: 'They spend it at checkout', desc: 'They enter the code at checkout and the value comes off the total. Any balance left over stays on the card for next time.' },
            ].map((item) => (
              <div key={item.step} style={{ textAlign: 'center' }}>
                <p style={{
                  fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
                  fontSize: 40, color: 'var(--gold-text)',
                  marginBottom: 12, letterSpacing: '-0.03em',
                }}>
                  {item.step}
                </p>
                <h3 style={{
                  fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
                  fontSize: 17, color: 'var(--text-primary)',
                  marginBottom: 8,
                }}>
                  {item.title}
                </h3>
                <p style={{
                  fontSize: 14, color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6,
                }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom CTA ── */}
        <div style={{
          marginTop: 64, padding: '48px 40px',
          borderRadius: 'var(--r-xl)',
          background: 'var(--accent)', textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
            fontSize: 24, color: 'white',
            letterSpacing: '-0.02em', marginBottom: 8,
          }}>
            Questions about gift cards?
          </h2>
          <p style={{
            fontSize: 15, color: 'rgba(255,255,255,0.7)',
            fontFamily: 'var(--font-dm-sans)', marginBottom: 24,
          }}>
            Our team is happy to help with bulk orders, corporate gifts, or custom amounts.
          </p>
          <a href="mailto:contact@mapltours.com" style={{
            display: 'inline-flex', alignItems: 'center',
            height: 44, padding: '0 28px',
            borderRadius: 9999, background: 'white', color: 'var(--accent)',
            fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
            textDecoration: 'none',
          }}>
            Contact contact@mapltours.com
          </a>
        </div>
      </div>

      <Footer />
    </div>
  )
}
