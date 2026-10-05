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
import { Play, X, Check, Upload, Film } from 'lucide-react'
import {
  useExperienceVideos,
  useMyVideoProgress,
  uploadTourVideo,
  captureVideoThumbnail,
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
  /** Open on the upload sheet: a guest back from signing in to post. */
  startUpload?: boolean
  /** The reel's own add, so the sheet books the same way. */
  cta?: TourDetailsCta
  /** Play this clip in the reel: guest clips are reels after their tour
   *  (components/ExperienceDetail), so a card here closes the sheet and the
   *  reel scrolls to it, rather than opening a second viewer. */
  onPlay: (clipId: string) => void
  onClose: () => void
}

export default function UserTourVideos({ exp, startUpload, cta, onPlay, onClose }: Props) {
  const slug = slugify(exp.title)
  const { videos, loading, error, refresh } = useExperienceVideos(exp.id)
  const { user, loading: authLoading } = useAuth()
  const [uploadOpen, setUploadOpen] = useState(false)
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

  // Back from signing in to post: the upload sheet, once auth has settled.
  const uploadDone = useRef(false)
  useEffect(() => {
    if (uploadDone.current || !startUpload || authLoading) return
    uploadDone.current = true
    if (user) setUploadOpen(true)
  }, [startUpload, authLoading, user])

  // Counted as clip_play by the reel once it holds the screen, not here too.
  const openClip = (clip: TourVideo) => onPlay(clip.id)
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
            {/* The terms of the reel's "Save 5%" bubble, on the first screen
                whatever the sheet holds, so the tap always shows them. */}
            <p className="clips-reward">{`Post clips from your trip: ${VIDEO_REWARD_MILESTONE} approved get you 5% off your next tour.`}</p>
          </div>
          <button type="button" className="clips-x" onClick={requestClose} aria-label="Close guest clips">
            <X size={20} aria-hidden />
          </button>
        </div>

        <div className="clips-body">
          {loading ? (
            <ClipsSkeleton />
          ) : error && count === 0 ? (
            <div className="clips-empty" role="status">
              <div className="clips-empty-icon" aria-hidden><Film size={22} /></div>
              <h3>The clips did not load</h3>
              <p>Check your connection and try again.</p>
              <button type="button" className="clips-retry" onClick={() => { void refresh() }}>Try again</button>
            </div>
          ) : count === 0 ? (
            <div className="clips-empty">
              <div className="clips-empty-icon" aria-hidden><Film size={22} /></div>
              <h3>No guest clips here yet</h3>
              <p>When guests post clips from this tour, you will see them here, straight from their phones.</p>
            </div>
          ) : (
            <ul className="clips-grid" aria-label="Clips">
              {videos.map((v) => (
                <li key={v.id}>
                  <ClipCard video={v} onOpen={() => openClip(v)} />
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
function BuyRow({ exp, cta, onAdd }: { exp: Experience; cta: TourDetailsCta; onAdd: () => void }) {
  const { t, formatPrice } = useI18n()
  return (
    <div className="clips-buy">
      <div style={{ minWidth: 0 }}>
        <div className="clips-price">
          <b>{formatPrice(exp.price)}</b>
          <span>{priceUnitLabel(exp.pricing)}</span>
        </div>
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
          Post a clip from your phone. Every approved clip counts toward your 5% off.
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
