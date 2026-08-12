'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import TopNav from './TopNav'
import ItineraryPanel from './ItineraryPanel'
import PageTransition from './PageTransition'
import ScrollReveal from './ScrollReveal'
import { AuthProvider } from '@/lib/supabase/auth-context'
import { useCartStore } from '@/lib/cart'
import { useI18n } from '@/lib/i18n'

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()
  // Hide the consumer nav + cart on the login screen and the whole admin
  // area. Admin pages are internal tools, not shopping surfaces.
  const hideNav = pathname === '/login' || pathname.startsWith('/admin')

  // Both stores use skipHydration so SSR and the first client paint render
  // identical (empty cart / USD) HTML, no React hydration mismatch. Load
  // the persisted state once, after mount.
  useEffect(() => {
    useCartStore.persist.rehydrate()
    useI18n.persist.rehydrate()
  }, [])

  return (
    <AuthProvider>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <ScrollReveal />
      {!hideNav && <TopNav onCartClick={() => setDrawerOpen(true)} />}
      <main id="main-content">
        <PageTransition>{children}</PageTransition>
      </main>
      {!hideNav && <ItineraryPanel open={drawerOpen} onClose={() => setDrawerOpen(false)} />}
      <style jsx>{`
        .skip-link {
          position: absolute;
          left: -9999px;
          top: 0;
          z-index: 1000;
          padding: 12px 20px;
          background: #fff;
          color: #000;
          font-family: var(--font-dm-sans);
          font-weight: 600;
          font-size: 14px;
          border-radius: 0 0 8px 0;
          text-decoration: none;
        }
        .skip-link:focus {
          left: 0;
          outline: 2px solid var(--accent, #FFB300);
          outline-offset: 2px;
        }
      `}</style>
    </AuthProvider>
  )
}
