'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  ArrowLeft,
  Car,
  Lock,
  Plane,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useTransfersCart, type TransferCartItem } from '@/lib/transfers-cart'

const StripePaymentPanel = dynamic(
  () => import('@/components/checkout/StripePaymentPanel'),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          padding: 60,
          textAlign: 'center',
          fontSize: 14,
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-dm-sans)',
          background: '#fff',
          borderRadius: 'var(--r-xl)',
          border: '1px solid var(--border)',
        }}
      >
        Setting up secure payment…
      </div>
    ),
  },
)

/**
 * Transfers checkout — mirrors the tours CheckoutView aesthetic: light
 * bg-warm background, white cards, Syne serif headings, tight DM Sans UI.
 * Single page flow because transfers don't need date-picking or a day
 * builder. Validation runs before we call /api/transfers/checkout.
 */
export default function TransfersCheckoutView() {
  const { items, removeItem, updateItem, subtotal, fee, grandTotal } =
    useTransfersCart()

  const [form, setForm] = useState<Record<string, string>>({})
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({})
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [stripeError, setStripeError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [intentKey, setIntentKey] = useState(0)

  const validate = (): boolean => {
    const errs: Record<string, boolean> = {}
    if (!form['firstName']?.trim()) errs['firstName'] = true
    if (!form['lastName']?.trim()) errs['lastName'] = true
    if (!form['email']?.trim() || !/.+@.+\..+/.test(form['email']))
      errs['email'] = true
    if (!form['phone']?.trim()) errs['phone'] = true
    for (const item of items) {
      if (!item.arrivalAt) errs[`arrival-${item.id}`] = true
      if (item.tripType === 'round_trip' && !item.departureAt) {
        errs[`departure-${item.id}`] = true
      }
    }
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  const startPayment = () => {
    setStripeError(null)
    if (!validate()) {
      setTimeout(() => {
        const firstError = document.querySelector('[data-field-error]')
        firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      return
    }
    setIntentKey((k) => k + 1)
  }

  useEffect(() => {
    if (intentKey === 0 || items.length === 0) return
    fetch('/api/transfers/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: grandTotal(),
        items: items.map((i) => ({
          destinationId: i.destinationId,
          tripType: i.tripType,
          passengers: i.passengers,
          arrivalAt: i.arrivalAt,
          arrivalFlight: i.arrivalFlight,
          departureAt: i.departureAt,
          departureFlight: i.departureFlight,
        })),
        customer: {
          email: form['email'],
          firstName: form['firstName'],
          lastName: form['lastName'],
          phone: form['phone'],
          country: form['country'],
          specialRequests: form['specialRequests'],
        },
        breakdown: { subtotal: subtotal(), fee: fee() },
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setStripeError(data.error)
        else setClientSecret(data.clientSecret)
      })
      .catch(() =>
        setStripeError(
          'Could not reach the payment service. Please try again in a moment.',
        ),
      )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentKey])

  if (confirmed) {
    return <ConfirmedInline total={grandTotal()} items={items} />
  }

  if (items.length === 0) {
    return <EmptyState />
  }

  const step = clientSecret ? 2 : 1

  return (
    <div
      style={{
        minHeight: '100vh',
        paddingTop: 56,
        background: 'var(--bg-warm)',
        color: 'var(--text-primary)',
      }}
    >
      {/* ── Top bar (mirrors tours checkout) ── */}
      <div
        style={{
          borderBottom: '1px solid var(--border)',
          background: '#fff',
        }}
      >
        <div
          className="container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            maxWidth: 1100,
          }}
        >
          <Link
            href="/transfers"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13.5,
              fontFamily: 'var(--font-dm-sans)',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              transition: 'color 0.15s ease',
            }}
          >
            <ArrowLeft size={15} /> Back
          </Link>
          <div style={{ textAlign: 'center' }}>
            <h2
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: '-0.005em',
              }}
            >
              Airport transfer
            </h2>
          </div>
          <div className="hide-mobile">
            <MiniStepIndicator step={step} />
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="xfer-co-body container" style={{ maxWidth: 1100 }}>
        {/* Left */}
        <div className="xfer-co-main">
          <div className="hide-mobile" style={{ marginBottom: 28 }}>
            <h3
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 700,
                fontSize: 22,
                marginBottom: 6,
                letterSpacing: '-0.01em',
              }}
            >
              {clientSecret ? 'Payment' : 'Your transfer'}
            </h3>
            <p
              style={{
                fontSize: 14,
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-dm-sans)',
              }}
            >
              {clientSecret
                ? 'Card or Apple Pay — encrypted end-to-end via Stripe.'
                : 'Flight times, meeting point, and your contact details.'}
            </p>
          </div>

          {!clientSecret ? (
            <>
              {/* Transfers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 28 }}>
                {items.map((item) => (
                  <TransferCard
                    key={item.id}
                    item={item}
                    formErrors={formErrors}
                    onChange={(patch) => updateItem(item.id, patch)}
                    onRemove={() => removeItem(item.id)}
                  />
                ))}
              </div>

              {/* Contact details — visually matches DetailsStep in the tours checkout */}
              <SectionHeader
                title="Contact details"
                subtitle="We'll use this to confirm your transfer and reach you on arrival."
              />
              <div className="xfer-co-form-grid" style={{ marginBottom: 28 }}>
                <Input
                  label="First name"
                  value={form['firstName'] ?? ''}
                  onChange={(v) => setForm((f) => ({ ...f, firstName: v }))}
                  error={formErrors['firstName']}
                  autoComplete="given-name"
                />
                <Input
                  label="Last name"
                  value={form['lastName'] ?? ''}
                  onChange={(v) => setForm((f) => ({ ...f, lastName: v }))}
                  error={formErrors['lastName']}
                  autoComplete="family-name"
                />
                <Input
                  label="Email"
                  type="email"
                  span={2}
                  value={form['email'] ?? ''}
                  onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                  error={formErrors['email']}
                  autoComplete="email"
                  placeholder="you@email.com"
                />
                <Input
                  label="Phone (WhatsApp preferred)"
                  type="tel"
                  value={form['phone'] ?? ''}
                  onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                  error={formErrors['phone']}
                  autoComplete="tel"
                  placeholder="+1 (555) 000-0000"
                />
                <Input
                  label="Country"
                  value={form['country'] ?? ''}
                  onChange={(v) => setForm((f) => ({ ...f, country: v }))}
                  autoComplete="country-name"
                />
                <Textarea
                  label="Special requests (optional)"
                  value={form['specialRequests'] ?? ''}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, specialRequests: v }))
                  }
                  span={2}
                  placeholder="Child car seat, extra luggage, accessibility needs…"
                />
              </div>

              {stripeError && (
                <div
                  style={{
                    marginBottom: 20,
                    padding: '12px 16px',
                    borderRadius: 'var(--r-md)',
                    background: 'rgba(200,0,0,0.04)',
                    border: '1px solid rgba(200,0,0,0.12)',
                    color: '#c00',
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: 13,
                  }}
                >
                  {stripeError}
                </div>
              )}

              <button
                type="button"
                className="btn-primary"
                onClick={startPayment}
                style={{
                  height: 52,
                  padding: '0 34px',
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                }}
              >
                Continue to payment · ${grandTotal().toFixed(2)} →
              </button>

              <p
                style={{
                  marginTop: 14,
                  fontSize: 12,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-dm-sans)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Lock size={12} /> Encrypted end-to-end ·{' '}
                <ShieldCheck size={12} /> Free cancellation ≤ 24 hours
              </p>
            </>
          ) : (
            <>
              <StripePaymentPanel
                clientSecret={clientSecret}
                returnUrl="/transfers/confirm"
                onPaymentSuccess={() => setConfirmed(true)}
              />
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  setClientSecret(null)
                  setIntentKey(0)
                }}
                style={{ marginTop: 24, gap: 6 }}
              >
                <ArrowLeft size={14} /> Previous step
              </button>
            </>
          )}
        </div>

        {/* Right — order summary */}
        <aside className="xfer-co-aside">
          <div
            style={{
              position: 'relative',
              borderRadius: 'var(--r-xl)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
              background: '#fff',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background:
                  'linear-gradient(90deg, transparent, var(--gold) 50%, transparent)',
                opacity: 0.55,
              }}
            />
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <h4
                style={{
                  fontFamily: 'var(--font-syne)',
                  fontWeight: 700,
                  fontSize: 16,
                  letterSpacing: '-0.005em',
                }}
              >
                Order summary
              </h4>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-dm-sans)',
                  marginTop: 2,
                }}
              >
                Jamaica · {items.length} transfer{items.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div style={{ padding: '8px 24px' }}>
              {items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: '12px 0',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: 'var(--bg-warm)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent)',
                    }}
                  >
                    <Car size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontFamily: 'var(--font-dm-sans)',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.destinationName}
                    </p>
                    <p
                      style={{
                        fontSize: 11.5,
                        color: 'var(--text-tertiary)',
                        fontFamily: 'var(--font-dm-sans)',
                        marginTop: 2,
                      }}
                    >
                      Zone {item.zone} ·{' '}
                      {item.tripType === 'round_trip'
                        ? 'Round-trip'
                        : 'One-way'}{' '}
                      · {item.passengers} pax
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: 'var(--font-open-sans)',
                      fontFeatureSettings: '"tnum" 1',
                      flexShrink: 0,
                    }}
                  >
                    ${item.priceUsd.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div
              style={{
                padding: '16px 24px',
                background: 'var(--bg-warm)',
                borderTop: '1px solid var(--border)',
              }}
            >
              {[
                { label: 'Subtotal', value: subtotal() },
                { label: 'Service fee (5%)', value: fee() },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 13.5,
                    fontFamily: 'var(--font-dm-sans)',
                    color: 'var(--text-secondary)',
                    marginBottom: 6,
                  }}
                >
                  <span>{row.label}</span>
                  <span style={{ fontFamily: 'var(--font-open-sans)', fontFeatureSettings: '"tnum" 1' }}>
                    ${row.value.toFixed(2)}
                  </span>
                </div>
              ))}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 10,
                  paddingTop: 12,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontFamily: 'var(--font-dm-sans)',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  Total
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontWeight: 800,
                    fontSize: 24,
                    letterSpacing: '-0.005em',
                    color: 'var(--text-primary)',
                    fontFeatureSettings: '"tnum" 1',
                  }}
                >
                  ${grandTotal().toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <p
            style={{
              marginTop: 14,
              fontSize: 12,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-dm-sans)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              justifyContent: 'center',
            }}
          >
            <Lock size={11} /> Secure payment via Stripe
          </p>
        </aside>
      </div>

      <style jsx global>{`
        .xfer-co-body {
          padding: 40px 16px 72px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 340px;
          gap: 32px;
        }
        .xfer-co-main {
          min-width: 0;
          max-width: 680px;
        }
        .xfer-co-aside {
          position: sticky;
          top: 96px;
          align-self: flex-start;
          height: fit-content;
        }
        .xfer-co-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .xfer-co-flight-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        @media (max-width: 900px) {
          .xfer-co-body {
            grid-template-columns: minmax(0, 1fr);
            gap: 24px;
            padding: 28px 16px 96px;
          }
          .xfer-co-aside {
            position: static;
            order: -1;
          }
        }
        @media (max-width: 600px) {
          .xfer-co-form-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
          .xfer-co-flight-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
        }
      `}</style>
    </div>
  )
}

