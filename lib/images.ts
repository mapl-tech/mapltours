// ALL images confirmed to be from Jamaica on Pexels
const P = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1280&h=960&fit=crop`
const PD = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1000&h=800&fit=crop`
const PH = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop`

// Hero — aerial of scenic coastal road, Buff Bay, Jamaica
export const HERO = PH(14788935)

// Hero video — Pexels 35684532, served locally
export const HERO_VIDEO = '/hero-video.mp4'

// All destinations — confirmed Jamaica locations
export const DESTINATIONS: Record<string, string> = {
  'Negril': PD(19565413),       // Aerial Rockhouse Hotel cliffs, Negril Jamaica
  'Blue Mountains': PD(9158428), // Blue Mountains Jamaica shrouded in clouds
  'Kingston': PD(36977962),      // Kingston Jamaica
  'Portland': PD(11820457),      // Rafting on crystal-clear waters, Jamaica
  'Ocho Rios': PD(16403241),     // Aerial wooden pier, turquoise waters, Ocho Rios
  'Treasure Beach': PD(11820459), // Colorful wooden boats, tropical Jamaica coast
  'Falmouth': PD(16147280),      // Jamaican flag on red boat, serene lake
  'Montego Bay': PD(30680796),   // Aerial verdant mountains, Montego Bay
}

// Culture section — Jamaica beach sunset
export const CULTURE_IMAGE = 'https://images.unsplash.com/photo-1451411787567-040a8a56a4a1?w=800&h=600&fit=crop&q=80'

// All experience images — confirmed Jamaica or Jamaica-specific content
export const EXPERIENCE_IMAGES: Record<number, string> = {
  1: P(1869329),    // Rick's Cafe — man on cliff edge diving into ocean, Negril Jamaica
  2: P(9158428),    // Blue Mountains — mountains shrouded in clouds and sunlight, Jamaica
  3: P(13288502),   // Kingston Reggae — Rastafarian man, Seaforth, Jamaica
  4: 'https://images.unsplash.com/photo-1592415162645-c055a337b613?w=800&h=600&fit=crop&q=80', // Jerk Pit Master Devon — jerk chicken grill
  5: 'https://images.unsplash.com/photo-1594242505542-bca88a4076fc?w=800&h=600&fit=crop&q=80', // Dunn's River Falls — people swimming at waterfall
  6: P(14086456),   // Bob Marley — Rastafarian elder with colorful tam, Lucea Jamaica
  7: P(11820459),   // Treasure Beach — colorful wooden boats, tropical Jamaica coast
  8: P(11820457),   // Bamboo Rafting — rafting on crystal-clear waters, Jamaica
  9: P(5005121),    // Snorkeling — tropical beach with palm trees and sailboats, Jamaica
  10: 'https://www.restaurantsjamaican.com/wp-content/uploads/2019/08/KFC-Jam-002B-2.jpg', // Kingston street food
  11: P(10907379),  // Blue Hole — turquoise river through vibrant forest, Jamaica
  12: P(11479687),  // Luminous Lagoon — sunset over Caribbean Sea, Negril Jamaica
  13: P(16181426),  // Mystic Mountain — aerial tropical beach resort, Ocho Rios
  14: P(14086456),  // Rastafari Village — Rastafarian elder, Lucea Jamaica
  15: P(10907379),  // Reach Falls — turquoise river through forest with boulders
  16: P(27556962),  // Jamaican Patties — homemade golden patties
  17: P(36857725),  // Escovitch Fish — escovitch fish with rice and peas
  18: P(30746554),  // Oxtail — Caribbean oxtail with rice and peas
  19: P(27568542),  // Curry Goat — Caribbean stew with potatoes
}
