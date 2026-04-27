'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Check, MapPin, Users, Calendar, Leaf, Lock, ShieldCheck } from 'lucide-react'
import { useCartStore, DAILY_HOUR_LIMIT } from '@/lib/cart'
import TripTimeBar from '@/components/TripTimeBar'
import { useAvailableReward, consumeReward } from '@/lib/tour-videos'
import { Award } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { calculateTransportation, GAS_PRICE_USD_PER_LITER, GAS_PRICE_JMD_PER_LITER, fetchGasPrice } from '@/lib/transportation'
import { Fuel, Car, Route } from 'lucide-react'

// Stripe SDK is ~80 KB gz — only load it when the user actually reaches
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
const jamaicaLocations = [
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
  { name: 'Norman Manley International Airport (KIN)', address: 'Palisadoes, Kingston' },
  { name: 'Sangster International Airport (MBJ)', address: 'Sunset Dr, Montego Bay, St. James' },
  { name: 'Kingston Cruise Terminal', address: 'Port Royal St, Kingston' },
  { name: 'Falmouth Cruise Port', address: 'Falmouth, Trelawny' },
  { name: 'Ocho Rios Cruise Port', address: 'Turtle Beach Rd, Ocho Rios, St. Ann' },
]

/* ── Step Indicator ── */
function StepIndicator({ step }: { step: number }) {
  const { t } = useI18n()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {['Review', 'Details', 'Payment'].map((rawLabel, i) => {
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
                background: done ? 'var(--accent)' : active ? '#fff' : 'var(--surface)',
                border: active ? '2px solid var(--accent)' : done ? 'none' : '1px solid var(--border)',
                color: done ? '#fff' : active ? 'var(--accent)' : 'var(--text-tertiary)',
                boxShadow: active ? '0 0 0 4px rgba(23,22,20,0.06)' : 'none',
              }}>
                {done ? <Check size={14} strokeWidth={3} /> : n}
              </div>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-dm-sans)', color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: active ? 600 : 400 }}>
                {label}
              </span>
            </div>
            {i < 2 && <div style={{ width: 48, height: 1.5, background: done ? 'var(--accent)' : 'var(--border)', margin: '0 10px', marginBottom: 22, borderRadius: 1 }} />}
          </div>
        )
      })}
    </div>
  )
}

