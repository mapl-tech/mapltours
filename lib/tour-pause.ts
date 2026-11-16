/**
 * Tours taken off sale for a while, by catalogue id, with who asked and when.
 *
 * A paused tour keeps its page, its price card and its place in the
 * catalogue (the prices desk, the blog, old links), but nobody can book it:
 *
 *   - it leaves every list a guest browses (singleExperiences, the saved
 *     list), and its own page says it is not taking bookings, with no Add;
 *   - the cart will not take it (lib/cart addItem and swapDayFor), and a cart
 *     that already holds it cannot pay until it is removed (the checkout page
 *     says so before any request);
 *   - /api/checkout refuses it (lib/checkout-pricing priceTourCart), so no
 *     pending row or PaymentIntent is made for it, whatever a browser sends;
 *   - the agent tools leave it out of list_tours and answer get_tour and
 *     start_tour_booking with an error saying it is paused, a /book link to
 *     it is refused, llms.txt does not list it, and no email offers it.
 *
 * Lifting a pause is deleting its line here and deploying.
 */
export const PAUSED_TOURS: Readonly<Record<number, string>> = {
  // Rasta Cultural ATV Safari. Collin, WhatsApp, Nov 15 2026, 10:06 pm: "Can
  // you pause on the Rasta safari tour i am going to reach out to them
  // tomorrow and confirm the pricing". Owner, Nov 16: "Collin asked to pause
  // it." Lift when Collin confirms the price (and change the rate card at
  // /admin/tour-rates first if it moved).
  5: 'Collin, Nov 15 2026: paused while he confirms the price',
}

export function isTourPaused(id: number | null | undefined): boolean {
  return typeof id === 'number' && Object.prototype.hasOwnProperty.call(PAUSED_TOURS, id)
}

/** The one sentence every surface starts from. */
export function pausedLine(title: string): string {
  return `${title} is not taking bookings right now.`
}

/** At checkout, where the guest can fix it by removing the tour. */
export function pausedCheckoutLine(title: string): string {
  return `${pausedLine(title)} Remove it to book the rest of your trip.`
}

/** From the checkout server, which a guest only meets with an old cart or a hand-made request. */
export function pausedServerLine(title: string): string {
  return `${pausedLine(title)} Remove it from your trip to book the rest, or write to contact@mapltours.com.`
}

/** To an AI agent, with its next step. */
export function pausedAgentLine(title: string): string {
  return `${pausedLine(title)} Offer the traveller another tour from list_tours.`
}
