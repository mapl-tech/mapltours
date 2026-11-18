'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { type Bk, firstLeg, jaTime, legInstantMs } from '@/lib/dispatch'
import { driverFirstName, driverOptionLabel, vehicleInWords, VALID_EMAIL, type Driver } from '@/lib/drivers'
import { ARRIVAL_GRACE_MIN, legAt, legMonthDay, legsOf, sentDriverKey, sentKey, type Leg } from '@/lib/driver-update'
import { stamp } from '@/lib/admin-format'
import type { Note } from '@/components/admin/AdminUi'

/**
 * The dispatch console's driver-update card: tell a guest their driver for
 * one ride has changed (or who it is). Pick the ride and a saved driver
 * (/admin/drivers); the card shows the exact email the guest would get, can
 * send it as a test to any address, and sends it to the guest after a
 * confirm. Every word of the email comes from lib/driver-update.ts on the
 * server; this card only shows and sends it.
 */

const TEST_DEFAULT = 'contact@mapltours.com'

interface Props {
  booking: Bk
  dispatch: Record<string, string>
  /** null: the saved drivers could not be read (the table is not set up yet). */
  drivers: Driver[] | null
  report: (n: Note) => void
  onSent: (leg: Leg, sentAt: string, driver: Driver, columns: { driver_name: string; driver_phone: string; driver_vehicle: string; driver_plate: string }) => void
}

/** "Arrival · Wed, Nov 18, 1:09 PM": short enough for a phone's dropdown. */
function legChoiceLabel(b: Bk, leg: Leg): string {
  const at = legAt(b, leg)
  const day = at ? new Date(at).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }) : null
  return `${leg === 'arrival' ? 'Arrival' : 'To the airport'} · ${day ? `${day}, ${jaTime(at)}` : 'no time'}`
}

/** The first ride still ahead, so the card opens on the one that matters. */
function defaultLeg(b: Bk, nowMs: number): Leg | null {
  const legs = legsOf(b)
  const ahead = legs.find((leg) => {
    const at = legAt(b, leg)
    if (!at) return false
    const end = legInstantMs(at) + (leg === 'arrival' ? ARRIVAL_GRACE_MIN * 60_000 : 0)
    return end > nowMs
  })
  return ahead ?? legs[legs.length - 1] ?? null
}

