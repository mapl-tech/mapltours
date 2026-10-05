import { describe, it, expect } from 'vitest'
import { clipCredit, clipsInReelOrder, isMaplAccount, MAPL_ACCOUNT_IDS, MAPL_BRAND_NAME } from '@/lib/creator'

/**
 * Who a clip is from (lib/creator clipCredit). MAPL Tours Jamaica's own
 * clips are credited to the brand by ACCOUNT ID, because names and social
 * handles are typed by guests and handles have no uniqueness rule: a guest
 * calling themselves "MAPL Tours Jamaica", or taking a MAPL handle, must
 * still read as a guest, and is never shown under our name.
 */
const MAPL_ID = Array.from(MAPL_ACCOUNT_IDS)[0]
const GUEST_ID = '11111111-2222-4333-8444-555555555555'

describe('clipCredit', () => {
  it('credits our own account to MAPL Tours Jamaica, whatever its profile says', () => {
    expect(MAPL_BRAND_NAME).toBe('MAPL Tours Jamaica')
    expect(clipCredit({ user_id: MAPL_ID, uploader_name: 'MAPL TECH', uploader_handle: null })).toEqual({ by: 'MAPL Tours Jamaica', mapl: true })
    expect(clipCredit({ user_id: MAPL_ID, uploader_name: null, uploader_handle: 'someone' })).toEqual({ by: 'MAPL Tours Jamaica', mapl: true })
    expect(isMaplAccount(MAPL_ID)).toBe(true)
  })

  it('a guest is credited by handle, else first name, else the fallback', () => {
    expect(clipCredit({ user_id: GUEST_ID, uploader_handle: 'ada.travels', uploader_name: 'Ada Lovelace' })).toEqual({ by: '@ada.travels', mapl: false })
    expect(clipCredit({ user_id: GUEST_ID, uploader_handle: null, uploader_name: 'Ada Lovelace' })).toEqual({ by: 'Ada', mapl: false })
    expect(clipCredit({ user_id: GUEST_ID }, 'a guest')).toEqual({ by: 'a guest', mapl: false })
  })

  it('a guest who types our name or takes a MAPL handle is still a guest, and not shown as us', () => {
    expect(clipCredit({ user_id: GUEST_ID, uploader_name: 'MAPL Tours Jamaica', uploader_handle: null })).toEqual({ by: 'A guest', mapl: false })
    expect(clipCredit({ user_id: GUEST_ID, uploader_name: 'mapl', uploader_handle: null }, 'a guest')).toEqual({ by: 'a guest', mapl: false })
    // Typed with Cyrillic М, А, Р, and in full-width letters.
    expect(clipCredit({ user_id: GUEST_ID, uploader_name: '\u041c\u0410\u0420L Tours Jamaica', uploader_handle: null })).toEqual({ by: 'A guest', mapl: false })
    expect(clipCredit({ user_id: GUEST_ID, uploader_name: '\uff2d\uff21\uff30\uff2c', uploader_handle: null })).toEqual({ by: 'A guest', mapl: false })
    // A capital i for the l, Latin small capitals, accents.
    for (const name of ['MapI Tours Jamaica', '\u1d0d\u1d00\u1d18\u029f', 'M\u00c4PL', 'MA\u0301PL Tours']) {
      expect(clipCredit({ user_id: GUEST_ID, uploader_name: name, uploader_handle: null })).toEqual({ by: 'A guest', mapl: false })
    }
    for (const handle of ['mapl', 'mapltours', 'mapl.tours', 'mapl_tours', 'mapltoursjamaica', 'mapl.tours.jamaica', 'mapltech', 'mapljamaica',
      'mapletours', 'mapletoursjamaica', 'maple.tours', 'themapltoursjamaica', 'the.mapl.tours', 'the.mapl', 'official_mapl', 'jamaica.mapl',
      'rnapltoursjamaica', 'map1toursjamaica']) {
      expect(clipCredit({ user_id: GUEST_ID, uploader_handle: handle, uploader_name: null })).toEqual({ by: 'A guest', mapl: false })
    }
    // A MAPL-looking handle gives way to the guest's own first name when there is one.
    expect(clipCredit({ user_id: GUEST_ID, uploader_handle: 'mapltoursjamaica', uploader_name: 'Ada Lovelace' })).toEqual({ by: 'Ada', mapl: false })
    expect(isMaplAccount(GUEST_ID)).toBe(false)
    expect(isMaplAccount(null)).toBe(false)
    expect(isMaplAccount('')).toBe(false)
  })

  it('names that merely start like ours are left alone', () => {
    for (const handle of ['maple.leaf', 'maples_travel', 'map.lover', 'maplover', 'map_life', 'maplanner', 'map.lab', 'maplibre', 'ma.plage', 'ma_place', 'ma.playlist',
      'maple.tourist', 'the_maple_tourist', 'maple_touring', 'mapletechie', 'mapleton', 'maplewood.tours']) {
      expect(clipCredit({ user_id: GUEST_ID, uploader_handle: handle, uploader_name: null })).toEqual({ by: `@${handle}`, mapl: false })
    }
    expect(clipCredit({ user_id: GUEST_ID, uploader_handle: null, uploader_name: 'Maple Brown' })).toEqual({ by: 'Maple', mapl: false })
  })
})

describe('clipsInReelOrder', () => {
  const v = (id: string, user_id: string) => ({ id, user_id })
  it('plays our own clips first, then guests\', each kind numbered on its own', () => {
    // Newest first, as the clips arrive: a guest's, ours, a guest's, ours.
    const list = [v('g1', GUEST_ID), v('m1', MAPL_ID), v('g2', GUEST_ID), v('m2', MAPL_ID)]
    expect(clipsInReelOrder(list).map(({ video, n, of }) => `${video.id} ${n}/${of}`)).toEqual(['m1 1/2', 'm2 2/2', 'g1 1/2', 'g2 2/2'])
  })
  it('one kind alone keeps its order and one count', () => {
    expect(clipsInReelOrder([v('g1', GUEST_ID), v('g2', GUEST_ID), v('g3', GUEST_ID)]).map(({ video, n, of }) => `${video.id} ${n}/${of}`)).toEqual(['g1 1/3', 'g2 2/3', 'g3 3/3'])
    expect(clipsInReelOrder([])).toEqual([])
  })
})
