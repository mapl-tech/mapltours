/**
 * @mentions in tour comments: the pure rules every surface shares.
 *
 * A tag is stored in the comment text as `<@uuid>` (the tagged user's id,
 * lower case) and rendered as "@Name" from public.users. Migration 039 keeps
 * only real tags in stored text (an existing user, never the author, at most
 * MAX_MENTIONS_PER_COMMENT people) and records one comment_mentions row for
 * each, so the text and the notifications can never disagree.
 *
 * The composer works on plain text: the guest types "@", picks a person, and
 * the box shows "@Ana". encodeMentions turns each picked "@Ana" back into its
 * token at submit. A name typed by hand without picking is just text, the
 * same as every app people already know.
 *
 * Pure functions only: no network, no React.
 */

export const MAX_MENTIONS_PER_COMMENT = 5

const UUID_SRC = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const UUID_RE = new RegExp(`^${UUID_SRC}$`)

/** A fresh global regex each call, so no caller can trip over lastIndex. */
const tokenRe = () => new RegExp(`<@(${UUID_SRC})>`, 'g')

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function mentionToken(userId: string): string {
  return `<@${userId.toLowerCase()}>`
}

/** Distinct tagged user ids, lower case, in the order they first appear. */
export function extractMentionIds(text: string | null | undefined): string[] {
  if (!text) return []
  const seen: string[] = []
  const re = tokenRe()
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const id = m[1].toLowerCase()
    if (!seen.includes(id)) seen.push(id)
  }
  return seen
}

export type MentionSegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; id: string }

/** The text split into plain runs and tags, for rendering. */
export function splitMentions(text: string | null | undefined): MentionSegment[] {
  if (!text) return []
  const out: MentionSegment[] = []
  let last = 0
  const re = tokenRe()
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const at = m.index
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) })
    out.push({ kind: 'mention', id: m[1].toLowerCase() })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

/** How a tagged person is shown: the same byline rule as comment authors. */
export interface MentionPerson {
  /** Shown after the @: a social handle, else a first name. */
  label: string
  isHandle: boolean
}

export const UNKNOWN_MENTION = 'someone'

export function mentionText(person: MentionPerson | null | undefined): string {
  return `@${person?.label || UNKNOWN_MENTION}`
}

/** The comment as plain text with every tag spelled "@Name" (emails, snippets, screen readers). */
export function plainMentionText(text: string | null | undefined, people: ReadonlyMap<string, MentionPerson>): string {
  return splitMentions(text)
    .map((s) => (s.kind === 'text' ? s.text : mentionText(people.get(s.id))))
    .join('')
}

/* ── The composer ─────────────────────────────────────────────────────── */

/** Characters a mention query may hold: letters, marks, digits, . _ ' - */
const QUERY_CHAR = new RegExp("[\\p{L}\\p{M}\\p{N}._'-]", 'u')
/** What may stand right before the @ for it to open a tag. */
const OPENER_BEFORE = new RegExp('[\\s([{"\'“‘]', 'u')
export const MAX_QUERY_LENGTH = 30

export interface ActiveQuery {
  /** Index of the @. */
  start: number
  /** Index just past the query (the caret). */
  end: number
  /** What has been typed after the @, without it. */
  query: string
}

/**
 * The tag being typed at the caret, or null. "@" opens a tag at the start of
 * the text or after a space or an opening bracket or quote (never inside an
 * email address such as ana@example.com), and the query runs up to the caret
 * with no spaces.
 */
export function findActiveQuery(text: string, caret: number): ActiveQuery | null {
  if (caret < 1 || caret > text.length) return null
  let i = caret - 1
  while (i >= 0 && text[i] !== '@') {
    if (!QUERY_CHAR.test(text[i])) return null
    i -= 1
  }
  if (i < 0) return null
  if (caret - i - 1 > MAX_QUERY_LENGTH) return null
  if (i > 0 && !OPENER_BEFORE.test(text[i - 1])) return null
  return { start: i, end: caret, query: text.slice(i + 1, caret) }
}

export interface DraftMention {
  id: string
  /** Exactly what follows the @ in the box, e.g. "Ana" or "Ana B." */
  label: string
}

/** Replace the typed "@query" with "@label " and say where the caret goes. */
export function insertMention(text: string, active: ActiveQuery, label: string): { text: string; caret: number } {
  const after = text.slice(active.end)
  const needsSpace = !after.startsWith(' ')
  const inserted = `@${label}${needsSpace ? ' ' : ''}`
  return {
    text: text.slice(0, active.start) + inserted + after,
    caret: active.start + inserted.length + (needsSpace ? 0 : 1),
  }
}

/** Something a tag's label may not be followed by, so "@Ana" never matches inside "@Anabel". */
const LABEL_CONTINUES = new RegExp('[\\p{L}\\p{M}\\p{N}_]', 'u')

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Every place "@label" stands as a whole tag in the text. */
function labelPositions(text: string, label: string): number[] {
  const out: number[] = []
  const re = new RegExp(`@${escapeRegExp(label)}`, 'gu')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const at = m.index
    const next = text[at + m[0].length]
    const prev = at > 0 ? text[at - 1] : ''
    if (next !== undefined && LABEL_CONTINUES.test(next)) continue
    if (prev && !OPENER_BEFORE.test(prev)) continue
    out.push(at)
  }
  return out
}

