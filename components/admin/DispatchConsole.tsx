'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  type Bk, firstLeg, bookingRef, moneyBlock, money,
  jaDate, jaTime, shiftIso, gcalLink, waLink, ARRIVAL_CLEAR_MIN, MIN_PICKUP_LEAD_MIN,
  visibleSteps, progress, autoStepDone,
  msgDriverRequest, msgCustomerConfirmation, msgFlightDetailsRequest, msgDriverReminder,
  msgFlightLanded, msgCustomerFollowup, msgReviewRequest,
} from '@/lib/dispatch'
import { flightLinks, flightDate, type FlightStatus } from '@/lib/flight'

const dm = 'var(--font-dm-sans)'
const ink = 'var(--text-primary, #171614)'
const soft = 'var(--text-secondary, #57534C)'
const faint = '#6E6A62'
const green = '#1D7A50'
const amber = '#7A5A08'
const accent = 'var(--accent, #171614)'
const border = '1px solid var(--border, #E7E1D6)'
const borderSoft = '1px solid var(--border-subtle, #F1ECE3)'
const tnum = { fontVariantNumeric: 'tabular-nums' as const }
const subLabel: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: faint, margin: '0 0 6px' }
const AIRPORT = 'Sangster International Airport (MBJ)'

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', border, borderRadius: 14, overflow: 'hidden' }}>
      {title && (
        <div style={{ padding: '13px 20px', borderBottom: borderSoft, background: '#FCFBF8' }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: faint }}>{title}</span>
        </div>
      )}
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </section>
  )
}

function MRow({ k, v, em, big }: { k: string; v: string; em?: boolean; big?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: big ? '10px 0 0' : '3px 0', marginTop: big ? 8 : 0, borderTop: big ? borderSoft : undefined }}>
      <span style={{ fontSize: big ? 14 : 13, fontWeight: big ? 700 : 400, color: em ? green : soft }}>{k}</span>
      <span style={{ fontSize: big ? 17 : 13.5, fontWeight: big ? 800 : 500, color: em ? green : ink, ...tnum }}>{v}</span>
    </div>
  )
}

/** A pill button that either opens a URL (new tab) or runs onClick. */
function Btn({ href, onClick, children, tone = 'outline' }: { href?: string; onClick?: () => void; children: React.ReactNode; tone?: 'outline' | 'wa' | 'solid' }) {
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38, padding: '0 14px',
    borderRadius: 9999, cursor: 'pointer', fontFamily: dm, fontSize: 13, fontWeight: 600,
    textDecoration: 'none', transition: 'all 0.15s ease',
    border: tone === 'wa' ? '1px solid #128C7E' : tone === 'solid' ? `1px solid ${accent}` : border,
    background: tone === 'wa' ? 'rgba(18,140,126,0.10)' : tone === 'solid' ? accent : '#fff',
    color: tone === 'wa' ? '#0B5E54' : tone === 'solid' ? '#fff' : ink,
  }
  if (href) return <a href={href} target="_blank" rel="noreferrer" style={style}>{children}</a>
  return <button type="button" onClick={onClick} style={style}>{children}</button>
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text)
      else { const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t) }
      setDone(true); setTimeout(() => setDone(false), 1600)
    } catch { /* no-op */ }
  }
  return <Btn onClick={copy}>{done ? '✓ Copied' : label}</Btn>
}

