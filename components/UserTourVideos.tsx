'use client'

/**
 * Guest clips: the sheet the reel's "Clips" button opens.
 *
 * Who reads it, in order: a visitor deciding whether to book (nearly
 * everyone), then the occasional past guest with footage to post. So the
 * sheet leads with the clips themselves, puts the invitation to post below
 * them, and pins the tour's price and Add to Trip at its foot, so proof and
 * the decision it supports share one screen. With no clips yet (every tour,
 * at the time of writing) it says so plainly instead of pretending.
 *
 * Three dialogs, each portaled to <body>: the sheet, the full-screen clip
 * viewer and the upload sheet. Rendered in place they lived inside the
 * reel's scroller, whose stacking context capped them and whose scroll
 * caught the swipes; the shared focus trap closes only the top one on
 * Escape (lib/use-focus-trap).
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Play, Pause, Volume2, VolumeX, ChevronLeft, ChevronRight, X, Check, Upload, Send, Film } from 'lucide-react'
import {
  useExperienceVideos,
  useMyVideoProgress,
  uploadTourVideo,
  captureVideoThumbnail,
  fetchApprovedVideo,
  readVideoDuration,
  validateVideoFile,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_DURATION_SEC,
  VIDEO_REWARD_MILESTONE,
  type TourVideo,
} from '@/lib/tour-videos'
import { priceUnitLabel, slugify, type Experience } from '@/lib/experiences'
import { useAuth } from '@/lib/supabase/auth-context'
import { createClient } from '@/lib/supabase/client'
import { formatGuestLabel, normalizeSocialHandle } from '@/lib/social-handle'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { useI18n } from '@/lib/i18n'
import { CANCELLATION_SUMMARY } from '@/lib/refund-pricing'
import { CLIPS_POST_QUERY } from '@/lib/safe-redirect'
import { trackClipsEvent } from '@/lib/analytics'
import type { TourDetailsCta } from '@/components/TourDetailsSheet'
import Avatar from '@/components/Avatar'

interface Props {
  exp: Experience
  /** Open the viewer on this clip once the gallery loads (?clip= links). */
  initialVideoId?: string | null
  /** Open on the upload sheet: a guest back from signing in to post. */
  startUpload?: boolean
  /** The reel's own add, so the sheet and the viewer book the same way. */
  cta?: TourDetailsCta
  onClose: () => void
}

