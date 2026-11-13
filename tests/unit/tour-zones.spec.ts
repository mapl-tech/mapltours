import { describe, test, expect } from 'vitest'
import { DESTINATIONS } from '@/lib/airport-transfers'
import { PICKUP_PLACES } from '@/components/checkout/one-page/pickup-places'
import { pickupText } from '@/lib/agent/booking-link'
import { TOUR_ZONES, TOUR_ZONE_LABEL, isTourZone } from '@/lib/tour-zones'
import { pickupNeedsArea, zoneFromPlaceText, zoneOfDestination, zoneOfPickup } from '@/lib/tour-zone-of'

/**
 * Which pickup zone a guest is in decides what Dunn's River and Blue Hole
 * cost (Collin, Nov 12 2026). The checkout page, the checkout server, the
 * agent tools and the tour email all ask lib/tour-zone-of, so these pin the
 * answer for every place any of them can name.
 */

describe('the zones', () => {
  test('six, west to east, each with a label guests read', () => {
    expect([...TOUR_ZONES]).toEqual(['negril', 'lucea', 'montego_bay', 'trelawny', 'runaway_bay', 'ocho_rios'])
    for (const z of TOUR_ZONES) expect(TOUR_ZONE_LABEL[z].length).toBeGreaterThan(3)
    expect(isTourZone('negril')).toBe(true)
    expect(isTourZone('kingston')).toBe(false)
    expect(isTourZone(undefined)).toBe(false)
  })
})

describe('every transfer hotel has a deliberate zone', () => {
  const zoneOf = (id: string) => zoneOfDestination(DESTINATIONS.find((d) => d.id === id)!)

  test('by transfer zone and parish, all 199 accounted for', () => {
    const counts: Record<string, number> = {}
    for (const d of DESTINATIONS) {
      const z = zoneOfDestination(d) ?? 'none'
      counts[z] = (counts[z] ?? 0) + 1
    }
    expect(DESTINATIONS).toHaveLength(199)
    expect(counts).toEqual({ montego_bay: 59, trelawny: 11, lucea: 4, negril: 70, runaway_bay: 13, ocho_rios: 32, none: 10 })
  })

  test('the hotels the parish rule alone would place wrong', () => {
    expect(zoneOf('round-hill-hotel')).toBe('montego_bay') // Hopewell, Hanover: nearer Montego Bay than Lucea
    expect(zoneOf('tryall-club')).toBe('lucea')
    expect(zoneOf('princess-grand-jamaica')).toBe('negril') // Green Island: the transfer card prices it as Negril
    expect(zoneOf('princess-senses-mangrove')).toBe('negril')
    expect(zoneOf('couples-tower-isle')).toBe('ocho_rios')
    expect(zoneOf('melia-braco-village')).toBe('trelawny') // Rio Bueno: the dearer of the two zones it borders
    expect(zoneOf('royalton-blue-water-trelawny')).toBe('trelawny')
  })

  test('outside every zone: Treasure Beach, Oracabessa, Port Maria, Whitehouse', () => {
    const none = DESTINATIONS.filter((d) => !zoneOfDestination(d)).map((d) => d.id).sort()
    expect(none).toEqual([
      'beyond-sunset-resort-villas', 'goldeneye-oracabessa', 'indigo-beach-resort', 'jakes-treasure-beach', 'katamah-guesthouse',
      'sandals-south-coast', 'st-mary-other', 'treasure-beach-hotel', 'treasure-beach-other', 'waikiki-guest-house',
    ])
  })

  test('a hotel keeps its zone through a booking link, whose cleaning can change its name', () => {
    for (const d of DESTINATIONS) {
      const cleaned = pickupText(d.name)
      const viaLink = zoneOfPickup(cleaned, pickupNeedsArea(cleaned) ? zoneFromPlaceText(cleaned) ?? '' : '')
      expect(viaLink, d.name).toBe(zoneOfDestination(d))
    }
  })
})

