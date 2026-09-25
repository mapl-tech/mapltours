import type { Metadata } from 'next'
import EditorialPage, { Section } from '@/components/EditorialPage'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How MAPL Tours Jamaica collects, uses, stores, and protects your personal information when you book an experience or browse the site.',
  alternates: {
    canonical: 'https://mapltours.com/privacy',
  },
}

export default function PrivacyPage() {
  return (
    <EditorialPage slug="privacy" label="Legal" title="Privacy Policy">
      <Section title="Last updated">
        <p>This Privacy Policy was last updated on September 24, 2026.</p>
      </Section>

      <Section title="Our commitment">
        <p>
          MAPL Tours respects your privacy. This Policy explains what information we collect, why we collect it, who we
          share it with, and the choices you have. If you have any questions after reading it, email{' '}
          <a href="mailto:contact@mapltours.com" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>
            contact@mapltours.com
          </a>
          .
        </p>
      </Section>

      <Section title="Information we collect">
        <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li><strong>Account information</strong>, your name, email address, phone number, and country when you create an account or complete a booking.</li>
          <li><strong>Booking information</strong>, the experiences or transfers you purchase, travel dates, traveler counts, pickup and drop-off details, and any special requests you send us.</li>
          <li><strong>Payment information</strong>, handled directly by Stripe. We never see or store your full card number; we only receive a token plus the last four digits and card brand for receipt display.</li>
          <li><strong>Usage data</strong>, pages you view, experiences you save, and basic device information (browser, OS, screen size) collected through analytics cookies.</li>
          <li><strong>Communication</strong>, anything you send us through the contact form or email.</li>
          <li><strong>Photographs and video</strong>, images and recordings captured during experiences and transfers, which may include you. See the photography section of our <a href="/terms" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>Terms of Service</a> for how these are used.</li>
        </ul>
      </Section>

      <Section title="How we use your information">
        <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>Process and confirm your bookings, including sharing the relevant details with the driver or operator delivering your trip.</li>
          <li>Send transactional emails (booking confirmations, transfer details, contact form replies).</li>
          <li>Send trip tips by email, about twice a month, only if the trip tips box is ticked when you ask for your code (it starts ticked for visitors in the United States) or you tap the link asking for them. We record that choice in HubSpot, send the tips through Resend, and every tips email has a one-tap unsubscribe.</li>
          <li>Record in HubSpot that you are a customer when you book: the booking type (tour or transfer), when you booked and your total. If you get trip tips, we also let Resend know you booked, so the welcome tips stop.</li>
          <li>Provide customer support and respond to your questions.</li>
          <li>Improve the platform, understand which experiences travelers love, fix bugs, and tune the user experience.</li>
          <li>Detect, prevent, and address fraud or abuse on the platform.</li>
          <li>Promote MAPL Tours Jamaica, including using photographs, video and reviews from experiences in our marketing.</li>
          <li>Comply with applicable law, including tax and accounting obligations.</li>
        </ul>
      </Section>

      <Section title="Who we share data with">
        <p>
          We share the minimum information necessary with trusted third parties that help us operate:
        </p>
        <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li><strong>Our partner drivers and operators</strong>, receive your name, traveler count, date, contact phone, and any special requests so they can host you.</li>
          <li><strong>Stripe</strong>, payment processing.</li>
          <li><strong>Resend</strong>, transactional email delivery.</li>
          <li><strong>Supabase</strong>, secure database hosting (Frankfurt region).</li>
          <li><strong>Google</strong>, a private Google Calendar our operations team uses to schedule your trip. When a booking is paid, we add it there with your name, phone number, hotel or pickup place, party size, trip date and times, and, for airport transfers, your flight numbers.</li>
          <li><strong>Google Analytics &amp; Hotjar</strong>, anonymised usage analytics. We honour your browser&rsquo;s Do Not Track and Global Privacy Control signals: with either enabled, none of these analytics tools load at all.</li>
        </ul>
        <p style={{ marginTop: 12 }}>We do not sell your personal information to anyone.</p>
      </Section>

      <Section title="Advertising with Meta (Facebook and Instagram)">
        <p>
          We advertise on Facebook and Instagram, and we use Meta&rsquo;s tools to see which of those ads bring
          people to us:
        </p>
        <ul style={{ marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li><strong>The Meta pixel</strong> on our site records the pages and tours you view, what you add to your trip, and when you start a checkout or complete a booking.</li>
          <li><strong>Meta&rsquo;s Conversions API.</strong> When you book with us or ask for a discount code, our server tells Meta about it directly, with your email address in hashed form (scrambled so it cannot be read) and Meta&rsquo;s own cookies from your browser. For a booking we add the amount paid; for a discount code request, your browser details and IP address.</li>
          <li><strong>Customer lists.</strong> We may share the email address, phone number, name and country of people who have booked with us, in hashed form, so Meta can match them to accounts. We use these lists to offer our tours to past guests, to stop showing ads to people who have already booked, and to find new people with similar interests. Meta uses the hashed details only to match and discards what does not match.</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          If your browser sends Do Not Track or Global Privacy Control, the Meta pixel does not load and we do not
          send your details to Meta. To be left out of customer lists, email{' '}
          <a href="mailto:contact@mapltours.com" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>
            contact@mapltours.com
          </a>{' '}and
          we will remove you. You can also control the ads you see in your Facebook and Instagram ad preferences.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          We use cookies and similar technologies to keep you logged in, remember your itinerary cart, and measure how
          the site is performing. You can disable cookies in your browser settings, but some parts of the site
          (checkout, saved trips) may not work properly without them.
        </p>
      </Section>

      <Section title="Data retention">
        <p>
          We keep booking records for seven years to satisfy tax and accounting obligations. Account information is
          retained for as long as your account is active. You can request deletion of your account and personal data at
          any time by emailing contact@mapltours.com, we will process the request within 48 hours.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Depending on where you live, you may have the right to access, correct, export, or delete the personal
          information we hold about you, and to object to certain uses of it. To exercise any of these rights, email{' '}
          <a href="mailto:contact@mapltours.com" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>
            contact@mapltours.com
          </a>
          {' '}with the words &ldquo;Privacy request&rdquo; in the subject line.
        </p>
      </Section>

      <Section title="Security">
        <p>
          We use HTTPS site-wide, encrypt sensitive data at rest, and limit who on our team can access your
          information. No system is perfectly secure, if you believe your account has been compromised, contact us
          immediately and we will help you secure it.
        </p>
      </Section>

      <Section title="Children">
        <p>
          MAPL Tours is intended for adults. We do not knowingly collect personal information from anyone under 16. If
          you believe a child has provided us with their information, contact us and we will delete it.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          When we make material changes to this Policy, we will post the new version here with an updated &ldquo;Last
          updated&rdquo; date. For substantial changes, we may also notify you by email.
        </p>
      </Section>
    </EditorialPage>
  )
}
