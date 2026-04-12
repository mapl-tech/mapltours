import type { Metadata } from 'next'
import EditorialPage, { Section, ValueCard } from '@/components/EditorialPage'

export const metadata: Metadata = {
  title: 'Accessibility',
  description: 'MAPL Tours Jamaica is committed to making travel accessible to everyone. Learn about our accessibility features and accommodations.',
}

export default function AccessibilityPage() {
  return (
    <EditorialPage slug="accessibility" label="For Everyone" title="Accessibility">
      <Section title="Travel for Everyone">
        <p>We believe that the beauty of Jamaican culture should be accessible to every traveler, regardless of ability. We are continuously working to improve the accessibility of our platform and experiences.</p>
      </Section>

      <Section title="Platform Accessibility">
        <ValueCard title="Website Standards" desc="Our website follows WCAG 2.1 guidelines for web accessibility. We use semantic HTML, proper color contrast ratios, keyboard navigation support, and screen reader compatibility across all pages." />
        <ValueCard title="Language Support" desc="Our platform supports 10 languages with automatic detection based on your location. All key interface elements, pricing, and navigation translate to your preferred language." />
        <ValueCard title="Mobile Optimized" desc="Our platform is fully responsive and designed for touch-first interactions on mobile devices, with generous touch targets, clear typography, and high-contrast interfaces." />
      </Section>

      <Section title="Experience Accessibility">
        <ValueCard title="Adaptive Experiences" desc="Many of our experiences can be adapted for travelers with mobility challenges. Contact us before booking and we will work with our creators to ensure you can fully participate." />
        <ValueCard title="Dietary Accommodations" desc="All food experiences can accommodate dietary restrictions including vegetarian, vegan, halal, kosher, and allergy-specific requirements. Let us know during checkout using the Special Requests field." />
        <ValueCard title="Communication Support" desc="If you need communication support such as sign language interpretation, we can arrange this for select experiences with advance notice." />
      </Section>

      <Section title="Feedback">
        <p>We are always working to improve accessibility. If you encounter any barriers or have suggestions, please contact us at <span style={{ color: 'var(--accent)', fontWeight: 600 }}>accessibility@mapltours.com</span>.</p>
      </Section>
    </EditorialPage>
  )
}
