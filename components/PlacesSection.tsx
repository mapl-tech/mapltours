'use client'

import Image from 'next/image'
import { useRef, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, MapPin, Check, Clock, Star } from 'lucide-react'
import { usePlacesCart } from '@/lib/places-cart'
import { formatHours, placeLocation, HOUR_CHOICES, type Place } from '@/lib/places'

/** Live values resolved from Google Places, keyed by place id. */
export interface LivePlaceInfo {
  rating: number | null
  userRatingCount: number | null
  photoUrl: string | null
  photoAttributions: string[]
  googleMapsUri: string | null
}
export type LivePlaces = Record<string, LivePlaceInfo>

/**
 * A horizontal rail of real places (restaurants, or cultural sites) the
 * traveler can add to their itinerary.
 *
 * No price and no fixed duration is shown, by design: MAPL does not sell
 * these. The traveler pays the venue directly, and chooses how long they
 * want there — that time is what the driver and the day's routing need.
 *
 * The location is the headline detail instead, since deciding whether a stop
 * fits the day is a geography question.
 */

export default function PlacesSection({
  eyebrow,
  eyebrowIcon,
  title,
  intro,
  places,
  live = {},
  tone = 'dark',
}: {
  eyebrow: string
  eyebrowIcon: React.ReactNode
  title: string
  intro: string
  places: Place[]
  /** Google-sourced ratings and photos; empty when the API is unconfigured. */
  live?: LivePlaces
  tone?: 'dark' | 'light'
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -340 : 340, behavior: 'smooth' })
  }

  const dark = tone === 'dark'
  const ink = dark ? '#fff' : 'var(--text-primary)'
  const sub = dark ? '#cccccc' : 'var(--text-secondary)'

  return (
    <section style={{
      marginTop: 56,
      background: dark ? 'var(--bg-dark)' : 'var(--bg-warm)',
      padding: '56px 0 64px',
    }}>
      <div className="container">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {eyebrowIcon}
              <span style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 600, fontSize: 12,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: dark ? 'var(--gold-warm)' : 'var(--gold-text)',
              }}>
                {eyebrow}
              </span>
            </div>
            <h2 style={{
              fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
              fontSize: 'clamp(1.5rem, 2.5vw, 2rem)',
              color: ink, lineHeight: 1.15, letterSpacing: '-0.02em',
            }}>
              {title}
            </h2>
            <p style={{
              fontSize: 14.5, color: sub, fontFamily: 'var(--font-dm-sans)',
              marginTop: 8, maxWidth: 520, lineHeight: 1.6,
            }}>
              {intro}
            </p>
          </div>

          <div className="hide-mobile" style={{ display: 'flex', gap: 8, flexShrink: 0, marginBottom: 4 }}>
            {(['left', 'right'] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => scroll(dir)}
                aria-label={dir === 'left' ? 'Previous' : 'Next'}
                style={{
                  width: 42, height: 42, borderRadius: '50%', background: 'transparent',
                  border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'var(--border-strong)'}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: sub, transition: 'all 0.2s ease',
                }}
              >
                {dir === 'left' ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="no-scrollbar"
          tabIndex={0}
          role="region"
          aria-label={`${title}, scroll for more`}
          style={{
            display: 'flex', gap: 14, overflowX: 'auto',
            scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
            paddingBottom: 4,
          }}
        >
          {places.map((p) => <PlaceCard key={p.id} place={p} dark={dark} live={live[p.id]} />)}
        </div>

        <p style={{
          marginTop: 18, fontSize: 12.5, color: dark ? 'rgba(255,255,255,0.6)' : 'var(--text-tertiary)',
          fontFamily: 'var(--font-dm-sans)',
        }}>
          Added to your itinerary so we can route your driver. You pay these
          venues directly — nothing here is charged by MAPL Tours.
          {Object.keys(live).length > 0 && (
            /* Required wherever Google ratings or photos are displayed. */
            <> Ratings and photos powered by Google.</>
          )}
        </p>
      </div>
    </section>
  )
}

