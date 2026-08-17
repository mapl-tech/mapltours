/**
 * Help Center FAQ content. Lives in a plain module (no 'use client') so both
 * the client accordion and the server-rendered FAQPage structured data read
 * the same source and can never drift apart.
 */

export interface HelpFaq {
  q: string
  a: string
}

export interface HelpCategory {
  id: string
  label: string
  faqs: HelpFaq[]
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'booking',
    label: 'Booking',
    faqs: [
      {
        q: 'How do I book an experience?',
        a: 'Browse experiences on the homepage or Explore page. Tap "Add to Trip" on any experience, then head to checkout. You\'ll select your preferred date, number of guests, and complete payment securely through Stripe.',
      },
      {
        q: 'Can I book for a group?',
        a: 'Absolutely. Most experiences accommodate 1-12 guests, just select your group size at checkout. For groups larger than 12, reach out to us directly and we\'ll arrange a bespoke private experience.',
      },
      {
        q: 'How far in advance should I book?',
        a: 'Bookings close 24 hours before an experience or pickup begins, and experience days are counted from midnight in Jamaica, so in practice you need one to two days\' notice. Book earlier where you can: popular experiences like the Bob Marley Heritage Pilgrimage and Rick\'s Cafe Cliff Diving can sell out a week ahead during peak season (December-March).',
      },
      {
        q: 'Can I modify my booking after checkout?',
        a: 'Changes run on the same window as cancellations: within 48 hours of booking, and before the experience has started. Contact our support team with the date or guest count you need and we\'ll sort it out with your creator. Once that 48-hour window closes the booking is locked in, the same point at which it stops being refundable.',
      },
    ],
  },
  {
    id: 'cancellations',
    label: 'Cancellations & Refunds',
    faqs: [
      {
        q: 'Can I cancel my booking?',
        a: 'Yes, within 48 hours of booking. Request the cancellation from your Profile page, where we quote you the exact refund before you confirm, and our team reviews it. Your booking stays confirmed until we approve the request. Refunds are the amount you paid less an administration charge equivalent to 20% of the total amount of fees paid plus taxes (if applicable). After the 48-hour window bookings are non-refundable, a booking whose experience has already started can no longer be refunded, and no-shows are charged in full.',
      },
      {
        q: 'What if the creator cancels my experience?',
        a: 'If a creator cancels, you receive a full refund with no administration charge, or you can choose to rebook at no additional cost. We\'ll notify you as soon as we know and help arrange an alternative experience if you prefer.',
      },
      {
        q: 'How long do refunds take to process?',
        a: 'Once your request is approved we send the refund to Stripe straight away, usually within 24 hours of the request. It then typically appears in your account within 5-10 business days, depending on your bank or card issuer.',
      },
    ],
  },
  {
    id: 'experience',
    label: 'Your Experience',
    faqs: [
      {
        q: 'What should I bring?',
        a: 'Each experience has specific recommendations in its description. Generally: comfortable shoes, sunscreen, a water bottle, and a sense of adventure. We\'ll send detailed prep instructions 24 hours before your experience, and anything you\'re unsure about goes to contact@mapltours.com.',
      },
      {
        q: 'Is transportation included?',
        a: 'Always. Every trip comes with private door-to-door transport: we collect you from your hotel, villa, or the airport, drive you between every stop on your itinerary, and bring you back. You give us the pickup and drop-off at checkout, and the transport is priced into your total and itemized there, so there is no rental car, no taxis between stops, and nothing to arrange on the day.',
      },
      {
        q: 'What happens if it rains?',
        a: 'Jamaica gets brief tropical showers, most experiences run rain or shine (it\'s part of the adventure). If severe weather forces a cancellation, we reschedule you at no cost, to another day or another experience of the same value. A full refund is issued only where no reschedule works, for example if you are leaving the island before the next available date.',
      },
      {
        q: 'Are experiences suitable for children?',
        a: 'Many are family-friendly, look for the age recommendations in each experience\'s details. Adventures like cliff diving have minimum age requirements. When in doubt, email contact@mapltours.com with your children\'s ages and we\'ll confirm with the creator for you.',
      },
    ],
  },
  {
    id: 'payments',
    label: 'Payments & Pricing',
    faqs: [
      {
        q: 'What currencies and payment methods do you accept?',
        a: 'We accept all major credit and debit cards, Apple Pay, and Google Pay. Prices are listed in USD, but you can view converted amounts in your local currency using the language switcher in the header.',
      },
      {
        q: 'Is my payment information secure?',
        a: 'Completely. All payments are processed through Stripe, a PCI Level 1 certified payment processor, the highest security standard in the industry. We never store your card details.',
      },
    ],
  },
  {
    id: 'account',
    label: 'Your Account',
    faqs: [
      {
        q: 'How do I create an account?',
        a: 'Sign up with Google, Apple, or your email address. It takes under 30 seconds. You\'ll need an account to complete bookings and access your trip history.',
      },
      {
        q: 'Can I update my personal information?',
        a: 'Yes. Head to your Profile page where you can edit your name, email, phone number, government ID, and location. Changes save instantly.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Contact contact@mapltours.com with your request. We\'ll process it within 48 hours and delete all your personal data in accordance with our privacy policy.',
      },
    ],
  },
]
