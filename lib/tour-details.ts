/**
 * Per-tour detail: what actually happens, what the price covers, what to bring,
 * and who it suits. Written from the operator's rate card and the well-known
 * facts of each attraction.
 *
 * Kept OUT of lib/experiences.ts on purpose. That file is the pricing source of
 * truth and is read by /api/checkout on every request; copy has no business
 * being in the hot path of the money flow, and keeping them apart means editing
 * a description can never disturb a price.
 *
 * `confirmWithOperator` is the honest part: things a human should verify with
 * Collin before they are treated as promises (third-party minimum ages, whether
 * a party of three needs two rafts, wet-weather policy). They are NOT rendered
 * to guests.
 */

export interface TourDetail {
  /** What happens, in order, in 2-3 sentences. */
  about: string
  included: string[]
  bring: string[]
  minAge: string
  maxGroup: string
  fitness: string
  goodToKnow: string[]
  /** Internal only. Never rendered. */
  confirmWithOperator: string[]
}

export const TOUR_DETAILS: Record<number, TourDetail> = {
  1: {
    about: "Your driver collects you at your hotel and runs you along the coast to the falls park in Ocho Rios. You stash your things, meet your falls guide, and climb the 600 feet of limestone terraces in a hand-holding chain, stopping in the pools to cool off on the way up. At the top you dry off, take a walk through the craft stalls if you want, and your driver takes you back.",
    included: ["Private door-to-door transport from your hotel and back", "Entrance fee to Dunn's River Falls", "A licensed falls guide for the climb", "Your driver waits on site while you climb"],
    bring: ["Swimwear under your clothes", "Water shoes or strap-on sandals with grip", "A towel and a dry change of clothes", "A waterproof pouch for your phone", "Small cash for tips and a locker"],
    minAge: "Ages 5 and up for the climb. Younger children can wait at the beach with an adult.",
    maxGroup: "One price covers a private party of up to 3, in your own vehicle. Larger parties are quoted per person, so tell us your numbers.",
    fitness: "Moderate. You need to be steady on your feet on wet, uneven rock for around an hour.",
    goodToKnow: ["You get fully wet, head to toe. Water shoes matter more than anything else here because the rock is slick.", "There are steps beside the falls, so you can skip a section or step out early at any point.", "Photographers work the park and sell shots at the exit. Buying is optional.", "The climb is not wheelchair accessible, and the path down to the beach is steps and uneven ground."],
    confirmWithOperator: ["Confirm the park's official minimum age and whether guides will assist smaller children.", "Confirm whether locker rental and photo packages are covered or paid on site.", "Park hours shift with cruise ship schedules. Confirm current opening days before publishing.", "Confirm whether MAPL supplies water or towels in the vehicle."],
  },
  2: {
    about: "Your driver picks you up at your hotel and heads up into the hills above Ocho Rios, off the main road and into the bush. A local guide walks you up the river through a chain of turquoise limestone pools, where you can jump from the ledges, swing in on a rope, or just float and look up at the canopy. You come back down the same trail, rinse off, and ride home.",
    included: ["Private door-to-door transport from your hotel and back", "Entrance fee to the Blue Hole", "A local river guide for the whole walk", "Your driver waits on site while you swim"],
    bring: ["Swimwear under your clothes", "Water shoes with real grip", "A towel and a dry change of clothes", "A waterproof pouch for your phone", "Small cash for tips"],
    minAge: "Ages 8 and up is the norm here. Younger children can come, but they need to swim well and stay with a parent.",
    maxGroup: "One price covers a private party of up to 3, in your own vehicle. Bigger parties are quoted per person.",
    fitness: "Moderate to active. Expect slippery rock, short scrambles and swimming in deep water.",
    goodToKnow: ["Every jump is optional. There is a way around each drop, and nobody pushes you.", "You are wet from the first pool to the last, so leave anything you cannot soak in the vehicle.", "Guides usually carry your phone in a dry bag and shoot photos as you go. A tip is the normal thank you.", "Not suitable if you have mobility limits. The trail is natural rock, roots and river bed."],
    confirmWithOperator: ["Confirm the operator's actual minimum age and whether non-swimmers are allowed.", "Confirm whether life vests are available for children and weak swimmers.", "Confirm the attraction's policy after heavy rain, when river levels rise.", "Confirm whether guide gratuity is expected on top of the booking."],
  },
  3: {
    about: "Your driver collects you at your hotel and takes you inland from Falmouth to the raft village on the Martha Brae. You step onto a 30-foot bamboo raft built by hand and your captain poles you three miles down a calm green river, naming the trees and birds and telling you the river's stories as you drift. At the landing there is time for a cold drink and the craft stalls before the drive back.",
    included: ["Private door-to-door transport from your hotel and back", "River entrance and raft fee", "A licensed raft captain who poles the whole run", "Your driver waits at the landing"],
    bring: ["Sunscreen and a hat", "Sunglasses", "A light cover-up for the sun on the water", "Your camera or phone", "Small cash for tips and drinks"],
    minAge: "No minimum. Small children ride on a parent's lap.",
    maxGroup: "One price covers a private party of up to 3, in your own vehicle. Larger parties are quoted per person.",
    fitness: "Easy. You sit for the whole ride. The only effort is stepping on and off the raft.",
    goodToKnow: ["You stay dry unless you dangle your feet over the side.", "The bench sits low and the raft moves under you. Stepping on and off needs a hand and a bit of balance.", "Vendors sell drinks and crafts at the landing, so bring small bills.", "This is the longer of our two raft trips, and the drive from Ocho Rios is the longer one too."],
    confirmWithOperator: ["A raft bench typically seats two, so a party of three may need two rafts. Confirm how the operator handles this and whether the rate covers it.", "Confirm whether life vests are provided, especially for children.", "Confirm the pickup radius and drive time from Ocho Rios, Runaway Bay and Montego Bay hotels.", "Confirm whether a welcome drink is part of the rate or bought at the landing."],
  },
  4: {
    about: "Your driver picks you up at your hotel and takes you a short way east of Ocho Rios to the White River. Your captain poles you downstream on a handmade bamboo raft through a quiet green stretch, with reggae drifting off the bank and space to slip into the water where the river is calm. Your driver is waiting at the landing when you step off.",
    included: ["Private door-to-door transport from your hotel and back", "River entrance and raft fee", "A licensed raft captain who poles the whole run", "Your driver waits at the landing"],
    bring: ["Swimwear under your clothes if you plan to get in", "A towel", "Sunscreen and a hat", "Small cash for tips and drinks"],
    minAge: "No minimum. Small children ride on a parent's lap.",
    maxGroup: "One price covers a private party of up to 3, in your own vehicle. Larger parties are quoted per person.",
    fitness: "Easy. You are seated the whole way. Stepping on and off the raft is the only real movement.",
    goodToKnow: ["Shorter and much closer to Ocho Rios than the Martha Brae run, so it fits easily around another tour.", "You stay dry on the raft itself unless you choose to swim.", "The bench sits low over the water. Getting on and off takes a steady hand.", "Heavy rain upriver can muddy the water or pause rafting for the day."],
    confirmWithOperator: ["Confirm whether a swim stop is standard on this run or captain's discretion.", "Confirm raft capacity and whether a party of three needs two rafts.", "Confirm whether life vests are provided for children.", "Confirm the operator's rain and high-water policy."],
  },
  5: {
    about: "Your driver collects you at your hotel and takes you up to the trail base above Ocho Rios, where you get a helmet, a safety briefing and a practice loop before you ride out. The trail runs through bush and farm country to a Rastafari community, where you sit down for ital food, drumming, and a straight talk about the livity from the people who live it. Then you ride back down the hill and we run you home.",
    included: ["Private door-to-door transport from your hotel and back", "ATV, helmet and safety briefing", "Entrance and community fees at the Rastafari village", "A guide for the ride and the village visit"],
    bring: ["Closed-toe shoes you do not mind ruining", "Long shorts or trousers", "Sunglasses or goggles for the dust", "A change of clothes for the ride home", "Cash for tips and craft stalls"],
    minAge: "Riders are usually 16 and up with a valid driver's licence. Younger guests can often ride as a passenger behind an adult.",
    maxGroup: "One price covers a private party of up to 3, in your own vehicle. Larger parties are quoted per person.",
    fitness: "Active. You need arm strength and balance to steer over rough ground for a good stretch.",
    goodToKnow: ["You finish dusty or muddy depending on the week's rain. Wear clothes you can throw in a bag.", "Closed-toe shoes are required to ride. No flip-flops, no sandals.", "The village visit is a conversation, not a performance. Ask your questions.", "Photos at the village are usually welcome, but ask the person first."],
    confirmWithOperator: ["Confirm whether the ital food and drink is covered by the rate or paid at the village.", "Confirm the operator's minimum riding age and whether a driver's licence is required.", "Confirm whether two people may share one ATV, and any combined weight limit.", "Confirm whether a damage waiver or deposit is taken at the trail base.", "Confirm the rain cancellation policy, since these trails close in bad weather."],
  },
  6: {
    about: "We collect you at your hotel and drive you to the trail head in the hills behind Ocho Rios. You get a helmet, a full briefing and a short practice loop, then follow your guide out on red-dirt tracks through bush and farm land, and through whatever mud the last rain left behind. You rinse off at the base and your driver runs you back.",
    included: ["Private door-to-door transport from your hotel and back", "ATV, helmet and safety briefing", "Trail entrance fees", "A guide riding with you the whole way"],
    bring: ["Closed-toe shoes you do not mind ruining", "Clothes you are happy to get muddy", "Sunglasses or goggles for the dust", "A full change of clothes for the ride home", "Cash for tips"],
    minAge: "Riders are usually 16 and up with a valid driver's licence. Younger guests can often ride as a passenger behind an adult.",
    maxGroup: "Priced per rider. Your transport is private to your party whatever the size, and larger parties get a lower per-person rate.",
    fitness: "Active. Steering and braking over rough trail is real work for your arms and shoulders.",
    goodToKnow: ["Mud is the point. Assume everything you wear comes back stained.", "Closed-toe shoes are required to ride, and long shorts save your legs from the spray.", "You stay dry apart from mud, so no swimwear needed on this one.", "Not suitable during pregnancy, or with back, neck or wrist problems."],
    confirmWithOperator: ["Confirm the operator's minimum riding age and licence requirement.", "Confirm whether two riders may share one ATV and any weight limit.", "Confirm whether a damage waiver or security deposit is taken on site.", "Confirm whether rinse-off facilities and lockers exist at the base.", "Confirm the rain cancellation policy."],
  },
  7: {
    about: "Your driver picks you up at your hotel and takes you up into the hills above Ocho Rios where the canopy course sits. You get fitted with a harness and helmet, walk through the safety briefing, then work your way along a run of lines and platforms with the valley opening under your feet, guides clipping you in and out at every stop. Off the last line, your driver is waiting to take you back.",
    included: ["Private door-to-door transport from your hotel and back", "Entrance fee for the canopy course", "Harness, helmet and gloves", "Trained guides on every platform"],
    bring: ["Closed-toe shoes with a back strap", "Shorts or trousers you can move in", "A hair tie if your hair is long", "Insect repellent", "Cash for tips"],
    minAge: "Ages 6 and up is standard for canopy courses here, and there is usually a minimum and maximum rider weight as well.",
    maxGroup: "Priced per person, with a private vehicle for your party. Larger parties get a lower per-person rate.",
    fitness: "Light to moderate. You walk short trails and steps between platforms, and the lines do the rest.",
    goodToKnow: ["Closed-toe shoes are required. Flip-flops will get you turned away at the gate.", "You stay dry, so no swimwear needed for this one.", "Tie long hair back and leave loose jewellery in the vehicle.", "A course photographer usually shoots the runs and sells the photos at the end. Buying is optional.", "Not suitable during pregnancy, or with heart, back or shoulder problems."],
    confirmWithOperator: ["Confirm the course's exact minimum age and its minimum and maximum weight limits.", "Confirm whether photos are covered or sold separately on site.", "Confirm the number of lines and total course length before we publish any figure.", "Confirm the lightning and heavy-rain policy, since canopy courses close in storms.", "Confirm accessibility limits for guests with reduced mobility."],
  },
  8: {
    about: "Your driver collects you at your hotel and takes you out to the stables in the countryside near Ocho Rios. You meet your horse, get matched to your riding level and take a short lesson in the ring, then head out on country trails with a groom riding alongside and the coast opening up in the distance. You ride back in, say thanks to your horse, and your driver takes you home.",
    included: ["Private door-to-door transport from your hotel and back", "Stable entrance fee", "Horse, tack and helmet", "A groom or trail guide riding with you"],
    bring: ["Long trousers or leggings to save your legs from rubbing", "Closed-toe shoes, ideally with a small heel", "Sunscreen and a hat you can secure", "Insect repellent", "Cash for tips"],
    minAge: "Ages 6 and up to ride alone on the trail. Smaller children can usually be led at a walk with a parent alongside.",
    maxGroup: "Priced per rider, with a private vehicle for your party. Larger parties get a lower per-person rate.",
    fitness: "Light. You walk most of the way, but two hours in the saddle works your legs and lower back.",
    goodToKnow: ["Horses are matched to your experience, so say honestly if you have never ridden.", "This is the dry ride. If you want to swim with your horse, book the Ride 'n' Swim instead.", "Long trousers make a real difference over two hours. Shorts rub.", "Not accessible for wheelchair users, and mounting needs some leg strength or a block."],
    confirmWithOperator: ["Confirm the stable's rider weight limit.", "Confirm the actual minimum age, and whether led pony rides are offered for younger children.", "Confirm that helmets are provided and whether they are required or optional.", "Confirm whether the trail includes any water crossing or beach section.", "Confirm the stable's rain policy and how late a cancellation is accepted."],
  },
  9: {
    about: "Your driver collects you at your hotel and runs you out to the stable, where you meet your horse and get a short lesson in the ring before you set off. You ride the trail through country back roads and down to the coast with a groom alongside you the whole way. At the beach you swap into swimwear, climb back on bareback, and ride your horse straight into the Caribbean.",
    included: ["Private door-to-door transport from your hotel and back", "All stable and entrance fees", "Your horse, helmet, and a trail guide", "The bareback swim in the sea"],
    bring: ["Swimwear under your clothes", "Long shorts or leggings so the saddle does not rub", "Water shoes or sandals with a strap", "A towel and a dry change of clothes", "Small cash for tipping the grooms"],
    minAge: "Ages 6 and up for the trail ride",
    maxGroup: "Priced per person, so every rider in your party books a spot. The vehicle that carries you is private to your group.",
    fitness: "Moderate. You need to get yourself into the saddle and sit a horse for about an hour.",
    goodToKnow: ["You get fully wet on the swim. Leave anything that needs to stay dry with your driver.", "Closed shoes or strapped sandals for the trail. No flip flops and no bare feet in the stirrups.", "Phones are not safe on the swim unless they are waterproof and strapped to you.", "The ground is uneven and the swim is bareback, so sit this one out if you are pregnant or have back or hip trouble."],
    confirmWithOperator: ["Exact minimum age at the stable, and whether the minimum is higher for the ocean swim than for the trail ride.", "Rider weight limit. Most Jamaican stables cap somewhere around 250 lb / 113 kg, but the operator needs to give us the real number before we publish one.", "Whether the trail ride is private to the party or shared with other riders under the same guide. The copy currently avoids claiming either.", "Whether helmets are mandatory and provided for every rider, including adults.", "Whether a site photographer shoots this ride and what the photos cost, so guests know to carry money for it."],
  },
  10: {
    about: "Your driver takes you from the hotel straight down to the beach. The crew fits your life vest and walks you through the throttle and the kill cord, then you head out into the bay with a guide riding alongside you. Open water, nothing in your way, and you can swap driver and passenger whenever you feel like it.",
    included: ["Private door-to-door transport from your hotel and back", "All beach and entrance fees", "Jet ski and fuel for your session", "Life vest and safety briefing", "A guide on the water with you"],
    bring: ["Swimwear under your clothes", "A towel and a dry change", "Reef safe sunscreen", "Sunglasses with a strap, or leave them in the car", "Small cash for tips"],
    minAge: "Ages 16 and up to drive. Younger riders can come along as a passenger with an adult.",
    maxGroup: "One flat rate covers a private party of up to 3. Larger parties are priced per head.",
    fitness: "Moderate. You need a solid grip and enough core strength to hold on through chop.",
    goodToKnow: ["You will be soaked. Nothing loose in your pockets.", "Phones only in a waterproof case on a strap, or leave them with your driver.", "The crew can move or cancel the ride if the sea turns rough. That call is theirs and it is about your safety.", "Not for you if you are pregnant or carrying a back, neck, or shoulder injury."],
    confirmWithOperator: ["Minimum age to drive the ski and minimum age to ride as a passenger, plus whether the beach operator asks to see a driver's licence. The 16 figure is the common standard, not a confirmed rule for this operator.", "Whether the flat rate covers one ski shared by the party or a ski each, and how the time is split when riders rotate. This is the single biggest thing to pin down before publishing.", "Whether the hour is time on the water or includes check in and the briefing.", "Whether a deposit or damage waiver is taken at the beach, since guests should not be surprised at the counter."],
  },
  11: {
    about: "Your driver runs you from the hotel down to the beach and you board the boat with the crew. Out in the bay they clip you into a harness and life vest on the back deck and let the line out, and you lift off the boat and up over the water. You glide out over the coastline with the whole bay under you, then the crew winches you back down onto the deck.",
    included: ["Private door-to-door transport from your hotel and back", "All beach and entrance fees", "The boat ride out into the bay and back", "Harness, life vest, and crew", "Your flight over the bay"],
    bring: ["Swimwear under your clothes", "A towel", "Reef safe sunscreen and a hat for the boat", "Sunglasses with a strap, or none at all", "Small cash for tips"],
    minAge: "Ages 6 and up, flying tandem with an adult",
    maxGroup: "One flat rate covers a private party of up to 3. Larger parties are priced per head.",
    fitness: "Easy. You sit into the harness and the boat does the work. You do need to step on and off a moving boat.",
    goodToKnow: ["You take off and land on the deck, so you can stay dry the whole way. Tell the crew if you want a dip in the sea on the way down.", "The flight itself is short, roughly ten to fifteen minutes each. The rest of the time is the boat ride out and getting everyone rigged.", "Weight limits apply per flight. That is why some couples fly tandem and others go up solo.", "Wind decides. The crew will move you to another slot or another day if the bay is not safe."],
    confirmWithOperator: ["Minimum age, and whether a child must fly tandem with an adult rather than solo.", "Minimum and maximum flyer weight for solo and tandem flights. Boat operators set these themselves and the numbers are safety-critical, so we should print theirs or none.", "Flight length per person, and whether all three people in a private party get airborne inside the booked hour.", "Whether the crew shoots photos or video and what they charge for them."],
  },
  12: {
    about: "Your driver takes you from the hotel to the launch, where your guide fits your life vest and shows you the paddle stroke. You push off in a see-through kayak and head out over the reef, watching the coral and the fish move under the hull the whole way. Your guide holds you over the best patches and you can slip in for a swim before you paddle back.",
    included: ["Private door-to-door transport from your hotel and back", "All entrance and beach fees", "Clear kayak, paddle, and life vest", "A guide on the water with you"],
    bring: ["Swimwear under your clothes", "Water shoes or sandals with a strap", "Reef safe sunscreen and a hat", "A dry bag or waterproof case for your phone", "Small cash for tips"],
    minAge: "Ages 5 and up, sharing a kayak with an adult",
    maxGroup: "One flat rate covers a private party of up to 3. Larger parties are priced per head.",
    fitness: "Light. Steady paddling in calm water, and your guide can tow you if your arms give out.",
    goodToKnow: ["You sit in a little water in the kayak, so expect a wet backside and a wet phone if it is not in a case.", "There is no shade out on the reef. The hat and the sunscreen matter more than you think.", "You do not need to be a strong swimmer to paddle, but you do to get in over the reef.", "Flat water is the whole point of this one. A rough sea moves it to another slot."],
    confirmWithOperator: ["Whether snorkel masks are provided, or whether the water stop is a swim only. The tour tags say Snorkel, so this needs settling before the page goes live.", "Minimum age, and whether young children must share an adult's kayak rather than paddle their own.", "How many kayaks the flat rate covers for a party of three, since clear kayaks are usually singles or doubles.", "Whether the operator supplies dry bags or guests must bring their own.", "Whether the reef site sits inside a marine park with its own fee, and that MAPL is covering it."],
  },
  13: {
    about: "Your driver collects you at the hotel and runs you up to the river. You get a tube and a life vest, walk down to the water with the guides, and they set you off into the current. You float down through the quiet stretches and the little rapids with guides in the water beside you, and the van meets you at the take out.",
    included: ["Private door-to-door transport from your hotel and back", "All river and entrance fees", "Tube, life vest, and river guides", "The shuttle from the take out back to your vehicle"],
    bring: ["Swimwear under your clothes", "Water shoes with a strap", "A towel and dry clothes for the ride home", "A waterproof case on a strap if you want your phone", "Small cash for tips"],
    minAge: "Ages 6 and up, and everyone needs to be comfortable in moving water",
    maxGroup: "One flat rate covers a private party of up to 3. Larger parties are priced per head.",
    fitness: "Easy on the water. The walk in and out is over wet river rocks and a short slope.",
    goodToKnow: ["You are soaked from the moment you sit in the tube. Leave your dry things in the car with your driver.", "River rocks are slick. Strapped water shoes, not flip flops and not bare feet.", "The river runs on the rain. Heavy weather upstream can push the trip to another day, and that call comes from the guides.", "Nothing loose in your hands on the water. If it floats away it is gone."],
    confirmWithOperator: ["Which river the operator runs. The White River and the Rio Bueno have different entry points and very different drive times from Ocho Rios, which changes what we can promise about the day.", "Minimum age set by the river operator.", "Whether guides shoot photos on the run and sell them at the take out, and roughly what they cost.", "Whether there are lockers or a secure spot for valuables at the entry point, or whether everything stays with the driver.", "Whether guides work on tips alone, so we can tell guests what to carry."],
  },
  14: {
    about: "Your driver picks you up at the hotel and takes you down the coast into Negril's West End. You reach Rick's with time before the sun goes, find yourself a spot at the cliff edge, and watch the local divers drop off the high perch and out of the trees. Jump from the lower ledges yourself if you feel it, or hold a drink and listen to the band while the sun falls into the sea, then your driver runs you home.",
    included: ["Private door-to-door transport from your hotel and back", "All entrance and admission fees", "Your driver and vehicle waiting the whole time you are on the cliffs"],
    bring: ["Swimwear under your clothes if you plan to jump", "Shoes with grip, the cliff top is uneven and wet in places", "A towel and a dry shirt for the ride home", "Cash or a card for food and drinks", "Sunglasses for the last of the light"],
    minAge: "No minimum to come along and watch. Jumping is a different matter and the venue sets its own rule on who goes off the cliff.",
    maxGroup: "One flat rate covers a private party of up to 4. Larger parties are priced per head.",
    fitness: "Easy if you are there to watch. Jumping asks you to be a strong swimmer and to climb wet steps back up.",
    goodToKnow: ["Food and drinks at Rick's are on your own tab, so carry cash or a card.", "Your pickup time shifts through the year because sunset does. Your driver confirms it the day before.", "The cliff top is bare rock, wet in spots, and packed at sunset. It is hard going with a wheelchair or a stroller.", "Jumping is at your own risk. There is nobody standing over you, and the safe entry points are the ones the local divers use."],
    confirmWithOperator: ["Whether Rick's charges admission or a cover on the booked date, and whether MAPL is covering it. There has historically been no door charge, but the copy currently promises entrance fees are included, so this must be confirmed.", "That food and drink really are excluded, so guests are never surprised by a bar tab.", "Whether the operator reserves a table or seating, or guests find their own spot on the cliff.", "Any minimum age or height rule Rick's applies to jumpers, and whether staff stop children from jumping.", "Rick's operating days and hours in low season. The venue has gone dark for stretches in the past and a full-price sunset tour to a closed bar is the worst possible outcome."],
  },
  15: {
    about: "Your driver collects you at the hotel and heads up into the hills of St. Ann, through the small districts and the bush roads, to the village of Nine Mile. A guide from the village walks you through the house Bob grew up in, the rock he sang about in Talkin' Blues, and the mausoleum where he and his mother rest, singing as you go. You get time at the shop and the bar before the long ride back down to the coast.",
    included: ["Private door-to-door transport from your hotel and back", "Entrance to the Nine Mile site", "A village guide through the house and the mausoleum", "Your driver and vehicle for the full day"],
    bring: ["Comfortable shoes for steps and uneven ground", "Small bills for tips and the shop", "Water for the drive", "A light layer, the hills run cooler than the coast"],
    minAge: "No minimum. It is a long day in the car though, so think it through with small children.",
    maxGroup: "One flat rate covers a private party of up to 3. Larger parties are priced per head.",
    fitness: "Easy walking with steps and uneven ground at the site. The drive each way is long and winding.",
    goodToKnow: ["Photography is restricted inside the mausoleum. Your guide will tell you when to put the camera away.", "The guides and the people who help you around the site work on tips. Carry small bills.", "Ganja is openly sold and offered around Nine Mile. Say no thank you and nobody minds.", "The road up is narrow and full of bends. Take something beforehand if you get carsick."],
    confirmWithOperator: ["Whether lunch or a food stop is part of the day, and whether guests pay for it themselves. A full-day tour with no word on food is a support ticket waiting to happen.", "Pickup timing by resort area. The run from Negril or Montego Bay is far longer than from Ocho Rios, and the rate may not hold for the far pickups.", "Whether the entrance fee MAPL pays covers the guided tour, or whether the village guide is tipped separately on top.", "Nine Mile's opening days, and whether the site ever closes for private events or ceremonies.", "Whether the flat group rate changes for pickups outside the Ocho Rios and St. Ann area."],
  },
}

export function getTourDetail(id: number): TourDetail | undefined {
  return TOUR_DETAILS[id]
}
