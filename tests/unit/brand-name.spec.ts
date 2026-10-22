import { describe, test, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The brand is "MAPL Tours Jamaica", in full, wherever guests, drivers or the
 * team read it. Never "MAPL Tours" alone (owner rule, Oct 4 2026, restated
 * Oct 22 2026 when about 100 stragglers were swept).
 *
 * This scans the source that ships (app, components, emails, lib) for a bare
 * "MAPL Tours", ignoring comments, and compares each file with a short list
 * of documented exceptions. It fails both ways: a new bare mention fails, and
 * so does an exception that no longer exists, so the list cannot go stale.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const DIRS = ['app', 'components', 'emails', 'lib']

/**
 * What is allowed to stay, and why. Each entry is the number of bare mentions
 * the file is expected to hold, not a pattern, so a second one still fails.
 */
const EXCEPTIONS: Record<string, { count: number; why: string }> = {
  // The logo lockup is stacked over two elements: "MAPL Tours" with "Jamaica" in the next one.
  'components/ContactView.tsx': { count: 1, why: 'stacked logo lockup, "Jamaica" is the next element' },
  'components/GiftCardsView.tsx': { count: 1, why: 'stacked logo lockup, "Jamaica" is the next element' },
  'app/login/page.tsx': { count: 1, why: '"MAPL Tours · Jamaica" eyebrow, the brand is not alone' },
  // The blog's own name. Renaming it changes page titles and structured data: owner's call.
  'components/BlogIndex.tsx': { count: 1, why: 'the blog is named "The MAPL Tours Journal" (decision pending)' },
  'app/blog/page.tsx': { count: 4, why: 'the blog is named "The MAPL Tours Journal" (decision pending)' },
  'app/blog/[slug]/page.tsx': { count: 3, why: 'the blog is named "The MAPL Tours Journal" (decision pending)' },
  // The sender display name mirrors the EMAIL_FROM env var on Netlify; both change together.
  'lib/email/send.ts': { count: 1, why: 'From-name fallback mirrors EMAIL_FROM (decision pending)' },
  'app/api/contact/route.ts': { count: 1, why: 'contact From-name mirrors EMAIL_FROM (decision pending)' },
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name)
    if (name.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name.name)) out.push(p)
  }
  return out
}

/** Source with block comments (JS, CSS and JSX) and whole-line // comments removed, whitespace collapsed. */
function copyOf(file: string): string {
  const src = fs.readFileSync(file, 'utf8')
    .replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
  return src.replace(/\s+/g, ' ')
}

const BARE = /MAPL Tours(?! Jamaica)(?! Inc)/g

const found: Record<string, number> = {}
for (const dir of DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const n = (copyOf(file).match(BARE) ?? []).length
    if (n > 0) found[path.relative(ROOT, file)] = n
  }
}

describe('the brand name is written in full', () => {
  test('no bare "MAPL Tours" outside the documented exceptions', () => {
    const wrong = Object.entries(found)
      .filter(([f, n]) => EXCEPTIONS[f]?.count !== n)
      .map(([f, n]) => `${f}: ${n} bare "MAPL Tours" (allowed: ${EXCEPTIONS[f]?.count ?? 0}). Write "MAPL Tours Jamaica".`)
    expect(wrong).toEqual([])
  })

  test('every documented exception still exists', () => {
    const stale = Object.keys(EXCEPTIONS)
      .filter((f) => !found[f])
      .map((f) => `${f}: no bare mention left, remove it from EXCEPTIONS`)
    expect(stale).toEqual([])
  })

  test('the scan really reads the source it claims to', () => {
    // A scanner that finds nothing anywhere would pass the tests above for the wrong reason.
    const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)))
    expect(files.length).toBeGreaterThan(200)
    const withBrand = files.filter((f) => copyOf(f).includes('MAPL Tours Jamaica'))
    expect(withBrand.length).toBeGreaterThan(30)
  })
})
