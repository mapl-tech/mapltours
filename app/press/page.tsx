import type { Metadata } from 'next'
import EditorialPage, { Section } from '@/components/EditorialPage'
import { experiences, singleExperiences } from '@/lib/experiences'
import { PLACES } from '@/lib/places'
import { DESTINATIONS as TRANSFER_DESTINATIONS } from '@/lib/airport-transfers'

export const metadata: Metadata = {
  title: 'Press',
  description: 'Press kit for MAPL Tours Jamaica: company facts, founder background, brand assets, logo files, and media contact for journalists covering Caribbean travel.',
  alternates: {
    canonical: 'https://mapltours.com/press',
  },
}

export default function PressPage() {
  return (
    <EditorialPage slug="press" label="Media" title="Press & Media">
      <Section title="About MAPL Tours Jamaica">
        {/* "Reggae studio sessions in Kingston" described the old catalogue.
            Kingston, the Blue Mountains and Port Royal are no longer sold, so
            the examples now name tours that actually exist. */}
        <p>MAPL Tours Jamaica sells private airport transfers from Sangster International (MBJ) and private tours and day packages across Jamaica&rsquo;s north coast, run with Jamaican drivers and hosts, from climbing Dunn&rsquo;s River Falls in Ocho Rios to sunset at Rick&rsquo;s Cafe in Negril and the pilgrimage to Bob Marley&rsquo;s birthplace at Nine Mile, and get travelers to them by private transport.</p>
        <p style={{ marginTop: 16 }}>The platform covers {singleExperiences.length} guided experiences and {PLACES.length} restaurants and heritage sites across {new Set(experiences.map((e) => e.parish)).size} parishes, alongside flat-rate private airport transfers from Sangster International to {TRANSFER_DESTINATIONS.length} hotels and villas from Montego Bay to Negril and Ocho Rios.</p>
      </Section>

      {/* "In the News" is deliberately absent.
          It carried two claims that were not true: a 4.9 Excellent Tripadvisor
          rating with "consistent praise" (the listing has no reviews and no
          rating), and unattributed "Travel Industry Recognition" from nobody
          in particular. A press page inventing its own press is the single
          least defensible thing on a site, and journalists check. Restore this
          section when there is real coverage, and name the publication and the
          date so it can be verified. */}

      <Section title="Key Facts">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          {[
            // Counted from the live catalog, not typed in. Every hardcoded
            // figure here had drifted from reality: 19 guided experiences
            // against an actual 16, and 10 parishes covered against an actual
            // 4. A press page is the one page a journalist will check.
            { label: 'Founded', value: '2024' },
            { label: 'Guided experiences', value: String(singleExperiences.length) },
            { label: 'Multi-stop packages', value: String(experiences.length - singleExperiences.length) },
            { label: 'Restaurants & sites', value: String(PLACES.length) },
            { label: 'Parishes covered', value: String(new Set(experiences.map((e) => e.parish)).size) },
            // "Average Rating 4.9/5.0" removed. MAPL has no reviews yet, so
            // there is no average to quote. Add it back only from a real
            // aggregate, and say what it is an average of.
          ].map((item) => (
            <div key={item.label} style={{
              padding: '18px 20px', borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border)',
            }}>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{item.label}</p>
              <p style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-dm-sans)', color: 'var(--text-primary)' }}>{item.value}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Media Inquiries">
        <p>For press inquiries, interviews, or brand assets, contact us at <span style={{ color: 'var(--accent)', fontWeight: 600 }}>contact@mapltours.com</span>.</p>
      </Section>
    </EditorialPage>
  )
}
