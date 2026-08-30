import type { Metadata } from 'next'
import EditorialPage, { Section, ValueCard } from '@/components/EditorialPage'

export const metadata: Metadata = {
  title: 'Safety',
  description: 'How MAPL Tours Jamaica keeps you safe: private vehicles, drivers who know the road, venue rules on every activity, and a person on email within 24 hours.',
  alternates: {
    canonical: 'https://mapltours.com/safety',
  },
}

export default function SafetyPage() {
  return (
    <EditorialPage slug="safety" label="Your Safety" title="Safety at MAPL Tours">
      <Section title="Private, by design">
        <p>Every tour and transfer we sell is private: your party, your driver, your vehicle. Nobody is pooled, nobody waits at a meeting point, and the person driving you is the person named in your email. Here is what that means in practice, and what we ask of you.</p>
      </Section>

      <Section title="How We Keep You Safe">
        <ValueCard title="Your driver, by name" desc="Before your pickup you receive your driver's name, vehicle, plate number and WhatsApp, so you know who is meeting you before you see them. Our drivers are Jamaican and drive these routes every week." />
        <ValueCard title="Met at arrivals" desc="For airport transfers we track your flight and your driver waits just outside arrivals with a MAPL Tours sign showing your name. If you land late, your driver adjusts; there is no delay surcharge." />
        <ValueCard title="Venue rules, always" desc="Cliff jumping at Rick's Cafe, the climb at Dunn's River and the rafts on the Martha Brae and White River run under each venue's own rules and staff. Age limits and fitness notes are printed on every tour page, and nobody is pushed to do anything." />
        <ValueCard title="Tell us before you go" desc="There is a special requests box at checkout. Use it for medical conditions, mobility limits, allergies or a child seat, and we plan the day around them rather than finding out on the road." />
        <ValueCard title="A person on email" desc="Write to contact@mapltours.com and a person replies within 24 hours. On the day itself, your driver's WhatsApp is the fastest line, and your confirmation email has everything you need in one place." />
        <ValueCard title="Travel insurance" desc="We recommend every guest carries travel insurance for the trip. Cancellation on every booking is flexible within 48 hours of booking, less a 20% administration charge; after that the fare is committed to your driver." />
      </Section>

      <Section title="Traveler Tips">
        <p>Jamaica is a welcoming place, and a few habits make any day out here easier:</p>
        <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>Follow the venue staff and your driver on the water and on the rocks; they do this every day</li>
          <li>Stay hydrated and wear sunscreen, the tropical sun is strong</li>
          <li>Tell us about medical conditions or physical limits at booking, not at the trailhead</li>
          <li>Keep valuables secure and use the hotel safe for passports</li>
          <li>Keep your booking confirmation on your phone; it carries your driver&rsquo;s contact and your reference</li>
        </ul>
      </Section>
    </EditorialPage>
  )
}
