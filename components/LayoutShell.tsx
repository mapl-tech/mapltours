'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import TopNav from './TopNav'
import ItineraryPanel from './ItineraryPanel'
import PageTransition from './PageTransition'
import { AuthProvider } from '@/lib/supabase/auth-context'

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()
  const hideNav = pathname === '/login'

  return (
    <AuthProvider>
      {!hideNav && <TopNav onCartClick={() => setDrawerOpen(true)} />}
      <PageTransition>{children}</PageTransition>
      {!hideNav && <ItineraryPanel open={drawerOpen} onClose={() => setDrawerOpen(false)} />}
    </AuthProvider>
  )
}
