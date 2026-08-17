'use client'

import { DAILY_HOUR_LIMIT, parseDurationHours, useCartStore } from '@/lib/cart'
import { MapPin, Car, UtensilsCrossed, Coffee, Home, Plus, X } from 'lucide-react'
import { computeDayScore, type DayStage } from '@/lib/day-score'

interface DayBuilderProps {
  /** Compact variant for panel headers / drawers, hides the score breakdown */
  compact?: boolean
  /** Hide the top heading row (use when embedded inside another titled card) */
  hideHeading?: boolean
  /** Render the ordered run of the day (pickup -> stops -> drop-off). */
  showItinerary?: boolean
  style?: React.CSSProperties
}

/**
 * "Build Your Perfect Day", the evolution of the old 8-hour bar. Shows:
 *  • A stage label (Getting Started → Great Flow → Perfect Day)
 *  • A gold→emerald→coral progress bar tracking hours / 8
 *  • A score out of 100 (variety · balance · efficiency)
 *  • An encouraging action-oriented nudge
 *
 * Designed mobile-first: 12–14px body, touchable breakdown chips, no wraps.
 * Exported as the default export so existing imports (e.g. `TripTimeBar`) keep
 * working, the filename stays `TripTimeBar.tsx` for non-breaking backwards compat.
 */
export default function DayBuilder({ compact = false, hideHeading, style, showItinerary = false }: DayBuilderProps) {
  const items = useCartStore((s) => s.items)
  const stops = useCartStore((s) => s.stops)
  const pickup = useCartStore((s) => s.pickup)
  const pickupTime = useCartStore((s) => s.pickupTime)
  const breaks = useCartStore((s) => s.breaks)
  const setBreak = useCartStore((s) => s.setBreak)
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
                color: 'var(--gold, #FFB300)',
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
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-tertiary, rgba(255,255,255,0.45))',
            }}>
              Perfect Day Score
            </span>
            <span style={{
              fontFamily: 'var(--font-dm-sans)',
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

      {showItinerary && items.length > 0 && (
        <Itinerary
          items={items}
          stops={stops}
          pickup={pickup}
          pickupTime={pickupTime}
          breaks={breaks}
          setBreak={setBreak}
        />
      )}
    </div>
  )
}

/**
 * The day as a run, in the order it actually happens: collected from the hotel,
 * each experience, any food stops, then dropped back where we started. Times per
 * stop are deliberately absent — the driver sequences the day on the ground and
 * a printed time would read as a promise we cannot keep in Jamaican traffic.
 * Only the pickup time is fixed, because that is the one the guest must be ready for.
 */
function Itinerary({ items, stops, pickup, pickupTime, breaks, setBreak }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stops: any[]
  pickup: string
  pickupTime: string
  breaks: Record<number, number>
  setBreak: (afterItemId: number, minutes: number) => void
}) {
  const where = pickup?.trim() || 'your hotel'
  const ink = 'var(--text-primary, #fff)'
  const soft = 'var(--text-tertiary, rgba(255,255,255,0.55))'

  const Row = ({ icon, title, sub, tone, children }: {
    icon: React.ReactNode; title: string; sub?: string; tone?: string; children?: React.ReactNode
  }) => (
    <li style={{ position: 'relative', paddingLeft: 30, paddingBottom: 14 }}>
      <span aria-hidden style={{
        position: 'absolute', left: 0, top: 1, width: 20, height: 20, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: tone ?? 'var(--surface, rgba(255,255,255,0.10))',
        color: tone ? '#fff' : 'var(--text-secondary, rgba(255,255,255,0.75))',
      }}>{icon}</span>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13.5, fontWeight: 600, color: ink, lineHeight: 1.3 }}>{title}</p>
      {sub && <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 12, color: soft, marginTop: 1 }}>{sub}</p>}
      {children}
    </li>
  )

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border, rgba(255,255,255,0.10))' }}>
      <p style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: 12, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.09em', color: soft, marginBottom: 12,
      }}>
        Your day, in order
      </p>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative' }}>
        <span aria-hidden style={{
          position: 'absolute', left: 9.5, top: 14, bottom: 14, width: 1,
          background: 'var(--border, rgba(255,255,255,0.14))',
        }} />

        <Row icon={<Car size={11} />} tone="var(--accent, #171614)"
             title={`Pickup from ${where}`} sub={pickupTime ? `We collect you at ${pickupTime}` : 'We collect you to start the day'} />

        {items.map((item, i) => (
          <Row key={item.id} icon={<MapPin size={11} />}
               title={item.title}
               sub={`${item.destination} · ${item.duration}`}>
            <BreakControl
              minutes={breaks[item.id] ?? 0}
              onChange={(m) => setBreak(item.id, m)}
              last={i === items.length - 1 && stops.length === 0}
            />
          </Row>
        ))}

        {stops.map((stop) => (
          <Row key={`stop-${stop.id ?? stop.name}`} icon={<UtensilsCrossed size={11} />}
               title={stop.name} sub={`${stop.area ?? stop.destination ?? 'Jamaica'} · you settle your own bill`} />
        ))}

        <Row icon={<Home size={11} />} tone="var(--emerald, #1D7A50)"
             title={`Drop-off at ${where}`} sub="Back where we collected you" />
      </ol>
    </div>
  )
}

/** Add or clear a rest gap after a stop. Minutes only, never a clock time. */
function BreakControl({ minutes, onChange, last }: { minutes: number; onChange: (m: number) => void; last: boolean }) {
  const soft = 'var(--text-tertiary, rgba(255,255,255,0.55))'
  if (last) return null
  if (minutes > 0) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6,
        padding: '4px 8px 4px 10px', borderRadius: 9999,
        background: 'var(--surface, rgba(255,255,255,0.08))',
        fontFamily: 'var(--font-dm-sans)', fontSize: 12, color: soft,
      }}>
        <Coffee size={11} /> {minutes} min break
        <button onClick={() => onChange(0)} aria-label="Remove break"
          style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}>
          <X size={11} />
        </button>
      </span>
    )
  }
  return (
    <button onClick={() => onChange(45)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6,
        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
        fontFamily: 'var(--font-dm-sans)', fontSize: 12, color: soft, textDecoration: 'underline',
      }}>
      <Plus size={11} /> Add a break here
    </button>
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
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary, rgba(255,255,255,0.5))',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </span>
        <span style={{
          fontFamily: 'var(--font-dm-sans)',
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
   Multi-day rendering, groups cart items by date into ordered buckets.
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
          color: isOver ? 'var(--coral, #FF5A36)' : 'var(--text-primary, white)',
          whiteSpace: 'nowrap',
        }}>
          {fmtHours(hours)}
          <span style={{
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 500,
            fontSize: 12,
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
