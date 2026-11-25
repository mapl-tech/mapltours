'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { PlaneLanding, PlaneTakeoff, MapPin, CalendarPlus, Phone, MessageCircle, Radar, ChevronRight, Clock, UserRoundPen, Mail } from 'lucide-react'
import type { DriverTrip, DriverTour } from '@/lib/driver'
import type { LastChange } from '@/lib/dispatch-change-server'
import type { PortalDriver } from '@/lib/driver-portal-data'
import dynamic from 'next/dynamic'
import type { ChangeRequest } from '@/components/driver/fleet/ChangeDialog'

// A fleet manager's dialog and drivers panel load only for a fleet manager:
// a regular driver's phone never downloads them. The fleet view starts the
// download as soon as it shows (below), so the first tap is not kept waiting.
const loadChangeDialog = () => import('@/components/driver/fleet/ChangeDialog')
const loadDriversPanel = () => import('@/components/driver/fleet/DriversPanel')
const ChangeDialog = dynamic(loadChangeDialog, { ssr: false })
const DriversPanel = dynamic(loadDriversPanel, {
  ssr: false,
  loading: () => <p role="status" style={{ fontSize: 14, color: '#57534C', margin: 0 }}>Loading the drivers…</p>,
})
import { jaDate, jaTime, gcalLink, waLink, legInstantMs, MIN_PICKUP_LEAD_MIN } from '@/lib/dispatch'
import { flightLinks, flightDate, type FlightStatus } from '@/lib/flight'
import Arrow from '@/components/ui/Arrow'
import TripCalendar from '@/components/schedule/TripCalendar'
import { scheduleFromDriver } from '@/lib/trip-schedule'

/**
 * Driver portal view. Renders ONLY DriverTrip data (built server-side by
 * lib/driver.ts), so the customer's total, fees, and MAPL's margin are never
 * in this component's props or the page payload.
 *
 * By role (Nov 24 2026, lib/driver-access): a regular driver reads the rides
 * and tours given to them, with no pay (`showPay` false, and the server sends
 * none), and taps out to WhatsApp, phone, maps and the calendar. A fleet
 * manager also changes who drives, a ride's time and a tour's pickup time
 * (components/driver/fleet: every change is confirmed before it is saved) and
 * keeps the drivers. With no role given it is the portal as it always was.
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
/**
 * The heading that holds a card's header. The site gives every h2 tighter
 * tracking and balanced line breaks (globals.css), and both are inherited, so
 * a plain h2 here re-set every word in the header and re-broke its lines.
 * This one passes the card's own type, tracking and wrapping straight
 * through, so the words sit exactly where they did.
 */
const headHeading: React.CSSProperties = { margin: 0, font: 'inherit', letterSpacing: 'inherit', textWrap: 'inherit' }
/** The header's own box, as it has always been. */
const headBox: React.CSSProperties = { display: 'block', cursor: 'pointer', padding: '15px 20px', background: '#FCFBF8' }

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
/** Compact Jamaica date for summary rows: "Wed, Nov 18, 2026". */
function jaShort(iso: string | null): string {
  if (!iso) return 'Date TBD'
  try {
    return new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return String(iso) }
}
/**
 * When a payout was sent, on Jamaica's clock: "Nov 12, 3:58 AM". A payout time
 * is a real instant (unlike the leg times, which are stored as Jamaica wall
 * clock), so it has to be told in Jamaica's zone by name. Without one it came
 * out in whichever zone the phone or the admin's laptop was in, on a page
 * whose footer says "Times are Jamaica time".
 */
