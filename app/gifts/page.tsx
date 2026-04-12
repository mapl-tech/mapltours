import type { Metadata } from 'next'
import EditorialPage, { Section, ValueCard } from '@/components/EditorialPage'

export const metadata: Metadata = {
  title: 'Gift Cards',
  description: 'Give the gift of Jamaica. MAPL Tours gift cards for authentic Jamaican cultural experiences.',
}

export default function GiftsPage() {
  return (
    <EditorialPage slug="gifts" label="Give Jamaica" title="Gift Cards">
      <Section title="The Perfect Gift">
        <p>Give someone the experience of a lifetime. A MAPL Tours gift card lets the recipient choose from 19+ authentic Jamaican experiences - from cliff diving in Negril to cooking classes in Boston Bay.</p>
        <p style={{ marginTop: 16 }}>No expiration date. No restrictions. Just the freedom to discover Jamaica on their own terms.</p>
      </Section>

      <Section title="Gift Card Options">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 8 }}>
          {[
            { amount: '$50', desc: 'Perfect for a street food crawl or fishing trip' },
            { amount: '$100', desc: 'Great for most individual experiences' },
            { amount: '$150', desc: 'Ideal for a full-day cultural immersion' },
            { amount: '$250', desc: 'A multi-experience package for couples' },
            { amount: '$500', desc: 'The ultimate Jamaica experience collection' },
            { amount: 'Custom', desc: 'Choose any amount that works for you' },
          ].map((card) => (
            <div key={card.amount} style={{
              padding: '28px 20px', borderRadius: 'var(--r-xl)',
              border: '1px solid var(--border)', textAlign: 'center',
              background: card.amount === 'Custom' ? 'var(--accent)' : 'white',
              color: card.amount === 'Custom' ? 'white' : 'var(--text-primary)',
            }}>
              <p style={{ fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 28, marginBottom: 8 }}>{card.amount}</p>
              <p style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.4 }}>{card.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="How It Works">
        <ValueCard title="1. Choose an Amount" desc="Select a preset amount or enter a custom value. Every gift card covers the full cost of experiences including the 5% booking fee." />
        <ValueCard title="2. Personalize Your Gift" desc="Add a personal message and choose delivery by email. The recipient gets a beautifully designed digital gift card with a unique redemption code." />
        <ValueCard title="3. They Choose Their Adventure" desc="The recipient browses our full catalog of experiences, picks their favorites, and books using the gift card at checkout. No pressure, no expiration." />
      </Section>

      <Section title="Coming Soon">
        <p>Gift cards are launching soon. To be notified when they are available, email <span style={{ color: 'var(--accent)', fontWeight: 600 }}>gifts@mapltours.com</span> and we will let you know as soon as they go live.</p>
      </Section>
    </EditorialPage>
  )
}
