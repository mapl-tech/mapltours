'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Car, Plane, PlaneLanding, PlaneTakeoff, Users } from 'lucide-react'
import { useTransfersCart, type TransferCartItem } from '@/lib/transfers-cart'
import { MAX_TRANSFER_PASSENGERS, ROUND_TRIP_DISCOUNT } from '@/lib/airport-transfers'
import { leadTimeCutoff } from '@/lib/booking-window'
import { getStoredAttribution } from '@/lib/attribution'
import { trackBeginCheckout } from '@/lib/analytics'
import { CANCELLATION_WINDOW_HOURS, ADMIN_CHARGE_RATE } from '@/lib/refund-pricing'
import { useI18n } from '@/lib/i18n'
import {
  validateTransferForm, orderKey, legsFor, pickupFromFlight, flightFromPickup, formatWallClock, PICKUP_LEAD_TEXT, LEG_TIME_RE, type FieldErrors,
} from '@/lib/checkout-form'
import LegalModal from '@/components/checkout/LegalModal'
import DeferredPaymentPanel, { type IntentResult } from '@/components/checkout/one-page/DeferredPaymentPanel'
import { Card, SectionTitle, TextField, Stepper, Reassurance, LinkButton, focusFirstError } from '@/components/checkout/one-page/fields'
import { useHydrated } from '@/components/checkout/one-page/useHydrated'

/**
 * The airport-transfer checkout, on one page.
 *
 * Same shape as the tour checkout: the ride (route, passengers, trip type,
 * flights), the guest's details, payment. The card form is on the page from
 * the start; the pending booking and PaymentIntent come from the same
 * /api/transfers/checkout call the two-step flow used, created quietly once
 * the details are complete or on the Pay tap.
 *
 * The departure leg asks for the time the flight home DEPARTS and derives
 * the hotel pickup from it (the standard lead in lib/booking-window), so a
 * guest never has to compute their own pickup time. The derived pickup is
 * shown, and can be adjusted, but the default is right for almost everyone.
 */

const FONT = 'var(--font-dm-sans)'
/** The cancellation promise as a sentence, from the same numbers as the policy
 *  dialog, so the line under the pay button can never say something else. */
const CANCEL_LINE = `Cancel within ${CANCELLATION_WINDOW_HOURS} hours of booking for a refund, minus a ${Math.round(ADMIN_CHARGE_RATE * 100)}% admin charge.`
const FIELD_ORDER = ['arrivalAt', 'arrivalFlight', 'departureAt', 'departureFlight', 'firstName', 'lastName', 'email', 'phone']
const AUTO_SAVE_DELAY_MS = 2500

type Form = { firstName: string; lastName: string; email: string; phone: string; specialRequests: string }
const EMPTY_FORM: Form = { firstName: '', lastName: '', email: '', phone: '', specialRequests: '' }

