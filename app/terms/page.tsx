import type { Metadata } from 'next'
import EditorialPage, { Section } from '@/components/EditorialPage'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms that govern your use of MAPL Tours Jamaica, bookings, cancellations, liability, and your responsibilities as a traveler.',
  alternates: {
    canonical: 'https://mapltours.com/terms',
  },
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
          MAPL Tours Jamaica sells and operates travel services in Jamaica: private airport transfers, private tours
          and day packages, delivered through the Jamaican drivers, operators and hosts we work with (our partners).
          Each tour page describes what is included and who meets you.
        </p>
        <p style={{ marginTop: 12 }}>
          We are the operator of every transfer and tour sold on the site, and these Terms apply to us directly.
          Restaurants, attractions and other third-party venues suggested on the site are not operated by us and are
          paid for directly by you.
        </p>
      </Section>

      <Section title="Booking and payment">
        <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>All prices are shown in USD unless otherwise noted.</li>
          <li>Payment is captured at checkout via Stripe. Your card information is processed by Stripe and never stored on our servers.</li>
          <li>Your booking confirmation email serves as your receipt and contains your booking reference and all trip details.</li>
          <li>By completing checkout you confirm that the traveler details and dates you have provided are accurate.</li>
          <li>Bookings close 24 hours before an experience or pickup begins. Anything inside that window must be arranged with us directly and is subject to availability.</li>
          <li>Private door-to-door transport is included in every experience booking and is priced per travel day and itemized in your total. You provide the pickup and drop-off locations at checkout, and it is your responsibility to be ready at the agreed place and time.</li>
        </ul>
      </Section>

      <Section title="Cancellations and changes">
        <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>You may cancel within 48 hours of booking for a refund of the amount you paid, less an administration charge equivalent to 20% of the total amount of fees paid plus taxes (if applicable).</li>
          <li>Cancellations are requested from your Profile page and are reviewed by us before any refund is made. Your booking remains confirmed until the request is approved.</li>
          <li>Changes to your date or number of guests may be requested within the same 48 hours of booking, by contacting us. Changes are subject to availability and to our partners being able to accommodate them.</li>
          <li>Cancellations and changes requested more than 48 hours after booking cannot be accepted, and the booking is non-refundable, except where we agree otherwise.</li>
          <li>Once an experience or pickup has begun, the booking has been delivered and is no longer refundable or changeable, even if the 48 hours have not elapsed.</li>
          <li>If you do not arrive for your experience, the booking is charged in full.</li>
          <li>If we have to cancel your booking, you will receive a full refund and we will help you find an alternative.</li>
          <li>If weather or other safety conditions force a cancellation, we will reschedule you at no additional cost, to another date or to an experience of equivalent value. A full refund is given only where no reschedule is possible within your time in Jamaica.</li>
        </ul>
      </Section>

      <Section title="Gift cards">
        <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>Gift cards are sold in USD, in amounts between $25 and $1,000, and are delivered by email to the recipient address given at purchase.</li>
          <li>A gift card is valid for 24 months from the date it is bought. The expiry date is stated in the delivery email sent to the recipient and on the buyer&rsquo;s receipt. Any balance left after that date is no longer spendable.</li>
          <li>A card may be spent across more than one booking until its balance runs out, and may be combined with a card payment where the balance does not cover the whole total.</li>
          <li>Gift card purchases are final and non-refundable. Once a card has been issued, the amount paid for it cannot be returned, whether or not the card has been used and whether or not it later expires. The 48-hour cancellation window does not apply to gift card purchases.</li>
          <li>Gift cards are not exchangeable for cash and are not reloadable. We do not sell them at a discount to their face value.</li>
          <li>Treat the code like cash. Anyone holding it can spend it, with no account and no second check. If a card is sent to the wrong address or the email goes astray, contact us and we will re-send the same code. We cannot, however, restore a balance that someone else has already spent, or reverse a booking made with the code.</li>
          <li>Where a booking paid for with a gift card is cancelled and approved for a refund, the refund is returned the way it was paid. Your card payment is refunded first, up to the value of the refund, and whatever is left of the refund is credited back to the gift card balance. In practice this means the administration charge is absorbed by the gift card credit before any of it falls on your card payment.</li>
        </ul>
      </Section>

      <Section title="Your responsibilities">
        <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>Provide accurate information at booking, including any medical conditions, allergies, or physical limitations relevant to the activity.</li>
          <li>Arrive on time and follow all reasonable safety instructions from your driver, host and venue staff.</li>
          <li>Carry valid travel documents and any insurance required for your activity. We strongly recommend personal travel insurance.</li>
          <li>Treat our partners, fellow travelers, and the Jamaican communities you visit with respect.</li>
          <li>Raise anything to do with your booking with us at contact@mapltours.com rather than with the driver or venue directly. We are your single point of contact before, during and after the trip, and we deal with our partners on your behalf.</li>
        </ul>
      </Section>

      <Section title="Our partners">
        <p>
          The drivers, operators and hosts who deliver your transfer or tour work with MAPL Tours Jamaica under our
          quality and safety expectations. Activities at third-party venues, such as cliff jumping, waterfall climbs
          and rafting, run under each venue&rsquo;s own rules, equipment and staff.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          MAPL Tours Jamaica is responsible for delivering every transfer and tour we sell with reasonable care and
          skill. Third-party venues are responsible for the activities they run on their own premises.
        </p>
        <p style={{ marginTop: 12 }}>
          Travel and outdoor activities carry inherent risk, and participation is at your own risk to the extent the
          law allows. To the maximum extent permitted by law, our liability for any claim arising from your use of
          the service is limited to the amount you paid for the specific booking giving rise to the claim. We are not
          liable for indirect or consequential loss, including missed flights or connections, lost enjoyment, or costs
          you incur elsewhere. Nothing here operates to exclude any liability that applicable law does not permit us
          to exclude.
        </p>
      </Section>

      <Section title="Photography, video and your likeness">
        <p>
          We photograph and film our experiences and transfers. By taking part, you agree that MAPL Tours Jamaica may
          record you and may use those photographs, video, audio and any comments or reviews you give us in our
          marketing. That includes our website, social media, advertising, printed material and press.
        </p>
        <p style={{ marginTop: 12 }}>
          This permission is worldwide, royalty-free and ongoing, and you are not entitled to payment for it. You
          keep ownership of anything you create yourself; you are granting us a licence to use it, not transferring
          it. We will not suggest you endorse anything you have not endorsed, and we will not use your full name or
          contact details in advertising without asking you first.
        </p>
      </Section>

      <Section title="Intellectual property">
        <p>
          All content on mapltours.com, including text, imagery, video, the MAPL Tours name and logo, and the
          underlying software, is owned by MAPL Tours or licensed to us. You may not copy, reproduce, or commercially
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
