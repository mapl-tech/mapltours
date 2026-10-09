/**
 * Shared FAQ + review copy for the transfers flow. Lives in its own file so
 * the server-side /transfers page can import the FAQ array for FAQPage
 * JSON-LD alongside the client-side TransfersView component that renders it.
 */

import { MIN_PICKUP_LEAD_MIN } from './booking-window'

/** The checkout's suggested hotel pickup before the flight home, in words: "3 hours 30 minutes". */
const PICKUP_LEAD = [
  `${Math.floor(MIN_PICKUP_LEAD_MIN / 60)} hours`,
  MIN_PICKUP_LEAD_MIN % 60 ? `${MIN_PICKUP_LEAD_MIN % 60} minutes` : '',
].filter(Boolean).join(' ')

export interface TransferReview {
  quote: string
  name: string
  route: string
  rating: 5
}

/**
 * Guest reviews shown on the transfers page.
 *
 * EMPTY, and it must stay empty until these are real. This array previously
 * held three invented five-star reviews attributed to invented people, which
 * is unlawful in MAPL's main markets (FTC Act s5, Canada's Competition Act,
 * the UK DMCC Act 2024) quite apart from being untrue. The section renders
 * nothing at all when this is empty, which is the honest state for a business
 * whose real review count is currently zero.
 *
 * Add entries here ONLY by copying what a real guest actually wrote, with
 * their permission.
 */
export const TRANSFER_REVIEWS: TransferReview[] = []
export interface TransferFaq {
  q: string
  a: string
}

export const TRANSFER_FAQS: TransferFaq[] = [
  {
    q: 'Is the price really flat for 1–4 passengers?',
    a: 'Yes. The fare shown is per vehicle, not per person, and it is all-in: nothing is added at checkout. A family of four pays the same as a solo traveler on the same route, and a round-trip fare covers both rides, to your hotel and back to the airport. Parties of five to seven are priced per person and still ride together; groups of eight or more get a custom quote with a second vehicle.',
  },
  {
    q: 'What vehicle will we ride in?',
    a: 'A private, air-conditioned minivan, reserved for your party alone. You never share it with other passengers, and it is never a shuttle or a coach. Prefer an SUV? We can arrange one at a higher rate; email contact@mapltours.com for a price.',
  },
  {
    q: 'How much luggage can we bring?',
    a: 'A suitcase each is no problem: four adults and four suitcases fit comfortably in the minivan. Travelling with more bags, golf clubs or a stroller? Add them under "Anything we should know?" at checkout and we will make sure the vehicle fits.',
  },
  {
    q: 'Are your drivers licensed and insured?',
    a: 'Yes. Your ride is provided by our licensed local transport partner, authorized for tourist airport transfers in Jamaica. The vehicle carries commercial passenger insurance, and every passenger has their own seat belt.',
  },
  {
    q: 'Will we know who our driver is?',
    a: 'Yes. Before your pickup we send your driver\'s name, the vehicle and its registration plate, and how to reach them.',
  },
  {
    q: 'What happens if my flight is delayed?',
    a: 'We track your flight in real time from the moment it leaves. If you land late, your driver adjusts, there is no delay surcharge on any booking. If your flight is cancelled outright, just let us know and we will gladly reschedule your pickup or arrange a refund.',
  },
  {
    q: 'How do I find my driver at MBJ?',
    a: 'After you clear immigration and customs, walk through the arrivals doors. Your driver will be holding a MAPL Tours Jamaica sign with your name. If you do not see them within ten minutes, contact us using the details in your confirmation email.',
  },
  {
    q: 'How do we set the pickup for our flight home?',
    a: `You choose it at checkout. Enter the time your flight home departs and we suggest a hotel pickup ${PICKUP_LEAD} before it, which you can change. Your driver picks you up at your hotel or villa. Any other instructions go in the "Anything we should know?" box at checkout.`,
  },
  {
    q: 'Can I pay in cash?',
    a: 'Payment is taken online up front via Stripe, in USD. That is how we keep the pricing transparent and how you get a real receipt. Cash tips for the driver are welcome but never expected.',
  },
  {
    q: 'Do you serve Kingston (KIN) and Port Antonio?',
    a: 'Yes, but those routes are priced individually rather than by zone. Use the contact form with your dates and hotel and we will quote within 24 hours.',
  },
  {
    q: 'What is your cancellation policy?',
    a: 'Flexible cancellation within 48 hours of booking. Request it from your Profile page or by replying to your confirmation email, and we review it before refunding, with a refund of the amount paid less an administration charge equivalent to 20% of the total amount of fees paid plus taxes (if applicable). Changes to your pickup run on the same 48-hour window, just contact us. After that window the fare is non-refundable, your driver is already booked and is turning down other trips. No-shows are charged in full.',
  },
]
