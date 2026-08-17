'use client'

import { Car, Home, Utensils, Plus, X } from 'lucide-react'
import { parseDurationHours, STOP_HOURS, useCartStore } from '@/lib/cart'
import { EATS } from '@/lib/eats'
import { useState } from 'react'

/**
 * The day, read top to bottom.
 *
 * The Day Builder scored a day out of 100 without ever naming what was in it,
 * so a guest could see "Great Flow · 58/100" and still not know the order they
 * would actually travel in. This is the itinerary itself: collected here, this
 * tour, that lunch, home again.
 *
 * Deliberately no clock times. Start times depend on the driver, the road and
 * the day's other bookings, and printing "09:00 — Dunn's River" would be a
 * promise nobody made. Durations are shown instead, because those come from
 * the experience data and are true.
 */

const RAIL = 'rgba(23,22,20,0.14)'

type Kind = 'pickup' | 'experience' | 'stop' | 'dropoff'

interface FlowNode {
  key: string
  kind: Kind
  title: string
  detail?: string
  meta?: string
  onRemove?: () => void
}

export default function DayFlow({ compact = false }: { compact?: boolean }) {
  const items = useCartStore((s) => s.items)
  const stops = useCartStore((s) => s.stops)
  const pickup = useCartStore((s) => s.pickup)
  const removeItem = useCartStore((s) => s.removeItem)
  const removeStop = useCartStore((s) => s.removeStop)
  const addStop = useCartStore((s) => s.addStop)
  const isStopAdded = useCartStore((s) => s.isStopAdded)
  const [picking, setPicking] = useState(false)

  if (items.length === 0 && stops.length === 0) return null

  const where = pickup?.trim() || 'Your hotel'

  const nodes: FlowNode[] = [
    { key: 'pickup', kind: 'pickup', title: 'Pickup', detail: where },
  ]

  items.forEach((item) => {
    nodes.push({
      key: `exp-${item.id}`,
      kind: 'experience',
      title: item.title,
      detail: `${item.destination}, ${item.parish}`,
      meta: item.duration,
      onRemove: () => removeItem(item.id),
    })
  })

  stops.forEach((s) => {
    nodes.push({
      key: `stop-${s.name}`,
      kind: 'stop',
      title: s.name,
      detail: `${s.town}, ${s.parish}`,
      meta: '1–2 hrs · pay at the door',
      onRemove: () => removeStop(s.name),
    })
  })

  nodes.push({ key: 'dropoff', kind: 'dropoff', title: 'Drop-off', detail: where })

  const totalHours =
    items.reduce((n, i) => n + parseDurationHours(i.duration), 0) +
    stops.length * STOP_HOURS

  return (
    <div style={{ width: '100%' }}>
      <p style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'var(--text-tertiary)', marginBottom: 14,
      }}>
        Your day, in order
      </p>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {nodes.map((n, i) => (
          <li key={n.key} style={{ display: 'flex', gap: 14, position: 'relative' }}>
            {/* Rail + marker */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              flexShrink: 0, width: 26,
            }}>
              <Marker kind={n.kind} />
              {i < nodes.length - 1 && (
                <div style={{ width: 2, flex: 1, minHeight: compact ? 22 : 30, background: RAIL }} />
              )}
            </div>

            {/* Content */}
            <div style={{ paddingBottom: i < nodes.length - 1 ? (compact ? 14 : 20) : 0, flex: 1, minWidth: 0 }}>
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
                {n.onRemove && !compact && (
                  <button
                    onClick={n.onRemove}
                    aria-label={`Remove ${n.title}`}
                    style={{
                      marginLeft: 'auto', background: 'none', border: 'none', padding: 2,
                      cursor: 'pointer', color: 'var(--text-tertiary)', lineHeight: 0,
                    }}
                  >
                    <X size={13} />
                  </button>
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

            </div>
          </li>
        ))}
      </ol>

      {/* Add a food stop while building the day, rather than only from the
          home feed. These are free to add and paid directly to the venue —
          MAPL never charges for them and never takes a cut, so they change
          the itinerary but not the total. */}
      {!compact && (
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
              {EATS.map((e) => {
                const added = isStopAdded(e.name)
                return (
                  <button
                    key={e.name}
                    onClick={() =>
                      addStop({
                        name: e.name, town: e.town, parish: e.parish,
                        knownFor: e.knownFor, image: e.image, mapsQuery: e.mapsQuery,
                      })
                    }
                    disabled={added}
                    style={{
                      width: '100%', textAlign: 'left', background: 'none',
                      border: 'none', padding: '8px 10px', borderRadius: 8,
                      cursor: added ? 'default' : 'pointer', opacity: added ? 0.5 : 1,
                      fontFamily: 'var(--font-dm-sans)',
                    }}
                  >
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {e.name} {added && <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>· added</span>}
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                      {e.town} &middot; {e.knownFor}
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

function Marker({ kind }: { kind: Kind }) {
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
      <div style={{ ...base, background: 'rgba(196,164,74,0.16)', border: '1px solid var(--gold-warm)', color: 'var(--gold-text)' }}>
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
