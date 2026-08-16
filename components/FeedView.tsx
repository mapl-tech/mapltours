'use client'

import Image from 'next/image'
import Link from 'next/link'
import { experiences, singleExperiences, packageExperiences, HERO_IMAGE, DESTINATION_IMAGES, TOUR_DESTINATIONS, slugify } from '@/lib/experiences'
import { EATS } from '@/lib/eats'
import { priceUnitLabel } from '@/lib/experiences'
import { useCartStore } from '@/lib/cart'
import { useHydrated } from '@/lib/use-hydrated'
import { CULTURE_IMAGE, HERO_VIDEO } from '@/lib/images'
import ExpCard from './ExpCard'
import MobileShort from './MobileShort'
import Footer from './Footer'
import { useI18n } from '@/lib/i18n'
import { useRef, useState, useEffect } from 'react'
import { Award, Users, Headphones, ShieldCheck, Star, Heart, UtensilsCrossed, TrendingUp, ChevronLeft, ChevronRight, MapPin } from 'lucide-react'


/* Hero video, lazy loads on fast connections, shows poster on slow/mobile data */
function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [shouldLoad, setShouldLoad] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [paused, setPaused] = useState(false)

  const togglePause = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play().catch(() => {}); setPaused(false) }
    else { v.pause(); setPaused(true) }
  }

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
      {isPlaying && (
        <button
          type="button"
          onClick={togglePause}
          aria-label={paused ? 'Play background video' : 'Pause background video'}
          style={{
            position: 'absolute', right: 18, bottom: 18, zIndex: 3,
            width: 44, height: 44, borderRadius: 9999,
            background: 'rgba(10,10,8,0.62)', border: '1px solid rgba(255,255,255,0.35)',
            color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, lineHeight: 1,
          }}
        >
          {paused ? '\u25B6' : '\u23F8'}
        </button>
      )}
    </>
  )
}