/* ── Section bits ── */

function SectionHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h4
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: '-0.01em',
          marginBottom: 4,
        }}
      >
        {title}
      </h4>
      <p
        style={{
          fontSize: 13,
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-dm-sans)',
        }}
      >
        {subtitle}
      </p>
    </div>
  )
}

function MiniStepIndicator({ step }: { step: 1 | 2 }) {
  const labels = ['Details', 'Payment']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {labels.map((label, i) => {
        const n = i + 1
        const active = step === n
        const done = step > n
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: done || active ? 'var(--accent)' : 'var(--surface)',
                color: done || active ? '#fff' : 'var(--text-tertiary)',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: 11,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {n}
            </div>
            <span
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: 12,
                fontWeight: 600,
                color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}
            >
              {label}
            </span>
            {i < labels.length - 1 && (
              <span
                style={{
                  display: 'inline-block',
                  width: 18,
                  height: 1,
                  background: 'var(--border-strong)',
                  marginInline: 2,
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Transfer card — mirrors the tours ReviewStep experience card ── */

function TransferCard({
  item,
  formErrors,
  onChange,
  onRemove,
}: {
  item: TransferCartItem
  formErrors: Record<string, boolean>
  onChange: (patch: Partial<TransferCartItem>) => void
  onRemove: () => void
}) {
  const rt = item.tripType === 'round_trip'
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 'var(--r-xl)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: '#fff',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          gap: 20,
        }}
      >
        <div>
          <p
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--gold)',
              marginBottom: 6,
            }}
          >
            Zone {item.zone} · {rt ? 'Round-trip' : 'One-way'} · MBJ
          </p>
          <p
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 700,
              fontSize: 19,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
              marginBottom: 6,
            }}
          >
            {item.destinationName}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 12.5,
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Users size={12} /> {item.passengers} passenger
              {item.passengers !== 1 ? 's' : ''}
            </span>
            <span
              style={{
                color: 'var(--text-primary)',
                fontWeight: 700,
                fontFamily: 'var(--font-open-sans)',
                fontFeatureSettings: '"tnum" 1',
              }}
            >
              ${item.priceUsd.toFixed(2)}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 12,
            textDecoration: 'underline',
            padding: 0,
            flexShrink: 0,
          }}
          aria-label="Remove transfer"
        >
          Remove
        </button>
      </div>

      {/* Flight details */}
      <div
        style={{
          padding: '20px 24px 22px',
          background: 'var(--bg-warm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plane size={14} color="#fff" />
          </div>
          <div>
            <p
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 700,
                fontSize: 14,
                color: 'var(--text-primary)',
                letterSpacing: '-0.005em',
              }}
            >
              Flight details
            </p>
            <p
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: 11.5,
                color: 'var(--text-tertiary)',
                marginTop: 1,
              }}
            >
              We track your flight in real time — no need to rush.
            </p>
          </div>
        </div>

        <div className="xfer-co-flight-grid">
          <Input
            label={rt ? 'Arrival date & time' : 'Pickup date & time'}
            type="datetime-local"
            value={item.arrivalAt ?? ''}
            onChange={(v) => onChange({ arrivalAt: v })}
            error={formErrors[`arrival-${item.id}`]}
            indicator="emerald"
          />
          <Input
            label="Arrival flight (optional)"
            value={item.arrivalFlight ?? ''}
            onChange={(v) => onChange({ arrivalFlight: v })}
            placeholder="e.g. AA1234"
          />
          {rt && (
            <>
              <Input
                label="Departure date & time"
                type="datetime-local"
                value={item.departureAt ?? ''}
                onChange={(v) => onChange({ departureAt: v })}
                error={formErrors[`departure-${item.id}`]}
                indicator="gold"
              />
              <Input
                label="Departure flight (optional)"
                value={item.departureFlight ?? ''}
                onChange={(v) => onChange({ departureFlight: v })}
                placeholder="e.g. AA4321"
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Input + Textarea ── */

function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  span,
  autoComplete,
  indicator,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  error?: boolean
  span?: 1 | 2
  autoComplete?: string
  indicator?: 'emerald' | 'gold'
}) {
  const dotColor = error
    ? '#c00'
    : indicator === 'emerald'
    ? 'var(--emerald)'
    : indicator === 'gold'
    ? 'var(--gold)'
    : undefined
  return (
    <div
      data-field-error={error || undefined}
      style={{ gridColumn: span === 2 ? '1 / -1' : undefined }}
    >
      <label
        style={{
          fontSize: 12.5,
          color: error ? '#c00' : 'var(--text-secondary)',
          fontFamily: 'var(--font-dm-sans)',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 6,
        }}
      >
        {dotColor && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: dotColor,
              flexShrink: 0,
            }}
          />
        )}
        {label}
        {error && (
          <span style={{ fontWeight: 400 }}>
            · {type === 'email' && value?.trim() ? 'invalid email' : 'required'}
          </span>
        )}
      </label>
      <input
        className="field-input"
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 46,
          borderColor: error ? 'rgba(200,0,0,0.4)' : undefined,
        }}
      />
    </div>
  )
}

