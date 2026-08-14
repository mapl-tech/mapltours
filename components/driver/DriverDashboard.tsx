'use client'

import { useState } from 'react'
import type { DriverTrip } from '@/lib/driver'
import { jaDate, jaTime, shiftIso, gcalLink, waLink, DEPARTURE_BUFFER_MIN } from '@/lib/dispatch'
import { flightLinks, flightDate, type FlightStatus } from '@/lib/flight'

/**
 * Driver portal view. Renders ONLY DriverTrip data (built server-side by
 * lib/driver.ts), so the customer's total, fees, and MAPL's margin are never
 * in this component's props or the page payload. Read-only: the driver taps
 * out to WhatsApp / phone / maps / calendar; nothing here writes.
 */

const dm = 'var(--font-dm-sans)'
const ink = '#171614'
const soft = '#57534C'
const faint = '#6E6A62' // 5.38:1 on white - AA for small text
const green = '#1D7A50'
const amber = '#7A5A08'
const red = '#B01C0C'
const border = '1px solid #E7E1D6'
const borderSoft = '1px solid #F1ECE3'
const tnum = { fontVariantNumeric: 'tabular-nums' as const }
const cardLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: faint, margin: 0 }

function money(n: number): string { return '$' + n.toFixed(2) }
function paidStamp(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return '' }
}

/** Pill link/button: 48px tall for touch, full label. */
function Act({ href, onClick, children, tone = 'outline', grow }: {
  href?: string; onClick?: () => void; children: React.ReactNode
  tone?: 'outline' | 'wa' | 'solid'; grow?: boolean
}) {
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    minHeight: 48, padding: '0 16px', borderRadius: 12, cursor: 'pointer',
    fontFamily: dm, fontSize: 14, fontWeight: 600, textDecoration: 'none',
    transition: 'transform 0.12s ease, background 0.15s ease',
    flexGrow: grow ? 1 : 0, flexBasis: grow ? 0 : 'auto', textAlign: 'center',
    border: tone === 'wa' ? '1px solid #128C7E' : tone === 'solid' ? `1px solid ${ink}` : border,
    background: tone === 'wa' ? 'rgba(18,140,126,0.10)' : tone === 'solid' ? ink : '#fff',
    color: tone === 'wa' ? '#0B5E54' : tone === 'solid' ? '#fff' : ink,
  }
  if (href) return <a className="drv-act" href={href} target="_blank" rel="noreferrer" style={style}>{children}</a>
  return <button className="drv-act" type="button" onClick={onClick} style={style}>{children}</button>
}

function PayChip({ paid, label }: { paid: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999,
      fontSize: 12.5, fontWeight: 700,
      background: paid ? 'rgba(29,122,80,0.12)' : 'rgba(122,90,8,0.12)',
      border: `1px solid ${paid ? 'rgba(29,122,80,0.35)' : 'rgba(122,90,8,0.35)'}`,
      color: paid ? green : amber,
    }}>
      <span aria-hidden="true">{paid ? '✓' : '·'}</span>{label}
    </span>
  )
}

/* ── Live flight status (driver-safe endpoint) ── */

function clockMinutes(s: string | null | undefined): number | null {
  if (!s) return null
  const m = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  let h = Number(m[1]) % 12
  if (/pm/i.test(m[3])) h += 12
  return h * 60 + Number(m[2])
}

