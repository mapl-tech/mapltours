'use client'

import { DAILY_HOUR_LIMIT, parseDurationHours, useCartStore } from '@/lib/cart'
import { computeDayScore, type DayStage } from '@/lib/day-score'

interface DayBuilderProps {
  /** Compact variant for panel headers / drawers — hides the score breakdown */
  compact?: boolean
  /** Hide the top heading row (use when embedded inside another titled card) */
  hideHeading?: boolean
  style?: React.CSSProperties
}

/**
 * "Build Your Perfect Day" — the evolution of the old 8-hour bar. Shows:
 *  • A stage label (Getting Started → Great Flow → Perfect Day)
 *  • A gold→emerald→coral progress bar tracking hours / 8
 *  • A score out of 100 (variety · balance · efficiency)
 *  • An encouraging action-oriented nudge
 *
 * Designed mobile-first: 12–14px body, touchable breakdown chips, no wraps.
 * Exported as the default export so existing imports (e.g. `TripTimeBar`) keep
 * working — the filename stays `TripTimeBar.tsx` for non-breaking backwards compat.
 */
export default function DayBuilder({ compact = false, hideHeading, style }: DayBuilderProps) {
  const items = useCartStore((s) => s.items)
  const score = computeDayScore(items)

  const { hours, stage, stageLabel, nudge, total, isOver, isPerfect } = score
  const pct = Math.min(100, (hours / DAILY_HOUR_LIMIT) * 100)
  const over = Math.max(0, hours - DAILY_HOUR_LIMIT)
  const overflowPct = isOver ? Math.min(40, (over / DAILY_HOUR_LIMIT) * 100) : 0
  const fillColor = colorForStage(stage)

  // Build a per-day breakdown so multi-day carts show every day explicitly
  // (no more "is this number the sum or the max?" ambiguity).
  const dayBuckets = buildDayBuckets(items)

  return (
    <div style={{ width: '100%', ...style }}>
      {!hideHeading && (
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: compact ? 8 : 12, gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 800,
              fontSize: compact ? 13 : 15,
              color: 'var(--text-primary, white)',
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
            }}>
              {stageLabel}
            </span>
            {isPerfect && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '2px 8px',
                borderRadius: 9999,
                background: 'rgba(255, 179, 0, 0.14)',
                border: '1px solid rgba(255, 179, 0, 0.35)',
                fontSize: 10.5, fontWeight: 700,
                fontFamily: 'var(--font-dm-sans)',
                letterSpacing: '0.06em', textTransform: 'uppercase',
                color: 'var(--gold, #FFB300)',
                whiteSpace: 'nowrap',
              }}>
                ✨ Perfect
              </span>
            )}
          </div>
          <span style={{
            fontFamily: 'var(--font-syne)',
            fontWeight: 800,
            fontSize: compact ? 13 : 15,
            color: isOver ? 'var(--coral, #FF5A36)' : 'var(--text-primary, white)',
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
          }}>
            {dayBuckets.length > 1
              ? `${dayBuckets.length} days`
              : <>
                  {fmtHours(hours)}
                  <span style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontWeight: 500,
                    fontSize: compact ? 11 : 12,
                    color: 'var(--text-tertiary, rgba(255,255,255,0.5))',
                    marginLeft: 4,
                  }}>
                    / {DAILY_HOUR_LIMIT} hrs
                  </span>
                </>
            }
          </span>
        </div>
      )}

      {/* ── Track(s) ──
          Multi-day carts render one bar per day so there is never any
          ambiguity about which hours are being measured. Single-day carts
          keep the original single bar + milestone ticks.                  */}
      {dayBuckets.length > 1 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 10 : 14 }}>
          {dayBuckets.map((d, i) => (
            <DayRow
              key={d.dateKey}
              label={d.label ?? `Day ${i + 1}`}
              hours={d.hours}
              compact={compact}
            />
          ))}
        </div>
      ) : (
        <>
          <div
            role="progressbar"
            aria-valuenow={Math.round(hours * 10) / 10}
            aria-valuemin={0}
            aria-valuemax={DAILY_HOUR_LIMIT}
            aria-label="Day completion"
            style={{
              position: 'relative',
              width: '100%',
              height: compact ? 6 : 8,
              borderRadius: 9999,
              background: 'rgba(0, 0, 0, 0.06)',
              overflow: 'hidden',
            }}
          >
            {/* 8-hour tick when over */}
            {isOver && (
              <div style={{
                position: 'absolute',
                left: `${(DAILY_HOUR_LIMIT / (DAILY_HOUR_LIMIT + over)) * 100}%`,
                top: 0, bottom: 0, width: 1,
                background: 'rgba(0,0,0,0.35)',
                zIndex: 2,
              }} />
            )}
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${pct}%`,
              background: fillColor,
              borderRadius: 9999,
              transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1), background 0.25s ease',
            }} />
            {isOver && (
              <div style={{
                position: 'absolute',
                left: `${Math.max(0, pct - overflowPct)}%`,
                top: 0, bottom: 0,
                width: `${overflowPct}%`,
                background: 'linear-gradient(90deg, rgba(255,90,54,0.6), rgba(255,90,54,1))',
                borderRadius: 9999,
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              }} />
            )}
          </div>

          {!compact && (
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              marginTop: 8,
              fontSize: 10.5, fontWeight: 600,
              fontFamily: 'var(--font-dm-sans)',
              color: 'var(--text-tertiary, rgba(255,255,255,0.4))',
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              {MILESTONES.map((m) => {
                const reached = hours >= m.at
                return (
                  <span key={m.label} style={{
                    color: reached ? 'var(--text-primary, white)' : undefined,
                    fontWeight: reached ? 700 : 600,
                    transition: 'color 0.2s ease',
                  }}>
                    {m.label}
                  </span>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Nudge */}
      <p style={{
        marginTop: compact ? 8 : 14,
        fontFamily: 'var(--font-dm-sans)',
        fontWeight: 500,
        fontSize: compact ? 12 : 13,
        lineHeight: 1.45,
        color: isOver
          ? 'var(--coral, #FF5A36)'
          : isPerfect
            ? 'var(--gold, #FFB300)'
            : 'var(--text-secondary, rgba(255,255,255,0.65))',
        letterSpacing: '-0.005em',
      }}>
        {nudge}
      </p>

      {/* ── Score breakdown (hidden in compact mode) ── */}
      {!compact && items.length > 0 && (
        <div style={{
          marginTop: 18,
          paddingTop: 16,
          borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <span style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-tertiary, rgba(255,255,255,0.45))',
            }}>
              Perfect Day Score
            </span>
            <span style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 800,
              fontSize: 26,
              letterSpacing: '-0.02em',
              color: scoreColor(total),
              lineHeight: 1,
            }}>
              {total}
              <span style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-tertiary, rgba(255,255,255,0.4))',
                fontFamily: 'var(--font-dm-sans)',
                marginLeft: 2,
              }}>
                /100
              </span>
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 10,
          }}>
            <Dimension label="Variety"    score={score.variety} />
            <Dimension label="Balance"    score={score.balance} />
            <Dimension label="Efficiency" score={score.efficiency} />
          </div>
        </div>
      )}
    </div>
  )
}

function Dimension({
  label,
  score,
}: {
  label: string
  score: { score: number; max: number }
}) {
  const pct = score.max === 0 ? 0 : (score.score / score.max) * 100
  const hot = pct >= 75
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 5, gap: 6,
      }}>
        <span style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary, rgba(255,255,255,0.5))',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </span>
        <span style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 700,
          fontSize: 12,
          color: hot ? 'var(--gold, #FFB300)' : 'var(--text-secondary, rgba(255,255,255,0.7))',
          whiteSpace: 'nowrap',
        }}>
          {Math.round(score.score)}
        </span>
      </div>
      <div style={{
        width: '100%',
        height: 4,
        borderRadius: 9999,
        background: 'rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: hot ? 'var(--gold, #FFB300)' : 'var(--text-secondary, rgba(255,255,255,0.45))',
          borderRadius: 9999,
          transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>
    </div>
  )
}

const MILESTONES: { at: number; label: string }[] = [
  { at: 0, label: 'Start' },
  { at: 3, label: 'Flow' },
  { at: 6, label: 'Perfect' },
  { at: 8, label: '8 hrs' },
]

function colorForStage(stage: DayStage): string {
  switch (stage) {
    case 'over':     return 'var(--coral, #FF5A36)'
    case 'perfect':  return 'var(--gold, #FFB300)'
    case 'flowing':  return 'var(--gold, #FFB300)'
    case 'starting': return 'var(--gold-dim, rgba(255, 179, 0, 0.55))'
    case 'empty':
    default:         return 'rgba(255, 179, 0, 0.25)'
  }
}

function scoreColor(total: number): string {
  if (total >= 90) return 'var(--gold, #FFB300)'
  if (total >= 60) return 'var(--text-primary, white)'
  return 'var(--text-secondary, rgba(255,255,255,0.7))'
}

function fmtHours(h: number): string {
  if (h === 0) return '0 hrs'
  const rounded = Math.round(h * 2) / 2
  const str = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1)
  return `${str} ${rounded === 1 ? 'hr' : 'hrs'}`
}

/* ═══════════════════════════════════════════════════════════════════════════
   Multi-day rendering — groups cart items by date into ordered buckets.
   Each bucket renders its own progress bar so nothing is ever summed.
   ═══════════════════════════════════════════════════════════════════════════ */

interface DayBucket {
  dateKey: string
  label: string | null
  hours: number
}

function buildDayBuckets(items: { date: string; duration: string }[]): DayBucket[] {
  const map: Record<string, number> = {}
  for (const it of items) {
    const key = it.date || 'unset'
    map[key] = (map[key] ?? 0) + parseDurationHours(it.duration)
  }
  return Object.entries(map)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dateKey, hours]) => ({
      dateKey,
      hours,
      label: dateKey === 'unset'
        ? 'Unassigned'
        : new Date(dateKey + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
          }),
    }))
}

/** Single-day progress row used inside the multi-day list. */
function DayRow({ label, hours, compact }: { label: string; hours: number; compact: boolean }) {
  const over = Math.max(0, hours - DAILY_HOUR_LIMIT)
  const isOver = over > 0
  const pct = Math.min(100, (hours / DAILY_HOUR_LIMIT) * 100)
  const overflowPct = isOver ? Math.min(40, (over / DAILY_HOUR_LIMIT) * 100) : 0
  const fill = isOver
    ? 'var(--coral, #FF5A36)'
    : hours >= 7 ? 'var(--gold, #FFB300)'
    : hours > 0 ? 'var(--gold-dim, rgba(255, 179, 0, 0.55))'
    : 'rgba(255, 179, 0, 0.2)'

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 6, gap: 10,
      }}>
        <span style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: compact ? 11 : 12, fontWeight: 600,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          color: 'var(--text-secondary, rgba(255,255,255,0.65))',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </span>
        <span style={{
          fontFamily: 'var(--font-syne)', fontWeight: 700,
          fontSize: compact ? 12 : 13,
          color: isOver ? 'var(--coral, #FF5A36)' : 'var(--text-primary, white)',
          whiteSpace: 'nowrap',
        }}>
          {fmtHours(hours)}
          <span style={{
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 500,
            fontSize: compact ? 10.5 : 11.5,
            color: 'var(--text-tertiary, rgba(255,255,255,0.45))',
            marginLeft: 3,
          }}>
            / {DAILY_HOUR_LIMIT}
          </span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(hours * 10) / 10}
        aria-valuemin={0}
        aria-valuemax={DAILY_HOUR_LIMIT}
        aria-label={label}
        style={{
          position: 'relative',
          width: '100%',
          height: compact ? 5 : 7,
          borderRadius: 9999,
          background: 'rgba(255, 255, 255, 0.06)',
          overflow: 'hidden',
        }}
      >
        {isOver && (
          <div style={{
            position: 'absolute',
            left: `${(DAILY_HOUR_LIMIT / (DAILY_HOUR_LIMIT + over)) * 100}%`,
            top: 0, bottom: 0, width: 1,
            background: 'rgba(255,255,255,0.35)',
            zIndex: 2,
          }} />
        )}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          background: fill,
          borderRadius: 9999,
          transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1), background 0.25s ease',
        }} />
        {isOver && (
          <div style={{
            position: 'absolute',
            left: `${Math.max(0, pct - overflowPct)}%`,
            top: 0, bottom: 0,
            width: `${overflowPct}%`,
            background: 'linear-gradient(90deg, rgba(255,90,54,0.6), rgba(255,90,54,1))',
            borderRadius: 9999,
          }} />
        )}
      </div>
    </div>
  )
}