function Textarea({
  label,
  value,
  onChange,
  span,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  span?: 1 | 2
  placeholder?: string
}) {
  return (
    <div style={{ gridColumn: span === 2 ? '1 / -1' : undefined }}>
      <label
        style={{
          fontSize: 12.5,
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-dm-sans)',
          fontWeight: 600,
          display: 'block',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      <textarea
        className="field-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        style={{
          height: 'auto',
          padding: '12px 14px',
          resize: 'vertical',
        }}
      />
    </div>
  )
}

/* ── Empty & inline confirmed states ── */

function EmptyState() {
  return (
    <div
      style={{
        minHeight: '100vh',
        paddingTop: 120,
        background: 'var(--bg-warm)',
        color: 'var(--text-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '120px 20px 80px',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <div
          style={{
            width: 56,
            height: 56,
            margin: '0 auto 20px',
            borderRadius: 16,
            background: '#fff',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-tertiary)',
          }}
        >
          <Car size={22} />
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-syne)',
            fontWeight: 700,
            fontSize: 28,
            letterSpacing: '-0.01em',
            marginBottom: 10,
          }}
        >
          Nothing to transfer yet.
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-syne)',
            fontStyle: 'italic',
            fontSize: 16,
            color: 'var(--text-secondary)',
            marginBottom: 28,
            lineHeight: 1.5,
          }}
        >
          Get an instant flat-rate quote to your hotel and add it to your trip.
        </p>
        <Link
          href="/transfers"
          className="btn-primary"
          style={{ height: 46, padding: '0 28px' }}
        >
          Get a quote →
        </Link>
      </div>
    </div>
  )
}