/* ── Review Step ── */
function ReviewStep() {
  const { items, removeItem, updateDate } = useCartStore()
  const { t, formatPrice } = useI18n()
  const [customDates, setCustomDates] = useState(false)

  // Get the shared date from the first item
  const sharedDate = items[0]?.date || ''

  const setAllDates = (date: string) => {
    items.forEach((item) => updateDate(item.id, date))
  }

  return (
    <div>
      <div className="hide-mobile" style={{ marginBottom: 28 }}>
        <h3 style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 22, marginBottom: 6 }}>{t('Review your trip')}</h3>
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
          {/* Subtle gold hairline top — prestige cue */}
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
                fontSize: 11, fontWeight: 600,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
                marginBottom: 4,
              }}>
                Day Builder
              </p>
              <h3 style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 800,
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
        </div>
      )}

      {/* ── Trip date selector ── */}
      <div style={{
        borderRadius: 'var(--r-xl)', overflow: 'hidden',
        border: '1px solid var(--border)', background: '#fff',
        marginBottom: 24,
      }}>
        <div style={{
          padding: '18px 22px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: customDates ? '1px solid var(--border)' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Calendar size={18} color="var(--text-secondary)" />
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-dm-sans)' }}>
                {customDates ? t('Choose different dates for each tour') : t('Trip date')}
              </span>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 1 }}>
                {customDates ? t('Each experience can be on a different day') : t('All experiences on the same day')}
              </p>
            </div>
          </div>
          {!customDates && (
            <input
              type="date"
              value={sharedDate}
              onChange={(e) => setAllDates(e.target.value)}
              className="field-input"
              style={{ maxWidth: 160, height: 40, fontSize: 13 }}
            />
          )}
        </div>

        {/* Individual dates when custom mode is on */}
        {customDates && items.map((item, i) => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 22px',
            borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t(item.title)}</p>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 1 }}>
                {item.destination} · {item.duration}
              </p>
            </div>
            <input
              type="date"
              value={item.date}
              onChange={(e) => updateDate(item.id, e.target.value)}
              className="field-input"
              style={{ maxWidth: 155, height: 38, fontSize: 13, flexShrink: 0, marginLeft: 16 }}
            />
          </div>
        ))}

        {/* Toggle */}
        <div style={{
          padding: '12px 22px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-warm)',
        }}>
          <button
            onClick={() => {
              if (customDates) {
                setAllDates(items[0]?.date || sharedDate)
              }
              setCustomDates(!customDates)
            }}
            style={{
              width: '100%',
              padding: '12px 18px',
              borderRadius: 'var(--r-md)',
              background: customDates ? 'var(--accent)' : 'var(--surface)',
              border: customDates ? 'none' : '1px solid var(--border)',
              cursor: 'pointer',
              fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
              color: customDates ? 'white' : 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.2s ease',
            }}
          >
            <Calendar size={14} />
            {customDates ? t('Use same date for all tours') : t('Choose different dates for each tour')}
          </button>
        </div>
      </div>

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
                    <h4 style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 16, marginBottom: 4, lineHeight: 1.25 }}>{t(item.title)}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
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

            {/* Footer — date + price */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 22px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-warm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
                <Calendar size={13} />
                <span>{new Date(item.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 18 }}>
                  {formatPrice(item.price * item.travelers)}
                </span>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 1 }}>
                  {formatPrice(item.price)} × {item.travelers}
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
  const { items, updateTravelers, setPickup, setDropoff } = useCartStore()
  const { t } = useI18n()
  const [modalContent, setModalContent] = useState<'waiver' | 'terms' | null>(null)

  const updateField = (key: string, value: string) => {
    setFormData({ ...formData, [key]: value })
    if (key === 'pickup') setPickup(value)
    if (key === 'dropoff') setDropoff(value)
  }
  return (
    <div>
      <div className="hide-mobile" style={{ marginBottom: 28 }}>
        <h3 style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 22, marginBottom: 6 }}>{t('Your details')}</h3>
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
          We&apos;ll use this to confirm your booking
        </p>
      </div>

      {/* Single guest count for all experiences */}
      <div style={{
        borderRadius: 'var(--r-xl)', overflow: 'hidden',
        border: '1px solid var(--border)', background: '#fff',
        marginBottom: 24,
        padding: '18px 22px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users size={18} color="var(--text-secondary)" />
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-dm-sans)' }}>{t('Number of guests')}</span>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 1 }}>
              Applies to all {items.length} experience{items.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button className="btn-outline" style={{ width: 38, height: 38, padding: 0, borderRadius: '10px 0 0 10px', fontSize: 16 }} onClick={() => items.forEach((item) => updateTravelers(item.id, item.travelers - 1))}>−</button>
          <div style={{ width: 52, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-dm-sans)' }}>
            {items[0]?.travelers || 2}
          </div>
          <button className="btn-outline" style={{ width: 38, height: 38, padding: 0, borderRadius: '0 10px 10px 0', fontSize: 16 }} onClick={() => items.forEach((item) => updateTravelers(item.id, item.travelers + 1))}>+</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { key: 'firstName', label: 'First Name', placeholder: 'First name', span: 1, auto: 'given-name' },
          { key: 'lastName', label: 'Last Name', placeholder: 'Last name', span: 1, auto: 'family-name' },
          { key: 'email', label: 'Email', placeholder: 'you@email.com', span: 2, type: 'email', auto: 'email' },
          { key: 'phone', label: 'Phone', placeholder: '+1 (555) 000-0000', span: 1, type: 'tel', auto: 'tel' },
        ].map((f) => (
          <div key={f.key} data-field={f.key} style={{ gridColumn: f.span === 2 ? 'span 2' : undefined }}>
            <label style={{ fontSize: 12.5, color: formErrors[f.key] ? '#c00' : 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
              {f.label} {formErrors[f.key] && <span style={{ fontWeight: 400 }}>- {f.key === 'email' && formData[f.key]?.trim() ? 'invalid email' : f.key === 'phone' && formData[f.key]?.trim() ? 'invalid phone' : 'required'}</span>}
            </label>
            <input
              className="field-input"
              type={f.type || 'text'}
              name={f.key}
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
          <label style={{ fontSize: 12.5, color: formErrors['country'] ? '#c00' : 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            Country {formErrors['country'] && <span style={{ fontWeight: 400 }}>- required</span>}
          </label>
          <select
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
        {/* ── Pickup & Drop-off — Prominent Section ── */}
        <div style={{
          gridColumn: 'span 2',
          marginTop: 8,
          padding: '20px',
          borderRadius: 'var(--r-lg)',
          background: 'var(--bg-warm)',
          border: '1px solid var(--border)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--accent)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <MapPin size={18} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-syne)', color: 'var(--text-primary)' }}>
                {t('Transportation Details')}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 1 }}>
                {t('We\'ll arrange your pickup and return')}
              </p>
            </div>
          </div>

          {/* Pickup */}
          <div data-field="pickup" style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12.5, color: formErrors['pickup'] ? '#c00' : 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: formErrors['pickup'] ? '#c00' : 'var(--emerald)', flexShrink: 0 }} />
              {t('Pickup Location')} {formErrors['pickup'] && <span style={{ fontWeight: 400 }}>- required</span>}
            </label>
            <input
              className="field-input"
              placeholder={t('Search hotel, resort, or airport...')}
              value={formData['pickup'] || ''}
              onChange={(e) => updateField('pickup', e.target.value)}
              list="jamaica-locations-pickup"
              style={{ height: 50, fontSize: 15, background: '#fff', fontWeight: 500, borderColor: formErrors['pickup'] ? 'rgba(200,0,0,0.4)' : undefined }}
            />
            {formData['pickup'] && jamaicaLocations.find(l => l.name === formData['pickup']) && (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 6, paddingLeft: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={11} color="var(--text-tertiary)" />
                {jamaicaLocations.find(l => l.name === formData['pickup'])?.address}
              </p>
            )}
          </div>

          {/* Visual connector */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px 3px',
          }}>
            <div style={{ width: 2, height: 20, background: 'var(--border-strong)', borderRadius: 1, marginLeft: 3 }} />
          </div>

          {/* Drop-off */}
          <div data-field="dropoff">
            <label style={{ fontSize: 12.5, color: formErrors['dropoff'] ? '#c00' : 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: formErrors['dropoff'] ? '#c00' : 'var(--gold)', flexShrink: 0 }} />
              {t('Drop-off Location')} {formErrors['dropoff'] && <span style={{ fontWeight: 400 }}>- required</span>}
            </label>
            <input
              className="field-input"
              placeholder={t('Same as pickup or different location...')}
              value={formData['dropoff'] || ''}
              onChange={(e) => updateField('dropoff', e.target.value)}
              list="jamaica-locations-dropoff"
              style={{ height: 50, fontSize: 15, background: '#fff', fontWeight: 500, borderColor: formErrors['dropoff'] ? 'rgba(200,0,0,0.4)' : undefined }}
            />
            {formData['dropoff'] && jamaicaLocations.find(l => l.name === formData['dropoff']) && (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 6, paddingLeft: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={11} color="var(--text-tertiary)" />
                {jamaicaLocations.find(l => l.name === formData['dropoff'])?.address}
              </p>
            )}
          </div>
        </div>

        {/* Autofill datalists for Jamaica locations */}
        <datalist id="jamaica-locations-pickup">
          {jamaicaLocations.map((loc) => (
            <option key={loc.name} value={loc.name}>{loc.address}</option>
          ))}
        </datalist>
        <datalist id="jamaica-locations-dropoff">
          {jamaicaLocations.map((loc) => (
            <option key={loc.name} value={loc.name}>{loc.address}</option>
          ))}
        </datalist>

        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Special Requests</label>
          <textarea className="field-input" placeholder="Dietary restrictions, accessibility needs, anything we should know..." rows={4} />
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
        <label style={{ display: 'flex', gap: 12, cursor: 'pointer', alignItems: 'flex-start' }}>
          <div style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
            border: waiverAccepted ? 'none' : `2px solid ${waiverError ? 'rgba(200,0,0,0.5)' : 'var(--border-strong)'}`,
            background: waiverAccepted ? 'var(--accent)' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}>
            {waiverAccepted && <Check size={14} strokeWidth={3} color="#fff" />}
          </div>
          <input
            type="checkbox"
            checked={waiverAccepted}
            onChange={(e) => setWaiverAccepted(e.target.checked)}
            style={{ display: 'none' }}
          />
          <div>
            <p style={{ fontSize: 13.5, fontFamily: 'var(--font-dm-sans)', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 4 }}>
              Activity Waiver & Release
            </p>
            <p style={{ fontSize: 12.5, fontFamily: 'var(--font-dm-sans)', color: 'var(--text-tertiary)', lineHeight: 1.55 }}>
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

      {/* ── Legal Modal ── */}
      {modalContent && (
        <>
          <div
            onClick={() => setModalContent(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
              zIndex: 1000, animation: 'fadeIn 0.2s ease',
            }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90%', maxWidth: 600, maxHeight: '80vh',
            background: '#fff', borderRadius: 'var(--r-xl)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
            zIndex: 1001, display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Modal header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <h3 style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 18 }}>
                {modalContent === 'waiver' ? 'Activity Waiver & Release of Liability' : 'Terms of Service'}
              </h3>
              <button
                onClick={() => setModalContent(null)}
                style={{
                  width: 34, height: 34, borderRadius: '50%',
                  border: '1px solid var(--border)', background: '#fff',
                  cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-secondary)', fontSize: 18,
                }}
              >×</button>
            </div>

            {/* Modal body */}
            <div className="no-scrollbar" style={{
              padding: '24px', overflowY: 'auto', flex: 1,
              fontSize: 13.5, fontFamily: 'var(--font-dm-sans)',
              color: 'var(--text-secondary)', lineHeight: 1.7,
            }}>
              {modalContent === 'waiver' ? (
                <>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>MAPL Tours Jamaica - Activity Waiver & Release of Liability</p>
                  <p style={{ marginBottom: 12 }}>Effective Date: January 1, 2025</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>1. Acknowledgment of Risk</p>
                  <p style={{ marginBottom: 16 }}>I understand that the experiences offered through MAPL Tours Jamaica involve physical activities that carry inherent risks, including but not limited to: cliff diving, waterfall climbing, bamboo rafting, snorkeling, hiking through mountainous terrain, swimming in natural bodies of water, and participation in cultural activities. I acknowledge that these activities may result in injury, illness, or in rare cases, death.</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>2. Assumption of Risk</p>
                  <p style={{ marginBottom: 16 }}>I voluntarily assume all risks associated with participating in any experience booked through MAPL Tours Jamaica, including risks arising from the negligence of MAPL Tours Jamaica, its partners, guides, affiliates, and local experience creators. I understand that natural environments in Jamaica may present hazards including uneven terrain, strong currents, wildlife, weather changes, and remote locations with limited medical access.</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>3. Release of Liability</p>
                  <p style={{ marginBottom: 16 }}>I hereby release, discharge, and hold harmless MAPL Tours Jamaica, MAPL Tech, its officers, employees, agents, partners, and local experience creators from any and all claims, demands, or causes of action arising out of or related to any loss, damage, or injury sustained during or as a result of participation in any booked experience.</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>4. Medical Fitness</p>
                  <p style={{ marginBottom: 16 }}>I certify that I am physically fit and have no medical conditions that would prevent my participation in the booked activities. I agree to inform my experience guide of any medical conditions, allergies, or physical limitations prior to the start of any activity. If I am booking on behalf of minors, I certify that they are also fit to participate and I accept responsibility for their safety.</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>5. Photo & Video Consent</p>
                  <p style={{ marginBottom: 16 }}>I grant MAPL Tours Jamaica permission to use photographs and video recordings taken during my experience for promotional purposes, including social media, website content, and marketing materials, unless I notify my guide in writing before the activity begins.</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>6. Governing Law</p>
                  <p style={{ marginBottom: 16 }}>This waiver shall be governed by the laws of Jamaica. Any disputes arising from this agreement shall be resolved in the courts of Kingston, Jamaica.</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>7. Severability</p>
                  <p>If any provision of this waiver is found to be unenforceable, the remaining provisions shall continue in full force and effect. By checking the waiver box during checkout, you acknowledge that you have read, understood, and agree to be bound by the terms of this Activity Waiver & Release of Liability.</p>
                </>
              ) : (
                <>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>MAPL Tours Jamaica - Terms of Service</p>
                  <p style={{ marginBottom: 12 }}>Effective Date: January 1, 2025</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>1. About MAPL Tours Jamaica</p>
                  <p style={{ marginBottom: 16 }}>MAPL Tours Jamaica is a product of MAPL Tech. We operate an online platform that connects travelers with curated, locally-created experiences across Jamaica. We act as an intermediary between you (the &ldquo;Guest&rdquo;) and independent local experience creators (the &ldquo;Creators&rdquo;). MAPL Tours Jamaica does not directly provide the experiences listed on our platform.</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>2. Booking & Payment</p>
                  <p style={{ marginBottom: 16 }}>All prices are listed in USD. A service fee is applied to all transactions to cover your tour guide, platform costs, and customer support. Payment is processed securely through Stripe. Your card will be charged at the time of booking. You will receive a confirmation email with your booking details, meeting point, and creator contact information within 24 hours.</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>3. Cancellation & Refunds</p>
                  <p style={{ marginBottom: 16 }}>Free cancellation is available within 48 hours of booking for a full refund. Cancellations made more than 48 hours after booking but at least 7 days before the experience date will receive a 50% refund. Cancellations made less than 7 days before the experience date are non-refundable. If a Creator cancels an experience, you will receive a full refund or the option to rebook. Weather-related cancellations will be rescheduled at no additional cost.</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>4. Guest Responsibilities</p>
                  <p style={{ marginBottom: 16 }}>Guests must arrive at the designated meeting point on time. Guests must follow all safety instructions provided by the Creator or guide. Guests must be of legal drinking age to participate in experiences involving alcohol. Guests are responsible for their own travel insurance and personal belongings. Guests must treat Creators, local communities, and the natural environment with respect.</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>5. Creator Responsibilities</p>
                  <p style={{ marginBottom: 16 }}>All Creators on the MAPL Tours Jamaica platform are vetted and approved by our team. Creators are required to maintain valid insurance, certifications, and licenses where applicable. Creators are responsible for providing the experience as described on the platform. MAPL Tours Jamaica reserves the right to remove any Creator who fails to meet our quality standards.</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>6. Intellectual Property</p>
                  <p style={{ marginBottom: 16 }}>All content on the MAPL Tours Jamaica platform, including text, images, videos, logos, and design elements, is the property of MAPL Tech and is protected by copyright law. User-generated content, including reviews and comments, grants MAPL Tours Jamaica a non-exclusive, royalty-free license to use, display, and distribute such content.</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>7. Limitation of Liability</p>
                  <p style={{ marginBottom: 16 }}>MAPL Tours Jamaica shall not be liable for any indirect, incidental, special, or consequential damages arising from the use of our platform or participation in any experience. Our total liability shall not exceed the amount paid for the specific experience in question.</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>8. Privacy</p>
                  <p style={{ marginBottom: 16 }}>We collect and process personal data in accordance with our Privacy Policy. By using our platform, you consent to the collection and processing of your data as described therein. We do not sell your personal data to third parties.</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>9. Governing Law</p>
                  <p style={{ marginBottom: 16 }}>These Terms of Service shall be governed by the laws of Jamaica. Any disputes shall be resolved in the courts of Kingston, Jamaica.</p>

                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>10. Changes to Terms</p>
                  <p>MAPL Tours Jamaica reserves the right to modify these Terms of Service at any time. Continued use of the platform after changes constitutes acceptance of the updated terms. Users will be notified of material changes via email.</p>
                </>
              )}
            </div>

            {/* Modal footer */}
            <div style={{
              padding: '16px 24px', borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'flex-end',
              flexShrink: 0,
            }}>
              <button
                className="btn-primary"
                onClick={() => setModalContent(null)}
                style={{ height: 40, padding: '0 24px', fontSize: 13 }}
              >
                I understand
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ── Confirmed ── */
function ConfirmedView() {
  const { items, grandTotal, clearCart } = useCartStore()
  const { t, formatPrice } = useI18n()
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

      <h1 style={{ fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 32, marginBottom: 8, letterSpacing: '-0.02em' }}>{t('Booking Confirmed')}</h1>
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
                {formatPrice(item.price * item.travelers)}
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
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 22 }}>{formatPrice(total)}</span>
        </div>
      </div>

      <button className="btn-primary" onClick={() => { clearCart(); router.push('/') }} style={{ height: 48, padding: '0 36px', fontSize: 15 }}>
        Explore more experiences →
      </button>

      <p style={{ marginTop: 16, fontSize: 12.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
        Free cancellation within 48 hours · No problem.
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
  const [waiverAccepted, setWaiverAccepted] = useState(false)
  const [waiverError, setWaiverError] = useState(false)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({})
  const [stripeError, setStripeError] = useState<string | null>(null)
  const [gasRate, setGasRate] = useState({ usd: GAS_PRICE_USD_PER_LITER, jmd: GAS_PRICE_JMD_PER_LITER })
  const [limitModalOpen, setLimitModalOpen] = useState(false)
  const { items, subtotal, fee, grandTotal, isDayOverLimit, hoursByDate } = useCartStore()
  const { t, formatPrice } = useI18n()

  // Fetch live gas price on mount
  useEffect(() => {
    fetchGasPrice().then((rate) => setGasRate(rate))
  }, [])

  // ── Transportation cost calculation ──
  // Default pickup: Sangster International Airport (most common entry point)
  const pickupLoc = formData['pickup'] || 'Sangster International Airport (MBJ)'
  const dropoffLoc = formData['dropoff'] || pickupLoc
  const transportCost = calculateTransportation(
    pickupLoc,
    items.map((i) => ({ destination: i.destination, date: i.date })),
    dropoffLoc
  )

  const transportTotal = transportCost?.totalTransportUsd || 0
  const baseTotal = grandTotal() + transportTotal

  // ── Video-reward discount (auto-applied when the user has one unused) ──
  const availableReward = useAvailableReward()
  const [rewardApplied, setRewardApplied] = useState(true)
  const activeReward = rewardApplied ? availableReward : null
  const rewardDiscount = activeReward
    ? Math.round(baseTotal * (activeReward.percent / 100))
    : 0
  const finalTotal = Math.max(0, baseTotal - rewardDiscount)

  // Create PaymentIntent when moving to step 3. The server inserts a pending
  // `bookings` row (plus line items), hashes the cart for idempotency, and
  // attaches booking_id to the PaymentIntent metadata so the webhook can
  // flip status to 'paid' and dispatch the confirmation email.
  useEffect(() => {
    if (step === 3 && !clientSecret && items.length > 0) {
      fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: finalTotal,
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
            dropoff: formData['dropoff'],
            specialRequests: formData['specialRequests'],
          },
          breakdown: {
            subtotal: subtotal(),
            fee: fee(),
            transport: transportTotal,
            rewardDiscount: rewardDiscount,
          },
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setStripeError(data.error)
          } else {
            setClientSecret(data.clientSecret)
          }
        })
        .catch(() => setStripeError('Failed to initialize payment. Please try again.'))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, clientSecret, items, grandTotal])

  if (confirmed) return <ConfirmedView />

  if (items.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', paddingTop: 72, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Leaf size={24} color="var(--text-tertiary)" />
        </div>
        <p style={{ fontSize: 20, fontFamily: 'var(--font-syne)', fontWeight: 700, marginBottom: 8 }}>{t('Your itinerary is empty')}</p>
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 24, maxWidth: 300 }}>Start exploring Jamaica and add experiences to build your trip</p>
        <Link href="/" className="btn-primary" style={{ height: 46, padding: '0 28px', fontSize: 14 }}>{t('Browse experiences')}</Link>
      </div>
    )
  }

  const ctas = [`${t('Continue to details')} →`, `${t('Continue to payment')} →`, `${t('Complete booking')} · ${formatPrice(finalTotal)}`]

  return (
    <div className="checkout-wrapper" style={{ minHeight: '100vh', paddingTop: 56, background: step === 3 ? 'var(--bg)' : 'var(--bg-warm)' }}>
      {/* Top bar */}
      <div style={{ borderBottom: '1px solid var(--border)', background: '#fff' }}>
        <div className="container checkout-top-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', maxWidth: 1100 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontFamily: 'var(--font-dm-sans)', fontWeight: 500, color: 'var(--text-secondary)', transition: 'color 0.15s ease' }}>
            <ArrowLeft size={15} /> Back
          </Link>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 18 }}>{t('Checkout')}</h2>
          </div>
          <div className="hide-mobile"><StepIndicator step={step} /></div>
        </div>
      </div>

      {/* Mobile step label */}
      <div className="hide-desktop container" style={{ paddingTop: 16, paddingBottom: 4 }}>
        <p style={{ fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gold)', marginBottom: 4 }}>
          Step {step} of 3
        </p>
        <h3 style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 22 }}>
          {step === 1 ? t('Review your trip') : step === 2 ? t('Your details') : 'Payment'}
        </h3>
      </div>

      {/* Body */}
      <div className={`checkout-body${step === 3 ? ' checkout-step-3' : ''}`}>
        {/* Left — form */}
        <div className={step === 3 ? 'checkout-payment-form' : ''} style={{ flex: 1, maxWidth: 640 }}>
          {step === 1 && <ReviewStep />}
          {step === 2 && <DetailsStep waiverAccepted={waiverAccepted} setWaiverAccepted={setWaiverAccepted} waiverError={waiverError} formData={formData} setFormData={setFormData} formErrors={formErrors} />}
          {step === 3 && (
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
                  // No setConfirmed(true) — StripePaymentPanel navigates the
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
          {step > 1 && step < 3 && (
            <button className="btn-outline" onClick={() => { setStep(step - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }} style={{ marginTop: 24, gap: 6 }}>
              <ArrowLeft size={14} /> Previous step
            </button>
          )}
          {step === 3 && (
            <button className="btn-outline" onClick={() => { setStep(2); setClientSecret(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }} style={{ marginTop: 24, gap: 6 }}>
              <ArrowLeft size={14} /> Previous step
            </button>
          )}
        </div>

        {/* Right — summary */}
        <div className="checkout-summary" style={{ width: '100%', maxWidth: 340, flexShrink: 0, position: 'sticky', top: 120, alignSelf: 'flex-start' }}>
          <div style={{
            borderRadius: 'var(--r-xl)', overflow: 'hidden',
            border: '1px solid var(--border)', background: '#fff',
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <h4 style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{t('Order Summary')}</h4>
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
                    <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>{item.travelers} × {formatPrice(item.price)}</p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-dm-sans)', flexShrink: 0 }}>
                    {formatPrice(item.price * item.travelers)}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ padding: '16px 24px', background: 'var(--bg-warm)', borderTop: '1px solid var(--border)' }}>
              {[{ l: t('Subtotal'), v: subtotal() }, { l: t('Service fee'), v: fee() }].map((r) => (
                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontFamily: 'var(--font-dm-sans)', color: 'var(--text-secondary)', marginBottom: 6 }}>
                  <span>{r.l}</span><span>{formatPrice(r.v)}</span>
                </div>
              ))}

              {/* ── Transportation & Fuel (payment step only) ── */}
              {step === 3 && transportCost && (
                <div style={{ marginTop: 12, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  {/* Section header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Car size={15} color="#fff" />
                      </div>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-dm-sans)', color: 'var(--text-primary)', display: 'block', lineHeight: 1.2 }}>
                          Private Transport
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
                          Door-to-door service
                        </span>
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
                      color: 'var(--emerald)', background: 'var(--emerald-dim)',
                      padding: '4px 12px', borderRadius: 9999,
                    }}>
                      {transportCost.rentalDays} day{transportCost.rentalDays > 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Route itinerary — per-day cards */}
                  {transportCost.dayBreakdowns.map((day, idx) => (
                    <div key={day.date} style={{
                      marginBottom: 10, padding: '14px 16px',
                      borderRadius: 'var(--r-md)',
                      background: idx % 2 === 0 ? 'var(--bg-warm)' : '#fff',
                      border: '1px solid var(--border)',
                    }}>
                      {/* Day header */}
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Calendar size={13} color="var(--text-secondary)" />
                          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-dm-sans)', color: 'var(--text-primary)' }}>
                            {transportCost.isMultiDay
                              ? `Day ${idx + 1} · ${new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
                              : new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                            }
                          </span>
                        </div>
                      </div>

                      {/* Route visualization */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                        {/* Route dots */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4, flexShrink: 0 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--emerald)' }} />
                          {day.destinations.map((_, i) => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{ width: 1.5, height: 14, background: 'var(--border-strong)' }} />
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)' }} />
                            </div>
                          ))}
                          <div style={{ width: 1.5, height: 14, background: 'var(--border-strong)' }} />
                          <div style={{ width: 8, height: 8, borderRadius: '50%', border: '2px solid var(--emerald)', background: '#fff' }} />
                        </div>
                        {/* Route labels */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {formData['pickup'] || 'Sangster Airport (MBJ)'}
                          </p>
                          {day.destinations.map((dest, i) => (
                            <p key={i} style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', color: 'var(--text-primary)', marginBottom: 4, marginTop: 10 }}>
                              {dest}
                            </p>
                          ))}
                          <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {formData['dropoff'] || formData['pickup'] || 'Sangster Airport (MBJ)'}
                          </p>
                        </div>
                      </div>

                      {/* Day stats */}
                      <div style={{
                        display: 'flex', gap: 0, borderTop: '1px solid var(--border)', paddingTop: 10,
                      }}>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Route size={12} color="var(--text-tertiary)" />
                          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}>
                            {day.distanceKm} km
                          </span>
                        </div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Fuel size={12} color="var(--text-tertiary)" />
                          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}>
                            {day.litersNeeded}L
                          </span>
                        </div>
                        <div style={{ flex: 1, textAlign: 'right' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-dm-sans)', color: 'var(--text-primary)' }}>
                            {formatPrice(day.fuelCost)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Cost summary rows */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontFamily: 'var(--font-dm-sans)', color: 'var(--text-secondary)', marginBottom: 6 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Car size={13} color="var(--text-tertiary)" />
                        Vehicle rental · {transportCost.rentalDays} day{transportCost.rentalDays > 1 ? 's' : ''}
                      </span>
                      <span style={{ fontWeight: 600 }}>{formatPrice(transportCost.rentalCostUsd)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontFamily: 'var(--font-dm-sans)', color: 'var(--text-secondary)', marginBottom: 6 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Fuel size={13} color="var(--text-tertiary)" />
                        Fuel · {transportCost.totalDistanceKm} km · {transportCost.litersNeeded}L
                      </span>
                      <span style={{ fontWeight: 600 }}>{formatPrice(transportCost.fuelCostUsd)}</span>
                    </div>
                    <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--emerald)', flexShrink: 0 }} />
                      J${gasRate.jmd}/L (${gasRate.usd}/L USD) · Petrojam live pricing
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14.5, fontFamily: 'var(--font-dm-sans)', fontWeight: 700, color: 'var(--text-primary)', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      <span>Transport</span>
                      <span>{formatPrice(transportCost.totalTransportUsd)}</span>
                    </div>
                  </div>
                </div>
              )}

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
                      fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 13.5,
                      color: 'var(--text-primary)', letterSpacing: '-0.005em',
                    }}>
                      {availableReward.percent}% MAPL reward
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: 11.5,
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

              {rewardApplied && availableReward && rewardDiscount > 0 && step === 3 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  marginTop: 10, fontSize: 13.5,
                  fontFamily: 'var(--font-dm-sans)', fontWeight: 600,
                  color: 'var(--emerald, #00A550)',
                }}>
                  <span>Reward discount</span>
                  <span>−{formatPrice(rewardDiscount)}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 20, marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <span>{t('Total')}</span><span>{formatPrice(step === 3 ? finalTotal : grandTotal())}</span>
              </div>
            </div>

            {step < 3 && (
              <div style={{ padding: '16px 24px' }}>
                <button className="btn-primary" onClick={() => {
                  // Hard gate: every step must pass the 8-hour daily cap.
                  if (isDayOverLimit()) {
                    setLimitModalOpen(true)
                    return
                  }
                  if (step === 2) {
                    // Validate required fields
                    const required = ['firstName', 'lastName', 'email', 'phone', 'country', 'pickup', 'dropoff']
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
                    // Phone validation — at least 7 digits
                    if (formData['phone']?.trim() && formData['phone'].replace(/\D/g, '').length < 7) {
                      errors['phone'] = true
                      hasError = true
                    }
                    setFormErrors(errors)

                    if (!waiverAccepted) {
                      setWaiverError(true)
                      hasError = true
                    } else {
                      setWaiverError(false)
                    }

                    if (hasError) {
                      // Scroll to first error field
                      setTimeout(() => {
                        const firstErrorKey = required.find((key) => errors[key])
                        if (firstErrorKey) {
                          const el = document.querySelector(`[data-field="${firstErrorKey}"]`) as HTMLElement
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        } else if (!waiverAccepted) {
                          const waiver = document.querySelector('[data-field="waiver"]') as HTMLElement
                          if (waiver) waiver.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }
                      }, 100)
                      return
                    }
                  }
                  setWaiverError(false)
                  setFormErrors({})
                  setStep(step + 1)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }} style={{ width: '100%', height: 48, fontSize: 14 }}>
                  {ctas[step - 1]}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
                  <Lock size={11} />
                  <span>Secure checkout · Free cancellation 48hrs</span>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── 8-hour cap modal ── */}
      {limitModalOpen && (
        <DailyLimitModal
          hoursByDate={hoursByDate()}
          onClose={() => setLimitModalOpen(false)}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════
   Daily limit modal — high-end, brand, mobile-first
   ═══════════════════════════════════ */
function DailyLimitModal({ hoursByDate, onClose }: {
  hoursByDate: Record<string, number>
  onClose: () => void
}) {
  const overDays = Object.entries(hoursByDate)
    .filter(([, hrs]) => hrs > DAILY_HOUR_LIMIT)
    .sort((a, b) => b[1] - a[1])

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
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
          fontFamily: 'var(--font-syne)',
          fontWeight: 800,
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
          fontSize: 14.5,
          lineHeight: 1.55,
          color: 'var(--text-secondary)',
          marginBottom: 20,
        }}>
          A perfect day tops out at {DAILY_HOUR_LIMIT} hours so every experience lands with full energy. Split your picks across another day, or remove one to continue.
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
              fontSize: 11,
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
                  fontSize: 13.5,
                  color: 'var(--text-primary)',
                }}>
                  <span>{pretty}</span>
                  <span style={{
                    fontFamily: 'var(--font-syne)', fontWeight: 700,
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
