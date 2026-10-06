'use client'

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { singleExperiences, packageExperiences, Experience, slugify , priceUnitLabel, placeLabel, mobileVideo, mobileHevcVideo, reelPoster, HEVC_SOURCE_TYPE } from '@/lib/experiences'
import { trackViewItem, trackReelDetailsOpen, trackReelCtaTap, trackClipsEvent } from '@/lib/analytics'
import { CLIPS_POST_QUERY } from '@/lib/safe-redirect'
import { useI18n } from '@/lib/i18n'
import { useCartStore, DAILY_HOUR_LIMIT } from '@/lib/cart'
import { orderFeed, closeTarget, swapReason } from '@/lib/reel-feed'
import { addTourToTrip } from '@/lib/add-to-trip'
import { useSeenReels } from '@/lib/seen-reels'
import { useHydrated } from '@/lib/use-hydrated'
import { useTourFit } from '@/lib/use-tour-fit'
import { useCtaSwap } from '@/lib/use-cta-swap'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Heart, MessageCircle, Play, Pause, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, X, ThumbsUp, Send, MapPin, Star, Clock, ShoppingBag, Film, Check, Volume2, VolumeX } from 'lucide-react'
import { useExperienceLike, useComments, DisplayComment } from '@/lib/supabase/hooks'
import { useAuth } from '@/lib/supabase/auth-context'
import Avatar from '@/components/Avatar'
import MaplAvatar from '@/components/MaplAvatar'
import { isMaplCreator, displayHandle, clipCredit, clipsInReelOrder, isMaplAccount } from '@/lib/creator'
import TourDetailsSheet from './TourDetailsSheet'
import { CANCELLATION_SUMMARY } from '@/lib/refund-pricing'
import { useApprovedClips, clipDateLabel, type TourVideo } from '@/lib/tour-videos'
import { useAfterFirstPaint } from '@/lib/use-media-gate'
import { isKeyOrReaderClick } from '@/lib/press'

declare global {
  interface Window {
    /** Set by the Reel's mount effect; the early-tap script checks it. */
    __maplHydrated?: boolean
    /** A tap on .reel-cta caught before React attached, replayed once. */
    __maplEarlyTap?: { slug: string; at: number }
  }
}

// Heavy, only-used-on-demand surfaces, code-split so they never ship with
// the main reel bundle. `ssr: false` because they are all client-interaction
// driven (overlays opened via tap) and never rendered on first paint.
const UserTourVideos = dynamic(() => import('@/components/UserTourVideos'), {
  ssr: false,
  loading: () => null,
})

/** Deterministic Fisher-Yates shuffle seeded by a string, same seed gives
 *  the same order, so the feed doesn't rearrange itself mid-scroll. */
function shuffle<T>(arr: T[], seed: string): T[] {
  let s = 0
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0
  const rand = () => {
    s = (s * 1664525 + 1013904223) | 0
    return ((s >>> 0) % 1_000_000) / 1_000_000
  }
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Clip an included item to about 26 characters without cutting a word: the
 * word that straddles the limit is kept whole, so "Round-trip private
 * transport from your hotel" reads "Round-trip private transport".
 */
function clipFact(text: string, limit = 26): string {
  if (text.length <= limit) return text
  const cut = text.indexOf(' ', limit)
  return cut === -1 ? text : text.slice(0, cut)
}
/** The first two included items on one line for the phone reel. */
function reelFacts(included: string[] | undefined): string | null {
  if (!included || included.length === 0) return null
  return included.slice(0, 2).map((i) => clipFact(i)).join(' · ')
}

/* ── Single Reel (Snapchat style) ── */
/**
 * The next reel starts buffering ahead of the swipe only on a connection that
 * can spare it: not with Save-Data, not on 2G or 3G. Safari has no connection
 * information and is treated as able. Desktop plays the same phone clips
 * (see the effect in Reel), so it buffers ahead too.
 */
function canBufferAhead(): boolean {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (!c) return true
  return !c.saveData && !['slow-2g', '2g', '3g'].includes(c.effectiveType ?? '4g')
}

/**
 * How far the reel's top controls sit below the top of the page: the phone's
 * own safe area, so they sit near the top in an ordinary browser tab and clear
 * the notch or Dynamic Island wherever the page reaches under it. One state
 * covers the page without reporting an inset: iPhone Safari with its toolbar
 * collapsed draws the status bar over the top of the page (Sept 17 2026,
 * 15adac2). useStatusBarFloor sets --status-floor for that state alone; it
 * used to be a 50 to 60px floor for every phone, which left a gap above the
 * controls in every other browser.
 */
const REEL_INSET = 'max(env(safe-area-inset-top, 0px), var(--status-floor, 0px))'

/** Safari itself on an iPhone: not Chrome, Firefox or an app's built-in browser. */
function isIPhoneSafari(ua: string): boolean {
  return /iPhone|iPod/.test(ua) && /Version\/[\d.]+.*Safari\//.test(ua)
    && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|Instagram|FBAN|FBAV|FB_IAB|Line\/|Twitter|Snapchat|TikTok|musical_ly|Pinterest|LinkedInApp/.test(ua)
}

/** --status-floor: 62px (the tallest iPhone status bar) while Safari's toolbar is collapsed, else 0. */
function useStatusBarFloor() {
  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean }
    if (!isIPhoneSafari(navigator.userAgent) || nav.standalone || window.matchMedia('(display-mode: standalone)').matches) return
    const root = document.documentElement
    // 100svh is the page's height with Safari's toolbars showing; a taller
    // window means they have collapsed. Without svh support the probe
    // measures 0 and the floor always applies, as it did before.
    const probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none'
    document.body.appendChild(probe)
    const update = () => {
      root.style.setProperty('--status-floor', window.innerHeight - probe.offsetHeight > 24 ? '62px' : '0px')
    }
    update()
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      probe.remove()
      root.style.removeProperty('--status-floor')
    }
  }, [])
}

/** Keys that move focus or press a control: a keyboard user's (lastInputKey). */
const NAV_KEYS = new Set(['Tab', 'Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'])

/** A guest's clip of a tour, played as its own reel right after the tour. */
interface ReelClip { video: TourVideo; n: number; of: number }

