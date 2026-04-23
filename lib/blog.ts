import { DESTINATION_IMAGES } from '@/lib/experiences'
import { AUTO_POSTS } from './blog-auto'

export type BlogCategory = 'Stories' | 'Guides' | 'Food' | 'Culture' | 'Adventure'

export type BlogBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'quote'; text: string; attribution?: string }
  | { type: 'image'; src: string; caption?: string }
  | { type: 'list'; items: string[] }

export interface BlogAuthor {
  name: string
  role: string
  initials: string
}

export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  category: BlogCategory
  image: string
  readTime: number
  publishedAt: string
  author: BlogAuthor
  featured?: boolean
  body: BlogBlock[]
  relatedSlugs?: string[]
}

const devon: BlogAuthor = { name: 'Devon Wilson', role: 'Food Editor', initials: 'DW' }
const maya: BlogAuthor = { name: 'Maya Clarke', role: 'Culture Writer', initials: 'MC' }
const andre: BlogAuthor = { name: 'Andre Bennett', role: 'Senior Editor', initials: 'AB' }
const simone: BlogAuthor = { name: 'Simone Thompson', role: 'Travel Guide', initials: 'ST' }

const HAND_POSTS: BlogPost[] = [
  {
    slug: 'birthplace-of-jerk-boston-bay',
    title: 'The Birthplace of Jerk: A Boston Bay Story',
    excerpt:
      "Three generations of pit masters, one legendary recipe. We spent a day with Devon in Boston Bay to learn why the real thing tastes different from anything else.",
    category: 'Food',
    image:
      'https://images.unsplash.com/photo-1592415162645-c055a337b613?w=1600&h=1000&fit=crop&q=80',
    readTime: 7,
    publishedAt: '2026-04-08',
    author: devon,
    featured: true,
    body: [
      {
        type: 'p',
        text: "The smoke hits you before you see the pit. Pimento wood, scotch bonnet, allspice — a perfume so specific to this stretch of Portland coast that locals say you can smell a Boston Bay jerk pit from a mile down the A4.",
      },
      {
        type: 'p',
        text: "Devon has been tending his grandfather's pit since he was thirteen. The recipe hasn't changed in sixty years. Neither has the wood — pimento, hand-cut from the hills above the bay, never seasoned, always green. 'Dry wood gives you smoke,' he tells us. 'Green wood gives you soul.'",
      },
      {
        type: 'quote',
        text: "We don't cook jerk. We practice it. The pit remembers every chicken that came before.",
        attribution: 'Devon Wilson, third-generation pit master',
      },
      { type: 'h2', text: 'What makes it real' },
      {
        type: 'p',
        text: "Anywhere else in the world, 'jerk' is a marinade. In Boston Bay, it's a process. The meat sits in spice for a day. It smokes for four hours over a fire that never quite flames. It gets wrapped in banana leaf for the final push. Every step exists because the one before it demanded it.",
      },
      {
        type: 'list',
        items: [
          'The pimento wood imparts a sweetness no charcoal can replicate',
          'Banana leaves hold moisture without steaming away the smoke',
          'The spice paste is always hand-pounded — never blended',
          'Scotch bonnets come from a single farm in the hills above the bay',
        ],
      },
      {
        type: 'p',
        text: "By the time Devon pulls the first pan, there's a line down the road. Tourists, locals, Portland uncles who've been eating here for decades. Nobody skips the bread. Nobody leaves hungry. And nobody — not once, in three generations — has asked for ketchup.",
      },
    ],
    relatedSlugs: ['kingston-street-food', 'beyond-the-resort'],
  },
  {
    slug: 'blue-mountain-sunrise-hike',
    title: 'Sunrise at 5,000 Feet: Hiking the Blue Mountains',
    excerpt:
      "Waking at 3am to climb Jamaica's highest peak — the coffee, the mist, the view, and why every minute of exhaustion is worth it.",
    category: 'Adventure',
    image: DESTINATION_IMAGES['Blue Mountains'],
    readTime: 9,
    publishedAt: '2026-04-02',
    author: maya,
    featured: true,
    body: [
      {
        type: 'p',
        text: "At three in the morning the road to Whitfield Hall is a tunnel of darkness, lit only by the flick of a flashlight and the occasional flash of a coffee bean field catching the truck's headlights.",
      },
      {
        type: 'p',
        text: "We're headed to Blue Mountain Peak — 7,402 feet, the highest point on the island. The hike takes about four hours up if you're fit, five if you're human. And you start it in the middle of the night so you hit the summit just as the sun comes up over the Caribbean.",
      },
      { type: 'h2', text: 'The trail' },
      {
        type: 'p',
        text: "The path rises steeply through montane forest, then narrows into switchbacks cut straight into the volcanic ridge. It smells like damp leaves and wild ginger. You can hear the waterfalls a long time before you see anything.",
      },
      {
        type: 'quote',
        text: "The mountain teaches patience. You stop looking at your watch about the second hour. After that, you just climb.",
        attribution: 'Nigel, our guide from Section, St. Andrew',
      },
      { type: 'h2', text: 'The view' },
      {
        type: 'p',
        text: "At the summit, if the clouds cooperate, you can see both the north and south coasts of the island at once. On a rare day, you can see Cuba. Most mornings, though, you're above the cloud layer, looking out at a sea of white with peaks poking through like islands.",
      },
      {
        type: 'p',
        text: "Then the sun comes up. The clouds turn gold. Someone passes you a thermos of Blue Mountain coffee grown on the slope you just climbed. You drink it and you understand, for the first time, why the world pays more for this coffee than any other on earth.",
      },
    ],
    relatedSlugs: ['first-time-jamaica', 'beyond-the-resort'],
  },
  {
    slug: 'kingston-sound-system-culture',
    title: 'The Sound System Culture of Kingston',
    excerpt:
      "Before streaming, before clubs, there were sound systems. Inside the backyard parties and dancehalls keeping Kingston's music tradition alive.",
    category: 'Culture',
    image: DESTINATION_IMAGES['Kingston'],
    readTime: 8,
    publishedAt: '2026-03-26',
    author: andre,
    body: [
      {
        type: 'p',
        text: "A Kingston sound system isn't a speaker. It's a philosophy. A wall of custom-built bass cabinets, a crate of vinyl curated over forty years, and a selector who knows exactly which tune will break the room open at exactly the right moment.",
      },
      {
        type: 'p',
        text: "The scene started in the 1950s when promoters began hauling massive rigs into empty lots to play American R&B for people who couldn't afford the clubs downtown. By the sixties those same systems were playing ska, then rocksteady, then reggae — all invented, in part, because selectors needed music with enough space in the mix for the bass to hit.",
      },
      { type: 'h2', text: 'Where to find it now' },
      {
        type: 'p',
        text: "The old spots still exist. King Jammy's. Stone Love. Kilimanjaro. Most weekends you'll find a dance somewhere between downtown and Half Way Tree — sometimes in a parking lot, sometimes in a warehouse, sometimes just a patch of grass with the system backed up to a cinder-block wall.",
      },
      {
        type: 'quote',
        text: "A sound is not the equipment. A sound is the reputation. You can have the biggest rig on the island and still not be a sound.",
        attribution: 'Selector Wasp, Stone Love',
      },
      {
        type: 'p',
        text: "Go once and you understand why so much of modern music — hip-hop, UK garage, jungle, grime, reggaeton — traces a line straight back to these parking lots. The bass gets into your chest and stays there.",
      },
    ],
    relatedSlugs: ['kingston-culture-guide', 'beyond-the-resort'],
  },
  {
    slug: 'luminous-lagoon-falmouth',
    title: "Swimming in Starlight: Jamaica's Luminous Lagoon",
    excerpt:
      'One of only four bioluminescent bays in the world sits in Falmouth. We took the night tour and learned why it draws thousands each year.',
    category: 'Stories',
    image: DESTINATION_IMAGES['Falmouth'],
    readTime: 6,
    publishedAt: '2026-03-19',
    author: simone,
    body: [
      {
        type: 'p',
        text: "At night the lagoon looks like regular black water. Then the boat's engine cuts, someone trails a hand through the surface, and the water lights up — a trail of electric blue that follows the shape of every finger.",
      },
      {
        type: 'p',
        text: "The glow comes from dinoflagellates — single-cell organisms that emit light when disturbed. There are only four places in the world where they concentrate this densely. Falmouth is one of them, and it's the brightest of all four.",
      },
      { type: 'h2', text: 'What the tour is actually like' },
      {
        type: 'p',
        text: "Boats leave the marina around 7pm. It's a short ride out to the middle of the lagoon — maybe fifteen minutes. Once you're there, you jump in. The water is warm. It lights up wherever you move, so swimming feels like you're dragging a comet behind you.",
      },
      {
        type: 'p',
        text: "Ten minutes in, people stop taking photos. The phones don't capture it anyway. You just float on your back and watch the glow spread out around your body like a constellation you made yourself.",
      },
    ],
    relatedSlugs: ['first-time-jamaica', 'beyond-the-resort'],
  },
  {
    slug: 'beyond-the-resort',
    title: 'Beyond the Resort: Why Travelers Are Choosing Local',
    excerpt:
      'The shift toward authentic, locally-led travel is accelerating. Why more visitors are skipping the excursion desk and booking directly with Jamaican creators.',
    category: 'Stories',
    image: DESTINATION_IMAGES['Portland'],
    readTime: 7,
    publishedAt: '2026-03-12',
    author: andre,
    body: [
      {
        type: 'p',
        text: "For thirty years, the Jamaican tourism economy was built on a simple bargain: fly in, stay behind a wall, eat buffet food, book an excursion through the concierge. It worked — for the resorts. The people who actually lived on the island saw very little of it.",
      },
      {
        type: 'p',
        text: "That's starting to change. A new generation of travelers — younger, more skeptical, trained by social media to want the real thing — is bypassing the wall entirely.",
      },
      { type: 'h2', text: 'Why now' },
      {
        type: 'list',
        items: [
          'Social-first discovery — TikTok surfaces local creators the resort desk never would',
          'Price transparency — direct booking cuts 30-50% of the markup',
          'Post-pandemic travel preferences favor small groups over large tours',
          'A generation of Jamaican creators building careers from their craft',
        ],
      },
      {
        type: 'quote',
        text: "The resort asked me to run a two-hour cooking class for forty people. I run a four-hour class for six. I make more money, the guests learn more, and I can actually teach.",
        attribution: 'A Jamaican creator who asked not to be named',
      },
      {
        type: 'p',
        text: "The shift isn't anti-resort. It's anti-intermediary. The best version of a Jamaican vacation still includes a place to sleep. It just doesn't include someone else deciding what a Jamaican experience is supposed to look like.",
      },
    ],
    relatedSlugs: ['first-time-jamaica', 'kingston-sound-system-culture'],
  },
  {
    slug: 'first-time-jamaica',
    title: 'First Time in Jamaica: What You Need to Know',
    excerpt:
      'Currency, safety, weather, getting around, cultural etiquette. Everything you need for your first trip — from a local perspective.',
    category: 'Guides',
    image: DESTINATION_IMAGES['Negril'],
    readTime: 10,
    publishedAt: '2026-03-05',
    author: simone,
    body: [
      {
        type: 'p',
        text: "You'll see a lot of first-timer lists written from a resort lobby. This isn't one of those. This is what we tell friends before they visit.",
      },
      { type: 'h2', text: 'Money' },
      {
        type: 'p',
        text: "USD is accepted everywhere tourists go. You'll get a better rate at cambios than at the airport. Most places give change in JMD even if you pay in USD — factor it in. Tipping is 10-15% and it matters; most service staff depend on it.",
      },
      { type: 'h2', text: 'Getting around' },
      {
        type: 'p',
        text: "Don't rent a car on your first trip. The driving is left-side, fast, and mountain roads have no shoulders. Use private drivers (most hotels can arrange them) or the JUTA network. For short hops, route taxis are cheap and completely safe in daylight.",
      },
      { type: 'h2', text: 'Weather' },
      {
        type: 'p',
        text: "November to April is high season for a reason — dry, breezy, 80°F. May through October is hot and humid, with afternoon showers you can almost set a watch by. Hurricane season peaks August-October. Book with free cancellation.",
      },
      { type: 'h2', text: 'Cultural notes' },
      {
        type: 'list',
        items: [
          "Greet before you ask. 'Good morning' before 'where can I find...'",
          'Jamaicans are direct. Asking twice is not rude; it signals interest.',
          'Patwa is its own language. English works fine, but ask about a word and people light up.',
          "Don't haggle in restaurants. Do haggle in markets — politely.",
        ],
      },
    ],
    relatedSlugs: ['negril-guide', 'kingston-culture-guide'],
  },
  {
    slug: 'negril-guide',
    title: 'The Ultimate Negril Guide',
    excerpt:
      "Seven Mile Beach, Rick's Cafe, hidden coves, and the best jerk on the west coast. A complete guide to Jamaica's most popular destination.",
    category: 'Guides',
    image: DESTINATION_IMAGES['Negril'],
    readTime: 11,
    publishedAt: '2026-02-27',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Negril gets a bad rap from people who only see the strip. The real Negril is a seven-mile beach, a cliffside town, and about a dozen things you won't find on a resort map.",
      },
      { type: 'h2', text: 'The beach' },
      {
        type: 'p',
        text: "Seven Mile Beach actually is about six and a half miles. Public access points run all the way down — you don't need to be a hotel guest. The water is calmest in the morning. By afternoon the breeze picks up; by sunset there's usually a little wave action.",
      },
      { type: 'h2', text: 'The cliffs' },
      {
        type: 'p',
        text: "West End is a different Negril — limestone cliffs, small hotels built into the rock, tide pools, and sunsets that Rick's Cafe gets all the credit for but the smaller bars do just as well. If you want the famous cliff jump without the crowd, try Pirate's Cave or 3 Dives.",
      },
      { type: 'h2', text: 'Food' },
      {
        type: 'list',
        items: [
          'Best jerk: the red roof stand next to the Catcha Falling Star cliff walk',
          'Best breakfast: Sweet Spice, local-Jamaican, no-frills',
          'Best seafood: Ivan\'s, on the cliffs, grilled lobster at sunset',
          'Best rum punch: every third bar on the strip — seriously',
        ],
      },
    ],
    relatedSlugs: ['first-time-jamaica', 'beyond-the-resort'],
  },
  {
    slug: 'kingston-culture-guide',
    title: 'Kingston for Culture Lovers',
    excerpt:
      'Museums, music, street food, and nightlife. Why the capital is the most underrated destination on the island.',
    category: 'Guides',
    image: DESTINATION_IMAGES['Kingston'],
    readTime: 9,
    publishedAt: '2026-02-20',
    author: maya,
    body: [
      {
        type: 'p',
        text: "Most first-time visitors skip Kingston. Most return visitors make it their main stop. The city is loud, fast, unfiltered — and it is where Jamaica actually happens.",
      },
      { type: 'h2', text: 'Music' },
      {
        type: 'p',
        text: "The Bob Marley Museum is the obvious one. Don't skip it. But also visit Trench Town Culture Yard — smaller, rawer, more honest. For a live scene, Usain Bolt's Tracks & Records has big-name artists; for underground, check Kingston Dub Club on Sunday evenings.",
      },
      { type: 'h2', text: 'Food' },
      {
        type: 'p',
        text: "Devon House for ice cream (yes, really). Gloria's in Port Royal for seafood on the water. Scotchies for jerk if you can't make it to Portland. And the patty scene is world-class — Juici Patties gets the attention but Tastee has a better flaky crust.",
      },
      { type: 'h2', text: 'Nightlife' },
      {
        type: 'p',
        text: "Kingston nightlife runs late — most dances don't start until midnight. Mojito Mondays in the hills, weekend parties around Half Way Tree, and the sound-system dances we wrote about are the thing to seek out. Dress up. Kingston notices.",
      },
    ],
    relatedSlugs: ['kingston-sound-system-culture', 'beyond-the-resort'],
  },
]

export const BLOG_POSTS: BlogPost[] = [...HAND_POSTS, ...AUTO_POSTS]

export const BLOG_CATEGORIES: (BlogCategory | 'All')[] = [
  'All',
  'Stories',
  'Guides',
  'Food',
  'Culture',
  'Adventure',
]

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug)
}

export function getRelatedPosts(post: BlogPost, limit = 3): BlogPost[] {
  const explicit = (post.relatedSlugs ?? [])
    .map((s) => BLOG_POSTS.find((p) => p.slug === s))
    .filter((p): p is BlogPost => !!p)

  if (explicit.length >= limit) return explicit.slice(0, limit)

  const rest = BLOG_POSTS.filter(
    (p) => p.slug !== post.slug && !explicit.some((e) => e.slug === p.slug),
  )
  return [...explicit, ...rest].slice(0, limit)
}

export function formatPostDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
