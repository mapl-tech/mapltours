'use client'

import { DAILY_HOUR_LIMIT, useCartStore } from '@/lib/cart'
import { formatDayTime } from '@/lib/day-hours'
import { dayParts, type DayTime } from '@/lib/day-route'
import { computeDayScore, type DayStage } from '@/lib/day-score'

interface DayBuilderProps {
  /** Compact variant for panel headers / drawers, hides the score breakdown */
  compact?: boolean
  /** Hide the top heading row (use when embedded inside another titled card) */
  hideHeading?: boolean
  style?: React.CSSProperties
}

/**
 * "Build Your Perfect Day", the evolution of the old 8-hour bar. Shows:
 *  • A stage label (Relaxed day → Great Flow → Perfect Day)
 *  • A gold→emerald→coral progress bar tracking the day / 8 hours, where the
 *    day is the tours, the free food stops and the drives between them
 *    (lib/day-route dayTime), exactly what the checkout gate counts
 *  • What that time is made of, once it is more than the tours alone
 *  • An encouraging action-oriented nudge
 *
 * The 0-100 score and its variety/balance/efficiency bars were removed as
 * clutter; lib/day-score.ts still computes them because the stage label and
 * nudge above come from the same call.
 * Exported as the default export so existing imports (e.g. `TripTimeBar`) keep
 * working, the filename stays `TripTimeBar.tsx` for non-breaking backwards compat.
 */
/**
 * Text for a day over its hours: the brick red DayFlow and the checkout
 * dialog use (6.6:1 on the light page). The coral (#FF5A36) measured about
 * 2.9:1 there and now only fills the bar.
 */
const OVER_TEXT = '#B3261E'

export default function DayBuilder({ compact = false, hideHeading, style }: DayBuilderProps) {
  const items = useCartStore((s) => s.items)
  const stops = useCartStore((s) => s.stops)
  const dayTimesByDate = useCartStore((s) => s.dayTimesByDate)
  const score = computeDayScore(items, stops)

  const { hours, time, stage, stageLabel, nudge, isOver, isPerfect } = score
  const pct = Math.min(100, (hours / DAILY_HOUR_LIMIT) * 100)
  const over = Math.max(0, hours - DAILY_HOUR_LIMIT)
  const overflowPct = isOver ? Math.min(40, (over / DAILY_HOUR_LIMIT) * 100) : 0
  const fillColor = colorForStage(stage)

  // Build a per-day breakdown so multi-day carts show every day explicitly
  // (no more "is this number the sum or the max?" ambiguity).
  const dayBuckets = buildDayBuckets(dayTimesByDate())

  return (
    <div style={{ width: '100%', ...style }}>
      {!hideHeading && (
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: compact ? 8 : 12, gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{
              fontFamily: 'var(--font-dm-sans)',
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
                fontSize: 12, fontWeight: 700,
                fontFamily: 'var(--font-dm-sans)',
                letterSpacing: '0.06em', textTransform: 'uppercase',
                // Text, so --gold-text (8.2:1); --gold is a surface colour (3.3:1).
                color: 'var(--gold-text, #5A4A16)',
                whiteSpace: 'nowrap',
              }}>
                ✨ Perfect
              </span>
            )}
          </div>
          <span style={{
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 800,
            fontSize: compact ? 13 : 15,
            color: isOver ? OVER_TEXT : 'var(--text-primary, white)',
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
          }}>
            {dayBuckets.length > 1
              ? `${dayBuckets.length} days`
              : <>
                  {fmtDay(time.total)}
                  <span style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontWeight: 500,
                    fontSize: 12,
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

      {/* Where the heading is hidden (checkout's "Add more to your day"
          names the block), the day's length still leads: it is the answer
          the guest opened the block for. */}
      {hideHeading && dayBuckets.length <= 1 && (
        <p style={{
          margin: '0 0 8px',
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 16, fontWeight: 800, lineHeight: 1.3, letterSpacing: '-0.01em',
          color: isOver ? OVER_TEXT : 'var(--text-primary, white)',
        }}>
          {fmtDay(time.total)}
          <span style={{ fontWeight: 500, color: 'var(--text-tertiary, rgba(255,255,255,0.55))' }}> of {DAILY_HOUR_LIMIT} hrs</span>
        </p>
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
              time={d.time}
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
            aria-valuetext={`${fmtDay(time.total)} of ${DAILY_HOUR_LIMIT} hours, drives included`}
            aria-label="Length of your day"
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
              fontSize: 12, fontWeight: 600,
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

      {/* What the day is made of, once it is more than the tours alone:
          the drive between tours is the part a guest cannot see from the
          tour pages, so it is named, with the free food stops, beside the
          time at the tours. Single-day carts only; a multi-day cart's rows
          carry their own. */}
      {dayBuckets.length <= 1 && (time.driving > 0 || time.stops > 0) && (
        <p style={{
          marginTop: compact ? 8 : 12,
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 12, lineHeight: 1.45,
          color: 'var(--text-tertiary, rgba(255,255,255,0.55))',
        }}>
          {dayParts(time)}
        </p>
      )}

      {/* Nudge */}
      <p style={{
        marginTop: compact ? 8 : 14,
        fontFamily: 'var(--font-dm-sans)',
        fontWeight: 500,
        fontSize: compact ? 12 : 13,
        lineHeight: 1.45,
        color: isOver
          ? OVER_TEXT
          : isPerfect
            ? 'var(--gold-text, #5A4A16)'
            : 'var(--text-secondary, rgba(255,255,255,0.65))',
        letterSpacing: '-0.005em',
      }}>
        {nudge}
      </p>

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


/** A day's length for the bar: "0 hrs" before anything is in it. */
function fmtDay(minutes: number): string {
  return minutes === 0 ? '0 hrs' : formatDayTime(minutes)
}


/* ═══════════════════════════════════════════════════════════════════════════
   Multi-day rendering, groups cart items by date into ordered buckets.
   Each bucket renders its own progress bar so nothing is ever summed.
   ═══════════════════════════════════════════════════════════════════════════ */

interface DayBucket {
  dateKey: string
  label: string | null
  time: DayTime
}

function buildDayBuckets(byDate: Record<string, DayTime>): DayBucket[] {
  return Object.entries(byDate)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dateKey, time]) => ({
      dateKey,
      time,
      label: dateKey === 'unset'
        ? 'Unassigned'
        : new Date(dateKey + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
          }),
    }))
}

/** Single-day progress row used inside the multi-day list. */
function DayRow({ label, time, compact }: { label: string; time: DayTime; compact: boolean }) {
  const hours = time.total / 60
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
          fontSize: 12, fontWeight: 600,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          color: 'var(--text-secondary, rgba(255,255,255,0.65))',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </span>
        <span style={{
          fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
          fontSize: compact ? 12 : 13,
          color: isOver ? OVER_TEXT : 'var(--text-primary, white)',
          whiteSpace: 'nowrap',
        }}>
          {fmtDay(time.total)}
          <span style={{
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 500,
            fontSize: 12,
            color: 'var(--text-tertiary, rgba(255,255,255,0.45))',
            marginLeft: 3,
          }}>
            / {DAILY_HOUR_LIMIT} hrs
          </span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(hours * 10) / 10}
        aria-valuemin={0}
        aria-valuemax={DAILY_HOUR_LIMIT}
        aria-valuetext={`${fmtDay(time.total)} of ${DAILY_HOUR_LIMIT} hours, drives included`}
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
