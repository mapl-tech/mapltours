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
