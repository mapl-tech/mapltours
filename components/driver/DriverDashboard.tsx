'use client'

import { useEffect, useRef, useState } from 'react'
import { PlaneLanding, PlaneTakeoff, MapPin, CalendarPlus, Phone, MessageCircle, Radar, ChevronRight } from 'lucide-react'
import type { DriverTrip, DriverTour } from '@/lib/driver'
import { jaTime, gcalLink, waLink, legInstantMs, MIN_PICKUP_LEAD_MIN } from '@/lib/dispatch'
import { flightLinks, flightDate, type FlightStatus } from '@/lib/flight'
import Arrow from '@/components/ui/Arrow'

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
const eyebrow: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: faint, margin: 0 }

/** Smooth-scroll a just-opened card under the sticky header (honors reduced motion). */
function useScrollOnOpen(open: boolean) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open || !ref.current) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // next frame, so the expanded content has laid out before we measure
    requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }))
  }, [open])
  return ref
}

function money(n: number): string { return '$' + n.toFixed(2) }
/** This year on Jamaica's calendar. */
function jaYear(): string { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Jamaica' }).slice(0, 4) }
/**
 * A stored Jamaica wall-clock date ("Wed, Nov 18", or long: "Wednesday,
 * November 18"), with the year only when it is not this year. Read in UTC
 * like lib/dispatch's jaDate, because the stored value is Jamaica local.
 */
function jaDay(iso: string | null, long = false): string {
  if (!iso) return 'Date TBD'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const year = iso.slice(0, 4) !== jaYear()
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: long ? 'long' : 'short', month: long ? 'long' : 'short', day: 'numeric', ...(year ? { year: 'numeric' as const } : {}) })
}
/** The day a payout was sent, on Jamaica's calendar (a real instant, unlike leg times): "Nov 12". */
function paidDay(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const year = d.toLocaleDateString('en-CA', { timeZone: 'America/Jamaica' }).slice(0, 4) !== jaYear()
  return d.toLocaleDateString('en-US', { timeZone: 'America/Jamaica', month: 'short', day: 'numeric', ...(year ? { year: 'numeric' as const } : {}) })
}
/** "in 3 days" / "in 5 hrs" / "today" for the hero countdown. */
function countdown(iso: string): string {
  // Jamaica wall-clock -> real instant. Raw parsing ran the countdown 5 hours
  // fast, so the driver was told "in 2 hrs" for a pickup 7 hours away.
  const ms = legInstantMs(iso) - Date.now()
  if (ms <= 0) return 'now'
  const h = Math.round(ms / 3600_000)
  if (h < 1) return 'under an hour'
  if (h < 24) return `in ${h} hr${h === 1 ? '' : 's'}`
  const d = Math.round(h / 24)
  return `in ${d} day${d === 1 ? '' : 's'}`
}

/** Pill link/button: 48px tall for touch, full label on one line (a row that is too narrow wraps whole buttons). */
function Act({ href, onClick, children, tone = 'outline', grow }: {
  href?: string; onClick?: () => void; children: React.ReactNode
  tone?: 'outline' | 'wa' | 'solid'; grow?: boolean
}) {
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 48, padding: '0 16px', borderRadius: 12, cursor: 'pointer',
    fontFamily: dm, fontSize: 14, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
    transition: 'transform 0.12s ease, background 0.15s ease, filter 0.15s ease',
    flexGrow: grow ? 1 : 0, flexBasis: 'auto', textAlign: 'center',
    // #0B6459 keeps the WhatsApp identity while giving white text 5.9:1 (AA).
    border: tone === 'wa' ? '1px solid #09564D' : tone === 'solid' ? `1px solid ${ink}` : border,
    background: tone === 'wa' ? '#0B6459' : tone === 'solid' ? ink : '#fff',
    color: tone === 'wa' || tone === 'solid' ? '#fff' : ink,
  }
  // A phone number opens the dialer in place; only web pages open a new tab.
  if (href) return /^https?:/i.test(href)
    ? <a className="drv-act" href={href} target="_blank" rel="noreferrer" style={style}>{children}</a>
    : <a className="drv-act" href={href} style={style}>{children}</a>
  return <button className="drv-act" type="button" onClick={onClick} style={style}>{children}</button>
}

