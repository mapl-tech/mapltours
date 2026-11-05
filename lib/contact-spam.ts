/**
 * Spam on /api/contact (the contact page, the partner page and the transfers
 * "Ask for a price" form all post there).
 *
 * The campaign that began Oct 31 2026 came through Tor exits with a Gmail
 * address padded with dots (w.iz.imi.ja.g44.3@gmail.com; Gmail ignores dots,
 * so every variant lands in one real person's inbox) and typed no language at
 * all: a ten-digit number, or mixed-case strings like jiOuTbHLjwyCPAoQP. Each
 * submission made the site send that inbox a confirmation, which is what such
 * bots are for: a stranger's inbox flooded with mail from us, at the cost of
 * the domain that also sends booking confirmations.
 *
 * Only what the visitor typed is judged. Names are never judged (a real name
 * from anywhere can look odd), and neither are the forms' own labels, which
 * are stripped first. Text in another script or with accents always counts as
 * words. Both rules need text with no real words in it, so a real guest
 * writing a real sentence is never held, whatever their address looks like.
 *
 * From Nov 2 2026 the same bot typed only a number from a different ordinary
 * address each time (Hotmail, t-online, small business domains), which
 * neither rule can tell from a guest. Text with no real words is therefore
 * still delivered to the team, flagged, but never answered (noRealWords).
 * From Nov 3 the contact route holds such a post when it comes through a Tor
 * exit (lib/tor-exit), as all twelve of the bot's posts did.
 *
 * On Nov 4 it sent the partner form "Svqsezn LLC" with two random strings from
 * a padded Gmail through Tor, and was answered: the made-up name has a vowel
 * and one string had only two case changes, so the text read as words. Now
 * that string counts as random, from a Tor exit any one of the bot's marks
 * holds a post, and a post from Tor is never answered (the team still gets it).
 */

/** A Gmail address with 3 or more dots before the @ (or a +tag). */
export function paddedGmail(email: string): boolean {
  const [local = '', domain = ''] = email.toLowerCase().split(/@(?=[^@]*$)/)
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return false
  return (local.split('+')[0].match(/\./g) ?? []).length >= 3
}

/**
 * The inbox an address really reaches, for counting the auto-replies sent to
 * it: lowercase, no +tag, and for Gmail no dots and one domain.
 */
export function mailboxKey(email: string): string {
  const [local = '', domain = ''] = email.trim().toLowerCase().split(/@(?=[^@]*$)/)
  const base = local.split('+')[0]
  if (domain === 'gmail.com' || domain === 'googlemail.com') return `${base.replace(/\./g, '')}@gmail.com`
  return `${base}@${domain}`
}

const PARTNER_SUBJECT = /^Partner enquiry · [^·]*(?: · |$)/
const PRICE_SUBJECT = /^Unlisted hotel · /
// Matched anywhere, not by line, so text that lost its line breaks is read
// the same. PartnerView's own options: one added there and not here leaves its
// words in, which can only let spam through, never hold a guest.
const PARTNER_KINDS = 'Guided experience or tour|Tour company|Driver or transport|Restaurant or food spot|Attraction or heritage site|Something else|\\(not given\\)'
const PARTNER_TEXT = [/Business \/ operation: /g, /Parish or area: /g, new RegExp(`Type: (?:${PARTNER_KINDS})`, 'g'), /\(not given\)/g]
const PRICE_TEXT = [
  /A visitor could not find their hotel in the transfers picker\./g,
  /Hotel or address: /g,
  /Trip type: (?:Round-trip|One-way)/g,
  /Passengers: \d+/g,
  /Reply with a flat quote, and add the property to DESTINATIONS if we serve it\./g,
]

/** The subject and message with the partner and price forms' own wording taken out. */
export function typedText(subject: string, message: string): string {
  let s = subject
  let m = message
  if (PARTNER_SUBJECT.test(s)) {
    s = s.replace(PARTNER_SUBJECT, '')
    for (const re of PARTNER_TEXT) m = m.replace(re, ' ')
  } else if (PRICE_SUBJECT.test(s)) {
    s = s.replace(PRICE_SUBJECT, '')
    for (const re of PRICE_TEXT) m = m.replace(re, ' ')
  }
  return `${s}\n${m}`
}