export function paidStamp(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', { timeZone: 'America/Jamaica', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
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

/** Pill link/button: 48px tall for touch, full label. */
function Act({ href, onClick, children, tone = 'outline', grow, wide }: {
  href?: string; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode
  /** 'edit': a fleet manager's change, set apart from the links beside it by a warm ground. */
  tone?: 'outline' | 'wa' | 'solid' | 'edit'; grow?: boolean
  /** A row of its own (a fleet manager's change buttons, whose labels are longer). */
  wide?: boolean
}) {
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 48, padding: '0 16px', borderRadius: 12, cursor: 'pointer',
    fontFamily: dm, fontSize: 14, fontWeight: 600, textDecoration: 'none',
    transition: 'transform 0.12s ease, background 0.15s ease, filter 0.15s ease',
    flexGrow: grow || wide ? 1 : 0, flexBasis: wide ? '100%' : grow ? 0 : 'auto', textAlign: 'center',
    // #0B6459 keeps the WhatsApp identity while giving white text 5.9:1 (AA).
    border: tone === 'wa' ? '1px solid #09564D' : tone === 'solid' ? `1px solid ${ink}` : tone === 'edit' ? '1px solid #D9C793' : border,
    background: tone === 'wa' ? '#0B6459' : tone === 'solid' ? ink : tone === 'edit' ? '#FBF6E7' : '#fff',
    color: tone === 'wa' || tone === 'solid' ? '#fff' : ink,
  }
  // A phone number opens the dialer in place: sent to a new tab, a tel: link
  // can leave a blank tab behind on a phone. Only web pages open a new tab.
  if (href) return /^https?:/i.test(href)
    ? <a className="drv-act" href={href} target="_blank" rel="noreferrer" style={style}>{children}</a>
    : <a className="drv-act" href={href} style={style}>{children}</a>
  return <button className="drv-act" type="button" onClick={onClick} style={style}>{children}</button>
}

