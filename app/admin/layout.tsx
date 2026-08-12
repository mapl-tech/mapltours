import type { Metadata } from 'next'

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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