export default function DriverUpdateCard({ booking: b, dispatch, drivers, report, onSent }: Props) {
  const id = useId()
  const legs = legsOf(b)
  const [leg, setLeg] = useState<Leg | null>(() => defaultLeg(b, Date.now()))
  const working = (drivers ?? []).filter((d) => d.active)
  const [driverId, setDriverId] = useState('')
  const driver = working.find((d) => d.id === driverId) ?? null
  const [preview, setPreview] = useState<{ subject: string; html: string; told: boolean; guestProblem: string | null } | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [testTo, setTestTo] = useState(TEST_DEFAULT)
  const [testBad, setTestBad] = useState(false)
  const [busy, setBusy] = useState<'test' | 'send' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const ask = useRef<HTMLParagraphElement>(null)
  const guestName = b.first_name?.trim() || 'the guest'
  const l = firstLeg(b)

  // The preview follows the choice. A late answer for an earlier choice is dropped.
  useEffect(() => {
    setPreview(null); setPreviewError(null); setConfirming(false)
    if (!leg || !driverId) return
    let live = true
    setLoadingPreview(true)
    void (async () => {
      const r = await fetch('/api/admin/driver-update', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bookingId: b.id, driverId, leg, mode: 'preview' }) }).catch(() => null)
      const j = r ? await r.json().catch(() => null) : null
      if (!live) return
      setLoadingPreview(false)
      if (!r?.ok || !j?.html) { setPreviewError(j?.error ?? 'The preview did not load. Check the connection and choose again.'); return }
      setPreview(j)
    })()
    return () => { live = false }
  }, [b.id, driverId, leg])

  // The question takes focus, not its Yes button, so a double tap on "Send" can never also answer it.
  useEffect(() => { if (confirming) ask.current?.focus() }, [confirming])

  function fitFrame() {
    const f = frame.current
    const h = f?.contentDocument?.documentElement?.scrollHeight
    if (f && h) f.style.height = `${h}px`
  }

  async function post(mode: 'test' | 'send') {
    if (!leg || !driver || busy) return
    if (mode === 'test' && !VALID_EMAIL.test(testTo.trim())) { setTestBad(true); document.getElementById(`${id}-test`)?.focus(); return }
    setBusy(mode)
    const r = await fetch('/api/admin/driver-update', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookingId: b.id, driverId: driver.id, leg, mode, ...(mode === 'test' ? { to: testTo.trim() } : {}) }),
    }).catch(() => null)
    const j = r ? await r.json().catch(() => null) : null
    setBusy(null)
    setConfirming(false)
    if (!r?.ok || !j?.ok) { report({ text: j?.error ?? 'Nothing was sent. Check the connection and try again.', bad: true }); return }
    if (mode === 'test') { report({ text: `Test sent to ${j.sentTo}. It says [Test] before the subject.` }); return }
    onSent(leg, j.sentAt, driver, j.driverColumns)
    report({ text: j.warning ? `Sent to ${guestName}. ${j.warning}` : `Sent to ${guestName}, and ${driver.name} is saved on the booking.`, bad: !!j.warning })
  }

  const sentAt = leg ? dispatch[sentKey(leg)] : undefined
  const sentWith = leg ? dispatch[sentDriverKey(leg)] : undefined
  const otherLeg: Leg | null = leg === 'arrival' && legs.includes('departure') ? 'departure' : leg === 'departure' && legs.includes('arrival') ? 'arrival' : null
  const sharedNote = driver && otherLeg && l
    ? ` The booking has one driver for both rides, so ${driver.name} will also be named for the ${otherLeg === 'departure' ? `ride back on ${legMonthDay(l.departureAt!)}` : 'arrival'}, including in its day-of email. Change it before then if someone else drives.`
    : ''

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary, #57534C)', margin: '0 0 14px', lineHeight: 1.5 }}>
        When the driver for a ride changes, send this. It saves the driver on the booking and emails {guestName} the new
        name, vehicle, plate and WhatsApp number. Every detail comes from the booking and the{' '}
        <Link href="/admin/drivers" className="adm-inline-link">Drivers page</Link>.
      </p>

      {drivers === null && <p className="adm-note adm-note--warn">The saved drivers could not be read, so this cannot send yet. If the Drivers page is new, its database table may not be set up.</p>}
      {drivers !== null && working.length === 0 && <p className="adm-note adm-note--warn">No drivers saved yet. Add them on the <Link href="/admin/drivers" className="adm-inline-link">Drivers page</Link>, then come back.</p>}
      {legs.length === 0 && <p className="adm-note adm-note--warn">This booking has no ride time on it, so there is nothing to tell the guest.</p>}

      {drivers !== null && working.length > 0 && legs.length > 0 && (
        <>
          <div className="adm-cp-grid">
            <div className="adm-cp-field">
              <label className="adm-label" htmlFor={`${id}-leg`}>Which ride</label>
              {legs.length > 1 ? (
                <select id={`${id}-leg`} className="adm-input" value={leg ?? ''} onChange={(e) => setLeg(e.target.value as Leg)}>
                  {legs.map((x) => <option key={x} value={x}>{legChoiceLabel(b, x)}</option>)}
                </select>
              ) : (
                <p id={`${id}-leg`} className="adm-meta" style={{ marginTop: 0, minHeight: 44, display: 'flex', alignItems: 'center' }}>{legChoiceLabel(b, legs[0])}</p>
              )}
            </div>
            <div className="adm-cp-field">
              <label className="adm-label" htmlFor={`${id}-driver`}>Driver</label>
              <select id={`${id}-driver`} className="adm-input" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                <option value="">Choose a driver</option>
                {working.map((d) => <option key={d.id} value={d.id}>{driverOptionLabel(d)}</option>)}
              </select>
              {driver && <p className="adm-help" style={{ marginTop: 4 }}>{driver.name}, {vehicleInWords(driver)}, plate {driver.plate}, WhatsApp {driver.whatsapp}</p>}
            </div>
          </div>

          {sentAt && <p className="adm-meta" style={{ marginTop: 10 }}>A driver update for this ride went to {guestName} on {stamp(sentAt)}{sentWith ? `, naming ${sentWith}` : ''}.</p>}

          {loadingPreview && <p className="adm-meta" role="status" style={{ marginTop: 14 }}>Writing the email…</p>}
          {previewError && <p role="alert" className="adm-error" style={{ marginTop: 14 }}>{previewError}</p>}

          {preview && driver && (
            <div style={{ marginTop: 16 }}>
              <p className="adm-help adm-help--soft" style={{ marginTop: 0 }}>
                {preview.told
                  ? `${guestName} was already given a driver for this ride, so the email says ${driverFirstName(driver)} replaces them.`
                  : `${guestName} has not been sent a driver for this ride yet, so the email introduces ${driverFirstName(driver)} without mentioning a change.`}
              </p>
              <p className="adm-label" style={{ margin: '12px 0 6px' }}>Subject</p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>{preview.subject}</p>

              {/* The email, and beside it from 1024px (below it on a phone) what to do with it. */}
              <div className="adm-du">
                <div>
                  <p className="adm-label" style={{ margin: '0 0 6px' }}>The email</p>
                  <iframe
                    ref={frame} title={`Email preview: ${preview.subject}`} srcDoc={preview.html} sandbox="allow-same-origin"
                    onLoad={fitFrame} className="adm-mail-frame"
                  />
                </div>
                <div className="adm-du-side">
                  <label className="adm-label" htmlFor={`${id}-test`}>Send a test to</label>
                  <input
                    id={`${id}-test`} className="adm-input" type="email" inputMode="email" autoComplete="email" value={testTo}
                    aria-invalid={testBad || undefined} aria-describedby={`${id}-test-h`}
                    onChange={(e) => { setTestTo(e.target.value); setTestBad(false) }}
                  />
                  <p id={`${id}-test-h`} className={testBad ? 'adm-error' : 'adm-help'} style={{ marginTop: 4 }}>
                    {testBad ? 'Type a full email address.' : `The same email with ${guestName}'s real trip, "[Test]" before the subject. Nobody else is copied.`}
                  </p>
                  <div className="adm-actions" style={{ marginTop: 10 }}>
                    <button type="button" className="adm-btn" onClick={() => void post('test')} aria-disabled={!!busy || undefined} aria-busy={busy === 'test' || undefined}>
                      {busy === 'test' ? 'Sending test…' : 'Send test'}
                    </button>
                  </div>

                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--adm-hairline, #EEE8DE)' }}>
                    {preview.guestProblem ? (
                      <p className="adm-note adm-note--warn" style={{ margin: 0 }}>Cannot send to {guestName}: {preview.guestProblem}</p>
                    ) : !confirming ? (
                      <div className="adm-actions">
                        <button type="button" className="adm-btn adm-btn--primary" onClick={() => setConfirming(true)}>Send to {guestName}</button>
                      </div>
                    ) : (
                      <div className="adm-panel" role="group" aria-labelledby={`${id}-ask`}>
                        <p id={`${id}-ask`} ref={ask} tabIndex={-1} style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                          <strong>Send this to {guestName} at {b.email} now?</strong> {driver.name} will be saved on the booking.
                          Operations and the driver inbox get a blind copy{driver.email ? `, and so does ${driver.email}` : ''}.{sharedNote}
                        </p>
                        <div className="adm-actions" style={{ marginTop: 12 }}>
                          <button type="button" className="adm-btn adm-btn--primary" onClick={() => void post('send')} aria-disabled={!!busy || undefined} aria-busy={busy === 'send' || undefined}>
                            {busy === 'send' ? 'Sending…' : 'Yes, send it'}
                          </button>
                          <button type="button" className="adm-btn" onClick={() => setConfirming(false)}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
