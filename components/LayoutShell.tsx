'use client'

import { useState } from 'react'
import TopNav from './TopNav'
import ItineraryPanel from './ItineraryPanel'
import PageTransition from './PageTransition'
import { AuthProvider } from '@/lib/supabase/auth-context'

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <AuthProvider>
      <TopNav onCartClick={() => setDrawerOpen(true)} />
      <PageTransition>{children}</PageTransition>
      <ItineraryPanel open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </AuthProvider>
  )
}