/**
 * A random mixed-case string: letters only, 10 or more, at least two places
 * where a small letter is followed by a capital, and two capitals together
 * somewhere after the first letter. CamelCase (BeyondTheResortJamaica,
 * iPhoneXsMax) never has the capitals together, so it is not one. Two places,
 * not three, since Nov 4 2026: the bot's YFZVgpKyYSTQASYEIY has only two.
 */
function scrambled(token: string): boolean {
  if (!/^[A-Za-z]{10,}$/.test(token)) return false
  return (token.match(/[a-z](?=[A-Z])/g) ?? []).length >= 2 && /[A-Z]{2}/.test(token.slice(1))
}

// Built from strings: the project's TypeScript target predates the u flag
// in regex literals (lib/guest-name does the same).
const EDGE = new RegExp('^[^\\p{L}\\p{N}]+|[^\\p{L}\\p{N}]+$', 'gu')
const LETTER = new RegExp('\\p{L}', 'gu')

function isWord(token: string): boolean {
  if (/[^\x00-\x7F]/.test(token)) return true
  return /[aeiouy]/i.test(token) && !scrambled(token)
}

// The same character rule as the connector's pickupText (lib/agent/booking-link).
const NOT_PLACE_NAME = new RegExp("[^\\p{L}\\p{M}\\p{N} .,'&()/#-]", 'gu')
// A link, an address, a bare domain (Gmail links "example.com" on its own) or
// a phone number: what makes a message worth relaying to a stranger.
const RELAY_PAYLOAD = /https?:|www\.|@|:\/\/|[a-z0-9-]\.[a-z]{2,}|\d(?:[\s().-]*\d){6,}/i

/**
 * The hotel a price request named, fit to say back to the guest, or null.
 * The auto-reply goes to an address nobody has verified, so a hotel carrying
 * a link, a domain or a phone number is left out of it (the team still gets
 * it as typed).
 */
export function replyHotel(raw: string): string | null {
  const s = raw.normalize('NFC').replace(NOT_PLACE_NAME, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim()
  if (!s || RELAY_PAYLOAD.test(raw) || RELAY_PAYLOAD.test(s)) return null
  return s
}

/**
 * The typed text's tokens that carry letters, and whether it has no real
 * words in it: none, or fewer than half of those tokens.
 */
function readWords(subject: string, message: string): { lettered: string[]; noWords: boolean } {
  // A link or an address counts as a word: a guest may send only a map link
  // to their villa.
  const link = (t: string) => /:\/\/|^www\.|@/i.test(t)
  const tokens = typedText(subject, message)
    .split(/\s+/)
    .map((t) => t.replace(EDGE, ''))
    .filter(Boolean)
  const lettered = tokens.filter((t) => link(t) || (t.match(LETTER) ?? []).length >= 2)
  const words = lettered.filter((t) => link(t) || isWord(t)).length
  return { lettered, noWords: words === 0 || words * 2 < lettered.length }
}

/**
 * The typed text has no real words in it (a bare number, symbols, random
 * strings). The team still gets such a post, flagged, and the visitor gets no
 * auto-reply: the address is unverified and the post says nothing a person
 * would need confirmed.
 */
export function noRealWords(subject: string, message: string): boolean {
  return readWords(subject, message).noWords
}

/**
 * Why a submission is spam, or null. Held when the typed text has no real
 * words in it (none, or fewer than half its tokens with letters) and either
 * the address is a padded Gmail or the text carries two random strings. From
 * a Tor exit (`tor`, lib/tor-exit), any one of the bot's marks is enough: no
 * real words, a padded Gmail, or a single random string.
 */
export function contactSpam(input: { email: string; subject: string; message: string; tor?: boolean }): string | null {
  const { lettered, noWords } = readWords(input.subject, input.message)
  const padded = paddedGmail(input.email)
  const random = lettered.filter(scrambled).length
  if (noWords && padded) return 'padded Gmail, no words'
  if (noWords && random >= 2) return 'random strings, no words'
  if (input.tor) {
    if (noWords) return 'no words, Tor exit'
    if (padded) return 'padded Gmail, Tor exit'
    if (random >= 1) return 'random string, Tor exit'
  }
  return null
}
