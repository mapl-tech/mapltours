'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Award, Car, CalendarDays, Check, ChevronDown, MapPin, MessageCircle,
  Phone, Plane, ShieldCheck, UserRound,
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'

import Avatar from './Avatar'
import EmptyState from './ui/EmptyState'
import { experiences, slugify } from '@/lib/experiences'
import { DESTINATIONS } from '@/lib/images'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { useSaved } from '@/lib/supabase/saved'
import { useSwrCache } from '@/lib/swr-cache'
import { useMyVideoProgress, VIDEO_REWARD_MILESTONE } from '@/lib/tour-videos'
import { normalizeSocialHandle } from '@/lib/social-handle'
import { quoteRefund, formatCents } from '@/lib/refund-pricing'
import {
  bookingRef, countdownLabel, formatLongDate, formatTripDate, guestLabel,
  isTransfer, isUnfiled, itemImage, itemParish, latestDate, nextTrip,
  paymentLabel, profileStats, readableTitle, splitBookings, todayInJamaica,
  transferLegs, type ProfileBooking, type ProfileBookingItem, type ProfileDriver,
} from '@/lib/profile-data'

/**
 * The signed-in guest's trips.
 *
 * This page used to open with an account settings form: a 28px "Personal
 * information" heading sat above the guest's actual trips at 22px, so its
 * typography said that editing a phone number mattered more than the trip
 * they had paid for. It now opens with the trip, and the form is the last
 * thing on the page rather than the first.
 *
 * Everything derived from bookings lives in lib/profile-data.ts and is unit
 * tested there, because the derivations are where the bugs were: an undated
 * booking used to vanish, a booking with no line items used to crash the
 * page, and "Parishes" counted hotel names.
 */

const supabase = createClient()
const FONT = 'var(--font-dm-sans)'
const DANGER = '#b00020'

interface Badge { badge_name: string; earned_at: string }

interface ProfileData {
  name: string | null
  avatar_url: string | null
  location: string | null
  /** Typed or TikTok-verified social handle (migration 026). */
  social_handle?: string | null
  /** Set only by the TikTok Login Kit callback. */
  tiktok_username?: string | null
  /** Set on link even when TikTok has not yet released the username, so
   *  "connected" must key on this, not on the username. */
  tiktok_connected_at?: string | null
}

interface ProfileBundle {
  profile: ProfileData
  bookings: ProfileBooking[]
  badges: Badge[]
  likedCount: number
}

const EMPTY_PROFILE: ProfileData = { name: null, avatar_url: null, location: null }
const EMPTY_BUNDLE: ProfileBundle = { profile: EMPTY_PROFILE, bookings: [], badges: [], likedCount: 0 }

/* ─────────────────────────────────────────────────────────────────────────
   Small shared pieces
   ───────────────────────────────────────────────────────────────────────── */

