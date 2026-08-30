import type { Metadata } from 'next'
import Link from 'next/link'
import EditorialPage, { Section } from '@/components/EditorialPage'

export const metadata: Metadata = {
  title: 'Careers',
  description: 'Working with MAPL Tours Jamaica: a small company with no open roles today, always glad to hear from drivers, operators and hosts on the north coast.',
  alternates: {
    canonical: 'https://mapltours.com/careers',
  },
}

export default function CareersPage() {
  return (
    <EditorialPage slug="careers" label="Join Us" title="Careers at MAPL Tours">
      <Section title="A small company, on purpose">
        <p>MAPL Tours Jamaica is a small company: a founder building the product, and the Jamaican drivers and hosts who run every transfer and tour we sell. There are no open positions right now. When that changes, this page will say so, and the roles on it will be real.</p>
      </Section>

      <Section title="Drive or host with us">
        <p>If you run airport transfers or tours on the north coast and want bookings from the site, that is the partnership we are actually growing. The <Link href="/partner" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>Partner page</Link> explains how we work together and what we need from you.</p>
      </Section>

      <Section title="Say hello anyway">
        <p>If you would like to work with us in some other way, write to <span style={{ color: 'var(--accent)', fontWeight: 600 }}>contact@mapltours.com</span> with a few lines about what you do. We read everything and reply when there is something real to talk about.</p>
      </Section>
    </EditorialPage>
  )
}
