'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  Plane,
  MapPin,
  Clock,
  ShieldCheck,
  Phone,
  Check,
  Star,
  TrendingUp,
} from 'lucide-react'
import {
  DESTINATIONS,
  ZONES,
  buildQuote,
  groupDestinationsByZone,
  type TransferTripType,
  type TransferZone,
} from '@/lib/airport-transfers'
import { useTransfersCart } from '@/lib/transfers-cart'
import { HERO, DESTINATIONS as DESTINATION_IMAGES } from '@/lib/images'
import {
  TRANSFER_REVIEWS as REVIEWS,
  TRANSFER_FAQS as FAQS,
} from '@/lib/airport-transfers-content'

/* Hero + per-zone imagery — all confirmed-Jamaica Pexels photos already
   used elsewhere on the site. Alt text is descriptive for SEO + a11y. */
const HERO_IMAGE = {
  src: HERO, // aerial Buff Bay coastal road
  alt: 'Aerial view of Jamaica’s north-coast road between Montego Bay and Ocho Rios — the route MAPL drivers use for airport transfers.',
}

const ZONE_IMAGES: Record<TransferZone, { src: string; alt: string }> = {
  A: {
    src: DESTINATION_IMAGES['Montego Bay'],
    alt: 'Aerial view of Montego Bay, Jamaica — Zone I airport-transfer destination.',
  },
  B: {
    src: DESTINATION_IMAGES['Falmouth'],
    alt: 'Traditional red boat flying the Jamaican flag in Falmouth — Zone II airport-transfer area.',
  },
  C: {
    src: DESTINATION_IMAGES['Treasure Beach'],
    alt: 'Colorful fishing boats along the Jamaican coast — Zone III (Trelawny, Hanover, Lucea) airport transfers.',
  },
  D: {
    src: DESTINATION_IMAGES['Negril'],
    alt: 'Rockhouse cliffs at sunset in Negril, Jamaica — Zone IV airport-transfer destination.',
  },
  E: {
    src: DESTINATION_IMAGES['Ocho Rios'],
    alt: 'Turquoise water and wooden pier in Ocho Rios, Jamaica — Zone V airport transfers.',
  },
}

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

  const scrollToQuote = () => {
    document
      .getElementById('quote')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        paddingTop: 56,
        background: 'var(--bg-warm)',
        color: 'var(--text-primary)',
      }}
    >
      {/* ───────────── HERO ───────────── */}
      <section className="xfer-hero">
        <div className="container xfer-hero-grid" style={{ maxWidth: 1180 }}>
          {/* Copy */}
          <div className="xfer-hero-copy">
            <div className="xfer-hero-kicker-row">
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 28,
                  height: 1,
                  background: 'var(--gold)',
                }}
              />
              <Kicker>A MAPL private service · MBJ · KIN on request</Kicker>
            </div>
            <h1 className="xfer-hero-h1">
              Sangster to your hotel.{' '}
              <span style={{ fontStyle: 'italic', fontWeight: 500 }}>
                Quietly arranged.
              </span>
            </h1>
            <p className="xfer-hero-sub">
              Private vehicle, 1–4 passengers, priced up front by zone.
              Meet-and-greet at arrivals, flight tracking, bottled water, and
              the same driver both ways when you book round-trip.
            </p>

            <div className="xfer-hero-cta-row">
              <button
                type="button"
                className="btn-primary"
                onClick={scrollToQuote}
                style={{ height: 50, padding: '0 26px', fontSize: 14 }}
              >
                Get an instant quote →
              </button>
              <div className="xfer-hero-rating">
                <div style={{ display: 'flex', gap: 2 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star
                      key={i}
                      size={14}
                      fill="var(--gold)"
                      stroke="var(--gold)"
                    />
                  ))}
                </div>
                <span className="xfer-hero-rating-text">
                  4.9 · 340+ transfers booked
                </span>
              </div>
            </div>

            {/* Trust strip */}
            <div className="xfer-trust-strip">
              <TrustItem
                icon={<Plane size={17} />}
                title="Flight tracked"
                body="Your driver adjusts to real-time arrivals."
              />
              <TrustItem
                icon={<MapPin size={17} />}
                title="Meet-and-greet"
                body="MAPL sign at arrivals, bags handled."
              />
              <TrustItem
                icon={<ShieldCheck size={17} />}
                title="Licensed & insured"
                body="JUTA-affiliated operators only."
              />
              <TrustItem
                icon={<Phone size={17} />}
                title="24/7 dispatch"
                body="A real voice, not a call-centre script."
              />
            </div>
          </div>

          {/* Image */}
          <div className="xfer-hero-image">
            <Image
              src={HERO_IMAGE.src}
              alt={HERO_IMAGE.alt}
              fill
              priority
              sizes="(max-width: 900px) 100vw, 520px"
              style={{ objectFit: 'cover' }}
            />
            <div className="xfer-hero-image-scrim" aria-hidden />
            <div className="xfer-hero-image-caption">
              <span className="xfer-hero-image-caption-kicker">En route</span>
              <p>North coast between MBJ and Ocho Rios</p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── QUOTE CARD ───────────── */}
      <section id="quote" className="xfer-quote-section">
        <div className="container" style={{ maxWidth: 820 }}>
          <div className="xfer-quote-card">
            {/* Gold hairline — prestige cue matching the email templates */}
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
                opacity: 0.7,
              }}
            />

            <div style={{ marginBottom: 24 }}>
              <Kicker>Instant quote</Kicker>
              <h2 className="xfer-quote-h2">
                Where are you{' '}
                <span style={{ fontStyle: 'italic', fontWeight: 500 }}>
                  headed?
                </span>
              </h2>
            </div>

            <Field label="Destination">
              <select
                className="field-input"
                value={destinationId}
                onChange={(e) => setDestinationId(e.target.value)}
                style={{
                  height: 50,
                  fontSize: 15,
                  fontWeight: 500,
                  color: destinationId ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  paddingRight: 44,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235E5C57' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 16px center',
                }}
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

            <Field label="Trip type">
              <div className="xfer-trip-toggles">
                <TripToggle
                  active={tripType === 'round_trip'}
                  onClick={() => setTripType('round_trip')}
                  title="Round-trip"
                  sub="Arrival + departure"
                  badge="Most booked"
                />
                <TripToggle
                  active={tripType === 'one_way'}
                  onClick={() => setTripType('one_way')}
                  title="One-way"
                  sub="Single pickup"
                />
              </div>
            </Field>

            <Field label="Passengers">
              <div className="xfer-pax-row">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setPassengers((p) => Math.max(1, p - 1))}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 'var(--r-md)',
                    padding: 0,
                    fontSize: 16,
                  }}
                  aria-label="Remove passenger"
                >
                  −
                </button>
                <div
                  style={{
                    minWidth: 64,
                    height: 44,
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-syne)',
                    fontWeight: 700,
                    fontSize: 18,
                    color: 'var(--text-primary)',
                    background: '#fff',
                  }}
                >
                  {passengers}
                </div>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setPassengers((p) => Math.min(4, p + 1))}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 'var(--r-md)',
                    padding: 0,
                    fontSize: 16,
                  }}
                  aria-label="Add passenger"
                >
                  +
                </button>
                <span className="xfer-pax-note">
                  Flat rate, 1–4 passengers.{' '}
                  <Link href="/contact" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>
                    Groups of 5+ → custom quote
                  </Link>
                  .
                </span>
              </div>
            </Field>

            <div className="xfer-quote-readout">
              <div>
                <p className="xfer-quote-readout-kicker">
                  {quote ? `Zone ${quote.zone} · ${quote.zoneDuration}` : 'Your quote'}
                </p>
                <p className="xfer-quote-readout-dest">
                  {quote ? quote.destinationName : 'Pick a destination to see your fare.'}
                </p>
              </div>
              <div className="xfer-quote-readout-price-block">
                <p className="xfer-quote-readout-price">
                  {quote ? `$${quote.priceUsd}` : '—'}
                </p>
                <p className="xfer-quote-readout-meta">
                  {tripType === 'round_trip' ? 'Round-trip' : 'One-way'} · per vehicle
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={handleBook}
              disabled={!quote}
              style={{
                marginTop: 22,
                width: '100%',
                height: 52,
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '0.02em',
                opacity: quote ? 1 : 0.4,
                cursor: quote ? 'pointer' : 'not-allowed',
              }}
            >
              {quote ? `Book for $${quote.priceUsd} →` : 'Select a destination to continue'}
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
              <Clock size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />
              Free cancellation up to 24 hours before pickup.
            </p>
          </div>
        </div>
      </section>

      {/* ───────────── WHY MAPL (value prop) ───────────── */}
      <section className="xfer-why-section">
        <div className="container" style={{ maxWidth: 1100 }}>
          <div className="xfer-center-head">
            <Kicker centered>Why MAPL instead of the taxi queue</Kicker>
            <h2 className="xfer-section-h2">
              The same road.{' '}
              <span style={{ fontStyle: 'italic', fontWeight: 500 }}>
                A very different ride.
              </span>
            </h2>
          </div>
          <div className="xfer-compare-grid">
            <CompareItem
              bold
              title="MAPL private transfer"
              items={[
                'Fixed zone price, paid up front',
                'Driver waits with your name at arrivals',
                'Flight tracking — no surcharge if you land late',
                'Chilled bottled water, AC, English-speaking driver',
                'Free cancellation up to 24 hours before pickup',
                'Same driver for the return leg when you book round-trip',
              ]}
            />
            <CompareItem
              title="Airport taxi queue"
              items={[
                'Metered or "airport fixed rate" — often higher than you quoted',
                'Wait in the queue after a long flight',
                'No flight tracking — if you’re late, the spot is gone',
                'Vehicle condition varies; AC not guaranteed',
                'No cancellation window',
                'New driver every leg, unfamiliar with your hotel',
              ]}
              muted
            />
          </div>
        </div>
      </section>

      {/* ───────────── ZONE REFERENCE ───────────── */}
      <section className="xfer-zones-section">
        <div className="container" style={{ maxWidth: 1100 }}>
          <div className="xfer-center-head">
            <Kicker centered>Zone rates · in USD</Kicker>
            <h2 className="xfer-section-h2">
              Priced{' '}
              <span style={{ fontStyle: 'italic', fontWeight: 500 }}>per vehicle</span>
              . Not per person.
            </h2>
            <p className="xfer-section-sub">
              Flat fares to every major resort in Jamaica served by Sangster
              International. Five zones, no surge, no surprises.
            </p>
          </div>

          <div className="xfer-zones-grid">
            {(Object.keys(ZONES) as TransferZone[]).map((code) => {
              const z = ZONES[code]
              const img = ZONE_IMAGES[code]
              return (
                <article key={code} className="xfer-zone-card">
                  <div className="xfer-zone-img">
                    <Image
                      src={img.src}
                      alt={img.alt}
                      fill
                      sizes="(max-width: 900px) 100vw, 360px"
                      style={{ objectFit: 'cover' }}
                    />
                    <div className="xfer-zone-img-scrim" aria-hidden />
                    <span className="xfer-zone-roman">{roman(code)}</span>
                  </div>
                  <div className="xfer-zone-body">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: 8,
                      }}
                    >
                      <p className="xfer-zone-label">{z.label}</p>
                      <span className="xfer-zone-duration">{z.duration}</span>
                    </div>
                    <div className="xfer-zone-prices">
                      <div>
                        <p className="xfer-zone-price-label">One-way</p>
                        <p className="xfer-zone-price-value">${z.oneWay}</p>
                      </div>
                      <div>
                        <p className="xfer-zone-price-label">Round-trip</p>
                        <p className="xfer-zone-price-value">${z.roundTrip}</p>
                      </div>
                    </div>
                    <p className="xfer-zone-destinations">
                      {DESTINATIONS.filter((d) => d.zone === code)
                        .slice(0, 4)
                        .map((d) => d.name.replace(/, .*$/, ''))
                        .join(' · ')}
                      {DESTINATIONS.filter((d) => d.zone === code).length > 4 ? ' · and more' : ''}
                    </p>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="xfer-contact-cta">
            <div>
              <p className="xfer-contact-cta-title">Not on the list?</p>
              <p className="xfer-contact-cta-body">
                Kingston (KIN), Port Antonio, or groups of five or more — we&rsquo;ll
                quote you directly within the hour.
              </p>
            </div>
            <Link
              href="/contact"
              className="btn-outline"
              style={{ height: 44, padding: '0 22px', fontSize: 13.5 }}
            >
              Request a custom quote
            </Link>
          </div>
        </div>
      </section>

      {/* ───────────── TESTIMONIALS ───────────── */}
      <section className="xfer-reviews-section">
        <div className="container" style={{ maxWidth: 1100 }}>
          <div className="xfer-center-head">
            <Kicker centered>What travelers say</Kicker>
            <h2 className="xfer-section-h2">
              Read before you{' '}
              <span style={{ fontStyle: 'italic', fontWeight: 500 }}>land.</span>
            </h2>
          </div>

          <div className="xfer-reviews-grid">
            {REVIEWS.map((r, i) => (
              <blockquote key={i} className="xfer-review">
                <div style={{ display: 'flex', gap: 3, marginBottom: 12 }}>
                  {Array.from({ length: 5 }).map((_, k) => (
                    <Star
                      key={k}
                      size={13}
                      fill="var(--gold)"
                      stroke="var(--gold)"
                    />
                  ))}
                </div>
                <p className="xfer-review-quote">“{r.quote}”</p>
                <footer className="xfer-review-footer">
                  <strong>{r.name}</strong>
                  <span>· {r.route}</span>
                </footer>
              </blockquote>
            ))}
          </div>

          <div className="xfer-review-stats">
            <StatBlock
              icon={<TrendingUp size={16} />}
              label="Transfers booked in the last 30 days"
              value="342"
            />
            <StatBlock
              icon={<Star size={16} fill="var(--gold)" stroke="var(--gold)" />}
              label="Average rating from verified trips"
              value="4.9 / 5"
            />
            <StatBlock
              icon={<Check size={16} />}
              label="On-time arrival rate"
              value="98.6%"
            />
          </div>
        </div>
      </section>

      {/* ───────────── FAQ (also powers FAQPage schema) ───────────── */}
      <section className="xfer-faq-section">
        <div className="container" style={{ maxWidth: 820 }}>
          <div className="xfer-center-head" style={{ textAlign: 'left', marginBottom: 32 }}>
            <Kicker>Good to know</Kicker>
            <h2 className="xfer-section-h2" style={{ marginTop: 8 }}>
              Frequently asked.
            </h2>
          </div>
          <div className="xfer-faq-list">
            {FAQS.map((f, i) => (
              <details key={i} className="xfer-faq-item">
                <summary>{f.q}</summary>
                <div className="xfer-faq-answer">{f.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── FINAL CTA ───────────── */}
      <section className="xfer-final-cta">
        <div className="container" style={{ maxWidth: 820, textAlign: 'center' }}>
          <Kicker centered>Ready when you land</Kicker>
          <h2 className="xfer-section-h2" style={{ marginTop: 10 }}>
            Book in two minutes.{' '}
            <span style={{ fontStyle: 'italic', fontWeight: 500 }}>
              Cancel free for 24 hours.
            </span>
          </h2>
          <button
            type="button"
            className="btn-primary"
            onClick={scrollToQuote}
            style={{
              marginTop: 24,
              height: 52,
              padding: '0 32px',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Get my instant quote →
          </button>
          <p
            style={{
              marginTop: 14,
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 12.5,
              color: 'var(--text-tertiary)',
            }}
          >
            <Lock />
            Secure payment via Stripe · Free cancellation ≤ 24h
          </p>
        </div>
      </section>

      {/* ───────────── Sticky mobile CTA ───────────── */}
      {quote && (
        <div className="xfer-sticky-cta">
          <div>
            <p className="xfer-sticky-dest">{quote.destinationName}</p>
            <p className="xfer-sticky-meta">
              {quote.tripType === 'round_trip' ? 'Round-trip' : 'One-way'} ·{' '}
              Zone {quote.zone}
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={handleBook}
            style={{ height: 46, padding: '0 20px', fontSize: 14 }}
          >
            Book · ${quote.priceUsd}
          </button>
        </div>
      )}

      {/* ───────────── Responsive CSS ───────────── */}
      <style jsx>{`
        .xfer-hero {
          padding: 72px 20px 56px;
          border-bottom: 1px solid var(--border);
          background: #fff;
        }
        .xfer-hero-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
          gap: 56px;
          align-items: center;
        }
        .xfer-hero-copy { min-width: 0; }
        .xfer-hero-kicker-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
        }
        .xfer-hero-h1 {
          font-family: var(--font-syne);
          font-weight: 700;
          font-size: clamp(2rem, 5.2vw, 4rem);
          line-height: 1.03;
          letter-spacing: -0.025em;
          color: var(--text-primary);
          margin-bottom: 18px;
        }
        .xfer-hero-sub {
          font-family: var(--font-syne);
          font-style: italic;
          font-size: clamp(1rem, 1.55vw, 1.25rem);
          color: var(--text-secondary);
          line-height: 1.55;
          max-width: 540px;
          margin-bottom: 28px;
        }
        .xfer-hero-cta-row {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 36px;
          flex-wrap: wrap;
        }
        .xfer-hero-rating {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .xfer-hero-rating-text {
          font-family: var(--font-dm-sans);
          font-size: 12.5px;
          color: var(--text-secondary);
          font-weight: 600;
        }
        .xfer-trust-strip {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
          padding-top: 28px;
          border-top: 1px solid var(--border);
        }
        .xfer-hero-image {
          position: relative;
          aspect-ratio: 4 / 5;
          border-radius: var(--r-xl);
          overflow: hidden;
          box-shadow: var(--shadow-lg);
          border: 1px solid var(--border);
        }
        .xfer-hero-image-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent 55%, rgba(0, 0, 0, 0.55) 100%);
        }
        .xfer-hero-image-caption {
          position: absolute;
          left: 20px;
          bottom: 20px;
          right: 20px;
          color: #fff;
        }
        .xfer-hero-image-caption-kicker {
          display: block;
          font-family: var(--font-dm-sans);
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.78);
          margin-bottom: 4px;
        }
        .xfer-hero-image-caption p {
          font-family: var(--font-syne);
          font-style: italic;
          font-weight: 500;
          font-size: 15px;
        }

        .xfer-quote-section { padding: 64px 20px 48px; }
        .xfer-quote-card {
          position: relative;
          border-radius: var(--r-xl);
          background: #fff;
          border: 1px solid var(--border);
          box-shadow: var(--shadow-lg);
          overflow: hidden;
          padding: 40px 36px 32px;
        }
        .xfer-quote-h2 {
          font-family: var(--font-syne);
          font-weight: 700;
          font-size: clamp(1.5rem, 2.4vw, 1.75rem);
          letter-spacing: -0.015em;
          margin-top: 8px;
          color: var(--text-primary);
        }
        .xfer-trip-toggles { display: flex; gap: 12px; }
        .xfer-pax-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .xfer-pax-note {
          font-family: var(--font-dm-sans);
          font-size: 12.5px;
          color: var(--text-tertiary);
          margin-left: auto;
        }
        .xfer-quote-readout {
          margin-top: 28px;
          padding: 22px 24px;
          border-radius: var(--r-lg);
          background: var(--bg-warm);
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
        }
        .xfer-quote-readout-kicker {
          font-family: var(--font-dm-sans);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--text-tertiary);
          margin-bottom: 6px;
        }
        .xfer-quote-readout-dest {
          font-family: var(--font-syne);
          font-weight: 700;
          font-size: clamp(1rem, 1.6vw, 1.25rem);
          letter-spacing: -0.01em;
          color: var(--text-primary);
          line-height: 1.25;
        }
        .xfer-quote-readout-price-block { text-align: right; }
        .xfer-quote-readout-price {
          font-family: var(--font-syne);
          font-weight: 800;
          font-size: clamp(2rem, 5vw, 2.625rem);
          letter-spacing: -0.025em;
          color: var(--text-primary);
          line-height: 1;
        }
        .xfer-quote-readout-meta {
          font-family: var(--font-dm-sans);
          font-size: 12px;
          color: var(--text-tertiary);
          margin-top: 6px;
        }

        .xfer-why-section {
          padding: 72px 20px;
          background: var(--bg-warm);
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }
        .xfer-center-head {
          text-align: center;
          max-width: 640px;
          margin: 0 auto 40px;
        }
        .xfer-section-h2 {
          font-family: var(--font-syne);
          font-weight: 700;
          font-size: clamp(1.75rem, 3vw, 2.4rem);
          letter-spacing: -0.02em;
          color: var(--text-primary);
          margin-top: 10px;
        }
        .xfer-section-sub {
          margin-top: 14px;
          font-family: var(--font-syne);
          font-style: italic;
          font-size: 16px;
          color: var(--text-secondary);
          line-height: 1.55;
        }
        .xfer-compare-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
        }

        .xfer-zones-section {
          padding: 72px 20px;
          background: #fff;
        }
        .xfer-zones-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
        }
        .xfer-contact-cta {
          margin-top: 40px;
          padding: 22px 28px;
          border-radius: var(--r-lg);
          border: 1px solid var(--border);
          background: var(--bg-warm);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
        }
        .xfer-contact-cta-title {
          font-family: var(--font-syne);
          font-weight: 700;
          font-size: 16px;
          letter-spacing: -0.01em;
          color: var(--text-primary);
          margin-bottom: 4px;
        }
        .xfer-contact-cta-body {
          font-family: var(--font-dm-sans);
          font-size: 13.5px;
          color: var(--text-secondary);
          max-width: 520px;
        }

        .xfer-zone-card {
          background: var(--bg-warm);
          border: 1px solid var(--border);
          border-radius: var(--r-xl);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .xfer-zone-card:hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow-card-hover);
        }
        .xfer-zone-img {
          position: relative;
          aspect-ratio: 16 / 10;
          background: var(--surface);
        }
        .xfer-zone-img-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0.35) 100%);
        }
        .xfer-zone-roman {
          position: absolute;
          top: 14px;
          left: 16px;
          font-family: var(--font-syne);
          font-weight: 800;
          font-style: italic;
          font-size: 30px;
          color: #fff;
          text-shadow: 0 2px 14px rgba(0, 0, 0, 0.45);
          letter-spacing: 0.02em;
        }
        .xfer-zone-body { padding: 22px 24px 24px; }
        .xfer-zone-label {
          font-family: var(--font-syne);
          font-weight: 700;
          font-size: 18px;
          letter-spacing: -0.01em;
          color: var(--text-primary);
          line-height: 1.2;
        }
        .xfer-zone-duration {
          font-family: var(--font-dm-sans);
          font-size: 11px;
          color: var(--text-tertiary);
          letter-spacing: 0.06em;
          white-space: nowrap;
        }
        .xfer-zone-prices {
          display: flex;
          gap: 28px;
          padding: 14px 0;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          margin: 14px 0;
        }
        .xfer-zone-price-label {
          font-family: var(--font-dm-sans);
          font-size: 10.5px;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.18em;
          margin-bottom: 4px;
          font-weight: 600;
        }
        .xfer-zone-price-value {
          font-family: var(--font-syne);
          font-weight: 800;
          font-size: 26px;
          letter-spacing: -0.015em;
          color: var(--text-primary);
          line-height: 1;
        }
        .xfer-zone-destinations {
          font-family: var(--font-dm-sans);
          font-size: 12.5px;
          color: var(--text-tertiary);
          line-height: 1.55;
        }

        .xfer-reviews-section {
          padding: 72px 20px;
          background: var(--bg-warm);
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }
        .xfer-reviews-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 18px;
          margin-bottom: 40px;
        }
        .xfer-review {
          background: #fff;
          border: 1px solid var(--border);
          border-radius: var(--r-lg);
          padding: 22px 24px;
          margin: 0;
        }
        .xfer-review-quote {
          font-family: var(--font-syne);
          font-style: italic;
          font-size: 15px;
          line-height: 1.55;
          color: var(--text-primary);
          margin-bottom: 14px;
        }
        .xfer-review-footer {
          font-family: var(--font-dm-sans);
          font-size: 12px;
          color: var(--text-tertiary);
          display: flex;
          gap: 4px;
        }
        .xfer-review-footer strong {
          color: var(--text-primary);
          font-weight: 700;
        }
        .xfer-review-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          padding: 22px 24px;
          border-radius: var(--r-lg);
          border: 1px solid var(--border);
          background: #fff;
        }

        .xfer-faq-section { padding: 72px 20px; background: #fff; }
        .xfer-faq-list { display: flex; flex-direction: column; gap: 12px; }
        .xfer-faq-item {
          border: 1px solid var(--border);
          border-radius: var(--r-lg);
          background: var(--bg-warm);
          overflow: hidden;
        }
        .xfer-faq-item[open] { background: #fff; border-color: var(--border-strong); }
        .xfer-faq-item summary {
          cursor: pointer;
          padding: 18px 22px;
          font-family: var(--font-syne);
          font-weight: 700;
          font-size: 16px;
          letter-spacing: -0.005em;
          color: var(--text-primary);
          list-style: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
        }
        .xfer-faq-item summary::-webkit-details-marker { display: none; }
        .xfer-faq-item summary::after {
          content: '+';
          font-family: var(--font-syne);
          font-weight: 400;
          font-size: 22px;
          color: var(--text-tertiary);
          transition: transform 0.2s ease;
          flex-shrink: 0;
        }
        .xfer-faq-item[open] summary::after {
          transform: rotate(45deg);
          color: var(--gold);
        }
        .xfer-faq-answer {
          padding: 0 22px 20px;
          font-family: var(--font-syne);
          font-size: 15px;
          line-height: 1.65;
          color: var(--text-secondary);
        }

        .xfer-final-cta {
          padding: 88px 20px;
          border-top: 1px solid var(--border);
          background: var(--bg-warm);
        }

        .xfer-sticky-cta {
          display: none;
          position: fixed;
          left: 16px;
          right: 16px;
          bottom: 16px;
          z-index: 40;
          background: #fff;
          border: 1px solid var(--border-strong);
          box-shadow: var(--shadow-xl);
          border-radius: var(--r-lg);
          padding: 12px 14px 12px 18px;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .xfer-sticky-dest {
          font-family: var(--font-syne);
          font-weight: 700;
          font-size: 14.5px;
          letter-spacing: -0.005em;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }
        .xfer-sticky-meta {
          font-family: var(--font-dm-sans);
          font-size: 11.5px;
          color: var(--text-tertiary);
          margin-top: 2px;
        }

        @media (max-width: 900px) {
          .xfer-hero { padding: 48px 20px 40px; }
          .xfer-hero-grid { grid-template-columns: minmax(0, 1fr); gap: 32px; }
          .xfer-hero-image {
            aspect-ratio: 16 / 10;
            order: -1;
          }
          .xfer-trust-strip { gap: 16px; }
          .xfer-quote-section { padding: 40px 16px 32px; }
          .xfer-quote-card { padding: 28px 22px 24px; }
          .xfer-why-section,
          .xfer-zones-section,
          .xfer-reviews-section,
          .xfer-faq-section,
          .xfer-final-cta { padding: 56px 20px; }
          .xfer-compare-grid { grid-template-columns: minmax(0, 1fr); gap: 14px; }
          .xfer-review-stats { grid-template-columns: minmax(0, 1fr); gap: 16px; }
        }
        @media (max-width: 600px) {
          .xfer-hero-h1 { font-size: 2.1rem; }
          .xfer-trust-strip { grid-template-columns: minmax(0, 1fr); }
          .xfer-trip-toggles { flex-direction: column; }
          .xfer-pax-note { margin-left: 0; flex-basis: 100%; }
          .xfer-quote-readout { flex-direction: column; align-items: flex-start; }
          .xfer-quote-readout-price-block { text-align: left; }
          .xfer-zone-prices { gap: 20px; }
          .xfer-sticky-cta { display: flex; }
          .xfer-contact-cta { flex-direction: column; align-items: flex-start; }
          .xfer-final-cta { padding-bottom: 120px; }
        }
      `}</style>
    </div>
  )
}


/* ───────────── PRIMITIVES ───────────── */

function Kicker({
  children,
  centered = false,
}: {
  children: React.ReactNode
  centered?: boolean
}) {
  return (
    <p
      style={{
        display: centered ? 'block' : 'inline-block',
        margin: 0,
        fontFamily: 'var(--font-dm-sans)',
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: 'var(--gold)',
        textAlign: centered ? 'center' : 'left',
      }}
    >
      {children}
    </p>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label
        style={{
          display: 'block',
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 12.5,
          fontWeight: 600,
          color: 'var(--text-secondary)',
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
  badge,
}: {
  active: boolean
  onClick: () => void
  title: string
  sub: string
  badge?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '14px 18px',
        borderRadius: 'var(--r-md)',
        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
        background: active ? 'var(--accent)' : '#fff',
        color: active ? '#fff' : 'var(--text-primary)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.18s ease',
        position: 'relative',
      }}
    >
      {badge && (
        <span
          style={{
            position: 'absolute',
            top: -9,
            right: 10,
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            background: 'var(--gold)',
            color: '#fff',
            padding: '3px 8px',
            borderRadius: 999,
          }}
        >
          {badge}
        </span>
      )}
      <p
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: '-0.005em',
          marginBottom: 2,
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 12,
          color: active ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)',
        }}
      >
        {sub}
      </p>
    </button>
  )
}

function TrustItem({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span
        style={{
          flexShrink: 0,
          width: 34,
          height: 34,
          borderRadius: 10,
          background: 'var(--bg-warm)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent)',
        }}
      >
        {icon}
      </span>
      <div>
        <p
          style={{
            fontFamily: 'var(--font-syne)',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '-0.005em',
            color: 'var(--text-primary)',
            marginBottom: 2,
          }}
        >
          {title}
        </p>
        <p
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 12.5,
            color: 'var(--text-tertiary)',
            lineHeight: 1.5,
          }}
        >
          {body}
        </p>
      </div>
    </div>
  )
}

