'use client'

import { useRef, useState, memo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Experience, CATEGORY_COLORS, slugify } from '@/lib/experiences'
import { useCartStore } from '@/lib/cart'
import { Plus, Check, Play, MapPin, Star } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export default memo(function ExpCard({ exp }: { exp: Experience }) {
  const { addItem, removeItem, isInCart } = useCartStore()
  const { t, formatPrice } = useI18n()
  const inCart = isInCart(exp.id)
  const toggleCart = () => { if (inCart) { removeItem(exp.id) } else { addItem(exp) } }
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hovering, setHovering] = useState(false)

  const handleMouseEnter = () => {
    setHovering(true)
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }

  const handleMouseLeave = () => {
    setHovering(false)
    if (videoRef.current) {
      videoRef.current.pause()
    }
  }

  return (
    <article className="exp-card" style={{ cursor: 'pointer' }}>
      {/* Photo / Video area */}
      <Link href={`/experience/${slugify(exp.title)}`}>
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
              opacity: hovering ? 0 : 1,
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
          ) : (
          <video
            ref={videoRef}
            src={exp.video}
            muted
            loop
            playsInline
            preload="none"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: hovering ? 1 : 0,
              transition: 'opacity 0.3s ease',
            }}
          />
          )}

          <div className="overlay-bottom" />

          {/* Play indicator on hover */}
          {hovering && (
            <div style={{
              position: 'absolute', top: 12, left: 12, zIndex: 3,
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 9999,
              background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
              fontSize: 11, fontWeight: 600, color: '#fff',
              fontFamily: 'var(--font-dm-sans)',
            }}>
              <Play size={10} fill="#fff" strokeWidth={0} />
              Preview
            </div>
          )}

          {/* Add button */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleCart() }}
            aria-label={inCart ? `Remove ${exp.title} from your trip` : `Add ${exp.title} to your trip`}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            style={{
              position: 'absolute', top: 12, right: 12, zIndex: 3,
              width: 36, height: 36, borderRadius: '50%',
              background: inCart ? 'var(--emerald)' : 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: inCart ? '#fff' : 'var(--accent)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              transition: 'all 0.2s ease',
            }}
          >
            {inCart ? <Check size={15} strokeWidth={2.5} /> : <Plus size={15} strokeWidth={2.5} />}
          </button>

          {/* Location */}
          <span style={{
            position: 'absolute', bottom: 12, left: 12, zIndex: 2,
            fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.92)',
            fontFamily: 'var(--font-dm-sans)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <MapPin size={12} strokeWidth={2} />
            {exp.destination}, {exp.parish}
          </span>
        </div>
      </Link>

      {/* Info */}
      <Link href={`/experience/${slugify(exp.title)}`} style={{ display: 'block', padding: '2px 8px 10px' }}>
        <span style={{
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
          color: CATEGORY_COLORS[exp.category], fontFamily: 'var(--font-dm-sans)',
        }}>
          {t(exp.category)}
        </span>
        <h3 style={{ fontFamily: 'var(--font-open-sans)', fontWeight: 600, fontSize: 17, lineHeight: 1.2, letterSpacing: '-0.01em', marginTop: 3 }}>
          {t(exp.title)}
        </h3>
        <span style={{ fontSize: 13, fontFamily: 'var(--font-dm-sans)', fontWeight: 500, marginTop: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
          <Star size={13} fill="currentColor" strokeWidth={0} /> {exp.rating}
        </span>
        <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 3 }}>
          {exp.duration} · @{exp.creator}
        </p>
        <p style={{ fontSize: 13.5, fontFamily: 'var(--font-dm-sans)', fontWeight: 600, marginTop: 4 }}>
          {t('From')} {formatPrice(exp.price)}
          <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 12 }}> {t('/person')}</span>
        </p>
      </Link>
    </article>
  )
})
