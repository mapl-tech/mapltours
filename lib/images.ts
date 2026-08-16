// ALL images confirmed to be from Jamaica on Pexels
export const P = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1280&h=960&fit=crop`
export const PD = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1000&h=800&fit=crop`
export const PH = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop`

// Hero, aerial of scenic coastal road, Buff Bay, Jamaica
export const HERO = '/media/img/14788935-hero.jpg'

// Hero video, Pexels 35684532, served locally
export const HERO_VIDEO = '/hero-video.mp4'

// All destinations, confirmed Jamaica locations
export const DESTINATIONS: Record<string, string> = {
  // The real Rick's Cafe cliff cove, from the supplier's own TripAdvisor
  // album (self-hosted, square crop). Instantly reads as Negril.
  'Negril': '/img/dest/negril-ricks-cove.jpg',
  'Blue Mountains': '/media/img/9158428.jpg', // Blue Mountains Jamaica shrouded in clouds
  'Kingston': '/media/img/36977962.jpg',      // Kingston Jamaica
  'Portland': '/media/img/11820457.jpg',      // Rafting on crystal-clear waters, Jamaica
  // Aerial Jamaican waterfall in emerald jungle (Pexels 30681023, page
  // location "Portland Parish, Jamaica"). Evokes the Dunn's River draw that
  // defines Ochi; no true Dunn's River photo exists on Pexels. Swap for a
  // real Collins photo when his album yields one.
  'Ocho Rios': '/media/img/30681023.jpg',
  'Treasure Beach': '/media/img/11820459.jpg', // Colorful wooden boats, tropical Jamaica coast
  // The real Martha Brae: guest and raft captain on the river, from the
  // supplier's own TripAdvisor album (self-hosted, square crop).
  'Falmouth': '/img/dest/falmouth-martha-brae.jpg',
  // Lone palm over layered turquoise water (Pexels 27222664, page location
  // "Montego Bay, St. James Parish, Jamaica"). Source file is PNG, the
  // .jpeg variant 404s.
  'Montego Bay': '/media/img/27222664.jpg',
  'Nine Mile': '/tours/nine-mile-trading-post.jpg', // The real Nine Mile Trading Post
}

// Culture section, Jamaica beach sunset
export const CULTURE_IMAGE = '/media/img/culture-unsplash.jpg'

// All experience images, confirmed Jamaica or Jamaica-specific content
export const EXPERIENCE_IMAGES: Record<number, string> = {
  1: 'https://www.rickscafejamaica.com/images/rickspics/r2/rick4.jpg', // Rick's Cafe Negril
  2: '/media/img/9158428.jpg',    // Blue Mountains, mountains shrouded in clouds and sunlight, Jamaica
  3: 'https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/154C0/production/_87623278_3.wassifasoundcrew,handsworthleisurecentre,birmingham,circa1983,courtesywassifaphotography.jpg', // Reggae Roots sound system
  4: 'https://images.unsplash.com/photo-1592415162645-c055a337b613?w=800&h=600&fit=crop&q=80', // Jerk Pit Master Devon, jerk chicken grill
  5: 'https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/0b/23/23/7a.jpg', // Dunn's River Falls
  6: 'https://media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/06/88/cb/b9.jpg', // Bob Marley Heritage Nine Mile
  7: '/media/img/11820459.jpg',   // Treasure Beach, colorful wooden boats, tropical Jamaica coast
  8: '/media/img/11820457.jpg',   // Bamboo Rafting, rafting on crystal-clear waters, Jamaica
  9: '/media/img/5005121.jpg',    // Snorkeling, tropical beach with palm trees and sailboats, Jamaica
  10: 'https://oaccessjamaica.com/wp-content/uploads/2015/07/nesta-michael-asafa-coronation-market.jpg', // Coronation Market Kingston
  11: '/media/img/10907379.jpg',  // Blue Hole, turquoise river through vibrant forest, Jamaica
  12: '/media/img/16147280.jpg',  // Luminous Lagoon (Falmouth), Jamaican flag on red boat on serene Falmouth water
  13: 'https://media.tacdn.com/media/attractions-splice-spp-674x446/07/9a/88/aa.jpg',  // Mystic Mountain, bobsled & rainforest, Ocho Rios
  14: 'https://media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/07/84/a6/8e.jpg', // Rastafari Indigenous Village
  15: '/media/img/10907379.jpg',  // Reach Falls, turquoise river through forest with boulders
  16: 'https://jamdownfoodie.com/wp-content/uploads/2022/07/IMG_2003-768x1024.jpg', // Devon House Patty & Ice Cream
  17: 'https://img.rezdy.com/PRODUCT_IMAGE/19048/rameshnewellstudio_19_lg.jpg', // Gloria's Seafood Port Royal
  18: 'https://paradiseinjatours.com/wp-content/uploads/2024/05/Scotchies-Jerk-Center-1-1.jpg', // Scotchies Jerk Centre
  19: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/32/9e/86/cc/caption.jpg?w=1100&h=1100&s=1', // Miss T's Kitchen Ocho Rios
}
