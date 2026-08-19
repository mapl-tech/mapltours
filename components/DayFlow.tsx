'use client'

import { Car, Home, Utensils, Plus, X, ChevronUp, ChevronDown } from 'lucide-react'
import { parseDurationHours, STOP_HOURS, useCartStore } from '@/lib/cart'
import { EATS } from '@/lib/eats'
import { planDay, fitCandidateStop, canMoveItem, dayAreas, roundFive, MAX_STOP_GAP_MIN } from '@/lib/day-route'
import { useState } from 'react'

/**
 * The day, read top to bottom — and, at checkout, rearranged.
 *
 * The Day Builder scored a day out of 100 without ever naming what was in it,
 * so a guest could see "Great Flow · 58/100" and still not know the order they
 * would travel in. This is the itinerary itself: collected here, this tour,
 * that lunch, home again.
 *
 * Shape comes from lib/day-route: the day opens with a tour, each tour carries
 * at most one food stop directly after it, and no stop sits more than half an
 * hour from the tour before it or whatever comes next. The order is the
 * guest's — the arrows move a tour and its stop together — but only into
 * orders that keep every stop inside that half hour, which is why an arrow is
 * sometimes disabled with the name of the stop it would strand.
 *
 * Deliberately no clock times. Start times depend on the driver, the road and
 * the day's other bookings, and printing "09:00 — Dunn's River" would be a
 * promise nobody made. Durations are shown instead, because those come from
 * the experience data and are true.
 */

const RAIL = 'rgba(23,22,20,0.14)'
/** Warning ink. Same brick red the admin desk uses; the palette has no
 *  --coral token on this theme. */
const WARN = '#B3261E'

type Kind = 'pickup' | 'experience' | 'stop' | 'dropoff'

interface FlowNode {
  key: string
  kind: Kind
  title: string
  detail?: string
  meta?: string
  /** Where this sits in the route, e.g. "About 15 min from Dunn's River Falls". */
  note?: string
  /** The note is a problem, not a reassurance. */
  warn?: boolean
  /** Render the note as quiet detail rather than as a highlight. */
  muted?: boolean
  onRemove?: () => void
  move?: {
    up: (() => void) | null
    down: (() => void) | null
    upReason: string | null
    downReason: string | null
  }
}

