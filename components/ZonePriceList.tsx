import { isPerPersonByArea, isZonePriced, zonePrices, type Experience } from '@/lib/experiences'
import { TOUR_ZONE_LABEL } from '@/lib/tour-zones'

/**
 * A tour priced by where the guest is staying, area by area, west to east:
 * the exact price checkout charges from each pickup area (lib/experiences
 * zonePrices, the same function checkout prices with), so the guest reads
 * their own number before they reach checkout. Renders nothing for a tour
 * with one price everywhere.
 *
 * The party shown is the one the headline speaks for: up to the tier for a
 * group price, two people where every guest adds to it (the both-falls day),
 * one person where every guest pays the area's rate (bamboo rafting).
 */
export default function ZonePriceList({ exp, formatPrice, tone = 'light' }: {
  exp: Pick<Experience, 'pricing'>
  formatPrice: (n: number) => string
  tone?: 'light' | 'dark'
}) {
  const p = exp.pricing
  if (!isZonePriced(p)) return null
  const perHead = isPerPersonByArea(p)
  const party = perHead ? 1 : p.perPersonAddon ? 2 : p.tierMax
  const rows = zonePrices(p, party)
  const muted = tone === 'dark' ? '#cccccc' : 'var(--text-tertiary)'
  const strong = tone === 'dark' ? '#ffffff' : 'var(--text-primary)'
  const rule = tone === 'dark' ? 'rgba(255,255,255,0.16)' : 'var(--border)'
  return (
    <div style={{ fontFamily: 'var(--font-dm-sans)' }}>
      <p style={{ fontSize: 13, lineHeight: 1.5, color: muted }}>
        {perHead ? 'Per person, by where we pick you up' : p.perPersonAddon ? 'For 2 people, by where we pick you up' : `For up to ${p.tierMax} people, by where we pick you up`}
      </p>
      <dl style={{ margin: '6px 0 0' }}>
        {rows.map((r) => (
          <div key={r.zone} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '8px 0', borderTop: `1px solid ${rule}` }}>
            <dt style={{ fontSize: 14, lineHeight: 1.4, color: strong }}>{TOUR_ZONE_LABEL[r.zone]}</dt>
            <dd style={{ margin: 0, fontSize: 14, fontWeight: 700, color: strong, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatPrice(r.price)}</dd>
          </div>
        ))}
      </dl>
      <p style={{ fontSize: 13, lineHeight: 1.5, color: muted, marginTop: 8 }}>
        {perHead ? '' : p.perPersonAddon ? 'Each guest adds to the price. ' : `Each guest over ${p.tierMax} adds to the price. `}Staying somewhere else? Write to us for a price. Checkout shows your exact total.
      </p>
    </div>
  )
}