function FlightRow({ legLabel, flightRaw, dateIso, mbjRole }: {
  legLabel: string; flightRaw: string | null; dateIso: string | null
  mbjRole: 'arrival' | 'departure'
}) {
  const [st, setSt] = useState<FlightStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const links = flightLinks(flightRaw, dateIso)
  const booked = jaTime(dateIso)

  const check = async () => {
    setLoading(true)
    const r = await fetch(`/api/driver/flight?flight=${encodeURIComponent(flightRaw ?? '')}&date=${flightDate(dateIso) ?? ''}`).catch(() => null)
    setSt(r && r.ok ? await r.json().catch(() => null) : { configured: false, resolvable: false, found: false, ident: null, status: null })
    setLoading(false)
  }

  const authLeg = st ? (mbjRole === 'arrival' ? st.arrival : st.departure) : null
  const authTime = authLeg?.revisedLocal || authLeg?.scheduledLocal || null
  const diff = authTime ? (() => { const a = clockMinutes(booked); const b = clockMinutes(authTime); return a != null && b != null ? b - a : null })() : null
  const bigMismatch = diff != null && Math.abs(diff) > 30

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{legLabel}</span>
        <span style={{ fontSize: 13, color: soft, ...tnum }}>{links?.ident ?? flightRaw ?? 'flight TBD'}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {links && <Act href={links.google}>Google</Act>}
        {links && <Act href={links.flightaware}>FlightAware</Act>}
        {links && <Act tone="solid" onClick={check}>{loading ? 'Checking…' : 'Live status'}</Act>}
        {!links && <span style={{ fontSize: 13, color: faint }}>No flight number yet. MAPL will send it.</span>}
      </div>
      {st && (
        <div style={{ marginTop: 8 }}>
          {st.found && authTime ? (
            <div style={{
              padding: '9px 12px', borderRadius: 10,
              background: bigMismatch ? '#FCEDEA' : '#EAF4EE',
              border: `1px solid ${bigMismatch ? 'rgba(176,28,12,0.25)' : 'rgba(29,122,80,0.25)'}`,
            }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: bigMismatch ? red : green, ...tnum }}>
                Airline: {authTime}{st.status ? ` · ${st.status}` : ''}
              </span>
              {bigMismatch && (
                <span style={{ display: 'block', fontSize: 12.5, color: red, marginTop: 3 }}>
                  Differs from the booked {booked}. Confirm with MAPL before driving.
                </span>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 12.5, color: faint, margin: 0 }}>No live data right now. Use Google or FlightAware above.</p>
          )}
        </div>
      )}
    </div>
  )
}

/* ── One trip card ── */

