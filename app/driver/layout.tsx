import type { Metadata } from 'next'

// Driver-facing surfaces are staff tools, not marketing pages. Without this
// they inherited the site-wide title and description verbatim and were
// indexable, competing with the homepage for its own brand terms.
export const metadata: Metadata = {
  title: 'Driver',
  description: 'MAPL Tours driver portal.',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
}

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return children
}
