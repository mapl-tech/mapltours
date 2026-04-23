import type { BlogPost, BlogAuthor } from './blog'
import { BLOG_IMAGES } from './blog-images'

const maya: BlogAuthor = { name: 'Maya Clarke', role: 'Culture Writer', initials: 'MC' }
const andre: BlogAuthor = { name: 'Andre Bennett', role: 'Senior Editor', initials: 'AB' }
const simone: BlogAuthor = { name: 'Simone Thompson', role: 'Travel Guide', initials: 'ST' }

export const POSTS_4: BlogPost[] = [
  {
    slug: 'royalton-negril-review',
    title: "Royalton Negril: Modern All-Inclusive, Honest Review",
    excerpt:
      "Our editors tour the Royalton Negril — a newer all-inclusive on Bloody Bay. What actually works, what underwhelms, and who it fits.",
    category: 'Guides',
    image: BLOG_IMAGES['royalton-negril-review'],
    readTime: 8,
    publishedAt: '2026-01-01',
    author: simone,
    body: [
      {
        type: 'p',
        text: "The Royalton Negril sits at the quieter end of Bloody Bay, about twenty minutes north of the Seven Mile strip. It opened in 2018 and still photographs like a brochure — a low white arc of rooms hugging 550 feet of its own beach, with the kind of infinity-pool geometry that looks designed for a drone shot.",
      },
      {
        type: 'p',
        text: "We visited the Royalton Negril as part of an editorial swing through Westmoreland to compare the newer all-inclusives against the older Negril mainstays. What follows is a third-person read from the property tour, a lunch, and two nights spent walking the grounds — not a vacation review.",
      },
      { type: 'h2', text: 'What the Royalton Negril does well' },
      {
        type: 'p',
        text: "The rooms are the strongest argument. Standard Luxury Junior Suites run around 560 square feet — generous by Jamaican resort standards — with a real soaking tub, blackout curtains, and USB outlets next to every bed. The DreamBed mattress is better than almost anything you will find in a resort room at this price point.",
      },
      {
        type: 'p',
        text: "Food is the second surprise. Nine restaurants is a reasonable count for a property this size, and the Italian room (Grazie) and the hibachi (Zen) are both genuinely competent. The buffet is not the event here — which, if you have spent time in older all-inclusives, is a relief.",
      },
      {
        type: 'quote',
        text: "The Royalton gets the boring stuff right. Clean rooms, working AC, decent coffee at 6am. That is harder to find in the Caribbean than you would think.",
        attribution: "— Simone Thompson, Travel Guide",
      },
      { type: 'h2', text: 'Where it falls short' },
      {
        type: 'list',
        items: [
          "Bloody Bay is beautiful but not Seven Mile — expect a 15-minute drive for the classic Negril strip and cliff scene",
          "Entertainment is polished-generic: pool games by day, DJ-led theme nights, little that feels Jamaican",
          "Wi-Fi is included but uneven in far wings — the Diamond Club upgrade fixes most of this",
          "A la carte restaurants require reservations you should book on arrival or risk a buffet dinner",
        ],
      },
      {
        type: 'p',
        text: "The service pitch leans heavily on Diamond Club — a paid upgrade that gets you a butler, upgraded liquor, and beach-bed service. Without it, you are in a well-run but very standard all-inclusive rhythm. With it, the Royalton Negril starts to compete with properties asking twice as much per night.",
      },
      {
        type: 'p',
        text: "Families do well here. Splash Park, a kids club that actually runs, and a lazy river keep children occupied without parental babysitting. Couples who want a quiet cliffside Negril should probably look at the West End instead.",
      },
      { type: 'h2', text: 'Practical notes' },
      {
        type: 'p',
        text: "Expect roughly 75 minutes from Montego Bay's Sangster airport by private transfer, longer by shuttle. Rates in shoulder season start around $280 per person per night double-occupancy; Diamond Club adds $80 to $120. The beach is public by Jamaican law — the north end of Bloody Bay is a short, safe walk and worth taking.",
      },
      {
        type: 'p',
        text: "Book Royalton Negril if you want a newer room, reliable food, and a family-friendly beach. Skip it if you came to Jamaica for Jamaica. Either way, leave the property — our curated Westmoreland experiences at /explore are where the trip actually happens.",
      },
    ],
    relatedSlugs: ['azul-beach-resort-negril-review', 'negril-seven-mile-truth'],
  },
  {
    slug: 'azul-beach-resort-negril-review',
    title: "Azul Beach Resort Negril: Who It Actually Suits",
    excerpt:
      "The Azul Beach Resort Negril is pitched as a family-friendly Karisma property. Our editors walked the grounds and report back on the honest fit.",
    category: 'Guides',
    image: BLOG_IMAGES['azul-beach-resort-negril-review'],
    readTime: 8,
    publishedAt: '2026-01-08',
    author: simone,
    body: [
      {
        type: 'p',
        text: "If you have seen the brochure shot — the long reflecting pool, the Gourmet Inclusive tagline, the Nick Jr. characters at breakfast — you already know the pitch. The Azul Beach Resort Negril sits on Bloody Bay next to its adults-only sister property, and it wants to be the polished family address on Jamaica's west coast.",
      },
      {
        type: 'p',
        text: "We toured Azul Beach Resort Negril on the same editorial visit that covered the Royalton, and the contrast is instructive. Azul is smaller, more design-forward, and more expensive per night — and it works hardest for a narrower guest than its marketing suggests.",
      },
      { type: 'h2', text: 'What the Azul Beach Resort Negril gets right' },
      {
        type: 'p',
        text: "The rooms earn the rate. Swim-up suites with direct pool access, genuine ocean-front layouts, and a bathroom that feels like a small spa. Families with toddlers — the demographic this property is most obviously built for — get baby concierge service that will stock your room with cribs, bottle warmers, and strollers before you arrive.",
      },
      {
        type: 'p',
        text: "Food under the Gourmet Inclusive banner is better than most all-inclusives and about one tier below a standalone restaurant. The Mexican kitchen is the sleeper — the kitchen is staffed by Karisma veterans from Riviera Maya — and breakfast is a buffet you will want to eat at.",
      },
      {
        type: 'quote',
        text: "Azul is the rare resort where you can bring a two-year-old and still enjoy dinner. That is not nothing.",
        attribution: "— Simone Thompson, Travel Guide",
      },
      { type: 'h2', text: 'Where it falls short' },
      {
        type: 'list',
        items: [
          "Not a party resort — couples without kids will feel demographically out of place",
          "Beach is on Bloody Bay, calm and family-safe but less iconic than Seven Mile",
          "The 'Gourmet Inclusive' label inflates expectation; it is very good, not revelatory",
          "Grounds are compact, so loungers go fast in peak weeks",
          "Premium wine and top-shelf spirits are not fully included — the upsells are real",
        ],
      },
      {
        type: 'p',
        text: "The right guest here is a family with kids under ten, a budget of $450 to $600 per night double, and a preference for polish over party. Honeymooners should book the adults-only Azul Sensatori next door or look at Round Hill in Montego Bay. Groups of friends will find the vibe oddly quiet by 10pm.",
      },
      {
        type: 'p',
        text: "One underrated advantage: Azul Beach Resort Negril is small enough that staff remember your name on day two. In a resort market dominated by 500-key mega-properties, that scale is increasingly rare.",
      },
      { type: 'h2', text: 'Practical notes' },
      {
        type: 'p',
        text: "Transfers from Montego Bay run 75 to 90 minutes. Rates in high season (mid-December through March) trend $550 to $750 per night for a standard ocean view, double-occupancy. Bloody Bay calm water is a genuine plus for toddlers; the nearest real cliff scene is a 20-minute taxi ride to West End.",
      },
      {
        type: 'p',
        text: "Azul Beach Resort Negril earns its place on a short list for young families. For everyone else, consider the experiences waiting beyond the gate — our Negril picks at /explore cover the cliffs, the jerk, and the sunsets this property only shows you in a brochure.",
      },
    ],
    relatedSlugs: ['royalton-negril-review', 'jamaica-honeymoon-guide'],
  },
  {
    slug: 'beaches-ocho-rios-review',
    title: "Beaches Ocho Rios: The Family All-Inclusive, Honestly",
    excerpt:
      "Beaches Ocho Rios is the Sandals-owned family resort on the north coast. Our editors assess who it suits and where it underdelivers.",
    category: 'Guides',
    image: BLOG_IMAGES['beaches-ocho-rios-review'],
    readTime: 9,
    publishedAt: '2026-01-15',
    author: simone,
    body: [
      {
        type: 'p',
        text: "The water park is the first thing you see from the main lobby at Beaches Ocho Rios. Five slides, a lazy river, a surf simulator — a clear, deliberate signal about who this resort is for. Not couples. Not wellness seekers. Families, specifically families with kids old enough to spend four hours in a swimsuit.",
      },
      {
        type: 'p',
        text: "We toured Beaches Ocho Rios during the same north-coast editorial week as the Royalton and Azul visits. Beaches is the oldest of the three and the most committed to a single demographic — which is its strength and, in places, its problem.",
      },
      { type: 'h2', text: 'What Beaches Ocho Rios does well' },
      {
        type: 'p',
        text: "The Sesame Street partnership is more than a photo op. Character breakfasts, bedtime tuck-ins, and a pirate ship playground give younger kids a specific emotional anchor to the trip. For a parent whose toddler will talk about Elmo for six months after returning home, it is worth the premium.",
      },
      {
        type: 'p',
        text: "The family suites solve a real problem. Separate bunk rooms, two bathrooms, and butler service (in the top tiers) mean parents can actually have a glass of wine on the balcony after bedtime. Twelve restaurants is generous, though a third of them are walk-in only and the line discipline at the Japanese hibachi spot collapses in peak weeks.",
      },
      {
        type: 'quote',
        text: "Beaches is not where you go to fall in love with Jamaica. It is where you go to make your eight-year-old think vacation is the best week of the year.",
        attribution: "— Simone Thompson, Travel Guide",
      },
      { type: 'h2', text: 'Where it falls short' },
      {
        type: 'list',
        items: [
          "The grounds feel dated in spots — lobby and some room categories badly need a refresh",
          "Ocho Rios town is walkable from the gate, and that proximity brings cruise-port crowds and vendors",
          "Top-tier butler suites price-compete with resorts that feel newer and quieter",
          "No adults-only pool of real consequence, which grinds on couples traveling with their kids but wanting occasional distance",
          "Weak local-Jamaican cooking on property — you will eat better in town",
        ],
      },
      {
        type: 'p',
        text: "Beaches Ocho Rios is also the wrong base if you want Blue Mountains access, Portland waterfalls, or any serious Kingston-side itinerary. It is a self-contained fortress of a trip. That works for families and it works less well for curious adults who booked because the brochure promised Jamaica.",
      },
      {
        type: 'p',
        text: "Leave the gate at least three times. Mystic Mountain bobsled, Dunn's River Falls, and a jerk lunch at Scotchies on the coastal highway will do more for your memory of Ocho Rios than any hour spent at the water park.",
      },
      { type: 'h2', text: 'Practical notes' },
      {
        type: 'p',
        text: "Transfer from Montego Bay's Sangster airport runs 90 to 110 minutes depending on traffic. Kingston's Norman Manley airport is closer on paper but a harder drive over the mountains. High-season rates start around $850 per night for a family of four in a Luxury room; Butler-level suites clear $1,500. The beach is small and calm — adequate, not the reason to come.",
      },
      {
        type: 'p',
        text: "Beaches Ocho Rios earns its booking when the kids are the trip. If you have the bandwidth to leave, our Ocho Rios experiences at /explore will round the week into something more Jamaican and less theme-park.",
      },
    ],
    relatedSlugs: ['ocho-rios-complete-guide', 'jamaica-all-inclusive-tier-list'],
  },
  {
    slug: 'jamaica-primer-2026',
    title: "Jamaica: A Destination Primer for 2026",
    excerpt:
      "A confident primer on Jamaica for 2026 — arrival, getting around, safety, weather, what to see, what to eat, culture, and budget ranges.",
    category: 'Guides',
    image: BLOG_IMAGES['jamaica-primer-2026'],
    readTime: 11,
    publishedAt: '2026-01-22',
    author: andre,
    body: [
      {
        type: 'p',
        text: "Jamaica in 2026 is not the Jamaica of the brochure. Tourist arrivals crossed four million last year, a new highway network connects the north coast in half the time it used to take, and a generation of Jamaican creators is dragging the island's identity out of the resort lobbies and back onto the street.",
      },
      {
        type: 'p',
        text: "This Jamaica primer is for travelers who want the confident version of the briefing — what actually matters, what does not, and what to skip.",
      },
      { type: 'h2', text: 'Arrival and getting around' },
      {
        type: 'p',
        text: "Most visitors fly into Sangster International (MBJ) in Montego Bay. Norman Manley (KIN) in Kingston is the better choice for capital-forward trips and Blue Mountains access. Immigration runs 20 to 60 minutes depending on cruise overlap; the Club Mobay fast-track lounge is worth $40 if you land during peak.",
      },
      {
        type: 'p',
        text: "Skip the rental car on a first trip. Jamaican driving is left-side, fast, and the secondary roads punish casual drivers. Book private transfers through your hotel or a JUTA-licensed driver. Route taxis are cheap, reliable in daylight, and not intended for long hops with luggage.",
      },
      { type: 'h2', text: 'Safety and weather' },
      {
        type: 'p',
        text: "Crime is concentrated in specific urban neighborhoods you have no reason to visit. The resort corridors, Blue Mountains, Portland, and the West End of Negril are safe in the usual common-sense ways — do not flash cash, do not walk unlit alleys at 2am, do not buy weed from strangers on the beach. Trust your gut.",
      },
      {
        type: 'p',
        text: "High season runs mid-December through April: dry, 80°F, breezy. June through November is hotter and wetter, with hurricane peak in September and October. Shoulder weeks in late April and early November are the sweet spot — rates drop 25 to 40 percent and the weather is still reliable.",
      },
      {
        type: 'quote',
        text: "The real secret is the week after Easter. Rates fall, the island exhales, and the Jamaica you came to see is actually there.",
        attribution: "— Andre Bennett, Senior Editor",
      },
      { type: 'h2', text: 'What to see, eat, and know' },
      {
        type: 'list',
        items: [
          "See: Negril cliffs at sunset, Blue Mountains at sunrise, Kingston on a Sunday night",
          "Eat: Boston Bay jerk, Treasure Beach seafood, a patty from Tastee or Juici in Kingston",
          "Drink: Blue Mountain coffee at altitude, Appleton 12 neat, a Red Stripe that cost under $3",
          "Hear: a sound-system dance in Kingston, a reggae session at Dub Club on a Sunday",
          "Skip: tourist-trap Dunn's River day if you can do Reach Falls or Blue Hole instead",
        ],
      },
      {
        type: 'p',
        text: "Cultural notes matter more than packing lists. Greet before you ask. Tipping is 10 to 15 percent and it matters. Patwa is a language; English will get you through everything, but asking about a word opens conversations. Respect the pace — 'soon come' is not a delay tactic, it is a way of life.",
      },
      { type: 'h2', text: 'Budget and practical notes' },
      {
        type: 'p',
        text: "Rough ranges for a weeklong trip, per person, double-occupancy, excluding flights: budget $1,200 to $1,800 (guesthouses, route taxis, street food); mid-range $2,000 to $3,200 (boutique hotels, private drivers for day trips, a mix of local and resort meals); premium $3,500 to $6,000+ (top resorts, private transfers, curated experiences). USD is accepted everywhere tourist-facing; cambios beat airport rates every time.",
      },
      {
        type: 'p',
        text: "The Jamaica that rewards repeat visitors is the one you build yourself. Our curated experiences at /explore are where most of our readers finally stop booking through a resort concierge and start booking directly with Jamaicans.",
      },
    ],
    relatedSlugs: ['first-time-jamaica', 'best-time-to-visit-jamaica'],
  },
  {
    slug: 'montego-bay-fast-start',
    title: "Montego Bay: The Fast-Start Guide",
    excerpt:
      "A fast-start Montego Bay guide for travelers who land at Sangster with two days and no plan. What to do, eat, and skip.",
    category: 'Guides',
    image: BLOG_IMAGES['montego-bay-fast-start'],
    readTime: 9,
    publishedAt: '2026-01-29',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Most travelers see Montego Bay twice — once driving out of the airport and once driving back in. It deserves more than that. If you have 48 hours before heading to Negril or Ocho Rios, Montego Bay repays the detour.",
      },
      {
        type: 'p',
        text: "This Montego Bay fast-start guide assumes you land at Sangster with a carry-on and a loose plan. It is not a comprehensive city guide. It is the version we send to friends arriving on a Thursday morning with Sunday flights already booked.",
      },
      { type: 'h2', text: 'Where to base yourself' },
      {
        type: 'p',
        text: "Three clusters, each with a different trip shape. The Hip Strip (Gloucester Avenue) is walkable, loud, and full of bars — best for short trips and first-timers. Rose Hall and the resort row east of town is polished, quieter, and better for couples. Downtown Montego Bay has the market, the food, and zero hotels we recommend — come for the day, sleep elsewhere.",
      },
      {
        type: 'p',
        text: "For a two-night fast start, the Hip Strip wins on logistics. You can walk to food, drinks, and the beach without a taxi, which matters when you have only one evening.",
      },
      { type: 'h2', text: 'What to actually do' },
      {
        type: 'p',
        text: "Day one: Doctor's Cave Beach in the morning (arrive before 10am to beat the cruise crowd), jerk lunch at Scotchies on the coastal highway, sunset drinks at Pier 1 or Margaritaville. Day two: a half-day at Rose Hall Great House if you like history, otherwise a drive to Rocklands Bird Sanctuary for hummingbirds that land on your finger.",
      },
      {
        type: 'quote',
        text: "Montego Bay is a city people apologize for. They should not. The food, the market, and the music at night are as Jamaican as anywhere on the island.",
        attribution: "— Simone Thompson, Travel Guide",
      },
      { type: 'h2', text: 'Where to eat and drink' },
      {
        type: 'list',
        items: [
          "Scotchies — the jerk reference point for the west coast, a 15-minute drive east of town",
          "Pork Pit — walkable from the Hip Strip, a cheaper jerk option that locals actually use",
          "Pelican Grill — classic Jamaican diner on Gloucester, strong breakfast and oxtail",
          "The Houseboat Grill — floating restaurant in Bogue Lagoon, romantic without trying",
          "Marguerites — dated but the sunset seat on the cliffs is still the best in town",
        ],
      },
      {
        type: 'p',
        text: "Skip the Hip Strip after 1am. The bars are fine; the vibe outside them can turn. Rose Hall clubs and resort nightlife are the safer late-night bet. For a sound-system night, you will need to drive to Kingston — Montego Bay's scene is thinner.",
      },
      { type: 'h2', text: 'Practical notes' },
      {
        type: 'p',
        text: "Sangster International to most Montego Bay hotels is a 10 to 20 minute taxi ride — $15 to $25 JUTA, less by Knutsford shuttle. Budget the Hip Strip at $150 to $250 per night shoulder-season; Rose Hall resorts clear $400 easily. Route taxis run the length of the city for under $3 in JMD — keep small bills.",
      },
      {
        type: 'p',
        text: "Use the fast start as a bridge. Once you have a day under your belt, our Montego Bay curated experiences at /explore will point you toward the creators and drivers locals actually hire.",
      },
    ],
    relatedSlugs: ['montego-bay-beyond-the-strip', 'montego-bay-tours-ranked'],
  },
  {
    slug: 'kingston-why-stay-longer',
    title: "Kingston, Jamaica: Why You Should Stay Longer",
    excerpt:
      "Most visitors give Kingston Jamaica one night. That is a mistake. The argument for three to four days — music, food, galleries, Blue Mountains.",
    category: 'Stories',
    image: BLOG_IMAGES['kingston-why-stay-longer'],
    readTime: 10,
    publishedAt: '2026-02-05',
    author: andre,
    body: [
      {
        type: 'p',
        text: "Kingston Jamaica is the city travelers apologize for skipping. They fly into Montego Bay, spend a week on the north coast, fly out. Somewhere in the middle a friend mentions they should have seen the capital. The friend is right.",
      },
      {
        type: 'p',
        text: "The argument of this piece is narrow and specific. Kingston deserves three to four days on a Jamaican itinerary, not one. Not because it is prettier than Negril — it is not — but because it is where the island's music, food, and contemporary culture actually live.",
      },
      { type: 'h2', text: 'Why one day is not enough' },
      {
        type: 'p',
        text: "On a single Kingston day you get the Bob Marley Museum, a patty, and a rushed dinner before the drive back over the mountains. That is a sampler. The city unfolds in layers that require time the way a New Orleans or a Mexico City does — you need to be in it for a Thursday night and a Sunday afternoon to understand what the rhythm is.",
      },
      {
        type: 'p',
        text: "Three days gives you: one afternoon for the Bob Marley Museum and Trench Town, one for the National Gallery and the downtown food scene, one for a Blue Mountains day trip, and two evenings for music. Four days adds a slower pace and probably a beach day in Port Royal.",
      },
      { type: 'h2', text: 'The case for Kingston' },
      {
        type: 'p',
        text: "Music first. Kingston is the only place on earth where reggae, dub, dancehall, rocksteady, and ska were invented in sequence, within a three-mile radius, over roughly twenty-five years. A weekend night in the right dance is a primary-source history lesson you cannot replicate elsewhere.",
      },
      {
        type: 'quote',
        text: "You cannot understand Jamaica from Negril. You can understand it from Kingston. The west coast is the marketing; the capital is the argument.",
        attribution: "— Andre Bennett, Senior Editor",
      },
      { type: 'h2', text: 'What to do with the extra days' },
      {
        type: 'list',
        items: [
          "Bob Marley Museum on day one — Tuff Gong recording sessions still run, book ahead",
          "Trench Town Culture Yard on day two — smaller, rawer, led by residents",
          "National Gallery of Jamaica downtown — serious collection, underrated",
          "Blue Mountain coffee farm day trip — Craighton or Clifton Mount, 45 minutes out",
          "Sunday night at Dub Club in the hills above town — the view alone earns the drive",
        ],
      },
      {
        type: 'p',
        text: "Food is the second argument. Kingston's patty-shop scene is a cultural institution — Tastee and Juici both have loyalists. Gloria's in Port Royal serves grilled fish next to the sea. Uptown, Mother's Corner and Opa offer the Jamaican-Mediterranean mash-up that the diaspora has pushed into serious territory over the last decade.",
      },
      {
        type: 'p',
        text: "The third argument is practical. Kingston is cheaper than the coast. A three-night Kingston leg inside a weeklong trip actually lowers the total cost — better hotels at lower rates, cheaper restaurants, no resort premium on drinks.",
      },
      { type: 'h2', text: 'Practical notes' },
      {
        type: 'p',
        text: "Fly into Norman Manley International (KIN) to avoid the three-hour drive from Sangster. Base yourself uptown in New Kingston or Half Way Tree — safer, walkable, closer to restaurants and music venues. Budget $180 to $350 per night for solid mid-range hotels; private drivers run $120 to $180 for a full Kingston day.",
      },
      {
        type: 'p',
        text: "Give Kingston Jamaica the time. The rest of your trip will make more sense because of it. Our Kingston experiences at /explore go directly to the creators who make the city the capital it is.",
      },
    ],
    relatedSlugs: ['kingston-culture-guide', 'kingston-sound-system-culture'],
  },
  {
    slug: 'trelawny-parish-guide',
    title: "Trelawny: The Parish Most Travelers Skip",
    excerpt:
      "Trelawny Jamaica holds Falmouth, the luminous lagoon, and some of the prettiest inland country on the island. A confident parish guide.",
    category: 'Guides',
    image: BLOG_IMAGES['trelawny-parish-guide'],
    readTime: 9,
    publishedAt: '2026-02-12',
    author: maya,
    body: [
      {
        type: 'p',
        text: "Trelawny Jamaica is the parish cruise ships pass through and independent travelers drive over. The Falmouth pier handles roughly a million passengers a year; almost none of them see the parish beyond the manicured shopping complex next to the port.",
      },
      {
        type: 'p',
        text: "That is a missed parish. Trelawny holds one of only four bioluminescent bays in the world, a Georgian-era town center that predates most of Kingston, an inland country of yam fields and Cockpit karst, and the birthplace of Usain Bolt — all in a single 338-square-mile slice of the north coast.",
      },
      { type: 'h2', text: 'Falmouth: past the cruise pier' },
      {
        type: 'p',
        text: "Falmouth town was laid out in 1769 as a sugar-export port and still has one of the best-preserved Georgian street grids in the Caribbean. Walk three blocks inland from the pier and you are in residential streets that have not changed in two centuries — gingerbread trim, stone courthouses, the Baptist Manse where William Knibb led the parish's emancipation-era abolition movement.",
      },
      {
        type: 'p',
        text: "The Falmouth Courthouse (1817) and the Water Square are the obvious heritage stops. Less obvious: the weekly Bend-Down Market on Wednesdays, where inland farmers bring yam, scallion, scotch bonnet, and breadfruit straight from the field. It is the most Jamaican hour you can spend in the parish.",
      },
      { type: 'h2', text: 'The luminous lagoon' },
      {
        type: 'p',
        text: "The lagoon is the main reason adventurous travelers add Trelawny to an itinerary. Single-cell dinoflagellates light up when disturbed — a trail of blue-green that follows every swimmer. Boats depart the marina around 7pm; tours run about 90 minutes including a swim. It is one of only four places in the world where the concentration is dense enough to glow this brightly.",
      },
      {
        type: 'quote',
        text: "Trelawny is the parish Jamaicans love because outsiders ignore it. The cruise crowd stays in the shopping plaza; the real Trelawny is 15 minutes inland.",
        attribution: "— Maya Clarke, Culture Writer",
      },
      { type: 'h2', text: 'What else is worth the detour' },
      {
        type: 'list',
        items: [
          "Good Hope Estate — 2,000-acre plantation-era estate, horseback trails and a river tubing run",
          "Martha Brae River rafting — 30-foot bamboo rafts, a calmer cousin of Portland's Rio Grande",
          "Windsor Cave — wild, unlit karst cave, bat colonies, requires a local guide",
          "Sherwood Content — tiny village, birthplace of Usain Bolt, still has his running school",
          "Burwood Beach — long quiet stretch, local families on weekends, zero cruise passengers",
        ],
      },
      {
        type: 'p',
        text: "Inland Trelawny is Cockpit Country edge — limestone hills so rugged the British colonial army gave up trying to pacify them and signed a treaty with the Maroons instead. The scenery between Duncans and Albert Town is some of the prettiest rural driving on the island.",
      },
      {
        type: 'p',
        text: "Trelawny food is its own flavor. Yam is the starch; the parish grows more of it than any other in Jamaica. Duckunoo, jackfruit, and fresh breadfruit roast on roadside fires. You will eat better at a Falmouth jerk stand than at most north-coast resort buffets.",
      },
      { type: 'h2', text: 'Practical notes' },
      {
        type: 'p',
        text: "Falmouth sits roughly 35 minutes east of Montego Bay's Sangster airport. Most travelers visit as a day trip from Montego Bay or add a single Falmouth overnight en route to Ocho Rios. A handful of boutique guesthouses near Good Hope offer the better base if you want inland access. Budget $80 to $180 per night, plus a driver at $120 for a full parish day.",
      },
      {
        type: 'p',
        text: "Trelawny Jamaica rewards the detour. Our Falmouth-area experiences at /explore — lagoon night tours, Martha Brae rafting, Good Hope horseback — are what make the parish more than a cruise port.",
      },
    ],
    relatedSlugs: ['luminous-lagoon-falmouth', 'montego-bay-beyond-the-strip'],
  },
  {
    slug: 'portland-parish-guide',
    title: "Portland Parish: Jamaica's Wild Coast",
    excerpt:
      "Portland Jamaica is the parish locals love — jungle, waterfalls, Boston Bay jerk, Port Antonio. An argument for the island's wild northeast.",
    category: 'Stories',
    image: BLOG_IMAGES['portland-parish-guide'],
    readTime: 10,
    publishedAt: '2026-02-19',
    author: andre,
    body: [
      {
        type: 'p',
        text: "The drive east from Kingston climbs through pine ridges, drops over the crest into banana country, and hits the north coast at Buff Bay. From there to Port Antonio the road narrows, the sea shows up on your left, and the parish announces itself in specific sensory terms — a wall of pimento smoke from a jerk pit, the smell of wet ferns, the sound of a waterfall you cannot see yet.",
      },
      {
        type: 'p',
        text: "Portland Jamaica is the parish locals cite when you ask them their favorite. It is also the parish that never quite breaks through to mainstream tourism, partly because it is a three-hour drive from either airport and partly because the weather is less predictable than the north-coast marketing departments prefer.",
      },
      { type: 'h2', text: 'Why Portland is different' },
      {
        type: 'p',
        text: "This is the wet side of the island. Annual rainfall on the eastern ridges tops 200 inches in places — twice the national average. That rain produces the waterfalls, the rivers, the jungle canopy, and the impossibly green farmland that make Portland photograph like Costa Rica more than like the Caribbean.",
      },
      {
        type: 'p',
        text: "It also produces a different tourism pace. There is no Hip Strip here. Port Antonio is a small town of 15,000, the resorts are small and eccentric, and dinner reservations are mostly unnecessary. The rhythm is slower than Negril, more coherent than Ocho Rios, and closer to what rural Jamaica actually feels like.",
      },
      { type: 'h2', text: 'What to do' },
      {
        type: 'p',
        text: "Reach Falls in the rainforest inland from Manchioneal — three tiers, a jungle hike, far fewer crowds than Dunn's River. The Blue Lagoon, 180 feet deep and the color of stained glass. Rio Grande bamboo rafting down a lazy jungle river led by a raft captain who will point out edible plants. Winnifred Beach, the last major public beach in Jamaica that successfully fought off private development.",
      },
      {
        type: 'quote',
        text: "Portland is the Jamaica the rest of the island is pretending to be. No strip, no cruise port, no brochure. Just the coast and the rain and the people who stayed.",
        attribution: "— Andre Bennett, Senior Editor",
      },
      { type: 'h2', text: 'Boston Bay and the jerk' },
      {
        type: 'list',
        items: [
          "Boston Bay — the literal birthplace of jerk, pimento wood pits, a roadside scene, not a restaurant",
          "Try at least two stands — every pit master has a different spice paste",
          "Go early in the afternoon, not after 6pm when the best cuts have already sold out",
          "Order the pork shoulder if it is available — the chicken gets more press, the pork is better",
          "Pair with festival bread and bammy, never with ketchup",
        ],
      },
      {
        type: 'p',
        text: "Portland's jerk tradition is not a tourist pitch. It is a 300-year-old cooking method that started with Maroons smoking wild boar to preserve it in the hills. The Boston Bay pits are its cathedral, and a lunch there is the single best food hour on the island for most people who try it.",
      },
      {
        type: 'p',
        text: "Beyond the food and the water, Portland is a hiking parish. Trails run into the John Crow Mountains, up to the Nanny Falls above Moore Town, and along the undeveloped stretches of coast between Long Bay and Manchioneal. Bring waterproof shoes. Expect to get wet.",
      },
      { type: 'h2', text: 'Practical notes' },
      {
        type: 'p',
        text: "Fly into Kingston (KIN) and drive 2.5 hours over the mountains, or Montego Bay (MBJ) and drive 4 hours along the coast. Port Antonio is the base for most trips. Rates are reasonable — boutique guesthouses run $120 to $220, the Trident and the GeeJam are the high-end exceptions at $500+ per night. Weather risk is real in September and October; February through April is the sweet spot.",
      },
      {
        type: 'p',
        text: "Portland Jamaica is where long-time Jamaica travelers eventually go back. Our Portland experiences at /explore — Rio Grande rafting, Boston Bay jerk, Reach Falls — are the short list a Jamaican would send their own visiting cousin.",
      },
    ],
    relatedSlugs: ['birthplace-of-jerk-boston-bay', 'reach-falls-vs-dunns-river'],
  },
  {
    slug: 'best-time-to-visit-jamaica',
    title: "The Best Time to Visit Jamaica, Month by Month",
    excerpt:
      "The best time to visit Jamaica depends on what you want — cheapest week, best weather, lowest crowds. A month-by-month breakdown with honest trade-offs.",
    category: 'Guides',
    image: BLOG_IMAGES['best-time-to-visit-jamaica'],
    readTime: 9,
    publishedAt: '2026-02-26',
    author: simone,
    body: [
      {
        type: 'p',
        text: "The best time to visit Jamaica depends on what you are optimizing for. There is no single answer, because the island's weather, crowds, and prices move on three different calendars that rarely align neatly.",
      },
      {
        type: 'p',
        text: "This is a month-by-month breakdown, written for the traveler who is flexible on dates and wants to make a deliberate choice rather than a default one.",
      },
      { type: 'h2', text: 'High season: mid-December through April' },
      {
        type: 'p',
        text: "The brochure months. Dry weather, 78-82°F highs, steady northeast trade winds. January and February are the driest — under two inches of rainfall in most of the coastal parishes. This is also when Jamaica is most expensive and most booked; resort rates run 40-70 percent above shoulder season.",
      },
      {
        type: 'p',
        text: "Specific high-season trade-offs: Christmas-New Year week prices clear $900-$1,200 per night at mid-range all-inclusives; Presidents' Day and spring-break weeks fill resorts with a college-age crowd that changes the vibe materially. If you want quiet high-season, target the first two weeks of December or the week after Presidents' Day.",
      },
      { type: 'h2', text: 'Shoulder season: May and November' },
      {
        type: 'p',
        text: "The value sweet spot. Rates drop 25-40 percent, the weather is still largely reliable, and the crowds thin dramatically. May sees the first of the afternoon showers — usually 30-45 minutes, then clear. November arrives on the back end of hurricane season and the island exhales.",
      },
      {
        type: 'quote',
        text: "The best time to visit Jamaica is the first week of November. The rates have dropped, the storms have passed, and the island has its rhythm back.",
        attribution: "— Simone Thompson, Travel Guide",
      },
      { type: 'h2', text: 'Low season: June through October' },
      {
        type: 'list',
        items: [
          "June — hot, humid, and cheap; afternoon rain is daily but brief",
          "July-August — summer holiday crowds from Europe, Jamaican carnival weeks",
          "September — peak hurricane risk, lowest rates of the year, book refundable",
          "October — still wet, but Reggae Sumfest and Restaurant Week fall here",
          "Early November — storms fading, the deals carry over, weather stabilizing",
        ],
      },
      {
        type: 'p',
        text: "Hurricane risk is real but over-stated. Direct hits are rare; peripheral weather is common. Book with free cancellation between June and October, watch the National Hurricane Center's 7-day outlook, and you will be fine most years. 2020's Beryl landfall and 2023's heavy season were outliers — the decade-average direct-hit rate is under one storm per year.",
      },
      {
        type: 'p',
        text: "Event calendar matters too. Reggae Sumfest (late July) is the Caribbean's biggest music festival — book Montego Bay six months out. Rebel Salute (mid-January) is more roots-focused, smaller, in St. Ann. Kingston Restaurant Week runs two weeks in early November; the uptown food scene is worth timing around it.",
      },
      { type: 'h2', text: 'Practical notes by traveler type' },
      {
        type: 'p',
        text: "Families with school-aged kids: target the first week of June or the last week of October. Empty resorts, manageable weather, rates 30 percent off peak. Couples prioritizing weather: mid-January through early March. Budget travelers: September, with cancellable bookings. Hikers: February for dry Blue Mountains trails. Music travelers: Sumfest week (July) or Rebel Salute (January).",
      },
      {
        type: 'p',
        text: "Once you have the month, the rest follows. Our Jamaica experiences at /explore run year-round — pair the right week with the right creator and the trip builds itself.",
      },
    ],
    relatedSlugs: ['jamaica-primer-2026', 'first-time-jamaica'],
  },
  {
    slug: 'jamaica-currency-and-money',
    title: "Jamaica Currency and Money: What You Need to Know",
    excerpt:
      "A practical Jamaica currency guide — USD acceptance, JMD basics, cambios, tipping, ATM networks, and where cards actually work.",
    category: 'Guides',
    image: BLOG_IMAGES['jamaica-currency-and-money'],
    readTime: 8,
    publishedAt: '2026-03-05',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Jamaica currency runs on two rails. The Jamaican dollar (JMD) is the official currency, and the US dollar (USD) is accepted almost everywhere a tourist spends money. Knowing which to use where saves roughly 5 to 10 percent over a weeklong trip.",
      },
      {
        type: 'p',
        text: "This is a practical Jamaica currency and money guide — what to bring, where to exchange, when to pay local, and how tipping actually works. Numbers reflect early-2026 rates.",
      },
      { type: 'h2', text: 'USD vs JMD: where each works' },
      {
        type: 'p',
        text: "USD is accepted at virtually every hotel, resort, restaurant, tour operator, taxi driver, and market stall in a tourist area. The exchange rate most vendors quote is slightly below the official mid-market rate — expect to lose 2-4 percent compared to paying in JMD.",
      },
      {
        type: 'p',
        text: "Pay USD when: paying a large bill at a resort, tipping a concierge, buying from a vendor who is clearly quoting in USD. Pay JMD when: buying from a route taxi, paying at a patty shop or small restaurant, shopping at a market, tipping housekeeping. The JMD premium adds up; over a week it is real money.",
      },
      { type: 'h2', text: 'Where to change money' },
      {
        type: 'list',
        items: [
          "Cambios in town — best rates, near-official mid-market, open 9am-5pm most days",
          "Hotels — convenient, 3-6 percent worse than cambios",
          "Airport kiosks — worst rates, typically 5-8 percent below market; avoid except for a small starter amount",
          "ATMs — decent rates with low fees on the right network (see below)",
          "Banks — fair rates, slow queues, only worth it for large amounts",
        ],
      },
      {
        type: 'p',
        text: "Get a small amount of JMD on arrival — $80 to $150 worth — to cover tips, small purchases, and route taxis in the first day. The rest can be drawn from ATMs or exchanged at a cambio mid-trip.",
      },
      { type: 'h2', text: 'ATMs and cards' },
      {
        type: 'p',
        text: "ATM networks: Scotiabank and NCB are the most reliable. Both dispense JMD; a handful of airport and resort ATMs dispense USD at a worse rate. Foreign-transaction-fee-free cards (Charles Schwab, Fidelity) make ATM withdrawals the cheapest way to move cash. Daily limits are typically JMD 40,000-60,000 — roughly $250-$380.",
      },
      {
        type: 'quote',
        text: "The single biggest Jamaica currency mistake is exchanging at the airport. You will lose $40 on a $500 exchange you could have done better anywhere else.",
        attribution: "— Simone Thompson, Travel Guide",
      },
      {
        type: 'p',
        text: "Cards are accepted at hotels, larger restaurants, resort-area grocery stores, and tour operators. Visa and Mastercard are universal; Amex acceptance is spotty outside resort properties. Use a card with no foreign-transaction fee. Dynamic currency conversion (DCC) at the terminal — 'would you like to pay in USD?' — always loses you money. Choose JMD.",
      },
      { type: 'h2', text: 'Tipping norms' },
      {
        type: 'p',
        text: "Tipping in Jamaica is 10-15 percent at restaurants that do not add a service charge, 15-20 percent for a private driver on a day tour, $2-3 per bag for porters, $2-5 per night for housekeeping, and 10-15 percent for spa services. Service charge is often already included at resort restaurants — read the check.",
      },
      {
        type: 'p',
        text: "Tip in cash when possible. USD tips are welcome; small JMD bills are better for staff who then do not need to exchange. Do not tip taxi drivers on metered fares unless they help with bags or take a detour at your request. Do tip your sound-system selector if you are deep in a Kingston dance — a few hundred JMD goes a long way.",
      },
      { type: 'h2', text: 'Practical notes' },
      {
        type: 'p',
        text: "Notify your bank of travel dates to avoid card blocks. Bring two cards from different networks in case one fails. Keep a $100 USD emergency bill separate from your main wallet. Small-denomination USD ($1, $5, $20) is more useful than $50s and $100s — vendors often cannot make change on large bills. Avoid carrying large amounts of cash at night.",
      },
      {
        type: 'p',
        text: "Get the money basics right and the rest of your trip gets cheaper and easier. Our Jamaica experiences at /explore price in USD, book direct, and cut the resort-concierge markup out entirely.",
      },
    ],
    relatedSlugs: ['first-time-jamaica', 'jamaica-on-a-budget'],
  },
]
