// Featured images for auto-generated blog posts.
// Sources: Pexels (free, no attribution required — Jamaica & tropical/Caribbean
// stock), Unsplash, and public Jamaica tourism photo URLs already used by the
// Experiences pages. Each slug maps to its own post image; some images repeat
// at most 2–3 times across the 50 posts.

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1600&h=1000&fit=crop`

// Pexels — confirmed Jamaica scenes
const P_BUFF_BAY = px(14788935)      // aerial Buff Bay coastal road
const P_NEGRIL_CLIFFS = px(19565413)  // Rockhouse Hotel cliffs, Negril
const P_BLUE_MTNS = px(9158428)       // Blue Mountains in cloud
const P_KINGSTON = px(36977962)       // Kingston
const P_PORTLAND_RAFT = px(11820457)  // bamboo rafting, Portland
const P_OCHO_RIOS_PIER = px(16403241) // aerial pier, Ocho Rios
const P_TREASURE_BCH = px(11820459)   // colorful boats, Treasure Beach
const P_FALMOUTH_FLAG = px(16147280)  // Jamaican flag on red boat
const P_MOBAY_AERIAL = px(30680796)   // aerial, Montego Bay
const P_SNORKEL = px(5005121)         // tropical beach with palms, snorkeling
const P_BLUE_HOLE = px(10907379)      // Blue Hole turquoise river
const P_STANN_PALMS = px(30649781)    // palm trees, St. Ann, Jamaica
const P_SEVEN_MILE = px(30793026)     // Seven Mile Beach, Negril

// Pexels — generic tropical / Caribbean stand-ins
const G_BEACH_PALMS = px(17065699)    // tropical beach with palm trees
const G_PALM_SHORE = px(3894868)      // palm trees on beach shore
const G_SINGLE_PALM = px(26551139)    // view of a palm tree on the beach
const G_RUM_SAND = px(24743191)       // rum bottle on beach sand
const G_DIVING = px(5008884)          // woman diving near coral reef
const G_RESORT_AERIAL = px(33191057)  // tropical resort, aerial, pools
const G_POOL_PALMS = px(14024023)     // swimming pool on tropical resort
const G_POOL_PEOPLE = px(261429)      // people around pool
const G_POOL_TROPICAL = px(16638260)  // swimming at tropical resort
const G_DREADLOCKS = px(2276166)      // dreadlocks portrait

// Unsplash + project-owned URLs already used on experience pages
const U_JERK = 'https://images.unsplash.com/photo-1592415162645-c055a337b613?w=1600&h=1000&fit=crop&q=80'
const U_BEACH_SUNSET = 'https://images.unsplash.com/photo-1451411787567-040a8a56a4a1?w=1600&h=1000&fit=crop&q=80'
const E_RICKS_CAFE = 'https://www.rickscafejamaica.com/images/rickspics/r2/rick4.jpg'
const E_DUNNS = 'https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/0b/23/23/7a.jpg'
const E_MARLEY_HERITAGE = 'https://media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/06/88/cb/b9.jpg'
const E_LUMINOUS = 'https://mobayvacations.com/wp-content/uploads/2024/06/luminous-lagoon-falmouth.jpg'
const E_MYSTIC = 'https://media.tacdn.com/media/attractions-splice-spp-674x446/07/9a/88/aa.jpg'
const E_RASTA_VILLAGE = 'https://media-cdn.tripadvisor.com/media/attractions-splice-spp-720x480/07/84/a6/8e.jpg'
const E_PATTY = 'https://jamdownfoodie.com/wp-content/uploads/2022/07/IMG_2003-768x1024.jpg'
const E_SCOTCHIES = 'https://paradiseinjatours.com/wp-content/uploads/2024/05/Scotchies-Jerk-Center-1-1.jpg'
const E_MARKET = 'https://oaccessjamaica.com/wp-content/uploads/2015/07/nesta-michael-asafa-coronation-market.jpg'

export const BLOG_IMAGES: Record<string, string> = {
  // Batch 1 — tours & excursions
  'dunns-river-falls-tour-guide': E_DUNNS,
  'jamaica-excursions-worth-booking': P_BUFF_BAY,
  'montego-bay-tours-ranked': P_MOBAY_AERIAL,
  'ocho-rios-airport-transfer': P_OCHO_RIOS_PIER,
  'cannabis-wellness-retreat-jamaica': P_BLUE_MTNS,
  'kingston-gastronomy-tour': E_MARKET,
  'westmoreland-eco-cottage-guide': G_PALM_SHORE,
  'jamaica-cannabis-culinary-tour': U_JERK,
  'cbd-spa-jamaica': G_POOL_PALMS,
  'ganja-farm-tour-ocho-rios': E_RASTA_VILLAGE,

  // Batch 2 — location-specific
  'ocho-rios-complete-guide': E_MYSTIC,
  'hotels-in-ocho-rios': G_RESORT_AERIAL,
  'villas-in-ocho-rios': G_BEACH_PALMS,
  'montego-bay-beyond-the-strip': G_SINGLE_PALM,
  'montego-bay-airport-guide': P_STANN_PALMS,
  'negril-seven-mile-truth': P_NEGRIL_CLIFFS,
  'negril-beach-walkthrough': P_SEVEN_MILE,
  'breathless-montego-bay-review': G_POOL_PEOPLE,
  'secrets-wild-orchid-montego-bay-review': G_POOL_TROPICAL,
  'jewel-grande-montego-bay-review': U_BEACH_SUNSET,

  // Batch 3 — accommodation
  'jamaica-all-inclusive-tier-list': P_SNORKEL,
  'sandals-jamaica-property-guide': E_RICKS_CAFE,
  'sandals-montego-bay-review': P_MOBAY_AERIAL,
  'sandals-negril-review': P_NEGRIL_CLIFFS,
  'sandals-ochi-review': P_OCHO_RIOS_PIER,
  'moon-palace-jamaica-review': P_TREASURE_BCH,
  'bahia-principe-grand-jamaica-review': P_FALMOUTH_FLAG,
  'riu-montego-bay-review': G_POOL_PALMS,
  'riu-ocho-rios-review': P_BLUE_HOLE,
  'riu-negril-review': P_SEVEN_MILE,

  // Batch 4 — remaining accommodation + general
  'royalton-negril-review': G_PALM_SHORE,
  'azul-beach-resort-negril-review': G_SINGLE_PALM,
  'beaches-ocho-rios-review': G_POOL_TROPICAL,
  'jamaica-primer-2026': P_STANN_PALMS,
  'montego-bay-fast-start': E_SCOTCHIES,
  'kingston-why-stay-longer': P_KINGSTON,
  'trelawny-parish-guide': P_FALMOUTH_FLAG,
  'portland-parish-guide': P_PORTLAND_RAFT,
  'best-time-to-visit-jamaica': G_BEACH_PALMS,
  'jamaica-currency-and-money': E_MARKET,

  // Batch 5 — Jamaica topical
  'blue-mountain-coffee-story': P_BLUE_MTNS,
  'jamaican-jerk-explained': E_PATTY,
  'reach-falls-vs-dunns-river': P_PORTLAND_RAFT,
  'appleton-estate-rum-tour': G_RUM_SAND,
  'bob-marley-museum-guide': G_DREADLOCKS,
  'nine-mile-marley-pilgrimage': E_MARLEY_HERITAGE,
  'scuba-diving-in-jamaica': G_DIVING,
  'getting-around-jamaica-guide': P_BUFF_BAY,
  'jamaica-on-a-budget': P_TREASURE_BCH,
  'jamaica-honeymoon-guide': E_LUMINOUS,
}
