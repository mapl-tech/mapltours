'use client'

import { useState, useEffect, useRef } from 'react'
import { useFocusTrap } from '@/lib/use-focus-trap'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Check, MapPin, Users, Calendar, Clock, Leaf, Lock, ShieldCheck, CalendarDays, ChevronDown } from 'lucide-react'
import { earliestBookableExperienceDate } from '@/lib/booking-window'
import { useCartStore, DAILY_HOUR_LIMIT, type CartItem } from '@/lib/cart'
import { tourPrice, perTravelerPrice, maxGroupSize } from '@/lib/experiences'
import { getStoredAttribution } from '@/lib/attribution'
import TripTimeBar from '@/components/TripTimeBar'
import { CANCELLATION_SUMMARY } from '@/lib/refund-pricing'
import LegalModal from './LegalModal'
import DayFlow from '@/components/DayFlow'
import { planDay } from '@/lib/day-route'
import { useAvailableReward, consumeReward } from '@/lib/tour-videos'
import { Award } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

// Stripe SDK is ~80 KB gz, only load it when the user actually reaches
// step 3 by dynamic-importing the panel (which in turn pulls Stripe in).
const StripePaymentPanel = dynamic(
  () => import('./StripePaymentPanel'),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: '60px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
          Setting up secure payment...
        </p>
      </div>
    ),
  }
)

/* ── Jamaica Locations with Addresses ── */
type LocationKind = 'airport' | 'cruise' | 'hotel'

/**
 * Grouped so a guest scanning a long list finds their resort quickly. The
 * airport comes first because that is the single most common pickup, and the
 * cruise ports are kept separate from hotels because they behave differently
 * on the day (a ship sailing time is a hard deadline, a hotel is not).
 *
 * Sangster (MBJ) is the ONLY airport offered. Norman Manley (KIN) is on the
 * far side of the island — roughly three hours from the north-coast resorts
 * these tours run from — and listing it invited bookings we do not serve.
 */
const jamaicaLocations: { name: string; address: string; kind?: LocationKind }[] = [
  { name: 'Sandals Negril Beach Resort', address: 'Norman Manley Blvd, Negril, Westmoreland' },
  { name: 'Sandals Royal Caribbean, Montego Bay', address: 'Mahoe Bay, Montego Bay, St. James' },
  { name: 'Sandals Ochi Beach Resort, Ocho Rios', address: 'Main St, Ocho Rios, St. Ann' },
  { name: 'Riu Negril', address: 'Norman Manley Blvd, Negril, Westmoreland' },
  { name: 'Riu Montego Bay', address: 'Mahoe Bay, Ironshore, Montego Bay, St. James' },
  { name: 'Hyatt Ziva Rose Hall, Montego Bay', address: 'Rose Hall Rd, Montego Bay, St. James' },
  { name: 'Hilton Rose Hall Resort, Montego Bay', address: 'Rose Hall, Montego Bay, St. James' },
  { name: 'Grand Palladium Jamaica, Lucea', address: 'Point, Lucea, Hanover' },
  { name: 'Royalton Blue Waters, Montego Bay', address: 'Seawind Dr, Montego Bay, St. James' },
  { name: 'Royalton Negril', address: 'Norman Manley Blvd, Negril, Westmoreland' },
  { name: 'Secrets Wild Orchid, Montego Bay', address: 'Freeport Peninsula, Montego Bay, St. James' },
  { name: 'Secrets St. James, Montego Bay', address: 'Freeport Peninsula, Montego Bay, St. James' },
  { name: 'Breathless Montego Bay', address: 'Freeport Peninsula, Montego Bay, St. James' },
  { name: 'Moon Palace Jamaica, Ocho Rios', address: 'Main St, Ocho Rios, St. Ann' },
  { name: 'Jamaica Inn, Ocho Rios', address: 'Main St, Ocho Rios, St. Ann' },
  { name: 'Strawberry Hill, Blue Mountains', address: 'Irish Town, St. Andrew' },
  { name: 'GoldenEye, Oracabessa', address: 'Oracabessa Bay, St. Mary' },
  { name: 'Round Hill Hotel, Montego Bay', address: 'John Pringle Dr, Hopewell, Hanover' },
  { name: 'Rockhouse Hotel, Negril', address: 'West End Rd, Negril, Westmoreland' },
  { name: 'The Cliff Hotel, Negril', address: 'West End Rd, Negril, Westmoreland' },
  { name: 'Geejam Hotel, Port Antonio', address: 'San San, Port Antonio, Portland' },
  { name: 'Trident Hotel, Port Antonio', address: 'Anchovy, Port Antonio, Portland' },
  { name: 'Jakes Hotel, Treasure Beach', address: 'Calabash Bay, Treasure Beach, St. Elizabeth' },
  { name: 'Spanish Court Hotel, Kingston', address: '1 St Lucia Ave, Kingston 5' },
  { name: 'Terra Nova All Suite Hotel, Kingston', address: '17 Waterloo Rd, Kingston 10' },
  { name: 'Courtleigh Hotel, Kingston', address: '85 Knutsford Blvd, Kingston 5' },
  { kind: 'airport', name: 'Sangster International Airport (MBJ)', address: 'Sunset Dr, Montego Bay, St. James' },
  { kind: 'cruise', name: 'Kingston Cruise Terminal', address: 'Port Royal St, Kingston' },
  { kind: 'cruise', name: 'Falmouth Cruise Port', address: 'Falmouth, Trelawny' },
  { kind: 'cruise', name: 'Ocho Rios Cruise Port', address: 'Turtle Beach Rd, Ocho Rios, St. Ann' },
]

/* ── Step Indicator ── */
function StepIndicator({ step }: { step: number }) {
  const { t } = useI18n()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {['Your trip', 'Payment'].map((rawLabel, i) => {
        const label = t(rawLabel)
        const n = i + 1
        const done = step > n
        const active = step === n
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
                transition: 'all 0.3s ease',
                background: done ? 'var(--accent)' : active ? 'var(--accent)' : 'var(--surface)',
                border: active ? 'none' : done ? 'none' : '1px solid var(--border)',
                color: done ? '#fff' : active ? '#fff' : 'var(--text-tertiary)',
                boxShadow: active ? '0 0 0 4px rgba(110,90,28,0.18)' : 'none',
              }}>
                {done ? <Check size={14} strokeWidth={3} /> : n}
              </div>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-dm-sans)', color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: active ? 600 : 400 }}>
                {label}
              </span>
            </div>
            {i < 1 && <div style={{ width: 48, height: 1.5, background: done ? 'var(--accent)' : 'var(--border)', margin: '0 10px', marginBottom: 22, borderRadius: 1 }} />}
          </div>
        )
      })}
    </div>
  )
}

