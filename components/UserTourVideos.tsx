'use client'

/**
 * ============================================================================
 *  MAPL — User Tour Videos (Gallery + Upload + Reward)
 * ============================================================================
 *  Mobile-first, premium swipe gallery of approved user-submitted clips for a
 *  single experience. Includes the upload sheet and the reward-progress card.
 *  Designed to drop into any experience page:
 *
 *      <UserTourVideos experienceId={exp.id} experienceTitle={exp.title} />
 *
 *  Everything is composed from smaller pieces (VideoSwiper, UploadSheet,
 *  RewardProgress) so admin / profile / future surfaces can reuse them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Pause, Play, Volume2, VolumeX, ChevronLeft, ChevronRight, X, Check, Upload, Award } from 'lucide-react'
import {
  useExperienceVideos,
  useMyVideoProgress,
  uploadTourVideo,
  readVideoDuration,
  validateVideoFile,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_DURATION_SEC,
  VIDEO_REWARD_MILESTONE,
  type TourVideo,
} from '@/lib/tour-videos'
import { useAuth } from '@/lib/supabase/auth-context'

interface Props {
  experienceId: number
  experienceTitle: string
}

export default function UserTourVideos({ experienceId, experienceTitle }: Props) {
  const { videos, loading, refresh } = useExperienceVideos(experienceId)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)

  return (
    <section style={{
      padding: '36px 24px 40px',
      background: '#0F0F12',
      borderRadius: 'var(--r-xl, 22px)',
      border: '1px solid rgba(255, 179, 0, 0.14)',
      boxShadow: '0 18px 50px rgba(0, 0, 0, 0.18)',
      position: 'relative',
      overflow: 'hidden',
      color: '#fff',
    }}>
      {/* Top gold hairline — prestige cue, same as checkout Day Builder */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, #FFB300 50%, transparent)',
        opacity: 0.7, pointerEvents: 'none',
      }} />

      {/* Editorial header — no CTA, just setting the stage */}
      <div style={{ marginBottom: 26 }}>
        <p style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 11, fontWeight: 600,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: '#FFB300',
          marginBottom: 8,
        }}>
          The MAPL Feed · Guest Clips
        </p>
        <h2 style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 800,
          fontSize: 24,
          letterSpacing: '-0.025em',
          color: '#ffffff',
          lineHeight: 1.15,
          marginBottom: 6,
        }}>
          Seen on {experienceTitle}
        </h2>
        <p style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 13.5,
          lineHeight: 1.5,
          color: 'rgba(255, 255, 255, 0.55)',
          maxWidth: 460,
        }}>
          Real moments filmed on this tour by guests like you.
        </p>
      </div>

      {/* Reward progress band — sole entry point to upload; no duplicate CTAs */}
      <RewardProgressBand onStart={() => setUploadOpen(true)} />

      {/* Gallery */}
      <div style={{ marginTop: 26 }}>
        {loading ? (
          <GallerySkeleton />
        ) : videos.length === 0 ? (
          <EmptyState onUpload={() => setUploadOpen(true)} />
        ) : (
          <VideoStripe
            videos={videos}
            onOpen={(i) => setGalleryIndex(i)}
            onAdd={() => setUploadOpen(true)}
          />
        )}
      </div>

      {/* Full-screen swipeable viewer */}
      {galleryIndex !== null && (
        <VideoSwiper
          videos={videos}
          startIndex={galleryIndex}
          onClose={() => setGalleryIndex(null)}
        />
      )}

      {/* Upload sheet */}
      {uploadOpen && (
        <UploadSheet
          experienceId={experienceId}
          experienceTitle={experienceTitle}
          onClose={() => setUploadOpen(false)}
          onUploaded={async () => {
            setUploadOpen(false)
            await refresh()
          }}
        />
      )}
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Reward progress band — single prestige CTA that doubles as the upload entry
   ═══════════════════════════════════════════════════════════════════════════ */
