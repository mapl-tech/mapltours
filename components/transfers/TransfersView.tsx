'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  DESTINATIONS,
  ZONES,
  buildQuote,
  groupDestinationsByZone,
  type TransferTripType,
  type TransferZone,
} from '@/lib/airport-transfers'
import { useTransfersCart } from '@/lib/transfers-cart'

/**
 * Airport-transfers landing page. A single-card quote calculator on top,
 * zone reference table below, soft sell at the bottom.
 */
export default function TransfersView() {
  const router = useRouter()
  const addQuote = useTransfersCart((s) => s.addQuote)

  const [destinationId, setDestinationId] = useState<string>('')
  const [tripType, setTripType] = useState<TransferTripType>('round_trip')
  const [passengers, setPassengers] = useState<number>(2)

  const quote = useMemo(
    () => (destinationId ? buildQuote(destinationId, tripType, passengers) : null),
    [destinationId, tripType, passengers],
  )

  const zones = useMemo(() => groupDestinationsByZone(), [])

  const handleBook = () => {
    if (!quote) return
    addQuote(quote)
    router.push('/transfers/checkout')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-primary)' }}>
      {/* Hero */}
      <section
        style={{
          paddingTop: 104,
          paddingBottom: 48,
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div className="container" style={{ maxWidth: 1100, padding: '0 20px' }}>
          <p
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--gold, #FFB300)',
              marginBottom: 16,
            }}
          >
            Airport transfers · MBJ
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 800,
              fontSize: 'clamp(2.5rem, 6vw, 4.25rem)',
              lineHeight: 1.02,
              letterSpacing: '-0.025em',
              maxWidth: 780,
              marginBottom: 20,
            }}
          >
            From Sangster to your hotel. Flat rates. No surprises.
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-syne)',
              fontStyle: 'italic',
              fontSize: 19,
              color: 'var(--text-secondary)',
              maxWidth: 620,
              lineHeight: 1.5,
            }}
          >
            Private vehicle, 1–4 passengers, priced up front by zone. Meet-and-greet at
            arrivals, bottled water in the car, flight tracking on arrival.
          </p>
        </div>
      </section>

      {/* Quote calculator */}
      <section style={{ padding: '56px 20px' }}>
        <div className="container" style={{ maxWidth: 820 }}>
          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 20,
              padding: '28px 28px 32px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--gold, #FFB300)',
                marginBottom: 10,
              }}
            >
              Instant quote
            </p>
            <h2
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 700,
                fontSize: 24,
                letterSpacing: '-0.01em',
                marginBottom: 24,
              }}
            >
              Where are you headed?
            </h2>

            {/* Destination */}
            <Field label="Destination">
              <select
                value={destinationId}
                onChange={(e) => setDestinationId(e.target.value)}
                style={fieldStyle()}
              >
                <option value="">Pick a hotel or landmark…</option>
                {zones.map(({ zone, items }) => (
                  <optgroup key={zone.code} label={`Zone ${zone.code} — ${zone.label}`}>
                    {items.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>

            {/* Trip type */}
            <Field label="Trip type">
              <div style={{ display: 'flex', gap: 10 }}>
                <TripToggle
                  active={tripType === 'round_trip'}
                  onClick={() => setTripType('round_trip')}
                  title="Round-trip"
                  sub="Arrival + departure"
                />
                <TripToggle
                  active={tripType === 'one_way'}
                  onClick={() => setTripType('one_way')}
                  title="One-way"
                  sub="Arrival only"
                />
              </div>
            </Field>

            {/* Passengers */}
            <Field label="Passengers (1–4)">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setPassengers((p) => Math.max(1, p - 1))}
                  style={paxButtonStyle}
                  aria-label="Remove passenger"
                >
                  −
                </button>
                <span
                  style={{
                    fontFamily: 'var(--font-syne)',
                    fontWeight: 700,
                    fontSize: 28,
                    minWidth: 36,
                    textAlign: 'center',
                    color: 'var(--text-primary)',
                  }}
                >
                  {passengers}
                </span>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setPassengers((p) => Math.min(4, p + 1))}
                  style={paxButtonStyle}
                  aria-label="Add passenger"
                >
                  +
                </button>
                <span
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: 12.5,
                    color: 'var(--text-tertiary)',
                    marginLeft: 'auto',
                  }}
                >
                  Flat rate — groups of 5+, contact us.
                </span>
              </div>
            </Field>

            {/* Quote readout */}
            <div
              style={{
                marginTop: 28,
                padding: '22px 24px',
                borderRadius: 14,
                border: '1px solid rgba(255,179,0,0.18)',
                background: 'rgba(255,179,0,0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 20,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <p
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: 'var(--text-tertiary)',
                    marginBottom: 6,
                  }}
                >
                  {quote ? `Zone ${quote.zone} · ${quote.zoneDuration}` : 'Your quote'}
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-syne)',
                    fontWeight: 700,
                    fontSize: 19,
                    letterSpacing: '-0.01em',
                    color: 'var(--text-primary)',
                  }}
                >
                  {quote ? quote.destinationName : 'Pick a destination to see your price.'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p
                  style={{
                    fontFamily: 'var(--font-syne)',
                    fontWeight: 800,
                    fontSize: 40,
                    letterSpacing: '-0.02em',
                    color: 'var(--gold, #FFB300)',
                    lineHeight: 1,
                  }}
                >
                  {quote ? `$${quote.priceUsd}` : '—'}
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: 12,
                    color: 'var(--text-tertiary)',
                    marginTop: 4,
                  }}
                >
                  {tripType === 'round_trip' ? 'Round-trip' : 'One-way'} · 1–4 passengers
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={handleBook}
              disabled={!quote}
              style={{
                marginTop: 24,
                width: '100%',
                height: 54,
                fontSize: 15,
                fontWeight: 700,
                opacity: quote ? 1 : 0.4,
                cursor: quote ? 'pointer' : 'not-allowed',
              }}
            >
              {quote ? 'Book this transfer →' : 'Select a destination to continue'}
            </button>

            <p
              style={{
                marginTop: 14,
                textAlign: 'center',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: 12,
                color: 'var(--text-tertiary)',
              }}
            >
              Flight tracking included. Free cancellation up to 24 hours before pickup.
            </p>
          </div>
        </div>
      </section>

      {/* Zone reference */}
      <section
        style={{
          padding: '64px 20px 48px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-warm, rgba(255,255,255,0.02))',
        }}
      >
        <div className="container" style={{ maxWidth: 1100 }}>
          <p
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--gold, #FFB300)',
              marginBottom: 10,
            }}
          >
            Zone rates
          </p>
          <h2
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 700,
              fontSize: 'clamp(1.6rem, 3vw, 2.25rem)',
              letterSpacing: '-0.02em',
              marginBottom: 28,
              maxWidth: 700,
            }}
          >
            Priced per vehicle — not per person.
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {(Object.keys(ZONES) as TransferZone[]).map((code) => {
              const z = ZONES[code]
              return (
                <div
                  key={code}
                  style={{
                    padding: '22px 24px',
                    borderRadius: 14,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--card-bg)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      marginBottom: 10,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.22em',
                        textTransform: 'uppercase',
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      Zone {z.code}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: 11,
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {z.duration}
                    </span>
                  </div>
                  <p
                    style={{
                      fontFamily: 'var(--font-syne)',
                      fontWeight: 700,
                      fontSize: 19,
                      letterSpacing: '-0.01em',
                      marginBottom: 14,
                    }}
                  >
                    {z.label}
                  </p>
                  <div style={{ display: 'flex', gap: 22 }}>
                    <div>
                      <p
                        style={{
                          fontFamily: 'var(--font-dm-sans)',
                          fontSize: 11,
                          color: 'var(--text-tertiary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.14em',
                          marginBottom: 2,
                        }}
                      >
                        One-way
                      </p>
                      <p
                        style={{
                          fontFamily: 'var(--font-syne)',
                          fontWeight: 800,
                          fontSize: 24,
                          color: 'var(--text-primary)',
                        }}
                      >
                        ${z.oneWay}
                      </p>
                    </div>
                    <div>
                      <p
                        style={{
                          fontFamily: 'var(--font-dm-sans)',
                          fontSize: 11,
                          color: 'var(--text-tertiary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.14em',
                          marginBottom: 2,
                        }}
                      >
                        Round-trip
                      </p>
                      <p
                        style={{
                          fontFamily: 'var(--font-syne)',
                          fontWeight: 800,
                          fontSize: 24,
                          color: 'var(--gold, #FFB300)',
                        }}
                      >
                        ${z.roundTrip}
                      </p>
                    </div>
                  </div>
                  <p
                    style={{
                      marginTop: 14,
                      fontFamily: 'var(--font-dm-sans)',
                      fontSize: 12.5,
                      color: 'var(--text-tertiary)',
                      lineHeight: 1.55,
                    }}
                  >
                    {DESTINATIONS.filter((d) => d.zone === code)
                      .slice(0, 4)
                      .map((d) => d.name.replace(/, .*$/, ''))
                      .join(' · ')}
                    {DESTINATIONS.filter((d) => d.zone === code).length > 4 ? ' · and more' : ''}
                  </p>
                </div>
              )
            })}
          </div>

          <p
            style={{
              marginTop: 32,
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 13,
              color: 'var(--text-tertiary)',
              maxWidth: 620,
            }}
          >
            Kingston (KIN) transfers, Port Antonio, and groups of five or more?{' '}
            <Link href="/contact" style={{ color: 'var(--gold, #FFB300)', textDecoration: 'underline' }}>
              Message us for a custom quote →
            </Link>
          </p>
        </div>
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label
        style={{
          display: 'block',
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
          marginBottom: 8,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

function TripToggle({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean
  onClick: () => void
  title: string
  sub: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '14px 16px',
        borderRadius: 12,
        border: active
          ? '1px solid var(--gold, #FFB300)'
          : '1px solid var(--border-subtle)',
        background: active ? 'rgba(255,179,0,0.08)' : 'var(--bg)',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s ease',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 700,
          fontSize: 15,
          color: active ? 'var(--gold, #FFB300)' : 'var(--text-primary)',
          marginBottom: 2,
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 12,
          color: 'var(--text-tertiary)',
        }}
      >
        {sub}
      </p>
    </button>
  )
}

function fieldStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 12,
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-dm-sans)',
    fontSize: 15,
    outline: 'none',
    appearance: 'none',
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'><path d='M1 1L6 6L11 1' stroke='%23888' stroke-width='1.5'/></svg>\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
    paddingRight: 40,
  }
}

const paxButtonStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  fontSize: 18,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
