import Link from 'next/link'
import { groupDestinationsByZone } from '@/lib/airport-transfers'

/**
 * Every hotel ride page on /transfers, by area, as plain links.
 *
 * Search Console, Nov 24 2026: Google had never crawled any of the
 * /transfers/<hotel> pages. They had been in the sitemap since Sept 24, but
 * nothing on the site linked to them (the rate card's hotel names are buttons
 * that fill the quote card), and Google had not re-read the sitemap since
 * April. This list is that link.
 *
 * Each area is a closed <details>, so the list adds five rows below the rate
 * card and nothing above the booking card. A closed <details> is still in the
 * HTML, so crawlers read every link. The markup stays bare (classes on the
 * containers only, no per-link styles): it ships in the HTML of a page most
 * guests open on a phone. prefetch is off because opening an area shows up to
 * 58 links at once, and prefetching each would cost a phone 58 requests.
 *
 * Names and areas come from the catalogue, the same as the rate card. The
 * "Other hotel or villa" entry closes each area.
 */
export default function HotelDirectory() {
  const groups = groupDestinationsByZone().map(({ zone, items }) => ({
    zone,
    items: [...items].sort((a, b) => {
      const otherA = a.id.endsWith('-other') ? 1 : 0
      const otherB = b.id.endsWith('-other') ? 1 : 0
      return otherA - otherB || a.name.localeCompare(b.name, 'en')
    }),
  }))

  return (
    <section className="xfer-hotels" aria-labelledby="hotel-pages">
      <div className="container" style={{ maxWidth: 1180 }}>
        <p className="xfer-hotels-kicker">Hotel pages</p>
        <h2 id="hotel-pages" className="xfer-section-h2">
          Every hotel we drive to.
        </h2>
        <p className="xfer-hotels-intro">
          Pick your area, then your hotel. Each one has its own page with its fare from Sangster (MBJ).
        </p>
        <div className="xfer-hotels-groups">
          {groups.map(({ zone, items }) => (
            <details key={zone.code} className="xfer-hotels-group">
              <summary>
                {/* The space keeps the spoken name "Negril & Runaway Bay 83 hotels", not "Bay83"; flex layout drops it visually.
                    On a narrow phone the count drops under the name whole instead of splitting "58 / hotels". */}
                <span className="xfer-hotels-head">
                  <span className="xfer-hotels-area">{zone.label}</span>{' '}
                  <span className="xfer-hotels-count">
                    {items.length} {items.length === 1 ? 'hotel' : 'hotels'}
                  </span>
                </span>
              </summary>
              <ul className="xfer-hotels-list">
                {items.map((d) => (
                  <li key={d.id}>
                    <Link href={`/transfers/${d.id}`} prefetch={false}>
                      {d.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