function Reel({ exp, clip, isActive, near, ahead, advancesAtEnd, clipCount, muted, onMuted, onEnded, canAdvance, onPlayClip, onComments }: {
  exp: Experience
  clip?: ReelClip
  isActive: boolean
  near: boolean
  ahead: boolean
  /** Whether this reel's video, once played through, gives way to the next
   *  reel: a guest clip (but not the feed's last reel), and a tour whose
   *  guest clips follow it. Everything else loops. */
  advancesAtEnd: boolean
  /** This tour's approved guest clips, for the Clips button. */
  clipCount: number
  /** Guest clips have sound; one choice covers all of them (the feed's). */
  muted: boolean
  onMuted: (muted: boolean) => void
  /** A reel that plays to its end moves the feed on (advancesAtEnd). */
  onEnded: () => void
  /** False while the visitor writes or reads on top of the feed (it holds still). */
  canAdvance: () => boolean
  /** A clip picked in the sheet: the feed scrolls to it. */
  onPlayClip: (clipId: string) => void
  onComments: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  // The clip attaches once the page has painted (lib/use-media-gate): in the
  // server HTML it held a phone's first frame back by about two seconds. The
  // poster, the clip's own first frame, shows until then.
  const mediaReady = useAfterFirstPaint()
  const progressRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const isInCart = useCartStore((s) => s.isInCart)
  // Subscribed to items so the button follows the cart when it changes.
  useCartStore((s) => s.items)
  const { t, formatPrice } = useI18n()
  const { liked, likeCount, toggleLike } = useExperienceLike(exp.id, isActive)
  const hydrated = useHydrated()
  const inCart = hydrated && isInCart(exp.id)
  const tourFit = useTourFit(exp)
  const blocked = !inCart && !tourFit.allowed
  const slug = slugify(exp.title)
  const cta = useCtaSwap(inCart)
  // A guest's footage may be landscape: shown whole rather than cropped to a
  // third of its width. Portrait phone footage fills the reel like the tour's.
  const [clipFit, setClipFit] = useState<'cover' | 'contain'>('cover')
  // Who the clip is from: MAPL Tours Jamaica for our own (lib/creator, by
  // account id), otherwise the guest. Ours are never called a guest clip.
  const credit = clip ? clipCredit(clip.video) : null
  const clipBy = credit?.by ?? ''
  const clipKind = credit?.mapl ? 'Clip' : 'Guest clip'
  const clipId = clip?.video.id
  // Read by the play effect without restarting playback when they change.
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const onMutedRef = useRef(onMuted)
  onMutedRef.current = onMuted
  // A beat of feedback where the thumb is: the new "In your trip" pill pops
  // in, and phones that can (Android) give one short tick.
  const [justAdded, setJustAdded] = useState(false)
  const celebrate = () => {
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 700)
    try { navigator.vibrate?.(12) } catch { /* not every phone can */ }
  }
  // Same add as every surface (lib/add-to-trip): into the day, or in that
  // day's place when it cannot join it, with a notice naming the day and an
  // Undo. The notice sits at the top here (the phone bar already offers
  // Checkout). A second tap on an added tour no longer removes it: the pill
  // becomes the way to checkout, and Undo is the way back.
  const addToTrip = (replayed = false) => {
    const result = addTourToTrip(exp, tourFit, {
      placement: 'reel',
      checkout: false,
      replayed,
      onUndo: () => {
        trackReelCtaTap(slug, 'undone')
        cta.afterUndo()
      },
    })
    if (result === 'added') {
      trackReelCtaTap(slug, replayed ? 'replayed' : 'added')
      celebrate()
    } else if (result === 'swapped') {
      trackReelCtaTap(slug, 'swapped', tourFit.reason ?? 'day-fit')
      celebrate()
    } else if (result === 'blocked') {
      trackReelCtaTap(slug, 'blocked', tourFit.reason ?? 'day-fit')
    }
  }
  const openDetails = () => {
    setDetailsFor(exp)
    trackReelDetailsOpen(slug)
  }
  // A tap on Add to Trip between first paint and React attaching is caught by
  // the inline script in app/experience/[slug]/page.tsx and replayed here
  // once, after the cart store has loaded (LayoutShell rehydrates it in a
  // parent effect, which runs AFTER this one, so an add made straight away
  // would be overwritten by the persisted cart).
  //
  // The replay yields to React: a tap that lands after hydrateRoot() but
  // before this effect is hydrated synchronously by React 18 and then
  // dispatched to onClick in the same turn, AFTER the effects. Deciding here,
  // synchronously, added the tour and React's dispatch then removed it. So
  // the check waits a macrotask and adds only if nothing has by then: React's
  // own add, or the persisted cart, makes it a no-op.
  useEffect(() => {
    window.__maplHydrated = true
    document.querySelectorAll('.reel-cta--pressed').forEach((el) => el.classList.remove('reel-cta--pressed'))
    let unsubscribe: (() => void) | undefined
    const replay = () => {
      if (useCartStore.getState().isInCart(exp.id)) return
      addToTrip(true)
    }
    const timer = setTimeout(() => {
      const tap = window.__maplEarlyTap
      if (!tap || tap.slug !== slug || Date.now() - tap.at > 15_000) return
      // Consumed inside the callback, so StrictMode's dev double-mount (which
      // clears the timer of the first mount) still replays once.
      delete window.__maplEarlyTap
      if (useCartStore.persist.hasHydrated()) replay()
      else unsubscribe = useCartStore.persist.onFinishHydration(replay)
    }, 0)
    return () => {
      clearTimeout(timer)
      unsubscribe?.()
    }
    // Mount only: the tap is consumed once and the handler is the mount
    // closure on purpose (inCart is false before hydration, so it adds).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Give the page exactly one <h1>: the active reel's title carries the primary
  // heading; off-screen reels keep <h2> so we never render multiple h1s.
  const TitleTag = isActive ? 'h1' : 'h2'
  const facts = reelFacts(exp.included)
  // The phone line under "Book this instead" has one line of about 286px:
  // how far this tour is from the day, and what booking it does.
  const shortReason = blocked ? swapReason(tourFit) : null
  // A tour's clips show its price row too, so the id carries the clip.
  const swapId = clip ? `swap-${slug}-${clip.video.id}` : `swap-${slug}`
  const [shareToast, setShareToast] = useState<string | null>(null)
  const [detailsFor, setDetailsFor] = useState<Experience | null>(null)
  const [clipsOpen, setClipsOpen] = useState(false)
  // At its end this reel gives way to the next one (a tour to its first guest
  // clip, a clip to the next reel), unless the visitor is writing or reading
  // on top of the feed. Read by the video's own listeners, so always the
  // current answer.
  const advancesRef = useRef<() => boolean>(() => false)
  advancesRef.current = () => isActive && advancesAtEnd && !detailsFor && !clipsOpen && canAdvance()
  // Whether its end goes on playing at all: it moves on, or, while the feed
  // is held, plays again. It never stops on its last frame.
  const continuesRef = useRef<() => boolean>(() => false)
  continuesRef.current = () => isActive && advancesAtEnd
  // Only two things may hold a reel that is on screen paused: the keyboard
  // pause (WCAG 2.2.2) and the clips sheet covering it.
  const keyboardPausedRef = useRef(false)
  const clipsOpenRef = useRef(clipsOpen)
  clipsOpenRef.current = clipsOpen
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive
  const atEnd = (video: HTMLVideoElement) => {
    if (advancesRef.current()) {
      onEnded()
      // A swipe that takes the feed back before the move lands leaves this
      // reel on screen at its end: it plays again instead of freezing on its
      // last frame. Never once the reel is gone: a removed element still
      // plays, sound and all, unseen.
      window.setTimeout(() => {
        if (isActiveRef.current && video.isConnected && video.ended) {
          video.currentTime = 0
          video.play().catch(() => {})
        }
      }, 1200)
    } else if (continuesRef.current()) {
      video.currentTime = 0
      video.play().catch(() => {})
    }
  }
  // ?clips=post: a guest back from signing in to post a clip.
  const [clipsUpload, setClipsUpload] = useState(false)
  const clipParamConsumed = useRef(false)
  // The sheet owns its focus trap and Escape (it stacks an upload sheet).
  const closeClips = useCallback(() => {
    setClipsOpen(false)
    setClipsUpload(false)
  }, [])
  const openClips = () => {
    setClipsOpen(true)
    trackClipsEvent('clips_open', slug)
  }

  // ?clips=post opens the upload sheet on the tour's own reel. (?clip= share
  // links are the feed's: it scrolls to that clip's reel.)
  useEffect(() => {
    if (!isActive || clip || clipParamConsumed.current) return
    clipParamConsumed.current = true
    const params = new URLSearchParams(window.location.search)
    if (`clips=${params.get('clips')}` !== CLIPS_POST_QUERY) return
    setClipsUpload(true)
    setClipsOpen(true)
    const url = new URL(window.location.href)
    url.searchParams.delete('clips')
    window.history.replaceState(window.history.state, '', url.toString())
  }, [isActive, clip])

  // The clips cover the reel: pause it underneath (one moving picture, and
  // no second soundtrack once a clip has sound) and carry on at close, unless
  // the visitor paused it from the keyboard. Also when the sheet opened
  // before the video had loaded (the start waits on clipsOpenRef). Not when
  // the sheet goes because the page did (its Checkout and Sign in links):
  // this cleanup then runs after the reel has left the page, and a removed
  // clip played on unseen, with its sound.
  useEffect(() => {
    const video = videoRef.current
    if (!clipsOpen || !video) return
    video.pause()
    return () => {
      if (isActiveRef.current && video.isConnected && !keyboardPausedRef.current) video.play().catch(() => {})
    }
  }, [clipsOpen])

  // Robust copy-to-clipboard with a fallback for non-secure contexts
  // (navigator.clipboard only exists on HTTPS / localhost).
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch {
      // fall through to legacy path
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.top = '-9999px'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/experience/${slugify(exp.title)}${clip ? `?clip=${clip.video.id}` : ''}`
    const shareData: ShareData = {
      title: exp.title,
      text: clip ? `${credit?.mapl ? 'A clip' : "A guest's clip"} from ${exp.title}, Jamaica` : `${exp.title}, ${exp.destination}, Jamaica`,
      url,
    }
    const showToast = (msg: string) => {
      setShareToast(msg)
      setTimeout(() => setShareToast(null), 2000)
    }

    // Prefer the native share sheet (mobile). canShare is not available on
    // older iOS, fall through if it's missing but share exists.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        if (!navigator.canShare || navigator.canShare(shareData)) {
          await navigator.share(shareData)
          return
        }
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return
        // Share failed for another reason, fall through to clipboard
      }
    }

    const copied = await copyToClipboard(url)
    showToast(copied ? 'Link copied, share the vibes' : 'Couldn’t copy, long-press the link')
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // The UI state mirrors the ELEMENT's real state: audit measured 6 of 7
    // loads sitting paused at t=0 while the UI assumed playing.
    const onPlay = () => setPaused(false)
    // A clip that has ended and is about to give way to the next reel is not
    // "paused": the Play button flashed on it for ~100 ms as it slid away.
    const onPause = () => { if (!(video.ended && continuesRef.current())) setPaused(true) }
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    // A play still waiting for data (loadeddata, canplay, the retry) when
    // this reel stops being the one on screen must never start it: a guest
    // clip swiped past before it loaded played on off screen, with sound.
    // Nor once the reel has left the page (isConnected): React removes it
    // before this effect's cleanup runs.
    let cancelled = false
    let retry: number | undefined
    const tryPlay = () => {
      if (cancelled || clipsOpenRef.current || !video.isConnected) return
      video.play().catch((err: DOMException) => {
        if (cancelled || clipsOpenRef.current || !video.isConnected) return
        if (clipId && err?.name === 'NotAllowedError' && !video.muted) {
          video.muted = true
          onMutedRef.current(true)
          video.play().catch(() => {})
          return
        }
        retry = window.setTimeout(() => { if (!cancelled && !clipsOpenRef.current && video.isConnected) video.play().catch(() => {}) }, 300)
      })
    }
    // Every reel autoplays and keeps playing (owner, Oct 4 2026), reduced
    // motion included (it still makes the feed's moves instant). A browser
    // that refused to start it, as iOS Low Power Mode does until a touch, or
    // that paused it with the tab, is asked again at the next touch and when
    // the tab comes back. A touch on the Play button is left to the button:
    // started here first, its own click then saw a playing reel and paused
    // it again.
    const resume = (e?: Event) => {
      if (cancelled || document.visibilityState === 'hidden' || !video.isConnected) return
      if ((e?.target as Element | null)?.closest?.('.reel-play-toggle')) return
      if (!video.paused || video.ended || keyboardPausedRef.current || clipsOpenRef.current) return
      video.play().catch(() => {})
    }
    const cleanup = () => {
      cancelled = true
      window.clearTimeout(retry)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('loadeddata', tryPlay)
      video.removeEventListener('canplay', tryPlay)
      document.removeEventListener('visibilitychange', resume)
      document.removeEventListener('touchend', resume)
      document.removeEventListener('pointerup', resume)
    }

    if (isActive) {
      keyboardPausedRef.current = false
      document.addEventListener('visibilitychange', resume)
      document.addEventListener('touchend', resume, { passive: true })
      document.addEventListener('pointerup', resume, { passive: true })
      // Tour reels have no sound. A guest clip follows the feed's one sound
      // choice; a phone that refuses sound without a fresh tap plays it
      // muted, and the Sound button says so.
      video.muted = clipId ? mutedRef.current : true
      // Desktop plays the phone clip too. The 480px column shows the same
      // portrait centre crop, and 720x1280 covers it at about 1.3x on a 2x
      // screen, sharper than a phone gets. Desktop used to swap in the
      // original here (up to 57 MB, 18.5 Mbps), which discarded the clip the
      // browser had already started, began every swipe cold and stalled on
      // home broadband (measured Oct 4 2026).
      video.currentTime = 0
      if (video.readyState >= 2) {
        tryPlay()
      } else {
        video.addEventListener('loadeddata', tryPlay, { once: true })
        // Autoplay can also become possible only at canplay; retry there.
        video.addEventListener('canplay', tryPlay, { once: true })
      }
    } else {
      video.pause()
      if (!near) {
        // Far off screen: the <source> children are gone from this render,
        // so load() empties the element and frees its buffer.
        video.removeAttribute('src')
        video.load()
      } else if (ahead && canBufferAhead()) {
        // The next reel buffers now, so the swipe starts it at once instead
        // of on a black frame. The one just left stays loaded too: swiping
        // back used to re-buffer it from nothing.
        video.preload = 'auto'
      }
    }

    return cleanup
  }, [isActive, near, ahead, exp.video, clipId])

  useEffect(() => {
    const video = videoRef.current
    if (clipId && video) video.muted = muted
  }, [clipId, muted])

  // TikTok's thin line: how far into the clip, so a visitor sees it is short
  // and loops. Written straight to the element each frame, not through state.
  useEffect(() => {
    const video = videoRef.current
    const bar = progressRef.current
    if (!isActive || !video || !bar) return
    let raf = 0
    const tick = () => {
      if (video.duration > 0) bar.style.transform = `scaleX(${Math.min(1, video.currentTime / video.duration)})`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      bar.style.transform = 'scaleX(0)'
    }
  }, [isActive])

  const togglePlay = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      keyboardPausedRef.current = false
      videoRef.current.play().catch(() => {})
      setPaused(false)
    } else {
      // Reachable only from a keyboard while the reel plays: it stays paused
      // until played again, never resumed behind the visitor's back.
      keyboardPausedRef.current = true
      videoRef.current.pause()
      setPaused(true)
    }
  }
  // When a pointer last went down on the play button (below).
  const togglePointerAt = useRef(0)
  // A tap or click never pauses (owner, Oct 4 2026): it only starts a reel
  // that is not playing, when the browser refused autoplay.
  const playIfPaused = () => {
    const video = videoRef.current
    if (!video || !video.paused) return
    keyboardPausedRef.current = false
    video.play().catch(() => {})
    setPaused(false)
  }

  return (
    <div
      // A tap anywhere starts a reel that is not playing and never pauses one
      // that is (owner, Oct 4 2026). Keyboard and screen-reader users have a
      // real button (.reel-play-toggle below), which can also pause: a way to
      // stop what moves by itself (WCAG 2.2.2).
      onClick={playIfPaused}
      role="group"
      className="reel-item"
      aria-label={clip ? `${exp.title}, ${clipKind.toLowerCase()} ${clip.n} of ${clip.of} by ${clipBy}` : `${exp.title} reel`}
      // The tour's description stands in for its video, which has no sound
      // and no text of its own; a guest clip is described by its caption, or
      // without one by a line saying whose footage it is.
      aria-describedby={clip ? (clip.video.caption ? `clip-cap-${clip.video.id}` : `clip-desc-${clip.video.id}`) : `reel-desc-${slug}`}
      // Off-screen reels are visually stacked out of view but their buttons
      // and inputs were still in the tab order; inert removes the whole
      // subtree from focus and the accessibility tree until it is active.
      // React 18 passes the attribute through; the prop lands in React 19
      // types, hence the expect-error.
      // @ts-expect-error inert is a valid DOM attribute, typed in React 19
      inert={isActive ? undefined : ''}
      style={{
        height: '100dvh', width: '100%',
        position: 'relative', cursor: paused ? 'pointer' : 'default',
        scrollSnapAlign: 'start', scrollSnapStop: 'always',
        overflow: 'hidden', background: '#000',
      }}
    >
      {/* No visible controls on the playing video, by explicit product
          decision (2026-08-24), and since Oct 4 2026 nothing a pointer does
          pauses it. The play/pause button below shows only while paused or
          when a keyboard puts focus on it, and takes pointer clicks only
          while paused (WCAG 2.2.2, 4.1.2). */}
      {clip ? (
        // A guest's own upload: one file (mp4, mov or webm as posted), its
        // poster the thumbnail made at upload. It plays to its end and the
        // feed moves on; on the feed's last reel it loops instead.
        <video
          ref={videoRef}
          playsInline
          muted={muted}
          loop={!advancesAtEnd}
          preload={isActive ? 'auto' : near ? 'metadata' : 'none'}
          src={near && mediaReady ? clip.video.video_url : undefined}
          poster={near && (isActive || mediaReady) ? clip.video.thumbnail_url ?? undefined : undefined}
          onLoadedMetadata={(e) => setClipFit(e.currentTarget.videoWidth > e.currentTarget.videoHeight ? 'contain' : 'cover')}
          // Under the reel's own sheets, or while a comment is written, it
          // plays again instead of moving on.
          onEnded={(e) => atEnd(e.currentTarget)}
          style={{ width: '100%', height: '100%', objectFit: clipFit, background: '#000' }}
        />
      ) : exp.youtubeId ? (
        <iframe
          src={`https://www.youtube.com/embed/${exp.youtubeId}?autoplay=1&mute=1&loop=1&controls=0&showinfo=0&modestbranding=1&playlist=${exp.youtubeId}&playsinline=1`}
          allow="autoplay; encrypted-media"
          title={`${exp.title}, video`}
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      ) : (
      // The poster is the clip's first frame, or the catalogue image when the
      // clip is stock footage of the activity and not this place (see
      // Experience.genericClip). Only for this reel and its two neighbours,
      // and at phone size through the image optimiser: with the raw
      // catalogue file on all 15 reels a tour page pulled 4 MB of stills
      // before the one on screen got any bandwidth, so on cellular the video
      // sat dark for 20 s. The other reels take a poster as they come within
      // one swipe.
      // Loops, unless guest clips follow it: then it plays once and the first
      // clip takes over (owner, Oct 4 2026).
      <video
        ref={videoRef}
        loop={!advancesAtEnd} muted playsInline
        onEnded={(e) => atEnd(e.currentTarget)}
        preload={isActive ? 'auto' : near ? 'metadata' : 'none'}
        // The neighbours' posters wait for the first paint too: in the server
        // HTML the next reel's still (about 60 KB) loaded before this one painted.
        poster={near && (isActive || mediaReady) ? reelPoster(exp) ?? undefined : undefined}
        style={{ width: '100%', height: '100%', objectFit: 'cover', willChange: 'opacity', background: '#08080A' }}
      >
        {/* The 720x1280 phone clip, never a media attribute: with two
            media-gated sources WebKit on an iPhone profile fetched the 30 MB
            original. Two codecs instead, chosen by type: HEVC (~1.3 Mbps,
            every iPhone and most Android phones) and the H.264 file for any
            browser that cannot play it. Desktop plays the same clip (see
            the effect above). Rendered for this reel and its neighbours; a reel that
            leaves the neighbourhood calls load() with no sources, which
            empties the element and frees the buffer. */}
        {near && mediaReady && exp.video && (
          <>
            <source src={mobileHevcVideo(exp.video)} type={HEVC_SOURCE_TYPE} />
            <source src={mobileVideo(exp.video)} type="video/mp4" />
          </>
        )}
      </video>
      )}

      {/* Paused: the frame dims under the play button. */}
      {paused && (
        <div aria-hidden style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', pointerEvents: 'none',
        }} />
      )}
      {/* Play/pause as a real button: named for what it will do, so its name
          carries the state. Visible while paused (the play glyph the reel
          always showed) or when focused from a keyboard. A pointer reaches it
          only while the reel is paused (globals.css), and its click then only
          plays; any other click is a key or a screen reader's press, which
          may pause. A click is a pointer's when a pointer went down on the
          button while the reel was paused, not by detail alone: NVDA and
          JAWS in Firefox press with detail 1, and Chrome's screen readers
          send a pointerdown of their own, which on a playing reel no pointer
          could have. Dark disc, not the old white one: its white glyph
          measured 1.5:1 over a bright frame. */}
      <button
        type="button"
        className={paused ? 'reel-play-toggle reel-play-toggle--paused' : 'reel-play-toggle'}
        aria-label={paused ? 'Play video' : 'Pause video'}
        onPointerDown={() => { if (videoRef.current?.paused) togglePointerAt.current = Date.now() }}
        onClick={(e) => {
          e.stopPropagation()
          const byPointer = !isKeyOrReaderClick(e) && Date.now() - togglePointerAt.current < 1000
          togglePointerAt.current = 0
          if (byPointer) playIfPaused()
          else togglePlay()
        }}
      >
        {paused
          ? <Play size={24} fill="white" strokeWidth={0} aria-hidden />
          : <Pause size={22} fill="white" strokeWidth={0} aria-hidden />}
      </button>

      {/* ── Playback progress for this clip ──
          Replaces 14 hair-thin position segments that repeated the "1 / 14"
          counter below them. env(): the site opts into viewport-fit=cover,
          so without the inset this line renders under the Dynamic Island. */}
      <div aria-hidden style={{
        position: 'absolute', top: `calc(${REEL_INSET} + 10px)`, left: 16, right: 16, zIndex: 15,
        height: 2.5, borderRadius: 2, overflow: 'hidden', background: 'rgba(255,255,255,0.25)',
      }}>
        <div ref={progressRef} style={{
          height: '100%', width: '100%', background: 'rgba(255,255,255,0.92)',
          transform: 'scaleX(0)', transformOrigin: 'left center',
        }} />
      </div>

      {/* Top gradient */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 140,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* Bottom gradient, stronger for Snapchat readability */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '65%',
        background: 'linear-gradient(0deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 45%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── Right action column (Snapchat style, tight, no labels) ── */}
      {/* Above the bottom info (11 over its 10): that block's soft shade
          reaches under the rail and was dimming its discs and the gold
          "Earn 5%" bubble. The two never share any width. */}
      <div className={clip ? 'reel-right-rail reel-right-rail--clip' : 'reel-right-rail'} style={{
        position: 'absolute', right: 12, zIndex: 11,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      }}>
        {/* Creator avatar, MAPL Tours logo when posted by us, otherwise the
            creator's initial disk (coloured by handle). No follow badge. */}
        <div style={{ marginBottom: 4 }}>
          {clip && !credit?.mapl ? (
            <Avatar
              src={clip.video.uploader_avatar_url}
              name={clipBy.replace(/^@/, '')}
              size={44}
              style={{ boxShadow: '0 0 0 2px #fff' }}
            />
          ) : clip || isMaplCreator(exp.creator) ? (
            <MaplAvatar size={44} border="2px solid white" />
          ) : (
            <Avatar
              name={exp.creator}
              size={44}
              style={{ boxShadow: '0 0 0 2px #fff' }}
            />
          )}
        </div>

        {/* Like */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleLike() }}
          // One name; the state is aria-pressed (two cues disagreed).
          aria-label="Save this tour"
          aria-pressed={liked}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', cursor: 'pointer', color: 'white',
            minWidth: 44, minHeight: 44, padding: 4,
          }}
        >
          <span className="reel-action-disc">
            <Heart size={24} fill={liked ? '#FF4081' : 'none'} color={liked ? '#FF4081' : 'white'} strokeWidth={1.8} />
          </span>
          <span
            // likeCount comes from a localStorage-backed SWR cache that the
            // server can't see, so the SSR HTML may render a smaller number
            // than the client's first paint. Suppress the warning, the
            // client value is the correct one and renders within ms.
            suppressHydrationWarning
            style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-dm-sans)', padding: '1px 8px', borderRadius: 9999, background: 'rgba(0,0,0,0.6)', visibility: exp.reviews + likeCount > 0 ? 'visible' : 'hidden' }}
          >
            {(exp.reviews + likeCount).toLocaleString('en-US')}
          </span>
        </button>

        {/* Comments */}
        <button
          className="reel-rail-comments"
          onClick={(e) => { e.stopPropagation(); onComments() }}
          aria-label="View comments"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', cursor: 'pointer', color: 'white',
            minWidth: 44, minHeight: 44, padding: 4,
          }}
        >
          <span className="reel-action-disc">
            <MessageCircle size={24} strokeWidth={1.8} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-dm-sans)', padding: '1px 8px', borderRadius: 9999, background: 'rgba(0,0,0,0.6)', visibility: exp.comments.length > 0 ? 'visible' : 'hidden' }}>
            {exp.comments.length}
          </span>
        </button>

        {/* Share */}
        <button
          className="reel-rail-send"
          onClick={(e) => { e.stopPropagation(); handleShare() }}
          aria-label={clip ? 'Send this clip' : 'Send this tour'}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', cursor: 'pointer', color: 'white',
            minWidth: 44, minHeight: 44, padding: 4,
          }}
        >
          <span className="reel-action-disc">
            <Send size={22} strokeWidth={1.8} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-dm-sans)', padding: '1px 8px', borderRadius: 9999, background: 'rgba(0,0,0,0.6)' }}>
            Send
          </span>
        </button>

        {/* Sound, guest clips only: the tour's own reels have none. */}
        {clip && (
          <button
            onClick={(e) => { e.stopPropagation(); onMuted(!muted) }}
            // The visible word is the name (WCAG 2.5.3); on or off is
            // aria-pressed and the icon.
            aria-label="Sound"
            aria-pressed={!muted}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'none', border: 'none', cursor: 'pointer', color: 'white',
              minWidth: 44, minHeight: 44, padding: 4,
            }}
          >
            <span className="reel-action-disc">
              {muted ? <VolumeX size={22} strokeWidth={1.8} aria-hidden /> : <Volume2 size={22} strokeWidth={1.8} aria-hidden />}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-dm-sans)', padding: '1px 8px', borderRadius: 9999, background: 'rgba(0,0,0,0.6)' }}>
              Sound
            </span>
          </button>
        )}

        {/* Clips: opens the sheet, every clip of this tour (a tap plays
            it here, in the feed) and the way to post one. The count says how
            many there are; the clips also come up by swiping on. "Earn 5%" is
            the reward for posting them: earned, not taken off, so it never
            reads as 5% off the price beside it ("Save 5%" could; the owner's
            call, Oct 4 2026). Every tap on it lands on the sheet, whose header
            states the terms (5 approved clips, 5% off a next tour), so the
            bubble never promises more than the tap shows. Shown on the reel
            on screen, so it pops in as each one arrives. */}
        <button
          onClick={(e) => { e.stopPropagation(); openClips() }}
          // Starts with the visible words, for speech control (WCAG 2.5.3).
          aria-label={`${clipCount > 0 ? `${clipCount} ${clipCount === 1 ? 'clip' : 'clips'}` : 'Clips'} on this tour. Earn 5%: 5 approved clips from your trip get you 5% off your next tour`}
          aria-haspopup="dialog"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', cursor: 'pointer', color: 'white',
            minWidth: 44, minHeight: 44, padding: 4,
          }}
        >
          <span className="reel-action-disc reel-clips-disc">
            <Film size={22} strokeWidth={1.8} />
            {isActive && <span className="reel-earn-bubble" aria-hidden="true">Earn 5%</span>}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-dm-sans)', padding: '1px 8px', borderRadius: 9999, background: 'rgba(0,0,0,0.6)', whiteSpace: 'nowrap' }}>
            {clipCount > 0 ? `${clipCount} ${clipCount === 1 ? 'clip' : 'clips'}` : 'Clips'}
          </span>
        </button>

      </div>

      {/* Guest clips: a dark sheet portaled to <body> (components/UserTourVideos),
          booking through the reel's own add. */}
      {clipsOpen && (
        <UserTourVideos
          exp={exp}
          startUpload={clipsUpload}
          cta={{ inCart, blocked, swapLine: shortReason, onAdd: () => addToTrip() }}
          onPlay={(id) => { closeClips(); onPlayClip(id) }}
          onClose={closeClips}
        />
      )}

      {/* Share toast, MAPL Tours brand: gold accent on ink-black, Syne label */}
      {shareToast && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(var(--reel-bottom-offset, 100px) + 16px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '11px 18px 11px 14px',
            borderRadius: 9999,
            background: 'rgba(8, 8, 10, 0.92)',
            border: '1px solid rgba(255, 179, 0, 0.35)',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 179, 0, 0.08)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            color: 'white',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            animation: 'fadeUp 0.28s ease',
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'var(--gold, #FFB300)',
              color: '#08080A',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            ✓
          </span>
          <span
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '-0.01em',
              color: 'white',
            }}
          >
            {shareToast}
          </span>
        </div>
      )}

      {/* ── Bottom info (Snapchat style, bold, stacked, left-aligned) ── */}
      <div className="reel-bottom-info reel-bottom-mobile-pad" style={{
        position: 'absolute', bottom: 0, left: 0, right: 72,
        padding: '0 16px 20px', zIndex: 10,
      }}>
        {/* The block's own shade: travels with the mobile 96px lift, so the
            text never depends on the viewport-anchored scrim below it.
            Uniform 0.6 core, feathered by blur, reaching 32px above the
            creator line so that line sits on the core, not the feather (at
            20px it computed 4.54:1 over a white frame on a tall overlay). */}
        <div aria-hidden style={{
          position: 'absolute', inset: '-32px -28px -12px -28px', zIndex: -1,
          background: 'rgba(0,0,0,0.6)', borderRadius: 32, filter: 'blur(28px)',
          pointerEvents: 'none',
        }} />
        {/* Who made the video: the guest who filmed a clip (labelled as a
            guest's, so it is never mistaken for ours), or the tour's creator. */}
        {clip ? (
          <div style={{ marginBottom: 14 }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 0 4px', fontFamily: 'var(--font-dm-sans)' }}>
              {/* A dark fill: the old light one measured 3.75:1 on a bright
                  frame of a landscape clip. */}
              <span style={{
                padding: '3px 10px', borderRadius: 9999, background: 'rgba(0,0,0,0.45)',
                border: '1px solid rgba(255,255,255,0.28)', fontSize: 12, fontWeight: 700, color: 'white',
              }}>
                {`${clipKind} ${clip.n} of ${clip.of}`}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>
                {clipBy}{clipDateLabel(clip.video.created_at) ? ` · ${clipDateLabel(clip.video.created_at)}` : ''}
              </span>
            </p>
            {clip.video.caption && (
              <p id={`clip-cap-${clip.video.id}`} style={{
                margin: 0, fontSize: 14, lineHeight: 1.45, color: 'white', fontFamily: 'var(--font-dm-sans)',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {clip.video.caption}
              </p>
            )}
            {!clip.video.caption && (
              <p id={`clip-desc-${clip.video.id}`} className="sr-only">{`${clipBy}’s own video from ${exp.title}.`}</p>
            )}
          </div>
        ) : (
          <p style={{
            fontSize: 13, fontWeight: 500, color: 'white',
            fontFamily: 'var(--font-dm-sans)', marginBottom: 4,
          }}>
            @{displayHandle(exp.creator)}
          </p>
        )}

        {/* Title */}
        <TitleTag style={{
          fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 18,
          color: 'white', lineHeight: 1.2, marginBottom: 8,
        }}>
          {t(exp.title)}
        </TitleTag>

        {/* Description, 2 line clamp. Phones hide it (class): with it, the
            chips and the helper line, the overlay covered more than half the
            video; the same words are one tap away in the details sheet. */}
        {!clip && <p id={`reel-desc-${slug}`} className="reel-desc" style={{
          fontSize: 15, color: '#fff',
          fontFamily: 'var(--font-dm-sans)', lineHeight: 1.45, marginBottom: 10,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {t(exp.description)}
        </p>}

        {/* Phones: one line carries the place, the duration and the way to
            the details, in place of the paragraph, the link and the chips. */}
        <button
          type="button"
          className="reel-meta-line"
          onClick={(e) => { e.stopPropagation(); openDetails() }}
          aria-label={`${exp.destination}, ${exp.duration}. What's included, ages and what to bring`}
          style={{
            // Each fact keeps its icon and its words together, with space
            // rather than a "·" between them: a dot left at the end of a
            // wrapped line on 13 of 14 tours at 360px.
            alignItems: 'center', columnGap: 12, rowGap: 0, minHeight: 44, padding: 0, marginBottom: 8,
            // On a clip it sits with the title it belongs to, below the
            // guest's byline group (its 44px target overlaps only the title).
            marginTop: clip ? -8 : undefined,
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            fontFamily: 'var(--font-dm-sans)', fontSize: 13.5, fontWeight: 600, color: '#fff',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            <MapPin size={13} aria-hidden /> {exp.destination}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            <Clock size={13} aria-hidden /> {exp.duration}
          </span>
          <span style={{ textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap' }}>What&apos;s included</span>
        </button>

        {/* Phones: the two things the price covers that decide a purchase
            (the ride and the entry), on one line under the meta line. The
            full list stays a tap away in the details sheet. */}
        {facts && !clip && (
          <p className="reel-facts" style={{
            margin: '0 0 8px', fontSize: 13, lineHeight: '17px',
            color: 'var(--text-on-dark-2)', fontFamily: 'var(--font-dm-sans)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {facts}
          </p>
        )}

        {/* The reel sells the feeling; this answers the questions that decide a
            purchase (transport, entrance fees, minimum age, what to wear). */}
        {/* 44px tall with the old 10px bottom margin folded in, so the reel's
            overlay keeps the same height. Left-aligned so that when it wraps
            on a 360px phone the second line lines up under the title instead
            of centring "bring" on its own. */}
        {!clip && <button
          className="reel-included"
          onClick={(e) => { e.stopPropagation(); openDetails() }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            textAlign: 'left', justifyContent: 'flex-start',
            minHeight: 44, padding: '0 2px', marginBottom: 0,
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-dm-sans)', fontSize: 13.5, fontWeight: 600,
            color: '#fff', textDecoration: 'underline', textUnderlineOffset: 3,
          }}
        >
          What&apos;s included, ages and what to bring
        </button>}

        {/* Info chips row */}
        {!clip && <div className="reel-chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.12)',
            fontSize: 13, fontWeight: 600, color: 'white',
            fontFamily: 'var(--font-dm-sans)',
          }}>
            <MapPin size={12} /> {exp.destination}
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.12)',
            fontSize: 13, fontWeight: 600, color: 'white',
            fontFamily: 'var(--font-dm-sans)',
          }}>
            <Clock size={12} /> {exp.duration}
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.12)',
            fontSize: 13, fontWeight: 600, color: 'white',
            fontFamily: 'var(--font-dm-sans)',
          }}>
            {exp.reviews > 0 ? (<><Star size={12} fill="white" strokeWidth={0} /> {exp.rating}</>) : t('New')}
          </span>
        </div>}

        {/* Why "Book this instead": ABOVE the price row, never below it. The
            block is anchored to the bottom, so a line under the button that
            appeared or went away moved the button (22px on a phone after a
            swap, 29px on desktop after an add). Phones get the short line,
            wider screens the whole reason; only while it applies. */}
        {shortReason && (
          <p id={swapId} className="reel-blocked-reason" style={{
            margin: '0 0 8px', fontSize: 13, lineHeight: '17px',
            color: 'var(--text-on-dark-2)', fontFamily: 'var(--font-dm-sans)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {shortReason}
          </p>
        )}
        {blocked && (
          <p className="reel-helper" style={{
            margin: '0 0 10px', fontSize: 13, lineHeight: 1.5,
            color: 'rgba(255,255,255,0.78)', fontFamily: 'var(--font-dm-sans)',
          }}>
            {`${tourFit.reason} Booking it here takes that day's place, and you can undo it.`}
          </p>
        )}

        {/* Price + CTA row. Under 360px it stacks (globals.css): beside the
            button the price had 70px and broke into three lines, and the
            button moved 12px when it became "In your trip". */}
        <div className="reel-price-row" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* flexWrap + nowrap unit: when the row is too narrow beside the
              CTA, "up to 3 people" drops to its own line as a whole phrase
              instead of breaking mid-phrase into a ragged "up to 3 / people". */}
          <div className="reel-price" style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap', minWidth: 0, paddingRight: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#fff', fontFamily: 'var(--font-dm-sans)' }}>{t('From')}</span>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 22, color: 'white', letterSpacing: '-0.02em' }}>{formatPrice(exp.price)}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', fontFamily: 'var(--font-dm-sans)', whiteSpace: 'nowrap' }}>{priceUnitLabel(exp.pricing)}</span>
          </div>
          {/* Every state has a next step. In the trip it is checkout (a
              second tap used to remove the tour, and the bar arriving under
              the thumb made that easy); a tour that cannot join the day books
              in that day's place, with an Undo, instead of a grey button
              that did nothing on 11 of 14 reels once one tour was added. */}
          {/* Both states are at least 140px ("In your trip" is the wider
              label) and never narrower than the button just pressed, so the
              price beside them never reflows on an add or a swap. Names start
              with the visible words, for speech control (WCAG 2.5.3). */}
          {inCart ? (
            <Link
              ref={cta.ref}
              href="/checkout"
              onClick={(e) => e.stopPropagation()}
              className={justAdded ? 'reel-in-trip reel-in-trip--fresh' : 'reel-in-trip'}
              aria-label={`${t('In your trip')}: ${exp.title}. Go to checkout`}
              // A status, quietly: once something is in the trip the gold
              // Checkout in the bar is the one loud way on (a filled green
              // pill here made two). The ring is an inset shadow, not a
              // border, so the box stays 48px and nothing moves.
              style={{
                minHeight: 48, minWidth: Math.max(140, cta.minWidth), padding: '0 18px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.14)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.32)', color: 'white',
                fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
                textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Check size={16} strokeWidth={3} color="#4ADE80" aria-hidden /> {t('In your trip')}
            </Link>
          ) : (
            <button
              ref={cta.ref}
              className="reel-cta"
              data-slug={slug}
              onClick={(e) => { e.stopPropagation(); cta.press(e.currentTarget); addToTrip() }}
              aria-label={`${blocked ? t('Book this instead') : t('Add to Trip')}: ${exp.title}`}
              aria-describedby={shortReason ? swapId : undefined}
              style={{
                minHeight: 48, minWidth: Math.max(140, cta.minWidth), padding: '0 22px', borderRadius: 9999,
                background: 'white', color: '#000',
                fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
                border: 'none', cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {blocked ? t('Book this instead') : t('Add to Trip')}
            </button>
          )}
        </div>
      </div>
      {detailsFor && (
        <TourDetailsSheet
          exp={detailsFor}
          onClose={() => setDetailsFor(null)}
          cta={{ inCart, blocked, swapLine: shortReason, onAdd: () => addToTrip() }}
        />
      )}
    </div>
  )
}

/**
 * Desktop only: the reel's right panel when the tour has no comments yet,
 * which today is every tour. It held "No comments yet. Be the first!" across
 * two thirds of the screen; it now carries what decides a booking (price,
 * the add, the cancellation terms, what is included) beside the video, with
 * the full details one click away.
 */
function DesktopTourPanel({ exp }: { exp: Experience }) {
  const { t, formatPrice } = useI18n()
  const hydrated = useHydrated()
  const isInCart = useCartStore((s) => s.isInCart)
  useCartStore((s) => s.items)
  const inCart = hydrated && isInCart(exp.id)
  const tourFit = useTourFit(exp)
  const blocked = !inCart && !tourFit.allowed
  const slug = slugify(exp.title)
  const swapLine = blocked ? swapReason(tourFit) : null
  const [details, setDetails] = useState(false)
  const cta = useCtaSwap(inCart)
  const add = () => {
    const result = addTourToTrip(exp, tourFit, {
      placement: 'reel',
      checkout: false,
      onUndo: () => {
        trackReelCtaTap(slug, 'undone')
        cta.afterUndo()
      },
    })
    if (result === 'added') trackReelCtaTap(slug, 'added')
    else if (result === 'swapped') trackReelCtaTap(slug, 'swapped', tourFit.reason ?? 'day-fit')
  }
  return (
    <div style={{ padding: '4px 0 24px', fontFamily: 'var(--font-dm-sans)', color: 'white' }}>
      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>
        {exp.category}
      </p>
      <h2 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', margin: '6px 0 8px' }}>
        {t(exp.title)}
      </h2>
      <p style={{ fontSize: 14, color: '#cccccc', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MapPin size={14} aria-hidden /> {placeLabel(exp)}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Clock size={14} aria-hidden /> {exp.duration}</span>
      </p>
      {/* Under 420px of panel (a 768px tablet gives it about 300) the
          price and the button stack, see .reel-panel in globals.css. */}
      <div className="reel-panel-price-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '20px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: '#cccccc' }}>{t('From')}</span>
          <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{formatPrice(exp.price)}</span>
          <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{priceUnitLabel(exp.pricing)}</span>
        </div>
        {inCart ? (
          <Link
            ref={cta.ref}
            href="/checkout"
            aria-label={`${t('In your trip')}: ${exp.title}. Go to checkout`}
            // Quiet like the reel's: the panel header's gold Checkout is the
            // money action.
            style={{
              minHeight: 48, minWidth: Math.max(140, cta.minWidth), padding: '0 20px', borderRadius: 9999, flexShrink: 0,
              background: 'rgba(255,255,255,0.08)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.24)', color: 'white', textDecoration: 'none',
              fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Check size={16} strokeWidth={3} color="#4ADE80" aria-hidden /> {t('In your trip')}
          </Link>
        ) : (
          <button
            ref={cta.ref}
            type="button"
            onClick={(e) => { cta.press(e.currentTarget); add() }}
            aria-label={`${blocked ? t('Book this instead') : t('Add to Trip')}: ${exp.title}`}
            aria-describedby={swapLine ? `panel-swap-${slug}` : undefined}
            style={{
              minHeight: 48, minWidth: Math.max(140, cta.minWidth), padding: '0 22px', borderRadius: 9999, flexShrink: 0,
              background: 'white', color: '#000', border: 'none', cursor: 'pointer',
              fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
            }}
          >
            {blocked ? t('Book this instead') : t('Add to Trip')}
          </button>
        )}
      </div>
      {swapLine && (
        <p id={`panel-swap-${slug}`} style={{ marginTop: 8, fontSize: 13, color: '#cccccc' }}>{swapLine}</p>
      )}
      <p style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5, color: '#cccccc' }}>
        {CANCELLATION_SUMMARY.short}.{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer" aria-label={`${t('Full policy')} (opens in a new tab)`} style={{ color: 'white', textDecoration: 'underline' }}>
          {t('Full policy')}
        </a>
      </p>
      {exp.included?.length ? (
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{t('What is included')}</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {exp.included.slice(0, 5).map((line) => (
              <li key={line} style={{ display: 'flex', gap: 8, fontSize: 14, lineHeight: 1.45, color: '#e8e6e1' }}>
                <Check size={15} strokeWidth={2.5} color="var(--emerald)" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden /> {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <button
        type="button"
        className="reel-panel-details"
        onClick={() => setDetails(true)}
        style={{
          marginTop: 18, minHeight: 44, padding: '0 16px', borderRadius: 9999,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
          color: 'white', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', cursor: 'pointer',
        }}
      >
        {t('All details, ages and what to bring')}
      </button>
      <p style={{ marginTop: 26, fontSize: 13, color: '#a9a9a9' }}>{t('No comments yet. Be the first below.')}</p>
      {details && (
        <TourDetailsSheet
          exp={exp}
          onClose={() => setDetails(false)}
          cta={{ inCart, blocked, swapLine, onAdd: add }}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════ */
/* ── Draggable Mobile Comments Sheet ── */
function MobileCommentsSheet({ comments, commentText, setCommentText, addComment, onClose, replyingTo, setReplyingTo, isLoggedIn, slug }: {
  comments: DisplayComment[]
  commentText: string
  setCommentText: (v: string) => void
  addComment: () => void
  onClose: () => void
  replyingTo: { id: string; user: string } | null
  setReplyingTo: (v: { id: string; user: string } | null) => void
  isLoggedIn: boolean
  slug: string
}) {
  const { t } = useI18n()
  const { user: currentUser } = useAuth()
  const sheetRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [sheetHeight, setSheetHeight] = useState(60)

  // Live visual viewport, tracks Safari's top URL bar and bottom chrome
  // as they show/hide during scroll, plus the on-screen keyboard. We size
  // and position the sheet against this (not layout viewport / 100vh) so
  // the drag handle and close button never slide behind iOS chrome.
  // Initialize deterministically so SSR and the first client render match.
  // The real viewport is measured in useEffect below.
  const [vv, setVv] = useState({ height: 800, offsetTop: 0 })
  useEffect(() => {
    const visual = typeof window !== 'undefined' ? window.visualViewport : null
    const update = () => {
      if (visual) {
        setVv({ height: visual.height, offsetTop: visual.offsetTop })
      } else {
        setVv({ height: window.innerHeight, offsetTop: 0 })
      }
    }
    update()
    if (visual) {
      visual.addEventListener('resize', update)
      visual.addEventListener('scroll', update)
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      if (visual) {
        visual.removeEventListener('resize', update)
        visual.removeEventListener('scroll', update)
      }
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  // Submit then blur the input so iOS dismisses the keyboard and resets
  // any residual zoom state. The input itself is 16px to prevent iOS
  // Safari's focus-zoom behaviour in the first place.
  const submitAndBlur = () => {
    addComment()
    inputRef.current?.blur()
  }
  const [dragging, setDragging] = useState(false)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(60)

  const onTouchStart = (e: React.TouchEvent) => {
    setDragging(true)
    dragStartY.current = e.touches[0].clientY
    dragStartHeight.current = sheetHeight
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return
    const delta = dragStartY.current - e.touches[0].clientY
    const deltaPercent = (delta / vv.height) * 100
    const newHeight = Math.max(10, Math.min(100, dragStartHeight.current + deltaPercent))
    setSheetHeight(newHeight)
  }

  const onTouchEnd = () => {
    setDragging(false)
    if (sheetHeight < 25) {
      onClose()
    } else if (sheetHeight > 80) {
      setSheetHeight(100)
    } else {
      setSheetHeight(60)
    }
  }

  return (
    <div
      className="hide-desktop"
      style={{
        // Pin the entire sheet container to the *visual* viewport so the
        // top edge never slides under Safari's URL bar / notch. When the
        // keyboard opens, visualViewport.height shrinks and the sheet
        // follows automatically.
        position: 'fixed',
        top: vv.offsetTop,
        left: 0,
        right: 0,
        height: vv.height,
        zIndex: 320,
      }}
    >
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: `rgba(0,0,0,${Math.min(0.6, sheetHeight / 100 * 0.6)})`,
        transition: dragging ? 'none' : 'background 0.3s ease',
      }} />
      <div
        ref={sheetRef}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: `${sheetHeight}%`,
          background: 'var(--bg-dark-warm)',
          borderRadius: sheetHeight >= 100 ? 0 : '20px 20px 0 0',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          transition: dragging
            ? 'none'
            : 'height 0.3s cubic-bezier(0.22,1,0.36,1), border-radius 0.3s ease',
        }}
      >
        {/* Drag handle */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px', cursor: 'grab', touchAction: 'none' }}
        >
          <div style={{ width: 40, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.2)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '0 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 17, color: 'white' }}>Comments</h2>
            <span style={{ padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.08)', fontSize: 12, fontWeight: 600, color: '#cccccc', fontFamily: 'var(--font-dm-sans)' }}>{comments.length}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {sheetHeight < 100 && (
              <button onClick={() => setSheetHeight(100)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cccccc', fontSize: 14 }}>↑</button>
            )}
            {sheetHeight >= 100 && (
              <button onClick={() => setSheetHeight(60)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cccccc', fontSize: 14 }}>↓</button>
            )}
            <button onClick={onClose} aria-label="Close comments" style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cccccc' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Comments list */}
        <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          {comments.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '40px 0', color: '#cccccc', fontSize: 14, fontFamily: 'var(--font-dm-sans)' }}>No comments yet. Be the first!</p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Avatar src={comment.avatarUrl} name={comment.user} size={34} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', color: 'white' }}>{comment.isHandle ? '@' : ''}{comment.user}</span>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)', fontFamily: 'var(--font-dm-sans)' }}>{comment.time}</span>
                    </div>
                    <p style={{ fontSize: 14, color: '#cccccc', fontFamily: 'var(--font-dm-sans)', lineHeight: 1.5, marginBottom: 8 }}>{comment.text}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(255,255,255,0.66)', fontFamily: 'var(--font-dm-sans)' }}><ThumbsUp size={13} /> {comment.likes}</button>
                      <button
                        onClick={() => {
                          if (!isLoggedIn) {
                            window.location.href = `/login?redirect=/experience/${slug}`
                            return
                          }
                          // Seed comments have no supabaseId, fall back to a
                          // top-level @-mention so the Reply button always works.
                          if (comment.supabaseId) {
                            setReplyingTo({ id: comment.supabaseId, user: (comment.isHandle ? '@' : '') + comment.user })
                          } else {
                            setReplyingTo(null)
                          }
                          setCommentText(`${(comment.isHandle ? '@' : '') + comment.user} `)
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.66)', fontFamily: 'var(--font-dm-sans)' }}
                      >{t('Reply')}</button>
                    </div>
                  </div>
                </div>

                {/* Replies */}
                {comment.replies && comment.replies.length > 0 && (
                  <div style={{ marginLeft: 44, marginTop: 10, borderLeft: '2px solid rgba(255,255,255,0.06)', paddingLeft: 12 }}>
                    {comment.replies.map((reply) => (
                      <div key={reply.id} style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
                        <Avatar src={reply.avatarUrl} name={reply.user} size={26} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', color: 'white' }}>{reply.isHandle ? '@' : ''}{reply.user}</span>
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)', fontFamily: 'var(--font-dm-sans)' }}>{reply.time}</span>
                          </div>
                          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-dm-sans)', lineHeight: 1.5 }}>{reply.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Comment input */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {replyingTo && (
            <div style={{
              padding: '6px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 12, color: 'rgba(255,255,255,0.72)', fontFamily: 'var(--font-dm-sans)',
            }}>
              <span>Replying to <span style={{ color: 'white', fontWeight: 600 }}>{replyingTo.user}</span></span>
              <button onClick={() => { setReplyingTo(null); setCommentText('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-dm-sans)' }}>Cancel</button>
            </div>
          )}
          <div style={{ padding: '10px 20px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar
              src={currentUser?.user_metadata?.avatar_url ?? null}
              name={currentUser?.user_metadata?.full_name ?? currentUser?.user_metadata?.name ?? currentUser?.email ?? 'You'}
              size={30}
            />
            <input type="text"
              ref={inputRef}
              aria-label={isLoggedIn ? 'Write a comment' : 'Sign in to comment'}
              placeholder={isLoggedIn ? (replyingTo ? `Reply to ${replyingTo.user}...` : 'Add a comment...') : 'Sign in to comment...'}
              value={commentText} onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitAndBlur() }}
              readOnly={!isLoggedIn}
              onClick={() => {
                // Deliberate activation only, never on focus (WCAG 3.2.1).
                if (!isLoggedIn) window.location.href = `/login?redirect=/experience/${slug}`
              }}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.06)',
                border: replyingTo ? '1px solid rgba(255,179,0,0.3)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 9999, padding: '10px 16px', fontSize: 16,
                fontFamily: 'var(--font-dm-sans)', color: 'white', outline: 'none',
              }}
            />
            {commentText.trim() && (
              <button onClick={submitAndBlur} aria-label="Post comment" style={{ width: 44, height: 44, flexShrink: 0, borderRadius: '50%', background: '#FFFC00', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Send size={15} color="#000" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ExperienceDetail({ slug }: { slug: string }) {
  const router = useRouter()
  const items = useCartStore((s) => s.items)
  const maxDailyHours = useCartStore((s) => s.maxDailyHours())
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [commentText, setCommentText] = useState('')
  const [mobileComments, setMobileComments] = useState(false)
  const hydrated = useHydrated()
  useStatusBarFloor()
  // Guest clips have sound; one choice covers every clip in the feed.
  const [clipsMuted, setClipsMuted] = useState(true)

  // When the busiest day in the cart hits the 8-hour cap, surface tours
  // already in the cart first (randomised, deduped) so the feed pivots to
  // helping the user review their day instead of adding more. The stable
  // dependency list keeps the order fixed across scrolls, it only
  // reshuffles when the cart contents actually change.
  const dayIsFull = maxDailyHours >= DAILY_HOUR_LIMIT
  const cartIdsKey = items.map((i) => i.id).sort((a, b) => a - b).join(',')
  const feedExperiences = useMemo(() => {
    // A package opened by direct link still has to render, but it never joins
    // the browsable reel feed: it is shown alone, since every package is a
    // recombination of singles already in that feed.
    const openedPackage = packageExperiences.find((e) => slugify(e.title) === slug)
    if (openedPackage) return [openedPackage]
    // The tour in the URL is always the FIRST reel. The server renders the
    // same order, so the tour a visitor tapped (an ad, a search result) is on
    // screen from the first paint instead of appearing only after hydration
    // scrolls a 15-reel list to it, which on a slow phone took 6 to 10 s of
    // showing the wrong tour at the wrong price. The rest follow nearest
    // first (lib/reel-feed), so the next swipe is usually a tour that can
    // join the same day.
    const requestedFirst = (list: Experience[]) => orderFeed(list, slug)
    if (!dayIsFull || items.length === 0) return requestedFirst(singleExperiences)
    const cartIdSet = new Set(items.map((i) => i.id))
    const cartExps = singleExperiences.filter((e) => cartIdSet.has(e.id))
    const otherExps = singleExperiences.filter((e) => !cartIdSet.has(e.id))
    return requestedFirst([...shuffle(cartExps, cartIdsKey), ...shuffle(otherExps, cartIdsKey)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayIsFull, cartIdsKey, slug])

  // A tour's clips play as reels right after it, MAPL Tours Jamaica's own
  // first, then guests', each newest first (lib/creator clipsInReelOrder),
  // so they are watched by swiping on, like everything else here. They
  // join only after hydration: the list comes from a client cache the
  // server never saw, and the first render has to match its HTML.
  const { clips, loading: clipsLoading, revalidating: clipsRevalidating, refresh: refreshClips } = useApprovedClips()
  const clipsByTour = useMemo(() => {
    const byTour = new Map<number, TourVideo[]>()
    if (!hydrated) return byTour
    for (const c of clips) {
      const list = byTour.get(c.experience_id)
      if (list) list.push(c)
      else byTour.set(c.experience_id, [c])
    }
    return byTour
  }, [hydrated, clips])
  const entries = useMemo(() => feedExperiences.flatMap((exp) => {
    const list = clipsByTour.get(exp.id) ?? []
    return [
      { key: `tour-${exp.id}`, exp, clip: undefined as ReelClip | undefined },
      ...clipsInReelOrder(list).map((clip) => ({ key: `clip-${clip.video.id}`, exp, clip: clip as ReelClip | undefined })),
    ]
  }), [feedExperiences, clipsByTour])

  const startIdx = entries.findIndex((e) => !e.clip && slugify(e.exp.title) === slug)
  const [activeIndex, setActiveIndex] = useState(startIdx >= 0 ? startIdx : 0)

  // The reel is a fullscreen surface: the DOCUMENT must never scroll here.
  // Even with the page sized to exactly one viewport, iOS Safari can nudge
  // the body on aggressive swipes; locking it keeps the chrome and the
  // comment bar glued where they belong.
  useEffect(() => {
    const body = document.body.style
    const root = document.documentElement.style
    const prev = { overflow: body.overflow, overscroll: root.overscrollBehaviorY }
    body.overflow = 'hidden'
    root.overscrollBehaviorY = 'none'
    return () => {
      body.overflow = prev.overflow
      root.overscrollBehaviorY = prev.overscroll
    }
  }, [])

  // Clamped: when the reel on screen leaves the feed (a clip un-approved
  // since it loaded), an index past the end rendered "Experience not found"
  // and dropped the whole feed for a frame; the anchoring below then puts
  // its tour on screen.
  const activeEntry = entries[Math.min(activeIndex, entries.length - 1)]
  const activeExp = activeEntry?.exp
  // The counter and the arrows beside it count tours; a tour's guest clips
  // sit under its number.
  const tourNumber = activeExp ? feedExperiences.indexOf(activeExp) + 1 : 0
  // Said by screen readers when the reel on screen changes, including when a
  // clip ends and the next one takes over without anyone touching anything.
  // "Guest clip" for a guest's, "clip" for MAPL Tours Jamaica's own.
  const clipWord = (c: ReelClip) => (isMaplAccount(c.video.user_id) ? 'clip' : 'guest clip')
  const nowShowing = !activeEntry
    ? ''
    : activeEntry.clip
      ? `${clipWord(activeEntry.clip).replace(/^./, (m) => m.toUpperCase())} ${activeEntry.clip.n} of ${activeEntry.clip.of} from ${activeEntry.exp.title}, by ${clipCredit(activeEntry.clip.video, 'a guest').by}`
      : `${activeEntry.exp.title}, tour ${tourNumber} of ${feedExperiences.length}`
  // Wider screens have no phone bar: the reel after this one, when it is a
  // guest clip, gets its own button beside the arrows (which move by tour).
  const nextClip = entries[activeIndex + 1]?.clip

  // The reel a visitor settles on, reported once it has held the screen for
  // a moment: a swipe through five tours is not five views.
  useEffect(() => {
    if (!activeExp) return
    const t = window.setTimeout(() => {
      // Watched, for the home row's rings (lib/seen-reels).
      useSeenReels.getState().markSeen(activeExp.id)
      trackViewItem({
        value: activeExp.price,
        currency: 'USD',
        items: [{ id: slugify(activeExp.title), name: activeExp.title, category: 'tour', price: activeExp.price, quantity: 1 }],
      })
    }, 1200)
    return () => window.clearTimeout(t)
  }, [activeExp])
  // A guest clip that holds the screen is counted, as a tour view is.
  const activeClipKey = activeEntry?.clip ? activeEntry.key : null
  useEffect(() => {
    if (!activeClipKey || !activeExp) return
    const t = window.setTimeout(() => trackClipsEvent('clip_play', slugify(activeExp.title)), 1200)
    return () => window.clearTimeout(t)
  }, [activeClipKey, activeExp])
  const { addComment: addSupabaseComment, toDisplayComments, isLoggedIn, user: currentUser, replyingTo, setReplyingTo } = useComments(activeExp?.id || 0)
  const activeComments = activeExp ? toDisplayComments(activeExp.comments) : []

  // Checkout requires an account. Rather than a silent 307 → /login after the
  // user commits, surface it on the CTA and route logged-out users straight to
  // /login with a return path back to checkout (mirrors ItineraryPanel).
  const checkoutHref = '/checkout'

  // Measure the mobile bottom bar live so the reel's right rail and
  // "Add to Trip" pill can sit exactly 12px above it regardless of safe-area,
  // keyboard, or bar-content changes. The CSS var is the *total* offset
  // (bar height + 12px gap), or cleared entirely when the bar is hidden so
  // CSS falls back to the desktop default.
  const mobileBarCleanup = useRef<(() => void) | null>(null)
  const mobileBarRef = useCallback((el: HTMLDivElement | null) => {
    // Detach-safe: React calls this with null when the bar leaves the tree,
    // and that is the ONLY reliable detach signal. Tear down the previous
    // element's observers here, not in an unmount effect that can no longer
    // find the node (the old pattern leaked a ResizeObserver + four window
    // listeners on every bar remount).
    mobileBarCleanup.current?.()
    mobileBarCleanup.current = null
    const root = document.documentElement
    if (!el) {
      root.style.removeProperty('--reel-bottom-offset')
      return
    }
    const update = () => {
      const rect = el.getBoundingClientRect()
      // If the bar is display:none (desktop via .hide-desktop), rect.height
      // is 0, clear the var so the desktop fallback in CSS applies.
      if (rect.height === 0) {
        root.style.removeProperty('--reel-bottom-offset')
      } else {
        root.style.setProperty('--reel-bottom-offset', `${Math.round(rect.height) + 12}px`)
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    // Also observe the viewport, `hide-desktop` flips on resize/rotation,
    // and the keyboard changes visualViewport height.
    const mql = window.matchMedia('(min-width: 768px)')
    const onMql = () => update()
    mql.addEventListener('change', onMql)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    const vv = window.visualViewport
    vv?.addEventListener('resize', update)
    mobileBarCleanup.current = () => {
      ro.disconnect()
      mql.removeEventListener('change', onMql)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      vv?.removeEventListener('resize', update)
      root.style.removeProperty('--reel-bottom-offset')
    }
  }, [])
  useEffect(() => {
    if (scrollRef.current && startIdx >= 0) {
      const children = scrollRef.current.children
      const childHeight = children.length ? (children[0] as HTMLElement).offsetHeight : window.innerHeight
      scrollRef.current.scrollTo({ top: startIdx * childHeight, behavior: 'instant' as ScrollBehavior })
    }
  }, [startIdx])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const container = scrollRef.current
    const children = container.children
    if (!children.length) return

    // Use actual child height instead of window.innerHeight
    const childHeight = (children[0] as HTMLElement).offsetHeight
    if (childHeight === 0) return

    const idx = Math.round(container.scrollTop / childHeight)
    const clampedIdx = Math.max(0, Math.min(idx, entries.length - 1))
    setActiveIndex(clampedIdx)
  }, [entries.length])

  const scrollToEntry = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current
    if (!el || index < 0) return
    const children = el.children
    const childHeight = children.length ? (children[0] as HTMLElement).offsetHeight : window.innerHeight
    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: index * childHeight, behavior: instant ? ('instant' as ScrollBehavior) : behavior })
  }, [])

  // The feed changes under the reel on screen when the clips arrive or the
  // cart reorders the tours. Keep that reel on screen: find where it went and
  // jump there before the browser paints.
  const activeKey = useRef<string | null>(null)
  const activeTourKey = useRef<string | null>(null)
  useLayoutEffect(() => {
    const key = activeKey.current
    if (!key) return
    let idx = entries.findIndex((e) => e.key === key)
    // Gone from the feed: its tour, or failing that the nearest reel.
    if (idx < 0) idx = entries.findIndex((e) => e.key === activeTourKey.current)
    if (idx < 0) idx = Math.min(activeIndex, entries.length - 1)
    if (idx < 0 || idx === activeIndex) return
    scrollToEntry(idx, 'instant' as ScrollBehavior)
    setActiveIndex(idx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries])
  useEffect(() => {
    const entry = entries[activeIndex]
    if (!entry) return
    activeKey.current = entry.key
    activeTourKey.current = `tour-${entry.exp.id}`
  }, [entries, activeIndex])

  // A clip picked in the sheet plays here, in the feed. The scroll waits for
  // the sheet to close: its focus trap hands focus back to Clips, and that
  // focus() scrolls the tour's reel into view, which cancelled a scroll
  // started any sooner. Focus then moves to the clip's own play control, so
  // a keyboard user is not left on a reel that has gone inert.
  const focusOnArrive = useRef<string | null>(null)
  // ?clip=<id> share links, and clips picked in the sheet before the feed has
  // them: the reel goes to the clip once it is in (effect below).
  const pendingClip = useRef<string | null>(null)
  // The arm lapses after 4 s, and is not set for the clip already on screen
  // (nothing scrolls, so it would have fired later, at some other change,
  // pulling focus off Add to Trip or out of the comment box).
  const activeIndexRef = useRef(0)
  const playClip = useCallback((id: string) => {
    const key = `clip-${id}`
    const idx = entries.findIndex((e) => e.key === key)
    if (idx >= 0 && idx === activeIndexRef.current) return
    focusOnArrive.current = key
    window.setTimeout(() => { if (focusOnArrive.current === key) focusOnArrive.current = null }, 4000)
    if (idx < 0) {
      // Approved since the feed loaded: fetch the clips again and go to it
      // when it arrives, as a share link does.
      pendingClip.current = id
      void refreshClips()
      return
    }
    window.setTimeout(() => scrollToEntry(idx), 60)
  }, [entries, scrollToEntry, refreshClips])
  useEffect(() => {
    activeIndexRef.current = activeIndex
    const key = focusOnArrive.current
    if (!key || entries[activeIndex]?.key !== key) return
    focusOnArrive.current = null
    // Only focus that is lost or still in the reels moves; never out of a
    // field, the panel or a sheet.
    const active = document.activeElement
    const lost = !active || active === document.body || !!active.closest('[inert]')
    if (!lost && !scrollRef.current?.parentElement?.contains(active)) return
    if (active?.closest('input, textarea, select, [contenteditable="true"]')) return
    const reel = scrollRef.current?.children[activeIndex] as HTMLElement | undefined
    reel?.querySelector<HTMLElement>('.reel-play-toggle')?.focus({ preventScroll: true })
  }, [activeIndex, entries])

  // Focus that the feed takes away (its reel went inert on a swipe or at a
  // clip's end, or the arrow pressed is gone on the reel it led to) moves to
  // the reel now on screen, not to the page, when it was in the reels or
  // their controls (a closed sheet's buttons used to count as "in the
  // reels"). For everyone, screen readers included, as before tours moved
  // on by themselves. What only keyboard use earns is the play/pause disc
  // drawn on that focus ([data-reel-keys] in globals.css): on an iPhone,
  // focus moved by script after a touch drew it over every playing reel
  // (WebKit counts script focus as keyboard focus).
  // lastInputKey also lets a keyboard user's focus hold the feed (holdFeed).
  // Only keys that move focus or press count: Escape closing a sheet, or a
  // shortcut such as Cmd+C, turned a mouse user into a keyboard user, and
  // the tour never moved on into its clip.
  const lastInputKey = useRef(false)
  const lastFocusInFeed = useRef(false)
  useEffect(() => {
    const root = document.documentElement
    const onKey = (e: KeyboardEvent) => {
      // Option+Tab is how Safari, by default, tabs to buttons and links.
      if (e.metaKey || e.ctrlKey || (e.altKey && e.key !== 'Tab') || !NAV_KEYS.has(e.key)) return
      lastInputKey.current = true
      root.setAttribute('data-reel-keys', '')
    }
    const onPointer = () => {
      lastInputKey.current = false
      root.removeAttribute('data-reel-keys')
    }
    const onFocusIn = (e: FocusEvent) => {
      lastFocusInFeed.current = !!scrollRef.current?.parentElement?.contains(e.target as Node)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('focusin', onFocusIn)
      root.removeAttribute('data-reel-keys')
    }
  }, [])
  useEffect(() => {
    const active = document.activeElement
    const lost = !active || active === document.body || !!active.closest('[inert]')
    if (!lost || !lastFocusInFeed.current) return
    const reel = scrollRef.current?.children[activeIndex] as HTMLElement | undefined
    reel?.querySelector<HTMLElement>('.reel-play-toggle')?.focus({ preventScroll: true })
  }, [activeIndex])

  // Arrow and Page keys move one reel from the page itself or the reel's own
  // controls (on first load nothing is focused, and a key did nothing). Inside
  // the feed, or after a click in it or in the panel beside it, the browser
  // scrolls that already; fields and open sheets keep their keys.
  const lastPointerZone = useRef<'feed' | 'panel' | null>(null)
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const el = e.target as Element | null
      lastPointerZone.current = scrollRef.current?.contains(el) ? 'feed' : el?.closest?.('.reel-panel') ? 'panel' : null
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const dir = e.key === 'ArrowDown' || e.key === 'PageDown' ? 1 : e.key === 'ArrowUp' || e.key === 'PageUp' ? -1 : 0
      const scroller = scrollRef.current
      const column = scroller?.parentElement
      if (!dir || !scroller || !column) return
      const el = document.activeElement
      if (el && scroller.contains(el)) return
      const fromPage = !el || el === document.body || el === document.documentElement || el.tagName === 'MAIN'
      if (!fromPage && !column.contains(el)) return
      if (fromPage && lastPointerZone.current) return
      if (Array.from(document.querySelectorAll('[role="dialog"]')).some((d) => d.getClientRects().length > 0)) return
      const next = Math.max(0, Math.min(entries.length - 1, activeIndex + dir))
      e.preventDefault()
      if (next !== activeIndex) scrollToEntry(next)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [activeIndex, entries.length, scrollToEntry])

  // ?clip=<id> share links open on that clip's reel once the clips are in;
  // an id that is not (or no longer) approved leaves the tour on screen.
  useEffect(() => {
    const url = new URL(window.location.href)
    const id = url.searchParams.get('clip')
    if (!id) return
    pendingClip.current = id
    url.searchParams.delete('clip')
    window.history.replaceState(window.history.state, '', url.toString())
  }, [])
  useEffect(() => {
    const id = pendingClip.current
    if (!id || !hydrated) return
    const idx = entries.findIndex((e) => e.key === `clip-${id}`)
    if (idx >= 0) {
      pendingClip.current = null
      scrollToEntry(idx, 'instant' as ScrollBehavior)
    } else if (!clipsLoading && !clipsRevalidating) {
      pendingClip.current = null
    }
  }, [entries, hydrated, clipsLoading, clipsRevalidating, scrollToEntry])

  // Back only when the visitor reached the reel from another page of this
  // site in this tab (lib/reel-feed closeTarget). A reel opened from an ad or
  // a shared link goes to /explore: after a trip to checkout and back, Back
  // there left the site for the ad or a blank in-app webview.
  const closeReel = () => {
    let entry: string | null = null
    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      entry = nav ? new URL(nav.name).pathname : null
    } catch {
      entry = null
    }
    if (closeTarget(entry, window.history.length) === 'back') router.back()
    else router.push('/explore')
  }

  // The arrows beside the counter move by tour: back to the start of this
  // tour from one of its clips, otherwise to the tour before or after.
  const tourEntryIndex = (exp: Experience | undefined) => (exp ? entries.findIndex((e) => !e.clip && e.exp === exp) : -1)
  const prevTarget = activeEntry?.clip ? tourEntryIndex(activeExp) : tourEntryIndex(feedExperiences[tourNumber - 2])
  const nextTarget = tourEntryIndex(feedExperiences[tourNumber])

  // A reel's end moves the feed on, but not from under someone writing a
  // comment or reading a sheet: the comment box follows the reel on screen,
  // so a comment half-written for one tour was posted to the next. Nor from
  // under a keyboard user on the reel's own controls or the panel beside it
  // (Add to Trip, Like, Clips): a tour moved on to its clip after 8 s, and
  // the next Enter paused that clip instead of adding the tour. The play
  // button follows the feed (focus moves to the next reel's).
  const holdFeed = () => {
    if (mobileComments || commentText.trim() !== '') return true
    const focused = document.activeElement
    if (focused?.closest('input, textarea, select, [contenteditable="true"]')) return true
    if (lastInputKey.current && focused?.closest('.reel-item:not([inert]), .reel-panel') && !focused.closest('.reel-play-toggle')) return true
    return Array.from(document.querySelectorAll('[role="dialog"]')).some((d) => d.getClientRects().length > 0)
  }

  const addComment = async () => {
    if (!commentText.trim() || !activeExp) return
    if (!isLoggedIn) {
      window.location.href = `/login?redirect=/experience/${slugify(activeExp.title)}`
      return
    }
    const posted = await addSupabaseComment(commentText, replyingTo?.id || undefined)
    // Only clear the box on a confirmed post. On failure the optimistic row
    // is rolled back in the hook, so keeping the text lets the user retry.
    if (posted) {
      setCommentText('')
      setReplyingTo(null)
    }
  }

  if (!activeExp) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#000' }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', color: '#cccccc' }}>Experience not found</p>
      </div>
    )
  }

  return (
    // In flow, not fixed.
    //
    // As `position: fixed; inset: 0` this overlay covered the whole document,
    // so anything the route rendered after it sat underneath, present in the
    // HTML and invisible on screen. That is the definition of cloaking, and it
    // is also why the tour's own inclusions, what to bring and meeting point
    // had nowhere to live. One viewport of immersive reel, then the page
    // continues: the internal scroll-snap feed is unaffected because it sizes
    // against this box, which is still exactly one viewport tall.
    <div style={{
      position: 'relative', zIndex: 1,
      height: '100dvh', width: '100%',
      background: '#000', display: 'flex',
    }}>
      {/* ── LEFT: Scrollable reels (.reel-column: the full width on phones
          and small tablets, a 480px column beside the panel from 768px) ── */}
      <div className="reel-column" style={{
        flex: '1 1 auto', width: '100%',
        height: '100%', position: 'relative',
      }}>
        <p className="sr-only" aria-live="polite">{nowShowing}</p>
        {/* ── Prev / Next arrows, top, beside close button ── */}
        <div style={{
          position: 'absolute', top: `calc(${REEL_INSET} + 22px)`, left: 16, right: 60,
          zIndex: 20, display: 'flex', alignItems: 'center', gap: 8,
          pointerEvents: 'none',
        }}>
          {prevTarget >= 0 ? (
            <button
              onClick={() => scrollToEntry(prevTarget)}
              className="reel-top-btn"
              aria-label={activeEntry?.clip ? `Back to ${activeExp.title}` : 'Previous experience'}
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', pointerEvents: 'auto',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.68)'
                e.currentTarget.style.transform = 'scale(1.08)'
                e.currentTarget.style.boxShadow = '0 6px 28px rgba(0,0,0,0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.5)'
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'
              }}
            >
              <ChevronLeft size={22} strokeWidth={2.5} />
            </button>
          ) : (
            <div style={{ width: 44 }} />
          )}

          {/* Counter */}
          <span style={{
            fontSize: 13, fontWeight: 700, color: 'white',
            fontFamily: 'var(--font-dm-sans)', pointerEvents: 'auto',
            padding: '6px 12px', borderRadius: 9999,
            background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)',
          }}>
            <span aria-hidden="true">
              {tourNumber}
              <span style={{ color: '#fff', fontWeight: 500 }}> / {feedExperiences.length}</span>
            </span>
            <span className="sr-only">{`Tour ${tourNumber} of ${feedExperiences.length}${activeEntry?.clip ? `, ${clipWord(activeEntry.clip)} ${activeEntry.clip.n} of ${activeEntry.clip.of}` : ''}`}</span>
          </span>

          {nextTarget >= 0 ? (
            <button
              onClick={() => scrollToEntry(nextTarget)}
              className="reel-top-btn"
              aria-label="Next experience"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', pointerEvents: 'auto',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.68)'
                e.currentTarget.style.transform = 'scale(1.08)'
                e.currentTarget.style.boxShadow = '0 6px 28px rgba(0,0,0,0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.5)'
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'
              }}
            >
              <ChevronRight size={22} strokeWidth={2.5} />
            </button>
          ) : <div style={{ width: 44 }} />}

          {nextClip && (
            <button
              type="button"
              onClick={() => scrollToEntry(activeIndex + 1)}
              className="reel-top-btn hide-mobile"
              style={{
                height: 44, padding: '0 14px 0 10px', borderRadius: 9999,
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', pointerEvents: 'auto',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
                whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.68)'
                e.currentTarget.style.boxShadow = '0 6px 28px rgba(0,0,0,0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.5)'
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'
              }}
            >
              <ChevronDown size={18} strokeWidth={2.5} aria-hidden />
              {`Next: ${clipWord(nextClip)} ${nextClip.n} of ${nextClip.of}`}
            </button>
          )}
        </div>

        {/* Close, top right. After the arrows in the DOM so Tab follows the
            screen, left to right. */}
        <button
          type="button"
          className="reel-top-btn"
          aria-label="Close the reel"
          onClick={(e) => {
            e.stopPropagation()
            closeReel()
          }}
          style={{
            // The phone's real inset (REEL_INSET), including iPhone Safari's
            // collapsed toolbar, when the status bar covers the top.
            position: 'absolute', top: `calc(${REEL_INSET} + 20px)`, right: 11, zIndex: 30,
            width: 48, height: 48, padding: 0, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', background: 'none', border: 'none',
          }}
        >
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white',
          }}>
            <X size={18} strokeWidth={2.5} />
          </div>
        </button>


        {/* Scrollable reels */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="no-scrollbar"
          style={{
            height: '100%', overflowY: 'scroll',
            scrollSnapType: 'y mandatory',
            // A swipe past the first or last reel must rubber-band inside
            // this feed, never chain into scrolling the document.
            overscrollBehaviorY: 'contain',
          }}
        >
          {entries.map((entry, i) => (
            <Reel
              key={entry.key}
              exp={entry.exp}
              clip={entry.clip}
              isActive={i === activeIndex}
              near={Math.abs(i - activeIndex) <= 1}
              ahead={i === activeIndex + 1}
              // A clip moves on unless it is the feed's last reel; a tour moves
              // on into its guest clips when it has them.
              advancesAtEnd={entry.clip ? i < entries.length - 1 : !!entries[i + 1]?.clip}
              clipCount={clipsByTour.get(entry.exp.id)?.length ?? 0}
              muted={clipsMuted}
              onMuted={setClipsMuted}
              onEnded={() => scrollToEntry(i + 1)}
              canAdvance={() => !holdFeed()}
              onPlayClip={playClip}
              onComments={() => {
                const mobile = window.matchMedia('(max-width: 767px)').matches
                if (mobile) { setMobileComments(true); return }
                const input = document.querySelector<HTMLInputElement>('[data-desktop-comment-input]')
                input?.focus()
                input?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
              }}
            />
          ))}
        </div>
      </div>

      {/* ── RIGHT: Comments panel (hidden on mobile) ── */}
      <div className="hide-mobile reel-panel" style={{
        flex: 1,
        // Warm "jewel-box" ground with a top-right light source + a gold seam,
        // instead of a flat black slab.
        background: 'radial-gradient(120% 80% at 100% 0%, #1A1917 0%, #141312 52%, #0D0C0B 100%)',
        borderLeft: '1px solid rgba(166,139,60,0.18)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 17, color: 'white' }}>
                Comments
              </h2>
              <span style={{
                padding: '2px 8px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.08)',
                fontSize: 12, fontWeight: 600, color: '#cccccc',
                fontFamily: 'var(--font-dm-sans)',
              }}>
                {activeComments.length}
              </span>
            </div>
            <p className="reel-panel-sub" style={{ fontSize: 12, color: '#cccccc', fontFamily: 'var(--font-dm-sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeEntry?.clip ? `${activeExp.title} · ${clipWord(activeEntry.clip)} ${activeEntry.clip.n} of ${activeEntry.clip.of}` : activeExp.title}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {items.length > 0 && (
              <Link
                href={checkoutHref}
                className="reel-checkout"
                aria-label={`Checkout (${items.length})`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  height: 44, padding: '0 16px',
                  borderRadius: 9999,
                  background: 'var(--gold)',
                  color: 'var(--gold-ink)',
                  fontSize: 13, fontWeight: 700,
                  fontFamily: 'var(--font-dm-sans)',
                  textDecoration: 'none', whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                <ShoppingBag size={14} aria-hidden />
                {/* A narrow panel keeps the bag and the count. */}
                <span className="reel-checkout-word">Checkout</span>
                {`(${items.length})`}
              </Link>
            )}
            <button
              onClick={closeReel}
              aria-label="Close comments and return"
              style={{
                width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)',
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: '#cccccc', transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Creator card */}
        <div style={{
          padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(255,255,255,0.03)',
        }}>
          {isMaplCreator(activeExp.creator) ? (
            <MaplAvatar size={36} border="2px solid rgba(255,255,255,0.15)" />
          ) : (
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: activeExp.gradient, flexShrink: 0,
              border: '2px solid rgba(255,255,255,0.15)',
            }} />
          )}
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', color: 'white' }}>
              @{displayHandle(activeExp.creator)}
            </span>
          </div>
          <div style={{
            padding: '6px 14px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.08)',
            fontSize: 13, fontFamily: 'var(--font-dm-sans)', fontWeight: 700, color: 'white',
          }}>
            ${activeExp.price}
          </div>
        </div>

        {/* Comments list */}
        <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {activeComments.length === 0 ? (
            <DesktopTourPanel key={activeExp.id} exp={activeExp} />
          ) : (
            activeComments.map((comment) => (
              <div key={comment.id} style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Avatar src={comment.avatarUrl} name={comment.user} size={34} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', color: 'white' }}>
                        {comment.isHandle ? '@' : ''}{comment.user}
                      </span>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)', fontFamily: 'var(--font-dm-sans)' }}>
                        {comment.time}
                      </span>
                    </div>
                    <p style={{
                      fontSize: 13, color: '#cccccc',
                      fontFamily: 'var(--font-dm-sans)', lineHeight: 1.5, marginBottom: 8,
                    }}>{comment.text}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <button style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 12, color: 'rgba(255,255,255,0.66)', fontFamily: 'var(--font-dm-sans)',
                      }}><ThumbsUp size={12} /> {comment.likes}</button>
                      <button
                        onClick={() => {
                          if (!isLoggedIn && activeExp) {
                            window.location.href = `/login?redirect=/experience/${slugify(activeExp.title)}`
                            return
                          }
                          // Seed comments (from the experience JSON) have no
                          // supabaseId, fall back to a plain @-mention so the
                          // Reply button still works.
                          if (comment.supabaseId) {
                            setReplyingTo({ id: comment.supabaseId, user: (comment.isHandle ? '@' : '') + comment.user })
                          } else {
                            setReplyingTo(null)
                          }
                          setCommentText(`${(comment.isHandle ? '@' : '') + comment.user} `)
                        }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 12, color: 'rgba(255,255,255,0.66)', fontFamily: 'var(--font-dm-sans)',
                        }}
                      >{t('Reply')}</button>
                    </div>
                  </div>
                </div>

                {/* Replies */}
                {comment.replies && comment.replies.length > 0 && (
                  <div style={{ marginLeft: 44, marginTop: 12, borderLeft: '2px solid rgba(255,255,255,0.06)', paddingLeft: 14 }}>
                    {comment.replies.map((reply) => (
                      <div key={reply.id} style={{ marginBottom: 14, display: 'flex', gap: 8 }}>
                        <Avatar src={reply.avatarUrl} name={reply.user} size={26} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', color: 'white' }}>
                              {reply.isHandle ? '@' : ''}{reply.user}
                            </span>
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)', fontFamily: 'var(--font-dm-sans)' }}>
                              {reply.time}
                            </span>
                          </div>
                          <p style={{
                            fontSize: 12, color: 'rgba(255,255,255,0.6)',
                            fontFamily: 'var(--font-dm-sans)', lineHeight: 1.5,
                          }}>{reply.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Comment input */}
        <div style={{
          padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Reply indicator */}
          {replyingTo && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 0 8px',
              fontSize: 12, color: 'rgba(255,255,255,0.72)', fontFamily: 'var(--font-dm-sans)',
            }}>
              <span>Replying to <span style={{ color: 'white', fontWeight: 600 }}>{replyingTo.user}</span></span>
              <button
                onClick={() => { setReplyingTo(null); setCommentText('') }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-dm-sans)',
                }}
              >
                Cancel
              </button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar
              src={currentUser?.user_metadata?.avatar_url ?? null}
              name={currentUser?.user_metadata?.full_name ?? currentUser?.user_metadata?.name ?? currentUser?.email ?? 'You'}
              size={30}
            />
            <input
              type="text"
              aria-label={isLoggedIn ? 'Write a comment' : 'Sign in to comment'}
              data-desktop-comment-input
              placeholder={isLoggedIn ? (replyingTo ? `Reply to ${replyingTo.user}...` : 'Add a comment...') : 'Sign in to comment...'}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addComment()}
              readOnly={!isLoggedIn}
              onClick={() => {
                // Deliberate activation only: focusing must never change
                // context (WCAG 3.2.1). A click on the read-only field is an
                // explicit choice to go sign in.
                if (!isLoggedIn && activeExp) {
                  window.location.href = `/login?redirect=/experience/${slugify(activeExp.title)}`
                }
              }}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.06)',
                border: replyingTo ? '1px solid rgba(255,179,0,0.3)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 9999,
                minHeight: 44, padding: '0 16px', fontSize: 16,
                fontFamily: 'var(--font-dm-sans)',
                color: 'white', outline: 'none',
              }}
            />
            {commentText.trim() && (
              <button
                onClick={addComment}
                aria-label="Post comment"
                style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: '#FFFC00', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Send size={15} color="#000" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile bottom bar (YouTube Shorts style) ──
          Always there on phones, with a job in every state, so adding a tour
          never moves the screen: it used to appear on the first add and push
          the button 61px up from under the thumb. With an empty trip it
          names the next tour (teaching the swipe, and doing the same on a
          tap); at the end of the 14 it says so and goes back to the first,
          a stopping point rather than an endless feed. With a trip: Checkout,
          the one money action, full width. Comments are the rail's button
          only; a second speech bubble here opened the same sheet. */}
      <div ref={mobileBarRef} data-mobile-bottom-bar className="hide-desktop" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 310,
        background: 'var(--bg-dark)', borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {items.length === 0 && (() => {
          const next = entries[activeIndex + 1]
          const last = !next
          return (
            <button
              type="button"
              className="reel-next"
              onClick={() => scrollToEntry(last ? 0 : activeIndex + 1)}
              style={{
                flex: 1, minWidth: 0, minHeight: 48, padding: '0 16px', borderRadius: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
                color: 'white', fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
                cursor: 'pointer',
              }}
            >
              <ChevronUp size={18} strokeWidth={2.5} className="reel-next-chevron" aria-hidden />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {last
                  ? `That's all ${feedExperiences.length}. Back to the first`
                  : next.clip
                    ? `Next: ${clipWord(next.clip)} ${next.clip.n} of ${next.clip.of}`
                    : `Next: ${next.exp.title}`}
              </span>
            </button>
          )
        })()}
        {items.length > 0 && (
          <Link
            href={checkoutHref}
            className="reel-checkout"
            style={{
              // The one money action on the reel. btn-primary's near-black
              // on the bar's near-black read as a grey pill and guests
              // missed it; the brand gold with its AAA ink (8:1) is the
              // brightest thing on the bar, and the glow lifts it off it.
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              minHeight: 48, padding: '0 20px', borderRadius: 9999,
              background: 'var(--gold)', color: 'var(--gold-ink)',
              boxShadow: '0 6px 20px rgba(201, 169, 78, 0.35)',
              fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            <ShoppingBag size={18} aria-hidden />
            {`Checkout (${items.length})`}
          </Link>
        )}
      </div>

      {/* ── Mobile comments sheet, draggable, half → full → close ── */}
      {mobileComments && (
        <MobileCommentsSheet
          comments={activeComments}
          commentText={commentText}
          setCommentText={setCommentText}
          addComment={addComment}
          onClose={() => setMobileComments(false)}
          replyingTo={replyingTo}
          setReplyingTo={setReplyingTo}
          isLoggedIn={isLoggedIn}
          slug={activeExp ? slugify(activeExp.title) : ''}
        />
      )}
    </div>
  )
}
