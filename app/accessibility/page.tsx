import type { Metadata } from 'next'
import EditorialPage, { Section, ValueCard } from '@/components/EditorialPage'

export const metadata: Metadata = {
  title: 'Accessibility',
  description: 'MAPL Tours Jamaica is committed to making travel accessible to everyone. Learn about our accessibility features and accommodations.',
  alternates: {
    canonical: 'https://mapltours.com/accessibility',
  },
}

export default function AccessibilityPage() {
  return (
    <EditorialPage slug="accessibility" label="For Everyone" title="Accessibility">
      <Section title="Travel for Everyone">
        <p>We believe that the beauty of Jamaican culture should be accessible to every traveler, regardless of ability. We are continuously working to improve the accessibility of our platform and experiences.</p>
      </Section>

      <Section title="Platform Accessibility">
        <ValueCard title="Website Standards" desc="We build to WCAG 2.2 AA: semantic HTML, measured colour contrast, keyboard navigation and screen reader support, and we audit the booking pages against it. If something on the site does not work for you, tell us and we will fix it." />
        <ValueCard title="Language Support" desc="The interface is available in eight languages, chosen from the language switcher. Buttons, labels, prices and navigation are translated; some longer pages are English only." />
        <ValueCard title="Mobile Optimized" desc="Our platform is fully responsive and designed for touch-first interactions on mobile devices, with generous touch targets, clear typography, and high-contrast interfaces." />
      </Section>

      <Section title="Experience Accessibility">
        <ValueCard title="Adaptive Experiences" desc="Every tour is private, so the pace and the stops are yours. Contact us before booking and we will work with your driver and the venue to make sure you can fully take part; some activities, like the Dunn's River climb, have limits set by the venue." />
        <ValueCard title="Dietary Accommodations" desc="The food stops on the site are independent restaurants you pay directly. Most can handle vegetarian, vegan and allergy requests if asked; put your needs in the special requests box at checkout and your driver will raise them for you." />
      </Section>

      <Section title="Feedback">
        <p>We are always working to improve accessibility. If you encounter any barriers or have suggestions, please contact us at <span style={{ color: 'var(--accent)', fontWeight: 600 }}>contact@mapltours.com</span>.</p>
      </Section>
    </EditorialPage>
  )
}
