'use client'

import { useRef, useEffect, useState, memo } from 'react'
import InView from './InView'
import Image from 'next/image'
import Link from 'next/link'
import { Experience, slugify, priceUnitLabel, mobileVideo, mobileHevcVideo, videoPoster, HEVC_SOURCE_TYPE } from '@/lib/experiences'
import { displayHandle } from '@/lib/creator'
import { useI18n } from '@/lib/i18n'
import SaveButton from './SaveButton'
import { useCartStore } from '@/lib/cart'
import { useHydrated } from '@/lib/use-hydrated'
import { useTourFit } from '@/lib/use-tour-fit'
import { useCtaSwap } from '@/lib/use-cta-swap'
import { addTourToTrip } from '@/lib/add-to-trip'
import { swapReason } from '@/lib/reel-feed'
import { Check, Star, MapPin, Clock, Play, TrendingUp } from 'lucide-react'

// The rail sets the clip as the element's src (a <source> child with
// preload stalled WebKit at readyState 0, see the hero), so the codec is
// chosen here: the HEVC twin (about half the bytes) where the browser plays
// it, the H.264 file otherwise. Only ever called once a video mounts, on the
// client.
let hevcSupport: boolean | null = null
function clipFor(video: string): string {
  if (hevcSupport === null) {
    try {
      hevcSupport = document.createElement('video').canPlayType(HEVC_SOURCE_TYPE) !== ''
    } catch {
      hevcSupport = false
    }
  }
  return hevcSupport ? mobileHevcVideo(video) : mobileVideo(video)
}

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
  const isInCart = useCartStore((s) => s.isInCart)
  useCartStore((s) => s.items)
  const { t, formatPrice } = useI18n()
  const hydrated = useHydrated()
  const inCart = hydrated && isInCart(exp.id)
  // A day's tours have to be drivable between each other, so a tour on the
  // far side of the island cannot join the day in the cart. The button then
  // books it in that day's place, with an Undo in the notice, instead of a
  // grey "Another day" that did nothing.
  const tourFit = useTourFit(exp)
  const blocked = !inCart && !tourFit.allowed
  // Focus follows the button into its "Added · Checkout" link and back on
  // Undo (lib/use-cta-swap); it used to fall to the page.
  const cta = useCtaSwap(inCart)
  const add = () => { addTourToTrip(exp, tourFit, { placement: 'page', checkout: true, onUndo: cta.afterUndo }) }

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
          // Off screen (past the 200px margin): pause, then unmount, so a
          // card that scrolled by does not keep its clip open and buffering.
          // It mounts again, from its poster, when it comes back.
          if (videoRef.current) {
            videoRef.current.pause()
            setIsPlaying(false)
          }
          setVideoMounted(false)
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
    <div ref={containerRef} className="on-media">
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
          {/* Static image, shows until video plays: the clip's own first
              frame when there is a clip, so nothing jumps when it starts. */}
<InView>          <Image
            src={exp.video ? videoPoster(exp.video) : exp.image}
            alt={exp.title}
            fill
            sizes="(max-width: 767px) 86vw, 20vw"
            quality={75}
            {...(priority
              ? { priority: true, fetchPriority: 'high' as const }
              : { loading: 'lazy' as const })}
            style={{
              objectFit: 'cover',
              opacity: isPlaying ? 0 : 1,
              transition: 'opacity 0.3s ease',
            }}
          /></InView>

          {/* Video, mounts when near viewport, plays when visible. Tours
              without footage simply keep showing their photo. */}
          {videoMounted && exp.video && videoAllowed && (
            <video
              ref={videoRef}
              src={clipFor(exp.video)}
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
            className="media-fill-link"
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

          {/* Save for later, top-right. The card has ONE add, the button at
              the bottom: a second "+" up here did the same job. */}
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 3 }}>
            <SaveButton experienceId={exp.id} title={exp.title} variant="dark" size={44} />
          </div>

          {/* Bottom info: pointer-transparent so taps on text open the
              link below; only the CTA re-enables pointer events. */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '0 16px 18px', zIndex: 2, pointerEvents: 'none',
          }}>
            <p style={{
              fontSize: 13, fontWeight: 600, color: '#fff',
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
              fontSize: 13, color: '#fff', fontFamily: 'var(--font-dm-sans)',
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
              <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', fontFamily: 'var(--font-dm-sans)' }}>{priceUnitLabel(exp.pricing)}</span>
            </div>
            {/* Every state leads somewhere: added, it is the way to checkout
                (it used to turn green and leave no visible way on); a tour
                that cannot join the day books in that day's place. */}
            {inCart ? (
              <Link
                ref={cta.ref}
                href="/checkout"
                aria-label={`${t('Added')} · ${t('Checkout')}: ${exp.title} is in your trip`}
                style={{
                  pointerEvents: 'auto',
                  width: '100%', marginTop: 10, minHeight: 48,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 14, background: 'var(--emerald)', color: 'white',
                  fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
                  textDecoration: 'none',
                }}
              >
                <Check size={16} strokeWidth={3} aria-hidden /> {t('Added')} · {t('Checkout')}
              </Link>
            ) : (
              <button
                ref={cta.ref}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); cta.press(e.currentTarget); add() }}
                aria-label={`${blocked ? t('Book this instead') : t('Add to Trip')}: ${exp.title}`}
                aria-describedby={blocked ? `rail-swap-${exp.id}` : undefined}
                style={{
                  pointerEvents: 'auto',
                  width: '100%', marginTop: 10, minHeight: 48,
                  borderRadius: 14, background: 'white', color: '#000',
                  fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
                  border: 'none', cursor: 'pointer', textAlign: 'center',
                }}
              >
                {blocked ? t('Book this instead') : t('Add to Trip')}
              </button>
            )}
            {blocked && (
              <p id={`rail-swap-${exp.id}`} style={{
                margin: '6px 0 0', fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,0.82)',
                fontFamily: 'var(--font-dm-sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {swapReason(tourFit)}
              </p>
            )}
          </div>
        </div>
    </div>
  )
})
