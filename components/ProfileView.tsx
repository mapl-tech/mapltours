'use client'

import Image from 'next/image'
// Cart store no longer used on profile — upcoming trips come from confirmed bookings
import { experiences } from '@/lib/experiences'
import { useI18n } from '@/lib/i18n'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { useSwrCache } from '@/lib/swr-cache'
import type { User } from '@supabase/supabase-js'

interface PastBooking {
  id: string
  created_at: string
  total_paid: number
  booking_items: {
    title: string
    destination: string
    travelers: number
    date: string
    experience_id: number
  }[]
}

interface SavedCreator {
  creator_handle: string
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
                  fontSize: 11, fontWeight: 600, color: 'var(--emerald)',
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

interface ProfileBundle {
  profile: ProfileData
  pastBookings: PastBooking[]
  savedCreators: SavedCreator[]
  badges: Badge[]
  likedCount: number
}

const EMPTY_BUNDLE: ProfileBundle = {
  profile: { name: null, avatar_url: null, location: null },
  pastBookings: [],
  savedCreators: [],
  badges: [],
  likedCount: 0,
}

export default function ProfileView() {
  const { t } = useI18n()
  const { user: authUser } = useAuth()
  const user: User | null = authUser
  const supabase = createClient()
  const [phone, setPhone] = useState('')
  const [identity, setIdentity] = useState('')

  // Single SWR-cached fetch of everything the profile needs. localStorage key
  // is scoped per-user so switching accounts shows the right data instantly.
  const cacheKey = user ? `profile:${user.id}` : null
  const { data: bundle, loading: initialLoading, mutate } = useSwrCache<ProfileBundle>(
    cacheKey,
    async () => {
      if (!user) return EMPTY_BUNDLE
      try {
        const [profileRes, bookingsRes, creatorsRes, badgesRes, likesRes] = await Promise.all([
          supabase.from('users').select('name, avatar_url, location').eq('id', user.id).single(),
          supabase
            .from('bookings')
            .select('id, created_at, total_paid, booking_items(title, destination, travelers, date, experience_id)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
          supabase.from('saved_creators').select('creator_handle').eq('user_id', user.id),
          supabase.from('user_badges').select('badge_name, earned_at').eq('user_id', user.id),
          supabase.from('experience_likes').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        ])
        return {
          profile: (profileRes.data as ProfileData) ?? EMPTY_BUNDLE.profile,
          pastBookings: (bookingsRes.data as PastBooking[]) ?? [],
          savedCreators: (creatorsRes.data as SavedCreator[]) ?? [],
          badges: (badgesRes.data as Badge[]) ?? [],
          likedCount: likesRes.count ?? 0,
        }
      } catch {
        // Tables may not exist yet — return empty so UI still renders
        return EMPTY_BUNDLE
      }
    },
    { enabled: !!user }
  )

  const profile = bundle?.profile ?? EMPTY_BUNDLE.profile
  const pastBookings = bundle?.pastBookings ?? []
  const savedCreators = bundle?.savedCreators ?? []
  const badges = bundle?.badges ?? []
  const likedCount = bundle?.likedCount ?? 0
  // Only block on a full-screen loader the very first time (no cache at all).
  const loading = !user ? false : initialLoading

  useEffect(() => {
    if (user) {
      setPhone(user.user_metadata?.phone || '')
      setIdentity(user.user_metadata?.identity_number || '')
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

  function getCreatorInfo(handle: string) {
    const exp = experiences.find(e => e.creator === handle)
    return { image: exp?.image || experiences[0].image, followers: exp?.followers || '—' }
  }

  async function updateEmail(newEmail: string) {
    await supabase.auth.updateUser({ email: newEmail })
  }

  async function updatePhone(newPhone: string) {
    setPhone(newPhone)
    await supabase.auth.updateUser({ data: { phone: newPhone } })
  }

  async function updateIdentity(newId: string) {
    setIdentity(newId)
    await supabase.auth.updateUser({ data: { identity_number: newId } })
  }

  async function updateName(newName: string) {
    await supabase.auth.updateUser({ data: { full_name: newName } })
    await supabase.from('users').update({ name: newName }).eq('id', user!.id)
    mutate((prev) => ({
      ...(prev ?? EMPTY_BUNDLE),
      profile: { ...((prev ?? EMPTY_BUNDLE).profile), name: newName },
    }))
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
                  <span style={{ fontSize: 54 }}>🧳</span>
                )}
              </div>

              <h1 style={{
                fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 28,
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
                  { value: likedCount, label: 'Saved' },
                ].map((s, i) => (
                  <div key={s.label} style={{
                    textAlign: 'center',
                    borderRight: i < 2 ? '1px solid var(--border)' : 'none',
                  }}>
                    <p style={{
                      fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 24,
                      color: 'var(--text-primary)', lineHeight: 1, marginBottom: 4,
                    }}>
                      {s.value}
                    </p>
                    <p style={{
                      fontSize: 11, color: 'var(--text-tertiary)',
                      fontFamily: 'var(--font-dm-sans)', fontWeight: 500,
                    }}>
                      {s.label}
                    </p>
                  </div>
                ))}
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
                fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 17,
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
                  { text: 'Government ID', done: !!identity },
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
                      fontSize: 11, fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {item.done ? '✓' : '—'}
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
                  fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 17,
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
                        fontSize: 13.5, fontFamily: 'var(--font-dm-sans)',
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
                fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 28,
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
                verified={!!email}
              />
              <EditableField
                label="Phone number"
                value={phone}
                placeholder="+1 (876) 555-0123"
                type="tel"
                onSave={updatePhone}
                verified={!!phone}
              />
              <EditableField
                label="Government ID"
                value={identity}
                placeholder="Passport or driver's license number"
                onSave={updateIdentity}
                verified={!!identity}
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
                    fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 22,
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
                            fontSize: 11, color: 'var(--text-tertiary)',
                            fontFamily: 'var(--font-dm-sans)', fontWeight: 500,
                          }}>
                            Booked {new Date(booking.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <span style={{
                            fontSize: 14, fontWeight: 800, color: 'var(--text-primary)',
                            fontFamily: 'var(--font-syne)',
                          }}>
                            ${Number(booking.total_paid).toFixed(0)}
                          </span>
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
                fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 22,
                marginBottom: 20, color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}>
                {t('Past trips')}
              </h2>

              {completedBookings.length === 0 ? (
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
                            fontSize: 11, fontWeight: 600, color: '#fff',
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

            {/* ── Saved Creators ── */}
            <section style={{ marginBottom: 48 }}>
              <h2 style={{
                fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 22,
                marginBottom: 20, color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}>
                {t('Saved creators')}
              </h2>

              {savedCreators.length === 0 ? (
                <p style={{
                  fontSize: 14, color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-dm-sans)', lineHeight: 1.5,
                }}>
                  Follow your favorite experience creators and they will show up here.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {savedCreators.map((c, i) => {
                    const info = getCreatorInfo(c.creator_handle)
                    return (
                      <div key={c.creator_handle} style={{
                        display: 'flex', alignItems: 'center', gap: 16,
                        padding: '18px 0',
                        borderBottom: i < savedCreators.length - 1 ? '1px solid var(--border)' : 'none',
                      }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: '50%',
                          overflow: 'hidden', flexShrink: 0, position: 'relative',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                        }}>
                          <Image src={info.image} alt={c.creator_handle} fill sizes="52px" style={{ objectFit: 'cover' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{
                            fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
                            color: 'var(--text-primary)', marginBottom: 2,
                          }}>
                            @{c.creator_handle}
                          </p>
                          <p style={{
                            fontSize: 13, color: 'var(--text-tertiary)',
                            fontFamily: 'var(--font-dm-sans)',
                          }}>
                            {info.followers} followers
                          </p>
                        </div>
                        <button className="btn-outline" style={{
                          height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600,
                          borderRadius: 'var(--r-sm)',
                        }}>
                          Following
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
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
