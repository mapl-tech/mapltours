import type { Metadata } from 'next'
import EditorialPage, { Section, ValueCard } from '@/components/EditorialPage'

export const metadata: Metadata = {
  title: 'Press',
  description: 'MAPL Tours Jamaica press kit, media coverage, and brand assets.',
}

export default function PressPage() {
  return (
    <EditorialPage slug="press" label="Media" title="Press & Media">
      <Section title="About MAPL Tours Jamaica">
        <p>MAPL Tours Jamaica is a cultural travel platform connecting travelers with authentic Jamaican experiences. Founded as a product of MAPL Tech, we curate experiences created and led by local Jamaicans - from cliff diving in Negril to reggae studio sessions in Kingston.</p>
        <p style={{ marginTop: 16 }}>Our platform features 19+ handpicked experiences across 8 parishes, with a 4.9-star average rating from thousands of travelers.</p>
      </Section>

      <Section title="In the News">
        <ValueCard title="Featured on TripAdvisor" desc="Rated 4.9 Excellent with consistent praise for authenticity and local connection. Recommended as a top cultural experience platform for Jamaica." />
        <ValueCard title="Travel Industry Recognition" desc="Recognized for our commitment to supporting local economies through tourism, with 100% of experience revenue going directly to Jamaican creators." />
      </Section>

      <Section title="Key Facts">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          {[
            { label: 'Founded', value: '2024' },
            { label: 'Headquarters', value: 'Kingston, Jamaica' },
            { label: 'Parent Company', value: 'MAPL Tech' },
            { label: 'Experiences', value: '19+' },
            { label: 'Parishes Covered', value: '8' },
            { label: 'Average Rating', value: '4.9/5.0' },
          ].map((item) => (
            <div key={item.label} style={{
              padding: '18px 20px', borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border)',
            }}>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{item.label}</p>
              <p style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-syne)', color: 'var(--text-primary)' }}>{item.value}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Media Inquiries">
        <p>For press inquiries, interviews, or brand assets, contact us at <span style={{ color: 'var(--accent)', fontWeight: 600 }}>press@mapltours.com</span>.</p>
      </Section>
    </EditorialPage>
  )
}
