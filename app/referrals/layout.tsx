import type { Metadata } from 'next'

// A referrer's own page, behind sign-in: never in a search engine, never cached.
export const metadata: Metadata = {
  title: 'Referrals',
  description: 'The MAPL Tours Jamaica referral page: your codes, the bookings made with them, and your payouts.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
}

export default function ReferralsLayout({ children }: { children: React.ReactNode }) {
  return children
}
