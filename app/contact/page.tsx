import type { Metadata } from 'next'
import ContactView from '@/components/ContactView'

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch with MAPL Tours Jamaica. We are here to help you plan your perfect Jamaica experience.',
}

export default function ContactPage() {
  return <ContactView />
}
