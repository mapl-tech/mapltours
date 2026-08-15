/**
 * Where to eat in the areas MAPL actually drives to.
 *
 * These are RECOMMENDATIONS, not products: nothing here is bookable, priced
 * or commissioned, so the catalogue can never promise a table MAPL cannot
 * deliver. They exist because every transfer ends at a resort and the first
 * question a guest asks the driver is where to eat, and because "best
 * restaurants in Negril" is exactly the question travellers put to Google and
 * to AI assistants, which is the channel already sending MAPL bookings.
 *
 * Each entry describes only what the restaurant is widely and durably known
 * for. Prices, hours and phone numbers are deliberately absent: they change,
 * and a stale specific is worse than none.
 */

export type FoodArea = 'Negril' | 'Ocho Rios' | 'Montego Bay' | 'Falmouth'

export interface Restaurant {
  name: string
  area: FoodArea
  parish: string
  /** One line on what it is known for. */
  known: string
  /** Short editorial note in MAPL's voice. */
  note: string
  /** Where it actually is, specific enough for a driver to take you there. */
  location: string
  /** Rough vibe, used as a chip. */
  tags: string[]
}

export const RESTAURANTS: Restaurant[] = [
  // ── Negril ──
  {
    name: "Rick's Cafe",
    area: 'Negril',
    parish: 'Westmoreland',
    location: 'West End Road, Negril',
    known: 'Cliff diving, sunset, rum punch',
    note: 'The one everybody names. Go for the sunset and the divers rather than a quiet dinner, and get there early enough to find a spot on the rail.',
    tags: ['Sunset', 'Cliffs', 'Landmark'],
  },
  {
    name: '3 Dives Jerk Centre',
    area: 'Negril',
    parish: 'Westmoreland',
    location: 'West End Road, Negril',
    known: 'Jerk chicken and lobster on the West End cliffs',
    note: 'Plastic chairs, open fire, and some of the best jerk on this coast. Cash is easiest and the wait is part of it.',
    tags: ['Jerk', 'Casual', 'Local favourite'],
  },
  {
    name: 'Rockhouse Restaurant',
    area: 'Negril',
    parish: 'Westmoreland',
    location: 'West End Road, Negril',
    known: 'Cliffside dining above the water',
    note: 'The polished end of the West End: Jamaican cooking done carefully, with the sea directly below the terrace. Worth booking ahead.',
    tags: ['Cliffside', 'Date night', 'Book ahead'],
  },
  {
    name: "Ivan's Bar & Restaurant",
    area: 'Negril',
    parish: 'Westmoreland',
    location: 'Catcha Falling Star, West End Road, Negril',
    known: 'Sunset dinner at Catcha Falling Star',
    note: 'Quieter than Rick’s for the same sunset, with table service and a proper menu instead of a crowd.',
    tags: ['Sunset', 'Quiet', 'Cliffside'],
  },
  {
    name: 'Sweet Spice',
    area: 'Negril',
    parish: 'Westmoreland',
    location: 'Whitehall Road, Negril',
    known: 'Home-style Jamaican cooking off the tourist strip',
    note: 'Curry goat, oxtail, brown stew fish. A family restaurant that locals have used for decades, inland from the beach.',
    tags: ['Jamaican', 'Family run', 'Off-strip'],
  },

  // ── Ocho Rios ──
  {
    name: "Miss T's Kitchen",
    area: 'Ocho Rios',
    parish: 'St. Ann',
    location: 'Evelyn Street, Ocho Rios',
    known: 'Traditional Jamaican cooking in a garden courtyard',
    note: 'The best-known kitchen in Ocho Rios and deservedly so. Ask for whatever the day’s pot has in it.',
    tags: ['Jamaican', 'Garden', 'Ocho Rios classic'],
  },
  {
    name: 'Scotchies',
    area: 'Ocho Rios',
    parish: 'St. Ann',
    location: 'Drax Hall, just west of Ocho Rios',
    known: 'Pit-smoked jerk under open shelters',
    note: 'Order by the quarter or half, add festival and breadfruit, and eat it at the picnic tables. A rare tourist-known spot that Jamaicans still rate.',
    tags: ['Jerk', 'Open air', 'Institution'],
  },
  {
    name: "Evita's Italian Restaurant",
    area: 'Ocho Rios',
    parish: 'St. Ann',
    location: 'Eden Bower Road, above Ocho Rios',
    known: 'Italian cooking in a hillside great house',
    note: 'A long-running Ocho Rios institution with a view over the bay. Italian with Jamaican touches, and a room full of history.',
    tags: ['Italian', 'View', 'Long-running'],
  },
  {
    name: 'Toscanini',
    area: 'Ocho Rios',
    parish: 'St. Ann',
    location: 'Harmony Hall, Tower Isle, east of Ocho Rios',
    known: 'Italian cooking at Harmony Hall',
    note: 'East of town at Harmony Hall. Fresh pasta and whatever came off the boat, in a quiet colonial building away from the cruise crowds.',
    tags: ['Italian', 'Seafood', 'Quiet'],
  },

  // ── Montego Bay ──
  {
    name: 'Scotchies (Rose Hall)',
    area: 'Montego Bay',
    parish: 'St. James',
    location: 'Rose Hall main road, Montego Bay',
    known: 'The original pit-smoked jerk stop',
    note: 'On the Rose Hall road, minutes from most Montego Bay resorts. The easiest genuinely local meal to reach from an airport transfer.',
    tags: ['Jerk', 'Near resorts', 'Original'],
  },
  {
    name: 'The Pelican Grill',
    area: 'Montego Bay',
    parish: 'St. James',
    location: 'Gloucester Avenue (the Hip Strip), Montego Bay',
    known: 'A Hip Strip diner serving since the 1960s',
    note: 'Unchanged in the best way: Jamaican breakfast, seafood, and booths that have seen sixty years of Montego Bay.',
    tags: ['Classic', 'Hip Strip', 'Breakfast'],
  },
  {
    name: 'HouseBoat Grill',
    area: 'Montego Bay',
    parish: 'St. James',
    location: 'Southern Cross Boulevard, Freeport, Montego Bay',
    known: 'Dinner on a moored houseboat in the lagoon',
    note: 'You are ferried out to the table. Novel, genuinely good, and the most memorable dinner in Montego Bay if you book it.',
    tags: ['On the water', 'Date night', 'Book ahead'],
  },
  {
    name: 'Pier 1',
    area: 'Montego Bay',
    parish: 'St. James',
    location: 'Howard Cooke Boulevard, Montego Bay harbour',
    known: 'Waterfront dining and Friday-night crowds',
    note: 'Seafood over the harbour by day, one of the busiest nights out in MoBay by the weekend.',
    tags: ['Waterfront', 'Nightlife', 'Seafood'],
  },

  // ── Falmouth ──
  {
    name: "Time 'N' Place",
    area: 'Falmouth',
    parish: 'Trelawny',
    location: 'Coopers Pen, the coast road between Falmouth and Duncans',
    known: 'Driftwood beach bar between Falmouth and Duncans',
    note: 'A weathered beach shack that has appeared in more photo shoots than it lets on. Stop for lobster and a swim on the way along the north coast.',
    tags: ['Beach bar', 'Photogenic', 'Roadside'],
  },
]

export const FOOD_AREAS: FoodArea[] = ['Montego Bay', 'Falmouth', 'Ocho Rios', 'Negril']

export function restaurantsByArea(area: FoodArea): Restaurant[] {
  return RESTAURANTS.filter((r) => r.area === area)
}
