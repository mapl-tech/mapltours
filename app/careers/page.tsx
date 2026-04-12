import type { Metadata } from 'next'
import EditorialPage, { Section, ValueCard } from '@/components/EditorialPage'

export const metadata: Metadata = {
  title: 'Careers',
  description: 'Join MAPL Tours Jamaica. We are building the future of cultural travel. See open positions.',
}

export default function CareersPage() {
  return (
    <EditorialPage slug="careers" label="Join Us" title="Careers at MAPL Tours">
      <Section title="Build the Future of Travel">
        <p>We are a small, passionate team on a mission to change how the world experiences Jamaica. We are looking for people who care deeply about culture, community, and creating exceptional products.</p>
        <p style={{ marginTop: 16 }}>At MAPL Tours, you will work at the intersection of technology and culture, helping local Jamaican creators share their stories with the world.</p>
      </Section>

      <Section title="Open Positions">
        <ValueCard title="Experience Curator - Kingston" desc="Work directly with local creators to vet, develop, and launch new experiences across Jamaica. You will travel the island, build relationships with communities, and ensure every experience meets our quality standards. Full-time, Kingston-based." />
        <ValueCard title="Full-Stack Developer - Remote" desc="Build and maintain our booking platform using Next.js, TypeScript, and Stripe. You will ship features that directly impact how travelers discover and book authentic Jamaican experiences. Remote, flexible hours." />
        <ValueCard title="Content Creator - Montego Bay" desc="Produce video content for our experience reels, social media, and marketing campaigns. You will capture the beauty of Jamaica and the stories of our creators. Part-time or full-time, Montego Bay area." />
        <ValueCard title="Community Manager - Remote" desc="Manage our social media presence, engage with our community of travelers and creators, and grow our brand across Instagram, TikTok, and YouTube. Remote, flexible schedule." />
      </Section>

      <Section title="Why Work With Us">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          {[
            'Work from anywhere in Jamaica or remotely',
            'Unlimited access to all MAPL Tours experiences',
            'Competitive salary with equity options',
            'Annual team retreat across Jamaica',
            'Health and wellness benefits',
            'Professional development budget',
          ].map((perk) => (
            <div key={perk} style={{
              padding: '16px 18px', borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border)', fontSize: 14, color: 'var(--text-primary)',
            }}>
              {perk}
            </div>
          ))}
        </div>
      </Section>

      <Section title="How to Apply">
        <p>Send your resume and a note about why you are excited about MAPL Tours to <span style={{ color: 'var(--accent)', fontWeight: 600 }}>careers@mapltours.com</span>. We read every application and respond within 5 business days.</p>
      </Section>
    </EditorialPage>
  )
}