function PayChip({ paid, label }: { paid: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 9999,
      fontSize: 12, fontWeight: 700,
      // Opaque tints so the text holds AA wherever the chip sits (the translucent green read 4.1:1 on the card header).
      background: paid ? '#E3F3EA' : 'rgba(122,90,8,0.12)',
      border: `1px solid ${paid ? 'rgba(15,107,69,0.35)' : 'rgba(122,90,8,0.35)'}`,
      color: paid ? '#0F6B45' : amber,
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
  const isDeparture = mbjRole === 'departure'
  // Arrival: the booked time is the flight time (mismatch = warning).
  // Departure: the booked time is the guest's requested hotel pickup; check
  // that it leaves enough lead before the actual flight.
  const diff = authTime ? (() => { const a = clockMinutes(booked); const b = clockMinutes(authTime); return a != null && b != null ? b - a : null })() : null
  const lead = isDeparture && diff != null ? (diff < -720 ? diff + 1440 : diff) : null
  const leadLabel = lead != null ? `${Math.floor(Math.abs(lead) / 60)}h ${String(Math.abs(lead) % 60).padStart(2, '0')}m` : ''
  const warn = isDeparture ? (lead != null && lead < MIN_PICKUP_LEAD_MIN) : (diff != null && Math.abs(diff) > 30)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {links && <Act href={links.google}>Google</Act>}
        {links && <Act href={links.flightaware}>FlightAware</Act>}
        {links && <Act tone="solid" onClick={check}><Radar size={16} aria-hidden="true" />{loading ? 'Checking…' : 'Live status'}</Act>}
        {!links && <span style={{ fontSize: 13, color: faint }}>No flight number yet. MAPL will send it.</span>}
      </div>
      {/* Always present, so the answer to Live status is read out when it arrives. */}
      <div role="status">
      {st && (
        <div style={{ marginTop: 8 }}>
          {st.found && authTime ? (
            <div style={{
              padding: '10px 13px', borderRadius: 10,
              background: warn ? '#FCEDEA' : '#EAF4EE',
              border: `1px solid ${warn ? 'rgba(176,28,12,0.25)' : 'rgba(29,122,80,0.25)'}`,
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: warn ? red : green, ...tnum }}>
                Airline: flight {isDeparture ? 'departs' : 'lands'} {authTime}{st.status ? ` · ${st.status}` : ''}
              </span>
              {isDeparture && lead != null && (
                <span style={{ display: 'block', fontSize: 13, color: warn ? red : faint, marginTop: 3 }}>
                  {lead <= 0
                    ? `The ${booked} pickup is at or after the flight time. Contact MAPL Tours Jamaica before driving.`
                    : lead < MIN_PICKUP_LEAD_MIN
                      ? `Pickup at ${booked} leaves only ${leadLabel} before the flight. Confirm with MAPL Tours Jamaica.`
                      : `Pickup at ${booked} leaves ${leadLabel} before the flight.`}
                </span>
              )}
              {!isDeparture && warn && (
                <span style={{ display: 'block', fontSize: 13, color: red, marginTop: 3 }}>
                  Differs from the booked {booked}. Confirm with MAPL Tours Jamaica before driving.
                </span>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: faint, margin: 0 }}>No live data right now. Use Google or FlightAware above.</p>
          )}
        </div>
      )}
      </div>
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
        <h3 style={{ ...eyebrow, color: tint }}>{isArr ? 'Arrival · airport to hotel' : 'Departure · hotel to airport'}</h3>
        <p style={{ fontSize: 17, fontWeight: 700, margin: '7px 0 0', lineHeight: 1.4, letterSpacing: '-0.01em' }}>
          {from}<span style={{ color: faint }}><Arrow place="between" /></span>{to}
        </p>
        <p style={{ fontSize: 14, color: soft, margin: '5px 0 0', ...tnum }}>
          {jaDay(dateIso, true)} · <strong style={{ color: ink, fontWeight: 700 }}>{isArr ? 'lands' : 'hotel pickup'} {jaTime(dateIso)}</strong> Jamaica time
        </p>
        {extra}
        <p style={{ fontSize: 13, margin: '7px 0 0' }}>
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

export function TripCard({ t, open, onToggle }: { t: DriverTrip; open: boolean; onToggle: () => void }) {
  const ref = useScrollOnOpen(open)
  const isRT = t.tripType === 'round_trip'
  // A hotel-to-airport one-way has a departure and no arrival: the card must
  // show the pickup it has, not "Lands -". The departure leg is a round trip's
  // return, or the ride's only leg.
  const departureOnly = !t.arrivalAt && !!t.departureAt
  const hasDepartureLeg = isRT || departureOnly
  const arrCal = t.arrivalAt ? gcalLink({
    title: `MAPL Tours Jamaica pickup: ${t.guestName} (${t.ref})`,
    startIso: t.arrivalAt, durationMin: 60,
    location: `${t.airport}, Montego Bay`,
    details: `Drop-off: ${t.hotel}. Passengers: ${t.passengers}. Guest: ${t.guestPhone ?? ''}. Your pay: ${money(t.payoutLegs[0].amount)}${isRT ? ' (leg 1 of 2)' : ''}.`,
  }) : null
  const depCal = t.departureAt && hasDepartureLeg ? gcalLink({
    title: `MAPL Tours Jamaica departure pickup: ${t.guestName} (${t.ref})`,
    startIso: t.departureAt, durationMin: 90,
    location: t.hotel,
    // A one-way has a single payout leg, paid once in full; only a round trip's
    // return is "leg 2 of 2" and reads the second payout.
    details: `Drop at ${t.airport}. Hotel pickup ${jaTime(t.departureAt)} Jamaica time (time the guest requested)${t.departureFlight ? `, flight ${t.departureFlight}` : ''}. Your pay: ${money(isRT ? (t.payoutLegs[1]?.amount ?? 0) : t.payoutLegs[0].amount)}${isRT ? ' (leg 2 of 2)' : ''}.`,
  }) : null
  const mapsHotel = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.hotel + ', Jamaica')}`

  return (
    <article ref={ref} aria-label={`Trip ${t.ref}`} style={{ background: '#fff', border, borderLeft: `4px solid ${t.fullyPaid ? green : goldWarm}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(23,22,20,0.04), 0 6px 22px rgba(23,22,20,0.05)', scrollMarginTop: 74 }}>
      {/* The summary is a real button inside the trip's heading: named by the
          ref and guest, described by the rest, so headings and buttons both work. */}
      <h2 style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit' }}>
      <button
        type="button"
        id={`trip-${t.id}-btn`}
        aria-expanded={open}
        aria-controls={`trip-${t.id}-panel`}
        aria-label={`${t.ref}, ${t.guestName}`}
        aria-describedby={`trip-${t.id}-sum`}
        className="drv-act drv-head"
        onClick={onToggle}
        style={{
          display: 'block', width: '100%', textAlign: 'left', border: 'none', font: 'inherit', color: 'inherit',
          cursor: 'pointer', padding: '15px 20px', background: '#FCFBF8',
          borderBottom: open ? borderSoft : undefined,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '0.01em', ...tnum }}>{t.ref}</span>
          <ChevronRight size={20} strokeWidth={2.25} aria-hidden style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease', color: faint }} />
        </span>
        <span id={`trip-${t.id}-sum`} style={{ display: 'block' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          <PayChip paid={t.fullyPaid} label={t.fullyPaid ? 'Paid in full' : 'Pay pending'} />
          <span style={{ fontSize: 13, color: soft, fontWeight: 500 }}>{isRT ? 'Round trip' : 'One-way'} · {t.passengers} passenger{t.passengers === 1 ? '' : 's'}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 9, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: ink }}>{t.guestName}</span>
              <span aria-hidden="true" style={{ color: faint }}>·</span>
              <span style={{ fontSize: 13, color: soft }}>{departureOnly ? t.hotel : t.airport}<Arrow place="between" />{departureOnly ? t.airport : t.hotel}</span>
              {t.specialRequests && (
                <span style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                  padding: '2px 9px', borderRadius: 9999, background: '#FCF6E4', border: '1px solid #E8D9A8', color: amber,
                }}>
                  Guest note
                </span>
              )}
            </span>
            <span style={{ fontSize: 13, color: soft, ...tnum }}>
              {departureOnly ? 'Hotel pickup' : 'Lands'} <strong style={{ color: ink, fontWeight: 600 }}>{jaDay(departureOnly ? t.departureAt : t.arrivalAt)} · {jaTime(departureOnly ? t.departureAt : t.arrivalAt)}</strong> Jamaica time
            </span>
            {t.tripType === 'round_trip' && t.departureAt && (
              <span style={{ fontSize: 13, color: soft, ...tnum }}>
                Return pickup <strong style={{ color: ink, fontWeight: 600 }}>{jaDay(t.departureAt)} · {jaTime(t.departureAt)}</strong> Jamaica time
              </span>
            )}
          </span>
          <span style={{ whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: faint }}>You get </span>
            <span style={{ fontSize: 15, fontWeight: 800, color: green, ...tnum }}>{money(t.payoutTotal)} <span style={{ fontSize: 12, fontWeight: 700 }}>USD</span></span>
          </span>
        </span>
        </span>
      </button>
      </h2>

      {open && (
      <div id={`trip-${t.id}-panel`} style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Guest */}
        <div>
          <h3 style={eyebrow}>Guest</h3>
          <p style={{ fontSize: 19, fontWeight: 800, margin: '6px 0 0', letterSpacing: '-0.01em' }}>{t.guestName}</p>
          {t.guestPhone && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <Act grow tone="wa" href={waLink(t.guestPhone, `Hello ${t.guestName}, this is your MAPL Tours Jamaica driver.`)}>
                <MessageCircle size={16} aria-hidden="true" />WhatsApp guest
              </Act>
              <Act grow href={`tel:${t.guestPhone.replace(/[^+\d]/g, '')}`}>
                <Phone size={16} aria-hidden="true" />Call guest
              </Act>
            </div>
          )}
          {t.specialRequests && (
            <div style={{ marginTop: 12, padding: '10px 13px', background: '#FCF6E4', border: '1px solid #F0E4BE', borderRadius: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: amber }}>Note: </span>
              <span style={{ fontSize: 14, color: ink, whiteSpace: 'pre-wrap' }}>{t.specialRequests}</span>
            </div>
          )}
        </div>

        {/* Legs as a timeline */}
        <div style={{ paddingTop: 16, borderTop: borderSoft, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {!departureOnly && (
            <Leg
              role="arrival" from={t.airport} to={t.hotel} dateIso={t.arrivalAt} flightRaw={t.arrivalFlight}
              actions={<>
                <Act grow href={mapsHotel}><MapPin size={16} aria-hidden="true" />Map to hotel</Act>
                {arrCal && <Act grow href={arrCal}><CalendarPlus size={16} aria-hidden="true" />Calendar</Act>}
              </>}
            />
          )}
          {t.departureAt && hasDepartureLeg && (
            <Leg
              role="departure" from={t.hotel} to={t.airport} dateIso={t.departureAt} flightRaw={t.departureFlight}
              extra={
                <p style={{ fontSize: 13, color: amber, fontWeight: 700, margin: '5px 0 0' }}>
                  This is the pickup time the guest requested.
                </p>
              }
              actions={<>
                {/* The arrival leg carries the hotel map; a ride with no arrival needs it here. */}
                {departureOnly && <Act grow href={mapsHotel}><MapPin size={16} aria-hidden="true" />Map to hotel</Act>}
                {depCal && <Act grow href={depCal}><CalendarPlus size={16} aria-hidden="true" />Calendar</Act>}
              </>}
            />
          )}
        </div>

        {/* Pay panel */}
        <div style={{ background: '#F7F4EC', border: borderSoft, borderRadius: 14, padding: '14px 16px' }}>
          <h3 style={eyebrow}>Your pay</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            {t.payoutLegs.map((p) => (
              <div key={p.leg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, color: soft }}>
                  {isRT ? (p.leg === 'arrival' ? 'Before the arrival pickup' : 'Before the departure pickup') : 'Before the ride'}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, ...tnum }}>{money(p.amount)} <span style={{ fontSize: 12, fontWeight: 700, color: faint }}>USD</span></span>
                  <PayChip paid={p.paid} label={p.paid ? (p.paidAt ? `Paid ${paidDay(p.paidAt)}` : 'Paid') : 'Pending'} />
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10, borderTop: '1px solid #E9E3D5' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>You get paid for this trip</span>
              <span style={{ fontSize: 19, fontWeight: 800, color: green, ...tnum }}>{money(t.payoutTotal)} <span style={{ fontSize: 12, fontWeight: 700 }}>USD</span></span>
            </div>
          </div>
        </div>
      </div>
      )}
    </article>
  )
}