function ConfirmedInline({
  total,
  items,
}: {
  total: number
  items: TransferCartItem[]
}) {
  const clearCart = useTransfersCart((s) => s.clearCart)
  useEffect(() => {
    clearCart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      style={{
        minHeight: '100vh',
        paddingTop: 120,
        background: 'var(--bg-warm)',
        color: 'var(--text-primary)',
        padding: '120px 20px 80px',
      }}
    >
      <div className="container" style={{ maxWidth: 640, textAlign: 'center' }}>
        <p
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--emerald)',
            marginBottom: 14,
          }}
        >
          Transfer confirmed
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-syne)',
            fontWeight: 700,
            fontSize: 'clamp(2rem, 5vw, 3.25rem)',
            letterSpacing: '-0.02em',
            marginBottom: 14,
          }}
        >
          Your driver{' '}
          <span style={{ fontStyle: 'italic', fontWeight: 500 }}>
            will be there.
          </span>
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-syne)',
            fontStyle: 'italic',
            fontSize: 17,
            color: 'var(--text-secondary)',
            maxWidth: 520,
            margin: '0 auto 28px',
            lineHeight: 1.5,
          }}
        >
          A confirmation email with meeting instructions is on its way. MAPL
          dispatch will reach out 24 hours before pickup.
        </p>
        <p
          style={{
            fontFamily: 'var(--font-open-sans)',
            fontWeight: 800,
            fontSize: 24,
            color: 'var(--text-primary)',
            marginBottom: 28,
            letterSpacing: '-0.005em',
            fontFeatureSettings: '"tnum" 1',
          }}
        >
          ${total.toFixed(2)} paid · {items.length} transfer
          {items.length !== 1 ? 's' : ''}
        </p>
        <Link
          href="/explore"
          className="btn-primary"
          style={{ height: 46, padding: '0 28px' }}
        >
          Add tours to your trip →
        </Link>
      </div>
    </div>
  )
}
