'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCartStore } from '@/lib/cart'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

// One module-level client, don't recreate on every render.
const supabase = createClient()

const navItems = [
  { icon: '▶', label: 'Feed', href: '/' },
  { icon: '◉', label: 'Explore', href: '/explore' },
  { icon: '◎', label: 'Profile', href: '/profile' },
]

export default function LeftNav() {
  const pathname = usePathname()
  const router = useRouter()
  const items = useCartStore((s) => s.items)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user))

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    )

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <nav
      style={{
        width: 66,
        height: '100dvh',
        background: 'var(--nav-bg)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 18,
        paddingBottom: 18,
        flexShrink: 0,
        position: 'relative',
        zIndex: 50,
      }}
    >
      {/* Logo */}
      <Link
        href="/"
        aria-label="MAPL TOURS, go to the feed"
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontWeight: 800,
          fontSize: 20,
          color: 'var(--gold)',
          textDecoration: 'none',
          marginBottom: 32,
        }}
      >
        <span aria-hidden="true">🍁</span>
      </Link>

      {/* Nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {navItems.map((item, i) => {
          const isActive = pathname === item.href
          return (
            <div
              key={item.href}
              style={{ position: 'relative' }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                  background: isActive ? 'rgba(255,179,0,0.15)' : 'transparent',
                  border: isActive
                    ? '1px solid rgba(255,179,0,0.3)'
                    : '1px solid transparent',
                  color: isActive ? 'var(--gold)' : 'rgba(255,255,255,0.4)',
                }}
              >
                <span aria-hidden="true">{item.icon}</span>
              </Link>
              {hoveredIndex === i && (
                <div
                  style={{
                    position: 'absolute',
                    left: 52,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontFamily: 'var(--font-dm-sans)',
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 100,
                  }}
                >
                  {item.label}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Auth button */}
      {user ? (
        <button
          onClick={handleSignOut}
          aria-label="Sign out"
          title="Sign out"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            background: 'transparent',
            border: '1px solid transparent',
            color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer',
            marginBottom: 8,
          }}
        >
          <span aria-hidden="true">↪</span>
        </button>
      ) : (
        <Link
          href="/login"
          aria-label="Sign in"
          title="Sign in"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            textDecoration: 'none',
            background: pathname === '/login' ? 'rgba(255,179,0,0.15)' : 'transparent',
            border: pathname === '/login' ? '1px solid rgba(255,179,0,0.3)' : '1px solid transparent',
            color: pathname === '/login' ? 'var(--gold)' : 'rgba(255,255,255,0.4)',
          }}
        >
          <span aria-hidden="true">⊕</span>
        </Link>
      )}

      {/* Cart icon */}
      {items.length > 0 && (
        <Link
          href="/checkout"
          aria-label={`Open itinerary, ${items.length} item${items.length === 1 ? '' : 's'}`}
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            textDecoration: 'none',
            position: 'relative',
            background:
              pathname === '/checkout' ? 'rgba(255,179,0,0.15)' : 'transparent',
            border:
              pathname === '/checkout'
                ? '1px solid rgba(255,179,0,0.3)'
                : '1px solid transparent',
          }}
        >
          <span aria-hidden="true">🛍</span>
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'var(--gold)',
              color: '#000',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'var(--font-dm-sans)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {items.length}
          </span>
        </Link>
      )}
    </nav>
  )
}
