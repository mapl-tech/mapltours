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

  // ── Detail-page content ────────────────────────────────────────────────
  // All optional. The detail page renders each block only when it is present,
  // so an experience with none of these still produces a complete page and
  // nothing has to be invented to fill a section. Populate per tour as the
  // real operator information comes in.

  /** Full activity write-up. Falls back to `description` when absent. */
  about?: string
  /** e.g. 'Suitable for ages 8 and up'. */
  ages?: string
  /** Fitness or mobility notes a guest needs BEFORE booking. */
  fitness?: string
  /** What the price covers. */
  included?: string[]
  /** What the price does NOT cover, so there are no surprises on the day. */
  notIncluded?: string[]
  /** What to bring. */
  bring?: string[]
  /** Anything else worth knowing: weather policy, timings, etiquette. */
  additionalInfo?: string[]
  /** Where the day starts, when it is not simply hotel pickup. */
  meetingPoint?: string
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

/**
 * ── DRAFT DETAIL CONTENT ────────────────────────────────────────────────
 * Every `about` / `ages` / `fitness` / `included` / `notIncluded` / `bring` /
 * `additionalInfo` block below is placeholder copy, written to be practically
 * true of each activity but NOT taken from an operator brief. What is and is
 * not in the price, the age floors, the weight limits and the weather-refund
 * terms are commercial facts only MAPL and the operator can confirm, so every
 * line needs verifying against the real product before a customer is shown it.
 */
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
    about: "Six hundred feet of limestone terraces stepping down into the sea, climbed the way it has always been climbed: barefoot in a linked chain behind a guide who knows where the grip is. You go up through the cascades with rest stops in the pools cut into the rock, and there is a dry path beside the falls for anyone who would rather watch.",
    ages: "6 and up",
    fitness: 'A moderate climb over wet limestone terraces, roughly 45 minutes of continuous ascent with rest points. Guests link hands in a chain led by a guide. Not suitable for anyone with limited mobility, a heart condition, or in late pregnancy.',
    meetingPoint: 'Hotel pickup',
    included: [
      'Round-trip private transport from your hotel',
      'Park entry',
      'Licensed falls guide',
    ],
    notIncluded: [
      'Water shoe rental at the park',
      'Locker hire',
      'Food and drinks',
      'Gratuities',
    ],
    bring: [
      'Swimwear worn under your clothes',
      'Water shoes or secure sandals with a strap — flip-flops will not hold on wet rock',
      'A towel and a change of clothes',
      'A waterproof phone case or a dry bag',
      'Sunscreen and a hat',
    ],
    additionalInfo: [
      'The climb runs rain or shine; heavy rainfall can close the falls, in which case you are refunded in full or rescheduled at no cost.',
      'Lockers are available at the park for a small fee — bring as little as you can.',
      'Cameras are allowed on the climb, but you will need both hands for parts of it.',
    ],
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
    about: "A chain of turquoise limestone pools stacked up a rainforest gorge. Your guide leads you pool to pool through jumps that start ankle-high and top out around twenty feet, a rope swing, a short cave you can swim into and a natural slide worn into the rock. Every jump is optional and there is a walk-down route past all of them.",
    ages: "8 and up",
    fitness: "Confident swimmers only: the pools are deep with no standing bottom. About an hour in and out of the water, with short scrambles over wet rock and timber ladders between pools. Comfortable for most active guests; not suitable with limited mobility, a heart condition, or in pregnancy.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel",
      "Blue Hole entry",
      "Licensed river guide",
      "Life vest",
    ],
    notIncluded: [
      "Water shoe rental at the gate",
      "Photos and video from the site photographer",
      "Food and drinks",
      "Gratuities",
    ],
    bring: [
      "Swimwear worn under your clothes",
      "Water shoes or strapped sandals, as the rock is slick",
      "A towel and a dry change of clothes",
      "A waterproof phone case or a dry bag",
      "Small US cash for tips and photos",
    ],
    additionalInfo: [
      "Heavy rain upriver raises the water and can close the site, in which case you are rescheduled at no cost or refunded in full.",
      "Guides carry a dry bag between pools, but leave anything valuable in the vehicle.",
      "The jumps are graded low to high, so you can stop at whatever height you like.",
    ],
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
    about: "Three miles of the Martha Brae on a thirty-foot raft built by hand from bamboo, with a licensed captain standing at the bow and poling you down. Two guests to a raft on a cushioned seat, with a stop partway at a riverside bar and craft stalls before you drift on to the landing.",
    ages: "All ages",
    fitness: "Under-12s ride with an adult, and infants ride on a parent's lap. Easy. You are seated for the whole float; the only effort is stepping on and off the raft at the bank.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel",
      "Raft village entry",
      "Private raft and licensed captain",
      "Life vests on request",
    ],
    notIncluded: [
      "Drinks at the riverside bar",
      "Craft market purchases",
      "Gratuity for your captain",
    ],
    bring: [
      "Sunscreen and a hat, as the river is open to the sun",
      "Sunglasses",
      "A camera or phone",
      "Small US cash for a drink, a craft or a tip",
      "A light layer in case of a shower",
    ],
    additionalInfo: [
      "You stay dry on the raft, and you can trail your feet in the water if you want to.",
      "Your captain will take photos of you along the way; a tip is customary rather than a fee.",
      "Rafts leave every few minutes, so there is rarely a wait at the village.",
    ],
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
    about: "The shorter, quieter raft run: a gentle stretch of the White River just outside Ocho Rios, poled by a captain from the district with reggae carrying across from the bars on the bank. Easy to slot into a half day, and there is a swimming spot at the landing.",
    ages: "All ages",
    fitness: "Under-12s ride with an adult. Easy. Seated throughout, with one step on and off the raft.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel",
      "River entry",
      "Private raft and licensed captain",
      "Life vests on request",
    ],
    notIncluded: [
      "Riverside bar drinks",
      "Photos",
      "Gratuity for your captain",
    ],
    bring: [
      "Swimwear under your clothes if you want the swim at the end",
      "A towel",
      "Sunscreen, a hat and sunglasses",
      "A camera or phone",
      "Small US cash for a drink and a tip",
    ],
    additionalInfo: [
      "Late afternoon runs catch the best light on the river.",
      "Rafting is called off when the river runs high after heavy rain; you reschedule free or take a full refund.",
      "The run is short enough to pair with a second activity the same day.",
    ],
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
    about: "An hour on the bush trails behind Ocho Rios on your own ATV, then up to a Rastafari community in the hills. You are walked through the herb garden and the way the food is grown, sit down to an ital tasting, and hear the history and the livity from the people living it, with drumming to finish.",
    ages: "16+ to drive, 8+ to ride",
    fitness: "Drivers need a valid driver's licence, passengers from 8 ride with an adult, and the community visit suits all ages. Moderate. Riding an ATV over rutted trail is physical on the arms and shoulders, and there is a short uphill walk into the community. Not suitable in pregnancy or with back or neck injuries.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel",
      "Single-rider ATV, helmet and goggles",
      "Safety briefing and trail guide",
      "Community visit, ital tasting and drumming session",
    ],
    notIncluded: [
      "Alcohol",
      "Craft, herb and art purchases at the community",
      "Gratuities",
    ],
    bring: [
      "Closed-toe shoes you do not mind ruining",
      "Clothes that can take red mud",
      "Sunglasses or a bandana for the dust",
      "A change of clothes for the ride home",
      "Small US cash for crafts and tips",
    ],
    additionalInfo: [
      "You will get muddy. This is not a tour to do in white.",
      "Ital food is vegetarian and cooked without salt; tell us in advance about any allergies.",
      "Ask before photographing anyone in the community. The answer is usually yes, but the asking matters.",
    ],
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
    about: "Two hours on the trails behind Ocho Rios: red mud, rutted farm tracks, a shallow river crossing and a few long open stretches where you can hold the throttle down. One guide rides ahead and another sweeps the back, and after the briefing and a practice loop you actually get to ride rather than trundle.",
    ages: "16+ to drive, 8+ to ride",
    fitness: "Drivers need a valid driver's licence, and passengers from 8 ride double with an adult. Moderate. Bracing a machine over rough ground works your arms, shoulders and legs. Not suitable in pregnancy or with back, neck or wrist injuries.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel",
      "ATV, helmet and goggles",
      "Safety briefing and practice loop",
      "Trail guides front and back",
    ],
    notIncluded: [
      "Photos and video from the trail photographer",
      "Food and drinks",
      "Gratuities",
    ],
    bring: [
      "Closed-toe shoes you do not mind ruining",
      "Long trousers and socks",
      "Sunglasses or a bandana for the dust",
      "A change of clothes and a bag for the muddy set",
      "Small US cash for tips",
    ],
    additionalInfo: [
      "Riding is single-rider by default; doubling up can be arranged when you book.",
      "The trails run in light rain and are usually better for it. Lightning stops a ride, and you reschedule free or take a full refund.",
      "No alcohol before riding. Drivers who have been drinking are turned away and cannot be refunded.",
    ],
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
    about: "A course of ziplines strung between platforms across the rainforest canopy above Ocho Rios, from short warm-up runs to a long, fast finale out over the valley. Certified guides clip you in at every platform and handle the braking, so the whole job is to sit back and look down.",
    ages: "8 and up",
    fitness: "Riders under 16 are accompanied on the course by an adult. Light to moderate. Stairs and short uphill walks between platforms, and you need to hold your own weight seated in a harness. Riders must be between 60 and 270 lbs. Not suitable in pregnancy or with shoulder or back injuries.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel",
      "Every run on the course",
      "Harness, helmet and gloves",
      "Two certified canopy guides and a ground briefing",
    ],
    notIncluded: [
      "Course photos",
      "Food and drinks",
      "Gratuities",
    ],
    bring: [
      "Closed-toe shoes, as sandals are refused at the course",
      "Trousers or shorts rather than a skirt, which the harness makes awkward",
      "A hair tie for long hair",
      "Insect repellent",
      "Small US cash for tips",
    ],
    additionalInfo: [
      "Loose items stay on the ground or in a zipped pocket. Guides cannot carry phones, hats or sunglasses for you.",
      "The course runs in light rain and closes for lightning; a closure means a free reschedule or a full refund.",
      "Guides shoot photos from the platforms and sell them as a set at the end.",
    ],
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
    about: "A ride out of a working stable through country lanes and cane fields to a stretch of open coast, on a horse matched to your experience. Grooms walk the line the whole way and the pace is a steady walk, with a trot on the flat if the group is up to it.",
    ages: "6 and up",
    fitness: "Under-8s are led on a rein by a groom. Light. No riding experience needed, but you must be able to mount from a block and sit for most of two hours. Riders must be under 250 lbs. Not suitable in pregnancy or with back or hip injuries.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel",
      "A horse matched to your ability",
      "Helmet and riding briefing",
      "Groom-guides for the whole ride",
    ],
    notIncluded: [
      "Photos from the trail",
      "Drinks at the stable",
      "Gratuities for the grooms",
    ],
    bring: [
      "Long trousers or leggings, as shorts chafe on a saddle",
      "Closed-toe shoes, ideally with a small heel",
      "Sunscreen and a hat that fits under a helmet",
      "Insect repellent",
      "Small US cash for the grooms",
    ],
    additionalInfo: [
      "Tell us your riding experience when you book so the stable can pick the right horse.",
      "Rides go out mid-morning and late afternoon to stay out of the midday heat.",
      "Rain rarely stops a ride, but thunder does; you reschedule at no cost or take a full refund.",
    ],
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
    about: "The trail ride first, down through the countryside to the water, then the part everyone comes for: saddles off, swimwear on, and your horse walks and swims out into the Caribbean with you bareback on its back. Grooms are in the water alongside for the whole swim.",
    ages: "8 and up",
    fitness: "Swimmers only. Moderate. Around an hour in the saddle, then the swim bareback holding a strap. You must be comfortable in open water. Riders must be under 250 lbs. Not suitable in pregnancy or with back or hip injuries.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel",
      "A horse matched to your ability",
      "Helmet for the trail leg and riding briefing",
      "Groom-guides on the trail and in the water",
    ],
    notIncluded: [
      "Photos from the beach photographer",
      "Drinks at the stable",
      "Gratuities for the grooms",
    ],
    bring: [
      "Swimwear worn under your riding clothes",
      "Long trousers or leggings for the trail leg",
      "A towel and a dry change of clothes",
      "Reef-safe sunscreen",
      "Small US cash for the grooms",
    ],
    additionalInfo: [
      "Phones and cameras stay with the ground crew before the swim, as the horses go right under.",
      "The swim is called off when the sea is rough. You ride the trail leg and can come back for the swim at no cost.",
      "There are basic changing rooms at the stable.",
    ],
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
    about: "A briefing on the sand, then an hour of open Caribbean off Montego Bay. You ride your own machine inside a marked area with a guide on the water, out past the swim zone where there is finally room to open it up.",
    ages: "18+ to drive, 12+ to ride",
    fitness: "Drivers need photo ID, and passengers from 12 ride behind an adult. Light to moderate. You need to be able to climb back on from deep water if you come off. Not suitable in pregnancy or with back or neck injuries.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel",
      "Jet ski hire and fuel for the hour",
      "Life vest and safety briefing",
      "Guide on the water",
    ],
    notIncluded: [
      "Photos and video",
      "Food and drinks",
      "Gratuities",
    ],
    bring: [
      "Swimwear and a rash guard if you burn easily",
      "A towel and a dry change of clothes",
      "Reef-safe sunscreen",
      "Sunglasses with a strap, or none at all",
      "Photo ID for the driver",
    ],
    additionalInfo: [
      "One ski carries two people. Book two if you both want to drive.",
      "Rides are called off in rough water or under a small-craft warning, with a free reschedule or a full refund.",
      "No alcohol before riding.",
    ],
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
    about: "Out from the beach on the boat, clipped into the harness on the flight deck, and winched up several hundred feet above Montego Bay with the coastline opening under your feet. You lift off dry and land dry unless you ask for a dip. The hour covers the boat trip out and back; the flight itself is ten to twelve minutes.",
    ages: "6 and up",
    fitness: "Under-16s fly in tandem with an adult. Light. You are seated in a harness for the whole flight. Combined tandem weight must be between 90 and 375 lbs. Not suitable in pregnancy or with heart, back or neck conditions.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel",
      "Boat ride out and back",
      "Flight with parachute, harness and life vest",
      "Crew and pre-flight briefing",
    ],
    notIncluded: [
      "Onboard photos and video",
      "Drinks on the boat",
      "Gratuities",
    ],
    bring: [
      "Swimwear under light clothes",
      "A towel",
      "Sunscreen and a hat for the boat",
      "Sunglasses with a strap",
      "Small US cash for tips",
    ],
    additionalInfo: [
      "You fly one or two at a time while the rest of your party watches from the boat, so everyone books the same hour.",
      "Wind decides everything. Too much or too little and the flight moves to another slot or is refunded in full.",
      "Ask the crew for a dip on the way down if you want to finish wet.",
    ],
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
    about: "A transparent-hull kayak straight over the reef, so the coral heads, sea fans and fish are under you for the whole paddle rather than just at the snorkel stop. A guide leads the loop out along the reef line and into a quiet cove, with time in the water with mask and fins at the turn.",
    ages: "6 and up",
    fitness: "Under-12s share a kayak with an adult. Light. Flat, sheltered water at a slow pace, with no kayaking experience needed. Basic swimming ability is required for the snorkel stop.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel",
      "Clear kayak, paddle and life vest",
      "Mask and snorkel",
      "Guided paddle and reef briefing",
    ],
    notIncluded: [
      "Photos",
      "Food and drinks",
      "Gratuities",
    ],
    bring: [
      "Swimwear worn under your clothes",
      "Reef-safe sunscreen, since ordinary sunscreen damages coral",
      "A hat and sunglasses with a strap",
      "A towel and a dry change of clothes",
      "A waterproof phone case",
    ],
    additionalInfo: [
      "Morning slots have the flattest water and the best visibility.",
      "Nothing is taken from the reef and nothing is stood on; your guide will show you where to put your fins.",
      "Chop or poor visibility means a free reschedule or a full refund.",
    ],
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
    about: "In at the top of the run, out at the bottom, and a bit over an hour of cool river in between. The current does the work through easy rapids and long slow pools, with guides tubing alongside to keep you off the rocks and hold the group together.",
    ages: "6 and up",
    fitness: "Under-12s tube with an adult alongside. Light. You float, and the only walking is a short path down to the entry point and back up from the exit. Life vests are worn throughout, so water confidence is enough.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel",
      "River entry",
      "Tube and life vest",
      "River guides on the water",
    ],
    notIncluded: [
      "Water shoe rental",
      "Food and drinks",
      "Photos",
      "Gratuities",
    ],
    bring: [
      "Swimwear worn under your clothes",
      "Water shoes or strapped sandals",
      "A towel and a dry change of clothes",
      "A dry bag or waterproof phone case",
      "Sunscreen",
    ],
    additionalInfo: [
      "The river runs cold in the shade, so a rash guard is welcome on a cloudy day.",
      "High water after heavy rain closes the run; you reschedule at no cost or take a full refund.",
      "Leave anything you cannot afford to lose in the vehicle.",
    ],
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
    about: "The drive out to the Negril cliffs for late afternoon, a table at Rick's while the divers work the ledge and the local pros go off the tree above it, and the sun dropping straight into the sea in front of you. Jump from the low ledge yourself if you want to. Plenty of people come purely to watch.",
    ages: "All ages, jumping 16+",
    fitness: "Cliff jumping is for ages 16 and up and is done under the venue's own rules. Light unless you jump, with steps down to the water and back up. Jumping is for strong swimmers only.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel",
      "Rick's Cafe entry",
      "Your MAPL host for the evening",
    ],
    notIncluded: [
      "Food and drinks at Rick's, which runs on a tab",
      "Photos from the house photographer",
      "Gratuities",
    ],
    bring: [
      "Swimwear under your clothes if you plan to jump",
      "A towel",
      "US cash or a card for the bar",
      "A light layer for the drive back after dark",
      "A camera, because the sunset is the whole point",
    ],
    additionalInfo: [
      "Rick's fills up in the hour before sunset, so we time the pickup to get you a table before the rush.",
      "Nobody is pushed to jump. The low ledge is around 10 feet and the high one around 35.",
      "The whole evening is built around sunset, so pickup time shifts through the year and we confirm it the day before.",
    ],
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
    about: "Up into the hills of St. Ann to the village where Robert Nesta Marley was born, guided by people from Nine Mile. You see the one-room house, the rock he sang about, and the mausoleum where he and his mother rest. The drive is half the day and half the point: deep country, mountain roads and the Jamaica most visitors never leave the coast to find.",
    ages: "All ages",
    fitness: "It is a long day in a vehicle, so think it through for very young children. Light. Some walking on uneven ground and a flight of steps up to the mausoleum, with two to three hours of driving each way depending on where you start.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel",
      "Nine Mile entry",
      "Village guide",
      "Bottled water for the drive",
    ],
    notIncluded: [
      "Lunch",
      "Craft and record purchases in the village",
      "Gratuities for your guide and driver",
    ],
    bring: [
      "Comfortable shoes for uneven ground",
      "A light jacket, as the hills are cooler than the coast",
      "US cash for lunch, crafts and tips",
      "Sunscreen and a hat",
      "A camera",
    ],
    additionalInfo: [
      "Photography is welcome around the site but not inside the mausoleum, and hats come off at the door.",
      "Dress as you would for anywhere that matters to people. This is a burial place as much as a museum.",
      "We stop for lunch at a local spot on the way back; tell us in advance about any dietary needs.",
    ],
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
    about: "Two of the calmest ways to see this coast, back to back. The river first, floating down on a tube with the current doing the work, then out over the reef in a clear-hulled kayak with the coral moving underneath you. Transport between the two and a break in the middle are built into the half day.",
    ages: "6 and up",
    fitness: "Under-12s tube and paddle with an adult. Light. Flat water on both legs, short walks at each entry point, and life vests worn throughout. Water confidence is enough.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel and between both sites",
      "River entry, tube and life vest",
      "Clear kayak, paddle, mask and snorkel",
      "River guides and a reef guide",
    ],
    notIncluded: [
      "Water shoe rental",
      "Lunch and drinks",
      "Photos",
      "Gratuities",
    ],
    bring: [
      "Swimwear worn under your clothes",
      "Water shoes or strapped sandals",
      "Two towels and a dry change of clothes",
      "Reef-safe sunscreen and a hat",
      "A dry bag or waterproof phone case",
    ],
    additionalInfo: [
      "We usually run the river first and the reef after, but the order flips to follow the water and the weather.",
      "There is a break between the two with time to buy lunch, which is not included.",
      "If conditions close one half, that half is rescheduled free or refunded in full.",
    ],
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
    about: "A raft down the river, a clear kayak out over the reef, and a drone operator following both so you go home with footage of your own day rather than stock. The edited clips and stills land by download link a few days later.",
    ages: "6 and up",
    fitness: "Under-12s raft and paddle with an adult. Light throughout. Seated on the raft, flat water in the kayak, and short walks at each entry point.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel and between both sites",
      "Private bamboo raft and licensed captain",
      "Clear kayak, paddle, mask and snorkel",
      "Drone operator, with edited video and stills delivered by link",
    ],
    notIncluded: [
      "Riverside bar drinks and lunch",
      "Gratuities for your captain and guides",
    ],
    bring: [
      "Swimwear worn under your clothes",
      "A towel and a dry change of clothes",
      "Reef-safe sunscreen, a hat and sunglasses with a strap",
      "Something you would happily be filmed in",
      "Small US cash for drinks and tips",
    ],
    additionalInfo: [
      "Footage is delivered within about three days by download link.",
      "Drones cannot fly in strong wind or heavy rain. If the aerial half is grounded we reshoot it at no cost.",
      "Tell the operator if anyone in your party would rather not be filmed.",
    ],
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
    about: "Both of Jamaica's headline waterfalls in one day. Climb the terraces of Dunn's River hand-in-hand to the top in the morning, then out to the Blue Hole in the afternoon for the pools, the rope swing and the jumps. One driver, both parks, no dead time in between.",
    ages: "8 and up",
    fitness: "Confident swimmers only, and the age floor is set by the Blue Hole. Moderate to demanding. Two climbs over wet rock in one day and roughly two hours in the water in total. Not suitable with limited mobility, a heart condition, or in pregnancy.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel and between both sites",
      "Dunn's River and Blue Hole entry",
      "A licensed guide at each falls",
      "Life vest at the Blue Hole",
    ],
    notIncluded: [
      "Water shoe rental and locker hire",
      "Site photographers at either park",
      "Lunch and drinks",
      "Gratuities",
    ],
    bring: [
      "Swimwear worn under your clothes",
      "Water shoes or strapped sandals with grip",
      "Two towels and a dry change of clothes",
      "A dry bag or waterproof phone case",
      "Sunscreen, a hat and small US cash",
    ],
    additionalInfo: [
      "Dunn's River runs first to stay ahead of the cruise-ship crowds, so pickups are early.",
      "Heavy rain can close either site. Whichever half is lost is rescheduled free or refunded.",
      "There is a lunch stop between the two, and food is not included.",
    ],
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
    about: "The full adrenaline half day. Fly the canopy first on a course of ziplines out over the valley, then swap the harness for a helmet and take an ATV onto the mud trails behind Ocho Rios. Same base, same guides, straight from one to the other.",
    ages: "8+ zipline, 16+ to drive",
    fitness: "ATV drivers need a valid driver's licence, and younger riders go double with an adult. Moderate. Stairs and short climbs between zipline platforms, then a physical hour on a machine over rough ground. Zipline riders must be between 60 and 270 lbs. Not suitable in pregnancy or with back, neck or shoulder injuries.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel",
      "Full zipline course with harness, helmet and gloves",
      "ATV with helmet and goggles",
      "Certified canopy guides and trail guides",
      "Safety briefing for both",
    ],
    notIncluded: [
      "Photos and video from either course",
      "Food and drinks",
      "Gratuities",
    ],
    bring: [
      "Closed-toe shoes you do not mind muddying",
      "Trousers or shorts rather than a skirt, which the harness will not allow",
      "Sunglasses or a bandana for trail dust",
      "A change of clothes and a bag for the muddy set",
      "Small US cash for tips",
    ],
    additionalInfo: [
      "Zipline first, ATV second. Better to be muddy at the end of the day than in the harness.",
      "Nothing loose goes on the canopy course, so phones, hats and sunglasses stay behind or in a zipped pocket.",
      "Lightning stops both, and a closure means a free reschedule or a full refund.",
    ],
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
    about: "Jamaica at both speeds in one half day. ATV up through the bush to a Rastafari community for the herb garden, an ital tasting and the drumming, then down to the White River in the afternoon to sit on a bamboo raft and let a captain pole you home.",
    ages: "16+ to drive, 8+ to ride",
    fitness: "ATV drivers need a valid driver's licence; the community visit and the raft suit all ages. Moderate on the safari leg, with a machine over rutted trail and a short uphill walk, then entirely restful on the river.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel and between both sites",
      "Single-rider ATV, helmet and goggles",
      "Community visit, ital tasting and drumming session",
      "Private bamboo raft and licensed captain",
    ],
    notIncluded: [
      "Alcohol and riverside bar drinks",
      "Craft and herb purchases",
      "Gratuities for your guide and captain",
    ],
    bring: [
      "Closed-toe shoes that can take red mud",
      "A change of clothes for the raft, since you finish the safari muddy",
      "Sunglasses or a bandana for the dust",
      "Sunscreen and a hat for the open river",
      "Small US cash for crafts, drinks and tips",
    ],
    additionalInfo: [
      "The safari runs first so the river washes the day off, rather than the other way round.",
      "Ital food is vegetarian and cooked without salt; tell us in advance about any allergies.",
      "Ask before photographing anyone in the community.",
    ],
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
    about: "Starts gentle, ends loud. Three miles of the Martha Brae on a hand-built bamboo raft with a captain poling you down, then up into the hills to run the zipline course out over the rainforest canopy.",
    ages: "All ages, zipline 8+",
    fitness: "Zipline riders under 16 are accompanied on the course. Light on the river and moderate on the canopy, with stairs and short climbs between platforms and your own weight held in a harness. Zipline riders must be between 60 and 270 lbs.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport from your hotel and between both sites",
      "Raft village entry, private raft and licensed captain",
      "Full zipline course with harness, helmet and gloves",
      "Certified canopy guides",
    ],
    notIncluded: [
      "Riverside bar drinks and lunch",
      "Course photos",
      "Gratuities",
    ],
    bring: [
      "Closed-toe shoes, as sandals are refused at the zipline course",
      "Trousers or shorts rather than a skirt",
      "Sunscreen and a hat for the open river",
      "A hair tie for long hair",
      "Small US cash for drinks and tips",
    ],
    additionalInfo: [
      "River first and canopy after, though the order flips if the zipline slot moves.",
      "Loose items cannot go on the course, so pack light for the whole day.",
      "Either half closed by weather is rescheduled free or refunded in full.",
    ],
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
    about: "The whole island in a day. Mud trails on an ATV in the morning, the rainforest zipline course after, then the drive west to the Negril cliffs to finish at Rick's Cafe with the divers going off the ledge and the sun dropping into the sea.",
    ages: "8+ zipline, 16+ to drive",
    fitness: "ATV drivers need a valid driver's licence, and cliff jumping at Rick's is 16 and up. Demanding as a full day: a physical hour on an ATV, stairs and climbs on the canopy course, and several hours of driving. Zipline riders must be between 60 and 270 lbs. Not suitable in pregnancy or with back, neck or shoulder injuries.",
    meetingPoint: "Hotel pickup",
    included: [
      "Round-trip private transport for the whole day, including the run out to Negril",
      "ATV with helmet, goggles and trail guides",
      "Full zipline course with harness, helmet, gloves and certified guides",
      "Rick's Cafe entry",
      "Bottled water through the day",
    ],
    notIncluded: [
      "Food and drinks, including your tab at Rick's",
      "Photos at any of the three",
      "Gratuities",
    ],
    bring: [
      "Closed-toe shoes for the ATV and the canopy",
      "A full change of clothes, since you are muddy by mid-morning",
      "Swimwear under your clothes if you plan to jump at Rick's",
      "A towel, sunscreen and a hat",
      "A light layer and US cash or a card for the evening",
    ],
    additionalInfo: [
      "An early start and a late finish: pickup is usually before 8am and you are back after dark.",
      "The day is built around sunset at Rick's, so exact timings shift through the year and we confirm them the day before.",
      "If weather closes one of the three, that leg is rescheduled free or refunded.",
    ],
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
/**
 * Largest party the rate card is written for.
 *
 * Derived from pricing rather than stored, so it can never drift from what a
 * booking actually costs. A group tour is capped at `tierMax`; a per-person
 * tour has no inherent ceiling in the rate card, so it returns null and the
 * detail page simply omits the line instead of asserting a limit we do not have.
 */
export function maxGroupSize(exp: Experience): number | null {
  return exp.pricing.mode === 'group' ? exp.pricing.tierMax : null
}

export function conflictingIds(exp: Experience): number[] {
  if (exp.kind === 'package') return exp.includes ?? []
  return packageExperiences
    .filter((p) => (p.includes ?? []).includes(exp.id))
    .map((p) => p.id)
}
