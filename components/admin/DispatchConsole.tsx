'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  type Bk, firstLeg, bookingRef, moneyBlock, money, round2,
  jaDate, jaTime, shiftIso, gcalLink, waLink, ARRIVAL_CLEAR_MIN, MIN_PICKUP_LEAD_MIN,
  visibleSteps, progress, autoStepDone,
  msgDriverRequest, msgCustomerConfirmation, msgFlightDetailsRequest, msgDriverReminder,
  msgFlightLanded, msgCustomerFollowup, msgReviewRequest,
} from '@/lib/dispatch'
import { flightLinks, flightDate, type FlightStatus } from '@/lib/flight'
import Arrow from '@/components/ui/Arrow'
import { stamp } from '@/lib/admin-format'
import { useResultNote } from '@/components/admin/AdminUi'

const dm = 'var(--font-dm-sans)'
const ink = 'var(--text-primary, #171614)'
const soft = 'var(--text-secondary, #57534C)'
const faint = '#6E6A62'
const green = '#1D7A50'
const amber = '#7A5A08'
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
          <h2 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: faint }}>{title}</h2>
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

/** A pill button (the shared .adm-btn: 44px, focus ring) that either opens a URL in a new tab or runs onClick. */
function Btn({ href, onClick, children, tone = 'outline', busy }: { href?: string; onClick?: () => void; children: React.ReactNode; tone?: 'outline' | 'wa' | 'solid'; busy?: boolean }) {
  const cls = `adm-btn adm-btn--sm adm-dsp-btn${tone === 'wa' ? ' adm-btn--wa' : tone === 'solid' ? ' adm-btn--primary' : ''}`
  if (href) return <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a>
  return <button type="button" onClick={onClick} className={cls} aria-busy={busy || undefined}>{children}</button>
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
  // Results of saves, in the shared toast at the foot of the page.
  const { setNote, keepClear, toast } = useResultNote()
  // A driver payout tick waiting for its confirmation (it emails the driver).
  const [askPay, setAskPay] = useState<string | null>(null)
  const focusNext = useRef<string | null>(null)
  useEffect(() => {
    if (!focusNext.current) return
    const el = document.getElementById(focusNext.current)
    focusNext.current = null
    el?.focus()
  })

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

  // A tick shows at once, and is taken back (and the failure said) if the
  // server does not confirm it: an unsaved step must never look done,
  // least of all a driver payout.
  async function toggle(step: string, done: boolean, label: string) {
    const was = dispatch[step]
    setDispatch((d) => { const n = { ...d }; if (done) n[step] = new Date().toISOString(); else delete n[step]; return n })
    const r = await fetch('/api/admin/dispatch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bookingId: b.id, step, done }) }).catch(() => null)
    const j = r && r.ok ? await r.json().catch(() => null) : null
    if (!j || !j.ok) {
      setDispatch((d) => { const n = { ...d }; if (was) n[step] = was; else delete n[step]; return n })
      setNote({ text: `"${label}" did not save, so it is shown as it was. Check the connection and try again.`, bad: true })
      return
    }
    if (done && (step === 'paid_first' || step === 'paid_second') && j.driverEmailed !== null && j.driverEmailed !== undefined) {
      setPayNote((n) => ({ ...n, [step]: j.driverEmailed ? 'sent' : 'failed' }))
    }
    setNote({ text: done ? `"${label}" marked done.` : `"${label}" marked not done.`, quiet: true })
  }
  async function saveDriver() {
    if (savingDriver) return
    setSavingDriver(true)
    const r = await fetch('/api/admin/dispatch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bookingId: b.id, driver }) }).catch(() => null)
    const j = r && r.ok ? await r.json().catch(() => null) : null
    setSavingDriver(false)
    setNote(j && j.ok ? { text: 'Driver details saved.' } : { text: 'Driver details did not save. Check the connection and try again.', bad: true })
  }
  // What a payout tick sends, said before it is sent (the server emails the driver once per half).
  function payAmount(step: string): number {
    return step === 'paid_second' ? round2(m.driverTotal - m.driverPerLeg) : m.driverPerLeg
  }

  // A hotel-to-airport one-way has a departure and no arrival. The departure
  // was gated on round trip and the arrival was not gated at all, so the
  // operator saw an empty "Arrival" and no pickup time. A one-way WITH an
  // arrival keeps what it always showed.
  const departureOnly = !leg.arrivalAt && !!leg.departureAt
  // The departure leg is a round trip's return, or the ride's only leg.
  const hasDepartureLeg = m.isRoundTrip || departureOnly

  // Calendar links
  const arrivalCal = leg.arrivalAt ? gcalLink({
    title: `MAPL Tours Jamaica pickup: ${name} (${ref})`,
    startIso: leg.arrivalAt, durationMin: 60,
    location: `${AIRPORT}, Montego Bay`,
    details: `Drop-off: ${leg.hotel}. Passengers: ${leg.passengers}. Customer: ${b.phone ?? ''}. Driver pay: ${money(m.driverPerLeg)}${m.isRoundTrip ? ' (leg 1 of 2)' : ''}.`,
  }) : null
  const departureCal = leg.departureAt && hasDepartureLeg ? gcalLink({
    title: `MAPL Tours Jamaica departure pickup: ${name} (${ref})`,
    startIso: leg.departureAt, durationMin: 90,
    location: leg.hotel,
    details: `Drop at ${AIRPORT}. Hotel pickup ${jaTime(leg.departureAt)} Jamaica time (time requested by the guest)${leg.departureFlight ? `, flight ${leg.departureFlight}` : ''}. Driver pay: ${money(m.driverPerLeg)}${m.isRoundTrip ? ' (leg 2 of 2)' : ''}.`,
  }) : null

  return (
    <div style={{ fontFamily: dm, color: ink }} onFocus={keepClear}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <h1 style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-0.025em', margin: 0 }}>Dispatch</h1>
          <span style={{ fontSize: 14, fontWeight: 700, ...tnum }}>{ref}</span>
          <span style={{ fontSize: 13, color: soft }}>{name} · {leg.tripType === 'round_trip' ? 'Round trip' : 'One-way'} · {leg.passengers} pax</span>
        </div>
        <Link href={`/admin/bookings?booking=${b.id}`} className="adm-btn adm-btn--sm">
          <Arrow dir="left" place="before" className="ui-arrow--flush" />Bookings
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
          {m.couponDiscount > 0 && <MRow k={`Code ${m.couponCode ?? ''} (from MAPL's margin)`} v={`- ${money(m.couponDiscount)}`} em />}
          <MRow k="Customer paid" v={`${money(m.customerPaid)} USD`} big />

          <div style={{ ...subLabel, marginTop: 16 }}>Where it goes</div>
          <MRow k={m.isRoundTrip ? `Driver payout (${money(m.driverPerLeg)} x2)` : 'Driver payout'} v={`- ${money(m.driverTotal)}`} />
          <MRow k="Stripe fee (USD)" v={m.stripeFee != null ? `- ${money(m.stripeFee)}` : 'pending'} />
          <MRow k="MAPL Tours Jamaica keeps" v={m.maplKeeps != null ? money(m.maplKeeps) : 'n/a'} em big />
        </Card>

        {/* Trip */}
        <Card title="Trip (Jamaica time)">
          {!departureOnly && (
            <>
              <p style={{ ...tnum, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: faint, margin: '0 0 6px' }}>Arrival</p>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{AIRPORT}<Arrow place="between" />{leg.hotel}</div>
              <div style={{ fontSize: 13, color: soft, marginTop: 2, ...tnum }}>{jaDate(leg.arrivalAt)}</div>
              <div style={{ fontSize: 13, color: soft, ...tnum }}>Flight lands {jaTime(leg.arrivalAt)}{leg.arrivalFlight ? ` (flight ${leg.arrivalFlight})` : ' (flight TBD)'}</div>
              <div style={{ fontSize: 12, color: faint, marginTop: 2, ...tnum }}>Customer usually clears customs ~{ARRIVAL_CLEAR_MIN} min after landing ({jaTime(leg.arrivalAt ? shiftIso(leg.arrivalAt, ARRIVAL_CLEAR_MIN) : null)}).</div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {arrivalCal && <Btn href={arrivalCal}>📅 Add arrival to Google Calendar</Btn>}
                <DayOfBtn bookingId={b.id} leg="arrival" sentAt={dispatch.dayof_arrival_sent} />
              </div>
            </>
          )}

          {leg.departureAt && hasDepartureLeg && (
            <>
              <p style={{ ...tnum, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: faint, margin: departureOnly ? '0 0 6px' : '16px 0 6px' }}>Departure</p>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{leg.hotel}<Arrow place="between" />{AIRPORT}</div>
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
            {!departureOnly && (
              <FlightTracking legLabel="Arrival flight" flightRaw={leg.arrivalFlight} dateIso={leg.arrivalAt} bookedLabel={jaTime(leg.arrivalAt)} mbjRole="arrival" />
            )}
            {hasDepartureLeg && (
              <FlightTracking legLabel="Departure flight" flightRaw={leg.departureFlight} dateIso={leg.departureAt} bookedLabel={jaTime(leg.departureAt)} mbjRole="departure" />
            )}
          </div>
        </Card>
      </div>

      {/* Driver details */}
      <div style={{ marginTop: 14 }}>
        <Card title="Driver + vehicle">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            {([['name', 'Driver name', 'name'], ['phone', 'Driver WhatsApp', 'tel'], ['vehicle', 'Vehicle make + model + colour', 'off'], ['plate', 'License plate', 'off']] as const).map(([k, lbl, ac]) => (
              <label key={k} className="adm-dsp-field">
                <span className="adm-label">{lbl}</span>
                <input
                  className="adm-input"
                  value={driver[k]}
                  inputMode={k === 'phone' ? 'tel' : undefined}
                  autoComplete={ac}
                  onChange={(e) => setDriver((d) => ({ ...d, [k]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Btn tone="solid" onClick={saveDriver} busy={savingDriver}>{savingDriver ? 'Saving…' : 'Save driver details'}</Btn>
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
              const isPay = s.key === 'paid_first' || s.key === 'paid_second'
              const notified = !!dispatch[`${s.key}_notified`]
              return (
                <div key={s.key} style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: idx === 0 ? undefined : borderSoft }}>
                  {/* A 44px button around the 26px box. A driver payout asks first (it emails the driver). */}
                  <button
                    type="button"
                    id={`tick-${s.key}`}
                    className="adm-dsp-tick"
                    onClick={auto ? undefined : () => {
                      if (isPay && !doneAt) { focusNext.current = `ask-${s.key}-h`; setAskPay(s.key); return }
                      void toggle(s.key, !doneAt, s.title)
                    }}
                    aria-disabled={!!auto || undefined}
                    aria-pressed={isDone}
                    aria-label={auto ? `Step ${s.num} completed automatically: ${auto}` : `Mark step ${s.num} ${doneAt ? 'not done' : 'done'}: ${s.title}`}
                  ><span className="adm-dsp-box" aria-hidden="true">{isDone ? '✓' : ''}</span></button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: faint, ...tnum }}>{String(s.num).padStart(2, '0')}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: isDone ? faint : ink, textDecoration: doneAt ? 'line-through' : undefined }}>{s.title}</span>
                      {doneAt && <span style={{ fontSize: 13, color: green, ...tnum }}>✓ {stamp(doneAt)}</span>}
                      {auto && <span style={{ fontSize: 12, color: green }}>✓ auto · {auto}</span>}
                      {payNote[s.key] === 'sent' && <span style={{ fontSize: 12, color: green }}>✉️ driver emailed</span>}
                      {payNote[s.key] === 'failed' && <span style={{ fontSize: 12, color: '#8A2A0A', fontWeight: 600 }}>payment saved, but the driver email did not send</span>}
                    </div>
                    {s.hint && !isDone && <div style={{ fontSize: 13, color: faint, marginTop: 3 }}>{s.hint}</div>}
                    {askPay === s.key && (
                      <section className="adm-ask adm-dsp-ask" aria-labelledby={`ask-${s.key}-h`}
                        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); focusNext.current = `tick-${s.key}`; setAskPay(null) } }}>
                        <h3 id={`ask-${s.key}-h`} tabIndex={-1} className="adm-h4 adm-h4--ask">Mark the {money(payAmount(s.key))} payout as paid?</h3>
                        <p className="adm-block">
                          {notified
                            ? 'Do this once the money is on its way. The driver was already emailed about this payment, so no new email goes out.'
                            : driverEmailConfigured
                              ? `Do this once the money is on its way: ${b.driver_name?.trim() || 'the driver'} is emailed that ${money(payAmount(s.key))} was sent.`
                              : 'Do this once the money is on its way. No driver email is set up, so nobody is emailed.'}
                        </p>
                        <div className="adm-actions">
                          <button type="button" className="adm-btn adm-btn--ok" onClick={() => { focusNext.current = `tick-${s.key}`; setAskPay(null); void toggle(s.key, true, s.title) }}>Yes, it is paid</button>
                          <button type="button" className="adm-btn" onClick={() => { focusNext.current = `tick-${s.key}`; setAskPay(null) }}>Back</button>
                        </div>
                      </section>
                    )}
                    <StepActions stepKey={s.key} b={b} m={m} arrivalCal={arrivalCal} departureCal={departureCal} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <p style={{ fontSize: 12, color: faint, marginTop: 16, lineHeight: 1.5, maxWidth: 720 }}>
        All amounts are in USD, the currency the customer was charged. Your Stripe account settles in CAD, so the Stripe fee (processing plus currency conversion) is converted back to USD here at the transaction rate. Trip times are Jamaica time exactly as the customer entered them; calendar events use the America/Jamaica timezone; ticked steps show when, on your own clock. Checkout suggests a departure pickup {Math.floor(MIN_PICKUP_LEAD_MIN / 60)} h {MIN_PICKUP_LEAD_MIN % 60} min before the flight; adjust for zone and traffic.
      </p>
      {toast}
    </div>
  )
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
      // A hotel-to-airport one-way has no arrival to remind the driver about.
      const l = firstLeg(b)
      const msg = msgDriverReminder(b, l && !l.arrivalAt && l.departureAt ? 'departure' : 'arrival')
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
        {links && <Btn tone="solid" onClick={check} busy={loading}>{loading ? 'Checking…' : 'Check live status'}</Btn>}
      </div>
      {/* Always present, so the answer to Check live status is read out when it arrives. */}
      <div role="status">
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
    </div>
  )
}
