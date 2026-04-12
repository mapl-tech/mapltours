import type { Metadata } from 'next'
import EditorialPage, { Section, ValueCard } from '@/components/EditorialPage'

export const metadata: Metadata = {
  title: 'Safety',
  description: 'Your safety is our priority. Learn about MAPL Tours Jamaica safety standards, creator vetting, and traveler protection.',
}

export default function SafetyPage() {
  return (
    <EditorialPage slug="safety" label="Your Safety" title="Safety at MAPL Tours">
      <Section title="Your Safety is Our Priority">
        <p>We take the safety of every traveler seriously. From creator vetting to activity standards, every part of the MAPL Tours experience is designed to keep you safe while you enjoy the best of Jamaica.</p>
      </Section>

      <Section title="How We Keep You Safe">
        <ValueCard title="Creator Vetting" desc="Every creator on our platform goes through a rigorous vetting process. We verify their identity, certifications, insurance, and track record. We personally visit and test every experience before it goes live." />
        <ValueCard title="Activity Safety Standards" desc="All experiences involving water sports, hiking, or physical activities follow established safety protocols. Creators are required to provide safety briefings, appropriate equipment, and maintain current first aid certifications." />
        <ValueCard title="Small Group Sizes" desc="We cap group sizes to ensure every traveler receives personal attention and safety oversight. Most experiences are limited to 12 guests to maintain an intimate, safe environment." />
        <ValueCard title="24/7 Emergency Support" desc="Our support team is available around the clock. In case of any emergency during your experience, our local team can be reached immediately by phone." />
        <ValueCard title="Insurance Coverage" desc="All creators on our platform are required to maintain comprehensive liability insurance. Additionally, we recommend all travelers carry personal travel insurance for their trip." />
        <ValueCard title="Community Feedback" desc="After every experience, travelers provide feedback and ratings. Creators who fall below our safety or quality standards are immediately reviewed and may be removed from the platform." />
      </Section>

      <Section title="Traveler Tips">
        <p>While Jamaica is generally safe for tourists, we recommend following these common-sense guidelines:</p>
        <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>Always follow your creator or guide instructions during activities</li>
          <li>Stay hydrated and wear sunscreen - the tropical sun is strong</li>
          <li>Inform your guide of any medical conditions or physical limitations</li>
          <li>Keep valuables secure and use the hotel safe for passports</li>
          <li>Carry a copy of your booking confirmation and emergency contacts</li>
        </ul>
      </Section>
    </EditorialPage>
  )
}