/* ── Tour card: itinerary only, deliberately NO money anywhere ── */

function tourDate(d: string | null): string {
  return d ? jaDay(`${d}T00:00:00Z`) : 'Date TBD'
}

function TourCard({ t, open, onToggle }: { t: DriverTour; open: boolean; onToggle: () => void }) {
  const ref = useScrollOnOpen(open)
  return (
    <article ref={ref} aria-label={`Tour booking ${t.ref}`} style={{ background: '#fff', border, borderLeft: `4px solid ${goldWarm}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(23,22,20,0.04), 0 6px 22px rgba(23,22,20,0.05)', scrollMarginTop: 74 }}>
      <h2 style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit' }}>
      <button
        type="button"
        id={`tour-${t.id}-btn`}
        aria-expanded={open}
        aria-controls={`tour-${t.id}-panel`}
        aria-label={`${t.ref}, ${t.guestName}`}
        aria-describedby={`tour-${t.id}-sum`}
        className="drv-act drv-head"
        onClick={onToggle}
        style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', padding: '15px 20px', background: '#FCFBF8', borderBottom: open ? borderSoft : undefined }}
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '0.01em', ...tnum }}>{t.ref}</span>
          <ChevronRight size={20} strokeWidth={2.25} aria-hidden style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease', color: faint }} />
        </span>
        <span id={`tour-${t.id}-sum`} style={{ display: 'block' }}>
        <span style={{ display: 'block', fontSize: 13, color: soft, fontWeight: 500, marginTop: 6 }}>Tour · {t.items.length} experience{t.items.length === 1 ? '' : 's'}</span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: ink }}>{t.guestName}</span>
          <span aria-hidden="true" style={{ color: faint }}>·</span>
          <span style={{ fontSize: 13, color: soft }}>{t.items[0].title}{t.items.length > 1 ? ` +${t.items.length - 1} more` : ''}</span>
          <span aria-hidden="true" style={{ color: faint }}>·</span>
          <span style={{ fontSize: 13, color: soft, ...tnum }}>{tourDate(t.firstDate)}</span>
        </span>
        </span>
      </button>
      </h2>
      {open && (
        <div id={`tour-${t.id}-panel`} style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h3 style={eyebrow}>Guest</h3>
            <p style={{ fontSize: 19, fontWeight: 800, margin: '6px 0 0', letterSpacing: '-0.01em' }}>{t.guestName}</p>
            {t.guestPhone && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <Act grow tone="wa" href={waLink(t.guestPhone, `Hello ${t.guestName}, this is your MAPL Tours Jamaica driver.`)}>
                  <MessageCircle size={16} aria-hidden="true" />WhatsApp guest
                </Act>
                <Act grow href={`tel:${t.guestPhone.replace(/[^+\d]/g, '')}`}>
                  <Phone size={16} aria-hidden="true" />Call guest
                </Act>
              </div>
            )}
            {t.specialRequests && (
              <div style={{ marginTop: 12, padding: '10px 13px', background: '#FCF6E4', border: '1px solid #F0E4BE', borderRadius: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: amber }}>Note: </span>
                <span style={{ fontSize: 14, color: ink, whiteSpace: 'pre-wrap' }}>{t.specialRequests}</span>
              </div>
            )}
          </div>
          <div style={{ paddingTop: 14, borderTop: borderSoft, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {t.items.map((i, idx) => (
              <div key={idx}>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{i.title}</p>
                <p style={{ fontSize: 13, color: soft, margin: '4px 0 0', ...tnum }}>
                  {[i.destination, tourDate(i.date), `${i.travelers} guest${i.travelers === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                </p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: faint, margin: 0 }}>Tour bookings are for your awareness; MAPL will contact you if a ride is needed.</p>
        </div>
      )}
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
      const ms = legInstantMs(iso)
      if (ms < now - 2 * 3600_000) continue // already driven
      if (!best || ms < legInstantMs(best.iso)) best = { t, iso, role }
    }
  }
  return best
}

