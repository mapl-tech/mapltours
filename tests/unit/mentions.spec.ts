import { describe, test, expect } from 'vitest'
import {
  MAX_MENTIONS_PER_COMMENT,
  draftLabelFor,
  encodeMentions,
  extractMentionIds,
  findActiveQuery,
  insertMention,
  mentionText,
  mentionToken,
  plainMentionText,
  pruneDraftMentions,
  sanitizeMentionQuery,
  shortName,
  splitMentions,
  type MentionPerson,
} from '@/lib/mentions'

/**
 * The pure @mention rules: tokens, the composer's query detection and
 * insertion, encoding at submit, labels, and query sanitising. Synthetic ids.
 */

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const ids = Array.from({ length: 7 }, (_, i) => `${String(i + 4).repeat(8)}-${String(i + 4).repeat(4)}-4${String(i + 4).repeat(3)}-8${String(i + 4).repeat(3)}-${String(i + 4).repeat(12)}`)

describe('tokens', () => {
  test('a token is <@id> in lower case', () => {
    expect(mentionToken(A.toUpperCase())).toBe(`<@${A}>`)
  })

  test('extractMentionIds: distinct, lower case, first-seen order', () => {
    const t = `hi <@${B}> and <@${A.toUpperCase()}> and <@${B}> again`
    expect(extractMentionIds(t)).toEqual([B, A])
    expect(extractMentionIds('')).toEqual([])
    expect(extractMentionIds(null)).toEqual([])
    expect(extractMentionIds('<@not-a-uuid> <@>')).toEqual([])
  })

  test('splitMentions keeps every character of the text around tags', () => {
    const t = `<@${A}>, see this <@${B}>!`
    const segs = splitMentions(t)
    expect(segs).toEqual([
      { kind: 'mention', id: A },
      { kind: 'text', text: ', see this ' },
      { kind: 'mention', id: B },
      { kind: 'text', text: '!' },
    ])
    expect(splitMentions('no tags here')).toEqual([{ kind: 'text', text: 'no tags here' }])
  })

  test('plainMentionText spells each tag, unknown people as @someone', () => {
    const people = new Map<string, MentionPerson>([[A, { label: 'Ana', isHandle: false }], [B, { label: 'ben.j', isHandle: true }]])
    expect(plainMentionText(`<@${A}> and <@${B}> and <@${C}>`, people)).toBe('@Ana and @ben.j and @someone')
    expect(mentionText(null)).toBe('@someone')
  })

  test('a regex reused across calls never skips matches (fresh global regex)', () => {
    const t = `<@${A}>`
    expect(extractMentionIds(t)).toEqual([A])
    expect(extractMentionIds(t)).toEqual([A])
    expect(splitMentions(t)).toHaveLength(1)
    expect(splitMentions(t)).toHaveLength(1)
  })
})

describe('findActiveQuery', () => {
  test('opens at the start and after a space', () => {
    expect(findActiveQuery('@an', 3)).toEqual({ start: 0, end: 3, query: 'an' })
    expect(findActiveQuery('hi @an', 6)).toEqual({ start: 3, end: 6, query: 'an' })
    expect(findActiveQuery('hi @', 4)).toEqual({ start: 3, end: 4, query: '' })
  })

  test('opens after an opening bracket or quote', () => {
    expect(findActiveQuery('(@an', 4)?.query).toBe('an')
    expect(findActiveQuery('"@an', 4)?.query).toBe('an')
  })

  test('never inside an email address or a word', () => {
    expect(findActiveQuery('ana@example', 11)).toBeNull()
    expect(findActiveQuery('x@y', 3)).toBeNull()
  })

  test('a space ends the query', () => {
    expect(findActiveQuery('@ana b', 6)).toBeNull()
  })

  test('accented letters, digits and . _ \' - are part of the query', () => {
    expect(findActiveQuery('@zoë', 4)?.query).toBe('zoë')
    expect(findActiveQuery("@o'neil-2.x_y", 13)?.query).toBe("o'neil-2.x_y")
  })

  test('reads up to the caret only', () => {
    expect(findActiveQuery('@anabel', 3)).toEqual({ start: 0, end: 3, query: 'an' })
  })

  test('caret at 0 or past the end, or a query over 30 characters', () => {
    expect(findActiveQuery('@a', 0)).toBeNull()
    expect(findActiveQuery('@a', 5)).toBeNull()
    expect(findActiveQuery(`@${'a'.repeat(31)}`, 32)).toBeNull()
  })
})

describe('insertMention', () => {
  test('replaces the typed query with @label and a space, caret after it', () => {
    const text = 'hi @an'
    const r = insertMention(text, { start: 3, end: 6, query: 'an' }, 'Ana')
    expect(r.text).toBe('hi @Ana ')
    expect(r.caret).toBe(8)
  })

  test('keeps the text after the caret and does not double a space', () => {
    const text = 'hi @an see you'
    const r = insertMention(text, { start: 3, end: 6, query: 'an' }, 'Ana')
    expect(r.text).toBe('hi @Ana see you')
    expect(r.caret).toBe(8)
  })
})

