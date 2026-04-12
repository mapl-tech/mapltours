'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { experiences, Comment, Experience, slugify } from '@/lib/experiences'
import { useI18n } from '@/lib/i18n'
import { useCartStore } from '@/lib/cart'
import Link from 'next/link'
import { Heart, MessageCircle, Plus, Check, Play, ChevronLeft, ChevronRight, X, ThumbsUp, Send, MapPin, Star, Clock, ShoppingBag } from 'lucide-react'

/* ── Single Reel (Snapchat style) ── */
function Reel({ exp, isActive, totalCount, currentIndex }: { exp: Experience; isActive: boolean; totalCount: number; currentIndex: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [paused, setPaused] = useState(false)
  const { addItem, removeItem, isInCart } = useCartStore()
  const { t, formatPrice } = useI18n()
  const [liked, setLiked] = useState(false)
  const inCart = isInCart(exp.id)
  const toggleCart = () => { if (inCart) { removeItem(exp.id) } else { addItem(exp) } }

  useEffect(() => {
    if (!videoRef.current) return
    if (isActive) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
      setPaused(false)
    } else {
      videoRef.current.pause()
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
      <video
        ref={videoRef}
        src={exp.video}
        loop muted playsInline
        poster={exp.image}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />

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
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
        background: 'linear-gradient(0deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── Right action column (Snapchat style — tight, no labels) ── */}
      <div style={{
        position: 'absolute', right: 12, bottom: 100, zIndex: 10,
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
          onClick={(e) => { e.stopPropagation(); setLiked(!liked) }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', cursor: 'pointer', color: 'white',
          }}
        >
          <Heart size={26} fill={liked ? '#FF4081' : 'none'} color={liked ? '#FF4081' : 'white'} strokeWidth={1.8} />
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-dm-sans)' }}>
            {liked ? (exp.reviews + 1).toLocaleString() : exp.reviews.toLocaleString()}
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
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', cursor: 'pointer', color: 'white',
          }}
        >
          <Send size={24} strokeWidth={1.8} />
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-dm-sans)' }}>Send</span>
        </button>

        {/* Add to trip */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleCart() }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', cursor: 'pointer', color: 'white',
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: inCart ? 'var(--emerald)' : 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease',
          }}>
            {inCart ? <Check size={20} strokeWidth={2.5} /> : <Plus size={20} strokeWidth={2} />}
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-dm-sans)' }}>
            {inCart ? 'Added' : 'Trip'}
          </span>
        </button>
      </div>

      {/* ── Bottom info (Snapchat style — bold, stacked, left-aligned) ── */}
      <div style={{
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
          {exp.title}
        </h2>

        {/* Description — 2 line clamp */}
        <p style={{
          fontSize: 13, color: 'rgba(255,255,255,0.8)',
          fontFamily: 'var(--font-dm-sans)', lineHeight: 1.4, marginBottom: 10,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {exp.description}
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
function MobileCommentsSheet({ comments, commentText, setCommentText, addComment, onClose }: {
  comments: Comment[]
  commentText: string
  setCommentText: (v: string) => void
  addComment: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const sheetRef = useRef<HTMLDivElement>(null)
  const [sheetHeight, setSheetHeight] = useState(60) // percentage of viewport
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
    // Snap to positions: close (<25%), half (25-80%), full (>80%)
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
          style={{
            display: 'flex', justifyContent: 'center', padding: '12px 0 8px',
            cursor: 'grab', touchAction: 'none',
          }}
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
              <button onClick={() => setSheetHeight(100)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cccccc', fontSize: 14 }}>
                ↑
              </button>
            )}
            {sheetHeight >= 100 && (
              <button onClick={() => setSheetHeight(60)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cccccc', fontSize: 14 }}>
                ↓
              </button>
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
              <div key={comment.id} style={{ marginBottom: 20, display: 'flex', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{comment.avatar}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', color: 'white' }}>@{comment.user}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-dm-sans)' }}>{comment.time}</span>
                  </div>
                  <p style={{ fontSize: 14, color: '#cccccc', fontFamily: 'var(--font-dm-sans)', lineHeight: 1.5, marginBottom: 8 }}>{comment.text}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-dm-sans)' }}><ThumbsUp size={13} /> {comment.likes}</button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-dm-sans)' }}>{t('Reply')}</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Comment input */}
        <div style={{ padding: '10px 20px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>🧑🏽</div>
          <input type="text" placeholder="Add a comment..." value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment()}
            style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 9999, padding: '10px 16px', fontSize: 15, fontFamily: 'var(--font-dm-sans)', color: 'white', outline: 'none' }}
          />
          {commentText.trim() && (
            <button onClick={addComment} style={{ width: 34, height: 34, borderRadius: '50%', background: '#FFFC00', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={15} color="#000" />
            </button>
          )}
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
  const [allComments, setAllComments] = useState<Record<number, Comment[]>>(() => {
    const map: Record<number, Comment[]> = {}
    experiences.forEach((e) => { map[e.id] = [...e.comments] })
    return map
  })

  const activeExp = experiences[activeIndex]
  const activeComments = allComments[activeExp?.id] || []

  useEffect(() => {
    if (scrollRef.current && startIdx >= 0) {
      scrollRef.current.scrollTo({ top: startIdx * window.innerHeight, behavior: 'instant' as ScrollBehavior })
    }
  }, [startIdx])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const idx = Math.round(scrollRef.current.scrollTop / window.innerHeight)
    if (idx !== activeIndex && idx >= 0 && idx < experiences.length) {
      setActiveIndex(idx)
    }
  }, [activeIndex])

  const scrollToReel = (direction: 'prev' | 'next') => {
    if (!scrollRef.current) return
    const target = direction === 'prev'
      ? Math.max(0, activeIndex - 1)
      : Math.min(experiences.length - 1, activeIndex + 1)
    scrollRef.current.scrollTo({ top: target * window.innerHeight, behavior: 'smooth' })
  }

  const addComment = () => {
    if (!commentText.trim() || !activeExp) return
    const newComment: Comment = {
      id: Date.now(), user: 'You', avatar: '🧑🏽',
      text: commentText.trim(), time: 'Just now', likes: 0,
    }
    setAllComments((prev) => ({
      ...prev,
      [activeExp.id]: [newComment, ...(prev[activeExp.id] || [])],
    }))
    setCommentText('')
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
              <div key={comment.id} style={{ marginBottom: 22, display: 'flex', gap: 10 }}>
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
                    <button style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-dm-sans)',
                    }}>{t('Reply')}</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Comment input */}
        <div style={{
          padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, flexShrink: 0,
          }}>🧑🏽</div>
          <input
            type="text"
            placeholder="Add a comment..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addComment()}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.06)',
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

      {/* ── Mobile bottom bar (YouTube Shorts style) ── */}
      <div className="hide-desktop" style={{
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
        />
      )}
    </div>
  )
}
