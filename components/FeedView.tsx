'use client'

import Image from 'next/image'
import { experiences, HERO_IMAGE, DESTINATION_IMAGES, slugify } from '@/lib/experiences'
import { CULTURE_IMAGE, HERO_VIDEO } from '@/lib/images'
import ExpCard from './ExpCard'
import MobileShort from './MobileShort'
import Footer from './Footer'
import { useI18n } from '@/lib/i18n'
import PlacesSection, { type LivePlaces } from './PlacesSection'
import { FOOD_PLACES, CULTURE_PLACES } from '@/lib/places'
import { useRef, useState, useEffect } from 'react'
import { Award, Users, Headphones, ShieldCheck, Star, Heart, UtensilsCrossed, TrendingUp, ChevronLeft, ChevronRight, MapPin, PlaneLanding, Route, ArrowRight, Landmark } from 'lucide-react'


/* Hero video, lazy loads on fast connections, shows poster on slow/mobile data */
function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [shouldLoad, setShouldLoad] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
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
const viralExperiences = experiences.filter((e) => e.id >= 11 && e.id <= 15)

const destinations = [
  { name: 'Negril', parish: 'Westmoreland' },
  { name: 'Blue Mountains', parish: 'St. Andrew' },
  { name: 'Kingston', parish: 'Kingston' },
  { name: 'Portland', parish: 'Portland' },
  { name: 'Ocho Rios', parish: 'St. Ann' },
  { name: 'Treasure Beach', parish: 'St. Elizabeth' },
]

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
        <button onClick={() => scroll('left')} aria-label="Previous option" style={{
          width: 36, height: 36, borderRadius: '50%', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.5)', transition: 'all 0.15s ease',
        }}>
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => scroll('right')} aria-label="Next option" style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--gold)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', transition: 'all 0.15s ease',
        }}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div ref={scrollRef} className="no-scrollbar" tabIndex={0} role="region" aria-label="Ways to book, scroll options" style={{
        display: 'flex', gap: 12, overflowX: 'auto',
        scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
        paddingLeft: 16, paddingRight: 16,
      }}>
        {steps.map((s, i) => renderCard(s, i))}
      </div>
    </div>
  )
}