function PlaceCard({ place, dark, live }: { place: Place; dark: boolean; live?: LivePlaceInfo }) {
  const { add, remove, setHours, has, hoursFor } = usePlacesCart()

  // The store is rehydrated after mount, so read it only once mounted or SSR
  // and the first client render would disagree.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const added = mounted && has(place.id)
  const hours = mounted ? hoursFor(place.id) : place.suggestedHours

  const cardBg = dark ? 'rgba(255,255,255,0.04)' : '#fff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'var(--border)'
  const ink = dark ? '#fff' : 'var(--text-primary)'
  const sub = dark ? 'rgba(255,255,255,0.68)' : 'var(--text-secondary)'

  return (
    <article style={{
      flex: '0 0 300px', scrollSnapAlign: 'start',
      background: cardBg, border: `1px solid ${cardBorder}`,
      borderRadius: 'var(--r-xl)', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 2', background: dark ? '#1a1917' : 'var(--surface)' }}>
        <Image
          src={live?.photoUrl ?? place.image}
          alt=""
          fill
          sizes="300px"
          style={{ objectFit: 'cover' }}
          unoptimized={Boolean(live?.photoUrl)}
        />
        {/* Google requires the photographer attribution to travel with the
            photo, so it sits on the image itself rather than in a footnote. */}
        {live?.photoUrl && live.photoAttributions.length > 0 && (
          <span style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: '10px 10px 6px',
            background: 'linear-gradient(0deg, rgba(0,0,0,0.6), transparent)',
            color: 'rgba(255,255,255,0.85)', fontSize: 10,
            fontFamily: 'var(--font-dm-sans)',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>
            Photo: {live.photoAttributions[0]}
          </span>
        )}
      </div>

      <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h3 style={{
          fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 16.5,
          color: ink, letterSpacing: '-0.01em', marginBottom: 6,
        }}>
          {place.name}
        </h3>

        {/* The real location, the detail that decides whether a stop fits. */}
        <p style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12.5, color: dark ? 'var(--gold-warm)' : 'var(--gold-text)',
          fontFamily: 'var(--font-dm-sans)', fontWeight: 600, marginBottom: 10,
        }}>
          <MapPin size={13} /> {placeLocation(place)}
        </p>

        <p style={{
          fontSize: 13.5, color: sub, fontFamily: 'var(--font-dm-sans)',
          lineHeight: 1.55, marginBottom: 16, flex: 1,
        }}>
          {place.blurb}
        </p>

        {/* Real ratings only: Google's if resolved, otherwise nothing. */}
        {live?.rating != null && (
          <p style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12.5, color: sub, fontFamily: 'var(--font-dm-sans)', marginBottom: 12,
          }}>
            <Star size={13} fill="var(--gold-warm)" stroke="var(--gold-warm)" />
            <strong style={{ color: ink }}>{live.rating.toFixed(1)}</strong>
            {live.userRatingCount ? `· ${live.userRatingCount.toLocaleString()} Google reviews` : '· Google'}
          </p>
        )}

        {added && (
          <div style={{ marginBottom: 12 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
              color: sub, fontFamily: 'var(--font-dm-sans)', fontWeight: 600, marginBottom: 7,
            }}>
              <Clock size={12} /> How long do you want here?
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {HOUR_CHOICES.map((h) => {
                const on = Math.abs(hours - h) < 0.01
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHours(place.id, h)}
                    aria-pressed={on}
                    style={{
                      padding: '5px 10px', borderRadius: 9999, cursor: 'pointer',
                      fontFamily: 'var(--font-dm-sans)', fontSize: 12, fontWeight: 600,
                      background: on ? (dark ? 'var(--gold)' : 'var(--accent)') : 'transparent',
                      color: on ? '#fff' : sub,
                      border: `1px solid ${on ? 'transparent' : cardBorder}`,
                    }}
                  >
                    {formatHours(h)}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => (added ? remove(place.id) : add(place))}
          style={{
            width: '100%', height: 40, borderRadius: 9999, cursor: 'pointer',
            fontFamily: 'var(--font-dm-sans)', fontWeight: 600, fontSize: 13,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            background: added ? 'transparent' : (dark ? 'var(--gold)' : 'var(--accent)'),
            color: added ? (dark ? 'var(--gold-warm)' : 'var(--accent)') : '#fff',
            border: added ? `1px solid ${dark ? 'var(--gold-warm)' : 'var(--accent)'}` : 'none',
          }}
        >
          {added ? <><Check size={15} /> In your itinerary</> : 'Add to itinerary'}
        </button>
      </div>
    </article>
  )
}