export default function DriverDashboard({ trips, tours = [], driverLabel, adminPreview }: {
  trips: DriverTrip[]
  tours?: DriverTour[]
  driverLabel: string
  adminPreview?: boolean
}) {
  const owedTotal = trips.reduce((s, t) => s + t.payoutTotal, 0)
  const paidTotal = trips.reduce((s, t) => s + t.payoutLegs.filter((p) => p.paid).reduce((x, p) => x + p.amount, 0), 0)
  const pendingTotal = Math.round((owedTotal - paidTotal) * 100) / 100
  const next = nextPickup(trips)
  const [tab, setTab] = useState<'transfers' | 'tours'>('transfers')
  // Tabs: one tab stop; arrow keys, Home and End move between them (the ARIA tabs pattern).
  const TAB_ORDER = ['transfers', 'tours'] as const
  function onTabKey(e: React.KeyboardEvent) {
    const i = TAB_ORDER.indexOf(tab)
    const next = e.key === 'ArrowRight' ? TAB_ORDER[(i + 1) % TAB_ORDER.length]
      : e.key === 'ArrowLeft' ? TAB_ORDER[(i - 1 + TAB_ORDER.length) % TAB_ORDER.length]
      : e.key === 'Home' ? TAB_ORDER[0]
      : e.key === 'End' ? TAB_ORDER[TAB_ORDER.length - 1]
      : null
    if (!next) return
    e.preventDefault()
    setTab(next)
    document.getElementById(`tab-${next}`)?.focus()
  }
  // Accordion: exactly one reservation card open at a time.
  const [openId, setOpenId] = useState<string | null>(null)
  const toggle = (id: string) => setOpenId((o) => (o === id ? null : id))

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
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: goldWarm, margin: 0 }}>
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
              {jaDay(next.iso, true)} · <span style={{ whiteSpace: 'nowrap' }}>{jaTime(next.iso)}</span>
            </p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.88)', margin: '6px 0 0', lineHeight: 1.5 }}>
              {next.t.guestName} · {next.t.ref} · {next.t.passengers} passenger{next.t.passengers === 1 ? '' : 's'}
              {next.role === 'departure' ? ' · pickup time requested by the guest' : ''}
            </p>
          </div>
        </section>
      )}

      {/* Pay summary: the glanceable answer to "what am I owed?" (the trip count is on the Transfers tab). */}
      <section aria-label="Pay summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 14 }}>
        {[
          { k: 'Paid to you (USD)', v: money(paidTotal), c: green, bg: '#fff', bd: border },
          { k: 'Pending (USD)', v: money(pendingTotal), c: pendingTotal > 0 ? amber : faint, bg: pendingTotal > 0 ? '#FBF6E7' : '#fff', bd: pendingTotal > 0 ? '1px solid #EBDFC0' : border },
        ].map((s) => (
          <div key={s.k} style={{ background: s.bg, border: s.bd, borderRadius: 14, padding: '14px 15px' }}>
            <p style={{ ...eyebrow, letterSpacing: '0.07em' }}>{s.k}</p>
            <p style={{ fontSize: 'clamp(21px, 5vw, 27px)', fontWeight: 800, color: s.c, margin: '6px 0 0', letterSpacing: '-0.015em', ...tnum }}>{s.v}</p>
          </div>
        ))}
      </section>

      {/* Transfers | Tours tabs, transfers first and default */}
      <div role="tablist" aria-label="Booking type" style={{ display: 'flex', gap: 8, marginTop: 20, background: '#fff', border, borderRadius: 9999, padding: 5, width: 'fit-content', maxWidth: '100%' }}>
        {([['transfers', `Transfers`, trips.length], ['tours', 'Tours', tours.length]] as const).map(([key, label, count]) => (
          <button
            key={key}
            id={`tab-${key}`}
            role="tab"
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            className="drv-act"
            onClick={() => setTab(key)}
            onKeyDown={onTabKey}
            style={{
              minHeight: 44, padding: '0 18px', borderRadius: 9999, border: 'none', cursor: 'pointer',
              fontFamily: dm, fontSize: 14, fontWeight: 700,
              background: tab === key ? ink : 'transparent',
              color: tab === key ? '#fff' : soft,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            {label}
            <span style={{
              fontSize: 12, fontWeight: 700, minWidth: 22, height: 22, padding: '0 6px', borderRadius: 9999,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: tab === key ? 'rgba(255,255,255,0.18)' : '#F1ECE3',
              color: tab === key ? '#fff' : faint, ...tnum,
            }}>{count}</span>
          </button>
        ))}
      </div>

      {/* Bookings, soonest first; full-width collapsible rows like the admin page */}
      {tab === 'transfers' ? (
        <section id="panel-transfers" role="tabpanel" aria-labelledby="tab-transfers" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          {trips.length === 0 && (
            <div style={{ background: '#fff', border, borderRadius: 18, padding: '32px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>No transfers assigned yet</p>
              <p style={{ fontSize: 14, color: soft, margin: '6px 0 0' }}>New bookings from MAPL Tours Jamaica will appear here.</p>
            </div>
          )}
          {trips.map((t) => <TripCard key={t.id} t={t} open={openId === t.id} onToggle={() => toggle(t.id)} />)}
        </section>
      ) : (
        <section id="panel-tours" role="tabpanel" aria-labelledby="tab-tours" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          {tours.length === 0 && (
            <div style={{ background: '#fff', border, borderRadius: 18, padding: '32px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>No tour bookings yet</p>
              <p style={{ fontSize: 14, color: soft, margin: '6px 0 0' }}>Paid tour bookings will appear here so you can plan ahead.</p>
            </div>
          )}
          {tours.map((t) => <TourCard key={t.id} t={t} open={openId === t.id} onToggle={() => toggle(t.id)} />)}
        </section>
      )}

      <p style={{ fontSize: 12, color: faint, lineHeight: 1.6, marginTop: 24 }}>
        Times are Jamaica time. Pay is your agreed rate per trip; round trips are paid in two halves, one before each leg. Questions: contact@mapltours.com.
      </p>
    </div>
  )
}
