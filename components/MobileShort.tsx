'use client'

import { useRef, useEffect, useState, memo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Experience, slugify } from '@/lib/experiences'
import { useI18n } from '@/lib/i18n'
import { useCartStore } from '@/lib/cart'
import { Plus, Check, Star, MapPin, Clock, Play } from 'lucide-react'

export default memo(function MobileShort({ exp }: { exp: Experience }) {
  const { addItem, removeItem, isInCart } = useCartStore()
  const { t, formatPrice } = useI18n()
  const inCart = isInCart(exp.id)
  const toggleCart = () => { if (inCart) { removeItem(exp.id) } else { addItem(exp) } }

  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [videoMounted, setVideoMounted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const playAttempted = useRef(false)
  const retryTimer = useRef<ReturnType<typeof setTimeout>>()

  // Intersection Observer — generous rootMargin for early video loading
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting
        setIsVisible(visible)

        if (visible) {
          setVideoMounted(true)
        } else {
          // Pause and reset when off-screen
          if (videoRef.current) {
            videoRef.current.pause()
            setIsPlaying(false)
          }
          playAttempted.current = false
        }
      },
      { threshold: 0.1, rootMargin: '200px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Play video when visible
  useEffect(() => {
    if (!isVisible || !videoMounted) return
    const video = videoRef.current
    if (!video || playAttempted.current) return

    const onPlaying = () => setIsPlaying(true)
    video.addEventListener('playing', onPlaying)

    const attemptPlay = () => {
      playAttempted.current = true
      video.muted = true
      video.play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          // Retry with increasing delay
          retryTimer.current = setTimeout(() => {
            video.muted = true
            video.play()
              .then(() => setIsPlaying(true))
              .catch(() => {
                // Final retry
                retryTimer.current = setTimeout(() => {
                  video.muted = true
                  video.play().then(() => setIsPlaying(true)).catch(() => {})
                }, 500)
              })
          }, 200)
        })
    }

    if (video.readyState >= 2) {
      attemptPlay()
    } else {
      video.addEventListener('loadeddata', attemptPlay, { once: true })
      // Timeout fallback for slow connections
      const timeout = setTimeout(() => {
        if (!playAttempted.current && video.readyState >= 1) {
          attemptPlay()
        }
      }, 2000)
      return () => {
        clearTimeout(timeout)
        if (retryTimer.current) clearTimeout(retryTimer.current)
        video.removeEventListener('playing', onPlaying)
      }
    }

    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current)
      video.removeEventListener('playing', onPlaying)
    }
  }, [isVisible, videoMounted])

  return (
    <div ref={containerRef}>
      <Link href={`/experience/${slugify(exp.title)}`} style={{ display: 'block', textDecoration: 'none' }}>
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
          {/* Static image — shows until video plays */}
          <Image
            src={exp.image}
            alt={exp.title}
            fill
            sizes="100vw"
            quality={75}
            loading="lazy"
            style={{
              objectFit: 'cover',
              opacity: isPlaying ? 0 : 1,
              transition: 'opacity 0.3s ease',
            }}
          />

          {/* Video — mounts when near viewport, plays when visible */}
          {videoMounted && (
            <video
              ref={videoRef}
              src={exp.video}
              muted
              autoPlay
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

          {/* Bottom gradient */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%',
            background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)',
            pointerEvents: 'none',
          }} />

          {/* Play icon — only shows when video is NOT playing */}
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

          {/* Category badge top-left */}
          <span style={{
            position: 'absolute', top: 12, left: 12, zIndex: 2,
            padding: '5px 12px', borderRadius: 9999,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)',
            fontSize: 11, fontWeight: 600, color: '#fff',
            fontFamily: 'var(--font-dm-sans)', textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {t(exp.category)}
          </span>

          {/* Add button top-right */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleCart() }}
            style={{
              position: 'absolute', top: 12, right: 12, zIndex: 2,
              width: 34, height: 34, borderRadius: '50%',
              background: inCart ? 'var(--emerald)' : 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff',
            }}
          >
            {inCart ? <Check size={15} strokeWidth={2.5} /> : <Plus size={15} strokeWidth={2} />}
          </button>

          {/* Bottom info */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '0 16px 100px', zIndex: 2,
          }}>
            <p style={{
              fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)',
              fontFamily: 'var(--font-dm-sans)', marginBottom: 6,
              letterSpacing: '0.02em',
            }}>
              @{exp.creator}
            </p>

            <h3 style={{
              fontFamily: 'var(--font-syne)', fontWeight: 700,
              fontSize: 17, color: 'white', lineHeight: 1.2,
              letterSpacing: '-0.01em',
              marginBottom: 10,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {t(exp.title)}
            </h3>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 11.5, color: '#cccccc', fontFamily: 'var(--font-dm-sans)',
              fontWeight: 500,
              marginBottom: 14,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={11} /> {exp.destination}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} /> {exp.duration}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Star size={11} fill="var(--gold-warm)" strokeWidth={0} /> {exp.rating}
              </span>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center',
              gap: 12, marginTop: 4,
            }}>
              <span style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 500,
                fontSize: 12, color: '#cccccc',
              }}>{t('From')}</span>
              <span style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 800,
                fontSize: 22, color: 'white', letterSpacing: '-0.02em',
              }}>
                {formatPrice(exp.price)}
              </span>
              <span style={{ fontSize: 12, color: '#cccccc', fontFamily: 'var(--font-dm-sans)' }}>{t('/person')}</span>
            </div>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleCart() }}
              style={{
                width: '100%', marginTop: 10,
                padding: '12px 0', borderRadius: 14,
                background: inCart ? 'var(--emerald)' : 'white',
                color: inCart ? 'white' : '#000',
                fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
                border: 'none', cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              {inCart ? t('✓ Added') : t('Add to Trip')}
            </button>
          </div>
        </div>
      </Link>
    </div>
  )
})
