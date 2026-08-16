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
]
