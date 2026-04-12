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
  1: 'https://www.rickscafejamaica.com/images/rickspics/r2/rick4.jpg', // Rick's Cafe Negril
  2: P(9158428),    // Blue Mountains — mountains shrouded in clouds and sunlight, Jamaica
  3: 'https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/154C0/production/_87623278_3.wassifasoundcrew,handsworthleisurecentre,birmingham,circa1983,courtesywassifaphotography.jpg', // Reggae Roots sound system
  4: 'https://images.unsplash.com/photo-1592415162645-c055a337b613?w=800&h=600&fit=crop&q=80', // Jerk Pit Master Devon — jerk chicken grill
  5: 'https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/0b/23/23/7a.jpg', // Dunn's River Falls
  6: 'https://media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/06/88/cb/b9.jpg', // Bob Marley Heritage Nine Mile
  7: P(11820459),   // Treasure Beach — colorful wooden boats, tropical Jamaica coast
  8: P(11820457),   // Bamboo Rafting — rafting on crystal-clear waters, Jamaica
  9: P(5005121),    // Snorkeling — tropical beach with palm trees and sailboats, Jamaica
  10: 'https://oaccessjamaica.com/wp-content/uploads/2015/07/nesta-michael-asafa-coronation-market.jpg', // Coronation Market Kingston
  11: P(10907379),  // Blue Hole — turquoise river through vibrant forest, Jamaica
  12: P(11479687),  // Luminous Lagoon — sunset over Caribbean Sea, Negril Jamaica
  13: P(16181426),  // Mystic Mountain — aerial tropical beach resort, Ocho Rios
  14: 'https://media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/07/84/a6/8e.jpg', // Rastafari Indigenous Village
  15: P(10907379),  // Reach Falls — turquoise river through forest with boulders
  16: 'https://jamdownfoodie.com/wp-content/uploads/2022/07/IMG_2003-768x1024.jpg', // Devon House Patty & Ice Cream
  17: 'https://img.rezdy.com/PRODUCT_IMAGE/19048/rameshnewellstudio_19_lg.jpg', // Gloria's Seafood Port Royal
  18: 'https://paradiseinjatours.com/wp-content/uploads/2024/05/Scotchies-Jerk-Center-1-1.jpg', // Scotchies Jerk Centre
  19: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/32/9e/86/cc/caption.jpg?w=1100&h=1100&s=1', // Miss T's Kitchen Ocho Rios
}
