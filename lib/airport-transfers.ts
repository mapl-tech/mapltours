/**
 * Airport transfers, flat-rate zone pricing from Sangster International
 * Airport (MBJ, Montego Bay) to Jamaican hotels and resorts. Prices are per
 * vehicle, covering 1–4 passengers, in USD.
 *
 * Rates match the published private-transfer sheet for the Jamaica market.
 * Kingston (KIN) transfers and Port Antonio destinations are handled via
 * custom quote at MVP, the contact form routes those.
 */

export type TransferAirport = 'MBJ'
export type TransferZone = 'A' | 'B' | 'C' | 'D' | 'E'
export type TransferTripType = 'one_way' | 'round_trip'

export interface ZoneInfo {
  code: TransferZone
  label: string
  /** Travel time window from MBJ */
  duration: string
}

// Private airport transfer prices, USD, 1–4 passengers (per vehicle).
//   Zone A, Iberostar Rose Hall, Secrets, Jewel Grande, Hyatt, Hilton, Sandals MB, RIU MB
//   Zone B, Royalton Blue Water (Falmouth), Excellence Oyster Bay
//   Zone C, Grand Palladium (Lucea), Ocean Coral Spring, Round Hill, Tryall
//   Zone D, Negril hotels, Bahia Principe, Jewel Paradise Cove
//   Zone E, Ocho Rios hotels, Sandals South Coast, Treasure Beach, GoldenEye
export const ZONES: Record<TransferZone, ZoneInfo> = {
  A: {
    code: 'A',
    label: 'Montego Bay & Rose Hall',
    duration: 'Under 20 min from MBJ',
  },
  B: {
    code: 'B',
    label: 'Falmouth',
    duration: '35–45 min from MBJ',
  },
  C: {
    code: 'C',
    label: 'Trelawny, Hanover & Lucea',
    duration: '40–60 min from MBJ',
  },
  D: {
    code: 'D',
    label: 'Negril & Runaway Bay',
    duration: '75–90 min from MBJ',
  },
  E: {
    code: 'E',
    label: 'Ocho Rios & South Coast',
    duration: '90–120 min from MBJ',
  },
}

export interface TransferDestination {
  id: string
  name: string
  parish: string
  zone: TransferZone
  /**
   * What the Jamaica driver charges MAPL for ONE direction, flat for 1 to 4
   * passengers. Source of truth for the driver payout; the customer price
   * is derived from it. Parties of 5+ switch to a per-person rate (same
   * reading as tours, confirmed by Leshan 2026-08-25): the WHOLE party pays
   * extraPerPerson a head, floored at baseRate so more people never pay
   * less than a smaller party.
   */
  baseRate: number
  /**
   * Per-person rate a party of 5+ pays, per direction, from Collin's rate
   * sheet. Absent means the zone default in ZONE_EXTRA_PER_PERSON.
   */
  extraPerPerson?: number
  /**
   * True when the rate is a conservative estimate rather than a figure the
   * driver quoted. Estimates are set at or above the nearest quoted resort so
   * a booking can never sell below cost, and are listed for confirmation in
   * the admin transfer-rates view.
   */
  estimated?: boolean
  /**
   * Set when the property is not operating yet, e.g. "18 Dec 2026".
   *
   * OPERATOR INFORMATION ONLY — nothing guest-facing reads it. Guests book
   * transfers months ahead and a closed resort is still the right pickup
   * point for the date they are travelling, so the list does not hide or
   * label them.
   *
   * Hurricane Melissa (Cat 5, October 2025) closed roughly half the island's
   * resorts; as of the last check, dozens are still on staged reopening dates
   * through 2026 and into 2027. A transfer sold to a hotel that is shut is a
   * refund and an apology, so the picker prints this beside the name and the
   * quote panel repeats it. Free text rather than a date, because the sources
   * give quarters as often as days ("Q1 2027").
   *
   * Checked against a public reopening tracker on 2026-08-18. Re-check before
   * trusting a date, and delete the field once a property is back.
   */
  reopens?: string
}

/**
 * Hotel and landmark destinations served by flat-rate MBJ transfers.
 * The list is deliberately conservative, anything requiring a custom
 * quote (Port Antonio, Kingston parish, Mandeville) is absent here and
 * must route through /contact.
 */
