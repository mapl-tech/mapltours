/**
 * Places: real restaurants and cultural sites travelers can add to an
 * itinerary but do NOT pay for here.
 *
 * These are deliberately a separate concept from `Experience` (lib/experiences.ts):
 *
 *   Experience — MAPL sells it, it has a price, it goes through checkout.
 *   Place      — a real third-party venue. MAPL routes you there as part of
 *                the day; you settle your own bill on arrival.
 *
 * Keeping them apart is not cosmetic. /api/checkout prices every cart line
 * against the experiences catalogue and REJECTS ids it does not recognise,
 * so a place added to the paid cart would fail checkout outright. Places
 * live in their own store (lib/places-cart.ts) and never reach pricing.
 *
 * ── Two things the owner must settle before launch ──────────────────────
 *
 * 1. IMAGES are licensed stock, not photographs of these venues. Real photos
 *    of a named business cannot be used without either the owner's
 *    permission or a licensed source; `imageIsPlaceholder` marks every one
 *    so none of this is mistaken for the real thing. Options are noted in
 *    the section at the bottom of this file.
 *
 * 2. RATINGS are intentionally absent. Attaching an invented score to a real
 *    third-party business misrepresents someone else's reputation, so the
 *    field stays null until it is wired to a real source. The UI simply
 *    omits the rating chip when it is null.
 *
 * Parish and town are researched but should be confirmed by someone on the
 * ground before launch — a wrong parish on a real business is the kind of
 * error a local visitor spots immediately.
 */

export type PlaceKind = 'food' | 'culture'

/** The parishes MAPL currently routes to from MBJ. */
export type PlaceParish =
  | 'St. James'
  | 'Trelawny'
  | 'St. Ann'
  | 'St. Mary'
  | 'Westmoreland'
  | 'Hanover'

export const PLACE_PARISHES: PlaceParish[] = [
  'St. James', 'Trelawny', 'St. Ann', 'St. Mary', 'Westmoreland', 'Hanover',
]

export interface PlaceRating {
  value: number
  /** Where the score came from, shown to the traveler for provenance. */
  source: string
}

export interface Place {
  id: string
  kind: PlaceKind
  name: string
  /** Town or district, shown with the parish as the real location. */
  town: string
  parish: PlaceParish
  /** One line on why it is worth the stop. */
  blurb: string
  image: string
  /** True while `image` is licensed stock rather than a photo of this venue. */
  imageIsPlaceholder: boolean
  /** Starting point for the traveler's own time choice, in hours. */
  suggestedHours: number
  /**
   * Seeded rating. Left null in the catalogue — the live score comes from
   * Google at render time (see lib/google-places.ts). Never invent this.
   */
  rating: PlaceRating | null
  /**
   * Text query used to resolve this venue against Google Places. Kept
   * human-readable so it can be corrected by hand when a lookup misses;
   * an opaque place id could not be sanity-checked by eye.
   */
  googleQuery: string
}

/* Licensed Jamaica imagery (Pexels / Unsplash), used as clearly-marked
   placeholders. Grouped so swapping in real photography is one edit each. */
const IMG = {
  jerkGrill:   'https://images.pexels.com/photos/2338407/pexels-photo-2338407.jpeg?auto=compress&cs=tinysrgb&w=900&h=600&fit=crop',
  seafood:     'https://images.pexels.com/photos/566345/pexels-photo-566345.jpeg?auto=compress&cs=tinysrgb&w=900&h=600&fit=crop',
  beachDining: 'https://images.pexels.com/photos/1058277/pexels-photo-1058277.jpeg?auto=compress&cs=tinysrgb&w=900&h=600&fit=crop',
  cliffside:   'https://images.pexels.com/photos/19565413/pexels-photo-19565413.jpeg?auto=compress&cs=tinysrgb&w=900&h=600&fit=crop',
  localPlate:  'https://images.pexels.com/photos/5638732/pexels-photo-5638732.jpeg?auto=compress&cs=tinysrgb&w=900&h=600&fit=crop',
  patty:       'https://images.pexels.com/photos/4676406/pexels-photo-4676406.jpeg?auto=compress&cs=tinysrgb&w=900&h=600&fit=crop',
  waterfall:   'https://images.pexels.com/photos/11820457/pexels-photo-11820457.jpeg?auto=compress&cs=tinysrgb&w=900&h=600&fit=crop',
  greatHouse:  'https://images.pexels.com/photos/36977962/pexels-photo-36977962.jpeg?auto=compress&cs=tinysrgb&w=900&h=600&fit=crop',
  caves:       'https://images.pexels.com/photos/9158428/pexels-photo-9158428.jpeg?auto=compress&cs=tinysrgb&w=900&h=600&fit=crop',
  river:       'https://images.pexels.com/photos/11820459/pexels-photo-11820459.jpeg?auto=compress&cs=tinysrgb&w=900&h=600&fit=crop',
  coastTown:   'https://images.pexels.com/photos/16147280/pexels-photo-16147280.jpeg?auto=compress&cs=tinysrgb&w=900&h=600&fit=crop',
  hillside:    'https://images.pexels.com/photos/30680796/pexels-photo-30680796.jpeg?auto=compress&cs=tinysrgb&w=900&h=600&fit=crop',
}

