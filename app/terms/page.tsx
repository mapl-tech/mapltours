import type { Metadata } from 'next'
import EditorialPage, { Section } from '@/components/EditorialPage'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms that govern your use of MAPL Tours Jamaica — bookings, cancellations, liability, and your responsibilities as a traveler.',
}

export default function TermsPage() {
  return (
    <EditorialPage slug="terms" label="Legal" title="Terms of Service">
      <Section title="Last updated">
        <p>These Terms were last updated on May 5, 2026.</p>
      </Section>

      <Section title="Agreement to terms">
        <p>
          By accessing or using MAPL Tours Jamaica (mapltours.com), you agree to be bound by these Terms of Service.
          If you do not agree to these Terms, please do not use the service. We may update these Terms from time to
          time and your continued use of the platform after changes are posted constitutes acceptance of the revised Terms.
        </p>
      </Section>

      <Section title="Who we are">
        <p>
          MAPL Tours is a marketplace that connects travelers with Jamaican experience creators — local hosts, guides,
          and operators. We facilitate bookings and payments; the experiences themselves are delivered by the
          independent creator listed on each experience page.
        </p>
      </Section>

      <Section title="Booking and payment">
        <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>All prices are shown in USD unless otherwise noted, and include a 5% booking fee that supports the platform.</li>
          <li>Payment is captured at checkout via Stripe. Your card information is processed by Stripe and never stored on our servers.</li>
          <li>Your booking confirmation email serves as your receipt and contains your booking reference and all trip details.</li>
          <li>By completing checkout you confirm that the traveler details and dates you have provided are accurate.</li>
        </ul>
      </Section>

      <Section title="Cancellations and changes">
        <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>You may cancel free of charge up to 48 hours before the experience start time for a full refund.</li>
          <li>Cancellations made within 48 hours of the start time are non-refundable, except where the creator agrees otherwise.</li>
          <li>If a creator cancels your experience, you will receive a full refund and we will help you find an alternative.</li>
          <li>If weather or other safety conditions force a cancellation, you will receive a full refund or a free reschedule.</li>
        </ul>
      </Section>

      <Section title="Your responsibilities">
        <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>Provide accurate information at booking, including any medical conditions, allergies, or physical limitations relevant to the activity.</li>
          <li>Arrive on time and follow all reasonable safety instructions from your creator or guide.</li>
          <li>Carry valid travel documents and any insurance required for your activity. We strongly recommend personal travel insurance.</li>
          <li>Treat creators, fellow travelers, and the Jamaican communities you visit with respect.</li>
        </ul>
      </Section>

      <Section title="Creator responsibilities">
        <p>
          Creators on the platform are independent operators who have agreed to MAPL Tours&rsquo; quality and safety
          standards. Creators are responsible for delivering the experience as listed, maintaining required insurance
          and certifications, and providing appropriate equipment and safety briefings.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          MAPL Tours acts as a marketplace facilitator. We are not the operator of the experiences listed on the
          platform. Your participation in any experience is at your own risk. To the maximum extent permitted by law,
          MAPL Tours&rsquo; liability for any claim arising from your use of the service is limited to the amount you paid
          for the specific booking giving rise to the claim. Nothing in these Terms excludes liability that cannot be
          excluded under applicable law.
        </p>
      </Section>

      <Section title="Intellectual property">
        <p>
          All content on mapltours.com — including text, imagery, video, the MAPL Tours name and logo, and the
          underlying software — is owned by MAPL Tours or licensed to us. You may not copy, reproduce, or commercially
          exploit any part of the platform without our written permission.
        </p>
      </Section>

      <Section title="Governing law">
        <p>
          These Terms are governed by the laws of Jamaica. Any dispute will be resolved in the courts of Jamaica,
          except where applicable consumer protection law gives you the right to bring a claim in your home jurisdiction.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these Terms? Email{' '}
          <a href="mailto:contact@mapltours.com" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>
            contact@mapltours.com
          </a>
          .
        </p>
      </Section>
    </EditorialPage>
  )
}
