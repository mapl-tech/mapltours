import type { Metadata } from 'next'
import EditorialPage, { Section, ValueCard } from '@/components/EditorialPage'

export const metadata: Metadata = {
  title: 'Press',
  description: 'MAPL TOURS JAMAICA press kit, media coverage, and brand assets.',
  alternates: {
    canonical: 'https://mapltours.com/press',
  },
}

export default function PressPage() {
  return (
    <EditorialPage slug="press" label="Media" title="Press & Media">
      <Section title="About MAPL TOURS JAMAICA">
        <p>MAPL TOURS JAMAICA is a cultural travel platform connecting travelers with authentic Jamaican experiences. We curate experiences created and led by local Jamaicans - from cliff diving in Negril to reggae studio sessions in Kingston - and get travelers to them by private transport.</p>
        <p style={{ marginTop: 16 }}>The platform covers 19 guided experiences and 44 restaurants and heritage sites across 10 parishes, alongside flat-rate airport transfers from Sangster International.</p>
      </Section>

      <Section title="In the News">
        <ValueCard title="Featured on TripAdvisor" desc="Rated 4.9 Excellent with consistent praise for authenticity and local connection. Recommended as a top cultural experience platform for Jamaica." />
        <ValueCard title="Travel Industry Recognition" desc="Recognized for our commitment to supporting local economies through tourism, with 100% of experience revenue going directly to Jamaican creators." />
      </Section>

      <Section title="Key Facts">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          {[
            { label: 'Founded', value: '2024' },
            { label: 'Guided experiences', value: '19' },
            { label: 'Restaurants & sites', value: '44' },
            { label: 'Parishes covered', value: '10' },
            { label: 'Average Rating', value: '4.9/5.0' },
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