function PayChip({ paid, label, id }: { paid: boolean; label: string; id?: string }) {
  return (
    <span id={id} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 9999,
      fontSize: 12, fontWeight: 700,
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
          {jaDate(dateIso)} · <strong style={{ color: ink, fontWeight: 700 }}>{isArr ? 'lands' : 'hotel pickup'} {jaTime(dateIso)}</strong> Jamaica time
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

/* ── Fleet manager pieces (Nov 24 2026) ── */

/** What a card needs to offer a fleet manager's changes. Absent: the card is read-only. */
export interface FleetCard {
  lastChange: LastChange | null
  /** Open a change; the element is the button, for focus to return to. */
  onChange: (req: ChangeRequest, opener: HTMLElement) => void
}

/** When a change was saved, on Jamaica's clock: "Nov 24, 4:12 PM" (a real instant, as paidStamp). */
function changeStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', { timeZone: 'America/Jamaica', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Is a leg still ahead: an arrival until two hours after landing (lib/dispatch-change legIsAhead), a pickup until its time. */
function legAhead(iso: string | null, role: 'arrival' | 'departure'): boolean {
  if (!iso) return false
  return Date.now() < legInstantMs(iso) + (role === 'arrival' ? 2 * 3600_000 : 0)
}

/** "8:30 AM" or "12:00 noon" from a tour's "HH:MM". */
function tourClock(t: string): string {
  const v = new Date(`2000-01-01T${t}:00Z`).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' })
  return v === '12:00 PM' ? '12:00 noon' : v === '12:00 AM' ? '12:00 midnight' : v
}

/** The Driver section a fleet manager sees on a ride or a tour: who drives, the last change, and the button to change it. */
function DriverSection({ id, bookingRef, guest, driver, fleet, isTour, canChange }: {
  id: string; bookingRef: string; guest: string; driver: DriverTrip['driver'] | undefined
  fleet: FleetCard; isTour: boolean; canChange: boolean
}) {
  const last = fleet.lastChange
  const first = guest.split(' ')[0] || 'the guest'
  return (
    <div>
      <h3 style={eyebrow}>Driver</h3>
      <p style={{ fontSize: 17, fontWeight: 700, margin: '6px 0 0', letterSpacing: '-0.01em' }}>{driver?.name ?? 'No driver yet'}</p>
      {driver && (driver.vehicle || driver.plate) && (
        <p style={{ fontSize: 14, color: soft, margin: '3px 0 0', ...tnum }}>{[driver.vehicle, driver.plate].filter(Boolean).join(' · ')}</p>
      )}
      {last && (
        <p style={{ fontSize: 13, color: faint, margin: '8px 0 0', lineHeight: 1.5 }}>
          Last change: {last.text} · {last.by} · {changeStamp(last.at)}
        </p>
      )}
      {last?.open && (
        <div style={{ marginTop: 10, padding: '10px 13px', background: '#FBF6E7', border: '1px solid #EBDFC0', borderRadius: 10 }}>
          <p style={{ fontSize: 14, color: ink, margin: 0, lineHeight: 1.5 }}>
            <strong style={{ color: amber }}>Not emailed yet.</strong> {first} has not been told about this change by email.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <Act grow onClick={(e) => fleet.onChange({ mode: 'followup', changeId: last.changeId, ref: bookingRef, guest: first, text: last.text }, e.currentTarget)}>
              <Mail size={16} aria-hidden="true" />Email {first} or not
            </Act>
          </div>
        </div>
      )}
      {canChange && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <Act grow tone="edit" onClick={(e) => fleet.onChange({ mode: 'change', kind: 'driver', bookingId: id, ref: bookingRef, guest: first, current: driver?.name ?? null, isTour }, e.currentTarget)}>
            <UserRoundPen size={16} aria-hidden="true" />{driver ? 'Change driver' : 'Assign driver'}
          </Act>
        </div>
      )}
    </div>
  )
}

/* ── One trip card ── */

export function TripCard({ t, open, onToggle, showPay = true, fleet }: {
  t: DriverTrip; open: boolean; onToggle: () => void
  /** False for a regular driver: no pay anywhere on the card (the server sends none). */
  showPay?: boolean
  /** A fleet manager's controls; absent, the card is read-only. */
  fleet?: FleetCard
}) {
  const ref = useScrollOnOpen(open)
  const isRT = t.tripType === 'round_trip'
  // A hotel-to-airport one-way has a departure and no arrival: the card must
  // show the pickup it has, not "Lands -". The departure leg is a round trip's
  // return, or the ride's only leg.
  const departureOnly = !t.arrivalAt && !!t.departureAt
  const hasDepartureLeg = isRT || departureOnly
  // A pickup time a fleet manager set is no longer "the time the guest requested".
  const depSetBy = fleet?.lastChange?.kind === 'time' && fleet.lastChange.leg === 'departure' ? fleet.lastChange.by : null
  const arrCal = t.arrivalAt ? gcalLink({
    title: `MAPL Tours Jamaica pickup: ${t.guestName} (${t.ref})`,
    startIso: t.arrivalAt, durationMin: 60,
    location: `${t.airport}, Montego Bay`,
    details: `Drop-off: ${t.hotel}. Passengers: ${t.passengers}. Guest: ${t.guestPhone ?? ''}.${showPay && t.payoutLegs[0] ? ` Your pay: ${money(t.payoutLegs[0].amount)}${isRT ? ' (leg 1 of 2)' : ''}.` : ''}`,
  }) : null
  const depCal = t.departureAt && hasDepartureLeg ? gcalLink({
    title: `MAPL Tours Jamaica departure pickup: ${t.guestName} (${t.ref})`,
    startIso: t.departureAt, durationMin: 90,
    location: t.hotel,
    // A one-way has a single payout leg, paid once in full; only a round trip's
    // return is "leg 2 of 2" and reads the second payout.
    details: `Drop at ${t.airport}. Hotel pickup ${jaTime(t.departureAt)} Jamaica time (${depSetBy ? `time set by ${depSetBy}` : 'time the guest requested'})${t.departureFlight ? `, flight ${t.departureFlight}` : ''}.${showPay && t.payoutLegs[0] ? ` Your pay: ${money(isRT ? (t.payoutLegs[1]?.amount ?? 0) : t.payoutLegs[0].amount)}${isRT ? ' (leg 2 of 2)' : ''}.` : ''}`,
  }) : null
  const mapsHotel = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.hotel + ', Jamaica')}`

  return (
    <article ref={ref} aria-label={`Trip ${t.ref}`} style={{ background: '#fff', border, borderLeft: `4px solid ${showPay && t.fullyPaid ? green : goldWarm}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(23,22,20,0.04), 0 6px 22px rgba(23,22,20,0.05)', scrollMarginTop: 74 }}>
      {/* Clickable summary header (collapsed view), admin-bookings style.
          It is the same box it always was, with two repairs for screen
          readers. The heading used to sit INSIDE the role=button element,
          and a button's children are presentational, so no trip had a
          heading; now the heading holds the button. And the button's name
          was every word in the header; now it is the ref and the guest, with
          the rest as its description. It stays an element with role=button
          rather than a native button on purpose: in Safari the words inside
          a native button cannot be selected, and a driver could always
          select the booking reference here. */}
      <h2 style={headHeading}>
      <span
        role="button"
        tabIndex={0}
        id={`trip-${t.id}-btn`}
        aria-expanded={open}
        aria-controls={open ? `trip-${t.id}-panel` : undefined}
        aria-label={`${t.ref}, ${t.guestName}`}
        aria-describedby={showPay ? `trip-${t.id}-kind trip-${t.id}-pay trip-${t.id}-sum` : `trip-${t.id}-kind trip-${t.id}-sum`}
        className="drv-act"
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        style={{ ...headBox, borderBottom: open ? borderSoft : undefined }}
      >
        <span style={{ display: 'flex', alignItems: showPay ? 'center' : 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: showPay ? 'wrap' : 'nowrap' }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', ...(showPay ? {} : { minWidth: 0 }) }}>
            <span style={{ display: 'block', fontWeight: 800, fontSize: 16, letterSpacing: '0.01em', margin: 0, ...tnum }}>{t.ref}</span>
            <span id={`trip-${t.id}-kind`} style={{ fontSize: 13, color: soft, fontWeight: 500 }}>{isRT ? 'Round trip' : 'One-way'} · {t.passengers} passenger{t.passengers === 1 ? '' : 's'}</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            {showPay && <PayChip id={`trip-${t.id}-pay`} paid={t.fullyPaid} label={t.fullyPaid ? 'Paid in full' : 'Pay pending'} />}
            <ChevronRight size={20} strokeWidth={2.25} aria-hidden style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease', color: faint }} />
          </span>
        </span>
        <span id={`trip-${t.id}-sum`} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 9, flexWrap: 'wrap' }}>
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
                  Note
                </span>
              )}
            </span>
            <span style={{ fontSize: 13, color: soft, ...tnum }}>
              {departureOnly ? 'Hotel pickup' : 'Lands'} <strong style={{ color: ink, fontWeight: 600 }}>{jaShort(departureOnly ? t.departureAt : t.arrivalAt)} · {jaTime(departureOnly ? t.departureAt : t.arrivalAt)}</strong> Jamaica time
            </span>
            {t.tripType === 'round_trip' && t.departureAt && (
              <span style={{ fontSize: 13, color: soft, ...tnum }}>
                Return pickup <strong style={{ color: ink, fontWeight: 600 }}>{jaShort(t.departureAt)} · {jaTime(t.departureAt)}</strong> Jamaica time
              </span>
            )}
          </span>
          {showPay && (
            <span style={{ whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: faint }}>You get </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: green, ...tnum }}>{money(t.payoutTotal)} <span style={{ fontSize: 12, fontWeight: 700 }}>USD</span></span>
            </span>
          )}
        </span>
      </span>
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

        {fleet && (
          <div style={{ paddingTop: 16, borderTop: borderSoft }}>
            <DriverSection
              id={t.id} bookingRef={t.ref} guest={t.guestName} driver={t.driver} fleet={fleet} isTour={false}
              canChange={legAhead(t.arrivalAt, 'arrival') || (hasDepartureLeg && legAhead(t.departureAt, 'departure'))}
            />
          </div>
        )}

        {/* Legs as a timeline */}
        <div style={{ paddingTop: 16, borderTop: borderSoft, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {!departureOnly && (
            <Leg
              role="arrival" from={t.airport} to={t.hotel} dateIso={t.arrivalAt} flightRaw={t.arrivalFlight}
              actions={<>
                <Act grow href={mapsHotel}><MapPin size={16} aria-hidden="true" />Map to hotel</Act>
                {arrCal && <Act grow href={arrCal}><CalendarPlus size={16} aria-hidden="true" />Calendar</Act>}
                {fleet && t.arrivalAt && legAhead(t.arrivalAt, 'arrival') && (
                  <Act wide tone="edit" onClick={(e) => fleet.onChange({ mode: 'change', kind: 'time', bookingId: t.id, ref: t.ref, guest: t.guestName.split(' ')[0] || 'the guest', leg: 'arrival', current: t.arrivalAt as string, flight: t.arrivalFlight }, e.currentTarget)}>
                    <Clock size={16} aria-hidden="true" />Change landing time
                  </Act>
                )}
              </>}
            />
          )}
          {t.departureAt && hasDepartureLeg && (
            <Leg
              role="departure" from={t.hotel} to={t.airport} dateIso={t.departureAt} flightRaw={t.departureFlight}
              extra={
                <p style={{ fontSize: 13, color: amber, fontWeight: 700, margin: '5px 0 0' }}>
                  {depSetBy ? `This pickup time was set by ${depSetBy}.` : 'This is the pickup time the guest requested.'}
                </p>
              }
              actions={<>
                {/* The arrival leg carries the hotel map; a ride with no arrival needs it here. */}
                {departureOnly && <Act grow href={mapsHotel}><MapPin size={16} aria-hidden="true" />Map to hotel</Act>}
                {depCal && <Act grow href={depCal}><CalendarPlus size={16} aria-hidden="true" />Calendar</Act>}
                {fleet && legAhead(t.departureAt, 'departure') && (
                  <Act wide tone="edit" onClick={(e) => fleet.onChange({ mode: 'change', kind: 'time', bookingId: t.id, ref: t.ref, guest: t.guestName.split(' ')[0] || 'the guest', leg: 'departure', current: t.departureAt as string, flight: t.departureFlight }, e.currentTarget)}>
                    <Clock size={16} aria-hidden="true" />Change pickup time
                  </Act>
                )}
              </>}
            />
          )}
        </div>

        {/* Pay panel */}
        {showPay && (
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
                  <PayChip paid={p.paid} label={p.paid ? `Paid ${paidStamp(p.paidAt)}`.trim() : 'Pending'} />
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10, borderTop: '1px solid #E9E3D5' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>You get paid for this trip</span>
              <span style={{ fontSize: 19, fontWeight: 800, color: green, ...tnum }}>{money(t.payoutTotal)} <span style={{ fontSize: 12, fontWeight: 700 }}>USD</span></span>
            </div>
          </div>
        </div>
        )}
      </div>
      )}
    </article>
  )
}