function CompareItem({
  title,
  items,
  bold,
  muted,
}: {
  title: string
  items: string[]
  bold?: boolean
  muted?: boolean
}) {
  return (
    <div
      style={{
        padding: '26px 28px',
        borderRadius: 'var(--r-xl)',
        background: bold ? '#fff' : 'var(--surface)',
        border: bold ? '1px solid var(--border-strong)' : '1px solid var(--border)',
        boxShadow: bold ? 'var(--shadow-sm)' : 'none',
        opacity: muted ? 0.85 : 1,
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 700,
          fontSize: 17,
          letterSpacing: '-0.01em',
          color: 'var(--text-primary)',
          marginBottom: 16,
        }}
      >
        {title}
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              gap: 10,
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 13.5,
              color: 'var(--text-secondary)',
              lineHeight: 1.55,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                marginTop: 3,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: bold ? 'var(--emerald-dim)' : 'transparent',
                color: bold ? 'var(--emerald)' : 'var(--text-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {bold ? <Check size={11} /> : '·'}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatBlock({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: string
  label: string
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'var(--bg-warm)',
          border: '1px solid var(--border)',
          color: 'var(--gold)',
          marginBottom: 10,
        }}
      >
        {icon}
      </div>
      <p
        style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 800,
          fontSize: 24,
          letterSpacing: '-0.015em',
          color: 'var(--text-primary)',
          marginBottom: 2,
        }}
      >
        {value}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 11.5,
          color: 'var(--text-tertiary)',
        }}
      >
        {label}
      </p>
    </div>
  )
}

function Lock() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function roman(n: 'A' | 'B' | 'C' | 'D' | 'E'): string {
  return { A: 'I', B: 'II', C: 'III', D: 'IV', E: 'V' }[n]
}