export const PLACES: Place[] = [
  /* ── FOOD ───────────────────────────────────────────────────────────── */
  {
    id: 'scotchies-montego-bay',
    kind: 'food',
    name: "Scotchies",
    town: 'Montego Bay',
    parish: 'St. James',
    blurb: 'Jerk chicken and pork over pimento wood, with festival, breadfruit and roast yam. The benchmark every other jerk stop is judged against.',
    image: IMG.jerkGrill,
    imageIsPlaceholder: true,
    suggestedHours: 1.5,
    rating: null,
    googleQuery: 'Scotchies, Montego Bay, Jamaica',
  },
  {
    id: 'pork-pit-montego-bay',
    kind: 'food',
    name: 'The Pork Pit',
    town: 'Hip Strip, Montego Bay',
    parish: 'St. James',
    blurb: 'Open-air jerk pit on the Hip Strip. Jerk chicken, ribs and grilled shrimp eaten at picnic tables a minute from the sea.',
    image: IMG.localPlate,
    imageIsPlaceholder: true,
    suggestedHours: 1,
    rating: null,
    googleQuery: 'The Pork Pit, Hip Strip, Montego Bay, Jamaica',
  },
  {
    id: 'houseboat-grill-montego-bay',
    kind: 'food',
    name: 'The Houseboat Grill',
    town: 'Bogue Lagoon, Montego Bay',
    parish: 'St. James',
    blurb: 'A converted houseboat moored in the lagoon, reached by a short raft pull. Seafood, sunset, and the water directly under your table.',
    image: IMG.seafood,
    imageIsPlaceholder: true,
    suggestedHours: 2,
    rating: null,
    googleQuery: 'The Houseboat Grill, Bogue Lagoon, Montego Bay, Jamaica',
  },
  {
    id: 'pier-one-montego-bay',
    kind: 'food',
    name: 'Pier 1',
    town: 'Howard Cooke Blvd, Montego Bay',
    parish: 'St. James',
    blurb: 'Waterfront institution on the harbour. Seafood and Jamaican plates by day, one of the busiest spots in the bay after dark.',
    image: IMG.beachDining,
    imageIsPlaceholder: true,
    suggestedHours: 2,
    rating: null,
    googleQuery: 'Pier 1, Howard Cooke Blvd, Montego Bay, Jamaica',
  },
  {
    id: 'time-n-place-falmouth',
    kind: 'food',
    name: "Time 'N Place",
    town: 'Falmouth',
    parish: 'Trelawny',
    blurb: 'Driftwood beach bar on an empty stretch of sand. Fried fish, rum punch, and a hammock you will not want to leave.',
    image: IMG.beachDining,
    imageIsPlaceholder: true,
    suggestedHours: 2,
    rating: null,
    googleQuery: 'Time \'N Place, Falmouth, Jamaica',
  },
  {
    id: 'miss-ts-kitchen-ocho-rios',
    kind: 'food',
    name: "Miss T's Kitchen",
    town: 'Ocho Rios',
    parish: 'St. Ann',
    blurb: 'Jamaican cooking taken seriously, served in a painted garden courtyard. Oxtail, curry goat and rundown done properly.',
    image: IMG.localPlate,
    imageIsPlaceholder: true,
    suggestedHours: 1.5,
    rating: null,
    googleQuery: 'Miss T\'s Kitchen, Ocho Rios, Jamaica',
  },
  {
    id: 'ocho-rios-jerk-centre',
    kind: 'food',
    name: 'Ocho Rios Jerk Centre',
    town: 'Da Costa Drive, Ocho Rios',
    parish: 'St. Ann',
    blurb: 'Long-running open-sided jerk centre in the middle of town. Jerk, steam fish and cold Red Stripe without ceremony.',
    image: IMG.jerkGrill,
    imageIsPlaceholder: true,
    suggestedHours: 1,
    rating: null,
    googleQuery: 'Ocho Rios Jerk Centre, Da Costa Drive, Ocho Rios, Jamaica',
  },
  {
    id: 'ricks-cafe-negril',
    kind: 'food',
    name: "Rick's Café",
    town: 'West End, Negril',
    parish: 'Westmoreland',
    blurb: 'Cliff-top bar famous for the sunset and the divers. Come for the spectacle, stay for a drink at the edge.',
    image: IMG.cliffside,
    imageIsPlaceholder: true,
    suggestedHours: 2,
    rating: null,
    googleQuery: 'Rick\'s Café, West End, Negril, Jamaica',
  },
  {
    id: 'sweet-spice-negril',
    kind: 'food',
    name: 'Sweet Spice',
    town: 'Sheffield Road, Negril',
    parish: 'Westmoreland',
    blurb: 'Family-run and resolutely local. Big plates of brown stew, curry goat and fried chicken at prices the resorts cannot touch.',
    image: IMG.localPlate,
    imageIsPlaceholder: true,
    suggestedHours: 1,
    rating: null,
    googleQuery: 'Sweet Spice, Sheffield Road, Negril, Jamaica',
  },
  {
    id: '3-dives-negril',
    kind: 'food',
    name: '3 Dives Jerk Centre',
    town: 'West End, Negril',
    parish: 'Westmoreland',
    blurb: 'Jerk on the cliffs, cooked over an oil-drum grill. Lobster in season, and one of the better places in Negril to watch the sun go.',
    image: IMG.jerkGrill,
    imageIsPlaceholder: true,
    suggestedHours: 1.5,
    rating: null,
    googleQuery: '3 Dives Jerk Centre, West End, Negril, Jamaica',
  },
  {
    id: 'lucea-market-food',
    kind: 'food',
    name: 'Lucea Market food stalls',
    town: 'Lucea',
    parish: 'Hanover',
    blurb: 'Patties, fried fish and bammy from the stalls around the old market square. A working town market, not a tourist one.',
    image: IMG.patty,
    imageIsPlaceholder: true,
    suggestedHours: 1,
    rating: null,
    googleQuery: 'Lucea Market food stalls, Lucea, Jamaica',
  },
  {
    id: 'port-maria-fish-fry',
    kind: 'food',
    name: 'Port Maria fish fry',
    town: 'Port Maria',
    parish: 'St. Mary',
    blurb: 'Fish straight off the boats on the north-east coast, fried at the roadside. Worth timing the drive around.',
    image: IMG.seafood,
    imageIsPlaceholder: true,
    suggestedHours: 1,
    rating: null,
    googleQuery: 'Port Maria fish fry, Port Maria, Jamaica',
  },

  {
    id: 'marguerites-montego-bay',
    kind: 'food',
    name: 'Marguerites Seafood by the Sea',
    town: 'Gloucester Ave, Montego Bay',
    parish: 'St. James',
    blurb: 'White-tablecloth seafood on a terrace above the water by Doctor\u2019s Cave. Flambé done at the table.',
    image: IMG.seafood,
    imageIsPlaceholder: true,
    suggestedHours: 2,
    rating: null,
    googleQuery: 'Marguerites Seafood by the Sea, Montego Bay, Jamaica',
  },
  {
    id: 'pelican-grill-montego-bay',
    kind: 'food',
    name: 'The Pelican Grill',
    town: 'Gloucester Ave, Montego Bay',
    parish: 'St. James',
    blurb: 'On the Hip Strip since 1967. Jamaican breakfast, patties and steaks, and the booths locals still book.',
    image: IMG.localPlate,
    imageIsPlaceholder: true,
    suggestedHours: 1.5,
    rating: null,
    googleQuery: 'The Pelican Grill, Montego Bay, Jamaica',
  },
  {
    id: 'tracks-and-records-montego-bay',
    kind: 'food',
    name: 'Usain Bolt\u2019s Tracks & Records',
    town: 'Montego Bay',
    parish: 'St. James',
    blurb: 'Sports bar and Jamaican kitchen from the sprinter himself. Loud, late, and good for a group.',
    image: IMG.localPlate,
    imageIsPlaceholder: true,
    suggestedHours: 2,
    rating: null,
    googleQuery: 'Usain Bolt\'s Tracks & Records, Montego Bay, Jamaica',
  },
  {
    id: 'sugar-mill-montego-bay',
    kind: 'food',
    name: 'The Sugar Mill Restaurant',
    town: 'Rose Hall, Montego Bay',
    parish: 'St. James',
    blurb: 'Fine dining beside an old waterwheel on the Half Moon estate. The dress-up dinner of the coast.',
    image: IMG.greatHouse,
    imageIsPlaceholder: true,
    suggestedHours: 2.5,
    rating: null,
    googleQuery: 'The Sugar Mill Restaurant, Rose Hall, Montego Bay, Jamaica',
  },
  {
    id: 'scotchies-too-ocho-rios',
    kind: 'food',
    name: 'Scotchies Too',
    town: 'Drax Hall, Ocho Rios',
    parish: 'St. Ann',
    blurb: 'The St. Ann branch of the jerk institution, on the highway at Drax Hall. Same pimento wood, same queues.',
    image: IMG.jerkGrill,
    imageIsPlaceholder: true,
    suggestedHours: 1.5,
    rating: null,
    googleQuery: 'Scotchies Too, Drax Hall, Ocho Rios, Jamaica',
  },
  {
    id: 'evita-italian-ocho-rios',
    kind: 'food',
    name: 'Evita\u2019s Italian Restaurant',
    town: 'Eden Bower Rd, Ocho Rios',
    parish: 'St. Ann',
    blurb: 'A gingerbread house on the hill above the bay, serving pasta with a Jamaican accent since the eighties.',
    image: IMG.hillside,
    imageIsPlaceholder: true,
    suggestedHours: 2,
    rating: null,
    googleQuery: 'Evita\'s Italian Restaurant, Ocho Rios, Jamaica',
  },
  {
    id: 'rain-forest-seafood-ocho-rios',
    kind: 'food',
    name: 'Rain Forest Seafood',
    town: 'Ocho Rios',
    parish: 'St. Ann',
    blurb: 'Shrimp, lobster and fish cooked fast and well. A local chain that earns its reputation.',
    image: IMG.seafood,
    imageIsPlaceholder: true,
    suggestedHours: 1,
    rating: null,
    googleQuery: 'Rain Forest Seafood, Ocho Rios, Jamaica',
  },
  {
    id: 'faiths-pen-food-stops',
    kind: 'food',
    name: 'Faith\u2019s Pen food stops',
    town: 'Faith\u2019s Pen',
    parish: 'St. Ann',
    blurb: 'A row of numbered roadside cook shops on the old Kingston road. Roast fish, soup and jerk at Jamaican prices.',
    image: IMG.jerkGrill,
    imageIsPlaceholder: true,
    suggestedHours: 1,
    rating: null,
    googleQuery: 'Faith\'s Pen Rest Stop, Saint Ann, Jamaica',
  },
  {
    id: 'ultimate-jerk-centre-runaway-bay',
    kind: 'food',
    name: 'Ultimate Jerk Centre',
    town: 'Discovery Bay',
    parish: 'St. Ann',
    blurb: 'Across from the Green Grotto turn-off. Jerk, curry goat and dominoes on the veranda.',
    image: IMG.jerkGrill,
    imageIsPlaceholder: true,
    suggestedHours: 1,
    rating: null,
    googleQuery: 'Ultimate Jerk Centre, Discovery Bay, Jamaica',
  },
  {
    id: 'glistening-waters-falmouth',
    kind: 'food',
    name: 'Glistening Waters Restaurant',
    town: 'Rock, Falmouth',
    parish: 'Trelawny',
    blurb: 'Seafood on the edge of the luminous lagoon. Eat first, then take the boat out after dark.',
    image: IMG.seafood,
    imageIsPlaceholder: true,
    suggestedHours: 2,
    rating: null,
    googleQuery: 'Glistening Waters Restaurant, Falmouth, Jamaica',
  },
  {
    id: 'pepper-jerk-falmouth',
    kind: 'food',
    name: 'Falmouth jerk stands, Water Square',
    town: 'Falmouth',
    parish: 'Trelawny',
    blurb: 'Pan-fired jerk and festival from the stands around Water Square, busiest on market days.',
    image: IMG.jerkGrill,
    imageIsPlaceholder: true,
    suggestedHours: 0.5,
    rating: null,
    googleQuery: 'Water Square, Falmouth, Jamaica',
  },
  {
    id: 'best-of-jamaica-duncans',
    kind: 'food',
    name: 'Duncans roadside cook shops',
    town: 'Duncans',
    parish: 'Trelawny',
    blurb: 'Where the coast road climbs inland. Steam fish, bammy and soup made for people who work outside.',
    image: IMG.localPlate,
    imageIsPlaceholder: true,
    suggestedHours: 0.5,
    rating: null,
    googleQuery: 'Duncans, Trelawny, Jamaica restaurants',
  },
  {
    id: 'the-cliff-negril',
    kind: 'food',
    name: 'The Cliff at Catcha Falling Star',
    town: 'West End, Negril',
    parish: 'Westmoreland',
    blurb: 'Dinner on the cliff edge with the sun going down behind it. Book the early sitting for the light.',
    image: IMG.cliffside,
    imageIsPlaceholder: true,
    suggestedHours: 2,
    rating: null,
    googleQuery: 'The Cliff, Catcha Falling Star, West End, Negril, Jamaica',
  },
  {
    id: 'pushcart-rockhouse-negril',
    kind: 'food',
    name: 'Pushcart Restaurant & Rum Bar',
    town: 'West End, Negril',
    parish: 'Westmoreland',
    blurb: 'Rockhouse\u2019s street-food kitchen on the cliffs. Jerk, escoveitch and rum, with the sea underneath.',
    image: IMG.cliffside,
    imageIsPlaceholder: true,
    suggestedHours: 2,
    rating: null,
    googleQuery: 'Pushcart Restaurant and Rum Bar, Negril, Jamaica',
  },
  {
    id: 'kool-runnings-negril',
    kind: 'food',
    name: 'Best in the West / Seven Mile beach grills',
    town: 'Norman Manley Blvd, Negril',
    parish: 'Westmoreland',
    blurb: 'The beach shacks along Seven Mile: fried fish, lobster in season, and a table in the sand.',
    image: IMG.beachDining,
    imageIsPlaceholder: true,
    suggestedHours: 1.5,
    rating: null,
    googleQuery: 'Norman Manley Boulevard, Negril, Jamaica restaurants',
  },
  {
    id: 'nirvana-savanna-la-mar',
    kind: 'food',
    name: 'Savanna-la-Mar market cook shops',
    town: 'Savanna-la-Mar',
    parish: 'Westmoreland',
    blurb: 'Parish-capital cooking, no concessions to visitors. Go at lunch when the pots are full.',
    image: IMG.localPlate,
    imageIsPlaceholder: true,
    suggestedHours: 1,
    rating: null,
    googleQuery: 'Savanna-la-Mar, Westmoreland, Jamaica restaurants',
  },
  {
    id: 'grand-palladium-lucea-area',
    kind: 'food',
    name: 'Lucea harbour fish shops',
    town: 'Lucea',
    parish: 'Hanover',
    blurb: 'Fish brought in at the harbour and fried within sight of the boats. Bammy on the side.',
    image: IMG.seafood,
    imageIsPlaceholder: true,
    suggestedHours: 1,
    rating: null,
    googleQuery: 'Lucea, Hanover, Jamaica restaurants',
  },
  {
    id: 'hanover-jerk-sandy-bay',
    kind: 'food',
    name: 'Sandy Bay jerk stops',
    town: 'Sandy Bay',
    parish: 'Hanover',
    blurb: 'On the road between Montego Bay and Lucea. Drum-pan jerk, and a natural break on the drive west.',
    image: IMG.jerkGrill,
    imageIsPlaceholder: true,
    suggestedHours: 0.5,
    rating: null,
    googleQuery: 'Sandy Bay, Hanover, Jamaica jerk',
  },
  {
    id: 'oracabessa-fish-fry',
    kind: 'food',
    name: 'Oracabessa fish fry',
    town: 'Oracabessa',
    parish: 'St. Mary',
    blurb: 'A working fishing beach near Goldeneye. Snapper straight off the line, cooked while you wait.',
    image: IMG.seafood,
    imageIsPlaceholder: true,
    suggestedHours: 1,
    rating: null,
    googleQuery: 'Oracabessa, Saint Mary, Jamaica restaurants',
  },
  {
    id: 'annotto-bay-patties',
    kind: 'food',
    name: 'Annotto Bay bakeries',
    town: 'Annotto Bay',
    parish: 'St. Mary',
    blurb: 'Hard-dough bread, spiced buns and patties from bakeries that have been at it for generations.',
    image: IMG.patty,
    imageIsPlaceholder: true,
    suggestedHours: 0.5,
    rating: null,
    googleQuery: 'Annotto Bay, Saint Mary, Jamaica bakery',
  },

  /* ── CULTURE ────────────────────────────────────────────────────────── */
  {
    id: 'rose-hall-great-house',
    kind: 'culture',
    name: 'Rose Hall Great House',
    town: 'Rose Hall, Montego Bay',
    parish: 'St. James',
    blurb: 'Restored 18th-century plantation house above the coast, and the legend of Annie Palmer that grew around it. Candlelit tours after dark.',
    image: IMG.greatHouse,
    imageIsPlaceholder: true,
    suggestedHours: 2,
    rating: null,
    googleQuery: 'Rose Hall Great House, Rose Hall, Montego Bay, Jamaica',
  },
  {
    id: 'sam-sharpe-square',
    kind: 'culture',
    name: 'Sam Sharpe Square',
    town: 'Montego Bay',
    parish: 'St. James',
    blurb: 'The centre of old Montego Bay, named for the preacher who led the 1831 rebellion. The Cage and the monument stand on the square.',
    image: IMG.coastTown,
    imageIsPlaceholder: true,
    suggestedHours: 1,
    rating: null,
    googleQuery: 'Sam Sharpe Square, Montego Bay, Jamaica',
  },
  {
    id: 'good-hope-estate',
    kind: 'culture',
    name: 'Good Hope Estate',
    town: 'Falmouth',
    parish: 'Trelawny',
    blurb: 'A Georgian estate above the Martha Brae valley, with the great house, aqueduct and works still standing across the grounds.',
    image: IMG.greatHouse,
    imageIsPlaceholder: true,
    suggestedHours: 3,
    rating: null,
    googleQuery: 'Good Hope Estate, Falmouth, Jamaica',
  },
  {
    id: 'martha-brae-rafting',
    kind: 'culture',
    name: 'Rafting on the Martha Brae',
    town: 'Martha Brae',
    parish: 'Trelawny',
    blurb: 'An hour poled down a green river on a bamboo raft built for two. Quiet, slow, and the guide does the work.',
    image: IMG.river,
    imageIsPlaceholder: true,
    suggestedHours: 2,
    rating: null,
    googleQuery: 'Rafting on the Martha Brae, Martha Brae, Jamaica',
  },
  {
    id: 'falmouth-historic-district',
    kind: 'culture',
    name: 'Falmouth historic district',
    town: 'Falmouth',
    parish: 'Trelawny',
    blurb: 'One of the Caribbean’s best-preserved Georgian townscapes. Water Square, the courthouse and the old merchant streets on foot.',
    image: IMG.coastTown,
    imageIsPlaceholder: true,
    suggestedHours: 2,
    rating: null,
    googleQuery: 'Falmouth historic district, Falmouth, Jamaica',
  },
  {
    id: 'dunns-river-falls',
    kind: 'culture',
    name: "Dunn's River Falls",
    town: 'Ocho Rios',
    parish: 'St. Ann',
    blurb: 'Six hundred feet of limestone terraces climbed hand-in-hand straight out of the sea. The most famous climb on the island.',
    image: IMG.waterfall,
    imageIsPlaceholder: true,
    suggestedHours: 3,
    rating: null,
    googleQuery: 'Dunn\'s River Falls, Ocho Rios, Jamaica',
  },
  {
    id: 'green-grotto-caves',
    kind: 'culture',
    name: 'Green Grotto Caves',
    town: 'Discovery Bay',
    parish: 'St. Ann',
    blurb: 'Limestone caverns used in turn by the Taino, by runaways, and by smugglers. Guided underground to the lake at the bottom.',
    image: IMG.caves,
    imageIsPlaceholder: true,
    suggestedHours: 2,
    rating: null,
    googleQuery: 'Green Grotto Caves, Discovery Bay, Jamaica',
  },
  {
    id: 'nine-mile-bob-marley',
    kind: 'culture',
    name: 'Nine Mile',
    town: 'Nine Mile',
    parish: 'St. Ann',
    blurb: 'Bob Marley’s birthplace up in the hills, where he was also laid to rest. The simplest and most affecting of the Marley sites.',
    image: IMG.hillside,
    imageIsPlaceholder: true,
    suggestedHours: 3,
    rating: null,
    googleQuery: 'Nine Mile, Nine Mile, Jamaica',
  },
  {
    id: 'firefly-port-maria',
    kind: 'culture',
    name: 'Firefly',
    town: 'Port Maria',
    parish: 'St. Mary',
    blurb: 'Noël Coward’s hilltop house, left much as he kept it, with one of the widest views on the north coast from the lawn.',
    image: IMG.hillside,
    imageIsPlaceholder: true,
    suggestedHours: 2,
    rating: null,
    googleQuery: 'Firefly, Port Maria, Jamaica',
  },
  {
    id: 'mayfield-falls',
    kind: 'culture',
    name: 'Mayfield Falls',
    town: 'Glenbrook',
    parish: 'Westmoreland',
    blurb: 'Twenty-one small cascades walked upriver through the bush, with pools deep enough to swim between them.',
    image: IMG.waterfall,
    imageIsPlaceholder: true,
    suggestedHours: 3,
    rating: null,
    googleQuery: 'Mayfield Falls, Glenbrook, Jamaica',
  },
  {
    id: 'negril-lighthouse',
    kind: 'culture',
    name: 'Negril Lighthouse',
    town: 'West End, Negril',
    parish: 'Westmoreland',
    blurb: 'The westernmost point of the island, still working after a century. Climb it late for the best sunset on the coast.',
    image: IMG.cliffside,
    imageIsPlaceholder: true,
    suggestedHours: 1,
    rating: null,
    googleQuery: 'Negril Lighthouse, West End, Negril, Jamaica',
  },
  {
    id: 'fort-charlotte-lucea',
    kind: 'culture',
    name: 'Fort Charlotte & Lucea Courthouse',
    town: 'Lucea',
    parish: 'Hanover',
    blurb: 'An 18th-century harbour fort and the clock-towered courthouse above it, in a port town most visitors drive straight past.',
    image: IMG.coastTown,
    imageIsPlaceholder: true,
    suggestedHours: 1.5,
    rating: null,
    googleQuery: 'Fort Charlotte & Lucea Courthouse, Lucea, Jamaica',
  },
]

export const FOOD_PLACES = PLACES.filter((p) => p.kind === 'food')
export const CULTURE_PLACES = PLACES.filter((p) => p.kind === 'culture')

export function getPlace(id: string): Place | undefined {
  return PLACES.find((p) => p.id === id)
}

/** "Ocho Rios · St. Ann" — the real location, as displayed on the card. */
export function placeLocation(p: Place): string {
  return `${p.town} · ${p.parish}`
}

/** Choices offered when a traveler says how long they want somewhere. */
export const HOUR_CHOICES = [0.5, 1, 1.5, 2, 3, 4] as const

export function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`
  if (Number.isInteger(h)) return `${h} hr`
  return `${h} hrs`
}

/* ── Getting real photos and ratings in ───────────────────────────────────
 *
 * Google Places API returns both, licensed for display, keyed by place id:
 * a Place Details call gives `rating`, `user_ratings_total` and photo
 * references, and Google's terms allow showing them with attribution. That
 * is the only route that supplies both without contacting each venue.
 *
 * Otherwise: photograph the venues, or get written permission from each.
 * Populate `image` + set `imageIsPlaceholder: false`, and fill `rating`
 * with { value, source } so the card can show where the score came from.
 */