/* ── Tour card: itinerary only, deliberately NO money anywhere ── */

function tourDate(d: string | null): string {
  if (!d) return 'Date TBD'
  try {
    return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return d }
}

export function TourCard({ t, open, onToggle, mode, fleet }: {
  t: DriverTour; open: boolean; onToggle: () => void
  /** 'driver': a regular driver given this tour; 'fleet': a fleet manager; absent: as it always was. */
  mode?: 'driver' | 'fleet'
  fleet?: FleetCard
}) {
  const ref = useScrollOnOpen(open)
  const first = t.guestName.split(' ')[0] || 'the guest'
  const days = t.items.map((i) => i.date).filter(Boolean).sort() as string[]
  const lastDay = days.length ? days[days.length - 1] : null
  // Still to come (the Jamaica calendar day of the last tour day, or later).
  const ahead = !lastDay || lastDay >= new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10)
  return (
    <article ref={ref} aria-label={`Tour booking ${t.ref}`} style={{ background: '#fff', border, borderLeft: `4px solid ${goldWarm}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(23,22,20,0.04), 0 6px 22px rgba(23,22,20,0.05)', scrollMarginTop: 74 }}>
      {/* The heading holds the button, named by the ref and the guest, as on the trip card. */}
      <h2 style={headHeading}>
      <span
        role="button"
        tabIndex={0}
        id={`tour-${t.id}-btn`}
        aria-expanded={open}
        aria-controls={open ? `tour-${t.id}-panel` : undefined}
        aria-label={`${t.ref}, ${t.guestName}`}
        aria-describedby={`tour-${t.id}-kind tour-${t.id}-sum`}
        className="drv-act"
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        style={{ ...headBox, borderBottom: open ? borderSoft : undefined }}
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ display: 'block', fontWeight: 800, fontSize: 16, letterSpacing: '0.01em', margin: 0, ...tnum }}>{t.ref}</span>
            <span id={`tour-${t.id}-kind`} style={{ fontSize: 13, color: soft, fontWeight: 500 }}>Tour · {t.items.length} experience{t.items.length === 1 ? '' : 's'}</span>
          </span>
          <ChevronRight size={20} strokeWidth={2.25} aria-hidden style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease', color: faint }} />
        </span>
        <span id={`tour-${t.id}-sum`} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: ink }}>{t.guestName}</span>
          <span aria-hidden="true" style={{ color: faint }}>·</span>
          <span style={{ fontSize: 13, color: soft }}>{t.items[0].title}{t.items.length > 1 ? ` +${t.items.length - 1} more` : ''}</span>
          <span aria-hidden="true" style={{ color: faint }}>·</span>
          <span style={{ fontSize: 13, color: soft, ...tnum }}>{tourDate(t.firstDate)}</span>
        </span>
      </span>
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
          {mode && (
            <div style={{ paddingTop: 14, borderTop: borderSoft }}>
              <h3 style={eyebrow}>Pickup</h3>
              <p style={{ fontSize: 17, fontWeight: 700, margin: '6px 0 0', letterSpacing: '-0.01em', ...tnum }}>
                {t.pickupTime ? `${tourClock(t.pickupTime)} Jamaica time` : 'Pickup time not set'}
              </p>
              <p style={{ fontSize: 14, color: soft, margin: '3px 0 0' }}>{t.pickup ?? 'No pickup place on the booking'}</p>
              {mode === 'fleet' && fleet && ahead && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <Act grow tone="edit" onClick={(e) => fleet.onChange({ mode: 'change', kind: 'tour_time', bookingId: t.id, ref: t.ref, guest: first, current: t.pickupTime ?? null, day: t.firstDate }, e.currentTarget)}>
                    <Clock size={16} aria-hidden="true" />{t.pickupTime ? 'Change pickup time' : 'Set pickup time'}
                  </Act>
                </div>
              )}
            </div>
          )}
          {mode === 'fleet' && fleet && (
            <div style={{ paddingTop: 14, borderTop: borderSoft }}>
              <DriverSection id={t.id} bookingRef={t.ref} guest={t.guestName} driver={t.driver ?? null} fleet={fleet} isTour canChange={ahead} />
            </div>
          )}
          {!mode && <p style={{ fontSize: 12, color: faint, margin: 0 }}>Tour bookings are for your awareness; MAPL will contact you if a ride is needed.</p>}
          {mode === 'driver' && <p style={{ fontSize: 12, color: faint, margin: 0 }}>You are the driver for this tour.</p>}
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

export default function DriverDashboard({
  trips, tours = [], driverLabel, adminPreview, role, showPay = true, drivers = null, changes = null, incomplete = false, selfDriverId = null,
}: {
  trips: DriverTrip[]
  tours?: DriverTour[]
  driverLabel: string
  adminPreview?: boolean
  /** Who is looking (lib/driver-access). Absent: the read-only portal as it always was. */
  role?: 'driver' | 'fleet_manager'
  /** False for a regular driver: no pay anywhere (the server sends none). */
  showPay?: boolean
  /** Fleet managers: the saved drivers, to assign and to keep. */
  drivers?: PortalDriver[] | null
  /** Fleet managers: the newest change on each booking. */
  changes?: Record<string, LastChange> | null
  /** A read failed: the lists may be missing rides. */
  incomplete?: boolean
  /** The signed-in driver's own saved row, if any. */
  selfDriverId?: string | null
}) {
  const isFleet = role === 'fleet_manager'
  const [request, setRequest] = useState<ChangeRequest | null>(null)
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!isFleet) return
    void loadChangeDialog().catch(() => {})
    void loadDriversPanel().catch(() => {})
  }, [isFleet])
  const fleetFor = (id: string): FleetCard | undefined => isFleet
    ? { lastChange: changes?.[id] ?? null, onChange: (req, el) => { setOpener(el); setRequest(req) } }
    : undefined
  const owedTotal = trips.reduce((s, t) => s + t.payoutTotal, 0)
  const paidTotal = trips.reduce((s, t) => s + t.payoutLegs.filter((p) => p.paid).reduce((x, p) => x + p.amount, 0), 0)
  const pendingTotal = Math.round((owedTotal - paidTotal) * 100) / 100
  const next = nextPickup(trips)
  const [tab, setTab] = useState<'transfers' | 'tours' | 'drivers'>('transfers')
  // Accordion: exactly one reservation card open at a time.
  const [openId, setOpenId] = useState<string | null>(null)
  const toggle = (id: string) => setOpenId((o) => (o === id ? null : id))
  // Every drive (each leg of a round trip on its own day) and every tour day, for the calendar.
  const schedule = useMemo(() => scheduleFromDriver(trips, tours), [trips, tours])

  return (
    <div style={{ fontFamily: dm, color: ink }}>
      {adminPreview && (
        <p style={{
          margin: '0 0 14px', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: 'rgba(122,90,8,0.10)', border: '1px solid rgba(122,90,8,0.30)', color: amber,
        }}>
          {isFleet
            ? `Admin preview: exactly what ${driverLabel} sees as fleet manager, with the same controls and no customer totals, fees or margin. Changes saved here are real: they are saved, emailed and logged as from MAPL Tours Jamaica.`
            : role === 'driver'
              ? `Admin preview. This is exactly what ${driverLabel} sees: only the rides and tours given to ${driverLabel}, and no pay.`
              : `Admin preview. This is exactly what ${driverLabel} sees: no customer totals, no fees, no margin.`}
        </p>
      )}
      {incomplete && (
        <p role="status" style={{
          margin: '0 0 14px', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: '#FCEDEA', border: '1px solid rgba(176,28,12,0.25)', color: red,
        }}>
          Some rides could not be loaded just now, so this list may be missing some. Reload the page in a minute.
        </p>
      )}

      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(24px, 4.5vw, 30px)', letterSpacing: '-0.025em', margin: 0 }}>Your trips</h1>
          <p style={{ fontSize: 14, color: soft, margin: '5px 0 0' }}>{driverLabel}{isFleet ? ' · Fleet manager' : ''} · MAPL Tours Jamaica</p>
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
              {jaDate(next.iso)} · {jaTime(next.iso)}
            </p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.88)', margin: '6px 0 0', lineHeight: 1.5 }}>
              {next.t.guestName} · {next.t.ref} · {next.t.passengers} passenger{next.t.passengers === 1 ? '' : 's'}
              {next.role === 'departure' ? ' · pickup time requested by the guest' : ''}
            </p>
          </div>
        </section>
      )}

      {/* Pay summary: the glanceable answer to "what am I owed?" */}
      {showPay && (
      <section aria-label="Pay summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 14 }}>
        {[
          { k: 'Trips', v: String(trips.length), c: ink, bg: '#fff', bd: border },
          { k: 'Paid to you (USD)', v: money(paidTotal), c: green, bg: '#fff', bd: border },
          { k: 'Pending (USD)', v: money(pendingTotal), c: pendingTotal > 0 ? amber : faint, bg: pendingTotal > 0 ? '#FBF6E7' : '#fff', bd: pendingTotal > 0 ? '1px solid #EBDFC0' : border },
        ].map((s) => (
          <div key={s.k} style={{ background: s.bg, border: s.bd, borderRadius: 14, padding: '14px 15px' }}>
            <p style={{ ...eyebrow, letterSpacing: '0.07em' }}>{s.k}</p>
            <p style={{ fontSize: 'clamp(21px, 5vw, 27px)', fontWeight: 800, color: s.c, margin: '6px 0 0', letterSpacing: '-0.015em', ...tnum }}>{s.v}</p>
          </div>
        ))}
      </section>
      )}

      {/* The month at a glance: every day with a drive or a tour. A day's
          trips open their card below (owner, Nov 13 2026: a calendar for the
          driver, so an upcoming ride is impossible to miss). */}
      <div style={{ marginTop: 14 }}>
        <TripCalendar
          events={schedule}
          openWord="Open trip"
          onOpen={(e) => { setTab(e.kind === 'tour' ? 'tours' : 'transfers'); setOpenId(e.bookingId) }}
        />
      </div>

      {/* Transfers | Tours tabs, transfers first and default */}
      <div role="tablist" aria-label={isFleet ? 'Section' : 'Booking type'} style={{ display: 'flex', gap: isFleet ? 4 : 8, marginTop: 20, background: '#fff', border, borderRadius: 9999, padding: 5, width: 'fit-content', maxWidth: '100%', ...(isFleet ? { overflowX: 'auto' as const, scrollbarWidth: 'none' as const } : {}) }}>
        {([['transfers', `Transfers`, trips.length], ['tours', 'Tours', tours.length], ...(isFleet && drivers ? [['drivers', 'Drivers', drivers.filter((d) => d.active).length] as const] : [])] as const).map(([key, label, count]) => (
          <button
            key={key}
            id={`tab-${key}`}
            role="tab"
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            className="drv-act"
            onClick={() => setTab(key)}
            style={{
              minHeight: 42, padding: isFleet ? '0 12px' : '0 18px', borderRadius: 9999, border: 'none', cursor: 'pointer', ...(isFleet ? { flexShrink: 0 } : {}),
              fontFamily: dm, fontSize: 14, fontWeight: 700,
              background: tab === key ? ink : 'transparent',
              color: tab === key ? '#fff' : soft,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            {label}
            <span className={isFleet ? 'fm-tab-count' : undefined} style={{
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
              <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{role === 'driver' ? 'No rides given to you yet' : 'No transfers assigned yet'}</p>
              <p style={{ fontSize: 14, color: soft, margin: '6px 0 0' }}>{role === 'driver' ? 'When a ride is given to you, it appears here.' : 'New bookings from MAPL Tours Jamaica will appear here.'}</p>
            </div>
          )}
          {trips.map((t) => <TripCard key={t.id} t={t} open={openId === t.id} onToggle={() => toggle(t.id)} showPay={showPay} fleet={fleetFor(t.id)} />)}
        </section>
      ) : tab === 'tours' ? (
        <section id="panel-tours" role="tabpanel" aria-labelledby="tab-tours" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          {tours.length === 0 && (
            <div style={{ background: '#fff', border, borderRadius: 18, padding: '32px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{role === 'driver' ? 'No tours given to you yet' : 'No tour bookings yet'}</p>
              <p style={{ fontSize: 14, color: soft, margin: '6px 0 0' }}>{role === 'driver' ? 'When a tour is given to you, it appears here.' : 'Paid tour bookings will appear here so you can plan ahead.'}</p>
            </div>
          )}
          {tours.map((t) => <TourCard key={t.id} t={t} open={openId === t.id} onToggle={() => toggle(t.id)} mode={isFleet ? 'fleet' : role === 'driver' ? 'driver' : undefined} fleet={fleetFor(t.id)} />)}
        </section>
      ) : (
        <section id="panel-drivers" role="tabpanel" aria-labelledby="tab-drivers" style={{ marginTop: 16 }}>
          <DriversPanel drivers={drivers ?? []} selfId={selfDriverId} />
        </section>
      )}

      <p style={{ fontSize: 12, color: faint, lineHeight: 1.6, marginTop: 24 }}>
        {showPay
          ? 'Times are Jamaica time. Pay is your agreed rate per trip; round trips are paid in two halves, one before each leg. Questions: contact@mapltours.com.'
          : 'Times are Jamaica time. Questions about a ride: ask your fleet manager, or write to contact@mapltours.com.'}
      </p>

      {isFleet && (
        <ChangeDialog
          request={request}
          drivers={drivers ?? []}
          returnTo={opener}
          onClose={() => setRequest(null)}
        />
      )}

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
