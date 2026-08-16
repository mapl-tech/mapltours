import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to build your Jamaica itinerary, save experiences, and manage your bookings.',
  // An auth screen has nothing to rank for and every redirect variant would
  // be a near-duplicate URL.
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
