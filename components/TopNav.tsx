'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useCartStore } from '@/lib/cart'
import { useState, useEffect, useRef } from 'react'
import { Search, Lock, MapPin, ShoppingBag, Car, Menu, X } from 'lucide-react'
import { DESTINATIONS as TRANSFER_DESTINATIONS } from '@/lib/airport-transfers'
import { TOUR_DESTINATIONS } from '@/lib/experiences'
import LanguageSwitcher from './LanguageSwitcher'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/supabase/auth-context'
import { createClient } from '@/lib/supabase/client'

// One module-level client, don't recreate on every render.
const supabase = createClient()

// Tour search suggestions: only destinations Collins actually serves.
const destinations = TOUR_DESTINATIONS

export default function TopNav({ onCartClick }: { onCartClick?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const items = useCartStore((s) => s.items)
  const stops = useCartStore((s) => s.stops)
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [where, setWhere] = useState('')
  const [showWhere, setShowWhere] = useState(false)
  const [guests, setGuests] = useState(0)
  const [showGuests, setShowGuests] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const lastScrollY = useRef(0)
  const { t } = useI18n()
  const { user } = useAuth()
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const isHome = pathname === '/'
  const isExperience = pathname.startsWith('/experience')
  const isCheckout = pathname.startsWith('/checkout') || pathname.startsWith('/transfers/checkout')
  const isExplore = pathname.startsWith('/explore')
  const isProfile = pathname.startsWith('/profile')
  const isTransfers = pathname.startsWith('/transfers')

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setScrolled(y > 10)
      // Hide when scrolling down (content immersion), show when scrolling
      // up (the universal reach-the-chrome gesture).
      if (y < 10) {
        setHidden(false) // Always show at very top
      } else if (y > lastScrollY.current + 5) {
        setHidden(true) // Scrolling down - hide
      } else if (y < lastScrollY.current - 5) {
        setHidden(false) // Scrolling up - show
      }
      lastScrollY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showGuests && !showWhere && !showProfileMenu) return // eslint-disable-line react-hooks/exhaustive-deps
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-dropdown]')) return
      setShowGuests(false)
      setShowWhere(false)
      setShowProfileMenu(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showGuests, showWhere])

  // Mobile menu / search sheets: close on navigation and Escape, lock the
  // page scroll while either is open so the sheet never scrolls the content
  // behind it.
  useEffect(() => { setShowMenu(false); setShowSearch(false) }, [pathname])
  useEffect(() => {
    if (!showMenu && !showSearch) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowMenu(false); setShowSearch(false) }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [showMenu, showSearch])

  // The sheet is a solid white surface, so the bar above it must not stay
  // transparent over the hero while it is open.
  const dark = isHome && !scrolled && !showMenu
  const linkColor = dark ? 'rgba(255,255,255,0.75)' : 'var(--text-secondary)'
  // One flag for every surface that swaps with the search bar: the desktop
  // Explore link leaves when the bar is on screen, and the mobile bar swaps
  // the Transfers pill for the search pill on the same routes.
  const searchVisible = !isExperience && !isCheckout && !isExplore && !isProfile

  if (isExperience) return null

  // ── Checkout: a deliberately minimal header ──
  // A guest entering card details is the most expensive visitor to lose, so
  // every navigation link is an exit ramp and search is a distraction. What
  // stays: the logo (never trap someone mid-checkout) and a secure-checkout
  // marker where the nav used to be. Fixed at the same 56px the checkout
  // pages already pad for, and it never hides on scroll.
  if (isCheckout) {
    return (
      <header
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 56,
          display: 'flex', alignItems: 'center',
          background: 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(24px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* maxWidth matches the checkout body (both CheckoutView and
            TransfersCheckoutView constrain to 1100), so the logo and the
            secure-checkout marker sit on the same left and right edges as the
            Back link, the title and the step indicator below them. The bare
            .container is 1832px, which pushed both to the viewport edges and
            left the header visibly unrelated to the page under it. */}
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 16, maxWidth: 1100, paddingLeft: 16, paddingRight: 16 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, minHeight: 44 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mapl-logo.svg" alt="MAPL Tours Jamaica" width={160} height={38} style={{ height: 38, width: 'auto', display: 'block' }} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-dm-sans)', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
            <Lock size={13} strokeWidth={2.5} aria-hidden="true" />
            {t('Secure checkout')}
          </div>
        </div>
      </header>
    )
  }

  return (
    <>
    <header
      className={`nav-header${isCheckout ? ' nav-checkout' : ''}`}
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
      {/* Inner container, same max-width as body content. Relative so the
          centered search bar can absolutely position against it. */}
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          gap: 16,
          position: 'relative',
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
            minHeight: 44,
            transition: 'all 0.3s ease',
          }}
        >
          {/* Brand lockup, from the rebrand. Two files rather than one
              recoloured by CSS: the mark carries the Jamaica green and gold
              and only the wordmark flips, so a filter would wreck the flag
              colours. `dark` is true over the hero video. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="nav-logo-img"
            src={dark ? '/mapl-logo-dark.svg' : '/mapl-logo.svg'}
            alt="MAPL Tours Jamaica"
            width={176}
            height={42}
            style={{
              height: 42,
              width: 'auto',
              display: 'block',
              transition: 'opacity 0.3s ease',
            }}
          />
        </Link>

        {/* ── Search Bar (hidden on experience/checkout/explore/profile/mobile) ── */}
        {searchVisible && <div className="hide-mobile nav-search-wrap"
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 48,
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
              fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-dm-sans)', lineHeight: 1, marginBottom: 1,
            }}>
              {t('Where')}
            </span>
            <input
              type="text"
              aria-label="Where to?"
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
                {where && TRANSFER_DESTINATIONS.some((d) => d.name.toLowerCase().includes(where.toLowerCase())) && (
                  <>
                    <p style={{
                      fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
                      letterSpacing: '0.06em', color: 'var(--text-tertiary)',
                      fontFamily: 'var(--font-dm-sans)', padding: '8px 16px 6px',
                    }}>
                      {t('Resorts · airport transfers')}
                    </p>
                    {TRANSFER_DESTINATIONS
                      .filter((d) => d.name.toLowerCase().includes(where.toLowerCase()))
                      .slice(0, 5)
                      .map((d) => (
                        <button
                          key={d.id}
                          onClick={() => {
                            setWhere(d.name)
                            setShowWhere(false)
                            router.push(`/transfers?to=${d.id}`)
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
                            background: 'var(--gold-dim, rgba(196,164,74,0.15))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <Car size={15} color="var(--gold-text, #6E5A1C)" />
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</p>
                            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1 }}>{t('Airport transfer from MBJ')} · {d.parish}</p>
                          </div>
                        </button>
                      ))}
                  </>
                )}
                <p style={{
                  fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
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
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</p>
                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1 }}>{d.parish}, Jamaica</p>
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
              fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
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
              width: 44, height: 44, borderRadius: '50%',
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

        {/* ── Mobile search pill (Airbnb pattern): opens the full-screen
            search sheet. Shown on the same routes as the desktop bar. ── */}
        {searchVisible && (
          <button
            className="hide-desktop"
            onClick={() => setShowSearch(true)}
            style={{
              flex: 1, minWidth: 0, height: 40, borderRadius: 9999,
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 16px', border: '1px solid rgba(0,0,0,0.08)',
              background: '#fff', cursor: 'pointer',
              boxShadow: dark ? '0 2px 12px rgba(0,0,0,0.18)' : 'var(--shadow-sm)',
              fontFamily: 'var(--font-dm-sans)', fontSize: 14, fontWeight: 500,
              color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden',
            }}
          >
            <Search size={15} strokeWidth={2.5} color="var(--text-primary)" />
            {t('Start your search')}
          </button>
        )}

        {/* ── Right ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* Explore steps aside while the search bar is on screen: the bar
              already routes to /explore, so the link would be a duplicate. */}
          {!searchVisible && (
            <Link
              href="/explore"
              className="tap-target hide-mobile"
              aria-current={isExplore ? 'page' : undefined}
              style={{
                padding: '6px 12px', fontSize: 13, fontWeight: isExplore ? 700 : 500,
                fontFamily: 'var(--font-dm-sans)', color: isExplore ? (dark ? '#fff' : 'var(--accent)') : linkColor,
                borderRadius: 9999, transition: 'color 0.15s ease',
              }}
            >
              {t('Explore')}
            </Link>
          )}

          {/* The gold Transfers CTA disappears on the transfers page itself:
              a primary CTA pointing at the page you are on is dead weight. */}
          {!isTransfers && (
            <Link
              href="/transfers"
              className={searchVisible ? 'hide-mobile' : undefined}
              style={{
                display: 'inline-flex', alignItems: 'center',
                minHeight: 38, padding: '0 16px', fontSize: 13, fontWeight: 700,
                fontFamily: 'var(--font-dm-sans)', color: '#1A1508',
                background: 'var(--gold)', borderRadius: 9999,
                transition: 'filter 0.15s ease', whiteSpace: 'nowrap',
                textDecoration: 'none',
              }}
            >
              {t('Transfers')}
            </Link>
          )}

          <div className="hide-mobile"><LanguageSwitcher dark={dark} /></div>

          {(items.length > 0 || stops.length > 0) && (
            <button
              onClick={onCartClick}
              aria-label={`${t('Itinerary')}, ${items.length + stops.length} ${items.length + stops.length === 1 ? 'item' : 'items'}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                minHeight: 44, padding: '0 14px',
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
              <span className="hide-mobile">{t('Itinerary')}</span>
              <span className="hide-desktop">{t('Trip')}</span>
              <span style={{
                minWidth: 17, height: 17, padding: '0 5px',
                borderRadius: 9999, background: 'rgba(255,255,255,0.18)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
              }}>
                {items.length + stops.length}
              </span>
            </button>
          )}

          {/* Profile icon, always visible on desktop */}
          <div data-dropdown className="hide-mobile" style={{ position: 'relative' }}>
            {user ? (
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={showProfileMenu}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  overflow: 'hidden', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: user.user_metadata?.avatar_url
                    ? 'transparent'
                    : dark ? 'rgba(255,255,255,0.1)' : 'var(--surface)',
                  border: dark ? '1.5px solid rgba(255,255,255,0.2)' : '1.5px solid var(--border-strong)',
                  cursor: 'pointer', padding: 0,
                  transition: 'all 0.15s ease',
                }}
              >
                {user.user_metadata?.avatar_url ? (
                  <Image src={user.user_metadata.avatar_url} alt="" width={32} height={32} style={{ objectFit: 'cover' }} />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={dark ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                )}
              </button>
            ) : (
              <Link
                href="/login"
                aria-label="Sign in"
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  overflow: 'hidden', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: dark ? 'rgba(255,255,255,0.1)' : 'var(--surface)',
                  border: dark ? '1.5px solid rgba(255,255,255,0.2)' : '1.5px solid var(--border-strong)',
                  transition: 'all 0.15s ease',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={dark ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </Link>
            )}

            {/* Profile dropdown menu */}
            {showProfileMenu && user && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 8,
                background: '#fff', borderRadius: 'var(--r-lg)',
                border: '1px solid var(--border)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                padding: '8px 0', minWidth: 200,
                zIndex: 10,
              }}>
                {/* User info */}
                <div style={{
                  padding: '12px 16px 10px', borderBottom: '1px solid var(--border)',
                }}>
                  <p style={{
                    fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
                    fontFamily: 'var(--font-dm-sans)',
                  }}>
                    {user.user_metadata?.full_name || user.user_metadata?.name || 'Traveler'}
                  </p>
                  <p style={{
                    fontSize: 12, color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-dm-sans)', marginTop: 2,
                  }}>
                    {user.email}
                  </p>
                </div>

                {/* Menu items */}
                {[
                  { label: 'Profile', href: '/profile' },
                  { label: 'Help Center', href: '/help' },
                ].map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setShowProfileMenu(false)}
                    style={{
                      display: 'block', padding: '10px 16px',
                      fontSize: 14, color: 'var(--text-primary)',
                      fontFamily: 'var(--font-dm-sans)',
                      transition: 'background 0.1s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {item.label}
                  </Link>
                ))}

                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

                {/* Sign out */}
                <button
                  onClick={async () => {
                    await supabase.auth.signOut()
                    setShowProfileMenu(false)
                    // Auth context handles state update via onAuthStateChange
                    router.push('/')
                    router.refresh()
                  }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 16px',
                    fontSize: 14, color: 'var(--text-primary)',
                    fontFamily: 'var(--font-dm-sans)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>

          {/* Menu button, mobile only: opens the sheet holding everything
              that does not fit the 56px bar (Explore, currency, account). */}
          <button
            className="hide-desktop"
            onClick={() => setShowMenu(!showMenu)}
            aria-label={showMenu ? 'Close menu' : 'Menu'}
            aria-expanded={showMenu}
            style={{
              width: 44, height: 44, margin: '0 -8px 0 -4px', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: dark ? '#fff' : 'var(--text-primary)',
            }}
          >
            {showMenu ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
          </button>
        </div>
      </div>
    </header>

    {/* ── Mobile search sheet ──
        Full-screen so the keyboard and the suggestion list get the whole
        viewport. Same containing-block rule as the menu sheet below. */}
    {showSearch && (
      <div
        className="hide-desktop nav-sheet"
        role="dialog"
        aria-label="Search"
        style={{
          position: 'fixed', inset: 0, zIndex: 120,
          background: '#fff', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px 10px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 10,
            height: 44, borderRadius: 9999, padding: '0 16px',
            border: '1px solid var(--border-strong)', background: 'var(--surface)',
          }}>
            <Search size={16} strokeWidth={2.5} color="var(--text-primary)" />
            <input
              type="text"
              autoFocus
              aria-label="Where to?"
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setShowSearch(false)
                  router.push(`/explore?q=${encodeURIComponent(where)}`)
                }
              }}
              placeholder={t('Where to?')}
              style={{
                flex: 1, minWidth: 0, background: 'none', border: 'none',
                outline: 'none', padding: 0, fontSize: 16,
                fontFamily: 'var(--font-dm-sans)', fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <button
            onClick={() => setShowSearch(false)}
            aria-label="Close search"
            style={{
              width: 44, height: 44, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: 'var(--text-primary)',
            }}
          >
            <X size={22} strokeWidth={2} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0 16px' }}>
          {where && TRANSFER_DESTINATIONS.some((d) => d.name.toLowerCase().includes(where.toLowerCase())) && (
            <>
              <p style={{
                fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-dm-sans)', padding: '10px 20px 6px',
              }}>
                {t('Resorts · airport transfers')}
              </p>
              {TRANSFER_DESTINATIONS
                .filter((d) => d.name.toLowerCase().includes(where.toLowerCase()))
                .slice(0, 5)
                .map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setShowSearch(false)
                      setWhere(d.name)
                      router.push(`/transfers?to=${d.id}`)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      width: '100%', minHeight: 56, padding: '8px 20px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', fontFamily: 'var(--font-dm-sans)',
                    }}
                  >
                    <span style={{
                      width: 40, height: 40, borderRadius: 'var(--r-sm)',
                      background: 'var(--gold-dim, rgba(196,164,74,0.15))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Car size={16} color="var(--gold-text, #6E5A1C)" />
                    </span>
                    <span>
                      <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--text-tertiary)', marginTop: 1 }}>{t('Airport transfer from MBJ')} · {d.parish}</span>
                    </span>
                  </button>
                ))}
            </>
          )}
          <p style={{
            fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-dm-sans)', padding: '10px 20px 6px',
          }}>
            {where ? t('Results') : t('Popular destinations')}
          </p>
          {destinations
            .filter((d) => !where || d.name.toLowerCase().includes(where.toLowerCase()) || d.parish.toLowerCase().includes(where.toLowerCase()))
            .map((d) => (
              <button
                key={d.name}
                onClick={() => {
                  setShowSearch(false)
                  setWhere(d.name)
                  router.push(`/explore?q=${encodeURIComponent(d.name)}`)
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', minHeight: 56, padding: '8px 20px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'var(--font-dm-sans)',
                }}
              >
                <span style={{
                  width: 40, height: 40, borderRadius: 'var(--r-sm)',
                  background: 'var(--surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <MapPin size={16} color="var(--text-tertiary)" />
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</span>
                  <span style={{ display: 'block', fontSize: 13, color: 'var(--text-tertiary)', marginTop: 1 }}>{d.parish}, Jamaica</span>
                </span>
              </button>
            ))}
          {where && destinations.filter((d) => d.name.toLowerCase().includes(where.toLowerCase()) || d.parish.toLowerCase().includes(where.toLowerCase())).length === 0 && !TRANSFER_DESTINATIONS.some((d) => d.name.toLowerCase().includes(where.toLowerCase())) && (
            <p style={{ padding: '14px 20px', fontSize: 14, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
              {t('No destinations found')}
            </p>
          )}
        </div>

        <div style={{ padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => {
              setShowSearch(false)
              router.push(`/explore?q=${encodeURIComponent(where)}`)
            }}
            style={{
              width: '100%', height: 48, borderRadius: 9999,
              background: 'var(--gold)', color: '#1A1508',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontFamily: 'var(--font-dm-sans)', fontSize: 15, fontWeight: 700,
            }}
          >
            <Search size={16} strokeWidth={2.5} />
            {t('Search')}
          </button>
        </div>
      </div>
    )}

    {/* ── Mobile menu sheet ──
        A sibling of the header, not a child: the header carries a transform
        (hide-on-scroll), which would turn it into the containing block for
        position: fixed and collapse the sheet to the header's 56px box. */}
    {showMenu && (
        <nav
          className="hide-desktop nav-sheet"
          aria-label="Menu"
          style={{
            position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
            background: '#fff', borderTop: '1px solid var(--border)',
            padding: '12px 0 24px', overflowY: 'auto', zIndex: 99,
          }}
        >
          {(items.length > 0 || stops.length > 0) && (
            <Link
              href="/checkout"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                minHeight: 48, padding: '0 20px', fontSize: 16, fontWeight: 700,
                color: 'var(--accent)', fontFamily: 'var(--font-dm-sans)',
              }}
            >
              {t('Your itinerary')}
              <span style={{
                minWidth: 22, height: 22, padding: '0 7px', borderRadius: 9999,
                background: 'var(--accent)', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
              }}>{items.length + stops.length}</span>
            </Link>
          )}
          {[
            { label: t('Explore'), href: '/explore', current: isExplore },
            { label: t('Transfers'), href: '/transfers', current: isTransfers },
            { label: t('Help Center'), href: '/help', current: false },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.current ? 'page' : undefined}
              style={{
                display: 'flex', alignItems: 'center', minHeight: 48,
                padding: '0 20px', fontSize: 16,
                fontWeight: item.current ? 700 : 500,
                color: item.current ? 'var(--accent)' : 'var(--text-primary)',
                fontFamily: 'var(--font-dm-sans)',
              }}
            >
              {item.label}
            </Link>
          ))}

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            minHeight: 48, padding: '0 20px',
            borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8,
          }}>
            <span style={{
              fontSize: 16, fontWeight: 500, color: 'var(--text-primary)',
              fontFamily: 'var(--font-dm-sans)',
            }}>
              {t('Currency')}
            </span>
            <LanguageSwitcher dark={false} />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
            {user ? (
              <>
                <Link href="/profile" style={{
                  display: 'flex', alignItems: 'center', minHeight: 48, padding: '0 20px',
                  fontSize: 16, fontWeight: 500, color: 'var(--text-primary)',
                  fontFamily: 'var(--font-dm-sans)',
                }}>
                  {t('Profile')}
                </Link>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut()
                    setShowMenu(false)
                    router.push('/')
                    router.refresh()
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', minHeight: 48, padding: '0 20px',
                    width: '100%', textAlign: 'left', fontSize: 16, fontWeight: 500,
                    color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)',
                    background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link href="/login" style={{
                display: 'flex', alignItems: 'center', minHeight: 48, padding: '0 20px',
                fontSize: 16, fontWeight: 600, color: 'var(--accent)',
                fontFamily: 'var(--font-dm-sans)',
              }}>
                {t('Sign in')}
              </Link>
            )}
          </div>
        </nav>
      )}
    </>
  )
}
