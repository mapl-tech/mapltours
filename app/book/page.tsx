import type { Metadata } from 'next'
import BookHandoff from '@/components/agent/BookHandoff'

// Where AI assistants' booking links land (lib/agent/booking-link). A
// hand-off, not a page: it fills the cart and opens checkout.
export const metadata: Metadata = {
  title: 'Opening your checkout',
  robots: { index: false, follow: false },
}

export default function BookPage() {
  return <BookHandoff />
}
