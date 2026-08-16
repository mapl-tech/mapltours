import { HERO, DESTINATIONS } from './images'

export type ExperienceCategory = 'Adventure' | 'Nature' | 'Music' | 'Food' | 'Culture' | 'Water'

export interface Comment {
  id: number
  user: string
  avatar: string
  text: string
  time: string
  likes: number
}

/**
 * How the operator charges for a tour. Two shapes cover the whole rate sheet:
 *
 *  group      a flat rate covering a party of 1..tierMax (a private tour: one
 *             person or three pay the same), then `extraPerPerson` x party
 *             size once the party is larger.
 *  per_person `baseRate` per head up to tierMax, then the discounted
 *             `extraPerPerson` per head for larger parties.
 *
 * These are the OPERATOR's costs. What the customer pays is derived from them
 * by tourPrice(), which adds MAPL's margin and covers card processing.
 */
export interface TourPricing {
  mode: 'group' | 'per_person'
  /** Operator cost for a party of 1..tierMax (flat for group, per head otherwise). */
  baseRate: number
  tierMax: number
  /** Operator cost PER PERSON once the party exceeds tierMax. */
  extraPerPerson: number
}

/** MAPL's margin on tours. */
export const TOUR_MARGIN = 0.15
/** Cover for paying the operator via Remitly from Canada: CAD 3.99 flat per
 *  send plus a ~2.1% FX spread, measured live 2026-08-15. Matches
 *  REMITLY_COVER in lib/airport-transfers. */
export const TOUR_REMITLY_COVER = 0.05
/** Card processing, matching lib/airport-transfers (verified against live charges). */
const CARD_RATE = 0.057
const CARD_FIXED = 0.22

/** What MAPL owes the operator for a party of this size. */
export function tourOperatorCost(p: TourPricing, travelers: number): number {
  const n = Math.max(1, Math.round(travelers))
  if (n <= p.tierMax) {
    return p.mode === 'group' ? p.baseRate : p.baseRate * n
  }
  return p.extraPerPerson * n
}

/**
 * All-in price the customer pays for a party of this size: operator cost plus
 * MAPL's margin, grossed up so card processing does not eat it. Rounded UP so
 * a booking can never come in under cost.
 */
export function tourPrice(p: TourPricing, travelers: number): number {
  const cost = tourOperatorCost(p, travelers)
  return Math.ceil((cost * (1 + TOUR_MARGIN + TOUR_REMITLY_COVER) + CARD_FIXED) / (1 - CARD_RATE))
}

/**
 * How to label a tour's headline price. A group tour covers the whole party
 * up to tierMax, so labelling it "/person" would overstate what a couple pays
 * and understate what a group of six pays.
 */
export function priceUnitLabel(p: TourPricing): string {
  return p.mode === 'group' ? `up to ${p.tierMax} people` : 'per person'
}

/**
 * The caption under a line total, e.g. "3 × $85.00" or "Private tour, up to
 * 3 people". It must always reconcile with tourPrice(p, travelers): the
 * checkout previously printed `catalogPrice × travelers`, which for a group
 * tour claimed 5 × $351 next to a $478 total.
 *
 * Returns null when no per-head figure is meaningful (a flat group rate), so
 * the caller can render the tier language instead of fake arithmetic.
 */
export function perTravelerPrice(p: TourPricing, travelers: number): number | null {
  const n = Math.max(1, Math.round(travelers))
  // A flat group rate covers the whole party: dividing it by heads would
  // invent a per-person price that is not what anyone is charged.
  if (p.mode === 'group' && n <= p.tierMax) return null
  const total = tourPrice(p, n)
  // Only claim "N x $X" when it multiplies back to the exact total. A party
  // of 5 on a $478 tour is $95.60 each, which displays as $96 and reads as
  // $480: the caption would contradict the total sitting beside it.
  return total % n === 0 ? total / n : null
}

