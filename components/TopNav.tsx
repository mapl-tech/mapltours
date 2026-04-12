'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCartStore } from '@/lib/cart'
import { useState, useEffect, useRef } from 'react'
import { Search, Leaf, MapPin, ShoppingBag } from 'lucide-react'
import LanguageSwitcher from './LanguageSwitcher'
import { useI18n } from '@/lib/i18n'

const destinations = [
  { name: 'Negril', parish: 'Westmoreland' },
  { name: 'Blue Mountains', parish: 'St. Andrew' },
  { name: 'Kingston', parish: 'Kingston' },
  { name: 'Ocho Rios', parish: 'St. Ann' },
  { name: 'Port Antonio', parish: 'Portland' },
  { name: 'Montego Bay', parish: 'St. James' },
  { name: 'Treasure Beach', parish: 'St. Elizabeth' },
  { name: 'Falmouth', parish: 'Trelawny' },
  { name: 'Boston Bay', parish: 'Portland' },
  { name: 'Nine Mile', parish: 'St. Ann' },
]

export default function TopNav({ onCartClick }: { onCartClick?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const items = useCartStore((s) => s.items)
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [where, setWhere] = useState('')
  const [showWhere, setShowWhere] = useState(false)
  const [when, setWhen] = useState('')
  const [guests, setGuests] = useState(0)
  const [showGuests, setShowGuests] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)
  const lastScrollY = useRef(0)
  const { t } = useI18n()
  const isHome = pathname === '/'
  const isExperience = pathname.startsWith('/experience')
  const isCheckout = pathname.startsWith('/checkout')
  const isExplore = pathname.startsWith('/explore')

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setScrolled(y > 10)
      // Hide when scrolling up, show when scrolling down or at top
      if (y < 80 || y > lastScrollY.current) {
        setHidden(false)
      } else {
        setHidden(true)
      }
      lastScrollY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showGuests && !showWhere) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-dropdown]')) return
      setShowGuests(false)
      setShowWhere(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showGuests, showWhere])

  const dark = isHome && !scrolled
  const linkColor = dark ? 'rgba(255,255,255,0.75)' : 'var(--text-secondary)'

  if (isExperience) return null

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        height: 56,
        display: 'flex',
        alignItems: 'center',
        transition: 'all 0.35s cubic-bezier(0.22,1,0.36,1)',
        transform: hidden ? 'translateY(-100%)' : 'translateY(0)',
        background: dark ? 'transparent' : 'rgba(255,255,255,0.97)',
        backdropFilter: dark ? 'none' : 'blur(24px) saturate(1.2)',
        WebkitBackdropFilter: dark ? 'none' : 'blur(24px) saturate(1.2)',
        borderBottom: dark ? 'none' : '1px solid var(--border)',
      }}
    >
      {/* Inner container — same max-width as body content */}
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          gap: 16,
        }}
      >
        {/* ── Logo ── */}
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
            transition: 'all 0.3s ease',
          }}
        >
          {/* Icon mark */}
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: dark ? 'rgba(255,255,255,0.1)' : 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.3s ease',
          }}>
            <Leaf size={16} strokeWidth={2.5} color={dark ? '#fff' : '#fff'} />
          </div>
          {/* Wordmark */}
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <span style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: dark ? '#fff' : 'var(--text-primary)',
              transition: 'color 0.3s ease',
            }}>
              MAPL
            </span>
            <span style={{
              fontFamily: 'var(--font-dm-sans)',
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: dark ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)',
              transition: 'color 0.3s ease',
              marginTop: 1,
            }}>
              Tours Jamaica
            </span>
          </div>
        </Link>

        {/* ── Search Bar (hidden on experience/checkout/explore/mobile) ── */}
        {!isExperience && !isCheckout && !isExplore && <div className="hide-mobile"
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 48,
            flex: '0 1 520px',
            borderRadius: 9999,
            background: '#FFFFFF',
            border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: dark
              ? '0 2px 12px rgba(0,0,0,0.12)'
              : 'var(--shadow-sm)',
            transition: 'box-shadow 0.3s ease',
          }}
        >
          {/* Where */}
          <div data-dropdown style={{
            flex: 1.4, padding: '0 18px', cursor: 'text',
            borderRight: '1px solid var(--border)',
            height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
            position: 'relative',
          }}>
            <span style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-dm-sans)', lineHeight: 1, marginBottom: 1,
            }}>
              {t('Where')}
            </span>
            <input
              type="text"
              value={where}
              onChange={(e) => { setWhere(e.target.value); setShowWhere(true) }}
              onFocus={() => setShowWhere(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setShowWhere(false)
                  router.push(`/explore?q=${encodeURIComponent(where)}`)
                }
              }}
              placeholder="Search destinations"
              style={{
                width: '100%', background: 'none', border: 'none',
                outline: 'none', padding: 0, fontSize: 13,
                fontFamily: 'var(--font-dm-sans)', fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            />

            {/* Destination dropdown */}
            {showWhere && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 8,
                background: '#fff', borderRadius: 'var(--r-lg)',
                border: '1px solid var(--border)',
                boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
                padding: '8px 0', minWidth: 280, width: '100%',
                zIndex: 10, maxHeight: 320, overflowY: 'auto',
              }}>
                <p style={{
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-dm-sans)', padding: '8px 16px 6px',
                }}>
                  {where ? t('Results') : t('Popular destinations')}
                </p>
                {destinations
                  .filter((d) => !where || d.name.toLowerCase().includes(where.toLowerCase()) || d.parish.toLowerCase().includes(where.toLowerCase()))
                  .map((d) => (
                    <button
                      key={d.name}
                      onClick={() => {
                        setWhere(d.name)
                        setShowWhere(false)
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', padding: '10px 16px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        textAlign: 'left', transition: 'background 0.1s ease',
                        fontFamily: 'var(--font-dm-sans)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 'var(--r-sm)',
                        background: 'var(--surface)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <MapPin size={15} color="var(--text-tertiary)" />
                      </div>
                      <div>
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</p>
                        <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 1 }}>{d.parish}, Jamaica</p>
                      </div>
                    </button>
                  ))}
                {where && destinations.filter((d) => d.name.toLowerCase().includes(where.toLowerCase()) || d.parish.toLowerCase().includes(where.toLowerCase())).length === 0 && (
                  <p style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
                    {t('No destinations found')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* When */}
          <div
            onClick={() => dateRef.current?.showPicker()}
            style={{
              flex: 1, padding: '0 16px', cursor: 'pointer',
              borderRight: '1px solid var(--border)',
              height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
              position: 'relative',
            }}
          >
            <span style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-dm-sans)', lineHeight: 1, marginBottom: 1,
            }}>
              {t('When')}
            </span>
            <span style={{
              fontSize: 13, fontFamily: 'var(--font-dm-sans)', fontWeight: 500,
              color: when ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}>
              {when
                ? new Date(when + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : t('Any dates')}
            </span>
            <input
              ref={dateRef}
              type="date"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              style={{
                position: 'absolute', inset: 0,
                opacity: 0, cursor: 'pointer',
                width: '100%', height: '100%',
              }}
            />
          </div>

          {/* Who */}
          <div
            data-dropdown
            onClick={() => setShowGuests(!showGuests)}
            style={{
              flex: 0.8, padding: '0 14px', cursor: 'pointer',
              height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
              position: 'relative',
            }}
          >
            <span style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-dm-sans)', lineHeight: 1, marginBottom: 1,
            }}>
              {t('Who')}
            </span>
            <span style={{
              fontSize: 13, fontFamily: 'var(--font-dm-sans)', fontWeight: 500,
              color: guests > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}>
              {guests > 0 ? `${guests} ${t('Guests')}` : t('Guests')}
            </span>

            {/* Guest dropdown */}
            {showGuests && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 8,
                  background: '#fff', borderRadius: 'var(--r-lg)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                  padding: '16px 20px', minWidth: 200,
                  zIndex: 10,
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', marginBottom: 12 }}>
                  Guests
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, fontFamily: 'var(--font-dm-sans)', color: 'var(--text-secondary)' }}>
                    Adults
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    <button
                      onClick={() => setGuests(Math.max(0, guests - 1))}
                      style={{
                        width: 32, height: 32, borderRadius: '50%',
                        border: '1px solid var(--border)', background: '#fff',
                        cursor: 'pointer', fontSize: 16,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: guests === 0 ? 'var(--text-tertiary)' : 'var(--text-primary)',
                      }}
                    >−</button>
                    <span style={{
                      width: 36, textAlign: 'center',
                      fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
                    }}>
                      {guests}
                    </span>
                    <button
                      onClick={() => setGuests(Math.min(12, guests + 1))}
                      style={{
                        width: 32, height: 32, borderRadius: '50%',
                        border: '1px solid var(--border)', background: '#fff',
                        cursor: 'pointer', fontSize: 16,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-primary)',
                      }}
                    >+</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Search button */}
          <button
            onClick={() => router.push(`/explore?q=${encodeURIComponent(where)}`)}
            aria-label="Search"
            style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'var(--accent)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', cursor: 'pointer', fontSize: 16,
              flexShrink: 0, marginRight: 5,
              transition: 'transform 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.06)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = '' }}
          >
            <Search size={16} strokeWidth={2.5} />
          </button>
        </div>}

        {/* ── Right ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <LanguageSwitcher dark={dark} />
          <Link
            href="/explore"
            style={{
              padding: '6px 12px', fontSize: 13, fontWeight: 500,
              fontFamily: 'var(--font-dm-sans)', color: linkColor,
              borderRadius: 9999, transition: 'color 0.15s ease',
            }}
          >
            {t('Explore')}
          </Link>

          {items.length > 0 ? (
            <button
              onClick={onCartClick}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                height: 34, padding: '0 14px',
                borderRadius: 9999, fontSize: 12, fontWeight: 600,
                fontFamily: 'var(--font-dm-sans)', cursor: 'pointer',
                background: dark ? 'rgba(255,255,255,0.12)' : 'var(--accent)',
                color: '#fff',
                border: dark ? '1px solid rgba(255,255,255,0.16)' : 'none',
                backdropFilter: dark ? 'blur(16px)' : 'none',
                WebkitBackdropFilter: dark ? 'blur(16px)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <ShoppingBag size={14} />
              {t('Itinerary')}
              <span style={{
                minWidth: 17, height: 17, padding: '0 5px',
                borderRadius: 9999, background: 'rgba(255,255,255,0.18)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
              }}>
                {items.length}
              </span>
            </button>
          ) : (
            <Link
              href="/profile"
              style={{
                padding: '6px 12px', fontSize: 13, fontWeight: 500,
                fontFamily: 'var(--font-dm-sans)', color: linkColor,
                borderRadius: 9999, transition: 'color 0.15s ease',
              }}
            >
              {t('Profile')}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