function RewardProgressBand({ onStart }: { onStart: () => void }) {
  const { user } = useAuth()
  const { approved, towardNext, availableRewards, loading } = useMyVideoProgress()

  const baseCard: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '14px 16px',
    borderRadius: 14,
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 179, 0, 0.2)',
  }
  const kicker: React.CSSProperties = {
    margin: 0,
    fontFamily: 'var(--font-dm-sans)',
    fontSize: 10.5, fontWeight: 600,
    letterSpacing: '0.14em', textTransform: 'uppercase',
    color: '#FFB300',
  }
  const title: React.CSSProperties = {
    margin: '4px 0 0',
    fontFamily: 'var(--font-syne)',
    fontWeight: 700, fontSize: 14,
    letterSpacing: '-0.005em',
    color: '#ffffff',
    lineHeight: 1.35,
  }

  if (!user) {
    return (
      <div style={baseCard}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={kicker}>MAPL Reward</p>
          <p style={title}>Upload 5 tour videos, get 5% off your next trip</p>
        </div>
        <button onClick={onStart} style={ghostCtaStyle}>Sign in</button>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ ...baseCard, opacity: 0.55 }}>
        <div style={{ flex: 1 }}>
          <p style={kicker}>MAPL Reward</p>
          <p style={title}>Loading your progress…</p>
        </div>
      </div>
    )
  }

  const hasReward = availableRewards.length > 0
  const pct = hasReward ? 100 : (towardNext / VIDEO_REWARD_MILESTONE) * 100
  const remaining = VIDEO_REWARD_MILESTONE - towardNext

  return (
    <div style={baseCard}>
      {/* Left: textual progress */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={kicker}>
          {hasReward ? 'Reward unlocked' : 'MAPL Reward'}
        </p>
        <p style={title}>
          {hasReward
            ? `5% off ready · ${availableRewards[0].code}`
            : approved === 0
              ? 'Share 5 clips, earn 5% off'
              : `${towardNext} of ${VIDEO_REWARD_MILESTONE} — ${remaining} to go`}
        </p>
        <div style={{
          position: 'relative', marginTop: 10,
          height: 5, borderRadius: 9999,
          background: 'rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${pct}%`,
            background: hasReward
              ? 'var(--emerald, #00A550)'
              : 'linear-gradient(90deg, #FFB300, #E69A00)',
            borderRadius: 9999,
            transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        </div>
      </div>

      {/* Right: single prestige CTA */}
      <button
        onClick={onStart}
        aria-label="Share a clip"
        style={goldCtaStyle}
      >
        <Upload size={15} strokeWidth={2.25} />
        <span>Share</span>
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Video stripe — prestige reel cards with a trailing "Share yours" affordance
   ═══════════════════════════════════════════════════════════════════════════ */
function VideoStripe({
  videos, onOpen, onAdd,
}: {
  videos: TourVideo[]
  onOpen: (i: number) => void
  onAdd: () => void
}) {
  return (
    <div className="no-scrollbar" style={{
      display: 'flex', gap: 12,
      overflowX: 'auto', paddingBottom: 6,
      scrollSnapType: 'x mandatory',
      WebkitOverflowScrolling: 'touch',
    }}>
      {videos.map((v, i) => (
        <button
          key={v.id}
          onClick={() => onOpen(i)}
          style={{
            flexShrink: 0, scrollSnapAlign: 'start',
            width: 170, aspectRatio: '9 / 16',
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            background: '#000',
            cursor: 'pointer', padding: 0,
            position: 'relative',
            boxShadow: '0 10px 28px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 179, 0, 0.05)',
            transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-3px)'
            e.currentTarget.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 179, 0, 0.22)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = ''
            e.currentTarget.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 179, 0, 0.05)'
          }}
        >
          {v.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={v.thumbnail_url}
              alt=""
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <video
              src={v.video_url}
              muted playsInline preload="metadata"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}

          {/* Prestige scrim — deeper gradient, more cinematic */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.78) 100%)',
            pointerEvents: 'none',
          }} />

          {/* Uploader overlay — Syne for editorial prestige */}
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: '24px 12px 12px',
            color: '#fff',
            textAlign: 'left',
          }}>
            <p style={{
              margin: 0,
              fontFamily: 'var(--font-syne)',
              fontSize: 13, fontWeight: 700,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              textShadow: '0 1px 6px rgba(0,0,0,0.6)',
            }}>
              @{v.uploader_name || 'guest'}
            </p>
          </div>

          {/* Subtle gold play glyph */}
          <div style={{
            position: 'absolute', top: 10, right: 10,
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255, 179, 0, 0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#08080A',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
          }}>
            <Play size={11} fill="currentColor" strokeWidth={0} />
          </div>
        </button>
      ))}

      {/* Trailing "Share yours" card — native to social/premium apps, eliminates redundancy */}
      <button
        onClick={onAdd}
        aria-label="Share your own clip"
        style={{
          flexShrink: 0, scrollSnapAlign: 'start',
          width: 170, aspectRatio: '9 / 16',
          borderRadius: 16,
          border: '1.5px dashed rgba(255, 179, 0, 0.35)',
          background: 'linear-gradient(180deg, rgba(255, 179, 0, 0.08) 0%, rgba(255, 179, 0, 0.02) 100%)',
          cursor: 'pointer', padding: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 12,
          transition: 'all 0.25s ease',
          color: '#fff',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255, 179, 0, 0.7)'
          e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255, 179, 0, 0.14) 0%, rgba(255, 179, 0, 0.04) 100%)'
          e.currentTarget.style.transform = 'translateY(-3px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255, 179, 0, 0.35)'
          e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255, 179, 0, 0.08) 0%, rgba(255, 179, 0, 0.02) 100%)'
          e.currentTarget.style.transform = ''
        }}
      >
        <div style={{
          width: 50, height: 50, borderRadius: '50%',
          background: '#FFB300',
          color: '#08080A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 22px rgba(255, 179, 0, 0.28)',
        }}>
          <Plus size={22} strokeWidth={2.5} />
        </div>
        <div style={{ textAlign: 'center', padding: '0 12px' }}>
          <p style={{
            margin: 0,
            fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 14,
            letterSpacing: '-0.01em',
            color: '#ffffff',
          }}>
            Share yours
          </p>
          <p style={{
            margin: '4px 0 0',
            fontFamily: 'var(--font-dm-sans)', fontSize: 11, fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.55)',
            lineHeight: 1.4,
          }}>
            Earn 5% off
          </p>
        </div>
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Swipeable viewer — full-screen, horizontal snap, mute/play controls
   ═══════════════════════════════════════════════════════════════════════════ */
