'use client'

import Image from 'next/image'
import { experiences, HERO_IMAGE, DESTINATION_IMAGES, slugify } from '@/lib/experiences'
import { CULTURE_IMAGE, HERO_VIDEO } from '@/lib/images'
import ExpCard from './ExpCard'
import MobileShort from './MobileShort'
import LanguageSwitcher from './LanguageSwitcher'
import { useI18n } from '@/lib/i18n'
import { useRef, useState } from 'react'
import { Leaf, Award, Users, Headphones, ShieldCheck, Star, Heart, UtensilsCrossed, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react'

const foodExperiences = experiences.filter((e) => e.category === 'Food')

/* Responsive grid: cards on desktop, shorts on mobile */
function ResponsiveGrid({ items, cols = 3 }: { items: typeof experiences; cols?: number }) {
  return (
    <>
      {/* Desktop: card grid */}
      <div className="hide-mobile" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>
        {items.map((e) => <ExpCard key={e.id} exp={e} />)}
      </div>
      {/* Mobile: 2-col shorts */}
      <div className="hide-desktop mobile-shorts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {items.map((e) => <MobileShort key={e.id} exp={e} />)}
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


function FoodSection() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { t, formatPrice } = useI18n()

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    const amount = 340
    scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  return (
    <section style={{ marginTop: 56, background: 'var(--bg-dark)', padding: '56px 0 64px' }}>
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
              fontFamily: 'var(--font-syne)', fontWeight: 700,
              fontSize: 'clamp(1.5rem, 2.5vw, 2rem)',
              color: 'white', lineHeight: 1.15, letterSpacing: '-0.02em',
            }}>
              {t('A Taste of Jamaica')}
            </h2>
            <p style={{
              fontSize: 14.5, color: '#cccccc',
              fontFamily: 'var(--font-dm-sans)', marginTop: 8,
              maxWidth: 440,
            }}>
              From the smoky jerk pits of Boston Bay to Kingston&apos;s buzzing patty shops - every bite is a cultural experience.
            </p>
          </div>

          {/* Arrows */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginBottom: 4 }}>
            <button
              onClick={() => scroll('left')}
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
        style={{
          display: 'flex', gap: 16,
          overflowX: 'auto',
          paddingTop: 28,
          paddingLeft: 'max(16px, calc((100vw - 1832px) / 2 + 48px))',
          paddingRight: 16,
        }}
      >
        {foodExperiences.map((exp) => (
          <a
            key={exp.id}
            href={`/experience/${slugify(exp.title)}`}
            style={{
              flex: '0 0 310px', display: 'block',
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
                src={exp.image}
                alt={exp.title}
                fill sizes="(max-width:768px) 85vw, 310px"
                style={{ objectFit: 'cover', transition: 'transform 0.4s ease' }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(0deg, rgba(0,0,0,0.4) 0%, transparent 50%)',
                pointerEvents: 'none',
              }} />
              {/* Rating */}
              <span style={{
                position: 'absolute', top: 12, right: 12,
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '3px 8px', borderRadius: 9999,
                background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
                fontSize: 11.5, fontWeight: 600, color: '#fff',
                fontFamily: 'var(--font-dm-sans)',
              }}>
                <Star size={10} fill="var(--gold-warm)" strokeWidth={0} /> {exp.rating}
              </span>
              {/* Location */}
              <span style={{
                position: 'absolute', bottom: 12, left: 12,
                fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.85)',
                fontFamily: 'var(--font-dm-sans)',
              }}>
                {exp.destination}, {exp.parish}
              </span>
            </div>

            {/* Info */}
            <div style={{ padding: '16px 18px 18px' }}>
              <h3 style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 600,
                fontSize: 14.5, color: 'white', lineHeight: 1.3,
                marginBottom: 6,
              }}>
                {exp.title}
              </h3>
              <p style={{
                fontSize: 12.5, color: '#cccccc',
                fontFamily: 'var(--font-dm-sans)', lineHeight: 1.45,
                marginBottom: 12,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {exp.description}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
                  fontSize: 16, color: 'white',
                }}>
                  {formatPrice(exp.price)}
                  <span style={{ fontWeight: 400, color: '#cccccc', fontSize: 12, marginLeft: 3 }}>
                    /person
                  </span>
                </span>
                <span style={{ fontSize: 12, color: '#cccccc', fontFamily: 'var(--font-dm-sans)' }}>
                  {exp.duration}
                </span>
              </div>
            </div>
          </a>
        ))}
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
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'transparent', border: '1px solid var(--border-strong)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-secondary)', transition: 'all 0.15s ease',
                }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => scroll('right')}
                style={{
                  width: 36, height: 36, borderRadius: '50%',
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
                <span style={{ color: '#fff', fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 18, display: 'block', letterSpacing: '-0.01em' }}>
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

export default function FeedView() {
  const { t, formatPrice } = useI18n()
  return (
    <div>
      {/* ═══ HERO — 16/4 desktop, 1/1 mobile ═══ */}
      <section className="hero-section">
        {/* Video background */}
        <video
          autoPlay muted loop playsInline
          poster={HERO_IMAGE}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center 35%',
          }}
        >
          <source src={HERO_VIDEO} type="video/mp4" />
        </video>
        {/* Top scrim for nav readability */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140, background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 100%)', pointerEvents: 'none' }} />
        {/* Strong bottom black gradient — text must be readable */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '100%',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.6) 35%, rgba(0,0,0,0.2) 65%, transparent 100%)',
          pointerEvents: 'none',
        }} />
        <div className="container" style={{ position: 'relative', zIndex: 1, paddingBottom: 40 }}>
          <h1 style={{
            fontFamily: 'var(--font-syne)',
            fontWeight: 700,
            fontSize: 'clamp(2.25rem, 4.5vw, 3.25rem)',
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            color: 'white',
          }}>
            {t('Discover')} <span className="flag-text">Jamaica</span><br />{t('beyond the resort.')}
          </h1>
          <p style={{
            fontSize: 15,
            color: '#cccccc',
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 500,
            marginTop: 12,
          }}>
            {t('Authentic cultural experiences crafted by locals who know the island best.')}
          </p>
        </div>
      </section>

      {/* ═══ DESTINATIONS ═══ */}
      <DestinationsSection />

      {/* ═══ FEATURED — 3 col, wide ═══ */}
      <section className="container" style={{ paddingTop: 48, paddingBottom: 0 }}>
        <SectionHeader label="Featured experiences" action={{ text: 'View all', href: '/explore' }} />
        <ResponsiveGrid items={experiences.slice(0, 3)} cols={3} />
      </section>

      {/* ═══ TASTE OF JAMAICA — dark scrollable food section ═══ */}
      <FoodSection />

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

      {/* ═══ TRENDING NOW — viral experiences ═══ */}
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
            fontFamily: 'var(--font-syne)', fontWeight: 700,
            fontSize: 'clamp(1.5rem, 2.5vw, 2rem)', color: 'white',
            lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 36,
          }}>
            Viral experiences you&apos;ve seen everywhere.
            <br />
            <span style={{ color: '#cccccc' }}>Now book them.</span>
          </p>

          {/* Large featured viral card + grid */}
          <div className="grid-trending">
            {/* Hero viral card — large */}
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
                    fontSize: 11, fontWeight: 600, color: 'white',
                    fontFamily: 'var(--font-dm-sans)', marginBottom: 10,
                  }}>
                    <TrendingUp size={11} /> {viralExperiences[0].reviews.toLocaleString()} reviews
                  </span>
                  <h3 style={{
                    fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 22,
                    color: 'white', lineHeight: 1.2, marginBottom: 6,
                  }}>
                    {viralExperiences[0].title}
                  </h3>
                  <p style={{
                    fontSize: 13.5, color: '#cccccc', fontFamily: 'var(--font-dm-sans)',
                    lineHeight: 1.45, marginBottom: 10, maxWidth: 360,
                  }}>
                    {viralExperiences[0].description}
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

            {/* Remaining viral cards — smaller grid */}
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
                    {exp.title}
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'white', fontFamily: 'var(--font-dm-sans)' }}>
                      {formatPrice(exp.price)}
                    </span>
                    <span style={{ fontSize: 11, color: '#cccccc', fontFamily: 'var(--font-dm-sans)' }}>
                      · {exp.duration}
                    </span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 2,
                      fontSize: 11, fontWeight: 600, color: 'var(--gold-warm)',
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

      {/* ═══ ALL EXPERIENCES — 5 col, load more ═══ */}
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
              fontFamily: 'var(--font-syne)', fontWeight: 700,
              fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
              color: 'white', lineHeight: 1.12, letterSpacing: '-0.02em',
              marginBottom: 4,
            }}>
              {t('The authenticity of local culture.')}
            </h2>
            <p style={{
              fontFamily: 'var(--font-syne)', fontWeight: 700,
              fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
              color: 'var(--text-on-dark-3)', lineHeight: 1.12, letterSpacing: '-0.02em',
              marginBottom: 48,
            }}>
              {t('The comfort of a curated trip.')}
            </p>

            <div className="grid-features">
              {[
                { icon: <Award size={18} />, title: 'Only the best experiences', desc: 'Every adventure is vetted. We reject 80% of submissions to keep quality uncompromising.' },
                { icon: <Users size={18} />, title: 'Real local creators', desc: 'Not tour guides — your Jamaican cousin who knows everywhere worth going.' },
                { icon: <Headphones size={18} />, title: '24/7 trip support', desc: 'Text us anytime. We handle logistics so you just show up and enjoy.' },
                { icon: <ShieldCheck size={18} />, title: 'Free cancellation', desc: 'Change of plans? Cancel within 48 hours for a full refund. No questions.' },
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

      {/* ═══ FOOTER — dark, editorial ═══ */}
      <footer style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border-on-dark)', padding: '56px 0 32px' }}>
        <div className="container">
          {/* Logo + tagline — centered on mobile */}
          <div className="footer-brand" style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Leaf size={20} strokeWidth={2.5} color="#fff" />
              </div>
              <div style={{ lineHeight: 1 }}>
                <span style={{
                  fontFamily: 'var(--font-syne)', fontWeight: 800,
                  fontSize: 18, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'white',
                  display: 'block',
                }}>
                  MAPL
                </span>
                <span style={{
                  fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
                  fontSize: 11, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: '#cccccc',
                  marginTop: 2, display: 'block',
                }}>
                  Tours Jamaica
                </span>
              </div>
            </div>
            <p style={{
              fontSize: 14, color: 'var(--text-on-dark-2)',
              fontFamily: 'var(--font-dm-sans)', lineHeight: 1.65, maxWidth: 300,
            }}>
              Discover Jamaica beyond the resort. Curated experiences from the people who know Jamaica best.
            </p>
          </div>

          {/* Language switcher */}
          <div style={{ paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid var(--border-on-dark)' }}>
            <LanguageSwitcher variant="footer" />
          </div>

          {/* TripAdvisor badge — centered on mobile */}
          <div className="footer-trust" style={{
            paddingBottom: 36, marginBottom: 36,
            borderBottom: '1px solid var(--border-on-dark)',
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 10.5, color: 'var(--text-on-dark-3)', fontFamily: 'var(--font-dm-sans)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Recommended on
            </span>
            <a href="https://www.tripadvisor.com" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.8 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="12" fill="#34E0A1" />
                <circle cx="8.5" cy="13" r="2.5" stroke="white" strokeWidth="1.5" fill="none" />
                <circle cx="15.5" cy="13" r="2.5" stroke="white" strokeWidth="1.5" fill="none" />
                <path d="M12 7C9.5 7 7.5 8 6 9.5M12 7C14.5 7 16.5 8 18 9.5M12 7V5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="8.5" cy="13" r="0.8" fill="white" />
                <circle cx="15.5" cy="13" r="0.8" fill="white" />
              </svg>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 15, color: 'white' }}>Tripadvisor</span>
            </a>
            <span style={{
              padding: '5px 12px', borderRadius: 9999,
              background: 'rgba(52,224,161,0.12)',
              border: '1px solid rgba(52,224,161,0.2)',
              fontSize: 11.5, fontWeight: 600, color: '#34E0A1',
              fontFamily: 'var(--font-dm-sans)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Star size={10} fill="#34E0A1" strokeWidth={0} /> 4.9 Excellent
            </span>
          </div>

          {/* Link columns */}
          <div className="grid-footer" style={{
            paddingBottom: 36, borderBottom: '1px solid var(--border-on-dark)',
          }}>
            {[
              { title: 'Company', links: ['About', 'Careers', 'Press', 'Blog'] },
              { title: 'Resources', links: ['Help Center', 'Safety', 'Accessibility', 'Gift Cards'] },
              { title: 'Destinations', links: ['Negril', 'Kingston', 'Portland', 'Ocho Rios', 'Blue Mountains'] },
              { title: 'Connect', links: ['Instagram', 'Twitter', 'TikTok', 'YouTube'] },
            ].map((col) => (
              <div key={col.title}>
                <p style={{
                  fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
                  color: 'white', marginBottom: 14, textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  {col.title}
                </p>
                {col.links.map((l) => (
                  <p key={l} style={{
                    fontSize: 14, color: 'var(--text-on-dark-2)',
                    fontFamily: 'var(--font-dm-sans)', marginBottom: 12,
                    cursor: 'pointer', transition: 'color 0.15s ease',
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'white' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-on-dark-2)' }}
                  >{l}</p>
                ))}
              </div>
            ))}
          </div>

          {/* Bottom bar — stacks on mobile */}
          <div className="footer-bottom" style={{
            paddingTop: 20,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 12.5, color: 'var(--text-on-dark-3)',
            fontFamily: 'var(--font-dm-sans)', flexWrap: 'wrap', gap: 16,
          }}>
            <p>© 2025 MAPL Tours. All rights reserved. A <a href="https://www.mapltech.com" target="_blank" rel="noopener noreferrer" style={{ color: 'white', fontWeight: 600 }}>MAPL TECH</a> company.</p>
            <div className="footer-legal" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {['Privacy Policy', 'Terms of Service', 'Cookie Preferences'].map((t) => (
                <span key={t} style={{ cursor: 'pointer', transition: 'color 0.15s ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-on-dark-2)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-on-dark-3)' }}
                >{t}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