export interface Experience {
  id: number
  destination: string
  parish: string
  title: string
  /** Operator rate card. Source of truth for every price shown or charged. */
  pricing: TourPricing
  /**
   * All-in price for the SMALLEST party, i.e. what the cards advertise. For a
   * group tour this covers up to `pricing.tierMax` people; for a per-person
   * tour it is one traveler. Derived from `pricing`, never set by hand.
   */
  price: number
  duration: string
  youtubeId?: string
  rating: number
  reviews: number
  category: ExperienceCategory
  creator: string
  followers: string
  gradient: string
  emoji: string
  image: string
  video: string
  description: string
  tags: string[]
  highlights?: string[]
  /**
   * 'package' = a ready-made combo day the operator sells as one product.
   * Packages are deliberately kept OUT of the reel feed and the build your
   * own itinerary surfaces: every one is a recombination of activities also
   * sold singly, so mixing them there produces duplicate reels and lets a
   * guest book the same attraction twice.
   */
  kind: 'single' | 'package'
  /** For packages: ids of the single experiences this bundles. */
  includes?: number[]
  comments: Comment[]
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function getExperienceBySlug(slug: string): Experience | undefined {
  return experiences.find((e) => slugify(e.title) === slug)
}

export function getSlug(exp: Experience): string {
  return slugify(exp.title)
}

// These double as TEXT colors for the category label on white cards/pills,
// so each must clear WCAG AA (≥4.5:1 on #FFF). Music/Food were too light
// (2.7–3.4:1); darkened to ~5:1 while keeping the gold/amber hue.
export const CATEGORY_COLORS: Record<ExperienceCategory, string> = {
  Adventure: '#1A1A1A',
  Nature:    '#0A6E3A',
  Music:     '#8C6A0D',
  Food:      '#8A6308',
  Culture:   '#2D7A3E',
  Water:     '#1A1A1A',
}

export const HERO_IMAGE = HERO

export const DESTINATION_IMAGES: Record<string, string> = {
  ...DESTINATIONS,
}

/**
 * Ambient loop per tour. Only URLs already proven in this repo are used, so
 * nothing 404s; the three local files are fastest and are given to the tours
 * that lead the feed. Collins's own footage should replace these as it comes in.
 */
const VIDEOS = {
  // One DISTINCT, subject-verified video per tour (audited 2026-08-16: every
  // URL HEAD-checked 200, every subject confirmed from its Pexels page, no
  // file shared between tours). Collins's own footage replaces these as it
  // comes in; /rafting-video.mp4 is already his.
  waterfall:   '/media/video/17259005.mp4',
  blueHole:    '/media/video/4055909.mp4',
  rafting:     '/rafting-video.mp4',
  whiteRiver:  '/media/video/30800508.mp4',
  rastafari:   '/media/video/31466203.mp4',
  offRoad:     '/media/video/10571253.mp4',
  zipline:     '/media/video/35685214.mp4',
  horseback:   '/media/video/36685252.mp4',
  beachSwim:   '/media/video/10904849.mp4',
  jetSki:      '/media/video/15290251.mp4',
  parasail:    '/media/video/2523901.mp4',
  snorkeling:  '/media/video/38809773.mp4',
  river:       '/media/video/11598677.mp4',
  cliffDiving: '/media/video/27952003.mp4',
  culture:     '/media/video/37177393.mp4',
  tubing:      '/media/video/6740290.mp4',
  droneKayak:  '/media/video/4207416.mp4',
  waterfall2:  '/media/video/33720041.mp4',
  offRoad2:    '/media/video/5319274.mp4',
  rasta2:      '/media/video/37177249.mp4',
  raftZip:     '/media/video/38230652.mp4',
  cliffSunset: '/media/video/38902703.mp4',
} as const

export const experiences: Experience[] = [
  {
    id: 1,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "Dunn's River Falls Climb",
    pricing: { mode: 'group', baseRate: 275, tierMax: 3, extraPerPerson: 75 },
    price: 351,
    duration: "2 hrs",
    rating: 4.9,
    reviews: 127,
    category: 'Adventure',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #3D0A00 0%, #8B1A00 52%, #D4521A 100%)',
    emoji: '💧',
    image: '/media/img/11035880.jpg',
    video: VIDEOS.waterfall,
    description: "Climb the 600-foot cascading falls hand-in-hand up the terraces, then cool off in the pools at the top. Jamaica's most famous natural attraction, done with a guide who knows the safe line.",
    tags: ["Waterfall", "Climbing", "Ocho Rios"],
    kind: 'single',
    comments: [],
  },
  {
    id: 2,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "Blue Hole & Secret Falls",
    pricing: { mode: 'group', baseRate: 275, tierMax: 3, extraPerPerson: 75 },
    price: 351,
    duration: "2 hrs",
    rating: 4.9,
    reviews: 98,
    category: 'Water',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #002B5B 0%, #0066A0 52%, #00B4D8 100%)',
    emoji: '🌊',
    image: '/tours/waterfall.webp',
    video: VIDEOS.blueHole,
    description: "Swim, cliff-jump and rope-swing into turquoise limestone pools hidden in the rainforest. Quieter than Dunn's River and twice as wild.",
    tags: ["Cliff Jumping", "Rope Swing", "Rainforest"],
    kind: 'single',
    comments: [],
  },
  {
    id: 3,
    destination: "Falmouth",
    parish: "Trelawny",
    title: "Bamboo Rafting on the Martha Brae",
    pricing: { mode: 'group', baseRate: 100, tierMax: 3, extraPerPerson: 90 },
    price: 128,
    duration: "1.5 hrs",
    rating: 4.8,
    reviews: 64,
    category: 'Nature',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #0D2B1B 0%, #1B5E3B 52%, #7B9E3B 100%)',
    emoji: '🎋',
    image: '/tours/bamboo-rafting.webp',
    video: VIDEOS.rafting,
    description: "Float three miles down the Martha Brae on a handcrafted 30-foot bamboo raft, poled by a licensed captain who has run this river for years.",
    tags: ["Rafting", "River", "Slow Travel"],
    kind: 'single',
    comments: [],
  },
  {
    id: 4,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "Bamboo Rafting on the White River",
    pricing: { mode: 'group', baseRate: 80, tierMax: 3, extraPerPerson: 70 },
    price: 103,
    duration: "1.5 hrs",
    rating: 4.9,
    reviews: 31,
    category: 'Nature',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #0D2B1B 0%, #1B5E3B 52%, #7B9E3B 100%)',
    emoji: '🛶',
    image: '/tours/river-rafting.webp',
    video: VIDEOS.whiteRiver,
    description: "Bamboo rafting on the White River with reggae drifting from the riverbank. The shorter, sweeter cousin of the Martha Brae run.",
    tags: ["Rafting", "River", "Reggae"],
    kind: 'single',
    comments: [],
  },
  {
    id: 5,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "Rasta Cultural ATV Safari",
    pricing: { mode: 'group', baseRate: 150, tierMax: 3, extraPerPerson: 140 },
    price: 192,
    duration: "3 hrs",
    rating: 5.0,
    reviews: 42,
    category: 'Culture',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #1A2A00 0%, #3A5A00 52%, #7B9B1A 100%)',
    emoji: '🌿',
    image: '/tours/collins/rasta-safari-entrance.jpg',
    video: VIDEOS.rastafari,
    description: "Off-road through Jamaican bush on an ATV, then sit with a Rastafari community for ital food, drumming and the history in their own words.",
    tags: ["ATV", "Rastafari", "Culture"],
    kind: 'single',
    comments: [],
  },
  {
    id: 6,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "ATV Off-Road Adventure",
    pricing: { mode: 'per_person', baseRate: 130, tierMax: 3, extraPerPerson: 125 },
    price: 166,
    duration: "2 hrs",
    rating: 4.8,
    reviews: 57,
    category: 'Adventure',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #3D0A00 0%, #8B1A00 52%, #D4521A 100%)',
    emoji: '🏍️',
    image: '/tours/atv.webp',
    video: VIDEOS.offRoad,
    description: "Rugged trails, red mud and open throttle through the hills behind Ocho Rios. Helmets, briefing and a guide who lets you actually ride.",
    tags: ["ATV", "Off-Road", "Mud"],
    kind: 'single',
    comments: [],
  },
  {
    id: 7,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "Rainforest Zipline Adventure",
    pricing: { mode: 'per_person', baseRate: 120, tierMax: 3, extraPerPerson: 110 },
    price: 153,
    duration: "2 hrs",
    rating: 4.9,
    reviews: 48,
    category: 'Adventure',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #3D0A00 0%, #8B1A00 52%, #D4521A 100%)',
    emoji: '🌲',
    image: '/media/img/2041759.jpg',
    video: VIDEOS.zipline,
    description: "Soar the rainforest canopy on a series of ziplines, with the valley opening under your feet at every platform.",
    tags: ["Zipline", "Canopy", "Rainforest"],
    kind: 'single',
    comments: [],
  },
  {
    id: 8,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "Horseback Riding Trail",
    pricing: { mode: 'per_person', baseRate: 100, tierMax: 3, extraPerPerson: 95 },
    price: 128,
    duration: "2 hrs",
    rating: 4.8,
    reviews: 36,
    category: 'Nature',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #0D2B1B 0%, #1B5E3B 52%, #7B9E3B 100%)',
    emoji: '🐴',
    image: '/media/img/15477536.jpg',
    video: VIDEOS.horseback,
    description: "A scenic ride through country trails and along the coast, at a pace that suits first-timers and confident riders alike.",
    tags: ["Horseback", "Trails", "Countryside"],
    kind: 'single',
    comments: [],
  },
  {
    id: 9,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "Horseback Ride 'n' Swim",
    pricing: { mode: 'per_person', baseRate: 100, tierMax: 3, extraPerPerson: 95 },
    price: 128,
    duration: "2.5 hrs",
    rating: 4.9,
    reviews: 88,
    category: 'Water',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #002B5B 0%, #0066A0 52%, #00B4D8 100%)',
    emoji: '🏊',
    image: '/media/img/2612565.jpg',
    video: VIDEOS.beachSwim,
    description: "Ride down to the water, then swim your horse bareback through the Caribbean. The photo everyone comes home with.",
    tags: ["Horseback", "Ocean Swim", "Beach"],
    kind: 'single',
    comments: [],
  },
  {
    id: 10,
    destination: "Montego Bay",
    parish: "St. James",
    title: "Jet Ski the Caribbean",
    pricing: { mode: 'group', baseRate: 130, tierMax: 3, extraPerPerson: 100 },
    price: 166,
    duration: "1 hr",
    rating: 4.7,
    reviews: 26,
    category: 'Water',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #002B5B 0%, #0066A0 52%, #00B4D8 100%)',
    emoji: '🌊',
    image: '/tours/collins/jet-ski-beach.jpg',
    video: VIDEOS.jetSki,
    description: "Open water, full throttle. A powerful jet ski and a stretch of Caribbean blue with nothing in your way.",
    tags: ["Jet Ski", "Speed", "Sea"],
    kind: 'single',
    comments: [],
  },
  {
    id: 11,
    destination: "Montego Bay",
    parish: "St. James",
    title: "Parasailing Over the Bay",
    pricing: { mode: 'group', baseRate: 120, tierMax: 3, extraPerPerson: 90 },
    price: 153,
    duration: "1 hr",
    rating: 4.8,
    reviews: 33,
    category: 'Water',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #002B5B 0%, #0066A0 52%, #00B4D8 100%)',
    emoji: '🪂',
    image: '/media/img/4605351.jpg',
    video: VIDEOS.parasail,
    description: "Lifted above the turquoise from the deck of the boat, with the whole coastline laid out beneath you.",
    tags: ["Parasailing", "Views", "Sea"],
    kind: 'single',
    comments: [],
  },
  {
    id: 12,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "Clear Kayak Reef Tour",
    pricing: { mode: 'group', baseRate: 180, tierMax: 3, extraPerPerson: 160 },
    price: 230,
    duration: "1.5 hrs",
    rating: 4.9,
    reviews: 21,
    category: 'Water',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #002B5B 0%, #0066A0 52%, #00B4D8 100%)',
    emoji: '🛶',
    image: '/media/img/1430672.jpg',
    video: VIDEOS.snorkeling,
    description: "Paddle a crystal-clear kayak straight over the reef and watch the coral and fish move underneath you the whole way out.",
    tags: ["Clear Kayak", "Coral Reef", "Snorkel"],
    kind: 'single',
    comments: [],
  },
  {
    id: 13,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "River Tubing",
    pricing: { mode: 'group', baseRate: 100, tierMax: 3, extraPerPerson: 80 },
    price: 128,
    duration: "1.5 hrs",
    rating: 4.8,
    reviews: 45,
    category: 'Nature',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #0D2B1B 0%, #1B5E3B 52%, #7B9E3B 100%)',
    emoji: '🛟',
    image: '/media/img/1305095.jpg',
    video: VIDEOS.river,
    description: "Drop into the current on a tube and let the river do the work. Easy, cold, and the best kind of lazy.",
    tags: ["Tubing", "River", "Easy"],
    kind: 'single',
    comments: [],
  },
  {
    id: 14,
    destination: "Negril",
    parish: "Westmoreland",
    title: "Rick's Cafe Cliff Diving & Sunset",
    pricing: { mode: 'group', baseRate: 200, tierMax: 4, extraPerPerson: 40 },
    price: 255,
    duration: "3 hrs",
    rating: 4.9,
    reviews: 112,
    category: 'Adventure',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #3D0A00 0%, #8B1A00 52%, #D4521A 100%)',
    emoji: '🌅',
    image: '/tours/ricks-cafe-sunset.webp',
    video: VIDEOS.cliffDiving,
    description: "The legendary Negril cliffs: jump if you dare, or hold a drink and watch the divers while the sun drops into the sea.",
    tags: ["Cliff Diving", "Sunset", "Negril"],
    kind: 'single',
    comments: [],
  },
  {
    id: 15,
    destination: "Nine Mile",
    parish: "St. Ann",
    title: "Bob Marley Nine Mile Pilgrimage",
    pricing: { mode: 'group', baseRate: 360, tierMax: 3, extraPerPerson: 100 },
    price: 459,
    duration: "Full day",
    rating: 5.0,
    reviews: 74,
    category: 'Culture',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #1A2A00 0%, #3A5A00 52%, #7B9B1A 100%)',
    emoji: '🎵',
    // The real Nine Mile Trading Post (Marley's face on the orange gable),
    // self-hosted from Collins's TripAdvisor listing so nothing hotlinks.
    image: '/tours/nine-mile-trading-post.jpg',
    video: VIDEOS.culture,
    description: "Up into the hills of St. Ann to the house where Robert Nesta Marley was born and the mausoleum where he rests, told by guides from the village.",
    tags: ["Bob Marley", "Heritage", "Nine Mile"],
    kind: 'single',
    comments: [],
  },
  {
    id: 16,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "Tubing + Clear Kayak Combo",
    pricing: { mode: 'per_person', baseRate: 180, tierMax: 3, extraPerPerson: 180 },
    price: 230,
    duration: "Half day",
    rating: 0,
    reviews: 0,
    category: 'Water',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #002B5B 0%, #0066A0 52%, #00B4D8 100%)',
    emoji: '🛶',
    image: '/media/img/4511090.jpg',
    video: VIDEOS.tubing,
    description: "A lazy river tube run, then a guided clear-kayak paddle through hidden coves. Two of the calmest ways to see the coast, back to back.",
    tags: ["Combo", "Tubing", "Kayak"],
    kind: 'package',
    includes: [13, 12],
    comments: [],
  },
  {
    id: 17,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "Bamboo Raft + Clear Kayak + Drone Photos",
    pricing: { mode: 'per_person', baseRate: 260, tierMax: 3, extraPerPerson: 260 },
    price: 332,
    duration: "Half day",
    rating: 0,
    reviews: 0,
    category: 'Water',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #002B5B 0%, #0066A0 52%, #00B4D8 100%)',
    emoji: '📸',
    image: '/media/img/7763506.jpg',
    video: VIDEOS.droneKayak,
    description: "Raft the river, paddle the reef in a clear kayak, and go home with professional drone footage of both.",
    tags: ["Combo", "Rafting", "Drone"],
    kind: 'package',
    includes: [3, 12],
    comments: [],
  },
  {
    id: 18,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "Dunn's River + Blue Hole",
    pricing: { mode: 'group', baseRate: 150, tierMax: 3, extraPerPerson: 100 },
    price: 192,
    duration: "Half day",
    rating: 0,
    reviews: 0,
    category: 'Adventure',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #3D0A00 0%, #8B1A00 52%, #D4521A 100%)',
    emoji: '💦',
    image: '/media/img/189708.jpg',
    video: VIDEOS.waterfall2,
    description: "Both of Jamaica's headline waterfalls in one day: climb Dunn's River in the morning, jump the Blue Hole in the afternoon.",
    tags: ["Combo", "Waterfalls", "Best Value"],
    kind: 'package',
    includes: [1, 2],
    comments: [],
  },
  {
    id: 19,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "Zipline + ATV",
    pricing: { mode: 'per_person', baseRate: 170, tierMax: 3, extraPerPerson: 170 },
    price: 217,
    duration: "Half day",
    rating: 0,
    reviews: 0,
    category: 'Adventure',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #3D0A00 0%, #8B1A00 52%, #D4521A 100%)',
    emoji: '⚡',
    image: '/media/img/5976872.jpg',
    video: VIDEOS.offRoad2,
    description: "Fly the canopy on a zipline, then hit the mud trails on an ATV. The full adrenaline day.",
    tags: ["Combo", "Zipline", "ATV"],
    kind: 'package',
    includes: [7, 6],
    comments: [],
  },
  {
    id: 20,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "Rasta Safari + Bamboo Rafting",
    pricing: { mode: 'per_person', baseRate: 250, tierMax: 3, extraPerPerson: 250 },
    price: 319,
    duration: "Half day",
    rating: 0,
    reviews: 0,
    category: 'Culture',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #1A2A00 0%, #3A5A00 52%, #7B9B1A 100%)',
    emoji: '🌿',
    image: '/tours/rasta-safari-family.webp',
    video: VIDEOS.rasta2,
    description: "Rastafari cultural safari in the morning, then the slow drift of a bamboo raft in the afternoon. Jamaica at both speeds.",
    tags: ["Combo", "Rastafari", "Rafting"],
    kind: 'package',
    includes: [5, 4],
    comments: [],
  },
  {
    id: 21,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "Bamboo Rafting + Zipline",
    pricing: { mode: 'per_person', baseRate: 210, tierMax: 3, extraPerPerson: 210 },
    price: 268,
    duration: "Half day",
    rating: 0,
    reviews: 0,
    category: 'Adventure',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #3D0A00 0%, #8B1A00 52%, #D4521A 100%)',
    emoji: '🎋',
    image: '/media/img/11820457.jpg',
    video: VIDEOS.raftZip,
    description: "The river first, the canopy after. A full day that starts gentle and ends loud.",
    tags: ["Combo", "Rafting", "Zipline"],
    kind: 'package',
    includes: [3, 7],
    comments: [],
  },
  {
    id: 22,
    destination: "Ocho Rios",
    parish: "St. Ann",
    title: "Triple Pack: ATV + Zipline + Rick's Cafe",
    pricing: { mode: 'per_person', baseRate: 250, tierMax: 3, extraPerPerson: 250 },
    price: 319,
    duration: "Full day",
    rating: 0,
    reviews: 0,
    category: 'Adventure',
    creator: 'mapltours',
    followers: '',
    gradient: 'linear-gradient(170deg, #3D0A00 0%, #8B1A00 52%, #D4521A 100%)',
    emoji: '🔥',
    image: '/tours/collins/ricks-cafe-cove.jpg',
    video: VIDEOS.cliffSunset,
    description: "Three of the island's best in one day: ATV trails, rainforest zipline, and sunset at Rick's Cafe.",
    tags: ["Combo", "ATV", "Zipline", "Rick's Cafe"],
    kind: 'package',
    includes: [6, 7, 14],
    comments: [],
  },
]

/**
 * Destinations where Collins actually runs tours, derived from the catalog
 * so the "Popular destinations" surfaces can never drift from what is
 * bookable. Ordered by how many tours each destination has.
 */
export const TOUR_DESTINATIONS: { name: string; parish: string; count: number }[] = (() => {
  const seen = new Map<string, { name: string; parish: string; count: number }>()
  for (const e of experiences) {
    const cur = seen.get(e.destination)
    if (cur) cur.count += 1
    else seen.set(e.destination, { name: e.destination, parish: e.parish, count: 1 })
  }
  return Array.from(seen.values()).sort((a, b) => b.count - a.count)
})()

/** Everything a guest can assemble themselves: reels, explore, day builder. */
export const singleExperiences = experiences.filter((e) => e.kind === 'single')

/** Ready-made combo days, sold whole from their own home-page section. */
export const packageExperiences = experiences.filter((e) => e.kind === 'package')

/**
 * Ids that would double-book if these two products shared a cart: a package
 * against its own components, or a component against a package containing it.
 */
export function conflictingIds(exp: Experience): number[] {
  if (exp.kind === 'package') return exp.includes ?? []
  return packageExperiences
    .filter((p) => (p.includes ?? []).includes(exp.id))
    .map((p) => p.id)
}