export default function DispatchConsole({ booking, stripeFee, driverEmailConfigured = true }: { booking: Bk; stripeFee: number | null; driverEmailConfigured?: boolean }) {
  const b0 = booking
  const [dispatch, setDispatch] = useState<Record<string, string>>((b0.dispatch as Record<string, string>) ?? {})
  const [driver, setDriver] = useState({
    name: b0.driver_name ?? '', phone: b0.driver_phone ?? '', vehicle: b0.driver_vehicle ?? '', plate: b0.driver_plate ?? '',
  })
  const [savingDriver, setSavingDriver] = useState(false)
  const [driverSaved, setDriverSaved] = useState(false)

  // A booking object that reflects the current (possibly unsaved-to-render) driver fields for message templating.
  const b: Bk = { ...b0, driver_name: driver.name || null, driver_phone: driver.phone || null, driver_vehicle: driver.vehicle || null, driver_plate: driver.plate || null }
  const leg = firstLeg(b)!
  const m = moneyBlock(b, stripeFee)
  const ref = bookingRef(b.id)
  const name = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim() || '(no name)'
  const prog = progress({ ...b, dispatch })
  const steps = visibleSteps(m.isRoundTrip, !!leg.arrivalAt)

  // Re-render each minute so time-based auto steps (landed, pickup window)
  // flip at the real moment even if the console just sits open.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 60_000); return () => clearInterval(t) }, [])

  // Feedback for the pay steps: the response says whether the driver email
  // actually went out, and the operator deserves to see that, not a log line.
  const [payNote, setPayNote] = useState<Record<string, 'sent' | 'failed'>>({})

  async function toggle(step: string, done: boolean) {
    setDispatch((d) => { const n = { ...d }; if (done) n[step] = new Date().toISOString(); else delete n[step]; return n })
    const r = await fetch('/api/admin/dispatch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bookingId: b.id, step, done }) }).catch(() => null)
    if (done && (step === 'paid_first' || step === 'paid_second')) {
      const j = r && r.ok ? await r.json().catch(() => null) : null
      if (j && j.driverEmailed !== null && j.driverEmailed !== undefined) {
        setPayNote((n) => ({ ...n, [step]: j.driverEmailed ? 'sent' : 'failed' }))
      }
    }
  }
  async function saveDriver() {
    setSavingDriver(true)
    await fetch('/api/admin/dispatch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bookingId: b.id, driver }) }).catch(() => {})
    setSavingDriver(false); setDriverSaved(true); setTimeout(() => setDriverSaved(false), 1800)
  }

  // Calendar links
  const arrivalCal = leg.arrivalAt ? gcalLink({
    title: `MAPL TOURS pickup: ${name} (${ref})`,
    startIso: leg.arrivalAt, durationMin: 60,
    location: `${AIRPORT}, Montego Bay`,
    details: `Drop-off: ${leg.hotel}. Passengers: ${leg.passengers}. Customer: ${b.phone ?? ''}. Driver pay: ${money(m.driverPerLeg)}${m.isRoundTrip ? ' (leg 1 of 2)' : ''}.`,
  }) : null
  const departureCal = m.isRoundTrip && leg.departureAt ? gcalLink({
    title: `MAPL TOURS departure pickup: ${name} (${ref})`,
    startIso: leg.departureAt, durationMin: 90,
    location: leg.hotel,
    details: `Drop at ${AIRPORT}. Hotel pickup ${jaTime(leg.departureAt)} Jamaica time (time requested by the guest)${leg.departureFlight ? `, flight ${leg.departureFlight}` : ''}. Driver pay: ${money(m.driverPerLeg)} (leg 2 of 2).`,
  }) : null

  return (
    <div style={{ fontFamily: dm, color: ink }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <h1 style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-0.025em', margin: 0 }}>Dispatch</h1>
          <span style={{ fontSize: 14, fontWeight: 700, ...tnum }}>{ref}</span>
          <span style={{ fontSize: 13, color: soft }}>{name} · {leg.tripType === 'round_trip' ? 'Round trip' : 'One-way'} · {leg.passengers} pax</span>
        </div>
        <Link href="/admin/bookings" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 9999, border, background: '#fff', color: ink, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <span aria-hidden="true">←</span> Bookings
        </Link>
      </div>

      {/* Progress */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 8, borderRadius: 9999, background: 'var(--surface, #F1ECE3)', overflow: 'hidden', maxWidth: 320 }}>
          <div style={{ width: `${(prog.done / prog.total) * 100}%`, height: '100%', background: green, transition: 'width 0.3s ease' }} />
        </div>
        <span style={{ fontSize: 12, color: faint, ...tnum }}>{prog.done} / {prog.total} steps</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14, marginTop: 20 }} className="admin-card-grid">
        {/* Money */}
        <Card title="Money">
          <div style={subLabel}>What the customer paid</div>
          <MRow k="Driver's rate (paid to Collin)" v={money(m.fare)} />
          <MRow k="MAPL margin (covers card fees)" v={`+ ${money(m.transferFee)}`} />
          <MRow k="Customer paid" v={`${money(m.customerPaid)} USD`} big />

          <div style={{ ...subLabel, marginTop: 16 }}>Where it goes</div>
          <MRow k={m.isRoundTrip ? `Driver payout (${money(m.driverPerLeg)} x2)` : 'Driver payout'} v={`- ${money(m.driverTotal)}`} />
          <MRow k="Stripe fee (USD)" v={m.stripeFee != null ? `- ${money(m.stripeFee)}` : 'pending'} />
          <MRow k="MAPL TOURS keeps" v={m.maplKeeps != null ? money(m.maplKeeps) : 'n/a'} em big />
        </Card>

        {/* Trip */}
        <Card title="Trip (Jamaica time)">
          <p style={{ ...tnum, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: faint, margin: '0 0 6px' }}>Arrival</p>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{AIRPORT} → {leg.hotel}</div>
          <div style={{ fontSize: 13, color: soft, marginTop: 2, ...tnum }}>{jaDate(leg.arrivalAt)}</div>
          <div style={{ fontSize: 13, color: soft, ...tnum }}>Flight lands {jaTime(leg.arrivalAt)}{leg.arrivalFlight ? ` (flight ${leg.arrivalFlight})` : ' (flight TBD)'}</div>
          <div style={{ fontSize: 12, color: faint, marginTop: 2, ...tnum }}>Customer usually clears customs ~{ARRIVAL_CLEAR_MIN} min after landing ({jaTime(leg.arrivalAt ? shiftIso(leg.arrivalAt, ARRIVAL_CLEAR_MIN) : null)}).</div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {arrivalCal && <Btn href={arrivalCal}>📅 Add arrival to Google Calendar</Btn>}
            <DayOfBtn bookingId={b.id} leg="arrival" sentAt={dispatch.dayof_arrival_sent} />
          </div>

          {m.isRoundTrip && leg.departureAt && (
            <>
              <p style={{ ...tnum, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: faint, margin: '16px 0 6px' }}>Departure</p>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{leg.hotel} → {AIRPORT}</div>
              <div style={{ fontSize: 13, color: soft, marginTop: 2, ...tnum }}>{jaDate(leg.departureAt)}</div>
              <div style={{ fontSize: 13, color: soft, ...tnum }}>Hotel pickup {jaTime(leg.departureAt)}{leg.departureFlight ? ` · flight ${leg.departureFlight}` : ''}</div>
              <div style={{ fontSize: 12, color: amber, marginTop: 2, fontWeight: 600 }}>This is the pickup time the guest requested. Check it against the flight below.</div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {departureCal && <Btn href={departureCal}>📅 Add departure to Google Calendar</Btn>}
                <DayOfBtn bookingId={b.id} leg="departure" sentAt={dispatch.dayof_departure_sent} />
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Flight tracking */}
      <div style={{ marginTop: 14 }}>
        <Card title="Flight tracking">
          <p style={{ fontSize: 12, color: faint, margin: '0 0 12px', lineHeight: 1.5 }}>
            The arrival time is when the flight lands; the departure time is the hotel pickup the guest asked for. Check both against the airline before dispatch.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FlightTracking legLabel="Arrival flight" flightRaw={leg.arrivalFlight} dateIso={leg.arrivalAt} bookedLabel={jaTime(leg.arrivalAt)} mbjRole="arrival" />
            {m.isRoundTrip && (
              <FlightTracking legLabel="Departure flight" flightRaw={leg.departureFlight} dateIso={leg.departureAt} bookedLabel={jaTime(leg.departureAt)} mbjRole="departure" />
            )}
          </div>
        </Card>
      </div>

      {/* Driver details */}
      <div style={{ marginTop: 14 }}>
        <Card title="Driver + vehicle">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            {([['name', 'Driver name'], ['phone', 'Driver WhatsApp'], ['vehicle', 'Vehicle make + model + colour'], ['plate', 'License plate']] as const).map(([k, lbl]) => (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: soft, fontWeight: 600 }}>
                {lbl}
                <input
                  value={driver[k]}
                  onChange={(e) => setDriver((d) => ({ ...d, [k]: e.target.value }))}
                  style={{ height: 40, padding: '0 12px', borderRadius: 9, border, background: '#fff', fontFamily: dm, fontSize: 14, color: ink, outline: 'none' }}
                />
              </label>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Btn tone="solid" onClick={saveDriver}>{savingDriver ? 'Saving…' : driverSaved ? '✓ Saved' : 'Save driver details'}</Btn>
          </div>
        </Card>
      </div>

      {/* Steps */}
      <div style={{ marginTop: 14 }}>
        <Card title="Workflow">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {steps.map((s, idx) => {
              const doneAt = dispatch[s.key]
              // What the platform can prove happened on its own. A manual tick
              // wins for display; auto rows are not clickable, because there
              // is nothing for a human to record: the evidence IS the record.
              const auto = !doneAt ? autoStepDone({ ...b0, dispatch }, s.key, nowMs, { driverEmailConfigured }) : null
              const isDone = !!doneAt || !!auto
              return (
                <div key={s.key} style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: idx === 0 ? undefined : borderSoft }}>
                  <button
                    type="button"
                    onClick={auto ? undefined : () => toggle(s.key, !doneAt)}
                    disabled={!!auto}
                    aria-pressed={isDone}
                    aria-label={auto ? `Step ${s.num} completed automatically: ${auto}` : `Mark step ${s.num} ${doneAt ? 'not done' : 'done'}`}
                    style={{
                      flexShrink: 0, width: 26, height: 26, borderRadius: 8, marginTop: 1, cursor: auto ? 'default' : 'pointer',
                      border: isDone ? `1px solid ${green}` : border, background: isDone ? green : '#fff',
                      color: '#fff', fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >{isDone ? '✓' : ''}</button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: faint, ...tnum }}>{String(s.num).padStart(2, '0')}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: isDone ? faint : ink, textDecoration: doneAt ? 'line-through' : undefined }}>{s.title}</span>
                      {doneAt && <span style={{ fontSize: 12, color: green, ...tnum }}>✓ {jaDateOrTime(doneAt)}</span>}
                      {auto && <span style={{ fontSize: 12, color: green }}>✓ auto · {auto}</span>}
                      {payNote[s.key] === 'sent' && <span style={{ fontSize: 12, color: green }}>✉️ driver emailed</span>}
                      {payNote[s.key] === 'failed' && <span style={{ fontSize: 12, color: '#8A2A0A', fontWeight: 600 }}>payment saved, but the driver email did not send</span>}
                    </div>
                    {s.hint && !isDone && <div style={{ fontSize: 12, color: faint, marginTop: 3 }}>{s.hint}</div>}
                    <StepActions stepKey={s.key} b={b} m={m} arrivalCal={arrivalCal} departureCal={departureCal} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <p style={{ fontSize: 12, color: faint, marginTop: 16, lineHeight: 1.5, maxWidth: 720 }}>
        All amounts are in USD, the currency the customer was charged. Your Stripe account settles in CAD, so the Stripe fee (processing plus currency conversion) is converted back to USD here at the transaction rate. Times are shown in Jamaica time exactly as the customer entered them; calendar events use the America/Jamaica timezone. The suggested departure pickup is the flight time minus 4 hours; adjust for zone and traffic.
      </p>
    </div>
  )
}

function jaDateOrTime(iso: string): string {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}

function StepActions({ stepKey, b, m, arrivalCal, departureCal }: {
  stepKey: string; b: Bk; m: ReturnType<typeof moneyBlock>
  arrivalCal: string | null; departureCal: string | null
}) {
  const wrap = (children: React.ReactNode) => <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>{children}</div>
  const custPhone = b.phone as string | null
  const drvPhone = b.driver_phone as string | null

  switch (stepKey) {
    case 'sent_to_driver': {
      const msg = msgDriverRequest(b, m)
      return wrap(<>
        <CopyBtn text={msg} label="Copy driver message" />
        <Btn tone="wa" href={waLink(drvPhone, msg)}>Send on WhatsApp</Btn>
        {arrivalCal && <Btn href={arrivalCal}>📅 Arrival</Btn>}
        {departureCal && <Btn href={departureCal}>📅 Departure</Btn>}
      </>)
    }
    case 'customer_confirmed': {
      const msg = msgCustomerConfirmation(b)
      return wrap(<>
        <CopyBtn text={msg} label="Copy customer confirmation" />
        <Btn tone="wa" href={waLink(custPhone, msg)}>Send on WhatsApp</Btn>
      </>)
    }
    case 'flight_requested': {
      const msg = msgFlightDetailsRequest(b)
      return wrap(<><CopyBtn text={msg} label="Copy flight request" /><Btn tone="wa" href={waLink(custPhone, msg)}>Send on WhatsApp</Btn></>)
    }
    case 'driver_reconfirmed': {
      const msg = msgDriverReminder(b, 'arrival')
      return wrap(<><CopyBtn text={msg} label="Copy driver reminder" /><Btn tone="wa" href={waLink(drvPhone, msg)}>Send on WhatsApp</Btn></>)
    }
    case 'landed': {
      const msg = msgFlightLanded(b)
      return wrap(<><CopyBtn text={msg} label="Copy landed message" /><Btn tone="wa" href={waLink(drvPhone, msg)}>Send on WhatsApp</Btn></>)
    }
    case 'paid_first':
    case 'paid_second':
      return <div style={{ marginTop: 6, fontSize: 13, color: '#7A5A08', fontWeight: 600, ...tnum }}>Pay driver {money(m.driverPerLeg)}{m.isRoundTrip ? (stepKey === 'paid_first' ? ' (first half)' : ' (second half)') : ''} before the pickup.</div>
    case 'arrival_followup': {
      const msg = msgCustomerFollowup(b)
      return wrap(<><CopyBtn text={msg} label="Copy follow-up" /><Btn tone="wa" href={waLink(custPhone, msg)}>Send on WhatsApp</Btn></>)
    }
    case 'departure_reminded': {
      const msg = msgDriverReminder(b, 'departure')
      return wrap(<><CopyBtn text={msg} label="Copy departure reminder" /><Btn tone="wa" href={waLink(drvPhone, msg)}>Send on WhatsApp</Btn></>)
    }
    case 'review_requested': {
      const msg = msgReviewRequest(b)
      return wrap(<><CopyBtn text={msg} label="Copy review request" /><Btn tone="wa" href={waLink(custPhone, msg)}>Send on WhatsApp</Btn></>)
    }
    default:
      return null
  }
}

/**
 * Sends the guest their day-of details for one leg. Deliberately manual: it
 * should only go out once the driver is assigned, since an email naming no
 * driver is worse than no email at all.
 */
/**
 * Manual override for the day-of email. The hourly job sends these on its own,
 * so this is for the exceptions: a driver assigned late, or a guest who lost
 * the mail. A blocked send says WHY rather than just failing, and an
 * already-sent one turns into a deliberate two-step resend.
 */
function DayOfBtn({ bookingId, leg, sentAt }: { bookingId: string; leg: 'arrival' | 'departure'; sentAt?: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'blocked' | 'confirm' | 'error'>(sentAt ? 'sent' : 'idle')
  const [why, setWhy] = useState<string | null>(null)

  const send = async (force = false) => {
    setState('sending')
    const r = await fetch('/api/admin/dayof', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookingId, leg, force }),
    }).catch(() => null)
    if (r && r.ok) { setState('sent'); setWhy(null); return }
    const detail = r ? await r.json().catch(() => null) : null
    const reason = detail?.error ?? 'send failed'
    setWhy(reason)
    // "Already sent" is not a failure, it is the guard working. Offer a resend.
    setState(r?.status === 409 ? (reason === 'already sent' ? 'confirm' : 'blocked') : 'error')
  }

  const label = state === 'sending' ? 'Sending…'
    : state === 'sent' ? '✓ Day-of email sent'
    : state === 'confirm' ? 'Already sent · send again?'
    : state === 'blocked' ? `Cannot send: ${why}`
    : state === 'error' ? 'Send failed, retry'
    : '✉️ Send day-of email'

  return (
    <Btn
      tone={state === 'sent' || state === 'blocked' ? 'outline' : 'solid'}
      onClick={() => send(state === 'confirm')}
    >
      {label}
    </Btn>
  )
}

