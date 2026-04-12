'use client'

import { Experience, CATEGORY_COLORS } from '@/lib/experiences'
import { useCartStore } from '@/lib/cart'
import { useI18n } from '@/lib/i18n'
import { useState } from 'react'

interface ReelCardProps {
  experience: Experience
  currentIndex: number
  totalCount: number
  isLiked: boolean
  onToggleLike: () => void
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: string
  label: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          transition: 'all 0.2s ease',
        }}
      >
        {icon}
      </div>
      <span
        style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.6)',
          fontFamily: 'var(--font-dm-sans)',
          fontWeight: 500,
        }}
      >
        {label}
      </span>
    </button>
  )
}

export default function ReelCard({
  experience: exp,
  currentIndex,
  totalCount,
  isLiked,
  onToggleLike,
}: ReelCardProps) {
  const { addItem, isInCart } = useCartStore()
  const { t, formatPrice } = useI18n()
  const inCart = isInCart(exp.id)
  const catColor = CATEGORY_COLORS[exp.category]
  const [heartPop, setHeartPop] = useState(false)

  const handleLike = () => {
    onToggleLike()
    if (!isLiked) {
      setHeartPop(true)
      setTimeout(() => setHeartPop(false), 300)
    }
  }

  return (
    <div className="reel-card">
      {/* Layer 1: Gradient background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: exp.gradient,
        }}
      />

      {/* Layer 2: Radial highlight */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 42%, rgba(255,255,255,0.04), transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      {/* Layer 3: Top scrim */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 200,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.72), transparent)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* Layer 4: Bottom scrim */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 340,
          background: 'linear-gradient(0deg, rgba(0,0,0,0.92), transparent)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* Layer 5: Story segments */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          right: 16,
          display: 'flex',
          gap: 4,
          zIndex: 3,
        }}
      >
        {Array.from({ length: totalCount }).map((_, i) => (
          <div
            key={i}
            className={`story-segment${i <= currentIndex ? ' active' : ''}`}
          />
        ))}
      </div>

      {/* Layer 6: Creator row */}
      <div
        style={{
          position: 'absolute',
          top: 36,
          left: 16,
          zIndex: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: exp.gradient,
            border: '2px solid rgba(255,255,255,0.3)',
            flexShrink: 0,
          }}
        />
        <div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'var(--font-dm-sans)',
              color: 'white',
            }}
          >
            @{exp.creator}
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.5)',
              fontFamily: 'var(--font-dm-sans)',
              marginLeft: 8,
            }}
          >
            {exp.followers}
          </span>
        </div>
        <button
          className="btn-ghost"
          style={{
            padding: '4px 14px',
            fontSize: 11,
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 600,
          }}
        >
          Follow
        </button>
      </div>

      {/* Layer 7: Center emoji */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -58%)',
          fontSize: 110,
          filter: 'drop-shadow(0 12px 48px rgba(0,0,0,0.5))',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        {exp.emoji}
      </div>

      {/* Layer 8: Right action column */}
      <div
        style={{
          position: 'absolute',
          right: 14,
          bottom: 210,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          zIndex: 3,
        }}
      >
        <div className={heartPop ? 'animate-heart-pop' : ''}>
          <ActionButton
            icon={isLiked ? '❤️' : '🤍'}
            label="Like"
            onClick={handleLike}
          />
        </div>
        <ActionButton
          icon={inCart ? '✅' : '➕'}
          label={inCart ? 'Added' : 'Add'}
          onClick={() => addItem(exp)}
        />
        <ActionButton icon="↗" label="Share" />
      </div>

      {/* Layer 9: Bottom info */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 80,
          padding: '0 18px 22px',
          zIndex: 3,
        }}
      >
        {/* Category + location */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 10px',
              borderRadius: 20,
              background: `${catColor}22`,
              border: `1px solid ${catColor}44`,
              color: catColor,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'var(--font-dm-sans)',
            }}
          >
            {t(exp.category)}
          </span>
          <span
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.6)',
              fontFamily: 'var(--font-dm-sans)',
            }}
          >
            📍 {exp.destination}, {exp.parish}
          </span>
        </div>

        {/* Title */}
        <h2
          style={{
            fontFamily: 'var(--font-syne)',
            fontWeight: 700,
            fontSize: 20,
            lineHeight: 1.2,
            marginBottom: 8,
          }}
        >
          {t(exp.title)}
        </h2>

        {/* Rating + duration */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 10,
            fontSize: 13,
            fontFamily: 'var(--font-dm-sans)',
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          <span>⭐ {exp.rating} ({exp.reviews.toLocaleString()})</span>
          <span>🕐 {t(exp.duration)}</span>
        </div>

        {/* Tags */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {exp.tags.map((tag) => (
            <span key={tag} className="tag">
              {t(tag)}
            </span>
          ))}
        </div>

        {/* Price row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span
              style={{
                fontSize: 9,
                textTransform: 'uppercase',
                letterSpacing: 1,
                color: 'rgba(255,255,255,0.4)',
                fontFamily: 'var(--font-dm-sans)',
                fontWeight: 600,
              }}
            >
              {t('From')}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 800,
                fontSize: 24,
                color: 'white',
              }}
            >
              {formatPrice(exp.price)}
            </span>
            <span
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.5)',
                fontFamily: 'var(--font-dm-sans)',
              }}
            >
              {t('/person')}
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <button
            className="btn-primary"
            onClick={() => addItem(exp)}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontFamily: 'var(--font-dm-sans)',
              background: inCart ? 'var(--green)' : 'var(--gold)',
            }}
          >
            {inCart ? t('✓ Added') : t('Add to Trip')}
          </button>
        </div>
      </div>
    </div>
  )
}