/** Kicker over an h2. Seven 40px headings in a 700px column out-shout the h1. */
function Section({ kicker, title, aside, children }: {
  kicker: string; title: string; aside?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <p className="pf-eyebrow" style={{ marginBottom: 4 }}>{kicker}</p>
          <h2 className="pf-h2">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'go' | 'warn' | 'off' }) {
  const map = {
    // Every one of these is a measured AAA pair on its own ground.
    neutral: { bg: 'var(--surface)', fg: 'var(--text-secondary)' },
    go: { bg: 'var(--emerald-dim)', fg: 'var(--emerald)' },
    warn: { bg: 'rgba(176,0,32,0.07)', fg: DANGER },
    off: { bg: 'var(--surface)', fg: 'var(--text-tertiary)' },
  }[tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 11px', borderRadius: 9999,
      background: map.bg, color: map.fg,
      fontFamily: FONT, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

/** A labelled fact. The page is mostly these, so they are defined once. */
function Fact({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
      {icon && <span aria-hidden style={{ flexShrink: 0, marginTop: 2, color: 'var(--text-tertiary)', display: 'flex' }}>{icon}</span>}
      <div style={{ minWidth: 0 }}>
        <p className="pf-eyebrow" style={{ marginBottom: 2 }}>{label}</p>
        <div className="pf-wrap" style={{ fontFamily: FONT, fontSize: 14.5, color: 'var(--text-primary)', lineHeight: 1.45 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * The picture for a booked item, or an honest panel when there is not one.
 *
 * The version this replaces fell back to `experiences[0].image`, so every
 * airport transfer rendered the Rick's Cafe cliff-diving photo: a guest saw a
 * cliff dive where their ride to the hotel should be.
 */
function TripMedia({ item, sizes }: { item: ProfileBookingItem; sizes: string }) {
  const src = itemImage(item)
  if (src) {
    // alt="" because the title is rendered as text directly beside it; naming
    // it twice makes a screen reader say everything on this page twice.
    return <Image src={src} alt="" fill sizes={sizes} style={{ objectFit: 'cover' }} />
  }
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'var(--surface)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
    }}>
      {isTransfer(item)
        ? <Car aria-hidden size={26} color="var(--text-tertiary)" strokeWidth={1.7} />
        : <MapPin aria-hidden size={26} color="var(--text-tertiary)" strokeWidth={1.7} />}
      <span className="pf-eyebrow">{isTransfer(item) ? 'Airport transfer' : 'Tour'}</span>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Driver
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Who is picking you up.
 *
 * The old page promised "Confirm your details so your driver knows who to
 * meet" and then showed nothing about the driver at all. These columns have
 * existed since migration 009; the route releases them on the operator's
 * schedule and never ahead of it, so before dispatch this says when they
 * arrive rather than showing an empty block.
 */
function DriverBlock({ driver }: { driver: ProfileDriver | null | undefined }) {
  if (!driver) {
    return (
      <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        Your driver&rsquo;s name, vehicle and plate reach you before pickup, by email and here.
      </p>
    )
  }
  const vehicle = [driver.vehicle, driver.plate].filter(Boolean).join(' · ')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Fact icon={<UserRound size={15} />} label="Your driver">
        <strong style={{ fontWeight: 700 }}>{driver.name}</strong>
        {vehicle && <span style={{ color: 'var(--text-secondary)' }}>{'  '}{vehicle}</span>}
      </Fact>
      {driver.phone && (
        <Fact icon={<Phone size={15} />} label="Driver phone">
          {/* A phone number is the one control a guest reaches for standing at
              arrivals with luggage, so it gets a full 44px target rather than
              the 18px an inline link would be. */}
          <a
            href={`tel:${driver.phone.replace(/[^\d+]/g, '')}`}
            className="pf-tap pf-link"
            style={{ color: 'var(--text-primary)', fontSize: 14.5 }}
          >
            {driver.phone}
          </a>
        </Fact>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Cancellation
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Lodge a cancellation REQUEST for a booking still inside its window.
 *
 * Nothing is refunded here. The request goes to an admin, so the copy is
 * careful to say the booking is still confirmed until they reply. The figure
 * comes from the same lib/refund-pricing the API uses, and the booking now
 * carries gift_card_amount and stripe_payment_id so the quote shown matches
 * the quote the server will honour.
 */
function CancelBooking({ booking, onRequested }: { booking: ProfileBooking; onRequested: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus follows the control that replaced the one just activated, instead
  // of falling to <body> at the moment a refund is being approved.
  useEffect(() => { if (confirming) panelRef.current?.focus() }, [confirming])

  const note = (text: string) => (
    <span style={{ fontFamily: FONT, fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{text}</span>
  )

  if (booking.status === 'refunded') {
    return note(
      booking.refund_amount != null
        ? `Cancelled. ${formatCents(Math.round(booking.refund_amount * 100))} refunded.`
        : 'Cancelled.',
    )
  }
  // Requested but not decided. The trip is STILL LIVE, so this must not read
  // as cancelled, or travelers skip a trip they are still booked on.
  if (booking.refund_state === 'requested') {
    return note('Cancellation requested. Your booking is still confirmed until we reply.')
  }
  if (booking.refund_state === 'declined') {
    return note('Cancellation not approved. Your booking is still confirmed.')
  }

  const quote = quoteRefund(booking)
  if (!quote.refundable) return null

  async function cancel() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/cancel`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.message ?? 'We could not cancel this booking. Please email contact@mapltours.com.')
        return
      }
      onRequested()
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!confirming) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setConfirming(true)}
        className="pf-tap pf-link"
        style={{ fontSize: 13, color: 'var(--text-secondary)' }}
      >
        Request cancellation
      </button>
    )
  }

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      style={{ fontFamily: FONT, fontSize: 13, width: '100%', outline: 'none' }}
    >
      <p style={{ color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.55 }}>
        You paid {formatCents(quote.grossCents)}. If we approve this, you get back{' '}
        <strong style={{ color: 'var(--text-primary)' }}>{formatCents(quote.refundCents)}</strong>, after the{' '}
        {formatCents(quote.adminChargeCents)} administration charge. Your booking stays confirmed until we reply.
      </p>
      {error && (
        <p role="alert" style={{ color: DANGER, marginBottom: 10, lineHeight: 1.5 }}>{error}</p>
      )}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={cancel}
          aria-disabled={busy}
          className="btn-primary"
          style={{ minHeight: 44, fontSize: 13.5, opacity: busy ? 0.65 : 1 }}
        >
          {busy ? 'Sending' : 'Request cancellation'}
        </button>
        <button
          type="button"
          onClick={() => { setConfirming(false); setError(null); triggerRef.current?.focus() }}
          className="pf-tap"
          style={{ fontSize: 13, color: 'var(--text-secondary)' }}
        >
          Keep booking
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Trips
   ───────────────────────────────────────────────────────────────────────── */

function LegLines({ item }: { item: ProfileBookingItem }) {
  const legs = transferLegs(item)
  if (!legs.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {legs.map((leg) => (
        <Fact
          key={leg.kind}
          icon={leg.kind === 'arrival' ? <Plane size={15} /> : <Plane size={15} style={{ transform: 'rotate(90deg)' }} />}
          label={leg.label}
        >
          {formatTripDate(leg.date)}{leg.time ? `, ${leg.time}` : ''}
          {leg.flight && <span style={{ color: 'var(--text-secondary)' }}>{'  '}Flight {leg.flight}</span>}
        </Fact>
      ))}
    </div>
  )
}

/** The next trip, in full. The reason a booked guest opens this page. */
function NextTripCard({ booking, item, daysAway, onRequested }: {
  booking: ProfileBooking; item: ProfileBookingItem; daysAway: number; onRequested: () => void
}) {
  const pay = paymentLabel(booking)
  const parish = itemParish(item)
  return (
    <div className="pf-card" style={{ overflow: 'hidden' }}>
      {itemImage(item) && (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '21 / 9', background: 'var(--surface)' }}>
          <TripMedia item={item} sizes="(max-width: 1080px) 100vw, 700px" />
        </div>
      )}
      <div className="pf-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Chip tone="go">{countdownLabel(daysAway)}</Chip>
          {booking.status === 'refunded'
            ? <Chip tone="off">Cancelled</Chip>
            : booking.refund_state === 'requested'
              ? <Chip tone="warn">Cancellation under review</Chip>
              : <Chip tone="neutral"><Check aria-hidden size={13} /> Confirmed</Chip>}
        </div>

        <div>
          <h3 className="pf-wrap" style={{
            fontFamily: FONT, fontWeight: 800, fontSize: 'clamp(20px, 3.4vw, 25px)',
            letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.2,
          }}>
            {readableTitle(item)}
          </h3>
          {parish && (
            <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'var(--text-tertiary)', marginTop: 5 }}>
              {item.destination}, {parish}
            </p>
          )}
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          {isTransfer(item)
            ? <LegLines item={item} />
            : (
              <Fact icon={<CalendarDays size={15} />} label="Date">
                {formatLongDate(item.date)}
              </Fact>
            )}
          <Fact icon={<UserRound size={15} />} label="Guests">{guestLabel(item.travelers)}</Fact>
          {!isTransfer(item) && (
            <Fact icon={<MapPin size={15} />} label="Pickup">
              We pick you up at your hotel. Your operator confirms the time the day before.
            </Fact>
          )}
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />
        <DriverBlock driver={booking.driver} />
        <div style={{ height: 1, background: 'var(--border)' }} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <Fact label="Booking reference">
            <span className="pf-num" style={{ fontWeight: 700, letterSpacing: '0.02em' }}>
              {booking.ref ?? bookingRef(booking.id)}
            </span>
          </Fact>
          <div style={{ textAlign: 'right' }}>
            <p className="pf-eyebrow" style={{ marginBottom: 2 }}>Paid</p>
            <p className="pf-num" style={{
              fontFamily: FONT, fontWeight: 800, fontSize: 19, color: 'var(--text-primary)',
              textDecoration: pay.struck ? 'line-through' : 'none', opacity: pay.struck ? 0.55 : 1,
            }}>
              {pay.amount}
            </p>
          </div>
        </div>
        {pay.note && (
          <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'var(--text-tertiary)' }}>{pay.note}</p>
        )}
        <CancelBooking booking={booking} onRequested={onRequested} />
      </div>
    </div>
  )
}

/** A compact row for every other booking, upcoming or unfiled. */
function TripRow({ booking, onRequested, tone = 'upcoming' }: {
  booking: ProfileBooking; onRequested: () => void; tone?: 'upcoming' | 'attention'
}) {
  const item = booking.booking_items[0]
  const pay = paymentLabel(booking)
  const cancelled = booking.status === 'refunded'
  return (
    <div className="pf-card pf-trip">
      {item && (
        <div className="pf-trip-media" style={{ opacity: cancelled ? 0.45 : 1 }}>
          <TripMedia item={item} sizes="(max-width: 560px) 100vw, 200px" />
        </div>
      )}
      <div className="pf-trip-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {cancelled
            ? <Chip tone="off">Cancelled</Chip>
            : tone === 'attention'
              ? <Chip tone="warn">Needs a look</Chip>
              : <Chip tone="go">{item?.date ? countdownLabel(Math.max(0, Math.round((Date.parse(`${item.date}T00:00:00Z`) - Date.parse(`${todayInJamaica()}T00:00:00Z`)) / 86400000))) : 'Date to be confirmed'}</Chip>}
          {booking.refund_state === 'requested' && !cancelled && <Chip tone="warn">Under review</Chip>}
        </div>

        <div>
          <p className="pf-wrap" style={{ fontFamily: FONT, fontSize: 15.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35 }}>
            {item ? readableTitle(item) : 'Booking without trip details'}
          </p>
          <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {item
              ? <>{formatTripDate(item.date)} · {guestLabel(item.travelers)}</>
              : 'We could not read the trip details on this booking. Quote the reference below and we will sort it out.'}
            {booking.booking_items.length > 1 && ` · +${booking.booking_items.length - 1} more`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span className="pf-num" style={{ fontFamily: FONT, fontSize: 12.5, color: 'var(--text-tertiary)' }}>
            {booking.ref ?? bookingRef(booking.id)}
          </span>
          <span className="pf-num" style={{
            fontFamily: FONT, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)',
            textDecoration: pay.struck ? 'line-through' : 'none', opacity: pay.struck ? 0.55 : 1,
          }}>
            {pay.amount}
          </span>
        </div>
        <CancelBooking booking={booking} onRequested={onRequested} />
      </div>
    </div>
  )
}

/**
 * A trip already taken.
 *
 * The old card was a receipt: it led with the place name, stamped the price
 * over the photograph, and dated itself by the day the guest PAID rather than
 * the day they travelled. It also carried cursor:pointer and a hover lift
 * while having no click handler and no href, so it advertised an interaction
 * that did not exist. This one leads with the tour, dates itself by travel,
 * and where the tour is still sold it links somewhere real.
 */
function PastTripCard({ booking }: { booking: ProfileBooking }) {
  const item = booking.booking_items[0]
  if (!item) return null
  const exp = experiences.find((e) => e.id === item.experience_id)
  const travelled = latestDate(booking)
  const parish = itemParish(item)

  const body = (
    <>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: 'var(--surface)' }}>
        <TripMedia item={item} sizes="(max-width: 560px) 100vw, (max-width: 1080px) 50vw, 340px" />
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        <p className="pf-eyebrow" style={{ marginBottom: 5 }}>{formatLongDate(travelled)}</p>
        <p className="pf-wrap" style={{
          fontFamily: FONT, fontSize: 15.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35,
        }}>
          {readableTitle(item)}
          {booking.booking_items.length > 1 && (
            <span style={{ fontWeight: 500, color: 'var(--text-tertiary)' }}> and {booking.booking_items.length - 1} more</span>
          )}
        </p>
        <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
          {[item.destination, parish].filter(Boolean).join(', ')}
        </p>
      </div>
    </>
  )

  const shell = { overflow: 'hidden', display: 'block', textDecoration: 'none', height: '100%' } as const
  // Only a card that goes somewhere gets to look like it does.
  return exp
    ? <Link href={`/experience/${slugify(exp.title)}`} className="pf-card" style={shell}>{body}</Link>
    : <div className="pf-card" style={shell}>{body}</div>
}

/* ─────────────────────────────────────────────────────────────────────────
   Account
   ───────────────────────────────────────────────────────────────────────── */

function EditableField({ label, value, placeholder, type, onSave, verified, hint }: {
  label: string
  value: string
  placeholder: string
  type?: string
  /** Return a string to reject the draft and show it as an error. */
  onSave: (val: string) => Promise<void | string>
  verified?: boolean
  hint?: string
}) {
  const id = useId()
  const errId = `${id}-err`
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)

  // Keep the displayed value in step when it changes underneath us.
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])

  // Returning focus to the Edit button is what stops a keyboard user being
  // thrown to the top of the document after saving each of five fields.
  useEffect(() => {
    if (wasEditing.current && !editing) editRef.current?.focus()
    wasEditing.current = editing
  }, [editing])

  async function handleSave() {
    if (saving) return
    if (draft === value) { setEditing(false); setError(null); return }
    setSaving(true)
    const problem = await onSave(draft)
    setSaving(false)
    if (typeof problem === 'string') { setError(problem); return }
    setError(null)
    setEditing(false)
  }

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor={id} className="pf-eyebrow" style={{ display: 'block', marginBottom: 6, color: error ? DANGER : 'var(--text-tertiary)' }}>
            {label}
          </label>

          {editing ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                id={id}
                type={type || 'text'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={placeholder}
                autoFocus
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errId : undefined}
                className="field-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') { setEditing(false); setDraft(value); setError(null) }
                }}
                style={{
                  flex: '1 1 200px', minWidth: 0, height: 48,
                  // 16px so iOS Safari does not zoom the page on focus.
                  fontSize: 16, background: 'var(--bg)',
                  borderColor: error ? 'rgba(176,0,32,0.55)' : 'var(--border-strong)',
                }}
              />
              <button type="button" onClick={handleSave} aria-disabled={saving} className="btn-primary"
                style={{ minHeight: 44, fontSize: 13.5, opacity: saving ? 0.65 : 1 }}>
                {saving ? 'Saving' : 'Save'}
              </button>
              <button type="button" onClick={() => { setEditing(false); setDraft(value); setError(null) }} className="btn-outline"
                style={{ minHeight: 44, fontSize: 13.5 }}>
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <p id={id} className="pf-wrap" style={{ fontFamily: FONT, fontSize: 15, color: value ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                {value || 'Not provided'}
              </p>
              {verified && value && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontFamily: FONT, fontSize: 12, fontWeight: 700, color: 'var(--emerald)',
                  padding: '2px 9px', borderRadius: 9999, background: 'var(--emerald-dim)',
                }}>
                  <ShieldCheck aria-hidden size={12} /> Verified
                </span>
              )}
            </div>
          )}

          {error
            ? <p id={errId} role="alert" style={{ fontFamily: FONT, fontSize: 13, color: DANGER, marginTop: 6, lineHeight: 1.45 }}>{error}</p>
            : hint && !editing
              ? <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.45 }}>{hint}</p>
              : null}
        </div>

        {!editing && (
          <button
            ref={editRef}
            type="button"
            onClick={() => { setDraft(value); setError(null); setEditing(true) }}
            className="pf-tap pf-link"
            /* Five buttons all called "Edit" are indistinguishable in a screen
               reader's element list, so each one says what it edits. */
            aria-label={`Edit ${label.toLowerCase()}`}
            style={{ fontSize: 13.5, flexShrink: 0, paddingLeft: 12 }}
          >
            Edit
          </button>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Rewards
   ───────────────────────────────────────────────────────────────────────── */

function RewardsCard() {
  const { approved, pending, rejected, towardNext, availableRewards, allRewards } = useMyVideoProgress()
  const used = allRewards.filter((r) => r.status === 'used')
  const active = availableRewards.length > 0
  const pct = active ? 100 : Math.min(100, (towardNext / VIDEO_REWARD_MILESTONE) * 100)

  return (
    <div className="pf-card pf-pad">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <span aria-hidden style={{
          width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
          background: active ? 'var(--emerald)' : 'var(--gold)',
          color: active ? '#fff' : 'var(--gold-ink)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Award size={18} strokeWidth={2} />
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="pf-eyebrow" style={{ color: active ? 'var(--emerald)' : 'var(--gold-text)', marginBottom: 3 }}>
            {active ? 'Reward ready' : 'Video reward'}
          </p>
          <h3 style={{ fontFamily: FONT, fontWeight: 800, fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.3 }}>
            {active
              ? '5% off your next trip'
              : `${towardNext} of ${VIDEO_REWARD_MILESTONE} videos approved`}
          </h3>
        </div>
      </div>

      {/* role=progressbar so the value exists as more than a pixel width, and
          --gold-text on --border-strong measures 6.2:1, where the old
          --gold on rgba(0,0,0,0.08) was 1.90:1 and failed SC 1.4.11. */}
      <div
        role="progressbar"
        aria-valuenow={active ? VIDEO_REWARD_MILESTONE : towardNext}
        aria-valuemin={0}
        aria-valuemax={VIDEO_REWARD_MILESTONE}
        aria-label="Videos approved toward your next reward"
        style={{ position: 'relative', height: 8, borderRadius: 9999, background: 'var(--border-strong)', overflow: 'hidden' }}
      >
        <div style={{
          position: 'absolute', inset: '0 auto 0 0', width: `${pct}%`,
          background: active ? 'var(--emerald)' : 'var(--gold-text)', borderRadius: 9999,
        }} />
      </div>

      <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.5 }}>
        {approved} approved{pending > 0 && `, ${pending} in review`}{rejected > 0 && `, ${rejected} not accepted`}.{' '}
        {active
          ? 'Use the code below at checkout.'
          : `Post ${VIDEO_REWARD_MILESTONE - towardNext} more from your trip to unlock 5% off.`}
      </p>

      {(availableRewards.length + used.length) > 0 && (
        <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...availableRewards.map((r) => ({ r, spent: false })), ...used.map((r) => ({ r, spent: true }))].map(({ r, spent }) => (
            <li key={r.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '9px 12px', borderRadius: 'var(--r-md)',
              background: spent ? 'var(--surface)' : 'var(--bg-warm)',
              border: `1px solid ${spent ? 'var(--border)' : 'var(--border-strong)'}`,
            }}>
              <span className="pf-num pf-wrap" style={{
                fontFamily: FONT, fontWeight: 700, fontSize: 13,
                color: spent ? 'var(--text-tertiary)' : 'var(--text-primary)',
                textDecoration: spent ? 'line-through' : 'none',
              }}>
                {r.code}
              </span>
              <span className="pf-eyebrow" style={{ color: spent ? 'var(--text-tertiary)' : 'var(--emerald)', flexShrink: 0 }}>
                {spent ? 'Used' : `${r.percent}% off`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   The page
   ───────────────────────────────────────────────────────────────────────── */

export default function ProfileView() {
  const { user: authUser, loading: authLoading } = useAuth()
  const user: User | null = authUser
  const [phone, setPhone] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [tiktokStatus, setTiktokStatus] = useState<string | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)

  const cacheKey = user ? `profile:${user.id}` : null
  const { data: bundle, loading: bundleLoading, error, refresh, mutate } = useSwrCache<ProfileBundle>(
    cacheKey,
    useCallback(async () => {
      if (!user) return EMPTY_BUNDLE
      // The social columns landed in migration 026; where it has not run yet,
      // retry with the legacy columns so the profile still loads.
      const fetchProfile = async () => {
        const full = await supabase
          .from('users')
          .select('name, avatar_url, location, social_handle, tiktok_username, tiktok_connected_at')
          .eq('id', user.id)
          .single()
        if (!full.error) return full
        return supabase.from('users').select('name, avatar_url, location').eq('id', user.id).single()
      }
      const [profileRes, bookingsRes, badgesRes, likesRes] = await Promise.all([
        fetchProfile(),
        fetch('/api/profile/bookings'),
        supabase.from('user_badges').select('badge_name, earned_at').eq('user_id', user.id),
        supabase.from('experience_likes').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ])
      // THROW rather than returning an empty list. useSwrCache only writes the
      // cache on success, so a failed load now leaves the last good trips in
      // place and shows a retry, instead of overwriting them with nothing and
      // telling a guest who has paid for a trip that they have none.
      if (!bookingsRes.ok) throw new Error('bookings request failed')
      const bookingsJson = await bookingsRes.json()
      return {
        profile: (profileRes.data as ProfileData) ?? EMPTY_PROFILE,
        bookings: (bookingsJson.data as ProfileBooking[]) ?? [],
        badges: (badgesRes.data as Badge[]) ?? [],
        likedCount: likesRes.count ?? 0,
      }
    }, [user]),
    { enabled: !!user },
  )

  const profile = bundle?.profile ?? EMPTY_PROFILE
  const bookings = useMemo(() => bundle?.bookings ?? [], [bundle])
  const { savedIds, loading: savedLoading } = useSaved()
  // Keyed on the loading flag, not on falsiness: unsaving your last tour
  // must show 0, not fall back to a stale cached count.
  const savedCount = savedLoading ? (bundle?.likedCount ?? 0) : savedIds.length

  useEffect(() => { if (user) setPhone(user.user_metadata?.phone || '') }, [user])

  // The TikTok callback lands back here with ?tiktok=<status>. Read it once
  // and scrub it so a reload does not re-announce it.
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('tiktok')
    if (!status) return
    setTiktokStatus(status)
    const url = new URL(window.location.href)
    url.searchParams.delete('tiktok')
    window.history.replaceState({}, '', url.toString())
  }, [])

  const today = todayInJamaica()
  const live = useMemo(() => bookings.filter((b) => !isUnfiled(b)), [bookings])
  const unfiled = useMemo(() => bookings.filter(isUnfiled), [bookings])
  const { upcoming, past } = useMemo(() => splitBookings(live, today), [live, today])
  const next = useMemo(() => nextTrip(live, today), [live, today])
  const alsoUpcoming = useMemo(
    () => upcoming.filter((b) => b.id !== next?.booking.id),
    [upcoming, next],
  )
  const stats = useMemo(() => profileStats(bookings, today), [bookings, today])

  const displayName =
    profile.name || user?.user_metadata?.full_name || user?.user_metadata?.name || 'Traveler'
  const email = user?.email || ''
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null

  /** The photograph at the top: where you are going, else where you last went. */
  const heroImage = useMemo(() => {
    // Where you are going beats where you have been, and an airport transfer
    // carries no photo of its own, so a booked tour later in the same trip is
    // a better picture of it than the last place you visited.
    const firstImage = (list: ProfileBooking[]) => {
      for (const b of list) {
        for (const item of b.booking_items) {
          const img = itemImage(item)
          if (img) return img
        }
      }
      return null
    }
    return (next && itemImage(next.item))
      || firstImage(upcoming)
      || firstImage(past)
      || DESTINATIONS['Ocho Rios']
  }, [next, upcoming, past])

  function patch(update: Partial<ProfileData>) {
    mutate((prev) => {
      const base = prev ?? EMPTY_BUNDLE
      return { ...base, profile: { ...base.profile, ...update } }
    })
  }

  function markRequested(bookingId: string) {
    // The booking is deliberately left 'paid': nothing is refunded until an
    // admin approves, and showing it as cancelled here would tell a traveler
    // to skip a trip that is still live.
    mutate((prev) => {
      const base = prev ?? EMPTY_BUNDLE
      return {
        ...base,
        bookings: base.bookings.map((b) => (b.id === bookingId ? { ...b, refund_state: 'requested' } : b)),
      }
    })
    setAnnouncement('Cancellation requested. Your booking is still confirmed until we reply.')
  }

  /* Every writer reports its own failure and rolls the optimistic value back,
     rather than showing a saved value that never reached the database. */
  async function updateName(next: string): Promise<void | string> {
    const before = profile.name
    patch({ name: next })
    const meta = await supabase.auth.updateUser({ data: { full_name: next } })
    const row = await supabase.from('users').update({ name: next }).eq('id', user!.id)
    if (meta.error || row.error) { patch({ name: before ?? null }); return 'We could not save your name. Please try again.' }
    setAnnouncement('Name saved.')
  }

  async function updateEmail(next: string): Promise<void | string> {
    const { error: err } = await supabase.auth.updateUser({ email: next })
    if (err) return err.message || 'We could not change your email. Please try again.'
    // Supabase does not move user.email until the new address is confirmed,
    // so saying "saved" here would be a lie the page cannot back up.
    setAnnouncement('Check your new inbox and confirm the change.')
  }

  async function updatePhone(next: string): Promise<void | string> {
    const before = phone
    setPhone(next)
    const { error: err } = await supabase.auth.updateUser({ data: { phone: next } })
    if (err) { setPhone(before); return 'We could not save your phone number. Please try again.' }
    setAnnouncement('Phone number saved.')
  }

  async function updateLocation(next: string): Promise<void | string> {
    const before = profile.location
    patch({ location: next })
    const { error: err } = await supabase.from('users').upsert({ id: user!.id, location: next }, { onConflict: 'id' })
    if (err) { patch({ location: before ?? null }); return 'We could not save your location. Please try again.' }
    setAnnouncement('Location saved.')
  }

  async function updateSocialHandle(raw: string): Promise<void | string> {
    const normalized = normalizeSocialHandle(raw)
    // An inline error, not window.alert: a native dialog is unannounced,
    // unstyled and throws focus out of the field being corrected.
    if (raw.trim() && !normalized) return 'Handles are 2 to 30 characters: letters, numbers, dots or underscores.'
    const before = profile.social_handle
    patch({ social_handle: normalized })
    const meta = await supabase.auth.updateUser({ data: { social_handle: normalized } })
    const row = await supabase.from('users').upsert({ id: user!.id, social_handle: normalized }, { onConflict: 'id' })
    if (meta.error || row.error) { patch({ social_handle: before ?? null }); return 'We could not save your handle. Please try again.' }
    setAnnouncement('Handle saved.')
  }

  async function disconnectTikTok() {
    const res = await fetch('/api/tiktok/disconnect', { method: 'POST' })
    if (!res.ok) { setAnnouncement('We could not disconnect TikTok. Please try again.'); return }
    patch({ tiktok_username: null, tiktok_connected_at: null })
    setAnnouncement('TikTok disconnected.')
  }

  /* ── States ──────────────────────────────────────────────────────────── */

  // Never paint an empty profile while auth is still resolving. Without this,
  // `user` is briefly null, so the page rendered a signed-in guest their own
  // account as "Traveler" with no email, no trips and "nothing here yet".
  if (authLoading || (user && bundleLoading && !bundle)) return <Skeleton />

  const bookingsFailed = !!error

  return (
    <main className="pf-shell">
      <div className="visually-hidden" role="status" aria-live="polite">{announcement}</div>

      <div className="pf-body">
        <div className="pf-main">
          {/* ── Masthead ── */}
          <header className="pf-hero">
            <div className="pf-hero-media">
              <Image src={heroImage} alt="" fill sizes="(max-width: 1080px) 100vw, 700px" style={{ objectFit: 'cover' }} priority />
            </div>
            <div className="pf-hero-scrim" aria-hidden />
            <div className="pf-hero-body">
              <p className="pf-eyebrow" style={{ color: 'rgba(255,255,255,0.86)', marginBottom: 10 }}>
                MAPL Tours Jamaica
              </p>
              <h1 style={{
                fontFamily: FONT, fontWeight: 800, fontSize: 'clamp(28px, 5.2vw, 42px)',
                letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.05, marginBottom: 12,
              }}>
                Your trips
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Avatar src={profile.avatar_url || user?.user_metadata?.avatar_url} name={displayName} size={36} ring />
                <p className="pf-wrap" style={{ fontFamily: FONT, fontSize: 14, color: 'rgba(255,255,255,0.92)', lineHeight: 1.4 }}>
                  {displayName}
                  {memberSince && <span style={{ color: 'rgba(255,255,255,0.78)' }}> · With us since {memberSince}</span>}
                </p>
              </div>
            </div>
          </header>

          {/* ── Record ── */}
          <div className="pf-stats">
            {[
              { value: stats.trips, label: stats.trips === 1 ? 'Trip taken' : 'Trips taken' },
              { value: stats.parishes, label: stats.parishes === 1 ? 'Parish' : 'Parishes' },
              { value: savedCount, label: 'Saved', href: '/saved' },
            ].map((s) => {
              const inner = (
                <>
                  <p className="pf-num" style={{ fontFamily: FONT, fontWeight: 800, fontSize: 22, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                    {s.value}
                  </p>
                  <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'var(--text-tertiary)', fontWeight: 500, marginTop: 3 }}>
                    {s.label}
                  </p>
                </>
              )
              return s.href
                ? <Link key={s.label} href={s.href} className="pf-stat">{inner}</Link>
                : <div key={s.label} className="pf-stat">{inner}</div>
            })}
          </div>

          {bookingsFailed && (
            <div role="alert" className="pf-card pf-pad" style={{ borderColor: 'rgba(176,0,32,0.35)' }}>
              <p style={{ fontFamily: FONT, fontSize: 14.5, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 12 }}>
                We could not load your trips just now. Anything shown below may be out of date.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" onClick={() => void refresh()} className="btn-primary" style={{ minHeight: 44, fontSize: 13.5 }}>
                  Try again
                </button>
                <a href="mailto:contact@mapltours.com" className="pf-tap pf-link" style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
                  Email us instead
                </a>
              </div>
            </div>
          )}

          {/* ── Next up ── */}
          {next && (
            <Section kicker="Next up" title={countdownLabel(next.daysAway)}>
              <NextTripCard
                booking={next.booking}
                item={next.item}
                daysAway={next.daysAway}
                onRequested={() => markRequested(next.booking.id)}
              />
            </Section>
          )}

          {alsoUpcoming.length > 0 && (
            <Section kicker="Also booked" title={`${alsoUpcoming.length} more coming up`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {alsoUpcoming.map((b) => (
                  <TripRow key={b.id} booking={b} onRequested={() => markRequested(b.id)} />
                ))}
              </div>
            </Section>
          )}

          {unfiled.length > 0 && (
            <Section kicker="Needs a look" title="We could not read these bookings">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {unfiled.map((b) => (
                  <TripRow key={b.id} booking={b} onRequested={() => markRequested(b.id)} tone="attention" />
                ))}
              </div>
            </Section>
          )}

          {/* ── The record ── */}
          <Section kicker="Where you have been" title={past.length ? `${past.length} ${past.length === 1 ? 'trip' : 'trips'} behind you` : 'Your Jamaica record'}>
            {past.length === 0 ? (
              next ? (
                <p style={{ fontFamily: FONT, fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Once you have travelled with us, your trips collect here.
                </p>
              ) : (
                <EmptyState
                  emoji="🇯🇲"
                  title="No trips yet"
                  body="Book a tour or an airport pickup and it lands here, with your driver's details and your booking reference."
                  action={{ label: 'Browse tours', href: '/explore' }}
                  secondary={{ label: 'Book an airport pickup', href: '/transfers' }}
                />
              )
            ) : (
              <div className="pf-grid">
                {past.map((b) => <PastTripCard key={b.id} booking={b} />)}
              </div>
            )}
          </Section>

          {/* ── Account, last, because it is admin and not travel ── */}
          <section>
            <button
              type="button"
              onClick={() => setAccountOpen((v) => !v)}
              aria-expanded={accountOpen}
              aria-controls="pf-account"
              className="pf-tap"
              style={{ width: '100%', justifyContent: 'space-between', textAlign: 'left' }}
            >
              <span>
                <span className="pf-eyebrow" style={{ display: 'block', marginBottom: 3 }}>Account</span>
                <span className="pf-h2" style={{ display: 'block' }}>Your details</span>
              </span>
              <ChevronDown aria-hidden size={20} style={{ flexShrink: 0, transform: accountOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-fast) var(--ease-out)' }} />
            </button>

            <div id="pf-account" hidden={!accountOpen}>
              {accountOpen && (
                <div className="pf-card pf-pad" style={{ marginTop: 12 }}>
                  <EditableField label="Legal name" value={displayName} placeholder="Your full name" onSave={updateName}
                    hint="The name your driver holds up at arrivals." />
                  <EditableField label="Email address" value={email} placeholder="you@example.com" type="email" onSave={updateEmail}
                    /* Supabase actually confirms this one, and two server routes
                       already trust email_confirmed_at to decide which bookings
                       belong to this account. */
                    verified={!!user?.email_confirmed_at} />
                  <EditableField label="Phone number" value={phone} placeholder="+1 (876) 000-0000" type="tel" onSave={updatePhone}
                    /* No badge: nothing verifies this. It is a self-typed string
                       in user_metadata, so there is no phone_confirmed_at to
                       point at, and claiming "Verified" would be worse than
                       showing no badge at all. */
                    hint="How your driver reaches you on the day." />
                  <EditableField label="Location" value={profile.location || ''} placeholder="City, Country" onSave={updateLocation} />
                  <EditableField label="Social handle" value={profile.social_handle || ''} placeholder="yourhandle" onSave={updateSocialHandle}
                    /* Verified only when it came from a linked TikTok account
                       and still matches; a typed handle is a claim, not a
                       credential. */
                    verified={!!profile.tiktok_username && profile.tiktok_username === profile.social_handle} />

                  {process.env.NEXT_PUBLIC_TIKTOK_ENABLED === '1' && (() => {
                    // Connected keys on the link itself, not the username:
                    // until TikTok approves the user.info.profile scope the
                    // callback stores a link with no username, and that state
                    // must still read as connected and stay disconnectable.
                    const linked = !!(profile.tiktok_username || profile.tiktok_connected_at)
                    const line =
                      tiktokStatus === 'connected' ? 'TikTok connected.'
                      : tiktokStatus === 'denied' ? 'TikTok link cancelled.'
                      : tiktokStatus === 'signin' ? 'Sign in first, then connect TikTok.'
                      : tiktokStatus === 'unconfigured' ? 'TikTok linking is not set up yet.'
                      : tiktokStatus ? 'We could not link TikTok. Please try again.'
                      : null
                    return (
                      <div style={{ paddingTop: 16 }}>
                        {line && (
                          <p role="status" style={{
                            marginBottom: 12, padding: '10px 14px', borderRadius: 'var(--r-md)',
                            background: tiktokStatus === 'connected' ? 'var(--emerald-dim)' : 'var(--surface)',
                            fontFamily: FONT, fontSize: 13.5,
                            color: tiktokStatus === 'connected' ? 'var(--emerald)' : 'var(--text-secondary)',
                          }}>
                            {line}
                          </p>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                            <p className="pf-eyebrow" style={{ marginBottom: 5 }}>TikTok</p>
                            <p className="pf-wrap" style={{ fontFamily: FONT, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                              {linked
                                ? profile.tiktok_username
                                  ? <>Connected as <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>@{profile.tiktok_username}</strong></>
                                  : 'Connected. Your username appears once TikTok approves profile access.'
                                : 'Link your account for verified credit on your clips.'}
                            </p>
                          </div>
                          {linked
                            ? <button onClick={disconnectTikTok} className="btn-outline" style={{ minHeight: 44, fontSize: 13.5 }}>Disconnect</button>
                            : <a href="/api/tiktok/connect" className="btn-primary" style={{ minHeight: 44, fontSize: 13.5 }}>Connect TikTok</a>}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── Rail ── */}
        <aside className="pf-rail" aria-label="Your shortlist, rewards and help">
          <SavedRail count={savedCount} ids={savedIds} />
          <RewardsCard />
          <div className="pf-card pf-pad">
            <h2 className="pf-h2" style={{ fontSize: 16, marginBottom: 8 }}>Need a hand?</h2>
            <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
              Flight moved, plans changed, or something not right? Quote your booking reference and we will sort it out.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <a href="mailto:contact@mapltours.com" className="pf-tap pf-link" style={{ fontSize: 13.5 }}>
                <MessageCircle aria-hidden size={15} /> contact@mapltours.com
              </a>
              <Link href="/help" className="pf-tap pf-link" style={{ fontSize: 13.5 }}>
                <ShieldCheck aria-hidden size={15} /> Help centre
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}

/** The shortlist, shown rather than counted. */
function SavedRail({ count, ids }: { count: number; ids: number[] }) {
  const shown = useMemo(
    () => ids.map((id) => experiences.find((e) => e.id === id)).filter(Boolean).slice(0, 3),
    [ids],
  )
  return (
    <div className="pf-card pf-pad">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <h2 className="pf-h2" style={{ fontSize: 16 }}>Saved for later</h2>
        {count > 0 && <Link href="/saved" className="pf-link" style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-secondary)' }}>See all {count}</Link>}
      </div>
      {shown.length === 0 ? (
        <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Tap the heart on any tour and it lands here, ready to drop into your next trip.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((exp) => (
            <li key={exp!.id}>
              <Link href={`/experience/${slugify(exp!.title)}`} style={{ display: 'flex', gap: 11, alignItems: 'center', textDecoration: 'none', minHeight: 44 }}>
                <span style={{ position: 'relative', width: 54, height: 54, borderRadius: 'var(--r-sm)', overflow: 'hidden', flexShrink: 0, background: 'var(--surface)' }}>
                  <Image src={exp!.image} alt="" fill sizes="54px" style={{ objectFit: 'cover' }} />
                </span>
                <span className="pf-wrap" style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                    {exp!.title}
                  </span>
                  <span style={{ display: 'block', fontFamily: FONT, fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {exp!.destination}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The loading state holds the page's shape.
 *
 * The version this replaces blanked the viewport and centred a pulsing circle
 * under the fixed nav, so the page appeared to jump when the content arrived.
 */
function Skeleton() {
  return (
    <main className="pf-shell" aria-busy="true">
      <p className="visually-hidden" role="status">Loading your trips.</p>
      <div className="pf-body">
        <div className="pf-main">
          <div className="pf-skel" style={{ height: 210, borderRadius: 'var(--r-xl)' }} />
          <div className="pf-skel" style={{ height: 72 }} />
          <div className="pf-skel" style={{ height: 300, borderRadius: 'var(--r-xl)' }} />
          <div className="pf-skel" style={{ height: 160, borderRadius: 'var(--r-xl)' }} />
        </div>
        <aside className="pf-rail">
          <div className="pf-skel" style={{ height: 190, borderRadius: 'var(--r-xl)' }} />
          <div className="pf-skel" style={{ height: 150, borderRadius: 'var(--r-xl)' }} />
        </aside>
      </div>
    </main>
  )
}