/* ── Flight tracking (any airline) ── */

function clockMinutes(s: string | null | undefined): number | null {
  if (!s) return null
  const m = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  let h = Number(m[1]) % 12
  if (/pm/i.test(m[3])) h += 12
  return h * 60 + Number(m[2])
}

function FlightTracking({ legLabel, flightRaw, dateIso, bookedLabel, mbjRole }: {
  legLabel: string
  flightRaw: string | null
  dateIso: string | null
  bookedLabel: string
  mbjRole: 'arrival' | 'departure'
}) {
  const [st, setSt] = useState<FlightStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const links = flightLinks(flightRaw, dateIso)

  const check = async () => {
    setLoading(true)
    const r = await fetch(`/api/admin/flight?flight=${encodeURIComponent(flightRaw ?? '')}&date=${flightDate(dateIso) ?? ''}&role=${mbjRole}`).catch(() => null)
    setSt(r ? await r.json().catch(() => null) : null)
    setLoading(false)
  }

  const authLeg = st ? (mbjRole === 'arrival' ? st.arrival : st.departure) : null
  const authTime = authLeg?.revisedLocal || authLeg?.scheduledLocal || null
  const isDeparture = mbjRole === 'departure'
  // Arrival: booked time IS the flight time, so any real gap is a mismatch.
  // Departure: booked time is the guest's requested HOTEL PICKUP; the check is
  // whether it leaves enough lead before the actual flight.
  const diff = authTime ? (() => { const a = clockMinutes(bookedLabel); const b = clockMinutes(authTime); return a != null && b != null ? b - a : null })() : null
  const lead = isDeparture && diff != null ? (diff < -720 ? diff + 1440 : diff) : null // pickup -> flight, wrap overnight
  const leadLabel = lead != null ? `${Math.floor(Math.abs(lead) / 60)}h ${String(Math.abs(lead) % 60).padStart(2, '0')}m` : ''
  const warn = isDeparture ? (lead != null && lead < MIN_PICKUP_LEAD_MIN) : (diff != null && Math.abs(diff) > 30)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{legLabel}</span>
        <span style={{ fontSize: 13, color: soft, ...tnum }}>{links?.ident ?? flightRaw ?? 'flight TBD'}</span>
        <span style={{ fontSize: 12, color: faint, ...tnum }}>{isDeparture ? 'Requested pickup' : 'Lands'} {bookedLabel} Jamaica time</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {links && <Btn href={links.google}>Google</Btn>}
        {links && <Btn href={links.flightaware}>FlightAware</Btn>}
        {links && <Btn href={links.flightradar24}>Flightradar24</Btn>}
        {links && <Btn tone="solid" onClick={check}>{loading ? 'Checking…' : 'Check live status'}</Btn>}
      </div>
      {st && (
        <div style={{ marginTop: 10 }}>
          {st.found && authTime ? (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: warn ? '#FCEDEA' : '#EAF4EE',
              border: `1px solid ${warn ? 'rgba(176,28,12,0.25)' : 'rgba(29,122,80,0.25)'}`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: warn ? '#B01C0C' : green, ...tnum }}>
                Airline: flight {isDeparture ? 'departs' : 'lands'} {authTime}{st.status ? ` · ${st.status}` : ''}
              </div>
              {isDeparture && lead != null && (
                lead <= 0 ? (
                  <div style={{ fontSize: 12, color: '#B01C0C', marginTop: 4 }}>
                    The requested {bookedLabel} pickup is at or after the flight time. Fix this with the guest before dispatch.
                  </div>
                ) : lead < MIN_PICKUP_LEAD_MIN ? (
                  <div style={{ fontSize: 12, color: '#B01C0C', marginTop: 4 }}>
                    Pickup at {bookedLabel} leaves only {leadLabel} before the flight. Confirm with the guest; suggest an earlier pickup.
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: faint, marginTop: 4 }}>
                    Pickup at {bookedLabel} leaves {leadLabel} before the flight. Comfortable.
                  </div>
                )
              )}
              {!isDeparture && warn && (
                <div style={{ fontSize: 12, color: '#B01C0C', marginTop: 4 }}>
                  This is about {Math.abs(diff!)} min off the {bookedLabel} the customer entered. Update the pickup plan to match the airline.
                </div>
              )}
              {!isDeparture && !warn && diff != null && (
                <div style={{ fontSize: 12, color: faint, marginTop: 4 }}>Matches the customer&rsquo;s time.</div>
              )}
            </div>
          ) : !st.configured ? (
            <p style={{ fontSize: 12, color: faint }}>
              Live auto-fetch is off (no AERODATABOX_API_KEY set). Use the links above to verify manually, or add a key to pull the airline time automatically.
            </p>
          ) : !st.resolvable ? (
            <p style={{ fontSize: 12, color: faint }}>Flight number is incomplete (needs the airline code, e.g. VS165). Use the links above.</p>
          ) : st.error === 'rate_limited' ? (
            <p style={{ fontSize: 12, color: faint }}>Airline service is busy (rate limit). Wait a few seconds and check again, or use the links above.</p>
          ) : (
            <p style={{ fontSize: 12, color: faint }}>No airline data for this flight and date yet. Use the links above.</p>
          )}
        </div>
      )}
    </div>
  )
}
