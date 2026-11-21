import {
  estimatedRateDestinations, driverCost, getTransferPrice,
  TRANSFER_MARGIN, REMITLY_FLAT, REMITLY_FX, CARD_RATE, CARD_FIXED, ROUND_TRIP_DISCOUNT,
} from '@/lib/airport-transfers'
import { REMITLY_FLAT_USD, REMITLY_FX as REMITLY_EST_FX } from '@/lib/dispatch'
import { TOUR_MARGIN, TOUR_PAYOUT_RATE } from '@/lib/experiences'
import { WISE_FEE_RATE } from '@/lib/payout-fees'
import { money } from '@/lib/admin-format'

/**
 * The cash-flow page's server-rendered close: the driver rates still to
 * confirm with Collin, and how the numbers are worked out. Every figure in
 * the note is read from the pricing code itself, so it cannot drift from what
 * guests pay. Styles: the .adm-cf block in app/globals.css.
 */

/** "10%", "2.05%": a pricing constant as the note prints it. */
const pct = (x: number) => `${Number((x * 100).toFixed(2))}%`

export default function CashflowNotes() {
  // Driver rates we inferred rather than received from Collin. Surfaced here
  // so they can be confirmed; each is set at or above the nearest quoted
  // resort, so a booking can never sell below cost in the meantime.
  const estimates = estimatedRateDestinations()
  return (
    <>
      {estimates.length > 0 && (
        <section className="adm-card adm-cf-card adm-cf-confirm" aria-labelledby="cf-rates">
          <div className="adm-card-in">
            <h2 id="cf-rates" className="adm-h3">Driver rates to confirm with Collin <span className="adm-badge adm-badge--warn">{estimates.length}</span></h2>
            <p className="adm-help adm-help--soft">
              These resorts are not on Collin&rsquo;s rate sheet, so each uses a careful estimate set at or above the nearest
              quoted resort. Confirm them and the guest price updates by itself.
            </p>
            {/* The list runs long (most of the rate card is estimated), so it opens on request. */}
            <details className="adm-details">
              <summary>Show all {estimates.length} estimated rates</summary>
              <div className="adm-cf-scroll" role="region" aria-label="Driver rates to confirm, scrolls sideways" tabIndex={0}>
                <table className="adm-table adm-cf-rates">
                  <caption className="visually-hidden">Estimated driver rates and the guest prices they make</caption>
                  <thead>
                    <tr>
                      <th scope="col">Resort</th>
                      <th scope="col" className="adm-num">Collin, one way</th>
                      <th scope="col" className="adm-num">Guest, one way</th>
                      <th scope="col" className="adm-num">Guest, round trip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimates.map((d) => (
                      <tr key={d.id}>
                        <th scope="row">{d.name}</th>
                        <td className="adm-num">{money(driverCost(d.id, 'one_way'))}</td>
                        <td className="adm-num">{money(getTransferPrice(d.id, 'one_way'))}</td>
                        <td className="adm-num">{money(getTransferPrice(d.id, 'round_trip'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </section>
      )}

      {/* How the numbers are worked out. Every figure here is read from the
          pricing code itself, so the note cannot drift from what guests pay. */}
      <details className="adm-details adm-cf-method">
        <summary>How these numbers are worked out</summary>
        <ul className="adm-cf-method-list">
          <li>
            All figures are US dollars, the currency guests pay in. Until Nov 18 2026 the Stripe account settled in Canadian
            dollars, so those charges&rsquo; Stripe fees (processing plus Stripe&rsquo;s 2% conversion) are converted at the
            charge&rsquo;s own rate, and Settled shows the Canadian dollars Stripe paid out (C$). Since then it settles US-dollar
            charges in US dollars (US$), with no conversion fee.
          </li>
          <li>
            Rides are priced at the driver&rsquo;s rate plus a {pct(TRANSFER_MARGIN)} margin, a payout allowance of{' '}
            {money(REMITLY_FLAT)} a send plus {pct(REMITLY_FX)} on the amount (what Remitly cost; Wise now costs less, and the
            difference stays with MAPL) and card processing on a US-dollar charge ({pct(CARD_RATE)} plus {money(CARD_FIXED)}),
            since Nov 21 2026; until then the card fee also carried Stripe&rsquo;s 2% conversion. A round trip is{' '}
            {Number((2 * (1 - ROUND_TRIP_DISCOUNT)).toFixed(2))} times the one-way rate: Collin&rsquo;s {pct(ROUND_TRIP_DISCOUNT)} discount.
          </li>
          <li>
            Tours are priced at the operator&rsquo;s rate plus MAPL&rsquo;s {pct(TOUR_MARGIN)} and the {pct(TOUR_PAYOUT_RATE)} Wise
            payment to the operator, grossed up for card processing on a US-dollar charge (since Nov 19 2026; until then a
            15% margin, a 5% Remitly cover and Stripe&rsquo;s 2% conversion).
          </li>
          <li>
            Payout fees are what sending each payout costs, half by half for a round trip. Where Wise has paid it, it is
            Wise&rsquo;s own fee on that payment, shared across the trips it carried. Where the payout job will pay it, it is
            Wise&rsquo;s {pct(WISE_FEE_RATE)} (est.). Where it was paid by hand through Remitly before Wise, it is about{' '}
            {money(REMITLY_FLAT_USD)} a send plus {pct(REMITLY_EST_FX)} on the amount (est.). So Net kept is profit after everything.
          </li>
          <li>
            Bookings paid before Aug 15 were priced under the old 10%-only model, which is why some show thin or negative
            nets: that is the real history, and the current pricing exists to fix it.
          </li>
          <li>
            A coupon lowers Gross and Net kept only: the driver or tour operator is always paid their full rate.
          </li>
        </ul>
      </details>
    </>
  )
}
