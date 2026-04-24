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

export const TRANSFER_REVIEWS: TransferReview[] = [
  {
    quote:
      'Driver texted me the moment my flight cleared customs and had my luggage on the trolley before I could find the exit. Exactly what you want after nine hours in the air.',
    name: 'Meredith R.',
    route: 'MBJ → Negril · round-trip',
    rating: 5,
  },
  {
    quote:
      'I booked the RIU Negril transfer at 2am the night before travel — confirmed by 5am, driver was there with a chilled Ting. No haggling, no mystery fees.',
    name: 'Daniel K.',
    route: 'MBJ → Negril · one-way',
    rating: 5,
  },
  {
    quote:
      'Price was the same as the resort shuttle but we had the car to ourselves and the driver stopped at Scotchies on the way to Ocho Rios. Little things.',
    name: 'Priya S.',
    route: 'MBJ → Ocho Rios · round-trip',
    rating: 5,
  },
]

export interface TransferFaq {
  q: string
  a: string
}

export const TRANSFER_FAQS: TransferFaq[] = [
  {
    q: 'Is the price really flat for 1–4 passengers?',
    a: 'Yes. The fare shown is per vehicle, not per person. A family of four pays the same as a solo traveler on the same route. Groups of five or more get a custom quote — we run a separate vehicle to keep everyone comfortable.',
  },
  {
    q: 'What happens if my flight is delayed?',
    a: 'We track your flight in real time from the moment it leaves. If you land late, your driver adjusts — there is no delay surcharge on any booking, even multi-hour holds. If your flight is cancelled outright, reply to the confirmation email and we will refund in full.',
  },
  {
    q: 'How do I find my driver at MBJ?',
    a: 'After you clear immigration and customs, walk through the arrivals doors. Your driver will be on the left side holding a MAPL Tours sign with your name. If you do not see them within five minutes, call the 24/7 dispatch number in your confirmation email.',
  },
  {
    q: 'Can I pay in cash?',
    a: 'Payment is taken online up front via Stripe, in USD. That is how we keep the pricing transparent and how you get a real receipt. Cash tips for the driver are welcome but never expected.',
  },
  {
    q: 'What about child seats, wheelchair access, or extra luggage?',
    a: 'All handled — add details in the special requests field at checkout. Child seats are complimentary; wheelchair-accessible vehicles require 48 hours notice and may adjust the rate slightly for the larger vehicle.',
  },
  {
    q: 'Do you serve Kingston (KIN) and Port Antonio?',
    a: 'Yes, but those routes are priced individually rather than by zone. Use the contact form with your dates and we will quote within the hour. Kingston transfers typically run $90 to $150 depending on destination; Port Antonio is $180 to $240 depending on the hotel.',
  },
  {
    q: 'What is your cancellation policy?',
    a: 'Free cancellation up to 24 hours before your scheduled pickup time. Inside 24 hours we charge 50% of the fare — your driver has already been dispatched and is turning down other trips. No-shows are charged in full.',
  },
]