export default function DayFlow({ compact = false }: { compact?: boolean }) {
  const items = useCartStore((s) => s.items)
  const stops = useCartStore((s) => s.stops)
  const pickup = useCartStore((s) => s.pickup)
  const dropoff = useCartStore((s) => s.dropoff)
  const removeItem = useCartStore((s) => s.removeItem)
  const removeStop = useCartStore((s) => s.removeStop)
  const addStop = useCartStore((s) => s.addStop)
  const moveItem = useCartStore((s) => s.moveItem)
  const isStopAdded = useCartStore((s) => s.isStopAdded)
  const droppedStops = useCartStore((s) => s.droppedStops)
  const clearDroppedStops = useCartStore((s) => s.clearDroppedStops)
  const [picking, setPicking] = useState(false)

  if (items.length === 0 && stops.length === 0) return null

  const ctx = { items, stops }
  const where = pickup?.trim() || 'Your hotel'
  const backTo = dropoff?.trim() || where
  // Reordering belongs to the full-size view (checkout); the drawer is a
  // summary, and a row of arrows in a 400px panel is noise.
  const canReorder = !compact && items.length > 1

  const plan = planDay(ctx)

  // Pickup and drop-off bracket the day for the reader, and nothing more:
  // both are collected at checkout, long after this list is built, so the
  // rules deliberately never measure a stop or a tour against them.
  const nodes: FlowNode[] = plan.nodes.map((node): FlowNode => {
    if (node.kind === 'experience') {
      const id = node.item.id
      const index = items.findIndex((i) => i.id === id)
      // The drive in from the tour before it. This is rule 2 made visible:
      // the day is a chain of tours near each other, and the only way to see
      // whether it is, is to print the legs.
      const leg = plan.legs.find((l) => l.toId === id)
      const up = index > 0 ? canMoveItem(ctx, id, -1) : { ok: false, reason: null }
      const down = index < items.length - 1 ? canMoveItem(ctx, id, 1) : { ok: false, reason: null }
      return {
        key: node.key,
        kind: 'experience',
        title: node.item.title,
        detail: `${node.item.destination}, ${node.item.parish}`,
        meta: node.item.duration,
        note: leg && leg.minutes !== null
          ? leg.over
            ? `About ${roundFive(leg.minutes)} min from ${leg.from} — further than a day should stretch`
            : `About ${roundFive(leg.minutes)} min drive from ${leg.from}`
          : undefined,
        warn: leg?.over ?? false,
        muted: !leg?.over,
        onRemove: () => removeItem(id),
        move: canReorder
          ? {
              up: up.ok ? () => moveItem(id, -1) : null,
              down: down.ok ? () => moveItem(id, 1) : null,
              upReason: up.reason,
              downReason: down.reason,
            }
          : undefined,
      }
    }
    // A stop can only fail its fit here by outliving the tour it was added
    // behind — the rule is enforced on the way in, and removals re-home what
    // they can. Say so plainly and keep the remove button reachable.
    const stranded = !node.fit.allowed
    return {
      key: node.key,
      kind: 'stop',
      title: node.stop.name,
      detail: `${node.stop.town}, ${node.stop.parish}`,
      meta: '1–2 hrs · pay at the door',
      note: stranded ? (node.fit.reason ?? 'Off your route') : node.fit.label,
      warn: stranded,
      onRemove: () => removeStop(node.stop.name),
    }
  })

  nodes.unshift({ key: 'pickup', kind: 'pickup', title: 'Pickup', detail: where })
  nodes.push({ key: 'dropoff', kind: 'dropoff', title: 'Drop-off', detail: backTo })

  const totalHours =
    items.reduce((n, i) => n + parseDurationHours(i.duration), 0) +
    stops.length * STOP_HOURS

  // Every eatery, judged in the slot the day would give it, closest first.
  // Sorting by that gap is most of the guidance: the top of the list is what
  // the day already drives past.
  const choices = EATS
    .map((e) => ({ eat: e, fit: fitCandidateStop(e, ctx) }))
    .sort((a, b) => {
      if (a.fit.allowed !== b.fit.allowed) return a.fit.allowed ? -1 : 1
      return (a.fit.minutes ?? Infinity) - (b.fit.minutes ?? Infinity)
    })

  return (
    <div style={{ width: '100%' }}>
      <p style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'var(--text-tertiary)', marginBottom: canReorder ? 6 : 14,
      }}>
        Your day, in order
      </p>

      {canReorder && (
        <p style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 12,
          color: 'var(--text-tertiary)', margin: '0 0 14px', lineHeight: 1.45,
        }}>
          Use the arrows to change the order. A food stop travels with the tour
          it follows, and a move that would leave one stranded is greyed out.
        </p>
      )}

      {/* What happened to a stop we could not keep. Shown once, dismissible:
          a chosen thing disappearing without a word is worse than the loss. */}
      {droppedStops.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          border: `1px solid ${WARN}`, background: 'rgba(179,38,30,0.06)',
          borderRadius: 'var(--r-md)', padding: '10px 12px', marginBottom: 14,
        }}>
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 12, lineHeight: 1.45,
            color: 'var(--text-primary)', margin: 0, flex: 1,
          }}>
            {droppedStops.join(' and ')} {droppedStops.length === 1 ? 'was' : 'were'} removed
            with the tour {droppedStops.length === 1 ? 'it' : 'they'} sat with — no other tour
            in your day is within {MAX_STOP_GAP_MIN} minutes of {droppedStops.length === 1 ? 'it' : 'them'}.
          </p>
          <button
            onClick={clearDroppedStops}
            aria-label="Dismiss"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: WARN, lineHeight: 0, padding: 2 }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {nodes.map((n, i) => (
          <li key={n.key} style={{ display: 'flex', gap: 14, position: 'relative' }}>
            {/* Rail + marker */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              flexShrink: 0, width: 26,
            }}>
              <Marker kind={n.kind} warn={n.warn} />
              {i < nodes.length - 1 && (
                <div style={{ width: 2, flex: 1, minHeight: compact ? 22 : 30, background: RAIL }} />
              )}
            </div>

            {/* Content, then the row's controls.
                The controls are a SIBLING of the text rather than the last
                child of the title line: inside it they were part of a
                wrapping flex row, so a long tour name pushed the remove
                button onto a line of its own and shoved the location text
                down with it. Out here they stay pinned to the top right
                whatever the title does. */}
            <div style={{
              paddingBottom: i < nodes.length - 1 ? (compact ? 14 : 20) : 0,
              flex: 1, minWidth: 0, display: 'flex', gap: 8,
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <p style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: compact ? 13.5 : 15,
                  fontWeight: n.kind === 'experience' ? 700 : 600,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}>
                  {n.title}
                </p>
                {n.meta && (
                  <span style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: 11.5,
                    color: 'var(--text-tertiary)',
                  }}>
                    {n.meta}
                  </span>
                )}
              </div>

              {n.detail && (
                <p style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: 12.5,
                  color: 'var(--text-tertiary)', margin: '2px 0 0',
                }}>
                  {n.detail}
                </p>
              )}
              {n.note && (
                <p style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: 11.5,
                  color: n.warn ? WARN : n.muted ? 'var(--text-tertiary)' : 'var(--gold-text)',
                  margin: '3px 0 0', lineHeight: 1.4,
                }}>
                  {n.note}
                </p>
              )}
            </div>

            <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 2, flexShrink: 0, marginTop: -7 }}>
              {n.move && (
                <>
                  <MoveButton dir="up" title={n.title} onClick={n.move.up} reason={n.move.upReason} />
                  <MoveButton dir="down" title={n.title} onClick={n.move.down} reason={n.move.downReason} />
                </>
              )}
              {/* Every tour and every stop can be dropped from here, in
                  the drawer as well as at checkout. The drawer used to hide
                  these — the itinerary was the one place a guest could see the
                  day whole and the only place they could not edit it, which
                  sent them to checkout to remove a tour they had already
                  decided against. Sized as a real tap target rather than a
                  13px glyph, since on a phone this list IS the itinerary. */}
              {n.onRemove && (
                <button
                  onClick={n.onRemove}
                  aria-label={`Remove ${n.title} from your day`}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    width: 36, height: 36, flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: n.warn ? WARN : 'var(--text-tertiary)', lineHeight: 0,
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </span>
            </div>
          </li>
        ))}
      </ol>

      {/* Add a food stop while building the day, rather than only from the
          home feed. These are free and paid directly to the venue — MAPL never
          charges for them and never takes a cut, so they change the itinerary
          but not the total. Offered only once there is a tour to hang one on,
          which states the rule as an absence rather than as an error. */}
      {!compact && items.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <button
            onClick={() => setPicking((v) => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'none', border: '1px dashed var(--border-strong)',
              borderRadius: 999, padding: '6px 13px', cursor: 'pointer',
              fontFamily: 'var(--font-dm-sans)', fontSize: 12, fontWeight: 600,
              color: 'var(--text-secondary)',
            }}
          >
            <Plus size={12} /> {picking ? 'Close' : 'Add a food stop'}
          </button>

          {picking && (
            <div style={{
              marginTop: 10, maxHeight: 260, overflowY: 'auto',
              border: `1px solid ${RAIL}`, borderRadius: 'var(--r-md)',
              background: 'var(--bg-warm)', padding: 6,
            }}>
              <p style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: 11.5,
                color: 'var(--text-tertiary)', padding: '6px 10px 8px', margin: 0,
                lineHeight: 1.45,
              }}>
                Closest to your {dayAreas(items)} day first, timed from whatever it
                would sit beside. Add as many as the day fits, in a row if they are
                near each other; anything more than {MAX_STOP_GAP_MIN} minutes off the route is
                greyed out.
              </p>
              {choices.map(({ eat: e, fit }) => {
                const added = isStopAdded(e.name)
                const blocked = !added && !fit.allowed
                return (
                  <button
                    key={e.name}
                    onClick={() =>
                      addStop({
                        name: e.name, town: e.town, parish: e.parish,
                        knownFor: e.knownFor, image: e.image, mapsQuery: e.mapsQuery,
                      })
                    }
                    disabled={added || blocked}
                    title={fit.reason ?? undefined}
                    style={{
                      width: '100%', textAlign: 'left', background: 'none',
                      border: 'none', padding: '8px 10px', borderRadius: 8,
                      cursor: added || blocked ? 'default' : 'pointer',
                      opacity: added ? 0.5 : blocked ? 0.42 : 1,
                      fontFamily: 'var(--font-dm-sans)',
                    }}
                  >
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {e.name} {added && <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>· added</span>}
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                      {e.town} &middot; {e.knownFor}
                    </span>
                    <span style={{
                      display: 'block', fontSize: 11,
                      color: blocked ? 'var(--text-tertiary)' : 'var(--gold-text)',
                      marginTop: 2,
                    }}>
                      {!blocked
                        ? fit.label
                        : fit.minutes && fit.neighbour
                          ? `Off your route · about ${Math.max(5, Math.round(fit.minutes / 5) * 5)} min from ${fit.neighbour}`
                          : 'Off your route'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <p style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: 12,
        color: 'var(--text-tertiary)', marginTop: 14,
        paddingTop: 12, borderTop: `1px solid ${RAIL}`,
      }}>
        {totalHours > 0 && <>About {formatHours(totalHours)} in the day. </>}
        Your driver handles everything between these stops, and times are confirmed
        before the day. Food stops are free to add &mdash; you pay the restaurant
        directly, at their price.
      </p>
    </div>
  )
}

/**
 * One reorder arrow. Disabled carries the reason as a tooltip when there is
 * one — at the ends of the list there is nothing to explain, but a refused
 * move in the middle always names the stop it would strand.
 */
function MoveButton({ dir, title, onClick, reason }: {
  dir: 'up' | 'down'
  title: string
  onClick: (() => void) | null
  reason: string | null
}) {
  const Icon = dir === 'up' ? ChevronUp : ChevronDown
  return (
    <button
      onClick={onClick ?? undefined}
      disabled={!onClick}
      title={!onClick ? (reason ?? undefined) : undefined}
      aria-label={`Move ${title} ${dir === 'up' ? 'earlier' : 'later'} in the day`}
      style={{
        background: 'none', border: 'none', padding: 4, lineHeight: 0,
        cursor: onClick ? 'pointer' : 'not-allowed',
        color: onClick ? 'var(--text-secondary)' : 'rgba(23,22,20,0.22)',
      }}
    >
      <Icon size={15} />
    </button>
  )
}

function Marker({ kind, warn }: { kind: Kind; warn?: boolean }) {
  const base: React.CSSProperties = {
    width: 26, height: 26, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  }
  if (kind === 'pickup' || kind === 'dropoff') {
    // The car collects you, the house is where the day ends. A flag read as a
    // finish line rather than a place.
    return (
      <div style={{ ...base, background: 'var(--text-primary)', color: '#fff' }}>
        {kind === 'pickup' ? <Car size={16} /> : <Home size={13} />}
      </div>
    )
  }
  if (kind === 'stop') {
    return (
      <div style={{
        ...base,
        background: warn ? 'rgba(179,38,30,0.10)' : 'rgba(196,164,74,0.16)',
        border: `1px solid ${warn ? WARN : 'var(--gold-warm)'}`,
        color: warn ? WARN : 'var(--gold-text)',
      }}>
        <Utensils size={12} />
      </div>
    )
  }
  return (
    <div style={{ ...base, background: 'var(--accent)', color: '#fff' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />
    </div>
  )
}

function formatHours(h: number): string {
  const rounded = Math.round(h * 2) / 2
  return rounded === 1 ? '1 hour' : `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} hours`
}
