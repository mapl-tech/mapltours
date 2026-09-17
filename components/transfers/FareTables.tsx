'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import {
  getTransferPrice,
  groupDestinationsByZone,
  searchDestinations,
  type TransferDestination,
  type TransferTripType,
  type TransferZone,
} from '@/lib/airport-transfers'

/**
 * Every fare from MBJ, per hotel, as one compact fare finder.
 *
 * The 199 fares are published here so Google, AI assistants and anyone
 * comparing on a phone can read them, and so the checkout price can never
 * drift from what is advertised: every number comes from getTransferPrice,
 * the function the checkout prices with.
 *
 * Shape: a row of zone tabs (drive time and "from" price on each), a search
 * box that looks across every zone, and one panel of hotel rows: three
 * columns on desktop, one on a phone, twelve rows before "Show all". Every
 * hotel name and price is a button that fills the quote card. The five
 * panels are all in the HTML (hidden until chosen) so the fares stay
 * crawlable; the previous version was five tables that ran to 21 screens
 * on a phone, or 3,000px per zone when opened.
 */

const ROWS_BEFORE_MORE = 12

export default function FareTables({ onPick }: { onPick: (destinationId: string, tripType: TransferTripType) => void }) {
  // Open hotels first, cheapest first, so the fare the tab promises ("from
  // $22") is on the first screen and a phone's eight rows are not seven
  // closed resorts.
  const groups = useMemo(() => groupDestinationsByZone().map((g) => ({
    ...g,
    items: [...g.items].sort((a, b) => {
      const ca = a.reopens ? 1 : 0, cb = b.reopens ? 1 : 0
      if (ca !== cb) return ca - cb
      const pa = getTransferPrice(a.id, 'one_way') ?? Infinity, pb = getTransferPrice(b.id, 'one_way') ?? Infinity
      if (pa !== pb) return pa - pb
      return a.name.localeCompare(b.name)
    }),
  })), [])
  const [zone, setZone] = useState<TransferZone>('A')
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState<Record<string, boolean>>({})

  // The zone cards higher on the page link to #fares-<zone>. The id sits on
  // the tab, so the browser scrolls to a visible element, and this selects it.
  useEffect(() => {
    const fromHash = () => {
      const m = /^#fares-([A-E])$/.exec(window.location.hash)
      if (m) { setZone(m[1] as TransferZone); setQuery('') }
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [])

  const q = query.trim()
  const matches = useMemo(() => (q ? searchDestinations(q, 60).filter((d) => !d.id.endsWith('-other')) : []), [q])

  return (
    <section aria-labelledby="every-fare" className="fare-section">
      <div className="container" style={{ maxWidth: 1180 }}>
        <div className="fare-head">
          <div>
            <p className="fare-eyebrow">Rate card</p>
            <h2 id="every-fare" className="fare-h2">Every fare from Sangster (MBJ)</h2>
            <p className="fare-intro">
              One flat price per vehicle for one to four passengers, nothing added at checkout. Tap a hotel to book it.
            </p>
          </div>
          <label className="fare-search">
            <Search size={17} aria-hidden className="fare-search-icon" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find your hotel or villa"
              aria-label="Find your hotel or villa in the rate card"
              autoComplete="off"
              enterKeyHint="search"
            />
          </label>
        </div>

        {q ? (
          <div className="fare-panel" role="region" aria-label={`Fares matching ${q}`}>
            <p className="fare-panel-meta" aria-live="polite">
              {matches.length === 0
                ? 'No hotel by that name. Try the town, or type it into the quote card above and we will price it by area.'
                : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'} · one way and round trip, per vehicle`}
            </p>
            <FareRows items={matches} onPick={onPick} limit={ROWS_BEFORE_MORE * 2} />
          </div>
        ) : (
          <>
            <div className="fare-tabs" role="tablist" aria-label="Areas">
              {groups.map(({ zone: z, items }, idx) => {
                const from = Math.min(...items.map((d) => getTransferPrice(d.id, 'one_way') ?? Infinity))
                const active = z.code === zone
                return (
                  <button
                    key={z.code}
                    id={`fares-${z.code}`}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls={`fares-panel-${z.code}`}
                    tabIndex={active ? 0 : -1}
                    className={`fare-tab${active ? ' is-active' : ''}`}
                    onClick={() => setZone(z.code)}
                    // One Tab stop for the row; arrows move between areas.
                    onKeyDown={(e) => {
                      const codes = groups.map((g) => g.zone.code)
                      let next = -1
                      if (e.key === 'ArrowRight') next = (idx + 1) % codes.length
                      else if (e.key === 'ArrowLeft') next = (idx - 1 + codes.length) % codes.length
                      else if (e.key === 'Home') next = 0
                      else if (e.key === 'End') next = codes.length - 1
                      if (next < 0) return
                      e.preventDefault()
                      setZone(codes[next])
                      document.getElementById(`fares-${codes[next]}`)?.focus()
                    }}
                  >
                    <span className="fare-tab-name">{z.label}</span>
                    <span className="fare-tab-from">{Number.isFinite(from) ? `from $${from}` : 'on request'}</span>
                  </button>
                )
              })}
            </div>

            {groups.map(({ zone: z, items }) => {
              const active = z.code === zone
              const ow = items.map((d) => getTransferPrice(d.id, 'one_way')).filter((n): n is number => n != null)
              const rt = items.map((d) => getTransferPrice(d.id, 'round_trip')).filter((n): n is number => n != null)
              const range = (xs: number[]) => (xs.length ? (Math.min(...xs) === Math.max(...xs) ? `$${xs[0]}` : `$${Math.min(...xs)} to $${Math.max(...xs)}`) : 'on request')
              const all = !!showAll[z.code]
              return (
                <div
                  key={z.code}
                  id={`fares-panel-${z.code}`}
                  role="tabpanel"
                  aria-labelledby={`fares-${z.code}`}
                  className={`fare-panel${all ? ' is-all' : ''}`}
                  hidden={!active}
                >
                  <p className="fare-panel-meta">
                    {z.duration} · {items.length} {items.length === 1 ? 'hotel' : 'hotels'} · one way {range(ow)} · round trip {range(rt)}
                  </p>
                  <FareRows items={items} onPick={onPick} limit={all ? Infinity : ROWS_BEFORE_MORE} />
                  {items.length > ROWS_BEFORE_MORE && (
                    <button
                      type="button"
                      className="fare-more"
                      aria-expanded={all}
                      onClick={() => setShowAll((s) => ({ ...s, [z.code]: !all }))}
                    >
                      {all ? 'Show fewer' : `Show all ${items.length} hotels`}
                    </button>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>
    </section>
  )
}

function FareRows({ items, onPick, limit }: {
  items: TransferDestination[]
  onPick: (destinationId: string, tripType: TransferTripType) => void
  limit: number
}) {
  return (
    <ul className="fare-rows">
      {items.map((d, i) => {
        const ow = getTransferPrice(d.id, 'one_way')
        const rt = getTransferPrice(d.id, 'round_trip')
        // "Dreams Rose Hall (formerly Hilton Rose Hall)" and "Riu Ocho Rios,
        // Ocho Rios" both split into a short name and a second line.
        const paren = /\s*\(([^)]+)\)\s*$/.exec(d.name)
        const base = paren ? d.name.slice(0, paren.index) : d.name
        const short = base.replace(/,\s*[^,]+$/, '')
        const town = base === short ? '' : base.slice(short.length + 1).trim()
        const sub = [d.reopens ? `reopening ${d.reopens}` : '', paren?.[1], town || d.parish].filter(Boolean).join(' · ')
        return (
          <li key={d.id} className="fare-row" hidden={i >= limit}>
            <button type="button" className="fare-pick fare-pick-name" onClick={() => onPick(d.id, 'round_trip')} aria-label={`Book a transfer to ${d.name}`}>
              <span className="fare-row-name">{short}</span>
              <span className="fare-row-sub">{sub}</span>
            </button>
            {ow != null ? (
              <button type="button" className="fare-pick fare-pick-price" onClick={() => onPick(d.id, 'one_way')} aria-label={`One way to ${d.name}, $${ow}`}>
                <span className="fare-price-label">one way</span>${ow}
              </button>
            ) : <span className="fare-price-na">ask</span>}
            {rt != null ? (
              <button type="button" className="fare-pick fare-pick-price is-rt" onClick={() => onPick(d.id, 'round_trip')} aria-label={`Round trip to ${d.name}, $${rt}`}>
                <span className="fare-price-label">round trip</span>${rt}
              </button>
            ) : <span className="fare-price-na">ask</span>}
          </li>
        )
      })}
    </ul>
  )
}