function VideoSwiper({
  videos, startIndex, onClose,
}: {
  videos: TourVideo[]
  startIndex: number
  onClose: () => void
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(startIndex)
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(false)

  // Scroll to the starting card once mounted.
  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const w = rail.clientWidth
    rail.scrollTo({ left: startIndex * w, behavior: 'instant' as ScrollBehavior })
  }, [startIndex])

  // Sync the active index based on scroll position
  const onScroll = useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    const w = rail.clientWidth
    if (w === 0) return
    const next = Math.round(rail.scrollLeft / w)
    setIndex((prev) => (prev !== next ? next : prev))
  }, [])

  const goTo = (delta: number) => {
    const rail = railRef.current
    if (!rail) return
    const w = rail.clientWidth
    rail.scrollTo({ left: (index + delta) * w, behavior: 'smooth' })
  }

  // ESC / arrows for desktop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') goTo(1)
      if (e.key === 'ArrowLeft') goTo(-1)
      if (e.key === 'm') setMuted((m) => !m)
      if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  return (
    <div
      role="dialog" aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: '#000',
        animation: 'fadeUp 0.24s ease',
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', right: 16,
          zIndex: 4,
          width: 40, height: 40, borderRadius: '50%',
          border: 'none', cursor: 'pointer',
          background: 'rgba(255,255,255,0.12)',
          backdropFilter: 'blur(10px)',
          color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X size={18} />
      </button>

      {/* Counter */}
      <div style={{
        position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', left: 0, right: 0,
        zIndex: 3, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
      }}>
        <span style={{
          padding: '6px 12px', borderRadius: 9999,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(10px)',
          color: '#fff',
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 12, fontWeight: 600,
          letterSpacing: '0.04em',
        }}>
          {index + 1} / {videos.length}
        </span>
      </div>

      {/* Desktop arrows */}
      <NavArrow dir="left"  disabled={index === 0}                  onClick={() => goTo(-1)} />
      <NavArrow dir="right" disabled={index === videos.length - 1}  onClick={() => goTo(1)} />

      {/* Horizontal snap rail */}
      <div
        ref={railRef}
        onScroll={onScroll}
        className="no-scrollbar"
        style={{
          height: '100%', width: '100%',
          overflowX: 'auto', overflowY: 'hidden',
          display: 'flex',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {videos.map((v, i) => (
          <SwiperSlide
            key={v.id}
            video={v}
            active={i === index}
            muted={muted}
            paused={paused}
            onTogglePaused={() => setPaused((p) => !p)}
          />
        ))}
      </div>

      {/* Bottom controls */}
      <div style={{
        position: 'absolute', left: 0, right: 0,
        bottom: 'max(24px, env(safe-area-inset-bottom))',
        zIndex: 4,
        display: 'flex', justifyContent: 'center', gap: 10,
        pointerEvents: 'none',
      }}>
        <ControlButton onClick={() => setPaused((p) => !p)} label={paused ? 'Play' : 'Pause'}>
          {paused ? <Play size={16} fill="currentColor" strokeWidth={0} /> : <Pause size={16} />}
        </ControlButton>
        <ControlButton onClick={() => setMuted((m) => !m)} label={muted ? 'Unmute' : 'Mute'}>
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </ControlButton>
      </div>
    </div>
  )
}

function NavArrow({ dir, onClick, disabled }: { dir: 'left' | 'right'; onClick: () => void; disabled: boolean }) {
  return (
    <button
      className="hide-mobile"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'left' ? 'Previous' : 'Next'}
      style={{
        position: 'absolute',
        [dir]: 24, top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 4,
        width: 48, height: 48, borderRadius: '50%',
        background: disabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.15)',
        border: 'none',
        color: '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s ease',
      }}
    >
      {dir === 'left' ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
    </button>
  )
}

function ControlButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        pointerEvents: 'auto',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 14px',
        borderRadius: 9999,
        background: 'rgba(255,255,255,0.16)',
        border: '1px solid rgba(255,255,255,0.14)',
        backdropFilter: 'blur(10px)',
        color: '#fff', cursor: 'pointer',
        fontFamily: 'var(--font-dm-sans)',
        fontWeight: 600, fontSize: 12,
      }}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

function SwiperSlide({
  video, active, muted, paused, onTogglePaused,
}: {
  video: TourVideo
  active: boolean
  muted: boolean
  paused: boolean
  onTogglePaused: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [loaded, setLoaded] = useState(false)

  // Only play the active slide — matches native story/reel behaviour
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (active && !paused) {
      el.currentTime = 0
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }, [active, paused])

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  return (
    <div style={{
      flex: '0 0 100%',
      height: '100%',
      scrollSnapAlign: 'start', scrollSnapStop: 'always',
      position: 'relative',
      background: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <video
        ref={videoRef}
        src={active ? video.video_url : undefined}
        poster={video.thumbnail_url ?? undefined}
        playsInline loop
        muted={muted}
        preload={active ? 'auto' : 'none'}
        onLoadedData={() => setLoaded(true)}
        onClick={onTogglePaused}
        style={{
          maxWidth: '100%', maxHeight: '100%',
          width: '100%', height: '100%',
          objectFit: 'contain',
          background: '#000',
          cursor: 'pointer',
        }}
      />
      {!loaded && active && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.6)',
          fontSize: 13, fontFamily: 'var(--font-dm-sans)',
        }}>
          Loading…
        </div>
      )}

      {/* Uploader byline */}
      <div style={{
        position: 'absolute',
        left: 16, right: 16,
        bottom: 'calc(env(safe-area-inset-bottom) + 92px)',
        zIndex: 2,
        color: '#fff',
        fontFamily: 'var(--font-dm-sans)',
      }}>
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
          @{video.uploader_name || 'guest'}
        </p>
        {video.caption && (
          <p style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.45 }}>{video.caption}</p>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Upload sheet — mobile-first bottom sheet
   ═══════════════════════════════════════════════════════════════════════════ */
