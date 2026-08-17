import type { BlogPost, BlogAuthor } from './blog'
import { BLOG_IMAGES } from './blog-images'

const devon: BlogAuthor = { name: 'Devon Wilson', role: 'Food Editor', initials: 'DW' }
const maya: BlogAuthor = { name: 'Maya Clarke', role: 'Culture Writer', initials: 'MC' }
const andre: BlogAuthor = { name: 'Andre Bennett', role: 'Senior Editor', initials: 'AB' }
const simone: BlogAuthor = { name: 'Simone Thompson', role: 'Travel Guide', initials: 'ST' }

export const POSTS_1: BlogPost[] = [
  {
    slug: 'dunns-river-falls-tour-guide',
    title: "Dunn's River Falls Tour: The Honest Guide",
    excerpt:
      "A local's honest Dunn's River Falls tour guide, what the climb actually feels like, what it costs, and when to go to skip the cruise-ship rush.",
    category: 'Guides',
    image: BLOG_IMAGES['dunns-river-falls-tour-guide'],
    readTime: 5,
    publishedAt: '2025-06-05',
    author: simone,
    body: [
      {
        type: 'p',
        text: "By 9:40am the parking lot at Dunn's River is already half cruise-ship coaches, half rented Toyotas, and the smell of wet limestone drifts up from the beach. A Dunn's River Falls tour is the most-booked excursion on the island for a reason, 600 feet of terraced waterfall that flows directly into the Caribbean, and you get to climb it. The question isn't whether it's worth doing. It's whether you do it right.",
      },
      {
        type: 'p',
        text: "The falls sit about four miles west of downtown Ocho Rios in St. Ann. It's been a park since the 1970s, run by the UDC, and on a peak-season Tuesday you might share the climb with 2,000 other people. That's the version most travelers write reviews about. There's a better version, and it's mostly a matter of showing up at the right hour.",
      },
      { type: 'h2', text: "The climb itself" },
      {
        type: 'p',
        text: "The water is cold, about 70°F year-round, and it comes off the mountain clear enough to see your toes. The climb takes roughly 45 minutes if you stop for photos, 25 if you don't. Guides link groups together in a human chain, hands on shoulders, and lead you up a zig-zag line that threads through the fastest current to the calmest pools.",
      },
      {
        type: 'p',
        text: "You'll want water shoes. The rock has a bit of algae and the stone is uneven, not dangerous, just not barefoot-friendly. Rent a pair at the park for about $8 if you forgot yours. Waterproof phone pouches run $10 at the gift shop and they're worth it; guides happily take photos at the good spots.",
      },
      {
        type: 'p',
        text: "If you don't want to climb, there's a staircase running parallel to the falls the whole way. You can walk down, meet the group, take photos, walk back up. Nobody makes you get wet.",
      },
      {
        type: 'quote',
        text: "The first cruise ship arrives at 10. The second at 11. Come at 8:30 and you have the whole first tier to yourself. Every guide gives the same advice.",
      },
      { type: 'h2', text: "Timing the crowds" },
      {
        type: 'list',
        items: [
          'Park opens at 8:30am, be in the lot at 8:20',
          'Cruise buses start arriving around 10am and leave by 2pm',
          'Sunday is the quietest day because fewer ships dock',
          'Late afternoon (3pm onward) is second-best, plus warmer air',
          'Avoid Wednesdays and Saturdays, peak ship days in high season',
        ],
      },
      {
        type: 'p',
        text: "The other honest tip: check the gate price before you book through a resort concierge, because a booked-through-the-desk ticket usually carries a commission on top of the park's own admission. Ask what the all-in figure is and what the gate charges, then decide.",
      },
      {
        type: 'p',
        text: "The beach at the bottom is underrated. After you climb, rinse off, grab a Red Stripe from the little bar, and sit on the sand. The river keeps pouring into the sea behind you and the cruise-ship crowd is busy climbing while you're already done.",
      },
      { type: 'h2', text: "What it costs" },
      {
        type: 'p',
        text: "Direct park admission is $25. Add $8 for water shoes, $10 for a locker, and maybe $15 for lunch at the on-site grill. A private guide is tipped separately, $5–10 per person is standard and welcomed. A full round-trip taxi from an Ocho Rios hotel runs $20–30; from Montego Bay expect $140 for a private driver for the whole day.",
      },
      {
        type: 'p',
        text: "If you want the climb without any of the planning, MAPL Tours pairs Dunn's River with the hidden Blue Hole an hour inland on a single half-day trip. Browse the Ocho Rios experiences at /explore to see dates and pricing.",
      },
    ],
    relatedSlugs: ['reach-falls-vs-dunns-river', 'ocho-rios-complete-guide'],
  },
  {
    slug: 'jamaica-excursions-worth-booking',
    title: 'Jamaica Excursions Worth Leaving the Resort For',
    excerpt:
      'Not every tour is worth your money. Here are the Jamaica excursions worth booking, tested, priced, and ranked by a guide who grew up here.',
    category: 'Guides',
    image: BLOG_IMAGES['jamaica-excursions-worth-booking'],
    readTime: 5,
    publishedAt: '2025-06-12',
    author: simone,
    body: [
      {
        type: 'p',
        text: "The average all-inclusive concierge desk sells about fourteen different Jamaica excursions, and roughly half of them are the same bus ride with different names painted on the side. After a decade of running guests around the island, I've stopped apologizing for being blunt about which ones deserve your Tuesday.",
      },
      {
        type: 'p',
        text: "A good excursion does three things. It gets you somewhere a taxi wouldn't. It puts you with someone who actually lives there. And it leaves room in the day for you to not feel herded. Here's what clears that bar.",
      },
      { type: 'h2', text: "The ones worth it" },
      {
        type: 'p',
        text: "Blue Mountain coffee hikes are genuinely singular. You leave Kingston before dawn, climb through a working farm, and drink the coffee at 5,000 feet while the sun hits the slopes you just walked. About $110 per person, six hours door-to-door, and no resort buffet competes with that morning cup.",
      },
      {
        type: 'p',
        text: "Rick's Cafe cliff diving is corny on paper and unbeatable in person, but only if you go with a small-group tour that includes the surrounding cliffs. The 35-foot jump gets the attention; the afternoon of snorkeling around Negril's West End earns the price. Figure $75–95 per person.",
      },
      {
        type: 'p',
        text: "Boston Bay jerk class with a pit master is the most underrated excursion on the island. Three hours, one family kitchen, a pit that hasn't gone cold since 1968, and you leave with the actual recipe. Around $75 per person and the food alone is worth it.",
      },
      {
        type: 'quote',
        text: "If a tour has more than twelve people on it, you are not on a tour. You are on a bus. Book smaller.",
      },
      { type: 'h2', text: "The ones to skip" },
      {
        type: 'list',
        items: [
          'Large-bus city tours that spend 40 minutes at a craft market you did not ask for',
          'Generic catamaran party cruises, fine, but interchangeable with any Caribbean island',
          'Dolphin-encounter packages sold as nature experiences',
          'Any excursion advertised as "visit three parishes in a day", you will see highway, nothing else',
        ],
      },
      {
        type: 'p',
        text: "The catamarans specifically get a lot of love from concierge desks because the commission is good. The experience itself is a one-size-fits-all bar crawl on water. Fine if that's what you want. Not worth skipping a beach day for.",
      },
      {
        type: 'p',
        text: "Rafting the Rio Grande in Portland, on the other hand, is the kind of Jamaica excursion people remember twenty years later. Two hours on a 30-foot bamboo raft, a raft captain who's been poling the river since he was sixteen, and about $130 per person.",
      },
      { type: 'h2', text: "Before you book" },
      {
        type: 'p',
        text: "Always ask the group size. Always ask if lunch is included and where it comes from. Always ask whether pickup is private or shared, a shared shuttle through three resorts adds 90 minutes to your day. And always book direct when you can. Concierge markup is 30–50% on most excursions.",
      },
      {
        type: 'p',
        text: "MAPL Tours's entire catalogue is built around the kind of Jamaica excursions that pass the group-size test. Browse what's running this week at /explore.",
      },
    ],
    relatedSlugs: ['beyond-the-resort', 'first-time-jamaica'],
  },
  {
    slug: 'montego-bay-tours-ranked',
    title: 'Montego Bay Tours, Ranked by an Actual Local',
    excerpt:
      'An honest ranking of Montego Bay tours, from the Rastafari Indigenous Village to Martha Brae rafting, and which day trips are actually worth booking.',
    category: 'Guides',
    image: BLOG_IMAGES['montego-bay-tours-ranked'],
    readTime: 5,
    publishedAt: '2025-06-19',
    author: andre,
    body: [
      {
        type: 'p',
        text: "MoBay gets treated like a one-street town, that strip from Sangster airport down the Hip Strip and out to the Rose Hall resorts. The travelers who leave thinking Montego Bay is fine-but-nothing-special never made it past that road. The real ranking of Montego Bay tours reshuffles every assumption you arrived with.",
      },
      {
        type: 'p',
        text: "Montego Bay sits in St. James parish, on Jamaica's north coast, with great-house history on one side and working fishing villages on the other. After working routes out of here for nine years, I ran an informal tally of what my returning guests say was worth their day. Here's how the Montego Bay tours actually stack up.",
      },
      { type: 'h2', text: "The ranking" },
      {
        type: 'p',
        text: "At the top: the Martha Brae River bamboo raft at sunrise. Ninety minutes, one raft captain, about $75. It's slower and quieter than the Rio Grande raft in Portland, and closer to MoBay. You'll see more birds than tourists.",
      },
      {
        type: 'p',
        text: "Second: the Rose Hall Great House night tour. Yes, it leans theatrical, there's a ghost story, but the 1770s architecture and the sugar-era history are real, and the evening version is genuinely atmospheric. About $30 and worth an hour.",
      },
      {
        type: 'p',
        text: "Third: the drive out to YS Falls in St. Elizabeth. It's 90 minutes each way so you lose most of the day in the van, but it's the prettiest waterfall on the island, the crowds are a fraction of Dunn's River, and the rope swing into the lower pool is the cleanest adrenaline you can buy for $22.",
      },
      {
        type: 'p',
        text: "Fourth: the Rastafari Indigenous Village on the Montego River, twenty minutes from the Hip Strip. It's a living community, not a show, you're walked through drumming, ital cooking, and the herb gardens by the people who actually live there. Budget around two hours; it's the most honest cultural stop in the parish.",
      },
      {
        type: 'quote',
        text: "Half the guests who come to Montego Bay never see Montego Bay. They see the shuttle, the gate, and the beach their hotel owns. The town is right there.",
      },
      { type: 'h2', text: "The skip list" },
      {
        type: 'list',
        items: [
          'Large catamaran "booze cruises" leaving from Doctor\'s Cave, overbooked and impersonal',
          'Shopping tours to the craft market, just take a $7 taxi if you want to shop',
          'Any "3 parishes in a day" van tour, you will spend 6 hours in traffic',
          'Horseback-riding resort packages that never leave resort property',
          'Private island beach day excursions that are basically a different pool',
        ],
      },
      {
        type: 'p',
        text: "Two surprise entries rising up my list this year: the Greenwood Great House (smaller and more personal than Rose Hall, about $20) and the Appleton Estate rum tour ($40, 90 minutes inland, absurdly generous tasting at the end).",
      },
      {
        type: 'p',
        text: "The other quiet winner is a private driver day. Not a tour per se, but $180–220 for 8 hours with a local who designs the route around what you actually want. Three guests, one driver, no schedule. It's how most of my repeat visitors end up doing their second trip.",
      },
      { type: 'h2', text: "Before you book" },
      {
        type: 'p',
        text: "Montego Bay tour pricing runs hot because concierge desks take 30–50% commission. Book direct with the operator, confirm the group size, and confirm lunch logistics, a lot of day tours still stop at a roadside spot the driver has a kickback with.",
      },
      {
        type: 'p',
        text: "MAPL Tours runs small-group versions of the top picks, the raft, the rum tour, the great-house night. See dates on /explore.",
      },
    ],
    relatedSlugs: ['montego-bay-beyond-the-strip', 'montego-bay-airport-guide'],
  },
  {
    slug: 'ocho-rios-airport-transfer',
    title: 'Airport Transfer to Ocho Rios: Your Options Ranked',
    excerpt:
      "Planning an airport transfer to Ocho Rios? Here's every option, shuttles, private drivers, rideshare, rental cars, ranked by cost, time, and hassle.",
    category: 'Guides',
    image: BLOG_IMAGES['ocho-rios-airport-transfer'],
    readTime: 4,
    publishedAt: '2025-06-26',
    author: simone,
    body: [
      {
        type: 'p',
        text: "You land in Montego Bay, the humid air hits you as you step out of Sangster's arrivals hall, and somewhere ahead of you is a 75-mile drive to Ocho Rios along the north coast. The airport transfer to Ocho Rios is the first decision of your trip, and it sets the tone. Get it right and you're at the pool in two hours. Get it wrong and you're stranded with four suitcases at a Spanish Town roundabout.",
      },
      {
        type: 'p',
        text: "There's no train and no public bus that picks up at the terminal, and the airport's own site lists only two authorised taxi companies at the desk outside customs. Ride-hailing sits under a government ban that is still officially in force, so it is not something to plan an arrival around. Your options are narrower than they feel. Here they are, ranked.",
      },
      { type: 'h2', text: "Private driver, the pick" },
      {
        type: 'p',
        text: "For one to four people, a pre-booked private transfer is the clear winner. Cost is $120–160 one-way, it takes 90–110 minutes, and the driver meets you inside arrivals with a name board. No haggling, no shared shuttle loop, and the car is yours. Book 24 hours ahead minimum.",
      },
      {
        type: 'p',
        text: "Any reputable Jamaica ground-transport operator will send a JTB-licensed driver with insured seating. Confirm the quoted price includes tolls (the Mahoe Bypass toll is $3) and that the vehicle has AC. Tip 10–15% at the drop-off.",
      },
      { type: 'h2', text: "Shared shuttle, the budget option" },
      {
        type: 'p',
        text: "Knutsford Express and a handful of resort-specific shuttles run shared vans from MBJ to Ocho Rios. They price per person rather than per vehicle, the run takes longer because of multi-resort drop-offs, and you travel on their schedule. Fine for solo travellers, painful for families, and the per-person basis is what makes a group expensive.",
      },
      {
        type: 'quote',
        text: "A shared shuttle saves you forty dollars and costs you ninety minutes. Do that math with a toddler in tow.",
      },
      { type: 'h2', text: "Rental car, only if you're brave" },
      {
        type: 'list',
        items: [
          'Driving is left-side, roads are narrow, and mountain turns have no shoulders',
          'Economy cars run $55–80 per day plus CDW, gas is about $6 per gallon',
          'The A1 coastal highway is the simplest drive on the island, still demanding at night',
          "Parking in Ocho Rios town is tight; most hotels charge extra",
          'Only rent if you plan to explore daily beyond your resort',
        ],
      },
      {
        type: 'p',
        text: "If you're not planning to drive around the island every day, skip the rental. A private driver for your one or two excursion days will cost less than a week of rental plus insurance.",
      },
      { type: 'h2', text: "Route 200 helicopter" },
      {
        type: 'p',
        text: "Yes, it exists. TimAir and a handful of charters run chopper transfers from MBJ to Ocho Rios in 20 minutes for around $1,200 total for up to 4 passengers. Overkill for most trips, but a pretty remarkable first-look at the north coast if you're splurging for a special occasion.",
      },
      { type: 'h2', text: "What it costs" },
      {
        type: 'p',
        text: "The honest math turns on one thing: shared shuttles and resort desks charge per person, a private transfer charges per vehicle. So the more of you there are, the better private looks, and a family of four is usually past the crossover already. For a solo traveller on a flexible schedule, the coach is hard to beat.",
      },
      {
        type: 'p',
        text: "MAPL Tours can arrange the airport transfer to Ocho Rios as part of any experience booking, ask when you check out on /explore.",
      },
    ],
    relatedSlugs: ['ocho-rios-complete-guide', 'getting-around-jamaica-guide'],
  },
  {
    slug: 'kingston-gastronomy-tour',
    title: 'A Gastronomy Tour of Kingston, Jamaica',
    excerpt:
      "A gastronomy tour of Kingston, Jamaica: patties, pepperpot, Devon House, seafood at Gloria's in Port Royal, and the chefs redefining Caribbean fine dining.",
    category: 'Food',
    image: BLOG_IMAGES['kingston-gastronomy-tour'],
    readTime: 5,
    publishedAt: '2025-07-10',
    author: devon,
    body: [
      {
        type: 'p',
        text: "A gastronomy tour of Kingston, Jamaica, is not a walking tour. It's a driving tour with a glove compartment full of napkins. This city eats across parishes, time zones, and income brackets, and the best way to understand it is to start at 7am in a patty shop and end after midnight at a fried-fish window in Port Royal.",
      },
      {
        type: 'p',
        text: "Kingston's food scene has two simultaneous stories. The first is rooted: ackee and saltfish, mannish water, curry goat, oxtail, the patty industrial complex. The second is newer: a dozen chefs in their 30s and 40s who trained in London and New York and came home to reinterpret the canon. You want both.",
      },
      { type: 'h2', text: "The rooted side" },
      {
        type: 'p',
        text: "Start with breakfast at Moby Dick or Island Grill. Ackee and saltfish, the national dish, plus fried dumplings and mint tea. About $8. Then mid-morning, a patty at Tastee in New Kingston. The flaky crust and the slow-cook beef filling are objectively superior to the chain competitor two blocks away, and you can't convince me otherwise.",
      },
      {
        type: 'p',
        text: "Lunch should be jerk, Scotchies on Constant Spring Road is the accessible answer. The pork gets the headlines; order the chicken with a festival (sweet fried dumpling) and a Ting grapefruit soda. You'll spend $15 and be annoyed at every other jerk place for a week.",
      },
      { type: 'h2', text: "The new wave" },
      {
        type: 'p',
        text: "Dinner is where Kingston has shifted most dramatically. Chef Brian Lumley at 689 by Brian Lumley runs a tasting menu of reimagined Jamaican classics, a smoked-marlin dumpling, a scotch-bonnet beurre blanc, a rum-cured duck. About $95 per person without wine.",
      },
      {
        type: 'p',
        text: "At F&B Downtown, the 'new-Caribbean' dishes rotate monthly and draw the city's creative class. On the casual end, Regency by the Courtleigh does a beautiful jerk-crusted lamb and a grilled snapper that's as good as anything on the north coast.",
      },
      {
        type: 'quote',
        text: "Jamaica gets asked when it will have fine dining. It always had it. The grandmothers invented it; the restaurants just put it on a white plate.",
      },
      { type: 'h2', text: "The Port Royal finale" },
      {
        type: 'list',
        items: [
          "Gloria's, fried fish, bammy, festival, eaten at a plastic table by the water",
          'Y-Knot, the rival across the street, with a slightly sweeter escovitch',
          'Fisherman stands on the road in, grilled lobster in season, $18–25',
          'Sunset is the move, be seated by 6:15pm',
          'Cash only at most of the good spots',
        ],
      },
      {
        type: 'p',
        text: "The 20-minute drive from New Kingston to Port Royal crosses the Palisadoes, that narrow spit of land between the harbor and the open sea. The city recedes, the old British fort appears, and dinner is on a seawall. It is, honestly, the most romantic meal in Jamaica and nobody talks about it.",
      },
      { type: 'h2', text: "What it costs" },
      {
        type: 'p',
        text: "A full day gastronomy tour of Kingston, Jamaica, breakfast through late dinner, runs $70–100 per person if you self-drive and order moderately. A guided version with a driver and tastings runs $180–240. The tasting menus at the top restaurants are $80–110 before drinks. Patty budget: $3 per patty, and you will want more than one.",
      },
      {
        type: 'p',
        text: "MAPL Tours runs a small-group Kingston street food and market crawl that hits many of these stops in a single afternoon. See it on /explore.",
      },
    ],
    relatedSlugs: ['jamaican-jerk-explained', 'kingston-culture-guide'],
  },
  {
    slug: 'westmoreland-eco-cottage-guide',
    title: 'Westmoreland Eco-Cottages: Off-Grid Jamaica, Properly',
    excerpt:
      'A Westmoreland eco-cottage Jamaica guide, where they are, what they cost, what solar-and-cistern living actually feels like in the hills above Negril.',
    category: 'Guides',
    image: BLOG_IMAGES['westmoreland-eco-cottage-guide'],
    readTime: 5,
    publishedAt: '2025-07-17',
    author: andre,
    body: [
      {
        type: 'p',
        text: "About twelve miles inland from Seven Mile Beach, the Westmoreland hills rise into a quiet green plateau of pimento trees and small farms. This is where the Westmoreland eco-cottage Jamaica scene lives, a loose network of about forty off-grid cottages built by local landowners and expat architects, rented by the week to travelers who want Negril's proximity without Negril's strip.",
      },
      {
        type: 'p',
        text: "I spent a week in one last February, on a hillside above Little London, and came back convinced this is the most underrated way to stay on the island for anyone who values quiet over nightlife.",
      },
      { type: 'h2', text: "What off-grid actually means" },
      {
        type: 'p',
        text: "Most cottages run on rooftop solar with a battery bank sized for 48–72 hours of cloud cover. Water comes from a cistern that collects rain off the metal roof, it gets filtered at the kitchen tap and you drink it straight. Refrigeration is propane or DC compressor. AC is usually absent; fans and cross-breeze do the work.",
      },
      {
        type: 'p',
        text: "In practice, that means you can run everything you need, lights, fridge, ceiling fans, a laptop, a Bluetooth speaker, without thinking about it. You can't run a full-bore electric kettle plus a hair dryer plus an AC unit at the same time. Adjust once, then forget.",
      },
      {
        type: 'p',
        text: "Internet is usually a 4G hotspot that gets 30–60 Mbps. Plenty for video calls. Nobody will fault you for closing the laptop anyway.",
      },
      {
        type: 'quote',
        text: "Guests arrive worrying about the solar. Then on the third morning they realize they have not checked a single battery level. That is when the vacation starts.",
      },
      { type: 'h2', text: "What you get that a resort can't sell you" },
      {
        type: 'list',
        items: [
          '180-degree ridgeline views with maybe two neighbors in sight',
          'A kitchen stocked from the Savanna-la-Mar market, $60 feeds two for a week',
          'Frogs and crickets louder than any speaker',
          'A private plunge pool or outdoor shower at most properties',
          'A 25-minute drive to Seven Mile Beach whenever you want the sea',
        ],
      },
      {
        type: 'p',
        text: "The cottages tend to come with a property manager who lives nearby, a caretaker who'll fetch groceries, arrange a private chef, or set up a guide for a hike. Not staff in the resort sense; more like the neighbor who fixes a leaking tap.",
      },
      {
        type: 'p',
        text: "On food: nearly every cottage offers an optional Jamaican chef for one or two dinners a week, a multi-course meal cooked in your own kitchen for a set price per head. Brown-stew fish, rundown, fresh callaloo. You eat on the porch while the sun drops into the Caribbean.",
      },
      { type: 'h2', text: "What it costs" },
      {
        type: 'p',
        text: "A one-bedroom Westmoreland eco-cottage runs $175–260 per night in high season, $110–180 in shoulder. Two-bedrooms start around $290. Most owners require a three- or four-night minimum. Add $120–180 each way for a private transfer from Sangster airport in Montego Bay, about 90 minutes.",
      },
      {
        type: 'p',
        text: "MAPL Tours pairs cottage stays with day experiences, cliff-diving at Rick's, snorkeling off Seven Mile, or a food crawl in Savanna-la-Mar. Browse Negril and Westmoreland experiences on /explore.",
      },
    ],
    relatedSlugs: ['negril-guide', 'negril-seven-mile-truth'],
  },
  {
    slug: 'cbd-spa-jamaica',
    title: 'CBD Spas in Jamaica: A Field Report',
    excerpt:
      'A field report on CBD spa Jamaica experiences, which treatments are worth the money, what to expect from a licensed menu, and how much it costs.',
    category: 'Stories',
    image: BLOG_IMAGES['cbd-spa-jamaica'],
    readTime: 4,
    publishedAt: '2025-07-31',
    author: maya,
    body: [
      {
        type: 'p',
        text: "The phrase CBD spa Jamaica has been on resort menus for about three years now, and the honesty of those menus ranges enormously. I spent four weeks over two trips trying treatments at eight properties, from a licensed boutique spa in Negril to an oceanfront resort in Ocho Rios to a small wellness studio in Treasure Beach, to figure out which are real and which are decorative.",
      },
      {
        type: 'p',
        text: "This isn't an endorsement of CBD as medicine. It's a practical report on what the experience is actually like, what you can expect to feel, and what a reasonable price looks like.",
      },
      { type: 'h2', text: "What's actually on the menu" },
      {
        type: 'p',
        text: "Licensed CBD spas in Jamaica generally offer four categories: a CBD massage (topical oil, 50–100mg per treatment), a CBD facial (serums and sheet masks), a CBD body scrub (sugar or salt with infused oil), and, at a smaller set of properties, a CBD bath soak in a private tub. A minority of spas also run a CBD-plus-sound-bath combination.",
      },
      {
        type: 'p',
        text: "Topical CBD is not psychoactive. You will not feel high. What you might feel is a gentle reduction in muscle tension and, on sun-burned or post-hike skin, a cooling effect from the carrier oils and essential-oil blends. Whether that's CBD or good hands and good oil is hard to disentangle.",
      },
      { type: 'h2', text: "The field notes" },
      {
        type: 'p',
        text: "The best treatment of my eight: a 90-minute CBD massage at a licensed studio on the Negril cliffs. The therapist had 14 years of experience, the oil was sourced from a small Kingston producer, and I slept like I'd been hit with a board that night. Cost: $135.",
      },
      {
        type: 'p',
        text: "The worst: a 60-minute 'CBD facial' at a large resort spa where I'm fairly confident the serum was standard aromatherapy oil with a rebrand. The charge was $180. The giveaway was the menu description, lots of marketing adjectives, no milligrams.",
      },
      {
        type: 'quote',
        text: "If the spa cannot tell you how many milligrams are in your treatment, they are selling you a smell.",
      },
      { type: 'h2', text: "How to pick one" },
      {
        type: 'list',
        items: [
          'Ask the milligram dose, a real CBD massage uses 50–100mg of topical CBD',
          'Ask who makes the oil, a specific Jamaican producer is a good sign',
          'Look for therapists with at least 5 years of massage experience',
          'Avoid any menu where every treatment is described as "infused" without detail',
          'Book at boutique spas over resort chains when possible',
        ],
      },
      {
        type: 'p',
        text: "Negril, Treasure Beach, and the small-property corridor around Ocho Rios have the strongest boutique scene. Kingston has a growing but smaller set of options. Port Antonio has one excellent licensed studio and a handful of pretenders.",
      },
      { type: 'h2', text: "What it costs" },
      {
        type: 'p',
        text: "Licensed boutiques price by treatment length, with facials and bath soaks usually offered alongside. Resort-spa pricing for the same treatments tends to run higher, and the milligram dose is often lower, so ask for both the price and the dose before you book.",
      },
      {
        type: 'p',
        text: "If you want the recovery without the label, a regular deep-tissue massage from a great therapist is often just as good. MAPL Tours lists vetted boutique spa partners as add-ons when you book an experience on /explore.",
      },
    ],
    relatedSlugs: ['negril-guide'],
  },
]
