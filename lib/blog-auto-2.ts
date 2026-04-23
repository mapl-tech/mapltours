import type { BlogPost, BlogAuthor } from './blog'
import { BLOG_IMAGES } from './blog-images'

const maya: BlogAuthor = { name: 'Maya Clarke', role: 'Culture Writer', initials: 'MC' }
const andre: BlogAuthor = { name: 'Andre Bennett', role: 'Senior Editor', initials: 'AB' }
const simone: BlogAuthor = { name: 'Simone Thompson', role: 'Travel Guide', initials: 'ST' }

export const POSTS_2: BlogPost[] = [
  {
    slug: 'ocho-rios-complete-guide',
    title: "Ocho Rios, Jamaica: A Complete Local's Guide",
    excerpt:
      "Ocho Rios Jamaica runs on cruise ships and waterfalls, but the real town lives in the side streets. A local's complete guide to doing it right.",
    category: 'Guides',
    image: BLOG_IMAGES['ocho-rios-complete-guide'],
    readTime: 5,
    publishedAt: '2025-08-14',
    author: simone,
    body: [
      {
        type: 'p',
        text: "By 9am the cruise ships have docked and Main Street in Ocho Rios Jamaica is already noisy — tour buses idling outside Margaritaville, craft vendors opening their stalls, the smell of salt fish and ackee drifting out of a patty shop. This is the version most visitors see. It is not the only one.",
      },
      {
        type: 'p',
        text: "Ocho Rios sits on the St. Ann coast, about 90 minutes from Montego Bay and two hours from Kingston. It is a working town of roughly 16,000 people that swells to forty thousand on a heavy cruise day. The trick to enjoying it is knowing when to be on the strip and when to be anywhere else.",
      },
      {
        type: 'h2',
        text: 'The waterfalls, ranked',
      },
      {
        type: 'p',
        text: "Dunn's River gets the headline, and fairly — the limestone terraces climb 180 feet from the sea to the road above, and the human-chain climb is the rare tourist activity that earns its reputation. Go before 10am or after 2pm to dodge ship crowds. Entry runs around 25 USD for adults.",
      },
      {
        type: 'p',
        text: "Blue Hole, 20 minutes inland, is the antidote. Smaller, quieter, ringed by jungle, with rope swings and jumps up to 25 feet. Entry is about 20 USD and you will share it with maybe thirty people instead of three hundred. Reach Falls in Portland is further but richer — skip it only if your trip is short.",
      },
      {
        type: 'quote',
        text: "Visitors always ask me which falls is best. The honest answer is whichever one is least crowded the day you go. Call ahead.",
        attribution: '— Kemar, licensed Ocho Rios guide',
      },
      {
        type: 'h2',
        text: 'Where to eat that is not the strip',
      },
      {
        type: 'list',
        items: [
          "Miss T's Kitchen on Main Street — proper brown stew chicken and curry goat, lunch plates around 15 USD",
          "Scotchies on the highway toward Drax Hall — best jerk in St. Ann, quarter chicken plus festival for 10 USD",
          "Ocho Rios Jerk Centre behind the craft market — slower pace, locals at lunch, skip the weekend dinner rush",
          "The Ruins at the Falls for a sit-down dinner with the waterfall lit up after dark",
        ],
      },
      {
        type: 'p',
        text: "A useful pattern is to do your big activity in the morning, eat lunch inland, and return to town after 4pm when the ships pull out. The craft market empties. The sea breeze comes up. The light on the harbor at 5pm is the reason people used to paint this coast.",
      },
      {
        type: 'p',
        text: "If you have a second day, drive 40 minutes east to Firefly, Noel Coward's old house above Port Maria. The view from the lawn spans the whole north coast and the entry fee is under 15 USD. Pair it with lunch at Ocho Rios on the way back and you have filled a day without ever queuing.",
      },
      {
        type: 'h2',
        text: 'What it costs',
      },
      {
        type: 'p',
        text: "A reasonable Ocho Rios day budget runs 120 to 180 USD per person — one paid attraction, two meals, a taxi, and a drink. Double that if you add a catamaran or ATV tour. Airport transfers from Montego Bay run 80 to 120 USD per car, and from Kingston 100 to 140 USD. The new north-coast toll highway cut Kingston travel time almost in half.",
      },
      {
        type: 'p',
        text: "Ocho Rios rewards a plan. Book the big stuff early, leave afternoons loose, and let the town show itself after the ships leave. When you are ready to build a day, head to /explore and start with a waterfall.",
      },
    ],
    relatedSlugs: ['dunns-river-falls-tour-guide', 'hotels-in-ocho-rios'],
  },
  {
    slug: 'hotels-in-ocho-rios',
    title: "Hotels in Ocho Rios, Sorted by What You're Actually Doing",
    excerpt:
      "Hotels in Ocho Rios split into three honest categories: all-inclusive, boutique north-coast, and budget in-town. Here is how to pick between them.",
    category: 'Guides',
    image: BLOG_IMAGES['hotels-in-ocho-rios'],
    readTime: 5,
    publishedAt: '2025-08-21',
    author: simone,
    body: [
      {
        type: 'p',
        text: "The search for hotels in Ocho Rios returns 300 results and most of them lie about location. The town is small — four miles of coast, really — but the difference between staying at Mammee Bay, at the harbor, or east toward Tower Isle changes your entire trip.",
      },
      {
        type: 'p',
        text: "The honest shortcut is to pick the hotel category first, then the property. The three categories do very different things, and guests who mix them up end up writing the angry reviews.",
      },
      {
        type: 'h2',
        text: 'The three categories that matter',
      },
      {
        type: 'p',
        text: "All-inclusives dominate the coast west of town — Moon Palace, Hilton Rose Hall sister properties, Beaches, Sandals Ochi, Bahia Principe down the road at Runaway Bay. These run 400 to 900 USD per night for two, meals and drinks included, and they are built for guests who want a closed loop. You eat, swim, sleep, repeat. You can leave. Most do not.",
      },
      {
        type: 'p',
        text: "Boutique and mid-size independents live east of town: Jamaica Inn, Couples Sans Souci, and a cluster of smaller villas around Tower Isle. Rates run 300 to 700 USD, usually room-only or bed-and-breakfast. These attract repeat visitors who want a base rather than a bubble.",
      },
      {
        type: 'p',
        text: "In-town and budget hotels sit right on the harbor or just uphill. Marine View, Rooms on the Beach, and several guesthouses run 90 to 180 USD. Noisier, smaller rooms, but you are a five-minute walk from craft markets, patty shops, and the main beach. Cruise passengers staying a night before flying out love these.",
      },
      {
        type: 'quote',
        text: "Guests who book an all-inclusive then complain they never saw Jamaica — they picked the wrong product. Guests who book a small guesthouse and expect a swim-up bar — same thing. Match the hotel to the trip.",
        attribution: '— Andrea, concierge manager in Ocho Rios',
      },
      {
        type: 'h2',
        text: 'What each type gets right',
      },
      {
        type: 'list',
        items: [
          "All-inclusive: zero friction, predictable food, strong for families and first-time visitors",
          "Boutique: better service ratios, quieter beaches, easier to explore the island from",
          "In-town: lowest price, most access to real Ocho Rios, not great for pool loungers",
          "Villa rentals (separate category, covered elsewhere): best value for groups of six or more",
        ],
      },
      {
        type: 'p',
        text: "Location-wise, Mammee Bay and Tower Isle both have real swimmable beaches. The main harbor beach is fine but narrow. If the beach quality is your deal-breaker, stay outside town. If being able to walk to dinner is the deal-breaker, stay in it.",
      },
      {
        type: 'p',
        text: "Seasonal pricing moves hard. Mid-December through mid-April is peak, with 30 to 50 percent premiums. May to early December drops rates significantly and the weather remains workable outside hurricane-peak September. Cruise-heavy weekdays sometimes cost more than weekends, which is the opposite of most destinations.",
      },
      {
        type: 'h2',
        text: 'Who each hotel suits',
      },
      {
        type: 'p',
        text: "Honeymooners who want to unplug: a quieter adults-only like Couples or Jamaica Inn. Families with young kids: Beaches or Moon Palace, with their water parks and kids clubs. Independent travelers planning day trips: an east-side boutique or an in-town room. Cruise add-on stays: harbor budget hotels. First time on the island and nervous: a big-brand all-inclusive is a fair choice, just book excursions outside the property.",
      },
      {
        type: 'p',
        text: "Hotels in Ocho Rios are the start of the trip, not the trip. Whichever you pick, build at least two days outside the gates — head to /explore for a starter list of what is actually worth leaving the pool for.",
      },
    ],
    relatedSlugs: ['villas-in-ocho-rios', 'ocho-rios-complete-guide'],
  },
  {
    slug: 'villas-in-ocho-rios',
    title: 'Villas in Ocho Rios: The Private-Stay Guide',
    excerpt:
      "Villas in Ocho Rios make sense for groups of six or more, and almost always beat an all-inclusive on cost and comfort. Here is how to book well.",
    category: 'Guides',
    image: BLOG_IMAGES['villas-in-ocho-rios'],
    readTime: 5,
    publishedAt: '2025-08-28',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Villas in Ocho Rios are a different product from the ones you book in Tuscany or Tulum. Most are fully staffed — butler, cook, housekeeper, gardener, sometimes a driver — and the rate on the listing usually already includes them. The sticker can look high until you do the math per head.",
      },
      {
        type: 'p',
        text: "The villa corridor runs east from Ocho Rios through Tower Isle, Boscobel, and Oracabessa down to Port Maria. There are also clusters at Mammee Bay and Drax Hall west of town. Four to eight bedrooms is the sweet spot; beyond that you cross into wedding-venue territory.",
      },
      {
        type: 'h2',
        text: 'What a staffed villa actually includes',
      },
      {
        type: 'p',
        text: "The standard package covers the bedrooms, the pool, a dedicated cook who shops daily and serves three meals, a housekeeper who handles rooms and laundry, a butler who runs the front of house, and a gardener. You pay for groceries and alcohol at cost — usually about 55 to 85 USD per person per day added on top. Staff gratuity is customary at 10 to 15 percent of the rental, split across the team.",
      },
      {
        type: 'p',
        text: "High-end villas add a private chef (rather than a cook) and sometimes a driver. Goldeneye next door to Oracabessa — Ian Fleming's old estate — sits at the very top of this market at 2,000 to 6,000 USD per night. Mid-market staffed villas in Ocho Rios land between 900 and 2,000 USD per night for four to six bedrooms.",
      },
      {
        type: 'quote',
        text: "A family of eight at our six-bedroom works out to about 170 dollars per adult per night including food. The same family at an all-inclusive would pay triple and eat from a buffet.",
        attribution: '— Patricia, villa manager, Tower Isle',
      },
      {
        type: 'h2',
        text: 'How to vet a villa before you book',
      },
      {
        type: 'list',
        items: [
          "Ask for at least five recent guest reviews with dates — not just star ratings",
          "Confirm the exact beach situation: private sand, rocky shore, or a 10-minute walk",
          "Verify generator backup — outages happen, and generators are standard at good properties",
          "Check staff tenure; teams that have been together for years run a smoother house",
          "Ask what the cook's menu range is — some do strictly Jamaican, others cover Italian, Thai, vegan",
        ],
      },
      {
        type: 'p',
        text: "Booking direct with the villa manager usually beats the big portals by 8 to 15 percent. The portals are fine for discovery but once you have a shortlist, email the property. Many have been in the same family for two or three generations and prefer the direct relationship.",
      },
      {
        type: 'p',
        text: "A useful rule: villas in Ocho Rios start paying for themselves at six adults. Below that, a boutique hotel is usually better value and less logistical. Above that, the math is clear, and the experience — your own cook learning your kids' names, your own pool at 10pm — is in a different league.",
      },
      {
        type: 'h2',
        text: 'Who it suits',
      },
      {
        type: 'p',
        text: "Multi-generational family trips, groups of friends traveling together, milestone birthdays and small weddings. It does not suit solo travelers, couples who want nightlife at their doorstep, or anyone whose idea of a vacation involves never thinking about the kitchen. For those, a hotel wins.",
      },
      {
        type: 'p',
        text: "The villa is the container. The island fills it. Once you have the house sorted, head to /explore and start stacking what the family will actually do when they are not in the pool.",
      },
    ],
    relatedSlugs: ['hotels-in-ocho-rios', 'ocho-rios-complete-guide'],
  },
  {
    slug: 'montego-bay-beyond-the-strip',
    title: 'Montego Bay, Jamaica: Beyond the Hip Strip',
    excerpt:
      "Montego Bay Jamaica is more than the Hip Strip and the all-inclusives. The real city lives in the hills and the markets — here is what to see.",
    category: 'Stories',
    image: BLOG_IMAGES['montego-bay-beyond-the-strip'],
    readTime: 5,
    publishedAt: '2025-09-04',
    author: andre,
    body: [
      {
        type: 'p',
        text: "On a Tuesday afternoon the Hip Strip in Montego Bay Jamaica is doing exactly what the Hip Strip does — souvenir hustlers, daiquiri bars, cruise passengers in matching T-shirts. Two miles inland, a woman is making cornmeal porridge in a cast-iron pot and arguing with her neighbor about the price of yam. That second city is the one most visitors never meet.",
      },
      {
        type: 'p',
        text: "Montego Bay is the second-largest city on the island, 110,000 people, capital of St. James parish. It handles the biggest airport in Jamaica and the highest density of all-inclusive resorts on the north coast. It is also one of the older settlements in the Caribbean, with 18th-century great houses and a downtown that was a sugar port before it was a tourist port.",
      },
      {
        type: 'h2',
        text: 'Where the city actually is',
      },
      {
        type: 'p',
        text: "Downtown Mo Bay — Sam Sharpe Square, the courthouse, the cage where enslaved Africans were once held — is a 15-minute drive from the Hip Strip and feels like a different country. The square is named for the enslaved preacher whose 1831 rebellion helped end Jamaican slavery. The bronze statue at its center is worth ten minutes even if you do nothing else downtown.",
      },
      {
        type: 'p',
        text: "From the square, walk up to the Harbour Street craft market for the pressure-test version of shopping. Or drive 20 minutes out to Rose Hall Great House, a restored plantation house with real history and a tourism overlay of ghost stories that is not quite serious but fun after dark.",
      },
      {
        type: 'quote',
        text: "Tourists think Mo Bay ends where the Hip Strip ends. The city goes five miles back into the hills. That is where we live.",
        attribution: '— Leroy, taxi driver, Montego Bay',
      },
      {
        type: 'h2',
        text: 'Food outside the resorts',
      },
      {
        type: 'list',
        items: [
          "Pork Pit on Gloucester Avenue — jerk pork and chicken since 1981, about 10 USD per plate",
          "Scotchies on the highway near the airport — the original franchise, consistent, fast",
          "The Pelican on the Hip Strip — old-school sit-down Jamaican for 20 USD, locals eat here",
          "Bellefield Great House for a guided plantation-lunch experience, 45 USD with tour",
          "Sugar Mill at Half Moon if you want fine dining; plan 120 USD per person with wine",
        ],
      },
      {
        type: 'p',
        text: "For the hills, take a morning drive up to Croydon Plantation for a working-farm tour — Blue Mountain-adjacent coffee, pimento, fruit tastings for about 75 USD. Or book a river experience on the Martha Brae in nearby Trelawny, a 30-minute river bamboo-raft float that locals rate above the better-known Rio Grande.",
      },
      {
        type: 'p',
        text: "The beach situation in the city is mixed. Doctor's Cave Beach is the classic, well-maintained, around 8 USD entry. Dead End Beach at the north end of the strip is free, narrower, loved by locals. Walter Fletcher at Aquasol is family-oriented with small water-park features. None is as good as Seven Mile in Negril, which is fine — Montego Bay is not primarily a beach town.",
      },
      {
        type: 'h2',
        text: 'Who Montego Bay suits',
      },
      {
        type: 'p',
        text: "Short-haul visitors, resort guests who want one real day in the city, history-minded travelers, and anyone flying into MBJ with a free afternoon before the transfer. A full Mo Bay trip of four nights can work if you split it between the Hip Strip for convenience and a hill or east-coast hotel for texture.",
      },
      {
        type: 'p',
        text: "The city is easier to like once you stop asking it to be Negril. Montego Bay Jamaica has its own rhythm — a little harder-edged, a little more urban, more alive at street level. Start on /explore to pick a day out of the resort and into the town itself.",
      },
    ],
    relatedSlugs: ['montego-bay-airport-guide', 'breathless-montego-bay-review'],
  },
  {
    slug: 'montego-bay-airport-guide',
    title: 'Montego Bay Airport: The Smart Arrival Guide',
    excerpt:
      "Montego Bay airport is Jamaica's busiest gateway. Here is how to clear it fast, pick the right transfer, and start your trip on the right foot.",
    category: 'Guides',
    image: BLOG_IMAGES['montego-bay-airport-guide'],
    readTime: 5,
    publishedAt: '2025-09-11',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Sangster International, the Montego Bay airport, handles roughly 4.5 million passengers a year — more than every other Caribbean airport except Punta Cana and San Juan. On a peak Saturday in February the arrivals hall can stack up 90 minutes deep. On a quiet Tuesday in June you clear in 20.",
      },
      {
        type: 'p',
        text: "Code MBJ. Single terminal, two levels, 16 gates. It sits about three miles from the Hip Strip and 90 minutes from Ocho Rios, two hours from Negril, four from Kingston via the scenic route or three by the new toll road. Almost every visitor to the north coast flies in here.",
      },
      {
        type: 'h2',
        text: 'Clearing immigration',
      },
      {
        type: 'p',
        text: "Fill out the Jamaica Immigration and Customs C5 form online before you fly — the paper version in the seat-back pocket still works but the digital one saves you a line. You will need an address; if you are still deciding, a hotel you are at least considering is fine. They do not call it to verify.",
      },
      {
        type: 'p',
        text: "Priority for families with young children, Club MoBay pass holders, and Global Entry equivalents exists, but the fast-track is Club MoBay at 65 USD per person. On a peak day it pays for itself. On a quiet day it is optional theatre. If you are arriving between 11am and 3pm on Saturday, buy it.",
      },
      {
        type: 'quote',
        text: "The single biggest arrival mistake is booking a transfer after clearing customs. If you have not pre-arranged your ride, you will wait on the curb with a hundred other people doing the same thing.",
        attribution: '— Nadine, airport ground operations',
      },
      {
        type: 'h2',
        text: 'Transfer options, ranked',
      },
      {
        type: 'list',
        items: [
          "Private pre-booked transfer — 80 to 140 USD to Negril or Ocho Rios, door to door, zero friction",
          "Resort shuttle — free at most all-inclusives but can wait 60 minutes to fill, leaves on their schedule",
          "Knutsford Express coach to Kingston or Negril — 25 to 40 USD, clean, reliable, not door to door",
          "Route taxi — 4 to 8 USD, shared, only sensible for local short hops",
          "Car rental — fine for experienced drivers, around 75 USD per day plus insurance",
        ],
      },
      {
        type: 'p',
        text: "Uber technically operates around Montego Bay but coverage is patchy and airport pickups are not permitted in the official pickup zone. Local app JUTA Taxi is a decent backup. For most first-time visitors, pre-book a private driver through your hotel or a reputable operator and have them meet you past customs with a name card.",
      },
      {
        type: 'h2',
        text: 'What it costs',
      },
      {
        type: 'p',
        text: "Beyond transfers, Montego Bay airport fees sit quietly in your ticket — departure tax is already included. A bottle of water costs 4 USD. SIM cards at the Digicel kiosk near baggage run 15 to 30 USD with a week of data. Currency exchange at the airport is the worst rate on the island; change only what you need for the first day and use a cambio in town.",
      },
      {
        type: 'p',
        text: "Departure is calmer. Aim for three hours early during peak season, two during off-peak. Club MoBay also works on departures, with a decent lounge airside. Gate 11 has the best view of incoming planes if you end up waiting.",
      },
      {
        type: 'h2',
        text: 'Who each option suits',
      },
      {
        type: 'p',
        text: "First-time families: private transfer, Club MoBay on the way in, hotel shuttle on the way out. Solo travelers on a budget: Knutsford Express. Adventurous drivers: rental, but only if you have driven left-side before. Groups of six or more: private van pre-booked, about 180 USD to most north-coast hotels.",
      },
      {
        type: 'p',
        text: "The airport is the first 30 minutes of the trip, not the trip itself. Clear it cleanly and the rest of Jamaica opens up — head straight to /explore once you have unpacked and let the island begin.",
      },
    ],
    relatedSlugs: ['montego-bay-beyond-the-strip', 'first-time-jamaica'],
  },
  {
    slug: 'negril-seven-mile-truth',
    title: 'Negril, Jamaica: The Seven-Mile Truth',
    excerpt:
      "Negril Jamaica built its reputation on Seven Mile Beach and the West End cliffs. Here is what has changed, what has not, and what to see now.",
    category: 'Stories',
    image: BLOG_IMAGES['negril-seven-mile-truth'],
    readTime: 5,
    publishedAt: '2025-09-18',
    author: maya,
    body: [
      {
        type: 'p',
        text: "Negril Jamaica sits at the westernmost tip of the island, where the coastline bends from the Caribbean toward the Gulf and the sun sets, depending on the season, anywhere between 5:45 and 7:05pm. The town is small — a beach strip, a cliff road, a roundabout, and a few thousand permanent residents.",
      },
      {
        type: 'p',
        text: "It was, for a long time, the counter-culture capital of the island. Ian Fleming's friends came here to hide. The hippies arrived in the seventies. Bob Marley played at Bloody Bay. By the nineties it was on every charter-flight brochure in Europe. Today it is all three of those things at once, stacked on top of each other.",
      },
      {
        type: 'h2',
        text: 'Seven Mile Beach, honestly',
      },
      {
        type: 'p',
        text: "The beach is actually closer to six and a half miles of continuous sand. The water is famously calm because a reef about a mile out takes the wave energy. It ranks in most Caribbean top-five lists for good reason — the sand is fine and pale, the slope is gentle, and public access runs the full length.",
      },
      {
        type: 'p',
        text: "It is also under pressure. Coastal erosion has narrowed sections of the beach by 10 to 20 feet in the past two decades. Some hotels have installed groynes, some have not, and on rougher-sea days the beach in front of a handful of properties is functionally gone. Ask your hotel for a recent beach photo, not a brochure shot, before you book.",
      },
      {
        type: 'quote',
        text: "The beach still delivers. You just have to know which mile you are on. The north end near Bloody Bay is wider now. The middle is the tightest. The south end is mixed.",
        attribution: '— Marcus, dive-shop owner, Negril',
      },
      {
        type: 'h2',
        text: 'The cliffs, which most guides undersell',
      },
      {
        type: 'list',
        items: [
          "Rick's Cafe — famous, crowded, worth one sunset, skip the dinner menu",
          "Pirate's Cave — quieter jump spot, 15 USD entry with swim access",
          "Xtabi — mid-range hotel with cliff access and a good snorkel entry",
          "3 Dives — the local jerk place with cliff access, cheapest way to watch sunset",
          "Negril Escape — terraced yoga and cliff swimming for a quieter day",
        ],
      },
      {
        type: 'p',
        text: "The West End — the cliff road — is where regulars end up staying. Limestone cliffs 20 to 40 feet high, small boutique hotels carved into the rock, snorkel access straight off ladders, sunset views that turn the whole ocean copper. If you have been to Negril before and felt the beach was too busy, the cliffs are the answer.",
      },
      {
        type: 'p',
        text: "Inland, the Negril Great Morass is the second-largest wetland in Jamaica, and few visitors ever see it. Guided kayak trips through the morass run 50 to 75 USD and turn up crocodiles, herons, and a side of Negril that has nothing to do with the beach.",
      },
      {
        type: 'h2',
        text: 'What has changed',
      },
      {
        type: 'p',
        text: "Negril has kept more of its small-operator character than Montego Bay. Most cliffside hotels still have under 60 rooms. The beach has some big all-inclusives — Couples, Beaches, Royalton, Azul — but they sit between plenty of family-run places where the owner knows your name by day two.",
      },
      {
        type: 'p',
        text: "Negril Jamaica rewards slow days. Walk the beach at 7am before the vendors set up. Spend an afternoon on the cliffs with nothing but a book. Watch one sunset from the water instead of the bar. When you are ready to build a day trip, head to /explore — and save the cliffs for the last evening.",
      },
    ],
    relatedSlugs: ['negril-beach-walkthrough', 'negril-guide'],
  },
  {
    slug: 'negril-beach-walkthrough',
    title: 'Negril Beach: A Mile-by-Mile Walkthrough',
    excerpt:
      "Negril Beach is not one beach — it is four distinct stretches with very different vibes. Here is a mile-by-mile guide to picking the right one.",
    category: 'Guides',
    image: BLOG_IMAGES['negril-beach-walkthrough'],
    readTime: 5,
    publishedAt: '2025-09-25',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Negril Beach is the umbrella name for a continuous arc of sand that runs from Long Bay in the south to Bloody Bay in the north. Most visitors treat it as one place. Locals know it as four, each with its own crowd, food scene, and rules. Knowing which mile you are on matters.",
      },
      {
        type: 'p',
        text: "The walkable stretch is about six and a half miles. You can start at the south roundabout and walk barefoot almost all the way to Bloody Bay in a long morning. Along the way the beach narrows, widens, and changes character four times.",
      },
      {
        type: 'h2',
        text: 'Miles 1 and 2: the south strip',
      },
      {
        type: 'p',
        text: "From the roundabout north to about the Tree House hotel, the beach is busiest. Vendors every 50 meters, jet skis, braiding stalls, beach bars with speakers. The sand here has narrowed most from erosion — some stretches are 30 feet wide, some are 10. The upside is convenience: you can order a jerk plate and a rum punch without walking more than two minutes from a chair.",
      },
      {
        type: 'p',
        text: "This is the right stretch for first-time visitors who want the full Negril energy and do not mind the noise. Couples Negril, Beaches, and a cluster of mid-size properties anchor this section. Expect 45 to 80 USD for a day pass if you are not staying.",
      },
      {
        type: 'h2',
        text: 'Miles 3 and 4: the wider middle',
      },
      {
        type: 'p',
        text: "The beach broadens around Sunset at the Palms and stays generous up to Sandy Haven. This is the photo-shoot stretch — wide white sand, calm water, fewer vendors. The hotels are smaller, the crowd is more 35-and-up, and the pace drops about 30 percent versus the south.",
      },
      {
        type: 'quote',
        text: "Ask any local where to bring their own family on a Sunday and they will point to the middle. The south is for a night out. The middle is for a day off.",
        attribution: '— Tanya, longtime Negril Beach vendor',
      },
      {
        type: 'h2',
        text: 'Miles 5 and 6: Bloody Bay and the quiet end',
      },
      {
        type: 'list',
        items: [
          "Bloody Bay itself is the widest and cleanest stretch — ringed by Royalton, Riu, and Grand Bahia",
          "Public access at Bloody Bay Park — 10 USD entry, showers, picnic tables",
          "Cosmos on the Beach — longstanding local seafood spot, lobster thermidor around 35 USD",
          "Snorkeling is better here than the south — the reef sits closer in",
          "Sunsets here beat the south strip because the view is unobstructed by hotel buildings",
        ],
      },
      {
        type: 'p',
        text: "Bloody Bay is named, depending on who you ask, for the whaling industry that once operated here or for a battle during the colonial period. It is now the most resort-dense mile of the whole Negril Beach coast but still has the widest sand. If you are staying on this end you are committing to a quieter trip with less beach-strip walking.",
      },
      {
        type: 'p',
        text: "A useful move for multi-day trips is to hotel-hop the beach. Book three nights in the middle, two on the cliffs, and spend one full day walking south to north with swim stops. You will understand the whole of Negril by the time you finish.",
      },
      {
        type: 'h2',
        text: 'What it costs',
      },
      {
        type: 'p',
        text: "Public beach access is free everywhere along Negril Beach by law, though some hotels make it awkward. A beach chair rental runs 5 to 15 USD for the day. A jerk plate from a shack is 8 to 12 USD; lunch at a hotel beach restaurant runs 20 to 30. Vendors will try 10 to 20 USD higher on the first quote — polite negotiation is expected.",
      },
      {
        type: 'p',
        text: "Negril Beach changes every mile. Pick the one that matches the day you actually want, and spend the rest of the time exploring — /explore has the rest of the island whenever you are ready to leave the sand.",
      },
    ],
    relatedSlugs: ['negril-seven-mile-truth', 'negril-guide'],
  },
  {
    slug: 'breathless-montego-bay-review',
    title: 'Breathless Montego Bay: An Honest Review',
    excerpt:
      "Breathless Montego Bay is a 150-room adults-only from Hyatt on a cliff-edge peninsula. Here is what travelers report, and who the resort actually suits.",
    category: 'Guides',
    image: BLOG_IMAGES['breathless-montego-bay-review'],
    readTime: 5,
    publishedAt: '2025-10-02',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Breathless Montego Bay sits on a private cliff peninsula about 20 minutes from Sangster International. It is an adults-only, all-inclusive from the Hyatt Inclusive Collection, with 150 rooms, seven restaurants, and a view that is the single most quoted line in every guest review online.",
      },
      {
        type: 'p',
        text: "Rate ranges run roughly 450 to 750 USD per night for a couple in low and mid-season, climbing to 850 to 1,100 during peak winter weeks. All meals, drinks, tips, wi-fi, and most activities are included. No kids — the minimum age is 18 — which is the property's defining feature.",
      },
      {
        type: 'h2',
        text: 'What the property gets right',
      },
      {
        type: 'p',
        text: "Location is the strongest pitch. The peninsula gives the resort three sides of ocean, which means a lot of rooms get wraparound or dual-exposure water views. The infinity pool looks straight out at the bay and the sunset from the Xcelerate rooftop bar is probably the resort's signature moment. On a clear evening you can see the lights of Mo Bay across the water.",
      },
      {
        type: 'p',
        text: "Food range is above the Caribbean all-inclusive average. Seven restaurants including a teppanyaki room, a French bistro called Bordeaux, a Mexican spot, and an Italian trattoria. Guests consistently rate the teppanyaki and the French restaurant the highest. Reservations are tight in peak weeks — book them on arrival.",
      },
      {
        type: 'quote',
        text: "We went for our tenth anniversary. The food was better than we expected, the view was the reason we went, and we barely left the property — which for an adults-only is the point.",
        attribution: '— reported traveler review, October 2024',
      },
      {
        type: 'h2',
        text: 'Where it falls short',
      },
      {
        type: 'list',
        items: [
          "No real beach on the peninsula — the resort has a small sandy area and a pier, not Seven Mile",
          "Shuttle to a partner beach takes about 20 minutes; some guests find this a dealbreaker",
          "Restaurant reservations fill fast in peak season — plan on day one",
          "Spa service upsells can be aggressive; be clear about the included versus paid menu",
          "Room categories vary a lot — preferred club level is a meaningful upgrade over entry rooms",
        ],
      },
      {
        type: 'p',
        text: "The beach question is the biggest split among reviewers. If your vision of Jamaica is walking barefoot on a long stretch of sand, Breathless is the wrong product for you. The peninsula has cliff access and a small man-made beach, but travelers who want a wide beach day consistently end up slightly disappointed. Those who came for the pool, the views, and the food consistently rate it very high.",
      },
      {
        type: 'p',
        text: "Service scores are typically strong — Hyatt's service standards translate, and turnover at the property is lower than many Caribbean all-inclusives, which shows in the consistency. Housekeeping and butler service on the preferred club floors get frequent mentions.",
      },
      {
        type: 'h2',
        text: 'Who it suits',
      },
      {
        type: 'p',
        text: "Couples on anniversaries, small groups of adult friends, honeymooners who want an adult-forward atmosphere with a DJ-pool scene rather than silence. Travelers doing a first Caribbean trip who want predictable high-end food. People who specifically do not want to hear children in a pool on vacation.",
      },
      {
        type: 'p',
        text: "Who should skip it: families, anyone whose main goal is an actual beach day, solo travelers (it is priced as double-occupancy and the social scene leans coupled), and guests planning multiple off-property excursions, who will do better at a hotel closer to the Hip Strip or on the east end of town.",
      },
      {
        type: 'h2',
        text: 'What travelers report',
      },
      {
        type: 'p',
        text: "The consistent pattern is a 4.3 to 4.5 out of 5 across major travel platforms, with repeat guests a reliable share of reviews. Breathless Montego Bay works best when the trip is about the property itself, not Jamaica at large. Pair it with a day or two of off-resort exploring — head to /explore to plan those — and you have a balanced trip.",
      },
    ],
    relatedSlugs: ['montego-bay-beyond-the-strip', 'secrets-wild-orchid-montego-bay-review'],
  },
  {
    slug: 'secrets-wild-orchid-montego-bay-review',
    title: 'Secrets Wild Orchid Montego Bay: The Honest Take',
    excerpt:
      "Secrets Wild Orchid Montego Bay is a 350-room adults-only on Freeport peninsula. Here is what the property delivers, and who it actually suits.",
    category: 'Guides',
    image: BLOG_IMAGES['secrets-wild-orchid-montego-bay-review'],
    readTime: 5,
    publishedAt: '2025-10-09',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Secrets Wild Orchid Montego Bay shares its site and most of its infrastructure with its sister property Secrets St. James on the Freeport peninsula, roughly 15 minutes from Sangster International. Together the two resorts run about 700 rooms; Wild Orchid itself is about 350. Adults-only, all-inclusive, operated by the Hyatt Inclusive Collection brand family.",
      },
      {
        type: 'p',
        text: "Rate ranges typically run 350 to 650 USD per night for a standard ocean-view, climbing to 750 to 1,000 for preferred club and swim-up rooms. Peak winter weeks push higher. All meals, drinks, tips, and non-motorized watersports are included. Guests get exchange privileges with Secrets St. James, which doubles the restaurant count to 12.",
      },
      {
        type: 'h2',
        text: 'The sister-property advantage',
      },
      {
        type: 'p',
        text: "This is the most-mentioned strength in guest reviews. Booking either Secrets property gives you the run of both, which changes the calculus. Twelve restaurants between them, six pools, two beach areas, and two sets of nightly entertainment. For a seven-night stay that variety meaningfully reduces the usual all-inclusive fatigue.",
      },
      {
        type: 'p',
        text: "The actual beach is modest — a crescent of sand on either side of the peninsula, protected, good for swimming, less good for long walks. Guests looking for a Seven Mile Beach experience will be disappointed here, the same as at most Mo Bay resorts. The trade-off is the water is consistently calm, which families with weaker swimmers (in the sister family resort) appreciate.",
      },
      {
        type: 'quote',
        text: "The food range is what made the week — we ate at a different restaurant every night and only repeated one. Rooms are dated in places but the bones are solid.",
        attribution: '— reported traveler review, November 2024',
      },
      {
        type: 'h2',
        text: 'Where it lags',
      },
      {
        type: 'list',
        items: [
          "Some room categories are overdue for refurbishment — check photos from the past six months",
          "Property is large; if you book a far building, expect a 10-minute walk to the main lobby",
          "Entertainment leans Caribbean-resort standard — fire dancers, theme nights, not reinvented",
          "Preferred club value is real — skip it only if you are price-sensitive and rarely use lounges",
          "Wi-fi is free but patchy in some rooms; bring a backup if you work remotely",
        ],
      },
      {
        type: 'p',
        text: "Food quality is above average by all-inclusive standards but rarely reaches the top tier. The Portofino Italian restaurant and the Himitsu teppanyaki are the two reviewers call out most. The buffet at Market Cafe is solid, with a breakfast selection that earns particular praise. Seafood is reliable; beef is hit-or-miss.",
      },
      {
        type: 'p',
        text: "Service varies by section — the preferred club staff get near-universal praise and the main-resort bar staff get mixed reports. Tipping is technically included but guests who tip extra at their favorite bar often report better service through the week. Typical here, and true to the category.",
      },
      {
        type: 'h2',
        text: 'Who it suits',
      },
      {
        type: 'p',
        text: "Groups of adult friends on a price-conscious budget who want variety. Couples doing a longer five-to-seven-night trip where the two-resort access pays off. Return visitors to Jamaica who want a reliable all-inclusive base rather than a destination property. Weddings and small celebrations — the venue options are strong.",
      },
      {
        type: 'p',
        text: "Who should skip it: travelers looking for a more intimate property — Secrets Wild Orchid Montego Bay is deliberately large. Families, obviously. And anyone whose deal-breaker is the wide, long beach of Negril. For those, the Hip Strip area is closer to the airport but the beach is still narrow; the real answer is to drive 90 minutes to Negril.",
      },
      {
        type: 'h2',
        text: 'What travelers report',
      },
      {
        type: 'p',
        text: "Ratings cluster around 4.1 to 4.4 across major platforms, with the sister-property swap and the food variety the most consistent positives, and dated rooms and a compact beach the most consistent negatives. It is a strong mid-to-upper-mid all-inclusive that rewards a little planning. Pair your stay with an off-property day or two — head to /explore to pick them — and it holds up well.",
      },
    ],
    relatedSlugs: ['breathless-montego-bay-review', 'jewel-grande-montego-bay-review'],
  },
  {
    slug: 'jewel-grande-montego-bay-review',
    title: 'Jewel Grande Montego Bay: Who It Actually Suits',
    excerpt:
      "Jewel Grande Montego Bay is a 400-unit family-and-suite resort on Rose Hall. Here is what it delivers, what it does not, and who should book it.",
    category: 'Guides',
    image: BLOG_IMAGES['jewel-grande-montego-bay-review'],
    readTime: 5,
    publishedAt: '2025-10-16',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Jewel Grande Montego Bay is unusual among Mo Bay all-inclusives — it is primarily a suite-and-villa property, with roughly 400 units, most of them one-bedroom and larger. It sits on the Rose Hall coast about 20 minutes east of Sangster International, sharing a beach and infrastructure with the nearby Iberostar and Hyatt Ziva properties.",
      },
      {
        type: 'p',
        text: "Rates run roughly 400 to 700 USD per night for a one-bedroom suite for two, stepping up through two- and three-bedroom units and topping out with the private beachfront villas at 1,500 to 3,500 per night. All-inclusive rate covers meals, drinks, tips, and entertainment. The property accepts families and adults, with both AM/PM kids clubs and adult-only pool areas.",
      },
      {
        type: 'h2',
        text: 'Why the suites matter',
      },
      {
        type: 'p',
        text: "Almost every guest review mentions space. One-bedrooms come in around 750 square feet, two-bedrooms around 1,300, and three-bedrooms push past 1,700. All suites have full kitchens, separate living areas, and washer-dryers in unit. For a family of four or two couples traveling together, the per-unit math beats two standard rooms at almost any competitor.",
      },
      {
        type: 'p',
        text: "The villa tier is a genuinely distinct product — private pools, dedicated butler, beachfront placement, and the feel of a rental villa with all-inclusive meals. Starting at around 1,500 USD per night for a two-bedroom villa, they work for multi-generational groups. Smaller villa resorts exist at a lower per-unit price, but few bundle food and service this completely.",
      },
      {
        type: 'quote',
        text: "We booked the three-bedroom for eight of us. It was roomier than our house. The family came together on that trip in a way that would not have happened in three separate hotel rooms.",
        attribution: '— reported traveler review, January 2025',
      },
      {
        type: 'h2',
        text: 'Where it underperforms',
      },
      {
        type: 'list',
        items: [
          "Beach is shared with neighbors and has been narrower in recent years — reef-break protected but not wide",
          "Main buffet gets mixed reviews; specialty restaurants are the better bet",
          "Kid-pool layout is good, but teen amenities are thinner than at family-specialist resorts",
          "Some units feel date-worn; the refurbished blocks are noticeably stronger",
          "Property is large enough to feel spread out; a few rooms are a real walk from the main pool",
        ],
      },
      {
        type: 'p',
        text: "Food is the most variable part of the review pattern. When guests eat primarily at the specialty restaurants and room service (both included in the kitchen-equipped suites, effectively) the scores run high. When they default to the main buffet for most meals, scores drop. For a suite product this is forgivable — you can cook, and the supermarket at Rose Hall shopping center is a short drive.",
      },
      {
        type: 'p',
        text: "Service on the villa side is notably more consistent than in the main suite towers, which again is expected. Butler service, where you pay for it, earns its price. Standard-tier guests get resort-level service, which is fine but not exceptional. The gap is real and worth budgeting around.",
      },
      {
        type: 'h2',
        text: 'Who it suits',
      },
      {
        type: 'p',
        text: "Multi-generational family trips, groups of four to eight adults who want their own space but a shared pool, and families with young kids who value the kitchen more than the kids club. Honeymoon couples who want a suite upgrade over a standard room without going full adults-only. Long stays of seven-plus nights where a kitchen and a washing machine quietly save you a lot.",
      },
      {
        type: 'p',
        text: "Who should skip it: couples on a short trip who do not need the space, singles who will not use the extra room, and beach purists — the beach here is fine, not flagship. For the latter group, Negril or a private-beach boutique makes more sense. Jewel Grande Montego Bay is a space-first, family-first product and works best when those are your priorities.",
      },
      {
        type: 'h2',
        text: 'What travelers report',
      },
      {
        type: 'p',
        text: "Ratings typically land around 4.2 to 4.4 out of 5, with the suite size and villa tier the defining strengths, and food and beach the common reservations. Booked as what it is — a family-and-group suite resort — it punches above its weight. Line up one or two off-property days to break up the rhythm; head to /explore to build them into your week.",
      },
    ],
    relatedSlugs: ['breathless-montego-bay-review', 'secrets-wild-orchid-montego-bay-review'],
  },
]
