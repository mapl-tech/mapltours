/**
 * The tick used on /connect. Drawn, not typed: U+2713 is not in DM Sans, so
 * the glyph came from whichever symbol font each platform falls back to.
 * Decorative everywhere it is used; the words beside it carry the meaning.
 */
export default function CheckIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      <path d="M3 8.6l3.1 3.1L13 4.8" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** A tick sized to sit on the first line of the text after it. */
export function LineCheck({ color = 'var(--emerald)', lineHeight = '1.6em' }: { color?: string; lineHeight?: string }) {
  return (
    <span aria-hidden="true" style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', height: lineHeight, width: 20 }}>
      <CheckIcon size={16} color={color} />
    </span>
  )
}