export default function UserTourVideos({ exp, initialVideoId, startUpload, cta, onClose }: Props) {
  const slug = slugify(exp.title)
  const { videos, loading, refresh } = useExperienceVideos(exp.id)
  const { user, loading: authLoading } = useAuth()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [viewing, setViewing] = useState<{ list: TourVideo[]; index: number } | null>(null)
  const titleId = useId()

  // Closing plays a short exit before unmounting (a timer, not
  // animationend, so the sheet can never stick open if motion is off).
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const requestClose = useCallback(() => {
    if (closeTimer.current !== null) return
    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setClosing(true)
    closeTimer.current = window.setTimeout(onClose, instant ? 0 : 160)
  }, [onClose])
  useEffect(() => () => { if (closeTimer.current !== null) clearTimeout(closeTimer.current) }, [])

  const sheetRef = useRef<HTMLDivElement>(null)
  useFocusTrap(sheetRef, requestClose)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // A shared clip opens straight in the viewer. One missing from the loaded
  // window (older than the newest 40, or a stale cache) is fetched alone;
  // an unapproved or unknown id quietly leaves the plain sheet.
  const deepLinkDone = useRef(false)
  useEffect(() => {
    if (deepLinkDone.current || !initialVideoId || loading) return
    deepLinkDone.current = true
    const idx = videos.findIndex((v) => v.id === initialVideoId)
    if (idx >= 0) { setViewing({ list: videos, index: idx }); return }
    fetchApprovedVideo(initialVideoId, exp.id)
      .then((v) => { if (v) setViewing({ list: [v], index: 0 }) })
      .catch(() => {})
  }, [initialVideoId, loading, videos, exp.id])

  // Back from signing in to post: the upload sheet, once auth has settled.
  const uploadDone = useRef(false)
  useEffect(() => {
    if (uploadDone.current || !startUpload || authLoading) return
    uploadDone.current = true
    if (user) setUploadOpen(true)
  }, [startUpload, authLoading, user])

  const openClip = (index: number) => {
    setViewing({ list: videos, index })
    trackClipsEvent('clip_play', slug)
  }
  const startPost = () => {
    setUploadOpen(true)
    trackClipsEvent('clip_post_start', slug)
  }
  // Added from in here, the clips close: the reel's notice (with the day it
  // picked and an Undo) and its new "In your trip" are what to see next.
  const add = cta ? () => { cta.onAdd(); requestClose() } : undefined

  const count = videos.length
  // Close only on a true scrim click: press and release both on the
  // backdrop, so a drag that ends outside the sheet never dismisses it.
  const scrimPress = useRef(false)

  return createPortal(
    <div
      className={closing ? 'clips-overlay closing' : 'clips-overlay'}
      onPointerDown={(e) => { scrimPress.current = e.target === e.currentTarget }}
      onClick={(e) => {
        // Portaled in the DOM, but React still bubbles this click through
        // the reel, whose root toggles its video: a tap in here (or in the
        // viewer and upload sheet, which render inside) must stop here.
        e.stopPropagation()
        if (scrimPress.current && e.target === e.currentTarget) requestClose()
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="clips-sheet clips-dark"
      >
        <div className="clips-head">
          <div style={{ minWidth: 0 }}>
            <h2 id={titleId} className="clips-title">Guest clips</h2>
            <p className="clips-sub">
              {loading || count === 0
                ? exp.title
                : `${count} ${count === 1 ? 'clip' : 'clips'} filmed by guests on ${exp.title}`}
            </p>
          </div>
          <button type="button" className="clips-x" onClick={requestClose} aria-label="Close guest clips">
            <X size={20} aria-hidden />
          </button>
        </div>

        <div className="clips-body">
          {loading ? (
            <ClipsSkeleton />
          ) : count === 0 ? (
            <div className="clips-empty">
              <div className="clips-empty-icon" aria-hidden><Film size={22} /></div>
              <h3>No guest clips here yet</h3>
              <p>When guests post clips from this tour, you will see them here, straight from their phones.</p>
            </div>
          ) : (
            <ul className="clips-grid" aria-label="Clips">
              {videos.map((v, i) => (
                <li key={v.id}>
                  <ClipCard video={v} onOpen={() => openClip(i)} />
                </li>
              ))}
            </ul>
          )}

          <GuestInvite slug={slug} hasClips={count > 0} onPost={startPost} />
        </div>

        {cta && add && (
          <div className="clips-foot">
            <BuyRow exp={exp} cta={cta} onAdd={add} />
            {cta.blocked && !cta.inCart && cta.swapLine && (
              <p className="clips-terms clips-terms--why">{cta.swapLine}</p>
            )}
            <p className="clips-terms">{CANCELLATION_SUMMARY.short}.</p>
          </div>
        )}
      </div>

      {viewing && (
        <ClipViewer
          videos={viewing.list}
          startIndex={viewing.index}
          exp={exp}
          cta={cta && add ? { ...cta, onAdd: add } : undefined}
          onClose={() => setViewing(null)}
        />
      )}

      {uploadOpen && (
        <UploadSheet
          exp={exp}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            trackClipsEvent('clip_posted', slug)
            void refresh()
          }}
        />
      )}
    </div>,
    document.body,
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   The price and the add, as the reel and the details sheet show them
   ───────────────────────────────────────────────────────────────────────── */
function BuyRow({ exp, cta, onAdd, compact = false }: { exp: Experience; cta: TourDetailsCta; onAdd: () => void; compact?: boolean }) {
  const { t, formatPrice } = useI18n()
  return (
    <div className="clips-buy">
      <div style={{ minWidth: 0 }}>
        {compact && <p className="clip-bar-title">{exp.title}</p>}
        <div className="clips-price">
          <b>{formatPrice(exp.price)}</b>
          <span>{priceUnitLabel(exp.pricing)}</span>
        </div>
        {compact && cta.blocked && !cta.inCart && cta.swapLine && <p className="clip-bar-why">{cta.swapLine}</p>}
      </div>
      {cta.inCart ? (
        <Link
          href="/checkout"
          className="clips-add clips-add--in"
          aria-label={`${t('In your trip')}: ${exp.title}. Go to checkout`}
        >
          <Check size={16} strokeWidth={3} color="#4ADE80" aria-hidden /> {t('In your trip')}
        </Link>
      ) : (
        <button
          type="button"
          className="clips-add"
          onClick={onAdd}
          aria-label={`${cta.blocked ? t('Book this instead') : t('Add to Trip')}: ${exp.title}`}
        >
          {cta.blocked ? t('Book this instead') : t('Add to Trip')}
        </button>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Gallery card
   ───────────────────────────────────────────────────────────────────────── */
function clipTime(sec: number | null | undefined): string | null {
  if (!sec || sec <= 0) return null
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function clipDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

function ClipCard({ video, onOpen }: { video: TourVideo; onOpen: () => void }) {
  const by = formatGuestLabel(video.uploader_handle, video.uploader_name, 'A guest')
  const time = clipTime(video.duration_seconds)
  return (
    <button
      type="button"
      className="clip-card"
      onClick={onOpen}
      // The visible words in their visible order, then the action, so a
      // speech user can say what they see (WCAG 2.5.3).
      aria-label={`${by}${video.caption ? `: ${video.caption}` : ''}${time ? ` (${time})` : ''}. Play clip`}
    >
      {video.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.thumbnail_url} alt="" loading="lazy" decoding="async" />
      ) : (
        <video src={`${video.video_url}#t=0.5`} muted playsInline preload="metadata" aria-hidden />
      )}
      <span className="clip-card-scrim" aria-hidden />
      <span className="clip-card-by" aria-hidden>
        <span className="clip-card-name">
          <Avatar src={video.uploader_avatar_url} name={video.uploader_name} size={24} ring />
          <span>{by}</span>
        </span>
        {video.caption && <span className="clip-card-cap">{video.caption}</span>}
      </span>
      {time && (
        <span className="clip-card-time" aria-hidden>
          <Play size={10} fill="currentColor" strokeWidth={0} /> {time}
        </span>
      )}
    </button>
  )
}

function ClipsSkeleton() {
  return (
    <div className="clips-grid" aria-busy="true" aria-label="Loading clips">
      {[0, 1, 2, 3].map((i) => <div key={i} className="clip-skeleton" />)}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   The invitation to post, with the guest's own progress once signed in
   ───────────────────────────────────────────────────────────────────────── */
function GuestInvite({ slug, hasClips, onPost }: { slug: string; hasClips: boolean; onPost: () => void }) {
  const { user, loading: authLoading } = useAuth()
  const { pending, towardNext, availableRewards, loading } = useMyVideoProgress()
  const reward = availableRewards[0]
  const signIn = `/login?redirect=${encodeURIComponent(`/experience/${slug}?${CLIPS_POST_QUERY}`)}`
  const left = VIDEO_REWARD_MILESTONE - towardNext

  return (
    <section className="clips-invite" aria-labelledby="clips-invite-title">
      <div>
        <h3 id="clips-invite-title">{hasClips ? 'Been on this tour? Add yours' : 'Been on this tour?'}</h3>
        <p>
          Post a clip from your phone. Every approved clip counts, and {VIDEO_REWARD_MILESTONE} get you 5% off your next trip.
        </p>
      </div>

      {user && !loading && reward && (
        <p className="clips-reward" role="status">
          Your 5% off is ready: <strong>{reward.code}</strong>. Use it at checkout.
        </p>
      )}

      {user && !loading && !reward && (towardNext > 0 || pending > 0) && (
        <div>
          <div
            className="clips-progress"
            role="progressbar"
            aria-label="Approved clips toward 5% off"
            aria-valuemin={0}
            aria-valuemax={VIDEO_REWARD_MILESTONE}
            aria-valuenow={towardNext}
          >
            <span style={{ width: `${(towardNext / VIDEO_REWARD_MILESTONE) * 100}%` }} />
          </div>
          <p className="clips-progress-text">
            {towardNext} of {VIDEO_REWARD_MILESTONE} approved{pending > 0 ? ` · ${pending} in review` : ''}
            {towardNext > 0 ? ` · ${left} to go` : ''}
          </p>
        </div>
      )}

      {authLoading ? null : user ? (
        <button type="button" className="clips-btn-ghost" onClick={onPost}>
          <Upload size={17} strokeWidth={2.25} aria-hidden /> Post a clip
        </button>
      ) : (
        <Link href={signIn} className="clips-btn-ghost">
          <Upload size={17} strokeWidth={2.25} aria-hidden /> Sign in to post a clip
        </Link>
      )}
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Full-screen viewer: swipe between clips, book from the bar beneath them
   ───────────────────────────────────────────────────────────────────────── */
function ClipViewer({ videos, startIndex, exp, cta, onClose }: {
  videos: TourVideo[]
  startIndex: number
  exp: Experience
  cta?: TourDetailsCta
  onClose: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(startIndex)
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // How far the clip on screen has played, 0 to 1, for its story segment.
  const [played, setPlayed] = useState(0)
  useEffect(() => { setPlayed(0) }, [index])
  useFocusTrap(rootRef, onClose)

  // Reduced motion: nothing starts on its own; the play button does.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true)
  }, [])

  useEffect(() => {
    const rail = railRef.current
    if (rail) rail.scrollTo({ left: startIndex * rail.clientWidth, behavior: 'instant' as ScrollBehavior })
  }, [startIndex])

  const onScroll = useCallback(() => {
    const rail = railRef.current
    if (!rail || rail.clientWidth === 0) return
    const next = Math.round(rail.scrollLeft / rail.clientWidth)
    setIndex((prev) => (prev !== next ? next : prev))
  }, [])

  const goTo = useCallback((to: number) => {
    const rail = railRef.current
    if (!rail || to < 0 || to >= videos.length) return
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    rail.scrollTo({ left: to * rail.clientWidth, behavior: smooth ? 'smooth' : ('instant' as ScrollBehavior) })
  }, [videos.length])

  // Arrows step, M mutes, Space plays or pauses unless a control has focus
  // (Space on a button must press that button). Escape is the trap's.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && !rootRef.current?.contains(e.target) && e.target !== document.body) return
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1) }
      else if (e.key === 'm' || e.key === 'M') setMuted((m) => !m)
      else if (e.key === ' ' && !(e.target instanceof HTMLElement && e.target.closest('button, a, input, textarea'))) {
        e.preventDefault()
        setPaused((p) => !p)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, goTo])

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2200)
  }
  const share = async () => {
    const clip = videos[index]
    if (!clip) return
    const url = `${window.location.origin}/experience/${slugify(exp.title)}?clip=${clip.id}`
    if (typeof navigator.share === 'function') {
      try {
        const data: ShareData = { title: exp.title, text: `A guest's clip from ${exp.title}, Jamaica`, url }
        if (!navigator.canShare || navigator.canShare(data)) { await navigator.share(data); return }
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return
      }
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url)
      } else {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      showToast('Link copied. Send it to whoever you are travelling with.')
    } catch {
      showToast('Could not copy the link. Long-press the address bar instead.')
    }
  }

  const current = videos[index]
  const by = current ? formatGuestLabel(current.uploader_handle, current.uploader_name, 'A guest') : ''

  return (
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label="Guest clip" tabIndex={-1} className="clip-viewer">
      <div className="clip-stage">
        <div className="clip-top">
          {videos.length > 1 && (
            <div className="clip-segs" aria-hidden>
              {videos.map((v, i) => (
                <span key={v.id}>
                  <i style={{ transform: `scaleX(${i < index ? 1 : i === index ? played : 0})` }} />
                </span>
              ))}
            </div>
          )}
          <p className="sr-only" aria-live="polite">Clip {index + 1} of {videos.length}, by {by}</p>
          <button type="button" className="clip-ctl" onClick={onClose} aria-label="Close clip" style={{ marginLeft: 'auto' }}>
            <X size={20} aria-hidden />
          </button>
        </div>

        <div ref={railRef} className="clip-rail" onScroll={onScroll}>
          {videos.map((v, i) => (
            <ClipSlide
              key={v.id}
              video={v}
              active={i === index}
              next={i === index + 1}
              onProgress={i === index ? setPlayed : undefined}
              muted={muted}
              paused={paused}
              onPausedChange={setPaused}
              onEnded={() => (i < videos.length - 1 ? goTo(i + 1) : undefined)}
              loop={i === videos.length - 1}
            />
          ))}
        </div>

        <div className="clip-side">
          <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={!muted}>
            <span className="reel-action-disc">{muted ? <VolumeX size={22} aria-hidden /> : <Volume2 size={22} aria-hidden />}</span>
            <span className="clip-side-label">{muted ? 'Sound' : 'Mute'}</span>
          </button>
          <button type="button" onClick={share} aria-label="Send this clip">
            <span className="reel-action-disc"><Send size={21} aria-hidden /></span>
            <span className="clip-side-label">Send</span>
          </button>
        </div>

        {videos.length > 1 && (
          <>
            <button type="button" className="clip-arrow clip-arrow--prev" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous clip">
              <ChevronLeft size={24} aria-hidden />
            </button>
            <button type="button" className="clip-arrow clip-arrow--next" onClick={() => goTo(index + 1)} disabled={index === videos.length - 1} aria-label="Next clip">
              <ChevronRight size={24} aria-hidden />
            </button>
          </>
        )}

        {toast && <p className="clip-toast" role="status">{toast}</p>}
      </div>

      {cta && (
        <div className="clip-bar">
          <div className="clip-bar-inner">
            <BuyRow exp={exp} cta={cta} onAdd={cta.onAdd} compact />
            <p className="clip-bar-terms">{CANCELLATION_SUMMARY.short}.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function ClipSlide({ video, active, next, onProgress, muted, paused, onPausedChange, onEnded, loop }: {
  video: TourVideo
  active: boolean
  /** The clip after the one on screen: fetched ahead so a swipe or the
   *  auto-advance starts it without a loading gap. */
  next: boolean
  onProgress?: (fraction: number) => void
  muted: boolean
  paused: boolean
  onPausedChange: (p: boolean) => void
  onEnded: () => void
  loop: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const by = formatGuestLabel(video.uploader_handle, video.uploader_name, 'A guest')
  const date = clipDate(video.created_at)

  // A clip starts from the top each time it becomes the one on screen;
  // pausing and resuming it carries on from where it was.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!active) { el.pause(); return }
    el.currentTime = 0
  }, [active])

  useEffect(() => {
    const el = ref.current
    if (!el || !active) return
    if (paused) el.pause()
    // Refused autoplay shows the play button; an AbortError is only a
    // swipe interrupting a start, and must not pause the next clip.
    else el.play().catch((err: DOMException) => { if (err?.name === 'NotAllowedError') onPausedChange(true) })
  }, [active, paused, onPausedChange])

  useEffect(() => { if (ref.current) ref.current.muted = muted }, [muted])

  return (
    <div className="clip-slide" aria-hidden={!active}>
      <div className="clip-frame">
        <video
          ref={ref}
          src={active || next ? video.video_url : undefined}
          poster={video.thumbnail_url ?? undefined}
          playsInline
          loop={loop}
          muted={muted}
          preload={active || next ? 'auto' : 'none'}
          onLoadedData={() => setReady(true)}
          onTimeUpdate={onProgress ? (e) => {
            const v = e.currentTarget
            if (v.duration > 0) onProgress(v.currentTime / v.duration)
          } : undefined}
          onEnded={onEnded}
          onClick={() => onPausedChange(!paused)}
        />
        {active && !ready && <span className="clip-loading" aria-hidden>Loading</span>}
        {active && (
          <button
            type="button"
            className={paused ? 'reel-play-toggle reel-play-toggle--paused' : 'reel-play-toggle'}
            aria-label={paused ? 'Play clip' : 'Pause clip'}
            onClick={() => onPausedChange(!paused)}
          >
            {paused ? <Play size={24} fill="white" strokeWidth={0} aria-hidden /> : <Pause size={22} fill="white" strokeWidth={0} aria-hidden />}
          </button>
        )}
        <span className="clip-slide-scrim" aria-hidden />
        <div className="clip-byline">
          {/* The name beside it says who; the picture is decoration. */}
          <span aria-hidden><Avatar src={video.uploader_avatar_url} name={video.uploader_name} size={36} ring /></span>
          <div style={{ minWidth: 0 }}>
            <p className="clip-byline-name">{by}</p>
            <p className="clip-byline-meta">Guest clip{date ? ` · ${date}` : ''}</p>
            {video.caption && <p className="clip-byline-cap">{video.caption}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Upload sheet: pick, add a caption and a credit, send for review
   ───────────────────────────────────────────────────────────────────────── */
function UploadSheet({ exp, onClose, onUploaded }: {
  exp: Experience
  onClose: () => void
  onUploaded: () => void
}) {
  const { user } = useAuth()
  const progress = useMyVideoProgress()
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [handle, setHandle] = useState<string>(() => {
    const v = user?.user_metadata?.social_handle
    return typeof v === 'string' ? v : ''
  })
  const [duration, setDuration] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const ids = useId()
  // While a clip is uploading, closing would orphan it mid-flight.
  useFocusTrap(sheetRef, () => { if (!uploading) onClose() })

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const pick = async (f: File) => {
    setError(null)
    const v = validateVideoFile(f)
    if (!v.ok) { setError(v.error ?? 'That file could not be read. Pick another clip.'); return }
    const dur = await readVideoDuration(f)
    if (dur && dur > VIDEO_MAX_DURATION_SEC) {
      setError(`This clip is ${dur} seconds and the limit is ${VIDEO_MAX_DURATION_SEC}. Trim it on your phone and pick it again.`)
      return
    }
    setFile(f)
    setDuration(dur)
    setPreviewUrl(URL.createObjectURL(f))
  }

  const clear = () => {
    setFile(null)
    setPreviewUrl(null)
    setDuration(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const submit = async () => {
    if (!file || uploading) return
    // The credit handle is optional and checked only when typed; saving it
    // is best-effort and never blocks the clip.
    const typed = handle.trim()
    const normalized = normalizeSocialHandle(typed)
    if (typed && !normalized) {
      setError('Handles are 2 to 30 letters, numbers, dots or underscores. Fix it or leave it blank.')
      return
    }
    setUploading(true)
    setError(null)
    // Written whenever there is a handle (idempotent; the users row can lag
    // auth metadata) and when a saved one was blanked, which removes it.
    const prior = normalizeSocialHandle(user?.user_metadata?.social_handle)
    if (user && (normalized || prior)) {
      const next = normalized ?? null
      const supabase = createClient()
      await supabase.auth.updateUser({ data: { social_handle: next } })
      const { error: handleErr } = await supabase.from('users').upsert({ id: user.id, social_handle: next }, { onConflict: 'id' })
      if (handleErr) console.warn('[upload] social_handle save skipped', handleErr.message)
    }
    // Poster frame for the gallery; null only means the card uses the video.
    const thumbnail = await captureVideoThumbnail(file)
    const res = await uploadTourVideo({ experienceId: exp.id, file, caption, durationSeconds: duration ?? undefined, thumbnail })
    setUploading(false)
    if (!res.ok) { setError(res.error ?? 'The upload did not go through. Check your connection and send it again.'); return }
    setDone(true)
    onUploaded()
    void progress.refresh()
  }

  return createPortal(
    <div className="clips-overlay clips-overlay--top" onClick={(e) => { if (e.target === e.currentTarget && !uploading) onClose() }}>
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} tabIndex={-1} className="clips-sheet clips-dark clips-upload">
        <div className="clips-head">
          <div style={{ minWidth: 0 }}>
            <h2 id={`${ids}-t`} className="clips-title">{done ? 'Thanks. It’s in review' : 'Post a clip'}</h2>
            <p className="clips-sub">{exp.title}</p>
          </div>
          <button type="button" className="clips-x" onClick={onClose} disabled={uploading} aria-label="Close">
            <X size={20} aria-hidden />
          </button>
        </div>

        <div className="clips-body">
          {done ? (
            <div className="clips-done" role="status">
              <div className="clips-empty-icon" aria-hidden><Check size={22} strokeWidth={2.5} /></div>
              <p>We post it once it has been checked. Once approved it counts toward your 5% off, and your progress shows under Guest clips on any tour.</p>
              <button type="button" className="clips-primary" onClick={onClose}>Done</button>
            </div>
          ) : !user ? (
            <div className="clips-done">
              <p>Sign in so your clip is credited to you and counts toward your 5% off.</p>
              <Link className="clips-primary" href={`/login?redirect=${encodeURIComponent(`/experience/${slugify(exp.title)}?${CLIPS_POST_QUERY}`)}`}>Sign in</Link>
            </div>
          ) : (
            <>
              <input
                ref={inputRef}
                id={`${ids}-file`}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f) }}
              />
              {!file ? (
                <button type="button" className="clips-pick" onClick={() => inputRef.current?.click()} aria-describedby={`${ids}-rules`}>
                  <span className="clips-pick-icon" aria-hidden><Upload size={22} strokeWidth={2} /></span>
                  <span className="clips-pick-title">Choose a video</span>
                  <span id={`${ids}-rules`} className="clips-pick-rules">
                    From your camera roll. Up to {VIDEO_MAX_DURATION_SEC} seconds and {Math.round(VIDEO_MAX_BYTES / (1024 * 1024))} MB. Upright clips look best.
                  </span>
                </button>
              ) : (
                <div className="clips-preview">
                  {previewUrl && <video src={previewUrl} autoPlay muted loop playsInline aria-label="Your clip" />}
                  <span className="clips-preview-meta">{duration ? `${duration}s · ` : ''}{formatBytes(file.size)}</span>
                  <button type="button" className="clips-preview-change" onClick={clear} disabled={uploading}>
                    Change clip
                  </button>
                </div>
              )}

              {file && (
                <div className="clips-fields">
                  <label className="clips-label" htmlFor={`${ids}-cap`}>Caption <span>(optional)</span></label>
                  <textarea
                    id={`${ids}-cap`}
                    className="clips-input"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value.slice(0, 140))}
                    placeholder="What was it like?"
                    rows={2}
                    maxLength={140}
                  />
                  <label className="clips-label" htmlFor={`${ids}-handle`}>Instagram or TikTok <span>(optional)</span></label>
                  <input
                    id={`${ids}-handle`}
                    className="clips-input"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.slice(0, 40))}
                    placeholder="@yourhandle"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-describedby={`${ids}-handle-help`}
                  />
                  <p id={`${ids}-handle-help`} className="clips-help">We credit the clip to this handle here and anywhere we feature it.</p>
                </div>
              )}

              {error && <p className="clips-error" role="alert">{error}</p>}

              <p className="clips-help" style={{ marginTop: 16 }}>
                Clips go live after a quick review. Every approved clip counts toward your 5% off.
              </p>
            </>
          )}
        </div>

        {user && !done && (
          <div className="clips-foot">
            <button
              type="button"
              className="clips-primary"
              onClick={submit}
              disabled={!file || uploading}
              aria-busy={uploading}
            >
              {uploading ? 'Uploading…' : 'Send for review'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function formatBytes(b: number): string {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}
