'use client'

import { useState } from 'react'
import { PlaneLanding, PlaneTakeoff, MapPin, CalendarPlus, Phone, MessageCircle, Radar } from 'lucide-react'
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
const goldWarm = '#C4A44A' // on ink only (7.4:1); use amber/gold-text on light
const border = '1px solid #E7E1D6'
const borderSoft = '1px solid #F1ECE3'
const tnum = { fontVariantNumeric: 'tabular-nums' as const }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: faint, margin: 0 }

function money(n: number): string { return '$' + n.toFixed(2) }
function paidStamp(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return '' }
}
/** "in 3 days" / "in 5 hrs" / "today" for the hero countdown. */
function countdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'now'
  const h = Math.round(ms / 3600_000)
  if (h < 1) return 'under an hour'
  if (h < 24) return `in ${h} hr${h === 1 ? '' : 's'}`
  const d = Math.round(h / 24)
  return `in ${d} day${d === 1 ? '' : 's'}`
}

/** Pill link/button: 48px tall for touch, full label. */
function Act({ href, onClick, children, tone = 'outline', grow }: {
  href?: string; onClick?: () => void; children: React.ReactNode
  tone?: 'outline' | 'wa' | 'solid'; grow?: boolean
}) {
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 48, padding: '0 16px', borderRadius: 12, cursor: 'pointer',
    fontFamily: dm, fontSize: 14, fontWeight: 600, textDecoration: 'none',
    transition: 'transform 0.12s ease, background 0.15s ease, filter 0.15s ease',
    flexGrow: grow ? 1 : 0, flexBasis: grow ? 0 : 'auto', textAlign: 'center',
    // #0B6459 keeps the WhatsApp identity while giving white text 5.9:1 (AA).
    border: tone === 'wa' ? '1px solid #09564D' : tone === 'solid' ? `1px solid ${ink}` : border,
    background: tone === 'wa' ? '#0B6459' : tone === 'solid' ? ink : '#fff',
    color: tone === 'wa' || tone === 'solid' ? '#fff' : ink,
  }
  if (href) return <a className="drv-act" href={href} target="_blank" rel="noreferrer" style={style}>{children}</a>
  return <button className="drv-act" type="button" onClick={onClick} style={style}>{children}</button>
}

