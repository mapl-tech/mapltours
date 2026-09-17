import type { BlogPost, BlogAuthor } from './blog'
import { BLOG_IMAGES } from './blog-images'

// One real byline; the named writers these used to be were invented.
const mapl: BlogAuthor = { name: 'MAPL Tours Jamaica', role: 'Editorial', initials: 'MT' }
const devon: BlogAuthor = mapl
const maya: BlogAuthor = mapl
const simone: BlogAuthor = mapl

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
        text: "At 4,000 feet above Kingston, the mist sits on the slope like a slow tide. The soil is volcanic, the nights are cold, and the cherries take almost twice as long to ripen as coffee grown at sea level. That is where Blue Mountain coffee comes from, a strip of mountainside barely 15 miles across, not the entire range that shows up on every souvenir bag in every duty-free shop on the island.",
      },
      {
        type: 'p',
        text: "Most of what tourists buy labeled Blue Mountain coffee is not Blue Mountain coffee. That is not a conspiracy theory, it is a certification fact. The Coffee Industry Board of Jamaica has protected the name since 1953. If you understand what the real thing is, you stop getting fleeced at the airport, and you start drinking coffee that actually earns its price tag.",
      },
      { type: 'h2', text: 'What makes real Blue Mountain coffee' },
      {
        type: 'p',
        text: "Only beans grown between 3,000 and 5,500 feet inside the protected parishes of St. Andrew, St. Thomas, Portland, and St. Mary can legally be called Jamaica Blue Mountain. Anything grown on the same mountains but lower than 3,000 feet is labeled Jamaica High Mountain, a good coffee, but not the same coffee. Below 1,500 feet it becomes Jamaica Low Mountain or Jamaica Supreme, which is what most cheap blends use to borrow the name.",
      },
      {
        type: 'p',
        text: "The altitude matters because colder nights slow the sugar development in the cherry. The bean gets denser, the acidity mellows, and you end up with the clean, almost buttery cup Blue Mountain is known for. No bitter edge, no charred finish, just a long, smooth middle.",
      },
      {
        type: 'quote',
        text: "People taste Blue Mountain and expect fireworks. It is not that coffee. It is the coffee that disappears gently, and you miss it the moment the cup is empty.",
      },
      { type: 'h2', text: 'How to tell the real thing' },
      {
        type: 'list',
        items: [
          "Look for the Coffee Industry Board of Jamaica seal, a blue, round certification mark on the bag",
          "A registered estate name like Wallenford, Mavis Bank, Clifton Mount, Old Tavern, or Craighton",
          "A lot number and harvest year printed on the bag, not just a brand name",
          "Whole bean, packed in a wooden barrel or foil-lined pouch, not pre-ground tourist tins",
          "A price that makes sense, real Blue Mountain runs $50 to $75 per pound, never $15",
        ],
      },
      {
        type: 'p',
        text: "If a bag at the airport costs less than a sandwich, it is a blend, and the Blue Mountain content is probably under 10 percent. That is legal in most export markets, and it is the single biggest reason the world thinks it has tried this coffee and was underwhelmed.",
      },
      { type: 'h2', text: 'What it costs and how to buy it' },
      {
        type: 'p',
        text: "A 16-ounce bag of single-estate Blue Mountain from a certified farm will run you between $55 and $80 on the island itself. At the estates, you can sometimes get it closer to $45 if you buy direct on a tour. In the US or UK, the same bag shipped in is usually $85 to $120. Decaf runs a little higher. Peaberry, the round, single-bean mutation that comes from maybe 5 percent of any crop, is the top tier and sells for north of $120.",
      },
      {
        type: 'p',
        text: "The best way to buy it is to visit. We build coffee farm tastings into the Blue Mountain sunrise trek in [the catalogue](/explore), and you can walk out with a sealed bag straight from the roaster, with the seal, the lot number, and a cup you just drank to prove it. No duty-free markup, no mystery blend. Just the coffee, the mountain that grew it, and the farmer who picked it. No problem.",
      },
    ],
    relatedSlugs: ['blue-mountain-sunrise-hike', 'appleton-estate-rum-tour'],
  },
  {
    slug: 'jamaican-jerk-explained',
    title: "Jamaican Jerk Chicken, Explained by a Chef",
    excerpt:
      "Jamaican jerk is not a marinade, it is a process. A chef breaks down the pit, the pimento wood, the scotch bonnet, and what most home cooks get wrong.",
    category: 'Food',
    image: BLOG_IMAGES['jamaican-jerk-explained'],
    readTime: 8,
    publishedAt: '2026-03-16',
    author: devon,
    body: [
      {
        type: 'p',
        text: "The word jerk does more work than any other word in Jamaican food. It names a spice, a method, a cut, a side of the road, a whole region of Portland. If you have only ever had Jamaican jerk chicken from a bottle labeled jerk sauce, you have not had it, you have had a loose cousin. This is what the real thing actually is, from someone who has been cooking it for twenty years.",
      },
      {
        type: 'p',
        text: "At its core, jerk is a low, slow, smoke-dominant cooking technique that happens to use one of the most specific spice palettes on earth. Strip away any of the three, the pit, the wood, or the spice, and you have something else. Good, maybe. Just not jerk.",
      },
      { type: 'h2', text: 'The pit, and why it matters' },
      {
        type: 'p',
        text: "A proper jerk pit is a low stone or metal trench, usually 12 to 18 inches deep, with green pimento wood laid across the top like the slats of a ladder. The meat sits directly on the wood. There is no grate. The wood is both the fuel and the rack, and as it burns from the bottom it perfumes the meat from above. Heat stays low, 250 to 300°F, and the cook runs four hours for chicken, six for pork.",
      },
      {
        type: 'p',
        text: "Most jerk you taste in North American restaurants is grilled hot and fast over charcoal. That is barbecue with jerk spice. A real pit produces something closer to smoked meat with a lacquered, almost tacky outer bark. The difference is obvious from the first bite.",
      },
      {
        type: 'quote',
        text: "If the chicken has grill marks, it is not jerk. Jerk has no grill marks. Jerk has bark.",
      },
      { type: 'h2', text: 'The spice paste' },
      {
        type: 'list',
        items: [
          "Scotch bonnet, the heat, but also the fruit-forward sweetness; no substitute works",
          "Pimento (allspice), whole berries, hand-crushed; the single most important flavor",
          "Fresh thyme, scallion, ginger, and garlic, pounded, not blended, to preserve texture",
          "Nutmeg and a little cinnamon, the quiet layer most recipes leave out",
          "Brown sugar, soy, and lime, the binding agents, never more than a whisper of each",
        ],
      },
      {
        type: 'p',
        text: "Portland-style jerk leans drier, spicier, and more smoke-heavy. It is the origin version, Boston Bay, just down the coast, is where the technique was formalized by the Maroons in the 17th century. Head west across the island and the style softens. Around Ocho Rios and Montego Bay, you start to see saucier, sweeter jerk designed for tourist palates. Neither is wrong, but they are not the same dish.",
      },
      { type: 'h2', text: 'Before you book a pit session' },
      {
        type: 'p',
        text: "A real pit session is a half-day commitment. You are not dropping in for lunch, you are there from the marinade to the plate. Expect to spend $60 to $90 per person for a small-group experience with a working pit master. You will come home with a spice jar, probably some smoke in your hair, and a benchmark that ruins airport-terminal jerk forever.",
      },
      {
        type: 'p',
        text: "The full Portland version with pimento wood and a three-generation pit is worth the drive, though Boston Bay is a long way east of where we drive, so that one is on you. Ask your driver where they eat jerk on the north coast and you will do well. [The days we do run](/explore) leave room for a proper lunch stop. No problem.",
      },
    ],
    relatedSlugs: ['birthplace-of-jerk-boston-bay', 'blue-mountain-coffee-story'],
  },
  {
    slug: 'reach-falls-vs-dunns-river',
    title: "Reach Falls vs Dunn's River: Which Jamaica Waterfall Wins",
    excerpt:
      "Reach Falls vs Dunn's River: Reach wins on scenery and crowds, Dunn's on convenience. Hours, entry prices, drive times and a clear verdict for your day.",
    category: 'Adventure',
    image: BLOG_IMAGES['reach-falls-vs-dunns-river'],
    readTime: 9,
    publishedAt: '2026-03-20',
    updatedAt: '2026-09-17',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Reach Falls vs Dunn's River comes down to this: Dunn's River in Ocho Rios is the famous, crowded, climbable one, and Reach Falls in Portland is the quiet, green, swim-through-a-cave one. If you have one day near Ocho Rios, do Dunn's River early. If you have a car and a free day, Reach Falls is the better waterfall.",
      },
      {
        type: 'p',
        text: "There are two waterfalls every Jamaica guide pushes. On paper they look similar: tiered falls, green pools, guides, water shoes. In person they are almost opposites. Dunn's River is the postcard, the one cruise ships bus people to in matching life jackets. Reach Falls is the local one, with a small car park, no chain of climbers and a river you wander up at your own pace. Both are run by the Urban Development Corporation, so the prices and hours below come straight from the operator.",
      },
      { type: 'h2', text: "Dunn's River Falls, tested" },
      {
        type: 'p',
        text: "Dunn's River is a travertine waterfall a stone's throw from Ocho Rios in St. Ann that flows straight into the Caribbean Sea, one of very few rivers anywhere that do. The park gives its length as 183 metres, which is about 600 feet, of climbable terraces that keep growing as the river lays down limestone. You go up in a human chain behind a guide, stopping in the pools cut into the rock, and there is a dry path beside the falls for anyone who would rather watch. It is undeniably beautiful. It is also the single most crowded natural attraction on the island, and it has been famous since it appeared in Dr. No.",
      },
      {
        type: 'p',
        text: "On a cruise-ship day the park opens at 7am and the coaches follow. The chain moves at the speed of the slowest person in it, and you can wait a long time just to start the climb. Go at opening on a day without ships and it is a different place: a fast, fun, wet 45 minutes of climbing with room to breathe.",
      },
      {
        type: 'list',
        items: [
          "Hours: 8:30am to 4pm daily; 7am to 4pm on cruise-ship days, which the operator lists as Wednesday to Friday.",
          "Admission: US$25 per adult and US$17 per child for non-residents.",
          "Climbers must be at least 36 inches tall, and the park strongly recommends water shoes. Rent them there or bring your own.",
          "Extras add up: lockers, water shoe rental and the site photographers are all on top of entry.",
        ],
      },
      { type: 'h2', text: 'Reach Falls, tested' },
      {
        type: 'p',
        text: "Reach Falls is at Manchioneal in east Portland, where the Driver's River drops through the montane forest of the John Crow Mountains into an emerald pool. The operator puts it about 45 minutes east of Port Antonio, and the drive is half the appeal: banana farms, cliff-hugging corners, the river beside you. The falls are lower than Dunn's, but the setting is wilder and the water is a colour you will not get on the north coast.",
      },
      {
        type: 'p',
        text: "The visit includes a guided walk and swim upstream along the Driver's River to the underwater cave, which is the thing people come for: you duck under a rock lip with the guide and surface inside. There is a natural heart-shaped pool the site calls its jacuzzi, more than 23 species of fern on the walls, and if you are lucky a wild pig crossing the road. Scenes from Cocktail were shot here. On a weekday morning you can have the main pool to yourself for a while.",
      },
      {
        type: 'list',
        items: [
          "Hours: Wednesday to Sunday, 8:30am to 4:30pm. Closed Monday and Tuesday. Open on public holidays except Good Friday and Christmas Day.",
          "Admission: US$10 per adult and US$5 per child aged 4 to 12 for non-residents. Parking and the picnic area are free.",
          "Bring swimwear, water shoes, a towel, a camera and cash for the guide's tip.",
        ],
      },
      {
        type: 'quote',
        text: "Dunn's River is a show. Reach Falls is a place. One is something you do, the other is somewhere you go.",
      },
      { type: 'h2', text: 'Getting there from Montego Bay, Ocho Rios and Negril' },
      {
        type: 'p',
        text: "This is where the comparison is decided for most people. Dunn's River is a short drive from any Ocho Rios hotel, about 98 km and an hour and forty minutes from Montego Bay, and around 173 km and close to three hours from Negril. Reach Falls is on the far side of the island: about 133 km and nearly three hours from Ocho Rios, roughly 234 km and four and a half hours from Montego Bay, and more than 300 km and over five hours from Negril. Those are map times, and Jamaican roads are slower than the map.",
      },
      {
        type: 'p',
        text: "In practice, Reach Falls is a day trip from Port Antonio, or from Ocho Rios if you leave early and do not mind a long day. From Montego Bay or Negril it needs a night in Portland, which is a fine idea anyway. Dunn's River works from every north coast base and from Montego Bay, and it is the one you can fit around a flight.",
      },
      { type: 'h2', text: 'The verdict, side by side' },
      {
        type: 'list',
        items: [
          "Crowds: Reach Falls wins by a mile. Dunn's River is overwhelmed on cruise-ship days.",
          "Drive time: Dunn's River wins from every resort town. Reach Falls is a full day from Ocho Rios and needs an overnight from Montego Bay or Negril.",
          "Beauty: Reach Falls wins on scenery. Dunn's is longer and more dramatic to climb, but less pretty up close.",
          "Difficulty: Dunn's is the more strenuous, a real climb over wet rock in a chain. Reach is mostly wading and swimming, with one duck under a rock for the cave.",
          "Cost: Reach Falls entry is US$10 against US$25, before extras, but transport will cost more unless you are already in Portland.",
          "Hours: Dunn's River is open every day. Reach Falls is closed Monday and Tuesday, which catches people out.",
        ],
      },
      {
        type: 'p',
        text: "The verdict: if you only have one day and you are staying on the Ocho Rios strip, do Dunn's River at opening on a day without ships and pair it with the Blue Hole in the afternoon. If you have any flexibility, and especially if you are anywhere near Port Antonio, go to Reach Falls. Make a full day of it with Frenchman's Cove beach and a jerk lunch in Boston Bay on the way back.",
      },
      { type: 'h2', text: 'Tips for either waterfall' },
      {
        type: 'list',
        items: [
          "Reef shoes or strapped sandals, never flip-flops. Both falls are wet limestone.",
          "Wear swimwear under your clothes and bring a dry change and two towels.",
          "A waterproof phone case or a dry bag. You need both hands on the Dunn's climb.",
          "Go early. At Dunn's that means opening time on a day without ships; at Reach it means arriving before the lunchtime tour vans.",
          "Heavy rain can close either falls. Have a second plan for the day.",
        ],
      },
      {
        type: 'p',
        text: "Reach Falls is in Portland, which is outside the parishes we drive, so we will not pretend to run it; [our Portland guide](/blog/portland-parish-guide) covers the east end properly. What MAPL Tours Jamaica does run is the other side of this comparison: [the Dunn's River Falls climb](/experience/dunns-river-falls-climb) with hotel pickup and a licensed falls guide, or [Dunn's River and the Blue Hole in one half day](/experience/dunns-river-blue-hole), $192 for up to three people, which runs the falls first to stay ahead of the ships. If you are landing at Montego Bay for an Ocho Rios stay, [a private airport transfer](/transfers) is 90 to 120 minutes and one flat price per vehicle. Either way, bring reef shoes. No problem.",
      },
      {
        type: 'faq',
        items: [
          {
            q: "Is Reach Falls better than Dunn's River?",
            a: "For scenery and crowds, yes. Reach Falls is quieter, greener and has the cave swim. Dunn's River is the bigger climb and far easier to reach from Ocho Rios and Montego Bay, so it wins on convenience.",
          },
          {
            q: "How much is Dunn's River Falls?",
            a: "US$25 per adult and US$17 per child for non-residents, with lockers, water shoe rental and photos extra. [Our Dunn's River and Blue Hole half day](/experience/dunns-river-blue-hole) includes both entries and transport for $192 for up to three people.",
          },
          {
            q: 'How much does Reach Falls cost?',
            a: "US$10 per adult and US$5 per child aged 4 to 12 for non-residents, with free parking. A guide takes you upstream to the underwater cave.",
          },
          {
            q: 'What days is Reach Falls open?',
            a: "Wednesday to Sunday, 8:30am to 4:30pm, plus public holidays except Good Friday and Christmas Day. It is closed Monday and Tuesday.",
          },
          {
            q: 'How far is Reach Falls from Ocho Rios?',
            a: "About 133 km by road and close to three hours each way, so it is a long day trip. From Montego Bay or Negril it is better done with a night in Portland.",
          },
          {
            q: "Can you climb Dunn's River Falls without a tour?",
            a: "Yes. Buy a ticket at the gate and join a guided chain. Most visitors book transport, though, because the park is a drive from every hotel; [the climb with pickup](/experience/dunns-river-falls-climb) handles both.",
          },
          {
            q: 'Which waterfall is better for children?',
            a: "Dunn's River has a 36-inch height minimum and a proper climb, so it suits confident kids of six and up. Reach Falls is mostly wading and swimming, but the cave is for strong swimmers only.",
          },
        ],
      },
    ],
    relatedSlugs: ['birthplace-of-jerk-boston-bay', 'portland-parish-guide'],
  },
  {
    slug: 'appleton-estate-rum-tour',
    title: "Appleton Estate Rum Tour: Price, Hours and Is It Worth It",
    excerpt:
      "The Appleton Estate rum tour in St. Elizabeth: what the Joy Spence Experience includes, hours, the US$39 entry and drive times from Montego Bay and Negril.",
    category: 'Food',
    image: BLOG_IMAGES['appleton-estate-rum-tour'],
    readTime: 9,
    publishedAt: '2026-03-24',
    updatedAt: '2026-09-17',
    author: devon,
    body: [
      {
        type: 'p',
        text: "The Appleton Estate rum tour is the Joy Spence Appleton Estate Rum Experience: a walk through Jamaica's oldest working rum distillery in the Nassau Valley, St. Elizabeth, ending in a tasting of the aged rums. It runs Tuesday to Saturday, entry starts at US$39, and the estate is about an hour inland from Montego Bay.",
      },
      {
        type: 'p',
        text: "The Nassau Valley sits in the middle of St. Elizabeth, ringed by limestone hills that filter the water the estate uses, and it has been making rum since at least 1749, the earliest record of a distillation on the property. That makes Appleton the island's oldest continuously operating rum distillery and the single most bookable distillery visit in Jamaica. It is also a drive from every resort coast, so every trip review wrestles with the same question: is it worth the day? We went, we tasted, we did the maths. Here is the honest answer.",
      },
      { type: 'h2', text: 'What the Appleton Estate tour includes' },
      {
        type: 'p',
        text: "The tour is named for Joy Spence, who joined the estate as chief chemist in 1981 and in 1997 became the first woman appointed master blender anywhere in the spirits industry. It follows the estate's cane-to-cocktail story in order. You start with a welcome cocktail if you are of drinking age, watch a short film in the theatre, climb an observation tower for a view across the valley and the cane, and taste fresh sugar cane juice. Then it is into the distillery to see the copper pot stills, through the ageing house with its rows of oak barrels, and into the tasting room for a guided tasting of the aged rums.",
      },
      {
        type: 'p',
        text: "The tasting is the reason to go. Expect the core aged range, and ask what is pouring that day, because the line-up changes and an upgraded tasting reaches the older expressions. The 12 Year Old is the bottle most people leave wanting. Joy's Lounge and Bar and the gift shop are at the end of the route, with the full range on sale, and there is a restaurant on the estate for lunch.",
      },
      {
        type: 'p',
        text: "The estate's own listing with the Jamaica Tourist Board says to allow two hours for the full experience. The guided part runs shorter than that, so budget the rest for the bar, the shop and a slow lunch.",
      },
      {
        type: 'quote',
        text: "Appleton is not really a rum tour. It is a sugar-estate tour that ends in rum. Go for the valley, stay for the 12-year.",
      },
      { type: 'h2', text: 'Hours, price and booking' },
      {
        type: 'list',
        items: [
          "Open Tuesday to Saturday, 9:00am to 3:30pm. Closed Sunday and Monday.",
          "Entry starts at US$39 per person for the standard experience. Upgraded tastings cost more; check the current price when you book.",
          "Walk-ins are welcome, and reservations are recommended for groups of 15 or more. We would still book a time if you are travelling far for it.",
          "You must be 18 or older to take part in the tasting or have the welcome cocktail.",
          "Photos are allowed everywhere except inside the distillery, and some sections of the tour are not wheelchair accessible.",
        ],
      },
      { type: 'h2', text: 'How to get there from Montego Bay, Negril and Ocho Rios' },
      {
        type: 'p',
        text: "Appleton sits at Siloah in the Nassau Valley, in the interior of St. Elizabeth on the south side of the island. From Montego Bay it is about 58 km by road, a little over an hour by the map; allow more for the hills. From Negril it is about 88 km and closer to two hours. From Ocho Rios it is around 109 km and roughly two hours as well, which is why we only recommend it from the Ocho Rios side if rum is the point of your holiday. From Treasure Beach on the south coast it is the easiest run of all, about 43 km and under an hour, which makes the south coast the best base for this day.",
      },
      {
        type: 'p',
        text: "Whichever coast you start from, do not drive yourself. The tastings are generous, the drive home is on winding country roads, and a driver who knows the interior turns the transit into part of the day. The road in through cane fields, cockpit karst and small villages is some of the prettiest parish interior on the island.",
      },
      { type: 'h2', text: 'What the day costs' },
      {
        type: 'p',
        text: "Entry is the small part. Transport is the big one, and it scales with how far you are from the south coast. Private driver rates vary with distance and season, so get a quote rather than trusting a number from a blog, ours included. Add lunch at the estate restaurant or at a stop on the way back, and a bottle or two from the shop if the 12 Year Old gets to you. Our rule: from Treasure Beach or Negril, the day is easy to justify. From Montego Bay it is a good day out for anyone who likes rum. From Ocho Rios or the east, save it for a second trip unless rum is why you came.",
      },
      { type: 'h2', text: 'Can children come?' },
      {
        type: 'p',
        text: "Yes. The estate welcomes families, and the official booking prices children separately: 11 to 17 counts as a child ticket and 0 to 10 as an infant. The film, the cane juice, the tower and the ageing house all work for kids. The tasting and the welcome cocktail are strictly 18 and over. If you are travelling with teenagers who will be bored by a tasting room, a south coast day that adds YS Falls or the Black River makes a better pairing than rum alone.",
      },
      { type: 'h2', text: 'Best time to go' },
      {
        type: 'p',
        text: "Mornings are quieter and cooler, and a 9am start puts you back on the coast by mid afternoon. The estate is closed Sunday and Monday, so plan the week around that. The dry months from December to April are the easiest for driving; in the wetter months the interior roads can be slow after rain, so leave earlier than you think you need to.",
      },
      { type: 'h2', text: 'Tips before you book' },
      {
        type: 'list',
        items: [
          "Wear closed-toe shoes. There is a distillery and warehouse walk on hard floors.",
          "Bring cash for tips and the roadside stops.",
          "Eat before the tasting, or plan lunch straight after. Aged rum before noon on an empty stomach ends the day early.",
          "If you like the 12 Year Old, buy it at the estate shop and carry it home in checked luggage.",
          "Ask questions. The good guides will go deep on estate rum, the limestone water and the Joy Spence years if you show interest, and the tour becomes a much richer experience.",
        ],
      },
      {
        type: 'p',
        text: "MAPL Tours Jamaica does not run an Appleton tour of our own yet. Our days out start from Montego Bay, Ocho Rios and Negril, and you can see them all in [the catalogue](/explore). What we can do is get you to the island and to your hotel. If you are flying into Montego Bay, [book a private airport transfer](/transfers) and your driver picks you up at arrivals for one flat price per vehicle. Then hire a driver for the Appleton day from a south coast base, and take the long way home. No problem.",
      },
      {
        type: 'faq',
        items: [
          {
            q: 'How much is the Appleton Estate rum tour?',
            a: "The standard Joy Spence Appleton Estate Rum Experience starts at US$39 per person. Upgraded tastings cost more, and tours sold with transport from the resort towns are priced separately. Check the estate's booking page for the current rate.",
          },
          {
            q: 'What days is Appleton Estate open?',
            a: "Tuesday to Saturday, 9:00am to 3:30pm. It is closed on Sunday and Monday, so plan the day around that.",
          },
          {
            q: 'How long does the Appleton tour take?',
            a: "The estate suggests allowing two hours for the full experience, including the tasting, the bar and the shop. With the drive from Montego Bay it is most of a day.",
          },
          {
            q: 'How far is Appleton Estate from Montego Bay?',
            a: "About 58 km by road, a little over an hour by the map and more in practice on the interior roads. [MAPL Tours Jamaica](/transfers) drivers pick you up at Montego Bay airport for the first leg; hire a driver for the Appleton day itself.",
          },
          {
            q: 'Can children go on the Appleton Estate tour?',
            a: "Yes. Children are welcome on the tour and ticketed as a child from 11 to 17, with 0 to 10 as infants. Only guests 18 and over can take part in the tasting or have the welcome cocktail.",
          },
          {
            q: 'What rums do you taste at Appleton Estate?',
            a: "A guided tasting of the estate's aged rums. The exact pours change, so ask on the day; an upgraded tasting reaches the older expressions.",
          },
          {
            q: 'Is the Appleton Estate tour worth it?',
            a: "From Negril, Treasure Beach or Montego Bay, yes: the valley drive, the distillery and the tasting make a proper day. From Ocho Rios it is a long haul, so pair it with a south coast stay or pick [a day trip closer to your hotel](/explore).",
          },
        ],
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
        text: "The tour is guided only, you cannot wander solo, and it runs about an hour and 15 minutes. A guide takes groups of 15 to 20 through the ground-floor rooms first: Bob's kitchen, the dining room, his platinum records, a corridor of international awards. You move upstairs to his bedroom, kept almost exactly as it was, with his star-patterned denim jacket still on the bed.",
      },
      {
        type: 'p',
        text: "The part most people remember is the 1976 shooting site. Days before the Smile Jamaica concert, gunmen entered the compound and opened fire. Bob was grazed; his wife Rita and manager Don Taylor were seriously wounded. The bullet holes are preserved in the wall of the rear hallway. Two days later he performed anyway. The guide tells this story in front of the holes, and nobody speaks for about ten seconds afterward.",
      },
      {
        type: 'quote',
        text: "People come in curious and leave changed. It is not a museum about a musician. It is a museum about a person who made a choice to keep singing.",
      },
      { type: 'h2', text: 'Practical info' },
      {
        type: 'list',
        items: [
          "Admission, $30 USD for adults, $15 for children",
          "Hours, Monday through Saturday, 9:30 a.m. to 4 p.m. (last tour); closed Sundays",
          "Photography, not allowed inside the house; yard photos are fine",
          "Length, allow 90 minutes for the tour plus 30 minutes for the grounds and shop",
          "Transport, 15 minutes from New Kingston hotels; private driver $15 to $25 round trip",
        ],
      },
      {
        type: 'p',
        text: "The on-site cafe, One Love Cafe, does a solid ital plate and a good coffee for around $12 to $18. The gift shop is better than most museum shops on the island, vinyl reissues, original-era T-shirt reprints, and estate-licensed merchandise that you cannot easily find outside.",
      },
      { type: 'h2', text: 'How to get more out of it' },
      {
        type: 'p',
        text: "Two tips from visits I have done over the years. First, go on a weekday morning, not a weekend afternoon; the 10 a.m. slot is the emptiest. Second, pair it with Trench Town Culture Yard on the same day. Trench Town is where Bob actually grew up, and the Culture Yard museum there, smaller, rougher, community-run, gives you the before that Hope Road does not. Together they cost less than $45 and they tell a far more honest story than either does alone.",
      },
      { type: 'h2', text: 'Before you book' },
      {
        type: 'p',
        text: "Tickets are available walk-up, but during cruise season (November through March) the 10 a.m. and 11 a.m. slots can sell out by opening. Book online or arrive right at 9:30. Bring cash for the gift shop. Dress comfortably, the tour walks uphill through the grounds.",
      },
      {
        type: 'p',
        text: "The museum is the Kingston half of the story. The other half is [Nine Mile](/blog/nine-mile-marley-pilgrimage), the village in the St. Ann hills where Bob was born and is buried, and where the feeling is completely different: no platinum records, just the cabin, the stone pillow and the family. Kingston is where he became Bob. Nine Mile is where he was Nesta. We run the Nine Mile day out of the north coast, [a full day for $459 for up to three](/experience/bob-marley-nine-mile-pilgrimage), and if you are doing both, do them on separate days. No problem.",
      },
    ],
    relatedSlugs: ['nine-mile-marley-pilgrimage', 'kingston-culture-guide'],
  },
  {
    slug: 'nine-mile-marley-pilgrimage',
    title: "Nine Mile Jamaica: Bob Marley's Birthplace and Mausoleum",
    excerpt:
      "Nine Mile, Jamaica is where Bob Marley was born and is buried. Hours, the US$35 entry, drive times from Montego Bay and Ocho Rios, and how to book a tour.",
    category: 'Culture',
    image: BLOG_IMAGES['nine-mile-marley-pilgrimage'],
    readTime: 9,
    publishedAt: '2026-04-01',
    updatedAt: '2026-09-17',
    author: maya,
    body: [
      {
        type: 'p',
        text: "Nine Mile is a village high in the hills of St. Ann parish, Jamaica, where Bob Marley was born on 6 February 1945 and where he was laid to rest in 1981. His childhood house, the rock he sang about and the mausoleum sit in one small compound, and it is the most personal Marley site on the island.",
      },
      {
        type: 'p',
        text: "There is no town at Nine Mile, exactly. There is a main road, a cluster of houses, a primary school, a few vendors, and the gated compound the family now runs as 9 Mile Reggae Land. Getting there is half the point: a slow climb through deep St. Ann country on roads most visitors never leave the coast to see. By the time you arrive the air is cooler, the pace has changed, and your ears have popped at least once.",
      },
      { type: 'h2', text: 'What Nine Mile is' },
      {
        type: 'p',
        text: "Robert Nesta Marley was born here on his grandfather's farm and went to the village school, Stepney All Age, until he was about twelve, when he and his mother moved to Trench Town in Kingston. He died in Miami on 11 May 1981, aged 36. After a state funeral in Kingston on 21 May 1981 he was brought home to Nine Mile and buried in a small chapel of Ethiopian design beside the house, in a marble mausoleum, with his red Gibson Les Paul guitar. His mother, Cedella Marley Booker, known to everyone as Mama Marley, rests on the same ground.",
      },
      {
        type: 'p',
        text: "This is the other Marley site. In Kingston you are in Bob's adult home, with the platinum records and the bullet holes. In Nine Mile you are in his childhood, his family and his final resting place. The tone is slower, quieter and more reverent, and it is a different kind of day.",
      },
      { type: 'h2', text: 'How to get to Nine Mile from Montego Bay, Ocho Rios and Negril' },
      {
        type: 'p',
        text: "Ocho Rios is the closest base. Nine Mile is about 38 km away by road, and the hill road turns that into a drive of an hour to an hour and a half. From Montego Bay it is roughly 97 km and around two hours each way. From Negril it is about 171 km and close to three hours each way, which makes for a very long day. Do not trust a map app's cheerful estimate. The last stretch above Brown's Town is narrow, steep and full of blind corners, and it is slow in any vehicle.",
      },
      {
        type: 'p',
        text: "You have three ways up. Drive a rental on the left along a mountain road, hire a driver for the day, or book a tour that includes hotel pickup. Most people choose one of the last two, and after the first hairpin bend you will understand why. [Our full-day Nine Mile pilgrimage](/experience/bob-marley-nine-mile-pilgrimage) picks you up at your hotel on the north coast and does the driving for you, both ways.",
      },
      { type: 'h2', text: 'What the mausoleum tour includes' },
      {
        type: 'p',
        text: "Guides from the village walk you through the compound. You see the small wooden house Bob shared with his mother, the rock where he rested his head and wrote, the one he sings about in 'Talkin' Blues', the murals, a small museum of personal artefacts and memorabilia, and finally the mausoleum chapel where Bob and Cedella rest. The site's own FAQ says the guided part lasts about an hour. There is a restaurant, a bar, a gift shop and live music if you want to stay longer, and most people do.",
      },
      {
        type: 'p',
        text: "It is a very different tour from Kingston. The guides chant, sing and speak in a way that lands somewhere between a tour and a ceremony. People cry in the mausoleum. Nobody pretends they did not.",
      },
      {
        type: 'p',
        text: "A few rules, because this is a burial place as much as a museum. Photography is welcome around the site but not inside the mausoleum, and hats come off at the door. Dress as you would for anywhere that matters to people. You can bring your own water bottle, but no outside food or coolers, and there is no cigarette smoking on the premises. Children of all ages are welcome, and so are strollers.",
      },
      {
        type: 'quote',
        text: "Kingston is where Bob became Bob. Nine Mile is where he was Nesta. Both matter. Do not pick one.",
      },
      { type: 'h2', text: 'Nine Mile hours and admission' },
      {
        type: 'p',
        text: "Nine Mile is open seven days a week, 365 days a year. The site's own pages give the first tour at 9am or 9:30am and the last at 4:30pm or 5pm, so aim to arrive by early afternoon and check before a late visit. Admission at the gate is US$35 per adult, US$15 for children 11 and under, and free for children 5 and under. Packages that include transport from the resort towns are sold separately and cost more. Tips for your guide are customary, so carry small US bills.",
      },
      { type: 'h2', text: 'How long to allow' },
      {
        type: 'p',
        text: "Plan on about an hour inside the compound, plus whatever you spend at the restaurant and the stalls. The drive is the real cost. From Ocho Rios, Nine Mile is a half-day trip if you leave early. From Montego Bay it is a full day, and from Negril it is a very full day. Most people pair it with a lunch stop and a slow drive back through the hills, which is the right way to do it.",
      },
      { type: 'h2', text: 'Is Nine Mile worth it?' },
      {
        type: 'p',
        text: "Yes, if you care about Marley, and yes if you want to see rural Jamaica. The compound itself is small and the guided part is short. What makes the day is the combination: the drive through the St. Ann interior, the village, the guides, and standing in the room where the story starts and the chapel where it ends. If you only have one afternoon and you are in Kingston, do [the Bob Marley Museum](/blog/bob-marley-museum-guide). If you are on the north coast with a day to spare, Nine Mile is the better pilgrimage.",
      },
      { type: 'h2', text: 'Best time to go' },
      {
        type: 'p',
        text: "Go on a weekday morning if you can. Weekends and cruise-ship days are the busiest, and the house and the mausoleum are small rooms that fill fast. The hills are cooler than the coast and can be wet, so a light jacket is worth carrying, and a morning start puts you back on the coast before dark. If you can time the return for late afternoon, the ride down through St. Ann as the sun drops is one of the quiet highlights of a Jamaica trip.",
      },
      { type: 'h2', text: 'Tips before you go' },
      {
        type: 'list',
        items: [
          "Bring US cash in small bills. Guides are tipped, and there are craft and record stalls in the village.",
          "Wear comfortable shoes. The ground is uneven and there is a flight of steps up to the mausoleum.",
          "Expect patchy phone signal in the hills. Download the music before you leave the coast.",
          "Lunch is not included on most tours. Ask your driver to stop at a local spot on the way back; there are good jerk and roasted corn stops on the road.",
          "Leave time at the end. The restaurant and the live music are part of the visit, not an afterthought.",
        ],
      },
      {
        type: 'p',
        text: "MAPL Tours Jamaica runs this one ourselves. [The Bob Marley Nine Mile Pilgrimage](/experience/bob-marley-nine-mile-pilgrimage) is a full day, $459 for up to three people rather than per head, and it includes round-trip private transport from your hotel, Nine Mile entry, a village guide and bottled water for the drive. Your driver picks you up at the hotel, so the mountain road is somebody else's problem. Flying into Montego Bay? [Book your airport transfer](/transfers) with us too, and the same team looks after both ends of the trip. No problem.",
      },
      {
        type: 'faq',
        items: [
          {
            q: 'Where is Nine Mile in Jamaica?',
            a: "Nine Mile is a district in St. Ann parish, in the hills a few miles south of Brown's Town. It is inland from the north coast, between Ocho Rios and Montego Bay, and the nearest resort town is Ocho Rios.",
          },
          {
            q: 'How far is Nine Mile from Montego Bay?',
            a: "About 97 km by road, which works out to around two hours each way on the hill roads. [Our Nine Mile tour](/experience/bob-marley-nine-mile-pilgrimage) picks you up at Montego Bay hotels and makes a full day of it.",
          },
          {
            q: "How much does it cost to visit Bob Marley's mausoleum?",
            a: "Admission at the gate is US$35 per adult, US$15 for children 11 and under, and free for children 5 and under. Tours that include transport from the coast are priced separately.",
          },
          {
            q: 'How long is the Nine Mile tour?',
            a: "The guided walk through the compound takes about an hour. With the drive, allow a half day from Ocho Rios and a full day from Montego Bay or Negril.",
          },
          {
            q: 'Can you take photos at Nine Mile?',
            a: "Yes, around the grounds. Photography is not allowed inside the mausoleum, and hats come off at the door.",
          },
          {
            q: 'Is Nine Mile or the Bob Marley Museum in Kingston better?',
            a: "They are different places. Kingston is Bob's adult home and studio; Nine Mile is his birthplace and grave. If you are in Kingston, see [the museum](/blog/bob-marley-museum-guide). If you are on the north coast, Nine Mile is the easier and more moving day out.",
          },
          {
            q: 'Do I need a driver to get to Nine Mile?',
            a: "Not strictly, but the last stretch is a narrow mountain road with blind corners and left-side driving. A driver or a tour with hotel pickup is the sensible choice. If you are landing at Montego Bay, [our airport transfers](/transfers) get you to your hotel first.",
          },
        ],
      },
    ],
    relatedSlugs: ['bob-marley-museum-guide', 'kingston-sound-system-culture'],
  },
  {
    slug: 'scuba-diving-in-jamaica',
    title: "Scuba Diving in Jamaica: Best Dive Sites, Seasons and Costs",
    excerpt:
      "Scuba diving in Jamaica: the best sites in Negril, Montego Bay, Ocho Rios and Port Antonio, what a dive costs, when to come, and how beginners start.",
    category: 'Adventure',
    image: BLOG_IMAGES['scuba-diving-in-jamaica'],
    readTime: 9,
    publishedAt: '2026-04-05',
    updatedAt: '2026-09-17',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Scuba diving in Jamaica means reef walls, caverns and wrecks close to shore in warm water all year. The four dive areas are Negril, Montego Bay, Ocho Rios and Port Antonio, each with PADI operators, and most sites are a short boat ride out. It is not a dive-first island, which is exactly why the reefs are uncrowded.",
      },
      {
        type: 'p',
        text: "Jamaica is not Cayman or Bonaire. Nobody flies here only to dive. That is both the honest truth and the reason scuba diving in Jamaica is a quietly excellent way to spend two or three days of a week-long trip. The boats are small, the reefs are less crowded, and the north coast drops fast into real wall topography. Here is where to put a tank in the water, what it costs and when to come.",
      },
      { type: 'h2', text: 'Montego Bay: the marine park and the easy start' },
      {
        type: 'p',
        text: "Montego Bay Marine Park was declared in 1992 as Jamaica's first marine protected area: 15 square kilometres of reef, seagrass and mangrove along the city's coast, with spearfishing banned inside it. Most dive sites are close to shore and about ten minutes by boat, the water sits between 80 and 86 degrees Fahrenheit all year, and one long-running operator here quotes average visibility of 75 feet or better. It is the right region for first-timers, check-out dives and Discover Scuba sessions.",
      },
      {
        type: 'p',
        text: "Sites worth asking for: Stingray City, a shallow site where southern stingrays come in close; the plane wreck at about 18 metres; and Widowmaker's Cave, a chimney that opens on the reef at about 35 feet and exits at 80, named after a James Bond novel rather than any body count. Widowmaker's is the advanced dive here and needs good buoyancy and no claustrophobia. The rest of the park is gentle.",
      },
      { type: 'h2', text: 'Negril: calm water and the Throne Room' },
      {
        type: 'p',
        text: "Negril is the softest dive region on the island. The west coast is sheltered, so the water is usually calm, and the twenty-plus sites run from about 30 to 90 feet. It is the best snorkel-to-scuba transition in Jamaica, and the most reliable good-weather region in the winter months.",
      },
      {
        type: 'p',
        text: "The standout is the Throne Room, a cavern dive where you drop through a split in the reef at about 40 feet, swim a passage lined with the elephant-ear sponges that give the site its name, and exit to open water at around 70 feet. It is regularly named the best dive in Jamaica. Negril also has wreck options, the Deep Plane, the Shallow Plane and a tug, plus reef sites like Long Wall, Sharks Reef, Kings Fish Point and the Arches.",
      },
      { type: 'h2', text: 'Ocho Rios: the wall' },
      {
        type: 'p',
        text: "This is where Jamaica diving gets interesting. The Ocho Rios shelf is a fringing reef with shallow inshore sites for beginners, then a drop-off on the seaward side for advanced divers, with depths from 30 feet down past 130. Named sites include Ochi Wall, Coral Garden Wall, Devil's Reef and Top of the Mountain, and there are more than two dozen in total. Expect rays, turtles, sponges, soft and hard coral and the occasional nurse shark.",
      },
      {
        type: 'p',
        text: "The wreck here is the Kathryn, a Second World War Canadian minesweeper sunk on purpose in about 50 feet of water with her highest point around 20 feet down, surrounded by caverns. Dickies Reef is the night dive. This is the region we send certified divers to, and in the shoulder months it is the one that changes people's minds about Jamaica.",
      },
      { type: 'h2', text: "Port Antonio: the locals' pick" },
      {
        type: 'p',
        text: "The east end is the quietest, least-dived region on the island, and it is the favourite of most Jamaican dive instructors we know. The operator here works in conservation with the East Portland Fish Sanctuary, managed by the Alligator Head Foundation. Alligator Reef is really several sites in one, with something for each skill level. The operator, Lady G'Diver, is a PADI 5 Star dive resort that has been running since 1982 and takes two to six divers per trip. You will often have the sites to yourselves.",
      },
      {
        type: 'quote',
        text: "If you dived Jamaica once and thought it was okay, you probably dived Montego Bay at peak season. Try Ocho Rios in shoulder season and you will write a different review.",
      },
      { type: 'h2', text: 'Beginners and certification' },
      {
        type: 'p',
        text: "You do not need a certification to try it. Every region runs Discover Scuba Diving: a few hours of skills with an instructor in a pool or shallow water, then a supervised open-water dive. If you want the card, the PADI Open Water course is offered over two days at the resort shops and longer at independent centres, and some shops run a one-day PADI Scuba Diver step for people short on time. Certified divers should bring their card and log; operators ask.",
      },
      {
        type: 'p',
        text: "One rule matters more than any site choice. Do not dive on the day you fly. Divers Alert Network recommends at least 12 hours after a single no-decompression dive and at least 18 hours after multiple dives or multiple days of diving before you get on a plane. Book your dives at the start of the week and leave the last day for the beach.",
      },
      { type: 'h2', text: 'Seasons, visibility and water temperature' },
      {
        type: 'p',
        text: "Water temperature runs from about 80 to 86 degrees Fahrenheit year round, so a shorty or a 3mm suit is plenty. The dry season from December to April is peak season and the most settled weather. The rainy months from July to October overlap with the Atlantic hurricane season, which officially runs from 1 June to 30 November and peaks around 10 September; runoff after heavy rain can knock visibility down on the north coast for a day or two. On a good day visibility is 70 feet or more, and up to 100 feet at the walls.",
      },
      { type: 'h2', text: 'What scuba diving in Jamaica costs' },
      {
        type: 'list',
        items: [
          "One guided reef dive in Montego Bay: US$69 at one resort-based operator, with two dives at US$138. Another Montego Bay operator advertises a single-tank dive from US$43 with an online discount.",
          "Two-tank boat dive in Port Antonio: US$140 per person, or US$840 for a private charter of up to six certified divers.",
          "Discover Scuba Diving: about US$159 to US$160, depending on the region.",
          "PADI Open Water certification: US$499 over two days in Montego Bay or Negril; US$705 in Port Antonio.",
          "Some resort dive centres only serve their own hotel's guests, or charge outsiders a day pass. Ask before you turn up with your gear.",
        ],
      },
      { type: 'h2', text: 'Choosing an operator' },
      {
        type: 'p',
        text: "Book with a PADI or SSI centre, not the man with a boat on the beach. Ask about group size; anything over six divers per instructor is too many, and the best shops on the island cap it there. Ask what the boat is and how far the site is. Bring your own mask and computer if you own them; rental gear here is fine but often dated. And ask about the marine park or sanctuary rules for the site, because Montego Bay dives inside a marine park and Port Antonio dives beside a fish sanctuary.",
      },
      {
        type: 'p',
        text: "MAPL Tours Jamaica does not run dive boats; we leave that to the shops above. What we do is the rest of the trip. If your dive days are on the north coast, [a clear-kayak reef tour in Ocho Rios](/experience/clear-kayak-reef-tour) is the non-diver's way to see the same coral, and in Negril [the Rick's Cafe sunset](/experience/ricks-cafe-cliff-diving-and-sunset) is the right end to a two-tank morning. And when you land at Montego Bay with a bag full of gear, [book a private airport transfer](/transfers): one flat price per vehicle, and your driver picks you up at arrivals. No problem.",
      },
      {
        type: 'faq',
        items: [
          {
            q: 'Is Jamaica good for scuba diving?',
            a: "Yes, for uncrowded reef, wall and cavern diving close to shore in warm water. It is not a dive-first island like Cayman, so expect small boats and quiet sites rather than big-animal encounters.",
          },
          {
            q: 'Where is the best scuba diving in Jamaica?',
            a: "Negril's Throne Room for a cavern, Ocho Rios for the wall and the Kathryn wreck, Port Antonio for fish life inside a sanctuary, and Montego Bay Marine Park for beginners.",
          },
          {
            q: 'When is the best time to dive in Jamaica?',
            a: "December to April is the dry, settled season. Water stays between 80 and 86 degrees all year. July to October is wetter and inside hurricane season, so visibility can drop after rain.",
          },
          {
            q: 'Can beginners scuba dive in Jamaica?',
            a: "Yes. Discover Scuba Diving sessions run in Montego Bay, Negril and Port Antonio for US$159 to US$160, and a PADI Open Water course takes two days or more.",
          },
          {
            q: 'How much does scuba diving cost in Jamaica?',
            a: "Roughly US$69 for a single guided dive in Montego Bay, US$140 for a two-tank boat dive in Port Antonio, and US$499 to US$705 for Open Water certification depending on the shop.",
          },
          {
            q: 'How long after diving can I fly home from Jamaica?',
            a: "Wait at least 12 hours after a single dive and at least 18 hours after multiple dives, per Divers Alert Network. Dive early in the week and book [your airport transfer](/transfers) for a relaxed last morning.",
          },
          {
            q: 'What can non-divers do while I dive?',
            a: "In Ocho Rios, [the clear-kayak reef tour](/experience/clear-kayak-reef-tour) puts them over the same coral from the surface, and every region has snorkel boats. See [the full catalogue](/explore) for the rest.",
          },
        ],
      },
    ],
    relatedSlugs: ['montego-bay-beyond-the-strip', 'negril-guide'],
  },
  {
    slug: 'getting-around-jamaica-guide',
    title: "Getting Around Jamaica: Transport, Honestly",
    excerpt:
      "Getting around Jamaica is not as simple as the brochures pretend. Rental cars, route taxis, JUTA, private drivers, domestic flights, here is the honest guide.",
    category: 'Guides',
    image: BLOG_IMAGES['getting-around-jamaica-guide'],
    readTime: 9,
    publishedAt: '2026-04-09',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Getting around Jamaica is the single most underestimated part of planning a trip here. The island looks small on a map, 146 miles long, 51 miles wide, but the road network is mountainous, mostly two-lane, and the speed at which traffic actually moves is about two-thirds of what Google Maps predicts. A drive that looks like 90 minutes online is usually two and a half hours in real life.",
      },
      {
        type: 'p',
        text: "I have used every form of transport on this island, from route taxis in Kingston to domestic flights from Montego Bay to Port Antonio. Here is the honest breakdown of what works, what does not, and what to actually book.",
      },
      { type: 'h2', text: "Rental cars, do not, on your first trip" },
      {
        type: 'p',
        text: "Jamaica drives on the left. The roads have no shoulders, potholes are common, mountain roads have blind corners every 50 meters, and drivers here have a cultural comfort with overtaking on hills that terrifies most visitors. Rentals are available, about $50 to $90 per day from Avis or Island, but I genuinely do not recommend them for first-timers. Your second or third trip, when you know the geography, is when you might consider it.",
      },
      { type: 'h2', text: "Route taxis, the local way" },
      {
        type: 'p',
        text: "Route taxis are the backbone of Jamaican daily life. They run fixed routes, Kingston to Half Way Tree, Ocho Rios to Runaway Bay, Negril to Lucea, and they pick up and drop off anywhere along the route. They are safe, extremely cheap ($1 to $3 USD), and the fastest way to feel like you are actually in the country rather than on a brochure. Look for the red license plate.",
      },
      { type: 'h2', text: "JUTA and licensed taxis, the tourist option" },
      {
        type: 'p',
        text: "JUTA is the regulated tourist taxi network, and along with JCAL it staffs the authorised taxi desk just outside customs at Sangster. Rates are fixed and posted at the counter rather than metered, drivers are vetted, and vehicles carry the red and white PP plates that Canadian and US travel advisories tell visitors to look for. Ask the rate before you set off, and remember a desk taxi is priced for the trip in front of you while a pre-booked transfer is quoted per vehicle in advance.",
      },
      { type: 'h2', text: "Private drivers, the sweet spot for trips" },
      {
        type: 'p',
        text: "For multi-day trips and cross-island moves, a private driver is almost always the best call. You get a dedicated vehicle, a flexible schedule, and someone who knows the back roads. Expect $120 to $200 per day depending on route and vehicle. Split between two or three travelers, it ends up cheaper than a rental plus gas plus parking, and nobody has to drive.",
      },
      {
        type: 'quote',
        text: "Book a driver for the long moves. Use route taxis for the short ones. Do not rent. That is the whole rulebook.",
      },
      { type: 'h2', text: "Domestic flights, for the east end" },
      {
        type: 'p',
        text: "If you are going to Port Antonio or Negril from the other end of the island, a small-plane domestic flight is worth considering. TimAir and InterCaribbean fly MBJ to KIN and occasional Port Antonio charters, roughly $130 to $220 one way. You trade the long drive for a 35-minute flight, which is a real quality-of-life gain on a week-long trip.",
      },
      { type: 'h2', text: "What it costs by route" },
      {
        type: 'list',
        items: [
          "Montego Bay airport to Negril, $111 private with [MAPL Tours](/transfers) or $199 round trip, $25 shared shuttle, 90 minutes",
          "Montego Bay airport to Ocho Rios, $111 private or $199 round trip, $25 shared, 90 minutes",
          "Ocho Rios to Kingston, $120 private, 2 hours",
          "Kingston to Port Antonio, $120 private, 2.5 hours",
          "Negril to Treasure Beach, $150 private, 2.5 hours",
        ],
      },
      { type: 'h2', text: "Before you book" },
      {
        type: 'p',
        text: "Always confirm the rate before you get in the vehicle. Always tip, 10 to 15 percent is standard. Always have cash; many drivers prefer USD in small bills. And always, always pad your itinerary with buffer time. Jamaica moves on its own schedule, and the smart traveler learns to move with it rather than against it.",
      },
      {
        type: 'p',
        text: "Every experience we run in [the catalogue](/explore) includes transport built in, no guesswork, no airport surprises. The island rewards patience. No problem.",
      },
    ],
    relatedSlugs: ['first-time-jamaica', 'jamaica-on-a-budget'],
  },
  {
    slug: 'jamaica-on-a-budget',
    title: "Jamaica on a Budget: Real Numbers for a Real Trip",
    excerpt:
      "Jamaica budget travel is absolutely possible, if you know where the real costs hide. Here are real numbers for a week, broken down by category.",
    category: 'Guides',
    image: BLOG_IMAGES['jamaica-on-a-budget'],
    readTime: 9,
    publishedAt: '2026-04-13',
    author: simone,
    body: [
      {
        type: 'p',
        text: "Jamaica has a reputation as an expensive Caribbean destination, and in some ways it earns that reputation. The all-inclusive economy is built around packaging a week at $3,000-plus per person and the airport markup is no joke. But Jamaica budget travel is absolutely possible, a real week here, with real food, real beaches, and real experiences, can run $900 to $1,400 per person outside of flights if you plan it right.",
      },
      {
        type: 'p',
        text: "Below is what a seven-day trip actually costs in 2026 dollars, broken down by category. These are numbers I have spent myself or seen guests spend on trips we have helped plan.",
      },
      { type: 'h2', text: "Where to sleep" },
      {
        type: 'p',
        text: "Skip the big strips. Treasure Beach, Port Antonio, and the Negril West End all have owner-run guesthouses and small boutique hotels between $65 and $140 a night for a double room. Airbnbs in Kingston are plentiful at $50 to $100. A seven-night stay in this tier runs $450 to $800 total for a couple, a third to a quarter of resort pricing, and almost always with a better breakfast.",
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
          "Patty from Juici or Tastee, $2 to $3",
          "Jerk chicken plate at a local spot, $8 to $12",
          "Red Stripe at a bar, $3 to $5",
          "Route taxi short hop, $1 to $3",
          "Private driver half day, $70 to $100",
          "Bob Marley Museum entry, $30",
          "Dunn's River Falls entry, $25",
          "Reach Falls entry, $10",
          "Blue Mountain coffee farm tour, $40 to $70",
          "Appleton Estate rum tour, $40 to $60",
        ],
      },
      {
        type: 'quote',
        text: "The cheapest week in Jamaica is almost always also the best one. Resort food is fine. Auntie's kitchen is unforgettable.",
      },
      { type: 'h2', text: "A realistic 7-day budget, per person" },
      {
        type: 'p',
        text: "Here is what a frugal-but-not-suffering week looks like for one person traveling with a partner (so lodging is split): guesthouse or boutique stay averaging $75 per night split in half ($262), food averaging $35 per day ($245), three big experiences like a jerk session, a waterfall day, and a rum tour ($180 to $220), local transport including one private driver day ($120 to $180), and incidentals and tips ($80 to $120). Grand total: roughly $900 to $1,100 per person before flights.",
      },
      {
        type: 'p',
        text: "Push it up to $1,400 and you can add another two experiences and upgrade two dinners. Push it down to $750 and you are in guesthouse-plus-cookshop territory, still a completely livable trip, just fewer paid activities.",
      },
      { type: 'h2', text: "How to cut the costs further" },
      {
        type: 'p',
        text: "A few mechanics that save real money. Fly into Kingston instead of Montego Bay when possible, fares are often $80 to $150 cheaper. Travel in May or early June (post-winter, pre-hurricane) for lower lodging rates without the rain. Book experiences directly with local creators rather than through hotel concierges, which usually adds 30 to 50 percent. And use ATMs rather than exchanging cash at the airport; you will save 3 to 5 percent on every withdrawal.",
      },
      { type: 'h2', text: "Before you book" },
      {
        type: 'p',
        text: "Jamaica rewards travelers who plan a little and then let the rest unfold. Book flights and lodging tight; leave the middle of the week loose. The best meals of your trip will almost always be the ones you did not schedule.",
      },
      {
        type: 'p',
        text: "Our [the catalogue](/explore) page lists every MAPL experience with the all-in price, card processing included, booked direct with the operator. The budget version of Jamaica is the real version. No problem.",
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
        text: "Every Jamaica honeymoon guide you have read starts the same way: Sandals, Couples, Jewel, maybe Secrets if you want slightly different branding. Pick a property, fly in, stay for a week, post the beach photo. That version of the trip is fine. It is also completely interchangeable with a Jamaica honeymoon and a Punta Cana honeymoon and a Riviera Maya honeymoon. If you want a trip that feels specifically, unmistakably Jamaican, and is probably cheaper, too, this is the other way to do it.",
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
        text: "Boutique coastal hotels: think Rockhouse, GeeJam, Jakes, Strawberry Hill, Trident Castle. $300 to $700 per night, almost always smaller than 50 rooms, architecturally specific to Jamaica, and genuinely romantic in a way a 500-room resort never is. Finally, Kingston, underrated for honeymoons. Spanish Court, R Hotel, and the Terra Nova are all excellent anchors for the first two nights of a trip.",
      },
      { type: 'h2', text: "The rhythm that works" },
      {
        type: 'p',
        text: "The shape I recommend is Kingston to Portland to Negril or Treasure Beach. Two nights in Kingston to feel the music and culture. Three nights in Portland for the jungle, the rafting, the coast, the quiet. Three or four nights on the west coast, Negril for sunsets and beach, Treasure Beach for quiet. You fly home from Montego Bay or Kingston depending on the routing. You use private drivers for the moves; total transport cost across the trip is usually $400 to $700 for two.",
      },
      {
        type: 'quote',
        text: "A Jamaica honeymoon on one beach is a vacation. A Jamaica honeymoon across three regions is the trip you will still be talking about in ten years.",
      },
      { type: 'h2', text: "Anchor experiences to book" },
      {
        type: 'list',
        items: [
          "Private bamboo rafting on the Rio Grande, two on a raft, no other passengers, about $130 per couple",
          "Blue Mountain sunrise coffee trek with farm tasting, the 4 a.m. start is romantic, not brutal",
          "Rick's Cafe cliff dive at sunset, skip the crowds, book the smaller cliffs to the side",
          "Private jerk pit session in Boston Bay, a real half-day cooking experience, not a demo",
          "Luminous Lagoon night swim in Falmouth, swim in bioluminescent water, no filter needed",
        ],
      },
      { type: 'h2', text: "What it costs, honestly" },
      {
        type: 'p',
        text: "A seven-night, three-region Jamaica honeymoon for a couple, booked this way, typically runs $4,500 to $7,500 total before flights. That includes a mix of villa and boutique hotel nights, all private transport, five anchor experiences, meals at a blend of local and fine-dining spots, and tips. A comparable week at a top-tier adults-only all-inclusive would run $5,500 to $9,000 for two. The savings on the boutique version are not the point, the quality gap is.",
      },
      { type: 'h2', text: "Before you book" },
      {
        type: 'p',
        text: "A few practical tips that will make the trip better. Build in one do-nothing day per region; the travel itself is beautiful but real. Ask your villa or hotel for a chef dinner on your first and last nights; it will be your favorite meal. Do not book every day, leave 40 percent of the trip open for the local recommendations you will get on the ground. And get good travel insurance; hurricane season runs June through November and flexibility is worth the premium.",
      },
      {
        type: 'p',
        text: "We build custom honeymoon itineraries at MAPL Tours, villa, boutique, or a mix, with bookable experiences across the island. Start with [the catalogue](/explore) to see the anchors, and we can assemble the rest around them. Get married, come here, skip the wristband. No problem.",
      },
    ],
    relatedSlugs: ['negril-guide', 'blue-mountain-sunrise-hike'],
  },
]
