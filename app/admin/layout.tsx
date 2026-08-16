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
  return (
    <>
      {/* Brand bar shared by every admin surface (bookings, cash flow,
          dispatch, refunds, videos). The views keep their own h1s; this only
          anchors the console to the brand. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 20px',
          background: '#fff',
          borderBottom: '1px solid rgba(23,22,20,0.10)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mapl-logo.svg"
          alt="MAPL Tours Jamaica"
          width={134}
          height={32}
          style={{ height: 32, width: 'auto', display: 'block' }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'rgba(23,22,20,0.45)',
            paddingLeft: 10,
            borderLeft: '1px solid rgba(23,22,20,0.14)',
          }}
        >
          Admin
        </span>
      </div>
      {children}
    </>
  )
}
