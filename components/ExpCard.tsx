'use client'

import { useEffect, useRef, useState, memo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Experience, CATEGORY_COLORS, slugify , priceUnitLabel, cardVideo, placeLabel } from '@/lib/experiences'
import { displayHandle } from '@/lib/creator'
import { useCartStore } from '@/lib/cart'
import { useHydrated } from '@/lib/use-hydrated'
import { Plus, Check, Play, MapPin, Star } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import SaveButton from './SaveButton'
import { useTourFit } from '@/lib/use-tour-fit'
import { addTourToTrip } from '@/lib/add-to-trip'
import { useCtaSwap } from '@/lib/use-cta-swap'

export default memo(function ExpCard({ exp }: { exp: Experience }) {
  const isInCart = useCartStore((s) => s.isInCart)
  useCartStore((s) => s.items)
  const { t, formatPrice } = useI18n()
  const hydrated = useHydrated()
  // Cart-derived markup must render the SSR (empty-cart) state during the
  // hydration pass, see useHydrated.
  const inCart = hydrated && isInCart(exp.id)
  // A day's tours have to be drivable between each other, so a tour on the
  // far side of the island cannot join the day in the cart: the button then
  // books it in that day's place (lib/add-to-trip, with an Undo), and says so
  // on the card, instead of a grey button that did nothing.
  const tourFit = useTourFit(exp)
  const blocked = !inCart && !tourFit.allowed
  const cta = useCtaSwap(inCart)
  const add = () => { addTourToTrip(exp, tourFit, { placement: 'page', checkout: true, onUndo: cta.afterUndo }) }
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [hovering, setHovering] = useState(false)
  // The clip element exists only once a pointer has been over the card. The
  // desktop grid is in the phone DOM too (hidden), so without this a phone
  // carried 15 idle <video> elements it could never show.
  const [everHovered, setEverHovered] = useState(false)
  // The photo stays up until the clip is actually moving. It used to fade on
  // mouseenter, before a frame existed, so any wait showed a blank card.
  const [clipPlaying, setClipPlaying] = useState(false)

  const handleMouseEnter = () => {
    setHovering(true)
    setEverHovered(true)
  }

  const handleMouseLeave = () => {
    setHovering(false)
  }

  // Play and pause after the commit, so the first hover, which is also the
  // render that creates the element, finds it. The src is set here rather
  // than as a prop because leaving can take it away again.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !exp.video) return
    if (hovering) {
      const clip = cardVideo(exp.video)
      if (v.getAttribute('src') !== clip) v.src = clip
      v.currentTime = 0
      v.play().catch(() => {})
    } else {
      v.pause()
      setClipPlaying(false)
      // A paused clip goes on downloading. A pointer crossing the grid left
      // three or four doing so, and they took 90% of the line from the card
      // it stopped on (measured Oct 4 2026). Unless the whole clip is in
      // already, drop it once the photo has faded back over it (0.3s):
      // emptied at once, the card showed white through the fade. A hover
      // back within that time cancels it and the clip carries on.
      const b = v.buffered
      const whole = v.duration > 0 && b.length > 0 && b.end(b.length - 1) >= v.duration - 0.1
      if (!whole && v.getAttribute('src')) {
        const drop = window.setTimeout(() => {
          v.removeAttribute('src')
          v.load()
        }, 350)
        return () => window.clearTimeout(drop)
      }
    }
  }, [hovering, everHovered, exp.video])

  return (
    <article className="exp-card" style={{ cursor: 'pointer' }}>
      {/* Photo / Video area. The add button must not nest inside the card
          link, so the link is a stretched overlay under it. */}
        <div
          className="photo-card"
          style={{ aspectRatio: '4/3', marginBottom: 10 }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Static image (always present) */}
          <Image
            src={exp.image}
            alt={exp.title}
            fill
            sizes="(max-width:768px) 100vw, 33vw"
            quality={75}
            loading="lazy"
            style={{
              objectFit: 'cover',
              opacity: hovering && (clipPlaying || !!exp.youtubeId) ? 0 : 1,
              transition: 'opacity 0.3s ease',
            }}
          />

          {/* Video (loads on hover) */}
          {exp.youtubeId && hovering ? (
            <iframe
              src={`https://www.youtube.com/embed/${exp.youtubeId}?autoplay=1&mute=1&loop=1&controls=0&showinfo=0&modestbranding=1&playlist=${exp.youtubeId}`}
              allow="autoplay"
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                border: 'none',
                opacity: hovering ? 1 : 0,
                transition: 'opacity 0.3s ease',
                pointerEvents: 'none',
              }}
            />
          ) : everHovered ? (
          <video
            ref={videoRef}
            muted
            loop
            playsInline
            preload="auto"
            onPlaying={(e) => { if (!e.currentTarget.paused) setClipPlaying(true) }}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: hovering && clipPlaying ? 1 : 0,
              transition: 'opacity 0.3s ease',
            }}
          />
          ) : null}

          <div className="overlay-bottom" />

          <Link
            href={`/experience/${slugify(exp.title)}`}
            aria-label={t(exp.title)}
            className="media-fill-link"
            style={{ position: 'absolute', inset: 0, zIndex: 2 }}
          />

          {/* Play indicator on hover */}
          {hovering && (
            <div style={{
              position: 'absolute', top: 12, left: 12, zIndex: 3,
              pointerEvents: 'none',
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 9999,
              background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
              fontSize: 12, fontWeight: 600, color: '#fff',
              fontFamily: 'var(--font-dm-sans)',
            }}>
              <Play size={10} fill="#fff" strokeWidth={0} />
              Preview
            </div>
          )}

          {/* Save for later. Sits beside add-to-trip because they are the two
              things you can want from a card you are not ready to book. */}
          <div style={{ position: 'absolute', top: 12, right: 56, zIndex: 3 }}>
            <SaveButton experienceId={exp.id} title={exp.title} />
          </div>

          {/* Add, or once added the way to checkout. Same 46px hit area as
              the save heart beside it; both sit 12px in from the card edge,
              so the expanded area is not clipped by .photo-card's overflow. */}
          {inCart ? (
            <Link
              ref={cta.ref}
              href="/checkout"
              className="tap-target"
              aria-label={`${exp.title} is in your trip. Go to checkout`}
              title="In your trip. Go to checkout"
              style={{
                position: 'absolute', top: 12, right: 12, zIndex: 3,
                width: 36, height: 36, borderRadius: '50%',
                background: 'var(--emerald)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              }}
            >
              <Check size={15} strokeWidth={2.5} />
            </Link>
          ) : (
            <button
              ref={cta.ref}
              className="tap-target"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); cta.press(e.currentTarget); add() }}
              title={blocked ? 'Book this in place of the day in your trip' : undefined}
              aria-label={blocked ? `Book ${exp.title} in place of the day in your trip` : `Add ${exp.title} to your trip`}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
              style={{
                position: 'absolute', top: 12, right: 12, zIndex: 3,
                width: 36, height: 36, borderRadius: '50%',
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                transition: 'all 0.2s ease',
              }}
            >
              <Plus size={15} strokeWidth={2.5} />
            </button>
          )}

          {/* What the add does for a tour that cannot join the day, on the
              card rather than in a tooltip. */}
          {blocked && (
            <span style={{
              position: 'absolute', top: 12, left: 12, zIndex: 3, pointerEvents: 'none',
              padding: '4px 10px', borderRadius: 9999,
              background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(8px)',
              fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.92)',
              fontFamily: 'var(--font-dm-sans)',
            }}>
              {t('Replaces your day')}
            </span>
          )}

          {/* Location */}
          <span style={{
            position: 'absolute', bottom: 12, left: 12, zIndex: 3, pointerEvents: 'none',
            fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.92)',
            fontFamily: 'var(--font-dm-sans)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <MapPin size={12} strokeWidth={2} />
            {placeLabel(exp)}
          </span>
        </div>

      {/* Info */}
      <Link href={`/experience/${slugify(exp.title)}`} style={{ display: 'block', padding: '2px 8px 10px' }}>
        <span style={{
          fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
          color: CATEGORY_COLORS[exp.category], fontFamily: 'var(--font-dm-sans)',
        }}>
          {t(exp.category)}
        </span>
        <h3 style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 600, fontSize: 17, lineHeight: 1.2, letterSpacing: '-0.01em', marginTop: 3 }}>
          {t(exp.title)}
        </h3>
        {exp.reviews > 0 ? (
          <span style={{ fontSize: 13, fontFamily: 'var(--font-dm-sans)', fontWeight: 500, marginTop: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
            <Star size={13} fill="currentColor" strokeWidth={0} /> {exp.rating}
          </span>
        ) : (
          <span style={{
            fontSize: 12, fontFamily: 'var(--font-dm-sans)', fontWeight: 700, marginTop: 4,
            display: 'inline-flex', alignSelf: 'flex-start', padding: '2px 8px', borderRadius: 9999,
            background: 'var(--gold-dim, rgba(196,164,74,0.15))', color: 'var(--gold-text, #6E5A1C)',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>{'New'}</span>
        )}
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 3 }}>
          {exp.duration} · @{displayHandle(exp.creator)}
        </p>
        <p style={{ fontSize: 13, fontFamily: 'var(--font-dm-sans)', fontWeight: 600, marginTop: 4 }}>
          {`${t('From')} ${formatPrice(exp.price)}`}
          {/* Whole strings, not "From", " ", "$351": Chrome drops a space that
              stands alone as a text node from the link's name. */}
          <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 12 }}>{` ${priceUnitLabel(exp.pricing)}`}</span>
        </p>
      </Link>
    </article>
  )
})
