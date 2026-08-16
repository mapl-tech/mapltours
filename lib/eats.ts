import type { FoodStop } from './cart'

export interface Eat extends FoodStop {
  description: string
}

/**
 * Where to eat along Collins's routes. Every entry is a real, currently
 * operating restaurant verified against active listings and 2025-2026
 * reviews (researched 2026-08); nothing here is bookable through MAPL, so
 * cards carry no prices or ratings, just the honest recommendation and a
 * directions link. Images are dish photography, not venue photos.
 */
export const EATS: Eat[] = [
  {
    name: 'Scotchies',
    town: 'Montego Bay', parish: 'St. James',
    description: 'The jerk everybody argues is the best on the island, smoked slow over pimento wood under thatch huts.',
    knownFor: 'Pimento-smoked jerk chicken',
    image: '/media/img/8444098.jpg',
    mapsQuery: 'Scotchies Montego Bay Jamaica',
  },
  {
    name: 'The Pork Pit',
    town: 'Montego Bay', parish: 'St. James',
    description: 'A no-frills open-air yard right on the Hip Strip where the ribs fall off the bone and the smoke hut never takes a day off.',
    knownFor: 'Jerk pork and ribs',
    image: '/media/img/9903379.jpg',
    mapsQuery: 'The Pork Pit Montego Bay Jamaica',
  },
  {
    name: "Miss T's Kitchen",
    town: 'Ocho Rios', parish: 'St. Ann',
    description: "Anna-Kay's garden spot in the heart of Ochi, serving oxtail and curry goat that taste like Sunday dinner at your auntie's yard.",
    knownFor: 'Oxtail and curry goat',
    image: '/media/img/27556969.jpg',
    mapsQuery: "Miss T's Kitchen Ocho Rios Jamaica",
  },
  {
    name: 'Ultimate Jerk Centre',
    town: 'Discovery Bay', parish: 'St. Ann',
    description: 'The famous north-coast road stop across from Green Grotto Caves, where drivers plan the whole day around a box of jerk pork.',
    knownFor: 'Jerk pork and chicken',
    image: '/media/img/27556962.jpg',
    mapsQuery: 'Ultimate Jerk Centre Discovery Bay Jamaica',
  },
  {
    name: 'Pushcart Jerk Center & Rum Bar',
    town: 'Negril', parish: 'Westmoreland',
    description: 'Cliffside jerk, rum punch, and live music at Rockhouse, with a front-row seat to the Negril sunset.',
    knownFor: 'Jerk chicken, rum punch',
    image: '/media/img/33398985.jpg',
    mapsQuery: 'Pushcart Rockhouse Negril Jamaica',
  },
  {
    name: '3 Dives Jerk Centre',
    town: 'Negril', parish: 'Westmoreland',
    description: 'Home of the Negril Jerk Festival, where every order cooks fresh on the West End cliffs, so grab a Red Stripe and let the sunset entertain you.',
    knownFor: 'Jerk chicken and lobster',
    image: '/media/img/36857725.jpg',
    mapsQuery: '3 Dives Jerk Centre Negril Jamaica',
  },
  {
    name: 'Pepper\'s Jerk Center',
    town: 'Falmouth', parish: 'Trelawny',
    description: 'Falmouth\'s go-to jerk yard, where Clint \'Top Man\' Rennie smokes chicken and pork a short stroll from Water Square and the cruise pier.',
    knownFor: 'Smoky jerk chicken and pork near the cruise pier',
    image: '/media/img/9646859.jpg',
    mapsQuery: 'Pepper\'s Jerk Center, Falmouth, Jamaica',
  },
  {
    name: 'Glistening Waters Restaurant & Marina',
    town: 'Falmouth (Rock)', parish: 'Trelawny',
    description: 'Lobster and rum punch on the marina deck, then a boat ride out into the glowing Luminous Lagoon after dark.',
    knownFor: 'Seafood dinner plus the glowing lagoon boat tour',
    image: '/media/img/19533297.jpg',
    mapsQuery: 'Glistening Waters Restaurant, Falmouth, Jamaica',
  },
  {
    name: 'Far Out Fish Hut',
    town: 'Greenwood, near Rose Hall', parish: 'St. James (Trelawny border)',
    description: 'A no-frills beach shack on the Greenwood roadside, frying and steaming the morning\'s catch with bammy and breadfruit since 1984.',
    knownFor: 'Escovitch and steamed fish straight off the boats',
    image: '/media/img/5041491.jpg',
    mapsQuery: 'Far Out Fish Hut, Greenwood, Jamaica',
  },
  {
    name: 'The Houseboat Grill',
    town: 'Montego Bay (Freeport)', parish: 'St. James',
    description: 'Dinner on a real houseboat moored in Bogue Lagoon, with a little ferry pull across the water and fish gliding under the deck lights.',
    knownFor: 'Seafood and steaks on a floating houseboat',
    image: '/media/img/3789045.jpg',
    mapsQuery: 'The Houseboat Grill, Montego Bay, Jamaica',
  },
  {
    name: 'The Pelican Grill',
    town: 'Montego Bay (Hip Strip)', parish: 'St. James',
    description: 'A Gloucester Avenue institution since 1964, where locals settle in for melt-off-the-bone oxtail and proper ackee-and-saltfish breakfasts.',
    knownFor: 'Oxtail, milkshakes, and old-school Jamaican breakfast',
    image: '/media/img/27556981.jpg',
    mapsQuery: 'The Pelican Grill, Gloucester Avenue, Montego Bay, Jamaica',
  },
  {
    name: 'Stush in the Bush',
    town: 'Free Hill, near St. Ann\'s Bay', parish: 'St. Ann',
    description: 'Lisa and Chris Binns turn their organic hillside farm into Jamaica\'s most celebrated plant-based table, farm walk included, by reservation only.',
    knownFor: 'Reservation-only plant-based farm feast',
    image: '/media/img/6978251.jpg',
    mapsQuery: 'Stush in the Bush, Free Hill, St. Ann, Jamaica',
  },
  {
    name: 'Sharkies Seafood Restaurant',
    town: 'Salem, Runaway Bay', parish: 'St. Ann',
    description: 'Toes-in-the-sand seafood in Salem, where the steam fish comes loaded with okra and bammy and a DJ keeps the vibe easy.',
    knownFor: 'Steam fish, okra, and bammy by the sea',
    image: '/media/img/36552913.jpg',
    mapsQuery: 'Sharkies Seafood Restaurant, Salem, Runaway Bay, Jamaica',
  },
  {
    name: 'Ocho Rios Village Jerk Centre',
    town: 'Ocho Rios', parish: 'St. Ann',
    description: 'Open-air jerk on DaCosta Drive that gets loud and lively with locals on weekend nights, with a house jerk sauce worth the trip alone.',
    knownFor: 'Jerk by the pound with fiery house sauce',
    image: '/media/img/8408387.jpg',
    mapsQuery: 'Ocho Rios Jerk Centre, DaCosta Drive, Ocho Rios, Jamaica',
  },
  {
    name: 'PG\'s Toscanini',
    town: 'Ocho Rios', parish: 'St. Ann',
    description: 'Parma-born chef PG has been feeding Ochi handmade pasta and lobster spaghetti for decades, now from his Music Mansion home with sister Lella out front.',
    knownFor: 'Handmade pasta and lobster, Italian-Jamaican style',
    image: '/media/img/12097598.jpg',
    mapsQuery: 'PG\'s Toscanini Restaurant, Ocho Rios, Jamaica',
  },
  {
    name: 'Sweet Spice Restaurant',
    town: 'Negril', parish: 'Westmoreland',
    description: 'A family-run Negril standby on Whitehall Road dishing big plates of brown stew, curry goat, and fresh juices at local prices.',
    knownFor: 'Brown stew, curry goat, and fresh juices',
    image: '/media/img/27568542.jpg',
    mapsQuery: 'Sweet Spice Restaurant, Whitehall Road, Negril, Jamaica',
  },
  {
    name: 'Just Natural',
    town: 'Negril (West End)', parish: 'Westmoreland',
    description: 'Ital and seafood plates served in a lush West End garden near the lighthouse, where hummingbirds join you for breakfast.',
    knownFor: 'Ital and seafood in a garden full of hummingbirds',
    image: '/media/img/4113867.jpg',
    mapsQuery: 'Just Natural, Hylton Avenue, Negril, Jamaica',
  },
  {
    name: 'Miss Lily\'s at Skylark',
    town: 'Negril (Seven Mile Beach)', parish: 'Westmoreland',
    description: 'The NYC-famous island kitchen come home, serving jerk corn and rum cocktails by Chopped champion Andre Fowles with sand between your toes.',
    knownFor: 'Jerk corn, whole fried fish, island cocktails',
    image: '/media/img/33777120.jpg',
    mapsQuery: 'Miss Lily\'s at Skylark, Norman Manley Boulevard, Negril, Jamaica',
  },
  {
    name: 'Bourbon Beach',
    town: 'Negril (Seven Mile Beach)', parish: 'Westmoreland',
    description: 'Late-night jerk chicken off the drum grill while some of Negril\'s best live reggae plays right on the beach.',
    knownFor: 'Drum-grill jerk chicken and nightly live reggae',
    image: '/media/img/27556245.jpg',
    mapsQuery: 'Bourbon Beach, Norman Manley Boulevard, Negril, Jamaica',
  },
]
