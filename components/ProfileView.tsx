'use client'

import Image from 'next/image'
import Link from 'next/link'
// Cart store no longer used on profile, upcoming trips come from confirmed bookings
import { experiences } from '@/lib/experiences'
import { useI18n } from '@/lib/i18n'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { useSaved } from '@/lib/supabase/saved'
import { useSwrCache } from '@/lib/swr-cache'
import { useMyVideoProgress, VIDEO_REWARD_MILESTONE } from '@/lib/tour-videos'
import { Award, UserRound } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { quoteRefund, formatCents } from '@/lib/refund-pricing'

// Create the Supabase client once per module load, not per render,
// keeps referential equality stable across renders.
const supabase = createClient()

interface PastBooking {
  id: string
  created_at: string
  paid_at: string | null
  status: string
  refund_state: string
  refund_amount: number | null
  total_paid: number
  booking_items: {
    title: string
    destination: string
    travelers: number
    date: string
    experience_id: number
  }[]
}

interface Badge {
  badge_name: string
  earned_at: string
}

interface ProfileData {
  name: string | null
  avatar_url: string | null
  location: string | null
}

// ── Editable Field ──
function EditableField({ label, value, placeholder, type, onSave, verified }: {
  label: string
  value: string
  placeholder: string
  type?: string
  onSave: (val: string) => Promise<void>
  verified?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (draft === value) { setEditing(false); return }
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div style={{
      padding: '18px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <p style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-dm-sans)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            marginBottom: 6,
          }}>
            {label}
          </p>
          {editing ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type={type || 'text'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={placeholder}
                autoFocus
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border-strong)',
                  padding: '0 12px',
                  fontSize: 14,
                  fontFamily: 'var(--font-dm-sans)',
                  color: 'var(--text-primary)',
                  background: 'var(--bg)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  height: 40, padding: '0 16px',
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  fontSize: 13, fontWeight: 600,
                  fontFamily: 'var(--font-dm-sans)',
                  cursor: 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? '...' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setDraft(value) }}
                style={{
                  height: 40, padding: '0 12px',
                  borderRadius: 'var(--r-sm)',
                  background: 'transparent',
                  border: '1px solid var(--border-strong)',
                  fontSize: 13, fontWeight: 500,
                  fontFamily: 'var(--font-dm-sans)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{
                fontSize: 15, color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
                fontFamily: 'var(--font-dm-sans)',
              }}>
                {value || 'Not provided'}
              </p>
              {verified && value && (
                <span style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--emerald)',
                  fontFamily: 'var(--font-dm-sans)',
                  padding: '2px 8px', borderRadius: 9999,
                  background: 'var(--emerald-dim)',
                }}>
                  Verified
                </span>
              )}
            </div>
          )}
        </div>
        {!editing && (
          <button
            onClick={() => { setDraft(value); setEditing(true) }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
              fontFamily: 'var(--font-dm-sans)',
              textDecoration: 'underline',
              padding: '0 0 0 12px',
              flexShrink: 0,
            }}
          >
            Edit
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Lodge a cancellation REQUEST for a booking still inside its 48-hour window.
 *
 * Nothing is refunded here. The request goes to an admin for approval, so the
 * copy is careful to say the booking is still confirmed until they reply.
 * The figure shown comes from the same lib/refund-pricing.ts the API uses, so
 * the traveler sees the amount they would receive; the server re-quotes on
 * POST regardless, and a stale tab whose window has closed is refused there.
 */
function CancelBooking({ booking, onCancelled }: { booking: PastBooking; onCancelled: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (booking.status === 'refunded') {
    return (
      <span style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-dm-sans)',
      }}>
        Cancelled{booking.refund_amount != null ? ` · ${formatCents(Math.round(booking.refund_amount * 100))} refunded` : ''}
      </span>
    )
  }

  // Requested but not yet decided. The trip is STILL LIVE, so this must not
  // read as cancelled, or travelers skip a trip they are still booked on.
  if (booking.refund_state === 'requested') {
    return (
      <span style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-dm-sans)',
      }}>
        Cancellation requested · awaiting review. Your booking is still confirmed until we reply.
      </span>
    )
  }

  if (booking.refund_state === 'declined') {
    return (
      <span style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-dm-sans)',
      }}>
        Cancellation not approved · your booking is still confirmed.
      </span>
    )
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
        setError(body.message ?? 'We could not cancel this booking. Please contact support.')
        return
      }
      onCancelled()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-dm-sans)', textDecoration: 'underline',
          textUnderlineOffset: 3,
        }}
      >
        Request cancellation
      </button>
    )
  }

  return (
    <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 12.5, width: '100%' }}>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
        You paid {formatCents(quote.grossCents)}. We&rsquo;ll review your request and, if
        approved, refund{' '}
        <strong style={{ color: 'var(--text-primary)' }}>{formatCents(quote.refundCents)}</strong> after the{' '}
        {formatCents(quote.adminChargeCents)} administration charge. Your booking stays
        confirmed until we reply.
      </p>
      {error && (
        <p role="alert" style={{ color: 'var(--danger, #c0392b)', marginBottom: 8 }}>{error}</p>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          style={{
            padding: '7px 14px', borderRadius: 9999, border: 'none',
            background: 'var(--text-primary)', color: 'var(--card-bg)',
            fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Sending…' : 'Request cancellation'}
        </button>
        <button
          type="button"
          onClick={() => { setConfirming(false); setError(null) }}
          disabled={busy}
          style={{
            background: 'none', border: 'none', padding: 0,
            cursor: busy ? 'default' : 'pointer', fontSize: 12,
            color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)',
          }}
        >
          Keep booking
        </button>
      </div>
    </div>
  )
}

interface ProfileBundle {
  profile: ProfileData
  pastBookings: PastBooking[]
  badges: Badge[]
  likedCount: number
  /**
   * True when the bookings request FAILED, as distinct from succeeding with
   * nothing. Telling a guest who has paid for a trip that they have no trips
   * is the worst possible reading of an outage, and it is the one the page
   * gave for as long as the refund columns were missing from the database.
   */
  bookingsFailed?: boolean
}

const EMPTY_BUNDLE: ProfileBundle = {
  profile: { name: null, avatar_url: null, location: null },
  pastBookings: [],
  badges: [],
  likedCount: 0,
}

export default function ProfileView() {
  const { t } = useI18n()
  const { user: authUser } = useAuth()
  const user: User | null = authUser
  const [phone, setPhone] = useState('')

  // Single SWR-cached fetch of everything the profile needs. localStorage key
  // is scoped per-user so switching accounts shows the right data instantly.
  const cacheKey = user ? `profile:${user.id}` : null
  const { data: bundle, loading: initialLoading, mutate } = useSwrCache<ProfileBundle>(
    cacheKey,
    async () => {
      if (!user) return EMPTY_BUNDLE
      try {
        const [profileRes, bookingsRes, badgesRes, likesRes] = await Promise.all([
          supabase.from('users').select('name, avatar_url, location').eq('id', user.id).single(),
          // Server route: matches bookings by user_id OR verified email, so
          // guest checkouts appear too (and get claimed onto this account).
          fetch('/api/profile/bookings')
            .then(async (r) => (r.ok ? { data: (await r.json()).data, failed: false } : { data: [], failed: true }))
            .catch(() => ({ data: [], failed: true })),
          supabase.from('user_badges').select('badge_name, earned_at').eq('user_id', user.id),
          supabase.from('experience_likes').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        ])
        return {
          profile: (profileRes.data as ProfileData) ?? EMPTY_BUNDLE.profile,
          pastBookings: (bookingsRes.data as PastBooking[]) ?? [],
          bookingsFailed: bookingsRes.failed === true,
          badges: (badgesRes.data as Badge[]) ?? [],
          likedCount: likesRes.count ?? 0,
        }
      } catch {
        // Tables may not exist yet, return empty so UI still renders
        return EMPTY_BUNDLE
      }
    },
    { enabled: !!user }
  )

  const profile = bundle?.profile ?? EMPTY_BUNDLE.profile
  const pastBookings = bundle?.pastBookings ?? []
  const bookingsFailed = bundle?.bookingsFailed === true
  const badges = bundle?.badges ?? []
  // The shared saved set is the live number; the bundle's count is the
  // fallback for the moment before it loads.
  const { savedIds } = useSaved()
  const likedCount = savedIds.length || (bundle?.likedCount ?? 0)
  // Only block on a full-screen loader the very first time (no cache at all).
  const loading = !user ? false : initialLoading

  useEffect(() => {
    if (user) {
      setPhone(user.user_metadata?.phone || '')
    }
  }, [user])

  const displayName = profile.name || user?.user_metadata?.full_name || user?.user_metadata?.name || 'Traveler'
  const avatarUrl = profile.avatar_url || user?.user_metadata?.avatar_url
  const email = user?.email || ''
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'recently'

  const today = new Date().toISOString().split('T')[0]

  // Split bookings into upcoming (has future dates) and past
  const upcomingBookings = pastBookings.filter(b =>
    b.booking_items.some(i => i.date >= today)
  )
  const completedBookings = pastBookings.filter(b =>
    b.booking_items.every(i => i.date < today)
  )

  const tripsCompleted = completedBookings.length
  const parishesExplored = new Set(
    pastBookings.flatMap(b => b.booking_items.map(i => i.destination))
  ).size

  function getExpImage(experienceId: number) {
    return experiences.find(e => e.id === experienceId)?.image || experiences[0].image
  }

  async function updateEmail(newEmail: string) {
    await supabase.auth.updateUser({ email: newEmail })
  }

  async function updatePhone(newPhone: string) {
    setPhone(newPhone)
    await supabase.auth.updateUser({ data: { phone: newPhone } })
  }

  async function updateName(newName: string) {
    await supabase.auth.updateUser({ data: { full_name: newName } })
    await supabase.from('users').update({ name: newName }).eq('id', user!.id)
    mutate((prev) => ({
      ...(prev ?? EMPTY_BUNDLE),
      profile: { ...((prev ?? EMPTY_BUNDLE).profile), name: newName },
    }))
  }

  // Reflect a LODGED REQUEST immediately. The booking is deliberately left
  // 'paid': nothing is refunded until an admin approves, and showing it as
  // cancelled here would tell travelers to skip a trip that is still live.
  function markRequested(bookingId: string) {
    mutate((prev) => {
      const base = prev ?? EMPTY_BUNDLE
      return {
        ...base,
        pastBookings: base.pastBookings.map((b) =>
          b.id === bookingId ? { ...b, refund_state: 'requested' } : b,
        ),
      }
    })
  }

  async function updateLocation(newLocation: string) {
    await supabase.from('users').update({ location: newLocation }).eq('id', user!.id)
    mutate((prev) => ({
      ...(prev ?? EMPTY_BUNDLE),
      profile: { ...((prev ?? EMPTY_BUNDLE).profile), location: newLocation },
    }))
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', margin: '0 auto 16px',
            background: 'var(--surface)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: 'var(--text-tertiary)' }}>
            Loading your profile...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: 72 }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px', paddingBottom: 80 }}>
        <div className="profile-layout" style={{ display: 'flex', gap: 72, alignItems: 'flex-start' }}>

          {/* ════════════════════════════════
              LEFT: Profile Card (sticky)
              ════════════════════════════════ */}
          <div className="profile-sidebar" style={{ width: 340, flexShrink: 0, position: 'sticky', top: 72 }}>
            <div style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)',
              padding: '44px 36px 36px',
              textAlign: 'center',
            }}>
              {/* Avatar */}
              <div style={{
                width: 128, height: 128, borderRadius: '50%', margin: '0 auto 20px',
                overflow: 'hidden',
                background: 'linear-gradient(145deg, #A68B3C 0%, #D4B95A 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(0,0,0,0.08), 0 0 0 3px var(--bg), 0 0 0 5px var(--border)',
              }}>
                {avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={avatarUrl} alt={displayName} width={128} height={128} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                ) : (
                  <UserRound size={48} color="var(--text-secondary)" />
                )}
              </div>

              <h1 style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 28,
                color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.025em',
              }}>
                {displayName}
              </h1>

              {profile.location && (
                <p style={{
                  fontSize: 13, color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-dm-sans)', marginBottom: 4,
                }}>
                  {profile.location}
                </p>
              )}

              <p style={{
                fontSize: 13, color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-dm-sans)', marginBottom: 24,
              }}>
                Guest · Joined {memberSince}
              </p>

              {/* Stats */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                borderTop: '1px solid var(--border)',
                paddingTop: 24,
              }}>
                {[
                  { value: tripsCompleted, label: 'Trips' },
                  { value: parishesExplored, label: 'Parishes' },
                  { value: likedCount, label: 'Saved', href: '/saved' },
                ].map((s, i) => {
                  const body = (
                    <>
                      <p style={{
                        fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 24,
                        color: 'var(--text-primary)', lineHeight: 1, marginBottom: 4,
                      }}>
                        {s.value}
                      </p>
                      <p style={{
                        fontSize: 12, color: 'var(--text-tertiary)',
                        fontFamily: 'var(--font-dm-sans)', fontWeight: 500,
                      }}>
                        {s.label}
                      </p>
                    </>
                  )
                  return (
                    <div key={s.label} style={{
                      textAlign: 'center',
                      borderRight: i < 2 ? '1px solid var(--border)' : 'none',
                    }}>
                      {/* The saved count was a dead number: it counted rows
                          nobody could reach. It now opens the list. */}
                      {s.href
                        ? <Link href={s.href} style={{ display: 'block' }}>{body}</Link>
                        : body}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Verified Information */}
            <div style={{
              marginTop: 20,
              padding: '28px 36px',
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            }}>
              <h3 style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 17,
                marginBottom: 8, color: 'var(--text-primary)',
              }}>
                Verified information
              </h3>
              <p style={{
                fontSize: 13, color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-dm-sans)', marginBottom: 20,
                lineHeight: 1.5,
              }}>
                Confirm your details to build trust with experience creators.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { text: 'Email address', done: !!email },
                  { text: 'Phone number', done: !!phone },
                ].map((item) => (
                  <div key={item.text} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    fontSize: 14, fontFamily: 'var(--font-dm-sans)',
                    color: 'var(--text-primary)',
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: item.done ? 'var(--emerald)' : 'var(--surface)',
                      color: item.done ? '#fff' : 'var(--text-tertiary)',
                      fontSize: 12, fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {item.done ? '✓' : '-'}
                    </div>
                    <span style={{ fontWeight: item.done ? 500 : 400 }}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Badges */}
            {badges.length > 0 && (
              <div style={{
                marginTop: 20,
                padding: '28px 36px',
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-xl)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              }}>
                <h3 style={{
                  fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 17,
                  marginBottom: 16, color: 'var(--text-primary)',
                }}>
                  Badges
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {badges.map((b) => (
                    <div key={b.badge_name} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 'var(--r-sm)',
                      background: 'var(--surface)',
                    }}>
                      <span style={{ fontSize: 16, color: 'var(--gold)' }}>★</span>
                      <span style={{
                        fontSize: 13, fontFamily: 'var(--font-dm-sans)',
                        fontWeight: 500, color: 'var(--text-primary)',
                      }}>
                        {b.badge_name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ════════════════════════════════
              RIGHT: Content
              ════════════════════════════════ */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* ── Personal Information ── */}
            <section style={{ marginBottom: 48 }}>
              <h2 style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 28,
                color: 'var(--text-primary)', letterSpacing: '-0.025em',
                marginBottom: 8,
              }}>
                Personal information
              </h2>
              <p style={{
                fontSize: 14, color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-dm-sans)', marginBottom: 28,
                lineHeight: 1.5,
              }}>
                Update your details below. This information is used for your bookings and how creators see you.
              </p>

              <EditableField
                label="Legal name"
                value={displayName}
                placeholder="Your full name"
                onSave={updateName}
              />
              <EditableField
                label="Email address"
                value={email}
                placeholder="you@example.com"
                type="email"
                onSave={updateEmail}
                // Supabase actually confirms this one, and two server routes
                // already trust email_confirmed_at to decide which bookings
                // belong to this account. The badge now says the same thing
                // they do, instead of "this box is not empty".
                verified={!!user?.email_confirmed_at}
              />
              <EditableField
                label="Phone number"
                value={phone}
                placeholder="+1 (876) 000-0000"
                type="tel"
                onSave={updatePhone}
                // No badge: nothing verifies this. It is a self-typed string
                // in user_metadata, not Supabase's native phone field, so
                // there is no phone_confirmed_at to point at. Claiming
                // "Verified" for a number the guest typed themselves is worse
                // than showing no badge at all.
              />
              <EditableField
                label="Location"
                value={profile.location || ''}
                placeholder="City, Country"
                onSave={updateLocation}
              />
            </section>

            {/* ── Upcoming Trips (confirmed bookings with future dates) ── */}
            {upcomingBookings.length > 0 && (
              <>
                <section style={{ marginBottom: 48 }}>
                  <h2 style={{
                    fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 22,
                    color: 'var(--text-primary)', letterSpacing: '-0.02em',
                    marginBottom: 20,
                  }}>
                    {t('Upcoming trips')}
                  </h2>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {upcomingBookings.map((booking) => (
                      <div key={booking.id} style={{
                        background: 'var(--card-bg)', borderRadius: 'var(--r-xl)',
                        border: '1px solid var(--border)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                        overflow: 'hidden',
                      }}>
                        {booking.booking_items.map((item, i) => (
                          <div key={i} style={{
                            display: 'flex', gap: 0,
                            borderBottom: i < booking.booking_items.length - 1 ? '1px solid var(--border)' : 'none',
                          }}>
                            <div style={{
                              width: 120, flexShrink: 0, position: 'relative',
                              background: 'var(--surface)',
                            }}>
                              <Image src={getExpImage(item.experience_id)} alt={item.title} fill sizes="120px" style={{ objectFit: 'cover' }} />
                            </div>
                            <div style={{ flex: 1, padding: '16px 18px' }}>
                              <p style={{
                                fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
                                color: 'var(--text-primary)', marginBottom: 4,
                              }}>
                                {item.title}
                              </p>
                              <p style={{
                                fontSize: 13, color: 'var(--text-tertiary)',
                                fontFamily: 'var(--font-dm-sans)', marginBottom: 4,
                              }}>
                                {item.destination} · {item.travelers} {item.travelers === 1 ? 'guest' : 'guests'}
                              </p>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', borderRadius: 9999,
                                background: 'var(--emerald-dim)',
                                fontSize: 12, fontWeight: 500, color: 'var(--emerald)',
                                fontFamily: 'var(--font-dm-sans)',
                              }}>
                                {new Date(item.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>
                          </div>
                        ))}
                        <div style={{
                          padding: '10px 18px', display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', background: 'var(--bg-warm)',
                        }}>
                          <span style={{
                            fontSize: 12, color: 'var(--text-tertiary)',
                            fontFamily: 'var(--font-dm-sans)', fontWeight: 500,
                          }}>
                            Booked {new Date(booking.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <span style={{
                            fontSize: 14, fontWeight: 800, color: 'var(--text-primary)',
                            fontFamily: 'var(--font-dm-sans)',
                            textDecoration: booking.status === 'refunded' ? 'line-through' : 'none',
                            opacity: booking.status === 'refunded' ? 0.5 : 1,
                          }}>
                            ${Number(booking.total_paid).toFixed(0)}
                          </span>
                        </div>
                        <div style={{
                          padding: '10px 18px', borderTop: '1px solid var(--border)',
                          background: 'var(--bg-warm)',
                        }}>
                          <CancelBooking booking={booking} onCancelled={() => markRequested(booking.id)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <div style={{ height: 1, background: 'var(--border)', marginBottom: 48 }} />
              </>
            )}

            {/* ── Past Trips ── */}
            <section style={{ marginBottom: 48 }}>
              <h2 style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 22,
                marginBottom: 20, color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}>
                {t('Past trips')}
              </h2>

              {bookingsFailed ? (
                // Never say "no trips" when we simply could not read them.
                <p role="alert" style={{
                  fontSize: 14, color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6,
                  padding: '14px 16px', borderRadius: 'var(--r-lg)',
                  border: '1px solid var(--border)', background: 'var(--bg-warm)',
                }}>
                  We could not load your trips just now. Please refresh the page. If they are
                  still missing, email{' '}
                  <a href="mailto:contact@mapltours.com" style={{ color: 'inherit', fontWeight: 600 }}>
                    contact@mapltours.com
                  </a>{' '}
                  and we will pull up your booking by hand.
                </p>
              ) : completedBookings.length === 0 ? (
                <p style={{
                  fontSize: 14, color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-dm-sans)', lineHeight: 1.5,
                }}>
                  Your completed trips and bookings will appear here once you travel with us.
                </p>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: completedBookings.length === 1 ? '1fr' : '1fr 1fr',
                  gap: 16,
                }}>
                  {completedBookings.map((booking) => {
                    const firstItem = booking.booking_items[0]
                    return (
                      <div key={booking.id} style={{
                        borderRadius: 'var(--r-lg)',
                        overflow: 'hidden',
                        border: '1px solid var(--border)',
                        background: 'var(--card-bg)',
                        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
                        cursor: 'pointer',
                      }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                          e.currentTarget.style.transform = 'translateY(-2px)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.boxShadow = 'none'
                          e.currentTarget.style.transform = ''
                        }}
                      >
                        <div style={{
                          width: '100%', height: 180, position: 'relative',
                          background: 'var(--surface)',
                        }}>
                          <Image
                            src={getExpImage(firstItem.experience_id)}
                            alt={firstItem.title}
                            fill sizes="(max-width: 768px) 100vw, 50vw"
                            style={{ objectFit: 'cover' }}
                          />
                          <div style={{
                            position: 'absolute', bottom: 10, left: 10,
                            padding: '4px 10px', borderRadius: 9999,
                            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                            fontSize: 12, fontWeight: 600, color: '#fff',
                            fontFamily: 'var(--font-dm-sans)',
                          }}>
                            ${Number(booking.total_paid).toFixed(0)} total
                          </div>
                        </div>
                        <div style={{ padding: '16px 18px' }}>
                          <p style={{
                            fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
                            color: 'var(--text-primary)', marginBottom: 3,
                          }}>
                            {firstItem.destination}
                          </p>
                          <p style={{
                            fontSize: 13, color: 'var(--text-secondary)',
                            fontFamily: 'var(--font-dm-sans)', marginBottom: 4,
                          }}>
                            {firstItem.title}
                            {booking.booking_items.length > 1 && ` + ${booking.booking_items.length - 1} more`}
                          </p>
                          <p style={{
                            fontSize: 12, color: 'var(--text-tertiary)',
                            fontFamily: 'var(--font-dm-sans)',
                          }}>
                            {new Date(booking.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <div style={{ height: 1, background: 'var(--border)', marginBottom: 48 }} />

            {/* ── MAPL Tours Rewards (tour-video uploads) ── */}
            <section style={{ marginBottom: 48 }}>
              <h2 style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 22,
                marginBottom: 20, color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}>
                MAPL Tours Rewards
              </h2>
              <MaplRewardsCard />
            </section>

          </div>
        </div>
      </div>

      {/* Mobile responsive styles */}
      <style jsx global>{`
        @media (max-width: 768px) {
          .profile-layout {
            flex-direction: column !important;
            gap: 32px !important;
          }
          .profile-sidebar {
            width: 100% !important;
            position: relative !important;
            top: 0 !important;
          }
        }
      `}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAPL Tours Rewards card, mirrors the band shown on the experience page but in
   a richer profile-context variant (shows history of unlocked / used codes).
   ═══════════════════════════════════════════════════════════════════════════ */
function MaplRewardsCard() {
  const { approved, pending, towardNext, availableRewards, allRewards, loading } = useMyVideoProgress()
  const usedRewards = allRewards.filter((r) => r.status === 'used')
  const hasActive = availableRewards.length > 0
  const pct = hasActive ? 100 : (towardNext / VIDEO_REWARD_MILESTONE) * 100

  if (loading) {
    return (
      <div style={{
        padding: 22, borderRadius: 16,
        background: 'var(--card-bg)', border: '1px solid var(--border)',
        fontFamily: 'var(--font-dm-sans)', color: 'var(--text-tertiary)',
      }}>
        Loading your rewards…
      </div>
    )
  }

  return (
    <div style={{
      padding: '22px 22px 20px',
      borderRadius: 18,
      background: 'var(--card-bg)',
      border: '1px solid rgba(255,179,0,0.22)',
      boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, var(--gold, #FFB300) 50%, transparent)',
        opacity: 0.6,
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: hasActive ? 'var(--emerald, #00A550)' : 'var(--gold, #FFB300)',
          color: hasActive ? '#fff' : '#111',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Award size={20} strokeWidth={2} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 12, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: hasActive ? 'var(--emerald)' : 'var(--gold)',
            marginBottom: 4,
          }}>
            {hasActive ? 'Reward unlocked' : 'Video reward'}
          </p>
          <h3 style={{
            fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 18,
            letterSpacing: '-0.01em', color: 'var(--text-primary)',
            marginBottom: 4, lineHeight: 1.2,
          }}>
            {hasActive
              ? `5% off ready to use`
              : approved === 0
                ? 'Upload 5 tour videos, earn 5% off your next trip'
                : `${towardNext} of ${VIDEO_REWARD_MILESTONE} approved`}
          </h3>
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 13,
            color: 'var(--text-secondary)', lineHeight: 1.45,
          }}>
            {approved} approved · {pending} in review
          </p>

          <div style={{
            position: 'relative', marginTop: 14,
            height: 6, borderRadius: 9999,
            background: 'rgba(0,0,0,0.08)', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${pct}%`,
              background: hasActive
                ? 'var(--emerald, #00A550)'
                : 'linear-gradient(90deg, var(--gold, #FFB300), #E69A00)',
              borderRadius: 9999,
              transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            }} />
          </div>
        </div>
      </div>

      {/* Codes */}
      {(availableRewards.length + usedRewards.length) > 0 && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {availableRewards.map((r) => (
            <RewardRow key={r.id} code={r.code} status="available" percent={r.percent} />
          ))}
          {usedRewards.map((r) => (
            <RewardRow key={r.id} code={r.code} status="used" percent={r.percent} />
          ))}
        </div>
      )}
    </div>
  )
}

function RewardRow({ code, status, percent }: { code: string; status: 'available' | 'used'; percent: number }) {
  const used = status === 'used'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px',
      borderRadius: 12,
      background: used ? 'rgba(0,0,0,0.03)' : 'var(--bg-warm, rgba(255,179,0,0.06))',
      border: used ? '1px solid var(--border)' : '1px solid rgba(255,179,0,0.28)',
    }}>
      <div style={{ minWidth: 0 }}>
        <p style={{
          fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 13,
          color: used ? 'var(--text-tertiary)' : 'var(--text-primary)',
          textDecoration: used ? 'line-through' : 'none',
          letterSpacing: '-0.005em',
        }}>
          {code}
        </p>
        <p style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 12,
          color: 'var(--text-tertiary)', marginTop: 1,
        }}>
          {percent}% off · {used ? 'Used' : 'Available on your next booking'}
        </p>
      </div>
      <span style={{
        padding: '3px 10px', borderRadius: 9999,
        fontSize: 12, fontWeight: 700,
        fontFamily: 'var(--font-dm-sans)',
        letterSpacing: '0.06em', textTransform: 'uppercase',
        background: used ? 'rgba(0,0,0,0.08)' : 'rgba(0,165,80,0.12)',
        color: used ? 'var(--text-tertiary)' : 'var(--emerald, #00A550)',
      }}>
        {used ? 'Used' : 'Active'}
      </span>
    </div>
  )
}
