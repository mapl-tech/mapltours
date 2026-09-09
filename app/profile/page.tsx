import type { Metadata } from 'next'
import ProfileView from '@/components/ProfileView'

export const metadata: Metadata = {
  title: 'Your trips',
  description: 'Your MAPL Tours Jamaica trips, bookings and account details.',
  // Signed-in only: the middleware bounces anyone else to /login, so there is
  // nothing here for a crawler but a redirect. Same stance as /saved.
  robots: { index: false, follow: false },
}

export default function ProfilePage() {
  return <ProfileView />
}