describe('the tour checkout pickup list', () => {
  test('21 places in a zone, 9 outside every zone', () => {
    expect(PICKUP_PLACES.filter((p) => p.zone)).toHaveLength(21)
    expect(PICKUP_PLACES.filter((p) => !p.zone).map((p) => p.name).sort()).toEqual([
      'Courtleigh Hotel, Kingston', 'Geejam Hotel, Port Antonio', 'GoldenEye, Oracabessa', 'Jakes Hotel, Treasure Beach',
      'Kingston Cruise Terminal', 'Spanish Court Hotel, Kingston', 'Strawberry Hill, Blue Mountains', 'Terra Nova All Suite Hotel, Kingston',
      'Trident Hotel, Port Antonio',
    ])
  })

  test('agrees with the transfer list wherever both name the same place', () => {
    for (const p of PICKUP_PLACES) {
      const d = DESTINATIONS.find((x) => x.name === p.name)
      if (d) expect(p.zone ?? null, p.name).toBe(zoneOfDestination(d))
    }
  })

  test('Royalton Blue Waters sells as Montego Bay but stands in Falmouth, and is priced there', () => {
    const r = PICKUP_PLACES.find((p) => p.name === 'Royalton Blue Waters, Montego Bay')!
    expect(r.zone).toBe('trelawny')
    expect(r.address).toMatch(/Falmouth, Trelawny/)
  })

  test('the airport and the cruise ports', () => {
    expect(zoneOfPickup('Sangster International Airport (MBJ)')).toBe('montego_bay')
    expect(zoneOfPickup('Falmouth Cruise Port')).toBe('trelawny')
    expect(zoneOfPickup('Ocho Rios Cruise Port')).toBe('ocho_rios')
    expect(zoneOfPickup('Kingston Cruise Terminal')).toBeNull()
  })
})

describe('zoneOfPickup: what a place says beats what the guest picks', () => {
  test('a listed place or a known hotel prices from its own zone, whatever area comes with it', () => {
    expect(zoneOfPickup('Sandals Negril Beach Resort', 'ocho_rios')).toBe('negril')
    expect(zoneOfPickup('Iberostar Waves Rose Hall', 'negril')).toBe('montego_bay')
    expect(zoneOfPickup('Spanish Court Hotel, Kingston', 'ocho_rios')).toBeNull()
  })

  test('a typed hotel or villa takes the area chosen for it, and only a real zone', () => {
    expect(zoneOfPickup('Seaview Villa', 'negril')).toBe('negril')
    expect(zoneOfPickup('Seaview Villa', 'elsewhere')).toBeNull()
    expect(zoneOfPickup('Seaview Villa')).toBeNull()
    expect(zoneOfPickup('', 'negril')).toBeNull()
  })

  test('names match whatever their case or spacing', () => {
    expect(zoneOfPickup('  moon palace jamaica, ocho rios ')).toBe('ocho_rios')
  })

  test('only a place no list knows asks for its area', () => {
    expect(pickupNeedsArea('Seaview Villa')).toBe(true)
    expect(pickupNeedsArea('Other hotel or villa (tell us in the note)')).toBe(true)
    expect(pickupNeedsArea('Sandals Negril Beach Resort')).toBe(false)
    expect(pickupNeedsArea('Iberostar Waves Rose Hall')).toBe(false)
    expect(pickupNeedsArea('')).toBe(false)
  })
})

describe('zoneFromPlaceText: an assistant describing where someone stays', () => {
  test('a place we know first, then area words', () => {
    expect(zoneFromPlaceText('Royalton Blue Waters, Montego Bay')).toBe('trelawny')
    expect(zoneFromPlaceText('a villa in Negril')).toBe('negril')
    expect(zoneFromPlaceText('Discovery Bay')).toBe('runaway_bay')
    expect(zoneFromPlaceText('our Airbnb in Ochi')).toBe('ocho_rios')
    expect(zoneFromPlaceText('near Rose Hall')).toBe('montego_bay')
    expect(zoneFromPlaceText('Falmouth')).toBe('trelawny')
    expect(zoneFromPlaceText('Lucea')).toBe('lucea')
  })

  test('two areas, or none we price, get no zone: nobody is quoted the cheaper one by accident', () => {
    expect(zoneFromPlaceText('between Negril and Montego Bay')).toBeNull()
    expect(zoneFromPlaceText('Kingston')).toBeNull()
    expect(zoneFromPlaceText('')).toBeNull()
    expect(zoneFromPlaceText(null)).toBeNull()
  })
})