describe('encodeMentions', () => {
  test('picked names become tokens; typed names stay text', () => {
    const r = encodeMentions('@Ana meet @Ben and @Cara', [{ id: A, label: 'Ana' }, { id: B, label: 'Ben' }])
    expect(r.text).toBe(`<@${A}> meet <@${B}> and @Cara`)
    expect(r.ids).toEqual([A, B])
  })

  test('"@Ana" is never read inside "@Anabel"', () => {
    const r = encodeMentions('@Anabel and @Ana', [{ id: A, label: 'Ana' }])
    expect(r.text).toBe(`@Anabel and <@${A}>`)
  })

  test('longer labels claim first: "@Ana B." is not "@Ana" + " B."', () => {
    const r = encodeMentions('@Ana B. and @Ana', [{ id: A, label: 'Ana' }, { id: B, label: 'Ana B.' }])
    expect(r.text).toBe(`<@${B}> and <@${A}>`)
    expect(r.ids.sort()).toEqual([A, B].sort())
  })

  test('a name deleted from the box is not tagged', () => {
    const r = encodeMentions('hello', [{ id: A, label: 'Ana' }])
    expect(r).toEqual({ text: 'hello', ids: [] })
  })

  test('the same person twice: both places tagged, one id', () => {
    const r = encodeMentions('@Ana, @Ana!', [{ id: A, label: 'Ana' }])
    expect(r.text).toBe(`<@${A}>, <@${A}>!`)
    expect(r.ids).toEqual([A])
  })

  test(`at most ${MAX_MENTIONS_PER_COMMENT} people; the rest stay text`, () => {
    const draft = ids.map((id, i) => ({ id, label: `P${i}` }))
    const text = draft.map((d) => `@${d.label}`).join(' ')
    const r = encodeMentions(text, draft)
    expect(r.ids).toHaveLength(MAX_MENTIONS_PER_COMMENT)
    expect(r.text).toContain('@P5')
    expect(r.text).toContain('@P6')
  })

  test('an @ inside a word is not a tag', () => {
    const r = encodeMentions('mail@Ana', [{ id: A, label: 'Ana' }])
    expect(r.text).toBe('mail@Ana')
  })

  test('labels with regex characters are matched literally', () => {
    const r = encodeMentions('@a.b and @aXb', [{ id: A, label: 'a.b' }])
    expect(r.text).toBe(`<@${A}> and @aXb`)
  })

  test('ids that are not uuids are ignored', () => {
    expect(encodeMentions('@Ana', [{ id: 'nope', label: 'Ana' }]).text).toBe('@Ana')
  })
})

describe('labels', () => {
  test('pruneDraftMentions keeps picks still in the text, each person once', () => {
    const d = [{ id: A, label: 'Ana' }, { id: B, label: 'Ben' }, { id: A, label: 'Ana' }]
    expect(pruneDraftMentions('@Ana only', d)).toEqual([{ id: A, label: 'Ana' }])
  })

  test('draftLabelFor gives two people with one name different labels', () => {
    const draft = [{ id: A, label: 'Ana' }]
    expect(draftLabelFor({ id: B, label: 'Ana', detail: 'Ana B.' }, draft)).toBe('Ana B.')
    expect(draftLabelFor({ id: B, label: 'Ana', detail: null }, draft)).toBe('Ana2')
    expect(draftLabelFor({ id: A, label: 'Ana', detail: 'Ana S.' }, draft)).toBe('Ana')
    expect(draftLabelFor({ id: C, label: 'Ana', detail: 'Ana B.' }, [...draft, { id: B, label: 'Ana B.' }])).toBe('Ana2')
  })

  test('shortName', () => {
    expect(shortName('Ana Brown')).toBe('Ana B.')
    expect(shortName('ana maría lópez')).toBe('ana L.')
    expect(shortName('Ana')).toBeNull()
    expect(shortName(null)).toBeNull()
  })
})

describe('sanitizeMentionQuery', () => {
  test('keeps letters, digits, spaces and . _ \' -; drops the rest', () => {
    expect(sanitizeMentionQuery('@@ana')).toBe('ana')
    expect(sanitizeMentionQuery("o'neil-x_y.z")).toBe("o'neil-x_y.z")
    expect(sanitizeMentionQuery('ana,(id.eq.1)')).toBe('anaid.eq.1')
    expect(sanitizeMentionQuery('a%b_c\\d*')).toBe('ab_cd')
    expect(sanitizeMentionQuery('  zoë   smith ')).toBe('zoë smith')
  })

  test('caps at 30 characters and refuses non-strings', () => {
    expect(sanitizeMentionQuery('x'.repeat(50))).toHaveLength(30)
    expect(sanitizeMentionQuery(42)).toBe('')
    expect(sanitizeMentionQuery(null)).toBe('')
  })
})
