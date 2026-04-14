'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { experiences, Experience, slugify } from '@/lib/experiences'
import { useI18n } from '@/lib/i18n'
import { useCartStore } from '@/lib/cart'
import Link from 'next/link'
import { Heart, MessageCircle, Play, ChevronLeft, ChevronRight, X, ThumbsUp, Send, MapPin, Star, Clock, ShoppingBag } from 'lucide-react'
import { useExperienceLike, useComments, DisplayComment } from '@/lib/supabase/hooks'

/* ── Single Reel (Snapchat style) ── */
function Reel({ exp, isActive, totalCount, currentIndex }: { exp: Experience; isActive: boolean; totalCount: number; currentIndex: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [paused, setPaused] = useState(false)
  const { addItem, removeItem, isInCart } = useCartStore()
  const { t, formatPrice } = useI18n()
  const { liked, likeCount, toggleLike } = useExperienceLike(exp.id)
  const inCart = isInCart(exp.id)
  const toggleCart = () => { if (inCart) { removeItem(exp.id) } else { addItem(exp) } }
  const [sharedToast, setSharedToast] = useState<'copied' | 'failed' | null>(null)

  const handleShare = async () => {
    const url = `${window.location.origin}/experience/${slugify(exp.title)}`
    const shareData = {
      title: exp.title,
      text: `${exp.title} — ${exp.destination}, Jamaica`,
      url,
    }
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator && navigator.canShare?.(shareData) !== false) {
        await navigator.share(shareData)
        return
      }
      await navigator.clipboard.writeText(url)
      setSharedToast('copied')
      setTimeout(() => setSharedToast(null), 1800)
    } catch (err) {
      // User cancelled the native sheet — treat as no-op
      if ((err as DOMException)?.name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(url)
        setSharedToast('copied')
      } catch {
        setSharedToast('failed')
      }
      setTimeout(() => setSharedToast(null), 1800)
    }
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (isActive) {
      video.muted = true
      video.currentTime = 0
      const tryPlay = () => {
        video.play().then(() => setPaused(false)).catch(() => {
          setTimeout(() => video.play().then(() => setPaused(false)).catch(() => {}), 300)
        })
      }
      if (video.readyState >= 2) {
        tryPlay()
      } else {
        video.addEventListener('loadeddata', tryPlay, { once: true })
      }
      setPaused(false)
    } else {
      video.pause()
      // Free memory for off-screen videos
      video.removeAttribute('src')
      video.load()
    }

    return () => {
      video.removeEventListener('loadeddata', () => {})
    }
  }, [isActive])

  const togglePlay = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {})
      setPaused(false)
    } else {
      videoRef.current.pause()
      setPaused(true)
    }
  }

  return (
    <div
      onClick={togglePlay}
      style={{
        height: '100vh', width: '100%',
        position: 'relative', cursor: 'pointer',
        scrollSnapAlign: 'start', scrollSnapStop: 'always',
        overflow: 'hidden', background: '#000',
      }}
    >
      {exp.youtubeId ? (
        <iframe
          src={`https://www.youtube.com/embed/${exp.youtubeId}?autoplay=1&mute=1&loop=1&controls=0&showinfo=0&modestbranding=1&playlist=${exp.youtubeId}&playsinline=1`}
          allow="autoplay; encrypted-media"
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      ) : (
      <video
        ref={videoRef}
        src={isActive ? exp.video : undefined}
        loop muted playsInline
        preload={isActive ? 'auto' : 'none'}
        poster={exp.image}
        style={{ width: '100%', height: '100%', objectFit: 'cover', willChange: 'opacity' }}
      />
      )}

      {/* Pause overlay */}
      {paused && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.2)', pointerEvents: 'none',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Play size={24} fill="white" strokeWidth={0} /></div>
        </div>
      )}

      {/* ── Snapchat-style story segments ── */}
      <div style={{
        position: 'absolute', top: 8, left: 12, right: 12, zIndex: 15,
        display: 'flex', gap: 3,
      }}>
        {Array.from({ length: totalCount }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 2.5, borderRadius: 2,
            background: i <= currentIndex ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)',
            transition: 'background 0.3s ease',
          }} />
        ))}
      </div>

      {/* Top gradient */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 140,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* Bottom gradient — stronger for Snapchat readability */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '65%',
        background: 'linear-gradient(0deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 45%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── Right action column (Snapchat style — tight, no labels) ── */}
      <div className="reel-right-rail" style={{
        position: 'absolute', right: 12, zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      }}>
        {/* Creator avatar */}
        <div style={{ position: 'relative', marginBottom: 4 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: exp.gradient,
            border: '2px solid white',
          }} />
          <div style={{
            position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
            width: 18, height: 18, borderRadius: '50%',
            background: '#FF4081', border: '2px solid black',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, color: 'white', fontWeight: 700,
          }}>+</div>
        </div>

        {/* Like */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleLike() }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', cursor: 'pointer', color: 'white',
          }}
        >
          <Heart size={26} fill={liked ? '#FF4081' : 'none'} color={liked ? '#FF4081' : 'white'} strokeWidth={1.8} />
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-dm-sans)' }}>
            {(exp.reviews + likeCount).toLocaleString()}
          </span>
        </button>

        {/* Comments */}
        <button
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', cursor: 'pointer', color: 'white',
          }}
        >
          <MessageCircle size={26} strokeWidth={1.8} />
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-dm-sans)' }}>
            {exp.comments.length}
          </span>
        </button>

        {/* Share */}
        <button
          onClick={(e) => { e.stopPropagation(); handleShare() }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', cursor: 'pointer', color: 'white',
          }}
        >
          <Send size={24} strokeWidth={1.8} />
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-dm-sans)' }}>
            {sharedToast === 'copied' ? 'Copied' : sharedToast === 'failed' ? 'Error' : 'Send'}
          </span>
        </button>

      </div>

      {/* ── Bottom info (Snapchat style — bold, stacked, left-aligned) ── */}
      <div className="reel-bottom-info reel-bottom-mobile-pad" style={{
        position: 'absolute', bottom: 0, left: 0, right: 72,
        padding: '0 16px 20px', zIndex: 10,
      }}>
        {/* Creator name */}
        <p style={{
          fontSize: 14, fontWeight: 700, color: 'white',
          fontFamily: 'var(--font-dm-sans)', marginBottom: 4,
        }}>
          @{exp.creator}
        </p>

        {/* Title */}
        <h2 style={{
          fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 18,
          color: 'white', lineHeight: 1.2, marginBottom: 6,
        }}>
          {t(exp.title)}
        </h2>

        {/* Description — 2 line clamp */}
        <p style={{
          fontSize: 13, color: 'rgba(255,255,255,0.8)',
          fontFamily: 'var(--font-dm-sans)', lineHeight: 1.4, marginBottom: 10,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {t(exp.description)}
        </p>

        {/* Info chips row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.12)',
            fontSize: 11.5, fontWeight: 600, color: 'white',
            fontFamily: 'var(--font-dm-sans)',
          }}>
            <MapPin size={11} /> {exp.destination}
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.12)',
            fontSize: 11.5, fontWeight: 600, color: 'white',
            fontFamily: 'var(--font-dm-sans)',
          }}>
            <Clock size={11} /> {exp.duration}
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.12)',
            fontSize: 11.5, fontWeight: 600, color: 'white',
            fontFamily: 'var(--font-dm-sans)',
          }}>
            <Star size={11} fill="white" strokeWidth={0} /> {exp.rating}
          </span>
        </div>

        {/* Price + CTA row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: '#cccccc', fontFamily: 'var(--font-dm-sans)' }}>{t('From')}</span>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 22, color: 'white', letterSpacing: '-0.02em' }}>{formatPrice(exp.price)}</span>
            <span style={{ fontSize: 11, color: '#cccccc', fontFamily: 'var(--font-dm-sans)' }}>{t('/person')}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); toggleCart() }}
            style={{
              padding: '10px 20px', borderRadius: 9999,
              background: inCart ? 'var(--emerald)' : 'white',
              color: inCart ? 'white' : '#000',
              fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
              border: 'none', cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {inCart ? t('✓ In Trip') : t('Add to Trip')}
          </button>
        </div>
      </div>
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
  const sheetRef = useRef<HTMLDivElement>(null)
  const [sheetHeight, setSheetHeight] = useState(60)
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
    const deltaPercent = (delta / window.innerHeight) * 100
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
    <div className="hide-desktop" style={{ position: 'fixed', inset: 0, zIndex: 320 }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: `rgba(0,0,0,${Math.min(0.6, sheetHeight / 100 * 0.6)})`,
        transition: dragging ? 'none' : 'background 0.3s ease',
      }} />
      <div
        ref={sheetRef}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: `${sheetHeight}vh`,
          background: 'var(--bg-dark-warm)',
          borderRadius: sheetHeight >= 100 ? 0 : '20px 20px 0 0',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          transition: dragging ? 'none' : 'height 0.3s cubic-bezier(0.22,1,0.36,1), border-radius 0.3s ease',
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
            <h3 style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 17, color: 'white' }}>Comments</h3>
            <span style={{ padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.08)', fontSize: 12, fontWeight: 600, color: '#cccccc', fontFamily: 'var(--font-dm-sans)' }}>{comments.length}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {sheetHeight < 100 && (
              <button onClick={() => setSheetHeight(100)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cccccc', fontSize: 14 }}>↑</button>
            )}
            {sheetHeight >= 100 && (
              <button onClick={() => setSheetHeight(60)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cccccc', fontSize: 14 }}>↓</button>
            )}
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cccccc' }}>
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
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{comment.avatar}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', color: 'white' }}>@{comment.user}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-dm-sans)' }}>{comment.time}</span>
                    </div>
                    <p style={{ fontSize: 14, color: '#cccccc', fontFamily: 'var(--font-dm-sans)', lineHeight: 1.5, marginBottom: 8 }}>{comment.text}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-dm-sans)' }}><ThumbsUp size={13} /> {comment.likes}</button>
                      <button
                        onClick={() => {
                          if (!isLoggedIn) {
                            window.location.href = `/login?redirect=/experience/${slug}`
                            return
                          }
                          if (comment.supabaseId) {
                            setReplyingTo({ id: comment.supabaseId, user: comment.user })
                            setCommentText(`@${comment.user} `)
                          }
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-dm-sans)' }}
                      >{t('Reply')}</button>
                    </div>
                  </div>
                </div>

                {/* Replies */}
                {comment.replies && comment.replies.length > 0 && (
                  <div style={{ marginLeft: 44, marginTop: 10, borderLeft: '2px solid rgba(255,255,255,0.06)', paddingLeft: 12 }}>
                    {comment.replies.map((reply) => (
                      <div key={reply.id} style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>{reply.avatar}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', color: 'white' }}>@{reply.user}</span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-dm-sans)' }}>{reply.time}</span>
                          </div>
                          <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-dm-sans)', lineHeight: 1.5 }}>{reply.text}</p>
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
              fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-dm-sans)',
            }}>
              <span>Replying to <span style={{ color: 'white', fontWeight: 600 }}>@{replyingTo.user}</span></span>
              <button onClick={() => { setReplyingTo(null); setCommentText('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-dm-sans)' }}>Cancel</button>
            </div>
          )}
          <div style={{ padding: '10px 20px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>🧑🏽</div>
            <input type="text"
              placeholder={replyingTo ? `Reply to @${replyingTo.user}...` : 'Add a comment...'}
              value={commentText} onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addComment()}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.06)',
                border: replyingTo ? '1px solid rgba(255,179,0,0.3)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 9999, padding: '10px 16px', fontSize: 15,
                fontFamily: 'var(--font-dm-sans)', color: 'white', outline: 'none',
              }}
            />
            {commentText.trim() && (
              <button onClick={addComment} style={{ width: 34, height: 34, borderRadius: '50%', background: '#FFFC00', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const startIdx = experiences.findIndex((e) => slugify(e.title) === slug)
  const [activeIndex, setActiveIndex] = useState(startIdx >= 0 ? startIdx : 0)
  const [commentText, setCommentText] = useState('')
  const [mobileComments, setMobileComments] = useState(false)

  const activeExp = experiences[activeIndex]
  const { addComment: addSupabaseComment, toDisplayComments, isLoggedIn, user: currentUser, replyingTo, setReplyingTo } = useComments(activeExp?.id || 0)
  const activeComments = activeExp ? toDisplayComments(activeExp.comments) : []

  // Measure the mobile bottom bar live so the reel's right rail and
  // "Add to Trip" pill can sit exactly 12px above it regardless of safe-area,
  // keyboard, or bar-content changes. The CSS var is the *total* offset
  // (bar height + 12px gap), or cleared entirely when the bar is hidden so
  // CSS falls back to the desktop default.
  const mobileBarRef = useCallback((el: HTMLDivElement | null) => {
    const root = document.documentElement
    if (!el) {
      root.style.removeProperty('--reel-bottom-offset')
      return
    }
    let cleanup: (() => void) | undefined
    const update = () => {
      const rect = el.getBoundingClientRect()
      // If the bar is display:none (desktop via .hide-desktop), rect.height
      // is 0 — clear the var so the desktop fallback in CSS applies.
      if (rect.height === 0) {
        root.style.removeProperty('--reel-bottom-offset')
      } else {
        root.style.setProperty('--reel-bottom-offset', `${Math.round(rect.height) + 12}px`)
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    // Also observe the viewport — `hide-desktop` flips on resize/rotation,
    // and the keyboard changes visualViewport height.
    const mql = window.matchMedia('(min-width: 768px)')
    const onMql = () => update()
    mql.addEventListener('change', onMql)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    const vv = window.visualViewport
    vv?.addEventListener('resize', update)
    cleanup = () => {
      ro.disconnect()
      mql.removeEventListener('change', onMql)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      vv?.removeEventListener('resize', update)
    }
    ;(el as HTMLDivElement & { __cleanup?: () => void }).__cleanup = cleanup
  }, [])
  useEffect(() => {
    return () => {
      const el = document.querySelector<HTMLDivElement>('[data-mobile-bottom-bar]')
      ;(el as (HTMLDivElement & { __cleanup?: () => void }) | null)?.__cleanup?.()
      document.documentElement.style.removeProperty('--reel-bottom-offset')
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
    const clampedIdx = Math.max(0, Math.min(idx, experiences.length - 1))
    setActiveIndex(clampedIdx)
  }, [])

  const scrollToReel = (direction: 'prev' | 'next') => {
    if (!scrollRef.current) return
    const children = scrollRef.current.children
    const childHeight = children.length ? (children[0] as HTMLElement).offsetHeight : window.innerHeight
    const target = direction === 'prev'
      ? Math.max(0, activeIndex - 1)
      : Math.min(experiences.length - 1, activeIndex + 1)
    scrollRef.current.scrollTo({ top: target * childHeight, behavior: 'smooth' })
  }

  const addComment = async () => {
    if (!commentText.trim() || !activeExp) return
    if (!isLoggedIn) {
      window.location.href = `/login?redirect=/experience/${slugify(activeExp.title)}`
      return
    }
    await addSupabaseComment(commentText, replyingTo?.id || undefined)
    setCommentText('')
    setReplyingTo(null)
  }

  if (!activeExp) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#000' }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', color: '#cccccc' }}>Experience not found</p>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: '#000', display: 'flex',
    }}>
      {/* ── LEFT: Scrollable reels ── */}
      <div style={{
        flex: '1 1 auto', width: '100%', maxWidth: 480,
        height: '100%', position: 'relative',
      }}>
        {/* Top bar: close — large touch target for mobile */}
        <div
          onClick={(e) => { e.stopPropagation(); router.back() }}
          onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); router.back() }}
          style={{
            position: 'absolute', top: 10, right: 10, zIndex: 30,
            width: 48, height: 48,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
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
        </div>

        {/* ── Prev / Next arrows — top, beside close button ── */}
        <div style={{
          position: 'absolute', top: 18, left: 14, right: 58,
          zIndex: 20, display: 'flex', alignItems: 'center', gap: 8,
          pointerEvents: 'none',
        }}>
          {activeIndex > 0 ? (
            <button
              onClick={() => scrollToReel('prev')}
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(255,255,255,0.92)',
                border: 'none', cursor: 'pointer', pointerEvents: 'auto',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#111', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fff'
                e.currentTarget.style.transform = 'scale(1.08)'
                e.currentTarget.style.boxShadow = '0 6px 28px rgba(0,0,0,0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.92)'
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
          }}>
            {activeIndex + 1}
            <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}> / {experiences.length}</span>
          </span>

          {activeIndex < experiences.length - 1 ? (
            <button
              onClick={() => scrollToReel('next')}
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(255,255,255,0.92)',
                border: 'none', cursor: 'pointer', pointerEvents: 'auto',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#111', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fff'
                e.currentTarget.style.transform = 'scale(1.08)'
                e.currentTarget.style.boxShadow = '0 6px 28px rgba(0,0,0,0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.92)'
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'
              }}
            >
              <ChevronRight size={22} strokeWidth={2.5} />
            </button>
          ) : <div style={{ width: 44 }} />}
        </div>


        {/* Scrollable reels */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="no-scrollbar"
          style={{
            height: '100%', overflowY: 'scroll',
            scrollSnapType: 'y mandatory',
          }}
        >
          {experiences.map((exp, i) => (
            <Reel key={exp.id} exp={exp} isActive={i === activeIndex} totalCount={experiences.length} currentIndex={activeIndex} />
          ))}
        </div>
      </div>

      {/* ── RIGHT: Comments panel (hidden on mobile) ── */}
      <div className="hide-mobile" style={{
        flex: 1, background: '#111110', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <h3 style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 17, color: 'white' }}>
                Comments
              </h3>
              <span style={{
                padding: '2px 8px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.08)',
                fontSize: 12, fontWeight: 600, color: '#cccccc',
                fontFamily: 'var(--font-dm-sans)',
              }}>
                {activeComments.length}
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: '#cccccc', fontFamily: 'var(--font-dm-sans)' }}>
              {activeExp.title}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {items.length > 0 && (
              <Link
                href="/checkout"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  height: 34, padding: '0 16px',
                  borderRadius: 9999,
                  background: 'var(--emerald)',
                  color: '#fff',
                  fontSize: 12, fontWeight: 600,
                  fontFamily: 'var(--font-dm-sans)',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <ShoppingBag size={13} />
                Checkout ({items.length})
              </Link>
            )}
            <button
              onClick={() => router.back()}
              style={{
                width: 34, height: 34, borderRadius: '50%',
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
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: activeExp.gradient, flexShrink: 0,
            border: '2px solid rgba(255,255,255,0.15)',
          }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', color: 'white' }}>
              @{activeExp.creator}
            </span>
            <span style={{ fontSize: 11.5, color: '#cccccc', fontFamily: 'var(--font-dm-sans)', marginLeft: 6 }}>
              {activeExp.followers}
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
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#cccccc', fontFamily: 'var(--font-dm-sans)', fontSize: 13 }}>
              No comments yet. Be the first!
            </div>
          ) : (
            activeComments.map((comment) => (
              <div key={comment.id} style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, flexShrink: 0,
                  }}>{comment.avatar}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', color: 'white' }}>
                        @{comment.user}
                      </span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-dm-sans)' }}>
                        {comment.time}
                      </span>
                    </div>
                    <p style={{
                      fontSize: 13.5, color: '#cccccc',
                      fontFamily: 'var(--font-dm-sans)', lineHeight: 1.5, marginBottom: 8,
                    }}>{comment.text}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <button style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-dm-sans)',
                      }}><ThumbsUp size={12} /> {comment.likes}</button>
                      <button
                        onClick={() => {
                          if (!isLoggedIn && activeExp) {
                            window.location.href = `/login?redirect=/experience/${slugify(activeExp.title)}`
                            return
                          }
                          if (comment.supabaseId) {
                            setReplyingTo({ id: comment.supabaseId, user: comment.user })
                            setCommentText(`@${comment.user} `)
                          }
                        }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-dm-sans)',
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
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%',
                          background: 'rgba(255,255,255,0.08)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, flexShrink: 0,
                        }}>{reply.avatar}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', color: 'white' }}>
                              @{reply.user}
                            </span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-dm-sans)' }}>
                              {reply.time}
                            </span>
                          </div>
                          <p style={{
                            fontSize: 12.5, color: 'rgba(255,255,255,0.6)',
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
              fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-dm-sans)',
            }}>
              <span>Replying to <span style={{ color: 'white', fontWeight: 600 }}>@{replyingTo.user}</span></span>
              <button
                onClick={() => { setReplyingTo(null); setCommentText('') }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-dm-sans)',
                }}
              >
                Cancel
              </button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, flexShrink: 0, overflow: 'hidden',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {currentUser?.user_metadata?.avatar_url ? (
                <img src={currentUser.user_metadata.avatar_url} alt="" width={30} height={30} style={{ objectFit: 'cover' }} />
              ) : '🧑🏽'}
            </div>
            <input
              type="text"
              placeholder={isLoggedIn ? (replyingTo ? `Reply to @${replyingTo.user}...` : 'Add a comment...') : 'Sign in to comment...'}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addComment()}
              onFocus={() => {
                if (!isLoggedIn && activeExp) {
                  window.location.href = `/login?redirect=/experience/${slugify(activeExp.title)}`
                }
              }}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.06)',
                border: replyingTo ? '1px solid rgba(255,179,0,0.3)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 9999,
                padding: '9px 14px', fontSize: 13,
                fontFamily: 'var(--font-dm-sans)',
                color: 'white', outline: 'none',
              }}
            />
            {commentText.trim() && (
              <button
                onClick={addComment}
                style={{
                  width: 34, height: 34, borderRadius: '50%',
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

      {/* ── Mobile bottom bar (YouTube Shorts style) ── */}
      <div ref={mobileBarRef} data-mobile-bottom-bar className="hide-desktop" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 310,
        background: 'var(--bg-dark)', borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button
          onClick={() => setMobileComments(true)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.08)', border: 'none',
            borderRadius: 9999, padding: '10px 16px',
            cursor: 'pointer', color: 'rgba(255,255,255,0.4)',
            fontSize: 13, fontFamily: 'var(--font-dm-sans)',
            textAlign: 'left',
          }}
        >
          Add a comment...
        </button>
        <button
          onClick={() => setMobileComments(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'white', padding: '8px',
          }}
        >
          <MessageCircle size={22} strokeWidth={1.8} />
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-dm-sans)' }}>
            {activeComments.length}
          </span>
        </button>
        {items.length > 0 && (
          <Link
            href="/checkout"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '8px 14px', borderRadius: 9999,
              background: 'var(--emerald)', color: 'white',
              fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
              whiteSpace: 'nowrap',
            }}
          >
            <ShoppingBag size={14} />
            Checkout ({items.length})
          </Link>
        )}
      </div>

      {/* ── Mobile comments sheet — draggable, half → full → close ── */}
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
