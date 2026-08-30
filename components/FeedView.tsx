'use client'

import Image from 'next/image'
import Link from 'next/link'
import { experiences, singleExperiences, packageExperiences, HERO_IMAGE, DESTINATION_IMAGES, TOUR_DESTINATIONS, slugify } from '@/lib/experiences'
import { EATS } from '@/lib/eats'
import { priceUnitLabel } from '@/lib/experiences'
import { useCartStore } from '@/lib/cart'
import { fitCandidateStop, MAX_STOP_GAP_MIN } from '@/lib/day-route'
import { useHydrated } from '@/lib/use-hydrated'
import { CULTURE_IMAGE, HERO_VIDEO } from '@/lib/images'
import ExpCard from './ExpCard'
import MobileShort from './MobileShort'
import Footer from './Footer'
import { useI18n } from '@/lib/i18n'
import { useRef, useState, useEffect } from 'react'
import { Award, Users, Headphones, ShieldCheck, Star, Heart, UtensilsCrossed, TrendingUp, ChevronLeft, ChevronRight, MapPin, PlaneLanding, Route, ArrowRight } from 'lucide-react'


/* Hero video, lazy loads on fast connections, shows poster on slow/mobile data */
function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [shouldLoad, setShouldLoad] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    // Motion preference first: a user who asked for reduced motion gets the
    // poster, full stop. Then data constraints.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const nav = navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }
    const conn = nav.connection
    if (conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') {
      return
    }
    const timer = setTimeout(() => setShouldLoad(true), 1000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!shouldLoad || !videoRef.current) return
    const video = videoRef.current

    const onPlaying = () => setIsPlaying(true)
    video.addEventListener('playing', onPlaying)

    video.play().catch(() => {})

    return () => video.removeEventListener('playing', onPlaying)
  }, [shouldLoad])

  return (
    <>
      {/* Poster, visible until video is actually playing */}
      <Image
        src={poster}
        alt=""
        fill
        sizes="100vw"
        priority
        fetchPriority="high"
        style={{
          objectFit: 'cover', objectPosition: 'center 35%',
          opacity: isPlaying ? 0 : 1,
          transition: 'opacity 1.2s ease',
          zIndex: 1,
        }}
      />
      {shouldLoad && (
        <video
          ref={videoRef}
          muted loop playsInline
          preload="auto"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center 35%',
            opacity: isPlaying ? 1 : 0,
            transition: 'opacity 1.2s ease',
          }}
        >
          <source src={src} type="video/mp4" />
        </video>
      )}
    </>
  )
}

const viralExperiences = singleExperiences.filter((e) => e.id >= 11 && e.id <= 15)

// Only destinations Collins actually serves, straight from the catalog.
const destinations = TOUR_DESTINATIONS

function SectionHeader({ label, action }: { label: string; action?: { text: string; href: string } }) {
  const { t } = useI18n()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
      <span className="text-label">{t(label)}</span>
      {action && (
        <a href={action.href} style={{ fontSize: 13, fontFamily: 'var(--font-dm-sans)', fontWeight: 500, color: 'var(--text-tertiary)' }}>
          {t(action.text)} →
        </a>
      )}
    </div>
  )
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StepCarousel({ steps, renderCard }: { steps: any[]; renderCard: (s: any, i: number) => any }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({ left: dir === 'left' ? -292 : 292, behavior: 'smooth' })
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14, paddingRight: 4 }}>
        <button onClick={() => scroll('left')} aria-label="Previous step" style={{
          width: 44, height: 44, borderRadius: '50%', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.5)', transition: 'all 0.15s ease',
        }}>
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => scroll('right')} aria-label="Next step" style={{
          width: 44, height: 44, borderRadius: '50%', background: 'var(--gold)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#1A1508', transition: 'all 0.15s ease',
        }}>
          <ChevronRight size={18} />
        </button>
      </div>
      {/* Full-bleed on mobile: the rail sits inside .container (16px gutter),
          so without the negative margins its own padding doubles the inset
          and the last card stops 32px short of the screen edge. */}
      <div ref={scrollRef} className="no-scrollbar" tabIndex={0} role="region" aria-label="Ways to book, scroll options" style={{
        display: 'flex', gap: 12, overflowX: 'auto',
        scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
        margin: '0 -16px', paddingLeft: 16, paddingRight: 16,
        scrollPaddingLeft: 16,
      }}>
        {steps.map((s, i) => renderCard(s, i))}
      </div>
    </div>
  )
}

