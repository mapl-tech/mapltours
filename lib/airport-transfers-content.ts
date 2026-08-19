/**
 * Shared FAQ + review copy for the transfers flow. Lives in its own file so
 * the server-side /transfers page can import the FAQ array for FAQPage
 * JSON-LD alongside the client-side TransfersView component that renders it.
 */

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
    a: 'Yes. The fare shown is per vehicle, not per person. A family of four pays the same as a solo traveler on the same route. Groups of five or more get a custom quote, we run a separate vehicle to keep everyone comfortable.',
  },
  {
    q: 'What happens if my flight is delayed?',
    a: 'We track your flight in real time from the moment it leaves. If you land late, your driver adjusts, there is no delay surcharge on any booking, even multi-hour holds. If your flight is cancelled outright, just let us know and we will gladly reschedule your pickup or arrange a refund.',
  },
  {
    q: 'How do I find my driver at MBJ?',
    a: 'After you clear immigration and customs, walk through the arrivals doors. Your driver will be holding a MAPL Tours Jamaica sign with your name. If you do not see them within ten minutes, contact us using the details in your confirmation email.',
  },
  {
    q: 'Can I pay in cash?',
    a: 'Payment is taken online up front via Stripe, in USD. That is how we keep the pricing transparent and how you get a real receipt. Cash tips for the driver are welcome but never expected.',
  },
  {
    q: 'Do you serve Kingston (KIN) and Port Antonio?',
    a: 'Yes, but those routes are priced individually rather than by zone. Use the contact form with your dates and we will quote within 24 hours. Kingston transfers typically run $90 to $150 depending on destination; Port Antonio is $180 to $240 depending on the hotel.',
  },
  {
    q: 'What is your cancellation policy?',
    a: 'Flexible cancellation within 48 hours of booking. Request it from your Profile page or by replying to your confirmation email, and we review it before refunding, with a refund of the amount paid less an administration charge equivalent to 20% of the total amount of fees paid plus taxes (if applicable). Changes to your pickup run on the same 48-hour window, just contact us. After that window the fare is non-refundable, your driver is already booked and is turning down other trips. No-shows are charged in full.',
  },
]
