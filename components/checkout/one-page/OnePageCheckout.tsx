'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Award, CalendarDays, Leaf, MapPin, Users } from 'lucide-react'
import { useCartStore, DAILY_HOUR_LIMIT } from '@/lib/cart'
import { tourPrice, perTravelerPrice } from '@/lib/experiences'
import { earliestBookableExperienceDate } from '@/lib/booking-window'
import { getStoredAttribution } from '@/lib/attribution'
import { trackBeginCheckout } from '@/lib/analytics'
import { planDay } from '@/lib/day-route'
import { useAvailableReward, consumeReward } from '@/lib/tour-videos'
import { CANCELLATION_SUMMARY } from '@/lib/refund-pricing'
import { useI18n } from '@/lib/i18n'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { validateTourForm, validateContact, orderKey, formatDate, type FieldErrors } from '@/lib/checkout-form'
import LegalModal from '@/components/checkout/LegalModal'
import TripTimeBar from '@/components/TripTimeBar'
import DayFlow from '@/components/DayFlow'
import DeferredPaymentPanel, { type IntentResult } from './DeferredPaymentPanel'
import { Card, SectionTitle, TextField, SelectField, Stepper, Disclosure, Reassurance, LinkButton, focusFirstError } from './fields'
import { useHydrated } from './useHydrated'
import { PICKUP_PLACES, OTHER_PLACE } from './pickup-places'

/**
 * The tour checkout, on one page.
 *
 * Top to bottom: the trip (what, how many, which day, where from), the
 * guest's details, payment with the waiver line and the pay button. The
 * card form is on the page from the start (deferred intent); the pending
 * booking and PaymentIntent are created by the same /api/checkout call the
 * two-step flow used, either quietly once the details are complete (so an
 * abandoned checkout is visible to the admin and the recovery email) or on
 * the Pay tap, whichever comes first. The server prices the cart, owns the
 * booking row and mints the intent; nothing here can move money on its own.
 *
 * Why there is no pickup-time field: the time is set from the tour's start
 * and the hotel's drive time by the operator, and asking a first-time guest
 * to invent it was the first blank field on the old page. Why there is no
 * country field: Stripe reads it from the card. Why the day builder is
 * collapsed: for a one-tour cart it sat between the guest and the form.
 */

const FONT = 'var(--font-dm-sans)'
const FIELD_ORDER = ['tripDate', 'pickup', 'firstName', 'lastName', 'email', 'phone', 'waiver']
const AUTO_SAVE_DELAY_MS = 2500

type Form = { firstName: string; lastName: string; email: string; phone: string; specialRequests: string }
const EMPTY_FORM: Form = { firstName: '', lastName: '', email: '', phone: '', specialRequests: '' }

