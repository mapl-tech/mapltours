import { formatGuestLabel } from './social-handle'

/** MAPL-owned creator handles. Content posted under any of these renders the
 *  brand mark instead of a coloured initial or gradient disk, and displays the
 *  public Instagram handle. Centralised so new MAPL-owned handles can be
 *  added in one place. */
export const MAPL_CREATOR_HANDLES = new Set([
  'mapl',
  'mapltours',
  'mapl.tours',
  'mapltech',
])

export function isMaplCreator(handle: string | null | undefined): boolean {
  if (!handle) return false
  return MAPL_CREATOR_HANDLES.has(handle.toLowerCase().trim())
}

/** MAPL-owned content shows the real Instagram handle, not the internal
 *  catalog slug, so the name on a reel matches the account a guest finds
 *  when they search us on Instagram or TikTok. */
export const MAPL_SOCIAL_HANDLE = 'mapltoursjamaica'

export function displayHandle(handle: string): string {
  return isMaplCreator(handle) ? MAPL_SOCIAL_HANDLE : handle
}

/** MAPL's own accounts. A clip one of them posts is MAPL Tours Jamaica's:
 *  credited to the brand, with its mark, never shown as a guest's. Matched
 *  by account id, which nobody can choose, never by a name or social handle,
 *  which any guest can type (handles have no uniqueness rule). The id is not
 *  a secret: it is in every clip's public storage path. */
export const MAPL_ACCOUNT_IDS: ReadonlySet<string> = new Set([
  '69b8def3-e4f0-4e94-bff2-6130f30ffe2a', // MAPL Tours Jamaica's own account
])

export const MAPL_BRAND_NAME = 'MAPL Tours Jamaica'

export function isMaplAccount(userId: string | null | undefined): boolean {
  return !!userId && MAPL_ACCOUNT_IDS.has(userId)
}

/** Letters drawn like the Latin ones they stand for: Cyrillic, Greek, Latin
 *  small capitals, and l's lookalikes (a capital I, 1, |, ł). Applied after
 *  NFKD has split off accents, which are then dropped. */
const LOOKALIKES: Record<string, string> = {
  'I': 'l', '1': 'l', '|': 'l', 'ł': 'l', 'Ł': 'l',
  'а': 'a', 'в': 'b', 'е': 'e', 'ё': 'e', 'і': 'i', 'ј': 'j', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o',
  'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'ѕ': 's', 'ӏ': 'l',
  'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'μ': 'm', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x',
  'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ɢ': 'g', 'ʜ': 'h', 'ɪ': 'i', 'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l',
  'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p', 'ʀ': 'r', 'ꜱ': 's', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z',
}

/** A guest's handle or name that would pass for ours on a clip card, where
 *  nothing else says whose a clip is: "@mapltoursjamaica", "MAPL",
 *  "@the.mapl", "@mapl.tours", "MapI" (a capital i), "МАРL" (Cyrillic),
 *  "rnapl" (rn for m), "@maple.tours". Words that only start like ours stay:
 *  "maple", "@map.lover", "@maple.tourist", "@mapletechie". */
function passesForMapl(label: string): boolean {
  const folded = Array.from(label.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''))
    .map((c) => LOOKALIKES[c] ?? c).join('').toLowerCase()
    .replace(/./g, (c) => LOOKALIKES[c] ?? c)
    .replace(/rn/g, 'm')
  const words = folded.split(/[^a-z0-9]+/).filter(Boolean)
  const joined = words.join('')
  return words.some((w) => /^mapl(?![aeiouy])/.test(w))
    || /mapl(tours?|tech|jamaica)/.test(joined)
    || /maple[^a-z0-9]?(tours?|tech)(?=$|[^a-z0-9]|jamaica|ja$|jm$)/.test(folded.replace(/[^a-z0-9]+/g, '.'))
}

/** Who a clip is from, as every surface shows it: MAPL Tours Jamaica for our
 *  own, otherwise the guest's handle or first name (lib/social-handle). A
 *  guest's handle or name that would pass for ours gives way to their first
 *  name, or the fallback: guests type both, and can change them after a
 *  clip is approved. */
export function clipCredit(
  video: { user_id: string; uploader_handle?: string | null; uploader_name?: string | null },
  fallback = 'A guest',
): { by: string; mapl: boolean } {
  if (isMaplAccount(video.user_id)) return { by: MAPL_BRAND_NAME, mapl: true }
  let by = formatGuestLabel(video.uploader_handle, video.uploader_name, fallback)
  if (passesForMapl(by)) by = formatGuestLabel(null, video.uploader_name, fallback)
  if (passesForMapl(by)) by = fallback
  return { by, mapl: false }
}

/** A tour's clips in the order the reel plays them: MAPL Tours Jamaica's own
 *  first, then guests', each kind in the order given (newest first), and
 *  each numbered on its own ("Clip 1 of 2", then "Guest clip 1 of 3"): one
 *  count across both read "Guest clip 2 of 3" with two guest clips. */
export function clipsInReelOrder<T extends { user_id: string }>(list: readonly T[]): { video: T; n: number; of: number }[] {
  const number = (kind: T[]) => kind.map((video, i) => ({ video, n: i + 1, of: kind.length }))
  return [
    ...number(list.filter((v) => isMaplAccount(v.user_id))),
    ...number(list.filter((v) => !isMaplAccount(v.user_id))),
  ]
}
