import type { BlogPost, BlogAuthor } from './blog'
import { BLOG_IMAGES } from './blog-images'

const devon: BlogAuthor = { name: 'Devon Wilson', role: 'Food Editor', initials: 'DW' }
const maya: BlogAuthor = { name: 'Maya Clarke', role: 'Culture Writer', initials: 'MC' }
const simone: BlogAuthor = { name: 'Simone Thompson', role: 'Travel Guide', initials: 'ST' }

export const POSTS_5: BlogPost[] = [
  {
    slug: 'blue-mountain-coffee-story',
    title: "Blue Mountain Coffee: The Real Story Behind the Bean",
    excerpt:
      "Blue Mountain coffee is the most counterfeited bean in the world. Here is what makes the real thing different, why it costs what it costs, and how to buy it.",
    category: 'Food',
    image: BLOG_IMAGES['blue-mountain-coffee-story'],
    readTime: 8,
    publishedAt: '2026-03-12',
    author: devon,
    body: [
      {
        type: 'p',
        text: "At 4,000 feet above Kingston, the mist sits on the slope like a slow tide. The soil is volcanic, the nights are cold, and the cherries take almost twice as long to ripen as coffee grown at sea level. That is where Blue Mountain coffee comes from — a strip of mountainside barely 15 miles across, not the entire range that shows up on every souvenir bag in every duty-free shop on the island.",
      },
      {
        type: 'p',
        text: "Most of what tourists buy labeled Blue Mountain coffee is not Blue Mountain coffee. That is not a conspiracy theory — it is a certification fact. The Coffee Industry Board of Jamaica has protected the name since 1953. If you understand what the real thing is, you stop getting fleeced at the airport, and you start drinking coffee that actually earns its price tag.",
      },
      { type: 'h2', text: 'What makes real Blue Mountain coffee' },
      {
        type: 'p',
        text: "Only beans grown between 3,000 and 5,500 feet inside the protected parishes of St. Andrew, St. Thomas, Portland, and St. Mary can legally be called Jamaica Blue Mountain. Anything grown on the same mountains but lower than 3,000 feet is labeled Jamaica High Mountain — a good coffee, but not the same coffee. Below 1,500 feet it becomes Jamaica Low Mountain or Jamaica Supreme, which is what most cheap blends use to borrow the name.",
      },
      {
        type: 'p',
        text: "The altitude matters because colder nights slow the sugar development in the cherry. The bean gets denser, the acidity mellows, and you end up with the clean, almost buttery cup Blue Mountain is known for. No bitter edge, no charred finish — just a long, smooth middle.",
      },
      {
        type: 'quote',
        text: "People taste Blue Mountain and expect fireworks. It is not that coffee. It is the coffee that disappears gently, and you miss it the moment the cup is empty.",
        attribution: "Devon, Food Editor",
      },
      { type: 'h2', text: 'How to tell the real thing' },
      {
        type: 'list',
        items: [
          "Look for the Coffee Industry Board of Jamaica seal — a blue, round certification mark on the bag",
          "A registered estate name like Wallenford, Mavis Bank, Clifton Mount, Old Tavern, or Craighton",
          "A lot number and harvest year printed on the bag, not just a brand name",
          "Whole bean, packed in a wooden barrel or foil-lined pouch, not pre-ground tourist tins",
          "A price that makes sense — real Blue Mountain runs $50 to $75 per pound, never $15",
        ],
      },
      {
        type: 'p',
        text: "If a bag at the airport costs less than a sandwich, it is a blend, and the Blue Mountain content is probably under 10 percent. That is legal in most export markets, and it is the single biggest reason the world thinks it has tried this coffee and was underwhelmed.",
      },
      { type: 'h2', text: 'What it costs and how to buy it' },
      {
        type: 'p',
        text: "A 16-ounce bag of single-estate Blue Mountain from a certified farm will run you between $55 and $80 on the island itself. At the estates, you can sometimes get it closer to $45 if you buy direct on a tour. In the US or UK, the same bag shipped in is usually $85 to $120. Decaf runs a little higher. Peaberry — the round, single-bean mutation that comes from maybe 5 percent of any crop — is the top tier and sells for north of $120.",
      },
      {
        type: 'p',
        text: "The best way to buy it is to visit. We build coffee farm tastings into the Blue Mountain sunrise trek at /explore, and you can walk out with a sealed bag straight from the roaster — with the seal, the lot number, and a cup you just drank to prove it. No duty-free markup, no mystery blend. Just the coffee, the mountain that grew it, and the farmer who picked it. No problem.",
      },
    ],
    relatedSlugs: ['blue-mountain-sunrise-hike', 'appleton-estate-rum-tour'],
  },
  {
    slug: 'jamaican-jerk-explained',
    title: "Jamaican Jerk Chicken, Explained by a Chef",
    excerpt:
      "Jamaican jerk is not a marinade — it is a process. A chef breaks down the pit, the pimento wood, the scotch bonnet, and what most home cooks get wrong.",
    category: 'Food',
    image: BLOG_IMAGES['jamaican-jerk-explained'],
    readTime: 8,
    publishedAt: '2026-03-16',
    author: devon,
    body: [
      {
        type: 'p',
        text: "The word jerk does more work than any other word in Jamaican food. It names a spice, a method, a cut, a side of the road, a whole region of Portland. If you have only ever had Jamaican jerk chicken from a bottle labeled jerk sauce, you have not had it — you have had a loose cousin. This is what the real thing actually is, from someone who has been cooking it for twenty years.",
      },
      {
        type: 'p',
        text: "At its core, jerk is a low, slow, smoke-dominant cooking technique that happens to use one of the most specific spice palettes on earth. Strip away any of the three — the pit, the wood, or the spice — and you have something else. Good, maybe. Just not jerk.",
      },
      { type: 'h2', text: 'The pit, and why it matters' },
      {
        type: 'p',
        text: "A proper jerk pit is a low stone or metal trench, usually 12 to 18 inches deep, with green pimento wood laid across the top like the slats of a ladder. The meat sits directly on the wood. There is no grate. The wood is both the fuel and the rack, and as it burns from the bottom it perfumes the meat from above. Heat stays low — 250 to 300°F — and the cook runs four hours for chicken, six for pork.",
      },
      {
        type: 'p',
        text: "Most jerk you taste in North American restaurants is grilled hot and fast over charcoal. That is barbecue with jerk spice. A real pit produces something closer to smoked meat with a lacquered, almost tacky outer bark. The difference is obvious from the first bite.",
      },
      {
        type: 'quote',
        text: "If the chicken has grill marks, it is not jerk. Jerk has no grill marks. Jerk has bark.",
        attribution: "Devon, Food Editor",
      },
      { type: 'h2', text: 'The spice paste' },
      {
        type: 'list',
        items: [
          "Scotch bonnet — the heat, but also the fruit-forward sweetness; no substitute works",
          "Pimento (allspice) — whole berries, hand-crushed; the single most important flavor",
          "Fresh thyme, scallion, ginger, and garlic — pounded, not blended, to preserve texture",
          "Nutmeg and a little cinnamon — the quiet layer most recipes leave out",
          "Brown sugar, soy, and lime — the binding agents, never more than a whisper of each",
        ],
      },
      {
        type: 'p',
        text: "Portland-style jerk leans drier, spicier, and more smoke-heavy. It is the origin version — Boston Bay, just down the coast, is where the technique was formalized by the Maroons in the 17th century. Head west across the island and the style softens. Around Ocho Rios and Montego Bay, you start to see saucier, sweeter jerk designed for tourist palates. Neither is wrong, but they are not the same dish.",
      },
      { type: 'h2', text: 'Before you book a pit session' },
      {
        type: 'p',
        text: "A real pit session is a half-day commitment. You are not dropping in for lunch — you are there from the marinade to the plate. Expect to spend $60 to $90 per person for a small-group experience with a working pit master. You will come home with a spice jar, probably some smoke in your hair, and a benchmark that ruins airport-terminal jerk forever.",
      },
      {
        type: 'p',
        text: "If you want the full Portland version with pimento wood and a three-generation pit, we run sessions in Boston Bay — you can book one on /explore. Bring an appetite and come hungry. No problem.",
      },
    ],
    relatedSlugs: ['birthplace-of-jerk-boston-bay', 'blue-mountain-coffee-story'],
  },
  {
    slug: 'reach-falls-vs-dunns-river',
    title: "Reach Falls vs Dunn's River: Which Jamaica Waterfall Wins",
    excerpt:
      "Reach Falls Jamaica or Dunn's River? We did both in the same week — here is the honest verdict on crowds, cost, drive time, and which one is actually worth it.",
    category: 'Adventure',
    image: BLOG_IMAGES['reach-falls-vs-dunns-river'],
    readTime: 7,
    publishedAt: '2026-03-20',
    author: simone,
    body: [
      {
        type: 'p',
        text: "There are two waterfalls every Jamaica guide pushes: Dunn's River in Ocho Rios and Reach Falls in Portland. On paper they look similar — climbable tiered falls, turquoise pools, guided hikes. In person they are almost opposites. I did both in four days, with the same pair of water shoes, and I can tell you which one you should actually drive to see.",
      },
      {
        type: 'p',
        text: "Quick context: Dunn's River is the famous one, the postcard one, the one cruise ships bus people to in matching life jackets. Reach Falls Jamaica is the local one — smaller parking lot, no gift shop, no chain. Here is how they stack up honestly.",
      },
      { type: 'h2', text: "Dunn's River, tested" },
      {
        type: 'p',
        text: "Dunn's River is 180 feet of tiered limestone cascading directly onto a beach on the Ocho Rios coast. You climb it in a human chain with a guide. It is undeniably beautiful, but it is also the single most crowded natural attraction on the island. On a cruise day you can wait 45 minutes just to start the climb, and the chain moves slowly because the person in front of you is someone's uncle in flip-flops.",
      },
      {
        type: 'p',
        text: "Entry is around $25 for adults, plus parking, plus a locker, plus the near-mandatory photo package if you do not bring a waterproof phone case. With transport from Montego Bay, a Dunn's River day runs $90 to $130 per person all-in.",
      },
      { type: 'h2', text: "Reach Falls, tested" },
      {
        type: 'p',
        text: "Reach Falls sits deep inside Portland, about a 25-minute drive southeast of Port Antonio. The drive itself is half the appeal — banana farms, cliff-hanging corners, the Drivers River on your right. The falls are shorter than Dunn's, maybe 30 feet, but they spill into a jade-green pool with an underwater tunnel you can actually swim through with a guide.",
      },
      {
        type: 'p',
        text: "Entry is $10 for adults. There is no chain, no mandatory group. You wander. A local guide for the underwater swim costs another $10 to $15. On a Tuesday in March I had the main pool to myself for 20 minutes.",
      },
      {
        type: 'quote',
        text: "Dunn's River is a show. Reach Falls is a place. One is something you do, the other is somewhere you go.",
        attribution: "Simone, Travel Guide",
      },
      { type: 'h2', text: "The verdict, side by side" },
      {
        type: 'list',
        items: [
          "Crowds — Reach Falls wins by a mile; Dunn's River is overwhelmed on cruise days",
          "Drive time — Dunn's River wins if you are based on the north coast; Reach Falls is 2.5 hours from Montego Bay",
          "Beauty — Reach Falls wins on pure scenery; Dunn's is taller but less scenic up close",
          "Difficulty — Dunn's is more strenuous to climb; Reach is mostly swimming and wading",
          "Cost — Reach Falls is roughly a third of the total spend once you factor in transport",
        ],
      },
      {
        type: 'p',
        text: "The verdict: if you only have one day and you are staying on the Ocho Rios strip, do Dunn's River early — first hour of opening, before the buses. If you have any flexibility, skip Dunn's and drive to Reach Falls. Make a full day of it with Frenchman's Cove beach and a Portland lunch on the way back.",
      },
      { type: 'h2', text: 'How to go' },
      {
        type: 'p',
        text: "Both falls need transport unless you are staying in walking distance. A round-trip private driver to Reach Falls from Port Antonio runs $60 to $90. From Ocho Rios or Montego Bay, expect $120 to $180. For Dunn's River, shared shuttles from Ocho Rios hotels run $25 to $40 round trip.",
      },
      {
        type: 'p',
        text: "We run a Reach Falls day trip with a Portland local that includes the underwater swim, lunch, and a stop at Frenchman's Cove. You can book it on /explore. Bring reef shoes, not flip-flops. No problem.",
      },
    ],
    relatedSlugs: ['birthplace-of-jerk-boston-bay', 'portland-parish-guide'],
  },
  {
    slug: 'appleton-estate-rum-tour',
    title: "The Appleton Estate Rum Tour: Worth the Drive?",
    excerpt:
      "The Appleton Estate rum tour is a 90-minute drive from any coast. We went, we tasted, we did the math — here is whether it is worth the day.",
    category: 'Food',
    image: BLOG_IMAGES['appleton-estate-rum-tour'],
    readTime: 8,
    publishedAt: '2026-03-24',
    author: devon,
    body: [
      {
        type: 'p',
        text: "The Nassau Valley sits in the middle of St. Elizabeth parish, ringed by cockpit-country limestone hills, and it has been growing sugar cane for rum since 1749. That makes the Appleton Estate one of the oldest continuously operating sugar estates in the western hemisphere. It also makes the Appleton Estate rum tour the single most bookable distillery experience on the island. But it is also a 90-minute drive from almost anywhere a tourist sleeps, and every trip review wrestles with the same question: is it actually worth the day?",
      },
      {
        type: 'p',
        text: "I drove in from Treasure Beach on a Wednesday morning with two friends. We are not rum tourists — we are food people who wanted to understand how Jamaican rum is different from Barbadian or Cuban. By the end of the tasting, I had an answer, and I had opinions about the tour itself.",
      },
      { type: 'h2', text: 'What the tour actually includes' },
      {
        type: 'p',
        text: "The standard Joy Spence Experience (named after the estate's master blender) runs about 90 minutes. It starts in a small theater with a short video, moves to a sugar cane and donkey-powered cane-crushing demo, walks you through the fermentation and column-plus-pot still setup, and ends in a climate-controlled tasting room with a blending exercise and a full flight of rums.",
      },
      {
        type: 'p',
        text: "The tasting is the reason to go. You try the white overproof, the 8-year Reserve, the 12-year Rare Casks, and usually the 15-year Black River. If you pay for the premium tier, they pour the 21-year and sometimes a special edition. Then they hand you a pipette and let you blend your own mini-bottle to take home. It is genuinely fun, and the rum itself is excellent — especially the 12.",
      },
      { type: 'h2', text: 'What it costs' },
      {
        type: 'list',
        items: [
          "Standard Joy Spence Experience — $40 per person on the estate",
          "Premium Signature Experience — $60 per person, includes the 21-year pour",
          "Blend-your-own bottle add-on — $25 to $40 depending on spirit",
          "Transport from Negril — $100 to $140 round trip for a private driver",
          "Transport from Montego Bay or Treasure Beach — $80 to $120 round trip",
        ],
      },
      {
        type: 'p',
        text: "Total, for two people traveling from Montego Bay, expect $250 to $320 for a full day including the tour, transport, and lunch. From Treasure Beach the math gets much better — around $180 total — because it is only 45 minutes away.",
      },
      {
        type: 'quote',
        text: "Appleton is not really a rum tour. It is a sugar-estate tour that ends in rum. Go for the valley, stay for the 12-year.",
        attribution: "Devon, Food Editor",
      },
      { type: 'h2', text: 'The honest verdict' },
      {
        type: 'p',
        text: "If you are staying in Negril or Treasure Beach, book it. The drive in is through some of the prettiest parish interior on the island — cane fields, cockpit karst, small villages you would never otherwise see. If you are based in Ocho Rios or on the east end, the drive is long enough that I would only recommend it for rum enthusiasts.",
      },
      {
        type: 'p',
        text: "One real gripe: the tour is tightly scripted and the guides work from a near-identical script most days. If you want the deep version — the history of estate rum versus molasses rum, the Joy Spence innovations, the production numbers — ask specific questions. The good guides will open up and it becomes a much richer experience.",
      },
      { type: 'h2', text: 'Before you book' },
      {
        type: 'p',
        text: "Book online in advance — walk-ins are often turned away on cruise days. Wear closed-toe shoes (there is a warehouse walk). Do not drive yourself — the tastings are generous and the drive home is mountain road. Bring cash for tips and the gift shop. And if you like the 12, buy it at the estate shop; it is often $10 cheaper than the Kingston duty-free.",
      },
      {
        type: 'p',
        text: "We can pair an Appleton tour with a Treasure Beach lunch and a YS Falls stop — it is the best one-day rum and south-coast combo on the island. Find it on /explore. No problem.",
      },
    ],
    relatedSlugs: ['blue-mountain-coffee-story', 'jamaica-on-a-budget'],
  },
  {
    slug: 'bob-marley-museum-guide',
    title: "The Bob Marley Museum Kingston: A Visitor's Guide",
    excerpt:
      "The Bob Marley Museum is the most visited cultural site in Jamaica. What the tour covers, what it costs, and how to get more out of it.",
    category: 'Culture',
    image: BLOG_IMAGES['bob-marley-museum-guide'],
    readTime: 7,
    publishedAt: '2026-03-28',
    author: maya,
    body: [
      {
        type: 'p',
        text: "56 Hope Road, Kingston. A white-and-red colonial-era house behind a green gate, a mango tree in the yard, and a bullet hole in the wall. This is the Bob Marley Museum, the house Bob lived in from 1975 until his death in 1981, and the most visited cultural site in Jamaica. On a normal Tuesday the courtyard fills by 10:30 a.m. with school groups, pilgrims, and travelers who got there two days after landing and are trying to understand what they just stepped into.",
      },
      {
        type: 'p',
        text: "The Bob Marley Museum is simultaneously one of the easiest tours in Kingston to do and one of the hardest to get right. The standard guided walk is good; the deeper layer underneath it is what makes the visit worth the flight.",
      },
      { type: 'h2', text: 'What you actually see' },
      {
        type: 'p',
        text: "The tour is guided only — you cannot wander solo — and it runs about an hour and 15 minutes. A guide takes groups of 15 to 20 through the ground-floor rooms first: Bob's kitchen, the dining room, his platinum records, a corridor of international awards. You move upstairs to his bedroom, kept almost exactly as it was, with his star-patterned denim jacket still on the bed.",
      },
      {
        type: 'p',
        text: "The part most people remember is the 1976 shooting site. Days before the Smile Jamaica concert, gunmen entered the compound and opened fire. Bob was grazed; his wife Rita and manager Don Taylor were seriously wounded. The bullet holes are preserved in the wall of the rear hallway. Two days later he performed anyway. The guide tells this story in front of the holes, and nobody speaks for about ten seconds afterward.",
      },
      {
        type: 'quote',
        text: "People come in curious and leave changed. It is not a museum about a musician. It is a museum about a person who made a choice to keep singing.",
        attribution: "Ras, a guide at the museum",
      },
      { type: 'h2', text: 'Practical info' },
      {
        type: 'list',
        items: [
          "Admission — $30 USD for adults, $15 for children",
          "Hours — Monday through Saturday, 9:30 a.m. to 4 p.m. (last tour); closed Sundays",
          "Photography — not allowed inside the house; yard photos are fine",
          "Length — allow 90 minutes for the tour plus 30 minutes for the grounds and shop",
          "Transport — 15 minutes from New Kingston hotels; private driver $15 to $25 round trip",
        ],
      },
      {
        type: 'p',
        text: "The on-site cafe, One Love Cafe, does a solid ital plate and a good coffee for around $12 to $18. The gift shop is better than most museum shops on the island — vinyl reissues, original-era T-shirt reprints, and estate-licensed merchandise that you cannot easily find outside.",
      },
      { type: 'h2', text: 'How to get more out of it' },
      {
        type: 'p',
        text: "Two tips from visits I have done over the years. First, go on a weekday morning, not a weekend afternoon; the 10 a.m. slot is the emptiest. Second, pair it with Trench Town Culture Yard on the same day. Trench Town is where Bob actually grew up, and the Culture Yard museum there — smaller, rougher, community-run — gives you the before that Hope Road does not. Together they cost less than $45 and they tell a far more honest story than either does alone.",
      },
      { type: 'h2', text: 'Before you book' },
      {
        type: 'p',
        text: "Tickets are available walk-up, but during cruise season (November through March) the 10 a.m. and 11 a.m. slots can sell out by opening. Book online or arrive right at 9:30. Bring cash for the gift shop. Dress comfortably — the tour walks uphill through the grounds.",
      },
      {
        type: 'p',
        text: "We run a Kingston culture day that combines the Bob Marley Museum with Trench Town and a sound-system dance on the right weekend — the full arc of the music, not just the postcard. Book it on /explore. No problem.",
      },
    ],
    relatedSlugs: ['nine-mile-marley-pilgrimage', 'kingston-culture-guide'],
  },
  {
    slug: 'nine-mile-marley-pilgrimage',
    title: "Nine Mile, Jamaica: A Bob Marley Pilgrimage",
    excerpt:
      "Nine Mile Jamaica is the birthplace and burial site of Bob Marley. Here is what the drive is like, what the tour covers, and why it is different from the Kingston museum.",
    category: 'Culture',
    image: BLOG_IMAGES['nine-mile-marley-pilgrimage'],
    readTime: 8,
    publishedAt: '2026-04-01',
    author: maya,
    body: [
      {
        type: 'p',
        text: "Nine Mile, Jamaica sits at 1,800 feet in the hills of St. Ann, about 90 minutes south of Ocho Rios up a two-lane road that folds in on itself every few hundred meters. There is no town, exactly — there is a main road, a cluster of small houses, a primary school, a handful of vendors, and the compound where Robert Nesta Marley was born in 1945 and buried in 1981. This is the other Marley site, the one that matters just as much as the Kingston museum but feels like a different universe.",
      },
      {
        type: 'p',
        text: "A Nine Mile Jamaica pilgrimage is a half-day commitment at minimum. The drive is part of the experience, and so is the altitude. By the time you get there, your ears pop and the air smells different — wetter, sweeter, a little smokier from the wood cookfires.",
      },
      { type: 'h2', text: 'What the tour covers' },
      {
        type: 'p',
        text: "Rastafari guides lead you through the grounds in groups of 10 to 15. You see the tiny wooden cabin Bob grew up in, painted bright blue and red and green, the rock he described in 'Talkin' Blues' ('cold ground was my bed last night, and rock was my pillow, too'), the outdoor kitchen, and the family church turned mausoleum where both Bob and his mother Cedella are interred. The guides chant, sing, and speak in a way that is somewhere between tour and ceremony.",
      },
      {
        type: 'p',
        text: "It is a much more spiritual tour than the Kingston one. In Kingston, you are in Bob's adult home, with the platinum records and the bullet holes. In Nine Mile, you are in his childhood, his family, his final resting place. The tone is slower, quieter, more reverent. Many guests cry in the mausoleum. Nobody pretends they did not.",
      },
      {
        type: 'quote',
        text: "Kingston is where Bob became Bob. Nine Mile is where he was Nesta. Both matter. Do not pick one.",
        attribution: "Maya, Culture Writer",
      },
      { type: 'h2', text: 'What it costs and how to go' },
      {
        type: 'list',
        items: [
          "Standard tour entry — $35 per person at the gate",
          "Combined tour plus round-trip shuttle from Ocho Rios — $55 to $70",
          "Private driver from Montego Bay — $140 to $180 round trip",
          "Tips for the Rasta guides — customary, $5 to $10 per person",
          "Optional lunch at a local spot on the way back — $12 to $20 per person",
        ],
      },
      {
        type: 'p',
        text: "Go on a weekday if you can. Weekends and cruise-ship Thursdays can push the site to standing room only in the small buildings. The drive up is mountain road — steep, narrow, lots of blind corners — so do not drive yourself if you are not fully comfortable with left-side mountain driving.",
      },
      { type: 'h2', text: 'Before you book' },
      {
        type: 'p',
        text: "A few things that will make the day better. Wear sleeves and long pants — the mausoleum is a sacred space and modest dress is expected. Bring cash, both for the tips and for the vendors along the road (there are some excellent jerk and roasted corn stops). Expect limited cell service above Brown's Town. And if you can swing a sunset-timed return, the ride down through St. Ann as the sun drops is one of the best quiet moments you will have in Jamaica.",
      },
      {
        type: 'p',
        text: "We run a Nine Mile day trip that pairs the pilgrimage with a proper St. Ann lunch and a detour through the hills Bob wrote about. It sits alongside our Bob Marley Museum day on /explore — do both on the same trip if you can. No problem.",
      },
    ],
    relatedSlugs: ['bob-marley-museum-guide', 'kingston-sound-system-culture'],
  },
  {
    slug: 'scuba-diving-in-jamaica',
    title: "Scuba Diving in Jamaica: Where to Actually Go",
    excerpt:
      "Scuba diving Jamaica is underrated and uneven. Here is an honest breakdown of Montego Bay, Negril, Ocho Rios, and Port Antonio dive sites — and where to actually book.",
    category: 'Adventure',
    image: BLOG_IMAGES['scuba-diving-in-jamaica'],
    readTime: 8,
    publishedAt: '2026-04-05',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Jamaica is not Cayman or Bonaire. Nobody flies here primarily to dive. That is both the honest truth and the reason scuba diving Jamaica is a quietly excellent way to spend two or three days of a week-long trip. The reefs are less crowded, the boats are smaller, and the wall sites on the north coast drop fast into genuinely dramatic topography.",
      },
      {
        type: 'p',
        text: "I have dived all four main regions over the last few years, between OW and Advanced certifications, and the experience is very different depending on where you put the tank in the water. Here is the honest breakdown before you drop money on a package.",
      },
      { type: 'h2', text: "Montego Bay — the safe starter" },
      {
        type: 'p',
        text: "Montego Bay Marine Park protects a 15-kilometer stretch of reef that sees the most boat traffic on the island. Visibility averages 60 to 80 feet. The reefs are shallower and the drop-offs gentler, which makes it the right region for first-timers, check-out dives, and Discover Scuba sessions. Best site: the Point at Airport Reef, for the eagle rays that often cruise through in the morning.",
      },
      { type: 'h2', text: "Negril — easy and lazy" },
      {
        type: 'p',
        text: "Negril is the softest dive region on the island. Shallow reefs (30 to 60 feet), calm water, lots of parrotfish and reef sharks occasionally. Great for snorkel-to-scuba transition. The wreck of the Throne Room cave at 35 feet is the standout. Negril is not technical, but it is the most reliable good-weather region in the winter months.",
      },
      { type: 'h2', text: "Ocho Rios — the wall" },
      {
        type: 'p',
        text: "This is where Jamaica diving gets interesting. The north coast drops into a true vertical wall about 200 yards offshore. Devil's Reef goes from 35 feet to 130 feet in a single swim. You will see barrel sponges the size of a person, black coral at depth, and occasionally tarpon schools in the blue. This is the region I send certified divers to.",
      },
      { type: 'h2', text: "Port Antonio — the locals' pick" },
      {
        type: 'p',
        text: "The east end is the quietest, least-dove region on the island, and it is the favorite of most Jamaican dive instructors I know. The visibility can be lower on some days, but the fish density is noticeably higher and you often have the sites to yourself. Alligator Head and the Blue Lagoon wall are both underrated.",
      },
      {
        type: 'quote',
        text: "If you dived Jamaica once and thought it was okay, you probably dived Montego Bay at peak season. Try Ocho Rios in shoulder season and you will write a different review.",
        attribution: "Simone, Travel Guide",
      },
      { type: 'h2', text: "What it costs" },
      {
        type: 'list',
        items: [
          "Single-tank guided dive — $65 to $85 depending on operator",
          "Two-tank boat dive — $110 to $140, the best value",
          "Discover Scuba (no certification) — $130 to $170 all-in",
          "Open Water certification, four days — $450 to $600",
          "Full gear rental add-on — $15 to $25 per day",
        ],
      },
      { type: 'h2', text: "Before you book" },
      {
        type: 'p',
        text: "A few honest tips. Book with a PADI or SSI five-star operator, not the guy with a boat on the beach. Ask about the group size — anything over six divers per instructor is too many. Avoid diving on the day you fly home; standard advice is 24 hours minimum between your last dive and a flight. And if you are certified, bring your own mask and dive computer; rental gear on the island is fine but dated.",
      },
      {
        type: 'p',
        text: "We pair dive days with a local lunch and a reef-education segment on /explore — small groups, proper gear, real operators. The reefs are better than Jamaica's reputation gives them credit for. No problem.",
      },
    ],
    relatedSlugs: ['montego-bay-beyond-the-strip', 'negril-guide'],
  },
  {
    slug: 'getting-around-jamaica-guide',
    title: "Getting Around Jamaica: Transport, Honestly",
    excerpt:
      "Getting around Jamaica is not as simple as the brochures pretend. Rental cars, route taxis, JUTA, private drivers, domestic flights — here is the honest guide.",
    category: 'Guides',
    image: BLOG_IMAGES['getting-around-jamaica-guide'],
    readTime: 9,
    publishedAt: '2026-04-09',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Getting around Jamaica is the single most underestimated part of planning a trip here. The island looks small on a map — 146 miles long, 51 miles wide — but the road network is mountainous, mostly two-lane, and the speed at which traffic actually moves is about two-thirds of what Google Maps predicts. A drive that looks like 90 minutes online is usually two and a half hours in real life.",
      },
      {
        type: 'p',
        text: "I have used every form of transport on this island, from route taxis in Kingston to domestic flights from Montego Bay to Port Antonio. Here is the honest breakdown of what works, what does not, and what to actually book.",
      },
      { type: 'h2', text: "Rental cars — do not, on your first trip" },
      {
        type: 'p',
        text: "Jamaica drives on the left. The roads have no shoulders, potholes are common, mountain roads have blind corners every 50 meters, and drivers here have a cultural comfort with overtaking on hills that terrifies most visitors. Rentals are available — about $50 to $90 per day from Avis or Island — but I genuinely do not recommend them for first-timers. Your second or third trip, when you know the geography, is when you might consider it.",
      },
      { type: 'h2', text: "Route taxis — the local way" },
      {
        type: 'p',
        text: "Route taxis are the backbone of Jamaican daily life. They run fixed routes — Kingston to Half Way Tree, Ocho Rios to Runaway Bay, Negril to Lucea — and they pick up and drop off anywhere along the route. They are safe, extremely cheap ($1 to $3 USD), and the fastest way to feel like you are actually in the country rather than on a brochure. Look for the red license plate.",
      },
      { type: 'h2', text: "JUTA and licensed taxis — the tourist option" },
      {
        type: 'p',
        text: "JUTA is the regulated tourist taxi network. Rates are fixed, drivers are vetted, and your hotel concierge will know every driver by name. A JUTA ride from Montego Bay airport to Negril runs around $100 one way; Kingston airport to New Kingston is $25 to $35. Reliable, but pricier than the alternatives.",
      },
      { type: 'h2', text: "Private drivers — the sweet spot for trips" },
      {
        type: 'p',
        text: "For multi-day trips and cross-island moves, a private driver is almost always the best call. You get a dedicated vehicle, a flexible schedule, and someone who knows the back roads. Expect $120 to $200 per day depending on route and vehicle. Split between two or three travelers, it ends up cheaper than a rental plus gas plus parking, and nobody has to drive.",
      },
      {
        type: 'quote',
        text: "Book a driver for the long moves. Use route taxis for the short ones. Do not rent. That is the whole rulebook.",
        attribution: "Simone, Travel Guide",
      },
      { type: 'h2', text: "Domestic flights — for the east end" },
      {
        type: 'p',
        text: "If you are going to Port Antonio or Negril from the other end of the island, a small-plane domestic flight is worth considering. TimAir and InterCaribbean fly MBJ to KIN and occasional Port Antonio charters, roughly $130 to $220 one way. You trade the long drive for a 35-minute flight, which is a real quality-of-life gain on a week-long trip.",
      },
      { type: 'h2', text: "What it costs by route" },
      {
        type: 'list',
        items: [
          "Montego Bay airport to Negril — $100 private, $25 shared shuttle, 90 minutes",
          "Montego Bay airport to Ocho Rios — $100 private, $25 shared, 90 minutes",
          "Ocho Rios to Kingston — $120 private, 2 hours",
          "Kingston to Port Antonio — $120 private, 2.5 hours",
          "Negril to Treasure Beach — $150 private, 2.5 hours",
        ],
      },
      { type: 'h2', text: "Before you book" },
      {
        type: 'p',
        text: "Always confirm the rate before you get in the vehicle. Always tip — 10 to 15 percent is standard. Always have cash; many drivers prefer USD in small bills. And always, always pad your itinerary with buffer time. Jamaica moves on its own schedule, and the smart traveler learns to move with it rather than against it.",
      },
      {
        type: 'p',
        text: "Every experience we run on /explore includes transport built in — no guesswork, no airport surprises. The island rewards patience. No problem.",
      },
    ],
    relatedSlugs: ['first-time-jamaica', 'jamaica-on-a-budget'],
  },
  {
    slug: 'jamaica-on-a-budget',
    title: "Jamaica on a Budget: Real Numbers for a Real Trip",
    excerpt:
      "Jamaica budget travel is absolutely possible — if you know where the real costs hide. Here are real numbers for a week, broken down by category.",
    category: 'Guides',
    image: BLOG_IMAGES['jamaica-on-a-budget'],
    readTime: 9,
    publishedAt: '2026-04-13',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Jamaica has a reputation as an expensive Caribbean destination, and in some ways it earns that reputation. The all-inclusive economy is built around packaging a week at $3,000-plus per person and the airport markup is no joke. But Jamaica budget travel is absolutely possible — a real week here, with real food, real beaches, and real experiences, can run $900 to $1,400 per person outside of flights if you plan it right.",
      },
      {
        type: 'p',
        text: "Below is what a seven-day trip actually costs in 2026 dollars, broken down by category. These are numbers I have spent myself or seen guests spend on trips we have helped plan.",
      },
      { type: 'h2', text: "Where to sleep" },
      {
        type: 'p',
        text: "Skip the big strips. Treasure Beach, Port Antonio, and the Negril West End all have owner-run guesthouses and small boutique hotels between $65 and $140 a night for a double room. Airbnbs in Kingston are plentiful at $50 to $100. A seven-night stay in this tier runs $450 to $800 total for a couple — a third to a quarter of resort pricing, and almost always with a better breakfast.",
      },
      { type: 'h2', text: "Where to eat" },
      {
        type: 'p',
        text: "This is where the budget gets saved or blown. Tourist-strip restaurants run $18 to $30 per entree. Local cook-shops, jerk stands, and patty shops run $4 to $10 for a full plate. Eat one real meal a day at a local spot and you save $40 per day per person. A whole jerk chicken dinner with festival and rice and peas at a Portland pit goes for about $12.",
      },
      { type: 'h2', text: "What things actually cost" },
      {
        type: 'list',
        items: [
          "Patty from Juici or Tastee — $2 to $3",
          "Jerk chicken plate at a local spot — $8 to $12",
          "Red Stripe at a bar — $3 to $5",
          "Route taxi short hop — $1 to $3",
          "Private driver half day — $70 to $100",
          "Bob Marley Museum entry — $30",
          "Dunn's River Falls entry — $25",
          "Reach Falls entry — $10",
          "Blue Mountain coffee farm tour — $40 to $70",
          "Appleton Estate rum tour — $40 to $60",
        ],
      },
      {
        type: 'quote',
        text: "The cheapest week in Jamaica is almost always also the best one. Resort food is fine. Auntie's kitchen is unforgettable.",
        attribution: "Simone, Travel Guide",
      },
      { type: 'h2', text: "A realistic 7-day budget, per person" },
      {
        type: 'p',
        text: "Here is what a frugal-but-not-suffering week looks like for one person traveling with a partner (so lodging is split): guesthouse or boutique stay averaging $75 per night split in half ($262), food averaging $35 per day ($245), three big experiences like a jerk session, a waterfall day, and a rum tour ($180 to $220), local transport including one private driver day ($120 to $180), and incidentals and tips ($80 to $120). Grand total: roughly $900 to $1,100 per person before flights.",
      },
      {
        type: 'p',
        text: "Push it up to $1,400 and you can add another two experiences and upgrade two dinners. Push it down to $750 and you are in guesthouse-plus-cookshop territory — still a completely livable trip, just fewer paid activities.",
      },
      { type: 'h2', text: "How to cut the costs further" },
      {
        type: 'p',
        text: "A few mechanics that save real money. Fly into Kingston instead of Montego Bay when possible — fares are often $80 to $150 cheaper. Travel in May or early June (post-winter, pre-hurricane) for lower lodging rates without the rain. Book experiences directly with local creators rather than through hotel concierges, which usually adds 30 to 50 percent. And use ATMs rather than exchanging cash at the airport; you will save 3 to 5 percent on every withdrawal.",
      },
      { type: 'h2', text: "Before you book" },
      {
        type: 'p',
        text: "Jamaica rewards travelers who plan a little and then let the rest unfold. Book flights and lodging tight; leave the middle of the week loose. The best meals of your trip will almost always be the ones you did not schedule.",
      },
      {
        type: 'p',
        text: "Our /explore page lists every MAPL experience with honest pricing — no hidden fees, no concierge markup. The budget version of Jamaica is the real version. No problem.",
      },
    ],
    relatedSlugs: ['getting-around-jamaica-guide', 'first-time-jamaica'],
  },
  {
    slug: 'jamaica-honeymoon-guide',
    title: "Jamaica Honeymoon, Beyond the All-Inclusive",
    excerpt:
      "A Jamaica honeymoon does not have to mean a resort wristband. Villa stays, boutique coastal hotels, and the Kingston-Portland-Negril rhythm that actually earns the trip.",
    category: 'Guides',
    image: BLOG_IMAGES['jamaica-honeymoon-guide'],
    readTime: 10,
    publishedAt: '2026-04-17',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Every Jamaica honeymoon guide you have read starts the same way: Sandals, Couples, Jewel, maybe Secrets if you want slightly different branding. Pick a property, fly in, stay for a week, post the beach photo. That version of the trip is fine. It is also completely interchangeable with a Jamaica honeymoon and a Punta Cana honeymoon and a Riviera Maya honeymoon. If you want a trip that feels specifically, unmistakably Jamaican — and is probably cheaper, too — this is the other way to do it.",
      },
      {
        type: 'p',
        text: "The framework I use with couples who come to us for a Jamaica honeymoon is simple: three regions, seven to ten nights, one private villa or boutique anchor, and a short list of anchor experiences. The island is too varied to sit on one beach for a week. It will reward you for moving.",
      },
      { type: 'h2', text: "Where to actually stay" },
      {
        type: 'p',
        text: "Three tiers to consider, all of which beat the standard all-inclusive on character and often on cost. Villa stays: the Port Antonio and Treasure Beach coasts have staffed three- and four-bedroom villas in the $400 to $800 per night range, often with a chef and housekeeper included. Split between friends or family, or just for the space and privacy of a couple, they are the single best honeymoon accommodation on the island.",
      },
      {
        type: 'p',
        text: "Boutique coastal hotels: think Rockhouse, GeeJam, Jakes, Strawberry Hill, Trident Castle. $300 to $700 per night, almost always smaller than 50 rooms, architecturally specific to Jamaica, and genuinely romantic in a way a 500-room resort never is. Finally, Kingston — underrated for honeymoons. Spanish Court, R Hotel, and the Terra Nova are all excellent anchors for the first two nights of a trip.",
      },
      { type: 'h2', text: "The rhythm that works" },
      {
        type: 'p',
        text: "The shape I recommend is Kingston to Portland to Negril or Treasure Beach. Two nights in Kingston to feel the music and culture. Three nights in Portland for the jungle, the rafting, the coast, the quiet. Three or four nights on the west coast — Negril for sunsets and beach, Treasure Beach for quiet. You fly home from Montego Bay or Kingston depending on the routing. You use private drivers for the moves; total transport cost across the trip is usually $400 to $700 for two.",
      },
      {
        type: 'quote',
        text: "A Jamaica honeymoon on one beach is a vacation. A Jamaica honeymoon across three regions is the trip you will still be talking about in ten years.",
        attribution: "Simone, Travel Guide",
      },
      { type: 'h2', text: "Anchor experiences to book" },
      {
        type: 'list',
        items: [
          "Private bamboo rafting on the Rio Grande — two on a raft, no other passengers, about $130 per couple",
          "Blue Mountain sunrise coffee trek with farm tasting — the 4 a.m. start is romantic, not brutal",
          "Rick's Cafe cliff dive at sunset — skip the crowds, book the smaller cliffs to the side",
          "Private jerk pit session in Boston Bay — a real half-day cooking experience, not a demo",
          "Luminous Lagoon night swim in Falmouth — swim in bioluminescent water, no filter needed",
        ],
      },
      { type: 'h2', text: "What it costs, honestly" },
      {
        type: 'p',
        text: "A seven-night, three-region Jamaica honeymoon for a couple, booked this way, typically runs $4,500 to $7,500 total before flights. That includes a mix of villa and boutique hotel nights, all private transport, five anchor experiences, meals at a blend of local and fine-dining spots, and tips. A comparable week at a top-tier adults-only all-inclusive would run $5,500 to $9,000 for two. The savings on the boutique version are not the point — the quality gap is.",
      },
      { type: 'h2', text: "Before you book" },
      {
        type: 'p',
        text: "A few practical tips that will make the trip better. Build in one do-nothing day per region; the travel itself is beautiful but real. Ask your villa or hotel for a chef dinner on your first and last nights; it will be your favorite meal. Do not book every day — leave 40 percent of the trip open for the local recommendations you will get on the ground. And get good travel insurance; hurricane season runs June through November and flexibility is worth the premium.",
      },
      {
        type: 'p',
        text: "We build custom honeymoon itineraries at MAPL — villa, boutique, or a mix, with bookable experiences across the island. Start with /explore to see the anchors, and we can assemble the rest around them. Get married, come here, skip the wristband. No problem.",
      },
    ],
    relatedSlugs: ['negril-guide', 'blue-mountain-sunrise-hike'],
  },
]