function DestinationsSection() {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({ left: dir === 'left' ? -220 : 220, behavior: 'smooth' })
  }

  const destCard = (d: { name: string; parish: string }) => (
    <a key={d.name} href="/explore" className="photo-card" style={{
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
    <section style={{ paddingTop: 40, paddingBottom: 0 }}>
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
  const visible = experiences.slice(0, visibleCount)
  const hasMore = visibleCount < experiences.length
  const remaining = experiences.length - visibleCount

  return (
    <section className="container" style={{ paddingTop: 48, paddingBottom: 0 }}>
      <SectionHeader label="All experiences" />
      {/* Desktop: cards */}
      <div className="hide-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
        {visible.map((e) => <ExpCard key={e.id} exp={e} />)}
      </div>
      {/* Mobile: shorts, 1 col */}
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

export default function FeedView({ livePlaces = {} }: { livePlaces?: LivePlaces }) {
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
          background: 'linear-gradient(0deg, rgba(8,8,6,0.93) 0%, rgba(8,8,6,0.78) 22%, rgba(8,8,6,0.55) 45%, rgba(8,8,6,0.26) 68%, transparent 100%)',
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
            fontSize: 16.5,
            color: 'rgba(255,255,255,0.82)',
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 500,
            marginTop: 18,
            maxWidth: 480,
            lineHeight: 1.55,
            textShadow: '0 1px 6px rgba(0,0,0,0.4)',
          }}>
            {t('Discover Jamaica beyond the resort. Curated experiences from the people who know Jamaica best.')}
          </p>

          {/* Two doors, above the fold. Visitors arrive needing one of exactly
              two things, a ride from the airport or a day out, and previously
              the hero offered neither, so the distinction only appeared far
              down the page. The note below removes the one real ambiguity:
              whether a tour needs a transfer booked alongside it. */}
          <div className="animate-fade-up stagger-3" style={{
            display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 26,
          }}>
            <a href="/explore" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              height: 48, padding: '0 24px', borderRadius: 9999,
              background: 'var(--gold)', color: '#fff',
              fontFamily: 'var(--font-dm-sans)', fontWeight: 600, fontSize: 14.5,
              textDecoration: 'none', boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
            }}>
              Browse tours &amp; experiences <ArrowRight size={16} />
            </a>
            <a href="/transfers" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              height: 48, padding: '0 24px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.12)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.35)',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              fontFamily: 'var(--font-dm-sans)', fontWeight: 600, fontSize: 14.5,
              textDecoration: 'none',
            }}>
              Book an airport transfer <ArrowRight size={16} />
            </a>
          </div>
          <p className="animate-fade-up stagger-4" style={{
            fontSize: 13, color: 'rgba(255,255,255,0.9)',
            fontFamily: 'var(--font-dm-sans)', marginTop: 14, maxWidth: 520,
            lineHeight: 1.5,
            // Sits over the brightest part of the footage, above the bottom
            // scrim, so it needs a heavier shadow than the headline.
            textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 2px 12px rgba(0,0,0,0.7)',
          }}>
            Tours already include private transport to and from your hotel.
            Airport pickups and dropoffs are booked separately.
          </p>
        </div>
      </section>

      {/* ═══ CONCIERGE PROMISE ═══ */}
      <section style={{ background: 'var(--bg-dark)', paddingTop: 72, paddingBottom: 72 }}>
        <div className="container" style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Headline */}
          <div data-reveal style={{ textAlign: 'center', marginBottom: 52 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
              textTransform: 'uppercase', letterSpacing: '0.14em',
              color: 'var(--gold-warm)', marginBottom: 16, display: 'block',
            }}>
              The MAPL TOURS Experience
            </span>
            <h2 style={{
              fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
              fontSize: 'clamp(1.65rem, 3.5vw, 2.4rem)',
              letterSpacing: '-0.025em', lineHeight: 1.1,
              marginBottom: 14, color: '#fff',
            }}>
              Two ways to travel with MAPL TOURS.
            </h2>
            <p className="concierge-body" style={{
              fontSize: 15.5, color: '#cccccc',
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
                    fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
                    letterSpacing: '0.16em', textTransform: 'uppercase',
                    color: 'var(--gold-warm)',
                  }}>
                    {path.kicker}
                  </span>
                </div>
                <h4 style={{
                  fontFamily: 'var(--font-dm-sans)', fontWeight: 600, fontSize: 20,
                  marginBottom: 10, lineHeight: 1.22, letterSpacing: '-0.01em', color: '#fff',
                }}>
                  {path.title}
                </h4>
                <p style={{
                  fontSize: 13.5, color: 'rgba(255,255,255,0.72)',
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
              { icon: <Users size={14} color="var(--gold-warm)" />, text: 'Personal local guides' },
              { icon: <MapPin size={14} color="var(--gold-warm)" />, text: 'Private door-to-door transport' },
              { icon: <ShieldCheck size={14} color="var(--gold-warm)" />, text: 'Flexible cancellation within 48 hrs of booking' },
            ].map((t) => (
              <span key={t.text} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                fontSize: 12.5, fontFamily: 'var(--font-dm-sans)', color: 'rgba(255,255,255,0.7)', fontWeight: 500,
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
      <section className="container" style={{ paddingTop: 48, paddingBottom: 0 }}>
        <SectionHeader label="Featured experiences" action={{ text: 'View all', href: '/explore' }} />
        <ResponsiveGrid items={experiences.slice(0, 3)} cols={3} priorityFirst />
      </section>

      {/* ═══ TASTE OF JAMAICA, dark scrollable food section ═══ */}
      {/* Real restaurants. Added to the itinerary for routing; paid at the
          venue, never through MAPL TOURS. */}
      <PlacesSection
        eyebrow="Eat like a local"
        eyebrowIcon={<UtensilsCrossed size={15} color="var(--gold-warm)" />}
        title="Where Jamaicans actually eat"
        intro="Real restaurants and jerk pits across St. James, Trelawny, St. Ann, St. Mary, Westmoreland and Hanover. Add the ones you want, tell us how long you need, and your driver builds the day around them."
        places={FOOD_PLACES}
        live={livePlaces}
        tone="dark"
      />

      {/* Real cultural sites, same model. */}
      <PlacesSection
        eyebrow="Culture & heritage"
        eyebrowIcon={<Landmark size={15} color="var(--gold-text)" />}
        title="The island's own history"
        intro="Great houses, caves, waterfalls and the towns they sit in — the places that explain Jamaica rather than package it. Entry is paid on arrival; we handle getting you there."
        places={CULTURE_PLACES}
        live={livePlaces}
        tone="light"
      />

      {/* ═══ CURATED FOR YOU ═══ */}
      <section className="container" style={{ paddingTop: 48, paddingBottom: 0 }}>
        <SectionHeader label="Curated for you" />
        <ResponsiveGrid items={experiences.slice(0, 6)} cols={6} />
      </section>

      {/* ═══ MORE EXPERIENCES ═══ */}
      <section className="container" style={{ paddingTop: 48, paddingBottom: 0 }}>
        <SectionHeader label="More experiences" action={{ text: 'Explore all', href: '/explore' }} />
        <ResponsiveGrid items={experiences.slice(4)} cols={5} />
      </section>

      {/* ═══ TRENDING NOW, viral experiences ═══ */}
      <section style={{ marginTop: 56, background: 'var(--bg-dark)', padding: '64px 0 72px' }}>
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
            fontSize: 'clamp(1.5rem, 2.5vw, 2rem)', color: 'white',
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
                    <TrendingUp size={11} /> {viralExperiences[0].reviews.toLocaleString()} reviews
                  </span>
                  <h3 style={{
                    fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 22,
                    color: 'white', lineHeight: 1.2, marginBottom: 6,
                  }}>
                    {t(viralExperiences[0].title)}
                  </h3>
                  <p style={{
                    fontSize: 13.5, color: '#cccccc', fontFamily: 'var(--font-dm-sans)',
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
                      <Star size={11} fill="currentColor" strokeWidth={0} /> {viralExperiences[0].rating}
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

      {/* ═══ THE MAPL TOURS DIFFERENCE ═══ */}
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
              fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
              color: 'white', lineHeight: 1.12, letterSpacing: '-0.02em',
              marginBottom: 4,
            }}>
              {t('The authenticity of local culture.')}
            </h2>
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
              fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
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
                { icon: <ShieldCheck size={18} />, title: 'Flexible cancellation', desc: 'Change of plans? Cancel within 48 hours of booking for a refund, less a 20% administration charge. No stress.' },
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
                    fontSize: 14.5, color: 'white', marginBottom: 6,
                  }}>
                    {t(item.title)}
                  </h4>
                  <p style={{
                    fontSize: 13.5, color: 'var(--text-on-dark-2)',
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