/* ── Review Step ── */
function ReviewStep({ formData, setFormData, formErrors }: {
  formData: Record<string, string>
  setFormData: (v: Record<string, string>) => void
  formErrors: Record<string, boolean>
}) {
  const { items, removeItem, updateDate, updateTravelers, pickupTime, setPickupTime, setPickup, setDropoff } = useCartStore()

  /**
   * One control writes both ends of the journey. Tours return the guest to
   * where they were collected, so drop-off is mirrored rather than asked for,
   * but it must still be populated, because admin, dispatch and the operator
   * alert all read that column and a NULL there reads as "no return leg".
   *
   * BOTH stores are written on purpose. The POST body reads formData, while
   * the day builder and the step-1 gate read the cart store. Writing only the
   * cart store is how a paid booking reached the driver with pickup: null.
   */
  const setLocation = (value: string) => {
    setFormData({ ...formData, pickup: value, dropoff: value })
    setPickup(value)
    setDropoff(value)
  }

  /**
   * Seed the form from the cart on a fresh mount.
   *
   * The cart store persists to localStorage; formData does not. A guest who
   * chose their hotel yesterday came back to a blank picker sitting above a
   * day builder that still named the place, and had to pick it again for a
   * value the app already had. Runs once, and only into an empty field, so it
   * can never overwrite a choice made in this session.
   */
  const storedPickup = useCartStore((s) => s.pickup)
  useEffect(() => {
    if (!storedPickup || formData['pickup']) return
    setFormData({ ...formData, pickup: storedPickup, dropoff: storedPickup })
    // Intentionally keyed on the stored value alone: re-running as the guest
    // types elsewhere would be a no-op anyway, since pickup is then set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedPickup])
  // formatUsd, not formatPrice: every figure on this screen is part of the
  // charge, and Stripe is created with currency 'usd' whatever the site
  // language. formatPrice would render a payable total as a converted "EUR182".
  const { t, formatUsd } = useI18n()

  // No per-tour dates: a checkout is ONE day, so the single trip date in the
  // card above is written to every line.

  // Earliest selectable date honours the 24-hour lead time, so a date that
  // checkout would reject cannot be picked (also validated server-side).
  // Computed after mount to keep SSR/CSR markup identical.
  const [minDate, setMinDate] = useState('')
  useEffect(() => { setMinDate(earliestBookableExperienceDate(new Date())) }, [])

  // Get the shared date from the first item
  const sharedDate = items[0]?.date || ''

  const setAllDates = (date: string) => {
    items.forEach((item) => updateDate(item.id, date))
  }

  // A checkout is ONE day, but the cart persists in localStorage and an earlier
  // build let guests pick a date per tour. A returning guest can therefore still
  // hold a mixed-date cart that no control on this page can fix and that would
  // otherwise be sent to the API as-is. Collapse stragglers onto the first
  // line's date. Idempotent, and a no-op for every cart built since.
  useEffect(() => {
    if (items.length < 2) return
    const first = items[0].date
    if (items.every((i) => i.date === first)) return
    items.forEach((item) => updateDate(item.id, first))
    // updateDate is a stable zustand action; items is the value we react to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  // The SAME hazard for party size, and it is worse than the date one because
  // it is a money and manifest bug. A guest who added a tour on the old build
  // (default 2) and another on the new one (default 1) holds a cart of 2 and 1.
  // The counter shows only items[0], and the +/- steppers move each line from
  // its own value, so 2 and 1 never converge: the screen says "2 guests" while
  // the second tour is priced and dispatched for 1, and the driver meets a
  // party of two. Collapse onto the first line, exactly like the date.
  useEffect(() => {
    if (items.length < 2) return
    const first = items[0].travelers
    if (items.every((i) => i.travelers === first)) return
    items.forEach((item) => updateTravelers(item.id, first))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  return (
    <div>
      {/* ── Trip basics: who, when, what time, and where from ──────────────
          One card, in the order a guest actually decides: how many of us,
          which day, what time we are collected, and where we are collected
          from. The date sits directly under the guest counter; it used to be
          further down, past the day builder, where guests missed it.

          There is exactly ONE date and ONE time for the whole checkout: every
          experience in the cart runs on that day, and a second day is a second
          trip through checkout. */}
      <div style={{
        borderRadius: 'var(--r-xl)', overflow: 'hidden',
        border: '1px solid var(--border)', background: '#fff',
        marginBottom: 24,
      }}>
        {/* Row 1 — guests. Drives every price below it, so it leads. */}
        <div style={{
          padding: '18px 22px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Users size={18} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', display: 'block' }}>{t('Number of guests')}</span>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 1 }}>
                {items.length === 1
                  ? t('Applies to your experience')
                  : `${t('Applies to all')} ${items.length} ${t('experiences')}`}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <button className="btn-outline" aria-label="One fewer guest"
              style={{ width: 44, height: 44, padding: 0, borderRadius: '10px 0 0 10px', fontSize: 16 }}
              onClick={() => items.forEach((item) => updateTravelers(item.id, item.travelers - 1))}>−</button>
            <div aria-live="polite" style={{ width: 52, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-dm-sans)' }}>
              {items[0]?.travelers ?? 1}
            </div>
            <button className="btn-outline" aria-label="One more guest"
              style={{ width: 44, height: 44, padding: 0, borderRadius: '0 10px 10px 0', fontSize: 16 }}
              onClick={() => items.forEach((item) => updateTravelers(item.id, item.travelers + 1))}>+</button>
          </div>
        </div>

        {/* Row 2 — the one trip date, written to every line. */}
        <div data-field="tripDate" style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <CalendarDays size={18} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <label htmlFor="trip-date" style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', display: 'block', color: formErrors['tripDate'] ? '#c00' : undefined }}>
                {t('Trip date')} {formErrors['tripDate'] && <span style={{ fontWeight: 400 }}>- pick a bookable date</span>}
              </label>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 1 }}>
                {t('All experiences on the same day')}
              </p>
            </div>
          </div>
          <input
            id="trip-date"
            type="date"
            className="field-input"
            value={sharedDate}
            min={minDate}
            aria-invalid={formErrors['tripDate'] ? true : undefined}
            onChange={(e) => setAllDates(e.target.value)}
            style={{ width: 170, height: 44, flexShrink: 0, borderColor: formErrors['tripDate'] ? 'rgba(200,0,0,0.4)' : undefined }}
          />
        </div>

        {/* Row 3 — pickup time. The day is built from here. */}
        <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Clock size={18} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <label htmlFor="trip-time" style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', display: 'block' }}>{t('Pickup time')}</label>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 1 }}>
                {t('When your driver collects you')}
              </p>
            </div>
          </div>
          <input
            id="trip-time"
            type="time"
            className="field-input"
            value={pickupTime}
            onChange={(e) => setPickupTime(e.target.value)}
            style={{ width: 170, height: 44, flexShrink: 0 }}
          />
        </div>

        {/* Where the day starts and ends. Sits with guests, date and time
            because all four describe the same trip; the form below is about
            the person, not the trip. */}
        <div data-field="pickup" style={{ padding: '18px 22px', borderTop: '1px solid var(--border)' }}>
          <label htmlFor="tour-location" style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, color: formErrors['pickup'] ? '#c00' : undefined }}>
            <MapPin size={17} color={formErrors['pickup'] ? '#c00' : 'var(--text-secondary)'} />
            {t('Pickup and drop-off')} {formErrors['pickup'] && <span style={{ fontWeight: 400, fontSize: 12 }}>- required</span>}
          </label>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', margin: '0 0 10px 25px' }}>
            {t('We collect you here and bring you back to the same place.')}
          </p>
          <select
            id="tour-location"
            className="field-input"
            aria-invalid={formErrors['pickup'] ? true : undefined}
            value={formData['pickup'] || ''}
            onChange={(e) => setLocation(e.target.value)}
            style={{ height: 48, fontSize: 15, background: '#fff', fontWeight: 500, borderColor: formErrors['pickup'] ? 'rgba(200,0,0,0.4)' : undefined }}
          >
            <option value="">{t('Select your hotel, resort or airport')}</option>
            <optgroup label={t('Airports')}>
              {jamaicaLocations.filter((l) => l.kind === 'airport').map((l) => (
                <option key={l.name} value={l.name}>{l.name}</option>
              ))}
            </optgroup>
            <optgroup label={t('Hotels & resorts')}>
              {jamaicaLocations.filter((l) => !l.kind).map((l) => (
                <option key={l.name} value={l.name}>{l.name}</option>
              ))}
            </optgroup>
            <optgroup label={t('Cruise ports')}>
              {jamaicaLocations.filter((l) => l.kind === 'cruise').map((l) => (
                <option key={l.name} value={l.name}>{l.name}</option>
              ))}
            </optgroup>
          </select>
          {formData['pickup'] && jamaicaLocations.find((l) => l.name === formData['pickup']) && (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={12} color="var(--text-tertiary)" />
              {jamaicaLocations.find((l) => l.name === formData['pickup'])?.address}
            </p>
          )}
        </div>
      </div>

      <div className="hide-mobile" style={{ marginBottom: 28 }}>
        <h3 style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.025em', marginBottom: 6 }}>{t('Review your trip')}</h3>
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
          {items.length} experience{items.length !== 1 ? 's' : ''} in your Jamaica itinerary
        </p>
      </div>

      {/* ── Day Builder (score + stages) ── */}
      {items.length > 0 && (
        <div style={{
          marginBottom: 24,
          padding: '22px 22px 20px',
          borderRadius: 'var(--r-xl)',
          background: 'var(--card-bg, #fff)',
          border: '1px solid var(--border)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Subtle gold hairline top, prestige cue */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: 'linear-gradient(90deg, transparent, var(--gold, #FFB300) 50%, transparent)',
            opacity: 0.5,
            pointerEvents: 'none',
          }} />
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 16, gap: 12, flexWrap: 'wrap',
          }}>
            <div>
              <p style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: 12, fontWeight: 600,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
                marginBottom: 4,
              }}>
                Day Builder
              </p>
              <h3 style={{
                fontFamily: 'var(--font-dm-sans)',
                fontWeight: 700,
                fontSize: 19,
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
                lineHeight: 1.15,
              }}>
                Build your perfect day
              </h3>
            </div>
          </div>
          <TripTimeBar />

          {/* The itinerary itself, under the score. The score says how good
              the day is; this says what the day IS. */}
          <div style={{ marginTop: 22, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <DayFlow />
          </div>
        </div>
      )}

      {/* ── Experience cards ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {items.map((item) => (
          <div key={item.id} style={{
            borderRadius: 'var(--r-xl)', overflow: 'hidden',
            border: '1px solid var(--border)', background: '#fff',
          }}>
            <div style={{ display: 'flex' }}>
              <div style={{ width: 140, position: 'relative', flexShrink: 0 }}>
                <Image src={item.image} alt={item.title} fill sizes="140px" style={{ objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1, padding: '18px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <h4 style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 16, marginBottom: 4, lineHeight: 1.25 }}>{t(item.title)}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={12} /> {item.destination}, {item.parish}</span>
                      <span>·</span>
                      <span>{item.duration}</span>
                    </div>
                  </div>
                  <button onClick={() => removeItem(item.id)} style={{
                    background: 'none', border: 'none', color: 'var(--text-tertiary)',
                    fontSize: 12, fontFamily: 'var(--font-dm-sans)', cursor: 'pointer',
                    padding: '4px 8px', borderRadius: 6, transition: 'all 0.15s ease',
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#c00'; e.currentTarget.style.background = 'rgba(200,0,0,0.05)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.background = 'none' }}
                  >
                    Remove
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                  {item.tags.map((tag) => <span key={tag} className="tag">{t(tag)}</span>)}
                </div>
              </div>
            </div>

            {/* Tour details. Collapsed by default so the review stays
                scannable, and rendered only for the fields this experience
                actually has — a tour with no `bring` list simply has no
                "What to bring" heading rather than an empty one. */}
            <TourDetails exp={item} />

            {/* Footer, date + price */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 22px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-warm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
                <Calendar size={13} />
                <span>{new Date(item.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 18 }}>
                  {formatUsd(tourPrice(item.pricing, item.travelers))}
                </span>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 1 }}>
                  {perTravelerPrice(item.pricing, item.travelers) === null
                    ? `${item.travelers} ${item.travelers === 1 ? t('guest') : t('guests')} · ${item.pricing.mode === 'group' && item.travelers <= item.pricing.tierMax ? t('private tour, one price') : t('all-in')}`
                    : `${item.travelers} × ${formatUsd(perTravelerPrice(item.pricing, item.travelers)!)}`}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Details Step ── */
function DetailsStep({ waiverAccepted, setWaiverAccepted, waiverError, formData, setFormData, formErrors }: {
  waiverAccepted: boolean
  setWaiverAccepted: (v: boolean) => void
  waiverError: boolean
  formData: Record<string, string>
  setFormData: (d: Record<string, string>) => void
  formErrors: Record<string, boolean>
}) {
  const { t } = useI18n()
  const [modalContent, setModalContent] = useState<'waiver' | 'terms' | null>(null)

  // Pickup and drop-off moved up into the trip card with guests, date and
  // time, so this form is purely about the person. It handles no location
  // fields and needs no mirroring.
  const updateField = (key: string, value: string) => {
    setFormData({ ...formData, [key]: value })
  }
  return (
    <div>
      <div className="hide-mobile" style={{ marginBottom: 28 }}>
        <h3 style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.025em', marginBottom: 6 }}>{t('Your details')}</h3>
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
          We&apos;ll use this to confirm your booking
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { key: 'firstName', label: 'First Name', placeholder: 'First name', span: 1, auto: 'given-name' },
          { key: 'lastName', label: 'Last Name', placeholder: 'Last name', span: 1, auto: 'family-name' },
          { key: 'email', label: 'Email', placeholder: 'you@email.com', span: 2, type: 'email', auto: 'email' },
          { key: 'phone', label: 'Phone', placeholder: '+1 (555) 000-0000', span: 1, type: 'tel', auto: 'tel' },
        ].map((f) => (
          <div key={f.key} data-field={f.key} style={{ gridColumn: f.span === 2 ? 'span 2' : undefined }}>
            <label htmlFor={`checkout-${f.key}`} style={{ fontSize: 12, color: formErrors[f.key] ? '#c00' : 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
              {f.label} {formErrors[f.key] && <span style={{ fontWeight: 400 }}>- {f.key === 'email' && formData[f.key]?.trim() ? 'invalid email' : f.key === 'phone' && formData[f.key]?.trim() ? 'invalid phone' : 'required'}</span>}
            </label>
            <input
              id={`checkout-${f.key}`}
              className="field-input"
              type={f.type || 'text'}
              name={f.key}
              aria-invalid={formErrors[f.key] ? true : undefined}
              autoComplete={f.auto}
              placeholder={f.placeholder}
              value={formData[f.key] || ''}
              onChange={(e) => updateField(f.key, e.target.value)}
              style={{
                height: 46,
                borderColor: formErrors[f.key] ? 'rgba(200,0,0,0.4)' : undefined,
              }}
            />
          </div>
        ))}
        {/* Country dropdown */}
        <div data-field="country">
          <label htmlFor="checkout-country" style={{ fontSize: 12, color: formErrors['country'] ? '#c00' : 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            Country {formErrors['country'] && <span style={{ fontWeight: 400 }}>- required</span>}
          </label>
          <select
            aria-invalid={formErrors['country'] ? true : undefined}
            id="checkout-country"
            className="field-input"
            name="country"
            autoComplete="country-name"
            value={formData['country'] || ''}
            onChange={(e) => updateField('country', e.target.value)}
            style={{
              height: 46,
              borderColor: formErrors['country'] ? 'rgba(200,0,0,0.4)' : undefined,
              color: formData['country'] ? 'var(--text-primary)' : 'var(--text-tertiary)',
              appearance: 'none',
              WebkitAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235E5C57' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 14px center',
              paddingRight: 36,
            }}
          >
            <option value="" disabled>Select country</option>
            {[
              'United States', 'Canada', 'United Kingdom', 'Jamaica', 'Trinidad and Tobago',
              'Barbados', 'Bahamas', 'Cayman Islands', 'Germany', 'France',
              'Netherlands', 'Spain', 'Italy', 'Japan', 'China',
              'South Korea', 'Australia', 'Brazil', 'Mexico', 'Colombia',
              'Argentina', 'India', 'Nigeria', 'Ghana', 'South Africa',
              'Kenya', 'Sweden', 'Norway', 'Denmark', 'Switzerland',
              'Ireland', 'Portugal', 'Belgium', 'Austria', 'New Zealand',
              'Singapore', 'Philippines', 'Thailand', 'Costa Rica', 'Panama',
            ].sort().map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label htmlFor="checkout-special-requests" style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Special Requests</label>
          <textarea
            id="checkout-special-requests"
            className="field-input"
            placeholder="Dietary restrictions, accessibility needs, anything we should know..."
            rows={4}
            value={formData['specialRequests'] || ''}
            onChange={(e) => updateField('specialRequests', e.target.value)}
          />
        </div>
      </div>
      <div style={{
        marginTop: 24, padding: '14px 18px', borderRadius: 'var(--r-md)',
        background: 'var(--emerald-dim)', border: '1px solid rgba(29,122,80,0.12)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <ShieldCheck size={18} color="var(--emerald)" />
        <div>
          <p style={{ fontSize: 13, color: 'var(--emerald)', fontFamily: 'var(--font-dm-sans)', fontWeight: 600 }}>Secure & encrypted</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 1 }}>Your information is protected with 256-bit SSL encryption</p>
        </div>
      </div>

      {/* Waiver agreement */}
      <div data-field="waiver" style={{
        marginTop: 24, padding: '18px 20px', borderRadius: 'var(--r-lg)',
        border: `1px solid ${waiverError && !waiverAccepted ? 'rgba(200,0,0,0.4)' : 'var(--border)'}`,
        background: waiverError && !waiverAccepted ? 'rgba(200,0,0,0.03)' : '#fff',
        transition: 'all 0.2s ease',
      }}>
        {/* The real checkbox is visually hidden but NEVER display:none, which
            would drop it out of the tab order and the accessibility tree and
            leave a keyboard-only guest unable to accept the waiver, i.e.
            unable to book at all. `.visually-hidden` keeps it focusable; the
            custom box mirrors its state and shows the focus ring. */}
        <label className="waiver-label" style={{ display: 'flex', gap: 12, cursor: 'pointer', alignItems: 'flex-start' }}>
          <span aria-hidden="true" className="waiver-box" style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
            border: waiverAccepted ? 'none' : `2px solid ${waiverError ? 'rgba(200,0,0,0.5)' : 'var(--border-strong)'}`,
            background: waiverAccepted ? 'var(--accent)' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}>
            {waiverAccepted && <Check size={14} strokeWidth={3} color="#fff" />}
          </span>
          <input
            type="checkbox"
            className="visually-hidden"
            checked={waiverAccepted}
            onChange={(e) => setWaiverAccepted(e.target.checked)}
            aria-describedby="waiver-copy"
          />
          <div>
            <p style={{ fontSize: 13, fontFamily: 'var(--font-dm-sans)', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 4 }}>
              Activity Waiver & Release
            </p>
            <p id="waiver-copy" style={{ fontSize: 12, fontFamily: 'var(--font-dm-sans)', color: 'var(--text-tertiary)', lineHeight: 1.55 }}>
              I acknowledge that the experiences booked involve physical activities including but not limited to swimming, hiking, cliff jumping, and water sports. I accept all associated risks and agree to the{' '}
              <span
                onClick={(e) => { e.preventDefault(); setModalContent('waiver') }}
                style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}
              >
                Activity Waiver & Release of Liability
              </span>
              {' '}and{' '}
              <span
                onClick={(e) => { e.preventDefault(); setModalContent('terms') }}
                style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}
              >
                Terms of Service
              </span>
              .
            </p>
          </div>
        </label>
      </div>

      {waiverError && !waiverAccepted && (
        <p style={{
          marginTop: 10, fontSize: 13, color: '#c00',
          fontFamily: 'var(--font-dm-sans)', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          Please accept the activity waiver to continue
        </p>
      )}

      {modalContent && (
        <LegalModal kind={modalContent} onClose={() => setModalContent(null)} />
      )}
    </div>
  )
}

/* ── Confirmed ── */
function ConfirmedView() {
  const { items, grandTotal, clearCart } = useCartStore()
  const { t, formatUsd } = useI18n()
  const router = useRouter()
  const total = grandTotal()
  const confirmedItems = [...items]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '120px 40px 80px', textAlign: 'center' }}>
      {/* Success icon */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'var(--emerald)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(29,122,80,0.3)',
      }}>
        <Check size={32} strokeWidth={2.5} />
      </div>

      <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 32, marginBottom: 8, letterSpacing: '-0.025em' }}>{t('Booking Confirmed')}</h1>
      <p style={{ fontSize: 16, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', maxWidth: 420, lineHeight: 1.65, marginBottom: 36 }}>
        Your Jamaican adventure is booked. Check your email for confirmation details and everything you need to know.
      </p>

      {/* Summary card */}
      <div style={{
        borderRadius: 'var(--r-xl)', overflow: 'hidden',
        border: '1px solid var(--border)', maxWidth: 480, width: '100%',
        textAlign: 'left', marginBottom: 36,
      }}>
        {/* Card header */}
        <div style={{
          padding: '16px 24px', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Leaf size={16} color="#fff" />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', fontFamily: 'var(--font-dm-sans)' }}>MAPL Tours Jamaica</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-dm-sans)' }}>Booking confirmed</span>
        </div>

        {/* Items */}
        <div style={{ padding: '8px 24px' }}>
          {confirmedItems.map((item, i) => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0',
              borderBottom: i < confirmedItems.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--r-md)', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                <Image src={item.image} alt={item.title} fill sizes="48px" style={{ objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-dm-sans)' }}>{t(item.title)}</p>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 2 }}>
                  {item.date} · {item.travelers} traveler{item.travelers !== 1 ? 's' : ''} · {item.destination}
                </p>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-dm-sans)', flexShrink: 0 }}>
                {formatUsd(tourPrice(item.pricing, item.travelers))}
              </span>
            </div>
          ))}
        </div>

        {/* Total */}
        <div style={{
          padding: '16px 24px', background: 'var(--bg-warm)',
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 14, fontFamily: 'var(--font-dm-sans)', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Paid</span>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 22 }}>{formatUsd(total)}</span>
        </div>
      </div>

      <button className="btn-primary" onClick={() => { clearCart(); router.push('/') }} style={{ height: 48, padding: '0 36px', fontSize: 15 }}>
        Explore more experiences →
      </button>

      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
        Flexible cancellation within 48 hrs of booking · No problem.
      </p>
    </div>
  )
}

