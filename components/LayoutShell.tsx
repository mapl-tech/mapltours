'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import TopNav from './TopNav'
import ItineraryPanel from './ItineraryPanel'
import PageTransition from './PageTransition'
// The WebMCP tool registrations pull the whole rate card and catalogue into
// the layout chunk (about 105 KB before gzip) for a feature only browsers
// with document.modelContext can use. Split off, and mounted after load
// and only in those browsers.
const WebMcpTools = dynamic(() => import('./WebMcpTools'), { ssr: false })
import ScrollReveal from './ScrollReveal'
// The 5% code popup only opens on / and /explore (lib/coupon-popup) and only
// on the client, ten seconds in; loading it lazily keeps it out of the
// first paint's JavaScript on every page.
const CouponPopup = dynamic(() => import('./CouponPopup'), { ssr: false })
import { AuthProvider } from '@/lib/supabase/auth-context'
import { SavedProvider } from '@/lib/supabase/saved'
import { useCartStore } from '@/lib/cart'
import { useI18nStore } from '@/lib/i18n'
import { usePlacesCart } from '@/lib/places-cart'
import { captureAttribution } from '@/lib/attribution'

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [agentBrowser, setAgentBrowser] = useState(false)
  useEffect(() => {
    if (!('modelContext' in document)) return
    let t: ReturnType<typeof setTimeout> | undefined
    const arm = () => { t = setTimeout(() => setAgentBrowser(true), 1000) }
    if (document.readyState === 'complete') arm()
    else window.addEventListener('load', arm, { once: true })
    return () => { window.removeEventListener('load', arm); if (t) clearTimeout(t) }
  }, [])
  const pathname = usePathname()
  // Hide the consumer nav + cart on the login screen, the whole admin area,
  // and the driver portal. These are internal tools, not shopping surfaces.
  // /experience is the fullscreen reel: with TopNav mounted above its
  // 100dvh feed the DOCUMENT gained 72px of scroll range, and mobile
  // Safari would sometimes settle mid-scroll: chrome pushed off the top,
  // a black void under the reel. The route closes back to /explore, so
  // the nav was never reachable there anyway.
  const hideNav = pathname === '/login' || pathname.startsWith('/admin') || pathname.startsWith('/driver') || pathname.startsWith('/experience')
  // WebMCP tools exist only where a traveller can shop: not on the login
  // screen, the admin area or the driver portal. The /experience reel is a shop.
  const hideTools = pathname === '/login' || pathname.startsWith('/admin') || pathname.startsWith('/driver')

  // Both stores use skipHydration so SSR and the first client paint render
  // identical (empty cart / USD) HTML. Load the persisted state once, after
  // mount.
  //
  // Safe to rehydrate inline: useI18n() gates translation per component
  // until that component mounts, so a lazily-hydrating Suspense boundary
  // still renders the server's English on its first pass.
  useEffect(() => {
    useCartStore.persist.rehydrate()
    useI18nStore.persist.rehydrate()
    usePlacesCart.persist.rehydrate()
    // Record where this visit came from (referrer/UTM); never throws.
    captureAttribution()
  }, [])

  return (
    <AuthProvider>
      <SavedProvider>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <ScrollReveal />
        {!hideTools && agentBrowser && <WebMcpTools />}
        {!hideTools && <CouponPopup />}
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
      </SavedProvider>
    </AuthProvider>
  )
}
