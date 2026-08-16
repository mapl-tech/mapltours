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
        a: 'We recommend booking at least 48 hours in advance to guarantee availability. Popular experiences like the Bob Marley Nine Mile Pilgrimage and Rick\'s Cafe Cliff Diving can sell out a week ahead during peak season (December-March).',
      },
      {
        q: 'Can I modify my booking after checkout?',
        a: 'Yes. Email contact@mapltours.com with your booking reference and what you need changed, the date, the number of guests, your hotel, and we will sort it out. Your upcoming bookings are listed on your Profile page.',
      },
    ],
  },
  {
    id: 'cancellations',
    label: 'Cancellations & Refunds',
    faqs: [
      {
        q: 'Can I cancel my booking?',
        a: 'Yes. Cancel within 48 hours of booking for a refund, no questions asked. One thing to note: refunds are subject to an administration charge equivalent to 20% of the total amount of your fees plus taxes (if applicable), which is deducted from every refund. After that 48-hour window, bookings are non-refundable, and no-shows are charged in full.',
      },
      {
        q: 'What if the creator cancels my experience?',
        a: 'If we cancel, you receive your money back in full, with no administration charge, or you can rebook at no additional cost. The 20% administration charge applies only when you cancel; it is never applied to a cancellation on our side. We\'ll notify you immediately and help arrange an alternative experience if you prefer.',
      },
      {
        q: 'How long do refunds take to process?',
        a: 'Refunds are initiated within 24 hours and typically appear in your account within 5-10 business days, depending on your bank or card issuer.',
      },
    ],
  },
  {
    id: 'experience',
    label: 'Your Experience',
    faqs: [
      {
        q: 'What should I bring?',
        a: 'Each experience has specific recommendations in its description. Generally: comfortable shoes, sunscreen, a water bottle, and a sense of adventure. Your creator will send detailed prep instructions 24 hours before your experience.',
      },
      {
        q: 'Is transportation included?',
        a: 'Some experiences include hotel pickup, check the experience details for specifics. When transportation isn\'t included, your creator will provide clear meeting point instructions with GPS coordinates and directions.',
      },
      {
        q: 'What happens if it rains?',
        a: 'Jamaica gets brief tropical showers, most experiences run rain or shine (it\'s part of the adventure). If severe weather forces a cancellation, we\'ll reschedule at no cost or return your money in full, with no administration charge, because the cancellation is on our side.',
      },
      {
        q: 'Are experiences suitable for children?',
        a: 'Many are family-friendly, look for the age recommendations in each experience\'s details. Adventures like cliff diving have minimum age requirements. When in doubt, message the creator through the experience page.',
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
        q: 'Are there any hidden fees?',
        a: 'No hidden fees. The price you see includes the experience cost and a transparent service fee that covers platform costs, creator support, and your booking guarantee. Everything is itemized at checkout.',
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