/* ═══════════════════════════════════
   MAIN CHECKOUT VIEW
   ═══════════════════════════════════ */
export default function CheckoutView() {
  const [step, setStep] = useState(1)
  const [confirmed] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  // Gift card. The code is only ever *checked* here; the balance is taken
  // server-side at /api/checkout, so nothing in this component can move money.
  const [giftCodeInput, setGiftCodeInput] = useState('')
  const [giftCard, setGiftCard] = useState<{ code: string; balanceCents: number } | null>(null)
  const [giftChecking, setGiftChecking] = useState(false)
  const [giftError, setGiftError] = useState<string | null>(null)
  const [waiverAccepted, setWaiverAccepted] = useState(false)
  const [waiverError, setWaiverError] = useState(false)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({})
  // Announced to assistive tech when validation blocks the step. The red field
  // labels are the sighted equivalent; without this a screen-reader user got no
  // announcement, no focus move and no perceptible result, which makes the CTA
  // indistinguishable from a dead control.
  const [formAnnouncement, setFormAnnouncement] = useState('')
  const [stripeError, setStripeError] = useState<string | null>(null)
  const [limitModalOpen, setLimitModalOpen] = useState(false)
  // The cancellation policy, opened from the line under the pay button.
  const [legalOpen, setLegalOpen] = useState(false)
  const { items, stops, subtotal, fee, grandTotal, isDayOverLimit, hoursByDate, pickupTime } = useCartStore()
  const { t, formatUsd } = useI18n()

  // Transport is no longer charged: Collin's tour prices include
  // transportation and entrance fees (his confirmation, Aug 2026), so the
  // total is the cart total, full stop.
  const baseTotal = grandTotal()

  // ── Video-reward discount (auto-applied when the user has one unused) ──
  const availableReward = useAvailableReward()
  const [rewardApplied, setRewardApplied] = useState(true)
  const activeReward = rewardApplied ? availableReward : null
  const rewardDiscount = activeReward
    ? Math.round(baseTotal * (activeReward.percent / 100))
    : 0
  const afterReward = Math.max(0, baseTotal - rewardDiscount)
  // A card worth more than the cart only spends what the cart costs. This is
  // only a PREVIEW, computed from a balance the client cached when the code
  // was validated; the card may have been partly spent elsewhere since.
  const giftPreviewLocal = giftCard ? Math.min(giftCard.balanceCents / 100, afterReward) : 0
  // What the server actually claimed, once /api/checkout has answered. The
  // server is authoritative: it re-reads the live balance and debits it.
  // Showing the local preview after that point stated a discount the buyer
  // was not getting, and the card was charged the larger real amount.
  const [serverGift, setServerGift] = useState<number | null>(null)
  const [serverDue, setServerDue] = useState<number | null>(null)
  const giftPreview = serverGift ?? giftPreviewLocal
  const finalTotal = serverDue ?? Math.max(0, afterReward - giftPreview)

  // Any change to what is being bought invalidates the server's last answer,
  // AND the PaymentIntent that was sized against it.
  //
  // Dropping only the server figures left the intent behind: the effect below
  // re-creates one only when clientSecret is null, so a guest who reached the
  // payment step and then unticked the video reward saw the total go up on
  // screen while Stripe still held the discounted intent, and paid the amount
  // that was no longer displayed. Clearing the secret sends the cart back for
  // re-pricing, and the server resizes the same intent in place rather than
  // minting a second one.
  useEffect(() => {
    setServerGift(null)
    setServerDue(null)
    setClientSecret(null)
  }, [items, rewardApplied, giftCard])

  // Create PaymentIntent when moving to step 3. The server inserts a pending
  // `bookings` row (plus line items), hashes the cart for idempotency, and
  // attaches booking_id to the PaymentIntent metadata so the webhook can
  // flip status to 'paid' and dispatch the confirmation email.
  useEffect(() => {
    if (step === 2 && !clientSecret && items.length > 0) {
      fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // The PRE-gift total. The server prices the cart with no knowledge
          // of gift cards and compares against this; sending the post-gift
          // figure fails assertAmountMatches and 400s before redemption is
          // ever reached. The gift comes off server-side, after pricing.
          amount: afterReward,
          items: items.map((i) => ({
            id: i.id,
            title: i.title,
            destination: i.destination,
            travelers: i.travelers,
            date: i.date,
            price: i.price,
          })),
          customer: {
            email: formData['email'],
            firstName: formData['firstName'],
            lastName: formData['lastName'],
            phone: formData['phone'],
            country: formData['country'],
            pickup: formData['pickup'],
            // Tours return to the pickup point, so dropoff is mirrored rather
            // than asked for. It stays populated because admin, dispatch and
            // the operator alert all read the column.
            dropoff: formData['pickup'],
            pickupTime,
            specialRequests: [
              formData['specialRequests'],
              // In DAY order, and each one named against the tour it follows.
              // The driver reads this as a route instruction, so "after X" is
              // the part that matters; cart order is the order things were
              // tapped and would tell them nothing.
              stops.length > 0
                ? `Requested free food stops: ${planDay({ items, stops })
                    .nodes.flatMap((n, i, all) =>
                      n.kind === 'stop'
                        ? [`${n.stop.name} (${n.stop.town}) after ${
                            [...all.slice(0, i)].reverse().find((p) => p.kind === 'experience')?.title ?? 'your tour'
                          }`]
                        : []
                    ).join('; ')}`
                : '',
            ].filter(Boolean).join('\n'),
          },
          breakdown: {
            subtotal: subtotal(),
            fee: fee(),
            rewardDiscount: rewardDiscount,
          },
          // Whether the traveler kept the discount. The server verifies the
          // PERCENT itself (never trusted from here) but must honour a
          // decline: it used to force-apply any available reward, so a
          // traveler who unticked the box sent a full-price amount the server
          // then discounted, failed its own amount check, and 400'd forever.
          applyReward: rewardApplied,
          giftCode: giftCard?.code,
          attribution: getStoredAttribution(),
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setStripeError(data.error)
            // The card was rejected server-side (spent elsewhere, expired).
            // Drop it so the summary stops promising a discount we can't give.
            if (data.giftCode) {
              setGiftCard(null)
              setGiftError(data.error)
            }
          } else if (data.alreadyPaid) {
            // Settled while we were re-entering checkout (the guest paid and
            // then refreshed). Go to the confirmation they already earned;
            // creating another PaymentIntent here would charge them twice.
            window.location.href = `/checkout/confirm?booking_id=${data.bookingId}`
          } else if (data.fullyCoveredByGift) {
            // Nothing left to charge, so there is no card payment step and no
            // PaymentIntent. The server already marked the booking paid and
            // sent the confirmation email; go straight to the same
            // confirmation page the card flow lands on, keyed by booking id.
            if (activeReward) void consumeReward(activeReward.id).catch(() => {})
            window.location.href = `/checkout/confirm?booking_id=${data.bookingId}`
          } else {
            // Adopt the server's arithmetic before the card form renders, so
            // the total on the pay button is the amount Stripe will take.
            if (typeof data.giftAmount === 'number') setServerGift(data.giftAmount)
            if (typeof data.amountDue === 'number') setServerDue(data.amountDue)
            setClientSecret(data.clientSecret)
          }
        })
        .catch(() => setStripeError('Failed to initialize payment. Please try again.'))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, clientSecret, items, grandTotal])

  async function applyGiftCode() {
    const code = giftCodeInput.trim()
    if (!code) return
    setGiftChecking(true)
    setGiftError(null)
    try {
      const res = await fetch('/api/gifts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!data.valid) {
        setGiftError(data.message ?? 'That code could not be used.')
        return
      }
      setGiftCard({ code: data.code, balanceCents: data.balanceCents })
      // Any PaymentIntent already created was sized without the gift, so it
      // has to be rebuilt for the smaller charge.
      setClientSecret(null)
      setStripeError(null)
    } catch {
      setGiftError('Could not check that code. Please try again.')
    } finally {
      setGiftChecking(false)
    }
  }

  if (confirmed) return <ConfirmedView />

  if (items.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', paddingTop: 72, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Leaf size={24} color="var(--text-tertiary)" />
        </div>
        <h1 style={{ fontSize: 20, fontFamily: 'var(--font-dm-sans)', fontWeight: 700, marginBottom: 8 }}>{t('Your itinerary is empty')}</h1>
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 24, maxWidth: 300 }}>Start exploring Jamaica and add experiences to build your trip</p>
        {/* Two ways out, because an empty cart has two intents: browse tours,
            or the guest actually wanted a transfer. */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/explore" className="btn-primary" style={{ height: 46, padding: '0 28px', fontSize: 14 }}>{t('Browse experiences')}</Link>
          <Link href="/transfers" className="btn-outline" style={{ height: 46, padding: '0 24px', fontSize: 14, display: 'inline-flex', alignItems: 'center' }}>{t('Book an airport transfer')}</Link>
        </div>
      </div>
    )
  }

  const ctas = [`${t('Continue to payment')} →`, `${t('Complete booking')} · ${formatUsd(finalTotal)}`]

  return (
    <div className="checkout-wrapper" style={{ minHeight: '100vh', paddingTop: 'var(--nav-h, 56px)', background: step === 2 ? 'var(--bg)' : 'var(--bg-warm)' }}>
      {/* Top bar */}
      <div style={{ borderBottom: '1px solid var(--border)', background: '#fff' }}>
        <div className="container checkout-top-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', maxWidth: 1100 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontFamily: 'var(--font-dm-sans)', fontWeight: 500, color: 'var(--text-secondary)', transition: 'color 0.15s ease' }}>
            <ArrowLeft size={15} /> Back
          </Link>
          <div style={{ textAlign: 'center' }}>
            {/* The page heading. It was an h2 with no h1 above it, leaving
                the checkout with no document heading at all. */}
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 18 }}>{t('Checkout')}</h1>
          </div>
          <div className="hide-mobile"><StepIndicator step={step} /></div>
        </div>
      </div>

      {/* Validation announcements for assistive tech, visually hidden. */}
      <div role="alert" aria-live="assertive" className="visually-hidden">{formAnnouncement}</div>

      {/* Mobile step label */}
      <div className="hide-desktop container" style={{ paddingTop: 16, paddingBottom: 4 }}>
        <p style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gold-text)', marginBottom: 4 }}>
          Step {step} of 2
        </p>
        <h3 style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 22 }}>
          {step === 1 ? t('Your trip and details') : t('Payment')}
        </h3>
      </div>

      {/* Body */}
      <div className={`checkout-body${step === 2 ? ' checkout-step-3' : ''}`}>
        {/* Left, form */}
        <div className={step === 2 ? 'checkout-payment-form' : ''} style={{ flex: 1, maxWidth: 640 }}>
          {step === 1 && (
            <>
              <ReviewStep formData={formData} setFormData={setFormData} formErrors={formErrors} />
              <div style={{ marginTop: 40 }}>
                <DetailsStep waiverAccepted={waiverAccepted} setWaiverAccepted={setWaiverAccepted} waiverError={waiverError} formData={formData} setFormData={setFormData} formErrors={formErrors} />
              </div>
              {/* Desktop CTA in the reading column. The waiver is the last thing
                  a guest completes, so the way forward belongs directly under
                  it rather than only in the summary rail off to the side.
                  Delegates to the summary button so validation, the day-limit
                  gate and the step transition all stay in one handler. */}
              {/* No policy microcopy here: the summary rail already carries
                  it, and repeating it put two identical "full policy" links
                  adjacent in the tab order. */}
              <div className="hide-mobile" style={{ marginTop: 24 }}>
                <button
                  className="btn-primary"
                  onClick={() => {
                    const el = document.querySelector('[data-checkout-cta]') as HTMLButtonElement | null
                    if (!el || el.disabled) return
                    el.click()
                  }}
                  style={{ width: '100%', height: 52, fontSize: 15 }}
                >
                  {ctas[0]}
                </button>
              </div>
            </>
          )}
          {step === 2 && (
            <>
            {clientSecret ? (
              <StripePaymentPanel
                clientSecret={clientSecret}
                onPaymentSuccess={async () => {
                  // Mark the reward as used. The status flip prevents re-use
                  // on future checkouts; booking_id can be back-filled once
                  // bookings are persisted server-side.
                  if (activeReward) {
                    await consumeReward(activeReward.id).catch(() => {})
                  }
                  // No setConfirmed(true), StripePaymentPanel navigates the
                  // browser to /checkout/confirm?payment_intent=… which is
                  // the comprehensive server-rendered confirmation view.
                  // setConfirmed used to render an inline view from cart
                  // state alone (no booking ref, no breakdown, no pickup);
                  // we keep the state available for the rare fallback path
                  // where navigation cannot happen.
                }}
              />
            ) : stripeError ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: '#c00', fontFamily: 'var(--font-dm-sans)', marginBottom: 16 }}>{stripeError}</p>
                <button className="btn-outline" onClick={() => { setStripeError(null); setClientSecret(null) }}>Try again</button>
              </div>
            ) : (
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>Setting up secure payment...</p>
              </div>
            )}
            </>
          )}
          {false && (
            <button className="btn-outline" onClick={() => { setStep(step - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }} style={{ marginTop: 24, gap: 6 }}>
              <ArrowLeft size={14} /> Previous step
            </button>
          )}
          {step === 2 && (
            <button className="btn-outline" onClick={() => { setStep(1); setClientSecret(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }} style={{ marginTop: 24, gap: 6 }}>
              <ArrowLeft size={14} /> Previous step
            </button>
          )}
        </div>

        {/* Right, summary */}
        <div className="checkout-summary" style={{ width: '100%', maxWidth: 340, flexShrink: 0, position: 'sticky', top: 120, alignSelf: 'flex-start' }}>
          <div style={{
            borderRadius: 'var(--r-xl)', overflow: 'hidden',
            border: '1px solid var(--border)', background: '#fff',
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <h4 style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 17, letterSpacing: '-0.025em', marginBottom: 2 }}>{t('Order Summary')}</h4>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>Jamaica · {items.length} experience{items.length !== 1 ? 's' : ''}</p>
            </div>

            <div style={{ padding: '12px 24px' }}>
              {items.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 'var(--r-md)', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                    <Image src={item.image} alt={item.title} fill sizes="42px" style={{ objectFit: 'cover' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontFamily: 'var(--font-dm-sans)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t(item.title)}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
                      {perTravelerPrice(item.pricing, item.travelers) === null
                        ? `${item.travelers} ${item.travelers === 1 ? t('guest') : t('guests')}`
                        : `${item.travelers} × ${formatUsd(perTravelerPrice(item.pricing, item.travelers)!)}`}
                    </p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-dm-sans)', flexShrink: 0 }}>
                    {formatUsd(tourPrice(item.pricing, item.travelers))}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ padding: '16px 24px', background: 'var(--bg-warm)', borderTop: '1px solid var(--border)' }}>
              {([] as { l: string; v: number }[]).map((r) => (
                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontFamily: 'var(--font-dm-sans)', color: 'var(--text-secondary)', marginBottom: 6 }}>
                  <span>{r.l}</span><span>{formatUsd(r.v)}</span>
                </div>
              ))}


              {/* Video-reward discount strip */}
              {availableReward && (
                <div style={{
                  marginTop: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,179,0,0.3)',
                  background: 'rgba(255,179,0,0.06)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: 'var(--gold, #FFB300)',
                    color: '#111',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Award size={17} strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 13,
                      color: 'var(--text-primary)', letterSpacing: '-0.005em',
                    }}>
                      {availableReward.percent}% MAPL Tours reward
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: 12,
                      color: 'var(--text-tertiary)', marginTop: 1,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {availableReward.code}
                    </p>
                  </div>
                  <label style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontFamily: 'var(--font-dm-sans)', fontSize: 12, fontWeight: 600,
                    color: 'var(--text-secondary)', cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={rewardApplied}
                      onChange={(e) => setRewardApplied(e.target.checked)}
                      style={{ accentColor: 'var(--gold, #FFB300)' }}
                    />
                    Apply
                  </label>
                </div>
              )}

              {rewardApplied && availableReward && rewardDiscount > 0 && step === 2 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  marginTop: 10, fontSize: 13,
                  fontFamily: 'var(--font-dm-sans)', fontWeight: 600,
                  color: 'var(--emerald, #00A550)',
                }}>
                  <span>Reward discount</span>
                  <span>−{formatUsd(rewardDiscount)}</span>
                </div>
              )}

              {/* ── Gift card ── */}
              {/* The payment step. This read `step === 3` from before the
                  checkout became two steps, so the gift-code field was
                  unreachable and a guest holding a balance was charged the full
                  total. applyGiftCode clears clientSecret, so the PaymentIntent
                  is re-sized after a code is applied. */}
              {step === 2 && (
                giftCard ? (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginTop: 10, fontSize: 13.5,
                    fontFamily: 'var(--font-dm-sans)', fontWeight: 600,
                    color: 'var(--emerald, #00A550)',
                  }}>
                    <span>
                      Gift card {giftCard.code}
                      <button
                        onClick={() => { setGiftCard(null); setGiftCodeInput(''); setClientSecret(null); setStripeError(null) }}
                        style={{
                          marginLeft: 8, background: 'none', border: 'none', padding: 0,
                          fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer',
                          textDecoration: 'underline', fontFamily: 'inherit',
                        }}
                      >
                        remove
                      </button>
                    </span>
                    <span>&minus;{formatUsd(giftPreview)}</span>
                  </div>
                ) : (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={giftCodeInput}
                        onChange={(e) => { setGiftCodeInput(e.target.value); setGiftError(null) }}
                        placeholder="Gift card code"
                        aria-label="Gift card code"
                        style={{
                          flex: 1, minWidth: 0, height: 38, borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--border-strong)', padding: '0 12px',
                          fontSize: 13.5, fontFamily: 'var(--font-dm-sans)',
                          color: 'var(--text-primary)', background: 'var(--bg)',
                          outline: 'none', boxSizing: 'border-box',
                          textTransform: 'uppercase',
                        }}
                      />
                      <button
                        onClick={applyGiftCode}
                        disabled={giftChecking || giftCodeInput.trim().length < 4}
                        className="btn-outline"
                        style={{
                          height: 38, padding: '0 16px', fontSize: 13, fontWeight: 600,
                          borderRadius: 'var(--r-sm)', whiteSpace: 'nowrap',
                          opacity: giftChecking || giftCodeInput.trim().length < 4 ? 0.5 : 1,
                        }}
                      >
                        {giftChecking ? 'Checking…' : 'Apply'}
                      </button>
                    </div>
                    {giftError && (
                      <p style={{ marginTop: 6, fontSize: 12.5, color: '#c00', fontFamily: 'var(--font-dm-sans)' }}>
                        {giftError}
                      </p>
                    )}
                  </div>
                )
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 20, marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <span>{t('Total')}</span><span>{formatUsd(step === 2 ? finalTotal : grandTotal())}</span>
              </div>
            </div>

            {step < 2 && (
              /* hide-mobile: below 768 the sticky bottom bar is the sole CTA.
                 The summary rail un-sticks and stacks into the flow there, so
                 without this the guest saw two identical buttons 145px apart
                 and hit both as separate tab stops. */
              <div className="hide-mobile" style={{ padding: '16px 24px' }}>
                <button className="btn-primary" onClick={() => {
                  // Hard gate: every step must pass the 8-hour daily cap.
                  if (isDayOverLimit()) {
                    setLimitModalOpen(true)
                    return
                  }
                  if (step === 1) {
                    // Validate required fields
                    const required = ['firstName', 'lastName', 'email', 'phone', 'country', 'pickup']
                    const errors: Record<string, boolean> = {}
                    let hasError = false
                    required.forEach((key) => {
                      if (!formData[key]?.trim()) {
                        errors[key] = true
                        hasError = true
                      }
                    })
                    // Email format validation
                    if (formData['email']?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData['email'].trim())) {
                      errors['email'] = true
                      hasError = true
                    }
                    // Phone validation, at least 7 digits
                    if (formData['phone']?.trim() && formData['phone'].replace(/\D/g, '').length < 7) {
                      errors['phone'] = true
                      hasError = true
                    }
                    // The single pickup location is required, and it lives in
                    // the trip card rather than the details form.
                    if (!useCartStore.getState().pickup?.trim()) {
                      errors['pickup'] = true
                      hasError = true
                    }

                    // The trip date is required and must still be bookable.
                    // Clearing the field wiped the date on every line, rendered
                    // "Invalid Date" on the cards, and still reached payment
                    // with date:"" in the payload.
                    const tripDate = useCartStore.getState().items[0]?.date ?? ''
                    const earliest = earliestBookableExperienceDate(new Date())
                    if (!tripDate || tripDate < earliest) {
                      errors['tripDate'] = true
                      hasError = true
                    }

                    // Published once, after every check. Set earlier it shipped
                    // a half-filled object, and the pickup and date errors only
                    // reached the screen because they mutated the same object
                    // React was already holding.
                    setFormErrors(errors)

                    if (!waiverAccepted) {
                      setWaiverError(true)
                      hasError = true
                    } else {
                      setWaiverError(false)
                    }

                    if (hasError) {
                      // Counted from the errors themselves. `required` does
                      // not carry tripDate, so a bad date alone counted zero
                      // and announced the waiver message instead.
                      const missing = Object.keys(errors).filter((k) => errors[k]).length
                      setFormAnnouncement(
                        missing > 0
                          ? `${missing} ${missing === 1 ? 'field needs' : 'fields need'} attention before you can continue.`
                          : 'Please accept the activity waiver to continue.'
                      )
                      // Move FOCUS to the first invalid control rather than only
                      // scrolling to it. Scrolling alone leaves focus on whichever
                      // CTA was pressed, and the inline one sits in normal flow near
                      // the page bottom, so focus ends up hundreds of pixels below
                      // the fold with no visible ring (WCAG 2.4.11).
                      setTimeout(() => {
                        const firstErrorKey = [...required, 'tripDate'].find((key) => errors[key])
                        const scope = firstErrorKey
                          ? document.querySelector(`[data-field="${firstErrorKey}"]`)
                          : !waiverAccepted
                            ? document.querySelector('[data-field="waiver"]')
                            : null
                        if (!scope) return
                        const control = scope.querySelector('input, select, textarea') as HTMLElement | null
                        if (control) {
                          control.focus({ preventScroll: true })
                          control.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        } else {
                          ;(scope as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }
                      }, 100)
                      return
                    }
                  }
                  setWaiverError(false)
                  setFormErrors({})
                  setFormAnnouncement('')
                  setStep(step + 1)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }} data-checkout-cta
                /* Same action as the inline CTA under the waiver, so the name
                   says where it is. Two identically-named buttons in the rotor
                   give a screen-reader user nothing to choose between. */
                aria-label={step === 1 ? `${t('Continue to payment')}, ${t('order summary')}` : undefined}
                style={{ width: '100%', height: 48, fontSize: 14 }}>
                  {ctas[step - 1]}
                </button>
                {/* Flow, not flex. As a centered flex row the padlock was
                    vertically centred against three wrapped lines of text and
                    floated in the middle of the block. Inline text wraps the
                    way a sentence should, and the icon sits on the first line
                    where it reads as part of the first word. */}
                <p style={{ marginTop: 12, fontSize: 12, lineHeight: 1.5, textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
                  <Lock size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 5 }} />
                  Secure checkout · {CANCELLATION_SUMMARY.short} ·{' '}
                  {/* Opens in place. This was an anchor to /terms with
                      target="_blank", which is still leaving: a guest reading
                      the cancellation line at the moment they decide to pay
                      ended up in a second tab, and the one thing a payment page
                      should never do is send someone away from it. */}
                  <button
                    type="button"
                    onClick={() => setLegalOpen(true)}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      font: 'inherit', color: 'inherit', cursor: 'pointer',
                      textDecoration: 'underline', textUnderlineOffset: 2,
                    }}
                  >
                    full policy
                  </button>
                </p>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Mobile sticky bar ──
          On a 390px screen step 1 runs ~2,700px: the buyer fills seven
          required fields with the total and the forward action both offscreen.
          This keeps the live total and the CTA in the thumb zone, the same
          pattern /transfers already uses. Desktop keeps its sticky summary
          column, so this is mobile-only. */}
      <div className="checkout-sticky-cta hide-desktop">
        <div>
          <span className="checkout-sticky-label">{t('Total')}</span>
          <span className="checkout-sticky-total">{formatUsd(step === 2 ? finalTotal : grandTotal())}</span>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            // Delegates to whichever CTA is mounted: the step-1 summary button
            // or the step-2 payment submit. If neither is present (payment
            // panel still initialising) do nothing rather than lie.
            const el = document.querySelector('[data-checkout-cta]') as HTMLButtonElement | null
            if (!el || el.disabled) return
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.click()
          }}
        >
          {ctas[step - 1]}
        </button>
      </div>

      {/* ── 8-hour cap modal ── */}
      {limitModalOpen && (
        <DailyLimitModal
          hoursByDate={hoursByDate()}
          onClose={() => setLimitModalOpen(false)}
        />
      )}

      {/* ── Cancellation policy, from the line under the pay button ── */}
      {legalOpen && <LegalModal kind="terms" answer="cancellation" onClose={() => setLegalOpen(false)} />}
    </div>
  )
}