function FoodSection() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { t } = useI18n()
  const { addStop, removeStop, isStopAdded } = useCartStore()
  const items = useCartStore((s) => s.items)
  const cartStops = useCartStore((s) => s.stops)
  const hydrated = useHydrated()
  // Pre-hydration the cart is empty on both sides of the render, so judge
  // against nothing rather than against a cart we have not loaded yet.
  const tours = hydrated ? items : []
  const ctx = { items: tours, stops: hydrated ? cartStops : [] }

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    const amount = 340
    scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  return (
    <section className="section-y reveal" style={{ background: 'var(--bg-dark)' }}>
      <div className="container">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <UtensilsCrossed size={15} color="var(--gold-warm)" />
              <span style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 600,
                fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--gold-warm)',
              }}>
                {t('Food & Culture')}
              </span>
            </div>
            <h2 style={{
              fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
              fontSize: 'var(--fs-h2)',
              color: 'white', lineHeight: 1.15, letterSpacing: '-0.02em',
            }}>
              {t('A Taste of Jamaica')}
            </h2>
            <p style={{
              fontSize: 14, color: '#cccccc',
              fontFamily: 'var(--font-dm-sans)', marginTop: 8,
              maxWidth: 440,
            }}>
              Real spots, no reservations needed: the jerk pits and kitchens Jamaicans swear by, from Scotchies&apos; pimento smoke to sunset jerk on the Negril cliffs.
            </p>
            {/* Only the empty state gets a line of explanation, because only
                the empty state is inexplicable: every card is unaddable and
                nothing on screen says why. Once there are tours, each card
                carries its own status and the rule explains itself in place —
                repeating it up here was telling people something the buttons
                had already told them. */}
            {tours.length === 0 && (
              <p style={{
                fontSize: 13, color: 'var(--gold-warm)',
                fontFamily: 'var(--font-dm-sans)', marginTop: 10,
                maxWidth: 460, lineHeight: 1.5,
              }}>
                Food stops ride along a tour day. They are free, and your driver
                works them into the route. Add a tour first, then the spots near it
                open up.
              </p>
            )}
          </div>

          {/* Arrows */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginBottom: 4 }}>
            <button
              onClick={() => scroll('left')}
              aria-label="Previous"
              style={{
                width: 42, height: 42, borderRadius: '50%',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.15)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#cccccc',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#cccccc' }}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => scroll('right')}
              aria-label="Next"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'var(--gold)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#1A1508',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--gold-warm)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--gold)' }}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable cards */}
      <div
        ref={scrollRef}
        className="no-scrollbar"
        tabIndex={0}
        role="region"
        aria-label="Featured experiences, scroll"
        style={{
          display: 'flex', gap: 16,
          overflowX: 'auto',
          paddingTop: 28,
          paddingLeft: 'max(16px, calc((100vw - 1832px) / 2 + 48px))',
          paddingRight: 16,
        }}
      >
        {EATS.map((r) => {
          const added = hydrated && isStopAdded(r.name)
          const fit = fitCandidateStop(r, ctx)
          return (
          <div
            key={r.name}
            style={{
              flex: '0 0 310px',
              borderRadius: 'var(--r-xl)',
              overflow: 'hidden',
              background: 'var(--bg-dark-warm)',
              border: '1px solid rgba(255,255,255,0.06)',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.transform = 'translateY(-3px)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = '' }}
          >
            {/* Image */}
            <div style={{ position: 'relative', height: 200, overflow: 'hidden' }}>
              <Image
                src={r.image}
                alt={`${r.knownFor} at ${r.name}`}
                fill sizes="(max-width:768px) 85vw, 310px"
                style={{ objectFit: 'cover', transition: 'transform 0.4s ease' }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(0deg, rgba(0,0,0,0.4) 0%, transparent 50%)',
                pointerEvents: 'none',
              }} />
              {/* Location */}
              <span style={{
                position: 'absolute', bottom: 12, left: 12,
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.9)',
                fontFamily: 'var(--font-dm-sans)',
              }}>
                <MapPin size={12} strokeWidth={2} /> {r.town}, {r.parish}
              </span>
              {/* Free-stop pill, sets expectations honestly */}
              <span style={{
                position: 'absolute', top: 12, left: 12,
                padding: '3px 10px', borderRadius: 9999,
                background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
                fontSize: 12, fontWeight: 600, color: '#fff',
                fontFamily: 'var(--font-dm-sans)', letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>
                {t('Free stop')}
              </span>
            </div>

            {/* Info */}
            <div style={{ padding: '16px 18px 18px' }}>
              <h3 style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 600,
                fontSize: 14, color: 'white', lineHeight: 1.3,
                marginBottom: 4,
              }}>
                {r.name}
              </h3>
              <p style={{
                fontSize: 12, color: 'var(--gold-warm)', fontWeight: 600,
                fontFamily: 'var(--font-dm-sans)', marginBottom: 6,
              }}>
                {r.knownFor}
              </p>
              <p style={{
                fontSize: 12, color: '#cccccc',
                fontFamily: 'var(--font-dm-sans)', lineHeight: 1.45,
                marginBottom: 14,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {r.description}
              </p>
              {/* Where this spot sits relative to the day being built. Kept
                  above the button so the answer arrives before the tap, not
                  after it. */}
              <p style={{
                fontSize: 11.5, fontFamily: 'var(--font-dm-sans)', marginBottom: 8,
                lineHeight: 1.4, minHeight: 16,
                color: added
                  ? 'var(--emerald)'
                  : fit.allowed ? 'var(--gold-warm)' : 'rgba(255,255,255,0.45)',
              }}>
                {added
                  ? fit.label
                  : fit.verdict === 'no-tours'
                    ? 'Free with any tour day'
                    : fit.verdict === 'stranded'
                      ? `Nothing in your day comes within ${MAX_STOP_GAP_MIN} min of it`
                      : fit.label}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Three states, three different answers. Two of them are
                    about tours rather than about this restaurant — no tours
                    yet, or no tour left without a stop — and both are fixed
                    by booking one, so the control becomes the way to do that
                    instead of a dead button. Only distance is a genuine
                    refusal: adding a spot that far out would quietly lengthen
                    the drive for everything else in the day. */}
                {!added && fit.verdict === 'no-tours' ? (
                  <Link
                    href="/explore"
                    style={{
                      flex: 1, minHeight: 44, borderRadius: 9999,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.16)',
                      color: '#fff', textDecoration: 'none',
                      fontSize: 13, fontWeight: 700,
                      fontFamily: 'var(--font-dm-sans)',
                    }}
                  >
                    {t('Add a tour first')}
                  </Link>
                ) : !added && !fit.allowed ? (
                  <button
                    disabled
                    title={fit.reason ?? undefined}
                    style={{
                      flex: 1, minHeight: 44, borderRadius: 9999,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      color: 'rgba(255,255,255,0.42)',
                      cursor: 'not-allowed',
                      fontSize: 13, fontWeight: 700,
                      fontFamily: 'var(--font-dm-sans)',
                    }}
                  >
                    {t('Off your route')}
                  </button>
                ) : (
                <button
                  onClick={() => (added ? removeStop(r.name) : addStop({
                    name: r.name, town: r.town, parish: r.parish,
                    knownFor: r.knownFor, image: r.image, mapsQuery: r.mapsQuery,
                  }))}
                  aria-pressed={added}
                  aria-label={added ? `Remove ${r.name} from your itinerary` : `Add ${r.name} to your itinerary`}
                  style={{
                    flex: 1, minHeight: 44, borderRadius: 9999,
                    background: added ? 'var(--emerald)' : 'var(--gold)',
                    color: added ? '#fff' : '#1A1508',
                    border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 700,
                    fontFamily: 'var(--font-dm-sans)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {added ? t('\u2713 On your route') : t('+ Add to itinerary')}
                </button>
                )}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.mapsQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Directions to ${r.name} in Google Maps`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 44, height: 44, borderRadius: 9999, flexShrink: 0,
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                    color: '#e6e6e6', textDecoration: 'none', fontSize: 15,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {'\u2197'}
                </a>
              </div>
            </div>
          </div>
          )
        })}
      </div>

      {/* Honest framing: these are recommendations, not MAPL products. */}
      <div className="container">
        <p style={{
          marginTop: 20, fontSize: 12, color: '#999999',
          fontFamily: 'var(--font-dm-sans)',
        }}>
          Stops you add are free, they ride along with your booking and your driver builds them into your day.
        </p>
      </div>
    </section>
  )
}

/**
 * Ready-made package days. Kept out of the reel feed and the build-your-own
 * grids because each one bundles activities that are also sold singly, so
 * listing them together duplicates the catalog and lets a guest book the
 * same attraction twice. Adding one swaps out any of its components already
 * in the itinerary (see cart.addItem).
 *
 * A horizontal rail of identical cards, on a light band so it still reads
 * apart from the dark food rail above it. The day's running order is the
 * card's main content, because the sequence is what makes a package a
 * package.
 */
function PackagesSection() {
  const railRef = useRef<HTMLDivElement>(null)
  const { t, formatPrice } = useI18n()
  const { addItem, removeItem, isInCart, conflictsInCart } = useCartStore()
  const hydrated = useHydrated()

  const scroll = (dir: 'left' | 'right') => {
    if (!railRef.current) return
    railRef.current.scrollBy({ left: dir === 'left' ? -336 : 336, behavior: 'smooth' })
  }

  return (
    <section className="pkg-band">
      <div className="container">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
          <div style={{ maxWidth: 620 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span aria-hidden style={{ width: 26, height: 2, background: 'var(--gold)', borderRadius: 2 }} />
              <span style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 600,
                fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em',
                color: 'var(--gold-text)',
              }}>
                {t('Ready-made days')}
              </span>
            </div>
            <h2 style={{
              fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
              fontSize: 'var(--fs-h2)',
              color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-0.025em',
              textWrap: 'balance',
            }}>
              {t('Whole days, already planned')}
            </h2>
            <p style={{
              fontSize: 15, color: 'var(--text-secondary)',
              fontFamily: 'var(--font-dm-sans)', marginTop: 10, lineHeight: 1.5,
            }}>
              {t('Two or three experiences run back to back, in the right order, driven door to door. Book a ready-made day or build your own, you decide.')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginBottom: 4 }}>
            <button onClick={() => scroll('left')} aria-label="Previous packages" style={{
              width: 44, height: 44, borderRadius: '50%', background: 'transparent',
              border: '1px solid var(--border-strong)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)', transition: 'all 0.2s ease',
            }}>
              <ChevronLeft size={20} />
            </button>
            <button onClick={() => scroll('right')} aria-label="Next packages" style={{
              width: 44, height: 44, borderRadius: '50%', background: 'var(--gold)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#1A1508', transition: 'all 0.2s ease',
            }}>
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={railRef}
        className="pkg-rail no-scrollbar"
        tabIndex={0}
        role="region"
        aria-label="Package days, scroll"
      >
        {packageExperiences.map((pkg) => {
          const inCart = hydrated && isInCart(pkg.id)
          const replaces = hydrated ? conflictsInCart(pkg) : []
          const steps = (pkg.includes ?? [])
            .map((id) => experiences.find((e) => e.id === id)?.title)
            .filter(Boolean) as string[]
          return (
            <article key={pkg.id} className="pkg-card">
              <Link
                href={`/experience/${slugify(pkg.title)}`}
                className="pkg-media"
                aria-label={t(pkg.title)}
              >
                <Image
                  src={pkg.image}
                  alt=""
                  fill
                  sizes="(max-width: 767px) 84vw, 320px"
                  style={{ objectFit: 'cover' }}
                />
                <span style={{
                  position: 'absolute', top: 12, left: 12,
                  padding: '4px 11px', borderRadius: 9999,
                  background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
                  fontSize: 12, fontWeight: 600, color: '#fff',
                  fontFamily: 'var(--font-dm-sans)', letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>
                  {(pkg.includes ?? []).length} {t('in one day')}
                </span>
              </Link>

              <div className="pkg-body">
                <p style={{
                  fontSize: 12, fontWeight: 600, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-dm-sans)', marginBottom: 6,
                }}>
                  {t(pkg.duration)} · {pkg.destination}
                </p>
                <h3 style={{
                  fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
                  fontSize: 17, lineHeight: 1.25, letterSpacing: '-0.01em',
                  color: 'var(--text-primary)', marginBottom: 12,
                  minHeight: 42,
                }}>
                  <Link
                    href={`/experience/${slugify(pkg.title)}`}
                    className="tap-target"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    {t(pkg.title)}
                  </Link>
                </h3>

                <ol className="pkg-steps">
                  {steps.map((title) => <li key={title}>{t(title)}</li>)}
                </ol>

                <div className="pkg-buy" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <span style={{
                      fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
                      fontSize: 20, color: 'var(--text-primary)', letterSpacing: '-0.01em',
                    }}>
                      {formatPrice(pkg.price)}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginLeft: 4 }}>
                      {priceUnitLabel(pkg.pricing)}
                    </span>
                  </div>
                  {/* Once the day is in the itinerary the button stops being a
                      toggle and becomes the way forward: tapping it goes to
                      checkout. Removing moves to a quiet secondary link, so the
                      primary action is never "undo what you just did". */}
                  {inCart ? (
                    <>
                      <Link
                        href="/checkout"
                        style={{
                          width: '100%', minHeight: 44, borderRadius: 9999,
                          background: 'var(--emerald)', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                          textDecoration: 'none',
                          fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.08)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.filter = '' }}
                      >
                        {t('\u2713 Added')} · {t('Checkout')} <ArrowRight size={15} />
                      </Link>
                      <button
                        onClick={() => removeItem(pkg.id)}
                        aria-label={`Remove ${pkg.title} from your itinerary`}
                        style={{
                          minHeight: 32, background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 12.5, fontWeight: 600, color: 'var(--text-tertiary)',
                          fontFamily: 'var(--font-dm-sans)', textDecoration: 'underline',
                        }}
                      >
                        {t('Remove')}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => addItem(pkg)}
                      aria-label={`Add ${pkg.title} to your itinerary`}
                      style={{
                        width: '100%', minHeight: 44, borderRadius: 9999,
                        background: 'var(--gold)', color: '#1A1508',
                        border: 'none', cursor: 'pointer',
                        fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.08)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.filter = '' }}
                    >
                      {t('Add this day')}
                    </button>
                  )}
                  {/* Two ways to buy, said as an invitation rather than as an
                      accounting note. The old line ("Replaces the 1 experience
                      in your itinerary") read like a warning about something
                      being taken away, when the choice underneath is really
                      ours-or-yours and either makes a good day. Shown only
                      when there are singles in the cart to swap, which is
                      exactly when the question is live. */}
                  {replaces.length > 0 && !inCart && (
                    <p className="pkg-replaces" style={{ fontSize: 12, color: 'var(--gold-text)', fontFamily: 'var(--font-dm-sans)', lineHeight: 1.45 }}>
                      {t('Choose this day, or add individual tours as you like.')}
                    </p>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function DestinationsSection() {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({ left: dir === 'left' ? -220 : 220, behavior: 'smooth' })
  }

  const destCard = (d: { name: string; parish: string }) => (
    <a key={d.name} href={`/explore?q=${encodeURIComponent(d.name)}`} className="photo-card" style={{
      aspectRatio: '1', display: 'flex', alignItems: 'flex-end', padding: 14,
    }}>
      <Image src={DESTINATION_IMAGES[d.name]} alt={d.name} fill sizes="(max-width:768px) 50vw, 16vw" style={{ objectFit: 'cover' }} />
      <div className="overlay-bottom" style={{ height: '60%' }} />
      <span style={{ position: 'relative', zIndex: 1, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontWeight: 600, fontSize: 13 }}>
        {d.name}
      </span>
    </a>
  )

  return (
    <section className="section-y reveal">
      {/* Desktop: grid */}
      <div className="container hide-mobile">
        <SectionHeader label="Popular destinations" />
        <div className="grid-destinations">
          {destinations.map((d) => destCard(d))}
        </div>
      </div>

      {/* Mobile: scrollable with arrows */}
      <div className="hide-desktop">
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span className="text-label">Popular destinations</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => scroll('left')}
                aria-label="Previous"
                style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'transparent', border: '1px solid var(--border-strong)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-secondary)', transition: 'all 0.15s ease',
                }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => scroll('right')}
                aria-label="Next"
                style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'var(--accent)', border: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', transition: 'all 0.15s ease',
                }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
        <div
          ref={scrollRef}
          className="no-scrollbar mobile-dest-scroll"
          tabIndex={0}
          role="region"
          aria-label="Destinations, scroll"
          style={{
            display: 'flex', gap: 12,
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {destinations.map((d) => (
            <a key={d.name} href="/explore" className="photo-card mobile-dest-card" style={{
              flex: '0 0 200px', aspectRatio: '3/4', display: 'flex',
              alignItems: 'flex-end', padding: 16, scrollSnapAlign: 'start',
              borderRadius: 'var(--r-xl)',
            }}>
              <Image src={DESTINATION_IMAGES[d.name]} alt={d.name} fill sizes="200px" style={{ objectFit: 'cover' }} />
              <div className="overlay-bottom" style={{ height: '65%' }} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <span style={{ color: '#fff', fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 18, display: 'block', letterSpacing: '-0.01em' }}>
                  {d.name}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-dm-sans)', fontWeight: 500, fontSize: 13, marginTop: 3, display: 'block' }}>
                  {d.parish}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

function AllExperiencesSection() {
  const { t } = useI18n()
  const [visibleCount, setVisibleCount] = useState(15)
  const visible = singleExperiences.slice(0, visibleCount)
  const hasMore = visibleCount < singleExperiences.length
  const remaining = singleExperiences.length - visibleCount

  return (
    <section className="container section-y reveal">
      <SectionHeader label="All experiences" />
      {/* Desktop: cards */}
      <div className="hide-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
        {visible.map((e) => <ExpCard key={e.id} exp={e} />)}
      </div>
      {/* Mobile: shorts, 1 col */}
      {/* Two columns, matching /explore: one column of 9:16 shorts made the
          home page 22816px tall on a phone. */}
      {/* One full-width reel per row, matching the explore page. */}
      <div className="hide-desktop mobile-shorts-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
        {visible.map((e) => <MobileShort key={e.id} exp={e} />)}
      </div>
      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 40 }}>
          <button
            onClick={() => setVisibleCount((prev) => Math.min(prev + 10, experiences.length))}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 48, padding: '0 36px',
              borderRadius: 9999,
              background: 'transparent',
              border: '1.5px solid var(--accent)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-dm-sans)',
              fontWeight: 600, fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent)'
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
          >
            {t('Load more')} ({remaining > 10 ? 10 : remaining} {t('more')})
          </button>
        </div>
      )}
    </section>
  )
}

export default function FeedView() {
  const { t, formatPrice } = useI18n()
  return (
    <div>
      {/* ═══ HERO, 16/4 desktop, 1/1 mobile ═══ */}
      <section className="hero-section">
        {/* Video background */}
        <HeroVideo src={HERO_VIDEO} poster={HERO_IMAGE} />
        {/* Top scrim for nav readability */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140, background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 100%)', pointerEvents: 'none' }} />
        {/* Bottom-anchored warm scrim, keeps the footage vivid up top while
            grounding the headline. Legibility also comes from the flag
            drop-shadow + the headline text-shadow below. */}
        <div style={{
          // Taller and denser than it needs to be for a dim clip, because the
          // Negril footage is bright, turquoise shallows and white sand run
          // straight through the text band. Tuned so the gold eyebrow and the
          // green "Jamaica" in the headline stay legible against sand, while
          // the top of the frame keeps the footage vivid.
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '78%',
          // The 0% stop is fully opaque and EXACTLY --bg-dark (#111110): at
          // 93% the bright Negril sand bled through and the hero's bottom
          // edge read grey against the black section that follows it.
          background: 'linear-gradient(0deg, rgb(17,17,16) 0%, rgba(10,10,8,0.85) 16%, rgba(8,8,6,0.6) 40%, rgba(8,8,6,0.26) 68%, transparent 100%)',
          pointerEvents: 'none',
        }} />
        <div className="container" style={{ position: 'relative', zIndex: 1, paddingBottom: 'clamp(40px, 6vw, 72px)' }}>
          <h1 className="animate-fade-up stagger-1" style={{
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 700,
            fontSize: 'clamp(2.75rem, 7vw, 6rem)',
            lineHeight: 0.98,
            letterSpacing: '-0.035em',
            color: 'white',
            textShadow: '0 2px 16px rgba(0,0,0,0.55)',
            maxWidth: 900,
          }}>
            {t('Discover')} <span className="flag-text">Jamaica</span><br />{t('beyond the resort.')}
          </h1>
          <p className="animate-fade-up stagger-2" style={{
            fontSize: 17,
            color: '#fff',
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 500,
            marginTop: 16,
            maxWidth: 480,
            lineHeight: 1.55,
            textShadow: '0 1px 6px rgba(0,0,0,0.4)',
          }}>
            {t('Private transfers and tours, run by the people who know Jamaica best.')}
          </p>

          {/* The two doors, in selling order: transfers convert today, the
              experiences build the dream. 48px targets, AA on the scrim. */}
          <div className="animate-fade-up stagger-3" style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            <Link
              href="/transfers"
              className="hero-cta-primary"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 50, padding: '0 26px', borderRadius: 9999,
                background: 'var(--gold)', color: '#1A1508',
                fontFamily: 'var(--font-dm-sans)', fontSize: 15, fontWeight: 700,
                textDecoration: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
                transition: 'filter 0.15s ease, transform 0.15s ease',
              }}
            >
              Book Your Airport Transfer
            </Link>
            <Link
              href="/explore"
              className="hero-cta-ghost"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 50, padding: '0 24px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.16)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.5)',
                fontFamily: 'var(--font-dm-sans)', fontSize: 15, fontWeight: 600,
                textDecoration: 'none',
                transition: 'background 0.15s ease, border-color 0.15s ease',
              }}
            >
              Explore Experiences
            </Link>
          </div>
          {/* Sentinel top improvement: price anchor + risk reversal at the
              exact moment of decision. Sits in the deepest scrim zone. */}
          <p className="animate-fade-up stagger-4" style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 13, fontWeight: 500,
            color: '#fff', marginTop: 16, textShadow: '0 1px 6px rgba(0,0,0,0.5)',
          }}>
            From $22 · Flexible cancellation within 48 hours of booking
          </p>
        </div>
      </section>

      {/* ═══ CONCIERGE PROMISE ═══ */}
      <section className="section-y reveal" style={{ background: 'var(--bg-dark)' }}>
        <div className="container" style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Headline */}
          <div data-reveal style={{ textAlign: 'center', marginBottom: 52 }}>
            <span style={{
              fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
              textTransform: 'uppercase', letterSpacing: '0.14em',
              color: 'var(--gold-warm)', marginBottom: 16, display: 'block',
            }}>
              The MAPL Tours Experience
            </span>
            <h2 style={{
              fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
              fontSize: 'var(--fs-h2)',
              letterSpacing: '-0.025em', lineHeight: 1.1,
              marginBottom: 14, color: '#fff',
            }}>
              Two ways to travel with MAPL Tours.
            </h2>
            <p className="concierge-body" style={{
              fontSize: 15, color: '#cccccc',
              fontFamily: 'var(--font-dm-sans)', lineHeight: 1.65,
              maxWidth: 520, margin: '0 auto',
            }}>
              Book a private airport transfer on its own, or build a day of experiences
              with private transport included between every stop. Take one, or both.
            </p>
          </div>

          {(() => {
            // Two INDEPENDENT products, not three sequential steps. A traveler
            // can book a transfer without ever touching a tour, and a tour
            // itinerary already carries its own hotel-to-tour transport, so
            // the airport transfer is never an implied add-on to it.
            const paths = [
              {
                kicker: 'Airport transfer',
                icon: <PlaneLanding size={18} color="var(--gold-warm)" />,
                title: 'Airport to your hotel, and back',
                body: 'Your driver is waiting at arrivals at Sangster International (MBJ) and takes you straight to your door. Book the arrival on its own, or add the return leg for your flight home.',
                steps: [
                  'Give us your flight number and hotel',
                  'We track the flight and meet you at arrivals',
                  'One way, or round trip for the ride back',
                ],
                cta: { text: 'Book a transfer', href: '/transfers' },
              },
              {
                kicker: 'Tours and itinerary',
                icon: <Route size={18} color="var(--gold-warm)" />,
                title: 'Build a day of experiences',
                body: 'Pick the experiences you love and we build the day around them, with a private driver from your hotel to each tour, on to the next one, and home again.',
                steps: [
                  'Tap the experiences that move you',
                  'Tell us your hotel or villa',
                  'We drive you hotel → tour → tour → hotel',
                ],
                cta: { text: 'Explore experiences', href: '/explore' },
              },
            ]
            const pathCard = (path: typeof paths[0], idx: number) => (
              <div key={path.title} data-reveal style={{
                padding: '34px 32px 30px',
                borderRadius: 'var(--r-xl)',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
                textAlign: 'left',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                flex: '0 0 min(86vw, 340px)',
                scrollSnapAlign: 'start',
                ['--i' as string]: idx,
              } as React.CSSProperties}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
                  {path.icon}
                  <span style={{
                    fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
                    letterSpacing: '0.16em', textTransform: 'uppercase',
                    color: 'var(--gold-warm)',
                  }}>
                    {path.kicker}
                  </span>
                </div>
                <h3 style={{
                  fontFamily: 'var(--font-dm-sans)', fontWeight: 600, fontSize: 20,
                  marginBottom: 10, lineHeight: 1.22, letterSpacing: '-0.01em', color: '#fff',
                }}>
                  {path.title}
                </h3>
                <p style={{
                  fontSize: 13, color: 'rgba(255,255,255,0.72)',
                  fontFamily: 'var(--font-dm-sans)', lineHeight: 1.62,
                  marginBottom: 18,
                }}>
                  {path.body}
                </p>
                <ul style={{
                  listStyle: 'none', padding: 0, margin: '0 0 22px',
                  display: 'flex', flexDirection: 'column', gap: 9,
                }}>
                  {path.steps.map((step, i) => (
                    <li key={step} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      fontSize: 13, color: 'rgba(255,255,255,0.82)',
                      fontFamily: 'var(--font-dm-sans)', lineHeight: 1.5,
                    }}>
                      <span aria-hidden style={{
                        flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                        border: '1px solid rgba(196,164,74,0.45)',
                        color: 'var(--gold-warm)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10.5, fontWeight: 600, marginTop: 1,
                      }}>
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ul>
                <a
                  href={path.cta.href}
                  style={{
                    marginTop: 'auto', alignSelf: 'flex-start',
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    height: 40, padding: '0 20px', borderRadius: 9999,
                    background: 'var(--gold)', color: '#fff',
                    fontFamily: 'var(--font-dm-sans)', fontWeight: 600, fontSize: 13,
                    textDecoration: 'none',
                  }}
                >
                  {path.cta.text} <ArrowRight size={15} />
                </a>
              </div>
            )
            return (
              <>
                {/* Desktop: two equal columns. No connecting rule here, it would
                    read as a sequence and these are alternatives. */}
                <div className="hide-mobile" style={{ marginBottom: 48 }}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 20, maxWidth: 860, margin: '0 auto',
                  }}>
                    {paths.map((p, i) => pathCard(p, i))}
                  </div>
                </div>
                {/* Mobile: carousel with arrows */}
                <div className="hide-desktop" style={{ marginBottom: 0 }}>
                  <StepCarousel steps={paths} renderCard={pathCard} />
                </div>
              </>
            )
          })()}

          {/* Bottom trust line (desktop only) */}
          <div className="hide-mobile" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, flexWrap: 'wrap',
          }}>
            {[
              { icon: <Users size={14} color="var(--gold-warm)" />, text: 'Jamaican drivers and hosts' },
              { icon: <MapPin size={14} color="var(--gold-warm)" />, text: 'Private door-to-door transport' },
              { icon: <ShieldCheck size={14} color="var(--gold-warm)" />, text: 'Flexible cancellation within 48 hrs of booking' },
            ].map((t) => (
              <span key={t.text} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                fontSize: 12, fontFamily: 'var(--font-dm-sans)', color: 'rgba(255,255,255,0.7)', fontWeight: 500,
              }}>
                {t.icon} {t.text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ DESTINATIONS ═══ */}
      <DestinationsSection />

      {/* ═══ TRENDING NOW, viral experiences ═══ */}
      <section className="section-y reveal" style={{ background: 'var(--bg-dark)' }}>
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <TrendingUp size={16} color="var(--gold-warm)" />
            <span style={{
              fontFamily: 'var(--font-dm-sans)', fontWeight: 600,
              fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--gold-warm)',
            }}>
              {t('Trending Now')}
            </span>
          </div>
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
            fontSize: 'var(--fs-h2)', color: 'white',
            lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 36,
          }}>
            Viral experiences you&apos;ve seen everywhere.
            <br />
            <span style={{ color: '#cccccc' }}>Now book them.</span>
          </p>

          {/* Large featured viral card + grid */}
          <div className="grid-trending">
            {/* Hero viral card, large */}
            {viralExperiences[0] && (
              <a href={`/experience/${slugify(viralExperiences[0].title)}`} className="photo-card" style={{
                gridRow: 'span 2', aspectRatio: 'auto',
                display: 'flex', alignItems: 'flex-end', padding: 24,
                minHeight: 420,
              }}>
                <Image src={viralExperiences[0].image} alt={viralExperiences[0].title} fill sizes="(max-width:768px) 100vw, 40vw" style={{ objectFit: 'cover' }} />
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(0deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)',
                  pointerEvents: 'none',
                }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 9999,
                    background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)',
                    fontSize: 12, fontWeight: 600, color: 'white',
                    fontFamily: 'var(--font-dm-sans)', marginBottom: 10,
                  }}>
                    <TrendingUp size={12} /> Most booked
                  </span>
                  <h3 style={{
                    fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 22,
                    color: 'white', lineHeight: 1.2, marginBottom: 6,
                  }}>
                    {t(viralExperiences[0].title)}
                  </h3>
                  <p style={{
                    fontSize: 13, color: '#cccccc', fontFamily: 'var(--font-dm-sans)',
                    lineHeight: 1.45, marginBottom: 10, maxWidth: 360,
                  }}>
                    {t(viralExperiences[0].description)}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 18, color: 'white' }}>
                      {formatPrice(viralExperiences[0].price)}
                    </span>
                    <span style={{ fontSize: 12, color: '#cccccc', fontFamily: 'var(--font-dm-sans)' }}>
                      {priceUnitLabel(viralExperiences[0].pricing)} · {viralExperiences[0].duration}
                    </span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      fontSize: 12, fontWeight: 600, color: 'var(--gold-warm)',
                      fontFamily: 'var(--font-dm-sans)',
                    }}>
                      {viralExperiences[0].reviews > 0 ? <><Star size={12} fill="currentColor" strokeWidth={0} /> {viralExperiences[0].rating}</> : 'New'}
                    </span>
                  </div>
                </div>
              </a>
            )}

            {/* Remaining viral cards, smaller grid */}
            {viralExperiences.slice(1).map((exp) => (
              <a key={exp.id} href={`/experience/${slugify(exp.title)}`} className="photo-card" style={{
                display: 'flex', alignItems: 'flex-end', padding: 16,
                minHeight: 196,
              }}>
                <Image src={exp.image} alt={exp.title} fill sizes="(max-width:768px) 100vw, 25vw" style={{ objectFit: 'cover' }} />
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(0deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)',
                  pointerEvents: 'none',
                }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <h3 style={{
                    fontFamily: 'var(--font-dm-sans)', fontWeight: 600, fontSize: 14,
                    color: 'white', lineHeight: 1.25, marginBottom: 5,
                  }}>
                    {t(exp.title)}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'white', fontFamily: 'var(--font-dm-sans)' }}>
                      {formatPrice(exp.price)}
                    </span>
                    <span style={{ fontSize: 12, color: '#cccccc', fontFamily: 'var(--font-dm-sans)' }}>
                      · {exp.duration}
                    </span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 2,
                      fontSize: 12, fontWeight: 600, color: 'var(--gold-warm)',
                      fontFamily: 'var(--font-dm-sans)',
                    }}>
                      {exp.reviews > 0 ? <><Star size={10} fill="currentColor" strokeWidth={0} /> {exp.rating}</> : 'New'}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PACKAGES, ready-made days ═══ */}
      <PackagesSection />

      {/* ═══ TASTE OF JAMAICA, dark scrollable food section ═══ */}
      <FoodSection />

      {/* ═══ ALL EXPERIENCES, 5 col, load more ═══ */}
      <AllExperiencesSection />

      {/* ═══ THE MAPL Tours DIFFERENCE ═══ */}
      <section style={{ marginTop: 80, background: 'var(--bg-dark)', position: 'relative', overflow: 'hidden' }}>
        <div className="mapl-diff">
          {/* Left: Large image with gradient overlay */}
          <div className="mapl-diff-image">
            <Image
              src={CULTURE_IMAGE}
              alt="Jamaica culture"
              fill sizes="45vw"
              style={{ objectFit: 'cover', objectPosition: 'right center' }}
            />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to right, transparent 0%, transparent 50%, var(--bg-dark) 100%)',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(0deg, var(--bg-dark) 0%, transparent 30%)',
              pointerEvents: 'none',
            }} />
          </div>

          {/* Right: Content */}
          <div className="mapl-diff-content" style={{ flex: 1, padding: '80px 64px 80px 32px' }}>
            <h2 style={{
              fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
              fontSize: 'var(--fs-h2)',
              color: 'white', lineHeight: 1.12, letterSpacing: '-0.02em',
              marginBottom: 4,
            }}>
              {t('The authenticity of local culture.')}
            </h2>
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
              fontSize: 'var(--fs-h2)',
              color: 'var(--text-on-dark-3)', lineHeight: 1.12, letterSpacing: '-0.02em',
              marginBottom: 48,
            }}>
              {t('The comfort of a private driver.')}
            </p>

            <div className="grid-features">
              {[
                { icon: <Award size={18} />, title: 'Private, not pooled', desc: 'Your party, your driver, your vehicle. Nobody else in the car, and no meeting point to find.' },
                { icon: <Users size={18} />, title: 'Jamaican drivers and hosts', desc: 'The people who run your day live here and drive these roads every week. You get their name before pickup.' },
                { icon: <Headphones size={18} />, title: 'A person on email', desc: 'Write to us any time and a person replies within 24 hours. On the day, your driver is a WhatsApp away.' },
                { icon: <ShieldCheck size={18} />, title: 'Flexible cancellation', desc: 'Change of plans? Cancel within 48 hours of booking for a refund, less a 20% administration charge. No stress.' },
                { icon: <Star size={18} />, title: 'One price per vehicle', desc: 'Tours and transfers are priced for your party, not per person, with nothing added at checkout.' },
                { icon: <Heart size={18} />, title: 'Paid to the people who drive it', desc: 'Every trip you book is driven and hosted by Jamaicans, and they are paid for every one.' },
              ].map((item) => (
                <div key={item.title}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 'var(--r-md)',
                    background: 'rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 14, color: '#cccccc',
                  }}>
                    {item.icon}
                  </div>
                  <h3 style={{
                    fontFamily: 'var(--font-dm-sans)', fontWeight: 600,
                    fontSize: 14, color: 'white', marginBottom: 6,
                  }}>
                    {t(item.title)}
                  </h3>
                  <p style={{
                    fontSize: 13, color: 'var(--text-on-dark-2)',
                    fontFamily: 'var(--font-dm-sans)', lineHeight: 1.55,
                  }}>
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <Footer />
    </div>
  )
}
