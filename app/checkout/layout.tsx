import type { Metadata } from 'next'

// Checkout is transactional: it has no search value, its content is a mirror
// of the cart, and indexing it would compete with /explore for the same
// queries. Noindex also keeps abandoned-cart URLs out of the SERPs.
export const metadata: Metadata = {
  title: 'Secure checkout',
  description: 'Complete your MAPL TOURS JAMAICA booking.',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
}

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children
}
