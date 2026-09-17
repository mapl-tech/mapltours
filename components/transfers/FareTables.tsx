'use client'

import { ChevronDown } from 'lucide-react'
import { getTransferPrice, groupDestinationsByZone, type TransferTripType, type TransferZone } from '@/lib/airport-transfers'

/**
 * Every fare from MBJ, per hotel, as real HTML.
 *
 * The 199 fares are published here so Google, AI assistants and anyone
 * comparing on a phone can read them, and so the checkout price can never
 * drift from what is advertised: every number comes from getTransferPrice,
 * the function the checkout prices with.
 *
 * On a phone the five tables ran to 21 screens of plain text with nothing to
 * tap, and Hotjar showed visitors scrolling all of it looking for their hotel,
 * tapping a price, then scrolling back up to type the hotel into the card.
 * So each zone is collapsed behind its summary, and every hotel name and
 * price is a button that fills the quote card and takes the visitor to it.
 */
export default function FareTables({ onPick }: { onPick: (destinationId: string, tripType: TransferTripType) => void }) {
  const groups = groupDestinationsByZone()
  return (
    <section aria-labelledby="every-fare" className="fare-section">
      <div className="container">
        <h2 id="every-fare" className="fare-h2">Every fare from Sangster (MBJ)</h2>
        <p className="fare-intro">
          One flat price per vehicle for one to four passengers, all in, with nothing added at
          checkout. A round trip costs less than two one-ways booked separately. Tap your hotel to
          book it. Parties of five or more, and Kingston or Port Antonio, are quoted individually.
        </p>

        {groups.map(({ zone, items }) => {
          const ow = items.map((d) => getTransferPrice(d.id, 'one_way')).filter((n): n is number => n != null)
          const rt = items.map((d) => getTransferPrice(d.id, 'round_trip')).filter((n): n is number => n != null)
          const range = (xs: number[]) => (xs.length ? (Math.min(...xs) === Math.max(...xs) ? `$${xs[0]}` : `$${Math.min(...xs)}–$${Math.max(...xs)}`) : 'on request')
          return (
            <details key={zone.code} id={`fares-${zone.code}`} className="fare-zone">
              <summary className="fare-zone-summary">
                <span className="fare-zone-summary-text">
                  <span className="fare-zone-label">{zone.label}</span>
                  <span className="fare-zone-meta">
                    {zone.duration} · {items.length} {items.length === 1 ? 'hotel' : 'hotels'} · one way {range(ow)} · round trip {range(rt)}
                  </span>
                </span>
                <ChevronDown size={18} aria-hidden className="fare-zone-chevron" />
              </summary>
              <div className="fare-scroll">
                <table className="fare-table">
                  <thead>
                    <tr>
                      <th scope="col">Hotel or villa</th>
                      <th scope="col" className="fare-parish">Parish</th>
                      <th scope="col" className="fare-num">One way</th>
                      <th scope="col" className="fare-num">Round trip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((d) => (
                      <FareRow key={d.id} id={d.id} name={d.name} parish={d.parish} reopens={d.reopens} zone={zone.code} onPick={onPick} />
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )
        })}
      </div>
    </section>
  )
}

function FareRow({ id, name, parish, reopens, onPick }: {
  id: string; name: string; parish: string; reopens?: string; zone: TransferZone
  onPick: (destinationId: string, tripType: TransferTripType) => void
}) {
  const ow = getTransferPrice(id, 'one_way')
  const rt = getTransferPrice(id, 'round_trip')
  return (
    <tr>
      <th scope="row">
        <button type="button" className="fare-pick" onClick={() => onPick(id, 'round_trip')} aria-label={`Book a transfer to ${name}`}>
          {name}
          {reopens ? <span className="fare-reopen"> (reopening {reopens})</span> : null}
        </button>
      </th>
      <td className="fare-parish">{parish}</td>
      <td className="fare-num">
        {ow != null ? (
          <button type="button" className="fare-pick fare-pick-price" onClick={() => onPick(id, 'one_way')} aria-label={`One way to ${name}, $${ow}`}>${ow}</button>
        ) : 'On request'}
      </td>
      <td className="fare-num">
        {rt != null ? (
          <button type="button" className="fare-pick fare-pick-price" onClick={() => onPick(id, 'round_trip')} aria-label={`Round trip to ${name}, $${rt}`}>${rt}</button>
        ) : 'On request'}
      </td>
    </tr>
  )
}
