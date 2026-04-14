'use client'

import { DAILY_HOUR_LIMIT, useCartStore } from '@/lib/cart'

interface TripTimeBarProps {
  /** Compact variant for panel headers / mobile drawers */
  compact?: boolean
  /** Hide the heading line (e.g. when embedded next to another title) */
  hideHeading?: boolean
  style?: React.CSSProperties
}

/**
 * Progress bar that visualises total selected tour hours against the
 * 8-hour daily cap. When the busiest day exceeds the cap the bar flips
 * to the brand's coral/red and the copy switches to "over by X hrs".
 */
export default function TripTimeBar({ compact = false, hideHeading, style }: TripTimeBarProps) {
  const maxHours = useCartStore((s) => s.maxDailyHours())
  const remaining = Math.max(0, DAILY_HOUR_LIMIT - maxHours)
  const over = Math.max(0, maxHours - DAILY_HOUR_LIMIT)
  const isOver = maxHours > DAILY_HOUR_LIMIT
  const isFull = maxHours >= DAILY_HOUR_LIMIT && !isOver
  const pct = Math.min(100, (maxHours / DAILY_HOUR_LIMIT) * 100)
  // Overflow tail — purely visual signal that they've blown the cap
  const overflowPct = isOver ? Math.min(40, (over / DAILY_HOUR_LIMIT) * 100) : 0

  const fillColor = isOver
    ? 'var(--coral, #FF5A36)'
    : isFull
      ? 'var(--emerald, var(--green, #00A550))'
      : 'var(--gold, #FFB300)'

  const statusText = isOver
    ? `Over by ${formatHours(over)} — adjust to continue`
    : isFull
      ? 'Day is full — next tours land on a new day'
      : `${formatHours(remaining)} remaining today`

  return (
    <div style={{ width: '100%', ...style }}>
      {!hideHeading && (
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: compact ? 6 : 10, gap: 12,
        }}>
          <span style={{
            fontFamily: 'var(--font-syne)',
            fontWeight: 700,
            fontSize: compact ? 12 : 13,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary, rgba(255,255,255,0.7))',
          }}>
            Day plan
          </span>
          <span style={{
            fontFamily: 'var(--font-syne)',
            fontWeight: 800,
            fontSize: compact ? 13 : 15,
            color: isOver ? 'var(--coral, #FF5A36)' : 'var(--text-primary, white)',
            letterSpacing: '-0.01em',
          }}>
            {formatHours(maxHours)}
            <span style={{
              fontFamily: 'var(--font-dm-sans)',
              fontWeight: 500,
              fontSize: compact ? 11 : 12,
              color: 'var(--text-tertiary, rgba(255,255,255,0.5))',
              marginLeft: 4,
            }}>
              / {DAILY_HOUR_LIMIT} hrs
            </span>
          </span>
        </div>
      )}

      {/* Track */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(maxHours * 10) / 10}
        aria-valuemin={0}
        aria-valuemax={DAILY_HOUR_LIMIT}
        style={{
          position: 'relative',
          width: '100%',
          height: compact ? 6 : 8,
          borderRadius: 9999,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        {/* 8-hour tick (only relevant when over) */}
        {isOver && (
          <div style={{
            position: 'absolute', left: `${(DAILY_HOUR_LIMIT / (DAILY_HOUR_LIMIT + over)) * 100}%`,
            top: 0, bottom: 0, width: 1,
            background: 'rgba(255,255,255,0.35)',
            zIndex: 2,
          }} />
        )}

        {/* Primary fill */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          background: fillColor,
          borderRadius: 9999,
          transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1), background 0.25s ease',
        }} />

        {/* Overflow shimmer */}
        {isOver && (
          <div style={{
            position: 'absolute',
            left: `${pct - overflowPct}%`,
            top: 0, bottom: 0,
            width: `${overflowPct}%`,
            background: 'linear-gradient(90deg, rgba(255,90,54,0.6), rgba(255,90,54,1))',
            borderRadius: 9999,
            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        )}
      </div>

      <p style={{
        marginTop: compact ? 6 : 10,
        fontFamily: 'var(--font-dm-sans)',
        fontWeight: 500,
        fontSize: compact ? 11 : 12.5,
        color: isOver
          ? 'var(--coral, #FF5A36)'
          : isFull
            ? 'var(--emerald, var(--green, #00A550))'
            : 'var(--text-tertiary, rgba(255,255,255,0.55))',
        letterSpacing: '-0.005em',
      }}>
        {statusText}
      </p>
    </div>
  )
}

function formatHours(hrs: number): string {
  if (hrs === 0) return '0 hrs'
  // Keep trailing .5 but drop .0
  const rounded = Math.round(hrs * 2) / 2
  const str = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1)
  return `${str} ${rounded === 1 ? 'hr' : 'hrs'}`
}
