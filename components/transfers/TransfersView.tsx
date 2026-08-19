'use client'

import { useMemo, useState, useId, isValidElement, cloneElement, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  Plane,
  MapPin,
  Clock,
  ShieldCheck,
  Mail,
  Check,
  Star,
  TrendingUp,
  ArrowUpDown,
} from 'lucide-react'
import {
  DESTINATIONS,
  ZONES,
  buildQuote,
  type TransferTripType,
  type TransferZone,
  zoneFromPrice,
  zonePriceRange,
  getTransferPrice,
  areaFromPrice,
  getDestination,
} from '@/lib/airport-transfers'
import { useTransfersCart } from '@/lib/transfers-cart'
import { useI18n } from '@/lib/i18n'
import { HERO, DESTINATIONS as DESTINATION_IMAGES } from '@/lib/images'
import PlacePicker, { AIRPORT_ID } from './PlacePicker'
import {
  TRANSFER_REVIEWS as REVIEWS,
  TRANSFER_FAQS as FAQS,
} from '@/lib/airport-transfers-content'

/* High-intent shortcut routes, these are the searches that convert. Click
   one and the quote calculator preselects, then we scroll the user there
   so they can hit "Book" in two taps. Prices are read from the live ZONES
   table so they stay in sync with rate changes. */
const POPULAR_ROUTES: Array<{
  destinationId: string
  label: string
  travelTime: string
  /** SEO + screen-reader copy for the long-tail keyword */
  searchPhrase: string
}> = [
  { destinationId: 'sandals-negril', label: 'MBJ → Negril', travelTime: '1h 30m', searchPhrase: 'Montego Bay airport to Negril private transfer' },
  { destinationId: 'sandals-ochi', label: 'MBJ → Ocho Rios', travelTime: '1h 45m', searchPhrase: 'MBJ to Ocho Rios airport transfer' },
  { destinationId: 'iberostar-rose-hall', label: 'MBJ → Rose Hall', travelTime: '20m', searchPhrase: 'Montego Bay airport to Rose Hall hotel transfer' },
  { destinationId: 'royalton-blue-water-trelawny', label: 'MBJ → Falmouth', travelTime: '40m', searchPhrase: 'MBJ to Falmouth resort transfer' },
]

/* Hero + per-zone imagery, all confirmed-Jamaica Pexels photos already
   used elsewhere on the site. Alt text is descriptive for SEO + a11y. */
const HERO_IMAGE = {
  src: HERO, // aerial Buff Bay coastal road
  alt: 'Aerial view of Jamaica’s north-coast road between Montego Bay and Ocho Rios, the route MAPL Tours drivers use for airport transfers.',
}

const ZONE_IMAGES: Record<TransferZone, { src: string; alt: string }> = {
  A: {
    src: DESTINATION_IMAGES['Montego Bay'],
    alt: 'Aerial view of Montego Bay, Jamaica, Zone I airport-transfer destination.',
  },
  B: {
    src: DESTINATION_IMAGES['Falmouth'],
    alt: 'Traditional red boat flying the Jamaican flag in Falmouth, Zone II airport-transfer area.',
  },
  C: {
    src: DESTINATION_IMAGES['Treasure Beach'],
    alt: 'Colorful fishing boats along the Jamaican coast, Zone III (Trelawny, Hanover, Lucea) airport transfers.',
  },
  D: {
    src: DESTINATION_IMAGES['Negril'],
    alt: 'Rockhouse cliffs at sunset in Negril, Jamaica, Zone IV airport-transfer destination.',
  },
  E: {
    src: DESTINATION_IMAGES['Ocho Rios'],
    alt: 'Turquoise water and wooden pier in Ocho Rios, Jamaica, Zone V airport transfers.',
  },
}

/** "$94" when every resort in a zone costs the same, "$94–$106" when they differ. */
function priceRangeLabel(zone: TransferZone, tripType: TransferTripType): string {
  const { min, max } = zonePriceRange(zone, tripType)
  const fmt = (n: number) => `$${n}`
  return min === max ? fmt(min) : `${fmt(min)}\u2013${fmt(max)}`
}

// Mercy's branch passed an hourly illustrative activity feed here. This
// surface renders the real aggregates from /api/transfers/activity instead
// (LiveActivityLine); fabricated counts were purged by owner instruction.