export default function OnePageCheckout() {
  const hydrated = useHydrated(useCartStore)
  const { items, stops, pickup, setPickup, setDropoff, updateDate, updateTravelers, removeItem, subtotal, fee, grandTotal, isDayOverLimit, hoursByDate, pickupTime } = useCartStore()
  const { t, formatUsd } = useI18n()

  const [form, setForm] = useState<Form>(EMPTY_FORM)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [waiver, setWaiver] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [legal, setLegal] = useState<'waiver' | 'terms' | 'cancellation' | null>(null)
  const [limitOpen, setLimitOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [dayOpen, setDayOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [minDate, setMinDate] = useState('')
  useEffect(() => { setMinDate(earliestBookableExperienceDate(new Date())) }, [])

  // ── Gift card (checked here, spent only server-side) ──
  const [giftCodeInput, setGiftCodeInput] = useState('')
  const [giftCard, setGiftCard] = useState<{ code: string; balanceCents: number } | null>(null)
  const [giftChecking, setGiftChecking] = useState(false)
  const [giftError, setGiftError] = useState<string | null>(null)

  // ── Video reward (auto-applied when the guest has one unused) ──
  const availableReward = useAvailableReward()
  const [rewardApplied, setRewardApplied] = useState(true)
  const activeReward = rewardApplied ? availableReward : null

  // ── Money, computed exactly as the server will ──
  const baseTotal = grandTotal()
  const rewardDiscount = activeReward ? Math.round(baseTotal * (activeReward.percent / 100)) : 0
  const afterReward = Math.max(0, baseTotal - rewardDiscount)
  const giftPreviewLocal = giftCard ? Math.min(giftCard.balanceCents / 100, afterReward) : 0
  const [serverGift, setServerGift] = useState<number | null>(null)
  const [serverDue, setServerDue] = useState<number | null>(null)
  const giftPreview = serverGift ?? giftPreviewLocal
  const finalTotal = serverDue ?? Math.max(0, afterReward - giftPreview)
  const amountCents = Math.round(finalTotal * 100)

  // The cart is ONE day with ONE party. Older carts could hold mixed lines;
  // collapse stragglers onto the first line so what is shown is what is sent.
  useEffect(() => {
    if (items.length < 2) return
    const first = items[0]
    if (!items.every((i) => i.date === first.date)) items.forEach((i) => updateDate(i.id, first.date))
    if (!items.every((i) => i.travelers === first.travelers)) items.forEach((i) => updateTravelers(i.id, first.travelers))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const tripDate = items[0]?.date ?? ''
  // A cart persisted from an earlier visit can hold a date that has since
  // fallen inside the booking window. Saying so here beats letting the guest
  // fill the whole form and meet it at the pay button.
  const dateTooSoon = !!tripDate && !!minDate && tripDate < minDate
  const guests = items[0]?.travelers ?? 1

  const setField = (k: keyof Form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (errors[k]) setErrors((e) => { const n = { ...e }; delete n[k]; return n })
  }
  const setPlace = (v: string) => {
    setPickup(v); setDropoff(v)
    if (errors.pickup) setErrors((e) => { const n = { ...e }; delete n.pickup; return n })
  }
  const setDate = (v: string) => {
    items.forEach((i) => updateDate(i.id, v))
    if (errors.tripDate) setErrors((e) => { const n = { ...e }; delete n.tripDate; return n })
  }
  const setGuests = (n: number) => items.forEach((i) => updateTravelers(i.id, n))

  // ── The order, as the server will receive it ──
  const body = useMemo(() => ({
    amount: afterReward,
    items: items.map((i) => ({ id: i.id, title: i.title, destination: i.destination, travelers: i.travelers, date: i.date, price: i.price })),
    customer: {
      email: form.email.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      pickup,
      // Tours return to the pickup point. Admin, dispatch and the operator
      // alert all read the column, so it is mirrored rather than left null.
      dropoff: pickup,
      pickupTime,
      specialRequests: [
        form.specialRequests.trim(),
        stops.length > 0
          ? `Requested free food stops: ${planDay({ items, stops }).nodes.flatMap((n, i, all) =>
              n.kind === 'stop'
                ? [`${n.stop.name} (${n.stop.town}) after ${[...all.slice(0, i)].reverse().find((p) => p.kind === 'experience')?.title ?? 'your tour'}`]
                : []
            ).join('; ')}`
          : '',
      ].filter(Boolean).join('\n'),
    },
    breakdown: { subtotal: subtotal(), fee: fee(), rewardDiscount },
    applyReward: rewardApplied,
    giftCode: giftCard?.code,
    // The waiver is required client-side today and by the server once the
    // waiver migration ships; sending it now keeps both versions happy.
    waiverAccepted: waiver,
  }), [afterReward, items, form, pickup, pickupTime, stops, subtotal, fee, rewardDiscount, rewardApplied, giftCard, waiver])

  // Any change to what is bought invalidates the server's last answer.
  /**
   * The quiet save omits `waiverAccepted` rather than sending it as false.
   * The server enforces the tick only when the field is PRESENT, so omitting
   * it lets the pending row exist before the guest has ticked anything, and
   * the Pay request (which does carry `waiverAccepted: true`) reuses that
   * same row by cart hash and stamps the acceptance on it. The hash covers
   * items, total, email and gift code, never the waiver, so this is one row.
   */
  const quietBody = useMemo(() => {
    const rest: Record<string, unknown> = { ...body }
    delete rest.waiverAccepted
    return rest
  }, [body])

  const intentRef = useRef<{ key: string; result: { clientSecret: string; bookingId: string; amountDue: number } } | null>(null)
  // A request already on the wire for this exact order. Without it, the quiet
  // save and a Pay tap a moment later both POST: the server would hand the
  // second one the same booking row but re-run the gift claim and rewrite the
  // line items underneath the first.
  const inflightRef = useRef<{ key: string; promise: Promise<IntentResult> } | null>(null)
  const pricingKey = orderKey({ items: body.items, amount: body.amount, gift: body.giftCode ?? '', reward: body.applyReward })
  useEffect(() => { setServerGift(null); setServerDue(null); setServerError(null) }, [pricingKey])

  const runIntent = useCallback(async (payload: Record<string, unknown>, key: string): Promise<IntentResult> => {
    let data: Record<string, unknown>
    try {
      const res = await fetch('/api/checkout', {
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
    if (data.alreadyPaid) return { navigate: `/checkout/confirm?booking_id=${data.bookingId}` }
    if (data.fullyCoveredByGift) {
      if (typeof data.giftAmount === 'number') setServerGift(data.giftAmount)
      return { navigate: `/checkout/confirm?booking_id=${data.bookingId}` }
    }
    if (typeof data.clientSecret !== 'string') return { error: 'Could not set up payment. Please try again.' }
    if (typeof data.giftAmount === 'number') setServerGift(data.giftAmount)
    if (typeof data.amountDue === 'number') {
      // The page showed a gift card covering everything, and it no longer
      // does. Say so before the card form appears under them.
      if (amountCents < 50 && data.amountDue > 0) setServerError('Your gift card no longer covers the whole amount. The card form below is ready for the rest.')
      setServerDue(data.amountDue)
    }
    const result = {
      clientSecret: data.clientSecret,
      bookingId: String(data.bookingId ?? ''),
      amountDue: typeof data.amountDue === 'number' ? data.amountDue : finalTotal,
    }
    intentRef.current = { key, result }
    // Counted once the server has priced the cart and an intent exists,
    // keyed on the booking id so a retry cannot count twice.
    trackBeginCheckout({
      key: result.bookingId,
      value: result.amountDue,
      currency: 'USD',
      items: items.map((i) => ({ id: String(i.id), name: i.title, category: 'tour', price: tourPrice(i.pricing, i.travelers), quantity: 1 })),
    })
    return result
  }, [items, finalTotal, amountCents])

  /**
   * One request per distinct order, shared by whoever asks first. The key
   * includes the waiver, so the tick invalidates an intent created by the
   * quiet save and the Pay request reaches the server carrying it.
   */
  const send = useCallback((payload: Record<string, unknown>): Promise<IntentResult> => {
    const key = orderKey(payload)
    const cached = intentRef.current
    if (cached && cached.key === key) return Promise.resolve(cached.result)
    const live = inflightRef.current
    if (live && live.key === key) return live.promise
    const promise = runIntent(payload, key).finally(() => {
      if (inflightRef.current?.key === key) inflightRef.current = null
    })
    inflightRef.current = { key, promise }
    return promise
  }, [runIntent])

  const createIntent = useCallback(() => send(body), [send, body])

  // ── Save quietly, once, so an abandoned checkout is visible and can be
  //    recovered. Deliberately narrow:
  //
  //    · ONCE per page load, not once per edit. Every distinct order is a
  //      distinct cart hash on the server, so re-firing on each change left a
  //      trail of pending rows and live PaymentIntents behind one guest, each
  //      of which the recovery cron would email about.
  //    · NEVER while a gift card is applied. A gift card is spent server-side:
  //      if it covers the whole total, /api/checkout marks the booking paid,
  //      debits the card and emails the operator. That must follow a tap on
  //      the button, never a pause after typing a phone number.
  //    · NEVER navigates. This request is unattended; moving the guest off a
  //      page they are still reading is not ours to do. ──
  const detailsComplete = hydrated && items.length > 0 && !!pickup && !!tripDate && (!minDate || tripDate >= minDate) && Object.keys(validateContact(form)).length === 0
  const autoSaved = useRef(false)
  useEffect(() => {
    if (!detailsComplete || autoSaved.current || giftCard) return
    const timer = window.setTimeout(() => {
      if (autoSaved.current) return
      autoSaved.current = true
      void send(quietBody).then((res) => {
        // A server refusal worth seeing before they reach for a card; a
        // network blip is not.
        if ('error' in res && !/reach the payment service/i.test(res.error)) setServerError(res.error)
      })
    }, AUTO_SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [detailsComplete, giftCard, send, quietBody])

  // ── The gate before any payment attempt ──
  const validate = useCallback((): boolean => {
    if (isDayOverLimit()) { setLimitOpen(true); return false }
    const errs = validateTourForm({ contact: form, pickup, tripDate, waiverAccepted: waiver })
    setErrors(errs)
    const n = Object.keys(errs).length
    if (n) {
      setAnnouncement(`${n} ${n === 1 ? 'thing needs' : 'things need'} attention before you can pay.`)
      focusFirstError(errs, FIELD_ORDER)
      return false
    }
    setAnnouncement('')
    return true
  }, [form, pickup, tripDate, waiver, isDayOverLimit])

  const onPaid = useCallback(async () => {
    if (activeReward) await consumeReward(activeReward.id).catch(() => {})
  }, [activeReward])

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

  // ── Sticky bar (mobile): shows while the payment card is off screen ──
  const payCardRef = useRef<HTMLDivElement>(null)
  const [payInView, setPayInView] = useState(true)
  useEffect(() => {
    const el = payCardRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setPayInView(entry.isIntersecting), { rootMargin: '0px 0px -56px 0px', threshold: 0.05 })
    io.observe(el)
    return () => io.disconnect()
  }, [hydrated, items.length])

  const payRef = useRef<(() => void) | null>(null)
  const registerPay = useCallback((fn: (() => void) | null) => { payRef.current = fn }, [])

  const contactName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim()
  const dateError = errors.tripDate ?? (dateTooSoon ? `Too soon. The earliest we can run this is ${formatDate(minDate)}.` : undefined)
  // What was booked, beside what it costs. A column that only repeats the
  // price reassures nobody.
  const summaryFacts = ([
    tripDate && !dateTooSoon ? { label: 'Date', value: formatDate(tripDate) } : null,
    { label: guests === 1 ? 'Guest' : 'Guests', value: String(guests) },
    pickup ? { label: 'Pickup', value: pickup } : null,
  ].filter(Boolean)) as { label: string; value: string }[]

  return (
    <div className="opc-wrap" style={{ minHeight: '100vh', paddingTop: 'var(--nav-h, 56px)', background: 'var(--bg-warm)' }}>
      <div style={{ borderBottom: '1px solid var(--border)', background: '#fff' }}>
        <div className="opc-topbar">
          <Link href="/explore" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, fontSize: 13, fontFamily: FONT, fontWeight: 500, color: 'var(--text-secondary)' }}>
            <ArrowLeft size={15} /> {t('Back')}
          </Link>
          <h1 style={{ fontFamily: FONT, fontWeight: 700, fontSize: 19, letterSpacing: '-0.01em' }}>{t('Checkout')}</h1>
          <span aria-hidden />
        </div>
      </div>

      <div role="alert" aria-live="assertive" className="visually-hidden">{announcement}</div>

      {!hydrated ? (
        <LoadingTrip />
      ) : items.length === 0 ? (
        <EmptyCart />
      ) : (
        <div className="opc-body">
          <div className="opc-form">
            {/* ── 1. Your trip ── */}
            <Card className="opc-pad">
              <SectionTitle step={1} title={t('Your trip')} sub={items.length > 1 ? `${items.length} tours, one day` : 'One day, one party. Change anything here.'} />
              <div>
                {items.map((item) => (
                  <div key={item.id} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 'var(--r-md)', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                      <Image src={item.image} alt="" fill sizes="64px" style={{ objectFit: 'cover' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, lineHeight: 1.25, color: 'var(--text-primary)' }}>{t(item.title)}</p>
                      <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)', marginTop: 3 }}>{item.destination}, {item.parish} · {item.duration}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <p className="opc-num" style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>{formatUsd(tourPrice(item.pricing, item.travelers))}</p>
                      <button type="button" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.title}`} style={{ background: 'none', border: 'none', padding: '12px 0 4px', fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)', textDecoration: 'underline', cursor: 'pointer', minHeight: 44, minWidth: 44 }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div className="opc-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Users size={18} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                    <div>
                      <span style={{ display: 'block', fontFamily: FONT, fontSize: 15, fontWeight: 600 }}>{t('Guests')}</span>
                      <span style={{ display: 'block', fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)' }}>{items.length > 1 ? 'Applies to every tour' : items[0].pricing.mode === 'group' ? `One price for up to ${items[0].pricing.tierMax}` : 'Priced per guest'}</span>
                    </div>
                  </div>
                  <Stepper value={guests} min={1} max={12} onChange={setGuests} label="Guests" />
                </div>

                <div className="opc-row" data-field="tripDate">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <CalendarDays size={18} color={dateError ? '#b00020' : 'var(--text-secondary)'} style={{ flexShrink: 0 }} />
                    <div>
                      <label htmlFor="opc-date" style={{ display: 'block', fontFamily: FONT, fontSize: 15, fontWeight: 600, color: dateError ? '#b00020' : undefined }}>{t('Trip date')}</label>
                      <span style={{ display: 'block', fontFamily: FONT, fontSize: 13, color: dateError ? '#b00020' : 'var(--text-tertiary)' }}>{dateError ?? (minDate ? `From ${formatDate(minDate)}` : 'One day, every tour on it')}</span>
                    </div>
                  </div>
                  <input id="opc-date" type="date" className="field-input" value={tripDate} min={minDate} onChange={(e) => setDate(e.target.value)}
                    aria-invalid={dateError ? true : undefined}
                    style={{ width: 168, height: 48, fontSize: 16, flexShrink: 0, background: '#fff', borderColor: dateError ? 'rgba(176,0,32,0.55)' : undefined }} />
                </div>

                <div style={{ padding: '14px 0 16px' }}>
                  <SelectField id="opc-pickup" fieldKey="pickup" label="Where we pick you up" value={pickup || ''} onChange={setPlace} error={errors.pickup}
                    hint={pickup && pickup !== OTHER_PLACE ? PICKUP_PLACES.find((p) => p.name === pickup)?.address ?? 'We bring you back to the same place.' : 'Your hotel, resort, the airport or a cruise port. We bring you back to the same place.'}>
                    <option value="">Choose your hotel, resort or airport</option>
                    <optgroup label="Airport">
                      {PICKUP_PLACES.filter((p) => p.kind === 'airport').map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </optgroup>
                    <optgroup label="Hotels and resorts">
                      {PICKUP_PLACES.filter((p) => !p.kind).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                      <option value={OTHER_PLACE}>{OTHER_PLACE}</option>
                    </optgroup>
                    <optgroup label="Cruise ports">
                      {PICKUP_PLACES.filter((p) => p.kind === 'cruise').map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </optgroup>
                  </SelectField>
                  <p style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, fontFamily: FONT, fontSize: 13, lineHeight: 1.5, color: 'var(--text-tertiary)' }}>
                    <MapPin size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>We plan your pickup time around your tour and confirm it with you before the day, once your driver is set.</span>
                  </p>
                </div>

                <Disclosure summary="Add more to your day" detail={stops.length ? `${stops.length} food stop${stops.length === 1 ? '' : 's'} added` : 'A second tour or a free food stop, in driving order'} open={dayOpen} onToggle={() => setDayOpen((o) => !o)}>
                  <div style={{ paddingTop: 4 }}>
                    <TripTimeBar compact hideHeading />
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                      <DayFlow compact />
                    </div>
                    <Link href="/explore" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, marginTop: 8, fontFamily: FONT, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                      Browse more tours →
                    </Link>
                  </div>
                </Disclosure>
              </div>
            </Card>

            {/* ── 2. Your details ── */}
            <Card className="opc-pad">
              <SectionTitle step={2} title={t('Your details')} sub="For your confirmation, and so your driver can reach you on the day." />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="opc-grid-2">
                  <TextField id="opc-first" fieldKey="firstName" label="First name" value={form.firstName} onChange={setField('firstName')} error={errors.firstName} autoComplete="given-name" placeholder="First name" />
                  <TextField id="opc-last" fieldKey="lastName" label="Last name" value={form.lastName} onChange={setField('lastName')} error={errors.lastName} autoComplete="family-name" placeholder="Last name" />
                </div>
                <TextField id="opc-email" fieldKey="email" label="Email" type="email" inputMode="email" value={form.email} onChange={setField('email')} error={errors.email} autoComplete="email" placeholder="you@email.com" hint="Your confirmation and trip details go here." />
                <TextField id="opc-phone" fieldKey="phone" label="Phone" type="tel" inputMode="tel" value={form.phone} onChange={setField('phone')} error={errors.phone} autoComplete="tel" placeholder="+1 (555) 000-0000" hint="WhatsApp works. This is how we reach you about your trip." />
              </div>
              <div style={{ marginTop: 14 }}>
                <Disclosure summary="Add a note" detail="Dietary needs, accessibility, a celebration, anything we should know" open={noteOpen} onToggle={() => setNoteOpen((o) => !o)}>
                  <label htmlFor="opc-note" className="visually-hidden">Note for your driver and host</label>
                  <textarea id="opc-note" className="field-input" rows={3} value={form.specialRequests} onChange={(e) => setField('specialRequests')(e.target.value)}
                    placeholder="Dietary restrictions, accessibility needs, anything we should know…"
                    style={{ fontSize: 16, minHeight: 96, padding: 12, background: '#fff', width: '100%', resize: 'vertical' }} />
                </Disclosure>
              </div>
            </Card>

            {/* Mobile: the summary sits between the details and payment so the
                gift card and total are reachable without leaving the flow. */}
            <div className="opc-mobile-only">
              <OrderSummary items={items} formatUsd={formatUsd} t={t} availableReward={availableReward} rewardApplied={rewardApplied} setRewardApplied={setRewardApplied} rewardDiscount={rewardDiscount}
                giftCard={giftCard} giftPreview={giftPreview} giftCodeInput={giftCodeInput} setGiftCodeInput={setGiftCodeInput} giftChecking={giftChecking} giftError={giftError} applyGiftCode={applyGiftCode}
                removeGift={() => { setGiftCard(null); setGiftCodeInput(''); setGiftError(null) }} finalTotal={finalTotal} openPolicy={() => setLegal('cancellation')} facts={summaryFacts} />
            </div>

            {/* ── 3. Payment ── */}
            <div ref={payCardRef}>
              <Card className="opc-pad opc-card-pay">
                <SectionTitle step={3} title={t('Payment')} sub={amountCents >= 50 ? `${formatUsd(finalTotal)} today. Nothing is charged until you tap Pay.` : 'Nothing to charge today.'} />
                <DeferredPaymentPanel
                  amountCents={amountCents}
                  returnUrl="/checkout/confirm"
                  payLabel={amountCents >= 50 ? `Pay ${formatUsd(finalTotal)}` : 'Complete booking'}
                  validate={validate}
                  createIntent={createIntent}
                  onPaid={onPaid}
                  registerPay={registerPay}
                  billing={{ name: contactName || undefined, email: form.email.trim() || undefined, phone: form.phone.trim() || undefined }}
                  externalError={serverError}
                  onAmountResolved={(usd) => setServerDue(usd)}
                  footer={<Reassurance lines={['Encrypted by Stripe. Card, Apple Pay or Google Pay. We never see your card number.', CANCELLATION_SUMMARY.short + '.', 'We confirm your pickup time with you before the day.']} />}
                >
                  <div data-field="waiver" style={{ marginTop: 18 }}>
                    <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', padding: '4px 0' }}>
                      <input type="checkbox" checked={waiver}
                        onChange={(e) => { setWaiver(e.target.checked); if (errors.waiver) setErrors((er) => { const n = { ...er }; delete n.waiver; return n }) }}
                        aria-invalid={errors.waiver ? true : undefined} aria-describedby={errors.waiver ? 'opc-waiver-error' : undefined}
                        style={{ width: 24, height: 24, marginTop: 0, flexShrink: 0, accentColor: 'var(--accent)' }} />
                      <span style={{ fontFamily: FONT, fontSize: 13, lineHeight: 1.55, color: errors.waiver ? '#b00020' : 'var(--text-secondary)' }}>
                        I accept the <LinkButton onClick={() => setLegal('waiver')}>Activity Waiver</LinkButton>, the <LinkButton onClick={() => setLegal('terms')}>Terms</LinkButton> and the <LinkButton onClick={() => setLegal('cancellation')}>Cancellation Policy</LinkButton>.
                      </span>
                    </label>
                    {errors.waiver && <p id="opc-waiver-error" style={{ fontFamily: FONT, fontSize: 13, color: '#b00020', marginTop: 2, paddingLeft: 34 }}>{errors.waiver}</p>}
                  </div>
                </DeferredPaymentPanel>
              </Card>
            </div>
          </div>

          <aside className="opc-rail" aria-label="Order summary">
            <OrderSummary items={items} formatUsd={formatUsd} t={t} availableReward={availableReward} rewardApplied={rewardApplied} setRewardApplied={setRewardApplied} rewardDiscount={rewardDiscount}
              giftCard={giftCard} giftPreview={giftPreview} giftCodeInput={giftCodeInput} setGiftCodeInput={setGiftCodeInput} giftChecking={giftChecking} giftError={giftError} applyGiftCode={applyGiftCode}
              removeGift={() => { setGiftCard(null); setGiftCodeInput(''); setGiftError(null) }} finalTotal={finalTotal} openPolicy={() => setLegal('cancellation')} facts={summaryFacts} />
          </aside>
        </div>
      )}

      {hydrated && items.length > 0 && (
        <div className="opc-sticky" data-visible={!payInView} aria-hidden={payInView}>
          <div>
            <span className="opc-sticky-label">{t('Total')}</span>
            <span className="opc-sticky-total opc-num">{formatUsd(finalTotal)}</span>
          </div>
          <button type="button" className="btn-primary" tabIndex={payInView ? -1 : 0}
            onClick={() => {
              if (!validate()) return
              payCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}>
            Continue to payment
          </button>
        </div>
      )}

      {legal === 'waiver' && <LegalModal kind="waiver" onClose={() => setLegal(null)} />}
      {legal === 'terms' && <LegalModal kind="terms" onClose={() => setLegal(null)} />}
      {legal === 'cancellation' && <LegalModal kind="terms" answer="cancellation" onClose={() => setLegal(null)} />}
      {limitOpen && <DailyLimitModal hoursByDate={hoursByDate()} onClose={() => setLimitOpen(false)} />}
    </div>
  )
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function LoadingTrip() {
  return (
    <div className="opc-body" aria-busy="true" aria-live="polite">
      <div className="opc-form">
        <Card style={{ padding: 18, minHeight: 220 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div className="opc-shimmer" style={{ width: 64, height: 64, borderRadius: 12 }} />
            <div style={{ flex: 1 }}>
              <div className="opc-shimmer" style={{ height: 16, width: '60%', borderRadius: 6 }} />
              <div className="opc-shimmer" style={{ height: 12, width: '40%', borderRadius: 6, marginTop: 8 }} />
            </div>
          </div>
          <div className="opc-shimmer" style={{ height: 48, borderRadius: 12, marginTop: 22 }} />
          <div className="opc-shimmer" style={{ height: 48, borderRadius: 12, marginTop: 12 }} />
          <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)', marginTop: 16 }}>Loading your trip…</p>
        </Card>
      </div>
      <aside className="opc-rail"><Card style={{ padding: 18, minHeight: 160 }}><div className="opc-shimmer" style={{ height: 16, width: '50%', borderRadius: 6 }} /></Card></aside>
    </div>
  )
}

function EmptyCart() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Leaf size={24} color="var(--text-tertiary)" />
      </div>
      <h2 style={{ fontSize: 20, fontFamily: FONT, fontWeight: 700, marginBottom: 8 }}>Nothing in your trip yet</h2>
      <p style={{ fontSize: 15, color: 'var(--text-tertiary)', fontFamily: FONT, marginBottom: 24, maxWidth: 300 }}>Pick a tour and it lands here, ready to book. 🇯🇲</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/explore" className="btn-primary" style={{ height: 46, padding: '0 28px', fontSize: 15, display: 'inline-flex', alignItems: 'center' }}>Browse tours</Link>
        <Link href="/transfers" className="btn-outline" style={{ height: 46, padding: '0 24px', fontSize: 15, display: 'inline-flex', alignItems: 'center' }}>Book an airport transfer</Link>
      </div>
    </div>
  )
}

function OrderSummary(p: {
  items: ReturnType<typeof useCartStore.getState>['items']
  formatUsd: (n: number) => string
  t: (k: string) => string
  availableReward: { percent: number; code: string } | null
  rewardApplied: boolean
  setRewardApplied: (b: boolean) => void
  rewardDiscount: number
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
  const { items, formatUsd, t } = p
  const [giftOpen, setGiftOpen] = useState(false)
  return (
    <Card>
      <div className="opc-pad-x" style={{ paddingTop: 20, paddingBottom: 4 }}>
        {/* The eyebrow IS the section heading. Styling it small and letterspaced
            is a visual choice; leaving the tour title as the only h2 would tell
            a screen reader this region is called "Horseback Riding Trail". */}
        <h2 className="opc-eyebrow" style={{ marginBottom: 10 }}>{t('Order Summary')}</h2>
        {items[0] && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
              <Image src={items[0].image} alt="" fill sizes="52px" style={{ objectFit: 'cover' }} />
            </div>
            <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
              {items.length > 1 ? `${items.length} tours in Jamaica` : t(items[0].title)}
            </p>
          </div>
        )}
        {p.facts.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '2px 0 6px', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {p.facts.map((f) => (
              <li key={f.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)' }}>
                <span>{f.label}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.value}</span>
              </li>
            ))}
          </ul>
        )}
        {/* The receipt already names the tour and lists the date, party and
            pickup above. Repeating the same line under them was the summary
            saying everything twice; line items earn their place only when
            there is more than one thing to tell apart. */}
        {items.length > 1 && items.map((item) => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', fontFamily: FONT }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t(item.title)}</p>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {/* "one price" is only true of a flat group rate inside its
                    tier. A per-person tour that happens not to divide evenly
                    (2 guests at $127.50) has no per-head figure to show, but
                    it is still not one price for the party. */}
                {(() => {
                  const per = perTravelerPrice(item.pricing, item.travelers)
                  const guests = `${item.travelers} ${item.travelers === 1 ? t('guest') : t('guests')}`
                  if (per !== null) return `${item.travelers} × ${formatUsd(per)}`
                  return item.pricing.mode === 'group' && item.travelers <= item.pricing.tierMax ? `${guests} · one price` : guests
                })()}
                {item.date ? ` · ${formatDate(item.date)}` : ''}
              </p>
            </div>
            <span className="opc-num" style={{ fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{formatUsd(tourPrice(item.pricing, item.travelers))}</span>
          </div>
        ))}
      </div>

      <div className="opc-pad-x" style={{ paddingTop: 14, paddingBottom: 18, background: 'var(--bg-warm)', borderTop: '1px solid var(--border)', borderRadius: '0 0 var(--r-xl) var(--r-xl)' }}>
        {p.availableReward && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', margin: '6px 0 4px', borderRadius: 12, border: '1px solid rgba(255,179,0,0.3)', background: 'rgba(255,179,0,0.06)' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--gold, #FFB300)', color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Award size={15} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13 }}>{p.availableReward.percent}% MAPL Tours reward</p>
              <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.availableReward.code}</p>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 13, fontWeight: 600, minHeight: 44, cursor: 'pointer' }}>
              <input type="checkbox" checked={p.rewardApplied} onChange={(e) => p.setRewardApplied(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--gold, #FFB300)' }} /> Apply
            </label>
          </div>
        )}
        {p.rewardApplied && p.availableReward && p.rewardDiscount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, fontFamily: FONT, fontWeight: 600, color: 'var(--emerald)' }}>
            <span>Reward discount</span><span>−{formatUsd(p.rewardDiscount)}</span>
          </div>
        )}

        {p.giftCard ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 13, fontFamily: FONT, fontWeight: 600, color: 'var(--emerald)' }}>
            <span>Gift card {p.giftCard.code} <button type="button" onClick={p.removeGift} style={{ marginLeft: 8, background: 'none', border: 'none', padding: 0, fontSize: 13, color: 'var(--text-tertiary)', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', minHeight: 24 }}>remove</button></span>
            <span>−{formatUsd(p.giftPreview)}</span>
          </div>
        ) : giftOpen ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={p.giftCodeInput} onChange={(e) => { p.setGiftCodeInput(e.target.value) }} placeholder="Gift card code" aria-label="Gift card code" className="field-input"
                style={{ flex: 1, minWidth: 0, height: 44, fontSize: 16, background: '#fff', textTransform: 'uppercase' }} />
              <button type="button" onClick={p.applyGiftCode} disabled={p.giftChecking || p.giftCodeInput.trim().length < 4} className="btn-outline"
                style={{ height: 44, padding: '0 16px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', opacity: p.giftChecking || p.giftCodeInput.trim().length < 4 ? 0.5 : 1 }}>
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
          <span>{t('Total')}</span><span>{formatUsd(p.finalTotal)}</span>
        </div>
        <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: 'var(--text-tertiary)', fontFamily: FONT }}>
          Private tour, all-in. {CANCELLATION_SUMMARY.short} · <LinkButton onClick={p.openPolicy}>full policy</LinkButton>
        </p>
      </div>
    </Card>
  )
}

function DailyLimitModal({ hoursByDate, onClose }: { hoursByDate: Record<string, number>; onClose: () => void }) {
  const overDays = Object.entries(hoursByDate).filter(([, hrs]) => hrs > DAILY_HOUR_LIMIT).sort((a, b) => b[1] - a[1])
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, onClose)
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label="Day is over the hour limit"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(8,8,10,0.72)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div ref={panelRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 440, background: '#fff', border: '1px solid rgba(255,179,0,0.25)', borderRadius: 'var(--r-xl)', boxShadow: '0 24px 72px rgba(0,0,0,0.25)', padding: '28px 26px 24px', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}>
        <h3 style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em', marginBottom: 8, lineHeight: 1.2 }}>Let’s build two perfect days</h3>
        <p style={{ fontFamily: FONT, fontSize: 15, lineHeight: 1.55, color: 'var(--text-secondary)', marginBottom: 20 }}>
          A day tops out at {DAILY_HOUR_LIMIT} hours so every experience lands with full energy, and one checkout books one day. Remove an experience to continue, then book the rest as a second day.
        </p>
        {overDays.length > 0 && (
          <div style={{ padding: '14px 16px', borderRadius: 'var(--r-md)', background: 'var(--bg-warm)', border: '1px solid rgba(255,179,0,0.18)', marginBottom: 22 }}>
            {overDays.map(([date, hrs]) => (
              <div key={date} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontFamily: FONT, fontSize: 13 }}>
                <span>{date === 'unset' ? 'Unassigned day' : formatDate(date)}</span>
                <span style={{ fontWeight: 700, color: 'var(--coral, #FF5A36)' }}>{hrs} / {DAILY_HOUR_LIMIT} hrs</span>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={onClose} className="btn-primary" style={{ width: '100%', height: 48, fontSize: 15, fontFamily: FONT, fontWeight: 700 }}>Adjust my trip</button>
      </div>
    </div>
  )
}
