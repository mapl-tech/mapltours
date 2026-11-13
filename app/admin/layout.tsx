import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import AdminNav from '@/components/admin/AdminNav'
import Arrow from '@/components/ui/Arrow'

// Admin section, make sure search engines never index it. RLS on the
// underlying Supabase tables already prevents non-admins from reading
// any data even if they discover the URL, but we don't want this surface
// showing up in Google.

export const metadata: Metadata = {
  title: 'Admin',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
}

/**
 * Whether the visitor is a signed-in admin, the same check every admin page
 * makes (session user, then the admins allowlist through the service client).
 * Only an admin sees the section navigation; anyone else gets the brand and
 * the page's own sign-in or not-authorised message. Any doubt is "no".
 */
async function viewerIsAdmin(): Promise<boolean> {
  try {
    const { data: { user } } = await createClient().auth.getUser()
    if (!user) return false
    const { data } = await createServiceClient().from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
    return !!data
  } catch {
    return false
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await viewerIsAdmin()
  return (
    <>
      {/* The bar every admin screen shares: the brand, the sections (admins
          only) and the way back to the website. The screens keep their own
          h1s. Styles: the .adm-bar block in app/globals.css. */}
      <header className="adm-bar">
        <div className="adm-bar-in">
          <Link href={isAdmin ? '/admin/bookings' : '/'} className="adm-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mapl-logo.svg" alt="MAPL Tours Jamaica" width={134} height={32} className="adm-brand-logo" />
            <span className="adm-brand-tag">Admin</span>
          </Link>
          <Link href="/" className="adm-bar-out">
            <Arrow dir="left" place="before" />Back to website
          </Link>
          {isAdmin && <AdminNav />}
        </div>
      </header>
      {children}
    </>
  )
}
