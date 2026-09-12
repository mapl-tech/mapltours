'use client'

import { useRef, useEffect, useState, memo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Experience, slugify, priceUnitLabel } from '@/lib/experiences'
import { displayHandle } from '@/lib/creator'
import { useI18n } from '@/lib/i18n'
import SaveButton from './SaveButton'
import { useCartStore } from '@/lib/cart'
import { useHydrated } from '@/lib/use-hydrated'
import { useTourFit } from '@/lib/use-tour-fit'
import { Plus, Check, Star, MapPin, Clock, Play, TrendingUp } from 'lucide-react'

/**
 * `active` lets a parent that owns horizontal position (a carousel) say which
 * card is the one being looked at. Left undefined, the card decides for itself
 * from its own visibility, which is what every stacked caller wants and what
 * this component has always done.
 *
 * It exists because visibility alone is the wrong question in a rail. The
 * observer below fires on ANY intersection, so the snapped card and the sliver
 * of its neighbour are both "visible" and would both mount a video. These loops
 * run 15-41MB apiece (one is encoded at 22.9 Mbps), so two at once is tens of
 * megabytes of someone's mobile data for a card half off screen.
 *
 * `badge` replaces the category pill for a card that has something truer to say
 * about itself, e.g. "Most booked".
 */
export default memo(function MobileShort({
  exp,
  priority = false,
  active,
  badge,
}: {
  exp: Experience
  priority?: boolean
  active?: boolean
  badge?: string
}) {
  const { addItem, removeItem, isInCart } = useCartStore()
  const { t, formatPrice } = useI18n()
  const hydrated = useHydrated()
  const inCart = hydrated && isInCart(exp.id)
  // A day's tours have to be drivable between each other, so a tour on the
  // far side of the island cannot join this cart. Refused here with the
  // reason rather than swallowed by the store.
  const tourFit = useTourFit(exp)
  const blocked = !inCart && !tourFit.allowed
  const toggleCart = () => {
    if (inCart) removeItem(exp.id)
    else if (tourFit.allowed) addItem(exp)
  }

  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [videoMounted, setVideoMounted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  // Mirrors isVisible synchronously. The observer pauses an off-screen video,
  // which fires a 'pause' event that the keep-playing handler below would
  // otherwise answer by restarting a card nobody is looking at. React state
  // updates too late to prevent that; this ref does not.
  const visibleRef = useRef(false)
  // Whether this device asks for less motion. Read once, on the client.
  const [allowMotion, setAllowMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setAllowMotion(!mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Undefined means "nobody is driving me", which is every stacked caller.
  const videoAllowed = active !== false

  // Losing active unmounts the <video> below, and an unmounted video never
  // fires 'pause', so the poster has to be brought back by hand. Without this
  // the card keeps a transparent poster over an element that no longer exists.
  useEffect(() => {
    if (!videoAllowed) setIsPlaying(false)
  }, [videoAllowed])

  // Intersection Observer, generous rootMargin for early video loading
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting
        visibleRef.current = visible
        setIsVisible(visible)

        if (visible) {
          setVideoMounted(true)
        } else {
          // Pause and reset when off-screen
          if (videoRef.current) {
            videoRef.current.pause()
            setIsPlaying(false)
          }
        }
      },
      { threshold: 0, rootMargin: '200px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /**
   * Keep the visible card playing, and keep trying.
   *
   * Mobile browsers refuse autoplay for reasons that are not errors and do not
   * resolve on a timer, so a fixed chain of retries gives up while the video is
   * still perfectly playable. The ones that actually happen in the wild:
   *
   *   - iOS Low Power Mode blocks autoplay outright until the visitor touches
   *     the page. No delay defeats it; only a gesture does, which is why this
   *     listens for the first one.
   *   - The media is not buffered yet, so the early attempt rejects and the
   *     later 'canplay' is the real starting gun.
   *   - The tab was backgrounded, and iOS silently paused everything.
   *   - The OS paused playback for a call or another app taking audio focus.
   *
   * So rather than attempt N times and stop, every one of those becomes a
   * trigger to try again, and a video that is already playing is left alone.
   * The previous version also latched a playAttempted flag BEFORE calling
   * play(), which meant one rejection retired the card for good.
   *
   * A visitor who asks for reduced motion keeps the still photograph: that is
   * what the setting means, and the card is designed to read well either way.
   */
  useEffect(() => {
    if (!isVisible || !videoMounted || !allowMotion || !videoAllowed) return
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []

    const onPlaying = () => setIsPlaying(true)
    video.addEventListener('playing', onPlaying)

    const tryPlay = () => {
      if (cancelled || !visibleRef.current) return
      const v = videoRef.current
      if (!v || !v.paused) return
      // Muted is what makes autoplay permissible at all on iOS and Android.
      v.muted = true
      v.play().then(() => { if (!cancelled) setIsPlaying(true) }).catch(() => {})
    }

    // Something paused a card that is still on screen. Resume it.
    const onPause = () => {
      if (!cancelled && visibleRef.current) tryPlay()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tryPlay()
    }

    tryPlay()
    video.addEventListener('loadeddata', tryPlay)
    video.addEventListener('canplay', tryPlay)
    video.addEventListener('pause', onPause)
    document.addEventListener('visibilitychange', onVisibilityChange)
    // The gesture unlock. Passive and non-capturing: this only ever calls
    // play() on an already-muted video, so it cannot interfere with taps.
    document.addEventListener('pointerdown', tryPlay, { passive: true })
    document.addEventListener('touchstart', tryPlay, { passive: true })
    // A few nudges for slow media, on top of the event-driven attempts.
    for (const delay of [150, 600, 1500]) timers.push(setTimeout(tryPlay, delay))

    return () => {
      cancelled = true
      for (const t of timers) clearTimeout(t)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('loadeddata', tryPlay)
      video.removeEventListener('canplay', tryPlay)
      video.removeEventListener('pause', onPause)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      document.removeEventListener('pointerdown', tryPlay)
      document.removeEventListener('touchstart', tryPlay)
    }
  }, [isVisible, videoMounted, allowMotion, videoAllowed])

  return (
    <div ref={containerRef}>
      {/* Buttons must not nest inside the card link (invalid interactive
          nesting, and the link's name becomes the whole card text). The
          link is a stretched overlay under the buttons; its name is the
          title alone. */}
      <div style={{
          position: 'relative',
          aspectRatio: '9 / 16',
          borderRadius: 'var(--r-2xl)',
          overflow: 'hidden',
          background: '#000',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          willChange: 'transform',
          transform: 'translateZ(0)',
        }}>
          {/* Static image, shows until video plays */}
          <Image
            src={exp.image}
            alt={exp.title}
            fill
            sizes="100vw"
            quality={75}
            {...(priority
              ? { priority: true, fetchPriority: 'high' as const }
              : { loading: 'lazy' as const })}
            style={{
              objectFit: 'cover',
              opacity: isPlaying ? 0 : 1,
              transition: 'opacity 0.3s ease',
            }}
          />

          {/* Video, mounts when near viewport, plays when visible. Tours
              without footage simply keep showing their photo. */}
          {videoMounted && exp.video && videoAllowed && (
            <video
              ref={videoRef}
              src={exp.video}
              muted
              /* autoPlay is gated on allowMotion rather than always-on. It was
                 removed entirely once because a bare attribute let the browser
                 start playback on its own, straight past the reduced-motion
                 guard in the effect above, making that guard dead code. Tying
                 the attribute to the same flag keeps the guard honest AND lets
                 the browser's own autoplay machinery start the video, which
                 succeeds on some mobile builds before any script runs. The
                 effect then handles every case where it does not. */
              {...(allowMotion ? { autoPlay: true } : {})}
              loop
              playsInline
              preload={isVisible ? 'auto' : 'metadata'}
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover',
                opacity: isPlaying ? 1 : 0,
                transition: 'opacity 0.3s ease',
                willChange: 'opacity',
              }}
            />
          )}

          {/* Top gradient */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 80,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 100%)',
            pointerEvents: 'none',
          }} />

          <Link
            href={`/experience/${slugify(exp.title)}`}
            aria-label={t(exp.title)}
            style={{ position: 'absolute', inset: 0, zIndex: 1 }}
          />

          {/* Bottom gradient */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%',
            background: 'linear-gradient(0deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.72) 45%, rgba(0,0,0,0.35) 72%, transparent 100%)',
            pointerEvents: 'none',
          }} />

          {/* Play icon, only shows when video is NOT playing */}
          {!isPlaying && (
            <div style={{
              position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)',
              width: 44, height: 44, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <Play size={18} fill="white" strokeWidth={0} />
            </div>
          )}

          {/* Category badge top-left, or whatever the caller gave instead. One
              pill only: two stacked here would collide with the save and add
              buttons on the opposite corner at 86vw. */}
          <span style={{
            position: 'absolute', top: 12, left: 12, zIndex: 2,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 9999,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)',
            fontSize: 12, fontWeight: 600, color: '#fff', pointerEvents: 'none',
            fontFamily: 'var(--font-dm-sans)', textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {badge ? <><TrendingUp size={12} /> {t(badge)}</> : t(exp.category)}
          </span>

          {/* Save for later, matching the add button it sits beside. */}
          <div style={{ position: 'absolute', top: 12, right: 64, zIndex: 3 }}>
            <SaveButton experienceId={exp.id} title={exp.title} variant="dark" size={44} />
          </div>

          {/* Add button top-right */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleCart() }}
            disabled={blocked}
            title={tourFit.reason ?? undefined}
            aria-label={
              inCart
                ? `Remove ${exp.title} from your trip`
                : blocked
                  ? `${exp.title} is too far from the day you are building`
                  : `Add ${exp.title} to your trip`
            }
            style={{
              position: 'absolute', top: 12, right: 12, zIndex: 3,
              width: 44, height: 44, borderRadius: '50%',
              background: inCart ? 'var(--emerald)' : blocked ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.4)',
              opacity: blocked ? 0.65 : 1,
              backdropFilter: 'blur(8px)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff',
            }}
          >
            {inCart ? <Check size={17} strokeWidth={2.5} /> : <Plus size={17} strokeWidth={2} />}
          </button>

          {/* Bottom info: pointer-transparent so taps on text open the
              link below; only the CTA re-enables pointer events. */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '0 16px 18px', zIndex: 2, pointerEvents: 'none',
          }}>
            <p style={{
              fontSize: 12, fontWeight: 600, color: '#fff',
              fontFamily: 'var(--font-dm-sans)', marginBottom: 6,
              letterSpacing: '0.02em',
            }}>
              @{displayHandle(exp.creator)}
            </p>

            <h3 style={{
              fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
              fontSize: 17, color: 'white', lineHeight: 1.2,
              letterSpacing: '-0.01em',
              marginBottom: 10,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {t(exp.title)}
            </h3>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 12, color: '#fff', fontFamily: 'var(--font-dm-sans)',
              fontWeight: 500,
              marginBottom: 14,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={12} /> {exp.destination}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={12} /> {exp.duration}
              </span>
              {exp.reviews > 0 ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Star size={12} fill="var(--gold-warm)" strokeWidth={0} /> {exp.rating}
                </span>
              ) : (
                <span style={{
                  padding: '1px 8px', borderRadius: 9999,
                  background: 'rgba(255,255,255,0.18)', color: '#fff',
                  fontSize: 12, fontWeight: 600,
                }}>{t('New')}</span>
              )}
            </div>

            <div style={{
              display: 'flex', alignItems: 'center',
              gap: 12, marginTop: 4,
            }}>
              <span style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 500,
                fontSize: 13, color: '#fff',
              }}>{t('From')}</span>
              <span style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
                fontSize: 22, color: 'white', letterSpacing: '-0.02em',
              }}>
                {formatPrice(exp.price)}
              </span>
              <span style={{ fontSize: 13, color: '#fff', fontFamily: 'var(--font-dm-sans)' }}>{priceUnitLabel(exp.pricing)}</span>
            </div>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleCart() }}
            disabled={blocked}
            title={tourFit.reason ?? undefined}
              style={{
                pointerEvents: 'auto',
                width: '100%', marginTop: 10,
                padding: '12px 0', borderRadius: 14,
                background: inCart ? 'var(--emerald)' : blocked ? 'rgba(255,255,255,0.22)' : 'white',
                color: inCart ? 'white' : blocked ? 'rgba(255,255,255,0.7)' : '#000',
                fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
                border: 'none', cursor: blocked ? 'not-allowed' : 'pointer',
                textAlign: 'center',
              }}
            >
              {inCart ? t('✓ Added') : blocked ? t('Another day') : t('Add to Trip')}
            </button>
          </div>
        </div>
    </div>
  )
})
