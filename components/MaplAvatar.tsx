'use client'

/** The MAPL Tours logo on a white disk, used wherever MAPL-owned content
 *  needs an avatar. The lockup is wide (about 2:1), so it sits contained on
 *  the disk rather than cropped to fill the circle. */
export default function MaplAvatar({ size, border }: { size: number; border?: string }) {
  return (
    <span
      role="img"
      aria-label="MAPL Tours Jamaica"
      style={{
        width: size, height: size, borderRadius: '50%',
        background: '#fff',
        border,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, overflow: 'hidden',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mapl-logo.svg" alt="" style={{ width: '84%', height: 'auto', display: 'block' }} />
    </span>
  )
}
