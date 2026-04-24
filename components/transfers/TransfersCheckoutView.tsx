'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react'
import { useTransfersCart, type TransferCartItem } from '@/lib/transfers-cart'

const StripePaymentPanel = dynamic(
  () => import('@/components/checkout/StripePaymentPanel'),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: '60px', textAlign: 'center' }}>
        <p
          style={{
            fontSize: 14,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          Setting up secure payment…
        </p>
      </div>
    ),
  },
)

/**
 * Single-page transfers checkout: itinerary summary + details form +
 * payment. Simpler than the multi-step tour checkout because a transfer
 * booking only needs flight info and a card.
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

  // Validate details + per-transfer flight info before handing to Stripe.
  const validate = (): boolean => {
    const errs: Record<string, boolean> = {}
    if (!form['firstName']?.trim()) errs['firstName'] = true
    if (!form['lastName']?.trim()) errs['lastName'] = true
    if (!form['email']?.trim() || !/.+@.+\..+/.test(form['email'])) errs['email'] = true
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
    if (!validate()) return
    setIntentKey((k) => k + 1) // triggers useEffect below
  }

  // Build PI once we have valid form state.
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
        breakdown: {
          subtotal: subtotal(),
          fee: fee(),
        },
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setStripeError(data.error)
        else setClientSecret(data.clientSecret)
      })
      .catch(() =>
        setStripeError('Could not reach the payment service. Please try again.'),
      )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentKey])

  if (confirmed) {
    return (
      <Confirmed
        bookingRef="MAPL-XFER"
        total={grandTotal()}
        items={items}
      />
    )
  }

  if (items.length === 0) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 20px',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <h1
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 800,
              fontSize: 28,
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
              marginBottom: 24,
            }}
          >
            Add a transfer before checking out.
          </p>
          <Link href="/transfers" className="btn-primary" style={{ height: 46, padding: '0 26px' }}>
            Get a quote →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        paddingTop: 72,
        background: 'var(--bg)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Top bar */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div
          className="container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            maxWidth: 1100,
          }}
        >
          <Link
            href="/transfers"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontFamily: 'var(--font-dm-sans)',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              textDecoration: 'none',
            }}
          >
            <ArrowLeft size={15} /> Back
          </Link>
          <h1
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 700,
              fontSize: 18,
            }}
          >
            Airport transfer · Checkout
          </h1>
          <div style={{ width: 80 }} />
        </div>
      </div>

      <div
        className="container"
        style={{
          maxWidth: 1100,
          padding: '48px 20px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 340px',
          gap: 40,
        }}
      >
        {/* Left — itinerary + form or payment */}
        <div style={{ minWidth: 0 }}>
          {!clientSecret ? (
            <>
              {/* Transfer rows */}
              <Section title="Your transfers">
                {items.map((item) => (
                  <TransferRow
                    key={item.id}
                    item={item}
                    form={form}
                    formErrors={formErrors}
                    onChange={(patch) => updateItem(item.id, patch)}
                    onRemove={() => removeItem(item.id)}
                  />
                ))}
              </Section>

              {/* Contact */}
              <Section title="Contact details">
                <Grid>
                  <Input
                    label="First name"
                    error={formErrors['firstName']}
                    value={form['firstName'] ?? ''}
                    onChange={(v) => setForm((f) => ({ ...f, firstName: v }))}
                  />
                  <Input
                    label="Last name"
                    error={formErrors['lastName']}
                    value={form['lastName'] ?? ''}
                    onChange={(v) => setForm((f) => ({ ...f, lastName: v }))}
                  />
                  <Input
                    label="Email"
                    type="email"
                    error={formErrors['email']}
                    value={form['email'] ?? ''}
                    onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                    span={2}
                  />
                  <Input
                    label="Phone (WhatsApp preferred)"
                    type="tel"
                    error={formErrors['phone']}
                    value={form['phone'] ?? ''}
                    onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                  />
                  <Input
                    label="Country"
                    value={form['country'] ?? ''}
                    onChange={(v) => setForm((f) => ({ ...f, country: v }))}
                  />
                  <Textarea
                    label="Special requests (optional)"
                    value={form['specialRequests'] ?? ''}
                    onChange={(v) =>
                      setForm((f) => ({ ...f, specialRequests: v }))
                    }
                    span={2}
                  />
                </Grid>
              </Section>

              <button
                type="button"
                className="btn-primary"
                onClick={startPayment}
                style={{
                  marginTop: 12,
                  height: 52,
                  padding: '0 32px',
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                Continue to payment →
              </button>
              {stripeError && (
                <p
                  style={{
                    marginTop: 14,
                    color: '#c00',
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: 13,
                  }}
                >
                  {stripeError}
                </p>
              )}
            </>
          ) : (
            <StripePaymentPanel
              clientSecret={clientSecret}
              returnUrl="/transfers/confirm"
              onPaymentSuccess={() => setConfirmed(true)}
            />
          )}
        </div>

        {/* Right — order summary */}
        <aside
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 16,
            padding: '24px 22px',
            height: 'fit-content',
            position: 'sticky',
            top: 120,
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 700,
              fontSize: 16,
              marginBottom: 14,
            }}
          >
            Order summary
          </h3>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: '10px 0',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.destinationName}
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: 11.5,
                    color: 'var(--text-tertiary)',
                    marginTop: 2,
                  }}
                >
                  {item.tripType === 'round_trip' ? 'Round-trip' : 'One-way'} ·{' '}
                  {item.passengers} pax
                </p>
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                ${item.priceUsd.toFixed(2)}
              </span>
            </div>
          ))}
          <div style={{ padding: '14px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Row label="Subtotal" value={`$${subtotal().toFixed(2)}`} />
            <Row label="Service fee (5%)" value={`$${fee().toFixed(2)}`} />
          </div>
          <div
            style={{
              marginTop: 10,
              paddingTop: 12,
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              Total
            </span>
            <span
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 800,
                fontSize: 22,
                color: 'var(--gold, #FFB300)',
              }}
            >
              ${grandTotal().toFixed(2)}
            </span>
          </div>

          <p
            style={{
              marginTop: 16,
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 11.5,
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Lock size={11} /> Secure payment via Stripe ·{' '}
            <ShieldCheck size={11} /> Free cancellation ≤24h
          </p>
        </aside>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: '-0.01em',
          marginBottom: 16,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

function TransferRow({
  item,
  formErrors,
  onChange,
  onRemove,
}: {
  item: TransferCartItem
  form: Record<string, string>
  formErrors: Record<string, boolean>
  onChange: (patch: Partial<TransferCartItem>) => void
  onRemove: () => void
}) {
  const rt = item.tripType === 'round_trip'
  return (
    <div
      style={{
        padding: '20px 22px',
        borderRadius: 14,
        border: '1px solid var(--border-subtle)',
        background: 'var(--card-bg)',
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div>
          <p
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--gold, #FFB300)',
              marginBottom: 6,
            }}
          >
            Zone {item.zone} · {rt ? 'Round-trip' : 'One-way'}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 700,
              fontSize: 18,
              color: 'var(--text-primary)',
            }}
          >
            {item.destinationName}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 12.5,
              color: 'var(--text-tertiary)',
              marginTop: 4,
            }}
          >
            {item.passengers} passenger{item.passengers !== 1 ? 's' : ''} · $
            {item.priceUsd.toFixed(2)}
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
          }}
        >
          Remove
        </button>
      </div>

      <Grid>
        <Input
          label={rt ? 'Arrival date & time' : 'Pickup date & time'}
          type="datetime-local"
          error={formErrors[`arrival-${item.id}`]}
          value={item.arrivalAt ?? ''}
          onChange={(v) => onChange({ arrivalAt: v })}
        />
        <Input
          label="Arrival flight (optional)"
          placeholder="e.g. AA1234"
          value={item.arrivalFlight ?? ''}
          onChange={(v) => onChange({ arrivalFlight: v })}
        />
        {rt && (
          <>
            <Input
              label="Departure date & time"
              type="datetime-local"
              error={formErrors[`departure-${item.id}`]}
              value={item.departureAt ?? ''}
              onChange={(v) => onChange({ departureAt: v })}
            />
            <Input
              label="Departure flight (optional)"
              placeholder="e.g. AA4321"
              value={item.departureFlight ?? ''}
              onChange={(v) => onChange({ departureFlight: v })}
            />
          </>
        )}
      </Grid>
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 14,
      }}
    >
      {children}
    </div>
  )
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  span,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  error?: boolean
  span?: 1 | 2
}) {
  return (
    <div style={{ gridColumn: span === 2 ? '1 / -1' : undefined }}>
      <label
        style={{
          display: 'block',
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: error ? '#c00' : 'var(--text-tertiary)',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '12px 14px',
          borderRadius: 10,
          border: error ? '1px solid rgba(200,0,0,0.5)' : '1px solid var(--border-subtle)',
          background: 'var(--bg)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 14,
          outline: 'none',
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
}: {
  label: string
  value: string
  onChange: (v: string) => void
  span?: 1 | 2
}) {
  return (
    <div style={{ gridColumn: span === 2 ? '1 / -1' : undefined }}>
      <label
        style={{
          display: 'block',
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        style={{
          width: '100%',
          padding: '12px 14px',
          borderRadius: 10,
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 14,
          outline: 'none',
          resize: 'vertical',
        }}
      />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: 'var(--font-dm-sans)',
        fontSize: 13,
        color: 'var(--text-secondary)',
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function Confirmed({
  bookingRef,
  total,
  items,
}: {
  bookingRef: string
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
        paddingTop: 72,
        background: 'var(--bg)',
        color: 'var(--text-primary)',
        padding: '80px 20px',
      }}
    >
      <div className="container" style={{ maxWidth: 640, textAlign: 'center' }}>
        <p
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--emerald, #00A550)',
            marginBottom: 14,
          }}
        >
          Transfer confirmed
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-syne)',
            fontWeight: 800,
            fontSize: 'clamp(2rem, 5vw, 3.25rem)',
            marginBottom: 14,
          }}
        >
          Your ride is booked.
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-syne)',
            fontStyle: 'italic',
            fontSize: 17,
            color: 'var(--text-secondary)',
            maxWidth: 520,
            margin: '0 auto 28px',
          }}
        >
          Confirmation email incoming with driver meeting instructions. Keep your
          booking reference handy: {bookingRef}.
        </p>
        <p
          style={{
            fontFamily: 'var(--font-syne)',
            fontWeight: 800,
            fontSize: 24,
            color: 'var(--gold, #FFB300)',
            marginBottom: 32,
          }}
        >
          ${total.toFixed(2)} paid · {items.length} transfer
          {items.length !== 1 ? 's' : ''}
        </p>
        <Link href="/explore" className="btn-primary" style={{ height: 46, padding: '0 28px' }}>
          Add tours to your trip →
        </Link>
      </div>
    </div>
  )
}