/* Responsive grid: cards on desktop, shorts on mobile */
function ResponsiveGrid({ items, cols = 3, priorityFirst = false }: { items: typeof experiences; cols?: number; priorityFirst?: boolean }) {
  return (
    <>
      {/* Desktop: card grid */}
      <div className="hide-mobile" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>
        {items.map((e) => <ExpCard key={e.id} exp={e} />)}
      </div>
      {/* Mobile: 2-col shorts */}
      <div className="hide-desktop mobile-shorts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {items.map((e, i) => <MobileShort key={e.id} exp={e} priority={priorityFirst && i === 0} />)}
      </div>
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
          color: '#fff', transition: 'all 0.15s ease',
        }}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div ref={scrollRef} className="no-scrollbar" tabIndex={0} role="region" aria-label="How it works, scroll steps" style={{
        display: 'flex', gap: 12, overflowX: 'auto',
        scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
        paddingLeft: 16, paddingRight: 16,
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
  const hydrated = useHydrated()

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
                width: 42, height: 42, borderRadius: '50%',
                background: 'var(--gold)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
              {t('Two or three experiences run back to back, in the right order, driven door to door.')}
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
                  <button
                    onClick={() => (inCart ? removeItem(pkg.id) : addItem(pkg))}
                    aria-pressed={inCart}
                    aria-label={inCart ? `Remove ${pkg.title} from your itinerary` : `Add ${pkg.title} to your itinerary`}
                    style={{
                      width: '100%', minHeight: 44, borderRadius: 9999,
                      background: inCart ? 'var(--emerald)' : 'var(--gold)',
                      color: inCart ? '#fff' : '#1A1508',
                      border: 'none', cursor: 'pointer',
                      fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.08)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.filter = '' }}
                  >
                    {inCart ? t('\u2713 Added') : t('Add this day')}
                  </button>
                  {replaces.length > 0 && !inCart && (
                    <p className="pkg-replaces" style={{ fontSize: 12, color: 'var(--gold-text)', fontFamily: 'var(--font-dm-sans)' }}>
                      {t('Replaces')} {replaces.map((r) => t(r.title)).join(', ')}
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
      <div className="hide-desktop mobile-shorts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
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
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '62%',
          background: 'linear-gradient(0deg, rgba(8,8,6,0.92) 0%, rgba(8,8,6,0.55) 26%, rgba(8,8,6,0.30) 56%, transparent 100%)',
          pointerEvents: 'none',
        }} />
        {/* Constant cinematic veil: a floor of shade over EVERY frame, so a
            blown-white sky can never strip the text of its ground. */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(8,8,6,0.28)',
          pointerEvents: 'none',
        }} />
        <div className="container" style={{ position: 'relative', zIndex: 1, paddingBottom: 'clamp(40px, 6vw, 72px)' }}>
          <div aria-hidden style={{
            position: 'absolute', inset: '-36px -64px', zIndex: -1,
            background: 'rgba(8,8,6,0.60)', borderRadius: 56,
            filter: 'blur(44px)',
            pointerEvents: 'none',
          }} />
          <span className="animate-fade-up" style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            fontFamily: 'var(--font-dm-sans)', fontWeight: 600,
            fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: '#fff', marginBottom: 16,
            textShadow: '0 1px 8px rgba(0,0,0,0.45)',
          }}>
            <span aria-hidden style={{ width: 28, height: 2, background: 'var(--gold-warm)', borderRadius: 1, flexShrink: 0 }} />
            Jamaica, beyond the brochure
          </span>
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
            {t('Authentic cultural experiences crafted by locals who know the island best.')}
          </p>
          {/* The two doors, in selling order: transfers convert today, the
              experiences build the dream. 48px targets, AA on the scrim. */}
          <div className="animate-fade-up stagger-3" style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            <Link
              href="/transfers"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 50, padding: '0 26px', borderRadius: 9999,
                background: 'var(--gold)', color: '#1A1508',
                fontFamily: 'var(--font-dm-sans)', fontSize: 15, fontWeight: 700,
                textDecoration: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
              }}
            >
              Book Your Airport Transfer
            </Link>
            <Link
              href="/explore"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 50, padding: '0 24px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.16)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.5)',
                fontFamily: 'var(--font-dm-sans)', fontSize: 15, fontWeight: 600,
                textDecoration: 'none',
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
            From $19 · Free cancellation until 24 hours before pickup
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
              The MAPL Experience
            </span>
            <h2 style={{
              fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
              fontSize: 'var(--fs-h2)',
              letterSpacing: '-0.025em', lineHeight: 1.1,
              marginBottom: 14, color: '#fff',
            }}>
              Build your perfect day in Jamaica.
            </h2>
            <p className="concierge-body" style={{
              fontSize: 15, color: '#cccccc',
              fontFamily: 'var(--font-dm-sans)', lineHeight: 1.65,
              maxWidth: 460, margin: '0 auto',
            }}>
              Pick the experiences you love. We arrange your private transport, guide, and full itinerary from door to door.
            </p>
          </div>

          {(() => {
            const steps = [
              { icon: <Heart size={18} color="var(--gold-warm)" />, title: 'Tap the experiences that move you', body: 'Browse reels crafted by locals. Add the ones that speak to you, no packages, no fillers.' },
              { icon: <MapPin size={18} color="var(--gold-warm)" />, title: 'Tell us your villa', body: 'Your hotel, villa, or the airport. We plan the route, the guide, and the private transport.' },
              { icon: <ShieldCheck size={18} color="var(--gold-warm)" />, title: 'Show up, we handle the rest', body: 'We pick you up, your guide takes it from there, and we bring you home when it’s done.' },
            ]
            const stepCard = (pillar: typeof steps[0], idx: number) => (
              <div key={pillar.title} data-reveal style={{
                padding: '36px 32px',
                borderRadius: 'var(--r-xl)',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
                textAlign: 'left',
                position: 'relative',
                flex: '0 0 280px',
                scrollSnapAlign: 'start',
                ['--i' as string]: idx,
              } as React.CSSProperties}>
                {/* Oversized editorial step numeral */}
                <span aria-hidden style={{
                  display: 'block',
                  fontFamily: 'var(--font-dm-sans)', fontWeight: 300,
                  fontSize: 64, lineHeight: 1,
                  color: 'var(--gold-warm)', opacity: 0.28,
                  marginBottom: 8,
                }}>
                  {idx + 1}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
                  {pillar.icon}
                  <span style={{
                    fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
                    letterSpacing: '0.16em', textTransform: 'uppercase',
                    color: 'var(--gold-warm)',
                  }}>
                    Step {idx + 1}
                  </span>
                </div>
                <h4 style={{
                  fontFamily: 'var(--font-dm-sans)', fontWeight: 600, fontSize: 19,
                  marginBottom: 9, lineHeight: 1.22, letterSpacing: '-0.01em', color: '#fff',
                }}>
                  {pillar.title}
                </h4>
                <p style={{
                  fontSize: 13, color: 'rgba(255,255,255,0.72)',
                  fontFamily: 'var(--font-dm-sans)', lineHeight: 1.62,
                }}>
                  {pillar.body}
                </p>
              </div>
            )
            return (
              <>
                {/* Desktop: grid with a faint gold connecting rule behind it */}
                <div className="hide-mobile" style={{ position: 'relative', marginBottom: 48 }}>
                  <div aria-hidden style={{
                    position: 'absolute', top: '50%', left: '12%', right: '12%', height: 1,
                    background: 'linear-gradient(90deg, transparent, rgba(196,164,74,0.28) 20%, rgba(196,164,74,0.28) 80%, transparent)',
                  }} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, position: 'relative' }}>
                    {steps.map((s, i) => stepCard(s, i))}
                  </div>
                </div>
                {/* Mobile: carousel with arrows */}
                <div className="hide-desktop" style={{ marginBottom: 0 }}>
                  <StepCarousel steps={steps} renderCard={stepCard} />
                </div>
              </>
            )
          })()}

          {/* Bottom trust line (desktop only) */}
          <div className="hide-mobile" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, flexWrap: 'wrap',
          }}>
            {[
              { icon: <Users size={14} color="var(--gold-warm)" />, text: 'Personal local guides' },
              { icon: <MapPin size={14} color="var(--gold-warm)" />, text: 'Private door-to-door transport' },
              { icon: <ShieldCheck size={14} color="var(--gold-warm)" />, text: 'Free cancellation within 48 hrs' },
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

      {/* ═══ FEATURED, 3 col, wide ═══ */}
      <section className="container section-y reveal">
        <SectionHeader label="Featured experiences" action={{ text: 'View all', href: '/explore' }} />
        <ResponsiveGrid items={singleExperiences.slice(0, 3)} cols={3} priorityFirst />
      </section>

      {/* ═══ TASTE OF JAMAICA, dark scrollable food section ═══ */}
      <FoodSection />

      {/* ═══ PACKAGES, light band, follows the dark food carousel ═══ */}
      <PackagesSection />

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
                    <TrendingUp size={12} /> {viralExperiences[0].reviews.toLocaleString()} reviews
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
                      /person · {viralExperiences[0].duration}
                    </span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      fontSize: 12, fontWeight: 600, color: 'var(--gold-warm)',
                      fontFamily: 'var(--font-dm-sans)',
                    }}>
                      <Star size={12} fill="currentColor" strokeWidth={0} /> {viralExperiences[0].rating}
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
                  <h4 style={{
                    fontFamily: 'var(--font-dm-sans)', fontWeight: 600, fontSize: 14,
                    color: 'white', lineHeight: 1.25, marginBottom: 5,
                  }}>
                    {t(exp.title)}
                  </h4>
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
                      <Star size={10} fill="currentColor" strokeWidth={0} /> {exp.rating}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ALL EXPERIENCES, 5 col, load more ═══ */}
      <AllExperiencesSection />

      {/* ═══ THE MAPL DIFFERENCE ═══ */}
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
              {t('The comfort of a curated trip.')}
            </p>

            <div className="grid-features">
              {[
                { icon: <Award size={18} />, title: 'Only the best experiences', desc: 'Every adventure is vetted. We reject 80% of submissions to keep quality uncompromising.' },
                { icon: <Users size={18} />, title: 'Real local creators', desc: 'Not tour guides, your Jamaican cousin who knows everywhere worth going.' },
                { icon: <Headphones size={18} />, title: '24/7 trip support', desc: 'Text us anytime. We handle logistics so you just show up and enjoy.' },
                { icon: <ShieldCheck size={18} />, title: 'Free cancellation', desc: 'Change of plans? Cancel within 48 hours for a refund, less the payment processing fee. No stress.' },
                { icon: <Star size={18} />, title: '90%+ satisfaction', desc: 'Our guests consistently rate their experiences 4.8 stars or higher.' },
                { icon: <Heart size={18} />, title: 'Supports local economy', desc: 'Every dollar goes directly to Jamaican creators and their communities.' },
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
                  <h4 style={{
                    fontFamily: 'var(--font-dm-sans)', fontWeight: 600,
                    fontSize: 14, color: 'white', marginBottom: 6,
                  }}>
                    {t(item.title)}
                  </h4>
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
