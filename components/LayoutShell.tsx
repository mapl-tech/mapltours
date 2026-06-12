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
  const hideNav = pathname === '/login'

  // Both stores use skipHydration so SSR and the first client paint render
  // identical (empty cart / USD) HTML — no React hydration mismatch. Load
  // the persisted state once, after mount.
  useEffect(() => {
    useCartStore.persist.rehydrate()
    useI18n.persist.rehydrate()
  }, [])

  return (
    <AuthProvider>
      <ScrollReveal />
      {!hideNav && <TopNav onCartClick={() => setDrawerOpen(true)} />}
      <PageTransition>{children}</PageTransition>
      {!hideNav && <ItineraryPanel open={drawerOpen} onClose={() => setDrawerOpen(false)} />}
    </AuthProvider>
  )
}
