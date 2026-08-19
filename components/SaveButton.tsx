'use client'

import { Heart } from 'lucide-react'
import { useSaved } from '@/lib/supabase/saved'

/**
 * Save a tour to come back to.
 *
 * Signed out, this is not hidden and not disabled: it looks and behaves like
 * a save right up to the tap, then routes to log in and returns the guest to
 * the page they were on. Hiding it would mean nobody discovers the feature
 * until after they happen to make an account, which is backwards — wanting to
 * keep a tour is the reason to make one.
 */
export default function SaveButton({
  experienceId,
  title,
  variant = 'overlay',
  size = 36,
}: {
  experienceId: number
  title: string
  /**
   * 'overlay' is the white disc used on light card photos, 'dark' the
   * translucent disc the full-bleed mobile shorts use, 'plain' sits on a
   * light surface. Each mirrors the add-to-trip button it sits beside, so
   * the pair always reads as one control group.
   */
  variant?: 'overlay' | 'dark' | 'plain'
  size?: number
}) {
  const { isSaved, toggleSave } = useSaved()
  const saved = isSaved(experienceId)

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSave(experienceId) }}
      aria-label={saved ? `Remove ${title} from your saved tours` : `Save ${title} for later`}
      aria-pressed={saved}
      title={saved ? 'Saved' : 'Save for later'}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)' }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: variant === 'overlay'
          ? 'rgba(255,255,255,0.92)'
          : variant === 'dark' ? 'rgba(0,0,0,0.4)' : 'var(--card-bg)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        border: variant === 'plain' ? '1px solid var(--border)' : 'none',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: variant === 'overlay' ? '0 2px 8px rgba(0,0,0,0.18)' : 'none',
        transition: 'all 0.2s ease',
        flexShrink: 0,
      }}
    >
      <Heart
        size={Math.round(size * 0.44)}
        strokeWidth={2.2}
        fill={saved ? '#E0245E' : 'none'}
        color={saved ? '#E0245E' : variant === 'dark' ? '#fff' : 'var(--accent)'}
      />
    </button>
  )
}
