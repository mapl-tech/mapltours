/**
 * Pickup zones for tours priced by where the guest is staying.
 *
 * Collin, Nov 12 2026: Dunn's River and Blue Hole cost him a different flat
 * rate for 1 to 4 people depending on the zone he drives from (Ocho Rios
 * $190, Runaway Bay / Discovery Bay $220, Trelawny $230, Montego Bay $280,
 * Lucea $300, Negril $400), plus $50 for each extra guest. A tour carries its
 * own rate per zone (TourPricing.zoneRates, editable in /admin/tour-rates);
 * this module only names the zones and says, in one place, which zone a
 * pickup is in.
 *
 * West to east, the order guests read them in. A place that is in none of
 * them (Kingston, Port Antonio, the South Coast, east of Ocho Rios) gets no
 * zone, and a zone-priced tour is not sold online from there: the guest is
 * asked to write for a price instead of being quoted a guess.
 */
export const TOUR_ZONES = ['negril', 'lucea', 'montego_bay', 'trelawny', 'runaway_bay', 'ocho_rios'] as const

export type TourZone = (typeof TOUR_ZONES)[number]

/** How guests read each zone. "&" as the transfer zones write it. */
export const TOUR_ZONE_LABEL: Record<TourZone, string> = {
  negril: 'Negril',
  lucea: 'Lucea & Hanover',
  montego_bay: 'Montego Bay & Rose Hall',
  trelawny: 'Falmouth & Trelawny',
  runaway_bay: 'Runaway Bay & Discovery Bay',
  ocho_rios: 'Ocho Rios',
}

export function isTourZone(v: unknown): v is TourZone {
  return typeof v === 'string' && (TOUR_ZONES as readonly string[]).includes(v)
}
