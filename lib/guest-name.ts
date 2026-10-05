// Built with RegExp: the project's ES5 target refuses a /u literal, and
// Unicode letters (Zoë, José, Siân) need it.
const FIRST_NAME = new RegExp("^\\p{L}[\\p{L}\\p{M}'’-]{0,39}$", 'u')

/**
 * A guest's name from their account, for an email. user_metadata is theirs
 * to write, and an address is not confirmed at sign-up, so an account can be
 * opened in a stranger's name: the full name (shown only to us) is text, one
 * line, at most 80 characters; the first name said back to the guest
 * ("Thanks, Ada.") is used only when it is a name, letters with an apostrophe
 * or a hyphen, never a link, an address or a number.
 */
export function guestNames(meta: unknown): { fullName: string | null; firstName: string | null } {
  const m = (meta && typeof meta === 'object' ? meta : {}) as Record<string, unknown>
  const raw = typeof m.full_name === 'string' ? m.full_name : typeof m.name === 'string' ? m.name : ''
  const fullName = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || null
  const first = fullName ? fullName.split(' ')[0] : ''
  const firstName = FIRST_NAME.test(first) ? first : null
  return { fullName, firstName }
}