function PayChip({ paid, label }: { paid: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 9999,
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

function FlightRow({ flightRaw, dateIso, mbjRole }: {
  flightRaw: string | null; dateIso: string | null
  mbjRole: 'arrival' | 'departure'
}) {
  const [st, setSt] = useState<FlightStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const links = flightLinks(flightRaw, dateIso)
  const booked = jaTime(dateIso)

  const check = async () => {
    setLoading(true)
    const r = await fetch(`/api/driver/flight?flight=${encodeURIComponent(flightRaw ?? '')}&date=${flightDate(dateIso) ?? ''}&role=${mbjRole}`).catch(() => null)
    setSt(r && r.ok ? await r.json().catch(() => null) : { configured: false, resolvable: false, found: false, ident: null, status: null })
    setLoading(false)
  }

  const authLeg = st ? (mbjRole === 'arrival' ? st.arrival : st.departure) : null
  const authTime = authLeg?.revisedLocal || authLeg?.scheduledLocal || null
  const diff = authTime ? (() => { const a = clockMinutes(booked); const b = clockMinutes(authTime); return a != null && b != null ? b - a : null })() : null
  const bigMismatch = diff != null && Math.abs(diff) > 30

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {links && <Act href={links.google}>Google</Act>}
        {links && <Act href={links.flightaware}>FlightAware</Act>}
        {links && <Act tone="solid" onClick={check}><Radar size={16} aria-hidden="true" />{loading ? 'Checking…' : 'Live status'}</Act>}
        {!links && <span style={{ fontSize: 13.5, color: faint }}>No flight number yet. MAPL will send it.</span>}
      </div>
      {st && (
        <div style={{ marginTop: 8 }}>
          {st.found && authTime ? (
            <div style={{
              padding: '10px 13px', borderRadius: 10,
              background: bigMismatch ? '#FCEDEA' : '#EAF4EE',
              border: `1px solid ${bigMismatch ? 'rgba(176,28,12,0.25)' : 'rgba(29,122,80,0.25)'}`,
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: bigMismatch ? red : green, ...tnum }}>
                Airline: {authTime}{st.status ? ` · ${st.status}` : ''}
              </span>
              {bigMismatch && (
                <span style={{ display: 'block', fontSize: 13, color: red, marginTop: 3 }}>
                  Differs from the booked {booked}. Confirm with MAPL before driving.
                </span>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: faint, margin: 0 }}>No live data right now. Use Google or FlightAware above.</p>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Leg block: icon medallion + colored rail timeline ── */

function Leg({ role, from, to, dateIso, flightRaw, extra, actions }: {
  role: 'arrival' | 'departure'
  from: string; to: string
  dateIso: string | null
  flightRaw: string | null
  extra?: React.ReactNode
  actions: React.ReactNode
}) {
  const isArr = role === 'arrival'
  const tint = isArr ? green : amber
  const Icon = isArr ? PlaneLanding : PlaneTakeoff
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      {/* Rail */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <span aria-hidden="true" style={{
          width: 34, height: 34, borderRadius: 9999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: isArr ? 'rgba(29,122,80,0.12)' : 'rgba(122,90,8,0.12)', color: tint,
          border: `1px solid ${isArr ? 'rgba(29,122,80,0.3)' : 'rgba(122,90,8,0.3)'}`,
        }}>
          <Icon size={17} strokeWidth={2.2} />
        </span>
        <span aria-hidden="true" style={{ width: 2.5, flex: 1, marginTop: 6, borderRadius: 2, background: `linear-gradient(${isArr ? 'rgba(29,122,80,0.35)' : 'rgba(122,90,8,0.35)'}, transparent)` }} />
      </div>
      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
        <p style={{ ...eyebrow, color: tint }}>{isArr ? 'Arrival · airport to hotel' : 'Departure · hotel to airport'}</p>
        <p style={{ fontSize: 16.5, fontWeight: 700, margin: '7px 0 0', lineHeight: 1.4, letterSpacing: '-0.01em' }}>
          {from} <span aria-hidden="true" style={{ color: faint }}>→</span> {to}
        </p>
        <p style={{ fontSize: 14, color: soft, margin: '5px 0 0', ...tnum }}>
          {jaDate(dateIso)} · <strong style={{ color: ink, fontWeight: 700 }}>{isArr ? 'lands' : 'flight departs'} {jaTime(dateIso)}</strong> Jamaica time
        </p>
        {extra}
        <p style={{ fontSize: 13.5, margin: '7px 0 0' }}>
          <span style={{ fontWeight: 700 }}>Flight</span>{' '}
          <span style={{ color: soft, ...tnum }}>{flightLinks(flightRaw, dateIso)?.ident ?? flightRaw ?? 'TBD'}</span>
        </p>
        <FlightRow flightRaw={flightRaw} dateIso={dateIso} mbjRole={role} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {actions}
        </div>
      </div>
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
    <article aria-label={`Trip ${t.ref}`} style={{ background: '#fff', border, borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 2px rgba(23,22,20,0.04), 0 6px 22px rgba(23,22,20,0.05)' }}>
      {/* Header band */}
      <div style={{
        padding: '15px 20px', background: '#FCFBF8', borderBottom: borderSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
        borderTop: `3px solid ${t.fullyPaid ? green : goldWarm}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '0.01em', ...tnum }}>{t.ref}</span>
          <span style={{ fontSize: 13, color: soft, fontWeight: 500 }}>{isRT ? 'Round trip' : 'One-way'} · {t.passengers} passenger{t.passengers === 1 ? '' : 's'}</span>
        </div>
        <PayChip paid={t.fullyPaid} label={t.fullyPaid ? 'Paid in full' : 'Pay pending'} />
      </div>

      <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Guest */}
        <div>
          <p style={eyebrow}>Guest</p>
          <p style={{ fontSize: 19, fontWeight: 800, margin: '6px 0 0', letterSpacing: '-0.01em' }}>{t.guestName}</p>
          {t.guestPhone && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <Act grow tone="wa" href={waLink(t.guestPhone, `Hello ${t.guestName}, this is your MAPL Tours driver.`)}>
                <MessageCircle size={16} aria-hidden="true" />WhatsApp guest
              </Act>
              <Act grow href={`tel:${t.guestPhone.replace(/[^+\d]/g, '')}`}>
                <Phone size={16} aria-hidden="true" />Call guest
              </Act>
            </div>
          )}
          {t.specialRequests && (
            <div style={{ marginTop: 12, padding: '10px 13px', background: '#FCF6E4', border: '1px solid #F0E4BE', borderRadius: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: amber }}>Note: </span>
              <span style={{ fontSize: 14, color: ink, whiteSpace: 'pre-wrap' }}>{t.specialRequests}</span>
            </div>
          )}
        </div>

        {/* Legs as a timeline */}
        <div style={{ paddingTop: 16, borderTop: borderSoft, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Leg
            role="arrival" from={t.airport} to={t.hotel} dateIso={t.arrivalAt} flightRaw={t.arrivalFlight}
            actions={<>
              <Act grow href={mapsHotel}><MapPin size={16} aria-hidden="true" />Map to hotel</Act>
              {arrCal && <Act grow href={arrCal}><CalendarPlus size={16} aria-hidden="true" />Calendar</Act>}
            </>}
          />
          {isRT && t.departureAt && (
            <Leg
              role="departure" from={t.hotel} to={t.airport} dateIso={t.departureAt} flightRaw={t.departureFlight}
              extra={
                <p style={{ fontSize: 13.5, color: amber, fontWeight: 700, margin: '5px 0 0', ...tnum }}>
                  Suggested hotel pickup {jaTime(shiftIso(t.departureAt, -DEPARTURE_BUFFER_MIN))} (flight minus 4h, adjust for traffic)
                </p>
              }
              actions={depCal ? <Act grow href={depCal}><CalendarPlus size={16} aria-hidden="true" />Calendar</Act> : null}
            />
          )}
        </div>

        {/* Pay panel */}
        <div style={{ background: '#F7F4EC', border: borderSoft, borderRadius: 14, padding: '14px 16px' }}>
          <p style={eyebrow}>Your pay</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            {t.payoutLegs.map((p) => (
              <div key={p.leg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, color: soft }}>
                  {isRT ? (p.leg === 'arrival' ? 'Before the arrival pickup' : 'Before the departure pickup') : 'Before the ride'}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, ...tnum }}>{money(p.amount)}</span>
                  <PayChip paid={p.paid} label={p.paid ? `Paid ${paidStamp(p.paidAt)}` : 'Pending'} />
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10, borderTop: '1px solid #E9E3D5' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Trip total</span>
              <span style={{ fontSize: 19, fontWeight: 800, color: green, ...tnum }}>{money(t.payoutTotal)} <span style={{ fontSize: 12, fontWeight: 700 }}>USD</span></span>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

/* ── The dashboard ── */

/** The single next leg the driver has to drive, across all trips. */
function nextPickup(trips: DriverTrip[]): { t: DriverTrip; iso: string; role: 'arrival' | 'departure' } | null {
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
  return best
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
          margin: '0 0 14px', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: 'rgba(122,90,8,0.10)', border: '1px solid rgba(122,90,8,0.30)', color: amber,
        }}>
          Admin preview. This is exactly what {driverLabel} sees: no customer totals, no fees, no margin.
        </p>
      )}

      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(24px, 4.5vw, 30px)', letterSpacing: '-0.025em', margin: 0 }}>Your trips</h1>
          <p style={{ fontSize: 14, color: soft, margin: '5px 0 0' }}>{driverLabel} · MAPL Tours Jamaica</p>
        </div>
      </header>

      {/* Hero: the one fact that matters most */}
      {next && (
        <section aria-label="Next pickup" style={{
          position: 'relative', overflow: 'hidden', marginTop: 18, padding: '20px 22px 22px', borderRadius: 18,
          background: 'linear-gradient(135deg, #171614 0%, #26231E 78%, #322B1D 100%)', color: '#fff',
          boxShadow: '0 10px 32px rgba(23,22,20,0.22)',
        }}>
          {next.role === 'arrival'
            ? <PlaneLanding aria-hidden="true" size={130} strokeWidth={1.2} style={{ position: 'absolute', right: -18, bottom: -26, opacity: 0.10 }} />
            : <PlaneTakeoff aria-hidden="true" size={130} strokeWidth={1.2} style={{ position: 'absolute', right: -18, bottom: -26, opacity: 0.10 }} />}
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: goldWarm, margin: 0 }}>
                Next pickup · {next.role === 'arrival' ? 'airport to hotel' : 'hotel to airport'}
              </p>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '3px 11px', borderRadius: 9999,
                background: 'rgba(196,164,74,0.16)', border: '1px solid rgba(196,164,74,0.4)', color: goldWarm,
              }}>
                {countdown(next.iso)}
              </span>
            </div>
            <p style={{ fontSize: 'clamp(21px, 5vw, 26px)', fontWeight: 800, margin: '10px 0 0', lineHeight: 1.25, letterSpacing: '-0.015em', ...tnum }}>
              {jaDate(next.iso)} · {jaTime(next.iso)}
            </p>
            <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.88)', margin: '6px 0 0', lineHeight: 1.5 }}>
              {next.t.guestName} · {next.t.ref}
              {next.role === 'departure' ? ' · leave the hotel about 4h before the flight' : ` · ${next.t.passengers} passenger${next.t.passengers === 1 ? '' : 's'}`}
            </p>
          </div>
        </section>
      )}

      {/* Pay summary: the glanceable answer to "what am I owed?" */}
      <section aria-label="Pay summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 14 }}>
        {[
          { k: 'Trips', v: String(trips.length), c: ink, bg: '#fff', bd: border },
          { k: 'Paid to you', v: money(paidTotal), c: green, bg: '#fff', bd: border },
          { k: 'Pending', v: money(pendingTotal), c: pendingTotal > 0 ? amber : faint, bg: pendingTotal > 0 ? '#FBF6E7' : '#fff', bd: pendingTotal > 0 ? '1px solid #EBDFC0' : border },
        ].map((s) => (
          <div key={s.k} style={{ background: s.bg, border: s.bd, borderRadius: 14, padding: '14px 15px' }}>
            <p style={{ ...eyebrow, letterSpacing: '0.07em' }}>{s.k}</p>
            <p style={{ fontSize: 'clamp(21px, 5vw, 27px)', fontWeight: 800, color: s.c, margin: '6px 0 0', letterSpacing: '-0.015em', ...tnum }}>{s.v}</p>
          </div>
        ))}
      </section>

      {/* Trips, soonest action first; flows into columns on wide screens */}
      <section aria-label="Trips" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 480px), 1fr))', alignItems: 'start', gap: 16, marginTop: 20 }}>
        {trips.length === 0 && (
          <div style={{ background: '#fff', border, borderRadius: 18, padding: '32px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>No trips assigned yet</p>
            <p style={{ fontSize: 14, color: soft, margin: '6px 0 0' }}>New bookings from MAPL Tours will appear here.</p>
          </div>
        )}
        {trips.map((t) => <TripCard key={t.id} t={t} />)}
      </section>

      <p style={{ fontSize: 12.5, color: faint, lineHeight: 1.6, marginTop: 24 }}>
        Times are Jamaica time. Pay is your agreed rate per trip; round trips are paid in two halves, one before each leg, over WhatsApp. Questions: contact@mapltours.com.
      </p>

      <style jsx global>{`
        .drv-act:focus-visible {
          outline: 3px solid #171614;
          outline-offset: 2px;
        }
        .drv-act:active {
          transform: scale(0.98);
        }
        a.drv-act:hover, button.drv-act:hover {
          filter: brightness(0.97);
        }
        @media (prefers-reduced-motion: reduce) {
          .drv-act { transition: none !important; }
        }
      `}</style>
    </div>
  )
}