export default function OnePageTransfersCheckout() {
  const hydrated = useHydrated(useTransfersCart)
  const { items, updateItem, reviseItem, removeItem, subtotal, fee, grandTotal } = useTransfersCart()
  const { formatUsd } = useI18n()
  const item: TransferCartItem | undefined = items[0]

  const [form, setForm] = useState<Form>(EMPTY_FORM)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [announcement, setAnnouncement] = useState('')
  const [legal, setLegal] = useState<'terms' | 'cancellation' | null>(null)
  const [adjustPickup, setAdjustPickup] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  // Earliest bookable pickup as a datetime-local value, in JAMAICA wall
  // clock (UTC-5, no DST), computed after mount so SSR and the first client
  // render agree. The server re-checks regardless.
  const [minDateTime, setMinDateTime] = useState('')
  useEffect(() => {
    setMinDateTime(new Date(leadTimeCutoff(new Date()).getTime() - 5 * 3_600_000).toISOString().slice(0, 16))
  }, [])

  // The flight home's departure time lives here, not in the cart: the cart
  // stores the pickup (what dispatch reads). Seeded from an existing pickup
  // so a cart filled elsewhere (the transfers page, a browser agent) shows
  // the flight time it implies.
  const [flightAt, setFlightAt] = useState<string>('')
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !item) return
    seeded.current = true
    if (item.departureAt && LEG_TIME_RE.test(item.departureAt)) setFlightAt(flightFromPickup(item.departureAt))
  }, [item])

  // ── Gift card (checked here, spent only server-side) ──
  const [giftCodeInput, setGiftCodeInput] = useState('')
  const [giftCard, setGiftCard] = useState<{ code: string; balanceCents: number } | null>(null)
  const [giftChecking, setGiftChecking] = useState(false)
  const [giftError, setGiftError] = useState<string | null>(null)

  const total = grandTotal()
  const giftPreviewLocal = giftCard ? Math.min(giftCard.balanceCents / 100, total) : 0
  const [serverGift, setServerGift] = useState<number | null>(null)
  const [serverDue, setServerDue] = useState<number | null>(null)
  const giftPreview = serverGift ?? giftPreviewLocal
  const finalTotal = serverDue ?? Math.max(0, total - giftPreview)
  const amountCents = Math.round(finalTotal * 100)

  const tripType = item?.tripType ?? 'round_trip'
  const fromAirport = item?.fromAirport ?? true
  const { hasArrivalLeg, hasDepartureLeg } = legsFor(tripType, fromAirport)

  const clearError = (k: string) => { if (errors[k]) setErrors((e) => { const n = { ...e }; delete n[k]; return n }) }
  const setField = (k: keyof Form) => (v: string) => { setForm((f) => ({ ...f, [k]: v })); clearError(k) }
  const setLeg = (patch: Partial<TransferCartItem>, key: string) => { if (item) updateItem(item.id, patch); clearError(key) }
  const setFlight = (v: string) => {
    setFlightAt(v)
    setAdjustPickup(false)
    if (item) updateItem(item.id, { departureAt: v && LEG_TIME_RE.test(v) ? pickupFromFlight(v) : '' })
    clearError('departureAt')
  }

  // Only the legs this ride has are sent. A one-way that used to be a round
  // trip can still carry the other leg's fields in the cart; the server
  // refuses stray legs, and rightly.
  const legs = useMemo(() => ({
    tripType,
    fromAirport,
    arrivalAt: hasArrivalLeg ? item?.arrivalAt || undefined : undefined,
    arrivalFlight: hasArrivalLeg ? item?.arrivalFlight?.trim() || undefined : undefined,
    departureAt: hasDepartureLeg ? item?.departureAt || undefined : undefined,
    departureFlight: hasDepartureLeg ? item?.departureFlight?.trim() || undefined : undefined,
  }), [tripType, fromAirport, hasArrivalLeg, hasDepartureLeg, item?.arrivalAt, item?.arrivalFlight, item?.departureAt, item?.departureFlight])

  const body = useMemo(() => ({
    amount: total,
    items: item ? [{ destinationId: item.destinationId, passengers: item.passengers, ...legs }] : [],
    customer: {
      email: form.email.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      specialRequests: form.specialRequests.trim() || undefined,
    },
    breakdown: { subtotal: subtotal(), fee: fee() },
    giftCode: giftCard?.code,
  }), [total, item, legs, form, subtotal, fee, giftCard])

  const intentRef = useRef<{ key: string; result: { clientSecret: string; bookingId: string; amountDue: number } } | null>(null)
  // A request already on the wire for this exact order, so the quiet save and
  // a Pay tap a moment later share one POST instead of racing on the server.
  const inflightRef = useRef<{ key: string; promise: Promise<IntentResult> } | null>(null)
  const pricingKey = orderKey({ items: body.items, amount: body.amount, gift: body.giftCode ?? '' })
  useEffect(() => { setServerGift(null); setServerDue(null); setServerError(null) }, [pricingKey])

  const runIntent = useCallback(async (payload: Record<string, unknown>, key: string): Promise<IntentResult> => {
    let data: Record<string, unknown>
    try {
      const res = await fetch('/api/transfers/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, attribution: getStoredAttribution() }),
      })
      data = (await res.json()) as Record<string, unknown>
    } catch {
      return { error: 'Could not reach the payment service. Please check your connection and try again.' }
    }
    if (typeof data.error === 'string') {
      if (data.giftCode) { setGiftCard(null); setGiftError(data.error) }
      return { error: data.error }
    }
    if (data.alreadyPaid || data.fullyCoveredByGift) return { navigate: `/transfers/confirm?booking_id=${data.bookingId}` }
    if (typeof data.clientSecret !== 'string') return { error: 'Could not set up payment. Please try again.' }
    if (typeof data.giftAmount === 'number') setServerGift(data.giftAmount)
    if (typeof data.amountDue === 'number') {
      if (amountCents < 50 && data.amountDue > 0) setServerError('Your gift card no longer covers the whole amount. The card form below is ready for the rest.')
      setServerDue(data.amountDue)
    }
    const result = {
      clientSecret: data.clientSecret,
      bookingId: String(data.bookingId ?? ''),
      amountDue: typeof data.amountDue === 'number' ? data.amountDue : finalTotal,
    }
    intentRef.current = { key, result }
    if (item) {
      trackBeginCheckout({
        key: result.bookingId,
        value: result.amountDue,
        currency: 'USD',
        items: [{ id: item.destinationId, name: `Airport transfer, ${item.destinationName}`, category: item.tripType === 'round_trip' ? 'transfer round trip' : 'transfer one way', price: item.priceUsd, quantity: 1 }],
      })
    }
    return result
  }, [item, finalTotal, amountCents])

  /** One request per distinct order, shared by whoever asks first. */
  const createIntent = useCallback((): Promise<IntentResult> => {
    const key = orderKey(body)
    const cached = intentRef.current
    if (cached && cached.key === key) return Promise.resolve(cached.result)
    const live = inflightRef.current
    if (live && live.key === key) return live.promise
    const promise = runIntent(body, key).finally(() => {
      if (inflightRef.current?.key === key) inflightRef.current = null
    })
    inflightRef.current = { key, promise }
    return promise
  }, [body, runIntent])

  // ── Save quietly, once, so an abandoned checkout is visible and can be
  //    recovered. Once per page load (each distinct order is its own cart
  //    hash and would otherwise leave a trail of pending rows and live
  //    PaymentIntents), never while a gift card is applied (the server spends
  //    it, and a covered fare is marked paid outright), and never navigates:
  //    this request is unattended. ──
  const detailsComplete = hydrated && !!item && Object.keys(validateTransferForm({ contact: form, legs, minDateTime })).length === 0
  const autoSaved = useRef(false)
  useEffect(() => {
    if (!detailsComplete || autoSaved.current || giftCard) return
    const timer = window.setTimeout(() => {
      if (autoSaved.current) return
      autoSaved.current = true
      void createIntent().then((res) => {
        if ('error' in res && !/reach the payment service/.test(res.error)) setServerError(res.error)
      })
    }, AUTO_SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [detailsComplete, giftCard, createIntent])

  const validate = useCallback((): boolean => {
    const errs = validateTransferForm({ contact: form, legs, minDateTime })
    setErrors(errs)
    const n = Object.keys(errs).length
    if (n) {
      setAnnouncement(`${n} ${n === 1 ? 'thing needs' : 'things need'} attention before you can pay.`)
      focusFirstError(errs, FIELD_ORDER)
      return false
    }
    setAnnouncement('')
    return true
  }, [form, legs, minDateTime])

  async function applyGiftCode() {
    const code = giftCodeInput.trim()
    if (!code) return
    setGiftChecking(true); setGiftError(null)
    try {
      const res = await fetch('/api/gifts/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
      const data = await res.json()
      if (!data.valid) { setGiftError(data.message ?? 'That code could not be used.'); return }
      setGiftCard({ code: data.code, balanceCents: data.balanceCents })
    } catch {
      setGiftError('Could not check that code. Please try again.')
    } finally { setGiftChecking(false) }
  }

  const payCardRef = useRef<HTMLDivElement>(null)
  const [payInView, setPayInView] = useState(true)
  useEffect(() => {
    const el = payCardRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setPayInView(entry.isIntersecting), { rootMargin: '0px 0px -56px 0px', threshold: 0.05 })
    io.observe(el)
    return () => io.disconnect()
  }, [hydrated, item?.id])
  const registerPay = useCallback(() => {}, [])

  const contactName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim()
  const rt = tripType === 'round_trip'
  const routeLine = item ? (rt || fromAirport ? `Sangster (MBJ) → ${item.destinationName}` : `${item.destinationName} → Sangster (MBJ)`) : ''
  const summaryFacts = ([
    hasArrivalLeg && item?.arrivalAt && LEG_TIME_RE.test(item.arrivalAt) ? { label: 'Arrive', value: formatWallClock(item.arrivalAt) } : null,
    hasDepartureLeg && item?.departureAt && LEG_TIME_RE.test(item.departureAt) ? { label: 'Pickup', value: formatWallClock(item.departureAt) } : null,
    item ? { label: item.passengers === 1 ? 'Passenger' : 'Passengers', value: String(item.passengers) } : null,
  ].filter(Boolean)) as { label: string; value: string }[]
  const derivedPickup = item?.departureAt && LEG_TIME_RE.test(item.departureAt) ? formatWallClock(item.departureAt) : ''
  // True only while the pickup is still the one we worked out from the
  // flight. The guest can move it, and the line must stop claiming otherwise.
  const standardLead = !!flightAt && LEG_TIME_RE.test(flightAt) && !!item?.departureAt && item.departureAt === pickupFromFlight(flightAt)

  return (
    <div className="opc-wrap" style={{ minHeight: '100vh', paddingTop: 'var(--nav-h, 56px)', background: 'var(--bg-warm)' }}>
      <div style={{ borderBottom: '1px solid var(--border)', background: '#fff' }}>
        <div className="opc-topbar">
          <Link href="/transfers" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, fontSize: 13, fontFamily: FONT, fontWeight: 500, color: 'var(--text-secondary)' }}>
            <ArrowLeft size={15} /> Back
          </Link>
          <h1 style={{ fontFamily: FONT, fontWeight: 700, fontSize: 19, letterSpacing: '-0.01em' }}>Checkout</h1>
          <span aria-hidden />
        </div>
      </div>

      <div role="alert" aria-live="assertive" className="visually-hidden">{announcement}</div>

      {!hydrated ? (
        <LoadingRide />
      ) : !item ? (
        <EmptyRide />
      ) : (
        <div className="opc-body">
          <div className="opc-form">
            {/* ── 1. Your ride ── */}
            <Card className="opc-pad">
              <SectionTitle step={1} title="Your ride" sub="Change anything here before you pay." />
              <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--gold-text)', marginBottom: 6 }}>
                  {item.zoneLabel} · {item.zoneDuration}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: 19, lineHeight: 1.25, letterSpacing: '-0.01em' }}>
                    {routeLine}{rt && <span style={{ fontWeight: 500, color: 'var(--text-tertiary)' }}> and back</span>}
                  </p>
                  <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: 19, flexShrink: 0 }}>{formatUsd(item.priceUsd)}</p>
                </div>
                <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)', marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Car size={13} /> {item.passengers <= 4 ? 'Private vehicle, one price for up to 4' : 'Private vehicle, priced per person'}</span>
                  <Link href={`/transfers?to=${item.destinationId}`} aria-label="Change hotel, back to the fare page" style={{ textDecoration: 'underline', textUnderlineOffset: 2, color: 'var(--text-secondary)', minHeight: 44, padding: '0 4px', display: 'inline-flex', alignItems: 'center' }}>Change hotel</Link>
                </p>
              </div>

              <div>
                <div className="opc-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Users size={18} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                    <div>
                      <span style={{ display: 'block', fontFamily: FONT, fontSize: 15, fontWeight: 600 }}>Passengers</span>
                      <span style={{ display: 'block', fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)' }}>{item.passengers <= 4 ? 'Flat fare for 1 to 4' : 'Priced per person from 5'}</span>
                    </div>
                  </div>
                  <Stepper value={item.passengers} min={1} max={MAX_TRANSFER_PASSENGERS} onChange={(n) => reviseItem(item.id, { passengers: n })} label="Passengers" />
                </div>

                <div className="opc-row" style={{ alignItems: 'stretch', flexDirection: 'column', gap: 10 }}>
                  <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 600 }}>Trip</span>
                  <div role="group" aria-label="Trip type" style={{ display: 'flex', gap: 8 }}>
                    {([
                      { v: 'round_trip' as const, label: 'Round trip', note: `Both ways · ${Math.round(ROUND_TRIP_DISCOUNT * 100)}% off` },
                      { v: 'one_way' as const, label: 'One way', note: fromAirport ? 'Airport to hotel' : 'Hotel to airport' },
                    ]).map((o) => {
                      const active = tripType === o.v
                      return (
                        <button key={o.v} type="button" aria-pressed={active} onClick={() => reviseItem(item.id, { tripType: o.v })}
                          style={{ flex: 1, minHeight: 52, padding: '8px 12px', borderRadius: 'var(--r-md)', border: active ? '2px solid var(--accent)' : '1px solid var(--border-strong)', background: active ? 'var(--surface)' : '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: FONT }}>
                          <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{o.label}</span>
                          <span style={{ display: 'block', fontSize: 13, color: 'var(--text-tertiary)' }}>{o.note}</span>
                        </button>
                      )
                    })}
                  </div>
                  {!rt && (
                    <button type="button" onClick={() => reviseItem(item.id, { fromAirport: !fromAirport })}
                      style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: '4px 0', minHeight: 32, fontFamily: FONT, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}>
                      {fromAirport ? 'Going to the airport instead?' : 'Coming from the airport instead?'}
                    </button>
                  )}
                </div>

                {/* Flights */}
                <div style={{ padding: '16px 0 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Plane size={14} color="#fff" /></div>
                    <div>
                      <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15 }}>Your flights</p>
                      <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)' }}>We track your flights, so a delay never leaves you waiting.</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {hasArrivalLeg && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 14px 16px', borderRadius: 'var(--r-md)', background: 'var(--bg-warm)', border: '1px solid var(--border)' }}>
                        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 13, fontWeight: 700, color: 'var(--emerald)' }}><PlaneLanding size={14} /> Arriving at MBJ</p>
                        <div className="opc-grid-2">
                          <TextField id="xfer-arrival-at" fieldKey="arrivalAt" label="Flight lands" type="datetime-local" min={minDateTime} value={item.arrivalAt ?? ''} onChange={(v) => setLeg({ arrivalAt: v }, 'arrivalAt')} error={errors.arrivalAt} hint="Jamaica time, from your ticket" />
                          <TextField id="xfer-arrival-flight" fieldKey="arrivalFlight" label="Arrival flight" value={item.arrivalFlight ?? ''} onChange={(v) => setLeg({ arrivalFlight: v }, 'arrivalFlight')} error={errors.arrivalFlight} placeholder="e.g. AA1234" autoComplete="off" autoCapitalize="characters" />
                        </div>
                        <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>Your driver meets you at arrivals with a name sign, after customs and bags.</p>
                      </div>
                    )}

                    {hasDepartureLeg && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 14px 16px', borderRadius: 'var(--r-md)', background: 'var(--bg-warm)', border: '1px solid var(--border)' }}>
                        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 13, fontWeight: 700, color: 'var(--gold-text)' }}><PlaneTakeoff size={14} /> Flying home from MBJ</p>
                        <div className="opc-grid-2">
                          <TextField id="xfer-flight-at" fieldKey="departureAt" label="Flight departs" type="datetime-local" min={hasArrivalLeg && item.arrivalAt ? item.arrivalAt : minDateTime} value={flightAt} onChange={setFlight} error={errors.departureAt} hint="Jamaica time, from your ticket" />
                          <TextField id="xfer-departure-flight" fieldKey="departureFlight" label="Departure flight" value={item.departureFlight ?? ''} onChange={(v) => setLeg({ departureFlight: v }, 'departureFlight')} error={errors.departureFlight} placeholder="e.g. AA4321" autoComplete="off" autoCapitalize="characters" />
                        </div>
                        {derivedPickup ? (
                          <div style={{ fontFamily: FONT, fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Hotel pickup {derivedPickup}</span>{standardLead ? `, ${PICKUP_LEAD_TEXT} before your flight.` : ', the time you chose.'}{' '}
                            <button type="button" onClick={() => setAdjustPickup((a) => !a)}
                              aria-label={adjustPickup ? 'Done adjusting the hotel pickup time' : 'Adjust the hotel pickup time'}
                              style={{ background: 'none', border: 'none', padding: '6px 8px', margin: '0 -8px', minHeight: 32, font: 'inherit', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                              {adjustPickup ? 'Done' : 'Adjust'}
                            </button>
                            {adjustPickup && (
                              <div style={{ marginTop: 10, maxWidth: 300 }}>
                                <TextField id="xfer-departure-at" label="Pickup time at the hotel" type="datetime-local" min={hasArrivalLeg && item.arrivalAt ? item.arrivalAt : minDateTime} value={item.departureAt ?? ''} onChange={(v) => setLeg({ departureAt: v }, 'departureAt')} hint="Earlier is safer than later on departure day." />
                              </div>
                            )}
                          </div>
                        ) : (
                          <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>We set your hotel pickup {PICKUP_LEAD_TEXT} before the flight, and confirm it by email.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* ── 2. Your details ── */}
            <Card className="opc-pad">
              <SectionTitle step={2} title="Your details" sub="For your confirmation, and so your driver can reach you at the airport." />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="opc-grid-2">
                  <TextField id="xfer-first" fieldKey="firstName" label="First name" value={form.firstName} onChange={setField('firstName')} error={errors.firstName} autoComplete="given-name" placeholder="First name" />
                  <TextField id="xfer-last" fieldKey="lastName" label="Last name" value={form.lastName} onChange={setField('lastName')} error={errors.lastName} autoComplete="family-name" placeholder="Last name" />
                </div>
                <TextField id="xfer-email" fieldKey="email" label="Email" type="email" inputMode="email" value={form.email} onChange={setField('email')} error={errors.email} autoComplete="email" placeholder="you@email.com" hint="Your confirmation and driver details go here." />
                <TextField id="xfer-phone" fieldKey="phone" label="Phone" type="tel" inputMode="tel" value={form.phone} onChange={setField('phone')} error={errors.phone} autoComplete="tel" placeholder="+1 (555) 000-0000" />
              </div>
              {/* Shown, not hidden behind a disclosure. A child seat or a
                  wheelchair is the kind of thing a guest mentions only if the
                  box is in front of them, and it is far cheaper to read here
                  than to discover at the kerb. */}
              <div style={{ marginTop: 18 }}>
                <label htmlFor="xfer-note" style={{ display: 'block', fontFamily: FONT, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Anything we should know? <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>Optional</span>
                </label>
                <textarea id="xfer-note" className="field-input" rows={3} value={form.specialRequests} onChange={(e) => setField('specialRequests')(e.target.value)}
                  placeholder="A child seat, extra luggage, a stop on the way, a wheelchair to fit in"
                  style={{ fontSize: 16, minHeight: 88, padding: 12, background: '#fff', width: '100%', resize: 'vertical', borderColor: 'rgba(23,22,20,0.16)' }} />
              </div>
            </Card>

            <div className="opc-mobile-only">
              <RideSummary item={item} formatUsd={formatUsd} giftCard={giftCard} giftPreview={giftPreview} giftCodeInput={giftCodeInput} setGiftCodeInput={setGiftCodeInput} giftChecking={giftChecking} giftError={giftError} applyGiftCode={applyGiftCode}
                removeGift={() => { setGiftCard(null); setGiftCodeInput(''); setGiftError(null) }} finalTotal={finalTotal} openPolicy={() => setLegal('cancellation')} facts={summaryFacts} />
            </div>

            {/* ── 3. Payment ── */}
            <div ref={payCardRef}>
              <Card className="opc-pad opc-card-pay">
                <SectionTitle step={3} title="Payment" sub={amountCents >= 50 ? `${formatUsd(finalTotal)} today. Nothing is charged until you press the button below.` : 'Nothing to charge today.'} />
                <DeferredPaymentPanel
                  amountCents={amountCents}
                  returnUrl="/transfers/confirm"
                  payLabel={amountCents >= 50 ? `Pay ${formatUsd(finalTotal)}` : 'Complete booking'}
                  validate={validate}
                  createIntent={createIntent}
                  registerPay={registerPay}
                  billing={{ name: contactName || undefined, email: form.email.trim() || undefined, phone: form.phone.trim() || undefined }}
                  externalError={serverError}
                  onAmountResolved={(usd) => setServerDue(usd)}
                  footer={<Reassurance lines={['Stripe takes the payment. We never see your card number.', CANCEL_LINE, 'Your driver meets you at arrivals with a name sign. We send their name, vehicle and plate before pickup.']} />}
                >
                  <p style={{ marginTop: 18, fontFamily: FONT, fontSize: 13, lineHeight: 1.55, color: 'var(--text-tertiary)' }}>
                    By paying you agree to the <LinkButton onClick={() => setLegal('terms')}>Terms</LinkButton> and the <LinkButton onClick={() => setLegal('cancellation')}>Cancellation Policy</LinkButton>.
                  </p>
                </DeferredPaymentPanel>
              </Card>
            </div>
          </div>

          <aside className="opc-rail" aria-label="Order summary">
            <RideSummary item={item} formatUsd={formatUsd} giftCard={giftCard} giftPreview={giftPreview} giftCodeInput={giftCodeInput} setGiftCodeInput={setGiftCodeInput} giftChecking={giftChecking} giftError={giftError} applyGiftCode={applyGiftCode}
              removeGift={() => { setGiftCard(null); setGiftCodeInput(''); setGiftError(null) }} finalTotal={finalTotal} openPolicy={() => setLegal('cancellation')} facts={summaryFacts} />
          </aside>
        </div>
      )}

      {hydrated && item && (
        <div className="opc-sticky" data-visible={!payInView} aria-hidden={payInView}>
          <div>
            <span className="opc-sticky-label">Total</span>
            <span className="opc-sticky-total opc-num">{formatUsd(finalTotal)}</span>
          </div>
          <button type="button" className="btn-primary" tabIndex={payInView ? -1 : 0}
            onClick={() => { if (!validate()) return; payCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
            Continue to payment
          </button>
        </div>
      )}

      {legal === 'terms' && <LegalModal kind="terms" onClose={() => setLegal(null)} />}
      {legal === 'cancellation' && <LegalModal kind="terms" answer="cancellation" onClose={() => setLegal(null)} />}
      {/* removeItem stays reachable for a guest who changes their mind entirely. */}
      {hydrated && item && (
        <p style={{ textAlign: 'center', padding: '0 16px 24px', fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)' }}>
          Not this ride? <button type="button" onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', padding: '12px 4px', font: 'inherit', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Remove it</button> and start again.
        </p>
      )}
    </div>
  )
}

function LoadingRide() {
  return (
    <div className="opc-body" aria-busy="true" aria-live="polite">
      <div className="opc-form">
        <Card style={{ padding: 18, minHeight: 200 }}>
          <div className="opc-shimmer" style={{ height: 12, width: '30%', borderRadius: 6 }} />
          <div className="opc-shimmer" style={{ height: 20, width: '70%', borderRadius: 6, marginTop: 10 }} />
          <div className="opc-shimmer" style={{ height: 48, borderRadius: 12, marginTop: 22 }} />
          <div className="opc-shimmer" style={{ height: 48, borderRadius: 12, marginTop: 12 }} />
          <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)', marginTop: 16 }}>Loading your ride…</p>
        </Card>
      </div>
      <aside className="opc-rail"><Card style={{ padding: 18, minHeight: 160 }}><div className="opc-shimmer" style={{ height: 16, width: '50%', borderRadius: 6 }} /></Card></aside>
    </div>
  )
}

function EmptyRide() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Car size={24} color="var(--text-tertiary)" />
      </div>
      <h2 style={{ fontSize: 20, fontFamily: FONT, fontWeight: 700, marginBottom: 8 }}>No ride in your cart yet</h2>
      <p style={{ fontSize: 15, color: 'var(--text-tertiary)', fontFamily: FONT, marginBottom: 24, maxWidth: 320 }}>Pick your hotel on the transfers page and the fare lands here, ready to book. 🇯🇲</p>
      <Link href="/transfers" className="btn-primary" style={{ height: 46, padding: '0 28px', fontSize: 15, display: 'inline-flex', alignItems: 'center' }}>Get a fare</Link>
    </div>
  )
}

function RideSummary(p: {
  item: TransferCartItem
  formatUsd: (n: number) => string
  giftCard: { code: string; balanceCents: number } | null
  giftPreview: number
  giftCodeInput: string
  setGiftCodeInput: (v: string) => void
  giftChecking: boolean
  giftError: string | null
  applyGiftCode: () => void
  removeGift: () => void
  finalTotal: number
  openPolicy: () => void
  facts: { label: string; value: string }[]
}) {
  const { item, formatUsd } = p
  const [giftOpen, setGiftOpen] = useState(false)
  const rt = item.tripType === 'round_trip'
  return (
    <Card>
      <div className="opc-pad-x" style={{ paddingTop: 20, paddingBottom: 14 }}>
        <h2 className="opc-eyebrow" style={{ marginBottom: 10 }}>Order Summary</h2>
        <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, lineHeight: 1.3, letterSpacing: '-0.01em', marginBottom: 4 }}>
          {rt ? 'Round trip' : 'One way'}, {item.destinationName}
        </p>
        {p.facts.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {p.facts.map((f) => (
              <li key={f.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)' }}>
                <span>{f.label}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.value}</span>
              </li>
            ))}
          </ul>
        )}
        <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          Private vehicle{rt ? `, ${Math.round(ROUND_TRIP_DISCOUNT * 100)}% round-trip saving included` : ''}
        </p>
      </div>
      <div className="opc-pad-x" style={{ paddingTop: 12, paddingBottom: 18, background: 'var(--bg-warm)', borderTop: '1px solid var(--border)', borderRadius: '0 0 var(--r-xl) var(--r-xl)' }}>
        {p.giftCard ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, fontFamily: FONT, fontWeight: 600, color: 'var(--emerald)' }}>
            <span>Gift card {p.giftCard.code} <button type="button" onClick={p.removeGift} style={{ marginLeft: 8, background: 'none', border: 'none', padding: 0, fontSize: 13, color: 'var(--text-tertiary)', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', minHeight: 24 }}>remove</button></span>
            <span>−{formatUsd(p.giftPreview)}</span>
          </div>
        ) : giftOpen ? (
          <div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={p.giftCodeInput} onChange={(e) => p.setGiftCodeInput(e.target.value)} placeholder="Gift card code" aria-label="Gift card code" className="field-input" style={{ flex: 1, minWidth: 0, height: 44, fontSize: 16, background: '#fff', textTransform: 'uppercase' }} />
              <button type="button" onClick={p.applyGiftCode} disabled={p.giftChecking || p.giftCodeInput.trim().length < 4} className="btn-outline" style={{ height: 44, padding: '0 16px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', opacity: p.giftChecking || p.giftCodeInput.trim().length < 4 ? 0.5 : 1 }}>
                {p.giftChecking ? 'Checking…' : 'Apply'}
              </button>
            </div>
            {p.giftError && <p role="alert" style={{ marginTop: 6, fontSize: 13, color: '#b00020', fontFamily: FONT }}>{p.giftError}</p>}
          </div>
        ) : (
          <button type="button" onClick={() => setGiftOpen(true)} style={{ background: 'none', border: 'none', padding: '10px 0', minHeight: 44, display: 'inline-flex', alignItems: 'center', fontFamily: FONT, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>
            Have a gift card?
          </button>
        )}
        <div className="opc-num" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: FONT, fontWeight: 700, fontSize: 20, marginTop: 10, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <span>Total</span><span>{formatUsd(p.finalTotal)}</span>
        </div>
        <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: 'var(--text-tertiary)', fontFamily: FONT }}>
          All-in, nothing added at the airport. {CANCEL_LINE} <LinkButton onClick={p.openPolicy}>Read the full cancellation policy</LinkButton>
        </p>
      </div>
    </Card>
  )
}
