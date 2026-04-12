import type { Metadata } from 'next'
import EditorialPage, { Section, ValueCard } from '@/components/EditorialPage'

export const metadata: Metadata = {
  title: 'Help Center',
  description: 'Get help with your MAPL Tours Jamaica booking. FAQs, cancellations, refunds, and 24/7 support.',
}

export default function HelpPage() {
  return (
    <EditorialPage slug="help" label="Support" title="Help Center">
      <Section title="Frequently Asked Questions">
        <ValueCard title="How do I book an experience?" desc="Browse our experiences on the homepage or Explore page. Tap 'Add to Trip' on any experience you like, then proceed to checkout. You will select your date, number of guests, and complete payment through our secure Stripe checkout." />
        <ValueCard title="Can I cancel my booking?" desc="Yes. You can cancel for free within 48 hours of booking for a full refund. Cancellations made more than 48 hours after booking but at least 7 days before the experience date receive a 50% refund. Cancellations less than 7 days before are non-refundable." />
        <ValueCard title="What if my experience is cancelled by the creator?" desc="If a creator cancels, you will receive a full refund or the option to rebook at no additional cost. We will notify you immediately and help arrange an alternative." />
        <ValueCard title="What should I bring to my experience?" desc="Each experience has specific recommendations, but in general: comfortable shoes, sunscreen, a water bottle, and a sense of adventure. Your creator will send detailed instructions 24 hours before your experience." />
        <ValueCard title="Is transportation included?" desc="Some experiences include hotel pickup. Check the experience details and highlights section for specifics. If transportation is not included, your creator will provide meeting point instructions with directions." />
        <ValueCard title="Can I book for a group?" desc="Yes. Most experiences accommodate groups of 1-12 travelers. Select your number of guests during checkout. For larger groups (12+), contact us directly and we will arrange a custom experience." />
        <ValueCard title="What currencies do you accept?" desc="We accept all major credit cards, Apple Pay, and Google Pay. Prices are listed in USD but you can view converted prices in your local currency using the language switcher in the header." />
        <ValueCard title="What happens if it rains?" desc="Jamaica experiences tropical rain showers. Most of our experiences run rain or shine. If severe weather forces a cancellation, we will reschedule at no additional cost or provide a full refund." />
      </Section>

      <Section title="Contact Support">
        <p>Our support team is available 24/7 to help with any questions or issues.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
          <div style={{ padding: '20px', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Email</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>support@mapltours.com</p>
          </div>
          <div style={{ padding: '20px', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Phone</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>+1 (876) 555-0123</p>
          </div>
        </div>
      </Section>
    </EditorialPage>
  )
}