/* ═══════════════════════════════════
   Daily limit modal, high-end, brand, mobile-first
   ═══════════════════════════════════ */
function DailyLimitModal({ hoursByDate, onClose }: {
  hoursByDate: Record<string, number>
  onClose: () => void
}) {
  const overDays = Object.entries(hoursByDate)
    .filter(([, hrs]) => hrs > DAILY_HOUR_LIMIT)
    .sort((a, b) => b[1] - a[1])

  // Same promise, same obligation: aria-modal without a trap tells a screen
  // reader the page behind does not exist, then lets Tab walk into it.
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, onClose)

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Day is over the hour limit"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(8, 8, 10, 0.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        animation: 'fadeUp 0.22s ease',
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440,
          background: 'var(--card-bg, #fff)',
          border: '1px solid rgba(255, 179, 0, 0.25)',
          borderRadius: 'var(--r-xl)',
          boxShadow: '0 24px 72px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255,179,0,0.06)',
          padding: '28px 26px 24px',
          margin: '0 auto',
          position: 'relative',
          animation: 'fadeUp 0.28s ease',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
        }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'rgba(255, 90, 54, 0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 18,
        }}>
          <span style={{ fontSize: 22 }}>🕐</span>
        </div>

        <h3 style={{
          fontFamily: 'var(--font-dm-sans)',
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
          marginBottom: 8,
          lineHeight: 1.2,
        }}>
          Let’s build two perfect days
        </h3>

        <p style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 14,
          lineHeight: 1.55,
          color: 'var(--text-secondary)',
          marginBottom: 20,
        }}>
          A day tops out at {DAILY_HOUR_LIMIT} hours so every experience lands with full energy, and one checkout books one day. Remove an experience below to continue, then book the rest as a second day when you are done.
        </p>

        {overDays.length > 0 && (
          <div style={{
            padding: '14px 16px',
            borderRadius: 'var(--r-md)',
            background: 'var(--bg-warm, rgba(255, 179, 0, 0.06))',
            border: '1px solid rgba(255, 179, 0, 0.18)',
            marginBottom: 22,
          }}>
            <p style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-tertiary)',
              marginBottom: 10,
            }}>
              Over capacity
            </p>
            {overDays.map(([date, hrs]) => {
              const pretty = date === 'unset'
                ? 'Unassigned day'
                : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              return (
                <div key={date} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 0',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                }}>
                  <span>{pretty}</span>
                  <span style={{
                    fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
                    color: 'var(--coral, #FF5A36)',
                  }}>
                    {hrs} / {DAILY_HOUR_LIMIT} hrs
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={onClose}
          className="btn-primary"
          style={{
            width: '100%', height: 48, fontSize: 14,
            fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
          }}
        >
          Adjust my trip
        </button>
      </div>
    </div>
  )
}

/**
 * What a guest needs to know about a tour, on the page where they are about
 * to pay for it.
 *
 * This lives in checkout rather than on a standalone tour page: the reel is
 * the browsing surface and stays uncluttered, and the detail is put in front
 * of someone at the moment it actually changes a decision — before paying,
 * and in time to pack for it.
 */
function TourDetails({ exp }: { exp: CartItem }) {
  const [open, setOpen] = useState(false)

  const groupMax = maxGroupSize(exp)
  const sections: { title: string; items: string[] }[] = [
    { title: 'Included', items: exp.included ?? [] },
    { title: 'Not included', items: exp.notIncluded ?? [] },
    { title: 'What to bring', items: exp.bring ?? [] },
    { title: 'Good to know', items: exp.additionalInfo ?? [] },
  ].filter((sec) => sec.items.length > 0)

  const hasFacts = !!(groupMax || exp.ages || exp.fitness || exp.about)
  if (!hasFacts && sections.length === 0) return null

  // What the guest would find inside, named from the blocks this tour
  // actually has. A bare "Tour details" row was being scrolled straight
  // past, because nothing on it said whether opening it was worth the tap.
  // Capped at three: the point is to prove there is substance underneath,
  // and a full table of contents is just another wall to skim.
  const preview = [
    exp.about ? "what you'll do" : null,
    exp.included?.length ? "what's included" : null,
    exp.bring?.length ? 'what to pack' : null,
    exp.ages || exp.fitness ? 'who it suits' : null,
    exp.additionalInfo?.length ? 'good to know' : null,
  ].filter(Boolean).slice(0, 3) as string[]
  const previewLine = preview.join(', ').replace(/^./, (c) => c.toUpperCase())

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '13px 22px', border: 'none', cursor: 'pointer',
          background: 'var(--bg-warm)',
          fontFamily: 'var(--font-dm-sans)', textAlign: 'left',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-warm)' }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'block', fontSize: 14, fontWeight: 700,
            color: 'var(--text-primary)', marginBottom: 2,
          }}>
            Tour details
          </span>
          <span style={{
            display: 'block', fontSize: 12, color: 'var(--text-tertiary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {open ? 'Tap to collapse' : previewLine}
          </span>
        </span>
        <span
          aria-hidden
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            border: '1px solid var(--border-strong)', background: 'var(--card-bg)',
            color: 'var(--text-primary)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.18s ease',
          }}
        >
          <ChevronDown size={15} />
        </span>
      </button>

      {open && (
        <div style={{ padding: '4px 22px 18px', background: 'var(--bg-warm)' }}>
          {exp.about && (
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 14 }}>
              {exp.about}
            </p>
          )}

          {(groupMax || exp.ages) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px', marginBottom: 14 }}>
              {groupMax && <DetailFact label="Group size" value={`Up to ${groupMax} people`} />}
              {exp.ages && <DetailFact label="Ages" value={exp.ages} />}
            </div>
          )}

          {exp.fitness && (
            <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 14 }}>
              {exp.fitness}
            </p>
          )}

          {sections.map((sec) => (
            <div key={sec.title} style={{ marginBottom: 14 }}>
              <p style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 6,
              }}>
                {sec.title}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sec.items.map((line) => (
                  <li key={line} style={{
                    position: 'relative', paddingLeft: 16, fontSize: 13.5, lineHeight: 1.6,
                    color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)',
                  }}>
                    <span aria-hidden style={{
                      position: 'absolute', left: 0, top: 8, width: 5, height: 5,
                      borderRadius: '50%', background: 'var(--gold-text)',
                    }} />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 2,
      }}>
        {label}
      </p>
      <p style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-dm-sans)' }}>{value}</p>
    </div>
  )
}