export default function TransfersView() {
  const router = useRouter()
  const addQuote = useTransfersCart((s) => s.addQuote)
  const { formatPrice } = useI18n()

  const [destinationId, setDestinationId] = useState<string>('')

  // "My hotel isn't listed". Held apart from destinationId on purpose: an
  // unlisted property has no zone and therefore no price, so it must never
  // produce a quote. This only ever opens a request form.
  const [notListed, setNotListed] = useState(false)
  const [askForm, setAskForm] = useState({ hotel: '', email: '' })
  const [askState, setAskState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [askError, setAskError] = useState<string | null>(null)
  // Honeypot, matching /api/contact's contract. Real people never fill it.
  const [askWebsite, setAskWebsite] = useState('')

  // Deep links (blog resort reviews, ads) preselect the route via ?to=<id>.
  // Read client-side from location so the page stays fully static; runs once
  // after hydration and never overrides a choice the visitor already made.
  useEffect(() => {
    const to = new URLSearchParams(window.location.search).get('to')
    if (to && getDestination(to)) {
      setDestinationId((cur) => cur || to)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /**
   * Which end of the journey the guest starts at.
   *
   * Every fare we sell has Sangster at one end, so this is a direction rather
   * than a second destination. It used to be INFERRED server-side from whether
   * arrival details were filled in, which meant a guest booking a hotel to
   * airport run had no way to say so and hoped the inference agreed with them.
   * A round-trip always begins at the airport, so the choice only applies to a
   * one-way.
   */
  const [fromAirport, setFromAirport] = useState(true)
  const [tripType, setTripType] = useState<TransferTripType>('round_trip')
  // Starts at 1, matching the tour cart. Transfer fares are per VEHICLE for
  // 1-4 passengers, so this changes what is pre-filled, never the price quoted.
  const [passengers, setPassengers] = useState<number>(1)

  const quote = useMemo(
    () => (destinationId ? buildQuote(destinationId, tripType, passengers) : null),
    [destinationId, tripType, passengers],
  )

  const handleBook = () => {
    if (!quote) return
    // One transfer per cart: this REPLACES anything already there. Warn first
    // if it is a different ride, so a guest who came back to add a second leg
    // is not silently swapped out of the one they already had.
    const existing = useTransfersCart.getState().items[0]
    const replacing =
      existing &&
      (existing.destinationId !== quote.destinationId || existing.tripType !== quote.tripType)
    if (replacing) {
      const ok = window.confirm(
        `Your cart already holds a transfer to ${existing.destinationName}. ` +
        `We book one transfer at a time, so this will replace it. Continue?`,
      )
      if (!ok) return
    }
    addQuote(quote, { fromAirport: tripType === 'round_trip' ? true : fromAirport })
    router.push('/transfers/checkout')
  }

  const scrollToQuote = () => {
    document
      .getElementById('quote')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Prefill the calculator from a popular-route tile, then scroll the user
  // to the booking card. Two taps from cold land to checkout: tile, then
  // "Book for $X →".
  /* Put the enquiry form back to a blank slate.
     Without this the panel is one-shot: askForm/askState live here rather than
     in the panel, so unmounting the panel preserves them and re-opening the
     unlisted branch renders a success message about a hotel the visitor is no
     longer asking about, with no form to submit a second one. */
  const resetAsk = () => {
    setAskForm({ hotel: '', email: '' })
    setAskState('idle')
    setAskError(null)
  }

  /* Ask us to price an unlisted property.
     Reuses /api/contact exactly as the partner form does: it already carries
     the honeypot, the rate limit, the ops alert and the visitor auto-reply.
     Nothing here creates a booking, a quote or a PaymentIntent. */
  const submitHotelRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (askState === 'sending') return
    setAskError(null)
    setAskState('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: askForm.email.split('@')[0] || 'Transfer enquiry',
          email: askForm.email,
          subject: `Unlisted hotel · ${askForm.hotel}`,
          message:
            `A visitor could not find their hotel in the transfers picker.\n\n` +
            `Hotel or address: ${askForm.hotel}\n` +
            `Trip type: ${tripType === 'round_trip' ? 'Round-trip' : 'One-way'}\n` +
            `Passengers: ${passengers}\n\n` +
            `Reply with a flat quote, and add the property to DESTINATIONS if we serve it.`,
          website: askWebsite,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAskError(
          data.error ||
            'We could not send that. Please email contact@mapltours.com and we will price it.',
        )
        setAskState('idle')
        return
      }
      setAskState('sent')
    } catch {
      setAskError('Network error. Please check your connection and try again.')
      setAskState('idle')
    }
  }

  const selectRoute = (destId: string) => {
    setDestinationId(destId)
    // A popular-route tile is a real destination, so leave the unlisted-hotel
    // branch behind or the picker would show one thing and price another.
    setNotListed(false)
    resetAsk()
    setTripType('round_trip')
    // Reset to the site default alongside the trip type. This read
    // `setPassengers((p) => p)`, a no-op that looked like a reset and left the
    // previous tile's passenger count attached to the newly picked route.
    setPassengers(1)
    setTimeout(scrollToQuote, 60)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        paddingTop: 'var(--nav-h)',
        background: 'var(--bg-warm)',
        color: 'var(--text-primary)',
      }}
    >
      {/* ───────────── HERO ───────────── */}
      <section className="xfer-hero">
        <div className="container xfer-hero-grid" style={{ maxWidth: 1180 }}>
          {/* Copy */}
          <div className="xfer-hero-copy">
            <h1 className="xfer-hero-h1">
              Sangster to your hotel.{' '}
              <span style={{ fontStyle: 'italic', fontWeight: 500 }}>
                Avoid the hassle.
              </span>
            </h1>
            <p className="xfer-hero-sub">
              Private vehicle, 1–4 passengers, priced up front. Meet-and-greet
              at arrivals, flight tracking, and an experienced, fully vetted
              driver who knows the road.
            </p>

            {/* Each figure is the CHEAPEST rate to that area, derived from the
                rate table rather than pinned to one hotel, so a rate change
                can never leave the hero advertising a price we don't offer.
                "From" governs all three. */}
            <p className="xfer-hero-price-strip">
              <span>From <strong>{formatPrice(areaFromPrice('Rose Hall', 'one_way'))}</strong> to Rose Hall</span>
              <span aria-hidden>·</span>
              <span><strong>{formatPrice(areaFromPrice('Negril', 'one_way'))}</strong> to Negril</span>
              <span aria-hidden>·</span>
              <span><strong>{formatPrice(areaFromPrice('Ocho Rios', 'one_way'))}</strong> to Ocho Rios</span>
              <span aria-hidden>·</span>
              <span style={{ color: 'var(--text-tertiary)' }}>flat per vehicle, one-way</span>
            </p>

            <div className="xfer-hero-cta-row">
              <button
                type="button"
                className="btn-primary"
                onClick={scrollToQuote}
                style={{ height: 50, padding: '0 26px', fontSize: 14 }}
              >
                Book now →
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
                  Flat rate per vehicle, up to 4 passengers
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
                body="MAPL Tours Jamaica sign at arrivals, bags handled."
              />
              <TrustItem
                icon={<ShieldCheck size={17} />}
                title="Licensed & insured"
                body="JUTA-affiliated operators only."
              />
              <TrustItem
                icon={<Mail size={17} />}
                title="24/7 support"
                body="A real person on email, not a call-centre script."
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

      {/* ───────────── POPULAR ROUTES (high-intent capture) ───────────── */}
      <section className="xfer-routes-section" aria-label="Popular airport-transfer routes">
        <div className="container" style={{ maxWidth: 1100 }}>
          <div className="xfer-routes-head">
            <Kicker>Most-booked routes</Kicker>
            <h2 className="xfer-routes-h2">Tap a route to book in two taps.</h2>
          </div>
          <div className="xfer-routes-grid">
            {POPULAR_ROUTES.map((r) => {
              const q = buildQuote(r.destinationId, 'round_trip', 1)
              if (!q) return null
              return (
                <button
                  key={r.destinationId}
                  type="button"
                  className="xfer-route-tile"
                  onClick={() => selectRoute(r.destinationId)}
                  aria-label={`${r.searchPhrase}, round-trip from ${formatPrice(q.priceUsd)}`}
                >
                  <div className="xfer-route-tile-top">
                    <span className="xfer-route-tile-label">{r.label}</span>
                    <span className="xfer-route-tile-time">{r.travelTime}</span>
                  </div>
                  <div className="xfer-route-tile-bottom">
                    <span className="xfer-route-tile-from">From</span>
                    <span className="xfer-route-tile-price">{formatPrice(q.priceUsd)}</span>
                    <span className="xfer-route-tile-rt">round-trip</span>
                  </div>
                  <span className="xfer-route-tile-cta">Book →</span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ───────────── QUOTE CARD ───────────── */}
      <section id="quote" className="xfer-quote-section">
        <div className="container" style={{ maxWidth: 820 }}>
          <div className="xfer-quote-card">
            {/* Gold hairline, prestige cue matching the email templates */}
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
              <h2 className="xfer-quote-h2">
                Your ride,{' '}
                <span style={{ fontStyle: 'italic', fontWeight: 500 }}>
                  priced up front.
                </span>
              </h2>
              <LiveActivityLine />
            </div>

            {/* Two ends, stated plainly. One is always Sangster, so choosing
                a hotel on either side sets the other automatically and an
                impossible pair (two hotels, two airports) cannot be built. */}
            <Field label="Pickup">
              <PlacePicker
                label="Pickup location"
                placeholder="Airport, or start typing your hotel…"
                value={fromAirport ? AIRPORT_ID : destinationId}
                onChange={(v) => {
                  if (v === AIRPORT_ID) { setFromAirport(true) }
                  else if (v === '') { setDestinationId('') }
                  else { setFromAirport(false); setDestinationId(v) }
                }}
              />
            </Field>

            {/* Swap. Round-trips always begin at the airport, so it only
                applies to a one-way. */}
            {tripType === 'one_way' && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '-6px 0 6px' }}>
                <button
                  type="button"
                  onClick={() => setFromAirport((v) => !v)}
                  aria-label="Swap pickup and drop-off"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    height: 34, padding: '0 14px', borderRadius: 999,
                    border: '1px solid var(--border)', background: '#fff',
                    fontFamily: 'var(--font-dm-sans)', fontSize: 12.5,
                    fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  <ArrowUpDown size={14} />
                  Swap
                </button>
              </div>
            )}

            <Field label="Drop-off">
              <PlacePicker
                label="Drop-off location"
                placeholder="Airport, or start typing your hotel…"
                value={fromAirport ? destinationId : AIRPORT_ID}
                onChange={(v) => {
                  if (v === AIRPORT_ID) { setFromAirport(false) }
                  else if (v === '') { setDestinationId('') }
                  else { setFromAirport(true); setDestinationId(v) }
                }}
              />
            </Field>

            {/* Out-of-zone escape hatch. Every AREA we drive has an "Other
                hotel or villa" row in the picker, so this is not for a missing
                hotel inside a served zone, it is for Port Antonio, Kingston
                and anywhere else priced by custom quote. Toggling it does not
                touch destinationId, so it can never reach buildQuote, the cart
                or the checkout POST. */}
            {!notListed && (
              <button
                type="button"
                onClick={() => { setNotListed(true); resetAsk() }}
                style={{
                  alignSelf: 'flex-start', background: 'none', border: 'none',
                  padding: '10px 0', minHeight: 44, cursor: 'pointer',
                  fontFamily: 'var(--font-dm-sans)', fontSize: 13, fontWeight: 600,
                  color: 'var(--text-secondary)', textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                I don&rsquo;t see my hotel
              </button>
            )}

            {/* Mounted at all times, deliberately. A live region that appears
                in the same commit as its text is not announced, because there
                is no mutation for assistive tech to observe (WCAG 2.2 SC
                4.1.3). Keeping it here means the success message is written
                into a region that already exists. */}
            <div role="status" aria-live="polite" className="visually-hidden">
              {askState === 'sent'
                ? `Request sent. We will email a price for ${askForm.hotel} to ${askForm.email}.`
                : ''}
            </div>

            {notListed && <UnlistedHotelPanel
              form={askForm}
              setForm={setAskForm}
              state={askState}
              error={askError}
              website={askWebsite}
              setWebsite={setAskWebsite}
              onSubmit={submitHotelRequest}
              onReset={resetAsk}
            />}

            <Field label="Trip type">
              <div className="xfer-trip-toggles">
                <TripToggle
                  active={tripType === 'round_trip'}
                  onClick={() => setTripType('round_trip')}
                  title="Round-trip"
                  sub="Arrival + departure"
                  badge="10% off"
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
                    fontFamily: 'var(--font-dm-sans)',
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
                {/* The label stays put once a fare appears. It used to be
                    replaced by the zone line, which left the number with
                    nothing naming it. Zone and drive time move below, where
                    they read as detail about the route rather than a heading. */}
                <p className="xfer-quote-readout-kicker">Your price</p>
                <p className="xfer-quote-readout-dest">
                  {quote ? quote.destinationName : 'Pick a destination to see your fare.'}
                </p>
                {quote && (
                  <p className="xfer-quote-readout-meta" style={{ marginTop: 4 }}>
                    Zone {quote.zone} &middot; {quote.zoneDuration}
                  </p>
                )}
              </div>
              <div className="xfer-quote-readout-price-block">
                <p className="xfer-quote-readout-price">
                  {quote ? formatPrice(quote.priceUsd) : '-'}
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
              {quote ? `Book for ${formatPrice(quote.priceUsd)} →` : 'Select a destination to continue'}
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
              <Clock size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />
              Flexible cancellation within 48 hours of booking.
            </p>
          </div>
        </div>
      </section>

      {/* ───────────── WHY MAPL Tours (value prop) ───────────── */}
      <section className="xfer-why-section">
        <div className="container" style={{ maxWidth: 1100 }}>
          <div className="xfer-center-head">
            <Kicker centered>Why travel with us</Kicker>
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
              title="MAPL Tours private transfer"
              items={[
                'Fixed zone price, paid up front',
                'Driver waits with your name at arrivals',
                'Flight tracking, no surcharge if you land late',
                'Chilled bottled water, AC, English-speaking driver',
                'Flexible cancellation within 48 hours of booking',
              ]}
            />
            <CompareItem
              title="Airport taxi queue"
              items={[
                'Metered or "airport fixed rate", often higher than you were quoted',
                'Wait in the queue after a long flight',
                'No flight tracking, your pickup time is fixed',
                'Vehicle condition varies; comfort not guaranteed',
                'No cancellation window',
              ]}
            />
          </div>

          {/* Price-anchor strip, concrete savings on the most-quoted routes */}
          <div className="xfer-savings-strip" aria-label="Typical price comparison">
            <div className="xfer-savings-row">
              <SavingsRow route="MBJ → Riu Negril (round-trip)" mapl={getTransferPrice('riu-negril', 'round_trip') ?? 0} typical="240–400" />
              <SavingsRow route="MBJ → Moon Palace, Ocho Rios (round-trip)" mapl={getTransferPrice('moon-palace-ocho-rios', 'round_trip') ?? 0} typical="240–400" />
              <SavingsRow route="MBJ → Hilton Rose Hall (round-trip)" mapl={getTransferPrice('hilton-rose-hall', 'round_trip') ?? 0} typical="90–160" />
            </div>
            <p className="xfer-savings-note">
              Typical taxi quotes pulled from average prices reported by JUTA
              operators and concierge desks at the major resorts. Your actual
              taxi-queue quote may be higher during peak season.
            </p>
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
                    {code === 'D' && (
                      <span className="xfer-zone-badge">Most booked</span>
                    )}
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
                        <p className="xfer-zone-price-value">{priceRangeLabel(code, 'one_way')}</p>
                      </div>
                      <div>
                        <p className="xfer-zone-price-label">Round-trip</p>
                        <p className="xfer-zone-price-value">{priceRangeLabel(code, 'round_trip')}</p>
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
                Kingston (KIN), Port Antonio, or groups of five or more, we&rsquo;ll
                quote you directly within 24 hours.
              </p>
            </div>
            <Link
              href="/contact"
              className="btn-outline"
              style={{ height: 44, padding: '0 22px', fontSize: 13 }}
            >
              Request a custom quote
            </Link>
          </div>
        </div>
      </section>

      {/* ───────────── TESTIMONIALS ─────────────
          The heading is inside the guard on purpose. "What travelers say"
          sitting above an empty grid advertises reviews that do not exist,
          which is the same claim the invented quotes were making, just with
          nothing underneath it. The operating-promise stats below stand on
          their own until real reviews arrive. */}
      <section className="xfer-reviews-section">
        <div className="container" style={{ maxWidth: 1100 }}>
          {REVIEWS.length > 0 && (
          <div className="xfer-center-head">
            <Kicker centered>What travelers say</Kicker>
            <h2 className="xfer-section-h2">
              Read before you{' '}
              <span style={{ fontStyle: 'italic', fontWeight: 500 }}>land.</span>
            </h2>
          </div>
          )}

          {/* Renders nothing while REVIEWS is empty, which it is until real
              guests have written some. */}
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

          {/* The three statistics that stood here (342 transfers in 30 days,
              4.9/5 average rating, 98.6% on-time) were invented. What replaces
              them is the operating promise, which is verifiable from the
              product itself rather than from numbers nobody measured. */}
          <div className="xfer-review-stats">
            <StatBlock
              icon={<TrendingUp size={16} />}
              label="One price per vehicle"
              value="1 to 4 passengers"
            />
            <StatBlock
              icon={<Check size={16} />}
              label="Met at arrivals with a name sign"
              value="Every transfer"
            />
            <StatBlock
              icon={<Check size={16} />}
              label="Driver name, plate and WhatsApp"
              value="Day before travel"
            />
          </div>
        </div>
      </section>

      {/* ───────────── ROUTE GUIDE (long-tail SEO + conversion content) ───────────── */}
      <section className="xfer-routes-content" aria-label="Route guide, Montego Bay airport transfers">
        <div className="container" style={{ maxWidth: 820 }}>
          <div className="xfer-center-head" style={{ textAlign: 'left', marginBottom: 32 }}>
            <Kicker>Route guide</Kicker>
            <h2 className="xfer-section-h2" style={{ marginTop: 8 }}>
              How to get from MBJ to{' '}
              <span style={{ fontStyle: 'italic', fontWeight: 500 }}>
                anywhere in Jamaica.
              </span>
            </h2>
          </div>

          <RouteSection
            id="mbj-to-negril"
            heading="MBJ to Negril private transfer"
            travel="Roughly 1h 30m along the A1, then the coast road past Lucea."
            price={getTransferPrice('sandals-negril', 'round_trip') ?? 0}
            destinationId="sandals-negril"
            onSelect={selectRoute}
            body="Sangster International (MBJ) is the airport everyone flying to Negril uses, Norman Manley (KIN) is on the wrong side of the island, three hours further. The drive is straightforward and scenic; the catch is that the Negril taxi queue at MBJ is one of the most-overpriced in the Caribbean during peak season. A pre-booked private transfer locks the price, skips the queue, and gets you to Seven Mile Beach with bottled water and the AC already running."
          />

          <RouteSection
            id="mbj-to-ocho-rios"
            heading="MBJ to Ocho Rios airport transfer"
            travel="About 1h 45m on the new north-coast highway."
            price={getTransferPrice('sandals-ochi', 'round_trip') ?? 0}
            destinationId="sandals-ochi"
            onSelect={selectRoute}
            body="The toll highway between Montego Bay and Ocho Rios cut a chunk off this drive, what used to be three hours on the old coastal road is now closer to 1h 45m. Most resorts in St. Ann (Sandals Ochi, Moon Palace, Bahia Principe) sit within 20 minutes of each other on this same stretch. Round-trip is the way most travelers book; it is 10% cheaper than two one-ways, you keep the same driver, and you skip the cab math twice."
          />

          <RouteSection
            id="montego-bay-airport-transfer"
            heading="Montego Bay airport transfer to your hotel"
            travel="5–25 minutes for any Rose Hall or Ironshore property."
            price={getTransferPrice('hilton-rose-hall', 'round_trip') ?? 0}
            destinationId="hilton-rose-hall"
            onSelect={selectRoute}
            body="If you’re staying anywhere in the Rose Hall corridor, Iberostar, Hyatt Ziva, Hilton, Half Moon, the Sandals MoBay properties, you’re on the shortest run we drive and the cheapest fare we quote. Solo travelers get the same vehicle at the same price; it is per car, not per passenger."
          />

          <RouteSection
            id="mbj-to-falmouth"
            heading="MBJ to Falmouth resort transfer"
            travel="About 35–45 minutes east on the highway."
            price={getTransferPrice('royalton-blue-water-trelawny', 'round_trip') ?? 0}
            destinationId="royalton-blue-water-trelawny"
            onSelect={selectRoute}
            body="Royalton Blue Water and Excellence Oyster Bay both sit just outside Falmouth, in Trelawny. The drive is short and almost entirely highway. If you’re a cruise passenger meeting your ship at the Falmouth Cruise Port, the same flat rate applies, just pick the port as your destination at checkout."
          />

          <p className="xfer-routes-content-foot">
            Don’t see your hotel? <Link href="#quote" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>Book above</Link>{' '}
            or <Link href="/contact" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>request a custom route</Link> for Kingston or Port Antonio.
          </p>
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
              Cancel within 48 hours of booking.
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
            Book now →
          </button>
          <p
            style={{
              marginTop: 14,
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 12,
              color: 'var(--text-tertiary)',
            }}
          >
            <Lock />
            Secure payment via Stripe · Flexible cancellation within 48 hrs of booking
          </p>
        </div>
      </section>

      {/* ───────────── Sticky mobile CTA, always present ─────────────
           Quote selected → "Book · $X" goes straight to checkout.
           No quote yet → "Book now →" scrolls to the calculator. */}
      <div className="xfer-sticky-cta" role="region" aria-label="Booking shortcut">
        {quote ? (
          <>
            <div>
              <p className="xfer-sticky-dest">{quote.destinationName}</p>
              <p className="xfer-sticky-meta">
                {quote.tripType === 'round_trip' ? 'Round-trip' : 'One-way'} ·{' '}
                Zone {quote.zone} · 1–4 passengers
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={handleBook}
              style={{ height: 46, padding: '0 20px', fontSize: 14, whiteSpace: 'nowrap' }}
            >
              Book · {formatPrice(quote.priceUsd)}
            </button>
          </>
        ) : (
          <>
            <div>
              <p className="xfer-sticky-dest">Airport transfer · MBJ</p>
              <p className="xfer-sticky-meta">From {formatPrice(zoneFromPrice('A', 'one_way'))} · 1–4 passengers · flight tracked</p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={scrollToQuote}
              style={{ height: 46, padding: '0 20px', fontSize: 14, whiteSpace: 'nowrap' }}
            >
              Book now →
            </button>
          </>
        )}
      </div>

      {/* ───────────── Responsive CSS ───────────── */}
      <style jsx global>{`
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
        .xfer-hero-h1 {
          font-family: var(--font-dm-sans);
          font-weight: 700;
          font-size: clamp(2rem, 5.2vw, 4rem);
          line-height: 1.03;
          letter-spacing: -0.025em;
          color: var(--text-primary);
          margin-bottom: 18px;
        }
        .xfer-hero-sub {
          font-family: var(--font-dm-sans);
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
        /* Layout-critical rules (position/width/aspect-ratio/min-height and
           the mobile order) live in globals.css .xfer-hero-image so the hero
           box reserves its height in SSR HTML, no CLS. Cosmetic only here. */
        .xfer-hero-image {
          border-radius: var(--r-xl);
          overflow: hidden;
          box-shadow: var(--shadow-lg);
          border: 1px solid var(--border);
          background: var(--surface);
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
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.78);
          margin-bottom: 4px;
        }
        .xfer-hero-image-caption p {
          font-family: var(--font-dm-sans);
          font-style: italic;
          font-weight: 500;
          font-size: 15px;
        }

        /* Hero price strip */
        .xfer-hero-price-strip {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          font-family: var(--font-dm-sans);
          font-size: 13.5px;
          color: var(--text-secondary);
          margin-bottom: 28px;
          align-items: center;
          font-feature-settings: 'tnum' 1;
        }
        .xfer-hero-price-strip strong {
          color: var(--text-primary);
          font-weight: 700;
          font-family: var(--font-dm-sans);
        }

        /* Popular routes section */
        .xfer-routes-section {
          padding: 40px 20px 16px;
        }
        .xfer-routes-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .xfer-routes-h2 {
          font-family: var(--font-dm-sans);
          font-weight: 700;
          font-size: clamp(1.15rem, 2vw, 1.4rem);
          letter-spacing: -0.01em;
          color: var(--text-primary);
        }
        .xfer-routes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 14px;
        }
        .xfer-route-tile {
          position: relative;
          text-align: left;
          padding: 18px 20px 16px;
          border-radius: var(--r-lg);
          border: 1px solid var(--border);
          background: #fff;
          cursor: pointer;
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
          display: flex;
          flex-direction: column;
          gap: 10px;
          font-family: var(--font-dm-sans);
        }
        .xfer-route-tile:hover {
          transform: translateY(-3px);
          box-shadow: var(--shadow-md);
          border-color: var(--border-strong);
        }
        .xfer-route-tile-top {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
        }
        .xfer-route-tile-label {
          font-family: var(--font-dm-sans);
          font-weight: 700;
          font-size: 16px;
          letter-spacing: -0.005em;
          color: var(--text-primary);
        }
        .xfer-route-tile-time {
          font-size: 12px;
          color: var(--text-tertiary);
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .xfer-route-tile-bottom {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }
        .xfer-route-tile-from {
          font-size: 11px;
          color: var(--text-tertiary);
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 700;
        }
        .xfer-route-tile-price {
          font-family: var(--font-dm-sans);
          font-weight: 800;
          font-size: 26px;
          letter-spacing: -0.005em;
          color: var(--text-primary);
          font-feature-settings: 'tnum' 1;
        }
        .xfer-route-tile-rt {
          font-size: 12px;
          color: var(--text-tertiary);
        }
        .xfer-route-tile-cta {
          font-size: 12.5px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: 0.04em;
          margin-top: 2px;
        }

        /* Quote-card live activity strip */
        .xfer-quote-activity {
          margin-top: 12px;
          font-family: var(--font-dm-sans);
          font-size: 12.5px;
          color: var(--text-tertiary);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .xfer-quote-activity-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--emerald);
          box-shadow: 0 0 0 0 rgba(29, 122, 80, 0.45);
          animation: maplPulse 2s ease-in-out infinite;
        }
        @keyframes maplPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(29, 122, 80, 0.45); }
          50% { box-shadow: 0 0 0 6px rgba(29, 122, 80, 0); }
        }

        .xfer-quote-section { padding: 32px 20px 48px; }
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
          font-family: var(--font-dm-sans);
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
          font-family: var(--font-dm-sans);
          font-weight: 700;
          font-size: clamp(1rem, 1.6vw, 1.25rem);
          letter-spacing: -0.01em;
          color: var(--text-primary);
          line-height: 1.25;
        }
        .xfer-quote-readout-price-block { text-align: right; }
        .xfer-quote-readout-price {
          font-family: var(--font-dm-sans);
          font-weight: 800;
          font-size: clamp(2rem, 5vw, 2.625rem);
          letter-spacing: -0.01em;
          color: var(--text-primary);
          line-height: 1;
          font-feature-settings: 'tnum' 1;
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
          font-family: var(--font-dm-sans);
          font-weight: 700;
          font-size: clamp(1.75rem, 3vw, 2.4rem);
          letter-spacing: -0.02em;
          color: var(--text-primary);
          margin-top: 10px;
        }
        .xfer-section-sub {
          margin-top: 14px;
          font-family: var(--font-dm-sans);
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
          font-family: var(--font-dm-sans);
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
          width: 100%;
          aspect-ratio: 16 / 10;
          min-height: 180px;
          flex-shrink: 0;
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
          font-family: var(--font-dm-sans);
          font-weight: 800;
          font-style: italic;
          font-size: 30px;
          color: #fff;
          text-shadow: 0 2px 14px rgba(0, 0, 0, 0.45);
          letter-spacing: 0.02em;
        }
        .xfer-zone-badge {
          position: absolute;
          top: 14px;
          right: 14px;
          font-family: var(--font-dm-sans);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #fff;
          background: var(--gold-text);
          padding: 4px 10px;
          border-radius: 9999px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
        }

        /* Compare savings strip */
        .xfer-savings-strip {
          margin-top: 32px;
          padding: 24px 26px;
          border-radius: var(--r-xl);
          background: #fff;
          border: 1px solid var(--border-strong);
          box-shadow: var(--shadow-sm);
        }
        .xfer-savings-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }
        .xfer-savings-note {
          margin-top: 18px;
          font-family: var(--font-dm-sans);
          font-size: 12px;
          color: var(--text-tertiary);
          line-height: 1.55;
        }
        .xfer-saving-cell {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .xfer-saving-route {
          font-family: var(--font-dm-sans);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: var(--text-tertiary);
          text-transform: uppercase;
        }
        .xfer-saving-prices {
          display: flex;
          align-items: baseline;
          gap: 14px;
          margin-top: 2px;
        }
        .xfer-saving-mapl {
          font-family: var(--font-dm-sans);
          font-weight: 800;
          font-size: 22px;
          letter-spacing: -0.005em;
          color: var(--text-primary);
          font-feature-settings: 'tnum' 1;
        }
        .xfer-saving-typical {
          font-family: var(--font-dm-sans);
          font-size: 12.5px;
          color: var(--text-tertiary);
        }
        .xfer-saving-tag {
          margin-top: 4px;
          font-family: var(--font-dm-sans);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: var(--emerald);
          text-transform: uppercase;
        }

        /* Route content section */
        .xfer-routes-content {
          padding: 72px 20px;
          background: #fff;
          border-top: 1px solid var(--border);
        }
        .xfer-route-block {
          padding: 28px 0;
          border-bottom: 1px solid var(--border);
        }
        .xfer-route-block:last-of-type { border-bottom: none; }
        .xfer-route-block-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .xfer-route-block-h3 {
          font-family: var(--font-dm-sans);
          font-weight: 700;
          font-size: clamp(1.15rem, 2vw, 1.4rem);
          letter-spacing: -0.01em;
          color: var(--text-primary);
        }
        .xfer-route-block-price {
          font-family: var(--font-dm-sans);
          font-weight: 800;
          font-size: 22px;
          letter-spacing: -0.005em;
          color: var(--text-primary);
          font-feature-settings: 'tnum' 1;
        }
        .xfer-route-block-meta {
          font-family: var(--font-dm-sans);
          font-size: 12.5px;
          color: var(--text-tertiary);
          margin-bottom: 12px;
        }
        .xfer-route-block-body {
          font-family: var(--font-dm-sans);
          font-size: 15.5px;
          color: var(--text-secondary);
          line-height: 1.65;
          margin-bottom: 14px;
        }
        /* The underline is drawn with ::after rather than border-bottom so the
           button can carry vertical padding for a 44px touch target without
           pushing the rule away from the text. It measured 125x22 on a phone,
           under the 24px WCAG 2.2 target-size minimum, and well under a
           comfortable thumb. */
        .xfer-route-block-cta {
          position: relative;
          background: none;
          border: none;
          padding: 12px 0 10px;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          font-family: var(--font-dm-sans);
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: var(--text-primary);
          cursor: pointer;
        }
        .xfer-route-block-cta::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: 8px;
          height: 1px;
          background: currentColor;
        }
        .xfer-routes-content-foot {
          margin-top: 32px;
          font-family: var(--font-dm-sans);
          font-style: italic;
          font-size: 15px;
          color: var(--text-secondary);
          line-height: 1.55;
        }
        .xfer-zone-body { padding: 22px 24px 24px; }
        .xfer-zone-label {
          font-family: var(--font-dm-sans);
          font-weight: 700;
          font-size: 18px;
          letter-spacing: -0.01em;
          color: var(--text-primary);
          line-height: 1.2;
        }
        .xfer-zone-duration {
          font-family: var(--font-dm-sans);
          font-size: 12px;
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
          font-size: 11px;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.18em;
          margin-bottom: 4px;
          font-weight: 600;
        }
        .xfer-zone-price-value {
          font-family: var(--font-dm-sans);
          font-weight: 800;
          font-size: 26px;
          letter-spacing: -0.005em;
          color: var(--text-primary);
          line-height: 1;
          font-feature-settings: 'tnum' 1;
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
          font-family: var(--font-dm-sans);
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
          font-family: var(--font-dm-sans);
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
          font-family: var(--font-dm-sans);
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
          font-family: var(--font-dm-sans);
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
          font-family: var(--font-dm-sans);
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
          font-size: 12px;
          color: var(--text-tertiary);
          margin-top: 2px;
        }

        @media (max-width: 900px) {
          .xfer-hero { padding: 48px 20px 40px; }
          .xfer-hero-grid { grid-template-columns: minmax(0, 1fr); gap: 32px; }
          /* .xfer-hero-image mobile aspect-ratio + order:-1 are in globals.css */
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
          .xfer-savings-row { grid-template-columns: minmax(0, 1fr); gap: 14px; }
          .xfer-routes-section { padding: 28px 16px 8px; }
          .xfer-hero-price-strip { font-size: 12.5px; }
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
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: 'var(--gold-text)',
        textAlign: centered ? 'center' : 'left',
      }}
    >
      {children}
    </p>
  )
}

/**
 * Shown when a visitor picks "I don't see my hotel".
 *
 * Deliberately NOT a booking. An unlisted property has no zone, so it has no
 * price, and inventing one would either undercharge the driver or overcharge
 * the guest. This asks two questions and hands the enquiry to a human via the
 * existing /api/contact route — no quote, no cart write, no PaymentIntent.
 */
function UnlistedHotelPanel({
  form, setForm, state, error, website, setWebsite, onSubmit, onReset,
}: {
  form: { hotel: string; email: string }
  setForm: (f: { hotel: string; email: string }) => void
  state: 'idle' | 'sending' | 'sent'
  error: string | null
  website: string
  setWebsite: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  onReset: () => void
}) {
  const hotelId = useId()
  const emailId = useId()

  const panelStyle: React.CSSProperties = {
    marginBottom: 18,
    padding: 16,
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-warm)',
    border: '1px solid var(--border)',
  }

  // No live-region role on this branch: the announcement is made by the
  // always-mounted region in the parent, which assistive tech can observe.
  if (state === 'sent') {
    return (
      <div className="animate-fade-up" style={panelStyle}>
        <p style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 14, fontWeight: 600,
          color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
        }}>
          <Check size={16} color="var(--gold-text)" aria-hidden="true" />
          Got it, we&rsquo;re on it
        </p>
        <p style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 13, lineHeight: 1.55,
          color: 'var(--text-secondary)', margin: 0,
        }}>
          We&rsquo;ll work out the flat price for {form.hotel || 'your hotel'} and email{' '}
          {form.email} within a day. Nothing has been booked or charged.
        </p>
        {/* Without this the success screen is terminal: a guest with two
            properties to price would have to reload the page. */}
        <button
          type="button"
          onClick={onReset}
          style={{
            marginTop: 12,
            minHeight: 44,
            padding: '0 2px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--gold-text)',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          Ask about another hotel
        </button>
      </div>
    )
  }

  return (
    <form className="animate-fade-up" style={panelStyle} onSubmit={onSubmit} noValidate={false}>
      <p style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: 14, fontWeight: 600,
        color: 'var(--text-primary)', marginBottom: 4,
      }}>
        Tell us where you&rsquo;re staying
      </p>
      <p style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: 13, lineHeight: 1.55,
        color: 'var(--text-secondary)', marginBottom: 14,
      }}>
        We drive the whole island. If it&rsquo;s not in the list we&rsquo;ll price it by
        hand and email you a flat rate, usually the same day.
      </p>

      <label htmlFor={hotelId} style={labelStyle}>Hotel, villa or address</label>
      <input
        id={hotelId}
        className="field-input"
        type="text"
        required
        autoComplete="off"
        value={form.hotel}
        onChange={(e) => setForm({ ...form, hotel: e.target.value })}
        placeholder="e.g. Samsara Cliff Resort, West End Road"
        style={askInputStyle}
      />

      <label htmlFor={emailId} style={{ ...labelStyle, marginTop: 12 }}>
        Where we send the price
      </label>
      <input
        id={emailId}
        className="field-input"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        placeholder="you@email.com"
        style={askInputStyle}
      />

      {/* Honeypot: hidden from people, irresistible to bots. */}
      <input
        type="text" name="website" tabIndex={-1} autoComplete="off"
        value={website} onChange={(e) => setWebsite(e.target.value)}
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />

      {error && (
        <p role="alert" style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 13, lineHeight: 1.5,
          // Matches the error red already used in the email templates.
          // 6.25:1 on --bg-warm (#FAF9F7), comfortably past WCAG AA.
          color: '#B42318', marginTop: 12, marginBottom: 0,
        }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        className="btn-primary"
        disabled={state === 'sending'}
        style={{
          marginTop: 14,
          width: '100%',
          minHeight: 46,
          fontSize: 15,
          opacity: state === 'sending' ? 0.65 : 1,
          cursor: state === 'sending' ? 'progress' : 'pointer',
        }}
      >
        {state === 'sending' ? 'Sending…' : 'Ask for a price'}
      </button>
    </form>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-dm-sans)',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 6,
}

// 16px keeps iOS Safari from zooming the viewport on focus.
//
// The fill and border are both overridden on purpose. `.field-input` is warm
// (--bg-warm) so it reads as a recess against the white quote card, but this
// panel is itself warm, so the default field dissolves into it: the fills are
// identical and the only boundary left is a --border hairline at 1.23:1.
// White fill alone does not fix that (1.05:1 against the panel), so the
// boundary is carried by an explicit border instead: #8B8A88 measures 3.28:1
// against the panel and 3.45:1 against the fill, clearing WCAG 2.2 SC 1.4.11.
// Focus still reads distinctly through .field-input:focus's accent ring.
const askInputStyle: React.CSSProperties = {
  height: 46,
  fontSize: 16,
  background: '#fff',
  border: '1px solid #8B8A88',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // Stable, unique id so the <label> is programmatically tied to its control
  // (WCAG 4.1.2 / axe select-name). We clone the child to inject the id,
  // for the Destination <select> this gives it an accessible name.
  const id = useId()
  const control = isValidElement(children)
    ? cloneElement(children as React.ReactElement, { id })
    : children
  return (
    <div style={{ marginBottom: 18 }}>
      <label
        htmlFor={id}
        style={{
          display: 'block',
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          marginBottom: 8,
        }}
      >
        {label}
      </label>
      {control}
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
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            background: 'var(--gold-text)',
            color: '#fff',
            padding: '3px 8px',
            borderRadius: 9999,
          }}
        >
          {badge}
        </span>
      )}
      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
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
            fontFamily: 'var(--font-dm-sans)',
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
            fontSize: 12,
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
}: {
  title: string
  items: string[]
  bold?: boolean
}) {
  return (
    <div
      style={{
        padding: '26px 28px',
        borderRadius: 'var(--r-xl)',
        background: bold ? '#fff' : 'var(--surface)',
        border: bold ? '1px solid var(--border-strong)' : '1px solid var(--border)',
        boxShadow: bold ? 'var(--shadow-sm)' : 'none',
        // No container opacity on the muted (taxi) card, it dimmed the body
        // text below WCAG AA (4.22:1). The de-emphasis is already carried by
        // the surface background + no shadow.
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
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
              fontSize: 13,
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
              {bold ? <Check size={12} /> : '·'}
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
          fontFamily: 'var(--font-dm-sans)',
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
          fontSize: 12,
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

/**
 * Live social proof from real bookings, via /api/transfers/activity.
 * Tiered: the strongest claim the actual numbers make true, or nothing.
 * Never invented: every figure shown is a database count.
 */
function LiveActivityLine() {
  const [line, setLine] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/transfers/activity')
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => {
        if (!alive || !a) return
        const ago = (min: number) =>
          min < 60 ? `${min} minutes ago`
          : min < 36 * 60 ? `${Math.round(min / 60)} hours ago`
          : `${Math.round(min / 1440)} days ago`
        if (a.count24h >= 2 && a.lastAgoMin != null) {
          setLine(`${a.count24h} transfers booked in the last 24 hours · last one ${ago(a.lastAgoMin)}`)
        } else if (a.lastAgoMin != null && a.lastAgoMin < 4320 && a.lastHotel) {
          setLine(`Latest booking: ${a.lastTrip} to ${a.lastHotel} · ${ago(a.lastAgoMin)}`)
        } else if (a.count30d >= 2) {
          setLine(`${a.count30d} transfers booked in the last 30 days`)
        } else if (a.lastAgoMin != null && a.lastHotel) {
          setLine(`Latest booking: ${a.lastTrip} to ${a.lastHotel}`)
        }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  if (!line) return null
  return (
    <p className="xfer-quote-activity">
      <span className="xfer-quote-activity-dot" aria-hidden />
      {line}
    </p>
  )
}

function SavingsRow({
  route,
  mapl,
  typical,
}: {
  route: string
  mapl: number
  typical: string
}) {
  const { formatPrice } = useI18n()
  return (
    <div className="xfer-saving-cell">
      <span className="xfer-saving-route">{route}</span>
      <span className="xfer-saving-prices">
        <span className="xfer-saving-mapl">{formatPrice(mapl)}</span>
        <span className="xfer-saving-typical">taxi quotes ${typical}</span>
      </span>
      <span className="xfer-saving-tag">MAPL Tours flat rate</span>
    </div>
  )
}

function RouteSection({
  id,
  heading,
  travel,
  price,
  destinationId,
  body,
  onSelect,
}: {
  id: string
  heading: string
  travel: string
  price: number
  destinationId: string
  body: string
  onSelect: (destId: string) => void
}) {
  const { formatPrice } = useI18n()
  return (
    <article id={id} className="xfer-route-block">
      <div className="xfer-route-block-head">
        <h3 className="xfer-route-block-h3">{heading}</h3>
        <span className="xfer-route-block-price">From {formatPrice(price)}</span>
      </div>
      <p className="xfer-route-block-meta">{travel}</p>
      <p className="xfer-route-block-body">{body}</p>
      <button
        type="button"
        className="xfer-route-block-cta"
        onClick={() => onSelect(destinationId)}
      >
        Quote this route →
      </button>
    </article>
  )
}
