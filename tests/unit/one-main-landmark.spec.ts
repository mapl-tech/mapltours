import { describe, test, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * One "main" region per page (Nov 13 2026).
 *
 * `LayoutShell` wraps every route in `<main id="main-content">`, which is also
 * where the skip link lands. Seven screens (the profile, saved tours, /book,
 * the driver portal and its sign-in, the 404 and the error page) each put a
 * second `<main>` inside it, so a screen reader's "jump to main" offered two
 * regions, one inside the other. A page's own wrapper is a `<div>`.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const DIRS = ['app', 'components']
const THE_ONE = 'components/LayoutShell.tsx'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name)
    if (name.isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(name.name)) out.push(p)
  }
  return out
}

/** Source with block comments and whole-line // comments removed. */
function codeOf(file: string): string {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
}

const mains = (src: string) => (src.match(/<main(?=[\s>])/g) ?? []).length + (src.match(/role=["']main["']/g) ?? []).length

describe('one main region per page', () => {
  test('the layout holds the only one', () => {
    const found: Record<string, number> = {}
    for (const dir of DIRS) {
      for (const file of walk(path.join(ROOT, dir))) {
        const n = mains(codeOf(file))
        if (n > 0) found[path.relative(ROOT, file).split(path.sep).join('/')] = n
      }
    }
    expect(found).toEqual({ [THE_ONE]: 1 })
  })

  test('the skip link still lands on it', () => {
    const shell = codeOf(path.join(ROOT, THE_ONE))
    expect(shell).toContain('href="#main-content"')
    expect(shell).toMatch(/<main id="main-content">/)
  })
})
