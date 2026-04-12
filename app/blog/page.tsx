import type { Metadata } from 'next'
import EditorialPage, { Section, ValueCard } from '@/components/EditorialPage'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Stories, guides, and insider tips from MAPL Tours Jamaica. Discover the real Jamaica.',
}

export default function BlogPage() {
  return (
    <EditorialPage slug="blog" label="Stories" title="The MAPL Journal">
      <Section title="Latest Stories">
        <ValueCard title="The Birthplace of Jerk: A Boston Bay Story" desc="Three generations of pit masters, one legendary recipe. We spent a day with Devon in Boston Bay to learn about the origins of Jamaica's most iconic dish and why the real thing tastes different from everything else." />
        <ValueCard title="Sunrise at 5,000 Feet: Hiking the Blue Mountains" desc="What it is really like to wake up at 3am and hike to the peak of Jamaica's highest mountain. The coffee, the mist, the view - and why every minute of exhaustion is worth it." />
        <ValueCard title="The Sound System Culture of Kingston" desc="Before streaming, before clubs, there were sound systems. We explore Kingston's vibrant music scene and the local DJs keeping the tradition alive in backyards and dancehalls across the city." />
        <ValueCard title="Swimming in Starlight: Jamaica's Luminous Lagoon" desc="One of only four bioluminescent bays in the world sits in Falmouth, Jamaica. We took the night tour and learned why this natural phenomenon attracts thousands of visitors each year." />
        <ValueCard title="Beyond the Resort: Why Travelers Are Choosing Local" desc="The trend toward authentic, locally-led travel experiences is growing. We look at why more travelers are skipping the resort excursion desk and booking directly with Jamaican creators instead." />
      </Section>

      <Section title="Travel Guides">
        <ValueCard title="First Time in Jamaica: What You Need to Know" desc="Currency, safety, weather, getting around, and cultural etiquette. Everything you need for your first trip to Jamaica, from a local perspective." />
        <ValueCard title="The Ultimate Negril Guide" desc="Seven Mile Beach, Rick's Cafe, hidden coves, and the best jerk on the west coast. A complete guide to Jamaica's most popular destination." />
        <ValueCard title="Kingston for Culture Lovers" desc="Museums, music, street food, and nightlife. Why Jamaica's capital is the most underrated destination on the island." />
      </Section>
    </EditorialPage>
  )
}