function TripCard({ t }: { t: DriverTrip }) {
  const isRT = t.tripType === 'round_trip'
  const arrCal = t.arrivalAt ? gcalLink({
    title: `MAPL pickup: ${t.guestName} (${t.ref})`,
    startIso: t.arrivalAt, durationMin: 60,
    location: `${t.airport}, Montego Bay`,
    details: `Drop-off: ${t.hotel}. Passengers: ${t.passengers}. Guest: ${t.guestPhone ?? ''}. Your pay: ${money(t.payoutLegs[0].amount)}${isRT ? ' (leg 1 of 2)' : ''}.`,
  }) : null
  const depCal = isRT && t.departureAt ? gcalLink({
    title: `MAPL departure pickup: ${t.guestName} (${t.ref})`,
    startIso: shiftIso(t.departureAt, -DEPARTURE_BUFFER_MIN), durationMin: 90,
    location: t.hotel,
    details: `Drop at ${t.airport}. Flight ${t.departureFlight ?? ''} departs ${jaTime(t.departureAt)} Jamaica time. Your pay: ${money(t.payoutLegs[1]?.amount ?? 0)} (leg 2 of 2).`,
  }) : null
  const mapsHotel = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.hotel + ', Jamaica')}`

  return (
    <article aria-label={`Trip ${t.ref}`} style={{ background: '#fff', border, borderRadius: 16, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', background: '#FCFBF8', borderBottom: borderSoft, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: 15, ...tnum }}>{t.ref}</span>
          <span style={{ fontSize: 12.5, color: soft }}>{isRT ? 'Round trip' : 'One-way'} · {t.passengers} pax</span>
        </div>
        <PayChip paid={t.fullyPaid} label={t.fullyPaid ? 'Paid in full' : 'Pay pending'} />
      </div>

      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Guest */}
        <div>
          <p style={cardLabel}>Guest</p>
          <p style={{ fontSize: 16, fontWeight: 700, margin: '6px 0 0' }}>{t.guestName}</p>
          {t.guestPhone && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <Act grow tone="wa" href={waLink(t.guestPhone, `Hello ${t.guestName}, this is your MAPL Tours driver.`)}>WhatsApp guest</Act>
              <Act grow href={`tel:${t.guestPhone.replace(/[^+\d]/g, '')}`}>Call guest</Act>
            </div>
          )}
          {t.specialRequests && (
            <div style={{ marginTop: 10, padding: '9px 12px', background: '#FCF6E4', border: '1px solid #F0E4BE', borderRadius: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: amber }}>Note: </span>
              <span style={{ fontSize: 13.5, color: ink, whiteSpace: 'pre-wrap' }}>{t.specialRequests}</span>
            </div>
          )}
        </div>

        {/* Arrival leg */}
        <div style={{ paddingTop: 14, borderTop: borderSoft }}>
          <p style={cardLabel}>Arrival · airport to hotel</p>
          <p style={{ fontSize: 14.5, fontWeight: 600, margin: '6px 0 0', lineHeight: 1.45 }}>
            {t.airport} <span aria-hidden="true">→</span> {t.hotel}
          </p>
          <p style={{ fontSize: 13.5, color: soft, margin: '4px 0 0', ...tnum }}>
            {jaDate(t.arrivalAt)} · lands {jaTime(t.arrivalAt)} Jamaica time
          </p>
          <div style={{ marginTop: 10 }}>
            <FlightRow legLabel="Flight" flightRaw={t.arrivalFlight} dateIso={t.arrivalAt} mbjRole="arrival" />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <Act grow href={mapsHotel}>Map to hotel</Act>
            {arrCal && <Act grow href={arrCal}>Add to calendar</Act>}
          </div>
        </div>

        {/* Departure leg */}
        {isRT && t.departureAt && (
          <div style={{ paddingTop: 14, borderTop: borderSoft }}>
            <p style={cardLabel}>Departure · hotel to airport</p>
            <p style={{ fontSize: 14.5, fontWeight: 600, margin: '6px 0 0', lineHeight: 1.45 }}>
              {t.hotel} <span aria-hidden="true">→</span> {t.airport}
            </p>
            <p style={{ fontSize: 13.5, color: soft, margin: '4px 0 0', ...tnum }}>
              {jaDate(t.departureAt)} · flight departs {jaTime(t.departureAt)} Jamaica time
            </p>
            <p style={{ fontSize: 13, color: amber, fontWeight: 600, margin: '4px 0 0', ...tnum }}>
              Suggested hotel pickup {jaTime(shiftIso(t.departureAt, -DEPARTURE_BUFFER_MIN))} (flight minus 4h, adjust for traffic)
            </p>
            <div style={{ marginTop: 10 }}>
              <FlightRow legLabel="Flight" flightRaw={t.departureFlight} dateIso={t.departureAt} mbjRole="departure" />
            </div>
            {depCal && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <Act grow href={depCal}>Add to calendar</Act>
              </div>
            )}
          </div>
        )}

        {/* Pay */}
        <div style={{ paddingTop: 14, borderTop: borderSoft }}>
          <p style={cardLabel}>Your pay</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {t.payoutLegs.map((p) => (
              <div key={p.leg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, color: soft }}>
                  {isRT ? (p.leg === 'arrival' ? 'After arrival dropoff' : 'After airport dropoff') : 'After the ride'}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, ...tnum }}>{money(p.amount)}</span>
                  <PayChip paid={p.paid} label={p.paid ? `Paid ${paidStamp(p.paidAt)}` : 'Pending'} />
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: borderSoft }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>Trip total</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: green, ...tnum }}>{money(t.payoutTotal)} USD</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

/* ── The dashboard ── */

/** The single next leg the driver has to drive, across all trips. */
function nextPickup(trips: DriverTrip[]): { t: DriverTrip; when: string; role: 'arrival' | 'departure' } | null {
  const now = Date.now()
  let best: { t: DriverTrip; iso: string; role: 'arrival' | 'departure' } | null = null
  for (const t of trips) {
    const legs: Array<['arrival' | 'departure', string | null]> = [['arrival', t.arrivalAt], ['departure', t.departureAt]]
    for (const [role, iso] of legs) {
      if (!iso) continue
      const ms = new Date(iso).getTime()
      if (ms < now - 2 * 3600_000) continue // already driven
      if (!best || ms < new Date(best.iso).getTime()) best = { t, iso, role }
    }
  }
  if (!best) return null
  return { t: best.t, when: `${jaDate(best.iso)} · ${jaTime(best.iso)}`, role: best.role }
}

export default function DriverDashboard({ trips, driverLabel, adminPreview }: {
  trips: DriverTrip[]
  driverLabel: string
  adminPreview?: boolean
}) {
  const owedTotal = trips.reduce((s, t) => s + t.payoutTotal, 0)
  const paidTotal = trips.reduce((s, t) => s + t.payoutLegs.filter((p) => p.paid).reduce((x, p) => x + p.amount, 0), 0)
  const pendingTotal = Math.round((owedTotal - paidTotal) * 100) / 100
  const next = nextPickup(trips)

  return (
    <div style={{ fontFamily: dm, color: ink }}>
      {adminPreview && (
        <p style={{
          margin: '0 0 14px', padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: 'rgba(122,90,8,0.10)', border: '1px solid rgba(122,90,8,0.30)', color: amber,
        }}>
          Admin preview. This is exactly what {driverLabel} sees: no customer totals, no fees, no margin.
        </p>
      )}

      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(22px, 4vw, 26px)', letterSpacing: '-0.02em', margin: 0 }}>Your trips</h1>
          <p style={{ fontSize: 13.5, color: soft, margin: '4px 0 0' }}>{driverLabel} · MAPL Tours Jamaica</p>
        </div>
      </header>

      {/* The one fact that matters most: the next pickup */}
      {next && (
        <section aria-label="Next pickup" style={{
          marginTop: 16, padding: '13px 16px', borderRadius: 14, background: '#171614', color: '#fff',
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)', margin: 0 }}>
            Next pickup · {next.role === 'arrival' ? 'airport to hotel' : 'hotel to airport'}
          </p>
          <p style={{ fontSize: 16, fontWeight: 800, margin: '5px 0 0', lineHeight: 1.4, ...tnum }}>{next.when}</p>
          <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.85)', margin: '3px 0 0' }}>
            {next.t.guestName} · {next.t.ref}{next.role === 'departure' ? ` · leave the hotel ~4h before the flight` : ''}
          </p>
        </section>
      )}

      {/* Pay summary: the glanceable answer to "what am I owed?" */}
      <section aria-label="Pay summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 12 }}>
        {[
          { k: 'Trips', v: String(trips.length), c: ink },
          { k: 'Paid to you', v: money(paidTotal), c: green },
          { k: 'Pending', v: money(pendingTotal), c: pendingTotal > 0 ? amber : faint },
        ].map((s) => (
          <div key={s.k} style={{ background: '#fff', border, borderRadius: 14, padding: '13px 14px' }}>
            <p style={{ ...cardLabel, letterSpacing: '0.06em' }}>{s.k}</p>
            <p style={{ fontSize: 'clamp(19px, 4.5vw, 24px)', fontWeight: 800, color: s.c, margin: '5px 0 0', ...tnum }}>{s.v}</p>
          </div>
        ))}
      </section>

      {/* Trips, soonest action first */}
      <section aria-label="Trips" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
        {trips.length === 0 && (
          <div style={{ background: '#fff', border, borderRadius: 16, padding: '28px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>No trips assigned yet</p>
            <p style={{ fontSize: 13.5, color: soft, margin: '6px 0 0' }}>New bookings from MAPL Tours will appear here.</p>
          </div>
        )}
        {trips.map((t) => <TripCard key={t.id} t={t} />)}
      </section>

      <p style={{ fontSize: 12.5, color: faint, lineHeight: 1.55, marginTop: 22 }}>
        Times are Jamaica time. Pay is your agreed rate per trip; round trips are paid in two halves, one after each completed leg, over WhatsApp. Questions: contact@mapltours.com.
      </p>

      <style jsx global>{`
        .drv-act:focus-visible {
          outline: 3px solid #171614;
          outline-offset: 2px;
        }
        .drv-act:active {
          transform: scale(0.98);
        }
        @media (prefers-reduced-motion: reduce) {
          .drv-act { transition: none !important; }
        }
      `}</style>
    </div>
  )
}