function UploadSheet({
  experienceId, experienceTitle, onClose, onUploaded,
}: {
  experienceId: number
  experienceTitle: string
  onClose: () => void
  onUploaded: () => Promise<void>
}) {
  const { user } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [duration, setDuration] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }
  }, [previewUrl])

  const handlePick = async (f: File) => {
    setError(null)
    const v = validateVideoFile(f)
    if (!v.ok) { setError(v.error ?? 'Invalid file'); return }
    const dur = await readVideoDuration(f)
    if (dur && dur > VIDEO_MAX_DURATION_SEC) {
      setError(`Clip is ${dur}s — maximum is ${VIDEO_MAX_DURATION_SEC}s`)
      return
    }
    setFile(f)
    setDuration(dur)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(f))
  }

  const handleSubmit = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    const res = await uploadTourVideo({
      experienceId,
      file,
      caption,
      durationSeconds: duration ?? undefined,
    })
    setUploading(false)
    if (!res.ok) { setError(res.error ?? 'Upload failed'); return }
    await onUploaded()
  }

  return (
    <div
      onClick={onClose}
      role="dialog" aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 1500,
        background: 'rgba(8, 8, 10, 0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: 16,
        animation: 'fadeUp 0.22s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          background: 'var(--card-bg, #fff)',
          border: '1px solid rgba(255,179,0,0.22)',
          borderRadius: 'var(--r-xl, 20px)',
          boxShadow: '0 24px 72px rgba(0,0,0,0.25)',
          padding: '26px 22px 22px',
          marginBottom: 'max(16px, env(safe-area-inset-bottom))',
          animation: 'slideInRight 0.26s ease',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 10.5, fontWeight: 600,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: '#FFB300',
              margin: 0,
            }}>
              Share your experience
            </p>
            <h3 style={{
              fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 20,
              letterSpacing: '-0.02em', color: 'var(--text-primary, #111)',
              marginTop: 2, lineHeight: 1.15,
            }}>
              {experienceTitle}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(0,0,0,0.04)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary, #555)', flexShrink: 0,
          }}>
            <X size={16} />
          </button>
        </div>

        {!user && (
          <div style={{
            padding: 14, borderRadius: 12,
            background: 'var(--bg-warm, #FAF8F3)',
            border: '1px solid rgba(0,0,0,0.06)',
            fontFamily: 'var(--font-dm-sans)', fontSize: 13.5,
            color: 'var(--text-secondary)',
            marginBottom: 16, lineHeight: 1.45,
          }}>
            Sign in to upload a video and track your 5%-off reward progress.
            <a href={`/login?redirect=/experience/${experienceId}`} style={{
              marginLeft: 6, color: 'var(--text-primary)',
              textDecoration: 'underline', fontWeight: 600,
            }}>Sign in →</a>
          </div>
        )}

        {/* Picker */}
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handlePick(f)
          }}
        />

        {!file ? (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={!user}
            style={{
              width: '100%',
              aspectRatio: '9 / 12',
              maxHeight: 320,
              borderRadius: 16,
              border: '2px dashed rgba(0,0,0,0.14)',
              background: 'var(--bg-warm, #FAF8F3)',
              cursor: user ? 'pointer' : 'not-allowed',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 10,
              transition: 'all 0.2s ease',
              opacity: user ? 1 : 0.55,
            }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: 'var(--text-primary, #111)',
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Upload size={22} strokeWidth={2} />
            </div>
            <p style={{
              fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 15,
              color: 'var(--text-primary)',
            }}>
              Tap to upload a clip
            </p>
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: 12,
              color: 'var(--text-tertiary)',
              textAlign: 'center', padding: '0 20px', lineHeight: 1.45,
            }}>
              Vertical 9:16 · up to {VIDEO_MAX_DURATION_SEC}s · {Math.round(VIDEO_MAX_BYTES / (1024 * 1024))} MB max · MP4, MOV, WebM
            </p>
          </button>
        ) : (
          <div>
            <div style={{
              width: '100%', aspectRatio: '9 / 12', maxHeight: 320,
              borderRadius: 16, overflow: 'hidden',
              background: '#000', position: 'relative',
            }}>
              {previewUrl && (
                <video
                  src={previewUrl}
                  autoPlay muted loop playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
              <button
                onClick={() => { setFile(null); setPreviewUrl(null); setDuration(null) }}
                aria-label="Remove"
                style={{
                  position: 'absolute', top: 10, right: 10,
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer',
                  color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={14} />
              </button>
              <div style={{
                position: 'absolute', left: 10, bottom: 10,
                padding: '4px 10px', borderRadius: 9999,
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
                color: '#fff', fontSize: 11, fontWeight: 600,
                fontFamily: 'var(--font-dm-sans)',
              }}>
                {duration ? `${duration}s` : ''} · {formatBytes(file.size)}
              </div>
            </div>

            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 140))}
              placeholder="Add a caption (optional)"
              rows={2}
              style={{
                width: '100%', marginTop: 14,
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid rgba(0,0,0,0.08)',
                background: 'var(--bg-warm, #FAF8F3)',
                fontFamily: 'var(--font-dm-sans)', fontSize: 13.5,
                color: 'var(--text-primary)',
                resize: 'none', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {error && (
          <p style={{
            marginTop: 12,
            padding: '10px 12px', borderRadius: 10,
            background: 'rgba(255, 90, 54, 0.08)',
            border: '1px solid rgba(255, 90, 54, 0.28)',
            fontSize: 12.5, color: 'var(--coral, #FF5A36)',
            fontFamily: 'var(--font-dm-sans)', fontWeight: 500,
          }}>
            {error}
          </p>
        )}

        <p style={{
          marginTop: 14, padding: '10px 12px',
          borderRadius: 10, background: 'rgba(255,179,0,0.08)',
          border: '1px solid rgba(255,179,0,0.22)',
          fontSize: 12, lineHeight: 1.5,
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-dm-sans)',
          display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <Award size={14} color="var(--gold, #FFB300)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Every approved video counts toward your <strong>5% off</strong> reward. Videos go live after a quick moderation review.
          </span>
        </p>

        <button
          onClick={handleSubmit}
          disabled={!file || uploading || !user}
          style={{
            width: '100%',
            marginTop: 18,
            height: 52, borderRadius: 14,
            background: file && user ? 'var(--text-primary, #111)' : 'rgba(0,0,0,0.08)',
            color: file && user ? '#fff' : 'var(--text-tertiary)',
            border: 'none',
            cursor: file && user && !uploading ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 14,
            letterSpacing: '-0.005em',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.2s ease',
          }}
        >
          {uploading ? 'Uploading…' : <>
            <Check size={16} strokeWidth={2.5} />
            Submit for review
          </>}
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Empty + loading states
   ═══════════════════════════════════════════════════════════════════════════ */
function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div style={{
      padding: '44px 28px',
      textAlign: 'center',
      borderRadius: 18,
      border: '1px dashed rgba(255, 179, 0, 0.28)',
      background: 'linear-gradient(180deg, rgba(255, 179, 0, 0.04) 0%, rgba(255, 179, 0, 0.01) 100%)',
    }}>
      {/* Editorial ornament */}
      <div style={{
        width: 2, height: 26, background: '#FFB300',
        margin: '0 auto 18px',
      }} />
      <p style={{
        fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 20,
        color: '#ffffff', marginBottom: 8, letterSpacing: '-0.015em',
        lineHeight: 1.2,
      }}>
        Be the first to share this one
      </p>
      <p style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: 13.5,
        color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.55,
        maxWidth: 340, margin: '0 auto 22px',
      }}>
        A handful of approved clips unlocks <strong style={{ color: '#FFB300' }}>5% off your next trip</strong> — and puts you on the feed for future travellers.
      </p>
      <button
        onClick={onUpload}
        style={goldCtaStyle}
      >
        <Upload size={15} strokeWidth={2.25} />
        Share a clip
      </button>
    </div>
  )
}

function GallerySkeleton() {
  const placeholders = useMemo(() => Array.from({ length: 4 }), [])
  return (
    <div style={{ display: 'flex', gap: 12, overflow: 'hidden' }}>
      {placeholders.map((_, i) => (
        <div key={i} style={{
          flexShrink: 0,
          width: 170, aspectRatio: '9 / 16',
          borderRadius: 16,
          background: 'linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04))',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.6s ease-in-out infinite',
        }} />
      ))}
      <style jsx global>{`
        @keyframes shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shared styles (inline so the component is self-contained)
   ═══════════════════════════════════════════════════════════════════════════ */
/* Primary prestige CTA — gold pill, ink text, used as the *only* upload
   entry point so CTAs don't duplicate. */
const goldCtaStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '10px 18px',
  borderRadius: 9999,
  background: '#FFB300',
  color: '#08080A',
  border: 'none', cursor: 'pointer',
  fontFamily: 'var(--font-dm-sans)',
  fontWeight: 700, fontSize: 13,
  letterSpacing: '-0.005em',
  boxShadow: '0 8px 22px rgba(255, 179, 0, 0.28)',
  transition: 'transform 0.15s ease, box-shadow 0.2s ease',
}

/* Secondary CTA — used only by the logged-out state of the reward band */
const ghostCtaStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '9px 16px', borderRadius: 9999,
  background: 'transparent',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  color: '#ffffff',
  cursor: 'pointer',
  fontFamily: 'var(--font-dm-sans)',
  fontWeight: 600, fontSize: 12.5,
  whiteSpace: 'nowrap',
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}
