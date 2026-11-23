/**
 * Where the day planner measures drives from and to, more exactly than a town.
 *
 * lib/transportation.ts LOCATIONS places a town. These place the activity
 * itself where the site is known by name, and each food stop at its own door,
 * so a day of two Ocho Rios tours is timed from Dunn's River to the Blue Hole
 * (about half an hour) rather than from Ocho Rios to Ocho Rios (nothing).
 *
 * Every point is an OpenStreetMap feature, named in `source`, read from the
 * Geofabrik Jamaica extract of Nov 23 2026. The few venues OpenStreetMap does
 * not hold sit on the street or neighbourhood their address names (marked
 * "approximate"), which is within about a kilometre, two minutes of driving.
 *
 * A tour whose site its operator has not named stays on its town: Collin's
 * sheet places the ATV and zipline in "Hanover", the horseback rides and the
 * tubing in "Ocho Rios", and the jet ski, parasailing and clear kayak in
 * "Montego Bay" ("Beach in Montego Bay no special beach", Nov 15 2026).
 *
 * Changing a point here changes nothing until lib/drive-times.json is built
 * again (scripts/build-drive-times.mts); tests/unit/drive-times.spec.ts fails
 * while the two disagree.
 */

export interface DrivePoint {
  lat: number
  lng: number
  /** The OpenStreetMap feature the point was read from. */
  source: string
}

export interface TourSite extends DrivePoint {
  /** The catalogue destination this site belongs to: a guard against a stale id. */
  destination: string
  /** Short name for the place, used where a sentence names it. */
  name: string
}

export interface StopVenue extends DrivePoint {
  /** The lib/eats town this venue belongs to: a guard against a renamed stop. */
  town: string
}

/** Tours whose site is known by name, by catalogue id. */
export const TOUR_SITES: Record<number, TourSite> = {
  1: { destination: 'Ocho Rios', name: "Dunn's River Falls", lat: 18.4155, lng: -77.13773, source: "node 290801761, Dunn's River Falls and Park" },
  2: { destination: 'Ocho Rios', name: 'the Blue Hole', lat: 18.36322, lng: -77.0485, source: 'node 7004450649, Island Gully Falls (the Ocho Rios Blue Hole)' },
  3: { destination: 'Falmouth', name: 'the Martha Brae', lat: 18.45187, lng: -77.6474, source: 'node 3045058519, Martha Brae Rafting Village' },
  14: { destination: 'Negril', name: "Rick's Cafe", lat: 18.25422, lng: -78.36345, source: "way 374119758, Rick's Cafe" },
  15: { destination: 'Nine Mile', name: 'Nine Mile', lat: 18.29765, lng: -77.27828, source: 'node 3201267866, Bob Marley Mausoleum' },
}

/** Food stops at their own door, by lib/eats name. */
export const STOP_VENUES: Record<string, StopVenue> = {
  'Scotchies': { town: 'Montego Bay', lat: 18.52131, lng: -77.86277, source: 'way 412188958, Scotchies' },
  'The Pork Pit': { town: 'Montego Bay', lat: 18.47975, lng: -77.92832, source: 'way 371444455, The Pork Pit' },
  "Miss T's Kitchen": { town: 'Ocho Rios', lat: 18.41113, lng: -77.10228, source: "way 855922908, Miss T's Kitchen" },
  'Ultimate Jerk Centre': { town: 'Discovery Bay', lat: 18.46161, lng: -77.37423, source: 'node 11336807783, Ultimate Jerk Centre' },
  'Pushcart Jerk Center & Rum Bar': { town: 'Negril', lat: 18.26556, lng: -78.36676, source: 'way 374119307, Rockhouse Restaurant & Bar (Pushcart is at Rockhouse)' },
  '3 Dives Jerk Centre': { town: 'Negril', lat: 18.26919, lng: -78.36805, source: 'way 541452342, 3-Dives Jerk Center' },
  "Pepper's Jerk Center": { town: 'Falmouth', lat: 18.49248, lng: -77.65423, source: "node 10276832009, Pepper's Jerk Center" },
  'Glistening Waters Restaurant & Marina': { town: 'Falmouth (Rock)', lat: 18.48298, lng: -77.62837, source: 'node 7045277565, Glistening Waters Restaurant' },
  'Far Out Fish Hut': { town: 'Greenwood, near Rose Hall', lat: 18.50831, lng: -77.74791, source: 'way 371371872, Greenwood (approximate: the hut is not in OpenStreetMap)' },
  'The Houseboat Grill': { town: 'Montego Bay (Freeport)', lat: 18.45809, lng: -77.93213, source: 'node 3764455888, Montego Freeport (approximate: the grill is not in OpenStreetMap)' },
  'The Pelican Grill': { town: 'Montego Bay (Hip Strip)', lat: 18.48605, lng: -77.92909, source: 'node 7080206523, Hip Strip (Gloucester Ave) (approximate: the grill is not in OpenStreetMap)' },
  'Stush in the Bush': { town: "Free Hill, near St. Ann's Bay", lat: 18.41011, lng: -77.26143, source: 'way 1010231018, Stush In The Bush' },
  'Sharkies Seafood Restaurant': { town: 'Salem, Runaway Bay', lat: 18.46843, lng: -77.29941, source: 'way 371253893, Sharkies Seafood' },
  'Ocho Rios Village Jerk Centre': { town: 'Ocho Rios', lat: 18.40449, lng: -77.10586, source: 'way 841997442, Ocho Rios Jerk Center (DaCosta Drive)' },
  "PG's Toscanini": { town: 'Ocho Rios', lat: 18.42217, lng: -77.04586, source: "node 4839294708, Toscanini's (Harmony Hall, Tower Isle)" },
  'Sweet Spice Restaurant': { town: 'Negril', lat: 18.27011, lng: -78.34285, source: 'node 6459664043, Whitehall (approximate: on Whitehall Road, not in OpenStreetMap)' },
  'Just Natural': { town: 'Negril (West End)', lat: 18.24526, lng: -78.34919, source: 'way 688922528, Hylton Avenue (approximate: not in OpenStreetMap)' },
  "Miss Lily's at Skylark": { town: 'Negril (Seven Mile Beach)', lat: 18.30784, lng: -78.33796, source: 'way 374015963, Skylark Negril Beach Resort' },
  'Bourbon Beach': { town: 'Negril (Seven Mile Beach)', lat: 18.28817, lng: -78.34132, source: 'node 4962602431, Bourbon Beach Club Restaurant' },
}

/** The table key for a town or hotel in lib/transportation LOCATIONS. */
export const placeKey = (location: string) => `place:${location}`
/** The table key for a tour's own site. */
export const siteKey = (id: number) => `site:${id}`
/** The table key for a food stop's own door. */
export const venueKey = (name: string) => `stop:${name}`
