import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign in · MAPL Tours Jamaica',
  description: 'Sign in to build your Jamaica itinerary, save experiences, and manage your bookings.',
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
