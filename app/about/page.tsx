import type { Metadata } from 'next'
import EditorialPage, { Section, ValueCard } from '@/components/EditorialPage'

export const metadata: Metadata = {
  title: 'About Us',
  description: 'Learn about MAPL Tours Jamaica. We connect travelers with authentic Jamaican cultural experiences crafted by local creators.',
}

export default function AboutPage() {
  return (
    <EditorialPage slug="about" label="Our Story" title="About MAPL Tours Jamaica">
      <Section title="Who We Are">
        <p>MAPL Tours Jamaica is a cultural travel platform that connects travelers with authentic Jamaican experiences. We believe the best way to experience Jamaica is through the people who call it home.</p>
        <p style={{ marginTop: 16 }}>Founded as a product of MAPL Tech, we set out to change how the world experiences Jamaica. Not through resort packages or tour buses, but through real connections with local creators who share their culture, their food, their music, and their stories.</p>
      </Section>

      <Section title="Our Mission">
        <p>To make authentic Jamaican cultural experiences accessible to every traveler, while directly supporting the local communities and creators who make Jamaica extraordinary.</p>
      </Section>

      <Section title="Our Values">
        <ValueCard title="Authenticity First" desc="Every experience on our platform is created and led by locals. We reject 80% of submissions to ensure only the most genuine, meaningful experiences make it to our travelers." />
        <ValueCard title="Community Impact" desc="Every dollar spent on MAPL Tours goes directly to Jamaican creators and their communities. We believe tourism should uplift, not extract." />
        <ValueCard title="Cultural Respect" desc="We work closely with communities to ensure our experiences celebrate and preserve Jamaican culture, traditions, and natural environments." />
        <ValueCard title="Quality Without Compromise" desc="From jerk pits to mountain peaks, every experience is personally vetted by our team. We stand behind every booking with 24/7 support and free cancellation." />
      </Section>

      <Section title="By the Numbers">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 8 }}>
          {[
            { value: '19+', label: 'Curated experiences' },
            { value: '4.9', label: 'Average rating' },
            { value: '8', label: 'Parishes covered' },
          ].map((stat) => (
            <div key={stat.label} style={{
              textAlign: 'center', padding: '28px 16px',
              borderRadius: 'var(--r-xl)', border: '1px solid var(--border)',
            }}>
              <p style={{ fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>{stat.value}</p>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="A MAPL Tech Company">
        <p>MAPL Tours Jamaica is proudly built by <a href="https://www.mapltech.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>MAPL Tech</a>, a technology company dedicated to building products that connect people with authentic cultural experiences around the world.</p>
      </Section>
    </EditorialPage>
  )
}
