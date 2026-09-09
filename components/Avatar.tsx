'use client'

/**
 * Avatar, shared profile image component used by comments, tour-video reels,
 * and reply rows. Falls back gracefully:
 *   1. Real profile image (when `src` is a valid URL and loads)
 *   2. Coloured disk with the user's first initial (deterministic by name)
 *   3. Generic emoji (only if no name at all)
 *
 * We deliberately use a plain <img> instead of next/image because OAuth
 * providers (Google, Apple, generic SSO) return avatar URLs on domains that
 * can't be pre-declared in next.config.mjs, next/image would throw at
 * render time for a subset of users.
 */

import { useState } from 'react'

interface AvatarProps {
  /** Remote image URL, null/undefined falls through to initials */
  src?: string | null
  /** Display name, used for initials + colour hashing */
  name?: string | null
  /** Pixel diameter of the avatar */
  size?: number
  /** Optional border; useful on dark surfaces */
  ring?: boolean
  /** Optional additional style overrides */
  style?: React.CSSProperties
}

export default function Avatar({
  src, name, size = 32, ring = false, style,
}: AvatarProps) {
  const [failed, setFailed] = useState(false)
  const showImage = !!src && !failed

  const initial = (name || '').trim().charAt(0).toUpperCase() || '•'
  const bg = showImage ? 'rgba(255,255,255,0.08)' : colorForName(name)
  const fg = showImage ? 'transparent' : '#FFFFFF'

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: fg,
        flexShrink: 0,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-dm-sans)',
        fontWeight: 800,
        fontSize: Math.round(size * 0.42),
        letterSpacing: '-0.01em',
        boxShadow: ring ? '0 0 0 2px rgba(255,255,255,0.14)' : undefined,
        ...style,
      }}
      aria-label={name ? `${name} avatar` : 'User avatar'}
    >
      {showImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src as string}
          alt={name || 'User'}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  )
}

/** Deterministic colour from the user's name so the same person always gets
 *  the same disk colour. The same eight MAPL hues as before, dropped in
 *  lightness so that WHITE initials clear AAA on every one of them.
 *
 *  The previous palette drew near-black initials on the bright versions, and
 *  measured 2.97:1 on the caribbean blue and 4.26:1 on the port antonio green,
 *  so the letter failed AA outright on two of the eight names a guest could
 *  be given, at random. Measured now, white on each: 7.89, 8.52, 8.10, 9.58,
 *  9.62, 7.90, 8.66, 8.67. */
function colorForName(name?: string | null): string {
  const palette = [
    '#6B4C06', // gold
    '#8A2D14', // coral
    '#0B5C33', // emerald
    '#0A4A68', // caribbean
    '#4B2E9E', // culture purple
    '#6F4A08', // treasure
    '#5A4A16', // sandstone
    '#14563A', // port antonio green
  ]
  const key = (name || 'guest').toLowerCase()
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length]
}