export const DESTINATIONS: TransferDestination[] = [
  // Zone A, Montego Bay & Rose Hall
  { id: 'iberostar-rose-hall', name: 'Iberostar Waves Rose Hall', parish: 'St. James', zone: 'A', baseRate: 40 },
  { id: 'secrets-st-james', name: 'Secrets St. James, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, extraPerPerson: 5, reopens: 'Q1 2027' },
  { id: 'secrets-wild-orchid', name: 'Secrets Wild Orchid, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, extraPerPerson: 5, reopens: 'Q1 2027' },
  { id: 'jewel-grande-montego-bay', name: 'Jewel Grande Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true , reopens: '2027' },
  { id: 'hyatt-ziva-rose-hall', name: 'Hyatt Ziva Rose Hall', parish: 'St. James', zone: 'A', baseRate: 30 , reopens: 'Q1 2027' },
  { id: 'hyatt-zilara-rose-hall', name: 'Hyatt Zilara Rose Hall', parish: 'St. James', zone: 'A', baseRate: 30 , reopens: 'Q1 2027' },
  { id: 'hilton-rose-hall', name: 'Dreams Rose Hall (formerly Hilton Rose Hall)', parish: 'St. James', zone: 'A', baseRate: 30 , reopens: '2027' },
  { id: 'sandals-montego-bay', name: 'Sandals Montego Bay', parish: 'St. James', zone: 'A', baseRate: 25 , reopens: '18 Dec 2026' },
  { id: 'sandals-royal-caribbean', name: 'Sandals Caribbean Cay, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 25, estimated: true , reopens: '18 Dec 2026' },
  { id: 'riu-montego-bay', name: 'Riu Montego Bay', parish: 'St. James', zone: 'A', baseRate: 20 },
  { id: 'riu-palace-jamaica', name: 'Riu Palace Jamaica', parish: 'St. James', zone: 'A', baseRate: 20 },
  { id: 'riu-reggae', name: 'Riu Reggae', parish: 'St. James', zone: 'A', baseRate: 20 },
  { id: 'deja-resort', name: 'Deja Resort, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 15, extraPerPerson: 5 },
  { id: 's-hotel-montego-bay', name: 'S Hotel, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 15, extraPerPerson: 5 },
  { id: 'breathless-montego-bay', name: 'Breathless Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, extraPerPerson: 5, reopens: 'Q1 2027' },
  { id: 'iberostar-grand-rose-hall', name: 'JOIA Rose Hall by Iberostar', parish: 'St. James', zone: 'A', baseRate: 40 , reopens: '1 Dec 2026' },
  { id: 'half-moon-resort', name: 'Half Moon, A RockResort', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },

  // Zone B, Falmouth
  { id: 'royalton-blue-water-trelawny', name: 'Royalton Blue Waters (Falmouth)', parish: 'Trelawny', zone: 'B', baseRate: 60 , reopens: '15 Sep 2026' },
  { id: 'excellence-oyster-bay', name: 'Excellence Oyster Bay', parish: 'Trelawny', zone: 'B', baseRate: 60 },
  { id: 'royalton-white-sands', name: 'Royalton Hideaway Blue Waters (Falmouth)', parish: 'Trelawny', zone: 'B', baseRate: 60 , reopens: '15 Sep 2026' },
  { id: 'riu-aquarelle', name: 'Riu Palace Aquarelle (Falmouth)', parish: 'Trelawny', zone: 'B', baseRate: 60 },
  { id: 'falmouth-cruise-port', name: 'Falmouth Cruise Port', parish: 'Trelawny', zone: 'B', baseRate: 60, estimated: true },

  // Zone C, Trelawny / Hanover / Lucea
  { id: 'grand-palladium-lucea', name: 'Grand Palladium Jamaica Resort & Spa, Lucea', parish: 'Hanover', zone: 'C', baseRate: 75, estimated: true },
  { id: 'ocean-coral-spring', name: 'Ocean Coral Spring', parish: 'Trelawny', zone: 'C', baseRate: 70, estimated: true },
  { id: 'round-hill-hotel', name: 'Round Hill Hotel & Villas, Hanover', parish: 'Hanover', zone: 'C', baseRate: 50, estimated: true },
  { id: 'tryall-club', name: 'The Tryall Club, Hanover', parish: 'Hanover', zone: 'C', baseRate: 60, estimated: true },

  // Zone D, Negril & Runaway Bay
  { id: 'sandals-negril', name: 'Sandals Negril Beach Resort', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'riu-negril', name: 'Riu Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90 },
  { id: 'riu-palace-tropical-bay', name: 'Riu Palace Tropical Bay, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90 },
  { id: 'royalton-negril', name: 'Royalton Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true , reopens: '25 Aug 2026' },
  { id: 'azul-beach-negril', name: 'Azul Beach Resort Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'rockhouse-negril', name: 'Rockhouse Hotel, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'the-cliff-negril', name: 'The Cliff Hotel, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  // West End (Negril cliffs). Same drive as the Norman Manley Blvd resorts
  // already listed above, so they carry the same Zone D rate. Added after a
  // contact-form enquiry for Samsara showed an unlisted property is a dead end
  // in the booking flow. Marked estimated: the rate is inferred from the
  // neighbouring cliff hotels, not quoted per-property by the operator.
  { id: 'samsara-cliff-negril', name: 'Samsara Cliff Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'tensing-pen-negril', name: 'Tensing Pen Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'the-caves-negril', name: 'The Caves, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'catcha-falling-star-negril', name: 'Catcha Falling Star, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'xtabi-negril', name: 'Xtabi Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'negril-escape-negril', name: 'Negril Escape Resort & Spa', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'banana-shout-negril', name: 'Banana Shout Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'blue-cave-castle-negril', name: 'Blue Cave Castle, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'westender-inn-negril', name: 'Westender Inn, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'home-sweet-home-negril', name: 'Home Sweet Home Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'couples-swept-away', name: 'Couples Swept Away, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90 },
  { id: 'couples-negril', name: 'Couples Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90 },
  { id: 'hedonism-ii', name: 'Hedonism II, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, extraPerPerson: 25 },
  { id: 'bahia-principe-runaway-bay', name: 'Bahia Principe Explore Jamaica, Runaway Bay', parish: 'St. Ann', zone: 'D', baseRate: 80, reopens: '1 Dec 2026' },
  { id: 'bahia-principe-escape', name: 'Bahia Principe Escape, Runaway Bay', parish: 'St. Ann', zone: 'D', baseRate: 80 },
  { id: 'jewel-paradise-cove', name: 'Royalton CHIC Jamaica Paradise Cove, Runaway Bay', parish: 'St. Ann', zone: 'D', baseRate: 80, estimated: true , reopens: '15 Jul 2027' },

  // Zone E, Ocho Rios & South Coast
  { id: 'sandals-ochi', name: 'Sandals Ochi Beach Resort', parish: 'St. Ann', zone: 'E', baseRate: 90, estimated: true },
  { id: 'sandals-dunns-river', name: "Sandals Dunn's River", parish: 'St. Ann', zone: 'E', baseRate: 90, estimated: true },
  { id: 'moon-palace-ocho-rios', name: 'Moon Palace Jamaica, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 90 },
  { id: 'riu-ocho-rios', name: 'Riu Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 90 },
  { id: 'sandals-royal-plantation', name: 'Sandals Royal Plantation, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 90 },
  { id: 'couples-sans-souci', name: 'Couples Sans Souci, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 100, estimated: true },
  { id: 'couples-tower-isle', name: 'Couples Tower Isle, Ocho Rios', parish: 'St. Mary', zone: 'E', baseRate: 110 },
  { id: 'jamaica-inn-ocho-rios', name: 'Jamaica Inn, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 90, estimated: true },
  { id: 'goldeneye-oracabessa', name: 'GoldenEye, Oracabessa', parish: 'St. Mary', zone: 'E', baseRate: 120, estimated: true },
  { id: 'ocho-rios-cruise-port', name: 'Ocho Rios Cruise Port', parish: 'St. Ann', zone: 'E', baseRate: 90, estimated: true },
  { id: 'sandals-south-coast', name: 'Sandals South Coast (Whitehouse)', parish: 'Westmoreland', zone: 'E', baseRate: 110, estimated: true , reopens: '18 Nov 2026' },
  { id: 'jakes-treasure-beach', name: 'Jakes Hotel, Treasure Beach', parish: 'St. Elizabeth', zone: 'E', baseRate: 130, estimated: true },
  // ── Added for the type-ahead search ────────────────────────────────────
  // A guest whose resort was missing from the list had nowhere to go but the
  // contact form, which is a booking lost to a data gap. These fill out the
  // parishes the flat-rate zones already cover.
  //
  // Every one is `estimated`: the driver has not quoted them individually, so
  // each takes the TOP of its zone's quoted band rather than a guess in the
  // middle. That cannot sell below cost — the failure mode that matters — and
  // the admin transfer-rates view lists them for confirmation, at which point
  // a real quote replaces the estimate and usually comes down.

  // Zone A, Montego Bay & Rose Hall
  { id: 'iberostar-selection-rose-hall', name: 'Iberostar Selection Rose Hall', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'toby-resort', name: "Toby's Resort, Montego Bay", parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'mbj-other', name: 'Other hotel or villa, Montego Bay / Rose Hall', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },

  // Zone B, Falmouth
  { id: 'falmouth-other', name: 'Other hotel or villa, Falmouth', parish: 'Trelawny', zone: 'B', baseRate: 60, estimated: true },

  // Zone C, Trelawny / Hanover / Lucea
  { id: 'ocean-eden-bay', name: 'Ocean Eden Bay, Trelawny', parish: 'Trelawny', zone: 'C', baseRate: 75, estimated: true },
  { id: 'grand-palladium-lady-hamilton', name: 'Grand Palladium Lady Hamilton, Lucea', parish: 'Hanover', zone: 'C', baseRate: 75, estimated: true },
  { id: 'hanover-other', name: 'Other hotel or villa, Hanover / Lucea', parish: 'Hanover', zone: 'C', baseRate: 75, estimated: true },

  // Zone D, Negril
  { id: 'beaches-negril', name: 'Beaches Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'sunset-at-the-palms', name: 'Sunset at the Palms, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'charela-inn', name: 'Charela Inn, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'legends-beach-resort', name: 'Legends Beach Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'negril-other', name: 'Other hotel or villa, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },

  // Zone D, Runaway Bay
  { id: 'fdr-runaway-bay', name: 'Franklyn D. Resort (FDR), Runaway Bay', parish: 'St. Ann', zone: 'D', baseRate: 90, estimated: true },
  { id: 'runaway-bay-other', name: 'Other hotel or villa, Runaway Bay / Discovery Bay', parish: 'St. Ann', zone: 'D', baseRate: 90, estimated: true },

  // Zone E, Ocho Rios & the north-east
  { id: 'ocho-rios-other', name: 'Other hotel or villa, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'st-mary-other', name: 'Other hotel or villa, Oracabessa / Port Maria', parish: 'St. Mary', zone: 'E', baseRate: 120, estimated: true },
  { id: 'treasure-beach-other', name: 'Other hotel or villa, Treasure Beach', parish: 'St. Elizabeth', zone: 'E', baseRate: 130, estimated: true },
  // Verified open on the reopening tracker (checked 2026-08-18) and absent
  // from the list before now.
  { id: 'princess-grand-jamaica', name: 'Princess Grand Jamaica, Green Island', parish: 'Hanover', zone: 'D', baseRate: 90, estimated: true },
  { id: 'princess-senses-mangrove', name: 'Princess Senses The Mangrove, Green Island', parish: 'Hanover', zone: 'D', baseRate: 90, estimated: true },
  { id: 'grand-lido-negril', name: 'Grand Lido Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true, reopens: '25 Aug 2026' },
  { id: 'royalton-hideaway-negril', name: 'Royalton Hideaway Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true, reopens: '25 Aug 2026' },
  { id: 'sea-garden-montego-bay', name: 'Sea Garden Beach Resort, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true, reopens: '1 Sep 2026' },
  // ── Everything else on the island's north and west coasts ──────────────
  // Comprehensive by intent, not curated: a guest whose hotel is missing has
  // no way to book, and that costs more than a listing nobody picks. Closed
  // and rebuilding properties are included too — people book transfers months
  // ahead of a reopening, and the status is not shown to guests either way.

  // Montego Bay & Rose Hall
  { id: 'catalonia-montego-bay', name: 'Catalonia Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'grand-decameron-montego-beach', name: 'Grand Decameron Montego Beach', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'grand-decameron-cornwall-beach', name: 'Grand Decameron Cornwall Beach', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'oasis-sunset-beach', name: 'Oasis at Sunset Beach, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'zoetry-montego-bay', name: 'Zoëtry Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'unico-jamaica', name: 'Único 20°87° Jamaica, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'moon-palace-grand-montego-bay', name: 'Moon Palace The Grand, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'holiday-inn-montego-bay', name: 'Holiday Inn Resort Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'coyaba-beach-resort', name: 'Coyaba Beach Resort, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'seacastles-resort', name: 'Seacastles Resort, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'doctors-cave-beach-hotel', name: "Doctor's Cave Beach Hotel, Montego Bay", parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'wexford-hotel', name: 'The Wexford Hotel, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'altamont-west', name: 'Altamont West Hotel, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'blue-diamond-rose-hall', name: 'Blue Diamond Luxury Boutique Hotel, Rose Hall', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },

  // Falmouth & Trelawny
  { id: 'melia-braco-village', name: 'Meliá Braco Village, Rio Bueno', parish: 'Trelawny', zone: 'C', baseRate: 75, estimated: true },

  // Negril
  { id: 'grand-pineapple-negril', name: 'Grand Pineapple Beach Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'skylark-negril', name: 'Skylark Negril Beach Resort', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'idle-awhile', name: 'Idle Awhile Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'travellers-beach-resort', name: 'Travellers Beach Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'merrils-beach-resort', name: "Merril's Beach Resort, Negril", parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },

  // Runaway Bay & Ocho Rios
  { id: 'beaches-runaway-bay', name: 'Beaches Runaway Bay', parish: 'St. Ann', zone: 'D', baseRate: 90, estimated: true },
  { id: 'grand-muthu-club-caribbean', name: 'Grand Muthu Club Caribbean, Runaway Bay', parish: 'St. Ann', zone: 'D', baseRate: 90, estimated: true },
  { id: 'club-ambiance', name: 'Club Ambiance, Runaway Bay', parish: 'St. Ann', zone: 'D', baseRate: 90, estimated: true },
  { id: 'beaches-ocho-rios', name: 'Beaches Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'hermosa-cove', name: 'Hermosa Cove, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'shaw-park-beach-hotel', name: 'Shaw Park Beach Hotel, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'hibiscus-lodge', name: 'Hibiscus Lodge Hotel, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'sandcastles-ocho-rios', name: 'Sandcastles Resort, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  // ── The rest of the north and west coasts ──────────────────────────────
  // Swept from public accommodation listings for each resort town (Montego
  // Bay, Falmouth, Negril, Runaway Bay, Ocho Rios, Treasure Beach) rather
  // than from memory, so the small hotels, inns and guesthouses are here
  // alongside the all-inclusives — those are exactly the guests who could not
  // find themselves in a list of forty resorts. Single-unit condo and villa
  // rentals were left out: they are addresses, not properties, and the
  // "Other hotel or villa" row in each zone already covers them.

  // St. James · zone A
  { id: 'big-apple-hotel', name: 'Big Apple Hotel, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'caribic-house-hotel', name: 'Caribic House Hotel, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'chelsea-inn', name: 'Chelsea Inn, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'el-greco-resort', name: 'El Greco Resort, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'emerald-view-resort', name: 'Emerald View Resort, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'hotel-gloriana', name: 'Hotel Gloriana, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'hotel-39-jamaica', name: 'Hotel 39 Jamaica, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'mangos-jamaica', name: 'Mangos Jamaica, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'polkerris-bed-breakfast', name: 'Polkerris Bed & Breakfast, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'reggae-hostel-montego-bay', name: 'Reggae Hostel Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'relax-resort', name: 'Relax Resort, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'rose-hall-deluxe-hotel', name: 'Rose Hall deLuxe Hotel', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'sandals-inn', name: 'Sandals Inn, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'sunscape-montego-bay', name: 'Sunscape Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'the-royal-kensington-guest-house', name: 'The Royal Kensington Guest House, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'tropical-court-hotel', name: 'Tropical Court Hotel, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'verney-house-resort', name: 'Verney House Resort, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'villa-donna-inn', name: 'Villa Donna Inn, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'sahara-de-la-mer-inn', name: 'Sahara de la Mer Inn, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'palm-view-guest-house', name: 'Palm View Guest House, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'brandon-hill-guest-house', name: 'Brandon Hill Guest House, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'basileia-palace', name: 'Basileia Palace, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'donway', name: 'Donway, A Jamaican Style Village, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },

  // Trelawny · zone B
  { id: 'the-vista-inn', name: 'The Vista Inn, Falmouth', parish: 'Trelawny', zone: 'B', baseRate: 60, estimated: true },
  { id: 'retreat-guesthouse-luxury-suites', name: 'Retreat Guesthouse Luxury Suites, Falmouth', parish: 'Trelawny', zone: 'B', baseRate: 60, estimated: true },

  // Westmoreland · zone D
  { id: 'bar-b-barn-beach-hotel', name: 'Bar-B-Barn Beach Hotel, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'beachcomber-club-resort', name: 'Beachcomber Club Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'blue-cave-castles', name: 'Blue Cave Castles, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'chippewa-village', name: 'Chippewa Village, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'cocolapalm-seaside-resort', name: 'Cocolapalm Seaside Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'coral-seas-beach-resort', name: 'Coral Seas Beach Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'coral-seas-cliff', name: 'Coral Seas Cliff, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'country-country', name: 'Country Country, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'firefly-beach-cottages', name: 'Firefly Beach Cottages, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'foote-prints-on-the-sands', name: 'Foote Prints on the Sands, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'fun-holiday-beach-resort', name: 'Fun Holiday Beach Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'hidden-paradise-resort', name: 'Hidden Paradise Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'jackie-s-on-the-reef', name: "Jackie's on the Reef, Negril", parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'kuyaba', name: 'Kuyaba, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'mirage-resort', name: 'Mirage Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'negril-beach-club', name: 'Negril Beach Club', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'negril-palms', name: 'Negril Palms', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'negril-tree-house-resort', name: 'Negril Tree House Resort', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'rondel-village', name: 'Rondel Village, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'rooms-on-the-beach-negril', name: 'Rooms on the Beach Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'roots-bamboo-beach-resort', name: 'Roots Bamboo Beach Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'sandy-haven-resort', name: 'Sandy Haven Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'seastar-inn', name: 'Seastar Inn, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'sunrise-club-hotel', name: 'Sunrise Club Hotel, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'tamboo-resort', name: 'Tamboo Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'the-boardwalk-village', name: 'The Boardwalk Village, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'the-spa-retreat-boutique-hotel', name: 'The Spa Retreat Boutique Hotel, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'tingalaya-s-retreat', name: "Tingalaya's Retreat, Negril", parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'whistling-bird-resort', name: 'Whistling Bird Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'white-sands-negril', name: 'White Sands Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'zimbali-culinary-retreat', name: 'Zimbali Culinary Retreat, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'coral-cove-wellness-resort', name: 'Coral Cove Wellness Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'pure-garden-resort', name: 'Pure Garden Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'the-oasis-resort', name: 'The Oasis Resort, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'kaiser-s-hotel', name: "Kaiser's Hotel, Negril", parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'judy-house-cottages', name: 'Judy House Cottages, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },

  // St. Ann · zone D
  { id: 'piper-s-cove-resort', name: "Piper's Cove Resort, Runaway Bay", parish: 'St. Ann', zone: 'D', baseRate: 90, estimated: true },
  { id: 'silver-creek-resort', name: 'Silver Creek Resort, Runaway Bay', parish: 'St. Ann', zone: 'D', baseRate: 90, estimated: true },
  { id: 'sunflower-resort-villas', name: 'Sunflower Resort & Villas, Runaway Bay', parish: 'St. Ann', zone: 'D', baseRate: 90, estimated: true },
  { id: 'little-savoy-guest-house', name: 'Little Savoy Guest House, Runaway Bay', parish: 'St. Ann', zone: 'D', baseRate: 90, estimated: true },
  { id: 'the-cardiff-hotel-spa', name: 'The Cardiff Hotel & Spa, Runaway Bay', parish: 'St. Ann', zone: 'D', baseRate: 90, estimated: true },

  // St. Ann · zone E
  { id: 'chrisann-s-beach-resort', name: "Chrisann's Beach Resort, Ocho Rios", parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'executive-mamme-bay-hotel', name: 'Executive Mamme Bay Hotel, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'fisherman-s-point-resort', name: "Fisherman's Point Resort, Ocho Rios", parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'kaz-kreol-beach-lodge', name: 'Kaz Kreol Beach Lodge, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'little-shaw-park-guest-house', name: 'Little Shaw Park Guest House, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'marine-view-hotel', name: 'Marine View Hotel, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'mystic-ridge-resort', name: 'Mystic Ridge Resort, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'pineapple-court-hotel', name: 'Pineapple Court Hotel, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'reggae-hostel-ocho-rios', name: 'Reggae Hostel Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'rooms-on-the-beach-ocho-rios', name: 'Rooms on the Beach Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'silver-seas-hotel', name: 'Silver Seas Hotel, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'the-village-hotel', name: 'The Village Hotel, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'tina-s-guest-house', name: "Tina's Guest House, Ocho Rios", parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'sago-palm-hotel', name: 'Sago Palm Hotel, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'sand-and-tan-beach-hotel', name: 'Sand and Tan Beach Hotel, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'the-suites-at-ocho-rios', name: 'The Suites at Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },
  { id: 'pink-rock-inn', name: 'Pink Rock Inn, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 110, estimated: true },

  // St. Elizabeth · zone E
  { id: 'treasure-beach-hotel', name: 'Treasure Beach Hotel', parish: 'St. Elizabeth', zone: 'E', baseRate: 130, estimated: true },
  { id: 'katamah-guesthouse', name: 'Katamah Guesthouse, Treasure Beach', parish: 'St. Elizabeth', zone: 'E', baseRate: 130, estimated: true },
  { id: 'waikiki-guest-house', name: 'Waikiki Guest House, Treasure Beach', parish: 'St. Elizabeth', zone: 'E', baseRate: 130, estimated: true },
  { id: 'beyond-sunset-resort-villas', name: 'Beyond Sunset Resort & Villas, Treasure Beach', parish: 'St. Elizabeth', zone: 'E', baseRate: 130, estimated: true },
  { id: 'indigo-beach-resort', name: 'Indigo Beach Resort, Treasure Beach', parish: 'St. Elizabeth', zone: 'E', baseRate: 130, estimated: true },
]

export function getDestination(id: string): TransferDestination | undefined {
  return DESTINATIONS.find((d) => d.id === id)
}

export function getZoneForDestination(id: string): ZoneInfo | undefined {
  const d = getDestination(id)
  return d ? ZONES[d.zone] : undefined
}

/** MAPL's margin on top of the driver's cost. */
export const TRANSFER_MARGIN = 0.10
/**
 * Cost of paying the driver via Remitly from Canada, charged the way it is
 * actually incurred rather than as a flat percentage.
 *
 * Measured live 2026-08-15: CAD 3.99 FLAT per send plus a ~2.05% FX spread on
 * CAD to JMD. The flat half is the part a percentage cannot model. A single
 * 5% cover works out at $7 on a $140 payout, which is generous, and at $0.75
 * on a $15 payout, which does not even reach the CAD 3.99. MAPL pays each
 * round trip in two halves, so the flat fee lands twice on the trips least
 * able to absorb it, and seven of the cheapest price points were selling
 * below fully loaded cost: a Deja Resort round trip took $34 and cost $34.53
 * once the payout and the card fee were paid.
 *
 * Splitting it into a flat component and a rate component moves most prices
 * by a dollar, makes sixteen of them a dollar CHEAPER, and lifts the short
 * Montego Bay hops by $3 to $5, which is the difference between a small
 * margin and a loss. Remeasure both numbers if the payout rail changes.
 */
export const REMITLY_FLAT = 2.91
export const REMITLY_FX = 0.0205
/**
 * Card processing, built INTO the displayed price so the customer sees a
 * single all-in number and the margin survives intact. Stripe on this account:
 * 2.9% + 0.8% (international card) + 2% (USD settled to CAD) + C$0.30 fixed.
 * Verified to the cent against live charges. If the account ever settles in
 * USD, drop CARD_RATE to 0.037 and prices fall accordingly.
 */
export const CARD_RATE = 0.057
export const CARD_FIXED = 0.22

/**
 * What the driver is paid for the whole trip: one direction, or both for a
 * round trip. This is the booking's subtotal and the driver's payout.
 */
/** Collin's round-trip discount, confirmed by him on WhatsApp 2026-08-15
 *  ("10% off"): a round trip costs 1.8x his one-way rate, not 2x. Applied at
 *  the COST layer so the customer price, MAPL's 10% margin structure, the
 *  stored subtotal, and the supplier payout all move together: the discount
 *  is his, so his payout carries it too. */
export const ROUND_TRIP_DISCOUNT = 0.10

/** The vehicle seats 7 guests; larger parties need a second vehicle and a
 *  WhatsApp quote, so the site stops here. */
export const MAX_TRANSFER_PASSENGERS = 7

/** Zone defaults for the 5+ per-person rate, from Collin's rate sheet
 *  (2026-08-25): Montego Bay hotels run $7 a head, Falmouth-distance $15,
 *  Negril/Runaway Bay and Ocho Rios $20. Hotels the sheet prices
 *  individually carry their own extraPerPerson. */
const ZONE_EXTRA_PER_PERSON: Record<TransferZone, number> = {
  A: 7,
  B: 15,
  C: 15,
  D: 20,
  E: 20,
}

/** Per-direction driver rate for a party of this size: flat to 4, per-person
 *  (floored at the vehicle rate) from 5 up. */
function legRate(dest: TransferDestination, passengers: number): number {
  const pax = Math.max(1, Math.round(passengers))
  if (pax <= 4) return dest.baseRate
  const extra = dest.extraPerPerson ?? ZONE_EXTRA_PER_PERSON[dest.zone]
  return Math.max(dest.baseRate, extra * pax)
}

export function driverCost(
  destinationId: string,
  tripType: TransferTripType,
  passengers = 1,
): number | null {
  const dest = getDestination(destinationId)
  if (!dest) return null
  const rate = legRate(dest, passengers)
  if (tripType === 'round_trip') {
    return Math.round(rate * 2 * (1 - ROUND_TRIP_DISCOUNT) * 100) / 100
  }
  return rate
}

/**
 * The all-in price the customer pays: driver cost, plus MAPL's margin, plus
 * the real payout cost, all grossed up so card processing does not eat the
 * margin. Rounded UP to the dollar so a booking can never come in under cost.
 *
 * `sends` is why this is not a single percentage: a round trip is paid to the
 * driver in two halves, so the flat Remitly fee is incurred twice regardless
 * of how small the fare is.
 */
export function getTransferPrice(
  destinationId: string,
  tripType: TransferTripType,
  passengers = 1,
): number | null {
  const cost = driverCost(destinationId, tripType, passengers)
  if (cost === null) return null
  const sends = tripType === 'round_trip' ? 2 : 1
  const payout = cost * (1 + TRANSFER_MARGIN + REMITLY_FX) + sends * REMITLY_FLAT
  return Math.ceil((payout + CARD_FIXED) / (1 - CARD_RATE))
}

/** Cheapest and dearest all-in price in a zone. Prices are set per resort, so
 *  a single "from" figure hides real spread (Negril costs more than Runaway
 *  Bay in the same zone); the UI shows the full range instead. */
export function zonePriceRange(
  zone: TransferZone,
  tripType: TransferTripType,
): { min: number; max: number } {
  const prices = DESTINATIONS.filter((d) => d.zone === zone)
    .map((d) => getTransferPrice(d.id, tripType))
    .filter((p): p is number => p !== null)
  return prices.length
    ? { min: Math.min(...prices), max: Math.max(...prices) }
    : { min: 0, max: 0 }
}

/** Cheapest all-in price in a zone, for "from $X" display. */
export function zoneFromPrice(
  zone: TransferZone,
  tripType: TransferTripType,
): number {
  const prices = DESTINATIONS.filter((d) => d.zone === zone)
    .map((d) => getTransferPrice(d.id, tripType))
    .filter((p): p is number => p !== null)
  return prices.length ? Math.min(...prices) : 0
}

/**
 * Cheapest all-in price to a named AREA, for "from $X" display.
 *
 * Zones are the pricing unit, but the hero quotes places travelers actually
 * search for, and the two don't line up: Rose Hall and Montego Bay share
 * zone A, so zoneFromPrice('A') returns a Montego Bay rate that would be
 * wrong under a "to Rose Hall" label. Matching on the destination name keeps
 * the figure honest, and derives it from the rate table rather than pinning
 * the display to one hotel id that may not stay the cheapest.
 */
export function areaFromPrice(area: string, tripType: TransferTripType): number {
  const needle = area.toLowerCase()
  const prices = DESTINATIONS.filter((d) => d.name.toLowerCase().includes(needle))
    .map((d) => getTransferPrice(d.id, tripType))
    .filter((p): p is number => p !== null)
  return prices.length ? Math.min(...prices) : 0
}

/** Destinations whose rate is still an estimate, for operator confirmation. */
export function estimatedRateDestinations(): TransferDestination[] {
  return DESTINATIONS.filter((d) => d.estimated)
}

/**
 * Free-text search over the destination list, for the type-ahead on the quote
 * form.
 *
 * Guests type what is on their booking confirmation, which is rarely the
 * name in this table: "riu palace", "sandals ochi", "grand palladium lucea",
 * "rosehall". So the haystack is the name plus the parish plus the zone
 * label, every token of the query has to appear SOMEWHERE in it (order
 * ignored), and punctuation and accents are flattened first — otherwise
 * "melia braco" misses Meliá and "doctors cave" misses Doctor's.
 *
 * Results keep table order, which is zone order: the closest places to the
 * airport first, and each area's "Other hotel or villa" entry last within its
 * own zone, where it reads as the fallback it is.
 */
function flatten(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Same, with the separators closed up: "doctor's cave" -> "doctorscave". */
function squash(text: string): string {
  return flatten(text).replace(/ /g, '')
}

export function searchDestinations(query: string, limit = 40): TransferDestination[] {
  const tokens = flatten(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return DESTINATIONS.slice(0, limit)

  const scored: { d: TransferDestination; score: number }[] = []

  for (const d of DESTINATIONS) {
    // Two haystacks per field: spaced and squashed. An apostrophe becomes a
    // space when flattened, so a guest typing "doctors cave" would otherwise
    // miss "Doctor's Cave" — the spelling nobody reproduces.
    const own = `${d.name} ${d.parish}`
    const strong = [flatten(own), squash(own)]
    const area = `${own} ${ZONES[d.zone].label}`
    const weak = [flatten(area), squash(area)]

    const hits = (hay: string[]) =>
      tokens.every((t) => hay.some((h) => h.includes(t) || h.includes(t.replace(/ /g, ''))))

    if (hits(strong)) scored.push({ d, score: 2 })
    else if (hits(weak)) scored.push({ d, score: 1 })
  }

  // Name-and-parish matches first, then places that only matched through
  // their zone's label — "negril" should list Negril before it lists Runaway
  // Bay, which shares the zone "Negril & Runaway Bay". Inside a band, table
  // order (nearest the airport first) holds.
  const ranked = scored
    .sort((a, b) => b.score - a.score)
    .map((m) => m.d)

  // The "Other hotel or villa" rows are pinned to the end of the RESULT, not
  // just sorted there, because a town like Negril now matches more properties
  // than the list shows: sorting alone pushed the fallback past the cut, and
  // the guest who most needs it — the one whose hotel is not in the table —
  // is exactly the one who would never scroll to it.
  const fallbacks = ranked.filter((d) => d.id.endsWith('-other'))
  const rest = ranked.filter((d) => !d.id.endsWith('-other'))
  return [...rest.slice(0, Math.max(0, limit - fallbacks.length)), ...fallbacks]
}

export function groupDestinationsByZone(): Array<{ zone: ZoneInfo; items: TransferDestination[] }> {
  return (Object.keys(ZONES) as TransferZone[]).map((z) => ({
    zone: ZONES[z],
    items: DESTINATIONS.filter((d) => d.zone === z),
  }))
}

export interface TransferQuote {
  destinationId: string
  destinationName: string
  parish: string
  zone: TransferZone
  zoneLabel: string
  zoneDuration: string
  tripType: TransferTripType
  passengers: number // 1-4
  priceUsd: number
}

export function buildQuote(
  destinationId: string,
  tripType: TransferTripType,
  passengers: number,
): TransferQuote | null {
  const dest = getDestination(destinationId)
  const zone = dest ? ZONES[dest.zone] : null
  if (!dest || !zone) return null
  // All-in price for this specific resort. MUST come from getTransferPrice so
  // the quote the customer sees matches what the server recomputes and charges.
  const clampedPax = Math.max(1, Math.min(MAX_TRANSFER_PASSENGERS, Math.round(passengers)))
  const price = getTransferPrice(destinationId, tripType, clampedPax)
  if (price === null) return null
  return {
    destinationId: dest.id,
    destinationName: dest.name,
    parish: dest.parish,
    zone: dest.zone,
    zoneLabel: zone.label,
    zoneDuration: zone.duration,
    tripType,
    passengers: clampedPax,
    priceUsd: price,
  }
}
