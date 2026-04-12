'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCartStore } from '@/lib/cart'
import { experiences } from '@/lib/experiences'
import { useI18n } from '@/lib/i18n'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
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

export default function ProfileView() {
  const { items, removeItem } = useCartStore()
  const { t } = useI18n()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProfileData>({ name: null, avatar_url: null, location: null })
  const [pastBookings, setPastBookings] = useState<PastBooking[]>([])
  const [savedCreators, setSavedCreators] = useState<SavedCreator[]>([])
  const [badges, setBadges] = useState<Badge[]>([])
  const [likedCount, setLikedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [phone, setPhone] = useState('')
  const [identity, setIdentity] = useState('')
  const [cancellingId, setCancellingId] = useState<number | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        // DB tables may not exist yet — wrap in try/catch so the profile
        // still renders with empty states instead of crashing.
        try {
          const [profileRes, bookingsRes, creatorsRes, badgesRes, likesRes] = await Promise.all([
            supabase
              .from('users')
              .select('name, avatar_url, location')
              .eq('id', user.id)
              .single(),
            supabase
              .from('bookings')
              .select('id, created_at, total_paid, booking_items(title, destination, travelers, date, experience_id)')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false }),
            supabase
              .from('saved_creators')
              .select('creator_handle')
              .eq('user_id', user.id),
            supabase
              .from('user_badges')
              .select('badge_name, earned_at')
              .eq('user_id', user.id),
            supabase
              .from('experience_likes')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id),
          ])

          if (profileRes.data) setProfile(profileRes.data)
          if (bookingsRes.data) setPastBookings(bookingsRes.data as PastBooking[])
          if (creatorsRes.data) setSavedCreators(creatorsRes.data)
          if (badgesRes.data) setBadges(badgesRes.data)
          if (likesRes.count !== null) setLikedCount(likesRes.count)
        } catch {
          // Tables don't exist yet — profile renders with default empty states
        }

        // Load phone/identity from user metadata
        setPhone(user.user_metadata?.phone || '')
        setIdentity(user.user_metadata?.identity_number || '')
      }

      setLoading(false)
    }

    loadProfile()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const displayName = profile.name || user?.user_metadata?.full_name || user?.user_metadata?.name || 'Traveler'
  const firstName = displayName.split(' ')[0]
  const avatarUrl = profile.avatar_url || user?.user_metadata?.avatar_url
  const email = user?.email || ''
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'recently'

  const tripsCompleted = pastBookings.length
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
    setProfile((p) => ({ ...p, name: newName }))
  }

  async function updateLocation(newLocation: string) {
    await supabase.from('users').update({ location: newLocation }).eq('id', user!.id)
    setProfile((p) => ({ ...p, location: newLocation }))
  }

  function handleCancelTrip(id: number) {
    setCancellingId(id)
  }

  function confirmCancel(id: number) {
    removeItem(id)
    setCancellingId(null)
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

            {/* ── Upcoming Trips (with cancel) ── */}
            <section style={{ marginBottom: 48 }}>
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                marginBottom: 20,
              }}>
                <h2 style={{
                  fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 22,
                  color: 'var(--text-primary)', letterSpacing: '-0.02em',
                }}>
                  {t('Upcoming trips')}
                </h2>
                {items.length > 0 && (
                  <Link href="/checkout" style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                    fontFamily: 'var(--font-dm-sans)', textDecoration: 'underline',
                  }}>
                    View checkout
                  </Link>
                )}
              </div>

              {items.length === 0 ? (
                <div style={{
                  padding: '48px 24px', textAlign: 'center',
                  borderRadius: 'var(--r-xl)',
                  border: '1px dashed var(--border-strong)',
                  background: 'var(--bg-warm)',
                }}>
                  <p style={{ fontSize: 36, marginBottom: 12 }}>🌴</p>
                  <p style={{
                    fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                    fontFamily: 'var(--font-syne)', marginBottom: 6,
                  }}>
                    No upcoming trips
                  </p>
                  <p style={{
                    fontSize: 13, color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-dm-sans)', marginBottom: 20,
                  }}>
                    Your next Jamaican adventure is waiting
                  </p>
                  <Link href="/explore" className="btn-primary" style={{
                    display: 'inline-flex', padding: '10px 28px',
                    fontSize: 13, fontWeight: 600,
                  }}>
                    Explore experiences
                  </Link>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {items.map((item) => (
                    <div key={item.id} style={{
                      borderRadius: 'var(--r-lg)',
                      border: '1px solid var(--border)',
                      overflow: 'hidden',
                      background: 'var(--card-bg)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    }}>
                      <div style={{ display: 'flex', gap: 0 }}>
                        <div style={{
                          width: 140, flexShrink: 0, position: 'relative',
                          background: 'var(--surface)',
                        }}>
                          <Image src={item.image} alt={item.title} fill sizes="140px" style={{ objectFit: 'cover' }} />
                        </div>
                        <div style={{ flex: 1, padding: '18px 20px' }}>
                          <p style={{
                            fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
                            color: 'var(--text-primary)', marginBottom: 4,
                          }}>
                            {t(item.title)}
                          </p>
                          <p style={{
                            fontSize: 13, color: 'var(--text-tertiary)',
                            fontFamily: 'var(--font-dm-sans)', marginBottom: 8,
                          }}>
                            {item.destination} · {item.duration} · {item.travelers} {item.travelers === 1 ? 'guest' : 'guests'}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '4px 10px', borderRadius: 9999,
                              background: 'var(--surface)',
                              fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)',
                              fontFamily: 'var(--font-dm-sans)',
                            }}>
                              {new Date(item.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            <span style={{
                              fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-syne)',
                              color: 'var(--text-primary)',
                            }}>
                              ${item.price * item.travelers}
                            </span>
                          </div>

                          {/* Cancel flow */}
                          {cancellingId === item.id ? (
                            <div style={{
                              padding: '12px 14px', borderRadius: 'var(--r-sm)',
                              background: '#FEF2F2', border: '1px solid #FECACA',
                            }}>
                              <p style={{
                                fontSize: 13, fontWeight: 500, color: '#991B1B',
                                fontFamily: 'var(--font-dm-sans)', marginBottom: 10,
                              }}>
                                Are you sure you want to cancel this trip?
                              </p>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  onClick={() => confirmCancel(item.id)}
                                  style={{
                                    height: 34, padding: '0 16px',
                                    borderRadius: 'var(--r-sm)',
                                    background: '#DC2626', color: '#fff',
                                    border: 'none', fontSize: 13, fontWeight: 600,
                                    fontFamily: 'var(--font-dm-sans)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Yes, cancel trip
                                </button>
                                <button
                                  onClick={() => setCancellingId(null)}
                                  style={{
                                    height: 34, padding: '0 16px',
                                    borderRadius: 'var(--r-sm)',
                                    background: 'transparent',
                                    border: '1px solid var(--border-strong)',
                                    fontSize: 13, fontWeight: 500,
                                    fontFamily: 'var(--font-dm-sans)',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Keep trip
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleCancelTrip(item.id)}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)',
                                fontFamily: 'var(--font-dm-sans)',
                                textDecoration: 'underline',
                                padding: 0,
                              }}
                            >
                              Cancel trip
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <p style={{
                    fontSize: 12, color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-dm-sans)',
                    marginTop: 4,
                  }}>
                    Free cancellation up to 48 hours before your experience.
                  </p>
                </div>
              )}
            </section>

            <div style={{ height: 1, background: 'var(--border)', marginBottom: 48 }} />

            {/* ── Past Trips ── */}
            <section style={{ marginBottom: 48 }}>
              <h2 style={{
                fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 22,
                marginBottom: 20, color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}>
                {t('Past trips')}
              </h2>

              {pastBookings.length === 0 ? (
                <p style={{
                  fontSize: 14, color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-dm-sans)', lineHeight: 1.5,
                }}>
                  Your completed trips and bookings will appear here once you travel with us.
                </p>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: pastBookings.length === 1 ? '1fr' : '1fr 1fr',
                  gap: 16,
                }}>
                  {pastBookings.map((booking) => {
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