/** Picked mentions still present in the text, each person once. */
export function pruneDraftMentions(text: string, mentions: readonly DraftMention[]): DraftMention[] {
  const seen = new Set<string>()
  return mentions.filter((m) => {
    if (seen.has(m.id)) return false
    if (!labelPositions(text, m.label).length) return false
    seen.add(m.id)
    return true
  })
}

/**
 * The text to store: every picked "@label" that is still in the box becomes
 * its person's token. Longer labels claim their places first, so "@Ana B."
 * is never read as "@Ana" followed by " B.". A label that appears twice for
 * the same person tags them once and renders twice. At most
 * MAX_MENTIONS_PER_COMMENT people; the rest stay plain text.
 */
export function encodeMentions(text: string, mentions: readonly DraftMention[]): { text: string; ids: string[] } {
  const live = pruneDraftMentions(text, mentions).filter((m) => isUuid(m.id))
  const allowed = new Set(live.slice(0, MAX_MENTIONS_PER_COMMENT).map((m) => m.id.toLowerCase()))
  const spans: { start: number; end: number; id: string }[] = []
  const taken = (s: number, e: number) => spans.some((x) => s < x.end && e > x.start)
  const byLength = [...live].sort((a, b) => b.label.length - a.label.length)
  for (const m of byLength) {
    const id = m.id.toLowerCase()
    if (!allowed.has(id)) continue
    for (const at of labelPositions(text, m.label)) {
      const end = at + 1 + m.label.length
      if (!taken(at, end)) spans.push({ start: at, end, id })
    }
  }
  spans.sort((a, b) => a.start - b.start)
  let out = ''
  let last = 0
  const ids: string[] = []
  for (const s of spans) {
    out += text.slice(last, s.start) + mentionToken(s.id)
    last = s.end
    if (!ids.includes(s.id)) ids.push(s.id)
  }
  out += text.slice(last)
  return { text: out, ids }
}

/** A person as the search returns them. */
export interface MentionCandidate {
  id: string
  /** The byline label, without @. */
  label: string
  isHandle: boolean
  /** "Ana B." when that tells two people apart, else null. */
  detail: string | null
  avatarUrl: string | null
}

/**
 * The label to put in the box for this person: their byline label, unless
 * another person in the same draft already uses it, then their short name,
 * then a number. Two people never share a label inside one comment, so
 * encodeMentions cannot hand a tag to the wrong one.
 */
export function draftLabelFor(person: Pick<MentionCandidate, 'id' | 'label' | 'detail'>, draft: readonly DraftMention[]): string {
  const usedByOthers = (l: string) => draft.some((m) => m.id !== person.id && m.label.toLowerCase() === l.toLowerCase())
  const mine = draft.find((m) => m.id === person.id)
  if (mine) return mine.label
  if (!usedByOthers(person.label)) return person.label
  if (person.detail && !usedByOthers(person.detail)) return person.detail
  for (let n = 2; n < 100; n += 1) {
    const l = `${person.label}${n}`
    if (!usedByOthers(l)) return l
  }
  return `${person.label}${person.id.slice(0, 4)}`
}

/** "Ana B." from a full name, or null when there is no second word. */
export function shortName(name: string | null | undefined): string | null {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return null
  const last = parts[parts.length - 1]
  const initial = Array.from(last)[0]
  return initial ? `${parts[0]} ${initial.toUpperCase()}.` : null
}

/**
 * What the search may be asked: up to 30 letters, digits, spaces and . _ ' -
 * after any leading @. Everything else is dropped rather than escaped, so the
 * value can never change the shape of a query.
 */
export function sanitizeMentionQuery(input: unknown): string {
  if (typeof input !== 'string') return ''
  const cleaned = input
    .normalize('NFC')
    .replace(/^@+/, '')
    .replace(new RegExp("[^\\p{L}\\p{M}\\p{N} ._'-]", 'gu'), '')
    .replace(/\s+/g, ' ')
    .trim()
  return Array.from(cleaned).slice(0, MAX_QUERY_LENGTH).join('').trim()
}

/**
 * "just now", "5 min ago", "3 h ago", "2 days ago", then the date ("Nov 3",
 * with the year once it is not this year). For the profile's Mentions list.
 */
export function mentionAge(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return ''
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return d === 1 ? 'yesterday' : `${d} days ago`
  const date = new Date(at)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * A guest's words go out in a mention email from our own address, so a link
 * typed into a comment is never carried into the email (mail apps would make
 * it clickable). Web addresses, and bare domains on the endings spam uses,
 * become "(link)". "@ana.b" style handles are left alone: they follow an @.
 */
// A sentence's closing mark after an address stays in the sentence.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]*[^\s<>".,;:!?)\]}'”’]/gi
const BARE_DOMAIN_RE = new RegExp(
  '(^|[\\s(\\[{"\'“‘])' +
    '([a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:com|net|org|info|biz|io|co|xyz|top|site|online|shop|store|app|link|click|live|ru|cn|me|us|uk|ca|jm|ly|gl|to|tk|ml|ga|cf|gq|be|ws|cc|tv|vip|win|bet|loan)(?:\\/[^\\s]*[^\\s.,;:!?)\\]}"\'”’])?)' +
    '(?=$|[\\s.,;:!?)\\]}"\'”’])',
  'gi',
)
export function defuseLinks(text: string): string {
  return text.replace(URL_RE, '(link)').replace(BARE_DOMAIN_RE, (_m, before: string) => `${before}(link)`)
}
